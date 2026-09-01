import { error } from '@sveltejs/kit'
import { Prisma, type ProposalDomain, type Role } from '@prisma/client'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { canAny, CAPABILITIES, type Capability } from '$lib/server/rbac'
import { notifyMany } from './notifications'
import type { AuditContext } from './types'

/**
 * Propose → confirm for pay writes that must not be unilateral (#224 Part 2, #243).
 *
 * Two situations funnel through one table, and they are NOT the same risk:
 *
 *   - **Self-action** — the initiator is the target (a CEO changing their own pay). The risk is
 *     self-dealing, so the confirmer must hold `APPROVE_FINANCE` (CEO / SUPER_ADMIN). An HR_ADMIN
 *     signing off the CEO's own raise would inverts the reporting line, which is the thing #224
 *     set out to prevent.
 *   - **On behalf of someone else** — a MANAGER proposing for one of their reports (#243). The
 *     risk is unilateral authority, not self-dealing, so `ADMINISTER_HR_ORGWIDE` (HR_ADMIN / CEO /
 *     SUPER_ADMIN) is enough — which is what #243 decided.
 *
 * The distinction is derived from initiator vs target, never stored, so a stale row cannot claim a
 * weaker confirmer than its own shape implies.
 *
 * Generalizes `StatutoryRateProposal` (#220) rather than inventing a second framework: same
 * status-guarded atomic claim, same "re-validate at apply time" trust boundary. The difference is
 * that #220 models two parties and this models three.
 */

/** Which capability a confirmer must hold, given whether the initiator is also the target. */
export function confirmerCapabilityFor(isSelfAction: boolean): Capability {
	return isSelfAction ? 'APPROVE_FINANCE' : 'ADMINISTER_HR_ORGWIDE'
}

/**
 * What each domain's notifications call the thing (#265). All three messages below said "pay
 * change" regardless of domain, which has been wrong since #222 for a PROMOTION carrying only a job
 * title or a reporting line — and #263 makes that shape reachable from the v1 PATCH as well, so a
 * confirmer is told to approve a raise that is actually a re-org.
 *
 * `Record<ProposalDomain, string>` rather than a lookup with a fallback: a third domain must fail
 * the typecheck, not quietly inherit the wrong noun. Phrased to read after both "A …" and
 * "Your proposed …".
 */
const DOMAIN_NOUN: Record<ProposalDomain, string> = {
	COMPENSATION: 'pay change',
	PROMOTION: 'promotion'
}

/**
 * The three rules that decide who may act on a pending proposal. Kept together, and applied to
 * confirm AND reject alike, because each has a plausible-looking wrong version and any one of them
 * missing collapses the two-person rule.
 *
 * The capability check is deliberately capability-keyed, never a `requireMinRole` floor:
 * `ROLE_HIERARCHY` ranks MANAGER level with HR_ADMIN, so a rank floor would let a manager decide
 * the very proposals that exist because managers must not act alone — the bug shape behind #228
 * and #243. MANAGER holds neither capability, so it is excluded by construction.
 */
async function assertMayDecide(
	pending: { initiatorId: string; targetEmployeeId: string },
	ctx: AuditContext
): Promise<void> {
	const target = await db.employee.findUnique({
		where: { id: pending.targetEmployeeId },
		select: { userId: true }
	})

	// 1. Not the person who filed it — the entire point of the table.
	if (pending.initiatorId === ctx.actorId) {
		error(403, 'You cannot confirm a change you proposed yourself.')
	}

	// 2. Not the person the change is ABOUT. `isSelfAction` below relates the target to the
	// INITIATOR only, so without this a proposal someone else filed for a target who happens to
	// hold a confirming capability would let that target sign off their own raise — #224's premise
	// defeated through #243's door, and a laundering route for a change they could not write
	// directly (file it through a manager, then confirm it yourself).
	if (target?.userId === ctx.actorId) {
		error(403, 'You cannot confirm a change to your own pay.')
	}

	// 3. Holds the capability the proposal's shape demands.
	const isSelfAction = target?.userId === pending.initiatorId
	if (!canAny(ctx.actorRoles, confirmerCapabilityFor(isSelfAction))) {
		error(403, 'You are not authorized to confirm this proposal.')
	}
}

/**
 * Load a PENDING proposal and assert this actor may act on it. Shared by confirm, reject and the
 * audited amount reveal so all three answer "may you act on this row" with one implementation — a
 * reveal on a looser rule would hand the figure to someone who cannot decide it.
 */
export async function assertMayConfirmProposal(
	organizationId: string,
	proposalId: string,
	ctx: AuditContext
) {
	const pending = await requirePending(organizationId, proposalId)
	await assertMayDecide(pending, ctx)
	return pending
}

/** User ids in the org who could confirm a proposal of this shape, excluding the initiator. */
async function eligibleConfirmerIds(
	organizationId: string,
	initiatorId: string,
	isSelfAction: boolean
): Promise<string[]> {
	const roles = CAPABILITIES[confirmerCapabilityFor(isSelfAction)]
	const users = await db.user.findMany({
		where: {
			organizationId,
			isActive: true,
			// The same `roles` set `assertMayDecide` reads (#133). Matching a single primary role
			// would miss a [MANAGER, HR_ADMIN] user — who CAN confirm — and so could 409 a
			// proposal as unconfirmable when a qualified confirmer exists.
			roles: { hasSome: [...roles] },
			id: { not: initiatorId }
		},
		select: { id: true }
	})
	return users.map((u) => u.id)
}

/**
 * File a PENDING proposal. The payload is the writer's own input object, stored verbatim and
 * re-validated when it is applied.
 *
 * Refuses up front when nobody could ever confirm it (e.g. the initiator is the org's only
 * `APPROVE_FINANCE` holder). Writing an unconfirmable row instead would look like success to the
 * initiator and strand the change forever.
 */
export async function createProposal(
	organizationId: string,
	input: {
		targetEmployeeId: string
		targetUserId: string
		domain: ProposalDomain
		payload: unknown
	},
	ctx: AuditContext
) {
	const isSelfAction = input.targetUserId === ctx.actorId
	const confirmers = await eligibleConfirmerIds(organizationId, ctx.actorId, isSelfAction)
	if (confirmers.length === 0) {
		error(
			409,
			'This change needs a second authorized person to confirm it, and no one else in the organization can. Ask a Super Admin to make the change directly.'
		)
	}

	// One transaction: a failed audit write must not leave a filed proposal standing unrecorded.
	const proposal = await db.$transaction(async (tx) => {
		const created = await tx.actionProposal.create({
			data: {
				organizationId,
				initiatorId: ctx.actorId,
				targetEmployeeId: input.targetEmployeeId,
				domain: input.domain,
				payload: input.payload as Prisma.InputJsonValue
			}
		})

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'ActionProposal',
				entityId: created.id,
				// Field NAMES, never their values: the payload of a compensation proposal is the salary in
				// cleartext, and `/reports/audit-log` renders `newValue` to every ADMINISTER_SYSTEM holder
				// with no record of the read. Same shape `revealEmployeeSensitive` uses (#111/#242). The
				// values themselves stay on the proposal row, behind the audited reveal.
				newValue: {
					domain: input.domain,
					targetEmployeeId: input.targetEmployeeId,
					isSelfAction,
					fields: Object.keys((input.payload ?? {}) as Record<string, unknown>)
				}
			},
			tx
		)

		return created
	})

	await notifyMany(
		confirmers,
		`A ${DOMAIN_NOUN[input.domain]} is waiting for your confirmation.`,
		'/requests/proposals'
	)

	return proposal
}

/**
 * Claim a PENDING proposal and apply it.
 *
 * `apply` runs inside the same transaction as the claim, so if applying throws — including because
 * re-validation rejects a payload that has gone stale — the claim rolls back to PENDING rather than
 * burning the proposal.
 */
export async function confirmProposal(
	organizationId: string,
	proposalId: string,
	apply: (
		proposal: { targetEmployeeId: string; domain: ProposalDomain; payload: unknown },
		tx: Prisma.TransactionClient
	) => Promise<unknown>,
	ctx: AuditContext
) {
	const pending = await assertMayConfirmProposal(organizationId, proposalId, ctx)

	const applied = await db.$transaction(async (tx) => {
		// Status-guarded claim: exactly one confirmer can move PENDING → APPLIED, so two racing
		// confirmations cannot both apply the change (the #220 pattern).
		const claim = await tx.actionProposal.updateMany({
			where: { id: proposalId, organizationId, status: 'PENDING' },
			data: { status: 'APPLIED', decidedById: ctx.actorId, decidedAt: new Date() }
		})
		if (claim.count === 0) error(404, 'Pending proposal not found')

		await apply(
			{
				targetEmployeeId: pending.targetEmployeeId,
				domain: pending.domain,
				payload: pending.payload
			},
			tx
		)
		// The audit shares the claim's transaction: a failed audit write must not leave an applied
		// proposal standing unrecorded.
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'ActionProposal',
				entityId: proposalId,
				oldValue: { status: 'PENDING' },
				newValue: { status: 'APPLIED', decidedById: ctx.actorId }
			},
			tx
		)

		return tx.actionProposal.findUniqueOrThrow({ where: { id: proposalId } })
	})
	await notifyMany(
		[pending.initiatorId],
		`Your proposed ${DOMAIN_NOUN[pending.domain]} was confirmed and applied.`
	)

	return applied
}

/** Reject a PENDING proposal. A reason is required so the initiator knows what to fix. */
export async function rejectProposal(
	organizationId: string,
	proposalId: string,
	note: string,
	ctx: AuditContext
) {
	if (!note.trim()) error(400, 'A reason is required to reject a proposal.')

	const pending = await assertMayConfirmProposal(organizationId, proposalId, ctx)

	// One transaction: a failed audit write must not leave a rejection standing unrecorded.
	await db.$transaction(async (tx) => {
		const claim = await tx.actionProposal.updateMany({
			where: { id: proposalId, organizationId, status: 'PENDING' },
			data: {
				status: 'REJECTED',
				decidedById: ctx.actorId,
				decidedAt: new Date(),
				decisionNote: note
			}
		})
		if (claim.count === 0) error(404, 'Pending proposal not found')

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'ActionProposal',
				entityId: proposalId,
				oldValue: { status: 'PENDING' },
				// The reason is free text a confirmer typed about someone's pay, so it stays off the audit
				// log for the same reason the payload's values do (#111/#242) — `/reports/audit-log` renders
				// `newValue` to every ADMINISTER_SYSTEM holder with no record of the read. It is still on
				// `ActionProposal.decisionNote` and still reaches the initiator by notification.
				newValue: { status: 'REJECTED', decidedById: ctx.actorId }
			},
			tx
		)
	})
	// "rejected", matching the REJECTED status the row actually carries — there is no RETURNED
	// state here, and the old wording read as one to anyone comparing the audit log to the message.
	await notifyMany(
		[pending.initiatorId],
		`Your proposed ${DOMAIN_NOUN[pending.domain]} was rejected: ${note}`
	)

	return { id: proposalId }
}

/**
 * The PENDING proposals this actor can actually decide.
 *
 * Filtered here rather than in the route so the queue and `assertMayDecide` can never disagree —
 * a list that shows rows the guard refuses is a page of buttons that 403, and a list that shows
 * MORE than the guard allows is #228 with a nicer front end. The three rules are the same three,
 * in the same order, deliberately: not the initiator, not the target, and holding the capability
 * this row's SHAPE demands (re-derived from initiator vs target, never stored).
 *
 * `initiatorId` is excluded in SQL because it is the one rule the database can express; the
 * capability filter runs in JS because `isSelfAction` compares two columns. `/requests/approvals`
 * paginates a JS-filtered set the same way (#64).
 */
export async function listActionableProposals(
	organizationId: string,
	actor: { actorId: string; roles: Role[] }
) {
	const rows = await db.actionProposal.findMany({
		where: { organizationId, status: 'PENDING', initiatorId: { not: actor.actorId } },
		include: {
			target: {
				select: {
					id: true,
					userId: true,
					firstName: true,
					lastName: true,
					employeeNumber: true,
					jobTitle: true,
					positionId: true,
					reportsToId: true,
					rateType: true,
					employmentType: true
				}
			}
		},
		orderBy: { createdAt: 'desc' }
	})

	return rows.filter(
		(r) =>
			r.target.userId !== actor.actorId &&
			canAny(actor.roles, confirmerCapabilityFor(r.target.userId === r.initiatorId))
	)
}

async function requirePending(organizationId: string, proposalId: string) {
	const proposal = await db.actionProposal.findFirst({
		where: { id: proposalId, organizationId, status: 'PENDING' }
	})
	if (!proposal) error(404, 'Pending proposal not found')
	return proposal
}

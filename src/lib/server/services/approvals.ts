import { canAny, CAPABILITIES } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { listActionableProposals } from './action-proposals'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import type { ApprovalDecision, ApprovalStage, Role } from '@prisma/client'
import { applyApprovedRequest, type AppliedEffect } from './requests/apply'
import { evictTombstonedBytes } from './requests/documents'
import { buildApprovalChain } from './requests/routing'
import { notify } from './notifications'
import type { AuditContext } from './types'

// Which capability governs each maker-checker stage (#134). MAKE is branch HR/Manager,
// VERIFY the Verifier, APPROVE the Approver — enforced by capability, not exact role,
// so a promoted Manager makes and a [MANAGER, VERIFIER] user can also verify.
const STAGE_CAPABILITY: Record<ApprovalStage, keyof typeof CAPABILITIES> = {
	MAKE: 'MANAGE_HR',
	VERIFY: 'VERIFY_REQUESTS',
	APPROVE: 'APPROVE_SIGNOFF'
}

// Payroll runs are financial sign-offs, so their chain routes the final APPROVE stage
// to the finance approvers — CEO / Super Admin — not the generic APPROVER (#174). MAKE is
// the payroll preparer (auto-completed at compute, never decided here); VERIFY is shared.
const PAYROLL_STAGE_CAPABILITY: Record<ApprovalStage, keyof typeof CAPABILITIES> = {
	MAKE: 'MANAGE_PAYROLL',
	VERIFY: 'VERIFY_REQUESTS',
	APPROVE: 'APPROVE_FINANCE'
}

// Any maker-checker subject (request/timesheet/payroll run) stores append-only steps.
// This resolves the live attempt and the step currently awaiting a decision (#134), so
// timesheets and payroll reuse the same chain semantics as requests.
export interface ChainStep {
	attempt: number
	stageIndex: number
	stage: ApprovalStage
	decision: ApprovalDecision | null
}
export function liveChain<T extends ChainStep>(steps: T[]) {
	if (!steps.length) return null
	const attempt = Math.max(...steps.map((s) => s.attempt))
	const liveSteps = steps
		.filter((s) => s.attempt === attempt)
		.sort((a, b) => a.stageIndex - b.stageIndex)
	const idx = liveSteps.findIndex((s) => s.decision == null)
	return {
		attempt,
		liveSteps,
		currentStage: idx === -1 ? liveSteps.length - 1 : idx,
		currentStep: idx === -1 ? null : liveSteps[idx]
	}
}

/** Actor ids that already recorded a decision on the given attempt. The auto-completed MAKE step
 *  (routing.ts buildApprovalChain, written already-decided in the filer's name when the filer holds
 *  MANAGE_HR) carries a decision AND an actorId, so it is included here with no special case — that
 *  is what makes the filer-is-maker path a decision by that actor. */
export function decidedActorIds(
	steps: { attempt: number; decision: ApprovalDecision | null; actorId: string | null }[],
	attempt: number
): string[] {
	return steps
		.filter((s) => s.attempt === attempt && s.decision != null && s.actorId != null)
		.map((s) => s.actorId as string)
}

export interface StageSoD {
	/** The deciding user's id (User.id, NOT employeeId — the two are different families and
	 *  comparing across them makes the bar silently never fire). Null disables the same-actor bar. */
	actorId: string | null
	/** Output of decidedActorIds() for the LIVE attempt. */
	decidedActorIds: string[]
	/** RequestDocument.verifiedById for every document on THIS request — INCLUDING documents whose
	 *  verifiedAt has since been cleared (#283/D11: clearing keeps verifiedById precisely so this
	 *  bar cannot be un-verified away). Empty for timesheets and payroll runs — neither has
	 *  RequestDocument rows, so the empty array is an accurate answer, not a disabled guard. */
	verifiedDocActorIds: string[]
}

/** The StageSoD for a timesheet. Timesheets carry no RequestDocument rows, so
 *  `verifiedDocActorIds` is [] — an accurate answer, not a disabled guard. Extracted because the
 *  same literal was built at all THREE timesheet call sites — the page queue filter, the decide
 *  writer in timesheets.ts, and countActionableTimesheets below — and hand-built copies of one
 *  guard's inputs are how a guard silently stops matching itself. The third site is the reason
 *  this helper exists: a first pass wired only two, and the mutation that should have failed
 *  stayed green because the covered site was the one left behind. */
export function timesheetSoD(
	actorId: string | null,
	steps: { attempt: number; decision: ApprovalDecision | null; actorId: string | null }[],
	attempt: number
): StageSoD {
	return { actorId, decidedActorIds: decidedActorIds(steps, attempt), verifiedDocActorIds: [] }
}

// Can this actor decide the given stage? Separation of duties comes first: nobody acts
// on their own submission. Otherwise the actor must hold the stage's capability with any
// of their roles — a checker may not also be the maker of the same request, which the
// per-stage capabilities and the own-submission guard together enforce.
export function canActOnStage(
	stage: ApprovalStage,
	actorRoles: Role[],
	actorEmployeeId: string | null,
	ownerEmployeeId: string | null,
	sod: StageSoD,
	stageCapability: Record<ApprovalStage, keyof typeof CAPABILITIES> = STAGE_CAPABILITY
): boolean {
	if (actorEmployeeId != null && actorEmployeeId === ownerEmployeeId) return false
	// #283: one person may not decide two stages of the same LIVE attempt. Multi-role makes this
	// reachable — a [VERIFIER, APPROVER] user holds both stages' capabilities — and without it,
	// granting two hats silently collapses a two-person review into one.
	//
	// Attempt-scoped, not request-scoped (Q1): a RETURN begins a new attempt against a materially
	// changed document. That does not open an escape route, and this is the argument that carries
	// it: an actor barred from a stage cannot RETURN the request either — the bar is on DECIDING
	// that stage at all, in either direction — so nobody can manufacture a fresh attempt to escape
	// their own bar. The worst case across attempts is that A verified a superseded version and
	// approves a version someone else verified: still two humans on the live attempt.
	if (sod.actorId != null && sod.decidedActorIds.includes(sod.actorId)) return false
	// #283/F3/D7: whoever signed off a supporting document may not also decide the request — they
	// would be weighing their own evidence. A holder of ADMINISTER_SYSTEM (SUPER_ADMIN, CEO) is
	// carved out by explicit decision: they are the escape hatch for a small org whose only
	// available verifier is also its only available approver. The waiver is audited, not silent —
	// see usedDocVerifierCarveOut.
	//
	// This is a CAPABILITY, never a rank. #282 deleted ROLE_HIERARCHY and
	// tests/unit/rbac-no-rank-helpers.test.ts is a static scan that keeps rank floors deleted. Do
	// not reintroduce a level/seniority/hierarchy concept here in any form.
	//
	// Scoped per REQUEST, not per attempt — unlike the bar above. RequestDocument carries no
	// attempt column, and a RETURN does not by itself change the signed artefact: while the
	// sign-off STANDS, deleteRequestDocument refuses with 409, so the row this actor signed
	// survives into attempt 2. Q1's "materially changed document" argument justifies
	// attempt-scoping stage decisions; it does not transfer to a row a RETURN does not touch.
	//
	// Known gap, NOT an invariant: once the sign-off is cleared, verifiedAt is null, that 409 stops
	// firing, and the request OWNER can delete the row — taking verifiedById with it — then
	// re-upload. Two-party (only the owner may delete, and the owner cannot decide their own
	// request), same collusion class as the ponytail ceiling in documents.ts, and closed by the
	// same RequestDocumentVerification history table.
	//
	// Covers EVERY stage, not just a nominated evidence-consuming one: no stage in the chain is
	// designated as the document reader (the queue surfaces documents to all of them), so a
	// stage-scoped bar would have to invent that designation.
	if (
		sod.actorId != null &&
		sod.verifiedDocActorIds.includes(sod.actorId) &&
		!canAny(actorRoles, 'ADMINISTER_SYSTEM')
	) {
		return false
	}
	return canAny(actorRoles, stageCapability[stage])
}

/** True when the F3 bar WOULD have fired but D7's ADMINISTER_SYSTEM carve-out waived it. The
 *  waiver is a privileged path; it must not be silent. Stamped onto the decision's audit entry. */
export function usedDocVerifierCarveOut(sod: StageSoD, actorRoles: Role[]): boolean {
	return (
		sod.actorId != null &&
		sod.verifiedDocActorIds.includes(sod.actorId) &&
		canAny(actorRoles, 'ADMINISTER_SYSTEM')
	)
}

// Payroll variant: the final APPROVE routes to the finance approvers (CEO / Super Admin,
// #174). A run has no employee owner, so the separation-of-duties owner args are null.
//
// #283/F5: `sod` is forwarded rather than stubbed. A [VERIFIER, CEO] user holds both payroll
// stages, so without it one person verifies and approves the same run — the same collapse as F1,
// on the surface where it costs the most. This also SUBSUMES the maker-vs-signer rule the callers
// applied by hand: the MAKE step is decided and carries an actorId, so the maker is already in
// decidedActorIds.
export function canActOnPayrollStage(
	stage: ApprovalStage,
	actorRoles: Role[],
	sod: StageSoD
): boolean {
	return canActOnStage(stage, actorRoles, null, null, sod, PAYROLL_STAGE_CAPABILITY)
}

// Pure transition: given the current stage / chain length / decision, what are the
// request's next status and currentStage? A RETURNED decision sends the item back to the
// maker's queue; REJECTED is a terminal denial. APPROVED advances (or commits on the
// last stage).
export function nextState(
	currentStage: number,
	stepCount: number,
	decision: ApprovalDecision
): { status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED'; currentStage: number } {
	if (decision === 'REJECTED') return { status: 'REJECTED', currentStage }
	if (decision === 'RETURNED') return { status: 'RETURNED', currentStage }
	// APPROVED
	const isLast = currentStage >= stepCount - 1
	return isLast
		? { status: 'APPROVED', currentStage }
		: { status: 'PENDING', currentStage: currentStage + 1 }
}

// Act on the request's current stage of its latest attempt. `actorEmployeeId` is the
// deciding user's own employee id (needed for the separation-of-duties guard).
export async function decide(
	requestId: string,
	decision: ApprovalDecision,
	note: string | undefined,
	ctx: AuditContext,
	actorEmployeeId: string | null
) {
	const req = await db.request.findFirst({
		where: { id: requestId, employee: { organizationId: ctx.organizationId } },
		include: {
			steps: { orderBy: [{ attempt: 'asc' }, { stageIndex: 'asc' }] },
			employee: { select: { reportsToId: true, userId: true } },
			// #283/F3: verifiedById, NOT verifiedAt. The two mean different things since D11, and
			// keying this on verifiedAt would reopen the un-verify bypass exactly.
			//
			// #299: this include is DELIBERATELY UNFILTERED — no `where: { deletedAt: null }`, ever.
			// A tombstoned document's signer is exactly what this bar must still see; filtering here
			// restores the un-verify -> delete -> re-upload bypass #299 exists to close, and it does
			// so with every test in the repo still green. The gate that turns red is AC-2 in
			// tests/unit/approval-self-guard.test.ts ("the F3 bar survives soft-delete"), which mocks
			// findFirst through a `where`-honouring helper precisely so this mutation cannot hide.
			documents: { select: { verifiedById: true } }
		}
	})
	if (!req) error(404, 'Request not found')
	if (req.status !== 'PENDING')
		error(400, `Request is ${req.status.toLowerCase()}, not open for decisions`)

	// #75: separation of duties — nobody decides their own request.
	if (actorEmployeeId != null && actorEmployeeId === req.employeeId) {
		error(403, 'You cannot decide your own request')
	}

	// Only the latest attempt is live; earlier attempts are frozen history (#134).
	const attempt = Math.max(...req.steps.map((s) => s.attempt))
	const liveSteps = req.steps.filter((s) => s.attempt === attempt)
	const step = liveSteps.find((s) => s.stageIndex === req.currentStage)
	if (!step) error(500, 'Approval chain is inconsistent')

	const sod: StageSoD = {
		actorId: ctx.actorId,
		decidedActorIds: decidedActorIds(req.steps, attempt),
		verifiedDocActorIds: req.documents
			.map((d) => d.verifiedById)
			.filter((v): v is string => v != null)
	}
	if (!canActOnStage(step.stage, ctx.actorRoles, actorEmployeeId, req.employeeId, sod)) {
		error(403, 'You cannot act on this stage')
	}
	// A returned reason is required so the maker knows what to fix.
	if ((decision === 'RETURNED' || decision === 'REJECTED') && !note?.trim()) {
		error(400, 'A reason is required to return or reject a request')
	}

	const transition = nextState(req.currentStage, liveSteps.length, decision)

	// The step/request flip AND the on-approval effect (leave-balance deduction /
	// INFO_UPDATE write) must commit atomically (#101). Previously the effect ran in a
	// separate call after the flip, so a failure or crash between them left the request
	// permanently APPROVED with the balance never deducted — free leave, with no reversal
	// path. Running the effect on the same `tx` rolls the approval back if it fails.
	await db.$transaction(async (tx): Promise<AppliedEffect | null> => {
		await tx.approvalStep.update({
			where: { id: step.id },
			data: { decision, actorId: ctx.actorId, note: note ?? null, decidedAt: new Date() }
		})
		await tx.request.update({
			where: { id: req.id },
			data: { status: transition.status, currentStage: transition.currentStage }
		})
		const effect =
			transition.status === 'APPROVED'
				? await applyApprovedRequest(tx, {
						id: req.id,
						type: req.type,
						employeeId: req.employeeId,
						dateFrom: req.dateFrom,
						payload: req.payload
					})
				: null

		// Both audit entries commit with the decision they record (#5).
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Request',
				entityId: req.id,
				newValue: {
					attempt,
					stage: step.stage,
					decision,
					status: transition.status,
					// #283/D7: the ADMINISTER_SYSTEM carve-out let this actor decide a request whose
					// evidence they signed off themselves. It is a privileged waiver of a two-person
					// control, so it leaves a mark; the key is absent on every ordinary decision rather
					// than set to false, so a search for it returns only real uses.
					...(usedDocVerifierCarveOut(sod, ctx.actorRoles) && { selfVerifiedEvidence: true })
				}
			},
			tx
		)

		// The applied effect is audited on the SAME tx as the effect itself, not after commit. This
		// entry records a leave-balance deduction or an employee-column write, and an unrecorded
		// money effect is the worst outcome available here — logging outside the transaction left
		// exactly that gap whenever the audit write failed. The orphan-entry worry the old comment
		// raised is gone either way: sharing the tx rolls the entry back with the effect it
		// describes, so it can no longer outlive a rollback.
		if (effect) {
			await writeAuditLog(
				ctx,
				{
					action: 'UPDATE',
					entityType: effect.kind === 'LEAVE' ? 'LeaveBalance' : 'Employee',
					entityId: req.employeeId,
					newValue:
						effect.kind === 'LEAVE'
							? { leaveTypeId: effect.leaveTypeId, deducted: effect.deducted, viaRequest: req.id }
							: { [effect.column]: effect.value, viaRequest: req.id }
				},
				tx
			)
		}

		return effect
	})

	// #299/D-6 + P-4: the request is now closed, so the FIFO cap stops applying and every tombstoned
	// file goes (keepNewest = 0). Live documents keep their bytes — an auditor must still be able to
	// open what was actually approved.
	//
	// Outside the transaction, and best-effort, on purpose. A filesystem unlink is not
	// rollback-able: run it inside the $transaction above and a disk error rolls back an approval
	// that already moved a leave balance (#101), while the bytes are gone either way. Bytes are a
	// cleanup concern; the decision already succeeded.
	if (transition.status === 'APPROVED' || transition.status === 'REJECTED') {
		await evictTombstonedBytes(req.id, 0).catch((e) =>
			console.error('[storage] failed to evict tombstoned bytes for', req.id, e)
		)
	}

	// Notify the requester of the outcome.
	const label = req.type.replace(/_/g, ' ').toLowerCase()
	const verb =
		transition.status === 'APPROVED'
			? 'approved'
			: transition.status === 'REJECTED'
				? 'rejected'
				: transition.status === 'RETURNED'
					? 'returned for correction'
					: null
	if (verb) {
		await notify(
			req.employee.userId,
			`Your ${label} request was ${verb}.`,
			`/requests/${req.id}`,
			'REQUEST'
		)
	}

	return { status: transition.status, currentStage: transition.currentStage }
}

// Pending requests this user can act on right now (their stage is the live one).
export async function listPendingRequestsForApprover(
	organizationId: string,
	actorRoles: Role[],
	actorEmployeeId: string | null,
	actorUserId: string
) {
	const pending = await db.request.findMany({
		where: { status: 'PENDING', employee: { organizationId } },
		include: {
			steps: { orderBy: [{ attempt: 'asc' }, { stageIndex: 'asc' }] },
			employee: { select: { id: true, firstName: true, lastName: true, reportsToId: true } },
			// verifiedAt stays — requests/approvals/+page.svelte renders it. verifiedById is added for
			// the #283/F3 bar; dropping it empties verifiedDocActorIds and the bar quietly stops
			// existing with every test still green.
			//
			// #299: `deletedAt` is selected ONLY so the row can be SPLIT below. This array itself
			// stays UNFILTERED — it feeds verifiedDocActorIds, which is the queue's mirror of the F3
			// bar and must still see a tombstoned signer. Adding `where: { deletedAt: null }` here is
			// the same bypass as at decide()'s include, on the reader that is watched least.
			documents: { select: { id: true, verifiedAt: true, verifiedById: true, deletedAt: true } }
		},
		orderBy: { createdAt: 'asc' }
	})

	// #299/P-5 + I-5: `documents` serves two consumers with OPPOSITE needs. verifiedDocActorIds
	// below must INCLUDE tombstones (it is the bar); the approvals page's "N documents" chip and
	// unverified badge must EXCLUDE them (they show what an approver can actually open). Split ONCE
	// here, on the server, so the template never learns tombstones exist — pushing a `.filter()`
	// into Svelte would put a safety-critical distinction in the layer least likely to be reviewed.
	// The two inputs are physically different arrays, so a future edit cannot collapse them by
	// accident.
	return pending
		.filter((r) => {
			const attempt = Math.max(...r.steps.map((s) => s.attempt))
			const step = r.steps.find((s) => s.attempt === attempt && s.stageIndex === r.currentStage)
			return (
				step != null &&
				canActOnStage(step.stage, actorRoles, actorEmployeeId, r.employeeId, {
					actorId: actorUserId,
					decidedActorIds: decidedActorIds(r.steps, attempt),
					verifiedDocActorIds: r.documents
						.map((d) => d.verifiedById)
						.filter((v): v is string => v != null)
				})
			)
		})
		.map((r) => ({ ...r, liveDocuments: r.documents.filter((d) => d.deletedAt === null) }))
}

// Roles that can reach the approvals surface (includes the sign-off roles now).
export const APPROVER_ROLES: readonly Role[] = CAPABILITIES.APPROVE_REQUESTS

export interface PendingApprovalCounts {
	timesheets: number
	requests: number
	payrollRuns: number
	/** Pay changes awaiting this user's confirmation (#224 Part 2 / #243). */
	proposals: number
	total: number
}

// Count items awaiting this user's decision — pending requests at their live stage and
// SUBMITTED timesheets they can approve — split for the sidebar dropdown. Zeros for
// non-approver roles.
export async function countPendingApprovals(user: {
	id: string
	roles: Role[]
	organizationId: string
}): Promise<PendingApprovalCounts> {
	const roles = user.roles
	// Harmless for proposals too: every confirmer capability (ADMINISTER_HR_ORGWIDE /
	// APPROVE_FINANCE) is held only by HR_ADMIN, CEO and SUPER_ADMIN, all of whom hold
	// APPROVE_REQUESTS — so no confirmer is short-circuited here.
	if (!canAny(roles, 'APPROVE_REQUESTS'))
		return { timesheets: 0, requests: 0, payrollRuns: 0, proposals: 0, total: 0 }

	const myEmployee = await db.employee.findUnique({
		where: { userId: user.id },
		select: { id: true }
	})

	// Timesheets now run the maker-checker chain too (#134): a user can act on one whose
	// live stage they hold (make/verify/approve). Count those awaiting them.
	const canReviewTimesheets =
		canAny(roles, 'MANAGE_HR') ||
		canAny(roles, 'VERIFY_REQUESTS') ||
		canAny(roles, 'APPROVE_SIGNOFF')

	const [requests, timesheetCount, payrollRunCount, proposals] = await Promise.all([
		listPendingRequestsForApprover(user.organizationId, roles, myEmployee?.id ?? null, user.id),
		canReviewTimesheets
			? countActionableTimesheets(user.organizationId, roles, myEmployee?.id ?? null, user.id)
			: Promise.resolve(0),
		countActionablePayrollRuns(user.organizationId, roles, user.id),
		// Same "run the filtered list, take .length" shape as requests. Notifications are one-shot
		// toasts marked read on the next page load, so without this badge a proposal filed while the
		// confirmer was away leaves no standing trace anywhere in the UI.
		listActionableProposals(user.organizationId, { actorId: user.id, roles })
	])

	return {
		timesheets: timesheetCount,
		requests: requests.length,
		payrollRuns: payrollRunCount,
		proposals: proposals.length,
		total: timesheetCount + requests.length + payrollRunCount + proposals.length
	}
}

// COMPUTED payroll runs whose live maker-checker stage this user can sign off (#134).
// Only the sign-off roles act on runs; anyone who already decided the live attempt — the maker
// included — is excluded (SoD, #283/F5).
//
// Exported since #283: this counter now carries a separation-of-duties guard, and a guard that
// cannot be tested directly is a guard nobody can trust. Not a public API surface — the export
// exists for tests/unit/approval-queues.test.ts.
export async function countActionablePayrollRuns(
	organizationId: string,
	roles: Role[],
	userId: string
): Promise<number> {
	if (!canAny(roles, 'VERIFY_REQUESTS') && !canAny(roles, 'APPROVE_FINANCE')) return 0
	// A finance approver counts pending runs across every tenant they sign off for (#174);
	// a Verifier only sees their own org's queue.
	const financeApprover = canAny(roles, 'APPROVE_FINANCE')
	const runs = await db.payrollRun.findMany({
		where: { status: 'COMPUTED', ...(financeApprover ? {} : { organizationId }) },
		select: {
			approvalSteps: {
				select: {
					id: true,
					attempt: true,
					stageIndex: true,
					stage: true,
					decision: true,
					actorId: true
				}
			}
		}
	})
	return runs.filter((r) => {
		const live = livePayrollStage(r.approvalSteps)
		if (!live?.currentStep) return false
		// The explicit `makeActorId !== userId` clause that stood here is GONE, not forgotten: the
		// MAKE step is decided and carries an actorId, so decidedActorIds already contains the
		// maker. Keeping both would be two copies of one rule, and the copies drift.
		return canActOnPayrollStage(live.currentStep.stage, roles, {
			actorId: userId,
			decidedActorIds: decidedActorIds(r.approvalSteps, live.attempt),
			verifiedDocActorIds: []
		})
	}).length
}

// SUBMITTED timesheets whose live maker-checker stage this user can act on (#134).
//
// Exported since #283, for the same reason as countActionablePayrollRuns above.
export async function countActionableTimesheets(
	organizationId: string,
	roles: Role[],
	actorEmployeeId: string | null,
	actorUserId: string
): Promise<number> {
	const submitted = await db.timesheet.findMany({
		where: {
			status: 'SUBMITTED',
			...(actorEmployeeId ? { employeeId: { not: actorEmployeeId } } : {}),
			employee: { organizationId }
		},
		select: {
			employeeId: true,
			// `actorId` is what the #283 bar reads. Omit it and decidedActorIds returns [] for every
			// row — the guard stops existing, silently, with every test still green.
			approvalSteps: {
				select: { attempt: true, stageIndex: true, stage: true, decision: true, actorId: true }
			}
		}
	})
	return submitted.filter((ts) => {
		const live = liveChain(ts.approvalSteps)
		// Legacy step-less timesheets remain manager-ladder actionable.
		if (!live || !live.currentStep) return canAny(roles, 'VIEW_TEAM')
		return canActOnStage(
			live.currentStep.stage,
			roles,
			actorEmployeeId,
			ts.employeeId,
			timesheetSoD(actorUserId, ts.approvalSteps, live.attempt)
		)
	}).length
}

// ─── Payroll-run approval chain (#134) ──────────────────────────────────────────
//
// A payroll run adopts the same maker → verifier → approver chain as requests and
// timesheets, but keyed on `payrollRunId`. Two differences shape the helpers below:
//
//   1. A run has no `currentStage` column — the live stage is derived from the
//      append-only steps via liveChain(), exactly like timesheets.
//   2. PayrollRunStatus has no RETURNED state. A returned run stays COMPUTED and the
//      maker recomputes to refile; so a "returned" attempt must read as *closed*
//      (no open stage) until a recompute opens a fresh attempt — otherwise a later
//      stage's null step would look actionable and let an approver skip the return.

export interface PayrollChainStep extends ChainStep {
	id: string
	actorId: string | null
}

// The live, still-actionable stage of a run's chain, or null when the latest attempt
// is closed (fully approved, or returned/rejected and awaiting a recompute).
export function livePayrollStage(steps: PayrollChainStep[]) {
	const live = liveChain(steps)
	if (!live) return null
	// A return/reject halts the attempt: nothing further can be acted on until the maker
	// recomputes, which starts a new attempt.
	const halted = live.liveSteps.some((s) => s.decision === 'RETURNED' || s.decision === 'REJECTED')
	if (halted || !live.currentStep) return { ...live, currentStep: null }
	return live
}

// Ensure a computed run has an open approval chain. Called at the end of compute:
// creates attempt 1 (MAKE auto-completed by the computing user, entering VERIFY) on the
// first compute, and opens a fresh attempt after a return. A recompute while the chain
// is still open is a no-op, so re-deriving numbers mid-review doesn't disturb sign-offs.
export async function ensurePayrollApprovalChain(runId: string, makerUserId: string) {
	const steps = await db.approvalStep.findMany({
		where: { payrollRunId: runId },
		orderBy: [{ attempt: 'asc' }, { stageIndex: 'asc' }]
	})
	if (livePayrollStage(steps)?.currentStep) return // chain already open

	const attempt = steps.length ? Math.max(...steps.map((s) => s.attempt)) + 1 : 1
	const { steps: newSteps } = buildApprovalChain({
		attempt,
		makerUserId,
		decidedAt: new Date()
	})
	await db.approvalStep.createMany({
		data: newSteps.map((s) => ({
			payrollRunId: runId,
			attempt: s.attempt,
			stageIndex: s.stageIndex,
			stageKind: s.stageKind,
			stage: s.stage,
			role: s.role,
			requiredRole: s.requiredRole,
			decision: s.decision ?? null,
			actorId: s.actorId ?? null,
			decidedAt: s.decidedAt ?? null
		}))
	})
}

// Act on a run's current maker-checker stage. `approved` advances the chain (final
// APPROVE commits the run to APPROVED); otherwise the run is returned to the maker with
// a required reason and stays COMPUTED for recompute/refile. Separation of duties: the
// user who prepared (MADE) the attempt cannot verify or approve it.
export async function decidePayrollRun(
	runId: string,
	organizationId: string,
	approved: boolean,
	note: string | undefined,
	ctx: AuditContext
) {
	// A finance approver (CEO / Super Admin) signs off payroll for every tenant, so they
	// reach a run by id alone; everyone else stays scoped to their own org (#174).
	const financeApprover = canAny(ctx.actorRoles, 'APPROVE_FINANCE')
	const run = await db.payrollRun.findFirst({
		where: { id: runId, ...(financeApprover ? {} : { organizationId }) },
		include: { approvalSteps: true }
	})
	if (!run) error(404, 'Payroll run not found')
	if (run.status !== 'COMPUTED') error(400, 'Only computed payroll runs can be reviewed')

	const live = livePayrollStage(run.approvalSteps)
	if (!live || !live.currentStep) error(400, 'This run has no open approval stage')

	const step = live.currentStep
	const roles = ctx.actorRoles
	// Separation of duties: the maker of this attempt may not sign it off. #283/F5 SUBSUMES this —
	// the maker is in decidedActorIds — so the block is kept purely FOR ITS MESSAGE, and must stay
	// ABOVE the generic check or the generic one fires first and swallows it. Telling a preparer
	// "you cannot act on this stage" when the real reason is "you prepared it" is the kind of
	// refusal people file a support ticket about.
	const makeStep = run.approvalSteps.find((s) => s.attempt === live.attempt && s.stage === 'MAKE')
	if (makeStep?.actorId && makeStep.actorId === ctx.actorId) {
		error(403, 'You cannot sign off a payroll run you prepared')
	}
	// Stage authority is a capability (VERIFY → Verifier, APPROVE → finance approver:
	// CEO / Super Admin, #174). No employee owner exists for a run, so the owner-based
	// guard args are null. #283/F5: the sod arm additionally bars anyone who decided an earlier
	// stage of this attempt — a [VERIFIER, CEO] user verifying then approving their own run.
	if (
		!canActOnPayrollStage(step.stage, roles, {
			actorId: ctx.actorId,
			decidedActorIds: decidedActorIds(run.approvalSteps, live.attempt),
			verifiedDocActorIds: []
		})
	) {
		error(403, 'You cannot act on this stage')
	}

	const decision: ApprovalDecision = approved ? 'APPROVED' : 'RETURNED'
	if (!approved && !note?.trim()) error(400, 'A reason is required to return a payroll run')

	const transition = nextState(live.currentStage, live.liveSteps.length, decision)
	const finalApproved = transition.status === 'APPROVED'

	await db.$transaction(async (tx) => {
		await tx.approvalStep.update({
			where: { id: step.id },
			data: {
				decision,
				actorId: ctx.actorId,
				note: approved ? null : (note ?? null),
				decidedAt: new Date()
			}
		})
		if (finalApproved) {
			await tx.payrollRun.update({
				where: { id: runId },
				data: { status: 'APPROVED', approvedById: ctx.actorId, approvedAt: new Date() }
			})
		}

		// A cross-tenant finance approval belongs in the run's tenant audit trail, not the
		// approver's home org — log against the run's organization (#174).
		await writeAuditLog(
			{ ...ctx, organizationId: run.organizationId },
			{
				action: 'UPDATE',
				entityType: 'PayrollRun',
				entityId: runId,
				newValue: {
					attempt: live.attempt,
					stage: step.stage,
					decision,
					status: finalApproved ? 'APPROVED' : 'COMPUTED'
				}
			},
			tx
		)
	})

	return { status: finalApproved ? 'APPROVED' : 'COMPUTED', stage: step.stage, decision }
}

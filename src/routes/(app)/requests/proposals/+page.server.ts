import { fail, redirect } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { failFromError } from '$lib/server/form-fail'
import { paginate } from '$lib/server/pagination'
import { canAny } from '$lib/server/rbac'
import {
	confirmProposal,
	listActionableProposals,
	rejectProposal
} from '$lib/server/services/action-proposals'
import {
	applyProposedChange,
	proposalPayloadSchema,
	revealProposalAmount
} from '$lib/server/services/employees'
import { EMPLOYMENT_TYPE_OPTIONS } from '$lib/utils/employment-type'
import type { Actions, PageServerLoad } from './$types'

// Pay changes waiting for a second qualified person (#224 Part 2 / #243). A sibling of
// /requests/approvals rather than a tab of it: that page gates on APPROVE_REQUESTS, whose largest
// holder is MANAGER — the very role this queue exists to keep from acting alone. Two routes, two
// gates, no union.
//
// No authority lives in this file. Every action calls a service that asserts its own, so the form
// action and its future v1 API twin are covered by one check.

const EMPLOYMENT_TYPE_LABELS = Object.fromEntries(EMPLOYMENT_TYPE_OPTIONS) as Record<string, string>
const RATE_TYPE_LABELS: Record<string, string> = {
	MONTHLY: 'Monthly',
	DAILY: 'Daily',
	HOURLY: 'Hourly'
}

const ctxOf = (locals: App.Locals, ip: string) => ({
	organizationId: locals.user!.organizationId,
	actorId: locals.user!.id,
	// `assertMayDecide` reads the full set, so a [MANAGER, HR_ADMIN] user gets the confirmation
	// they are entitled to (#133).
	actorRoles: locals.user!.roles,
	ipAddress: ip
})

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	const roles = user.roles
	// Display gating only: `listActionableProposals` returns [] for these users anyway and every
	// action 403s regardless. It exists so the route is not a dead end, as /requests/approvals does.
	if (!canAny(roles, 'ADMINISTER_HR_ORGWIDE') && !canAny(roles, 'APPROVE_FINANCE')) {
		redirect(303, '/requests')
	}

	const actionable = await listActionableProposals(user.organizationId, {
		actorId: user.id,
		roles
	})
	// Filtered in JS (isSelfAction compares two columns), so the page paginates in memory — the
	// same reason /requests/approvals does (#64).
	const pagination = paginate(url, actionable.length)
	const rows = actionable.slice(pagination.skip, pagination.skip + pagination.take)

	// A malformed payload must not abort the load — the confirmer still needs the row so they can
	// reject it (the /payroll/statutory-rates precedent).
	const parsed = rows.map((r) => proposalPayloadSchema.safeParse(r.payload))

	// Ids a payload carries, resolved to names in two queries for the page rather than one per row.
	const positionIds = new Set<string>()
	const managerIds = new Set<string>()
	rows.forEach((r, i) => {
		const p = parsed[i]
		if (!p.success) return
		if (p.data.positionId !== undefined) {
			if (p.data.positionId) positionIds.add(p.data.positionId)
			if (r.target.positionId) positionIds.add(r.target.positionId)
		}
		if (p.data.reportsToId !== undefined) {
			managerIds.add(p.data.reportsToId)
			if (r.target.reportsToId) managerIds.add(r.target.reportsToId)
		}
	})

	const initiatorIds = [...new Set(rows.map((r) => r.initiatorId))]
	const [positions, managers, initiators] = await Promise.all([
		positionIds.size
			? db.position.findMany({
					where: { id: { in: [...positionIds] }, organizationId: user.organizationId },
					select: { id: true, title: true }
				})
			: [],
		managerIds.size
			? db.employee.findMany({
					where: { id: { in: [...managerIds] }, organizationId: user.organizationId },
					select: { id: true, firstName: true, lastName: true }
				})
			: [],
		initiatorIds.length
			? db.user.findMany({
					where: { id: { in: initiatorIds } },
					select: {
						id: true,
						email: true,
						employee: { select: { firstName: true, lastName: true } }
					}
				})
			: []
	])
	const positionTitle = new Map(positions.map((p) => [p.id, p.title]))
	const managerName = new Map(managers.map((m) => [m.id, `${m.lastName}, ${m.firstName}`]))
	// The initiator's employee name reads like the rest of the app; email is the fallback for a
	// user with no employee record (a seeded SUPER_ADMIN).
	const initiatorName = new Map(
		initiators.map((u) => [
			u.id,
			u.employee ? `${u.employee.lastName}, ${u.employee.firstName}` : u.email
		])
	)

	const proposals = rows.map((r, i) => {
		const p = parsed[i]
		const d = p.success ? p.data : null
		const changes: { label: string; from: string; to: string }[] = []
		const add = (label: string, from: string | null, to: string | null) => {
			if (to == null) return
			changes.push({ label, from: from ?? '—', to })
		}
		if (d) {
			if (d.jobTitle !== undefined) add('Job title', r.target.jobTitle, d.jobTitle)
			if (d.positionId !== undefined) {
				add(
					'Position',
					r.target.positionId ? (positionTitle.get(r.target.positionId) ?? '—') : null,
					d.positionId ? (positionTitle.get(d.positionId) ?? 'Unknown position') : 'None'
				)
			}
			if (d.employmentType !== undefined) {
				add(
					'Employment type',
					EMPLOYMENT_TYPE_LABELS[r.target.employmentType],
					EMPLOYMENT_TYPE_LABELS[d.employmentType]
				)
			}
			if (d.rateType !== undefined) {
				add('Pay basis', RATE_TYPE_LABELS[r.target.rateType], RATE_TYPE_LABELS[d.rateType])
			}
			if (d.reportsToId !== undefined) {
				add(
					'Reports to',
					r.target.reportsToId ? (managerName.get(r.target.reportsToId) ?? '—') : null,
					managerName.get(d.reportsToId) ?? 'Unknown employee'
				)
			}
		}

		return {
			id: r.id,
			domain: r.domain,
			createdAt: r.createdAt,
			// Re-derived, never stored — the same rule the confirm guard applies.
			isSelfAction: r.target.userId === r.initiatorId,
			initiator: initiatorName.get(r.initiatorId) ?? r.initiatorId,
			target: {
				firstName: r.target.firstName,
				lastName: r.target.lastName,
				employeeNumber: r.target.employeeNumber
			},
			effectiveDate: d?.effectiveDate ?? null,
			note: d?.note ?? null,
			changes,
			// Whether a figure exists to reveal — never the figure itself. The salary is the one
			// field in SENSITIVE_FIELDS a proposal can carry, so it leaves the server only through
			// the audited ?/revealAmount action (#111).
			hasAmount: d?.basicMonthlySalary !== undefined,
			unreadable: !p.success
		}
	})

	return { proposals, pagination }
}

export const actions: Actions = {
	confirm: async ({ request, locals, getClientAddress }) => {
		const id = String((await request.formData()).get('proposalId') ?? '')
		if (!id) return fail(400, { error: 'Missing proposal id.' })
		const ctx = ctxOf(locals, getClientAddress())
		try {
			await confirmProposal(
				ctx.organizationId,
				id,
				(proposal, tx) => applyProposedChange(ctx.organizationId, proposal, tx, ctx),
				ctx
			)
		} catch (e) {
			const f = failFromError(e)
			// A 400 is re-validation at apply time doing its job: the payload went stale, the claim
			// rolled back and the row is still PENDING. The writer's own message is shared with the
			// direct write path, so the lead-in is added here rather than in the service.
			if (f.status !== 400) return f
			return fail(400, {
				error: `Couldn't apply — the record has changed since this was proposed: ${f.data.error}`
			})
		}
		return { success: 'Change confirmed and applied.' }
	},

	reject: async ({ request, locals, getClientAddress }) => {
		const data = await request.formData()
		const id = String(data.get('proposalId') ?? '')
		const note = String(data.get('note') ?? '')
		if (!id) return fail(400, { error: 'Missing proposal id.' })
		// The empty-reason rule is `rejectProposal`'s, and it runs before any lookup — a copy here
		// would save nothing and could only ever drift from it. `ReasonDialog` also keeps its own
		// Confirm disabled until something is typed, but that is cosmetic (Constitution P2).
		try {
			await rejectProposal(locals.user!.organizationId, id, note, ctxOf(locals, getClientAddress()))
		} catch (e) {
			return failFromError(e)
		}
		return { success: 'Proposal rejected and the initiator notified.' }
	},

	revealAmount: async ({ request, locals, getClientAddress }) => {
		const id = String((await request.formData()).get('proposalId') ?? '')
		if (!id) return fail(400, { error: 'Missing proposal id.' })
		try {
			const amounts = await revealProposalAmount(
				locals.user!.organizationId,
				id,
				ctxOf(locals, getClientAddress())
			)
			// Keyed by id so revealing one row does not unmask another.
			return { revealedId: id, amounts }
		} catch (e) {
			return failFromError(e)
		}
	}
}

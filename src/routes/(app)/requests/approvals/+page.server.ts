import { fail, isHttpError, redirect } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { paginate } from '$lib/server/pagination'
import { canAny } from '$lib/server/rbac'
import { decide, listPendingRequestsForApprover } from '$lib/server/services/approvals'
import type { ApprovalDecision } from '@prisma/client'
import type { Actions, PageServerLoad } from './$types'

/**
 * #6 — the caller's OWN employee row, scoped to the ACTIVE org. An unscoped `userId` lookup
 * resolves a cross-org account's home-tenant profile whichever org the session is in.
 *
 * Null-tolerant by design: every caller passes `?.id ?? null`, because an approver with no
 * employee row in the active org still legitimately reviews other people's requests.
 */
function findSelfEmployee(user: { id: string; organizationId: string }) {
	return db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
}

// Request approvals (all request types) — reachable by any role that can approve, with
// the actual per-stage authority (make/verify/approve) resolved in the service (#134).
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	const roles = user.roles
	if (!canAny(roles, 'APPROVE_REQUESTS')) redirect(303, '/requests')

	const myEmployee = await findSelfEmployee(user)

	const actionable = await listPendingRequestsForApprover(
		user.organizationId,
		roles,
		myEmployee?.id ?? null,
		user.id
	)

	// #64: "at my stage" is decided in JS (canActOnStage), so this page paginates
	// the filtered set in memory — the fetch itself is already bounded to PENDING.
	const pagination = paginate(url, actionable.length)
	const pendingRequests = actionable.slice(pagination.skip, pagination.skip + pagination.take)

	// Leave context for the cards (#137): the type name, the days being asked for, and what
	// the filer has left. Without it an approver has to open each request — or worse, approve
	// blind — to find out whether the days are even there. Two queries for the whole page,
	// not one per card.
	const leaveOf = new Map<string, { leaveTypeId: string; totalDays: number | null }>()
	for (const r of pendingRequests) {
		if (r.type !== 'LEAVE') continue
		const payload = (r.payload ?? {}) as { leaveTypeId?: string; totalDays?: number }
		if (typeof payload.leaveTypeId === 'string') {
			leaveOf.set(r.id, { leaveTypeId: payload.leaveTypeId, totalDays: payload.totalDays ?? null })
		}
	}

	let leaveContext: Record<
		string,
		{ typeName: string; totalDays: number | null; remaining: number | null }
	> = {}

	if (leaveOf.size > 0) {
		const typeIds = [...new Set([...leaveOf.values()].map((v) => v.leaveTypeId))]
		const leaveRows = pendingRequests.filter((r) => leaveOf.has(r.id))
		const [types, balances] = await Promise.all([
			db.leaveType.findMany({
				where: { id: { in: typeIds }, organizationId: user.organizationId },
				select: { id: true, name: true }
			}),
			db.leaveBalance.findMany({
				where: {
					employeeId: { in: [...new Set(leaveRows.map((r) => r.employeeId))] },
					leaveTypeId: { in: typeIds }
				},
				select: { employeeId: true, leaveTypeId: true, year: true, remaining: true }
			})
		])
		const typeName = new Map(types.map((t) => [t.id, t.name]))
		const balanceOf = new Map(
			balances.map((b) => [`${b.employeeId}:${b.leaveTypeId}:${b.year}`, Number(b.remaining)])
		)

		leaveContext = Object.fromEntries(
			leaveRows.map((r) => {
				const info = leaveOf.get(r.id)!
				// Balances are per year, keyed on the year the leave falls in — a December
				// filing for January leave draws on next year's allocation.
				const year = (r.dateFrom ?? new Date()).getFullYear()
				return [
					r.id,
					{
						typeName: typeName.get(info.leaveTypeId) ?? 'Leave',
						totalDays: info.totalDays,
						remaining: balanceOf.get(`${r.employeeId}:${info.leaveTypeId}:${year}`) ?? null
					}
				]
			})
		)
	}

	return { pendingRequests, pagination, leaveContext }
}

export const actions: Actions = {
	decideRequest: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		const roles = user.roles
		if (!canAny(roles, 'APPROVE_REQUESTS')) return fail(403, { error: 'Insufficient permissions' })

		const data = await request.formData()
		const id = data.get('id') as string
		const decision = data.get('decision') as ApprovalDecision
		const note = (data.get('note') as string) || undefined
		if (!id || !['APPROVED', 'REJECTED', 'RETURNED'].includes(decision)) {
			return fail(400, { error: 'Missing request id or invalid decision' })
		}

		if (['REJECTED', 'RETURNED'].includes(decision) && (!note || note.trim() === '')) {
			return fail(400, { error: 'A note is required for rejected or returned requests.' })
		}

		const myEmployee = await findSelfEmployee(user)

		try {
			await decide(
				id,
				decision,
				note,
				{
					organizationId: user.organizationId,
					actorId: user.id,
					actorRoles: roles,
					ipAddress: getClientAddress()
				},
				myEmployee?.id ?? null
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}

		// The page renders `form?.saved`; this action used to return nothing, so a decision
		// looked identical to a no-op. Name the decision so the two are distinguishable.
		return {
			saved:
				decision === 'APPROVED'
					? 'Request approved.'
					: decision === 'REJECTED'
						? 'Request rejected.'
						: 'Request returned to the filer.'
		}
	},

	// Reject each selected request with one shared note. Requests the approver can't currently
	// decide (e.g. no longer at their stage) throw and are counted as skipped, not aborting the batch.
	rejectMany: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		const roles = user.roles
		if (!canAny(roles, 'APPROVE_REQUESTS')) return fail(403, { error: 'Insufficient permissions' })

		const data = await request.formData()
		const ids = String(data.get('ids') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
		const note = (data.get('note') as string) || ''
		if (!ids.length) return fail(400, { error: 'No requests selected' })
		if (note.trim() === '') return fail(400, { error: 'A note is required to reject requests.' })

		const myEmployee = await findSelfEmployee(user)
		const ctx = {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: roles,
			ipAddress: getClientAddress()
		}

		let done = 0
		let skipped = 0
		for (const id of ids) {
			try {
				await decide(id, 'REJECTED', note, ctx, myEmployee?.id ?? null)
				done++
			} catch {
				skipped++
			}
		}
		return {
			saved: `Rejected ${done} request${done === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}.`
		}
	}
}

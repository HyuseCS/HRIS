import { canAny } from '$lib/server/rbac'
import { fail } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { paginate } from '$lib/server/pagination'
import { getLeaveBalances } from '$lib/server/services/leave'
import { countRequests, listRequests, deleteRequest } from '$lib/server/services/requests'
import { listVisibleEmployeeIds } from '$lib/server/services/employee-access'
import type { Actions, PageServerLoad, RequestEvent } from './$types'

// Read-only leave view. Leave filing/approval now flows through the unified
// Requests/Approvals page; this page lists leave (Request type=LEAVE) + balances.
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	const isManager = canAny(user.roles, 'VIEW_TEAM')
	// #150: HR/admin/CEO have no balances of their own (often no employee record at all), so
	// this panel was simply blank for them. They get a route to the org-wide view instead —
	// the balances themselves live on /leave/balances rather than being duplicated here,
	// which would mean rendering every employee in the org on a self-service page.
	const canViewOrgBalances = canAny(user.roles, 'MANAGE_HR')

	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId }
	})
	const year = new Date().getFullYear()

	// Non-managers without an employee record have no leave to show — return an empty
	// list rather than passing an undefined employeeId (which would leak org-wide rows).
	const canListLeave = isManager || Boolean(myEmployee)

	// #275: the page twin of `GET /api/v1/requests`. `isManager` said WHAT the actor may do, never
	// WHOSE rows — so an undefined employeeId dropped the filter and this page listed the whole
	// organization's leave. The roster helper, NOT `listVisiblePayEmployeeIds`: the pay helper's only
	// difference is that it opens up for VIEW_PAY_ORGWIDE, which here would WIDEN the page for
	// PAYROLL_OFFICER and FINANCE. `null` means unrestricted (ADMINISTER_HR_ORGWIDE) — no filter at
	// all; `[]` for a caller with no employee record, since an undefined filter leaks the org.
	const visibleEmployeeIds = isManager
		? await listVisibleEmployeeIds(user)
		: myEmployee
			? [myEmployee.id]
			: []

	// #64: paginate the requests table only; balances/types stay whole.
	const listParams = {
		organizationId: user.organizationId,
		employeeIds: visibleEmployeeIds ?? undefined,
		type: 'LEAVE' as const
	}
	const total = canListLeave ? await countRequests(listParams) : 0
	const pagination = paginate(url, total)

	const [requests, leaveTypes, balances] = await Promise.all([
		canListLeave
			? listRequests(listParams, { skip: pagination.skip, take: pagination.take })
			: Promise.resolve([]),
		db.leaveType.findMany({
			where: { organizationId: user.organizationId, isActive: true },
			orderBy: { name: 'asc' },
			select: { id: true, name: true }
		}),
		myEmployee ? getLeaveBalances(myEmployee.id, year) : []
	])

	return {
		requests,
		leaveTypes,
		balances,
		myEmployeeId: myEmployee?.id,
		isManager,
		canViewOrgBalances,
		pagination
	}
}

function ctxOf(event: RequestEvent) {
	const u = event.locals.user!
	return {
		organizationId: u.organizationId,
		actorId: u.id,
		// #279: `deleteRequest` decides privilege from the FULL role set — judging a multi-role
		// deleter on their primary role alone refuses a deletion their secondary role permits
		// (the #247 defect).
		actorRoles: u.roles,
		ipAddress: event.getClientAddress()
	}
}

export const actions: Actions = {
	// Bulk delete: remove each selected leave request. Authorization is per item in deleteRequest —
	// approved requests, and (for non-HR) ones the caller doesn't own, throw and are counted as
	// skipped rather than aborting the batch.
	deleteMany: async (event) => {
		const ids = String((await event.request.formData()).get('ids') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
		if (!ids.length) return fail(400, { error: 'No leave requests selected' })

		const org = event.locals.user!.organizationId
		const ctx = ctxOf(event)
		let deleted = 0
		let skipped = 0
		for (const id of ids) {
			try {
				await deleteRequest(id, org, ctx)
				deleted++
			} catch {
				skipped++
			}
		}
		return {
			saved: `Deleted ${deleted} leave request${deleted === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}.`
		}
	}
}

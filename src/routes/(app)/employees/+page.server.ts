import { requireAnyCapability } from '$lib/server/rbac'
import { failFromError } from '$lib/server/form-fail'
import { paginate } from '$lib/server/pagination'
import { countEmployees, listEmployees, offboardEmployee } from '$lib/server/services/employees'
import { listAssignableBranches } from '$lib/server/services/branches'
import {
	assertCanTouchEmployee,
	listVisibleEmployeeIds
} from '$lib/server/services/employee-access'
import { isFoodServiceOrg } from '$lib/orgs'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
	// #234: MANAGER ranks level with HR_ADMIN (#133), so the `requireMinRole('HR_ADMIN')` that
	// used to stand here admitted every manager to the WHOLE roster — the same dead-guard shape
	// #228 fixed on the 201 page. This check only keeps EMPLOYEE and the off-ladder roles out;
	// who a manager actually sees is decided by the id filter below.
	requireAnyCapability(locals.user!.roles, 'VIEW_TEAM')

	const organizationId = locals.user!.organizationId
	const search = url.searchParams.get('search') ?? undefined
	const departmentId = url.searchParams.get('department') ?? undefined
	// Branches only exist for the food-service tenants — ignore the param elsewhere so a
	// hand-typed ?branch= can't filter a roster that has no such dimension.
	const showBranches = isFoodServiceOrg(organizationId)
	const branchId = showBranches ? (url.searchParams.get('branch') ?? undefined) : undefined

	// Offboarded staff are kept, not deleted (#184), so the roster splits into two tabs:
	// the active workforce (default) and a dedicated Offboarded section. Both counts feed
	// the tab labels; only the selected tab's page of rows is queried.
	const tab = url.searchParams.get('status') === 'offboarded' ? 'offboarded' : 'active'
	// `null` for HR/CEO/Super-Admin (unrestricted); an id list for a manager. Threaded into the
	// counts as well as the rows, so the tab labels and pagination describe what they can see
	// rather than the org's true headcount.
	const visibleIds = await listVisibleEmployeeIds(locals.user!)
	const baseFilters = { search, departmentId, branchId, ...(visibleIds && { ids: visibleIds }) }

	// #64: counts are awaited (pagination meta + tab labels need them) while the page of
	// rows still streams so the skeleton renders immediately.
	const [activeCount, offboardedCount] = await Promise.all([
		countEmployees(organizationId, { ...baseFilters, offboarded: false }),
		countEmployees(organizationId, { ...baseFilters, offboarded: true })
	])
	const total = tab === 'offboarded' ? offboardedCount : activeCount
	const pagination = paginate(url, total)
	const employees = listEmployees(
		organizationId,
		{ ...baseFilters, offboarded: tab === 'offboarded' },
		{ skip: pagination.skip, take: pagination.take }
	)
	const branches = showBranches ? await listAssignableBranches(organizationId) : []

	return {
		employees,
		pagination,
		branches,
		showBranches,
		branchFilter: branchId ?? '',
		tab,
		activeCount,
		offboardedCount
	}
}

export const actions: Actions = {
	// Onboarding lives on the dedicated /employees/new page (full form + Discord ID); this
	// list page only carries the offboard action for the table rows.
	offboard: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!

		const data = await request.formData()
		const id = data.get('id') as string
		const endDate = new Date(data.get('endDate') as string)

		// #234: the scoped load hides rows, but a form action is reachable by direct POST whatever
		// the page rendered — so the id has to be checked here, not just filtered upstream. This is
		// the destructive half of the hole: offboarding was open to any manager, on anyone.
		await assertCanTouchEmployee(user, id)

		try {
			await offboardEmployee(id, user.organizationId, endDate, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e) {
			return failFromError(e)
		}
	}
}

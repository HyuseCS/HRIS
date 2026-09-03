import { json } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { listEmployees } from '$lib/server/services/employees'
import { listVisibleEmployeeIds } from '$lib/server/services/employee-access'
import { apiError } from '$lib/server/api-error'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	try {
		requireAnyCapability(locals.user.roles, 'VIEW_TEAM')
	} catch {
		return apiError(403, 'Insufficient permissions')
	}

	const search = url.searchParams.get('search') ?? undefined
	const departmentId = url.searchParams.get('departmentId') ?? undefined

	// #234: same scoping as the roster page. This endpoint is explicitly reachable at MANAGER,
	// so leaving it unfiltered would hand back through the API exactly the org-wide list the page
	// no longer renders.
	const visibleIds = await listVisibleEmployeeIds(locals.user)
	const employees = await listEmployees(locals.user.organizationId, {
		search,
		departmentId,
		...(visibleIds && { ids: visibleIds })
	})

	return json({ data: employees, count: employees.length })
}

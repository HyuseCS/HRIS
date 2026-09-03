import { json } from '@sveltejs/kit'
import { requirePayrollManage } from '$lib/server/rbac'
import { listPayrollRuns } from '$lib/server/services/payroll/index'
import { apiError } from '$lib/server/api-error'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	try {
		requirePayrollManage(locals.user.roles)
	} catch {
		return apiError(403, 'Insufficient permissions')
	}

	const runs = await listPayrollRuns(locals.user.organizationId)
	return json({ data: runs, count: runs.length })
}

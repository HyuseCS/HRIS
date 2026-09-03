import { requireAnyCapability } from '$lib/server/rbac'
import { getReportingNodes } from '$lib/server/services/settings/org'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	return { nodes: await getReportingNodes(user.organizationId) }
}

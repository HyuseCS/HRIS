import { json, error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { getReportingNodes } from '$lib/server/services/settings/org'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized')
	requireAnyCapability(locals.user.roles, 'MANAGE_HR')
	return json({ results: await getReportingNodes(locals.user.organizationId) })
}

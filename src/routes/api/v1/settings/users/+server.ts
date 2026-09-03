import { json, error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { listOrgUsers } from '$lib/server/services/settings/org'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized')
	requireAnyCapability(locals.user.roles, 'ADMINISTER_SYSTEM')
	return json({ results: await listOrgUsers(locals.user.organizationId) })
}

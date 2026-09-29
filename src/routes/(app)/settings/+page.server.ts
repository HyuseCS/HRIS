import { requireAnyCapability } from '$lib/server/rbac'
import type { PageServerLoad } from './$types'

// Which destinations a role may see is decided by `$lib/settings-destinations`, from the same
// rbac table this guard reads (#237/#178 reasoning now lives on the array entries). This load
// only keeps the door: reaching the settings surface at all requires MANAGE_HR.
export const load: PageServerLoad = async ({ locals }) => {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
}

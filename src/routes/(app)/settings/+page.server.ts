import { canAny, requireAnyCapability } from '$lib/server/rbac'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')
	return {
		isSuperAdmin: canAny(user.roles, 'ADMINISTER_SYSTEM'),
		// The Roles page opens for the role-changer (#132) and the account-status admin, so the card
		// evaluates that same OR rather than piggybacking on ADMINISTER_SYSTEM. A no-op while
		// MANAGE_USER_ROLES is CEO-only, but widening it can no longer leave the card behind (#237).
		//
		// #258: both legs read the full role set, matching `settings/roles`'s own `canManageActive`
		// guard — the card and the page it opens must agree or one 403s the other's callers.
		canRoles: canAny(user.roles, 'MANAGE_USER_ROLES') || canAny(user.roles, 'ADMINISTER_SYSTEM'),
		// Review Schedule is ADMINISTER_HR_ORGWIDE, strictly narrower than the MANAGE_HR guard on
		// this page: MANAGE_HR includes MANAGER (#133), that capability does not. Gating the card
		// on anything wider would show MANAGER a link that 403s (#178).
		canHrOrgwide: canAny(user.roles, 'ADMINISTER_HR_ORGWIDE'),
		// Statutory Rates page is reachable by editors (CEO/Super Admin) and proposers (HR Admin).
		canStatutory:
			canAny(user.roles, 'MANAGE_STATUTORY_RATES') || canAny(user.roles, 'PROPOSE_STATUTORY_RATES')
	}
}

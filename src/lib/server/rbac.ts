import { error } from '@sveltejs/kit'
import type { Role } from '@prisma/client'
import { canAny, type Capability } from '$lib/rbac'
import { isFoodServiceOrg } from '$lib/orgs'

// The capability table itself lives in $lib/rbac so the sidebar can ask the same
// questions the server enforces. This module is the enforcement half: every helper
// here throws 403 rather than returning a boolean.
export { CAPABILITIES, can, canAny, type Capability } from '$lib/rbac'

/**
 * Branches exist only for the food-service tenants (JoJo Potato / Sweetleaf). The nav hides
 * the tab for everyone else, but that is cosmetic — this is the enforcement, and every
 * /branches load and action must call it.
 *
 * 404 rather than the usual 403: for a non-food-service tenant the feature genuinely does
 * not exist, and that is not a permission the user could be granted.
 */
export function requireFoodServiceOrg(organizationId: string): void {
	if (!isFoodServiceOrg(organizationId)) error(404, 'Not found')
}

/** Multi-role guard (#133): passes if ANY of the user's roles holds the capability. */
export function requireAnyCapability(userRoles: Role[], capability: Capability): void {
	if (!canAny(userRoles, capability)) error(403, 'Insufficient permissions')
}

// ─── Payroll capabilities ─────────────────────────────────────────────────────
// Payroll access does not follow the HR ladder: a Payroll Officer runs payroll
// without full HR access, and Finance can read payroll reports only. These remain
// as named helpers because they read better at call sites than canAny(roles, '…').

export function requirePayrollManage(roles: Role[]): void {
	requireAnyCapability(roles, 'MANAGE_PAYROLL')
}

export function requirePayrollReports(roles: Role[]): void {
	requireAnyCapability(roles, 'VIEW_PAYROLL_REPORTS')
}

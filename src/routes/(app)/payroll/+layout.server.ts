import { error } from '@sveltejs/kit'
import { canAny } from '$lib/rbac'
import { loadCalculatorData } from '$lib/server/services/payroll/calculator'
import type { LayoutServerLoad } from './$types'

// The calculator roster + recurring prefills power the floating calculator panel (#72)
// on payroll pages. Payroll managers get it; the maker-checker sign-off roles
// (Verifier/Approver) reach payroll only to review a run's numbers on /payroll/[id]
// (#134), so they pass this gate but receive an empty panel — the roster carries
// compensation and isn't theirs to see. The list + periods pages keep their own
// requirePayrollManage guards, so sign-off roles can't browse those.
export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user!
	const roles = user.roles
	const canManage = canAny(roles, 'MANAGE_PAYROLL')
	// Payroll sign-off is finance: Verifier verifies, CEO / Super Admin approve (#174).
	const canSignOff = canAny(roles, 'VERIFY_REQUESTS') || canAny(roles, 'APPROVE_FINANCE')
	if (!canManage && !canSignOff) error(403, 'Insufficient permissions')

	// #275: the roster is scoped inside `loadCalculatorData` to the caller's visible PAY roster —
	// `canManage` says what they may do, never whose compensation they may see.
	return canManage ? await loadCalculatorData(user) : { employees: [], recurringDefaults: {} }
}

import { canAny, requireAnyCapability } from '$lib/server/rbac'
import { assignmentActions } from '$lib/server/employee-detail/assignments'
import { profileActions } from '$lib/server/employee-detail/profile'
import { compensationActions } from '$lib/server/employee-detail/compensation'
import { payItemActions } from '$lib/server/employee-detail/pay-items'
import { emergencyContactActions } from '$lib/server/employee-detail/emergency-contacts'
import { documentActions } from '$lib/server/employee-detail/documents'
import { onboardingActions } from '$lib/server/employee-detail/onboarding'
import { assertCanTouchEmployee } from '$lib/server/services/employee-access'
import { getEmployee, getEmploymentHistory } from '$lib/server/services/employees'
import { listPositions } from '$lib/server/services/settings/org'
import { getLeaveBalances } from '$lib/server/services/leave'
import { listEnrollmentsForEmployee } from '$lib/server/services/benefits'
import { getEmployeeOnboarding } from '$lib/server/services/onboarding'
import { listAssignableBranches, selectableBranches } from '$lib/server/services/branches'
import { isFoodServiceOrg } from '$lib/orgs'
import { listLoans, listCashAdvances } from '$lib/server/services/payroll/loans'
import { listEmployeeEarnings } from '$lib/server/services/payroll/employee-earnings'
import { listEmployeeDeductions } from '$lib/server/services/payroll/employee-deductions'
import { listStatutoryRows } from '$lib/server/services/payroll/employee-statutory'
import { listSchedules } from '$lib/server/services/attendance/schedules'
import { listEmployeeDocuments } from '$lib/server/services/documents'
import { listAdditionalSupervisors } from '$lib/server/services/supervisors'
import { db } from '$lib/server/db'
import { listTemplates } from '$lib/server/services/performance-templates'
import type { Actions, PageServerLoad } from './$types'

// Onboarding checklist (T178 / FR-071, now HR-configurable per org — #116): the derived
// steps come straight from the employee's own record so completing the 201 file *is*
// completing onboarding, and HR can add manual steps (orientation, equipment, …). The
// merge + per-org config lives in $lib/server/services/onboarding.

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAnyCapability(locals.user!.roles, 'VIEW_TEAM')

	const canManage = canAny(locals.user!.roles, 'MANAGE_HR')

	const employee = await getEmployee(params.id, locals.user!.organizationId, {
		viewerRoles: locals.user!.roles
	})

	// Object-level access control (#228): a MANAGER may only open a 201 file for their own team or
	// a branch they manage; HR/CEO/Super-Admin are unrestricted. This used to be gated on
	// `!canManage`, which was never true — MANAGER holds MANAGE_HR, so the check never ran.
	// (Field-level masking of salary/government IDs/bank details is handled inside getEmployee.)
	await assertCanTouchEmployee(locals.user!, employee.id)

	const [
		departments,
		loans,
		cashAdvances,
		recurringEarnings,
		recurringDeductions,
		deductionTypes,
		statutoryConfig,
		documents,
		positions,
		history,
		leaveBalances,
		benefits
	] = await Promise.all([
		db.department.findMany({
			where: { organizationId: locals.user!.organizationId },
			orderBy: { name: 'asc' }
		}),
		canManage ? listLoans(params.id, locals.user!.organizationId) : Promise.resolve([]),
		canManage ? listCashAdvances(params.id, locals.user!.organizationId) : Promise.resolve([]),
		canManage ? listEmployeeEarnings(params.id) : Promise.resolve([]),
		canManage ? listEmployeeDeductions(params.id) : Promise.resolve([]),
		// Assignable codes for the recurring-deduction form — statutory are computed automatically.
		canManage
			? db.deductionType.findMany({
					where: {
						organizationId: locals.user!.organizationId,
						isActive: true,
						isStatutory: false
					},
					select: { id: true, code: true, label: true },
					orderBy: { code: 'asc' }
				})
			: Promise.resolve([]),
		// Per-employee statutory enrollment (#173): the three contributions with their exempt
		// flag and current monthly EE amount, for the Recurring Deductions panel.
		canManage ? listStatutoryRows(params.id, locals.user!.organizationId) : Promise.resolve([]),
		canManage ? listEmployeeDocuments(params.id, locals.user!.organizationId) : Promise.resolve([]),
		canManage ? listPositions(locals.user!.organizationId) : Promise.resolve([]),
		canManage ? getEmploymentHistory(params.id, locals.user!.organizationId) : Promise.resolve([]),
		// Per-employee leave ledger (#137). A manager viewing a direct report sees it too —
		// it carries no pay or government-ID data, and "how much leave do they have left" is
		// exactly what a manager approving leave needs.
		getLeaveBalances(params.id, new Date().getFullYear()),
		// Benefits enrollments on the 201 file (#198). Carries no pay/government-ID data, so a
		// manager viewing a direct report sees them like the leave ledger above.
		listEnrollmentsForEmployee(params.id)
	])
	const schedules = canManage ? await listSchedules(locals.user!.organizationId) : []
	// Branches only exist for the food-service tenants; elsewhere the picker is not rendered.
	const showBranches = canManage && isFoodServiceOrg(locals.user!.organizationId)
	const branches = showBranches
		? selectableBranches(
				await listAssignableBranches(locals.user!.organizationId),
				employee.branchId
			)
		: []
	const onboarding = canManage
		? await getEmployeeOnboarding(
				locals.user!.organizationId,
				employee,
				documents.map((d) => d.category)
			)
		: null

	// #111: every sensitive field (gov IDs, salary, disbursement) leaves the server masked —
	// full values are only obtainable through the audited ?/reveal action below.
	const canReveal = canAny(locals.user!.roles, 'MANAGE_HR')

	// Additional supervisors (#176) — shown to everyone, editable by HR. The picker offers
	// every other active employee in the org (minus the primary manager, handled server-side).
	const additionalSupervisors = await listAdditionalSupervisors(params.id)
	const supervisorOptions = canManage
		? await db.employee.findMany({
				where: {
					organizationId: locals.user!.organizationId,
					employmentStatus: 'ACTIVE',
					id: { not: params.id }
				},
				select: { id: true, firstName: true, lastName: true },
				orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
			})
		: []

	// #178 item 84 — the evaluation-template picker. `ADMINISTER_HR_ORGWIDE`, not `canManage`:
	// MANAGE_HR holds MANAGER, and assigning a template is an org-wide HR decision (plan §6).
	// SPEC AC2: this explicit assignment is the ONLY source of an employee's template — nothing
	// here or anywhere else may infer one from department, position or role.
	const canAssignTemplate = canAny(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
	const performanceTemplates = canAssignTemplate
		? (await listTemplates(locals.user!.organizationId))
				.filter((t) => t.isActive || t.id === employee.assignedTemplateId)
				.map((t) => ({ id: t.id, name: t.isActive ? t.name : `${t.name} (inactive)` }))
		: []

	return {
		additionalSupervisors,
		supervisorOptions,
		canAssignTemplate,
		performanceTemplates,
		assignedTemplateId: employee.assignedTemplateId,
		// Masked by getEmployee (#111) — the full values arrive only via the audited ?/reveal action.
		employee,
		canReveal,
		departments,
		canManage,
		loans,
		cashAdvances,
		recurringEarnings,
		recurringDeductions,
		deductionTypes,
		statutoryConfig,
		schedules,
		branches,
		showBranches,
		documents,
		positions,
		history,
		onboarding,
		leaveBalances: leaveBalances.map((b) => ({
			id: b.id,
			name: b.leaveType.name,
			minMonthsOfService: b.leaveType.minMonthsOfService,
			allocated: Number(b.allocated),
			used: Number(b.used),
			remaining: Number(b.remaining)
		})),
		benefits: benefits.map((b) => ({
			id: b.id,
			status: b.status,
			coverageLevel: b.coverageLevel,
			plan: {
				name: b.plan.name,
				type: b.plan.type,
				employeeCost: b.plan.employeeCost != null ? Number(b.plan.employeeCost) : null
			}
		}))
	}
}

/**
 * #228: apply the object-level check to EVERY action on this page in one place. Each action here
 * acts on the 201 file identified by `params.id`, so the guard is uniform — and doing it here rather
 * than per-action means an action added later is scoped by default instead of by remembering. The
 * role gate inside each action still runs; this only answers "may this actor touch THIS employee".
 */
function scopedToEmployee(actions: Actions): Actions {
	return Object.fromEntries(
		Object.entries(actions).map(([name, handler]) => [
			name,
			async (event: Parameters<NonNullable<Actions[string]>>[0]) => {
				await assertCanTouchEmployee(event.locals.user!, event.params.id)
				return handler!(event)
			}
		])
	)
}

export const actions: Actions = scopedToEmployee({
	...assignmentActions,
	...profileActions,
	...compensationActions,
	...payItemActions,
	...emergencyContactActions,
	...documentActions,
	...onboardingActions
})

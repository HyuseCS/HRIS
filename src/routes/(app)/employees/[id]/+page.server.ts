import { fail, isHttpError } from '@sveltejs/kit'
import { canAny, requireAnyCapability } from '$lib/server/rbac'
import { failFromError } from '$lib/server/form-fail'
import { assertCanTouchEmployee } from '$lib/server/services/employee-access'
import {
	getEmployee,
	updateEmployee,
	offboardEmployee,
	revealEmployeeSensitive,
	getEmploymentHistory,
	recordCompensationChange,
	promoteEmployee
} from '$lib/server/services/employees'
import { listPositions } from '$lib/server/services/settings/org'
import { getLeaveBalances } from '$lib/server/services/leave'
import { listEnrollmentsForEmployee } from '$lib/server/services/benefits'
import { getEmployeeOnboarding, setManualCompletion } from '$lib/server/services/onboarding'
import { listAssignableBranches, selectableBranches } from '$lib/server/services/branches'
import { isFoodServiceOrg } from '$lib/orgs'
import { govIdSchema } from '$lib/utils/gov-ids'
import { LOAN_TYPES } from '$lib/utils/loan-types'
import { EMPLOYMENT_TYPES } from '$lib/utils/employment-type'
import {
	listLoans,
	listCashAdvances,
	createLoan,
	createCashAdvance
} from '$lib/server/services/payroll/loans'
import {
	listEmployeeEarnings,
	createEmployeeEarning,
	endEmployeeEarning
} from '$lib/server/services/payroll/employee-earnings'
import {
	listEmployeeDeductions,
	createEmployeeDeduction,
	endEmployeeDeduction
} from '$lib/server/services/payroll/employee-deductions'
import {
	listStatutoryRows,
	setStatutoryExemption,
	setEmployerShareExternal,
	setStatutoryAllocation
} from '$lib/server/services/payroll/employee-statutory'
import { listSchedules } from '$lib/server/services/attendance/schedules'
import {
	listEmployeeDocuments,
	saveEmployeeDocument,
	deleteEmployeeDocument
} from '$lib/server/services/documents'
import { addEmergencyContact, deleteEmergencyContact } from '$lib/server/services/emergencyContacts'
import {
	listAdditionalSupervisors,
	setAdditionalSupervisors
} from '$lib/server/services/supervisors'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { listTemplates } from '$lib/server/services/performance-templates'
import { assignTemplateSchema } from '$lib/server/performance/schemas'
import { z } from 'zod'
import type { Actions, PageServerLoad } from './$types'

const DOC_CATEGORIES = [
	'CONTRACT',
	'GOVERNMENT_ID',
	'RESUME',
	'PAYROLL_FORM',
	'EXIT_DOCUMENT',
	'OTHER'
] as const

function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		// #247: `proposeIfRequired` decides whether a pay change is written directly or filed for
		// confirmation from the FULL role set — the primary role alone scoped a [MANAGER, HR_ADMIN]
		// user down to MANAGER and routed a change they may make straight through the queue.
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}

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

const loanSchema = z.object({
	type: z.enum(LOAN_TYPES),
	principal: z.coerce.number().positive(),
	installment: z.coerce.number().positive()
})
const cashAdvanceSchema = z.object({
	amount: z.coerce.number().positive(),
	installment: z.coerce.number().positive()
})
const earningSchema = z.object({
	kind: z.enum(['ALLOWANCE', 'INCENTIVE']),
	label: z.string().min(1).max(100),
	monthlyAmount: z.coerce.number().positive()
})
const deductionSchema = z.object({
	deductionTypeId: z.string().min(1),
	label: z.string().max(100).optional(),
	monthlyAmount: z.coerce.number().positive()
})
const statutoryToggleSchema = z.object({
	contribution: z.enum(['SSS', 'PHILHEALTH', 'PAGIBIG']),
	exempt: z.enum(['true', 'false']).transform((v) => v === 'true')
})
const employerShareExternalToggleSchema = z.object({
	contribution: z.enum(['SSS', 'PHILHEALTH', 'PAGIBIG']),
	external: z.enum(['true', 'false']).transform((v) => v === 'true')
})
const statutoryAllocationSchema = z.object({
	contribution: z.enum(['SSS', 'PHILHEALTH', 'PAGIBIG']),
	allocation: z.enum(['EVEN', 'FIRST', 'SECOND'])
})

const updateSchema = z.object({
	jobTitle: z.string().min(1).optional(),
	departmentId: z.string().optional(),
	contactPhone: z.string().optional(),
	contactAddress: z.string().optional(),
	// Company email (#186) — HR sets the real address once provisioned. Empty clears it.
	companyEmail: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	// #170: salary/rateType are NOT editable here — the quick-edit form must not write pay onto the
	// Employee row (payroll now reads period-end salary from EmployeeCompensation history, so a bare
	// write would be silently ignored). Pay changes go through the dated `?/changeCompensation` path.
	// Empty string clears the link; a value sets it (unique per employee).
	discordId: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	workScheduleId: z
		.string()
		.optional()
		.transform((v) => (v ? v : null)),
	// Store assignment. Empty string clears it. Only accepted for food-service tenants —
	// the update action strips it elsewhere.
	branchId: z
		.string()
		.optional()
		.transform((v) => (v ? v : null)),
	// Emergency contact (personal — visible to the employee's managers).
	emergencyContactName: z.string().optional(),
	emergencyContactRelation: z.string().optional(),
	emergencyContactPhone: z.string().optional(),
	// Position from the catalog. Empty string clears the assignment.
	positionId: z
		.string()
		.optional()
		.transform((v) => (v ? v : null)),
	// Government / statutory IDs (payroll registration). #111 renders these masked, so the form
	// never prefills them: an empty field means "unchanged", any value typed is new and is
	// format-checked here — exactly the bank/GCash model below.
	sssNumber: govIdSchema('sssNumber'),
	philhealthNumber: govIdSchema('philhealthNumber'),
	pagibigNumber: govIdSchema('pagibigNumber'),
	tinNumber: govIdSchema('tinNumber'),
	// Disbursement details (sensitive, HR-only). Empty string clears the field.
	bankName: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	bankAccountName: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	// #54 leaves these blank in the form, so empty means "unchanged"; any value typed is new
	// and therefore always format-checked (#191).
	bankAccountNumber: govIdSchema('bankAccountNumber'),
	gcashNumber: govIdSchema('gcashNumber')
})

// #170: an effective-dated salary / pay-type change. Salary is masked (reveal-to-edit), so an empty
// field means "unchanged", not 0 — same preprocess as the update form. At least one of salary /
// rateType must actually be supplied; the service enforces the date bounds and the rate/type pairing.
const changeCompensationSchema = z
	.object({
		basicMonthlySalary: z.preprocess(
			(v) => (v === '' ? undefined : v),
			z.coerce.number().positive().optional()
		),
		rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
		effectiveDate: z.coerce.date(),
		note: z
			.string()
			.trim()
			.max(500)
			.optional()
			.transform((v) => (v ? v : undefined))
	})
	.refine((d) => d.basicMonthlySalary !== undefined || d.rateType !== undefined, {
		message: 'Enter a new salary or pay type.'
	})

// #222: a promotion — one atomic career event. Every field is optional (the service requires at
// least one real change); an empty positionId/jobTitle means "not part of this promotion", never
// "clear it", so the promote form can never blank a field the HR user did not touch. Salary is
// masked (reveal-to-edit), so an empty amount means unchanged — the same preprocess as above.
const promoteSchema = z.object({
	effectiveDate: z.coerce.date(),
	positionId: z
		.string()
		.optional()
		.transform((v) => (v ? v : undefined)),
	jobTitle: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : undefined)),
	reportsToId: z
		.string()
		.optional()
		.transform((v) => (v ? v : undefined)),
	employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
	basicMonthlySalary: z.preprocess(
		(v) => (v === '' ? undefined : v),
		z.coerce.number().positive().optional()
	),
	rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
	note: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : undefined))
})

const emergencyContactSchema = z.object({
	name: z.string().trim().min(1),
	relationship: z.string().trim().min(1),
	phone: z.string().trim().min(1)
})

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
	// Set the employee's additional supervisors (#176). HR-only.
	setSupervisors: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const ids = (await request.formData()).getAll('supervisorIds').map(String).filter(Boolean)
		try {
			await setAdditionalSupervisors(
				locals.user!.organizationId,
				params.id, // the 201 file's subject
				ids,
				ctxOf(locals, getClientAddress())
			)
		} catch (e) {
			return failFromError(e)
		}
		return { success: true }
	},

	update: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!

		const raw = Object.fromEntries(await request.formData())
		const parsed = updateSchema.safeParse(raw)
		if (!parsed.success) {
			// Surface the field messages (the disbursement formats validate in the schema);
			// fall back to the generic text when zod produced none.
			const messages = parsed.error.errors.map((e) => e.message).filter(Boolean)
			return fail(400, { error: messages.length ? messages.join(' · ') : 'Invalid input' })
		}

		// #111: the government IDs and disbursement numbers render masked and are never prefilled,
		// so an empty submission means "leave unchanged", not "clear" — spread each only when the
		// form actually carried a value. A malformed ID stored before validation existed is simply
		// not re-submitted, so it never blocks an unrelated edit (a phone number, an address).
		// Explicit clearing is deferred until a dedicated clear affordance exists.
		const {
			sssNumber,
			philhealthNumber,
			pagibigNumber,
			tinNumber,
			bankAccountNumber,
			gcashNumber,
			branchId,
			...rest
		} = parsed.data
		const input = {
			...rest,
			...(sssNumber !== null && { sssNumber }),
			...(philhealthNumber !== null && { philhealthNumber }),
			...(pagibigNumber !== null && { pagibigNumber }),
			...(tinNumber !== null && { tinNumber }),
			...(bankAccountNumber !== null && { bankAccountNumber }),
			...(gcashNumber !== null && { gcashNumber }),
			// Branches only exist for the food-service tenants; ignore a posted branchId
			// anywhere else. updateEmployee still re-checks the branch is in this org.
			...(isFoodServiceOrg(user.organizationId) && { branchId })
		}

		try {
			await updateEmployee(params.id, user.organizationId, input, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			// Unique constraint on Employee.discordId
			if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
				return fail(409, { error: 'That Discord ID is already linked to another employee.' })
			}
			throw e
		}

		return { success: true }
	},

	/**
	 * #178 item 82 — HR assigns an evaluation template to this employee.
	 *
	 * SPEC AC2: an employee's template is THIS field and nothing else. No code path may infer a
	 * template from department, position or role — a guess that looks done and is wrong is worse
	 * than a visible unassigned employee (plan §10.1).
	 *
	 * Guard order is deliberate: capability, then whose-record, then shape.
	 *   1. `ADMINISTER_HR_ORGWIDE` — NOT `MANAGE_HR`, which holds MANAGER (#133).
	 *   2. `assertCanTouchEmployee` — capabilities say WHAT, never WHOSE. `ADMINISTER_HR_ORGWIDE`
	 *      alone does not prove this employee is in the actor's organization. `scopedToEmployee`
	 *      already runs this for every action here; it is repeated as a literal line so the action
	 *      is correct read on its own (#290's VALIDATE round was lost to reading a handler body
	 *      instead of the guard).
	 *   3. only then read and parse the form body.
	 */
	assignTemplate: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
		await assertCanTouchEmployee(locals.user!, params.id)

		const action = 'assignTemplate'
		const organizationId = locals.user!.organizationId
		const parsed = assignTemplateSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid input' })
		const { assignedTemplateId } = parsed.data

		// Trust boundary: the posted id is client input. It must name a template in THIS org, or a
		// crafted post assigns another tenant's form. Org-scoped on the model's own
		// `organizationId` column, never through a relation join (#323).
		if (assignedTemplateId) {
			const template = await db.performanceTemplate.findFirst({
				where: { id: assignedTemplateId, organizationId },
				select: { id: true }
			})
			if (!template) return fail(400, { action, error: 'That template is not available here.' })
		}

		const ctx = ctxOf(locals, getClientAddress())
		// The org filter is on the WRITE, not only on the guard: `canTouchEmployee` short-circuits
		// to true for `ADMINISTER_HR_ORGWIDE` without ever looking at the org.
		// #324: the audit row is written with `tx`, so it commits or rolls back with the update.
		const count = await db.$transaction(async (tx) => {
			const { count } = await tx.employee.updateMany({
				where: { id: params.id, organizationId },
				data: { assignedTemplateId }
			})
			if (count === 1)
				await writeAuditLog(
					ctx,
					{
						action: 'UPDATE',
						entityType: 'Employee',
						entityId: params.id,
						newValue: { assignedTemplateId }
					},
					tx
				)
			return count
		})
		if (count !== 1) return fail(404, { action, error: 'Employee not found' })

		return { action, success: true }
	},

	// #170: record an effective-dated salary / pay-type change. Gated on MANAGE_HR, which a MANAGER
	// holds — the control that stops a MANAGER moving pay directly is `proposeIfRequired`
	// (`$lib/server/services/employees.ts`), which routes their change through propose→confirm (#243).
	// The service inserts the snapshot, re-derives the current cache and audits atomically; a
	// backdate into an approved run comes back as a notice.
	changeCompensation: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		// Discriminator: this form shares the page's single `form` prop with every other action, so its
		// message block gates on `form.action` to ignore a sibling form's success/error.
		const action = 'changeCompensation'
		const parsed = changeCompensationSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) {
			const messages = parsed.error.errors.map((e) => e.message).filter(Boolean)
			return fail(400, { action, error: messages.length ? messages.join(' · ') : 'Invalid input' })
		}
		try {
			const { notice } = await recordCompensationChange(
				params.id,
				locals.user!.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
			return { action, success: true, notice }
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
	},

	// #222: promote — position, title, reporting line, employment type and pay as ONE audited event.
	// Same MANAGE_HR gate as changeCompensation, and the same real control: a MANAGER reaches the
	// action but `proposeIfRequired` (#243) turns their pay move into a proposal rather than a write.
	promote: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const action = 'promote'
		const parsed = promoteSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) {
			const messages = parsed.error.errors.map((e) => e.message).filter(Boolean)
			return fail(400, { action, error: messages.length ? messages.join(' · ') : 'Invalid input' })
		}
		try {
			const { notice } = await promoteEmployee(
				params.id,
				locals.user!.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
			return { action, success: true, notice }
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
	},

	// #111: audited reveal of every masked sensitive field (gov IDs, salary, disbursement). The
	// role check runs server-side — the UI button is cosmetic gating only (Constitution P2).
	reveal: async ({ locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		// A self-reveal (an HR user opening their own 201 file) is exempt from the audit log —
		// own data, decision #2. Same identity comparison as load's object-level access check.
		// #6: the ACTIVE org, not the home tenant. Null here means `isSelf` is false and the
		// reveal IS audited — the safe direction for a lookup that only suppresses the audit row.
		const self = await db.employee.findFirst({
			where: { userId: locals.user!.id, organizationId: locals.user!.organizationId },
			select: { id: true }
		})
		const isSelf = self?.id === params.id
		const revealed = await revealEmployeeSensitive(
			params.id,
			locals.user!.organizationId,
			ctxOf(locals, getClientAddress()),
			{ audit: !isSelf }
		)
		// #290: the Employment History panel masks its salary figures the same way, and is
		// released by this same reveal — deliberately with NO second audit write. The single VIEW
		// row above covers both surfaces; a second one would be byte-identical and tell an
		// auditor nothing.
		const history = await getEmploymentHistory(params.id, locals.user!.organizationId, {
			unmask: true
		})
		return { revealed, history }
	},

	offboard: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!

		const data = await request.formData()
		const endDate = new Date(data.get('endDate') as string)

		try {
			await offboardEmployee(params.id, user.organizationId, endDate, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e) {
			return failFromError(e)
		}
	},

	// ponytail: only the two loan actions were folded into ctxOf — the rest of the inline ctx
	// literals in this file are audit-only, and converting them would be churn.
	addLoan: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = loanSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid loan details' })
		try {
			await createLoan(
				params.id,
				user.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
		} catch (e) {
			return failFromError(e)
		}
		return { success: true }
	},

	addCashAdvance: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = cashAdvanceSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid cash-advance details' })
		try {
			await createCashAdvance(
				params.id,
				user.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
		} catch (e) {
			return failFromError(e)
		}
		return { success: true }
	},

	addEarning: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = earningSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid recurring earning details' })
		try {
			await createEmployeeEarning(params.id, user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e) {
			return failFromError(e)
		}
		return { success: true }
	},

	endEarning: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing earning id' })
		try {
			await endEmployeeEarning(id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	addDeduction: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = deductionSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid recurring deduction details' })
		try {
			await createEmployeeDeduction(params.id, user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	endDeduction: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing deduction id' })
		try {
			await endEmployeeDeduction(id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	// Exempt/restore an individual employee from a statutory contribution (#173). HR-only, audited.
	toggleStatutoryExemption: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = statutoryToggleSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid statutory toggle' })
		try {
			await setStatutoryExemption(
				params.id,
				locals.user!.organizationId,
				parsed.data.contribution,
				parsed.data.exempt,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	// Toggle "employer share paid externally" for one contribution (#173, Feature C). Zeroes the ER
	// share only; the EE share is still deducted. HR-only, audited.
	toggleEmployerShareExternal: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = employerShareExternalToggleSchema.safeParse(
			Object.fromEntries(await request.formData())
		)
		if (!parsed.success) return fail(400, { error: 'Invalid statutory toggle' })
		try {
			await setEmployerShareExternal(
				params.id,
				locals.user!.organizationId,
				parsed.data.contribution,
				parsed.data.external,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	// Set which semi-monthly cutoff the EE share is deducted on (#173, Feature E). HR-only, audited.
	setStatutoryAllocation: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = statutoryAllocationSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid statutory allocation' })
		try {
			await setStatutoryAllocation(
				params.id,
				locals.user!.organizationId,
				parsed.data.contribution,
				parsed.data.allocation,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	addEmergencyContact: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = emergencyContactSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { error: 'Name, relationship, and phone are required.' })
		try {
			await addEmergencyContact(
				params.id,
				locals.user!.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	deleteEmergencyContact: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const contactId = (await request.formData()).get('contactId') as string
		if (!contactId) return fail(400, { error: 'Missing contact id.' })
		try {
			await deleteEmergencyContact(
				contactId,
				locals.user!.organizationId,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	uploadDocument: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')

		const data = await request.formData()
		const file = data.get('file')
		const categoryRaw = data.get('category') as string
		const label = (data.get('label') as string) || ''

		if (!(file instanceof File) || file.size === 0)
			return fail(400, { error: 'Please choose a file to upload.' })
		const category = DOC_CATEGORIES.includes(categoryRaw as never)
			? (categoryRaw as (typeof DOC_CATEGORIES)[number])
			: 'OTHER'
		const bytes = Buffer.from(await file.arrayBuffer())

		try {
			await saveEmployeeDocument(
				params.id,
				locals.user!.organizationId,
				{ category, label, fileName: file.name, mimeType: file.type, bytes },
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	deleteDocument: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const docId = (await request.formData()).get('docId') as string
		if (!docId) return fail(400, { error: 'Missing document id.' })
		try {
			await deleteEmployeeDocument(
				docId,
				locals.user!.organizationId,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	// Tick a MANUAL onboarding step on/off for this employee (#116). Derived steps are
	// read-only — they check themselves off from the record — so only manual items post here.
	toggleOnboardingStep: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = await request.formData()
		const itemId = data.get('itemId') as string
		if (!itemId) return fail(400, { error: 'Missing item id.' })
		const done = data.get('done') === 'true'
		try {
			await setManualCompletion(
				locals.user!.organizationId,
				itemId,
				params.id,
				done,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	}
})

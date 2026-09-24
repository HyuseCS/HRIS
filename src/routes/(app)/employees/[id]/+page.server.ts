import { fail, isHttpError } from '@sveltejs/kit'
import { canAny, requireAnyCapability } from '$lib/server/rbac'
import { failFromError } from '$lib/server/form-fail'
import { ctxOf } from '$lib/server/employee-detail/shared'
import { assignmentActions } from '$lib/server/employee-detail/assignments'
import { profileActions } from '$lib/server/employee-detail/profile'
import { emergencyContactActions } from '$lib/server/employee-detail/emergency-contacts'
import { onboardingActions } from '$lib/server/employee-detail/onboarding'
import { assertCanTouchEmployee } from '$lib/server/services/employee-access'
import {
	getEmployee,
	offboardEmployee,
	getEmploymentHistory,
	recordCompensationChange,
	promoteEmployee
} from '$lib/server/services/employees'
import { listPositions } from '$lib/server/services/settings/org'
import { getLeaveBalances } from '$lib/server/services/leave'
import { listEnrollmentsForEmployee } from '$lib/server/services/benefits'
import { getEmployeeOnboarding } from '$lib/server/services/onboarding'
import { listAssignableBranches, selectableBranches } from '$lib/server/services/branches'
import { isFoodServiceOrg } from '$lib/orgs'
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
import { listAdditionalSupervisors } from '$lib/server/services/supervisors'
import { db } from '$lib/server/db'
import { listTemplates } from '$lib/server/services/performance-templates'
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
	...emergencyContactActions,
	...onboardingActions,
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

	offboard: async ({ request, locals, params, getClientAddress }) => {
		const action = 'offboard'
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
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
		return { action, saved: 'Employee offboarded.' }
	},

	// ponytail: only the two loan actions were folded into ctxOf — the rest of the inline ctx
	// literals in this file are audit-only, and converting them would be churn.
	addLoan: async ({ request, locals, params, getClientAddress }) => {
		const action = 'addLoan'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = loanSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid loan details' })
		try {
			await createLoan(
				params.id,
				user.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
		return { action, success: true }
	},

	addCashAdvance: async ({ request, locals, params, getClientAddress }) => {
		const action = 'addCashAdvance'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = cashAdvanceSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid cash-advance details' })
		try {
			await createCashAdvance(
				params.id,
				user.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
		return { action, success: true }
	},

	addEarning: async ({ request, locals, params, getClientAddress }) => {
		const action = 'addEarning'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = earningSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid recurring earning details' })
		try {
			await createEmployeeEarning(params.id, user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
		return { action, success: true }
	},

	endEarning: async ({ request, locals, getClientAddress }) => {
		const action = 'endEarning'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { action, error: 'Missing earning id' })
		try {
			await endEmployeeEarning(id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	addDeduction: async ({ request, locals, params, getClientAddress }) => {
		const action = 'addDeduction'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = deductionSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid recurring deduction details' })
		try {
			await createEmployeeDeduction(params.id, user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	endDeduction: async ({ request, locals, getClientAddress }) => {
		const action = 'endDeduction'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { action, error: 'Missing deduction id' })
		try {
			await endEmployeeDeduction(id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	// Exempt/restore an individual employee from a statutory contribution (#173). HR-only, audited.
	toggleStatutoryExemption: async ({ request, locals, params, getClientAddress }) => {
		const action = 'toggleStatutoryExemption'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = statutoryToggleSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid statutory toggle' })
		try {
			await setStatutoryExemption(
				params.id,
				locals.user!.organizationId,
				parsed.data.contribution,
				parsed.data.exempt,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	// Toggle "employer share paid externally" for one contribution (#173, Feature C). Zeroes the ER
	// share only; the EE share is still deducted. HR-only, audited.
	toggleEmployerShareExternal: async ({ request, locals, params, getClientAddress }) => {
		const action = 'toggleEmployerShareExternal'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = employerShareExternalToggleSchema.safeParse(
			Object.fromEntries(await request.formData())
		)
		if (!parsed.success) return fail(400, { action, error: 'Invalid statutory toggle' })
		try {
			await setEmployerShareExternal(
				params.id,
				locals.user!.organizationId,
				parsed.data.contribution,
				parsed.data.external,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	// Set which semi-monthly cutoff the EE share is deducted on (#173, Feature E). HR-only, audited.
	setStatutoryAllocation: async ({ request, locals, params, getClientAddress }) => {
		const action = 'setStatutoryAllocation'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = statutoryAllocationSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid statutory allocation' })
		try {
			await setStatutoryAllocation(
				params.id,
				locals.user!.organizationId,
				parsed.data.contribution,
				parsed.data.allocation,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	uploadDocument: async ({ request, locals, params, getClientAddress }) => {
		const action = 'uploadDocument'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')

		const data = await request.formData()
		const file = data.get('file')
		const categoryRaw = data.get('category') as string
		const label = (data.get('label') as string) || ''

		if (!(file instanceof File) || file.size === 0)
			return fail(400, { action, error: 'Please choose a file to upload.' })
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
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	deleteDocument: async ({ request, locals, getClientAddress }) => {
		const action = 'deleteDocument'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const docId = (await request.formData()).get('docId') as string
		if (!docId) return fail(400, { action, error: 'Missing document id.' })
		try {
			await deleteEmployeeDocument(
				docId,
				locals.user!.organizationId,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	}
})

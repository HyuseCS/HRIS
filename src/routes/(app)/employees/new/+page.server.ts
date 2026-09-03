import { fail, redirect } from '@sveltejs/kit'
import { z } from 'zod'
import { db } from '$lib/server/db'
import { HIRE_ROLES } from '$lib/rbac'
import { requireAnyCapability } from '$lib/server/rbac'
import { createEmployee } from '$lib/server/services/employees'
import { sendWelcomeEmail } from '$lib/server/notifications'
import { setFlash } from '$lib/server/flash'
import { govIdSchema } from '$lib/utils/gov-ids'
import { isRateBasisAllowed, RATE_BASIS_MISMATCH } from '$lib/utils/rate-basis'
import type { Actions, PageServerLoad } from './$types'

function generateTempPassword(): string {
	const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
	let result = ''
	for (let i = 0; i < 8; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

export const load: PageServerLoad = async ({ locals }) => {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')

	const orgId = locals.user!.organizationId
	const [departments, employees, positions, workSchedules] = await Promise.all([
		db.department.findMany({
			where: { organizationId: orgId },
			orderBy: { name: 'asc' }
		}),
		db.employee.findMany({
			where: {
				organizationId: orgId,
				employmentStatus: 'ACTIVE'
			},
			select: { id: true, firstName: true, lastName: true, employeeNumber: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		}),
		db.position.findMany({
			where: { organizationId: orgId, isActive: true },
			select: { id: true, title: true, departmentId: true },
			orderBy: { title: 'asc' }
		}),
		db.workSchedule.findMany({
			where: { organizationId: orgId },
			select: { id: true, name: true, isDefault: true },
			orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
		})
	])

	// orgId drives a {#key} remount of the form: switching tenants mid-onboard swaps the
	// org-scoped selects (department, reports-to, position, schedule) under the live form,
	// which would silently blank the required Department field and wedge the submit (#ceo-switch).
	return { organizationId: orgId, departments, employees, positions, workSchedules }
}

const createSchema = z
	.object({
		email: z.string().email(),
		password: z
			.string()
			.min(8)
			.optional()
			.or(z.literal('').transform(() => undefined)),
		firstName: z.string().min(1),
		lastName: z.string().min(1),
		middleName: z.string().optional(),
		// #248: deliberately narrower than ASSIGNABLE_ROLES. This form runs under MANAGE_HR, which
		// MANAGER holds, so anything listed here is an account a MANAGER can mint at that authority
		// with no CEO involved. Governance, finance and sign-off roles are granted after hire, in
		// Settings → Roles. See HIRE_ROLES in $lib/rbac.
		role: z.enum(HIRE_ROLES),
		departmentId: z.string().min(1),
		jobTitle: z.string().min(1),
		// New hires start probationary (#136/#188) unless HR picks otherwise; regularization to
		// REGULAR is automatic once 6 months of service have elapsed (scripts/promote-probationary).
		employmentType: z
			.enum(['REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'PART_TIME', 'ON_CALL', 'INTERN'])
			.default('PROBATIONARY'),
		startDate: z.coerce.date(),
		basicMonthlySalary: z.coerce.number().positive(),
		// #120/#189: how the amount above is read — a fixed monthly salary, a per-day rate or a
		// per-hour rate. The hourly/employment-type pairing is checked in the refine below.
		rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).default('MONTHLY'),
		// #191: format-checked and stored canonically. Every value here is new, so unlike the
		// edit form there is nothing legacy to grandfather.
		sssNumber: govIdSchema('sssNumber'),
		philhealthNumber: govIdSchema('philhealthNumber'),
		pagibigNumber: govIdSchema('pagibigNumber'),
		tinNumber: govIdSchema('tinNumber'),
		emergencyContactName: z.string().optional(),
		emergencyContactRelation: z.string().optional(),
		emergencyContactPhone: z.string().optional(),
		bankName: z.string().optional(),
		bankAccountName: z.string().optional(),
		bankAccountNumber: govIdSchema('bankAccountNumber'),
		gcashNumber: govIdSchema('gcashNumber'),
		reportsToId: z
			.string()
			.optional()
			.or(z.literal('').transform(() => undefined)),
		// Work schedule + position are optional at onboarding; empty select → unset (null).
		workScheduleId: z
			.string()
			.optional()
			.or(z.literal('').transform(() => undefined)),
		positionId: z
			.string()
			.optional()
			.or(z.literal('').transform(() => undefined)),
		// Empty string leaves the Discord link unset; a value sets it (unique per employee).
		discordId: z
			.string()
			.trim()
			.optional()
			.transform((v) => (v ? v : null))
	})
	// #189: an hourly rate applies only to part-time and on-call staff. Refined on the whole
	// object because it is a pairing, not a property of either field alone. Reported against
	// rateType so the message lands on the control the user would change.
	.refine((d) => isRateBasisAllowed(d.rateType, d.employmentType), {
		message: RATE_BASIS_MISMATCH,
		path: ['rateType']
	})

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress, cookies }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!

		const raw = Object.fromEntries(await request.formData())
		const parsed = createSchema.safeParse(raw)

		if (!parsed.success) {
			return fail(400, {
				fieldErrors: parsed.error.flatten().fieldErrors,
				values: raw as Record<string, string>
			})
		}

		const tempPassword = parsed.data.password ?? generateTempPassword()

		try {
			const newEmployee = await createEmployee(
				user.organizationId,
				{
					...parsed.data,
					password: tempPassword,
					reportsToId: parsed.data.reportsToId || undefined
				},
				{
					organizationId: user.organizationId,
					actorId: user.id,
					actorRoles: user.roles,
					ipAddress: getClientAddress()
				}
			)

			sendWelcomeEmail(parsed.data.email, tempPassword)

			// The welcome mail goes out silently, so the operator is told about it here — otherwise
			// they have no way to know whether to hand the password over themselves.
			setFlash(cookies, {
				kind: 'success',
				message: `${parsed.data.firstName} ${parsed.data.lastName} was created. A welcome email with sign-in details was sent to ${parsed.data.email}.`
			})
			redirect(303, `/employees/${newEmployee.id}`)
		} catch (e: unknown) {
			const errMsg = e instanceof Error ? e.message : String(e)
			if (errMsg.includes('Email already in use') || errMsg.includes('409')) {
				return fail(409, {
					error: 'An account with this email already exists.',
					values: raw as Record<string, string>
				})
			}
			// Employee has three unique constraints (userId, discordId, and
			// organizationId+employeeNumber), so a bare P2002 says nothing about which one fired.
			// Read meta.target — reporting a number clash as a Discord ID problem sends the user
			// off to edit a field that was never the issue.
			if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
				const target = (e as { meta?: { target?: unknown } }).meta?.target
				const fields = Array.isArray(target) ? (target as string[]) : []
				if (fields.includes('discordId')) {
					return fail(409, {
						error: 'That Discord ID is already linked to another employee.',
						values: raw as Record<string, string>
					})
				}
				if (fields.includes('employeeNumber')) {
					// createEmployee retries a lost race, so reaching here means it lost repeatedly.
					return fail(409, {
						error: 'Could not allocate an employee number just now. Please try again.',
						values: raw as Record<string, string>
					})
				}
			}
			throw e
		}
	}
}

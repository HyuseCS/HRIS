import { fail, isHttpError } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	listBenefitPlans,
	createBenefitPlan,
	listAllEnrollments,
	enrollEmployee,
	updateEnrollmentStatus
} from '$lib/server/services/benefits'
import { db } from '$lib/server/db'
import { z } from 'zod'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const [plans, enrollments, employees] = await Promise.all([
		listBenefitPlans(user.organizationId),
		listAllEnrollments(user.organizationId),
		db.employee.findMany({
			where: { organizationId: user.organizationId, employmentStatus: 'ACTIVE' },
			select: { id: true, firstName: true, lastName: true, employeeNumber: true },
			orderBy: { lastName: 'asc' }
		})
	])

	return { plans, enrollments, employees }
}

function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}

const createPlanSchema = z.object({
	name: z.string().min(1),
	type: z.enum(['HMO', 'INSURANCE', 'RETIREMENT', 'ALLOWANCE', 'LEAVE_CREDIT', 'OTHER']),
	provider: z.string().optional(),
	description: z.string().optional(),
	employeeCost: z.coerce.number().nonnegative().optional(),
	employerCost: z.coerce.number().nonnegative().optional()
})

export const actions: Actions = {
	createPlan: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!

		const raw = Object.fromEntries(await request.formData())
		const parsed = createPlanSchema.safeParse(raw)
		if (!parsed.success) {
			// A string, like every other action here: the page renders `form.error`
			// directly, and the raw fieldErrors object stringifies to "[object Object]".
			const fieldErrors = parsed.error.flatten().fieldErrors
			const message = Object.entries(fieldErrors)
				.map(([field, errs]) => `${field}: ${errs?.join(', ')}`)
				.join('; ')
			return fail(400, { error: message || 'Invalid plan details' })
		}

		await createBenefitPlan(user.organizationId, parsed.data, {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		})
		return { planCreated: true }
	},

	enroll: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = await request.formData()
		const parsed = z
			.object({
				employeeId: z.string().min(1),
				benefitPlanId: z.string().min(1),
				coverageLevel: z.string().optional(),
				effectiveDate: z.coerce.date()
			})
			.safeParse(Object.fromEntries(data))
		if (!parsed.success) return fail(422, { error: 'Invalid enrollment details' })

		try {
			await enrollEmployee(
				parsed.data.employeeId,
				parsed.data.benefitPlanId,
				{
					coverageLevel: parsed.data.coverageLevel,
					effectiveDate: parsed.data.effectiveDate
				},
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { enrolled: true }
	},

	setEnrollmentStatus: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = await request.formData()
		const id = data.get('id') as string
		const status = data.get('status') as 'ACTIVE' | 'WAIVED' | 'TERMINATED'
		if (!id || !['ACTIVE', 'WAIVED', 'TERMINATED'].includes(status))
			return fail(400, {
				error: "That status change is not allowed from the plan's current status."
			})

		try {
			await updateEnrollmentStatus(
				id,
				locals.user!.organizationId,
				status,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { statusChanged: true }
	}
}

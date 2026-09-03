import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	listSalaryGrades,
	listPositionsWithGrades,
	createSalaryGrade,
	toggleSalaryGrade,
	assignPositionGrade
} from '$lib/server/services/settings/master'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')
	const [grades, positions] = await Promise.all([
		listSalaryGrades(user.organizationId),
		listPositionsWithGrades(user.organizationId)
	])
	return { grades, positions }
}

const gradeSchema = z
	.object({
		name: z.string().min(1).max(60),
		minSalary: z.coerce.number().min(0),
		midSalary: z.coerce.number().min(0),
		maxSalary: z.coerce.number().min(0)
	})
	.refine((g) => g.minSalary <= g.midSalary && g.midSalary <= g.maxSalary, {
		message: 'Salary values must satisfy min ≤ mid ≤ max'
	})

function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}

async function run(fn: () => Promise<unknown>) {
	try {
		await fn()
		return { success: true }
	} catch (e: unknown) {
		if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
		throw e
	}
}

export const actions: Actions = {
	addGrade: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = gradeSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(422, { error: 'Invalid grade values' })
		return run(() =>
			createSalaryGrade(locals.user!.organizationId, parsed.data, ctxOf(locals, getClientAddress()))
		)
	},

	toggleGrade: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing id' })
		return run(() =>
			toggleSalaryGrade(locals.user!.organizationId, id, ctxOf(locals, getClientAddress()))
		)
	},

	assignGrade: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = await request.formData()
		const positionId = data.get('positionId') as string
		const gradeId = (data.get('salaryGradeId') as string) || null
		if (!positionId) return fail(400, { error: 'Missing position' })
		return run(() =>
			assignPositionGrade(
				locals.user!.organizationId,
				positionId,
				gradeId,
				ctxOf(locals, getClientAddress())
			)
		)
	}
}

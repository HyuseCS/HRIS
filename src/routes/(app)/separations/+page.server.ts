import { fail, isHttpError, redirect } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { createSeparation, listSeparations } from '$lib/server/services/separation'
import { z } from 'zod'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const [separations, employees] = await Promise.all([
		listSeparations(user.organizationId),
		db.employee.findMany({
			where: {
				organizationId: user.organizationId,
				employmentStatus: { not: 'OFFBOARDED' }
			},
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
			select: { id: true, firstName: true, lastName: true, employeeNumber: true }
		})
	])

	return { separations, employees }
}

const createSchema = z.object({
	employeeId: z.string().min(1),
	type: z.enum(['RESIGNATION', 'TERMINATION']),
	effectiveDate: z.coerce.date(),
	reason: z.string().max(1000).optional()
})

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const raw = Object.fromEntries(await request.formData())
		const parsed = createSchema.safeParse(raw)
		if (!parsed.success) {
			return fail(422, {
				error: 'Please fix the highlighted fields.',
				fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>
			})
		}

		let id: string
		try {
			const record = await createSeparation(user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
			id = record.id
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			if (e instanceof Error) return fail(400, { error: e.message })
			throw e
		}
		redirect(303, `/separations/${id}`)
	}
}

import { fail, isHttpError, redirect } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { createSeparation, listSeparations } from '$lib/server/services/separation'
import { setFlash } from '$lib/server/flash'
import { paginate } from '$lib/server/pagination'
import { z } from 'zod'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const [allSeparations, employees] = await Promise.all([
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

	// Sliced here, not in the query: `listSeparations` is a shared service and giving it
	// skip/take is out of this phase's bounds. This caps what the page RENDERS, not what the
	// load fetches — the query cost is tracked as a backlog item.
	const pagination = paginate(url, allSeparations.length, { pageSize: 20 })
	const separations = allSeparations.slice(pagination.skip, pagination.skip + pagination.take)

	return { separations, employees, pagination }
}

const createSchema = z.object({
	employeeId: z.string().min(1),
	type: z.enum(['RESIGNATION', 'TERMINATION']),
	effectiveDate: z.coerce.date(),
	reason: z.string().max(1000).optional()
})

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress, cookies }) => {
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
			throw e
		}
		setFlash(cookies, { kind: 'success', message: 'Separation record created.' })
		redirect(303, `/separations/${id}`)
	}
}

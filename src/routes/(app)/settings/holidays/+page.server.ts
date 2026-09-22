import { fail } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const holidays = await db.publicHoliday.findMany({
		where: { organizationId: user.organizationId },
		orderBy: { date: 'asc' }
	})

	return { holidays }
}

const holidaySchema = z.object({
	date: z.coerce.date(),
	name: z.string().min(1, 'Holiday name is required'),
	type: z.enum(['REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING'])
})

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const raw = Object.fromEntries(await request.formData())
		const parsed = holidaySchema.safeParse(raw)

		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input. Please check the form fields.',
				fieldErrors: parsed.error.flatten().fieldErrors
			})
		}

		await db.publicHoliday.create({
			data: {
				organizationId: user.organizationId,
				date: parsed.data.date,
				name: parsed.data.name,
				type: parsed.data.type,
				year: parsed.data.date.getFullYear()
			}
		})
	},

	update: async ({ request, locals }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const raw = Object.fromEntries(await request.formData())
		const id = raw.id as string

		if (!id) {
			return fail(400, {
				error: 'That holiday is no longer on screen. Reload the page and try again.'
			})
		}

		const parsed = holidaySchema.safeParse(raw)

		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input. Please check the form fields.',
				fieldErrors: parsed.error.flatten().fieldErrors
			})
		}

		// Verify the holiday belongs to this organization
		const existing = await db.publicHoliday.findFirst({
			where: { id, organizationId: user.organizationId }
		})

		if (!existing) {
			return fail(404, { error: 'Holiday not found' })
		}

		await db.publicHoliday.update({
			where: { id },
			data: {
				date: parsed.data.date,
				name: parsed.data.name,
				type: parsed.data.type,
				year: parsed.data.date.getFullYear()
			}
		})
	},

	delete: async ({ request, locals }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const data = await request.formData()
		const id = data.get('id') as string

		if (!id) {
			return fail(400, {
				error: 'That holiday is no longer on screen. Reload the page and try again.'
			})
		}

		// Verify the holiday belongs to this organization
		const existing = await db.publicHoliday.findFirst({
			where: { id, organizationId: user.organizationId }
		})

		if (!existing) {
			return fail(404, { error: 'Holiday not found' })
		}

		await db.publicHoliday.delete({ where: { id } })
	}
}

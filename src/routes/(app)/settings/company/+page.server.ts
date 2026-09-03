import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { getCompanyInfo, updateCompanyInfo } from '$lib/server/services/settings/master'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')
	const company = await getCompanyInfo(user.organizationId)
	return { company }
}

const schema = z.object({
	name: z.string().min(1, 'Company name is required').max(200),
	address: z.string().max(500).optional(),
	logoUrl: z.string().url('Logo URL must be a valid URL').max(500).optional().or(z.literal('')),
	discordInviteUrl: z
		.string()
		.url('Discord invite must be a valid URL')
		.max(200)
		.optional()
		.or(z.literal(''))
})

export const actions: Actions = {
	save: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const parsed = schema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success)
			return fail(422, { error: parsed.error.errors[0]?.message ?? 'Invalid input' })

		try {
			await updateCompanyInfo(
				user.organizationId,
				{
					name: parsed.data.name,
					address: parsed.data.address || null,
					logoUrl: parsed.data.logoUrl || null,
					discordInviteUrl: parsed.data.discordInviteUrl || null
				},
				{
					organizationId: user.organizationId,
					actorId: user.id,
					actorRoles: user.roles,
					ipAddress: getClientAddress()
				}
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	}
}

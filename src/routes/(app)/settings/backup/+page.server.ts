import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { getBackupSettings, updateBackupConfig } from '$lib/server/services/settings/backup'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'ADMINISTER_SYSTEM')
	return await getBackupSettings(user.organizationId)
}

// A checkbox posts "on" when ticked and is ABSENT when cleared, so `enabled` cannot be a
// plain boolean coercion — `z.coerce.boolean()` on undefined yields false, which is right,
// but on the string "false" it yields TRUE. Compare against the literal instead.
const schema = z.object({
	enabled: z
		.string()
		.optional()
		.transform((v) => v === 'on'),
	intervalDays: z.coerce
		.number()
		.int('Run every must be a whole number of days')
		.min(1, 'Run every must be at least 1 day')
		.max(90, 'Run every cannot exceed 90 days'),
	retentionCount: z.coerce
		.number()
		.int('Keep must be a whole number of backups')
		.min(1, 'Keep at least 1 backup')
		.max(30, 'Keep cannot exceed 30 backups'),
	destinationKind: z.enum(['LOCAL', 'S3'])
})

export const actions: Actions = {
	save: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		// Re-checked here, not only in `load`: a form action is its own entry point and is
		// reachable without ever running the loader.
		requireAnyCapability(user.roles, 'ADMINISTER_SYSTEM')

		const parsed = schema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success)
			return fail(422, { error: parsed.error.errors[0]?.message ?? 'Invalid input' })

		try {
			await updateBackupConfig(user.organizationId, parsed.data, {
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
	}
}

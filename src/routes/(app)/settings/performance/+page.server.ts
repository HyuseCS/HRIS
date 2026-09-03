import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	PERFORMANCE_CONFIG_BOUNDS,
	getPerformanceConfig,
	savePerformanceConfig
} from '$lib/server/services/performance'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	// ADMINISTER_HR_ORGWIDE, never MANAGE_HR: MANAGE_HR includes MANAGER (#133 made managers
	// on-branch HR) and the cadence is a single org-wide setting, not branch data.
	requireAnyCapability(user.roles, 'ADMINISTER_HR_ORGWIDE')
	return { config: await getPerformanceConfig(user.organizationId) }
}

const { intervalMonths, dueDays } = PERFORMANCE_CONFIG_BOUNDS

// The bounds come from the service's exported const — two copies of a bound is how they drift.
// A checkbox posts "on" when ticked and is ABSENT when cleared, so `enabled` is compared against
// the literal rather than coerced (`z.coerce.boolean()` turns the string "false" into TRUE).
const schema = z.object({
	enabled: z
		.string()
		.optional()
		.transform((v) => v === 'on'),
	intervalMonths: z.coerce
		.number()
		.int('Run a review every whole number of months')
		.min(intervalMonths.min, `Run a review at least every ${intervalMonths.min} month`)
		.max(intervalMonths.max, `Run a review at most every ${intervalMonths.max} months`),
	dueDays: z.coerce
		.number()
		.int('Days to complete must be a whole number')
		.min(dueDays.min, `Allow at least ${dueDays.min} day to complete`)
		.max(dueDays.max, `Allow at most ${dueDays.max} days to complete`)
})

export const actions: Actions = {
	saveConfig: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		// Re-checked here, not only in `load`: a form action is its own entry point and is
		// reachable without ever running the loader.
		requireAnyCapability(user.roles, 'ADMINISTER_HR_ORGWIDE')

		const parsed = schema.safeParse(Object.fromEntries(await request.formData()))
		// `.errors[0]?.message` — a STRING. Returning `parsed.error.flatten().fieldErrors` here is
		// what #106 was: the banner rendered the object as "[object Object]".
		if (!parsed.success)
			return fail(422, { error: parsed.error.errors[0]?.message ?? 'Invalid input' })

		try {
			await savePerformanceConfig(user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			// The service bounds throw `error(400, '…')`; `e.body.message` is a string there too.
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	}
}

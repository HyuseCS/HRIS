import { fail, isHttpError } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { setManualCompletion } from '$lib/server/services/onboarding'
import { ctxOf } from './shared'
import type { Actions } from '../../../routes/(app)/employees/[id]/$types'

export const onboardingActions: Actions = {
	// Tick a MANUAL onboarding step on/off for this employee (#116). Derived steps are
	// read-only — they check themselves off from the record — so only manual items post here.
	toggleOnboardingStep: async ({ request, locals, params, getClientAddress }) => {
		const action = 'toggleOnboardingStep'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = await request.formData()
		const itemId = data.get('itemId') as string
		if (!itemId) return fail(400, { action, error: 'Missing item id.' })
		const done = data.get('done') === 'true'
		try {
			await setManualCompletion(
				locals.user!.organizationId,
				itemId,
				params.id,
				done,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	}
}

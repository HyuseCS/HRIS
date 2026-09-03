import { json } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { reviewTimesheet } from '$lib/server/services/timesheets'
import { apiError } from '$lib/server/api-error'
import type { RequestHandler } from './$types'

// PATCH: body = { action: 'approve' | 'reject', rejectionReason?: string }
// requireAnyCapability VIEW_TEAM
// call reviewTimesheet
// return json(result)
export const PATCH: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const user = locals.user

	try {
		requireAnyCapability(user.roles, 'VIEW_TEAM')
	} catch {
		return apiError(403, 'Insufficient permissions')
	}

	let body: { action?: string; rejectionReason?: string }
	try {
		body = await request.json()
	} catch {
		return apiError(400, 'Invalid JSON body')
	}

	const { action, rejectionReason } = body

	if (action !== 'approve' && action !== 'reject') {
		return apiError(400, 'action must be "approve" or "reject"')
	}

	const approved = action === 'approve'

	if (!approved && !rejectionReason) {
		return apiError(400, 'rejectionReason is required when rejecting')
	}

	try {
		const result = await reviewTimesheet(
			params.id,
			user.organizationId,
			approved,
			rejectionReason,
			{
				organizationId: user.organizationId,
				actorId: user.id,
				// #247: `reviewTimesheet` resolves stage authority from the full set, so a
				// [MANAGER, VERIFIER] user gets the VERIFY stage they hold.
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			}
		)
		return json(result)
	} catch (e: unknown) {
		if (e instanceof Error) {
			const status = (e as { status?: number }).status
			if (status === 404) return apiError(404, e.message)
			if (status === 400) return apiError(400, e.message)
		}
		throw e
	}
}

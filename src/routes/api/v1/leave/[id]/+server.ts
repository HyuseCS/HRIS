import { json } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { reviewLeaveRequest } from '$lib/server/services/leave'
import { apiError } from '$lib/server/api-error'
import type { RequestHandler } from './$types'

// PATCH: body = { action: 'approve' | 'reject', rejectionReason?: string }
// requireAnyCapability VIEW_TEAM
// call reviewLeaveRequest
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

	// #295: there was a third action, `override-approve`, gated on ADMINISTER_HR_ORGWIDE. It
	// overrode nothing — it collapsed into this same boolean and took the identical path through
	// `reviewLeaveRequest` → `decide`, skipping no stage and bypassing no approver. A real
	// escape hatch for a stuck chain is a `decide()` change, not another action string here.
	const approved = action === 'approve'

	if (!approved && !rejectionReason) {
		return apiError(400, 'rejectionReason is required when rejecting')
	}

	try {
		const result = await reviewLeaveRequest(
			params.id,
			user.organizationId,
			approved,
			rejectionReason,
			{
				organizationId: user.organizationId,
				actorId: user.id,
				// #247: `reviewLeaveRequest` delegates to `decide`, which resolves stage authority
				// from the full set.
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

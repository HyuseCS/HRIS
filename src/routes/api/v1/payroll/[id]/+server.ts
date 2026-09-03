import { json } from '@sveltejs/kit'
import { canAny } from '$lib/rbac'
import { requireAnyCapability, requirePayrollManage } from '$lib/server/rbac'
import { getRunWithEntries, voidRun } from '$lib/server/services/payroll/runs'
import { decidePayrollRun } from '$lib/server/services/approvals'
import { apiError } from '$lib/server/api-error'
import { listVisiblePayEmployeeIds } from '$lib/server/services/employee-access'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	try {
		requirePayrollManage(locals.user.roles)
	} catch {
		return apiError(403, 'Insufficient permissions')
	}

	// #249: same scoping as the run-detail page — a MANAGER sees their own team's entries, not the
	// whole organization's pay. Guarding only the page would leave this endpoint as the way around.
	const visibleEmployeeIds = await listVisiblePayEmployeeIds({
		id: locals.user.id,
		roles: locals.user.roles,
		organizationId: locals.user.organizationId
	})
	const run = await getRunWithEntries(params.id, locals.user.organizationId, visibleEmployeeIds)
	return json({ data: run })
}

export const POST: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const action = url.searchParams.get('action')
	const user = locals.user

	if (action === 'approve') {
		// The maker-checker chain (#134) is the ONLY approve path. This used to call a parallel
		// `approveRun` that wrote `status: 'APPROVED'` straight to the row: it gated on
		// MANAGE_PAYROLL — which holds MANAGER — so a branch manager could sign off payroll that
		// #174 reserves for CEO / Super Admin, and it left the run's approval step open and
		// undecided, so the audit trail showed an approved run nobody had approved. Delegating
		// means the stage capability, the separation-of-duties check and the step records come
		// from one implementation shared with the UI action.
		const roles = user.roles
		if (!canAny(roles, 'APPROVE_REQUESTS')) return apiError(403, 'Insufficient permissions')

		try {
			const result = await decidePayrollRun(params.id, user.organizationId, true, undefined, {
				organizationId: user.organizationId,
				actorId: user.id,
				// `decidePayrollRun` resolves stage authority from the full role set, so a
				// [MANAGER, APPROVER] user gets the stage they legitimately hold. Pass the same
				// normalized `roles` the gate above used, so the two cannot diverge.
				actorRoles: roles
			})
			return json({ data: result })
		} catch (e: unknown) {
			const err = e as { status?: number; body?: { message?: string } }
			if (err?.status && [400, 403, 404].includes(err.status)) {
				return apiError(err.status, err.body?.message ?? 'Cannot approve this run')
			}
			throw e
		}
	}

	if (action === 'void') {
		try {
			requireAnyCapability(user.roles, 'OVERRIDE_FINALIZED')
		} catch {
			return apiError(403, 'Insufficient permissions')
		}

		try {
			const run = await voidRun(params.id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles
			})
			return json({ data: run })
		} catch (e: unknown) {
			// `voidRun` refuses an already-voided run with a 400 (#298 D10). Unwrapped, that
			// surfaced as a raw SvelteKit error rather than the `apiError` shape every other
			// branch here returns — same mapping as the approve branch above.
			const err = e as { status?: number; body?: { message?: string } }
			if (err?.status && [400, 403, 404].includes(err.status)) {
				return apiError(err.status, err.body?.message ?? 'Cannot void this run')
			}
			throw e
		}
	}

	return apiError(400, 'Invalid action. Use ?action=approve or ?action=void')
}

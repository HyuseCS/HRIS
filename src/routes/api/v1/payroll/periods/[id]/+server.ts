import { json } from '@sveltejs/kit'
import { requireAnyCapability, requirePayrollManage } from '$lib/server/rbac'
import { apiError, badRequest, forbidden } from '$lib/server/api-error'
import {
	importAttendance,
	generate,
	lock,
	release,
	voidPeriod
} from '$lib/server/services/payroll/periods'
import type { RequestHandler } from './$types'

/**
 * POST /api/v1/payroll/periods/:id?action=import|generate|lock|release|void
 * (contracts/payroll-v2.md). `void` requires SUPER_ADMIN; others HR_ADMIN+.
 */
export const POST: RequestHandler = async ({ locals, params, request, url, getClientAddress }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')
	const action = url.searchParams.get('action')

	try {
		if (action === 'void') requireAnyCapability(locals.user.roles, 'OVERRIDE_FINALIZED')
		else requirePayrollManage(locals.user.roles)
	} catch {
		return forbidden()
	}

	const org = locals.user.organizationId
	const ctx = {
		organizationId: org,
		actorId: locals.user.id,
		actorRoles: locals.user.roles,
		ipAddress: getClientAddress()
	}

	try {
		let result
		switch (action) {
			case 'import':
				result = await importAttendance(params.id, org, ctx)
				break
			case 'generate':
				result = await generate(params.id, org, ctx)
				break
			case 'lock': {
				const body = (await request.json().catch(() => ({}))) as { overrideNote?: string }
				result = await lock(params.id, org, ctx, body?.overrideNote)
				break
			}
			case 'release':
				result = await release(params.id, org, ctx)
				break
			case 'void':
				result = await voidPeriod(params.id, org, ctx)
				break
			default:
				return badRequest('Unknown action — use import|generate|lock|release|void')
		}
		return json({ data: result })
	} catch (e: unknown) {
		const err = e as { status?: number; body?: { message?: string } }
		if (err?.status && [400, 404, 409].includes(err.status)) {
			return apiError(err.status, err.body?.message ?? 'Error')
		}
		throw e
	}
}

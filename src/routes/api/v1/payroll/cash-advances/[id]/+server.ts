import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { requirePayrollManage } from '$lib/server/rbac'
import { apiError, badRequest, forbidden } from '$lib/server/api-error'
import { updateCashAdvance } from '$lib/server/services/payroll/loans'
import type { RequestHandler } from './$types'

const patchSchema = z.object({
	installment: z.coerce.number().positive().optional(),
	status: z.enum(['ACTIVE', 'PAID', 'CANCELLED']).optional()
})

export const PATCH: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')
	try {
		requirePayrollManage(locals.user.roles)
	} catch {
		return forbidden()
	}
	let body: unknown
	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}
	const parsed = patchSchema.safeParse(body)
	if (!parsed.success) return badRequest('Invalid input', parsed.error.flatten())

	const ctx = {
		organizationId: locals.user.organizationId,
		actorId: locals.user.id,
		actorRoles: locals.user.roles,
		ipAddress: getClientAddress()
	}
	try {
		const ca = await updateCashAdvance(params.id, locals.user.organizationId, parsed.data, ctx)
		return json({ data: ca })
	} catch (e: unknown) {
		const err = e as { status?: number; body?: { message?: string } }
		if (err?.status === 404) return apiError(404, err.body?.message ?? 'Cash advance not found')
		throw e
	}
}

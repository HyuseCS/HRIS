import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { requirePayrollManage } from '$lib/server/rbac'
import { apiError, badRequest, forbidden } from '$lib/server/api-error'
import { listPeriods, openPeriod } from '$lib/server/services/payroll/periods'
import type { RequestHandler } from './$types'

const openSchema = z.object({
	name: z.string().min(1),
	start: z.coerce.date(),
	end: z.coerce.date(),
	cutoff: z.coerce.number().int().optional()
})

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')
	try {
		requirePayrollManage(locals.user.roles)
	} catch {
		return forbidden()
	}
	return json({ data: await listPeriods(locals.user.organizationId) })
}

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
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
	const parsed = openSchema.safeParse(body)
	if (!parsed.success) return badRequest('Invalid input', parsed.error.flatten())

	const ctx = {
		organizationId: locals.user.organizationId,
		actorId: locals.user.id,
		actorRoles: locals.user.roles,
		ipAddress: getClientAddress()
	}
	try {
		const period = await openPeriod(
			locals.user.organizationId,
			{
				name: parsed.data.name,
				startDate: parsed.data.start,
				endDate: parsed.data.end,
				cutoff: parsed.data.cutoff
			},
			ctx
		)
		return json({ data: period }, { status: 201 })
	} catch (e: unknown) {
		const err = e as { status?: number; body?: { message?: string } }
		if (err?.status === 409) return apiError(409, err.body?.message ?? 'Conflict')
		throw e
	}
}

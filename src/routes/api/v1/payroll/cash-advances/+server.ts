import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { requirePayrollManage } from '$lib/server/rbac'
import { apiError, badRequest, forbidden } from '$lib/server/api-error'
import { listCashAdvances, createCashAdvance } from '$lib/server/services/payroll/loans'
import { listVisiblePayEmployeeIds } from '$lib/server/services/employee-access'
import type { RequestHandler } from './$types'

const createSchema = z.object({
	employeeId: z.string().min(1),
	amount: z.coerce.number().positive(),
	installment: z.coerce.number().positive()
})

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')
	try {
		requirePayrollManage(locals.user.roles)
	} catch {
		return forbidden()
	}
	const employeeId = url.searchParams.get('employeeId')
	if (!employeeId) return badRequest('employeeId is required')

	// #275: the guard above says WHAT the caller may do, never WHOSE record — and MANAGE_PAYROLL
	// holds MANAGER (#133), so without this a branch manager reads any employee's cash-advance
	// balances by passing their id. `null` = unrestricted.
	const visibleEmployeeIds = await listVisiblePayEmployeeIds({
		id: locals.user.id,
		roles: locals.user.roles,
		organizationId: locals.user.organizationId
	})
	if (visibleEmployeeIds && !visibleEmployeeIds.includes(employeeId)) return forbidden()

	return json({ data: await listCashAdvances(employeeId, locals.user.organizationId) })
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
	const parsed = createSchema.safeParse(body)
	if (!parsed.success) return badRequest('Invalid input', parsed.error.flatten())

	const ctx = {
		organizationId: locals.user.organizationId,
		actorId: locals.user.id,
		actorRoles: locals.user.roles,
		ipAddress: getClientAddress()
	}
	try {
		const ca = await createCashAdvance(
			parsed.data.employeeId,
			locals.user.organizationId,
			parsed.data,
			ctx
		)
		return json({ data: ca }, { status: 201 })
	} catch (e: unknown) {
		const err = e as { status?: number; body?: { message?: string } }
		if (err?.status && [400, 404].includes(err.status))
			return apiError(err.status, err.body?.message ?? 'Error')
		throw e
	}
}

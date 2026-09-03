import { json } from '@sveltejs/kit'
import { z } from 'zod'
import { db } from '$lib/server/db'
import { requireAnyCapability } from '$lib/server/rbac'
import { aggregateTimeLogsToTimesheet } from '$lib/server/services/timelog'
import { apiError } from '$lib/server/api-error'
import type { RequestHandler } from './$types'

const aggregateSchema = z.object({
	employeeId: z.string().min(1),
	weekOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekOf must be YYYY-MM-DD')
})

// POST /api/v1/timesheets/aggregate
// Roll a week of raw Discord punches into a DRAFT weekly timesheet (pairs IN/OUT
// per PHT day, flags missing/stray punches), then feeds the existing approval flow.
// Requires MANAGE_HR: MANAGER, HR_ADMIN, CEO, SUPER_ADMIN. MANAGER is deliberately org-wide
// on timesheets — see the comment in $lib/server/services/timesheets.ts.
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const user = locals.user

	try {
		requireAnyCapability(user.roles, 'MANAGE_HR')
	} catch {
		return apiError(403, 'Insufficient permissions')
	}

	let body: unknown
	try {
		body = await request.json()
	} catch {
		return apiError(400, 'Invalid JSON body')
	}

	const parsed = aggregateSchema.safeParse(body)
	if (!parsed.success) return apiError(400, 'Invalid input', parsed.error.flatten())

	const { employeeId, weekOf } = parsed.data

	// Scope the target employee to the caller's organization.
	const employee = await db.employee.findFirst({
		where: { id: employeeId, organizationId: user.organizationId },
		select: { id: true }
	})
	if (!employee) return apiError(404, 'Employee not found')

	try {
		const result = await aggregateTimeLogsToTimesheet(employeeId, new Date(weekOf), {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		})
		return json(result)
	} catch (e: unknown) {
		const err = e as { status?: number; body?: { message?: string } }
		// The service refuses to touch a non-DRAFT timesheet.
		if (err?.status === 409) return apiError(409, err.body?.message ?? 'Timesheet is not a draft')
		throw e
	}
}

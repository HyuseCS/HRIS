import { json, error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { listAllEnrollments, enrollEmployee } from '$lib/server/services/benefits'
import { z } from 'zod'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized')
	requireAnyCapability(locals.user.roles, 'MANAGE_HR')
	return json({ results: await listAllEnrollments(locals.user.organizationId) })
}

const enrollSchema = z.object({
	employeeId: z.string().min(1),
	benefitPlanId: z.string().min(1),
	coverageLevel: z.string().optional(),
	effectiveDate: z.coerce.date(),
	status: z.enum(['ACTIVE', 'WAIVED', 'TERMINATED']).optional()
})

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const parsed = enrollSchema.safeParse(await request.json())
	if (!parsed.success) error(422, parsed.error.errors[0]?.message ?? 'Invalid enrollment')

	const enrollment = await enrollEmployee(
		parsed.data.employeeId,
		parsed.data.benefitPlanId,
		{
			coverageLevel: parsed.data.coverageLevel,
			effectiveDate: parsed.data.effectiveDate,
			status: parsed.data.status
		},
		{
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		}
	)
	return json({ enrollment }, { status: 201 })
}

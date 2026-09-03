import { json, error } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { listPositions, createPosition } from '$lib/server/services/settings/org'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized')
	requireAnyCapability(locals.user.roles, 'MANAGE_HR')
	return json({ results: await listPositions(locals.user.organizationId) })
}

const createSchema = z.object({
	title: z.string().min(1),
	level: z.number().int().optional(),
	departmentId: z.string().optional(),
	salaryGradeId: z.string().optional()
})

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const parsed = createSchema.safeParse(await request.json())
	if (!parsed.success) error(422, parsed.error.errors[0]?.message ?? 'Invalid position')

	const position = await createPosition(user.organizationId, parsed.data, {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	})
	return json({ data: position }, { status: 201 })
}

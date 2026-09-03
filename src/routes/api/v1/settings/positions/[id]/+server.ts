import { json, error } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { getPosition, updatePosition } from '$lib/server/services/settings/org'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized')
	requireAnyCapability(locals.user.roles, 'MANAGE_HR')
	return json({ data: await getPosition(params.id, locals.user.organizationId) })
}

const updateSchema = z.object({
	title: z.string().min(1),
	level: z.number().int().optional(),
	departmentId: z.string().optional(),
	salaryGradeId: z.string().nullable().optional(),
	isActive: z.boolean().optional()
})

export const PATCH: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const parsed = updateSchema.safeParse(await request.json())
	if (!parsed.success) error(422, parsed.error.errors[0]?.message ?? 'Invalid position')

	const position = await updatePosition(params.id, user.organizationId, parsed.data, {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	})
	return json({ data: position })
}

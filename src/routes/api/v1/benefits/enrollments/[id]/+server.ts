import { json, error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { updateEnrollmentStatus } from '$lib/server/services/benefits'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const patchSchema = z.object({ status: z.enum(['ACTIVE', 'WAIVED', 'TERMINATED']) })

export const PATCH: RequestHandler = async ({ locals, request, params, getClientAddress }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const parsed = patchSchema.safeParse(await request.json())
	if (!parsed.success) error(422, 'Invalid status')

	const enrollment = await updateEnrollmentStatus(
		params.id,
		user.organizationId,
		parsed.data.status,
		{
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		}
	)
	return json({ enrollment })
}

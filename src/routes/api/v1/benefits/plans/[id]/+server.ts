import { json, error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { updateBenefitPlan } from '$lib/server/services/benefits'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const patchSchema = z.object({
	name: z.string().min(1).optional(),
	type: z.enum(['HMO', 'INSURANCE', 'RETIREMENT', 'ALLOWANCE', 'LEAVE_CREDIT', 'OTHER']).optional(),
	provider: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	employeeCost: z.coerce.number().nonnegative().nullable().optional(),
	employerCost: z.coerce.number().nonnegative().nullable().optional(),
	isActive: z.boolean().optional()
})

export const PATCH: RequestHandler = async ({ locals, request, params, getClientAddress }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const parsed = patchSchema.safeParse(await request.json())
	if (!parsed.success) error(422, parsed.error.errors[0]?.message ?? 'Invalid plan update')

	const plan = await updateBenefitPlan(params.id, user.organizationId, parsed.data, {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	})
	return json({ plan })
}

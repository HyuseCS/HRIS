import { json, error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { listBenefitPlans, createBenefitPlan } from '$lib/server/services/benefits'
import { z } from 'zod'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized')
	requireAnyCapability(locals.user.roles, 'MANAGE_HR')
	return json({ results: await listBenefitPlans(locals.user.organizationId) })
}

const planSchema = z.object({
	name: z.string().min(1),
	type: z.enum(['HMO', 'INSURANCE', 'RETIREMENT', 'ALLOWANCE', 'LEAVE_CREDIT', 'OTHER']),
	provider: z.string().optional(),
	description: z.string().optional(),
	employeeCost: z.coerce.number().nonnegative().optional(),
	employerCost: z.coerce.number().nonnegative().optional()
})

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const parsed = planSchema.safeParse(await request.json())
	if (!parsed.success) error(422, parsed.error.errors[0]?.message ?? 'Invalid plan')

	const plan = await createBenefitPlan(user.organizationId, parsed.data, {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	})
	return json({ plan }, { status: 201 })
}

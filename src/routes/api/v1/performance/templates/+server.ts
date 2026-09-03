import { json, error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { templateMetaSchema, templateStructureSchema } from '$lib/server/performance/schemas'
import { listTemplates, createTemplate } from '$lib/server/services/performance-templates'
import { z } from 'zod'
import type { RequestHandler } from './$types'

/**
 * Evaluation templates over the API (#178). Mirrors `api/v1/performance/cycles/+server.ts`, with
 * one difference that matters: the capability is ADMINISTER_HR_ORGWIDE, not MANAGE_HR. MANAGE_HR
 * includes MANAGER (#133), and a template is org-wide configuration.
 */

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized')
	requireAnyCapability(locals.user.roles, 'ADMINISTER_HR_ORGWIDE')
	return json({ results: await listTemplates(locals.user.organizationId) })
}

const schema = z.object({
	name: templateMetaSchema.shape.name,
	structure: templateStructureSchema
})

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user
	requireAnyCapability(user.roles, 'ADMINISTER_HR_ORGWIDE')
	const parsed = schema.safeParse(await request.json())
	if (!parsed.success) error(422, parsed.error.errors[0]?.message ?? 'Invalid template')
	const template = await createTemplate(user.organizationId, parsed.data, {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	})
	return json({ template }, { status: 201 })
}

import { json, error } from '@sveltejs/kit'
import { z } from 'zod'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import type { RequestHandler } from './$types'

const schema = z.object({ organizationId: z.string().min(1) })

// Change the active org for a cross-org member (#131). The membership check is the
// tenant-isolation boundary: only orgs the user actually belongs to can become
// current. hooks.server.ts then resolves locals.user.organizationId from the stored
// session value on every subsequent request.
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user || !locals.session) error(401, 'Unauthorized')
	const { user, session } = locals

	const parsed = schema.safeParse(await request.json().catch(() => null))
	if (!parsed.success) error(400, 'Invalid request')

	const { organizationId } = parsed.data

	const membership = await db.userOrganization.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId } }
	})
	if (!membership) error(403, 'Not a member of that organization')

	const previousOrgId = user.organizationId

	// #5: the switch and its audit row commit together, so a failed audit write cannot leave the
	// session pointing at an org with no record of the move.
	await db.$transaction(async (tx) => {
		await tx.session.update({
			where: { id: session.id },
			data: { currentOrgId: organizationId }
		})

		await writeAuditLog(
			{
				organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			},
			{
				action: 'UPDATE',
				entityType: 'Session',
				entityId: session.id,
				oldValue: { currentOrgId: previousOrgId },
				newValue: { currentOrgId: organizationId }
			},
			tx
		)
	})

	return json({ ok: true })
}

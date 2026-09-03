import { json, error } from '@sveltejs/kit'
import { z } from 'zod'
import { ASSIGNABLE_ROLES } from '$lib/rbac'
import { requireAnyCapability } from '$lib/server/rbac'
import { setUserRoles } from '$lib/server/services/settings/org'
import type { RequestHandler } from './$types'

const rolesSchema = z.object({
	roles: z.array(z.enum(ASSIGNABLE_ROLES)).nonempty('A user must keep at least one role.')
})

// PATCH /api/v1/settings/users/:id/roles — set a user's role set.
// The last-active-super-admin / last-active-CEO (409), self-role-change (403) and empty-set (400)
// guardrails all live in setUserRoles, so this handler and the roles form action enforce the same
// rules without restating them. This route has never had a target-role check of its own and still
// does not: the page's old `u.role !== 'CEO'` block was UI-only and never reached here (#248).
//
// #283/Q3: renamed from `/role` and the body is now `{ roles: [...] }`, a breaking change made
// without a deprecation window on purpose. /api/v1/* authenticates by session cookie only — there
// is no API-key or bearer mechanism anywhere in the tree — and there were zero in-repo callers, so
// the only thing that could break is an external script nobody has written against a session-only
// endpoint. Keeping a singular alias would have meant two writers of the same column again, which
// is the shape #255 was filed for.
export const PATCH: RequestHandler = async ({ locals, params, request, getClientAddress }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user
	// Role changes are CEO-exclusive (#132) — Super Admin / HR Admin no longer qualify.
	requireAnyCapability(user.roles, 'MANAGE_USER_ROLES')

	const parsed = rolesSchema.safeParse(await request.json())
	if (!parsed.success) error(422, parsed.error.errors[0]?.message ?? 'Invalid roles')

	const updated = await setUserRoles(params.id, user.organizationId, parsed.data.roles, {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	})
	return json({ data: { id: updated.id, roles: updated.roles } })
}

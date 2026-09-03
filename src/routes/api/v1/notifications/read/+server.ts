import { json, error } from '@sveltejs/kit'
import { markAllRead, markRead } from '$lib/server/services/notifications'
import type { RequestHandler } from './$types'

// Mark notifications read (called once their toasts are shown).
//
// `{ ids: [...] }` marks exactly those — the caller must only send what it actually showed the
// user. `listUnread` caps at 10, so marking ALL read used to silently consume the overflow.
// A body-less POST still means "all", so any existing caller keeps working.
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized')

	let ids: string[] | null = null
	try {
		const body = await request.json()
		if (body && Array.isArray(body.ids)) {
			ids = body.ids.filter((id: unknown): id is string => typeof id === 'string')
		}
	} catch {
		// No body, or not JSON — fall through to the mark-all behaviour.
	}

	// `markRead` already no-ops on an empty list, so an explicit `{ ids: [] }` marks nothing —
	// only a body-less POST still means "all".
	if (ids) await markRead(locals.user.id, ids)
	else await markAllRead(locals.user.id)

	return json({ ok: true })
}

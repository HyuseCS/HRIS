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

	// A truncated or corrupt body must NOT fall through to mark-all — that consumes the whole
	// unread queue, the outcome the `{ ids }` shape exists to prevent. Only an empty body means all.
	let ids: string[] | null = null
	const raw = (await request.text()).trim()
	if (raw) {
		let body: { ids?: unknown }
		try {
			body = JSON.parse(raw)
		} catch {
			error(400, 'Malformed JSON body')
		}
		if (body && Array.isArray(body.ids)) {
			ids = body.ids.filter((id: unknown): id is string => typeof id === 'string')
		}
	}

	// `markRead` already no-ops on an empty list, so an explicit `{ ids: [] }` marks nothing —
	// only a body-less POST still means "all".
	if (ids) await markRead(locals.user.id, ids)
	else await markAllRead(locals.user.id)

	return json({ ok: true })
}

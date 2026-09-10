import type { Cookies } from '@sveltejs/kit'

/**
 * One-shot message that survives a redirect (phase 04).
 *
 * An action that redirects on success throws away its `form` payload, so the destination page has
 * nothing to render — which is why creating an employee, hiring an applicant or filing a
 * separation all used to land silently. `setFlash` parks the message in a short-lived cookie
 * before the redirect and the `(app)` layout load reads and clears it.
 *
 * A cookie rather than a query param or a session row: it survives a 302, it works with NO
 * JavaScript, it needs no schema change and it does not stick in a bookmarked URL.
 */

export type FlashKind = 'success' | 'info' | 'error'

export interface Flash {
	/** Nonce — the client dedupes on it, so a cached layout payload cannot re-toast. */
	id: string
	kind: FlashKind
	message: string
}

const COOKIE = 'flash'
/** A flash is a sentence, not a payload. Anything larger is a caller bug — drop it. */
const MAX_BYTES = 512

export function setFlash(cookies: Cookies, flash: { kind: FlashKind; message: string }): void {
	const value = JSON.stringify({
		id: crypto.randomUUID(),
		kind: flash.kind,
		message: flash.message
	})
	if (new TextEncoder().encode(value).length > MAX_BYTES) return
	cookies.set(COOKIE, value, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 })
}

/** Reads AND clears. A flash that survives its first read re-fires on every navigation. */
export function takeFlash(cookies: Cookies): Flash | null {
	const raw = cookies.get(COOKIE)
	if (!raw) return null
	cookies.delete(COOKIE, { path: '/' })

	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		// A hand-edited or truncated cookie must not 500 the whole layout load.
		return null
	}
	if (typeof parsed !== 'object' || parsed === null) return null

	const { id, kind, message } = parsed as Record<string, unknown>
	if (typeof id !== 'string' || typeof message !== 'string') return null

	return {
		id,
		kind: kind === 'error' || kind === 'info' ? kind : 'success',
		message
	}
}

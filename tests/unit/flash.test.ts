import { describe, it, expect } from 'vitest'
import type { Cookies } from '@sveltejs/kit'
import { setFlash, takeFlash } from '$lib/server/flash'

/**
 * Phase 04 — the flash cookie is the only feedback a redirect-after-success flow can carry, so
 * its round-trip and its clear-on-read are pinned here. A flash that survives its first read
 * re-fires on every later navigation, which reads as the app repeating itself.
 */

/** Minimal `cookies` double — only the three methods flash.ts uses. */
function fakeCookies() {
	const jar = new Map<string, string>()
	return {
		jar,
		cookies: {
			get: (name: string) => jar.get(name),
			set: (name: string, value: string) => jar.set(name, value),
			delete: (name: string) => jar.delete(name)
		} as unknown as Cookies
	}
}

describe('flash', () => {
	it('round-trips a message through the cookie', () => {
		const { cookies } = fakeCookies()
		setFlash(cookies, { kind: 'success', message: 'Employee created.' })

		const flash = takeFlash(cookies)
		expect(flash?.message).toBe('Employee created.')
		expect(flash?.kind).toBe('success')
		expect(flash?.id).toBeTypeOf('string')
	})

	it('clears the cookie on read, so a second read returns null', () => {
		const { jar, cookies } = fakeCookies()
		setFlash(cookies, { kind: 'info', message: 'Saved.' })
		expect(jar.has('flash')).toBe(true)

		expect(takeFlash(cookies)?.message).toBe('Saved.')
		expect(jar.has('flash')).toBe(false)
		expect(takeFlash(cookies)).toBeNull()
	})

	it('returns null when no flash is set', () => {
		expect(takeFlash(fakeCookies().cookies)).toBeNull()
	})

	it('gives every flash its own id, so the client can dedupe', () => {
		const { cookies } = fakeCookies()
		setFlash(cookies, { kind: 'success', message: 'A' })
		const first = takeFlash(cookies)
		setFlash(cookies, { kind: 'success', message: 'A' })
		const second = takeFlash(cookies)

		expect(first?.id).not.toBe(second?.id)
	})

	it('drops an oversized payload instead of setting a cookie', () => {
		const { jar, cookies } = fakeCookies()
		setFlash(cookies, { kind: 'error', message: 'x'.repeat(600) })

		expect(jar.has('flash')).toBe(false)
		expect(takeFlash(cookies)).toBeNull()
	})

	it('returns null for malformed JSON and does not throw', () => {
		const { jar, cookies } = fakeCookies()
		jar.set('flash', 'not json{')

		expect(() => takeFlash(cookies)).not.toThrow()
		expect(takeFlash(cookies)).toBeNull()
	})

	it('returns null for JSON that is missing an id or a message', () => {
		const { jar, cookies } = fakeCookies()
		jar.set('flash', JSON.stringify({ kind: 'success' }))
		expect(takeFlash(cookies)).toBeNull()

		jar.set('flash', JSON.stringify({ id: 'x', kind: 'success' }))
		expect(takeFlash(cookies)).toBeNull()
	})

	it('falls back to success for an unknown kind', () => {
		const { jar, cookies } = fakeCookies()
		jar.set('flash', JSON.stringify({ id: 'x', kind: 'wat', message: 'Saved.' }))
		expect(takeFlash(cookies)?.kind).toBe('success')
	})
})

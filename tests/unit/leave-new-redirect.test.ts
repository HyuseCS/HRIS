import { describe, it, expect } from 'vitest'
import { isRedirect } from '@sveltejs/kit'

/**
 * Phase 6 / S2 — `/leave/new` was one of two live leave-filing forms. It is retired to a permanent
 * redirect onto the canonical `/requests` form rather than deleted, so the bookmark keeps working.
 *
 * The target matters as much as the status: `/requests` alone would land the user on their filings
 * list with the form closed, which is the same "old link, wrong surface" bug `/approvals` had. The
 * `?new=leave` param is what opens the form.
 *
 * `redirect()` throws in SvelteKit 2, and this load is async, so the assertion is on the rejection.
 */

const { load } = await import('../../src/routes/(app)/leave/new/+page.server')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const event = () => ({ url: new URL('http://localhost/leave/new') }) as any

describe('GET /leave/new retirement redirect', () => {
	it('308-redirects to /requests?new=leave, with the form-opening param', async () => {
		let thrown: unknown
		try {
			await load(event())
		} catch (e) {
			thrown = e
		}

		expect(thrown).toBeDefined()
		expect(isRedirect(thrown)).toBe(true)
		expect(thrown).toMatchObject({ status: 308, location: '/requests?new=leave' })
	})
})

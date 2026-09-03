import { describe, it, expect } from 'vitest'
import { isRedirect } from '@sveltejs/kit'

/**
 * P0-1 — `/approvals` is a legacy bookmark. It used to 308 to `/requests`, which is the user's
 * OWN filings page, so an approver following an old link landed on a list that never contains
 * the thing they came to act on. The approval inbox is `/requests/approvals`.
 *
 * `redirect()` throws in SvelteKit 2, so the assertion is on the caught object.
 */

const { load } = await import('../../src/routes/(app)/approvals/+page.server')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const event = () => ({ url: new URL('http://localhost/approvals') }) as any

describe('GET /approvals legacy redirect', () => {
	it('308-redirects to /requests/approvals, not /requests', () => {
		let thrown: unknown
		try {
			load(event())
		} catch (e) {
			thrown = e
		}

		expect(thrown).toBeDefined()
		expect(isRedirect(thrown)).toBe(true)
		expect(thrown).toMatchObject({ status: 308, location: '/requests/approvals' })
	})
})

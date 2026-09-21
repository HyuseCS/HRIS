import { describe, it, expect } from 'vitest'
import { isRedirect } from '@sveltejs/kit'

/**
 * The pay masters moved from `/settings/*` to `/payroll/*` when the settings Payroll group was
 * removed and they became payroll tabs. Old bookmarks and any link missed by the sweep must keep
 * working, so each old path keeps a load that 308s to the new one.
 *
 * `redirect()` throws in SvelteKit 2, so the assertion is on the caught object.
 */

const payCodes = await import('../../src/routes/(app)/settings/pay-codes/+page.server')
const salaryGrades = await import('../../src/routes/(app)/settings/salary-grades/+page.server')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const event = (path: string) => ({ url: new URL(`http://localhost${path}`) }) as any

const caught = (fn: () => unknown) => {
	try {
		fn()
	} catch (e) {
		return e
	}
	return undefined
}

describe('legacy pay-master redirects', () => {
	it('308-redirects /settings/pay-codes to /payroll/pay-codes', () => {
		const thrown = caught(() => payCodes.load(event('/settings/pay-codes')))
		expect(isRedirect(thrown)).toBe(true)
		expect(thrown).toMatchObject({ status: 308, location: '/payroll/pay-codes' })
	})

	it('308-redirects /settings/salary-grades to /payroll/salary-grades', () => {
		const thrown = caught(() => salaryGrades.load(event('/settings/salary-grades')))
		expect(isRedirect(thrown)).toBe(true)
		expect(thrown).toMatchObject({ status: 308, location: '/payroll/salary-grades' })
	})
})

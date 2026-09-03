import { describe, it, expect } from 'vitest'
import { TABS, resolveTab, hrefFor } from '$lib/components/employees/employee-tabs'

// The 201 file is one route with five URL-backed tabs (?tab=). These two pure functions are the
// whole contract: an unreadable value must never error or blank the page, and a tab change must
// not drop the ?from= that BackButton reads.
describe('resolveTab', () => {
	it('falls back to overview for an absent, empty or unknown value', () => {
		expect(resolveTab(null)).toBe('overview')
		expect(resolveTab('')).toBe('overview')
		expect(resolveTab('garbage')).toBe('overview')
		expect(resolveTab('OVERVIEW')).toBe('overview')
	})

	it('returns each known tab id unchanged', () => {
		for (const tab of TABS) expect(resolveTab(tab.id)).toBe(tab.id)
	})

	it('exposes exactly the five planned tabs, in order', () => {
		expect(TABS.map((t) => t.id)).toEqual([
			'overview',
			'compensation',
			'documents',
			'history',
			'actions'
		])
	})
})

describe('hrefFor', () => {
	it('preserves a pre-existing ?from= and mutates only tab', () => {
		const url = new URL('http://x/employees/abc?from=%2Fteam&tab=history')
		expect(hrefFor(url, 'documents')).toBe('/employees/abc?from=%2Fteam&tab=documents')
	})

	it('adds tab when the url carries none', () => {
		expect(hrefFor(new URL('http://x/employees/abc'), 'actions')).toBe('/employees/abc?tab=actions')
	})

	it('leaves the source url untouched', () => {
		const url = new URL('http://x/employees/abc?tab=history')
		hrefFor(url, 'documents')
		expect(url.searchParams.get('tab')).toBe('history')
	})
})

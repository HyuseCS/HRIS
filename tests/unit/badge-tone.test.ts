import { describe, it, expect } from 'vitest'
import { badgeFor, toneFor, DOMAIN_LABELS } from '$lib/components/ui/badge'

/**
 * `Badge` degrading badly is a silent failure: a pill that renders blank, or throws and takes the
 * whole page with it, on a status nobody mapped. These assert the degradation itself, not just the
 * happy path.
 *
 * The component cannot be rendered here — `vitest.config.ts` is `environment: 'node'` — which is
 * exactly why the lookup lives in `badge.ts`.
 */

describe('toneFor', () => {
	it('tones a known status from the shared table', () => {
		expect(toneFor('APPROVED')).toBe('green')
		expect(toneFor('REJECTED')).toBe('red')
		expect(toneFor('PENDING')).toBe('yellow')
		expect(toneFor('SUBMITTED')).toBe('blue')
		expect(toneFor('DRAFT')).toBe('gray')
	})

	it('falls back to gray for an unknown status', () => {
		expect(toneFor('NOT_A_STATUS')).toBe('gray')
		expect(toneFor('')).toBe('gray')
	})

	it('lets a domain override a status the base table tones differently', () => {
		// OPEN is the case the override table exists for.
		expect(toneFor('OPEN')).toBe('yellow')
		expect(toneFor('OPEN', 'separation')).toBe('yellow')
		expect(toneFor('OPEN', 'complaint')).toBe('yellow')
		expect(toneFor('OPEN', 'branch')).toBe('green')
		expect(toneFor('OPEN', 'payrollPeriod')).toBe('gray')
	})

	it('still uses the base table for a domain with no override', () => {
		expect(toneFor('APPROVED', 'timesheet')).toBe('green')
		expect(toneFor('APPROVED', 'payrollRun')).toBe('green')
	})

	it('returns a real tone for every member of every mapped domain', () => {
		const tones = ['green', 'red', 'yellow', 'blue', 'gray']
		for (const [domain, labels] of Object.entries(DOMAIN_LABELS)) {
			for (const status of Object.keys(labels)) {
				expect(tones, `${domain}.${status} resolved to an unknown tone`).toContain(
					toneFor(status, domain as keyof typeof DOMAIN_LABELS)
				)
			}
		}
	})
})

describe('badgeFor', () => {
	it('resolves the human label from the domain map', () => {
		expect(badgeFor('ON_LEAVE', { domain: 'employment' })).toEqual({
			tone: 'yellow',
			label: 'On leave'
		})
	})

	it('renders the raw value, in gray, for an unknown status — never blank', () => {
		const result = badgeFor('WAT', { domain: 'timesheet' })
		expect(result.tone).toBe('gray')
		expect(result.label).toBe('WAT')
	})

	it('renders the raw value when no domain is given', () => {
		expect(badgeFor('APPROVED')).toEqual({ tone: 'green', label: 'APPROVED' })
	})

	it('honours the tone override', () => {
		expect(badgeFor('APPROVED', { domain: 'timesheet', tone: 'red' }).tone).toBe('red')
	})

	it('honours the label override', () => {
		expect(badgeFor('APPROVED', { domain: 'timesheet', label: 'Signed off' }).label).toBe(
			'Signed off'
		)
	})

	it('does not throw on an empty status', () => {
		expect(() => badgeFor('')).not.toThrow()
		expect(badgeFor('').label).toBe('')
	})
})

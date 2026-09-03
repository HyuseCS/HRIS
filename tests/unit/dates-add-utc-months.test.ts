import { describe, it, expect } from 'vitest'
import { addUTCMonths, regularizationDate } from '../../src/lib/utils/dates'

// #178 — the generic month step behind performance-cycle period dates. It is UTC on
// purpose: the day-of-month must survive the step, and local-time month math drifts a day
// for PHT (UTC+8). `monthsOfService` is Manila-based and answers a different question —
// the two bases disagree by design.
describe('addUTCMonths (#178)', () => {
	// INTENDED: short months overflow, they do not clamp. Jan 31 + 1 month is Mar 3, not
	// Feb 28 — `setUTCMonth` builds Feb 31 and the Date rolls it forward. This is the same
	// behaviour `regularizationDate` has always had (see regularization.test.ts, Mar 31 + 6
	// months = Oct 1) and it is pinned here so a later reader cannot change it silently.
	it('overflows a short month rather than clamping: Jan 31 + 1 month', () => {
		expect(addUTCMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe(
			'2026-03-03T00:00:00.000Z'
		)
		// A leap year shifts the overflow by one day — still deterministic.
		expect(addUTCMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe(
			'2028-03-02T00:00:00.000Z'
		)
	})

	it('crosses the year boundary: December + 2 months', () => {
		expect(addUTCMonths(new Date('2026-12-15T00:00:00Z'), 2).toISOString()).toBe(
			'2027-02-15T00:00:00.000Z'
		)
	})

	it('keeps a UTC-midnight input at UTC midnight, and does not mutate the input', () => {
		const input = new Date('2026-08-27T00:00:00Z')
		const out = addUTCMonths(input, 2)
		expect(out.toISOString()).toBe('2026-10-27T00:00:00.000Z')
		expect(input.toISOString()).toBe('2026-08-27T00:00:00.000Z')
	})

	it('steps backwards for a negative month count', () => {
		expect(addUTCMonths(new Date('2026-03-15T00:00:00Z'), -4).toISOString()).toBe(
			'2025-11-15T00:00:00.000Z'
		)
	})

	// The refactor's contract: regularizationDate is now just this helper at 6 months.
	it('is what regularizationDate steps by', () => {
		const start = new Date('2026-01-15T00:00:00Z')
		expect(regularizationDate(start).toISOString()).toBe(addUTCMonths(start, 6).toISOString())
	})
})

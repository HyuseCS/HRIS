import { describe, it, expect } from 'vitest'
import {
	periodOf,
	describePeriod,
	isValidStandardPeriod,
	periodShareOf,
	monthsTouched,
	summedMonthShare,
	customRangeError,
	monthYearLabel,
	periodDays,
	daysInMonth,
	formatPeriodPreview,
	toPeriodInputValue
} from '../../src/lib/utils/pay-periods'

// Dates are UTC-midnight calendar days (see pay-periods.ts). Build expectations the same way.
const utc = (y: number, m1: number, d: number) => new Date(Date.UTC(y, m1 - 1, d))

describe('daysInMonth', () => {
	it('handles 30- and 31-day months', () => {
		expect(daysInMonth(2026, 0)).toBe(31) // January
		expect(daysInMonth(2026, 3)).toBe(30) // April
	})
	it('handles February leap vs non-leap years', () => {
		expect(daysInMonth(2024, 1)).toBe(29) // 2024 is a leap year
		expect(daysInMonth(2026, 1)).toBe(28) // 2026 is not
		expect(daysInMonth(2000, 1)).toBe(29) // century leap year
		expect(daysInMonth(1900, 1)).toBe(28) // century non-leap
	})
})

describe('periodOf', () => {
	it('FIRST_HALF is always the 1st–15th', () => {
		const { periodStart, periodEnd } = periodOf('FIRST_HALF', 2026, 4) // May
		expect(periodStart).toEqual(utc(2026, 5, 1))
		expect(periodEnd).toEqual(utc(2026, 5, 15))
	})
	it('SECOND_HALF runs 16th to a dynamic month end', () => {
		expect(periodOf('SECOND_HALF', 2026, 4).periodEnd).toEqual(utc(2026, 5, 31)) // May → 31
		expect(periodOf('SECOND_HALF', 2026, 1).periodEnd).toEqual(utc(2026, 2, 28)) // Feb non-leap
		expect(periodOf('SECOND_HALF', 2024, 1).periodEnd).toEqual(utc(2024, 2, 29)) // Feb leap
		expect(periodOf('SECOND_HALF', 2026, 3).periodEnd).toEqual(utc(2026, 4, 30)) // Apr → 30
	})
	it('WHOLE_MONTH spans the 1st to the month end', () => {
		const { periodStart, periodEnd } = periodOf('WHOLE_MONTH', 2024, 1) // leap Feb
		expect(periodStart).toEqual(utc(2024, 2, 1))
		expect(periodEnd).toEqual(utc(2024, 2, 29))
	})
})

describe('describePeriod round-trips periodOf', () => {
	for (const kind of ['FIRST_HALF', 'SECOND_HALF', 'WHOLE_MONTH'] as const) {
		it(`${kind} for a sampling of months`, () => {
			for (const month0 of [0, 1, 3, 4, 11]) {
				const { periodStart, periodEnd } = periodOf(kind, 2026, month0)
				const d = describePeriod(periodStart, periodEnd)
				expect(d.kind).toBe(kind)
				expect(d.year).toBe(2026)
				expect(d.month0).toBe(month0)
			}
		})
	}
	it('produces readable labels', () => {
		expect(describePeriod(...halves('FIRST_HALF')).label).toBe('May 2026 · 1–15')
		expect(describePeriod(...halves('SECOND_HALF')).label).toBe('May 2026 · 16–31')
		expect(describePeriod(...halves('WHOLE_MONTH')).label).toBe('May 2026 · Whole month')
	})
	it('labels Feb second-half with the correct dynamic end', () => {
		const [s, e] = [
			periodOf('SECOND_HALF', 2026, 1).periodStart,
			periodOf('SECOND_HALF', 2026, 1).periodEnd
		]
		expect(describePeriod(s, e).label).toBe('February 2026 · 16–28')
	})
})

function halves(kind: 'FIRST_HALF' | 'SECOND_HALF' | 'WHOLE_MONTH'): [Date, Date] {
	const p = periodOf(kind, 2026, 4) // May 2026
	return [p.periodStart, p.periodEnd]
}

describe('isValidStandardPeriod', () => {
	it('accepts the three standard shapes', () => {
		for (const kind of ['FIRST_HALF', 'SECOND_HALF', 'WHOLE_MONTH'] as const) {
			const { periodStart, periodEnd } = periodOf(kind, 2026, 6) // July
			expect(isValidStandardPeriod(periodStart, periodEnd)).toBe(true)
		}
	})
	// #163: these ranges are no longer *rejected* — a custom same-month range is now a legal
	// period, and #3 made a cross-month one legal too. `isValidStandardPeriod` keeps its old
	// answer because it only ever CLASSIFIES the three standard shapes; the accept/reject
	// decision lives in `customRangeError`.
	it('classifies arbitrary / off-cycle ranges as non-standard', () => {
		expect(isValidStandardPeriod(utc(2026, 5, 13), utc(2026, 5, 21))).toBe(false) // mid-month week
		expect(isValidStandardPeriod(utc(2026, 5, 1), utc(2026, 5, 14))).toBe(false) // 1–14
		expect(isValidStandardPeriod(utc(2026, 5, 16), utc(2026, 5, 30))).toBe(false) // 16–30 in a 31-day month
		expect(isValidStandardPeriod(utc(2026, 5, 1), utc(2026, 6, 15))).toBe(false) // spans two months
	})
	it('rejects 16–30 but accepts 16–28 for February', () => {
		expect(isValidStandardPeriod(utc(2026, 2, 16), utc(2026, 2, 28))).toBe(true)
		expect(isValidStandardPeriod(utc(2026, 2, 16), utc(2026, 2, 27))).toBe(false)
	})
})

/**
 * #3 deleted `isSameMonthRange`, and this describe is where two of its cases moved. They were
 * never really about the same-month RULE — they were about calendar reasoning that the walker
 * replacing it has to get right too.
 *
 * The one that matters is same month NUMBER, different YEAR. `isSameMonthRange` compared the year
 * as well as the month, and got it right. A walker that steps months while comparing only `month0`
 * would stop at the first May and report one month, or never terminate. Nothing else in this file
 * would notice: the share would come out at 1/31 instead of 12.03, i.e. an accept instead of a
 * refusal, on a range twelve months long.
 */
describe('monthsTouched', () => {
	it('walks a single day as exactly one month', () => {
		expect(monthsTouched(utc(2026, 5, 13), utc(2026, 5, 13))).toEqual([{ year: 2026, month0: 4 }])
	})

	it('walks a two-month range as both months, in order', () => {
		expect(monthsTouched(utc(2026, 5, 1), utc(2026, 6, 15))).toEqual([
			{ year: 2026, month0: 4 },
			{ year: 2026, month0: 5 }
		])
	})

	// The re-homed trap: 1 May 2026 → 1 May 2027 is the SAME month number a year apart.
	it('crosses a year boundary rather than stopping at the matching month number', () => {
		const months = monthsTouched(utc(2026, 5, 1), utc(2027, 5, 1))
		expect(months).toHaveLength(13)
		expect(months[0]).toEqual({ year: 2026, month0: 4 })
		expect(months[12]).toEqual({ year: 2027, month0: 4 })
	})

	it('is empty for a reversed range', () => {
		expect(monthsTouched(utc(2026, 5, 21), utc(2026, 5, 13))).toEqual([])
	})
})

describe('periodShareOf', () => {
	// The frozen contract: the three standard shapes are EXACTLY 0.5 / 0.5 / 1 in every month
	// length. There is no single-formula simplification — May 1–15 is 15/31 = 0.4839 by day
	// count, and paying it that way would be the #163 regression this table exists to catch.
	it('is exactly 0.5 / 0.5 / 1 for the standard shapes in 28-, 29-, 30- and 31-day months', () => {
		const months: [string, number, number][] = [
			['January (31)', 2026, 0],
			['February 2026 (28)', 2026, 1],
			['February 2024 (29)', 2024, 1],
			['April (30)', 2026, 3]
		]
		for (const [, year, month0] of months) {
			const first = periodOf('FIRST_HALF', year, month0)
			const second = periodOf('SECOND_HALF', year, month0)
			const whole = periodOf('WHOLE_MONTH', year, month0)
			expect(periodShareOf(first.periodStart, first.periodEnd)).toBe(0.5)
			expect(periodShareOf(second.periodStart, second.periodEnd)).toBe(0.5)
			expect(periodShareOf(whole.periodStart, whole.periodEnd)).toBe(1)
		}
	})

	it('prorates a custom same-month range by inclusive day count', () => {
		expect(periodShareOf(utc(2026, 5, 13), utc(2026, 5, 21))).toBe(9 / 31) // 9 days of May
		expect(periodShareOf(utc(2026, 5, 3), utc(2026, 5, 9))).toBe(7 / 31) // 7 days of May
		expect(periodShareOf(utc(2026, 5, 13), utc(2026, 5, 13))).toBe(1 / 31) // single day
	})

	it('Feb 1–14 lands on 0.5 by day count, which is a coincidence of a 28-day month', () => {
		expect(periodShareOf(utc(2026, 2, 1), utc(2026, 2, 14))).toBe(14 / 28)
		expect(periodShareOf(utc(2026, 2, 1), utc(2026, 2, 14))).toBe(0.5)
	})

	it('every custom same-month share is > 0 and <= 1', () => {
		for (let end = 1; end <= 31; end++) {
			const share = periodShareOf(utc(2026, 5, 1), utc(2026, 5, end))
			expect(share).toBeGreaterThan(0)
			expect(share).toBeLessThanOrEqual(1)
		}
	})

	it('is monotonic — extending the end date never lowers the share', () => {
		let prev = 0
		for (let end = 3; end <= 31; end++) {
			const share = periodShareOf(utc(2026, 5, 3), utc(2026, 5, end))
			expect(share).toBeGreaterThanOrEqual(prev)
			prev = share
		}
	})

	// S3: `computePayroll` gates on run STATUS only, never on period shape, so any legacy stored
	// pair still reaches this function on Recompute. Day counting one would yield >100% of a
	// month's statutory, or a negative share (negative deductions). Both keep the historical 0.5.
	it('falls back to a flat 0.5 for adversarial legacy pairs, never > 1 or negative', () => {
		const adversarial: [Date, Date][] = [
			[utc(2026, 5, 1), utc(2026, 6, 15)], // cross-month, 46 days
			[utc(2026, 5, 1), utc(2026, 7, 31)], // cross-month, 92 days
			[utc(2026, 5, 21), utc(2026, 5, 13)], // reversed inside one month
			[utc(2026, 6, 1), utc(2026, 5, 1)], // reversed across months
			[utc(2026, 5, 1), utc(2027, 5, 1)] // same month number, different year
		]
		for (const [start, end] of adversarial) {
			const share = periodShareOf(start, end)
			expect(share).toBe(0.5)
			expect(share).toBeGreaterThan(0)
			expect(share).toBeLessThanOrEqual(1)
		}
	})

	// #3: a cross-month range under the cap is no longer a flat 0.5 — it carries the fraction it
	// actually covers. Only over-cap and reversed rows keep the historical half.
	it('prorates a valid cross-month range by the summed month slices', () => {
		expect(periodShareOf(utc(2026, 5, 20), utc(2026, 6, 5))).toBe(12 / 31 + 5 / 30)
		expect(periodShareOf(utc(2026, 12, 26), utc(2027, 1, 10))).toBe(6 / 31 + 10 / 31)
		expect(periodShareOf(utc(2026, 12, 26), utc(2027, 1, 25))).toBe(1) // the cap, exactly
	})

	// The closed money bound. `earnings.ts` multiplies basic pay by this share with no second clamp
	// downstream, so nothing above 1 may ever leave this function. The bare 1, no tolerance.
	it('is > 0 and <= 1 for every input — cross-month, legacy and reversed alike', () => {
		const inputs: [Date, Date][] = [
			[utc(2026, 5, 21), utc(2026, 5, 13)], // reversed inside one month
			[utc(2026, 6, 1), utc(2026, 5, 1)], // reversed across months
			[utc(2026, 5, 1), utc(2026, 6, 15)], // legacy cross-month, over the cap
			[utc(2026, 5, 1), utc(2026, 7, 31)], // legacy cross-month, three months
			[utc(2026, 5, 1), utc(2027, 5, 1)] // same month number, different year
		]
		// Either side of the cap: every start day in December 2026 against every end day in January.
		for (let startDay = 1; startDay <= 31; startDay++) {
			for (let endDay = 1; endDay <= 31; endDay++) {
				inputs.push([utc(2026, 12, startDay), utc(2027, 1, endDay)])
			}
		}
		for (const [start, end] of inputs) {
			const share = periodShareOf(start, end)
			expect(share).toBeGreaterThan(0)
			expect(share).toBeLessThanOrEqual(1)
		}
	})
})

describe('summedMonthShare', () => {
	it('sums the slice of each month the range touches', () => {
		expect(summedMonthShare(utc(2026, 12, 26), utc(2027, 1, 10))).toBe(6 / 31 + 10 / 31)
		expect(summedMonthShare(utc(2026, 5, 20), utc(2026, 6, 5))).toBe(12 / 31 + 5 / 30)
	})

	// The cap boundary. This is asserted as an exact equality, not a tolerance — the exhaustive
	// sweep below is what earns the right to do that.
	it('is exactly 1 for 26 Dec 2026 → 25 Jan 2027', () => {
		expect(summedMonthShare(utc(2026, 12, 26), utc(2027, 1, 25))).toBe(1)
	})

	it('goes over the cap for ranges longer than one month of pay', () => {
		expect(summedMonthShare(utc(2026, 2, 1), utc(2026, 3, 3))).toBe(28 / 28 + 3 / 31) // ≈ 1.0968
		expect(summedMonthShare(utc(2026, 1, 31), utc(2026, 3, 1))).toBe(1 / 31 + 28 / 28 + 1 / 31) // ≈ 1.0645
	})

	it('is 0 for a reversed range, and never throws', () => {
		expect(summedMonthShare(utc(2026, 5, 21), utc(2026, 5, 13))).toBe(0)
		expect(summedMonthShare(utc(2026, 6, 1), utc(2026, 5, 1))).toBe(0)
	})

	// The identity that keeps the #163 peso goldens still: for a same-month range the sum is one
	// term, with the same numerator and the same divisor as before.
	it('equals periodDays ÷ daysInMonth for every same-month range in May 2026', () => {
		for (let start = 1; start <= 31; start++) {
			for (let end = start; end <= 31; end++) {
				const s = utc(2026, 5, start)
				const e = utc(2026, 5, end)
				expect(summedMonthShare(s, e)).toBe(periodDays(s, e) / 31)
			}
		}
	})
})

// The cap comparison is the bare `share > 1` — no constant, no epsilon. A tolerance would only be
// needed if some range's slices summed to exactly 1 in exact arithmetic but landed above 1 in
// IEEE-754. This enumerates the WHOLE tuple space to show no such range exists, so the property is
// held by a test rather than by a paragraph. It is exhaustive by construction, not by sampling: a
// cross-month range's slices are always a partial first month, zero or more whole middle months and
// a partial last month, with every month length drawn from {28, 29, 30, 31}. Two whole middle
// months already sum above 2, so they cannot bear on the boundary and get one spot-check family.
describe('the cap needs no tolerance', () => {
	const MONTH_LENGTHS = [28, 29, 30, 31]

	/** Every slice tuple, as [daysInSlice, daysInMonth] pairs in month order. */
	function everyTuple(): [number, number][][] {
		const tuples: [number, number][][] = []
		for (const n1 of MONTH_LENGTHS) {
			for (let k1 = 1; k1 <= n1; k1++) {
				for (const n3 of MONTH_LENGTHS) {
					for (let k3 = 1; k3 <= n3; k3++) {
						tuples.push([
							[k1, n1],
							[k3, n3]
						]) // two months
						for (const nm of MONTH_LENGTHS) {
							tuples.push([
								[k1, n1],
								[nm, nm],
								[k3, n3]
							]) // one whole middle month
						}
					}
				}
			}
		}
		// Spot check: two whole middle months, every month-length combination.
		for (const a of MONTH_LENGTHS) {
			for (const b of MONTH_LENGTHS) {
				for (const c of MONTH_LENGTHS) {
					for (const d of MONTH_LENGTHS) {
						tuples.push([
							[a, a],
							[b, b],
							[c, c],
							[d, d]
						])
					}
				}
			}
		}
		return tuples
	}

	/** The float sum, accumulated exactly the way `summedMonthShare` does it — order matters. */
	function floatSum(tuple: [number, number][]): number {
		let acc = 0
		for (const [k, n] of tuple) acc += k / n
		return acc
	}

	/** The exact rational sum, compared against 1 over a common denominator. */
	function exactVsOne(tuple: [number, number][]): -1 | 0 | 1 {
		let denominator = 1n
		for (const [, n] of tuple) denominator *= BigInt(n)
		let numerator = 0n
		for (const [k, n] of tuple) numerator += BigInt(k) * (denominator / BigInt(n))
		if (numerator > denominator) return 1
		if (numerator < denominator) return -1
		return 0
	}

	const TUPLES = everyTuple()

	// A canary on the enumeration itself, written as its derivation: (28+29+30+31) = 118 first-month
	// slices × 118 last-month slices, with no middle month or with one of four middle-month lengths,
	// plus the 4^4 two-whole-middle-month spot checks. If these numbers move, the loop bounds changed
	// — check them before touching the assertions below.
	it('enumerates every tuple, 116 of which sum to exactly one month', () => {
		expect(TUPLES.length).toBe(118 ** 2 + 4 * 118 ** 2 + 4 ** 4)
		expect(TUPLES.filter((t) => exactVsOne(t) === 0).length).toBe(116)
	})

	it('never refuses a range whose exact sum is at or below one month', () => {
		const wrongRefusals = TUPLES.filter((t) => floatSum(t) > 1 && exactVsOne(t) <= 0)
		expect(wrongRefusals).toEqual([])
	})

	// The dangerous direction: an over-cap range slipping past the gate.
	it('never accepts a range whose exact sum is above one month', () => {
		const wrongAccepts = TUPLES.filter((t) => floatSum(t) <= 1 && exactVsOne(t) > 0)
		expect(wrongAccepts).toEqual([])
	})

	it('lands every exactly-one-month tuple on the float 1, so no epsilon is needed', () => {
		const exactlyOne = TUPLES.filter((t) => exactVsOne(t) === 0)
		expect(exactlyOne.filter((t) => floatSum(t) !== 1)).toEqual([])
	})
})

describe('customRangeError', () => {
	const CAP_MESSAGE_110 =
		'A custom period cannot cover more than one month of pay. This range covers 110% of a month. Shorten it.'

	it('accepts the standard shapes and a valid cross-month range', () => {
		for (const kind of ['FIRST_HALF', 'SECOND_HALF', 'WHOLE_MONTH'] as const) {
			const { periodStart, periodEnd } = periodOf(kind, 2026, 4)
			expect(customRangeError(periodStart, periodEnd)).toBeNull()
		}
		expect(customRangeError(utc(2026, 5, 20), utc(2026, 6, 5))).toBeNull()
		expect(customRangeError(utc(2026, 12, 26), utc(2027, 1, 25))).toBeNull() // exactly the cap
		// Re-homed from the deleted `isSameMonthRange` describe: a custom same-month range and a
		// single day are both still legal, and the accept decision now lives here.
		expect(customRangeError(utc(2026, 5, 13), utc(2026, 5, 21))).toBeNull()
		expect(customRangeError(utc(2026, 5, 13), utc(2026, 5, 13))).toBeNull()
	})

	// The reversed check runs FIRST: a reversed range has a share of 0 and would otherwise fall
	// through the cap test as acceptable.
	it('refuses a reversed range before it looks at the size', () => {
		expect(customRangeError(utc(2026, 5, 21), utc(2026, 5, 13))).toBe(
			'End date must be on or after the start date.'
		)
	})

	// The whole string, not a substring — a copy drift must fail here, not in a browser.
	it('refuses an over-cap range with the size-cap copy naming the percentage', () => {
		expect(customRangeError(utc(2026, 2, 1), utc(2026, 3, 3))).toBe(CAP_MESSAGE_110)
		expect(customRangeError(utc(2026, 1, 31), utc(2026, 3, 1))).toBe(
			'A custom period cannot cover more than one month of pay. This range covers 106% of a month. Shorten it.'
		)
		// Re-homed: `isSameMonthRange` refused 1 May 2026 → 1 May 2027 for being a different YEAR.
		// It is still refused, now for being twelve months of pay.
		expect(customRangeError(utc(2026, 5, 1), utc(2027, 5, 1))).toBe(
			'A custom period cannot cover more than one month of pay. This range covers 1203% of a month. Shorten it.'
		)
	})
})

describe('periodDays', () => {
	it('counts inclusive days', () => {
		expect(periodDays(...halves('FIRST_HALF'))).toBe(15)
		expect(periodDays(...halves('SECOND_HALF'))).toBe(16) // May 16–31
		expect(periodDays(...halves('WHOLE_MONTH'))).toBe(31)
	})
})

describe('formatting helpers', () => {
	it('formatPeriodPreview reads as a human range', () => {
		expect(formatPeriodPreview(...halves('FIRST_HALF'))).toBe('May 1 – May 15, 2026 (15 days)')
	})
	it('monthYearLabel names the month the cutoff refusal has to point at', () => {
		expect(monthYearLabel(2026, 5)).toBe('June 2026')
	})
	it('toPeriodInputValue yields YYYY-MM-DD', () => {
		expect(toPeriodInputValue(utc(2026, 5, 1))).toBe('2026-05-01')
		expect(toPeriodInputValue(utc(2026, 2, 28))).toBe('2026-02-28')
	})
})

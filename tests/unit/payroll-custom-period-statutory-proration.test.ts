import { describe, it, expect } from 'vitest'
import {
	computeEmployeeResult,
	type EmployeeComputeConfig
} from '$lib/server/services/payroll/calculator'
import {
	emptyAttendance,
	type EmployeeComp,
	type AttendanceInput
} from '$lib/server/services/payroll/types'
import { periodShareOf, customRangeError } from '$lib/utils/pay-periods'

/**
 * #163 criteria 5 and 6 — a custom range takes its DAY-COUNT slice of the monthly statutory
 * figures, not the flat semi-monthly half it used to take.
 */

const comp: EmployeeComp = { basicMonthlySalary: 30000, rateType: 'MONTHLY' }
const att = (over: Partial<AttendanceInput> = {}): AttendanceInput => ({
	...emptyAttendance(),
	...over
})
const cfg = (over: Partial<EmployeeComputeConfig> = {}): EmployeeComputeConfig => ({
	taxableByCode: new Map([['BASIC', true]]),
	periodShare: 0.5,
	loans: [],
	cashAdvances: [],
	...over
})

// Monthly figures for a 30,000 MONTHLY employee (see payroll-calculator.test.ts).
const MONTHLY = { sssEe: 900, philhealthEe: 750, pagibigEe: 200, withholdingTax: 1463.4 }
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('custom same-month range — statutory proration', () => {
	const share = periodShareOf(d('2026-05-03'), d('2026-05-09')) // 7 days of a 31-day May

	it('the share is 7/31, not 0.5', () => {
		expect(share).toBe(7 / 31)
	})

	it('takes 7/31 of each monthly contribution', () => {
		const r = computeEmployeeResult(
			comp,
			att({ regularHours: 56 }),
			{},
			cfg({ periodShare: share, periodKind: null })
		)
		expect(r.statutory.sssEe).toBeCloseTo(MONTHLY.sssEe * share, 2)
		expect(r.statutory.philhealthEe).toBeCloseTo(MONTHLY.philhealthEe * share, 2)
		expect(r.statutory.pagibigEe).toBeCloseTo(MONTHLY.pagibigEe * share, 2)
		expect(r.statutory.withholdingTax).toBeCloseTo(MONTHLY.withholdingTax * share, 2)
	})

	it('is well under the half a semi-monthly cutoff would have taken', () => {
		const custom = computeEmployeeResult(
			comp,
			att({ regularHours: 56 }),
			{},
			cfg({ periodShare: share, periodKind: null })
		)
		const half = computeEmployeeResult(
			comp,
			att({ regularHours: 88 }),
			{},
			cfg({ periodShare: 0.5, periodKind: 'FIRST_HALF' })
		)
		expect(custom.statutory.sssEe).toBeGreaterThan(0)
		expect(custom.statutory.sssEe).toBeLessThan(half.statutory.sssEe)
		expect(half.statutory.sssEe).toBe(450) // the frozen half — unchanged by #163
	})

	it('prorates the employer share and the withholding tax the same way', () => {
		const r = computeEmployeeResult(
			comp,
			att({ regularHours: 56 }),
			{},
			cfg({ periodShare: share, periodKind: null })
		)
		expect(r.statutory.sssEr).toBeGreaterThan(0)
		expect(r.statutory.sssEr).toBeLessThan(
			computeEmployeeResult(comp, att({ regularHours: 88 }), {}, cfg({ periodShare: 0.5 }))
				.statutory.sssEr
		)
	})

	// A 45-day range cannot reach the engine at all. #3 lets a range cross a month boundary, but
	// the SIZE cap still refuses this one — 31/31 + 14/30 = 1.4667 — rather than letting a >100%
	// share exist. The mechanism changed; the intent did not.
	it('a 45-day range is refused by the size cap, never prorated', () => {
		expect(customRangeError(d('2026-05-01'), d('2026-06-14'))).toBe(
			'A custom period cannot cover more than one month of pay. This range covers 147% of a month. Shorten it.'
		)
		// And if such a row somehow already exists, `periodShareOf` keeps its historical flat half
		// (D6) rather than being clamped up to a full month's pay.
		expect(periodShareOf(d('2026-05-01'), d('2026-06-14'))).toBe(0.5)
	})
})

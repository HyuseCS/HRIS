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

/**
 * #163 × #173 Feature E — where the employee's statutory share lands when the run is a CUSTOM
 * range.
 *
 * FIRST/SECOND load the WHOLE monthly EE contribution onto one designated cutoff. A custom range
 * is not that cutoff, so it must take ZERO: otherwise a month with an off-cycle run would collect
 * more than 100% of the monthly EE contribution. The cutoff run itself still takes the full month.
 *
 * The guard rail: WHOLE_MONTH and `undefined` (the preview, which never supplies a kind) are
 * resolved FIRST and stay on `× share`. Neither may ever fall into the ZERO branch.
 * ER share and withholding tax always keep `× share`.
 *
 * Round 2: the ZERO is safe because a custom range can no longer overlap a designated cutoff
 * window — `assertCustomRangeClearOfCutoff` refuses it with a 400, so the cutoff run that collects
 * the month is always still creatable. See payroll-custom-range-cutoff-guard.test.ts.
 */

const comp: EmployeeComp = { basicMonthlySalary: 30000, rateType: 'MONTHLY' }
const att = (over: Partial<AttendanceInput> = {}): AttendanceInput => ({
	...emptyAttendance(),
	...over
})
const base = (over: Partial<EmployeeComputeConfig> = {}): EmployeeComputeConfig => ({
	taxableByCode: new Map([['BASIC', true]]),
	periodShare: 0.5,
	loans: [],
	cashAdvances: [],
	...over
})

const MONTHLY_SSS_EE = 900
const CUSTOM_SHARE = 7 / 31
const firstAlloc = { sss: 'FIRST' as const, philhealth: 'EVEN' as const, pagibig: 'EVEN' as const }

const run = (over: Partial<EmployeeComputeConfig>) =>
	computeEmployeeResult(comp, att({ regularHours: 56 }), {}, base(over))

describe('resolveEE for a custom range', () => {
	it('kind null + FIRST → zero EE (the cutoff run collects it instead)', () => {
		const r = run({
			periodShare: CUSTOM_SHARE,
			periodKind: null,
			statutoryAllocations: firstAlloc
		})
		expect(r.statutory.sssEe).toBe(0)
		// ER share and tax are untouched by the allocation — still × share.
		expect(r.statutory.sssEr).toBeGreaterThan(0)
		expect(r.statutory.withholdingTax).toBeCloseTo(1463.4 * CUSTOM_SHARE, 2)
	})

	it('kind FIRST_HALF + FIRST → the full monthly EE', () => {
		const r = run({ periodShare: 0.5, periodKind: 'FIRST_HALF', statutoryAllocations: firstAlloc })
		expect(r.statutory.sssEe).toBe(MONTHLY_SSS_EE)
	})

	it('kind SECOND_HALF + FIRST → zero, as before', () => {
		const r = run({ periodShare: 0.5, periodKind: 'SECOND_HALF', statutoryAllocations: firstAlloc })
		expect(r.statutory.sssEe).toBe(0)
	})

	// The guard rail. WHOLE_MONTH is resolved before the FIRST/SECOND branches, so an adjustment
	// run keeps taking its `× share` slice even under a FIRST allocation.
	it('kind WHOLE_MONTH + FIRST → monthly × share', () => {
		const r = run({ periodShare: 1, periodKind: 'WHOLE_MONTH', statutoryAllocations: firstAlloc })
		expect(r.statutory.sssEe).toBe(MONTHLY_SSS_EE * 1)
	})

	it('kind undefined (the preview path) + FIRST → monthly × share', () => {
		const r = run({ periodShare: 0.5, statutoryAllocations: firstAlloc })
		expect(r.statutory.sssEe).toBe(MONTHLY_SSS_EE * 0.5)
	})

	it('kind null + EVEN → monthly × share', () => {
		const r = run({ periodShare: CUSTOM_SHARE, periodKind: null })
		expect(r.statutory.sssEe).toBeCloseTo(MONTHLY_SSS_EE * CUSTOM_SHARE, 2)
		expect(r.statutory.sssEr).toBeGreaterThan(0)
		expect(r.statutory.withholdingTax).toBeCloseTo(1463.4 * CUSTOM_SHARE, 2)
	})

	it('a month never exceeds 100% of the monthly EE: custom + cutoff = one month', () => {
		const custom = run({
			periodShare: CUSTOM_SHARE,
			periodKind: null,
			statutoryAllocations: firstAlloc
		})
		const cutoff = run({
			periodShare: 0.5,
			periodKind: 'FIRST_HALF',
			statutoryAllocations: firstAlloc
		})
		const other = run({
			periodShare: 0.5,
			periodKind: 'SECOND_HALF',
			statutoryAllocations: firstAlloc
		})
		expect(custom.statutory.sssEe + cutoff.statutory.sssEe + other.statutory.sssEe).toBe(
			MONTHLY_SSS_EE
		)
	})
})

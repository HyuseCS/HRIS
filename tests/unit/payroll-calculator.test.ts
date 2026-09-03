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
import { periodShareOf, periodOf } from '$lib/utils/pay-periods'

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

// #121: a MONTHLY employee is on a fixed salary, so basic is `salary × periodShare` (30000 × 0.5)
// rather than `regularHours × hourlyRate`. 88h is the fully-rendered semi-monthly schedule
// (22 × 8 × 0.5), which keeps these baselines free of ABSENCE deductions.
const FULL_PERIOD_HOURS = 88

describe('computeEmployeeResult (shared run/calculator engine)', () => {
	it('computes gross, prorated statutory, and net for a monthly employee', () => {
		const r = computeEmployeeResult(comp, att({ regularHours: FULL_PERIOD_HOURS }), {}, cfg())
		expect(r.grossPay).toBeCloseTo(15000, 2)
		expect(r.basicPay).toBeCloseTo(15000, 2)
		// monthly statutory (SSS 900 / PH 750 / PI 200 / tax 1463.4) × 0.5 period share
		expect(r.statutory.sssEe).toBeCloseTo(450, 2)
		expect(r.statutory.philhealthEe).toBeCloseTo(375, 2)
		expect(r.statutory.pagibigEe).toBeCloseTo(100, 2)
		expect(r.statutory.withholdingTax).toBeCloseTo(731.7, 2)
		expect(r.totalDeductions).toBeCloseTo(1656.7, 2)
		expect(r.netPay).toBeCloseTo(r.grossPay - r.totalDeductions, 2)
	})

	it('honors taxability from config (BASIC set non-taxable → taxableGross 0)', () => {
		const r = computeEmployeeResult(
			comp,
			att({ regularHours: 80 }),
			{},
			cfg({ taxableByCode: new Map([['BASIC', false]]) })
		)
		expect(r.taxableGross).toBe(0)
		expect(r.earnings.find((c) => c.code === 'BASIC')?.taxable).toBe(false)
	})

	it('deducts a loan installment on top of statutory', () => {
		const r = computeEmployeeResult(
			comp,
			att({ regularHours: FULL_PERIOD_HOURS }),
			{},
			cfg({ loans: [{ refId: 'L1', label: 'Loan', installment: 1000, balance: 3000 }] })
		)
		expect(r.deductions.find((c) => c.code === 'LOAN')?.amount).toBe(1000)
		expect(r.totalDeductions).toBeCloseTo(1656.7 + 1000, 2)
		expect(r.netPay).toBeCloseTo(r.grossPay - r.totalDeductions, 2)
	})

	// #129: computePayroll now derives periodShare from the run's ACTUAL period shape
	// (WHOLE_MONTH → 1, either half → 0.5) instead of the org-wide payFrequency. This asserts
	// the two shares flow through the shared engine to the expected full vs half statutory.
	it('prorates statutory by the period kind (whole month = 2× a half period)', () => {
		const may = 4
		const firstHalf = periodOf('FIRST_HALF', 2026, may)
		const whole = periodOf('WHOLE_MONTH', 2026, may)
		expect(periodShareOf(firstHalf.periodStart, firstHalf.periodEnd)).toBe(0.5)
		expect(periodShareOf(whole.periodStart, whole.periodEnd)).toBe(1)
		// #163: a custom same-month range prorates by day count instead — 7 days of a 31-day May.
		expect(periodShareOf(new Date(Date.UTC(2026, 4, 3)), new Date(Date.UTC(2026, 4, 9)))).toBe(
			7 / 31
		)

		const half = computeEmployeeResult(
			comp,
			att({ regularHours: FULL_PERIOD_HOURS }),
			{},
			cfg({ periodShare: 0.5 })
		)
		const full = computeEmployeeResult(
			comp,
			att({ regularHours: FULL_PERIOD_HOURS * 2 }),
			{},
			cfg({ periodShare: 1 })
		)
		// A whole-month run carries the full monthly statutory — exactly double the half period's.
		expect(full.statutory.sssEe).toBeCloseTo(half.statutory.sssEe * 2, 2)
		expect(full.statutory.philhealthEe).toBeCloseTo(half.statutory.philhealthEe * 2, 2)
		expect(full.statutory.pagibigEe).toBeCloseTo(half.statutory.pagibigEe * 2, 2)
	})

	it('is deterministic for identical inputs (calculator == run guarantee)', () => {
		const a = computeEmployeeResult(
			comp,
			att({ regularHours: 80, overtimeHours: 5 }),
			{ allowances: 1000 },
			cfg()
		)
		const b = computeEmployeeResult(
			comp,
			att({ regularHours: 80, overtimeHours: 5 }),
			{ allowances: 1000 },
			cfg()
		)
		expect(a).toEqual(b)
	})
})

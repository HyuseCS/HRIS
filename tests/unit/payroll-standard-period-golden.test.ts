// #163 GOLDEN TRIPWIRE — captured on unmodified source BEFORE flexible calendar periods landed.
//
// NEVER re-run this file with `-u`. The whole point is that the three standard pay-period
// shapes (1–15, 16–EOM, 1–EOM) keep producing byte-identical pesos after `periodShareOf`
// learns day-count proration for custom ranges. If a snapshot below goes red, a standard
// period has silently moved (e.g. May 1–15 drifting from 0.5 to 15/31) — that is a real
// regression. Fix the source, not the snapshot.
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
import { periodShareOf, periodOf, type PeriodKind } from '$lib/utils/pay-periods'

// Fixtures copied verbatim from tests/unit/payroll-calculator.test.ts:13-23.
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

/** A half period schedules 88h (22 working days × 8 × 0.5); a whole month, double. */
const HALF_PERIOD_HOURS = 88

function snapshotOf(
	kind: PeriodKind,
	year: number,
	month0: number,
	over: Partial<EmployeeComputeConfig> = {}
) {
	const { periodStart, periodEnd } = periodOf(kind, year, month0)
	const periodShare = periodShareOf(periodStart, periodEnd)
	const r = computeEmployeeResult(
		comp,
		att({ regularHours: HALF_PERIOD_HOURS * (periodShare / 0.5) }),
		{},
		cfg({
			periodShare,
			periodKind: kind,
			loans: [{ refId: 'L1', label: 'Loan', installment: 1000, balance: 3000 }],
			...over
		})
	)
	return {
		periodShare,
		basicPay: r.basicPay,
		grossPay: r.grossPay,
		taxableGross: r.taxableGross,
		statutory: r.statutory,
		earnings: r.earnings.map((c) => [c.code, c.amount]),
		deductions: r.deductions.map((c) => [c.code, c.amount]),
		totalDeductions: r.totalDeductions,
		netPay: r.netPay,
		uncollected: r.uncollected
	}
}

const MAY = 4 // 31 days
const FEB = 1 // 28 days in 2026

describe('#163 golden — standard periods produce byte-identical pesos', () => {
	it('May 2026 (31 days) FIRST_HALF', () => {
		expect(snapshotOf('FIRST_HALF', 2026, MAY)).toMatchInlineSnapshot(`
			{
			  "basicPay": 15000,
			  "deductions": [
			    [
			      "SSS_EE",
			      450,
			    ],
			    [
			      "PHILHEALTH_EE",
			      375,
			    ],
			    [
			      "PAGIBIG_EE",
			      100,
			    ],
			    [
			      "TAX",
			      731.7,
			    ],
			    [
			      "LOAN",
			      1000,
			    ],
			  ],
			  "earnings": [
			    [
			      "BASIC",
			      15000,
			    ],
			  ],
			  "grossPay": 15000,
			  "netPay": 12343.3,
			  "periodShare": 0.5,
			  "statutory": {
			    "pagibigEe": 100,
			    "pagibigEr": 100,
			    "philhealthEe": 375,
			    "philhealthEr": 375,
			    "sssEe": 450,
			    "sssEr": 990,
			    "withholdingTax": 731.7,
			  },
			  "taxableGross": 15000,
			  "totalDeductions": 2656.7,
			  "uncollected": 0,
			}
		`)
	})
	it('May 2026 (31 days) SECOND_HALF', () => {
		expect(snapshotOf('SECOND_HALF', 2026, MAY)).toMatchInlineSnapshot(`
			{
			  "basicPay": 15000,
			  "deductions": [
			    [
			      "SSS_EE",
			      450,
			    ],
			    [
			      "PHILHEALTH_EE",
			      375,
			    ],
			    [
			      "PAGIBIG_EE",
			      100,
			    ],
			    [
			      "TAX",
			      731.7,
			    ],
			    [
			      "LOAN",
			      1000,
			    ],
			  ],
			  "earnings": [
			    [
			      "BASIC",
			      15000,
			    ],
			  ],
			  "grossPay": 15000,
			  "netPay": 12343.3,
			  "periodShare": 0.5,
			  "statutory": {
			    "pagibigEe": 100,
			    "pagibigEr": 100,
			    "philhealthEe": 375,
			    "philhealthEr": 375,
			    "sssEe": 450,
			    "sssEr": 990,
			    "withholdingTax": 731.7,
			  },
			  "taxableGross": 15000,
			  "totalDeductions": 2656.7,
			  "uncollected": 0,
			}
		`)
	})
	it('May 2026 (31 days) WHOLE_MONTH', () => {
		expect(snapshotOf('WHOLE_MONTH', 2026, MAY)).toMatchInlineSnapshot(`
			{
			  "basicPay": 30000,
			  "deductions": [
			    [
			      "SSS_EE",
			      900,
			    ],
			    [
			      "PHILHEALTH_EE",
			      750,
			    ],
			    [
			      "PAGIBIG_EE",
			      200,
			    ],
			    [
			      "TAX",
			      1463.4,
			    ],
			    [
			      "LOAN",
			      1000,
			    ],
			  ],
			  "earnings": [
			    [
			      "BASIC",
			      30000,
			    ],
			  ],
			  "grossPay": 30000,
			  "netPay": 25686.6,
			  "periodShare": 1,
			  "statutory": {
			    "pagibigEe": 200,
			    "pagibigEr": 200,
			    "philhealthEe": 750,
			    "philhealthEr": 750,
			    "sssEe": 900,
			    "sssEr": 1980,
			    "withholdingTax": 1463.4,
			  },
			  "taxableGross": 30000,
			  "totalDeductions": 4313.4,
			  "uncollected": 0,
			}
		`)
	})
	it('February 2026 (28 days) FIRST_HALF', () => {
		expect(snapshotOf('FIRST_HALF', 2026, FEB)).toMatchInlineSnapshot(`
			{
			  "basicPay": 15000,
			  "deductions": [
			    [
			      "SSS_EE",
			      450,
			    ],
			    [
			      "PHILHEALTH_EE",
			      375,
			    ],
			    [
			      "PAGIBIG_EE",
			      100,
			    ],
			    [
			      "TAX",
			      731.7,
			    ],
			    [
			      "LOAN",
			      1000,
			    ],
			  ],
			  "earnings": [
			    [
			      "BASIC",
			      15000,
			    ],
			  ],
			  "grossPay": 15000,
			  "netPay": 12343.3,
			  "periodShare": 0.5,
			  "statutory": {
			    "pagibigEe": 100,
			    "pagibigEr": 100,
			    "philhealthEe": 375,
			    "philhealthEr": 375,
			    "sssEe": 450,
			    "sssEr": 990,
			    "withholdingTax": 731.7,
			  },
			  "taxableGross": 15000,
			  "totalDeductions": 2656.7,
			  "uncollected": 0,
			}
		`)
	})
	it('February 2026 (28 days) SECOND_HALF', () => {
		expect(snapshotOf('SECOND_HALF', 2026, FEB)).toMatchInlineSnapshot(`
			{
			  "basicPay": 15000,
			  "deductions": [
			    [
			      "SSS_EE",
			      450,
			    ],
			    [
			      "PHILHEALTH_EE",
			      375,
			    ],
			    [
			      "PAGIBIG_EE",
			      100,
			    ],
			    [
			      "TAX",
			      731.7,
			    ],
			    [
			      "LOAN",
			      1000,
			    ],
			  ],
			  "earnings": [
			    [
			      "BASIC",
			      15000,
			    ],
			  ],
			  "grossPay": 15000,
			  "netPay": 12343.3,
			  "periodShare": 0.5,
			  "statutory": {
			    "pagibigEe": 100,
			    "pagibigEr": 100,
			    "philhealthEe": 375,
			    "philhealthEr": 375,
			    "sssEe": 450,
			    "sssEr": 990,
			    "withholdingTax": 731.7,
			  },
			  "taxableGross": 15000,
			  "totalDeductions": 2656.7,
			  "uncollected": 0,
			}
		`)
	})
	it('February 2026 (28 days) WHOLE_MONTH', () => {
		expect(snapshotOf('WHOLE_MONTH', 2026, FEB)).toMatchInlineSnapshot(`
			{
			  "basicPay": 30000,
			  "deductions": [
			    [
			      "SSS_EE",
			      900,
			    ],
			    [
			      "PHILHEALTH_EE",
			      750,
			    ],
			    [
			      "PAGIBIG_EE",
			      200,
			    ],
			    [
			      "TAX",
			      1463.4,
			    ],
			    [
			      "LOAN",
			      1000,
			    ],
			  ],
			  "earnings": [
			    [
			      "BASIC",
			      30000,
			    ],
			  ],
			  "grossPay": 30000,
			  "netPay": 25686.6,
			  "periodShare": 1,
			  "statutory": {
			    "pagibigEe": 200,
			    "pagibigEr": 200,
			    "philhealthEe": 750,
			    "philhealthEr": 750,
			    "sssEe": 900,
			    "sssEr": 1980,
			    "withholdingTax": 1463.4,
			  },
			  "taxableGross": 30000,
			  "totalDeductions": 4313.4,
			  "uncollected": 0,
			}
		`)
	})

	// #173 Feature E: the whole monthly SSS EE lands on the 1–15 cutoff and nothing on 16–EOM.
	// The resolveEE reorder in this issue must leave both of these untouched.
	it('May 2026 FIRST_HALF with SSS allocated to the FIRST cutoff', () => {
		expect(
			snapshotOf('FIRST_HALF', 2026, MAY, {
				statutoryAllocations: { sss: 'FIRST', philhealth: 'EVEN', pagibig: 'EVEN' }
			})
		).toMatchInlineSnapshot(`
			{
			  "basicPay": 15000,
			  "deductions": [
			    [
			      "SSS_EE",
			      900,
			    ],
			    [
			      "PHILHEALTH_EE",
			      375,
			    ],
			    [
			      "PAGIBIG_EE",
			      100,
			    ],
			    [
			      "TAX",
			      731.7,
			    ],
			    [
			      "LOAN",
			      1000,
			    ],
			  ],
			  "earnings": [
			    [
			      "BASIC",
			      15000,
			    ],
			  ],
			  "grossPay": 15000,
			  "netPay": 11893.3,
			  "periodShare": 0.5,
			  "statutory": {
			    "pagibigEe": 100,
			    "pagibigEr": 100,
			    "philhealthEe": 375,
			    "philhealthEr": 375,
			    "sssEe": 900,
			    "sssEr": 990,
			    "withholdingTax": 731.7,
			  },
			  "taxableGross": 15000,
			  "totalDeductions": 3106.7,
			  "uncollected": 0,
			}
		`)
	})
	it('May 2026 SECOND_HALF with SSS allocated to the FIRST cutoff', () => {
		expect(
			snapshotOf('SECOND_HALF', 2026, MAY, {
				statutoryAllocations: { sss: 'FIRST', philhealth: 'EVEN', pagibig: 'EVEN' }
			})
		).toMatchInlineSnapshot(`
			{
			  "basicPay": 15000,
			  "deductions": [
			    [
			      "PHILHEALTH_EE",
			      375,
			    ],
			    [
			      "PAGIBIG_EE",
			      100,
			    ],
			    [
			      "TAX",
			      731.7,
			    ],
			    [
			      "LOAN",
			      1000,
			    ],
			  ],
			  "earnings": [
			    [
			      "BASIC",
			      15000,
			    ],
			  ],
			  "grossPay": 15000,
			  "netPay": 12793.3,
			  "periodShare": 0.5,
			  "statutory": {
			    "pagibigEe": 100,
			    "pagibigEr": 100,
			    "philhealthEe": 375,
			    "philhealthEr": 375,
			    "sssEe": 0,
			    "sssEr": 990,
			    "withholdingTax": 731.7,
			  },
			  "taxableGross": 15000,
			  "totalDeductions": 2206.7,
			  "uncollected": 0,
			}
		`)
	})
})

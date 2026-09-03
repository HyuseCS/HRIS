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
import { D, q2n } from '$lib/server/services/payroll/money'
import { periodShareOf } from '$lib/utils/pay-periods'

/**
 * #163 criterion 8 — the reason the installment is prorated at all. Before #163 every run took
 * the FULL flat installment, so four short off-cycle runs inside one month would have collected
 * four months of amortization from one month's pay. Prorated, the same four runs collect
 * 4 × 7/31 ≈ 0.90 of a single installment: under one month's worth, never over.
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

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const INSTALLMENT = 1000

// Four consecutive 7-day runs inside May 2026.
const RUNS: [string, string][] = [
	['2026-05-01', '2026-05-07'],
	['2026-05-08', '2026-05-14'],
	['2026-05-15', '2026-05-21'],
	['2026-05-22', '2026-05-28']
]

describe('four short custom runs in one month', () => {
	it('collect less than one whole installment between them', () => {
		let collected = 0
		for (const [start, end] of RUNS) {
			const share = periodShareOf(d(start), d(end))
			expect(share).toBe(7 / 31)
			const scaled = q2n(D(INSTALLMENT).times(share)) // computePayroll's amortShare
			const r = computeEmployeeResult(
				comp,
				att({ regularHours: 56 }),
				{},
				cfg({
					periodShare: share,
					periodKind: null,
					loans: [{ refId: 'L1', label: 'Loan', installment: scaled, balance: 3000 }]
				})
			)
			collected += r.deductions.find((c) => c.code === 'LOAN')?.amount ?? 0
		}
		expect(collected).toBeLessThan(INSTALLMENT)
		expect(collected).toBeCloseTo(4 * INSTALLMENT * (7 / 31), 1) // ≈ 903
	})

	it('would have collected four installments without the proration', () => {
		let collected = 0
		for (const _ of RUNS) {
			const r = computeEmployeeResult(
				comp,
				att({ regularHours: 56 }),
				{},
				cfg({
					periodShare: 7 / 31,
					periodKind: null,
					loans: [{ refId: 'L1', label: 'Loan', installment: INSTALLMENT, balance: 10000 }]
				})
			)
			collected += r.deductions.find((c) => c.code === 'LOAN')?.amount ?? 0
		}
		expect(collected).toBe(4 * INSTALLMENT)
	})
})

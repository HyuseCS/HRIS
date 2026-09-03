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

/**
 * #163 criterion 7 — a loan / cash-advance installment is a flat MONTHLY figure. A custom range
 * collects a proportional slice of it; a standard period keeps taking the whole installment
 * exactly as before. `computePayroll` scales the installment before it reaches the engine
 * (`amortShare`), which is what these two cases mirror.
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

const loanOf = (installment: number) => [{ refId: 'L1', label: 'Loan', installment, balance: 3000 }]

describe('loan installment on a custom range', () => {
	it('collects 7/31 of a 1000 installment', () => {
		const share = 7 / 31
		const scaled = q2n(D(1000).times(share)) // what computePayroll passes in
		expect(scaled).toBe(225.81)
		const r = computeEmployeeResult(
			comp,
			att({ regularHours: 56 }),
			{},
			cfg({ periodShare: share, periodKind: null, loans: loanOf(scaled) })
		)
		expect(r.deductions.find((c) => c.code === 'LOAN')?.amount).toBe(225.81)
	})

	it('a standard half period still collects the whole 1000', () => {
		const r = computeEmployeeResult(
			comp,
			att({ regularHours: 88 }),
			{},
			cfg({ periodShare: 0.5, periodKind: 'FIRST_HALF', loans: loanOf(1000) })
		)
		expect(r.deductions.find((c) => c.code === 'LOAN')?.amount).toBe(1000)
	})

	it('a cash advance prorates identically', () => {
		const scaled = q2n(D(600).times(7 / 31))
		const r = computeEmployeeResult(
			comp,
			att({ regularHours: 56 }),
			{},
			cfg({
				periodShare: 7 / 31,
				periodKind: null,
				cashAdvances: [{ refId: 'A1', label: 'Cash advance', installment: scaled, balance: 3000 }]
			})
		)
		expect(r.deductions.find((c) => c.code === 'CASH_ADVANCE')?.amount).toBe(scaled)
	})
})

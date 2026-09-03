import { describe, it, expect } from 'vitest'
import {
	assemblePayslipDocument,
	type HydrateInput
} from '../../src/lib/server/services/payroll/payslip-document'

function baseInput(overrides: Partial<HydrateInput> = {}): HydrateInput {
	return {
		entry: {
			hoursWorked: 26,
			basicPay: 7020,
			grossPay: 9266.4,
			sssEe: 350,
			philhealthEe: 150,
			pagibigEe: 100,
			withholdingTax: 0,
			totalDeductions: 600,
			netPay: 8666.4,
			earnings: [],
			deductions: []
		},
		employee: {
			firstName: 'Lanie',
			lastName: 'Manzano',
			middleName: 'O',
			employeeNumber: '0005',
			jobTitle: 'Grillwoman',
			employmentType: 'REGULAR',
			basicMonthlySalary: 11880,
			rateType: 'MONTHLY'
		},
		organization: {
			name: 'Mr. Liempo',
			address: '58 Ortigas Extension Pasig City',
			logoUrl: null
		},
		run: {
			periodStart: new Date('2022-05-11T00:00:00Z'),
			periodEnd: new Date('2022-05-25T00:00:00Z'),
			approvedAt: new Date('2022-05-30T00:00:00Z'),
			releasedAt: new Date('2022-06-02T00:00:00Z')
		},
		attendance: {
			daysOfWork: 13,
			daysOfPresent: 13,
			lateMinutes: 0,
			overtimeHours: 0,
			restDayOtHours: 0,
			regularHolidayOtHours: 0,
			specialHolidayOtHours: 0
		},
		monthlyWorkingDays: 22,
		...overrides
	}
}

describe('assemblePayslipDocument', () => {
	it('formats company + employee identity from raw fields', () => {
		const doc = assemblePayslipDocument(baseInput())
		expect(doc.company.name).toBe('MR. LIEMPO')
		expect(doc.company.address).toBe('58 Ortigas Extension Pasig City')
		expect(doc.company.logoUrl).toBeNull()
		expect(doc.employee.fullName).toBe('MANZANO, LANIE O.')
		expect(doc.employee.position).toBe('GRILLWOMAN')
		expect(doc.employee.status).toBe('REGULAR')
		expect(doc.employee.employeeNumber).toBe('0005')
	})

	it('passes the org logoUrl through unchanged (renderer decides how to fetch)', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				organization: {
					name: 'X',
					address: null,
					logoUrl: 'https://example.com/logo.png'
				}
			})
		)
		expect(doc.company.logoUrl).toBe('https://example.com/logo.png')
	})

	it('maps employmentType to a human status label', () => {
		expect(
			assemblePayslipDocument(
				baseInput({ employee: { ...baseInput().employee, employmentType: 'PROBATIONARY' } })
			).employee.status
		).toBe('PROBATIONARY')
		expect(
			assemblePayslipDocument(
				baseInput({ employee: { ...baseInput().employee, employmentType: 'PART_TIME' } })
			).employee.status
		).toBe('PART TIME')
	})

	it('computes the daily rate from monthly salary and working days', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				employee: { ...baseInput().employee, basicMonthlySalary: 11880 },
				monthlyWorkingDays: 22
			})
		)
		expect(doc.period.dailyRate).toBe('540.00')
	})

	it('formats totals with two decimals + thousand separators', () => {
		const doc = assemblePayslipDocument(baseInput())
		expect(doc.totals.grossPay).toBe('9,266.40')
		expect(doc.totals.netPay).toBe('8,666.40')
		expect(doc.period.basicPay).toBe('7,020.00')
	})

	it('buckets 13TH_MONTH / INCENTIVE / PAID_LEAVE / holiday-* into adjustments and the rest into OTHERS', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				entry: {
					...baseInput().entry,
					earnings: [
						{ code: '13TH_MONTH', label: '13th Month', amount: 500 },
						{ code: 'INCENTIVE', label: 'Perfect Attendance', amount: 200 },
						{ code: 'PAID_LEAVE', label: 'VL Payout', amount: 100 },
						{ code: 'REG_HOLIDAY', label: 'Regular holiday', amount: 200 },
						{ code: 'SPECIAL_HOLIDAY', label: 'Special holiday', amount: 100 },
						{ code: 'CUSTOM_BONUS', label: 'Signing Bonus', amount: 1000 }
					]
				}
			})
		)
		expect(doc.adjustments.find((a) => a.label === '13TH MONTH')?.amount).toBe('500.00')
		expect(doc.adjustments.find((a) => a.label === 'INCENTIVE')?.amount).toBe('200.00')
		expect(doc.adjustments.find((a) => a.label === 'PAID LEAVES')?.amount).toBe('100.00')
		expect(doc.adjustments.find((a) => a.label === 'HOLIDAY PAY')?.amount).toBe('300.00')
		expect(doc.adjustments.find((a) => a.label === 'OTHERS')?.amount).toBe('1,000.00')
	})

	it('separates allowances out of OTHERS into the header summary', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				entry: {
					...baseInput().entry,
					earnings: [
						{ code: 'ALLOWANCE_MEAL', label: 'Meal Allowance', amount: 800 },
						{ code: 'ALLOWANCE_TRANSPORT', label: 'Transport', amount: 500 }
					]
				}
			})
		)
		expect(doc.summary.allowance).toBe('1,300.00')
		expect(doc.adjustments.find((a) => a.label === 'OTHERS')?.amount).toBe('0.00')
	})

	it('renders overtime rows per OT code (from attendance bucket hours) and sums into the header', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				entry: {
					...baseInput().entry,
					earnings: [
						{ code: 'OT', label: 'Overtime', amount: 2246.4 },
						{ code: 'REG_HOLIDAY_OT', label: 'Regular holiday OT', amount: 500 }
					]
				},
				attendance: {
					daysOfWork: 13,
					daysOfPresent: 13,
					lateMinutes: 0,
					overtimeHours: 26,
					restDayOtHours: 0,
					regularHolidayOtHours: 2,
					specialHolidayOtHours: 0
				}
			})
		)
		expect(doc.overtimeRows).toHaveLength(2)
		expect(doc.overtimeRows[0]).toEqual({ label: 'REGULAR', hours: '26', pay: '2,246.40' })
		expect(doc.overtimeRows[1]).toEqual({ label: 'REG HOLIDAY', hours: '2', pay: '500.00' })
		expect(doc.summary.overtime).toBe('2,746.40')
	})

	it('falls back to a REGULAR 0 row when the employee has no OT', () => {
		const doc = assemblePayslipDocument(baseInput())
		expect(doc.overtimeRows).toEqual([{ label: 'REGULAR', hours: '0', pay: '0.00' }])
		expect(doc.summary.overtime).toBe('0.00')
	})

	it('aggregates LOAN* deductions into a single LOAN row', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				entry: {
					...baseInput().entry,
					deductions: [
						{ code: 'LOAN_SSS', label: 'SSS Salary Loan', amount: 800 },
						{ code: 'LOAN_HDMF', label: 'Pag-IBIG MPL', amount: 200 }
					]
				}
			})
		)
		expect(doc.deductions.find((d) => d.label === 'LOAN')?.amount).toBe('1,000.00')
	})

	it('surfaces TARDINESS separately and routes everything else to deductions/OTHERS', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				entry: {
					...baseInput().entry,
					deductions: [
						{ code: 'TARDINESS', label: 'Late 15min', amount: 75 },
						{ code: 'UNIFORM', label: 'Uniform', amount: 300 }
					]
				}
			})
		)
		expect(doc.deductions.find((d) => d.label === 'TARDINESS')?.amount).toBe('75.00')
		expect(doc.deductions.find((d) => d.label === 'OTHERS')?.amount).toBe('300.00')
	})

	it('renders the statutory deductions from the PayrollEntry statutory columns', () => {
		const doc = assemblePayslipDocument(baseInput())
		expect(doc.deductions.find((d) => d.label === 'SSS')?.amount).toBe('350.00')
		expect(doc.deductions.find((d) => d.label === 'PHILHEALTH')?.amount).toBe('150.00')
		expect(doc.deductions.find((d) => d.label === 'PAG-IBIG')?.amount).toBe('100.00')
		expect(doc.deductions.find((d) => d.label === 'W/H TAX')?.amount).toBe('0.00')
	})

	it('formats the period label like the template (M/D/YY to M/D/YY)', () => {
		const doc = assemblePayslipDocument(baseInput())
		expect(doc.period.periodLabel).toBe('5/11/22 to  5/25/22')
		// PAYDATE is the RELEASE date (6/2), not the approval date (5/30). HR's rule, 18-08-26.
		expect(doc.period.payDate).toBe('6/2/22')
	})

	// The approval date must not leak back in: it was written both by an approval and by a
	// period lock, so it meant two different things (#298 D2). Release means one thing.
	it('payDate ignores approvedAt entirely, even when the two differ', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				run: {
					periodStart: new Date('2022-05-11T00:00:00Z'),
					periodEnd: new Date('2022-05-25T00:00:00Z'),
					approvedAt: new Date('2022-05-30T00:00:00Z'),
					releasedAt: new Date('2022-06-02T00:00:00Z')
				}
			})
		)
		expect(doc.period.payDate).toBe('6/2/22')
		expect(doc.period.payDate).not.toBe('5/30/22')
	})

	// A legacy APPROVED run has no period and therefore no release date. The owner chose a blank
	// PAYDATE over inventing one (runs.ts:17 — a payslip is visible when the run is APPROVED *or*
	// its period is RELEASED).
	it('payDate is blank when the run never went through a release', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				run: {
					periodStart: new Date('2022-05-11T00:00:00Z'),
					periodEnd: new Date('2022-05-25T00:00:00Z'),
					approvedAt: new Date('2022-05-30T00:00:00Z'),
					releasedAt: null
				}
			})
		)
		expect(doc.period.payDate).toBe('')
	})

	// #139: the itemized detail lists every persisted line verbatim — no bucketing —
	// so an employee can trace each summary column down to its components.
	it('emits one detail row per earning and deduction line, uppercased', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				entry: {
					...baseInput().entry,
					earnings: [
						{ code: 'BASIC', label: 'Basic pay', amount: 7020 },
						{ code: 'ALLOWANCE_MEAL', label: 'Meal Allowance', amount: 800 },
						{ code: 'ALLOWANCE_TRANSPORT', label: 'Transport', amount: 500 }
					],
					deductions: [
						{ code: 'LOAN_SSS', label: 'SSS Salary Loan', amount: 800 },
						{ code: 'LOAN_HDMF', label: 'Pag-IBIG MPL', amount: 200 }
					]
				}
			})
		)
		// Every line appears individually (both allowances, both loans) — not collapsed.
		expect(doc.detail.earnings).toEqual([
			{ label: 'BASIC PAY', amount: '7,020.00' },
			{ label: 'MEAL ALLOWANCE', amount: '800.00' },
			{ label: 'TRANSPORT', amount: '500.00' }
		])
		expect(doc.detail.deductions).toEqual([
			{ label: 'SSS SALARY LOAN', amount: '800.00' },
			{ label: 'PAG-IBIG MPL', amount: '200.00' }
		])
	})

	it('falls back to the line code when a detail line has no label', () => {
		const doc = assemblePayslipDocument(
			baseInput({
				entry: {
					...baseInput().entry,
					earnings: [{ code: 'INCENTIVE', label: '', amount: 250 }],
					deductions: []
				}
			})
		)
		expect(doc.detail.earnings).toEqual([{ label: 'INCENTIVE', amount: '250.00' }])
	})
})

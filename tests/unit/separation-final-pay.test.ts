import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #305 / T9–T16 — `computeFinalPay`.
 *
 * Until this file existed the function had only ever run one fixture shape
 * (MONTHLY / 22000 / 2 leave days / 1 loan / 0 cash advance) inside
 * `separation-characterization.test.ts`. The DAILY and HOURLY branches of the
 * #189 rate-basis split had never executed at all, and `employeeCompensation`
 * was mocked `[]` everywhere, so the #170 "a raise effective by the separation
 * date reaches final pay" integration was asserted nowhere.
 *
 * `currentCompensation` is deliberately NOT mocked — T12 needs the real
 * selection rule to run. Only the DB is mocked.
 *
 * The same rate figure (22000) is used for T9/T10/T11 so the three branches
 * produce unmistakably different answers: 1000/day, 22000/day, 176000/day.
 * A test that passed for two branches at once would prove nothing.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		separationRecord: { findFirst: vi.fn() },
		employee: { findUniqueOrThrow: vi.fn() },
		employeeCompensation: { findMany: vi.fn() },
		leaveBalance: { findMany: vi.fn() },
		loan: { findMany: vi.fn() },
		cashAdvance: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/notifications', () => ({
	sendOffboardingNoticeEmail: vi.fn(),
	sendRequestStatusEmail: vi.fn()
}))

const { computeFinalPay } = await import('$lib/server/services/separation')

const EFFECTIVE_DATE = new Date('2026-08-01')

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.separationRecord.findFirst.mockResolvedValue({
		id: 'sep1',
		organizationId: 'org1',
		status: 'CLEARED',
		effectiveDate: EFFECTIVE_DATE,
		employee: { id: 'emp1', firstName: 'Ann', lastName: 'Cruz' },
		clearanceItems: []
	})
	dbMock.employee.findUniqueOrThrow.mockResolvedValue({
		basicMonthlySalary: 22000,
		rateType: 'MONTHLY'
	})
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.leaveBalance.findMany.mockResolvedValue([{ remaining: 2 }])
	dbMock.loan.findMany.mockResolvedValue([])
	dbMock.cashAdvance.findMany.mockResolvedValue([])
})

describe('computeFinalPay — rate basis (#189)', () => {
	it('a MONTHLY salary converts leave at salary/22', async () => {
		// 22000 / 22 = 1000 a day; 2 unused days = 2000, no deductions.
		const result = await computeFinalPay('sep1', 'org1')

		expect(result.lines[0].amount).toBe(2000)
		expect(result.total).toBe(2000)
	})

	it('a DAILY rate is used as the daily rate', async () => {
		dbMock.employee.findUniqueOrThrow.mockResolvedValue({
			basicMonthlySalary: 22000,
			rateType: 'DAILY'
		})

		// 22000 is already a day's pay; 2 days = 44000. Dividing by 22 would give 2000.
		const result = await computeFinalPay('sep1', 'org1')

		expect(result.lines[0].amount).toBe(44000)
		expect(result.total).toBe(44000)
	})

	it('an HOURLY rate is multiplied by 8', async () => {
		dbMock.employee.findUniqueOrThrow.mockResolvedValue({
			basicMonthlySalary: 22000,
			rateType: 'HOURLY'
		})

		// 22000 x 8 = 176000 a day; 2 days = 352000. The 176x understatement #189 fixed.
		const result = await computeFinalPay('sep1', 'org1')

		expect(result.lines[0].amount).toBe(352000)
		expect(result.total).toBe(352000)
	})

	it('a raise effective before the separation date reaches final pay', async () => {
		// Fallback on Employee is the stale 22000. History holds a raise to 44000 effective
		// a month before separation, and a future-dated 99000 that must NOT be picked.
		dbMock.employeeCompensation.findMany.mockResolvedValue([
			{
				basicMonthlySalary: 11000,
				rateType: 'MONTHLY',
				effectiveDate: new Date('2026-01-01'),
				changedAt: new Date('2026-01-01')
			},
			{
				basicMonthlySalary: 44000,
				rateType: 'MONTHLY',
				effectiveDate: new Date('2026-07-01'),
				changedAt: new Date('2026-06-20')
			},
			{
				basicMonthlySalary: 99000,
				rateType: 'MONTHLY',
				effectiveDate: new Date('2026-09-01'),
				changedAt: new Date('2026-06-25')
			}
		])

		// 44000 / 22 = 2000 a day; 2 days = 4000. The stale fallback would give 2000,
		// the future-dated row would give 9000.
		const result = await computeFinalPay('sep1', 'org1')

		expect(result.total).toBe(4000)
	})
})

describe('computeFinalPay — inputs, signs and rounding', () => {
	it("counts only leave balances for the effective date's year", async () => {
		await computeFinalPay('sep1', 'org1')

		expect(dbMock.leaveBalance.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ employeeId: 'emp1', year: 2026 })
			})
		)
	})

	it('returns a negative total when deductions exceed leave', async () => {
		dbMock.leaveBalance.findMany.mockResolvedValue([{ remaining: 1 }])
		dbMock.loan.findMany.mockResolvedValue([{ balance: 5000 }])
		dbMock.cashAdvance.findMany.mockResolvedValue([{ balance: 2000 }])

		// 1000 leave - 5000 loan - 2000 advance. There is no clamp at zero.
		const result = await computeFinalPay('sep1', 'org1')

		expect(result.total).toBe(-6000)
	})

	it('rounds every money figure to 2 decimals', async () => {
		dbMock.leaveBalance.findMany.mockResolvedValue([{ remaining: 0.123456 }])
		dbMock.loan.findMany.mockResolvedValue([{ balance: 100.005 }, { balance: 200.004 }])

		// 0.123456 x 1000 = 123.456 -> 123.46; 300.009 of loans -> 300.01.
		const result = await computeFinalPay('sep1', 'org1')

		expect(result.lines[0].amount).toBe(123.46)
		expect(result.lines[1].amount).toBe(-300.01)
		expect(result.total).toBe(-176.55)
	})

	it('emits leave positive, loan and cash advance negative', async () => {
		dbMock.loan.findMany.mockResolvedValue([{ balance: 500 }])
		dbMock.cashAdvance.findMany.mockResolvedValue([{ balance: 300 }])

		const result = await computeFinalPay('sep1', 'org1')

		expect(result.lines).toEqual([
			{ label: 'Unused leave conversion (2.00 days)', amount: 2000 },
			{ label: 'Outstanding loan balances', amount: -500 },
			{ label: 'Outstanding cash advances', amount: -300 }
		])
		expect(result.total).toBe(1200)
	})
})

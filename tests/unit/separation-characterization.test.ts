import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #297 characterization baseline — written and proven GREEN against UNMODIFIED code
 * before any separation-of-duties guard landed. The separation service had zero tests,
 * so this file pins what finalizeSeparation and setClearanceItem already do: the
 * finalize writes, the two 409 refusals, and clearing a PENDING item.
 *
 * The actor here (`user-b`) is uninvolved — not the separated employee's user and not
 * the clearer of any item — so this file stays green after the guards land too. If it
 * ever goes red, a guard changed existing behaviour that was supposed to be untouched.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		separationRecord: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
		clearanceItem: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
		employee: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
		employeeCompensation: { findMany: vi.fn() },
		leaveBalance: { findMany: vi.fn() },
		loan: { findMany: vi.fn(), updateMany: vi.fn() },
		cashAdvance: { findMany: vi.fn(), updateMany: vi.fn() },
		user: { findMany: vi.fn(), updateMany: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/notifications', () => ({
	sendOffboardingNoticeEmail: vi.fn(),
	sendRequestStatusEmail: vi.fn()
}))

const { finalizeSeparation, setClearanceItem } = await import('$lib/server/services/separation')

const CTX: AuditContext = {
	organizationId: 'org1',
	actorId: 'user-b',
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
}

function separationRow(
	overrides: {
		status?: string
		clearanceItems?: { id: string; status: string; clearedById: string | null }[]
	} = {}
) {
	return {
		id: 'sep1',
		organizationId: 'org1',
		employeeId: 'emp1',
		status: overrides.status ?? 'CLEARED',
		type: 'RESIGNATION',
		effectiveDate: new Date('2026-08-01'),
		finalPayAmount: null,
		finalPayBreakdown: null,
		finalizedAt: null,
		finalizedById: null,
		employee: { id: 'emp1', firstName: 'Ann', lastName: 'Cruz' },
		clearanceItems: overrides.clearanceItems ?? [
			{ id: 'ci1', status: 'CLEARED', clearedById: 'user-a' }
		]
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	// #304: finalize's in-transaction snapshot reads the employee's logins.
	dbMock.user.findMany.mockResolvedValue([])
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock))
	// #297: the in-transaction clearance re-read. Default to "no clearers" so only the tests that
	// mean to exercise the bar do so.
	dbMock.clearanceItem.findMany.mockResolvedValue([])
	dbMock.separationRecord.findFirst.mockResolvedValue(separationRow())
	dbMock.separationRecord.updateMany.mockResolvedValue({ count: 1 })
	// Not called by the unmodified code; the guards added later read it. Uninvolved user.
	dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-subject' })
	dbMock.employee.findUniqueOrThrow.mockResolvedValue({
		basicMonthlySalary: 22000,
		rateType: 'MONTHLY'
	})
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.leaveBalance.findMany.mockResolvedValue([{ remaining: 2 }])
	dbMock.loan.findMany.mockResolvedValue([{ balance: 1000 }])
	dbMock.cashAdvance.findMany.mockResolvedValue([])
	dbMock.clearanceItem.count.mockResolvedValue(0)
})

describe('finalizeSeparation — current behaviour (baseline)', () => {
	it('happy path writes the final pay snapshot, offboards, and disables the login', async () => {
		// 22000 / 22 working days = 1000/day; 2 unused days = 2000, less a 1000 loan = 1000.
		await expect(finalizeSeparation('sep1', 'org1', CTX)).resolves.toMatchObject({ total: 1000 })

		expect(dbMock.separationRecord.updateMany).toHaveBeenCalledTimes(1)
		const finalizeArgs = dbMock.separationRecord.updateMany.mock.calls[0][0]
		expect(finalizeArgs.data.status).toBe('FINALIZED')
		expect(Number(finalizeArgs.data.finalPayAmount)).toBe(1000)
		expect(finalizeArgs.data.finalizedById).toBe('user-b')

		expect(dbMock.employee.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'emp1' },
				data: expect.objectContaining({ employmentStatus: 'OFFBOARDED' })
			})
		)
		expect(dbMock.user.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: { isActive: false } })
		)
		expect(dbMock.loan.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: { balance: 0, status: 'PAID' } })
		)
		expect(dbMock.cashAdvance.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: { balance: 0, status: 'PAID' } })
		)
	})

	it('refuses with 409 while clearance items are still pending', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue(
			separationRow({
				status: 'OPEN',
				clearanceItems: [{ id: 'ci1', status: 'PENDING', clearedById: null }]
			})
		)

		await expect(finalizeSeparation('sep1', 'org1', CTX)).rejects.toMatchObject({ status: 409 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('refuses with 409 when the separation is already finalized', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue(separationRow({ status: 'FINALIZED' }))

		await expect(finalizeSeparation('sep1', 'org1', CTX)).rejects.toMatchObject({ status: 409 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})
})

describe('setClearanceItem — current behaviour (baseline)', () => {
	it('clears a PENDING item and records the actor', async () => {
		dbMock.clearanceItem.findFirst.mockResolvedValue({
			id: 'ci1',
			status: 'PENDING',
			clearedById: null,
			separation: { id: 'sep1', status: 'OPEN' }
		})

		await setClearanceItem('ci1', 'org1', true, CTX)

		expect(dbMock.clearanceItem.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'ci1' },
				data: expect.objectContaining({ status: 'CLEARED', clearedById: 'user-b' })
			})
		)
		// `updateMany` with a FINALIZED floor, not `update`: a finalize landing between this
		// function's status read and this write would otherwise be rolled back to CLEARED.
		expect(dbMock.separationRecord.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ status: { not: 'FINALIZED' } }),
				data: { status: 'CLEARED' }
			})
		)
	})
})

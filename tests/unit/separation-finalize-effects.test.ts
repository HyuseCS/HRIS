import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #305 — the two finalize effects nothing pins today: the lost-race 409 (the guarded
 * `updateMany` comes back with `count: 0`), and the exact `where` clauses of the
 * in-transaction cascade plus `endDate === effectiveDate`.
 *
 * #304/B-3 — `$transaction` is NO LONGER a passthrough returning `dbMock`. It hands the
 * callback a DISTINCT `txMock`, and that one line is what makes three assertions in this
 * file able to fail at all:
 *   1. `computeFinalPay`'s `db.loan.findMany` and the snapshot's `tx.loan.findMany` are
 *      different mocks, so the snapshot cannot accidentally be proved by the wrong read.
 *   2. `tx !== db`, so "the audit's 3rd argument is the transaction client" is a real
 *      identity assertion — a mutation passing `db` explicitly now fails it.
 *   3. Call ordering is observable on one known object.
 *
 * KNOWN GAP (plan §Known Gaps): a mocked `$transaction` proves the writes are ISSUED, not
 * that they are atomic. Rollback needs a real DB — tests/e2e/separations.spec.ts carries it.
 */

const { dbMock, txMock } = vi.hoisted(() => ({
	dbMock: {
		separationRecord: { findFirst: vi.fn() },
		employee: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
		employeeCompensation: { findMany: vi.fn() },
		leaveBalance: { findMany: vi.fn() },
		loan: { findMany: vi.fn() },
		cashAdvance: { findMany: vi.fn() },
		$transaction: vi.fn()
	},
	txMock: {
		separationRecord: { updateMany: vi.fn() },
		clearanceItem: { findMany: vi.fn() },
		employee: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
		loan: { findMany: vi.fn(), updateMany: vi.fn() },
		cashAdvance: { findMany: vi.fn(), updateMany: vi.fn() },
		user: { findMany: vi.fn(), updateMany: vi.fn() }
	}
}))
const { auditMock } = vi.hoisted(() => ({ auditMock: { writeAuditLog: vi.fn() } }))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => auditMock)
vi.mock('$lib/server/notifications', () => ({
	sendOffboardingNoticeEmail: vi.fn(),
	sendRequestStatusEmail: vi.fn()
}))

const { finalizeSeparation } = await import('$lib/server/services/separation')

const CTX: AuditContext = {
	organizationId: 'org1',
	actorId: 'user-b',
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
}

const EFFECTIVE_DATE = new Date('2026-08-01')

/**
 * Honours the caller's `select` and returns ONLY the keys it asked for. A flat
 * `mockResolvedValue(wholeRow)` would let a snapshot that captured the WRONG fields still
 * pass — this repo's #1 recorded test failure mode (all-tests.md). `project` fixes row
 * SHAPE; the invocation-order assertions below fix SEQUENCE. Neither substitutes for the other.
 */
function project(rows: Record<string, unknown>[]) {
	return async (args?: { select?: Record<string, boolean> }) => {
		const select = args?.select
		if (!select) return rows
		return rows.map((row) => {
			const out: Record<string, unknown> = {}
			for (const key of Object.keys(select)) if (select[key]) out[key] = row[key]
			return out
		})
	}
}

const LOAN_ROWS = [
	{ id: 'l1', employeeId: 'emp1', balance: new Prisma.Decimal(3000), status: 'ACTIVE' },
	{ id: 'l2', employeeId: 'emp1', balance: new Prisma.Decimal(7000), status: 'ACTIVE' }
]
const ADVANCE_ROWS = [
	{ id: 'ca1', employeeId: 'emp1', balance: new Prisma.Decimal(500), status: 'ACTIVE' }
]

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
	dbMock.separationRecord.findFirst.mockResolvedValue({
		id: 'sep1',
		organizationId: 'org1',
		employeeId: 'emp1',
		status: 'CLEARED',
		type: 'RESIGNATION',
		effectiveDate: EFFECTIVE_DATE,
		finalPayAmount: null,
		finalPayBreakdown: null,
		preFinalizeState: null,
		employee: { id: 'emp1', firstName: 'Ann', lastName: 'Cruz' },
		clearanceItems: [{ id: 'ci1', status: 'CLEARED', clearedById: 'user-a' }]
	})
	dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-subject' })
	dbMock.employee.findUniqueOrThrow.mockResolvedValue({
		basicMonthlySalary: 22000,
		rateType: 'MONTHLY'
	})
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.leaveBalance.findMany.mockResolvedValue([])
	// computeFinalPay's OWN reads, on the shared client — deliberately different rows from the
	// in-transaction snapshot below, so neither can stand in for the other.
	dbMock.loan.findMany.mockResolvedValue([])
	dbMock.cashAdvance.findMany.mockResolvedValue([])

	txMock.separationRecord.updateMany.mockResolvedValue({ count: 1 })
	// The in-transaction re-read: nobody the actor cleared, so the D3 bar stays down.
	txMock.clearanceItem.findMany.mockResolvedValue([])
	txMock.loan.findMany.mockImplementation(project(LOAN_ROWS))
	txMock.cashAdvance.findMany.mockImplementation(project(ADVANCE_ROWS))
	txMock.employee.findUniqueOrThrow.mockResolvedValue({
		employmentStatus: 'ON_LEAVE',
		endDate: null
	})
	txMock.user.findMany.mockResolvedValue([{ id: 'u1', isActive: true }])
})

describe('finalizeSeparation — in-transaction effects', () => {
	it('refuses a finalize that lost the race', async () => {
		// A concurrent finalize already flipped the row, so the status-floored update matches
		// nothing. Everything after it must not run.
		txMock.separationRecord.updateMany.mockResolvedValue({ count: 0 })

		await expect(finalizeSeparation('sep1', 'org1', CTX)).rejects.toMatchObject({
			status: 409,
			body: { message: 'Separation is already finalized' }
		})

		expect(txMock.loan.updateMany).not.toHaveBeenCalled()
		expect(txMock.cashAdvance.updateMany).not.toHaveBeenCalled()
		expect(txMock.employee.update).not.toHaveBeenCalled()
		expect(txMock.user.updateMany).not.toHaveBeenCalled()
		// A loser reads the snapshot but must never WRITE one.
		expect(auditMock.writeAuditLog).not.toHaveBeenCalled()
	})

	it('zeroes loans and advances, offboards the employee, deactivates the user', async () => {
		await finalizeSeparation('sep1', 'org1', CTX)

		expect(txMock.loan.updateMany).toHaveBeenCalledWith({
			where: { employeeId: 'emp1', status: 'ACTIVE' },
			data: { balance: 0, status: 'PAID' }
		})
		expect(txMock.cashAdvance.updateMany).toHaveBeenCalledWith({
			where: { employeeId: 'emp1', status: 'ACTIVE' },
			data: { balance: 0, status: 'PAID' }
		})
		// The end date is the separation's effective date, not "now" and not any other date.
		expect(txMock.employee.update.mock.calls[0][0]).toMatchObject({
			data: { endDate: EFFECTIVE_DATE }
		})
		expect(txMock.user.updateMany).toHaveBeenCalledWith({
			where: { employee: { id: 'emp1' } },
			data: { isActive: false }
		})
	})

	// #304/AC-8. The value assertion ALONE is vacuous: a stateless mock does not let
	// `updateMany` change what `findMany` resolves, so a snapshot read AFTER the zeroing would
	// still report 3000/7000. The invocation-order assertion is what makes M2.1 bite.
	it('snapshots every ACTIVE loan and advance before zeroing them', async () => {
		await finalizeSeparation('sep1', 'org1', CTX)

		const claim = txMock.separationRecord.updateMany.mock.calls[0][0]
		expect(claim.data.preFinalizeState).toEqual({
			loans: [
				{ id: 'l1', balance: '3000', status: 'ACTIVE' },
				{ id: 'l2', balance: '7000', status: 'ACTIVE' }
			],
			cashAdvances: [{ id: 'ca1', balance: '500', status: 'ACTIVE' }],
			// ON_LEAVE, not ACTIVE: finalize destroys either one, and restoring the wrong
			// value is a silent lie about someone's employment record.
			employee: { employmentStatus: 'ON_LEAVE', endDate: null },
			userIds: ['u1'],
			userWasActive: true
		})

		expect(Math.max(...txMock.loan.findMany.mock.invocationCallOrder)).toBeLessThan(
			txMock.loan.updateMany.mock.invocationCallOrder[0]
		)
		expect(Math.max(...txMock.cashAdvance.findMany.mock.invocationCallOrder)).toBeLessThan(
			txMock.cashAdvance.updateMany.mock.invocationCallOrder[0]
		)
	})

	// #304/N-1. A PROJECTION assertion, not an outcome assertion: the mock returns whatever the
	// test hands it regardless of the `select`, so only asserting the select itself can catch a
	// narrowed re-check — and a narrowed re-check keeps `pnpm check` green because
	// `previouslyClearedById` is optional on ClearanceActorRef. That is M3.4.
	it('re-checks the clearers on a projection that includes previouslyClearedById', async () => {
		await finalizeSeparation('sep1', 'org1', CTX)

		expect(txMock.clearanceItem.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				select: expect.objectContaining({ previouslyClearedById: true })
			})
		)
	})

	// #304/AC-7. `toBe(txMock)` is IDENTITY, not truthiness: passing `db` explicitly (M2.3) is
	// the realistic mistake, and only identity catches it.
	it('writes its audit inside the transaction, with oldValue', async () => {
		await finalizeSeparation('sep1', 'org1', CTX)

		expect(auditMock.writeAuditLog).toHaveBeenCalledTimes(1)
		const [, payload, client] = auditMock.writeAuditLog.mock.calls[0]
		expect(client).toBe(txMock)
		expect(payload.oldValue).toMatchObject({
			status: 'CLEARED',
			employmentStatus: 'ON_LEAVE',
			activeLoanCount: 2,
			activeAdvanceCount: 1
		})
	})
})

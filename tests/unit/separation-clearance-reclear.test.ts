import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #297/D8 — a clearance item already cleared by somebody else is theirs. Both directions
 * are barred (re-clear AND un-clear), because the UI's only route to re-clearing is
 * un-clear-then-clear: barring only the re-clear would leave the D3 finalize bar
 * trivially defeatable. The original clearer stays free to change their own item.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		separationRecord: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
		clearanceItem: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
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

const { setClearanceItem, finalizeSeparation } = await import('$lib/server/services/separation')

const D8_MESSAGE =
	'This clearance item was already cleared by someone else. Only they can change it.'
const CLEARER_MESSAGE =
	'You cannot finalize a separation whose clearance items you cleared — ask another HR administrator, or your CEO, to finalize it.'

const ctxFor = (actorId: string): AuditContext => ({
	organizationId: 'org1',
	actorId,
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
})

const item = (status: string, clearedById: string | null, id = 'ci1') => ({
	id,
	status,
	clearedById,
	separation: { id: 'sep1', status: 'OPEN' }
})

beforeEach(() => {
	vi.clearAllMocks()
	// #304: finalize's in-transaction snapshot reads the employee's logins.
	dbMock.user.findMany.mockResolvedValue([])
	dbMock.clearanceItem.count.mockResolvedValue(0)
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock))
	dbMock.separationRecord.updateMany.mockResolvedValue({ count: 1 })
	dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-subject' })
	dbMock.employee.findUniqueOrThrow.mockResolvedValue({
		basicMonthlySalary: 22000,
		rateType: 'MONTHLY'
	})
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.leaveBalance.findMany.mockResolvedValue([])
	dbMock.loan.findMany.mockResolvedValue([])
	dbMock.cashAdvance.findMany.mockResolvedValue([])
})

describe('setClearanceItem — D8 ownership', () => {
	it('reclear-refused-for-other-actor', async () => {
		dbMock.clearanceItem.findFirst.mockResolvedValue(item('CLEARED', 'user-a'))

		await expect(setClearanceItem('ci1', 'org1', true, ctxFor('user-b'))).rejects.toMatchObject({
			status: 403,
			body: { message: D8_MESSAGE }
		})
		expect(dbMock.clearanceItem.update).not.toHaveBeenCalled()
	})

	it('unclear-refused-for-other-actor', async () => {
		dbMock.clearanceItem.findFirst.mockResolvedValue(item('CLEARED', 'user-a'))

		await expect(setClearanceItem('ci1', 'org1', false, ctxFor('user-b'))).rejects.toMatchObject({
			status: 403,
			body: { message: D8_MESSAGE }
		})
		expect(dbMock.clearanceItem.update).not.toHaveBeenCalled()
	})

	it('reclear-allowed-for-original-clearer', async () => {
		// A un-ticks their OWN item, then ticks it again. Both succeed and it ends back at A —
		// the item is not frozen, it is A's.
		dbMock.clearanceItem.findFirst.mockResolvedValue(item('CLEARED', 'user-a'))
		await setClearanceItem('ci1', 'org1', false, ctxFor('user-a'))
		expect(dbMock.clearanceItem.update).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: 'PENDING', clearedById: null })
			})
		)

		dbMock.clearanceItem.findFirst.mockResolvedValue(item('PENDING', null))
		await setClearanceItem('ci1', 'org1', true, ctxFor('user-a'))
		expect(dbMock.clearanceItem.update).toHaveBeenLastCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: 'CLEARED', clearedById: 'user-a' })
			})
		)
	})

	// #304/B-2 + M3.3. `previouslyClearedById` is the field that keeps the #297 bar alive after an
	// undo's re-open, and its ENTIRE value depends on this path never touching it. The realistic
	// mistake is a reader who sees two "cleared by" columns, one being NULLed, and "completes" the
	// data object. Asserted as KEY ABSENCE, not as "not null": every other assertion in this file
	// uses `objectContaining`, which permits extra keys and therefore cannot catch this at all.
	it('un-clearing never writes or clears previouslyClearedById', async () => {
		dbMock.clearanceItem.findFirst.mockResolvedValue(item('CLEARED', 'user-a'))
		await setClearanceItem('ci1', 'org1', false, ctxFor('user-a'))

		expect('previouslyClearedById' in dbMock.clearanceItem.update.mock.calls[0][0].data).toBe(false)

		// The re-clear direction too — the same "complete the object" instinct applies there.
		dbMock.clearanceItem.findFirst.mockResolvedValue(item('PENDING', null))
		await setClearanceItem('ci1', 'org1', true, ctxFor('user-a'))
		expect('previouslyClearedById' in dbMock.clearanceItem.update.mock.calls[1][0].data).toBe(false)
	})

	it('clear-pending-item-unchanged', async () => {
		// A fresh item is still clearable by anybody who could clear it before.
		dbMock.clearanceItem.findFirst.mockResolvedValue(item('PENDING', null))

		await setClearanceItem('ci1', 'org1', true, ctxFor('user-c'))

		expect(dbMock.clearanceItem.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: 'CLEARED', clearedById: 'user-c' })
			})
		)
	})
})

describe('AC-9.4 — the un-clear-then-clear defeat route', () => {
	it('d3-not-defeatable-by-reclear', async () => {
		// The full walk in one sequence. The case has two items: ci1 cleared by A, ci2 cleared by B,
		// so B is barred at finalize by D3 and has a motive to launder ownership. B tries to take
		// over A's item in both directions, then tries to finalize. All three are refused, the item
		// still belongs to A, and the record is never touched.
		const ci1 = item('CLEARED', 'user-a', 'ci1')
		dbMock.clearanceItem.findFirst.mockResolvedValue(ci1)
		dbMock.separationRecord.findFirst.mockResolvedValue({
			id: 'sep1',
			organizationId: 'org1',
			employeeId: 'emp1',
			status: 'CLEARED',
			type: 'RESIGNATION',
			effectiveDate: new Date('2026-08-01'),
			finalPayAmount: null,
			finalPayBreakdown: null,
			employee: { id: 'emp1', firstName: 'Ann', lastName: 'Cruz' },
			clearanceItems: [
				{ id: 'ci1', status: 'CLEARED', clearedById: 'user-a' },
				{ id: 'ci2', status: 'CLEARED', clearedById: 'user-b' }
			]
		})

		// Step 1 — B un-clears A's item.
		await expect(setClearanceItem('ci1', 'org1', false, ctxFor('user-b'))).rejects.toMatchObject({
			status: 403,
			body: { message: D8_MESSAGE }
		})

		// Step 2 — B clears it, hoping to become the clearer.
		await expect(setClearanceItem('ci1', 'org1', true, ctxFor('user-b'))).rejects.toMatchObject({
			status: 403,
			body: { message: D8_MESSAGE }
		})

		// The item never moved: still CLEARED, still A's.
		expect(dbMock.clearanceItem.update).not.toHaveBeenCalled()
		expect(ci1.clearedById).toBe('user-a')
		expect(ci1.status).toBe('CLEARED')

		// Step 3 — B still cannot finalize, and nothing was written.
		await expect(finalizeSeparation('sep1', 'org1', ctxFor('user-b'))).rejects.toMatchObject({
			status: 403,
			body: { message: CLEARER_MESSAGE }
		})
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(dbMock.separationRecord.updateMany).not.toHaveBeenCalled()
	})
})

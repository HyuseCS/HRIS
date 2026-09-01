import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #305 — `setClearanceItem`'s three untested branches: the 404 (which is also the org
 * scope), the finalized-parent 409, and the roll-BACK to OPEN while items are still
 * pending. The D8 re-clear bar is covered by separation-clearance-reclear.test.ts and is
 * deliberately not repeated here.
 */

const { dbMock, tx } = vi.hoisted(() => {
	const tx = {
		separationRecord: { updateMany: vi.fn() },
		clearanceItem: { update: vi.fn(), count: vi.fn() }
	}
	return {
		tx,
		// No write methods on `dbMock` on purpose: if the writes ever move back outside the
		// transaction, they throw here rather than passing silently.
		dbMock: { clearanceItem: { findFirst: vi.fn() }, $transaction: vi.fn() }
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/notifications', () => ({
	sendOffboardingNoticeEmail: vi.fn(),
	sendRequestStatusEmail: vi.fn()
}))

const { setClearanceItem } = await import('$lib/server/services/separation')
const { writeAuditLog } = await import('$lib/server/audit')

const CTX: AuditContext = {
	organizationId: 'org1',
	actorId: 'user-b',
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.clearanceItem.findFirst.mockResolvedValue({
		id: 'ci1',
		status: 'PENDING',
		clearedById: null,
		separation: { id: 'sep1', status: 'OPEN' }
	})
	tx.clearanceItem.count.mockResolvedValue(0)
	tx.separationRecord.updateMany.mockResolvedValue({ count: 1 })
	dbMock.$transaction.mockImplementation((fn: (c: typeof tx) => unknown) => fn(tx))
})

describe('setClearanceItem — untested branches', () => {
	it('rejects an unknown clearance item', async () => {
		// An item belonging to another org is indistinguishable from one that does not exist:
		// the lookup is scoped by `separation: { organizationId }`, so it simply misses.
		dbMock.clearanceItem.findFirst.mockResolvedValue(null)

		await expect(setClearanceItem('ci1', 'org1', true, CTX)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Clearance item not found' }
		})

		expect(dbMock.clearanceItem.findFirst.mock.calls[0][0]).toMatchObject({
			where: { id: 'ci1', separation: { organizationId: 'org1' } }
		})
		expect(tx.clearanceItem.update).not.toHaveBeenCalled()
	})

	it('refuses to touch an item on a finalized case', async () => {
		dbMock.clearanceItem.findFirst.mockResolvedValue({
			id: 'ci1',
			status: 'PENDING',
			clearedById: null,
			separation: { id: 'sep1', status: 'FINALIZED' }
		})

		await expect(setClearanceItem('ci1', 'org1', true, CTX)).rejects.toMatchObject({
			status: 409,
			body: { message: 'Separation is already finalized' }
		})
		expect(tx.clearanceItem.update).not.toHaveBeenCalled()
		expect(tx.separationRecord.updateMany).not.toHaveBeenCalled()
	})

	it('rolls the parent back to OPEN while items remain pending', async () => {
		// Two items still PENDING after this write, so the parent must go back to OPEN —
		// and the write keeps its `status: { not: 'FINALIZED' }` floor, which is what stops a
		// finalize that landed after the read from being silently reopened.
		tx.clearanceItem.count.mockResolvedValue(2)

		await setClearanceItem('ci1', 'org1', true, CTX)

		expect(tx.separationRecord.updateMany).toHaveBeenCalledWith({
			where: { id: 'sep1', status: { not: 'FINALIZED' } },
			data: { status: 'OPEN' }
		})
		// AVIPA #5: the tick, the roll-forward and the audit all share one transaction.
		expect(tx.clearanceItem.update).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'ci1' } })
		)
		expect(writeAuditLog).toHaveBeenCalledWith(
			CTX,
			expect.objectContaining({ action: 'UPDATE', entityType: 'ClearanceItem', entityId: 'ci1' }),
			tx
		)
	})
})

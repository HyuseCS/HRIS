import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * AVIPA #5 — `setManualCompletion` writes its audit row on the same client as the tick it
 * records, so a failed audit write rolls the tick back with it.
 *
 * A DISTINCT `tx` object, and no write methods on `dbMock`: if the upsert/delete ever moves
 * back outside the transaction it throws here rather than passing silently.
 */
const { dbMock, tx } = vi.hoisted(() => {
	const tx = { onboardingCompletion: { upsert: vi.fn(), deleteMany: vi.fn() } }
	return {
		tx,
		dbMock: {
			onboardingChecklistItem: { findFirst: vi.fn() },
			employee: { findFirst: vi.fn() },
			$transaction: vi.fn()
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { setManualCompletion } = await import('$lib/server/services/onboarding')
const { writeAuditLog } = await import('$lib/server/audit')

const CTX: AuditContext = {
	organizationId: 'org1',
	actorId: 'user-hr',
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.onboardingChecklistItem.findFirst.mockResolvedValue({ kind: 'MANUAL' })
	dbMock.employee.findFirst.mockResolvedValue({ id: 'emp1' })
	dbMock.$transaction.mockImplementation(async (fn: (c: typeof tx) => unknown) => fn(tx))
})

describe('setManualCompletion — the tick and its audit share one transaction', () => {
	it('ticks an item on', async () => {
		await setManualCompletion('org1', 'item1', 'emp1', true, CTX)

		expect(tx.onboardingCompletion.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { itemId_employeeId: { itemId: 'item1', employeeId: 'emp1' } }
			})
		)
		expect(writeAuditLog).toHaveBeenCalledWith(
			CTX,
			expect.objectContaining({
				action: 'UPDATE',
				entityType: 'OnboardingCompletion',
				entityId: 'emp1',
				newValue: { itemId: 'item1', done: true }
			}),
			tx
		)
	})

	it('ticks an item off', async () => {
		await setManualCompletion('org1', 'item1', 'emp1', false, CTX)

		expect(tx.onboardingCompletion.deleteMany).toHaveBeenCalledWith({
			where: { itemId: 'item1', employeeId: 'emp1' }
		})
		expect(writeAuditLog).toHaveBeenCalledWith(
			CTX,
			expect.objectContaining({ newValue: { itemId: 'item1', done: false } }),
			tx
		)
	})

	it('refuses a derived item before opening a transaction', async () => {
		dbMock.onboardingChecklistItem.findFirst.mockResolvedValue({ kind: 'DERIVED' })

		await expect(setManualCompletion('org1', 'item1', 'emp1', true, CTX)).rejects.toMatchObject({
			status: 400
		})
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})
})

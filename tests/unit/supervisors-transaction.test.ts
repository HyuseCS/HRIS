import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #5 — `setAdditionalSupervisors` replaces the whole set in one transaction, and the audit row
 * that records the replacement now shares it. The old array form (`db.$transaction([a, ...b])`)
 * had no `tx` to hand the audit, so a failed audit write left a changed supervisor set standing
 * unrecorded. The empty-selection case matters too: it clears the list, and the delete alone is
 * the whole change.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
const writeAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('$lib/server/audit', () => ({
	writeAuditLog: (...args: unknown[]) => writeAuditLog(...args)
}))

const { setAdditionalSupervisors } = await import('$lib/server/services/supervisors')

const CTX: AuditContext = { organizationId: 'org1', actorId: 'u-hr', actorRoles: ['HR_ADMIN'] }

const tx = { employeeSupervisor: { deleteMany: vi.fn(), createMany: vi.fn() } }

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue({ id: 'emp1', reportsToId: 'boss' })
	dbMock.employee.findMany.mockResolvedValue([{ id: 'sup1' }, { id: 'sup2' }])
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('setAdditionalSupervisors — one transaction (#5)', () => {
	it('replaces the set and audits inside the same transaction', async () => {
		await setAdditionalSupervisors('org1', 'emp1', ['sup1', 'sup2'], CTX)

		expect(tx.employeeSupervisor.deleteMany).toHaveBeenCalledWith({
			where: { employeeId: 'emp1' }
		})
		expect(tx.employeeSupervisor.createMany).toHaveBeenCalledWith({
			data: [
				{ employeeId: 'emp1', supervisorId: 'sup1' },
				{ employeeId: 'emp1', supervisorId: 'sup2' }
			]
		})
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('an empty selection clears the set without a createMany', async () => {
		await setAdditionalSupervisors('org1', 'emp1', [], CTX)

		expect(tx.employeeSupervisor.deleteMany).toHaveBeenCalledTimes(1)
		expect(tx.employeeSupervisor.createMany).not.toHaveBeenCalled()
		expect(writeAuditLog).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ newValue: { additionalSupervisors: [] } }),
			tx
		)
	})
})

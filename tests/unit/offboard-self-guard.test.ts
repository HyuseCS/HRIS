import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #158 — an admin must not be able to offboard their own employee record. The
 * offboard transaction sets User.isActive = false, so self-offboarding locks the
 * actor out on their next request. The guard lives in offboardEmployee so both
 * the form action and the v1 API are covered. DB and audit are mocked to keep
 * this in the fast unit suite.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), update: vi.fn() },
		// getEmployee's heal-on-read (#170 Stage 1.5, #222) queries the comp + employment-type history.
		employeeCompensation: { findMany: vi.fn().mockResolvedValue([]) },
		employeeEmploymentType: { findMany: vi.fn().mockResolvedValue([]) },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
const writeAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('$lib/server/audit', () => ({
	writeAuditLog: (...args: unknown[]) => writeAuditLog(...args)
}))

const { offboardEmployee } = await import('$lib/server/services/employees')

const CTX: AuditContext = {
	organizationId: 'org1',
	actorId: 'user-self',
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
}
const endDate = new Date('2026-08-01')

// #5: the offboard writes and their audit row now share one interactive transaction, so they
// land on the transaction client rather than on `db`.
const tx = {
	employee: { update: vi.fn() },
	user: { updateMany: vi.fn() }
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('offboardEmployee self-guard (#158)', () => {
	it('refuses when the target is the actor’s own record', async () => {
		dbMock.employee.findFirst.mockResolvedValue({ id: 'emp1', userId: 'user-self' })

		await expect(offboardEmployee('emp1', 'org1', endDate, CTX)).rejects.toMatchObject({
			status: 400
		})
		// Nothing was mutated.
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('proceeds when offboarding a different employee', async () => {
		dbMock.employee.findFirst.mockResolvedValue({ id: 'emp2', userId: 'user-other' })
		tx.employee.update.mockResolvedValue({ id: 'emp2', employmentStatus: 'OFFBOARDED' })
		tx.user.updateMany.mockResolvedValue({ count: 1 })

		// The interactive form returns whatever the closure returns — the updated employee, not
		// an array — so a closure that forgets to return it fails here.
		await expect(offboardEmployee('emp2', 'org1', endDate, CTX)).resolves.toEqual({
			id: 'emp2',
			employmentStatus: 'OFFBOARDED'
		})
		expect(dbMock.$transaction).toHaveBeenCalledTimes(1)
		expect(tx.employee.update).toHaveBeenCalledWith({
			where: { id: 'emp2' },
			data: { employmentStatus: 'OFFBOARDED', endDate }
		})
		expect(tx.user.updateMany).toHaveBeenCalledWith({
			where: { employee: { id: 'emp2' } },
			data: { isActive: false }
		})
		// #5: the audit write shares the offboard transaction.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})
})

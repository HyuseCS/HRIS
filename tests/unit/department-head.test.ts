import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #178 — the two write-time invariants on `Department.headEmployeeId`.
 *
 * Postgres can express neither, so `setDepartmentHead` is the only thing standing between the
 * form post and the column:
 *   - the head must be a member of THIS department
 *   - the head must be in the SAME organization (the tenant boundary)
 *
 * `emp-foreign` deliberately sits in the SAME department id as the legitimate member, one org
 * over. That is what makes the cross-tenant test meaningful: if the `organizationId` filter is
 * dropped from the lookup, the department check alone waves the foreign employee straight
 * through. The employee mock below behaves like a tiny database — it HONOURS the where clause —
 * so removing the guard from the source changes this test's result instead of being invisible.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		department: { findFirst: vi.fn(), update: vi.fn() },
		employee: { findFirst: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
const writeAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('$lib/server/audit', () => ({
	writeAuditLog: (...args: unknown[]) => writeAuditLog(...args)
}))

const { setDepartmentHead } = await import('$lib/server/services/departments')

const ORG = 'org-1'
const DEPT = 'dept-1'

const DEPARTMENT = { id: DEPT, organizationId: ORG, name: 'Operations', headEmployeeId: null }

const EMPLOYEES = [
	{ id: 'emp-member', organizationId: ORG, departmentId: DEPT },
	{ id: 'emp-other-dept', organizationId: ORG, departmentId: 'dept-2' },
	// Same department id, different tenant.
	{ id: 'emp-foreign', organizationId: 'org-2', departmentId: DEPT }
]

const ctx: AuditContext = { organizationId: ORG, actorId: 'user-hr', actorRoles: ['HR_ADMIN'] }

const tx = { department: { findUnique: vi.fn(), update: vi.fn() } }

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.department.findFirst.mockImplementation(({ where }: { where: Record<string, string> }) =>
		Promise.resolve(
			where.id === DEPARTMENT.id && where.organizationId === DEPARTMENT.organizationId
				? DEPARTMENT
				: null
		)
	)
	// Honours the where clause, so an absent org filter is observable.
	dbMock.employee.findFirst.mockImplementation(({ where }: { where: Record<string, string> }) =>
		Promise.resolve(
			EMPLOYEES.find(
				(e) =>
					e.id === where.id &&
					(where.organizationId === undefined || e.organizationId === where.organizationId)
			) ?? null
		)
	)
	// #324: the prior head is now read inside the transaction, so the tx client must serve it.
	tx.department.findUnique.mockResolvedValue({ headEmployeeId: DEPARTMENT.headEmployeeId })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<void>) => fn(tx))
})

describe('setDepartmentHead — write-time invariants', () => {
	it('assigns a member of the department', async () => {
		await setDepartmentHead(DEPT, ORG, 'emp-member', ctx)
		expect(tx.department.update).toHaveBeenCalledWith({
			where: { id: DEPT },
			data: { headEmployeeId: 'emp-member' }
		})
		// #324: the audit write shares the transaction, and so does the oldValue read.
		expect(tx.department.findUnique).toHaveBeenCalled()
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('clears the head back to null — a department with no head is a valid state', async () => {
		await setDepartmentHead(DEPT, ORG, null, ctx)
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
		expect(tx.department.update).toHaveBeenCalledWith({
			where: { id: DEPT },
			data: { headEmployeeId: null }
		})
	})

	it('rejects an employee who is in a different department', async () => {
		await expect(setDepartmentHead(DEPT, ORG, 'emp-other-dept', ctx)).rejects.toMatchObject({
			status: 400
		})
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(tx.department.update).not.toHaveBeenCalled()
	})

	it('rejects an employee who is in a different organization', async () => {
		await expect(setDepartmentHead(DEPT, ORG, 'emp-foreign', ctx)).rejects.toMatchObject({
			status: 404
		})
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(tx.department.update).not.toHaveBeenCalled()
	})

	it('org-scopes the head lookup on the employee’s own column, not a user join (#323)', async () => {
		await setDepartmentHead(DEPT, ORG, 'emp-member', ctx)
		const where = dbMock.employee.findFirst.mock.calls[0][0].where
		expect(where.organizationId).toBe(ORG)
		expect(where.user).toBeUndefined()
	})
})

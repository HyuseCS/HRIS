import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #275, the benefits half — `enrollEmployee` checked that the PLAN belonged to the acting
 * organization and never checked the EMPLOYEE at all, so an id from another tenant enrolled fine and
 * wrote an audit row against it.
 *
 * 404, not 403: a cross-tenant id is not in the caller's world at all, and `requireEmployee` already
 * answers that way for every pay writer. The 403 decision governs the in-org scoping cases.
 *
 * Guarded in the service, not the route: the benefits page action gates on
 * `requireAnyMinRole('HR_ADMIN')`, which MANAGER clears, so a route-level fix would leave the form
 * action wide open — the twin-door lesson from #235/#259.
 */

const { dbMock, writeAuditLog } = vi.hoisted(() => ({
	writeAuditLog: vi.fn().mockResolvedValue(undefined),
	dbMock: {
		employee: { findFirst: vi.fn() },
		benefitPlan: { findFirst: vi.fn() },
		$transaction: vi.fn()
	}
}))

// #5: the enrollment row and its audit entry now share one transaction, so the create lives on
// the transaction client.
const tx = { benefitEnrollment: { create: vi.fn() } }

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { enrollEmployee } = await import('$lib/server/services/benefits')

const ORG = 'org1'
const EMPLOYEE = 'emp1'
const PLAN = 'plan1'
const ctx = { organizationId: ORG, actorId: 'user-actor', actorRoles: ['HR_ADMIN'] as Role[] }
const data = { effectiveDate: new Date('2026-01-01') }

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue({ id: EMPLOYEE, userId: 'user-emp' })
	dbMock.benefitPlan.findFirst.mockResolvedValue({ id: PLAN, organizationId: ORG })
	tx.benefitEnrollment.create.mockResolvedValue({ id: 'enr1', status: 'ACTIVE' })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('enrollEmployee', () => {
	it('404s on an employee outside the acting organization, and writes nothing', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		await expect(enrollEmployee(EMPLOYEE, PLAN, data, ctx)).rejects.toMatchObject({ status: 404 })
		expect(tx.benefitEnrollment.create).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('scopes the employee lookup to the acting organization', async () => {
		await enrollEmployee(EMPLOYEE, PLAN, data, ctx)
		expect(dbMock.employee.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: EMPLOYEE, organizationId: ORG }
			})
		)
	})

	// The employee check runs first, so a cross-tenant employee is refused even with a valid plan.
	it('refuses before the plan lookup', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		await expect(enrollEmployee(EMPLOYEE, PLAN, data, ctx)).rejects.toMatchObject({ status: 404 })
		expect(dbMock.benefitPlan.findFirst).not.toHaveBeenCalled()
	})

	it('still enrolls an in-org employee', async () => {
		const enrollment = await enrollEmployee(EMPLOYEE, PLAN, data, ctx)
		expect(enrollment).toMatchObject({ id: 'enr1' })
		expect(tx.benefitEnrollment.create).toHaveBeenCalled()
		// #5: the audit write shares the enrollment's transaction.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('still 404s a plan from another organization', async () => {
		dbMock.benefitPlan.findFirst.mockResolvedValue(null)
		await expect(enrollEmployee(EMPLOYEE, PLAN, data, ctx)).rejects.toMatchObject({ status: 404 })
		expect(tx.benefitEnrollment.create).not.toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { periodOf } from '../../src/lib/utils/pay-periods'

/**
 * #163 criterion 13 — closing a pre-existing test gap. Adding the overlap guard must not change
 * what an operator sees when they re-create the SAME standard period: still a 409, still the same
 * words. The exact-duplicate check runs BEFORE the overlap guard so the specific message wins.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
		// #163: the duplicate check, the overlap guard and the insert now run in ONE transaction,
		// under an org-month advisory lock. `tx` is the same mock, so the assertions are unchanged.
		$transaction: vi.fn(),
		$executeRaw: vi.fn()
	}
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { createPayrollRun } = await import('$lib/server/services/payroll/index')

const ORG = 'org1'
const ctx = { organizationId: ORG, actorId: 'u1', actorRoles: ['SUPER_ADMIN'] as Role[] }
const may = periodOf('FIRST_HALF', 2026, 4)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.payrollRun.findMany.mockResolvedValue([])
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
})

describe('createPayrollRun — exact duplicate', () => {
	it('409s with the incumbent message for a repeated standard period', async () => {
		dbMock.payrollRun.findUnique.mockResolvedValue({ id: 'run1' })
		await expect(createPayrollRun(ORG, may.periodStart, may.periodEnd, ctx)).rejects.toMatchObject({
			status: 409,
			body: { message: 'Payroll run for this period already exists' }
		})
		expect(dbMock.payrollRun.create).not.toHaveBeenCalled()
	})

	it('409s with the same message for a repeated CUSTOM period', async () => {
		dbMock.payrollRun.findUnique.mockResolvedValue({ id: 'run1' })
		await expect(
			createPayrollRun(ORG, new Date('2026-05-03T00:00:00Z'), new Date('2026-05-09T00:00:00Z'), ctx)
		).rejects.toMatchObject({
			status: 409,
			body: { message: 'Payroll run for this period already exists' }
		})
		expect(dbMock.payrollRun.create).not.toHaveBeenCalled()
	})
})

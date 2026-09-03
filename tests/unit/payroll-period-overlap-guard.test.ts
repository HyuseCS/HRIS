import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #163 criterion 11 — `openPeriod` wraps a PayrollRun inside its own transaction, so guarding the
 * PayrollRun is enough to cover the PayrollPeriod: when the guard throws, NEITHER row is written.
 *
 * Review round 2: the guard now runs INSIDE that transaction, under the org-month advisory lock,
 * so the transaction does open — and rolls back. The assertion is therefore on the rows: neither
 * `payrollPeriod.create` nor `payrollRun.create` is ever reached.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
		payrollPeriod: { create: vi.fn() },
		employeeStatutoryConfig: { findMany: vi.fn() },
		$transaction: vi.fn(),
		$executeRaw: vi.fn()
	}
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { openPeriod } = await import('$lib/server/services/payroll/periods')

const ORG = 'org1'
const ctx = { organizationId: ORG, actorId: 'u1', actorRoles: ['SUPER_ADMIN'] as Role[] }
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.payrollRun.findUnique.mockResolvedValue(null)
	// #163 round 2: no employee designates a cutoff (every org is EVEN by default), so
	// `assertCustomRangeClearOfCutoff` never refuses — this file is about the overlap guard.
	dbMock.employeeStatutoryConfig.findMany.mockResolvedValue([])
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
	dbMock.payrollPeriod.create.mockResolvedValue({ id: 'per1' })
	dbMock.payrollRun.create.mockResolvedValue({ id: 'run1' })
})

const open = (start: string, end: string) =>
	openPeriod(ORG, { name: 'Off-cycle', startDate: d(start), endDate: d(end) }, ctx)

describe('openPeriod — overlap guard', () => {
	it('refuses an overlapping custom range and writes neither row', async () => {
		dbMock.payrollRun.findMany.mockResolvedValue([
			{ id: 'run1', periodStart: d('2026-05-03'), periodEnd: d('2026-05-09') }
		])
		await expect(open('2026-05-05', '2026-05-20')).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining('May 3') }
		})
		expect(dbMock.payrollPeriod.create).not.toHaveBeenCalled()
		expect(dbMock.payrollRun.create).not.toHaveBeenCalled()
	})

	it('opens a custom period when nothing intersects', async () => {
		dbMock.payrollRun.findMany.mockResolvedValue([])
		await open('2026-05-03', '2026-05-09')
		expect(dbMock.$transaction).toHaveBeenCalledTimes(1)
		expect(dbMock.payrollPeriod.create).toHaveBeenCalledTimes(1)
	})
})

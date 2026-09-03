import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { periodOf } from '../../src/lib/utils/pay-periods'

/**
 * #163 (S1) — void, then re-create the same range.
 *
 * `voidRun` only flips `status` to VOIDED; the row stays and the
 * `@@unique([organizationId, periodStart, periodEnd])` constraint still covers it. The overlap
 * guard deliberately skips VOIDED rows, so if the exact-duplicate `findUnique` check were removed
 * in its favour this flow would reach `payrollRun.create` and raise a raw Prisma P2002. P2002 is
 * not an HttpError, so the payroll page would rethrow it as a 500 error page where today the
 * operator gets a clean 409. Hence: BOTH checks run, duplicate first.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
		// #163: both checks and the insert moved inside one transaction; `tx` is this same mock.
		$transaction: vi.fn(),
		$executeRaw: vi.fn()
	}
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { createPayrollRun } = await import('$lib/server/services/payroll/index')

const ORG = 'org1'
const ctx = { organizationId: ORG, actorId: 'u1', actorRoles: ['SUPER_ADMIN'] as Role[] }
const CUSTOM_START = new Date('2026-05-03T00:00:00Z')
const CUSTOM_END = new Date('2026-05-09T00:00:00Z')

beforeEach(() => {
	vi.clearAllMocks()
	// The voided row survives the unique constraint but is invisible to the overlap guard.
	dbMock.payrollRun.findUnique.mockResolvedValue({
		id: 'run-voided',
		status: 'VOIDED',
		periodStart: CUSTOM_START,
		periodEnd: CUSTOM_END
	})
	dbMock.payrollRun.findMany.mockResolvedValue([])
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
})

describe('createPayrollRun — re-creating a VOIDED range', () => {
	it('returns a clean 409, never reaching create (which would raise Prisma P2002)', async () => {
		await expect(createPayrollRun(ORG, CUSTOM_START, CUSTOM_END, ctx)).rejects.toMatchObject({
			status: 409,
			body: { message: 'Payroll run for this period already exists' }
		})
		expect(dbMock.payrollRun.create).not.toHaveBeenCalled()
	})

	it('does the same for a voided STANDARD range', async () => {
		const may = periodOf('SECOND_HALF', 2026, 4)
		await expect(createPayrollRun(ORG, may.periodStart, may.periodEnd, ctx)).rejects.toMatchObject({
			status: 409
		})
		expect(dbMock.payrollRun.create).not.toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { periodOf } from '../../src/lib/utils/pay-periods'

/**
 * #163 criteria 15 and 16 — the timesheet overlap guard. Payroll sums an employee's timesheets by
 * containment, so two sheets sharing a day double-count that day's hours. The guard is scoped to
 * the EMPLOYEE, not the org, and fires only when at least one side is a custom range.
 *
 * The same-start-day duplicate keeps its own 409 and must never surface as a raw Prisma error —
 * the /attendance action funnels service errors through `toFail`, and only an HttpError becomes a
 * form error instead of a 500 page.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		timesheet: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
		// #163: the overlap check, the duplicate check and the insert now run in ONE transaction,
		// under an employee-month advisory lock. `tx` is the same mock, so the assertions hold.
		$transaction: vi.fn(),
		$executeRaw: vi.fn()
	}
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { createTimesheet } = await import('$lib/server/services/timesheets')

const ctx = { organizationId: 'org1', actorId: 'u1', actorRoles: ['HR_ADMIN'] as Role[] }
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

type Row = { id: string; employeeId: string; periodStart: Date; periodEnd: Date }
type Where = { employeeId: string; periodStart: { lt: Date }; periodEnd: { gte: Date } }

let rows: Row[] = []

beforeEach(() => {
	vi.clearAllMocks()
	rows = []
	dbMock.timesheet.findMany.mockImplementation(async ({ where }: { where: Where }) =>
		rows.filter(
			(r) =>
				r.employeeId === where.employeeId &&
				r.periodStart < where.periodStart.lt &&
				r.periodEnd >= where.periodEnd.gte
		)
	)
	dbMock.timesheet.findUnique.mockResolvedValue(null)
	dbMock.timesheet.create.mockResolvedValue({ id: 'ts-new', entries: [] })
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
})

const sheet = (employeeId: string, start: string, end: string) =>
	createTimesheet(employeeId, d(start), d(end), [], ctx)

describe('createTimesheet — employee-scoped overlap guard', () => {
	it('refuses an overlapping custom range for the same employee', async () => {
		rows = [
			{ id: 't1', employeeId: 'emp1', periodStart: d('2026-06-03'), periodEnd: d('2026-06-09') }
		]
		await expect(sheet('emp1', '2026-06-07', '2026-06-14')).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining('Jun 3') }
		})
		expect(dbMock.timesheet.create).not.toHaveBeenCalled()
	})

	it('allows the same range for a DIFFERENT employee', async () => {
		rows = [
			{ id: 't1', employeeId: 'emp1', periodStart: d('2026-06-03'), periodEnd: d('2026-06-09') }
		]
		await sheet('emp2', '2026-06-03', '2026-06-09')
		expect(dbMock.timesheet.create).toHaveBeenCalledTimes(1)
	})

	it('allows an adjacent custom range for the same employee', async () => {
		rows = [
			{ id: 't1', employeeId: 'emp1', periodStart: d('2026-06-03'), periodEnd: d('2026-06-09') }
		]
		await sheet('emp1', '2026-06-10', '2026-06-16')
		expect(dbMock.timesheet.create).toHaveBeenCalledTimes(1)
	})

	// The single real timesheet in the dev DB looks exactly like this: in Manila it runs
	// Aug 10 – Aug 16. UTC-truncating its start to Aug 9 would invent a shared day with a range
	// ending Aug 9 and refuse a legitimate save.
	const legacy = {
		id: 't1',
		employeeId: 'emp1',
		periodStart: new Date('2026-08-09T16:00:00.000Z'),
		periodEnd: new Date('2026-08-16T15:59:59.999Z')
	}

	it('allows a range ending Aug 9 against a PHT-boundary row starting Aug 10', async () => {
		rows = [legacy]
		await sheet('emp1', '2026-08-05', '2026-08-09')
		expect(dbMock.timesheet.create).toHaveBeenCalledTimes(1)
	})

	it('still refuses a range that genuinely shares Aug 10 with it', async () => {
		rows = [legacy]
		await expect(sheet('emp1', '2026-08-05', '2026-08-10')).rejects.toMatchObject({ status: 409 })
		expect(dbMock.timesheet.create).not.toHaveBeenCalled()
	})
})

describe('createTimesheet — the same-start-day duplicate keeps its own 409', () => {
	it('409s with the incumbent message, not a raw Prisma error', async () => {
		const may = periodOf('FIRST_HALF', 2026, 4)
		rows = [
			{ id: 't1', employeeId: 'emp1', periodStart: may.periodStart, periodEnd: may.periodEnd }
		]
		dbMock.timesheet.findUnique.mockResolvedValue({ id: 't1' })
		const err = await createTimesheet('emp1', may.periodStart, may.periodEnd, [], ctx).catch(
			(e) => e
		)
		// Both sides standard → the overlap guard stands down and the duplicate check answers.
		expect(err).toMatchObject({
			status: 409,
			body: { message: 'Timesheet for this period already exists' }
		})
		expect(err.constructor.name).not.toContain('Prisma')
		expect(dbMock.timesheet.create).not.toHaveBeenCalled()
	})
})

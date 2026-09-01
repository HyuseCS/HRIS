import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * deriveRange writes its changed days with ONE set-based statement, not one `update` per row.
 *
 * Why it matters: measured on dev Postgres 18, the sequential loop cost 2.457 ms/row (38 s for
 * 15,500 rows) and blew the transaction budget at ~12,200 changed rows, which a full-org month
 * import reaches. The bulk `UPDATE ... FROM jsonb_to_recordset(...)` does it in 0.070 ms/row.
 *
 * These tests pin the three things that can silently rot:
 *  - it is one statement, and `tx.attendanceDay.update` is not on the mock at all, so a regression
 *    to the loop throws rather than passing quietly;
 *  - `"updatedAt" = now()` is in the SET list — the column has no DB default and Prisma's
 *    @updatedAt is client-side only, so raw SQL that omits it freezes the timestamp with no error;
 *  - the lock/edit flags are re-read INSIDE the transaction, closing the window between the batch
 *    snapshot and the write.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findMany: vi.fn() },
		publicHoliday: { findMany: vi.fn() },
		timeLog: { findMany: vi.fn(), count: vi.fn() },
		request: { findMany: vi.fn() },
		workSchedule: { findFirst: vi.fn() },
		attendanceDay: { findMany: vi.fn() },
		organization: { findUnique: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
const writeAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('$lib/server/audit', () => ({
	writeAuditLog: (...args: unknown[]) => writeAuditLog(...args)
}))

// Deliberately distinct from dbMock, and deliberately WITHOUT `attendanceDay.update`: the audit
// assertion is only meaningful while `tx !== db`, and the missing `update` makes a return to the
// per-row loop fail loudly.
const tx = {
	attendanceDay: { createMany: vi.fn(), findMany: vi.fn() },
	$executeRaw: vi.fn()
}

const { deriveRange } = await import('$lib/server/services/attendance')

const CTX = {
	organizationId: 'org1',
	actorId: 'user1',
	actorRoles: ['HR_ADMIN'] as Role[],
	ipAddress: 'test'
}
// One PHT day: Mon 2026-07-13. No assigned schedule and no org default → 08:00–17:00 last resort.
const RANGE = { from: new Date('2026-07-13'), to: new Date('2026-07-13') }
const WORKED = [
	{ punchType: 'IN' as const, timestamp: new Date('2026-07-13T00:00:00Z') },
	{ punchType: 'OUT' as const, timestamp: new Date('2026-07-13T09:00:00Z') }
]

const employees = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		id: `emp${i + 1}`,
		organizationId: 'org1',
		workSchedule: null
	}))

/** A stale ABSENT row per employee, so every derived day is a *changed* row (an update, not an insert). */
const staleDays = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		id: `ad${i + 1}`,
		employeeId: `emp${i + 1}`,
		date: new Date('2026-07-13'),
		isLocked: false,
		manuallyEdited: false,
		status: 'ABSENT'
	}))

/** The SQL text of the single bulk statement (tagged-template strings, joined). */
const sql = () => (tx.$executeRaw.mock.calls[0][0] as string[]).join(' ')
/** The jsonb payload handed to the statement — the second template value. */
const payload = () => JSON.parse(tx.$executeRaw.mock.calls[0][2] as string)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.publicHoliday.findMany.mockResolvedValue([])
	dbMock.request.findMany.mockResolvedValue([])
	dbMock.workSchedule.findFirst.mockResolvedValue(null)
	dbMock.organization.findUnique.mockResolvedValue({ trackTardiness: true })
	dbMock.timeLog.findMany.mockResolvedValue(WORKED)
	tx.attendanceDay.createMany.mockResolvedValue({ count: 0 })
	tx.$executeRaw.mockResolvedValue(0)
	// Default: every id offered to the in-transaction re-read is still writable.
	tx.attendanceDay.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
		args.where.id.in.map((id) => ({ id }))
	)
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('deriveRange bulk-writes changed days (#4/#5 G1)', () => {
	it('issues ONE statement for many changed rows, not one update per row', async () => {
		dbMock.employee.findMany.mockResolvedValue(employees(25))
		dbMock.attendanceDay.findMany.mockResolvedValue(staleDays(25))

		const res = await deriveRange('org1', RANGE, CTX)

		expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
		expect(payload()).toHaveLength(25)
		expect(res.derived).toBe(25)
	})

	it('sets "updatedAt" explicitly — the column has no DB default', async () => {
		dbMock.employee.findMany.mockResolvedValue(employees(2))
		dbMock.attendanceDay.findMany.mockResolvedValue(staleDays(2))

		await deriveRange('org1', RANGE, CTX)

		expect(sql()).toContain('"updatedAt" = now()')
	})

	it('carries every derived column into the statement, so none is silently dropped', async () => {
		dbMock.employee.findMany.mockResolvedValue(employees(1))
		dbMock.attendanceDay.findMany.mockResolvedValue(staleDays(1))

		await deriveRange('org1', RANGE, CTX)

		// The column list is derived from the payload's own keys, so this pins the count that the
		// `data` object above must keep producing: 22 derived columns + the id.
		expect(Object.keys(payload()[0])).toHaveLength(23)
		const setList = tx.$executeRaw.mock.calls[0][1] as { strings: string[]; sql: string }
		for (const col of Object.keys(payload()[0]).filter((c) => c !== 'id'))
			expect(setList.sql).toContain(`"${col}" = v."${col}"`)
	})

	it('issues no statement at all when nothing changed', async () => {
		// No existing rows → every day is an insert, so the update set is empty.
		dbMock.employee.findMany.mockResolvedValue(employees(3))
		dbMock.attendanceDay.findMany.mockResolvedValue([])

		await deriveRange('org1', RANGE, CTX)

		expect(tx.attendanceDay.createMany).toHaveBeenCalledTimes(1)
		expect(tx.$executeRaw).not.toHaveBeenCalled()
		expect(tx.attendanceDay.findMany).not.toHaveBeenCalled()
	})

	it('still writes the audit row on the transaction client', async () => {
		dbMock.employee.findMany.mockResolvedValue(employees(2))
		dbMock.attendanceDay.findMany.mockResolvedValue(staleDays(2))

		await deriveRange('org1', RANGE, CTX)

		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('serialises hours as JSON numbers and times as ISO strings', async () => {
		// deriveAttendanceDay returns plain `number` and `Date | null`, never Prisma.Decimal, so
		// JSON.stringify emits bare numbers for numeric(5,2) and ISO timestamps for timestamp(3).
		// A future switch to Decimal would emit `{"d":[...]}` objects and fail this.
		dbMock.employee.findMany.mockResolvedValue(employees(1))
		dbMock.attendanceDay.findMany.mockResolvedValue(staleDays(1))

		await deriveRange('org1', RANGE, CTX)

		const row = payload()[0]
		expect(row.status).toBe('PRESENT')
		expect(typeof row.regularHours).toBe('number')
		expect(row.regularHours).toBe(8)
		expect(typeof row.lateMinutes).toBe('number')
		expect(row.timeIn).toBe('2026-07-13T00:00:00.000Z')
		expect(row.amTimeIn).toBeNull() // a null date stays null, it does not vanish
	})
})

describe('deriveRange re-checks the lock flags inside the transaction (#4/#5 R1)', () => {
	it('drops a row that was locked after the batch snapshot was taken', async () => {
		dbMock.employee.findMany.mockResolvedValue(employees(2))
		dbMock.attendanceDay.findMany.mockResolvedValue(staleDays(2)) // both unlocked at snapshot time
		// A concurrent lockRange landed during the compute pass: only ad1 is still writable.
		tx.attendanceDay.findMany.mockResolvedValue([{ id: 'ad1' }])

		await deriveRange('org1', RANGE, CTX)

		expect(tx.attendanceDay.findMany).toHaveBeenCalledTimes(1)
		expect(tx.attendanceDay.findMany.mock.calls[0][0].where).toMatchObject({
			isLocked: false,
			manuallyEdited: false
		})
		expect(payload().map((r: { id: string }) => r.id)).toEqual(['ad1'])
	})

	it('skips the statement entirely when every row was locked in the meantime', async () => {
		dbMock.employee.findMany.mockResolvedValue(employees(2))
		dbMock.attendanceDay.findMany.mockResolvedValue(staleDays(2))
		tx.attendanceDay.findMany.mockResolvedValue([])

		await deriveRange('org1', RANGE, CTX)

		expect(tx.$executeRaw).not.toHaveBeenCalled()
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})
})

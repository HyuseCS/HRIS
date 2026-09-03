import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * Guard behaviour of the page-load derive (`skipUnpunched`). The DB and audit log are mocked so
 * these stay in the pure/fast unit suite; the assertions are on which days get written.
 *
 * #324/D8: the per-day findUnique + upsert became one batch `attendanceDay.findMany` read, an
 * in-memory diff, and one short transaction holding a `createMany` for new days, one set-based
 * bulk `UPDATE` for changed ones, and the audit row. So the mocks feed `findMany` and the
 * assertions read `tx`, not the bare client.
 *
 * Regression target: a day materialised as ABSENT *before* the employee punched used to freeze,
 * because the old `onlyMissing` guard skipped every existing day. `skipUnpunched` instead skips
 * only existing days with no punches, so a freshly-punched "today" self-heals — while still never
 * touching a locked or hand-corrected day.
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

// A distinct transaction client, so a regression back to a bare `db.` write is visible here
// instead of silently committing outside the transaction.
const tx = {
	attendanceDay: { createMany: vi.fn(), findMany: vi.fn() },
	$executeRaw: vi.fn()
}

/** Rows carried by the single bulk UPDATE, if it was issued. */
const bulkRows = (): Record<string, unknown>[] =>
	tx.$executeRaw.mock.calls.length ? JSON.parse(tx.$executeRaw.mock.calls[0][2] as string) : []

const { deriveRange, autoDeriveFromPunches } = await import('$lib/server/services/attendance')

const EMP = { id: 'emp1', organizationId: 'org1', workSchedule: null }
const CTX = {
	organizationId: 'org1',
	actorId: 'user1',
	actorRoles: ['EMPLOYEE'] as Role[],
	ipAddress: 'test'
}
// Single PHT day: Mon 2026-07-13, a regular weekday. The employee has no assigned schedule and
// the org has no default (findFirst → null), so the Mon–Fri 08:00–17:00 last resort applies.
const RANGE = { from: new Date('2026-07-13'), to: new Date('2026-07-13'), employeeId: 'emp1' }
// A full worked day: IN 08:00 PHT (00:00Z), OUT 17:00 PHT (09:00Z) → PRESENT, 8h regular.
const WORKED = [
	{ punchType: 'IN' as const, timestamp: new Date('2026-07-13T00:00:00Z') },
	{ punchType: 'OUT' as const, timestamp: new Date('2026-07-13T09:00:00Z') }
]
/** An already-materialised row for the single day under test, keyed the way the batch read is. */
const existingDay = (over: Record<string, unknown> = {}) => ({
	id: 'ad1',
	employeeId: 'emp1',
	date: new Date('2026-07-13'),
	isLocked: false,
	manuallyEdited: false,
	...over
})

/** How many AttendanceDay rows the transaction actually wrote (inserts + bulk-updated rows). */
const writeCount = () =>
	(tx.attendanceDay.createMany.mock.calls[0]?.[0].data.length ?? 0) + bulkRows().length

/** The single row that landed, whether it went in as an insert or as an update. */
const written = () => tx.attendanceDay.createMany.mock.calls[0]?.[0].data[0] ?? bulkRows()[0]

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findMany.mockResolvedValue([EMP])
	dbMock.publicHoliday.findMany.mockResolvedValue([])
	dbMock.request.findMany.mockResolvedValue([])
	// No org-default schedule configured — exercises the last-resort shift.
	dbMock.workSchedule.findFirst.mockResolvedValue(null)
	dbMock.attendanceDay.findMany.mockResolvedValue([])
	dbMock.organization.findUnique.mockResolvedValue({ trackTardiness: true }) // #190 master on
	tx.attendanceDay.createMany.mockResolvedValue({ count: 1 })
	tx.$executeRaw.mockResolvedValue(0)
	// Nothing locked between the batch snapshot and the write.
	tx.attendanceDay.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
		args.where.id.in.map((id) => ({ id }))
	)
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('deriveRange — skipUnpunched guard', () => {
	it('self-heals a stale machine-written day once punches exist', async () => {
		// The exact bug: the day already exists (ABSENT, materialised before the punch) but now has
		// punches. skipUnpunched must re-derive it rather than skip it.
		dbMock.timeLog.findMany.mockResolvedValue(WORKED)
		dbMock.attendanceDay.findMany.mockResolvedValue([existingDay({ status: 'ABSENT' })])

		const res = await deriveRange('org1', RANGE, CTX, { skipUnpunched: true })

		expect(writeCount()).toBe(1)
		expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
		expect(written().status).toBe('PRESENT')
		expect(res.derived).toBe(1)
		// #324: the audit write shares the transaction.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('never re-derives a manually-edited day, even when it has punches', async () => {
		dbMock.timeLog.findMany.mockResolvedValue(WORKED)
		dbMock.attendanceDay.findMany.mockResolvedValue([existingDay({ manuallyEdited: true })])

		const res = await deriveRange('org1', RANGE, CTX, { skipUnpunched: true })

		expect(writeCount()).toBe(0)
		expect(res.derived).toBe(0)
	})

	it('leaves an existing punch-less day untouched (no churn on cheap loads)', async () => {
		dbMock.timeLog.findMany.mockResolvedValue([])
		dbMock.attendanceDay.findMany.mockResolvedValue([existingDay()])

		await deriveRange('org1', RANGE, CTX, { skipUnpunched: true })

		expect(writeCount()).toBe(0)
	})

	it('still fills a missing day from punches (gap derive)', async () => {
		dbMock.timeLog.findMany.mockResolvedValue(WORKED)
		dbMock.attendanceDay.findMany.mockResolvedValue([])

		await deriveRange('org1', RANGE, CTX, { skipUnpunched: true })

		expect(writeCount()).toBe(1)
		expect(tx.attendanceDay.createMany).toHaveBeenCalledTimes(1)
		expect(written().status).toBe('PRESENT')
	})
})

describe('autoDeriveFromPunches — public entrypoint', () => {
	it('self-heals a stale ABSENT day through the page-load path', async () => {
		dbMock.timeLog.count.mockResolvedValue(2)
		dbMock.timeLog.findMany.mockResolvedValue(WORKED)
		dbMock.attendanceDay.findMany.mockResolvedValue([existingDay({ status: 'ABSENT' })])

		const res = await autoDeriveFromPunches('org1', RANGE, CTX)

		expect(writeCount()).toBe(1)
		expect(res.derived).toBe(1)
	})

	it('short-circuits when the window has no punches at all', async () => {
		dbMock.timeLog.count.mockResolvedValue(0)

		const res = await autoDeriveFromPunches('org1', RANGE, CTX)

		expect(dbMock.attendanceDay.findMany).not.toHaveBeenCalled()
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(res).toEqual({ derived: 0, flagged: 0 })
	})
})

describe('org default schedule is consulted for unassigned employees', () => {
	// The fix: `isDefault` used to be written and displayed but never read, so an unassigned
	// employee was derived against a hardcoded 09:00–18:00 that matched no configuration.
	const orgDefault = (startMinutes: number, endMinutes: number) => ({
		days: [1, 2, 3, 4, 5].map((weekday) => ({
			weekday,
			startMinutes,
			endMinutes,
			breakMinutes: 60
		}))
	})

	it('derives an unassigned employee against the org default, not a hardcoded shift', async () => {
		dbMock.workSchedule.findFirst.mockResolvedValue(orgDefault(480, 1020)) // 08:00–17:00
		dbMock.timeLog.findMany.mockResolvedValue(WORKED) // punched 08:00–17:00
		dbMock.attendanceDay.findMany.mockResolvedValue([])

		await deriveRange('org1', RANGE, CTX, { skipUnpunched: true })

		expect(written().status).toBe('PRESENT')
		expect(written().lateMinutes).toBe(0)
		expect(written().undertimeMinutes).toBe(0)
	})

	it('honours a non-default-hours org schedule, proving the lookup is real', async () => {
		// Org default 10:00–19:00 against the same 08:00–17:00 punches: early in (not late),
		// but two hours short at the end. A hardcoded shift could not produce this.
		dbMock.workSchedule.findFirst.mockResolvedValue(orgDefault(600, 1140))
		dbMock.timeLog.findMany.mockResolvedValue(WORKED)
		dbMock.attendanceDay.findMany.mockResolvedValue([])

		await deriveRange('org1', RANGE, CTX, { skipUnpunched: true })

		expect(written().lateMinutes).toBe(0)
		expect(written().undertimeMinutes).toBe(120)
	})

	it('an assigned schedule still wins over the org default', async () => {
		dbMock.employee.findMany.mockResolvedValue([
			{ ...EMP, workSchedule: orgDefault(480, 1020) } // assigned 08:00–17:00
		])
		dbMock.workSchedule.findFirst.mockResolvedValue(orgDefault(600, 1140)) // default 10:00–19:00
		dbMock.timeLog.findMany.mockResolvedValue(WORKED)
		dbMock.attendanceDay.findMany.mockResolvedValue([])

		await deriveRange('org1', RANGE, CTX, { skipUnpunched: true })

		expect(written().undertimeMinutes).toBe(0) // assigned shift matched exactly
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #162 — the two things `attendance-am-pm-split.test.ts` structurally cannot prove, because it
 * imports `deriveAttendanceDay` directly and never executes `index.ts`:
 *
 *   1. `deriveRange` GATES the split on `isFoodServiceOrg(organizationId)`;
 *   2. `deriveRange` READS `Organization.amPmMinGapMinutes` and passes it down, with NULL falling
 *      back to the built-in 30-minute default.
 *
 * Both were listed as unprovable in the plan's mutation tables (§1.7 row 1 targets `index.ts` but
 * names the pure spec A2; §1.11.7 row 1 does the same with A9/A12). They are provable — the org
 * `findUnique` is already mocked in this suite's style (`attendance-autoderive.test.ts`), so the
 * whole path from the org row to the upserted columns runs here with the REAL derive engine
 * underneath. No stub stands in for the rule.
 *
 * The org mock branches on the `where`/`select` shape: a flat `mockResolvedValue` would hand every
 * tenant JoJo's threshold and make the negative controls below meaningless.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findMany: vi.fn() },
		publicHoliday: { findMany: vi.fn() },
		timeLog: { findMany: vi.fn() },
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

// #324/D8: deriveRange batches its writes into one transaction — new days through `createMany`,
// changed ones through a per-row `update`. A distinct client makes a bare-`db.` regression visible.
const tx = { attendanceDay: { createMany: vi.fn(), update: vi.fn() } }

const { deriveRange } = await import('$lib/server/services/attendance')

const JOJO = 'org_jojo' // food-service
const VEENT = 'org_veent' // not food-service
const RANGE = { from: new Date('2026-07-13'), to: new Date('2026-07-13'), employeeId: 'emp1' }
const ctxFor = (organizationId: string) => ({
	organizationId,
	actorId: 'user1',
	actorRoles: ['HR_ADMIN'] as Role[],
	ipAddress: 'test'
})

// PHT 08:00–11:00 + 11:20–17:00 on Mon 2026-07-13 — a 20-minute gap, between the 5-minute floor
// and the 30-minute default, so the stored threshold decides the answer.
const NARROW_GAP = [
	{ punchType: 'IN' as const, timestamp: new Date('2026-07-13T00:00:00Z') },
	{ punchType: 'OUT' as const, timestamp: new Date('2026-07-13T03:00:00Z') },
	{ punchType: 'IN' as const, timestamp: new Date('2026-07-13T03:20:00Z') },
	{ punchType: 'OUT' as const, timestamp: new Date('2026-07-13T09:00:00Z') }
]

/** Whatever `deriveRange` wrote for the single day. Every case here starts with no stored row,
 *  so the day always lands as an insert in the batch `createMany`. */
const written = () => tx.attendanceDay.createMany.mock.calls[0][0].data[0]

function orgRow(gapMinutes: number | null) {
	dbMock.organization.findUnique.mockImplementation(
		({ where, select }: { where: { id: string }; select: Record<string, boolean> }) =>
			Promise.resolve(
				where.id === JOJO || where.id === VEENT
					? {
							...(select.trackTardiness ? { trackTardiness: true } : {}),
							...(select.amPmMinGapMinutes ? { amPmMinGapMinutes: gapMinutes } : {})
						}
					: null
			)
	)
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findMany.mockResolvedValue([
		{ id: 'emp1', organizationId: JOJO, workSchedule: null }
	])
	dbMock.publicHoliday.findMany.mockResolvedValue([])
	dbMock.request.findMany.mockResolvedValue([])
	dbMock.workSchedule.findFirst.mockResolvedValue(null)
	dbMock.attendanceDay.findMany.mockResolvedValue([])
	tx.attendanceDay.createMany.mockResolvedValue({ count: 1 })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
	dbMock.timeLog.findMany.mockResolvedValue(NARROW_GAP)
	orgRow(null)
})

describe('#162 — deriveRange gates the split on the org (criterion 20)', () => {
	it('writes the four columns for a food-service tenant', async () => {
		orgRow(15)
		await deriveRange(JOJO, RANGE, ctxFor(JOJO))
		expect(written().amTimeIn).toBeInstanceOf(Date)
		expect(written().pmTimeIn).toBeInstanceOf(Date)
		// #324: the write and the audit share one transaction.
		expect(tx.attendanceDay.createMany).toHaveBeenCalledTimes(1)
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('writes four nulls for a non-food-service tenant, even with a threshold stored', async () => {
		orgRow(15)
		await deriveRange(VEENT, RANGE, ctxFor(VEENT))
		expect(written().amTimeIn).toBeNull()
		expect(written().amTimeOut).toBeNull()
		expect(written().pmTimeIn).toBeNull()
		expect(written().pmTimeOut).toBeNull()
		// The rest of the row is a normal derive — gating removes the split, not the day.
		expect(written().timeIn).toBeInstanceOf(Date)
		expect(written().status).toBe('PRESENT')
	})
})

describe('#162 Amendment 1 — deriveRange reads the stored threshold', () => {
	it('NULL falls back to the 30-minute default, so a 20-minute gap does not split', async () => {
		orgRow(null)
		await deriveRange(JOJO, RANGE, ctxFor(JOJO))
		expect(written().amTimeIn).toBeNull()
		expect(written().pmTimeIn).toBeNull()
		// The day itself is still derived normally.
		expect(written().timeIn).toBeInstanceOf(Date)
	})

	it('15 splits the SAME punches at the 20-minute gap', async () => {
		orgRow(15)
		await deriveRange(JOJO, RANGE, ctxFor(JOJO))
		const w = written()
		expect(w.amTimeIn).toEqual(new Date('2026-07-13T00:00:00Z'))
		expect(w.amTimeOut).toEqual(new Date('2026-07-13T03:00:00Z'))
		expect(w.pmTimeIn).toEqual(new Date('2026-07-13T03:20:00Z'))
		expect(w.pmTimeOut).toEqual(new Date('2026-07-13T09:00:00Z'))
		// timeIn/timeOut keep their meaning, and the hours are the ones the no-split run produced.
		expect(w.timeIn).toEqual(new Date('2026-07-13T00:00:00Z'))
		expect(w.timeOut).toEqual(new Date('2026-07-13T09:00:00Z'))
	})

	it('30 does not split them — same punches, same org, different setting', async () => {
		orgRow(30)
		await deriveRange(JOJO, RANGE, ctxFor(JOJO))
		expect(written().amTimeIn).toBeNull()
		expect(written().pmTimeIn).toBeNull()
	})

	it('the threshold never moves an hour bucket (display-only, through the writer)', async () => {
		orgRow(null)
		await deriveRange(JOJO, RANGE, ctxFor(JOJO))
		const noSplit = { ...written() }
		vi.clearAllMocks()
		dbMock.employee.findMany.mockResolvedValue([
			{ id: 'emp1', organizationId: JOJO, workSchedule: null }
		])
		dbMock.publicHoliday.findMany.mockResolvedValue([])
		dbMock.request.findMany.mockResolvedValue([])
		dbMock.workSchedule.findFirst.mockResolvedValue(null)
		dbMock.attendanceDay.findMany.mockResolvedValue([])
		tx.attendanceDay.createMany.mockResolvedValue({ count: 1 })
		dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
		dbMock.timeLog.findMany.mockResolvedValue(NARROW_GAP)
		orgRow(15)
		await deriveRange(JOJO, RANGE, ctxFor(JOJO))
		const split = written()
		expect(split.pmTimeIn).not.toBeNull()
		for (const k of [
			'workedHours',
			'regularHours',
			'overtimeHours',
			'nightDiffHours',
			'lateMinutes',
			'undertimeMinutes',
			'breakMinutes'
		]) {
			expect(split[k], k).toEqual(noSplit[k])
		}
	})

	it('reads the threshold on the org row it already fetches — no extra query', async () => {
		orgRow(15)
		await deriveRange(JOJO, RANGE, ctxFor(JOJO))
		expect(dbMock.organization.findUnique).toHaveBeenCalledTimes(1)
		expect(dbMock.organization.findUnique).toHaveBeenCalledWith({
			where: { id: JOJO },
			select: { trackTardiness: true, amPmMinGapMinutes: true }
		})
	})
})

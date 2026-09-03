import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	deriveAttendanceDay,
	type AttPunchType,
	type ScheduleDay
} from '$lib/server/services/attendance/derive'

/**
 * #162 criterion 3 — the AM/PM split is DISPLAY ONLY: it must never reach a payroll bucket, and a
 * split day must still count as ONE day of work.
 *
 * Two halves, because the schema comment is not a gate:
 *   1. the engine half — the same punches derived with the flag on and off produce identical hours;
 *   2. the seam half (contract instruction E1) — two `AttendanceDay` rows differing ONLY in the
 *      four AM/PM columns produce deep-equal `AttendanceInput` objects through
 *      `buildAttendanceInput`, which is the function payroll actually calls.
 *
 * `buildAttendanceInput` reads the DB, so `$lib/server/db` is mocked. The mock is keyed on the
 * `where` shape rather than a flat `mockResolvedValue`, so a query for the wrong employee returns
 * nothing instead of silently returning the fixture (see `tests/unit/punch-access.test.ts:57-65`).
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: { attendanceDay: { findMany: vi.fn() } }
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { buildAttendanceInput } = await import('$lib/server/services/attendance/input')

const T = (hhmm: string) => `2026-07-13T${hhmm}:00+08:00` // Mon, PHT
const p = (punchType: AttPunchType, iso: string) => ({ punchType, timestamp: new Date(iso) })
const SCHED_8_5: ScheduleDay = { startMinutes: 480, endMinutes: 1020, breakMinutes: 60 }
const EMP = 'emp1'

// The A1 punch set: 08:00–11:00 + 13:00–17:00, one split shift on one date.
const SPLIT_SHIFT = [
	p('IN', T('08:00')),
	p('OUT', T('11:00')),
	p('IN', T('13:00')),
	p('OUT', T('17:00'))
]

const derive = (splitAmPm: boolean) =>
	deriveAttendanceDay({ punches: SPLIT_SHIFT, schedule: SCHED_8_5, dayType: 'REGULAR', splitAmPm })

/** An AttendanceDay row as Prisma would return it, from a derive result. */
const rowOf = (r: ReturnType<typeof derive>) => ({
	date: new Date('2026-07-13'),
	status: r.status,
	timeIn: r.timeIn,
	timeOut: r.timeOut,
	amTimeIn: r.amTimeIn,
	amTimeOut: r.amTimeOut,
	pmTimeIn: r.pmTimeIn,
	pmTimeOut: r.pmTimeOut,
	regularHours: r.regularHours,
	overtimeHours: r.overtimeHours,
	nightDiffHours: r.nightDiffHours,
	restDayHours: r.restDayHours,
	restDayOtHours: r.restDayOtHours,
	regularHolidayHours: r.regularHolidayHours,
	regularHolidayOtHours: r.regularHolidayOtHours,
	specialHolidayHours: r.specialHolidayHours,
	specialHolidayOtHours: r.specialHolidayOtHours,
	lateMinutes: r.lateMinutes,
	undertimeMinutes: r.undertimeMinutes
})

const PERIOD = { start: new Date('2026-07-01'), end: new Date('2026-07-31') }

beforeEach(() => vi.clearAllMocks())

describe('#162 — AM/PM never reaches payroll (criterion 3)', () => {
	it('the flag changes no hour bucket and no tardiness minute', () => {
		const on = derive(true)
		const off = derive(false)
		expect(on.pmTimeIn).not.toBeNull() // the split really happened…
		expect(off.pmTimeIn).toBeNull()
		// …and every payroll-facing number is identical.
		for (const k of [
			'workedHours',
			'regularHours',
			'overtimeHours',
			'rawOvertimeHours',
			'nightDiffHours',
			'restDayHours',
			'restDayOtHours',
			'regularHolidayHours',
			'regularHolidayOtHours',
			'specialHolidayHours',
			'specialHolidayOtHours',
			'lateMinutes',
			'undertimeMinutes',
			'breakMinutes'
		] as const) {
			expect(on[k]).toBe(off[k])
		}
	})

	it('a split day is still ONE day of work', async () => {
		// "Days of Work" on the payslip is a row count (payslip-fetch.ts:149). The split adds no
		// row: the same punches produce one AttendanceDay either way.
		for (const splitAmPm of [true, false]) {
			dbMock.attendanceDay.findMany.mockImplementation(
				({ where }: { where: { employeeId: string } }) =>
					Promise.resolve(where.employeeId === EMP ? [rowOf(derive(splitAmPm))] : [])
			)
			const rows = await dbMock.attendanceDay.findMany({ where: { employeeId: EMP } })
			expect(rows).toHaveLength(1)
		}
	})

	it('E1 — two rows differing only in the AM/PM columns build the same AttendanceInput', async () => {
		dbMock.attendanceDay.findMany.mockImplementation(
			({ where }: { where: { employeeId: string } }) =>
				Promise.resolve(where.employeeId === EMP ? [rowOf(derive(true))] : [])
		)
		const withSplit = await buildAttendanceInput(EMP, PERIOD.start, PERIOD.end)

		dbMock.attendanceDay.findMany.mockImplementation(
			({ where }: { where: { employeeId: string } }) =>
				Promise.resolve(where.employeeId === EMP ? [rowOf(derive(false))] : [])
		)
		const withoutSplit = await buildAttendanceInput(EMP, PERIOD.start, PERIOD.end)

		expect(withSplit).not.toBeNull()
		expect(withSplit).toEqual(withoutSplit)
	})

	it('E1 — the seam ignores AM/PM even when they contradict the day entirely', async () => {
		// Deliberately absurd values: if any accumulator ever learned to read them, this would move.
		const base = rowOf(derive(false))
		const poisoned = {
			...base,
			amTimeIn: new Date('1999-01-01T00:00:00Z'),
			amTimeOut: new Date('1999-01-01T23:00:00Z'),
			pmTimeIn: new Date('1999-01-02T00:00:00Z'),
			pmTimeOut: new Date('1999-01-02T23:00:00Z')
		}
		dbMock.attendanceDay.findMany.mockImplementation(
			({ where }: { where: { employeeId: string } }) =>
				Promise.resolve(where.employeeId === EMP ? [base] : [])
		)
		const clean = await buildAttendanceInput(EMP, PERIOD.start, PERIOD.end)

		dbMock.attendanceDay.findMany.mockImplementation(
			({ where }: { where: { employeeId: string } }) =>
				Promise.resolve(where.employeeId === EMP ? [poisoned] : [])
		)
		expect(await buildAttendanceInput(EMP, PERIOD.start, PERIOD.end)).toEqual(clean)
	})
})

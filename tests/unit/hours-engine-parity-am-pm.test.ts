import { describe, it, expect } from 'vitest'
import {
	deriveAttendanceDay,
	type AttPunchType,
	type ScheduleDay
} from '$lib/server/services/attendance/derive'
import { pairPunchesToDailyHours } from '$lib/server/services/timelog'

/**
 * #162 criterion 4 — engine A (`deriveAttendanceDay`, the attendance page and payroll seam) and
 * engine B (`pairPunchesToDailyHours`, the timesheet aggregation) both reduce the same punches to
 * hours. This pins their relationship on the AM/PM split shift ONLY. Full engine unification is
 * out of scope per the SPEC; the point here is that #162 does not move either engine.
 *
 * They now AGREE on this shift. They did not before: engine A deducted the schedule's break
 * duration on top of the inter-block gap the employee had already spent clocked out, so a split
 * shift paid 7h against engine B's 8h. That was a real underpayment on any two-segment day; it
 * predated #162, which only made split shifts common enough for anyone to notice. `derive.ts` now
 * counts time between work segments as break already taken, so only a shortfall is deducted.
 *
 * Agreement here is NOT full engine unification — that stays out of scope per the SPEC. The two
 * still use different rules (B has a fixed 12:00–13:00 lunch; A is schedule-driven) and will
 * diverge on a shift whose gap does not sit over noon. This pins the split shift only.
 */

const T = (hhmm: string) => `2026-07-13T${hhmm}:00+08:00` // Mon, PHT
const p = (punchType: AttPunchType, iso: string) => ({ punchType, timestamp: new Date(iso) })
const SCHED_8_5: ScheduleDay = { startMinutes: 480, endMinutes: 1020, breakMinutes: 60 }
const DAY = '2026-07-13'

// The gap IS the 12:00–13:00 lunch, which is the only punch set where the two engines can be
// compared without engine B's fixed window being obviously wrong for the shift.
const SPLIT_SHIFT = [
	p('IN', T('08:00')),
	p('OUT', T('12:00')),
	p('IN', T('13:00')),
	p('OUT', T('17:00'))
]

describe('#162 — engine A / engine B on the AM/PM split shift (criterion 4)', () => {
	it('both engines pay the full 8h, with or without the split flag', () => {
		const b = pairPunchesToDailyHours(SPLIT_SHIFT)
		expect(b.warnings).toEqual([])
		expect(b.hoursByDay[DAY]).toBeCloseTo(8, 2)
		expect(b.otByDay[DAY]).toBeCloseTo(0, 2)

		for (const splitAmPm of [true, false]) {
			const a = deriveAttendanceDay({
				punches: SPLIT_SHIFT,
				schedule: SCHED_8_5,
				dayType: 'REGULAR',
				splitAmPm
			})
			// 08:00–12:00 + 13:00–17:00 is eight hours on the clock. The hour between them is
			// already unpaid by virtue of being clocked out; deducting the scheduled break on top
			// of it was the bug.
			expect(a.workedHours).toBeCloseTo(8, 2)
			expect(b.hoursByDay[DAY] - a.workedHours).toBeCloseTo(0, 2)
			expect(a.overtimeHours).toBeCloseTo(0, 2)
			// The break is recorded as the hour actually taken, not the scheduled hour.
			expect(a.breakMinutes).toBe(60)
		}
	})

	it('the split flag moves neither engine', () => {
		const on = deriveAttendanceDay({
			punches: SPLIT_SHIFT,
			schedule: SCHED_8_5,
			dayType: 'REGULAR',
			splitAmPm: true
		})
		const off = deriveAttendanceDay({
			punches: SPLIT_SHIFT,
			schedule: SCHED_8_5,
			dayType: 'REGULAR',
			splitAmPm: false
		})
		expect(on.workedHours).toBe(off.workedHours)
		expect(on.regularHours).toBe(off.regularHours)
		// Engine B has no AM/PM concept at all — it is punch-shape only, so it cannot see the flag.
		expect(pairPunchesToDailyHours(SPLIT_SHIFT).hoursByDay[DAY]).toBeCloseTo(8, 2)
		expect(on.amTimeOut).not.toBeNull()
	})
})

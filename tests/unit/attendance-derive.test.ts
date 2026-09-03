import { describe, it, expect } from 'vitest'
import {
	deriveAttendanceDay,
	type AttPunchType,
	type ScheduleDay,
	type DayType
} from '$lib/server/services/attendance/derive'

const T = (hhmm: string) => `2026-07-13T${hhmm}:00+08:00` // Mon, PHT
const T2 = (hhmm: string) => `2026-07-14T${hhmm}:00+08:00`
const p = (punchType: AttPunchType, iso: string) => ({ punchType, timestamp: new Date(iso) })
const SCHED: ScheduleDay = { startMinutes: 540, endMinutes: 1080, breakMinutes: 60 } // 09:00–18:00, 1h break → 8h
const SCHED_8_5: ScheduleDay = { startMinutes: 480, endMinutes: 1020, breakMinutes: 60 } // 08:00–17:00, 1h break → 8h

function derive(
	punches: ReturnType<typeof p>[],
	opts: {
		schedule?: ScheduleDay | null
		dayType?: DayType
		approvedOtHours?: number
		onLeave?: boolean
		enforceTardiness?: boolean
	} = {}
) {
	return deriveAttendanceDay({
		punches,
		schedule: opts.schedule === undefined ? SCHED : opts.schedule,
		dayType: opts.dayType ?? 'REGULAR',
		approvedOtHours: opts.approvedOtHours,
		onLeave: opts.onLeave,
		enforceTardiness: opts.enforceTardiness
	})
}

describe('deriveAttendanceDay — regular day', () => {
	it('a full 9–18 day with a 1h break = 8 regular hours, no OT/late', () => {
		const r = derive([
			p('IN', T('09:00')),
			p('BREAK_START', T('12:00')),
			p('BREAK_END', T('13:00')),
			p('OUT', T('18:00'))
		])
		expect(r.workedHours).toBeCloseTo(8, 2)
		expect(r.regularHours).toBeCloseTo(8, 2)
		expect(r.overtimeHours).toBe(0)
		expect(r.breakMinutes).toBe(60)
		expect(r.lateMinutes).toBe(0)
		expect(r.undertimeMinutes).toBe(0)
		expect(r.nightDiffHours).toBe(0)
		expect(r.status).toBe('PRESENT')
	})

	it('flags late arrival and marks status LATE', () => {
		const r = derive([
			p('IN', T('09:30')),
			p('BREAK_START', T('12:00')),
			p('BREAK_END', T('13:00')),
			p('OUT', T('18:00'))
		])
		expect(r.lateMinutes).toBe(30)
		expect(r.workedHours).toBeCloseTo(7.5, 2)
		expect(r.status).toBe('LATE')
	})

	it('flags undertime when leaving early', () => {
		// 7h at work, left 2h early. The unpaid lunch still comes off (see the meal-break
		// suite below), so 09:00–16:00 pays 6h, not 7.
		const r = derive([p('IN', T('09:00')), p('OUT', T('16:00'))])
		expect(r.undertimeMinutes).toBe(120)
		expect(r.workedHours).toBeCloseTo(6, 2)
	})
})

// Employees clock IN in the morning and OUT in the afternoon — they never punch
// BREAK_START/BREAK_END. The scheduled meal break is unpaid either way, so it has to be
// deducted from worked hours or an 8–5 day reads as 9h and invents an hour of overtime.
describe('deriveAttendanceDay — unpaid meal break when breaks are not punched', () => {
	it('an 8–5 day with only IN/OUT = 8 worked hours and no phantom overtime', () => {
		const r = derive([p('IN', T('08:00')), p('OUT', T('17:00'))], { schedule: SCHED_8_5 })
		expect(r.workedHours).toBeCloseTo(8, 2)
		expect(r.regularHours).toBeCloseTo(8, 2)
		expect(r.rawOvertimeHours).toBeCloseTo(0, 2)
		expect(r.overtimeHours).toBe(0)
		expect(r.breakMinutes).toBe(60)
		expect(r.status).toBe('PRESENT')
	})

	it('a 9–18 day with only IN/OUT = 8 worked hours', () => {
		const r = derive([p('IN', T('09:00')), p('OUT', T('18:00'))])
		expect(r.workedHours).toBeCloseTo(8, 2)
		expect(r.rawOvertimeHours).toBeCloseTo(0, 2)
	})

	it('still reports genuine overtime, net of the meal break', () => {
		const r = derive([p('IN', T('08:00')), p('OUT', T('20:00'))], { schedule: SCHED_8_5 })
		expect(r.workedHours).toBeCloseTo(11, 2) // 12h at work − 1h lunch
		expect(r.regularHours).toBeCloseTo(8, 2)
		expect(r.rawOvertimeHours).toBeCloseTo(3, 2)
	})

	it('a short day keeps every minute — no meal break is owed at or under 5h', () => {
		const r = derive([p('IN', T('08:00')), p('OUT', T('12:00'))], { schedule: SCHED_8_5 })
		expect(r.workedHours).toBeCloseTo(4, 2)
		expect(r.breakMinutes).toBe(0)
	})

	it('does not deduct the break twice when it IS punched', () => {
		const r = derive(
			[
				p('IN', T('08:00')),
				p('BREAK_START', T('12:00')),
				p('BREAK_END', T('13:00')),
				p('OUT', T('17:00'))
			],
			{ schedule: SCHED_8_5 }
		)
		expect(r.workedHours).toBeCloseTo(8, 2)
		expect(r.breakMinutes).toBe(60)
	})

	it('honours a punched break longer than the scheduled one', () => {
		const r = derive(
			[
				p('IN', T('08:00')),
				p('BREAK_START', T('12:00')),
				p('BREAK_END', T('14:00')),
				p('OUT', T('17:00'))
			],
			{ schedule: SCHED_8_5 }
		)
		expect(r.workedHours).toBeCloseTo(7, 2)
		expect(r.breakMinutes).toBe(120)
	})

	// Historical rows can still carry BREAK punches (the /break command is gone, but old
	// data keeps them), and a stray one can sit outside the IN/OUT window. Only the part
	// that overlaps a work segment ever comes off the clock, so only that part may count
	// against the scheduled meal break.
	it('ignores a punched break that falls entirely outside the shift', () => {
		const r = derive(
			[
				p('IN', T('08:00')),
				p('OUT', T('17:00')),
				p('BREAK_START', T('18:00')),
				p('BREAK_END', T('20:00'))
			],
			{ schedule: SCHED_8_5 }
		)
		expect(r.workedHours).toBeCloseTo(8, 2) // the meal deduction still applies
		expect(r.breakMinutes).toBe(60) // the 2h outside the shift is not a meal break
	})

	it('tops a partially-overlapping punched break up to the scheduled meal break', () => {
		// 16:30–17:30 overlaps the shift by only 30 minutes.
		const r = derive(
			[
				p('IN', T('08:00')),
				p('BREAK_START', T('16:30')),
				p('BREAK_END', T('17:30')),
				p('OUT', T('17:00'))
			],
			{ schedule: SCHED_8_5 }
		)
		expect(r.workedHours).toBeCloseTo(8, 2)
		expect(r.breakMinutes).toBe(60)
	})

	it('counts only the overlap when no scheduled meal break applies', () => {
		// Rest day → no schedule, so nothing tops the punched break up and the reported
		// break is exactly the 30 minutes subtractIntervals actually removed.
		const r = derive(
			[
				p('IN', T('08:00')),
				p('BREAK_START', T('16:30')),
				p('BREAK_END', T('17:30')),
				p('OUT', T('17:00'))
			],
			{ schedule: null, dayType: 'REST_DAY' }
		)
		expect(r.workedHours).toBeCloseTo(8.5, 2)
		expect(r.breakMinutes).toBe(30)
	})

	it('leaves rest days and holidays alone (no schedule → no break to deduct)', () => {
		const r = derive([p('IN', T('08:00')), p('OUT', T('17:00'))], {
			schedule: null,
			dayType: 'REGULAR_HOLIDAY'
		})
		expect(r.workedHours).toBeCloseTo(9, 2)
	})
})

// #190: tardiness tracking can be switched off (org master AND per-schedule). The caller passes
// the resolved flag; here we assert the pure gate. Only lateness is affected — undertime stays.
describe('deriveAttendanceDay — tardiness tracking toggle', () => {
	it('tracks lateness by default (enforceTardiness omitted)', () => {
		const r = derive([p('IN', T('09:30')), p('OUT', T('18:00'))])
		expect(r.lateMinutes).toBe(30)
		expect(r.status).toBe('LATE')
	})

	it('never marks LATE when tardiness tracking is off', () => {
		const r = derive([p('IN', T('09:30')), p('OUT', T('18:00'))], { enforceTardiness: false })
		expect(r.lateMinutes).toBe(0)
		expect(r.status).toBe('PRESENT')
	})

	it('still computes undertime when tardiness tracking is off (gate is late-only)', () => {
		// Late in (09:30) AND early out (16:00): late is suppressed, undertime is not.
		const r = derive([p('IN', T('09:30')), p('OUT', T('16:00'))], { enforceTardiness: false })
		expect(r.lateMinutes).toBe(0)
		expect(r.undertimeMinutes).toBe(120)
		expect(r.status).toBe('PRESENT')
	})
})

describe('deriveAttendanceDay — overtime is gated on approval', () => {
	it('reports rawOvertime but pays 0 without approval', () => {
		const r = derive([
			p('IN', T('09:00')),
			p('BREAK_START', T('12:00')),
			p('BREAK_END', T('13:00')),
			p('OUT', T('20:00'))
		])
		expect(r.workedHours).toBeCloseTo(10, 2)
		expect(r.regularHours).toBeCloseTo(8, 2)
		expect(r.rawOvertimeHours).toBeCloseTo(2, 2)
		expect(r.overtimeHours).toBe(0) // gated
	})

	it('pays approved overtime up to the approved amount', () => {
		const r = derive(
			[
				p('IN', T('09:00')),
				p('BREAK_START', T('12:00')),
				p('BREAK_END', T('13:00')),
				p('OUT', T('20:00'))
			],
			{
				approvedOtHours: 2
			}
		)
		expect(r.overtimeHours).toBeCloseTo(2, 2)
	})
})

describe('deriveAttendanceDay — night differential', () => {
	it('counts hours inside the 22:00–06:00 window (overnight rest-day shift)', () => {
		const r = derive([p('IN', T('22:00')), p('OUT', T2('02:00'))], {
			schedule: null,
			dayType: 'REST_DAY'
		})
		expect(r.workedHours).toBeCloseTo(4, 2)
		expect(r.nightDiffHours).toBeCloseTo(4, 2) // all within night window
		expect(r.restDayHours).toBeCloseTo(4, 2)
		expect(r.status).toBe('PRESENT')
	})

	it('counts only the portion inside the window', () => {
		const r = derive([p('IN', T('04:00')), p('OUT', T('10:00'))], { schedule: null })
		expect(r.workedHours).toBeCloseTo(6, 2)
		expect(r.nightDiffHours).toBeCloseTo(2, 2) // 04:00–06:00
	})

	it('never pays night differential on the unpaid meal break', () => {
		// 22:00–04:00 sits wholly inside the night window, so the hour spent at the
		// (unpunched) meal break must not be counted as night-differential time.
		const r = derive([p('IN', T('22:00')), p('OUT', T2('04:00'))], {
			schedule: { startMinutes: 22 * 60, endMinutes: 28 * 60, breakMinutes: 60 }
		})
		expect(r.workedHours).toBeCloseTo(5, 2) // 6h at work − 1h lunch
		expect(r.nightDiffHours).toBeCloseTo(5, 2) // not 6
	})
})

// The AttendanceDay is keyed on the punch-in date, so a shift that runs past midnight keeps
// ALL of its hours — regular, OT and night differential — on the day the employee clocked in.
// Nothing is split at the calendar boundary (see the header comment in derive.ts).
describe('deriveAttendanceDay — shifts crossing midnight stay on the punch-in day', () => {
	// 08:00–16:00 straight, no meal break: the customer's 16h case expects the full clock
	// time to count, so the threshold is 8h with nothing deducted.
	const SCHED_8H_NO_BREAK: ScheduleDay = { startMinutes: 480, endMinutes: 960, breakMinutes: 0 }

	it('16h shift (Mon 08:00 → Tue 00:00) = 8 regular + 8 OT + 2 night-diff, all on Monday', () => {
		const r = derive([p('IN', T('08:00')), p('OUT', T2('00:00'))], {
			schedule: SCHED_8H_NO_BREAK,
			approvedOtHours: 8
		})
		expect(r.workedHours).toBeCloseTo(16, 2)
		expect(r.regularHours).toBeCloseTo(8, 2)
		expect(r.rawOvertimeHours).toBeCloseTo(8, 2)
		expect(r.overtimeHours).toBeCloseTo(8, 2)
		expect(r.nightDiffHours).toBeCloseTo(2, 2) // 22:00 Mon → 00:00 Tue
		expect(r.status).toBe('PRESENT')
		// One result, one day: the punch-out lands on Tuesday but the hours above are Monday's.
		expect(r.timeIn?.toISOString()).toBe(new Date(T('08:00')).toISOString())
		expect(r.timeOut?.toISOString()).toBe(new Date(T2('00:00')).toISOString())
	})

	it('20h shift (Mon 08:00 → Tue 04:00) = 8 regular + 12 OT + 6 night-diff', () => {
		const r = derive([p('IN', T('08:00')), p('OUT', T2('04:00'))], {
			schedule: SCHED_8H_NO_BREAK,
			approvedOtHours: 12
		})
		expect(r.workedHours).toBeCloseTo(20, 2)
		expect(r.regularHours).toBeCloseTo(8, 2)
		expect(r.rawOvertimeHours).toBeCloseTo(12, 2)
		expect(r.overtimeHours).toBeCloseTo(12, 2)
		expect(r.nightDiffHours).toBeCloseTo(6, 2) // 22:00 Mon → 04:00 Tue
	})

	it('still deducts the unpaid meal break on a cross-midnight shift', () => {
		// Same 16 clock hours, but on an 08:00–17:00 schedule the 1h lunch comes off: 15 paid.
		const r = derive([p('IN', T('08:00')), p('OUT', T2('00:00'))], {
			schedule: SCHED_8_5,
			approvedOtHours: 8
		})
		expect(r.workedHours).toBeCloseTo(15, 2)
		expect(r.regularHours).toBeCloseTo(8, 2)
		expect(r.rawOvertimeHours).toBeCloseTo(7, 2)
		expect(r.breakMinutes).toBe(60)
	})

	it('leaves the ordinary 8-hour day untouched — no OT, no night differential', () => {
		const r = derive([p('IN', T('08:00')), p('OUT', T('17:00'))], { schedule: SCHED_8_5 })
		expect(r.workedHours).toBeCloseTo(8, 2)
		expect(r.regularHours).toBeCloseTo(8, 2)
		expect(r.rawOvertimeHours).toBe(0)
		expect(r.overtimeHours).toBe(0)
		expect(r.nightDiffHours).toBe(0)
	})
})

describe('deriveAttendanceDay — day types & holidays', () => {
	it('routes worked hours to the regular-holiday bucket', () => {
		const r = derive([p('IN', T('09:00')), p('OUT', T('17:00'))], {
			schedule: null,
			dayType: 'REGULAR_HOLIDAY'
		})
		expect(r.regularHolidayHours).toBeCloseTo(8, 2)
		expect(r.regularHours).toBe(0)
		expect(r.status).toBe('PRESENT')
	})
})

describe('deriveAttendanceDay — empty / edge states', () => {
	it('no punches on a rest day → REST_DAY, zero hours', () => {
		const r = derive([], { schedule: null, dayType: 'REST_DAY' })
		expect(r.status).toBe('REST_DAY')
		expect(r.workedHours).toBe(0)
	})

	it('no punches on a scheduled day → ABSENT', () => {
		expect(derive([]).status).toBe('ABSENT')
	})

	it('IN without OUT → INCOMPLETE with timeIn set', () => {
		const r = derive([p('IN', T('09:00'))])
		expect(r.status).toBe('INCOMPLETE')
		expect(r.timeIn).not.toBeNull()
		expect(r.workedHours).toBe(0)
	})

	it('an approved leave day → ON_LEAVE with zero hours', () => {
		const r = derive([p('IN', T('09:00')), p('OUT', T('18:00'))], { onLeave: true })
		expect(r.status).toBe('ON_LEAVE')
		expect(r.workedHours).toBe(0)
	})
})

/**
 * A break the employee has ALREADY taken is not deducted again.
 *
 * `punchedBreakMs` only sees BREAK_* punches landing inside a work segment. Time between two
 * work segments — clocked out, not yet back in — is invisible to it, and was never part of
 * `punchedNetMs` either. The scheduled meal break was therefore subtracted on top of it, and any
 * two-segment day paid up to a full break short. It predates the AM/PM work; #162 only made split
 * shifts common enough to notice.
 *
 * The rule is a shortfall, not a replacement: a break shorter than the scheduled one still gets
 * topped up to it, and a longer one is never topped back down.
 */
describe('the scheduled break is only deducted to the extent it has not been taken', () => {
	it('pays a split shift for every hour on the clock', () => {
		// 08:00–12:00 and 13:00–17:00 = 8h worked, 1h already unpaid between the blocks.
		const r = derive(
			[p('IN', T('08:00')), p('OUT', T('12:00')), p('IN', T('13:00')), p('OUT', T('17:00'))],
			{ schedule: SCHED_8_5 }
		)
		expect(r.workedHours).toBeCloseTo(8, 2)
		expect(r.breakMinutes).toBe(60)
		expect(r.overtimeHours).toBeCloseTo(0, 2)
	})

	it('tops a short gap up to the scheduled break, rather than accepting it', () => {
		// Only 20 minutes off the clock against a 60-minute scheduled break: 40 minutes are still
		// owed. Guards the opposite error — treating any gap at all as the whole meal break.
		const r = derive(
			[p('IN', T('08:00')), p('OUT', T('11:50')), p('IN', T('12:10')), p('OUT', T('17:00'))],
			{ schedule: SCHED_8_5 }
		)
		expect(r.workedHours).toBeCloseTo(8, 2) // 8h40m on the clock − 40m shortfall
		expect(r.breakMinutes).toBe(60)
	})

	it('does not top a longer break back down', () => {
		// Three hours between blocks. The employee is paid for the six they worked, not seven.
		const r = derive(
			[p('IN', T('08:00')), p('OUT', T('11:00')), p('IN', T('14:00')), p('OUT', T('17:00'))],
			{ schedule: SCHED_8_5 }
		)
		expect(r.workedHours).toBeCloseTo(6, 2)
		expect(r.breakMinutes).toBe(180)
	})

	it('leaves the ordinary single-block day exactly where it was', () => {
		// The regression guard: 09:00–18:00 with no gap must still lose its scheduled hour.
		const r = derive([p('IN', T('09:00')), p('OUT', T('18:00'))])
		expect(r.workedHours).toBeCloseTo(8, 2)
		expect(r.breakMinutes).toBe(60)
	})

	it('leaves a punched break exactly where it was', () => {
		const r = derive([
			p('IN', T('09:00')),
			p('BREAK_START', T('12:00')),
			p('BREAK_END', T('13:00')),
			p('OUT', T('18:00'))
		])
		expect(r.workedHours).toBeCloseTo(8, 2)
		expect(r.breakMinutes).toBe(60)
	})
})

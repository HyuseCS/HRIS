/**
 * Pure attendance-day derivation (ATT-2) — no DB, no side effects.
 * Turns a single PHT day's TimeLog punches (+ the employee's schedule, day type, injected
 * approved-OT and on-leave flags) into the hour buckets the payroll engine consumes, plus
 * late/undertime, night differential, and a status. Overtime is GATED on approval: the engine
 * reports `rawOvertimeHours` (worked beyond the threshold) but only pays `min(raw, approvedOtHours)`.
 *
 * An AttendanceDay always represents the **punch-in date**. Hours worked past midnight are
 * aggregated to that day, never split at the calendar boundary: a Monday 08:00 → Tuesday 00:00
 * shift is 16 worked hours on Monday. Night differential intersects `netIntervals` with the
 * configured window regardless of which calendar day the minutes fall on, so the 22:00–24:00
 * slice of that shift is Monday's too. Splitting at midnight would break the one-row-per-date
 * uniqueness invariant and the payslip's "Days of Work" count.
 */

const DAY_MS = 86_400_000
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

// Labor Code Art. 85 entitles an employee to the unpaid meal period only once they work
// more than 5 hours, so a short day is never docked for a break they never took.
const MEAL_BREAK_OWED_AFTER_MS = 5 * 60 * 60 * 1000

// #162 — DEFAULT smallest gap between two work blocks that counts as the AM/PM boundary.
// Overridable per organization via `Organization.amPmMinGapMinutes`; this value applies when
// that column is NULL. 30 minutes is the shortest real between-shift break at the food-service
// tenants. Below the threshold two adjacent segments are treated as one block interrupted by a
// quick re-punch (a phone double-tap, a corrected mis-punch), not a morning and an evening shift.
// Exported so the settings page can show the operator the number that applies when the field is
// blank, rather than hardcoding 30 a second time.
export const DEFAULT_AM_PM_MIN_GAP_MINUTES = 30
const DEFAULT_AM_PM_MIN_GAP_MS = DEFAULT_AM_PM_MIN_GAP_MINUTES * 60_000

// Bounds for a per-organization AM/PM threshold (#162/Amendment 1). Below the floor the
// threshold stops separating a real break from an input error — a re-punch two seconds after a
// mis-punch would become the day's "longest gap" and manufacture a fake morning. Above the
// ceiling the gap is not a between-shift break at all but a forgotten clock-out, which
// `groupPunchesByDay` and timelog.ts's MAX_SHIFT_HOURS already handle. Note the ceiling does NOT
// eliminate the "silently off" mode: a tenant whose genuine split-shift break is three hours can
// still set 240 and get no split, no error and no UI signal. That is an accepted residual.
export const AM_PM_MIN_GAP_FLOOR = 5
export const AM_PM_MIN_GAP_CEILING = 240

export function isValidAmPmMinGap(minutes: number): boolean {
	return (
		Number.isInteger(minutes) && minutes >= AM_PM_MIN_GAP_FLOOR && minutes <= AM_PM_MIN_GAP_CEILING
	)
}

export type AttPunchType = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'
export type AttendanceStatus =
	'PRESENT' | 'LATE' | 'ABSENT' | 'INCOMPLETE' | 'ON_LEAVE' | 'HOLIDAY' | 'REST_DAY'
export type DayType = 'REGULAR' | 'REST_DAY' | 'REGULAR_HOLIDAY' | 'SPECIAL_HOLIDAY'

export interface PunchLite {
	punchType: AttPunchType
	timestamp: Date
}

export interface ScheduleDay {
	startMinutes: number
	endMinutes: number
	breakMinutes: number
}

export interface DeriveConfig {
	/** Night-differential window in PHT minutes-from-midnight (default 22:00–06:00). */
	nightStartMin: number
	nightEndMin: number
}

export const DEFAULT_NIGHT_WINDOW: DeriveConfig = { nightStartMin: 22 * 60, nightEndMin: 6 * 60 }

export interface DeriveInput {
	punches: PunchLite[]
	/** Scheduled shift for the weekday, or null for an unscheduled/rest day. */
	schedule: ScheduleDay | null
	dayType: DayType
	/** Approved OT hours for the day (from an approved OT request); 0 until Requests lands. */
	approvedOtHours?: number
	/** True when an approved leave covers this day. */
	onLeave?: boolean
	/**
	 * Whether to mark this day LATE against the schedule start (#190). Defaults to true; the
	 * caller passes `Organization.trackTardiness && WorkSchedule.trackTardiness`. When false,
	 * lateMinutes stays 0 and the day resolves to PRESENT. Undertime is unaffected.
	 */
	enforceTardiness?: boolean
	/**
	 * Whether to compute the AM/PM display split (#162). Defaults to false; the caller passes
	 * `isFoodServiceOrg(organizationId)`. When false, all four am*\/pm* results stay null and this
	 * function behaves exactly as it did before #162. The split is DISPLAY ONLY — it never
	 * changes workedHours, the hour buckets, lateMinutes, or undertimeMinutes.
	 */
	splitAmPm?: boolean
	/**
	 * Per-organization AM/PM boundary threshold in milliseconds (#162). Undefined → the built-in
	 * DEFAULT_AM_PM_MIN_GAP_MS. The caller passes `Organization.amPmMinGapMinutes * 60_000`.
	 * A non-finite or non-positive value is treated as undefined: a bad number must fall back to
	 * a known-good default, never silently move every boundary in the tenant.
	 */
	amPmMinGapMs?: number
	config?: DeriveConfig
}

export interface AttendanceDayResult {
	status: AttendanceStatus
	timeIn: Date | null
	timeOut: Date | null
	amTimeIn: Date | null
	amTimeOut: Date | null
	pmTimeIn: Date | null
	pmTimeOut: Date | null
	workedHours: number
	regularHours: number
	overtimeHours: number
	rawOvertimeHours: number
	nightDiffHours: number
	restDayHours: number
	restDayOtHours: number
	regularHolidayHours: number
	regularHolidayOtHours: number
	specialHolidayHours: number
	specialHolidayOtHours: number
	lateMinutes: number
	undertimeMinutes: number
	breakMinutes: number
}

function round2(n: number): number {
	return Math.round((n + Number.EPSILON) * 100) / 100
}

function phtMinuteOfDay(d: Date): number {
	return Math.floor(((d.getTime() + MANILA_OFFSET_MS) % DAY_MS) / 60_000)
}

/** Remove `cuts` (break intervals) from `base` (work intervals). All values in ms. */
function subtractIntervals(
	base: Array<[number, number]>,
	cuts: Array<[number, number]>
): Array<[number, number]> {
	let result = base
	for (const [cs, ce] of cuts) {
		const next: Array<[number, number]> = []
		for (const [s, e] of result) {
			if (ce <= s || cs >= e) {
				next.push([s, e])
				continue
			}
			if (cs > s) next.push([s, cs])
			if (ce < e) next.push([ce, e])
		}
		result = next
	}
	return result
}

/** Milliseconds of [a,b) that fall inside the recurring daily `ranges` (ms-of-day). */
function dailyOverlapMs(a: number, b: number, ranges: Array<[number, number]>): number {
	if (b <= a) return 0
	let total = 0
	const firstDay = Math.floor(a / DAY_MS)
	const lastDay = Math.floor((b - 1) / DAY_MS)
	for (let day = firstDay; day <= lastDay; day++) {
		for (const [rs, re] of ranges) {
			const s = day * DAY_MS + rs
			const e = day * DAY_MS + re
			total += Math.max(0, Math.min(b, e) - Math.max(a, s))
		}
	}
	return total
}

function emptyResult(status: AttendanceStatus, timeIn: Date | null = null): AttendanceDayResult {
	return {
		status,
		timeIn,
		timeOut: null,
		// Load-bearing: an ABSENT / ON_LEAVE / REST_DAY row must CLEAR a stale AM/PM split
		// rather than leave the previous derive's values behind (#162).
		amTimeIn: null,
		amTimeOut: null,
		pmTimeIn: null,
		pmTimeOut: null,
		workedHours: 0,
		regularHours: 0,
		overtimeHours: 0,
		rawOvertimeHours: 0,
		nightDiffHours: 0,
		restDayHours: 0,
		restDayOtHours: 0,
		regularHolidayHours: 0,
		regularHolidayOtHours: 0,
		specialHolidayHours: 0,
		specialHolidayOtHours: 0,
		lateMinutes: 0,
		undertimeMinutes: 0,
		breakMinutes: 0
	}
}

/**
 * Split already-paired work segments into an AM block and a PM block at the LONGEST mid-day
 * gap (#162). `segs` must be ascending, which is what the pairing loop produces from sorted
 * punches. `openWork` is a dangling IN with no OUT yet — a half-finished PM block. `minGapMs` is
 * the smallest gap that counts as a boundary; the caller resolves it from the org's setting or
 * the built-in default.
 *
 * The gap before a dangling IN competes on equal terms with the closed gaps — it is one more
 * candidate, not a fallback. Treating it as an else-branch meant a day with a narrow closed gap
 * and a wide open one split on the narrow boundary and dropped the still-running block entirely.
 *
 * Ties go to the EARLIEST qualifying gap, so the result is deterministic for a day whose two
 * gaps are exactly equal. Returns all-null when there is no qualifying gap; a single-block day
 * is deliberately NOT reported as "AM only", because a lone evening shift is not a morning.
 *
 * Because the boundary always lands on the longest gap, the threshold can only turn a split ON
 * or OFF — it can never move an existing boundary. The one exception is the dangling-IN case,
 * where lowering the threshold can flip an open PM block into a closed one.
 */
function splitAmPmBlocks(
	segs: Array<[number, number]>,
	openWork: number | null,
	minGapMs: number
): { amIn: Date | null; amOut: Date | null; pmIn: Date | null; pmOut: Date | null } {
	const none = { amIn: null, amOut: null, pmIn: null, pmOut: null }
	if (segs.length === 0) return none

	let k = -1
	let widest = -1
	for (let i = 0; i < segs.length - 1; i++) {
		const gap = segs[i + 1][0] - segs[i][1]
		// Strict `>` so the EARLIEST of two equal gaps wins.
		if (gap > widest) {
			widest = gap
			k = i
		}
	}

	const lastOut = segs[segs.length - 1][1]
	const openGap = openWork === null ? -1 : openWork - lastOut

	// The open gap is the LAST gap of the day by construction, so on an exact tie with a closed
	// gap the strict `>` leaves `widest` in place and the closed (earlier) boundary wins — the
	// same earliest-wins rule the scan above uses. It must clear the threshold on its own too:
	// when no closed gap qualifies either, the widest gap of the day being an open one is not
	// enough to manufacture a PM block out of a short re-punch.
	if (openWork !== null && openGap > widest && openGap >= minGapMs)
		// AM complete, PM still running.
		return {
			amIn: new Date(segs[0][0]),
			amOut: new Date(lastOut),
			pmIn: new Date(openWork),
			pmOut: null
		}

	if (k !== -1 && widest >= minGapMs)
		return {
			amIn: new Date(segs[0][0]),
			amOut: new Date(segs[k][1]),
			pmIn: new Date(segs[k + 1][0]),
			pmOut: new Date(segs[segs.length - 1][1])
		}

	return none
}

export function deriveAttendanceDay(input: DeriveInput): AttendanceDayResult {
	const { schedule, dayType } = input
	const approvedOt = input.approvedOtHours ?? 0
	const enforceTardiness = input.enforceTardiness ?? true
	const cfg = input.config ?? DEFAULT_NIGHT_WINDOW

	if (input.onLeave) return emptyResult('ON_LEAVE')

	// Pair IN/OUT (work) and BREAK_START/BREAK_END (breaks).
	const sorted = [...input.punches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
	const workSegs: Array<[number, number]> = []
	const breakSegs: Array<[number, number]> = []
	let openWork: number | null = null
	let openBreak: number | null = null
	let firstIn: Date | null = null
	let lastOut: Date | null = null

	for (const p of sorted) {
		const t = p.timestamp.getTime()
		if (p.punchType === 'IN') {
			openWork = t
			if (!firstIn) firstIn = p.timestamp
		} else if (p.punchType === 'OUT') {
			if (openWork !== null) {
				workSegs.push([openWork, t])
				openWork = null
				lastOut = p.timestamp
			}
		} else if (p.punchType === 'BREAK_START') {
			openBreak = t
		} else if (p.punchType === 'BREAK_END') {
			if (openBreak !== null) {
				breakSegs.push([openBreak, t])
				openBreak = null
			}
		}
	}
	const incomplete = openWork !== null

	if (workSegs.length === 0) {
		if (firstIn || incomplete) return emptyResult('INCOMPLETE', firstIn)
		if (dayType === 'REST_DAY') return emptyResult('REST_DAY')
		if (dayType === 'REGULAR_HOLIDAY' || dayType === 'SPECIAL_HOLIDAY')
			return emptyResult('HOLIDAY')
		return emptyResult('ABSENT')
	}

	const netIntervals = subtractIntervals(workSegs, breakSegs)
	const grossWorkedMs = workSegs.reduce((s, [a, b]) => s + (b - a), 0)
	const punchedNetMs = netIntervals.reduce((s, [a, b]) => s + (b - a), 0)

	// Measure what `subtractIntervals` actually removed rather than summing the raw break
	// segments: only the part of a break overlapping a work segment ever comes off the
	// clock. Old rows can carry a break punched outside the IN/OUT window, and counting
	// that in full would make it look like a long meal and suppress the deduction below.
	const punchedBreakMs = grossWorkedMs - punchedNetMs

	// Time between two work segments — clocked OUT and not yet back IN. On a split shift this is
	// the break, and it never entered `punchedNetMs` because it falls outside every work segment.
	// `punchedBreakMs` cannot see it: that only measures BREAK_* punches landing INSIDE a segment.
	//
	// Without this the scheduled meal break was deducted on top of a break already taken, and a
	// JoJo Potato split shift paid an hour short (7.00 h for 08:00–11:00 + 13:00–17:00, where the
	// employee was off the clock for two hours already). It fired on any two-segment day and
	// predates #162; #162 only made split shifts common enough to notice.
	const offClockBetweenSegsMs = workSegs.reduce(
		(s, seg, i) => (i === 0 ? 0 : s + (seg[0] - workSegs[i - 1][1])),
		0
	)
	const breakAlreadyTakenMs = punchedBreakMs + offClockBetweenSegsMs

	// The scheduled meal break is unpaid whether or not it gets punched, and in practice
	// employees only punch IN and OUT. Deducting it here is what keeps an 8–5 day at 8h
	// instead of 9h with a phantom hour of overtime. `max` rather than a sum: a break the
	// employee has already taken — punched, or spent clocked out between segments — *is* the
	// meal break, so only the shortfall comes off. A longer real break is never topped up.
	const scheduledBreakMs =
		dayType === 'REGULAR' && schedule && punchedNetMs > MEAL_BREAK_OWED_AFTER_MS
			? schedule.breakMinutes * 60_000
			: 0
	const unpaidBreakMs = Math.max(breakAlreadyTakenMs, scheduledBreakMs)
	const netWorkedMs = Math.max(0, punchedNetMs - (unpaidBreakMs - breakAlreadyTakenMs))
	const workedHours = round2(netWorkedMs / 3_600_000)

	// Night-differential window (may wrap midnight).
	const nightRanges: Array<[number, number]> =
		cfg.nightStartMin > cfg.nightEndMin
			? [
					[0, cfg.nightEndMin * 60_000],
					[cfg.nightStartMin * 60_000, DAY_MS]
				]
			: [[cfg.nightStartMin * 60_000, cfg.nightEndMin * 60_000]]
	const nightMs = netIntervals.reduce(
		(s, [a, b]) => s + dailyOverlapMs(a + MANILA_OFFSET_MS, b + MANILA_OFFSET_MS, nightRanges),
		0
	)
	// A schedule stores only a break *duration*, never when it falls, so an unpunched break
	// can't be cut out of the night intervals the way a punched one is. Clamping keeps the
	// invariant that night-differential hours are a subset of hours worked — exact whenever
	// the shift sits wholly inside the window, which is the case that would otherwise pay
	// night differential on an hour the employee spent at lunch.
	const nightDiffHours = round2(Math.min(nightMs / 3_600_000, workedHours))

	// Late / undertime only apply to a scheduled regular day. Late is additionally gated on
	// enforceTardiness (#190) — when off, the day never resolves to LATE. Undertime is separate.
	let lateMinutes = 0
	let undertimeMinutes = 0
	if (dayType === 'REGULAR' && schedule && firstIn && lastOut) {
		if (enforceTardiness) lateMinutes = Math.max(0, phtMinuteOfDay(firstIn) - schedule.startMinutes)
		undertimeMinutes = Math.max(0, schedule.endMinutes - phtMinuteOfDay(lastOut))
	}

	// Threshold beyond which hours are overtime.
	const threshold =
		dayType === 'REGULAR' && schedule
			? (schedule.endMinutes - schedule.startMinutes - schedule.breakMinutes) / 60
			: 8
	const baseHours = round2(Math.min(workedHours, threshold))
	const rawOvertimeHours = round2(Math.max(0, workedHours - threshold))
	const paidOt = round2(Math.min(rawOvertimeHours, approvedOt))

	const result = emptyResult(
		incomplete ? 'INCOMPLETE' : lateMinutes > 0 ? 'LATE' : 'PRESENT',
		firstIn
	)
	result.timeOut = lastOut

	if (input.splitAmPm) {
		// Defence in depth. Validation at the writer is the real gate, but a NaN or a negative
		// arriving here would silently re-split every day in the tenant, and the resulting numbers
		// look plausible. Fall back rather than propagate.
		const minGapMs =
			typeof input.amPmMinGapMs === 'number' &&
			Number.isFinite(input.amPmMinGapMs) &&
			input.amPmMinGapMs > 0
				? input.amPmMinGapMs
				: DEFAULT_AM_PM_MIN_GAP_MS
		const { amIn, amOut, pmIn, pmOut } = splitAmPmBlocks(workSegs, openWork, minGapMs)
		result.amTimeIn = amIn
		result.amTimeOut = amOut
		result.pmTimeIn = pmIn
		result.pmTimeOut = pmOut
	}

	result.workedHours = workedHours
	result.breakMinutes = Math.round(unpaidBreakMs / 60_000)
	result.nightDiffHours = nightDiffHours
	result.lateMinutes = lateMinutes
	result.undertimeMinutes = undertimeMinutes
	result.rawOvertimeHours = rawOvertimeHours

	switch (dayType) {
		case 'REGULAR':
			result.regularHours = baseHours
			result.overtimeHours = paidOt
			break
		case 'REST_DAY':
			result.restDayHours = baseHours
			result.restDayOtHours = paidOt
			break
		case 'REGULAR_HOLIDAY':
			result.regularHolidayHours = baseHours
			result.regularHolidayOtHours = paidOt
			break
		case 'SPECIAL_HOLIDAY':
			result.specialHolidayHours = baseHours
			result.specialHolidayOtHours = paidOt
			break
	}

	return result
}

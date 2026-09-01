import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import { manilaDayKey } from '$lib/utils/dates'
import { deriveAttendanceDay, type AttPunchType, type DayType, type ScheduleDay } from './derive'
import { createTimesheet } from '../timesheets'
import { requireAnyCapability } from '$lib/server/rbac'
import { isFoodServiceOrg } from '$lib/orgs'
import type { AuditContext } from '../types'
import type { HolidayType } from '@prisma/client'

/**
 * Attendance service (Slice 2): derive AttendanceDay records from TimeLog punches against each
 * employee's schedule + the holiday calendar + approved leaves, list them, and lock a range so
 * payroll can import them. Derivation itself is the pure `deriveAttendanceDay`.
 */

/**
 * Last-resort shift for an org that has configured NO default schedule at all — Mon–Fri
 * 08:00–17:00 with a 1-hour unpaid break, matching the schedule onboarding seeds.
 *
 * This used to be 09:00–18:00, a shift that existed in no configuration row anywhere: the org's
 * `isDefault` schedule was written, badged in settings and preselected on the create form, but
 * never actually read here. Employees with no explicit assignment were therefore derived against
 * a phantom shift — an 8–5 worker was charged 60 minutes of undertime every day, which feeds the
 * TARDINESS deduction and reaches payroll. Prefer `resolveDefaultSchedule` over this constant;
 * it only applies when the organization genuinely has nothing configured.
 */
export const FALLBACK_WEEKDAY_SHIFT: ScheduleDay = {
	startMinutes: 480,
	endMinutes: 1020,
	breakMinutes: 60
} // 08:00–17:00

/** The org's designated default schedule (days + tardiness flag), or null when none is configured. */
async function resolveDefaultSchedule(organizationId: string) {
	return db.workSchedule.findFirst({
		where: { organizationId, isDefault: true },
		include: { days: true }
	})
}

/**
 * The shift for a weekday. An employee's assigned schedule wins (a weekday absent from it is a
 * rest day); otherwise the org's default schedule; otherwise the Mon–Fri last resort.
 */
export function scheduleDayFor(
	scheduleDays:
		{ weekday: number; startMinutes: number; endMinutes: number; breakMinutes: number }[] | null,
	weekday: number
): ScheduleDay | null {
	if (scheduleDays) {
		const d = scheduleDays.find((x) => x.weekday === weekday)
		return d
			? { startMinutes: d.startMinutes, endMinutes: d.endMinutes, breakMinutes: d.breakMinutes }
			: null
	}
	return weekday >= 1 && weekday <= 5 ? FALLBACK_WEEKDAY_SHIFT : null
}

/** Resolve a day's attendance day-type from its holiday type (if any) and whether it's a scheduled
 *  workday. Only REGULAR (+100%) and SPECIAL_NON_WORKING (+30%) carry a premium; SPECIAL_WORKING
 *  (#199) is an ordinary paid day, so it resolves like a non-holiday. */
export function holidayDayType(holiday: HolidayType | undefined, scheduled: boolean): DayType {
	if (holiday === 'REGULAR') return 'REGULAR_HOLIDAY'
	if (holiday === 'SPECIAL_NON_WORKING') return 'SPECIAL_HOLIDAY'
	return scheduled ? 'REGULAR' : 'REST_DAY'
}

/** Group punches into shifts, attributing an overnight OUT/breaks to the IN's PHT day. */
function groupPunchesByDay(
	punches: { punchType: AttPunchType; timestamp: Date }[]
): Map<string, { punchType: AttPunchType; timestamp: Date }[]> {
	const byDay = new Map<string, { punchType: AttPunchType; timestamp: Date }[]>()
	const sorted = [...punches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
	let currentDay: string | null = null
	for (const p of sorted) {
		if (p.punchType === 'IN') currentDay = manilaDayKey(p.timestamp)
		const day = currentDay ?? manilaDayKey(p.timestamp)
		if (!byDay.has(day)) byDay.set(day, [])
		byDay.get(day)!.push(p)
		if (p.punchType === 'OUT') currentDay = null
	}
	return byDay
}

export function countAttendanceDays(employeeId: string, from: Date, to: Date) {
	return db.attendanceDay.count({
		where: { employeeId, date: { gte: from, lte: to } }
	})
}

export function listAttendanceDays(
	employeeId: string,
	from: Date,
	to: Date,
	order: 'asc' | 'desc' = 'asc',
	pageArgs?: { skip: number; take: number }
) {
	return db.attendanceDay.findMany({
		where: { employeeId, date: { gte: from, lte: to } },
		orderBy: { date: order },
		...(pageArgs && { skip: pageArgs.skip, take: pageArgs.take })
	})
}

/**
 * Team view for a single PHT day: every active employee with their AttendanceDay for that
 * day (or null if none derived yet). AttendanceDays are stored keyed at midnight UTC of the
 * PHT day (see deriveRange), so `dateKey` ('YYYY-MM-DD') is matched exactly.
 */
export async function listTeamDay(organizationId: string, dateKey: string) {
	const date = new Date(dateKey)
	const employees = await db.employee.findMany({
		where: { organizationId, employmentStatus: 'ACTIVE' },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			employeeNumber: true,
			department: { select: { name: true } },
			attendanceDays: { where: { date }, take: 1 }
		},
		orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
	})

	return employees.map((e) => ({
		id: e.id,
		name: `${e.lastName}, ${e.firstName}`,
		employeeNumber: e.employeeNumber,
		departmentName: e.department?.name ?? null,
		day: e.attendanceDays[0] ?? null
	}))
}

/**
 * Derive AttendanceDay records for [from, to] (PHT days). Idempotent — skips locked days.
 */
export async function deriveRange(
	organizationId: string,
	range: { from: Date; to: Date; employeeId?: string },
	ctx: AuditContext,
	opts: { skipUnpunched?: boolean } = {}
) {
	const fromKey = manilaDayKey(range.from)
	const toKey = manilaDayKey(range.to)

	const employees = await db.employee.findMany({
		where: {
			organizationId,
			employmentStatus: 'ACTIVE',
			...(range.employeeId ? { id: range.employeeId } : {})
		},
		include: { workSchedule: { include: { days: true } } }
	})

	const holidays = await db.publicHoliday.findMany({
		where: {
			organizationId,
			date: { gte: new Date(`${fromKey}T00:00:00Z`), lte: new Date(`${toKey}T23:59:59Z`) }
		},
		select: { date: true, type: true }
	})
	const holidayByDay = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.type]))

	// Fetched once per run: employees without an explicit assignment derive against the org's
	// designated default rather than a hardcoded shift.
	const defaultSchedule = await resolveDefaultSchedule(organizationId)
	const defaultScheduleDays = defaultSchedule?.days ?? null

	// Org master tardiness switch (#190). ANDs with the employee's effective schedule flag below.
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { trackTardiness: true, amPmMinGapMinutes: true }
	})
	const orgTracksTardiness = org?.trackTardiness ?? true

	// #162 — AM/PM display split is food-service only (isFoodServiceOrg). Hoisted once per run.
	const splitAmPm = isFoodServiceOrg(organizationId)
	// #162: NULL → derive.ts's built-in default. Never a new query — this rides the org row the
	// tardiness switch already fetches. `!= null` (loose) catches null and undefined while letting
	// a legitimate 0 through to the pure function's own guard, which then rejects it.
	const amPmMinGapMs = org?.amPmMinGapMinutes != null ? org.amPmMinGapMinutes * 60_000 : undefined

	// PHT day range expressed as an absolute UTC window (PHT day D = [D 00:00+08:00, D+1 00:00+08:00)).
	const phtStart = new Date(`${fromKey}T00:00:00+08:00`)
	const phtEndExclusive = new Date(`${toKey}T00:00:00+08:00`)
	phtEndExclusive.setUTCDate(phtEndExclusive.getUTCDate() + 1)

	let derived = 0
	const flagged: { employeeId: string; date: string; status: string }[] = []

	for (const emp of employees) {
		const scheduleDays = emp.workSchedule ? emp.workSchedule.days : defaultScheduleDays
		// Effective tardiness = org master AND the employee's effective-schedule flag (#190).
		const scheduleTracksTardiness = emp.workSchedule
			? emp.workSchedule.trackTardiness
			: (defaultSchedule?.trackTardiness ?? true)
		const enforceTardiness = orgTracksTardiness && scheduleTracksTardiness

		const punches = await db.timeLog.findMany({
			where: { employeeId: emp.id, timestamp: { gte: phtStart, lt: phtEndExclusive } },
			select: { punchType: true, timestamp: true }
		})
		const byDay = groupPunchesByDay(punches)

		const leaveReqs = await db.request.findMany({
			where: {
				employeeId: emp.id,
				type: 'LEAVE',
				status: 'APPROVED',
				dateFrom: { lte: new Date(`${toKey}T23:59:59Z`) },
				dateTo: { gte: new Date(`${fromKey}T00:00:00Z`) }
			},
			select: { dateFrom: true, dateTo: true }
		})
		const leaves = leaveReqs.map((l) => ({ startDate: l.dateFrom!, endDate: l.dateTo! }))

		// Approved OVERTIME requests (T169) gate how much worked overtime actually
		// pays: deriveAttendanceDay pays min(rawOvertime, approvedOtHours) per day.
		const otReqs = await db.request.findMany({
			where: {
				employeeId: emp.id,
				type: 'OVERTIME',
				status: 'APPROVED',
				dateFrom: { gte: new Date(`${fromKey}T00:00:00Z`), lte: new Date(`${toKey}T23:59:59Z`) }
			},
			select: { dateFrom: true, hours: true }
		})
		const approvedOtByDay = new Map<string, number>()
		for (const o of otReqs) {
			if (!o.dateFrom) continue
			const k = o.dateFrom.toISOString().slice(0, 10)
			approvedOtByDay.set(k, (approvedOtByDay.get(k) ?? 0) + Number(o.hours ?? 0))
		}

		for (
			let cur = new Date(`${fromKey}T00:00:00Z`);
			cur.toISOString().slice(0, 10) <= toKey;
			cur.setUTCDate(cur.getUTCDate() + 1)
		) {
			const dayKey = cur.toISOString().slice(0, 10)
			const weekday = cur.getUTCDay()
			const holiday = holidayByDay.get(dayKey)
			const schedDay = scheduleDayFor(scheduleDays as never, weekday)
			const dayType: DayType = holidayDayType(holiday, Boolean(schedDay))
			const onLeave = leaves.some(
				(l) =>
					l.startDate.toISOString().slice(0, 10) <= dayKey &&
					l.endDate.toISOString().slice(0, 10) >= dayKey
			)

			const existing = await db.attendanceDay.findUnique({
				where: { employeeId_date: { employeeId: emp.id, date: cur } },
				select: { isLocked: true, manuallyEdited: true }
			})
			if (existing?.isLocked) continue
			// Never overwrite a manual HR override, even on a full Refresh re-derive.
			if (existing?.manuallyEdited) continue
			// On the page-load derive, refresh a machine-written day only when it has punches to
			// re-pair — so a freshly-punched "today" self-heals from a stale ABSENT row — but leave
			// punch-less days (weekends, genuine absences) alone so we don't churn them every load.
			// Locked/edited days already returned above, so this never clobbers a human edit.
			if (opts.skipUnpunched && existing && !byDay.has(dayKey)) continue

			const r = deriveAttendanceDay({
				punches: byDay.get(dayKey) ?? [],
				schedule: dayType === 'REGULAR' ? schedDay : null,
				dayType,
				approvedOtHours: approvedOtByDay.get(dayKey) ?? 0,
				onLeave,
				enforceTardiness,
				splitAmPm,
				amPmMinGapMs
			})

			const data = {
				status: r.status,
				dayType,
				timeIn: r.timeIn,
				timeOut: r.timeOut,
				amTimeIn: r.amTimeIn,
				amTimeOut: r.amTimeOut,
				pmTimeIn: r.pmTimeIn,
				pmTimeOut: r.pmTimeOut,
				workedHours: r.workedHours,
				regularHours: r.regularHours,
				overtimeHours: r.overtimeHours,
				rawOvertimeHours: r.rawOvertimeHours,
				nightDiffHours: r.nightDiffHours,
				restDayHours: r.restDayHours,
				restDayOtHours: r.restDayOtHours,
				regularHolidayHours: r.regularHolidayHours,
				regularHolidayOtHours: r.regularHolidayOtHours,
				specialHolidayHours: r.specialHolidayHours,
				specialHolidayOtHours: r.specialHolidayOtHours,
				lateMinutes: r.lateMinutes,
				undertimeMinutes: r.undertimeMinutes,
				breakMinutes: r.breakMinutes
			}
			await db.attendanceDay.upsert({
				where: { employeeId_date: { employeeId: emp.id, date: cur } },
				create: { employeeId: emp.id, date: new Date(dayKey), ...data },
				update: data
			})
			derived++
			if (r.status === 'ABSENT' || r.status === 'INCOMPLETE')
				flagged.push({ employeeId: emp.id, date: dayKey, status: r.status })
		}
	}

	await writeAuditLog(ctx, {
		action: 'CREATE',
		entityType: 'AttendanceDay',
		entityId: range.employeeId ?? organizationId,
		newValue: { from: fromKey, to: toKey, derived, flagged: flagged.length }
	})
	return { derived, flagged }
}

/**
 * Non-destructive auto-derive for page loads: if any punches exist in the window, derive the
 * missing days plus any existing machine-written day that has punches (so a freshly-punched
 * "today" self-heals from a stale ABSENT row instead of freezing). Punch-less existing days are
 * left alone so loads stay cheap, and corrected/locked days are never touched — a full re-derive
 * of everything is the Refresh button.
 */
export async function autoDeriveFromPunches(
	organizationId: string,
	range: { from: Date; to: Date; employeeId?: string },
	ctx: AuditContext
) {
	const fromKey = manilaDayKey(range.from)
	const toKey = manilaDayKey(range.to)
	const phtStart = new Date(`${fromKey}T00:00:00+08:00`)
	const phtEndExclusive = new Date(`${toKey}T00:00:00+08:00`)
	phtEndExclusive.setUTCDate(phtEndExclusive.getUTCDate() + 1)

	const punchCount = await db.timeLog.count({
		where: {
			employee: { organizationId },
			timestamp: { gte: phtStart, lt: phtEndExclusive },
			...(range.employeeId ? { employeeId: range.employeeId } : {})
		}
	})
	if (punchCount === 0) return { derived: 0, flagged: 0 }

	const res = await deriveRange(organizationId, range, ctx, { skipUnpunched: true })
	return { derived: res.derived, flagged: res.flagged.length }
}

/**
 * Read the materialised AttendanceDay rows over [from, to] (PHT) and map each to a timesheet
 * entry: hoursWorked = regular + overtime, otHours = overtime, notes = the day note or status.
 * Pure read — call autoDeriveFromPunches first if you need punches reflected. Returns [] when the
 * range has no attendance, so callers decide whether an empty result is an error.
 */
export async function attendanceEntriesForRange(employeeId: string, from: Date, to: Date) {
	const fromKey = manilaDayKey(from)
	const toKey = manilaDayKey(to)
	const days = await db.attendanceDay.findMany({
		where: { employeeId, date: { gte: new Date(fromKey), lte: new Date(toKey) } },
		orderBy: { date: 'asc' }
	})
	return days.map((d) => {
		const ot = Number(d.overtimeHours)
		return {
			date: d.date,
			timeIn: d.timeIn,
			timeOut: d.timeOut,
			hoursWorked: Number(d.regularHours) + ot,
			otHours: ot,
			notes: d.note ?? d.status
		}
	})
}

/**
 * Materialise an employee's derived attendance over [from, to] into a persisted Timesheet
 * (the artifact /team and payroll consume). Per-employee only. Each day becomes one entry with
 * hoursWorked = regular + overtime; the day status (and OT) is kept in the entry note. Relies on
 * the Timesheet @@unique([employeeId, periodStart]) to reject duplicates (createTimesheet → 409).
 */
export async function createTimesheetFromAttendance(
	employeeId: string,
	organizationId: string,
	from: Date,
	to: Date,
	ctx: AuditContext
) {
	const emp = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true }
	})
	if (!emp) error(404, 'Employee not found')

	const entries = await attendanceEntriesForRange(employeeId, from, to)
	if (entries.length === 0) error(400, 'No attendance in this range to save as a timesheet.')

	return createTimesheet(
		employeeId,
		new Date(manilaDayKey(from)),
		new Date(manilaDayKey(to)),
		entries,
		ctx
	)
}

/** HR correction of a single AttendanceDay. Rejected if the day is locked. */
export async function correctDay(
	id: string,
	organizationId: string,
	data: {
		status?: import('./derive').AttendanceStatus
		timeIn?: Date | null
		timeOut?: Date | null
		regularHours?: number
		overtimeHours?: number
		nightDiffHours?: number
		lateMinutes?: number
		undertimeMinutes?: number
		note?: string
	},
	ctx: AuditContext
) {
	const day = await db.attendanceDay.findFirst({
		where: { id, employee: { organizationId } },
		include: { employee: { include: { workSchedule: { include: { days: true } } } } }
	})
	if (!day) error(404, 'Attendance day not found')
	if (day.isLocked) error(409, 'This attendance day is locked and cannot be edited')

	// When HR sets the times, the times are the source of truth: re-derive status, worked/
	// regular/OT hours, night differential, and late/undertime from them (against the employee's
	// schedule + the day's stored day type) rather than storing stale hand values. A status the
	// HR user explicitly changed in the dropdown still wins over the derived one, so ON_LEAVE /
	// HOLIDAY / ABSENT can be forced. Days edited without touching the times keep the old raw path.
	const editingTimes = 'timeIn' in data || 'timeOut' in data
	let write: Record<string, unknown> = { ...data }

	if (editingTimes) {
		const assigned = day.employee.workSchedule
		const defaultSchedule = assigned ? null : await resolveDefaultSchedule(organizationId)
		const scheduleDays = assigned ? assigned.days : (defaultSchedule?.days ?? null)
		const weekday = day.date.getUTCDay()
		const schedDay = scheduleDayFor(scheduleDays as never, weekday)

		// Effective tardiness = org master AND the employee's effective-schedule flag (#190), so an
		// HR-corrected day honors the same setting as the batch derive.
		const org = await db.organization.findUnique({
			where: { id: organizationId },
			select: { trackTardiness: true, amPmMinGapMinutes: true }
		})
		// #162: same threshold read as deriveRange, on the org row this already fetches. It cannot
		// currently change any output — see the comment above `write` below — and is wired for
		// symmetry so a future multi-pair correction form inherits the org's setting.
		const amPmMinGapMs = org?.amPmMinGapMinutes != null ? org.amPmMinGapMinutes * 60_000 : undefined
		const enforceTardiness =
			(org?.trackTardiness ?? true) &&
			(assigned ? assigned.trackTardiness : (defaultSchedule?.trackTardiness ?? true))

		// Mirror deriveRange's OT gating: worked overtime only pays up to the approved hours.
		const dayKey = day.date.toISOString().slice(0, 10)
		const otReqs = await db.request.findMany({
			where: {
				employeeId: day.employeeId,
				type: 'OVERTIME',
				status: 'APPROVED',
				dateFrom: {
					gte: new Date(`${dayKey}T00:00:00Z`),
					lte: new Date(`${dayKey}T23:59:59Z`)
				}
			},
			select: { hours: true }
		})
		const approvedOtHours = otReqs.reduce((s, o) => s + Number(o.hours ?? 0), 0)

		const punches = []
		if (data.timeIn) punches.push({ punchType: 'IN' as AttPunchType, timestamp: data.timeIn })
		if (data.timeOut) punches.push({ punchType: 'OUT' as AttPunchType, timestamp: data.timeOut })

		const r = deriveAttendanceDay({
			punches,
			schedule: day.dayType === 'REGULAR' ? schedDay : null,
			dayType: day.dayType as DayType,
			approvedOtHours,
			enforceTardiness,
			splitAmPm: isFoodServiceOrg(organizationId),
			amPmMinGapMs
		})

		// HR changing the dropdown to something other than the day's current status is an
		// explicit override; otherwise the derived status stands.
		const statusOverride = data.status && data.status !== day.status ? data.status : undefined

		// #162: the correction form expresses exactly ONE pair (the `punches` array above holds at
		// most one IN and one OUT), so the AM/PM split resolves to null here for every threshold
		// value and the columns are cleared. That is deliberate — a hand-correction is a
		// declaration that the day is one block. `resetDay` re-derives from punches and brings the
		// split back. Note the non-time branch below takes the opposite route: a correction that
		// touches only status/hours/note leaves the stored split ALONE, exactly as it already
		// leaves timeIn/timeOut alone, so the split keeps describing the punches it came from.
		// (A threshold change is a third route to a stale split — R11; the recovery is the same
		// Refresh/reset path.)
		write = {
			status: statusOverride ?? r.status,
			timeIn: r.timeIn,
			timeOut: r.timeOut,
			amTimeIn: r.amTimeIn,
			amTimeOut: r.amTimeOut,
			pmTimeIn: r.pmTimeIn,
			pmTimeOut: r.pmTimeOut,
			workedHours: r.workedHours,
			regularHours: r.regularHours,
			overtimeHours: r.overtimeHours,
			rawOvertimeHours: r.rawOvertimeHours,
			nightDiffHours: r.nightDiffHours,
			restDayHours: r.restDayHours,
			restDayOtHours: r.restDayOtHours,
			regularHolidayHours: r.regularHolidayHours,
			regularHolidayOtHours: r.regularHolidayOtHours,
			specialHolidayHours: r.specialHolidayHours,
			specialHolidayOtHours: r.specialHolidayOtHours,
			lateMinutes: r.lateMinutes,
			undertimeMinutes: r.undertimeMinutes,
			breakMinutes: r.breakMinutes,
			...(data.note !== undefined ? { note: data.note } : {})
		}
	}

	// Flag the day so a later re-derive (Refresh) won't overwrite this manual override.
	const updated = await db.attendanceDay.update({
		where: { id },
		data: { ...write, manuallyEdited: true }
	})
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'AttendanceDay',
		entityId: id,
		oldValue: {
			regularHours: Number(day.regularHours),
			overtimeHours: Number(day.overtimeHours),
			status: day.status
		},
		newValue: write as Record<string, unknown>
	})
	return updated
}

/**
 * Discard a manual override on a single day and re-derive it from punches. Clears the
 * manuallyEdited flag so the re-derive is allowed to overwrite the hand-entered values.
 */
export async function resetDayToDerived(id: string, organizationId: string, ctx: AuditContext) {
	const day = await db.attendanceDay.findFirst({
		where: { id, employee: { organizationId } },
		select: {
			employeeId: true,
			date: true,
			isLocked: true,
			employee: { select: { employmentStatus: true } }
		}
	})
	if (!day) error(404, 'Attendance day not found')
	if (day.isLocked) error(409, 'This attendance day is locked and cannot be edited')
	// deriveRange only processes ACTIVE employees; resetting a non-active employee would
	// clear the override without re-deriving, reporting a success that never happened.
	if (day.employee.employmentStatus !== 'ACTIVE')
		error(409, 'Cannot reset — employee is not active, so the day cannot be re-derived.')

	await db.attendanceDay.update({ where: { id }, data: { manuallyEdited: false } })
	await deriveRange(
		organizationId,
		{ from: day.date, to: day.date, employeeId: day.employeeId },
		ctx
	)

	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'AttendanceDay',
		entityId: id,
		newValue: { resetToDerived: true }
	})
	return { reset: true }
}

/** Lock AttendanceDays in a range so payroll can import them (read-only thereafter). */
export async function lockRange(
	organizationId: string,
	range: { from: Date; to: Date; employeeId?: string },
	ctx: AuditContext
) {
	const fromKey = manilaDayKey(range.from)
	const toKey = manilaDayKey(range.to)
	const res = await db.attendanceDay.updateMany({
		where: {
			date: { gte: new Date(fromKey), lte: new Date(toKey) },
			employee: { organizationId },
			...(range.employeeId ? { employeeId: range.employeeId } : {})
		},
		data: { isLocked: true }
	})
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'AttendanceDay',
		entityId: range.employeeId ?? organizationId,
		newValue: { locked: res.count, from: fromKey, to: toKey }
	})
	return { locked: res.count }
}

/** Reopen locked AttendanceDays in a range. Privileged (super admin) — reverses lockRange. */
export async function unlockRange(
	organizationId: string,
	range: { from: Date; to: Date; employeeId?: string },
	ctx: AuditContext
) {
	// Reopening locked days overrides a finalized record — Super-Admin-only (#224). Enforced here so
	// every caller is covered, not only the two form actions that happen to check today.
	requireAnyCapability(ctx.actorRoles, 'OVERRIDE_FINALIZED')

	const fromKey = manilaDayKey(range.from)
	const toKey = manilaDayKey(range.to)
	const res = await db.attendanceDay.updateMany({
		where: {
			date: { gte: new Date(fromKey), lte: new Date(toKey) },
			employee: { organizationId },
			...(range.employeeId ? { employeeId: range.employeeId } : {})
		},
		data: { isLocked: false }
	})
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'AttendanceDay',
		entityId: range.employeeId ?? organizationId,
		newValue: { unlocked: res.count, from: fromKey, to: toKey }
	})
	return { unlocked: res.count }
}

import { db } from '$lib/server/db'
import { manilaDayKey, REGULARIZATION_MONTHS, regularizationStatus } from '$lib/utils/dates'

// How far ahead HR is warned of an upcoming regularization (#168). "2–3 weeks before"
// → a 21-day look-ahead; still-probationary staff already past due are surfaced too.
export const REGULARIZATION_NOTICE_DAYS = 21

/**
 * Probationary employees due to regularize within the notice window — plus any already
 * past due but still marked probationary, which is HR's to fix. Ordered soonest first so
 * overdue rows lead. Kept a DB-side filter by translating the regularization ceiling
 * (asOf + notice window) back to a start-date bound, so Postgres does the filtering
 * instead of loading every probationary row.
 */
export async function listUpcomingRegularizations(organizationId: string, asOf: Date = new Date()) {
	const ceiling = new Date(asOf)
	ceiling.setUTCDate(ceiling.getUTCDate() + REGULARIZATION_NOTICE_DAYS)
	// regularization = startDate + 6mo ≤ ceiling  ⇔  startDate ≤ ceiling − 6mo.
	const startCeiling = new Date(ceiling)
	startCeiling.setUTCMonth(startCeiling.getUTCMonth() - REGULARIZATION_MONTHS)

	const employees = await db.employee.findMany({
		where: {
			organizationId,
			employmentType: 'PROBATIONARY',
			employmentStatus: 'ACTIVE',
			startDate: { lte: startCeiling }
		},
		select: {
			id: true,
			firstName: true,
			lastName: true,
			jobTitle: true,
			startDate: true,
			department: { select: { name: true } }
		}
	})

	return employees
		.map((e) => {
			const { date, daysUntil, overdue } = regularizationStatus(e.startDate, asOf)
			return {
				id: e.id,
				name: `${e.firstName} ${e.lastName}`,
				jobTitle: e.jobTitle,
				department: e.department.name,
				startDate: e.startDate,
				regularizationDate: date,
				daysUntil,
				overdue
			}
		})
		.sort((a, b) => a.daysUntil - b.daysUntil)
}

// Active employees whose birthday (month + day) is `today` in PHT (#167). Dates of birth
// are stored at UTC midnight, so their UTC month/day already read as the PHT calendar day.
// Filtered in the database with EXTRACT so we never load the whole roster for a greeting.
export async function listTodaysBirthdays(organizationId: string, today: Date = new Date()) {
	const [, mm, dd] = manilaDayKey(today).split('-').map(Number)
	const rows = await db.$queryRaw<{ firstName: string; lastName: string }[]>`
		SELECT e."firstName", e."lastName"
		FROM employees e
		WHERE e."organizationId" = ${organizationId}
			AND e."employmentStatus" = 'ACTIVE'
			AND e."dateOfBirth" IS NOT NULL
			AND EXTRACT(MONTH FROM e."dateOfBirth") = ${mm}
			AND EXTRACT(DAY FROM e."dateOfBirth") = ${dd}
		ORDER BY e."firstName", e."lastName"
	`
	return rows.map((r) => `${r.firstName} ${r.lastName}`)
}

const WEEKDAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Minutes from PHT midnight → "8:00 AM". */
function clockLabel(minutes: number): string {
	const h24 = Math.floor(minutes / 60)
	const mm = String(minutes % 60).padStart(2, '0')
	const h12 = h24 % 12 === 0 ? 12 : h24 % 12
	return `${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}`
}

/**
 * "Mon–Fri" rather than "Mon, Tue, Wed, Thu, Fri" — contiguous runs of three or more are
 * collapsed, which is how a schedule is actually spoken. Weekdays arrive 0 = Sunday.
 */
function weekdaysLabel(weekdays: number[]): string {
	const sorted = [...weekdays].sort((a, b) => a - b)
	const parts: string[] = []
	for (let i = 0; i < sorted.length;) {
		let j = i
		while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
		const run = j - i + 1
		if (run >= 3) parts.push(`${WEEKDAY_LABEL[sorted[i]]}–${WEEKDAY_LABEL[sorted[j]]}`)
		else for (let k = i; k <= j; k++) parts.push(WEEKDAY_LABEL[sorted[k]])
		i = j + 1
	}
	return parts.join(', ')
}

/**
 * The viewer's own standing for the dashboard status card (#167): employment type, start
 * date (for tenure), contract end date (for a contractual's renewal), leave left, the
 * items waiting on them, and their work setup. Null when the user has no employee profile
 * (e.g. a bare admin account), which is what makes the card conditional.
 *
 * All of it is the viewer's own data, so nothing here is capability-gated.
 */
export async function getMyStatus(userId: string, organizationId: string, asOf: Date = new Date()) {
	const employee = await db.employee.findFirst({
		where: { userId, organizationId },
		select: {
			id: true,
			organizationId: true,
			employmentType: true,
			startDate: true,
			endDate: true,
			department: { select: { name: true } },
			reportsTo: { select: { firstName: true, lastName: true } },
			workSchedule: {
				select: {
					name: true,
					days: { select: { weekday: true, startMinutes: true, endMinutes: true } }
				}
			}
		}
	})
	if (!employee) return null

	// An employee with no schedule of their own works the org default — showing nothing
	// would read as "no schedule set" when in fact the org-wide one applies.
	const schedule =
		employee.workSchedule ??
		(await db.workSchedule.findFirst({
			where: { organizationId: employee.organizationId, isDefault: true },
			select: {
				name: true,
				days: { select: { weekday: true, startMinutes: true, endMinutes: true } }
			}
		}))

	const [balances, pendingRequests, openTimesheets] = await Promise.all([
		db.leaveBalance.findMany({
			where: { employeeId: employee.id, year: asOf.getFullYear() },
			select: {
				allocated: true,
				remaining: true,
				leaveType: { select: { name: true } }
			},
			orderBy: { leaveType: { name: 'asc' } }
		}),
		// Filed and still undecided — the viewer's own, not things awaiting their approval,
		// which the Pending Approvals tile already counts.
		db.request.count({ where: { employeeId: employee.id, status: 'PENDING' } }),
		// Not yet out of the viewer's hands: never submitted, or sent back to them.
		db.timesheet.count({
			where: { employeeId: employee.id, status: { in: ['DRAFT', 'REJECTED'] } }
		})
	])

	const days = schedule?.days ?? []
	// One start/end across every working day is the common case; a schedule that varies by
	// day cannot be summarised in a line, so it says so rather than picking one day's hours.
	const uniform =
		days.length > 0 &&
		days.every(
			(d) => d.startMinutes === days[0].startMinutes && d.endMinutes === days[0].endMinutes
		)

	return {
		employmentType: employee.employmentType,
		startDate: employee.startDate,
		endDate: employee.endDate,
		departmentName: employee.department?.name ?? null,
		managerName: employee.reportsTo
			? `${employee.reportsTo.firstName} ${employee.reportsTo.lastName}`
			: null,
		schedule: schedule
			? {
					name: schedule.name,
					daysLabel: days.length ? weekdaysLabel(days.map((d) => d.weekday)) : null,
					hoursLabel: uniform
						? `${clockLabel(days[0].startMinutes)} – ${clockLabel(days[0].endMinutes)}`
						: null
				}
			: null,
		leave: balances.map((b) => ({
			name: b.leaveType.name,
			remaining: Number(b.remaining),
			allocated: Number(b.allocated)
		})),
		pendingRequests,
		openTimesheets
	}
}

export async function getEmployeeMetrics(userId: string, organizationId: string) {
	const employee = await db.employee.findFirst({
		where: { userId, organizationId }
	})

	if (!employee) {
		return {
			pendingTimesheets: 0,
			leaveBalances: [],
			nextPayrollRun: null,
			recentTimesheets: []
		}
	}

	const currentYear = new Date().getFullYear()
	const now = new Date()

	const [pendingTimesheets, leaveBalances, nextPayrollRun, recentTimesheets] = await Promise.all([
		db.timesheet.count({
			where: {
				employeeId: employee.id,
				status: { in: ['DRAFT', 'SUBMITTED'] }
			}
		}),
		db.leaveBalance.findMany({
			where: {
				employeeId: employee.id,
				year: currentYear
			},
			include: {
				leaveType: { select: { name: true } }
			}
		}),
		db.payrollRun.findFirst({
			where: {
				organizationId,
				periodStart: { gte: now }
			},
			orderBy: { periodStart: 'asc' }
		}),
		db.timesheet.findMany({
			where: { employeeId: employee.id },
			orderBy: { createdAt: 'desc' },
			take: 3
		})
	])

	return {
		pendingTimesheets,
		leaveBalances,
		nextPayrollRun,
		recentTimesheets
	}
}

export async function getManagerMetrics(userId: string, organizationId: string) {
	const employee = await db.employee.findFirst({
		where: { userId, organizationId }
	})

	if (!employee) {
		return {
			pendingApprovals: { timesheets: 0, leave: 0 },
			teamHeadcount: 0,
			recentActivity: []
		}
	}

	// #259: `reportsToId` alone is not a tenant boundary — a row in another org naming this actor as
	// its manager would be counted here, leaking that org's pending-approval and headcount totals.
	// #235 closed the write side, but rows planted before it are still on disk, so the read scopes
	// itself. Same re-check every other consumer of this relation does (`canTouchEmployee`,
	// `listVisibleEmployeeIds`).
	const directReports = await db.employee.findMany({
		where: { reportsToId: employee.id, organizationId },
		select: { id: true }
	})
	const directReportIds = directReports.map((e) => e.id)

	const [pendingTimesheets, pendingLeave, teamHeadcount, recentActivity] = await Promise.all([
		db.timesheet.count({
			where: {
				employeeId: { in: directReportIds },
				status: 'SUBMITTED'
			}
		}),
		db.request.count({
			where: {
				employeeId: { in: directReportIds },
				type: 'LEAVE',
				status: 'PENDING'
			}
		}),
		db.employee.count({
			where: {
				reportsToId: employee.id,
				employmentStatus: 'ACTIVE',
				organizationId
			}
		}),
		// #242: an explicit column list, not `include` — a bare include ships every AuditLog
		// scalar, and `oldValue`/`newValue` hold the before/after salary of every compensation
		// change. Reaching that payload is an audited event (`/reports/audit-log` ?/reveal), and
		// the callers who reach this branch (PAYROLL_OFFICER, FINANCE) do not hold the capability
		// that gates it. `ipAddress`/`userAgent` are dropped for the same reason.
		db.auditLog.findMany({
			where: { organizationId },
			orderBy: { createdAt: 'desc' },
			take: 5,
			select: {
				id: true,
				action: true,
				entityType: true,
				entityId: true,
				createdAt: true,
				// #294: the actor's role set AS RECORDED AT THE TIME. Reaching through the `actor`
				// relation for `roles` reported today's roles on a historical entry, the same way
				// `/reports/audit-log` did before #282. `email` is genuinely the live relation.
				actorRoles: true,
				actor: { select: { email: true } }
			}
		})
	])

	return {
		pendingApprovals: { timesheets: pendingTimesheets, leave: pendingLeave },
		teamHeadcount,
		recentActivity
	}
}

export async function getAdminMetrics(organizationId: string) {
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const tomorrow = new Date(today)
	tomorrow.setDate(tomorrow.getDate() + 1)

	const [
		totalHeadcount,
		onLeaveToday,
		pendingTimesheets,
		pendingLeave,
		openJobPostings,
		lastPayrollRun
	] = await Promise.all([
		db.employee.count({
			where: {
				organizationId,
				employmentStatus: 'ACTIVE'
			}
		}),
		db.request.count({
			where: {
				employee: { organizationId },
				type: 'LEAVE',
				status: 'APPROVED',
				dateFrom: { lte: tomorrow },
				dateTo: { gte: today }
			}
		}),
		db.timesheet.count({
			where: {
				employee: { organizationId },
				status: 'SUBMITTED'
			}
		}),
		db.request.count({
			where: {
				employee: { organizationId },
				type: 'LEAVE',
				status: 'PENDING'
			}
		}),
		db.jobPosting.count({
			where: {
				organizationId,
				status: 'OPEN'
			}
		}),
		db.payrollRun.findFirst({
			where: { organizationId },
			orderBy: { periodStart: 'desc' },
			select: {
				periodStart: true,
				periodEnd: true,
				status: true,
				totalNet: true
			}
		})
	])

	return {
		totalHeadcount,
		onLeaveToday,
		pendingTimesheets,
		pendingLeave,
		openJobPostings,
		lastPayrollRun
	}
}

// ─── Upcoming events (dashboard side panel) ──────────────────────────────────

/** How far ahead the panel looks. Short deliberately: everything shown is close enough to act on. */
export const UPCOMING_EVENT_DAYS = 14

export type UpcomingEventKind =
	'holiday' | 'birthday' | 'anniversary' | 'regularization' | 'contract' | 'payroll' | 'leave'

export interface UpcomingEvent {
	/** UTC-midnight day key (YYYY-MM-DD), so the client formats without re-deriving a timezone. */
	date: string
	title: string
	detail?: string
	kind: UpcomingEventKind
	/** The viewer's own event — rendered with emphasis. */
	mine?: boolean
}

/** Day key `n` days from `from`, in the same UTC-midnight form the models store. */
function dayKeyIn(from: Date, days: number) {
	const d = new Date(from)
	d.setUTCDate(d.getUTCDate() + days)
	return manilaDayKey(d)
}

/**
 * Recurring-date helper: the next occurrence of `source`'s month/day at or after `todayKey`,
 * as a day key — or null when it falls outside the window. Used for birthdays and work
 * anniversaries, where only the month and day matter and the year rolls over.
 */
function nextAnniversaryKey(source: Date, todayKey: string, endKey: string): string | null {
	const [ty] = todayKey.split('-').map(Number)
	const mm = String(source.getUTCMonth() + 1).padStart(2, '0')
	const dd = String(source.getUTCDate()).padStart(2, '0')
	// Try this year and next: a window spanning New Year has to reach the following January.
	for (const year of [ty, ty + 1]) {
		const key = `${year}-${mm}-${dd}`
		if (key >= todayKey && key <= endKey) return key
	}
	return null
}

/**
 * The next `UPCOMING_EVENT_DAYS` of org and personal events for the dashboard panel.
 *
 * Scoping is the important part. Holidays, birthdays, anniversaries and payroll cut-offs are
 * org-wide and go to everyone. Probation reviews, contract end dates and other people's leave
 * are employment matters and go only to the HR ladder — a viewer always sees their *own*,
 * whatever their role, because those are facts about them.
 */
export async function listUpcomingEvents(
	organizationId: string,
	viewer: { userId: string; canSeeSensitive: boolean },
	asOf: Date = new Date(),
	limit?: number
): Promise<UpcomingEvent[]> {
	const todayKey = manilaDayKey(asOf)
	const endKey = dayKeyIn(asOf, UPCOMING_EVENT_DAYS)
	const from = new Date(`${todayKey}T00:00:00.000Z`)
	const to = new Date(`${endKey}T23:59:59.999Z`)

	const me = await db.employee.findFirst({
		where: { userId: viewer.userId, organizationId },
		select: { id: true }
	})

	const [holidays, people, periods, leaves] = await Promise.all([
		db.publicHoliday.findMany({
			where: { organizationId, date: { gte: from, lte: to } },
			select: { date: true, name: true, type: true }
		}),
		// One roster read feeds birthdays, anniversaries, regularizations and contract ends;
		// four separate queries over the same rows would be four times the work for one panel.
		db.employee.findMany({
			where: { organizationId, employmentStatus: 'ACTIVE' },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				dateOfBirth: true,
				startDate: true,
				endDate: true,
				employmentType: true
			}
		}),
		db.payrollPeriod.findMany({
			where: { organizationId, endDate: { gte: from, lte: to } },
			select: { name: true, endDate: true }
		}),
		db.request.findMany({
			where: {
				employee: { organizationId },
				type: 'LEAVE',
				status: 'APPROVED',
				dateFrom: { gte: from, lte: to }
			},
			select: {
				dateFrom: true,
				dateTo: true,
				employeeId: true,
				employee: { select: { firstName: true, lastName: true } }
			}
		})
	])

	const events: UpcomingEvent[] = []
	const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`

	for (const h of holidays) {
		events.push({
			date: manilaDayKey(h.date),
			title: h.name,
			// Regular vs special changes holiday pay, so it is worth naming.
			detail: h.type === 'REGULAR' ? 'Regular holiday' : 'Special holiday',
			kind: 'holiday'
		})
	}

	for (const p of people) {
		const mine = !!me && p.id === me.id

		if (p.dateOfBirth) {
			const key = nextAnniversaryKey(p.dateOfBirth, todayKey, endKey)
			if (key)
				events.push({ date: key, title: name(p), detail: 'Birthday', kind: 'birthday', mine })
		}

		const annKey = nextAnniversaryKey(p.startDate, todayKey, endKey)
		if (annKey) {
			const years = Number(annKey.slice(0, 4)) - p.startDate.getUTCFullYear()
			// Year zero is the hire date itself, not an anniversary.
			if (years > 0) {
				events.push({
					date: annKey,
					title: name(p),
					detail: `${years} year${years === 1 ? '' : 's'} of service`,
					kind: 'anniversary',
					mine
				})
			}
		}

		// Employment matters: HR-wide, or the viewer's own.
		if (!viewer.canSeeSensitive && !mine) continue

		if (p.employmentType === 'PROBATIONARY') {
			const due = new Date(p.startDate)
			due.setUTCMonth(due.getUTCMonth() + REGULARIZATION_MONTHS)
			const key = manilaDayKey(due)
			if (key >= todayKey && key <= endKey) {
				events.push({
					date: key,
					title: name(p),
					detail: 'Regularization due',
					kind: 'regularization',
					mine
				})
			}
		}

		if (p.employmentType === 'CONTRACTUAL' && p.endDate) {
			const key = manilaDayKey(p.endDate)
			if (key >= todayKey && key <= endKey) {
				events.push({ date: key, title: name(p), detail: 'Contract ends', kind: 'contract', mine })
			}
		}
	}

	for (const period of periods) {
		events.push({
			date: manilaDayKey(period.endDate),
			title: 'Payroll cut-off',
			detail: period.name,
			kind: 'payroll'
		})
	}

	for (const l of leaves) {
		const mine = !!me && l.employeeId === me.id
		if (!viewer.canSeeSensitive && !mine) continue
		const days =
			l.dateTo && l.dateFrom
				? Math.round((l.dateTo.getTime() - l.dateFrom.getTime()) / 86_400_000) + 1
				: 1
		events.push({
			date: manilaDayKey(l.dateFrom as Date),
			title: mine ? 'You are on leave' : name(l.employee),
			detail: `On leave · ${days} day${days === 1 ? '' : 's'}`,
			kind: 'leave',
			mine
		})
	}

	// The cap belongs HERE, on the merged sorted output — never on any of the four queries above.
	// The roster read feeds birthdays, anniversaries, regularizations and contract ends at once
	// (see its comment), so a `take` on it would drop whole event kinds rather than trailing rows,
	// and a `take` on holidays or leave would do the same. Slicing the sorted merge keeps every
	// kind eligible for the first N days. The query cost is unchanged; that residual is recorded
	// in the query-level-pagination backlog note.
	const sorted = events.sort(
		(a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
	)
	return limit === undefined ? sorted : sorted.slice(0, limit)
}

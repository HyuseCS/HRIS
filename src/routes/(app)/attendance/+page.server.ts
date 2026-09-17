import { error, fail } from '@sveltejs/kit'
import { z } from 'zod'
import { db } from '$lib/server/db'
import { canAny, requireAnyCapability, requireFoodServiceOrg } from '$lib/server/rbac'
import {
	countAttendanceDays,
	listAttendanceDays,
	listTeamDay,
	countTeamDay,
	deriveRange,
	autoDeriveFromPunches,
	correctDay,
	lockRange,
	unlockRange,
	resetDayToDerived,
	createTimesheetFromAttendance
} from '$lib/server/services/attendance'
import {
	importBacklogCsv,
	MAX_IMPORT_BYTES,
	MAX_IMPORT_ROWS
} from '$lib/server/services/attendance/import'
import { listReportIdsFor } from '$lib/server/services/supervisors'
import { paginate } from '$lib/server/pagination'
import { isFoodServiceOrg } from '$lib/orgs'
import { manilaDayKey, manilaShortDay } from '$lib/utils/dates'
import type { Actions, PageServerLoad, RequestEvent } from './$types'

const DAY_MS = 86_400_000
const MAX_RANGE_DAYS = 62 // ~2 months

/** Clamp [from, to] to at most MAX_RANGE_DAYS, keeping `to` fixed. Returns PHT day keys. */
function clampRange(fromKey: string, toKey: string) {
	const to = new Date(toKey).getTime()
	const from = new Date(fromKey).getTime()
	if (from > to) return { from: toKey, to: toKey }
	if (to - from > MAX_RANGE_DAYS * DAY_MS)
		return { from: manilaDayKey(new Date(to - MAX_RANGE_DAYS * DAY_MS)), to: toKey }
	return { from: fromKey, to: toKey }
}

async function loadMatrix(
	user: NonNullable<App.Locals['user']>,
	url: URL,
	ctx: Parameters<typeof autoDeriveFromPunches>[2]
) {
	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
	const isAdmin = canAny(user.roles, 'ADMINISTER_HR_RECORDS')

	// Date range from URL params, default to current week (Mon-Sun)
	const today = new Date()
	const weekDay = today.getDay()
	const weekStart = new Date(today)
	weekStart.setDate(today.getDate() - (weekDay === 0 ? 6 : weekDay - 1))
	weekStart.setHours(0, 0, 0, 0)
	const weekEnd = new Date(weekStart)
	weekEnd.setDate(weekStart.getDate() + 6)
	weekEnd.setHours(23, 59, 59, 999)

	const startParam = url.searchParams.get('start')
	const endParam = url.searchParams.get('end')
	const startDate = startParam ? new Date(startParam) : weekStart
	const endDate = endParam ? new Date(endParam) : weekEnd
	const startISO = startDate.toISOString().slice(0, 10)
	const endISO = endDate.toISOString().slice(0, 10)

	// Get team members. A manager's team is everyone who reports to them as primary OR
	// additional supervisor (#176); HR/Super Admin see the whole org.
	let memberScope: { id?: { in: string[] } } = {}
	// #6: `{}` here means "no filter", which returns the whole org. A non-admin with no employee
	// row in the ACTIVE org has no reports, so the answer is the empty list — never the
	// unfiltered one. Same `[]`-not-`undefined` discipline as leave/+page.server.ts:38.
	if (!isAdmin) {
		memberScope = { id: { in: myEmployee ? await listReportIdsFor(myEmployee.id) : [] } }
	}
	const memberWhere = {
		organizationId: user.organizationId,
		user: { isActive: true },
		...memberScope
	}
	const total = await db.employee.count({ where: memberWhere })
	const pagination = paginate(url, total)
	const members = await db.employee.findMany({
		where: memberWhere,
		select: { id: true, firstName: true, lastName: true },
		orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
		skip: pagination.skip,
		take: pagination.take
	})

	// Auto-derive from punches over the range so ABSENT/INCOMPLETE days materialise (non-destructive;
	// fills only missing days). This is what makes the "who failed to time in" check work — otherwise
	// a no-punch day is invisible until someone opens that employee's attendance.
	await autoDeriveFromPunches(user.organizationId, { from: startDate, to: endDate }, ctx)

	// Presence comes from the derived AttendanceDay records (same source as the single-employee
	// attendance view), so ABSENT / INCOMPLETE / ON_LEAVE / HOLIDAY / REST_DAY each render distinctly
	// instead of collapsing to a blank "no data" cell.
	const days = await db.attendanceDay.findMany({
		where: {
			employeeId: { in: members.map((m) => m.id) },
			date: { gte: new Date(startISO), lte: new Date(endISO) }
		},
		select: { employeeId: true, date: true, status: true }
	})

	// attendanceMap: { [employeeId]: { [dateISO]: AttendanceStatus } }
	const attendanceMap: Record<string, Record<string, string>> = {}
	for (const d of days) {
		const dateISO = d.date.toISOString().slice(0, 10)
		;(attendanceMap[d.employeeId] ??= {})[dateISO] = d.status
	}

	// Build date columns array
	const dates: string[] = []
	const cur = new Date(startDate)
	while (cur <= endDate) {
		dates.push(cur.toISOString().slice(0, 10))
		cur.setDate(cur.getDate() + 1)
	}

	return {
		members,
		pagination,
		dates,
		attendanceMap,
		startDate: startISO,
		endDate: endISO,
		// Food-service tenants label this roster "Branches" (#182), so the heading follows suit.
		isFoodService: isFoodServiceOrg(user.organizationId)
	}
}

export const load: PageServerLoad = async ({ locals, url, getClientAddress }) => {
	const user = locals.user!
	const canManage = canAny(user.roles, 'MANAGE_HR')
	const canUnlock = canAny(user.roles, 'OVERRIDE_FINALIZED') // reopening locked days is privileged

	const today = manilaDayKey(new Date())
	const rawFrom = url.searchParams.get('from') || manilaDayKey(new Date(Date.now() - 13 * DAY_MS))
	const rawTo = url.searchParams.get('to') || today
	// Cap the visible range to ~2 months so derive/list stay bounded.
	const { from, to } = clampRange(rawFrom, rawTo)
	const date = url.searchParams.get('date') || today

	// Managers can switch between a single employee's range and the whole team on one day.
	const viewParam = url.searchParams.get('view')
	const view: 'matrix' | 'team' | 'employee' = !canManage
		? 'employee'
		: viewParam === 'team' || viewParam === 'employee'
			? viewParam
			: 'matrix'

	let employees: { id: string; firstName: string; lastName: string; employeeNumber: string }[] = []
	let selectedEmployeeId: string | null = null

	if (canManage && view !== 'matrix') {
		employees = await db.employee.findMany({
			where: { organizationId: user.organizationId, employmentStatus: 'ACTIVE' },
			select: { id: true, firstName: true, lastName: true, employeeNumber: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		})
		selectedEmployeeId = url.searchParams.get('employeeId') || employees[0]?.id || null
	} else if (!canManage) {
		const me = await db.employee.findFirst({
			where: { userId: user.id, organizationId: user.organizationId },
			select: { id: true }
		})
		selectedEmployeeId = me?.id ?? null
	}

	// Auto-derive from punches so the page shows data without a manual step. Non-destructive
	// (fills only missing days, leaves locked/corrected days untouched). Employees may derive
	// their own days (selectedEmployeeId is their own id); the team-wide sweep stays manager-only.
	const ctx = {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	}
	if (view === 'employee' && selectedEmployeeId) {
		await autoDeriveFromPunches(
			user.organizationId,
			{ from: new Date(from), to: new Date(to), employeeId: selectedEmployeeId },
			ctx
		)
	} else if (view === 'team' && canManage) {
		await autoDeriveFromPunches(
			user.organizationId,
			{ from: new Date(date), to: new Date(date) },
			ctx
		)
	}

	const matrix = view === 'matrix' ? await loadMatrix(user, url, ctx) : null

	// #64: paginate the employee-view day rows (one count + one page query); the
	// team view is paginated the same way.
	const exceptionsOnly =
		(view === 'team' || view === 'employee') && url.searchParams.get('exceptions') === '1'
	const dayTotal =
		view === 'employee' && selectedEmployeeId
			? await countAttendanceDays(selectedEmployeeId, new Date(from), new Date(to), exceptionsOnly)
			: 0
	const pagination = paginate(
		url,
		view === 'team' ? await countTeamDay(user.organizationId, date, exceptionsOnly) : dayTotal
	)

	const days =
		view === 'employee' && selectedEmployeeId
			? await listAttendanceDays(selectedEmployeeId, new Date(from), new Date(to), 'desc', {
					skip: pagination.skip,
					take: pagination.take,
					exceptionsOnly
				})
			: []

	const team =
		view === 'team'
			? await listTeamDay(user.organizationId, date, {
					exceptionsOnly,
					skip: pagination.skip,
					take: pagination.take
				})
			: []

	return {
		canManage,
		canUnlock,
		view,
		employees,
		selectedEmployeeId,
		from,
		to,
		date,
		days,
		team,
		matrix,
		exceptionsOnly,
		pagination,
		maxRangeDays: MAX_RANGE_DAYS,
		// #200: the import card states its own limits, so an operator learns them before a 413
		// rather than from one. They come from the service that enforces them — a literal in the
		// markup would drift the moment either cap moved.
		maxImportBytes: MAX_IMPORT_BYTES,
		maxImportRows: MAX_IMPORT_ROWS,
		// #162: the AM/PM columns render for food-service tenants only.
		showAmPm: isFoodServiceOrg(user.organizationId)
	}
}

function ctxOf(event: RequestEvent) {
	const u = event.locals.user!
	return {
		organizationId: u.organizationId,
		actorId: u.id,
		actorRoles: u.roles,
		ipAddress: event.getClientAddress()
	}
}

function toFail(e: unknown, extra?: { importError: true }) {
	const err = e as { status?: number; body?: { message?: string } }
	// #200 added 413/415: the backlog import's size and type refusals must reach the operator as a
	// form message, not as a 500.
	if (err?.status && [400, 404, 409, 413, 415].includes(err.status))
		return fail(err.status, { error: err.body?.message ?? 'Action failed', ...extra })
	throw e
}

/**
 * One day names itself; several report a count. A refused row is `failed`, never `skipped` —
 * skipped reads as "nothing to do" and would hide a refusal behind a success.
 */
function bulkSaved(verb: string, results: { date: string; ok: boolean }[]) {
	const done = results.filter((r) => r.ok)
	const failed = results.length - done.length
	const subject =
		done.length === 1
			? manilaShortDay(done[0].date)
			: `${done.length} day${done.length === 1 ? '' : 's'}`
	return failed > 0 ? `${verb} ${subject}, ${failed} failed.` : `${verb} ${subject}.`
}

const rangeSchema = z.object({
	employeeId: z.string().min(1),
	from: z.coerce.date(),
	to: z.coerce.date()
})
const teamDaySchema = z.object({ date: z.coerce.date() })

/** Reject spans over the 2-month cap so a hand-crafted POST can't bypass the load clamp. */
function spanExceeded(from: Date, to: Date) {
	return to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS
}
const correctSchema = z.object({
	id: z.string().min(1),
	// date (YYYY-MM-DD, PHT) + timeIn/timeOut (HH:MM) let HR set times manually; the
	// day key is combined with the time to rebuild a PHT timestamp. Empty time clears it.
	date: z.string().optional(),
	timeIn: z.string().optional(),
	timeOut: z.string().optional(),
	status: z
		.enum(['PRESENT', 'LATE', 'ABSENT', 'INCOMPLETE', 'ON_LEAVE', 'HOLIDAY', 'REST_DAY'])
		.optional(),
	note: z.string().optional()
})
const bulkRowSchema = correctSchema.extend({ date: z.string().min(1) })
const bulkResetRowSchema = z.object({ id: z.string().min(1), date: z.string().min(1) })
const MAX_BULK_ROWS = paginate(new URL('http://localhost/'), 0).take

export const actions: Actions = {
	derive: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const parsed = rangeSchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid range' })
		if (spanExceeded(parsed.data.from, parsed.data.to))
			return fail(400, { error: 'Range exceeds the 2-month limit.' })
		try {
			await deriveRange(
				event.locals.user!.organizationId,
				{ from: parsed.data.from, to: parsed.data.to, employeeId: parsed.data.employeeId },
				ctxOf(event)
			)
		} catch (e) {
			return toFail(e)
		}
	},

	correct: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const parsed = correctSchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid correction' })
		const { id, date, timeIn, timeOut, ...rest } = parsed.data
		const data: Parameters<typeof correctDay>[2] = { ...rest }
		// Rebuild PHT timestamps from the day key + HH:MM (only when a date was sent).
		if (date) {
			data.timeIn = timeIn ? new Date(`${date}T${timeIn}:00+08:00`) : null
			data.timeOut = timeOut ? new Date(`${date}T${timeOut}:00+08:00`) : null
		}
		let day: Awaited<ReturnType<typeof correctDay>>
		try {
			day = await correctDay(id, event.locals.user!.organizationId, data, ctxOf(event))
		} catch (e) {
			return toFail(e)
		}
		return { action: 'correct', saved: `${manilaShortDay(day.date)} saved.`, day }
	},

	saveAll: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const raw = (await event.request.formData()).get('rows')
		if (typeof raw !== 'string') return fail(400, { error: 'Nothing to save.' })
		let decoded: unknown
		try {
			decoded = JSON.parse(raw)
		} catch {
			return fail(400, { error: 'Could not read the days to save.' })
		}
		const parsed = z.array(bulkRowSchema).min(1).safeParse(decoded)
		if (!parsed.success) return fail(400, { error: 'Could not read the days to save.' })
		if (parsed.data.length > MAX_BULK_ROWS)
			return fail(400, { error: `Too many days in one save — ${MAX_BULK_ROWS} at a time.` })

		const organizationId = event.locals.user!.organizationId
		const ctx = ctxOf(event)
		const results: { id: string; date: string; ok: boolean; reason?: string }[] = []
		for (const row of parsed.data) {
			const { id, date, timeIn, timeOut, ...rest } = row
			const data: Parameters<typeof correctDay>[2] = { ...rest }
			data.timeIn = timeIn ? new Date(`${date}T${timeIn}:00+08:00`) : null
			data.timeOut = timeOut ? new Date(`${date}T${timeOut}:00+08:00`) : null
			try {
				await correctDay(id, organizationId, data, ctx)
				results.push({ id, date, ok: true })
			} catch (e) {
				const err = e as { status?: number; body?: { message?: string } }
				if (!err?.status || ![400, 404, 409].includes(err.status)) throw e
				results.push({ id, date, ok: false, reason: err.body?.message ?? 'Could not be saved' })
			}
		}
		const done = results.filter((r) => r.ok).length
		const skipped = results.length - done
		if (done === 0)
			return fail(400, {
				action: 'saveAll',
				error: `No days were saved — ${skipped} could not be saved.`,
				results
			})
		return {
			action: 'saveAll',
			saved: bulkSaved('Saved', results),
			results
		}
	},

	// Discard a manual override on a day and re-derive it from punches.
	resetDay: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const id = (await event.request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing day id' })
		let reset: Awaited<ReturnType<typeof resetDayToDerived>>
		try {
			reset = await resetDayToDerived(id, event.locals.user!.organizationId, ctxOf(event))
		} catch (e) {
			return toFail(e)
		}
		// Several of these auto-submit on change, so the toast is the only possible cue.
		return { action: 'resetDay', saved: `${manilaShortDay(reset.date)} recalculated from punches.` }
	},

	resetAll: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const raw = (await event.request.formData()).get('rows')
		if (typeof raw !== 'string') return fail(400, { error: 'Nothing to recalculate.' })
		let decoded: unknown
		try {
			decoded = JSON.parse(raw)
		} catch {
			return fail(400, { error: 'Could not read the days to recalculate.' })
		}
		const parsed = z.array(bulkResetRowSchema).min(1).safeParse(decoded)
		if (!parsed.success) return fail(400, { error: 'Could not read the days to recalculate.' })
		if (parsed.data.length > MAX_BULK_ROWS)
			return fail(400, {
				error: `Too many days in one recalculate — ${MAX_BULK_ROWS} at a time.`
			})

		const organizationId = event.locals.user!.organizationId
		const ctx = ctxOf(event)
		const results: { id: string; date: string; ok: boolean; reason?: string }[] = []
		for (const { id, date } of parsed.data) {
			try {
				await resetDayToDerived(id, organizationId, ctx)
				results.push({ id, date, ok: true })
			} catch (e) {
				const err = e as { status?: number; body?: { message?: string } }
				if (!err?.status || ![400, 404, 409].includes(err.status)) throw e
				results.push({
					id,
					date,
					ok: false,
					reason: err.body?.message ?? 'Could not be recalculated'
				})
			}
		}
		const done = results.filter((r) => r.ok).length
		const skipped = results.length - done
		if (done === 0)
			return fail(400, {
				action: 'resetAll',
				error: `No days were recalculated — ${skipped} could not be recalculated.`,
				results
			})
		return {
			action: 'resetAll',
			saved: bulkSaved('Recalculated', results),
			results
		}
	},

	lock: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const parsed = rangeSchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid range' })
		if (spanExceeded(parsed.data.from, parsed.data.to))
			return fail(400, { error: 'Range exceeds the 2-month limit.' })
		try {
			await lockRange(
				event.locals.user!.organizationId,
				{ from: parsed.data.from, to: parsed.data.to, employeeId: parsed.data.employeeId },
				ctxOf(event)
			)
		} catch (e) {
			return toFail(e)
		}
		return { action: 'lock', saved: 'Attendance locked for the range.' }
	},

	// Reopening locked days overrides a finalized record — Super Admin only, not the CEO (#224).
	unlock: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'OVERRIDE_FINALIZED')
		const parsed = rangeSchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid range' })
		if (spanExceeded(parsed.data.from, parsed.data.to))
			return fail(400, { error: 'Range exceeds the 2-month limit.' })
		try {
			await unlockRange(
				event.locals.user!.organizationId,
				{ from: parsed.data.from, to: parsed.data.to, employeeId: parsed.data.employeeId },
				ctxOf(event)
			)
		} catch (e) {
			return toFail(e)
		}
		return { action: 'unlock', saved: 'Attendance reopened for the range.' }
	},

	unlockTeam: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'OVERRIDE_FINALIZED')
		const parsed = teamDaySchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid date' })
		try {
			await unlockRange(
				event.locals.user!.organizationId,
				{ from: parsed.data.date, to: parsed.data.date },
				ctxOf(event)
			)
		} catch (e) {
			return toFail(e)
		}
		return { action: 'unlockTeam', saved: 'Attendance reopened for the day.' }
	},

	// Persist the selected employee's range as a Timesheet record (per-employee tab only).
	saveTimesheet: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const parsed = rangeSchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid range' })
		if (spanExceeded(parsed.data.from, parsed.data.to))
			return fail(400, { error: 'Range exceeds the 2-month limit.' })
		try {
			const ts = await createTimesheetFromAttendance(
				parsed.data.employeeId,
				event.locals.user!.organizationId,
				parsed.data.from,
				parsed.data.to,
				ctxOf(event)
			)
			return {
				saved: `Timesheet saved (${ts.entries.length} day${ts.entries.length === 1 ? '' : 's'}).`
			}
		} catch (e) {
			return toFail(e)
		}
	},

	// Whole-team single-day variants for the team view: no employeeId → all active employees.
	deriveTeam: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const parsed = teamDaySchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid date' })
		try {
			await deriveRange(
				event.locals.user!.organizationId,
				{ from: parsed.data.date, to: parsed.data.date },
				ctxOf(event)
			)
		} catch (e) {
			return toFail(e)
		}
	},

	// #200 — CSV backlog upload. Same actor boundary as every other attendance write on this page
	// (MANAGE_HR), plus the food-service gate: for a non-food-service tenant the feature genuinely
	// does not exist. The `{#if}` around the upload form is cosmetic; this is the enforcement.
	importBacklog: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		requireFoodServiceOrg(event.locals.user!.organizationId)
		const file = (await event.request.formData()).get('backlog')
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { error: 'Choose a CSV file to upload.', importError: true })
		try {
			// Both caps are checked BEFORE the body is read: an oversize upload must cost a size
			// comparison, not a 2 MB+ decode into memory. The service repeats them as a second layer
			// for any future caller that does not come through this action.
			if (file.size > MAX_IMPORT_BYTES) error(413, 'Backlog file exceeds the 2 MB limit')
			if (!file.name.toLowerCase().endsWith('.csv')) error(415, 'Only .csv files are accepted')
			const imported = await importBacklogCsv(
				event.locals.user!.organizationId,
				{ name: file.name, size: file.size, text: await file.text() },
				ctxOf(event)
			)
			return { imported }
		} catch (e) {
			// M-9: flagged so the import card can echo its OWN failure without also echoing every
			// other action's. `error` alone is set by all thirteen actions on this page.
			return toFail(e, { importError: true })
		}
	},

	lockTeam: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const parsed = teamDaySchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid date' })
		try {
			await lockRange(
				event.locals.user!.organizationId,
				{ from: parsed.data.date, to: parsed.data.date },
				ctxOf(event)
			)
		} catch (e) {
			return toFail(e)
		}
		return { action: 'lockTeam', saved: 'Attendance locked for the day.' }
	}
}

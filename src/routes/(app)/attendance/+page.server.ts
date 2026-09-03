import { error, fail } from '@sveltejs/kit'
import { z } from 'zod'
import { db } from '$lib/server/db'
import { canAny, requireAnyCapability, requireFoodServiceOrg } from '$lib/server/rbac'
import {
	countAttendanceDays,
	listAttendanceDays,
	listTeamDay,
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
import { paginate } from '$lib/server/pagination'
import { isFoodServiceOrg } from '$lib/orgs'
import { manilaDayKey } from '$lib/utils/dates'
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

export const load: PageServerLoad = async ({ locals, url, getClientAddress }) => {
	const user = locals.user!
	const canManage = canAny(user.roles, 'MANAGE_HR')
	const canUnlock = canAny(user.roles, 'OVERRIDE_FINALIZED') // reopening locked days is privileged

	const today = manilaDayKey(new Date())
	const rawFrom = url.searchParams.get('from') ?? manilaDayKey(new Date(Date.now() - 13 * DAY_MS))
	const rawTo = url.searchParams.get('to') ?? today
	// Cap the visible range to ~2 months so derive/list stay bounded.
	const { from, to } = clampRange(rawFrom, rawTo)
	const date = url.searchParams.get('date') ?? today

	// Managers can switch between a single employee's range and the whole team on one day.
	const view = canManage && url.searchParams.get('view') === 'team' ? 'team' : 'employee'

	let employees: { id: string; firstName: string; lastName: string; employeeNumber: string }[] = []
	let selectedEmployeeId: string | null = null

	if (canManage) {
		employees = await db.employee.findMany({
			where: { organizationId: user.organizationId, employmentStatus: 'ACTIVE' },
			select: { id: true, firstName: true, lastName: true, employeeNumber: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		})
		selectedEmployeeId = url.searchParams.get('employeeId') ?? employees[0]?.id ?? null
	} else {
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

	// #64: paginate the employee-view day rows (one count + one page query); the
	// team view is a single day and stays unpaginated.
	const dayTotal =
		view === 'employee' && selectedEmployeeId
			? await countAttendanceDays(selectedEmployeeId, new Date(from), new Date(to))
			: 0
	const pagination = paginate(url, dayTotal)

	const days =
		view === 'employee' && selectedEmployeeId
			? await listAttendanceDays(selectedEmployeeId, new Date(from), new Date(to), 'desc', {
					skip: pagination.skip,
					take: pagination.take
				})
			: []

	const team = view === 'team' ? await listTeamDay(user.organizationId, date) : []

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
	regularHours: z.coerce.number().min(0).optional(),
	overtimeHours: z.coerce.number().min(0).optional(),
	status: z
		.enum(['PRESENT', 'LATE', 'ABSENT', 'INCOMPLETE', 'ON_LEAVE', 'HOLIDAY', 'REST_DAY'])
		.optional(),
	note: z.string().optional()
})

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
		try {
			await correctDay(id, event.locals.user!.organizationId, data, ctxOf(event))
		} catch (e) {
			return toFail(e)
		}
	},

	// Discard a manual override on a day and re-derive it from punches.
	resetDay: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const id = (await event.request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing day id' })
		try {
			await resetDayToDerived(id, event.locals.user!.organizationId, ctxOf(event))
		} catch (e) {
			return toFail(e)
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
	}
}

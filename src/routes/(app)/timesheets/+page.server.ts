import { fail, isHttpError, redirect } from '@sveltejs/kit'
import { canAny, requireAnyCapability } from '$lib/server/rbac'
import {
	countTimesheets,
	listTimesheets,
	getTimesheet,
	createTimesheet,
	submitTimesheet,
	updateTimesheetEntries,
	deleteTimesheet,
	submitDraftByHr,
	assertCanModifyTimesheet
} from '$lib/server/services/timesheets'
import { paginate } from '$lib/server/pagination'
import { setFlash } from '$lib/server/flash'
import {
	previewTimeLogAggregation,
	aggregateTimeLogsToTimesheet
} from '$lib/server/services/timelog'
import { autoDeriveFromPunches, attendanceEntriesForRange } from '$lib/server/services/attendance'
import { db } from '$lib/server/db'
import { z } from 'zod'
import type { Actions, PageServerLoad, RequestEvent } from './$types'

/**
 * #6 — the caller's OWN employee row, scoped to the ACTIVE org. A cross-org account (the CEO,
 * #224) carries a profile in its home tenant only, so an unscoped `userId` lookup resolves that
 * home-tenant employee whichever org the session is currently in. Same shape as
 * `findSelfEmployee` in punch/+page.server.ts. Only `id` is ever read off the row.
 */
function findSelfEmployee(user: { id: string; organizationId: string }) {
	return db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	const isManager = canAny(user.roles, 'VIEW_TEAM')
	const isHrAdmin = canAny(user.roles, 'MANAGE_HR')
	// #165: /timesheets is view-only for the Employee role — they read their own sheets,
	// but creating/submitting/deleting is the manager ladder's (HR aggregates from punches
	// and submits drafts on their behalf). Mirrors the `requireModify` gate on the actions.
	const canModify = isManager
	// Creating a sheet now names its employee explicitly, which makes it HR work rather than
	// self-service. Deliberately not `canModify && myEmployee` — the picker supplies the
	// target, so an HR user with no Employee record of their own (the CEO) can still create.
	const canCreate = isHrAdmin

	const status = url.searchParams.get('status') ?? undefined

	const myEmployee = await findSelfEmployee(user)

	// #64: "mine" and "team" are separate server queries with independent page
	// params (myPage / teamPage), one count + one page query each. The row
	// promises still stream so the page renders skeletons while they load.
	const mineParams = myEmployee
		? { organizationId: user.organizationId, employeeId: myEmployee.id, status }
		: null
	const mineTotal = mineParams ? await countTimesheets(mineParams) : 0
	const minePagination = paginate(url, mineTotal, { param: 'myPage' })
	const myTimesheets = mineParams
		? listTimesheets(mineParams, { skip: minePagination.skip, take: minePagination.take })
		: Promise.resolve([])

	// A non-manager without an employee record owns no timesheets — empty rather
	// than an undefined employeeId (which would list the whole org).
	const teamParams = isManager
		? // #6: for a cross-org actor `myEmployee` is now null and this self-exclusion goes
			// undefined, which services/timesheets.ts drops from the where clause. Safe: dropping a
			// NEGATIVE self-exclusion re-admits only the actor's own rows, and those are already
			// outside `organizationId`. Dropping a POSITIVE restriction is what widens a query.
			{ organizationId: user.organizationId, excludeEmployeeId: myEmployee?.id, status }
		: null
	const teamTotal = teamParams ? await countTimesheets(teamParams) : 0
	const teamPagination = paginate(url, teamTotal, { param: 'teamPage' })
	const teamTimesheets = teamParams
		? listTimesheets(teamParams, { skip: teamPagination.skip, take: teamPagination.take })
		: Promise.resolve([])

	// HR gets the "Aggregate from time logs" panel and the New Timesheet dialog, both of
	// which pick an employee from this list.
	const employees = isHrAdmin
		? await db.employee.findMany({
				where: { organizationId: user.organizationId, employmentStatus: 'ACTIVE' },
				select: { id: true, firstName: true, lastName: true, employeeNumber: true },
				orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
			})
		: []

	return {
		myTimesheets,
		teamTimesheets,
		minePagination,
		teamPagination,
		myEmployeeId: myEmployee?.id,
		isManager,
		isHrAdmin,
		canModify,
		canCreate,
		employees
	}
}

/** #165: every mutating action on this page is closed to the Employee role. */
function requireModify(event: RequestEvent) {
	requireAnyCapability(event.locals.user!.roles, 'VIEW_TEAM')
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

function toFail(e: unknown) {
	if (isHttpError(e) && [400, 403, 404, 409].includes(e.status))
		return fail(e.status, { error: e.body.message })
	throw e
}

const createSchema = z
	.object({
		employeeId: z.string().min(1),
		periodStart: z.coerce.date(),
		periodEnd: z.coerce.date()
	})
	.refine((d) => d.periodEnd >= d.periodStart, {
		message: 'End date must be on or after the start date',
		path: ['periodEnd']
	})

const aggregateSchema = z.object({
	employeeId: z.string().min(1),
	weekOf: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'weekOf must be YYYY-MM-DD')
		// Reject calendar-invalid dates (e.g. 2026-02-31) that Date would silently roll over.
		.refine((v) => {
			const [y, m, d] = v.split('-').map(Number)
			const dt = new Date(Date.UTC(y, m - 1, d))
			return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
		}, 'weekOf is not a valid calendar date')
})

// Scope the target employee to the caller's org; returns its id or null.
async function resolveOrgEmployee(employeeId: string, organizationId: string) {
	return db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true }
	})
}

// Entries arrive with date (YYYY-MM-DD) + optional HH:MM times; the server rebuilds PHT
// timestamps from date + time. hoursWorked is total worked; otHours is the OT portion.
const entriesSchema = z.array(
	z
		.object({
			date: z.string().min(1),
			timeIn: z.string().optional(),
			timeOut: z.string().optional(),
			hoursWorked: z.coerce.number().min(0).max(24),
			otHours: z.coerce.number().min(0).max(24).optional(),
			notes: z.string().optional()
		})
		.refine((e) => (e.otHours ?? 0) <= e.hoursWorked, {
			message: 'OT hours cannot exceed hours worked',
			path: ['otHours']
		})
)

function toEntryInputs(rows: z.infer<typeof entriesSchema>) {
	return rows.map((e) => ({
		date: new Date(e.date),
		timeIn: e.timeIn ? new Date(`${e.date}T${e.timeIn}:00+08:00`) : null,
		timeOut: e.timeOut ? new Date(`${e.date}T${e.timeOut}:00+08:00`) : null,
		hoursWorked: e.hoursWorked,
		otHours: e.otHours ?? 0,
		notes: e.notes
	}))
}

export const actions: Actions = {
	// HR only — non-destructive preview of a week's punch aggregation (no DB writes).
	previewAggregate: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const org = event.locals.user!.organizationId
		const parsed = aggregateSchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Pick an employee and a week.' })

		if (!(await resolveOrgEmployee(parsed.data.employeeId, org)))
			return fail(404, { error: 'Employee not found' })

		const preview = await previewTimeLogAggregation(
			parsed.data.employeeId,
			new Date(parsed.data.weekOf)
		)
		return {
			preview: { ...preview, employeeId: parsed.data.employeeId, weekOf: parsed.data.weekOf }
		}
	},

	// HR only — commit the week's punches into a DRAFT timesheet (idempotent for drafts).
	aggregate: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const org = event.locals.user!.organizationId
		const parsed = aggregateSchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Pick an employee and a week.' })

		if (!(await resolveOrgEmployee(parsed.data.employeeId, org)))
			return fail(404, { error: 'Employee not found' })

		try {
			const result = await aggregateTimeLogsToTimesheet(
				parsed.data.employeeId,
				new Date(parsed.data.weekOf),
				ctxOf(event)
			)
			const days = Object.keys(result.hoursByDay).length
			return {
				saved: `Aggregated ${result.totalHours.toFixed(2)} hrs across ${days} day${days === 1 ? '' : 's'} into a draft timesheet.`
			}
		} catch (e) {
			return toFail(e)
		}
	},

	// HR only — submit an aggregated draft on the employee's behalf. Approval itself
	// happens exclusively in the review queue (/requests/timesheets).
	submitDraft: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		const id = (await event.request.formData()).get('id')
		if (typeof id !== 'string' || !id) return fail(400, { error: 'Missing timesheet id' })
		try {
			await submitDraftByHr(id, event.locals.user!.organizationId, ctxOf(event))
			return { saved: 'Timesheet submitted for review.' }
		} catch (e) {
			return toFail(e)
		}
	},

	// Period-range create (NewTimesheetDialog): reflect the named employee's punches for the
	// period, seed a DRAFT from the derived attendance (no punches → empty draft), then
	// redirect to /timesheets so the new row is visible. Submission happens separately.
	//
	// HR-only: the dialog names its employee, so this is HR acting for someone rather than
	// self-service. It is also the one creation surface that tolerates a punch-free period —
	// the aggregate panel needs punches, and /attendance "Save as timesheet" rejects an empty
	// range outright (#214).
	create: async (event) => {
		requireModify(event)
		const user = event.locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const parsed = createSchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success)
			return fail(400, { error: parsed.error.errors[0]?.message ?? 'Invalid dates' })

		// createTimesheet takes the id on trust — it checks the period shape and the duplicate
		// constraint but never the org — so the tenancy check has to happen here.
		const target = await resolveOrgEmployee(parsed.data.employeeId, user.organizationId)
		if (!target) return fail(404, { error: 'Employee not found' })

		const ctx = ctxOf(event)
		try {
			await autoDeriveFromPunches(
				user.organizationId,
				{ from: parsed.data.periodStart, to: parsed.data.periodEnd, employeeId: target.id },
				ctx
			)
			const entries = await attendanceEntriesForRange(
				target.id,
				parsed.data.periodStart,
				parsed.data.periodEnd
			)
			await createTimesheet(target.id, parsed.data.periodStart, parsed.data.periodEnd, entries, ctx)
		} catch (e) {
			return toFail(e)
		}
		// This action redirects to the page it was posted from, which discards `form` — so the
		// page's own banner can never fire for it. The flash is the only way to say anything.
		setFlash(event.cookies, { kind: 'success', message: 'Draft timesheet created.' })
		redirect(303, '/timesheets')
	},

	// Repopulate a draft's entries from the period's attendance (re-derives punches first).
	// Authorized in updateTimesheetEntries: the owner may sync their own draft; managers/HR too.
	syncAttendance: async (event) => {
		requireModify(event)
		const org = event.locals.user!.organizationId
		const id = (await event.request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing timesheet id' })

		const ctx = ctxOf(event)
		try {
			const ts = await getTimesheet(id, org)
			// Authorize before deriving: updateTimesheetEntries is what checks the caller, and
			// autoDeriveFromPunches writes AttendanceDay rows — running it first meant a caller
			// who was about to be refused still triggered the write.
			await assertCanModifyTimesheet(ctx, ts)
			await autoDeriveFromPunches(
				org,
				{ from: ts.periodStart, to: ts.periodEnd, employeeId: ts.employeeId },
				ctx
			)
			const entries = await attendanceEntriesForRange(ts.employeeId, ts.periodStart, ts.periodEnd)
			await updateTimesheetEntries(id, org, entries, ctx)
			return {
				saved: `Synced ${entries.length} day${entries.length === 1 ? '' : 's'} from attendance.`
			}
		} catch (e) {
			return toFail(e)
		}
	},

	submit: async (event) => {
		requireModify(event)
		const user = event.locals.user!
		const myEmployee = await findSelfEmployee(user)
		if (!myEmployee) return fail(400, { error: 'No employee profile found' })

		const id = (await event.request.formData()).get('id') as string
		try {
			await submitTimesheet(id, myEmployee.id, ctxOf(event))
			return { saved: 'Timesheet submitted for review.' }
		} catch (e) {
			return toFail(e)
		}
	},

	// HR review edit: replace the timesheet's entries and recompute its total.
	saveEntries: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'VIEW_TEAM')
		const data = await event.request.formData()
		const id = data.get('id') as string
		let parsed
		try {
			parsed = entriesSchema.parse(JSON.parse(String(data.get('entries') ?? '[]')))
		} catch {
			return fail(400, { error: 'Invalid timesheet entries' })
		}
		try {
			await updateTimesheetEntries(
				id,
				event.locals.user!.organizationId,
				toEntryInputs(parsed),
				ctxOf(event)
			)
			return { saved: 'Timesheet entries saved.' }
		} catch (e) {
			return toFail(e)
		}
	},

	// Past the #165 role gate, per-record authorization is still deleteTimesheet's: the owner may
	// delete their own DRAFT/REJECTED, while HR/super act across their scope.
	delete: async (event) => {
		requireModify(event)
		const id = (await event.request.formData()).get('id') as string
		try {
			await deleteTimesheet(id, event.locals.user!.organizationId, ctxOf(event))
			return { saved: 'Timesheet deleted.' }
		} catch (e) {
			return toFail(e)
		}
	},

	// Submit each selected (draft) timesheet the current user owns; others are skipped.
	submitMany: async (event) => {
		requireModify(event)
		const user = event.locals.user!
		const myEmployee = await findSelfEmployee(user)
		if (!myEmployee) return fail(400, { error: 'No employee profile found' })
		const ids = String((await event.request.formData()).get('ids') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
		if (!ids.length) return fail(400, { error: 'No timesheets selected' })

		const ctx = ctxOf(event)
		let done = 0
		let skipped = 0
		for (const id of ids) {
			try {
				await submitTimesheet(id, myEmployee.id, ctx)
				done++
			} catch {
				skipped++
			}
		}
		return {
			saved: `Submitted ${done} timesheet${done === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}.`
		}
	},

	// Mass delete: delete each selected timesheet (authorized per item in deleteTimesheet).
	// Items the caller can't delete — not owned, or submitted/approved on a select-all — throw
	// and are counted as skipped rather than aborting the batch.
	deleteMany: async (event) => {
		requireModify(event)
		const ids = String((await event.request.formData()).get('ids') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
		if (!ids.length) return fail(400, { error: 'No timesheets selected' })

		const org = event.locals.user!.organizationId
		const ctx = ctxOf(event)
		let deleted = 0
		let skipped = 0
		for (const id of ids) {
			try {
				await deleteTimesheet(id, org, ctx)
				deleted++
			} catch {
				skipped++
			}
		}
		return {
			saved: `Deleted ${deleted} timesheet${deleted === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}.`
		}
	}
}

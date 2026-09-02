import { canAny } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import {
	customRangeError,
	isValidStandardPeriod,
	rangesOverlapInManila,
	utcMidnight
} from '$lib/utils/pay-periods'
import { buildApprovalChain } from './requests/routing'
import { canActOnStage, nextState, liveChain, timesheetSoD } from './approvals'
import { formatShortDate } from '$lib/utils/format'
import type { AuditContext } from './types'
import type { Prisma } from '@prisma/client'

// Create the maker-checker chain for a timesheet (#134). `makerUserId` set → that person is
// the maker, so MAKE completes now and the chain opens at VERIFY; `null` → MAKE stays pending
// for a branch HR/Manager to act on. Runs inside the submit transaction.
//
// Two lanes since #165 made /timesheets view-only for the Employee role (#214 decision: HR-as-
// maker is intended, NOT a bug — do not re-add a manager MAKE gate for HR-submitted sheets):
//   • Rank-and-file employee's sheet → HR submits on their behalf (`submitDraftByHr`, makerUserId
//     set) → MAKE auto-completes; VERIFY + APPROVE remain the oversight gates.
//   • Manager/HR's OWN sheet → they self-submit (`submitTimesheet`, makerUserId null) → MAKE
//     stays pending so a different checker reviews it. This path is still live, not dead code.
async function createTimesheetChain(
	tx: Prisma.TransactionClient,
	timesheetId: string,
	makerUserId: string | null
) {
	const { steps } = buildApprovalChain({ attempt: 1, makerUserId, decidedAt: new Date() })
	await tx.approvalStep.createMany({ data: steps.map((s) => ({ ...s, timesheetId })) })
}

interface TimesheetEntryInput {
	date: Date
	timeIn?: Date | null
	timeOut?: Date | null
	hoursWorked: number
	otHours?: number
	notes?: string
}

// Persist-shape for an entry row (fills defaults for the optional columns).
function entryData(e: TimesheetEntryInput) {
	return {
		date: e.date,
		timeIn: e.timeIn ?? null,
		timeOut: e.timeOut ?? null,
		hoursWorked: e.hoursWorked,
		otHours: e.otHours ?? 0,
		notes: e.notes
	}
}

interface TimesheetListParams {
	organizationId: string
	employeeId?: string
	/** List everyone except this employee (the managers' "team" table). */
	excludeEmployeeId?: string
	status?: string
}

function timesheetListWhere(params: TimesheetListParams) {
	return {
		employee: { organizationId: params.organizationId },
		...(params.employeeId && { employeeId: params.employeeId }),
		...(params.excludeEmployeeId && { employeeId: { not: params.excludeEmployeeId } }),
		...(params.status && { status: params.status as never })
	}
}

export async function countTimesheets(params: TimesheetListParams) {
	return db.timesheet.count({ where: timesheetListWhere(params) })
}

export async function listTimesheets(
	params: TimesheetListParams,
	pageArgs?: { skip: number; take: number }
) {
	return db.timesheet.findMany({
		where: timesheetListWhere(params),
		include: {
			employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
			entries: { orderBy: { date: 'asc' } }
		},
		orderBy: { periodStart: 'desc' },
		...(pageArgs && { skip: pageArgs.skip, take: pageArgs.take })
	})
}

export async function getTimesheet(id: string, organizationId: string) {
	const ts = await db.timesheet.findFirst({
		where: { id, employee: { organizationId } },
		include: {
			employee: { select: { id: true, firstName: true, lastName: true, reportsToId: true } },
			entries: { orderBy: { date: 'asc' } }
		}
	})
	if (!ts) error(404, 'Timesheet not found')
	return ts
}

/**
 * Authorize a mutation of `ts`: the owner may act on their own timesheet (callers apply the
 * status rules — e.g. draft-only); the HR ladder acts org-wide. A non-owner without a
 * management role is rejected. Returns whether the actor owns the timesheet.
 *
 * MANAGER used to be narrowed further, to its direct reports only. That was dropped: MANAGER
 * is the branch title for on-branch HR at JoJo Potato and Sweetleaf and carries the same
 * authority as HR_ADMIN, which is how every other surface already treats it — Team Timesheets
 * lists the whole org, and the aggregate panel and /attendance corrections clear
 * `requireMinRole('HR_ADMIN')` because both roles rank 2. Keeping the narrowing here only
 * meant a manager could create or aggregate a sheet and then be refused when syncing it,
 * and it failed outright for the many employees with no `reportsTo` set at all. Tenancy is
 * unaffected: `getTimesheet` scopes by organizationId before any of this runs.
 *
 * Exported so a caller that does side-effectful work of its own before replacing entries
 * (`?/syncAttendance` derives attendance first) can authorize up front rather than let the
 * write happen and the check refuse afterwards.
 */
export async function assertCanModifyTimesheet(ctx: AuditContext, ts: { employeeId: string }) {
	const actorEmployee = await db.employee.findFirst({
		where: { userId: ctx.actorId, organizationId: ctx.organizationId },
		select: { id: true }
	})
	const isOwner = actorEmployee?.id === ts.employeeId
	if (isOwner) return { isOwner: true }
	if (canAny(ctx.actorRoles, 'VIEW_TEAM')) return { isOwner: false }
	error(403, 'You can only modify your own timesheet')
}

/**
 * #163: the advisory-lock key serializing every writer of one EMPLOYEE's timesheets.
 *
 * #163 keyed it on the employee AND the period's Manila month, and was careful about which month:
 * never a bound derived from the widened `from`/`dayAfterEnd` query window, because `from` is one
 * day BEFORE the period start, so an Aug 1 range would key on July while an overlapping Aug 2 range
 * keys on August — two different locks, no serialization, and exactly the race the lock exists to
 * stop. That care was right, and the month is still not safe: #3 lets a period span two months, so
 * `13 May → 2 Jun` and an overlapping `1 Jun → 10 Jun` derive different months and hit the same
 * failure by a different route. There is no single month to key on once two are in play.
 *
 * Per-employee is the smallest key with no such degree of freedom (D3). One employee's timesheets
 * are written rarely and by few people, so serialising them costs nothing. Matches the shape of
 * `backupLockKey` (`server/backup/plan.ts`) and of `payrollRunLockKey`.
 */
export function timesheetLockKey(employeeId: string): string {
	return `timesheet:${employeeId}`
}

export async function createTimesheet(
	employeeId: string,
	periodStart: Date,
	periodEnd: Date,
	entries: TimesheetEntryInput[],
	ctx: AuditContext
) {
	// #3: a timesheet period may now cross a calendar-month boundary; the same-month rule is
	// replaced by a SIZE cap. The overlap guard below is Manila-day based and month-agnostic, so it
	// needs no change. `createTimesheetFromAttendance` has no gate of its own and inherits this one.
	// See createPayrollRun.
	const invalid = customRangeError(periodStart, periodEnd)
	if (invalid) error(400, invalid)

	// #163: payroll sums an employee's timesheets by containment, so two overlapping sheets
	// double-count the shared days' hours. Scoped to the employee, not the org. Fires only when at
	// least one side is a custom range, so today's standard-shape behaviour is untouched; the
	// same-start-day duplicate below stays the message for the standard case.
	//
	// MANILA calendar days, not raw timestamps and not UTC-truncated ones (S4): stored rows are not
	// guaranteed UTC-midnight — a sheet written from a PHT day boundary carries 16:00 / 15:59:59.999,
	// and 2026-08-09T16:00Z is August 10 in Manila. A raw comparison misses a genuinely shared day;
	// a UTC truncation invents one and refuses a legitimate save. The query below is only the cheap
	// coarse pass, widened by a day on each side; `rangesOverlapInManila` makes the decision.
	const day = 24 * 60 * 60 * 1000
	const from = new Date(utcMidnight(periodStart).getTime() - day)
	const dayAfterEnd = new Date(utcMidnight(periodEnd).getTime() + 2 * day)
	const totalHours = entries.reduce((sum, e) => sum + e.hoursWorked, 0)

	// One transaction, under the per-employee advisory lock: on their own the two checks and the
	// insert are check-then-act, so two concurrent saves of DIFFERENT but overlapping ranges both
	// read an empty conflict set and both insert — and `@@unique([employeeId, periodStart])` cannot
	// catch that, because their start days differ. The lock is transaction-scoped, so Postgres
	// releases it on commit or rollback and there is nothing to unlock.
	const ts = await db.$transaction(async (tx: Prisma.TransactionClient) => {
		const key = timesheetLockKey(employeeId)
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`

		const candidates = await tx.timesheet.findMany({
			where: {
				employeeId,
				periodStart: { lt: dayAfterEnd },
				periodEnd: { gte: from }
			},
			select: { id: true, periodStart: true, periodEnd: true }
		})
		const overlapping = candidates.filter((t) =>
			rangesOverlapInManila(periodStart, periodEnd, t.periodStart, t.periodEnd)
		)
		const allStandard =
			isValidStandardPeriod(periodStart, periodEnd) &&
			overlapping.every((t) => isValidStandardPeriod(t.periodStart, t.periodEnd))
		if (overlapping.length > 0 && !allStandard) {
			const hit =
				overlapping.find((t) => !isValidStandardPeriod(t.periodStart, t.periodEnd)) ??
				overlapping[0]
			error(
				409,
				`This range overlaps an existing timesheet (${formatShortDate(hit.periodStart)} – ${formatShortDate(hit.periodEnd)}).`
			)
		}

		const existing = await tx.timesheet.findUnique({
			where: { employeeId_periodStart: { employeeId, periodStart } }
		})
		if (existing) error(409, 'Timesheet for this period already exists')

		const created = await tx.timesheet.create({
			data: {
				employeeId,
				periodStart,
				periodEnd,
				totalHours,
				entries: { create: entries.map(entryData) }
			},
			include: { entries: true }
		})

		// #324: the audit row joins the transaction that already holds the lock and the insert, so
		// a failed audit write can no longer leave a new timesheet standing unrecorded. The advisory
		// lock above stays the first statement — nothing added here comes before it.
		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'Timesheet',
				entityId: created.id,
				newValue: { periodStart, periodEnd, totalHours }
			},
			tx
		)
		return created
	})

	return ts
}

/**
 * Replace a timesheet's entries and recompute its total (HR review edits). The HR ladder acts
 * org-wide; approved timesheets are locked. Runs in a transaction so the entries and total
 * stay consistent.
 */
export async function updateTimesheetEntries(
	id: string,
	organizationId: string,
	entries: TimesheetEntryInput[],
	ctx: AuditContext
) {
	const ts = await getTimesheet(id, organizationId)
	const { isOwner } = await assertCanModifyTimesheet(ctx, ts)
	// The owner may only change their own DRAFT (e.g. sync from attendance); managers/HR may edit
	// anything that isn't already APPROVED.
	if (isOwner && ts.status !== 'DRAFT') error(400, 'You can only edit your own draft timesheet')
	if (ts.status === 'APPROVED') error(400, 'Approved timesheets cannot be edited')

	const totalHours = entries.reduce((sum, e) => sum + e.hoursWorked, 0)

	// #324: the audit row joins the transaction that replaces the entries. The before-image is
	// re-read inside it rather than carried from the `getTimesheet` above, where two concurrent
	// edits both read the same pre-edit state and log the same oldValue.
	const updated = await db.$transaction(async (tx) => {
		const before = await tx.timesheet.findUniqueOrThrow({
			where: { id },
			select: { totalHours: true, _count: { select: { entries: true } } }
		})

		await tx.timesheetEntry.deleteMany({ where: { timesheetId: id } })
		const row = await tx.timesheet.update({
			where: { id },
			data: {
				totalHours,
				entries: {
					create: entries.map(entryData)
				}
			},
			include: { entries: { orderBy: { date: 'asc' } } }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Timesheet',
				entityId: id,
				oldValue: { entries: before._count.entries, totalHours: Number(before.totalHours) },
				newValue: { entries: entries.length, totalHours }
			},
			tx
		)
		return row
	})

	return updated
}

export async function submitTimesheet(id: string, employeeId: string, ctx: AuditContext) {
	const ts = await db.timesheet.findUnique({ where: { id } })
	if (!ts || ts.employeeId !== employeeId) error(404, 'Timesheet not found')
	if (ts.status !== 'DRAFT') error(400, 'Only draft timesheets can be submitted')

	const updated = await db.$transaction(async (tx) => {
		const ts2 = await tx.timesheet.update({
			where: { id },
			data: { status: 'SUBMITTED', submittedAt: new Date() }
		})
		// Self-submit lane (owner submits their own sheet). Post-#165 only Manager/HR reach
		// this — employees are view-only — so MAKE stays pending for a different checker (#134/#214).
		await createTimesheetChain(tx, id, null)

		// #324: the audit row joins the transaction that opens the approval chain — a failed audit
		// write must not leave a sheet SUBMITTED with no record of the submission.
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Timesheet',
				entityId: id,
				newValue: { status: 'SUBMITTED' }
			},
			tx
		)
		return ts2
	})

	return updated
}

/**
 * Delete a timesheet (entries cascade). The owner may delete their own DRAFT/REJECTED; the HR
 * ladder acts org-wide at any status. Deletion is explicit (confirmed in the UI), never automatic.
 */
export async function deleteTimesheet(id: string, organizationId: string, ctx: AuditContext) {
	const ts = await getTimesheet(id, organizationId)
	const { isOwner } = await assertCanModifyTimesheet(ctx, ts)
	// The owner may delete only their own DRAFT/REJECTED timesheet — not once it's submitted (under
	// review) or approved (locked). Managers/HR keep the broader scope handled by the guard.
	if (isOwner && ts.status !== 'DRAFT' && ts.status !== 'REJECTED')
		error(400, 'You can only delete your own draft timesheet')

	// #324: the delete and its audit row commit together. This is the one audit row that cannot be
	// reconstructed from the surviving data — the timesheet and its entries are gone — so a failed
	// audit write here destroyed the record outright.
	await db.$transaction(async (tx) => {
		await tx.timesheet.delete({ where: { id } })

		await writeAuditLog(
			ctx,
			{
				action: 'DELETE',
				entityType: 'Timesheet',
				entityId: id,
				oldValue: {
					periodStart: ts.periodStart,
					periodEnd: ts.periodEnd,
					status: ts.status,
					entries: ts.entries.length
				}
			},
			tx
		)
	})

	return { deleted: true }
}

/**
 * HR submits an aggregated draft on the employee's behalf. HR builds a draft from time
 * logs on /timesheets (they don't own it, so the owner-only `submitTimesheet` can't be
 * used); this moves it to SUBMITTED so it lands in the normal review queue — /timesheets
 * never approves in place. Only DRAFT timesheets are eligible. The update and its audit log
 * share one transaction.
 *
 * Org-scoped only — `getTimesheet` filters by organizationId, and the route gates the role.
 */
export async function submitDraftByHr(id: string, organizationId: string, ctx: AuditContext) {
	const ts = await getTimesheet(id, organizationId)
	if (ts.status !== 'DRAFT') error(400, 'Only draft timesheets can be submitted here')

	return db.$transaction(async (tx) => {
		// #324: the before-image is read inside the transaction that overwrites it. Carrying
		// `ts.status` down from the `getTimesheet` above let two concurrent submits log the same
		// oldValue; the `updateMany` guard below already makes DRAFT the only state that commits.
		const before = await tx.timesheet.findUniqueOrThrow({
			where: { id },
			select: { status: true }
		})

		// Re-check DRAFT inside the write itself — a concurrent submit or review between
		// the read above and this update must not be stomped back to SUBMITTED.
		const res = await tx.timesheet.updateMany({
			where: { id, status: 'DRAFT' },
			data: { status: 'SUBMITTED', submittedAt: new Date() }
		})
		if (res.count === 0) error(400, 'Only draft timesheets can be submitted here')
		// HR submits on the employee's behalf, so they are the maker — MAKE completes now
		// and the chain opens at VERIFY (#134). Intended since #165/#214, not a skipped gate.
		await createTimesheetChain(tx, id, ctx.actorId)

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Timesheet',
				entityId: id,
				oldValue: { status: before.status },
				newValue: { status: 'SUBMITTED', source: 'hr_submit_on_behalf' }
			},
			tx
		)

		return tx.timesheet.findUniqueOrThrow({ where: { id } })
	})
}

// Act on a timesheet's current maker-checker stage (#134). `approved` advances the chain
// (final APPROVE commits it); otherwise it returns to the maker with a required reason.
// Legacy timesheets submitted before the chain existed have no steps and fall back to the
// old direct manager review.
export async function reviewTimesheet(
	id: string,
	organizationId: string,
	approved: boolean,
	rejectionReason: string | undefined,
	ctx: AuditContext
) {
	const ts = await db.timesheet.findFirst({
		where: { id, employee: { organizationId } },
		include: { employee: { select: { reportsToId: true } }, approvalSteps: true }
	})
	if (!ts) error(404, 'Timesheet not found')
	if (ts.status !== 'SUBMITTED') error(400, 'Only submitted timesheets can be reviewed')

	// #75: separation of duties — nobody reviews their own timesheet.
	// #6: a null actor SKIPS this bar rather than failing it, which is safe because the target row
	// is independently org-scoped first — `employee: { organizationId }` at the findFirst above,
	// 404 if it misses. A cross-org actor can therefore never be this timesheet's owner.
	const actorEmployee = await db.employee.findFirst({
		where: { userId: ctx.actorId, organizationId },
		select: { id: true }
	})
	if (actorEmployee && actorEmployee.id === ts.employeeId) {
		error(403, 'You cannot review your own timesheet')
	}

	const live = liveChain(ts.approvalSteps)

	// Legacy fallback: a step-less timesheet reviews directly under the caller's org scope
	// (the route already required the reviewer role; the self-review guard is above).
	if (!live || !live.currentStep) {
		// #324: this legacy path is a second, separate write in this function — the chain path
		// below has its own transaction and does not cover it. The decision and its audit row
		// commit together here too: an approval that reaches payroll with no record of who
		// approved it is the worst version of this bug.
		return await db.$transaction(async (tx) => {
			const updated = await tx.timesheet.update({
				where: { id },
				data: {
					status: approved ? 'APPROVED' : 'REJECTED',
					reviewedAt: new Date(),
					reviewedById: ctx.actorId,
					rejectionReason: approved ? null : rejectionReason
				}
			})
			await writeAuditLog(
				ctx,
				{
					action: 'UPDATE',
					entityType: 'Timesheet',
					entityId: id,
					newValue: { status: updated.status, rejectionReason }
				},
				tx
			)
			return updated
		})
	}

	const step = live.currentStep
	if (
		!canActOnStage(
			step.stage,
			ctx.actorRoles,
			actorEmployee?.id ?? null,
			ts.employeeId,
			timesheetSoD(ctx.actorId, ts.approvalSteps, live.attempt)
		)
	) {
		error(403, 'You cannot act on this stage')
	}
	const decision = approved ? 'APPROVED' : 'RETURNED'
	if (!approved && !rejectionReason?.trim()) {
		error(400, 'A reason is required to return a timesheet')
	}

	const transition = nextState(live.currentStage, live.liveSteps.length, decision)
	const tsStatus =
		transition.status === 'APPROVED'
			? 'APPROVED'
			: transition.status === 'RETURNED' || transition.status === 'REJECTED'
				? 'REJECTED'
				: 'SUBMITTED'
	const settled = tsStatus !== 'SUBMITTED'

	const updated = await db.$transaction(async (tx) => {
		await tx.approvalStep.update({
			where: { id: step.id },
			data: {
				decision,
				actorId: ctx.actorId,
				note: approved ? null : (rejectionReason ?? null),
				decidedAt: new Date()
			}
		})
		const row = await tx.timesheet.update({
			where: { id },
			data: {
				status: tsStatus,
				...(settled ? { reviewedAt: new Date(), reviewedById: ctx.actorId } : {}),
				rejectionReason: tsStatus === 'REJECTED' ? (rejectionReason ?? null) : null
			}
		})

		// #324: the audit row joins the transaction that records the stage decision.
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Timesheet',
				entityId: id,
				newValue: { stage: step.stage, decision, status: tsStatus }
			},
			tx
		)
		return row
	})

	return updated
}

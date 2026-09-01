import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import { Prisma } from '@prisma/client'
import { AM_PM_MIN_GAP_CEILING, AM_PM_MIN_GAP_FLOOR, isValidAmPmMinGap } from './derive'
import type { AuditContext } from '../types'

/**
 * Work-schedule CRUD (Slice 4). A schedule holds a shift (start/end/break) applied to a set of
 * weekdays; weekdays without a row are rest days. Employees reference a schedule via
 * `Employee.workScheduleId`; unassigned employees fall back to the Mon–Fri default in the
 * attendance engine.
 */

export function listSchedules(organizationId: string) {
	return db.workSchedule.findMany({
		where: { organizationId },
		include: { days: { orderBy: { weekday: 'asc' } }, _count: { select: { employees: true } } },
		orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
	})
}

export async function createSchedule(
	organizationId: string,
	data: {
		name: string
		isDefault?: boolean
		trackTardiness?: boolean
		startMinutes: number
		endMinutes: number
		breakMinutes: number
		weekdays: number[]
	},
	ctx: AuditContext
) {
	if (data.endMinutes <= data.startMinutes) error(400, 'End time must be after start time')
	if (data.weekdays.length === 0) error(400, 'Select at least one working day')

	const schedule = await db.$transaction(async (tx: Prisma.TransactionClient) => {
		if (data.isDefault)
			await tx.workSchedule.updateMany({ where: { organizationId }, data: { isDefault: false } })
		return tx.workSchedule.create({
			data: {
				organizationId,
				name: data.name,
				isDefault: data.isDefault ?? false,
				trackTardiness: data.trackTardiness ?? true,
				days: {
					create: data.weekdays.map((weekday) => ({
						weekday,
						startMinutes: data.startMinutes,
						endMinutes: data.endMinutes,
						breakMinutes: data.breakMinutes
					}))
				}
			}
		})
	})

	await writeAuditLog(ctx, {
		action: 'CREATE',
		entityType: 'WorkSchedule',
		entityId: schedule.id,
		newValue: {
			name: data.name,
			weekdays: data.weekdays,
			startMinutes: data.startMinutes,
			endMinutes: data.endMinutes
		}
	})
	return schedule
}

/** Toggle the org-wide tardiness master switch (#190). ANDs with each schedule's own flag. */
export async function setOrgTardiness(organizationId: string, enabled: boolean, ctx: AuditContext) {
	await db.organization.update({
		where: { id: organizationId },
		data: { trackTardiness: enabled }
	})
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'Organization',
		entityId: organizationId,
		newValue: { trackTardiness: enabled }
	})
}

/**
 * Set (or clear, with null) the org's AM/PM boundary threshold in minutes (#162). Null restores
 * the built-in default. Bounds are enforced here as well as at the action, because this is the
 * only writer and a bad value silently re-splits every day in the tenant. `organizationId` is
 * always the session's own org, so the update is org-scoped by construction — never accept an
 * organization id from a form.
 */
export async function setOrgAmPmMinGap(
	organizationId: string,
	minutes: number | null,
	ctx: AuditContext
) {
	if (minutes !== null && !isValidAmPmMinGap(minutes))
		error(
			400,
			`The AM/PM gap must be a whole number of minutes between ${AM_PM_MIN_GAP_FLOOR} and ${AM_PM_MIN_GAP_CEILING}.`
		)

	await db.organization.update({
		where: { id: organizationId },
		data: { amPmMinGapMinutes: minutes }
	})
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'Organization',
		entityId: organizationId,
		newValue: { amPmMinGapMinutes: minutes }
	})
}

/** Toggle a schedule's tardiness tracking (#190). Org-scoped so it can't touch another tenant. */
export async function setScheduleTardiness(
	organizationId: string,
	id: string,
	enabled: boolean,
	ctx: AuditContext
) {
	const res = await db.workSchedule.updateMany({
		where: { id, organizationId },
		data: { trackTardiness: enabled }
	})
	if (res.count === 0) error(404, 'Schedule not found')

	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'WorkSchedule',
		entityId: id,
		newValue: { trackTardiness: enabled }
	})
}

/** Assign (or clear, with null) an employee's work schedule. */
export async function assignSchedule(
	employeeId: string,
	organizationId: string,
	scheduleId: string | null,
	ctx: AuditContext
) {
	const emp = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true }
	})
	if (!emp) error(404, 'Employee not found')
	if (scheduleId) {
		const s = await db.workSchedule.findFirst({
			where: { id: scheduleId, organizationId },
			select: { id: true }
		})
		if (!s) error(404, 'Work schedule not found')
	}
	await db.employee.update({ where: { id: employeeId }, data: { workScheduleId: scheduleId } })
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'Employee',
		entityId: employeeId,
		newValue: { workScheduleId: scheduleId }
	})
}

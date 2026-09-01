import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import { writeAuditLog } from '$lib/server/audit'
import type { AuditContext } from './types'

// ─── Additional supervisors (#176) ────────────────────────────────────────────
//
// An employee's primary manager stays on Employee.reportsToId; these helpers layer the
// extra superiors they also report to on top, so "my team" and manager views count someone
// under ANY of their supervisors — primary or additional.

/** Employee ids that report to `supervisorId`, whether as their primary or an additional. */
export async function listReportIdsFor(supervisorId: string): Promise<string[]> {
	const [direct, extra] = await Promise.all([
		db.employee.findMany({ where: { reportsToId: supervisorId }, select: { id: true } }),
		db.employeeSupervisor.findMany({ where: { supervisorId }, select: { employeeId: true } })
	])
	return [...new Set([...direct.map((d) => d.id), ...extra.map((e) => e.employeeId)])]
}

/** The additional supervisors recorded for an employee, with names, for the 201 file. */
export async function listAdditionalSupervisors(employeeId: string) {
	const rows = await db.employeeSupervisor.findMany({ where: { employeeId } })
	if (!rows.length) return []
	const supers = await db.employee.findMany({
		where: { id: { in: rows.map((r) => r.supervisorId) } },
		select: { id: true, firstName: true, lastName: true }
	})
	const byId = new Map(supers.map((s) => [s.id, s]))
	return rows
		.map((r) => byId.get(r.supervisorId))
		.filter((s): s is NonNullable<typeof s> => s != null)
		.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))
}

/**
 * Dedupe requested supervisor ids and drop the ones that can't apply: the employee
 * themselves (no self-supervision) and their primary manager (already reportsToId).
 */
export function sanitizeSupervisorIds(
	ids: string[],
	employeeId: string,
	primaryId: string | null
): string[] {
	return [...new Set(ids.filter(Boolean))].filter((id) => id !== employeeId && id !== primaryId)
}

/**
 * Replace an employee's additional supervisors. Each must be another active employee in the
 * org, never the employee themselves nor their primary manager (that's reportsToId already).
 */
export async function setAdditionalSupervisors(
	organizationId: string,
	employeeId: string,
	supervisorIds: string[],
	ctx: AuditContext
) {
	const employee = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true, reportsToId: true }
	})
	if (!employee) error(404, 'Employee not found')

	const clean = sanitizeSupervisorIds(supervisorIds, employeeId, employee.reportsToId)

	if (clean.length) {
		const valid = await db.employee.findMany({
			where: { id: { in: clean }, organizationId },
			select: { id: true }
		})
		if (valid.length !== clean.length)
			error(400, 'A selected supervisor is not in this organization')
	}

	// One transaction: a failed audit write must not leave a changed supervisor set standing
	// unrecorded.
	await db.$transaction(async (tx) => {
		await tx.employeeSupervisor.deleteMany({ where: { employeeId } })
		// An empty selection clears the list, so the deleteMany above is the whole change.
		if (clean.length) {
			await tx.employeeSupervisor.createMany({
				data: clean.map((supervisorId) => ({ employeeId, supervisorId }))
			})
		}

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Employee',
				entityId: employeeId,
				newValue: { additionalSupervisors: clean }
			},
			tx
		)
	})
}

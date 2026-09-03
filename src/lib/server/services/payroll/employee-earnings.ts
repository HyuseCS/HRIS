import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import type { EmployeeEarningKind } from '@prisma/client'
import { assertNotSelf, requireEmployee } from '../employee-access'
import type { AuditContext } from '../types'

/**
 * Recurring allowance/incentive assignments (#65). The payroll engine's ALLOWANCE and
 * INCENTIVE buckets are fed from these rows at compute time (prorated to the period) —
 * this just maintains the records HR sets up. All mutations are org-scoped and audited.
 */

export function listEmployeeEarnings(employeeId: string) {
	return db.employeeEarning.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' } })
}

export async function createEmployeeEarning(
	employeeId: string,
	organizationId: string,
	data: { kind: EmployeeEarningKind; label: string; monthlyAmount: number },
	ctx: AuditContext
) {
	assertNotSelf(ctx.actorId, await requireEmployee(employeeId, organizationId))
	if (data.monthlyAmount <= 0) error(400, 'Monthly amount must be positive')

	// One transaction: a failed audit write must not leave a recurring allowance standing
	// unrecorded — it pays out every period from here on.
	return await db.$transaction(async (tx) => {
		const earning = await tx.employeeEarning.create({
			data: {
				employeeId,
				kind: data.kind,
				label: data.label,
				monthlyAmount: data.monthlyAmount
			}
		})
		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'EmployeeEarning',
				entityId: earning.id,
				newValue: { kind: data.kind, label: data.label, monthlyAmount: data.monthlyAmount }
			},
			tx
		)
		return earning
	})
}

// Deactivate instead of delete so already-generated payslips keep their context.
export async function endEmployeeEarning(id: string, organizationId: string, ctx: AuditContext) {
	const earning = await db.employeeEarning.findFirst({
		where: { id, employee: { organizationId } },
		include: { employee: { select: { userId: true } } }
	})
	if (!earning) error(404, 'Recurring earning not found')
	assertNotSelf(ctx.actorId, earning.employee)
	if (!earning.isActive) error(409, 'Recurring earning is already ended')

	// One transaction: a failed audit write must not leave the earning ended with no record of
	// who ended it.
	return await db.$transaction(async (tx) => {
		const updated = await tx.employeeEarning.update({ where: { id }, data: { isActive: false } })
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'EmployeeEarning',
				entityId: id,
				newValue: { isActive: false }
			},
			tx
		)
		return updated
	})
}

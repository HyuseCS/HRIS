import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import { D, q2n, type MoneyLike } from './money'
import { type PayComponent } from './types'
import { assertNotSelf, requireEmployee } from '../employee-access'
import type { AuditContext } from '../types'

/**
 * Recurring custom-deduction assignments (#66). Each row references a DeductionType from
 * Settings → Pay Codes; the payroll engine applies the monthly amount prorated to the period
 * as a fixed deduction line. Statutory types are rejected — SSS/PhilHealth/Pag-IBIG/tax are
 * computed automatically and assigning them would double-deduct. All mutations are org-scoped
 * and audited.
 */

export function listEmployeeDeductions(employeeId: string) {
	return db.employeeDeduction.findMany({
		where: { employeeId },
		include: { deductionType: { select: { code: true, label: true } } },
		orderBy: { createdAt: 'desc' }
	})
}

export async function createEmployeeDeduction(
	employeeId: string,
	organizationId: string,
	data: { deductionTypeId: string; label?: string; monthlyAmount: number },
	ctx: AuditContext
) {
	assertNotSelf(ctx.actorId, await requireEmployee(employeeId, organizationId))
	if (data.monthlyAmount <= 0) error(400, 'Monthly amount must be positive')

	const type = await db.deductionType.findFirst({
		where: { id: data.deductionTypeId, organizationId }
	})
	if (!type) error(404, 'Deduction code not found')
	if (!type.isActive) error(400, 'Deduction code is inactive')
	if (type.isStatutory) error(400, 'Statutory deductions are computed automatically')

	const deduction = await db.employeeDeduction.create({
		data: {
			employeeId,
			deductionTypeId: type.id,
			label: data.label?.trim() || null,
			monthlyAmount: data.monthlyAmount
		}
	})
	await writeAuditLog(ctx, {
		action: 'CREATE',
		entityType: 'EmployeeDeduction',
		entityId: deduction.id,
		newValue: { code: type.code, label: data.label ?? null, monthlyAmount: data.monthlyAmount }
	})
	return deduction
}

// Deactivate instead of delete so already-generated payslips keep their context.
export async function endEmployeeDeduction(id: string, organizationId: string, ctx: AuditContext) {
	const deduction = await db.employeeDeduction.findFirst({
		where: { id, employee: { organizationId } },
		include: { employee: { select: { userId: true } } }
	})
	if (!deduction) error(404, 'Recurring deduction not found')
	// Ending one's own deduction cancels one's own repayment — the same self-dealing as granting a
	// raise, so it is guarded even though creating a deduction only ever costs the actor money.
	assertNotSelf(ctx.actorId, deduction.employee)
	if (!deduction.isActive) error(409, 'Recurring deduction is already ended')

	const updated = await db.employeeDeduction.update({ where: { id }, data: { isActive: false } })
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'EmployeeDeduction',
		entityId: id,
		newValue: { isActive: false }
	})
	return updated
}

/**
 * Map active assignments to engine deduction lines, prorated to the period like statutory.
 * Shared by computePayroll and the calculator preview so both stay identical.
 */
export function recurringDeductionComponents(
	rows: Array<{
		id: string
		label: string | null
		monthlyAmount: unknown
		deductionType: { code: string; label: string }
	}>,
	periodShare: number
): PayComponent[] {
	return rows.map((r) => ({
		code: r.deductionType.code,
		label: r.label ?? r.deductionType.label,
		amount: q2n(D(r.monthlyAmount as MoneyLike).times(periodShare)),
		taxable: false,
		refId: r.id
	}))
}

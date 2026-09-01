import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import type { LoanStatus } from '@prisma/client'
import { canAny } from '$lib/rbac'
import { assertCanTouchEmployee, assertNotSelf, requireEmployee } from '../employee-access'
import type { AuditContext } from '../types'

/**
 * Loan & cash-advance CRUD (PAY-019). Amortization itself (per-period installment, decrement at
 * lock, reverse on void) lives in the payroll engine + period lifecycle — this just maintains the
 * records HR sets up. All mutations are org-scoped and audited.
 */

/**
 * Separation of duties + reporting-line scope for every loan/cash-advance write.
 *
 * The four writers previously carried `assertNotSelf` on the creates and nothing but an org filter
 * on the updates, while the scope check lived one layer up in the employee page's
 * `scopedToEmployee` wrapper — so the v1 API twins reached any employee in the organization.
 * Confirmed live: a MANAGER whose only report is one other employee PATCHed an unrelated
 * employee's installment to 999 and got a 200. Updates additionally let an actor edit their OWN
 * loan, which is the self-dealing #243 closed for compensation.
 *
 * `VIEW_PAY_ORGWIDE` rather than `ADMINISTER_HR_ORGWIDE` for the unrestricted arm, and checked
 * BEFORE delegating, for the reason spelled out on `listVisiblePayEmployeeIds`: PAYROLL_OFFICER and
 * FINANCE hold neither `ADMINISTER_HR_ORGWIDE` nor a reporting line, so `canTouchEmployee` alone
 * would lock the two roles that exist to administer pay out of every loan. Same shape as
 * `overridePayrollEntry` (`./index.ts:547`).
 *
 * In the service, not the routes, so the page action and the API twin cannot disagree.
 */
async function assertMayWriteLoan(
	employeeId: string,
	organizationId: string,
	ctx: AuditContext
): Promise<void> {
	assertNotSelf(ctx.actorId, await requireEmployee(employeeId, organizationId))
	if (!canAny(ctx.actorRoles, 'VIEW_PAY_ORGWIDE')) {
		// ponytail: `roles` is a no-op here today — the arm above already admits every
		// ADMINISTER_HR_ORGWIDE holder, so the delegation can only ever see an actor who holds
		// neither capability. Passed anyway so reordering the two arms cannot silently reintroduce
		// the single-role bug.
		await assertCanTouchEmployee(
			{ id: ctx.actorId, roles: ctx.actorRoles, organizationId },
			employeeId
		)
	}
}

export function listLoans(employeeId: string, organizationId: string) {
	return db.loan.findMany({
		where: { employeeId, employee: { organizationId } },
		orderBy: { createdAt: 'desc' }
	})
}

export function listCashAdvances(employeeId: string, organizationId: string) {
	return db.cashAdvance.findMany({
		where: { employeeId, employee: { organizationId } },
		orderBy: { createdAt: 'desc' }
	})
}

export async function createLoan(
	employeeId: string,
	organizationId: string,
	data: { type?: string; principal: number; installment: number },
	ctx: AuditContext
) {
	await assertMayWriteLoan(employeeId, organizationId, ctx)
	if (data.installment <= 0 || data.principal <= 0)
		error(400, 'Principal and installment must be positive')

	const loan = await db.loan.create({
		data: {
			employeeId,
			type: data.type,
			principal: data.principal,
			balance: data.principal,
			installment: data.installment,
			status: 'ACTIVE'
		}
	})
	await writeAuditLog(ctx, {
		action: 'CREATE',
		entityType: 'Loan',
		entityId: loan.id,
		newValue: { type: data.type, principal: data.principal, installment: data.installment }
	})
	return loan
}

export async function updateLoan(
	id: string,
	organizationId: string,
	data: { installment?: number; status?: LoanStatus },
	ctx: AuditContext
) {
	const loan = await db.loan.findFirst({ where: { id, employee: { organizationId } } })
	if (!loan) error(404, 'Loan not found')
	await assertMayWriteLoan(loan.employeeId, organizationId, ctx)

	const updated = await db.loan.update({ where: { id }, data })
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'Loan',
		entityId: id,
		newValue: data as Record<string, unknown>
	})
	return updated
}

export async function createCashAdvance(
	employeeId: string,
	organizationId: string,
	data: { amount: number; installment: number },
	ctx: AuditContext
) {
	await assertMayWriteLoan(employeeId, organizationId, ctx)
	if (data.installment <= 0 || data.amount <= 0)
		error(400, 'Amount and installment must be positive')

	const ca = await db.cashAdvance.create({
		data: {
			employeeId,
			amount: data.amount,
			balance: data.amount,
			installment: data.installment,
			status: 'ACTIVE'
		}
	})
	await writeAuditLog(ctx, {
		action: 'CREATE',
		entityType: 'CashAdvance',
		entityId: ca.id,
		newValue: { amount: data.amount, installment: data.installment }
	})
	return ca
}

export async function updateCashAdvance(
	id: string,
	organizationId: string,
	data: { installment?: number; status?: LoanStatus },
	ctx: AuditContext
) {
	const ca = await db.cashAdvance.findFirst({
		where: { id, employee: { organizationId } }
	})
	if (!ca) error(404, 'Cash advance not found')
	await assertMayWriteLoan(ca.employeeId, organizationId, ctx)

	const updated = await db.cashAdvance.update({ where: { id }, data })
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'CashAdvance',
		entityId: id,
		newValue: data as Record<string, unknown>
	})
	return updated
}

import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { sum } from './money'
import { voidedOwnApproval } from './audit-markers'
import { reverseAmortization } from './amortization'
import type { Prisma } from '@prisma/client'
import type { AuditContext } from '../types'

/**
 * A payslip is visible to the employee when the run is legacy-`APPROVED` (old flow) OR its
 * PayrollPeriod is `RELEASED` (new lifecycle). Use `payslipVisibleRunFilter` in Prisma `where`
 * clauses and `isPayslipVisible` for in-memory checks.
 */
export const payslipVisibleRunFilter = {
	OR: [{ status: 'APPROVED' as const }, { period: { status: 'RELEASED' as const } }]
}

export function isPayslipVisible(run: {
	status: string
	period?: { status: string } | null
}): boolean {
	return run.status === 'APPROVED' || run.period?.status === 'RELEASED'
}

export async function listRuns(organizationId: string, filters?: { status?: string }) {
	return db.payrollRun.findMany({
		where: {
			organizationId,
			...(filters?.status && {
				status: filters.status as 'DRAFT' | 'COMPUTED' | 'APPROVED' | 'VOIDED'
			})
		},
		include: {
			_count: { select: { entries: true } }
		},
		orderBy: { createdAt: 'desc' }
	})
}

/**
 * #249: `visibleEmployeeIds` restricts which entries come back (`null`/omitted = all). The API twin
 * of the run-detail page, and MANAGE_PAYROLL holds MANAGER — so this returned every employee's
 * gross and net to a branch manager exactly as the page did. Same allow-list, from
 * `listVisiblePayEmployeeIds`, so the two surfaces cannot disagree.
 */
export async function getRunWithEntries(
	id: string,
	organizationId: string,
	visibleEmployeeIds?: string[] | null
) {
	const run = await db.payrollRun.findFirst({
		where: { id, organizationId },
		include: {
			entries: {
				...(visibleEmployeeIds != null && {
					where: { employeeId: { in: visibleEmployeeIds } }
				}),
				include: {
					employee: {
						select: {
							firstName: true,
							lastName: true,
							employeeNumber: true
						}
					}
				},
				orderBy: { employee: { lastName: 'asc' } }
			}
		}
	})
	if (!run) error(404, 'Payroll run not found')
	if (visibleEmployeeIds == null) return run
	// The stored totals are ORG-WIDE. Filtering the entries and returning them unchanged would hand
	// a scoped caller the organization's whole payroll cost beside their own two rows — the leak
	// this scoping exists to close, surviving in the aggregate. `getPayrollRun` does the same for
	// the page; caught here by reading the endpoint's actual response, which the unit tests could
	// not, because they assert on the query rather than on what ships.
	return {
		...run,
		totalGross: sum(run.entries.map((e) => e.grossPay)),
		totalDeductions: sum(run.entries.map((e) => e.totalDeductions)),
		totalNet: sum(run.entries.map((e) => e.netPay))
	}
}

// `approveRun` lived here: a second approve implementation that wrote `status: 'APPROVED'` directly,
// gated on MANAGE_PAYROLL (which holds MANAGER) and skipping the #134 chain entirely — no stage
// capability, no separation of duties, and the run's approval step left open on an approved run.
// Deleted; `decidePayrollRun` in `../approvals` is the one approve path for both the UI action and
// the v1 API. Its flagged-entry `overrideNote` went with it: no UI ever supplied one, and silently
// approving flagged entries is the opposite of what the flag is for.

/** Run void vs period void — what each one does and does not reverse: `docs/payroll-void-semantics.md`. */
export async function voidRun(id: string, organizationId: string, ctx: AuditContext) {
	requireAnyCapability(ctx.actorRoles, 'OVERRIDE_FINALIZED')

	// One transaction: a crash between the reversal and the status flip would otherwise leave a
	// VOIDED run with half its balances credited back. The audit write joins it too — a void that
	// is not findable is the whole defect #298 exists to close, so it must not survive alone.
	const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
		// #5: the prior state is read INSIDE the transaction. Read outside it, two concurrent voids
		// log the same `oldValue`, and worse — `wasLocked` decides whether the amortization is
		// reversed, so a period locked between the read and the claim reverses nothing at all.
		const run = await tx.payrollRun.findFirst({
			where: { id, organizationId },
			include: { period: true }
		})
		if (!run) error(404, 'Payroll run not found')
		// Only an already-VOIDED run is refused: it was never meaningful to void, and voiding it twice
		// would credit the amortization back a SECOND time. DRAFT and APPROVED voids stay allowed
		// deliberately — refusing them would newly block somebody who can act today (#298 AC-7.4).
		if (run.status === 'VOIDED') error(400, 'Payroll run is already voided')

		// `period` is optional on PayrollRun (schema: `periodId String?`, `period PayrollPeriod?`), and
		// period-less runs exist in real data. Amortization is only ever applied at a period lock, so a
		// run with no period has nothing to reverse: `wasLocked` is false and the reversal is skipped.
		// The void itself still succeeds — refusing it would newly block a caller (AC-7.4).
		const wasLocked = run.period?.status === 'LOCKED' || run.period?.status === 'RELEASED'

		// Compare-and-set. The status check above is only preliminary: two concurrent voids would
		// both pass it and both call `reverseAmortization`, crediting the instalment back TWICE —
		// exactly the double-credit the already-voided refusal exists to prevent.
		const claimed = await tx.payrollRun.updateMany({
			where: { id, status: { not: 'VOIDED' } },
			data: { status: 'VOIDED' }
		})
		if (claimed.count === 0) error(400, 'Payroll run is already voided')

		if (wasLocked) await reverseAmortization(tx, id)

		await writeAuditLog(
			ctx,
			{
				action: 'PAYROLL_VOID',
				entityType: 'PayrollRun',
				entityId: id,
				oldValue: { status: run.status },
				newValue: {
					status: 'VOIDED',
					// The period is passed too: since #298 stopped `lock()` writing `approvedById`, a run
					// that was locked but never approved has a null `approvedById`, so checking the run
					// alone would miss the commonest same-actor void of all — the person who locked the
					// period voiding its run. Proven live: that case marked absent until the period was
					// passed here.
					...(voidedOwnApproval(ctx.actorId, run, run.period) && { sameActorAsApprover: true })
				}
			},
			tx
		)

		return tx.payrollRun.findUniqueOrThrow({ where: { id } })
	})

	return updated
}

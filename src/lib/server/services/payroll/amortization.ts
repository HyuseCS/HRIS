import { D, sum } from './money'
import { error } from '@sveltejs/kit'
import type { Prisma } from '@prisma/client'

/**
 * Reverse the loan/cash-advance amortization committed at LOCK, for one payroll run.
 *
 * Lifted verbatim out of `voidPeriod` (#298 D10) so `voidRun` and `voidPeriod` share one
 * implementation instead of drifting apart. It takes the CALLER's transaction client and opens
 * none of its own, and it writes NO status of any kind — the caller owns both the transaction
 * boundary and the run/period status flips. See `docs/payroll-void-semantics.md`.
 *
 * Both arms are true inverses: each reverses the PAYMENT ROWS lock wrote, never the frozen
 * deduction line. #309 fixed the cash-advance arm, which used to credit back the uncapped frozen
 * `d.amount` and force `status: 'ACTIVE'` — measured live at ₱300 returned against ₱100 collected.
 * The `cash_advance_payments` ledger added there is the mirror of `loan_payments`.
 *
 * Consequence: an advance amortized by a payroll LOCKED before that ledger existed has no rows to
 * reverse, so voiding it now credits back nothing instead of too much. No such payroll exists —
 * see the #309 note in `docs/payroll-void-semantics.md`.
 */
export async function reverseAmortization(
	tx: Prisma.TransactionClient,
	runId: string
): Promise<void> {
	// Reverse the amortization committed at lock.
	const entries = await tx.payrollEntry.findMany({
		where: { payrollRunId: runId },
		include: { deductions: true }
	})
	for (const entry of entries) {
		for (const d of entry.deductions) {
			// #119: balances stay in exact decimal — no Number() round-trip. Both operands are
			// scale-2 at rest, so decrements introduce no drift and the running balance stays
			// reconcilable against the original principal.
			const amount = D(d.amount)
			if (amount.lte(0) || !d.refId) continue
			if (d.code === 'LOAN') {
				// Reverse what was actually applied, not the frozen deduction line. Lock
				// re-caps against the live balance, so the two can differ; the payment
				// rows are the record of what really moved. Reversing `d.amount` blind
				// would credit back money that was never collected.
				const payments = await tx.loanPayment.findMany({
					where: { loanId: d.refId, payrollEntryId: entry.id },
					select: { amount: true }
				})
				const reversal = sum(payments.map((p) => p.amount))
				const loan = await tx.loan.findUnique({ where: { id: d.refId } })
				if (loan && reversal.gt(0)) {
					const restored = D(loan.balance).plus(reversal)
					// Conditional on the balance we just read, mirroring the guarded decrement in
					// `lock()` (periods.ts). A blind update would silently discard a concurrent
					// payment against the same loan; refusing makes the caller retry instead.
					const res = await tx.loan.updateMany({
						where: { id: d.refId, balance: loan.balance },
						// Only reopen a loan the reversal actually un-pays; a loan settled
						// by some other payment stays PAID.
						data: { balance: restored, status: restored.gt(0) ? 'ACTIVE' : loan.status }
					})
					if (res.count === 0) {
						error(409, 'A loan balance changed while voiding — nothing was reversed, retry')
					}
				}
				await tx.loanPayment.deleteMany({
					where: { loanId: d.refId, payrollEntryId: entry.id }
				})
			} else if (d.code === 'CASH_ADVANCE') {
				// #309: identical to the loan arm above, for the same reason — reverse the
				// recorded payments, never the frozen line.
				const payments = await tx.cashAdvancePayment.findMany({
					where: { cashAdvanceId: d.refId, payrollEntryId: entry.id },
					select: { amount: true }
				})
				const reversal = sum(payments.map((p) => p.amount))
				const ca = await tx.cashAdvance.findUnique({ where: { id: d.refId } })
				if (ca && reversal.gt(0)) {
					const restored = D(ca.balance).plus(reversal)
					const res = await tx.cashAdvance.updateMany({
						where: { id: d.refId, balance: ca.balance },
						// Only reopen an advance the reversal actually un-pays; one settled by
						// some other payment stays PAID.
						data: { balance: restored, status: restored.gt(0) ? 'ACTIVE' : ca.status }
					})
					if (res.count === 0) {
						error(409, 'A cash-advance balance changed while voiding — nothing was reversed, retry')
					}
				}
				await tx.cashAdvancePayment.deleteMany({
					where: { cashAdvanceId: d.refId, payrollEntryId: entry.id }
				})
			}
		}
	}
}

import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import { Prisma } from '@prisma/client'
import {
	assertCustomRangeClearOfCutoff,
	assertNoOverlappingRun,
	computePayroll,
	lockPayrollMonth
} from './index'
import { voidedOwnApproval } from './audit-markers'
import { D, q2 } from './money'
import { reverseAmortization } from './amortization'
import { deriveRange, lockRange } from '../attendance'
import { customRangeError } from '$lib/utils/pay-periods'
import { notifyMany } from '../notifications'
import { requireAnyCapability } from '$lib/server/rbac'
import { formatShortDate } from '$lib/utils/format'
import type { AuditContext } from '../types'

/**
 * Payroll period lifecycle (PAY-010): OPEN → IMPORTED → GENERATED → LOCKED → RELEASED (+ VOIDED).
 * A PayrollPeriod wraps a single PayrollRun. Loan/cash-advance balances are decremented at LOCK
 * (using the itemized LOAN/CASH_ADVANCE deduction lines as the source of truth) and reversed on VOID,
 * so compute/generate stays freely re-runnable and the mutation happens exactly once.
 */

async function requirePeriod(id: string, organizationId: string) {
	const period = await db.payrollPeriod.findFirst({
		where: { id, organizationId },
		include: { runs: true }
	})
	if (!period) error(404, 'Payroll period not found')
	return period
}

export async function listPeriods(organizationId: string) {
	return db.payrollPeriod.findMany({
		where: { organizationId },
		include: { runs: { select: { id: true, status: true, totalNet: true } } },
		orderBy: { startDate: 'desc' }
	})
}

export async function openPeriod(
	organizationId: string,
	input: {
		name: string
		startDate: Date
		endDate: Date
		cutoff?: number
	},
	ctx: AuditContext
) {
	// #3: a range may now cross a calendar-month boundary; the same-month rule is replaced by a
	// SIZE cap. One service, two callers — the form action and the v1 API twin both land here, so
	// there is no second gate to keep in sync. See createPayrollRun.
	const invalid = customRangeError(input.startDate, input.endDate)
	if (invalid) error(400, invalid)

	const period = await db.$transaction(async (tx: Prisma.TransactionClient) => {
		// Same org-month advisory lock `createPayrollRun` takes, keyed identically, so the two write
		// paths serialize against each other. Both checks below now run inside it; when either
		// throws, the transaction rolls back and NEITHER row is written.
		await lockPayrollMonth(tx, organizationId, input.startDate)

		// S1: kept ahead of the overlap guard — a VOIDED run keeps its row and its unique constraint,
		// and the guard skips VOIDED, so without this the recreate would raise a raw Prisma P2002
		// and surface as a 500.
		const existing = await tx.payrollRun.findUnique({
			where: {
				organizationId_periodStart_periodEnd: {
					organizationId,
					periodStart: input.startDate,
					periodEnd: input.endDate
				}
			}
		})
		if (existing) error(409, 'A payroll run for this period already exists')

		await assertNoOverlappingRun(organizationId, input.startDate, input.endDate, tx)
		await assertCustomRangeClearOfCutoff(organizationId, input.startDate, input.endDate, tx)

		const p = await tx.payrollPeriod.create({
			data: {
				organizationId,
				name: input.name,
				startDate: input.startDate,
				endDate: input.endDate,
				cutoff: input.cutoff
			}
		})
		await tx.payrollRun.create({
			data: {
				organizationId,
				periodId: p.id,
				periodStart: input.startDate,
				periodEnd: input.endDate
			}
		})
		// #5: the audit row commits with the period it records.
		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'PayrollPeriod',
				entityId: p.id,
				newValue: { name: input.name, startDate: input.startDate, endDate: input.endDate }
			},
			tx
		)

		return p
	})

	return period
}

export async function importAttendance(id: string, organizationId: string, ctx: AuditContext) {
	const period = await requirePeriod(id, organizationId)
	if (period.status !== 'OPEN') error(400, `Cannot import into a ${period.status} period`)

	// Derive AttendanceDay records from punches for the period, then lock them so payroll reads a fixed set.
	const range = { from: period.startDate, to: period.endDate }
	await deriveRange(organizationId, range, ctx)
	await lockRange(organizationId, range, ctx)

	// #5: the status flip and its audit row commit together. `deriveRange`/`lockRange` stay outside
	// — they are long-running and already audited in their own right.
	return await db.$transaction(async (tx: Prisma.TransactionClient) => {
		const updated = await tx.payrollPeriod.update({ where: { id }, data: { status: 'IMPORTED' } })
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PayrollPeriod',
				entityId: id,
				newValue: { status: 'IMPORTED' }
			},
			tx
		)
		return updated
	})
}

export async function generate(id: string, organizationId: string, ctx: AuditContext) {
	const period = await requirePeriod(id, organizationId)
	if (!['OPEN', 'IMPORTED', 'GENERATED'].includes(period.status)) {
		error(400, `Cannot generate a ${period.status} period`)
	}
	const run = period.runs[0]
	if (!run) error(400, 'Period has no payroll run')

	// Reset to DRAFT so re-generation recomputes cleanly.
	if (run.status !== 'DRAFT') {
		await db.payrollRun.update({ where: { id: run.id }, data: { status: 'DRAFT' } })
	}
	await computePayroll(run.id, organizationId, ctx)

	// #5: the status flip and its audit row commit together. `computePayroll` stays outside — it is
	// the long-running engine pass and writes its own audit row.
	return await db.$transaction(async (tx: Prisma.TransactionClient) => {
		const updated = await tx.payrollPeriod.update({ where: { id }, data: { status: 'GENERATED' } })
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PayrollPeriod',
				entityId: id,
				newValue: { status: 'GENERATED' }
			},
			tx
		)
		return updated
	})
}

export async function lock(
	id: string,
	organizationId: string,
	ctx: AuditContext,
	overrideNote?: string
) {
	const period = await requirePeriod(id, organizationId)
	if (period.status !== 'GENERATED')
		error(400, `Only a GENERATED period can be locked (is ${period.status})`)
	const run = period.runs[0]
	if (!run) error(400, 'Period has no payroll run')

	const entries = await db.payrollEntry.findMany({
		where: { payrollRunId: run.id },
		include: { deductions: true }
	})
	const flaggedCount = entries.filter((e) => e.isFlagged).length
	if (flaggedCount > 0 && !overrideNote) {
		error(
			409,
			`${flaggedCount} flagged entr${flaggedCount === 1 ? 'y' : 'ies'} — an override note is required to lock`
		)
	}

	await db.$transaction(async (tx: Prisma.TransactionClient) => {
		// Claim the period atomically, BEFORE touching any balance. The status check above
		// is a read outside this transaction, so on its own it is check-then-act: two
		// concurrent locks (a double-click, a retried request) both passed it and both ran
		// the decrement loop, subtracting twice. This conditional update is the real gate —
		// exactly one caller can move GENERATED → LOCKED, and the loser aborts the whole
		// transaction before any money moves.
		const claimed = await tx.payrollPeriod.updateMany({
			where: { id, status: 'GENERATED' },
			// #298: `lockedById` is written HERE, inside the claim — who and when are stamped by
			// the single caller that wins the race. A second statement would let the loser of the
			// race stamp its name onto a lock it did not perform.
			data: { status: 'LOCKED', lockedAt: new Date(), lockedById: ctx.actorId }
		})
		if (claimed.count === 0) {
			error(409, 'This period is already being locked or is no longer GENERATED')
		}

		// Commit loan / cash-advance amortization from the itemized deduction lines.
		for (const entry of entries) {
			for (const d of entry.deductions) {
				// #119: balances stay in exact decimal — no Number() round-trip. Both operands are
				// scale-2 at rest, so decrements introduce no drift and the running balance stays
				// reconcilable against the original principal.
				const amount = D(d.amount)
				if (amount.lte(0) || !d.refId) continue
				if (d.code === 'LOAN') {
					const loan = await tx.loan.findUnique({ where: { id: d.refId } })
					if (!loan) continue

					// `amount` was frozen into the deduction line at compute time, capped
					// against the balance as it stood then. Re-cap against the live balance:
					// if the borrower paid the loan down in between, the frozen figure would
					// over-collect and drive the balance negative.
					const liveBalance = D(loan.balance)
					const applied = q2(amount.lt(liveBalance) ? amount : liveBalance)
					if (applied.lte(0)) continue

					// One payment per (loan, payroll entry) — the DB unique constraint makes
					// this the idempotency key, so a replayed lock cannot double-apply even
					// if it somehow gets past the claim above.
					try {
						await tx.loanPayment.create({
							data: { loanId: d.refId, payrollEntryId: entry.id, amount: applied }
						})
					} catch (e) {
						if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue
						throw e
					}

					// Conditional on the balance we just read: if a concurrent writer changed
					// it, count is 0 and we abort rather than clobbering their write. Plain
					// `update` here was a read-modify-write and lost updates under the default
					// READ COMMITTED isolation.
					const newBalance = liveBalance.minus(applied)
					const res = await tx.loan.updateMany({
						where: { id: d.refId, balance: loan.balance },
						data: { balance: newBalance, status: newBalance.lte(0) ? 'PAID' : loan.status }
					})
					if (res.count === 0) {
						error(409, 'A loan balance changed while locking — nothing was committed, retry')
					}
				} else if (d.code === 'CASH_ADVANCE') {
					const ca = await tx.cashAdvance.findUnique({ where: { id: d.refId } })
					if (!ca) continue

					// `amount` is the frozen deduction line; re-cap it against the live balance
					// exactly as the loan arm does.
					const liveBalance = D(ca.balance)
					const applied = q2(amount.lt(liveBalance) ? amount : liveBalance)
					if (applied.lte(0)) continue

					// #309: record what was ACTUALLY taken. The void reverses these rows, so a
					// capped payment can no longer be credited back at the uncapped figure. The
					// unique key on (advance, entry) makes a replayed lock a no-op.
					try {
						await tx.cashAdvancePayment.create({
							data: { cashAdvanceId: d.refId, payrollEntryId: entry.id, amount: applied }
						})
					} catch (e) {
						if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue
						throw e
					}

					const newBalance = liveBalance.minus(applied)
					const res = await tx.cashAdvance.updateMany({
						where: { id: d.refId, balance: ca.balance },
						data: { balance: newBalance, status: newBalance.lte(0) ? 'PAID' : ca.status }
					})
					if (res.count === 0) {
						error(
							409,
							'A cash-advance balance changed while locking — nothing was committed, retry'
						)
					}
				}
			}
		}

		// Record any override on the run. The lock records NO approver (#298) — who locked lives
		// on `PayrollPeriod.lockedById`; writing `approvedById` here made the field mean "approver
		// or locker, last write wins". And still DO NOT flip run.status to APPROVED — payslip
		// visibility is gated on the PERIOD being RELEASED, and the LOCKED period already blocks
		// re-generation. Keeping the run COMPUTED keeps the two flows distinct.
		if (overrideNote) {
			await tx.payrollRun.update({
				where: { id: run.id },
				data: { hasOverride: true, overrideNote }
			})
		}

		// #5: the audit row joins the same transaction as the claim and the balance decrements. A
		// lock that moved money but is not findable is exactly what this trail exists to prevent.
		await writeAuditLog(
			ctx,
			{
				action: overrideNote ? 'PAYROLL_OVERRIDE' : 'UPDATE',
				entityType: 'PayrollPeriod',
				entityId: id,
				// #298: `lockedById` is a plain FACT key, always present — a lock is not an override.
				newValue: {
					status: 'LOCKED',
					lockedById: ctx.actorId,
					...(overrideNote ? { overrideNote } : {})
				}
			},
			tx
		)
	})

	return db.payrollPeriod.findUnique({ where: { id } })
}

export async function release(id: string, organizationId: string, ctx: AuditContext) {
	const period = await requirePeriod(id, organizationId)
	if (period.status !== 'LOCKED')
		error(400, `Only a LOCKED period can be released (is ${period.status})`)

	// Claim the release the same way `lock()` claims the lock. Two concurrent releases would
	// otherwise both succeed, and the loser's `releasedAt` would overwrite the winner's — which
	// since #298 is the date printed on every payslip in the period (PAYDATE). #5: the claim, its
	// read-back and the audit row now share one transaction — a failed audit write must not leave
	// the release standing unrecorded.
	const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
		const claimed = await tx.payrollPeriod.updateMany({
			where: { id, status: 'LOCKED' },
			data: { status: 'RELEASED', releasedAt: new Date(), releasedById: ctx.actorId }
		})
		if (claimed.count === 0) error(409, 'The period was already released or changed — nothing done')
		const row = await tx.payrollPeriod.findUniqueOrThrow({ where: { id } })
		await writeAuditLog(
			ctx,
			{
				// #298: `releasedById` is a plain FACT key, always present — a release is not an override,
				// so this is never a marker. It is the copy a reveal can read back if the row is later
				// edited by hand.
				action: 'UPDATE',
				entityType: 'PayrollPeriod',
				entityId: id,
				newValue: { status: 'RELEASED', releasedById: ctx.actorId }
			},
			tx
		)
		return row
	})

	// Notify every employee with a payslip in this period that it's now available (#169).
	// Best-effort — a notifier failure must not undo the release.
	try {
		const runIds = period.runs.map((r) => r.id)
		if (runIds.length) {
			const entries = await db.payrollEntry.findMany({
				where: { payrollRunId: { in: runIds } },
				select: { employee: { select: { userId: true } } }
			})
			const userIds = [...new Set(entries.map((e) => e.employee.userId))]
			const label = `${formatShortDate(period.startDate)}–${formatShortDate(period.endDate)}`
			await notifyMany(userIds, `Your payslip for ${label} is available.`, '/payslips', 'PAYSLIP')
		}
	} catch (e) {
		console.error('[NOTIFY] Failed to notify payslip release for period', id, e)
	}

	return updated
}

/** Run void vs period void — what each one does and does not reverse: `docs/payroll-void-semantics.md`. */
export async function voidPeriod(id: string, organizationId: string, ctx: AuditContext) {
	// Voiding a finalized period is Super-Admin-only (#224) — enforced here, not just at the route,
	// so the form action and the v1 API twin are covered by one check, as `voidRun` already is.
	requireAnyCapability(ctx.actorRoles, 'OVERRIDE_FINALIZED')

	const period = await requirePeriod(id, organizationId)
	if (period.status === 'VOIDED') error(400, 'Period is already voided')
	const run = period.runs[0]
	const wasLocked = period.status === 'LOCKED' || period.status === 'RELEASED'

	await db.$transaction(async (tx: Prisma.TransactionClient) => {
		// Compare-and-set, same reason as `voidRun`: the status read above is preliminary, and two
		// concurrent voids would otherwise both reverse the amortization and credit it back twice.
		const claimed = await tx.payrollPeriod.updateMany({
			where: { id, status: { not: 'VOIDED' } },
			data: { status: 'VOIDED' }
		})
		if (claimed.count === 0) error(400, 'Period is already voided')

		if (run && wasLocked) await reverseAmortization(tx, run.id)
		if (run) await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'VOIDED' } })

		// Inside the transaction: a void that is not findable in the audit log is the defect #298
		// exists to close, so the marker must never outlive — or be outlived by — the void itself.
		await writeAuditLog(
			ctx,
			{
				action: 'PAYROLL_VOID',
				entityType: 'PayrollPeriod',
				entityId: id,
				newValue: {
					status: 'VOIDED',
					...(voidedOwnApproval(ctx.actorId, run, period) && { sameActorAsApprover: true })
				}
			},
			tx
		)
	})
	return db.payrollPeriod.findUnique({ where: { id } })
}

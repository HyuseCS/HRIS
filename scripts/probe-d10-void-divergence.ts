/**
 * AC-7.1 — the D10 gate probe.
 *
 * Question, never before run: does voiding a payroll RUN leave the period LOCKED
 * and the loan / cash-advance balances still reduced, for a payroll that no longer
 * exists? Everything recorded about this so far came from reading the code.
 *
 * `seed` builds a GENERATED period whose single entry carries a frozen LOAN and
 * CASH_ADVANCE line — the shape `lock()` reads. Going through import/generate does
 * not work here: the seeded employees have no attendance, so every entry lands
 * fully absent, net pay is negative, and no amortization line is ever scheduled.
 * This mirrors tests/e2e/payroll-lock-idempotency.spec.ts, which seeds for the
 * same reason.
 *
 *   pnpm tsx scripts/probe-d10-void-divergence.ts seed
 *   pnpm tsx scripts/probe-d10-void-divergence.ts report
 *   pnpm tsx scripts/probe-d10-void-divergence.ts cleanup
 *
 * Lock and void happen over HTTP between seed and report, so the real service
 * path runs — not a re-implementation of it here.
 */
import { PrismaClient } from '@prisma/client'

const TAG = 'ZZ-D10-AMORT'
const PRINCIPAL = 1000
const INSTALLMENT = 250
const CA_PRINCIPAL = 800
const CA_INSTALLMENT = 300

const db = new PrismaClient()

async function seed() {
	const employee = await db.employee.findFirstOrThrow({
		where: { user: { email: 'employee@veent.ph' } },
		select: { id: true, organizationId: true }
	})

	const loan = await db.loan.create({
		data: {
			employeeId: employee.id,
			type: TAG,
			principal: PRINCIPAL,
			balance: PRINCIPAL,
			installment: INSTALLMENT,
			status: 'ACTIVE'
		}
	})

	// The cash-advance branch is the one with no payment ledger behind it, so it is
	// the half of the reversal that cannot be a true inverse. Seed it too.
	const ca = await db.cashAdvance.create({
		data: {
			employeeId: employee.id,
			amount: CA_PRINCIPAL,
			balance: CA_PRINCIPAL,
			installment: CA_INSTALLMENT,
			status: 'ACTIVE'
		}
	})

	const period = await db.payrollPeriod.create({
		data: {
			organizationId: employee.organizationId,
			name: TAG,
			startDate: new Date('2026-10-01'),
			endDate: new Date('2026-10-15'),
			status: 'GENERATED'
		}
	})

	const run = await db.payrollRun.create({
		data: {
			organizationId: employee.organizationId,
			periodId: period.id,
			periodStart: period.startDate,
			periodEnd: period.endDate,
			status: 'COMPUTED'
		}
	})

	await db.payrollEntry.create({
		data: {
			payrollRunId: run.id,
			employeeId: employee.id,
			hoursWorked: 80,
			basicPay: 20000,
			grossPay: 20000,
			sssEe: 0,
			sssEr: 0,
			philhealthEe: 0,
			philhealthEr: 0,
			pagibigEe: 0,
			pagibigEr: 0,
			withholdingTax: 0,
			totalDeductions: INSTALLMENT + CA_INSTALLMENT,
			netPay: 20000 - INSTALLMENT - CA_INSTALLMENT,
			deductions: {
				create: [
					{ code: 'LOAN', label: 'Loan', amount: INSTALLMENT, refId: loan.id },
					{ code: 'CASH_ADVANCE', label: 'Cash advance', amount: CA_INSTALLMENT, refId: ca.id }
				]
			}
		}
	})

	console.log(JSON.stringify({ periodId: period.id, runId: run.id, loanId: loan.id, caId: ca.id }))
}

async function report() {
	const period = await db.payrollPeriod.findFirstOrThrow({
		where: { name: TAG },
		include: { runs: true }
	})
	const loan = await db.loan.findFirstOrThrow({ where: { type: TAG } })
	const ca = await db.cashAdvance.findFirstOrThrow({
		where: { employee: { user: { email: 'employee@veent.ph' } }, amount: CA_PRINCIPAL }
	})
	const payments = await db.loanPayment.count({ where: { loanId: loan.id } })
	const caPayments = await db.cashAdvancePayment.count({ where: { cashAdvanceId: ca.id } })

	console.log(
		[
			`period.status      = ${period.status}`,
			`run.status         = ${period.runs[0]?.status}`,
			`loan.balance       = ${loan.balance}  (principal ${PRINCIPAL}, installment ${INSTALLMENT})`,
			`loan.status        = ${loan.status}`,
			`loan_payments      = ${payments}`,
			`cashAdvance.balance= ${ca.balance}  (principal ${CA_PRINCIPAL}, installment ${CA_INSTALLMENT})`,
			`cashAdvance.status = ${ca.status}`,
			`ca_payments        = ${caPayments}`
		].join('\n')
	)
}

async function cleanup() {
	const caIds: string[] = []
	const period = await db.payrollPeriod.findFirst({ where: { name: TAG }, include: { runs: true } })
	if (period) {
		const runIds = period.runs.map((r) => r.id)
		const entries = await db.payrollEntry.findMany({
			where: { payrollRunId: { in: runIds } },
			select: { id: true }
		})
		const entryIds = entries.map((e) => e.id)
		// Collect the probe's own cash-advance ids while the deduction rows still exist — they are
		// the only record linking this period to the advance it created.
		const caDeductions = await db.payrollDeduction.findMany({
			where: { payrollEntryId: { in: entryIds }, code: 'CASH_ADVANCE' },
			select: { refId: true }
		})
		caIds.push(...caDeductions.flatMap((d) => (d.refId ? [d.refId] : [])))
		await db.loanPayment.deleteMany({ where: { payrollEntryId: { in: entryIds } } })
		await db.cashAdvancePayment.deleteMany({ where: { payrollEntryId: { in: entryIds } } })
		await db.payrollDeduction.deleteMany({ where: { payrollEntryId: { in: entryIds } } })
		await db.payrollEntry.deleteMany({ where: { id: { in: entryIds } } })
		await db.payrollRun.deleteMany({ where: { id: { in: runIds } } })
		await db.payrollPeriod.delete({ where: { id: period.id } })
	}
	await db.loanPayment.deleteMany({ where: { loan: { type: TAG } } })
	await db.loan.deleteMany({ where: { type: TAG } })
	// Delete the advance this probe created BY ID, not by "whoever has an 800 advance". CashAdvance
	// has no `type` column to tag (unlike Loan), so the id comes from the deduction rows the probe
	// wrote — collected before those rows are deleted above. Matching on employee + amount would
	// delete a real advance that happened to share the figure.
	if (caIds.length) await db.cashAdvance.deleteMany({ where: { id: { in: caIds } } })
	console.log(`cleaned (${caIds.length} cash advance(s) by id)`)
}

const cmd = process.argv[2]
const run = cmd === 'seed' ? seed : cmd === 'report' ? report : cmd === 'cleanup' ? cleanup : null
if (!run) {
	console.error('usage: probe-d10-void-divergence.ts seed|report|cleanup')
	process.exit(1)
}
run()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())

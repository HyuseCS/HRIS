import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

// #298 D10: voiding a RUN used to flip one status column and nothing else, so the loan and
// cash-advance amounts committed at LOCK stayed deducted for a payroll that no longer existed —
// against a period that still read LOCKED, so nothing on screen said the payroll was dead. Proven
// live before the fix (phase0-evidence_18-08-26.md); this is the automated form.
//
// Drives the real POST /api/v1/payroll/[id]?action=void — the only way to reach voidRun at all,
// there is no UI button — so the route, the transaction and the shared reverseAmortization are all
// in the path under test.
test.describe.configure({ mode: 'serial' })

const TAG = 'e2e-void-d10'
const PRINCIPAL = 10000
const INSTALLMENT = 2500

// Deliberately capped: the live advance balance is BELOW one installment, so lock applies only
// `min(installment, balance)` = 300 while the frozen deduction line still says 500. That gap is
// what USED to be credited back on void (#309), and this seed is what exposes it.
const CA_BALANCE = 300
const CA_INSTALLMENT = 500

let periodId: string
let runId: string
let loanId: string
// CashAdvance has no name/tag column, so cleanup finds it by id rather than by TAG.
let advanceId = ''

async function seed() {
	const db = new PrismaClient()
	try {
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

		const advance = await db.cashAdvance.create({
			data: {
				employeeId: employee.id,
				amount: CA_INSTALLMENT,
				balance: CA_BALANCE,
				installment: CA_INSTALLMENT,
				status: 'ACTIVE'
			}
		})

		const period = await db.payrollPeriod.create({
			data: {
				organizationId: employee.organizationId,
				name: TAG,
				startDate: new Date('2026-02-01'),
				endDate: new Date('2026-02-15'),
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
				// The frozen amortization lines lock() reads.
				deductions: {
					create: [
						{ code: 'LOAN', label: 'Loan', amount: INSTALLMENT, refId: loan.id },
						{
							code: 'CASH_ADVANCE',
							label: 'Cash advance',
							amount: CA_INSTALLMENT,
							refId: advance.id
						}
					]
				}
			}
		})

		periodId = period.id
		runId = run.id
		loanId = loan.id
		advanceId = advance.id
	} finally {
		await db.$disconnect()
	}
}

async function cleanup() {
	const db = new PrismaClient()
	try {
		const periods = await db.payrollPeriod.findMany({ where: { name: TAG }, select: { id: true } })
		const runs = await db.payrollRun.findMany({
			where: { periodId: { in: periods.map((p) => p.id) } },
			select: { id: true }
		})
		const runIds = runs.map((r) => r.id)
		await db.loanPayment.deleteMany({ where: { loan: { type: TAG } } })
		await db.payrollDeduction.deleteMany({ where: { entry: { payrollRunId: { in: runIds } } } })
		await db.payrollEntry.deleteMany({ where: { payrollRunId: { in: runIds } } })
		await db.payrollRun.deleteMany({ where: { id: { in: runIds } } })
		await db.payrollPeriod.deleteMany({ where: { name: TAG } })
		await db.loan.deleteMany({ where: { type: TAG } })
		// Not just `advanceId`: a run that died between creating the advance and recording its id
		// leaves an orphan no later run can see. The amount/installment pair is this fixture's own
		// and matches nothing in the seed, so it sweeps those too.
		await db.cashAdvance.deleteMany({
			where: {
				employee: { user: { email: 'employee@veent.ph' } },
				amount: CA_INSTALLMENT,
				installment: CA_INSTALLMENT
			}
		})
		if (advanceId) await db.cashAdvance.deleteMany({ where: { id: advanceId } })
	} finally {
		await db.$disconnect()
	}
}

// Clean first: PayrollRun is unique on (organizationId, periodStart, periodEnd), so a previous
// aborted run would otherwise block seeding and the suite could never recover.
test.beforeAll(async () => {
	await cleanup()
	await seed()
})
test.afterAll(cleanup)

test('locking the period commits the amortization', async ({ page }) => {
	await login(page, USERS.admin)
	const response = await page.request.post(`/api/v1/payroll/periods/${periodId}?action=lock`, {
		data: {}
	})
	expect(response.status(), await response.text()).toBe(200)

	const db = new PrismaClient()
	try {
		const loan = await db.loan.findUniqueOrThrow({ where: { id: loanId } })
		expect(Number(loan.balance)).toBe(PRINCIPAL - INSTALLMENT)
		expect(await db.loanPayment.count({ where: { loanId } })).toBe(1)

		// Capped at the live balance, so the advance lands at exactly 0 — NOT at -200.
		const advance = await db.cashAdvance.findUniqueOrThrow({ where: { id: advanceId } })
		expect(Number(advance.balance)).toBe(0)
		expect(advance.status).toBe('PAID')

		// #309: the ledger row records the CAPPED 300, not the frozen 500. That single row is
		// what makes the void below a true inverse.
		const caPayments = await db.cashAdvancePayment.findMany({ where: { cashAdvanceId: advanceId } })
		expect(caPayments).toHaveLength(1)
		expect(Number(caPayments[0].amount)).toBe(CA_BALANCE)
	} finally {
		await db.$disconnect()
	}
})

test('voiding the RUN reverses the loan and leaves the period LOCKED', async ({ page }) => {
	await login(page, USERS.admin)
	const response = await page.request.post(`/api/v1/payroll/${runId}?action=void`, { data: {} })
	expect(response.status(), await response.text()).toBe(200)

	const db = new PrismaClient()
	try {
		const loan = await db.loan.findUniqueOrThrow({ where: { id: loanId } })
		// Back at the exact principal — 10000, named, not merely "not reduced".
		expect(Number(loan.balance)).toBe(PRINCIPAL)
		expect(loan.status).toBe('ACTIVE')
		expect(await db.loanPayment.count({ where: { loanId } })).toBe(0)

		const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } })
		expect(run.status).toBe('VOIDED')

		// Deliberate: a run void does NOT void or unlock the period. See
		// docs/payroll-void-semantics.md — the single remaining difference between the two voids.
		const period = await db.payrollPeriod.findUniqueOrThrow({ where: { id: periodId } })
		expect(period.status).toBe('LOCKED')

		// #309 — this figure used to be CA_INSTALLMENT (500), pinned as the CURRENT WRONG number
		// while the over-credit stood, with a note saying it would become CA_BALANCE once fixed.
		// This is that change: lock took the capped 300 and recorded it, so the void gives back
		// exactly 300 and the advance returns to where it started. Never 500.
		const advance = await db.cashAdvance.findUniqueOrThrow({ where: { id: advanceId } })
		expect(Number(advance.balance)).toBe(CA_BALANCE)
		expect(advance.status).toBe('ACTIVE')
		expect(await db.cashAdvancePayment.count({ where: { cashAdvanceId: advanceId } })).toBe(0)
	} finally {
		await db.$disconnect()
	}
})

test('voiding the same run twice is refused, and credits nothing a second time', async ({
	page
}) => {
	await login(page, USERS.admin)
	const response = await page.request.post(`/api/v1/payroll/${runId}?action=void`, { data: {} })
	expect(response.status()).toBe(400)
	expect((await response.text()).toLowerCase()).toContain('already voided')

	const db = new PrismaClient()
	try {
		// The real risk of a double void is a double credit: principal, never principal + 2500.
		const loan = await db.loan.findUniqueOrThrow({ where: { id: loanId } })
		expect(Number(loan.balance)).toBe(PRINCIPAL)

		// Same risk on the advance now that it has a ledger too: 300, never 600.
		const advance = await db.cashAdvance.findUniqueOrThrow({ where: { id: advanceId } })
		expect(Number(advance.balance)).toBe(CA_BALANCE)
	} finally {
		await db.$disconnect()
	}
})

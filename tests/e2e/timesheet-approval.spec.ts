import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS, verifyAndApproveTimesheet } from './helpers'

// Quickstart Scenarios 2 + 3, under the #165 model: /timesheets is view-only for the
// Employee role, so the employee no longer creates or submits their own sheet. HR prepares
// the draft and submits it on their behalf; the Verifier and Approver sign off the rest of
// the #134 chain; the employee reads the approved result on their own page.
//
// The whole lifecycle is one test so it stays deterministic (no cross-file races).
//
// The draft is seeded directly rather than through the UI. HR's two creation surfaces both
// require punches in the range (the aggregate panel, and /attendance "Save as timesheet",
// which errors with "No attendance in this range"), and timesheet-punch.spec.ts already
// covers the punch → aggregate path end to end. Seeding keeps this spec on the approval
// chain and the employee's read-only view, which is what it uniquely covers.
test.describe.configure({ mode: 'serial' })

// A whole-month period three months out: no punches exist there, so nothing contends with
// the punch spec's last-week row, and `periodStart desc` keeps it on page 1 of both tables.
// The distinctive 3.00 total disambiguates this spec's card in the shared review queue.
const TOTAL_HOURS = 3
const HOURS_TABLE = '3.00 hrs' // /timesheets table cell
const HOURS_CARD = '3.0 hrs' // /requests/timesheets card

function futureWholeMonth() {
	const d = new Date()
	const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))
	const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
	return { start, end }
}

const { start: PERIOD_START, end: PERIOD_END } = futureWholeMonth()

let timesheetId: string

/**
 * Put the fixture back to a pending DRAFT. The test approves it, so a retry would otherwise
 * find an APPROVED sheet with a spent approval chain and could never recover — the reason
 * the previous version of this spec had to offset its period by the retry index.
 */
async function resetFixture() {
	const db = new PrismaClient()
	try {
		const employee = await db.employee.findFirstOrThrow({
			where: { user: { email: USERS.employee.email } },
			select: { id: true }
		})
		const entry = {
			date: PERIOD_START,
			hoursWorked: TOTAL_HOURS,
			otHours: 0,
			notes: 'e2e approval fixture'
		}
		const ts = await db.timesheet.upsert({
			where: {
				employeeId_periodStart: { employeeId: employee.id, periodStart: PERIOD_START }
			},
			create: {
				employeeId: employee.id,
				periodStart: PERIOD_START,
				periodEnd: PERIOD_END,
				status: 'DRAFT',
				totalHours: TOTAL_HOURS,
				entries: { create: [entry] }
			},
			update: {
				periodEnd: PERIOD_END,
				status: 'DRAFT',
				submittedAt: null,
				reviewedAt: null,
				reviewedById: null,
				rejectionReason: null,
				totalHours: TOTAL_HOURS,
				entries: { deleteMany: {}, create: [entry] }
			},
			select: { id: true }
		})
		timesheetId = ts.id
		// A spent chain from a previous attempt would leave the card out of every queue.
		await db.approvalStep.deleteMany({ where: { timesheetId } })
	} finally {
		await db.$disconnect()
	}
}

test.beforeEach(resetFixture)

test.afterAll(async () => {
	if (!timesheetId) return
	const db = new PrismaClient()
	try {
		await db.timesheet.delete({ where: { id: timesheetId } })
	} finally {
		await db.$disconnect()
	}
})

test('HR submits an employee draft, the chain signs off, and the employee sees APPROVED', async ({
	browser
}) => {
	// Several sequential logins in their own browser contexts, each with a hydration retry
	// loop — legitimately the longest test in the suite, with no headroom in the 30s default
	// when the runner is busy. slow() triples the budget for this test only.
	test.slow()

	// --- HR submits the employee's draft on their behalf (#165: the employee cannot) ---
	const hrCtx = await browser.newContext()
	const hrPage = await hrCtx.newPage()
	await login(hrPage, USERS.admin)
	await hrPage.goto('/timesheets', { waitUntil: 'domcontentloaded' })

	const draftRow = hrPage
		.locator('tr', { hasText: 'Employee, Elena' })
		.filter({ hasText: /draft/i })
		.filter({ hasText: HOURS_TABLE })
	await expect(draftRow).toHaveCount(1)

	// The row opens the modal client-side; retry the click until hydration lands.
	const hrDialog = hrPage.getByRole('dialog', { name: 'Timesheet review' })
	await expect(async () => {
		await draftRow.click()
		await expect(hrDialog).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })
	// /timesheets never approves — that happens only in the review queue.
	await expect(hrDialog.getByRole('button', { name: 'Approve' })).toHaveCount(0)
	await hrDialog.getByRole('button', { name: 'Submit for review' }).click()
	// Scoped to <main>: phase 04 also toasts this message, and a page-wide locator now matches
	// both the page banner and the toast.
	await expect(hrPage.getByRole('main').getByText('Timesheet submitted for review.')).toBeVisible()
	await hrCtx.close()

	// --- HR submitting on the employee's behalf completes the MAKE stage (#134);
	// the Verifier then the Approver sign off the rest of the chain. ---
	await verifyAndApproveTimesheet(browser, HOURS_CARD)

	// --- The employee reads the approved result on their own (view-only) page ---
	const empCtx = await browser.newContext()
	const empPage = await empCtx.newPage()
	await login(empPage, USERS.employee)
	await empPage.goto('/timesheets', { waitUntil: 'domcontentloaded' })
	const approvedRow = empPage
		.locator('tr')
		.filter({ hasText: /approved/i })
		.filter({ hasText: HOURS_TABLE })
	await expect(approvedRow).toBeVisible()
	await empCtx.close()
})

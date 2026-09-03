import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * A MANAGER acts org-wide on timesheets, not just on their direct reports.
 *
 * MANAGER is the branch title for on-branch HR at JoJo Potato and Sweetleaf and carries
 * HR_ADMIN's authority (#133). Everything around it already assumed that — Team Timesheets
 * lists the whole org, and the aggregate panel and /attendance corrections clear
 * `requireMinRole('HR_ADMIN')` because both roles rank 2 — but four service functions still
 * narrowed MANAGER to `reportsToId === actor`. The visible symptom: create a sheet for
 * someone, press "Sync from attendance", and get "You can only review items for your direct
 * reports". It failed for anyone with no reporting line set at all, which is most employees.
 *
 * The target here is the seeded HR employee: a stable record that is definitively not the
 * manager's direct report (they have no manager at all).
 *
 * Serial — beforeAll runs once per worker under fullyParallel and these tests share one sheet.
 */
test.describe.configure({ mode: 'serial' })

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
]

// Seven months out: clear of timesheet-approval.spec (three) and
// timesheet-create-for-employee.spec (five), which both target their own employee+period and
// would collide on Timesheet's unique (employeeId, periodStart).
function targetMonth() {
	const d = new Date()
	const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 7, 1))
	return { monthName: MONTHS[start.getUTCMonth()], year: start.getUTCFullYear(), start }
}

const { monthName, year, start: PERIOD_START } = targetMonth()

let targetEmployeeId: string

async function dropFixture() {
	const db = new PrismaClient()
	try {
		const target = await db.employee.findFirstOrThrow({
			where: { user: { email: 'hr@veent.ph' } },
			select: { id: true, reportsToId: true }
		})
		// The premise of the spec: this employee is nobody's direct report.
		expect(target.reportsToId).toBeNull()
		targetEmployeeId = target.id
		await db.timesheet.deleteMany({
			where: { employeeId: targetEmployeeId, periodStart: PERIOD_START }
		})
	} finally {
		await db.$disconnect()
	}
}

test.beforeAll(dropFixture)
test.afterAll(dropFixture)

test('a manager creates and syncs a timesheet for someone who is not their direct report', async ({
	page
}) => {
	test.slow()
	await login(page, USERS.manager)
	await page.goto('/timesheets', { waitUntil: 'domcontentloaded' })

	const dialog = page.getByRole('dialog', { name: 'New timesheet' })
	await expect(async () => {
		await page.getByRole('button', { name: 'New Timesheet' }).click()
		await expect(dialog).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })

	const empValue = await dialog
		.locator('#nt-employee option', { hasText: 'HR, Hannah' })
		.first()
		.getAttribute('value')
	expect(empValue).toBeTruthy()
	await dialog.locator('#nt-employee').selectOption(empValue as string)
	await dialog.locator('#pp-month').selectOption({ label: monthName })
	await dialog.locator('#pp-year').selectOption({ label: String(year) })
	await dialog.getByRole('button', { name: 'Whole month' }).click()
	await dialog.getByRole('button', { name: 'Create timesheet' }).click()

	await page.waitForURL('**/timesheets')
	const row = page
		.locator('tr', { hasText: 'HR, Hannah' })
		.filter({ hasText: /draft/i })
		.filter({ hasText: '0.00 hrs' })
	await expect(row).toHaveCount(1)

	// The step that used to 403.
	const modal = page.getByRole('dialog', { name: 'Timesheet review' })
	await expect(async () => {
		await row.click()
		await expect(modal).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })
	await modal.getByRole('button', { name: 'Sync from attendance' }).click()

	// Scoped to <main>: phase 04 also toasts this message, and a page-wide locator now matches
	// both the page banner and the toast.
	await expect(page.getByRole('main').getByText(/Synced \d+ days? from attendance/)).toBeVisible()
	await expect(page.getByText('You can only review items for your direct reports')).toHaveCount(0)
})

test('a manager can delete that timesheet too', async ({ page }) => {
	// deleteTimesheet ran the same narrowed check, so this was refused for the same reason.
	await login(page, USERS.manager)
	await page.goto('/timesheets', { waitUntil: 'domcontentloaded' })

	const row = page.locator('tr', { hasText: 'HR, Hannah' }).filter({ hasText: /draft/i })
	const modal = page.getByRole('dialog', { name: 'Timesheet review' })
	await expect(async () => {
		await row.first().click()
		await expect(modal).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })

	await modal.getByRole('button', { name: 'Delete' }).click()
	await page.getByRole('button', { name: 'Delete', exact: true }).last().click()

	const db = new PrismaClient()
	try {
		await expect
			.poll(() =>
				db.timesheet.count({ where: { employeeId: targetEmployeeId, periodStart: PERIOD_START } })
			)
			.toBe(0)
	} finally {
		await db.$disconnect()
	}
})

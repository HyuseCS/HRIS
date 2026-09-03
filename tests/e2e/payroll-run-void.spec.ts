import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * #319 — the overlap 409 tells the user to "void the conflicting run to proceed", which was
 * advice they could not act on: voiding a run existed only on the v1 API. This walks the whole
 * sentence: hit the refusal, void the run named in it from the screen, then make the create that
 * was blocked succeed.
 *
 * April 2027 so this cannot collide with the seed or the other specs — every payroll spec picks
 * its own month, there is no shared run fixture.
 */
test.describe.configure({ mode: 'serial' })

const FIRST_START = '2027-04-02'
const FIRST_END = '2027-04-20'
const SECOND_START = '2027-04-10'
const SECOND_END = '2027-04-28'

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		const runs = await db.payrollRun.findMany({
			where: {
				organizationId: 'org_seed',
				periodStart: { in: [new Date(FIRST_START), new Date(SECOND_START)] }
			},
			select: { id: true }
		})
		const ids = runs.map((r) => r.id)
		if (ids.length) {
			await db.payrollEntry.deleteMany({ where: { payrollRunId: { in: ids } } })
			await db.payrollRun.deleteMany({ where: { id: { in: ids } } })
		}
	} finally {
		await db.$disconnect()
	}
})

test('voiding the conflicting run from the payroll page unblocks the overlapping range', async ({
	page
}) => {
	test.slow()
	await login(page, USERS.admin)
	await page.goto('/payroll', { waitUntil: 'domcontentloaded' })

	await page.getByRole('button', { name: 'New Payroll Run' }).click()
	await page.getByRole('button', { name: 'Custom range' }).click()
	await page.getByLabel('Start date').fill(FIRST_START)
	await page.getByLabel('End date').fill(FIRST_END)
	await page.getByRole('button', { name: 'Create', exact: true }).click()

	const firstRow = page
		.locator('tr', { hasText: 'Apr 2, 2027' })
		.filter({ hasText: 'Apr 20, 2027' })
	await expect(firstRow).toHaveCount(1)

	// The refusal, and the advice it gives.
	await page.goto('/payroll', { waitUntil: 'domcontentloaded' })
	await page.getByRole('button', { name: 'New Payroll Run' }).click()
	await page.getByRole('button', { name: 'Custom range' }).click()
	await page.getByLabel('Start date').fill(SECOND_START)
	await page.getByLabel('End date').fill(SECOND_END)
	await page.getByRole('button', { name: 'Create', exact: true }).click()
	await expect(page.locator('form[action="?/create"] .text-destructive').first()).toContainText(
		'Void the conflicting run to proceed.'
	)

	// Act on that advice — the control the issue was about.
	await page.goto('/payroll', { waitUntil: 'domcontentloaded' })
	await firstRow.getByRole('button', { name: 'Void' }).click()
	const dialog = page.getByRole('alertdialog')
	await expect(dialog).toContainText('Void this payroll run?')
	await dialog.getByRole('button', { name: 'Void run' }).click()

	await expect(firstRow).toContainText('VOIDED')
	// Voided, so it can no longer be voided again — the control is gone from that row.
	await expect(firstRow.getByRole('button', { name: 'Void' })).toHaveCount(0)

	// The range that was refused now goes through, because a VOIDED run is not an overlap.
	await page.getByRole('button', { name: 'New Payroll Run' }).click()
	await page.getByRole('button', { name: 'Custom range' }).click()
	await page.getByLabel('Start date').fill(SECOND_START)
	await page.getByLabel('End date').fill(SECOND_END)
	await page.getByRole('button', { name: 'Create', exact: true }).click()

	await expect(
		page.locator('tr', { hasText: 'Apr 10, 2027' }).filter({ hasText: 'Apr 28, 2027' })
	).toHaveCount(1)
})

test('an HR admin never sees the Void control', async ({ page }) => {
	// HR_ADMIN holds MANAGE_PAYROLL — they create runs, so they are an actor who meets the 409 —
	// but OVERRIDE_FINALIZED is SUPER_ADMIN only (rbac.ts:73), so the row must not offer it.
	await login(page, USERS.hr)
	await page.goto('/payroll', { waitUntil: 'domcontentloaded' })
	await expect(page.getByRole('button', { name: 'New Payroll Run' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Void' })).toHaveCount(0)
})

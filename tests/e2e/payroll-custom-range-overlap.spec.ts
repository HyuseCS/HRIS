import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * #163 criteria 10 and 12 — a second custom run that intersects the first is refused with a 409
 * naming the conflicting range, and nothing is written.
 *
 * Dates live in July 2026 so this spec cannot collide with the seed or with the other new specs
 * (there is no shared payroll-run fixture; every spec picks its own month).
 */
test.describe.configure({ mode: 'serial' })

const FIRST_START = '2026-07-02'
const FIRST_END = '2026-07-20'
const OVERLAP_START = '2026-07-10'
const OVERLAP_END = '2026-07-31'

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		const runs = await db.payrollRun.findMany({
			where: { organizationId: 'org_seed', periodStart: new Date(FIRST_START) },
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

test('a custom payroll run refuses an overlapping second range', async ({ page }) => {
	test.slow()
	await login(page, USERS.admin)
	await page.goto('/payroll', { waitUntil: 'domcontentloaded' })

	// First custom run: July 2 – 20.
	await page.getByRole('button', { name: 'New Payroll Run' }).click()
	await page.getByRole('button', { name: 'Custom range' }).click()
	await page.getByLabel('Start date').fill(FIRST_START)
	await page.getByLabel('End date').fill(FIRST_END)
	await page.getByRole('button', { name: 'Create', exact: true }).click()

	const firstRow = page
		.locator('tr', { hasText: 'Jul 2, 2026' })
		.filter({ hasText: 'Jul 20, 2026' })
	await expect(firstRow).toHaveCount(1)

	// Reload before reopening: a successful create leaves the panel open, so clicking
	// "New Payroll Run" again would toggle it shut.
	await page.goto('/payroll', { waitUntil: 'domcontentloaded' })

	// Second custom run: July 10 – 31, which shares eleven days with the first.
	await page.getByRole('button', { name: 'New Payroll Run' }).click()
	await page.getByRole('button', { name: 'Custom range' }).click()
	await page.getByLabel('Start date').fill(OVERLAP_START)
	await page.getByLabel('End date').fill(OVERLAP_END)
	await page.getByRole('button', { name: 'Create', exact: true }).click()

	// The error names the conflicting range and how to get past it.
	const error = page.locator('form[action="?/create"] .text-destructive').first()
	await expect(error).toContainText('Jul 2')
	await expect(error).toContainText('Jul 20')
	await expect(error).toContainText('Void the conflicting run to proceed.')

	// Nothing was written: one July run, and it is still the first one.
	await page.goto('/payroll', { waitUntil: 'domcontentloaded' })
	await expect(page.locator('tr', { hasText: 'Jul 2, 2026' })).toHaveCount(1)
	await expect(page.locator('tr', { hasText: 'Jul 10, 2026' })).toHaveCount(0)
})

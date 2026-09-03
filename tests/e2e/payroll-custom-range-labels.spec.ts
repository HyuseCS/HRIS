import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * #163 criterion 18 — a custom run is legible after the fact. Its row shows the exact start and
 * end dates, and its detail heading spells out the inclusive day count, which is what statutory
 * and loans were prorated against.
 *
 * December 2026 so this spec owns its own month: payroll-approval holds September and October,
 * multi-role-sod holds November, and the overlap guard would refuse a run that intersects theirs.
 */
const START = '2026-12-04'
const END = '2026-12-12'

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		const runs = await db.payrollRun.findMany({
			where: { organizationId: 'org_seed', periodStart: new Date(START) },
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

test('a custom run shows its exact dates and inclusive day count', async ({ page }) => {
	test.slow()
	await login(page, USERS.admin)
	await page.goto('/payroll', { waitUntil: 'domcontentloaded' })

	await page.getByRole('button', { name: 'New Payroll Run' }).click()
	await page.getByRole('button', { name: 'Custom range' }).click()
	await page.getByLabel('Start date').fill(START)
	await page.getByLabel('End date').fill(END)
	await page.getByRole('button', { name: 'Create', exact: true }).click()

	const row = page.locator('tr', { hasText: 'Dec 4, 2026' }).filter({ hasText: 'Dec 12, 2026' })
	await expect(row).toHaveCount(1)

	await row.getByRole('link').first().click()
	// Dec 4 through Dec 12 inclusive is 9 days.
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Dec 4, 2026')
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Dec 12, 2026')
	await expect(page.getByRole('heading', { level: 1 })).toContainText('(9 days)')
})

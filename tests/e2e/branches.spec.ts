import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

// Branches — the food-service tenants' physical stores. The seed gives JoJo Potato three
// CDO stores (SM CDO Downtown Premier + Centrio open, Limketkai closed) with the Head of
// Operations managing the first. Rows carry data-name because Svelte updates the value
// property, not the SSR value attribute, after a client-side nav.
test.describe.configure({ mode: 'serial' })

const row = (page: import('@playwright/test').Page, name: string) =>
	page.locator(`tr[data-name="${name}"]`)

test.describe('Branches', () => {
	test('is gated to the food-service tenants', async ({ page }) => {
		// Veent is not a food-service tenant: no store-registry nav link (labelled "Stores"
		// there, #182), and the route itself refuses.
		await login(page, USERS.admin)
		await expect(page.getByRole('link', { name: 'Stores' })).toHaveCount(0)
		await page.goto('/branches', { waitUntil: 'domcontentloaded' })
		await expect(page.getByRole('heading', { name: 'Stores', level: 1 })).toHaveCount(0)
	})

	test('JoJo HR sees the stores and can filter by status', async ({ page }) => {
		await login(page, USERS.jojoManager, 'JoJo Potato')
		// "Stores" everywhere for a physical location, per the owner's 03-09-26 #182 ruling; the
		// roster tab is "Team" for every tenant now, not "Branches".
		await expect(page.getByRole('link', { name: 'Stores' })).toBeVisible()

		await page.goto('/branches', { waitUntil: 'domcontentloaded' })
		await expect(page.getByRole('heading', { name: 'Stores', level: 1 })).toBeVisible()
		await expect(row(page, 'SM CDO Downtown Premier')).toBeVisible()
		await expect(row(page, 'Limketkai Center')).toBeVisible()

		await page.locator('#f-status').selectOption('CLOSED')
		await page.getByRole('button', { name: 'Filter' }).click()
		await expect(page).toHaveURL(/status=CLOSED/)
		await expect(row(page, 'Limketkai Center')).toBeVisible()
		await expect(row(page, 'SM CDO Downtown Premier')).toHaveCount(0)

		await page.getByRole('link', { name: 'Clear' }).click()
		await expect(row(page, 'SM CDO Downtown Premier')).toBeVisible()
	})

	test('adding a branch with a manager puts them on its roster, and closing keeps it', async ({
		page
	}) => {
		// Branches are closed, never deleted, so this test leaves a row behind. Drop it up
		// front or a second local run finds the branch already CLOSED and has no Close button
		// to click. (CI is unaffected — it seeds a fresh database.)
		const db = new PrismaClient()
		try {
			const stale = await db.branch.findFirst({ where: { name: 'E2E Test Branch' } })
			if (stale) {
				await db.employee.updateMany({ where: { branchId: stale.id }, data: { branchId: null } })
				await db.branch.delete({ where: { id: stale.id } })
			}
		} finally {
			await db.$disconnect()
		}

		await login(page, USERS.jojoManager, 'JoJo Potato')
		await page.goto('/branches', { waitUntil: 'domcontentloaded' })
		await page.waitForLoadState('networkidle')

		await page.getByText('Add a store').click()
		await page.locator('#a-name').fill('E2E Test Branch')
		// Naming a manager must also assign them — that is the manager/roster invariant.
		await page.locator('#a-manager').selectOption({ index: 1 })
		await page.getByRole('button', { name: 'Add store' }).click()

		const added = row(page, 'E2E Test Branch')
		await expect(added).toBeVisible()
		await expect(added.getByRole('link', { name: '1' })).toBeVisible()

		// Closing keeps the crew on record — the count must survive.
		await added.getByRole('button', { name: 'Close' }).click()
		await page.getByRole('alertdialog').getByRole('button', { name: 'Close' }).click()
		await expect(added.getByText('Closed')).toBeVisible()
		await expect(added.getByRole('link', { name: '1' })).toBeVisible()
	})

	test('the employees roster filters by branch', async ({ page }) => {
		await login(page, USERS.jojoManager, 'JoJo Potato')
		await page.goto('/employees', { waitUntil: 'domcontentloaded' })

		await page.locator('select[name="branch"]').selectOption({ label: 'SM CDO Downtown Premier' })
		await page.getByRole('button', { name: 'Search' }).click()
		await expect(page).toHaveURL(/branch=/)
		// The Head of Operations manages (and is assigned to) that store.
		await expect(page.getByText('of Operations, Head')).toBeVisible()
	})
})

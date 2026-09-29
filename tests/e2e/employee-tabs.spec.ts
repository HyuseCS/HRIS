import { test, expect, type Page } from '@playwright/test'
import { login, USERS } from './helpers'

// Phase 07 tabs are shallow-routed: `pushState` moves the URL without re-running `load`.
// `pushState` does NOT update `page.url`, so the active tab is resolved from `page.state`
// first. A regression there leaves the URL correct and the panel stuck on Overview, which
// no unit test can see.
const employeeLink = (page: Page) => page.locator('a[href^="/employees/"]:not([href*="/new"])')

async function openFirstEmployee(page: Page) {
	await page.goto('/team', { waitUntil: 'domcontentloaded' })
	await page.waitForLoadState('networkidle')
	await employeeLink(page).first().click()
	await page.waitForURL(/\/employees\/[^/?]+/)
	await page.waitForLoadState('networkidle')
}

test.describe('Employee record tabs', () => {
	test('clicking a tab swaps the panel without a load re-run', async ({ page }) => {
		await login(page, USERS.admin)
		await openFirstEmployee(page)

		await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
			'aria-selected',
			'true'
		)

		for (const name of ['Documents', 'History', 'Actions', 'Overview']) {
			await page.getByRole('tab', { name, exact: true }).click()
			await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
				'aria-selected',
				'true'
			)
			await expect(page.getByRole('tabpanel', { name })).toBeVisible()
		}
	})

	test('back and forward restore the tab', async ({ page }) => {
		await login(page, USERS.admin)
		await openFirstEmployee(page)

		await page.getByRole('tab', { name: 'Documents', exact: true }).click()
		await expect(page.getByRole('tabpanel', { name: 'Documents' })).toBeVisible()
		await page.getByRole('tab', { name: 'History', exact: true }).click()
		await expect(page.getByRole('tabpanel', { name: 'History' })).toBeVisible()

		await page.goBack()
		await expect(page.getByRole('tabpanel', { name: 'Documents' })).toBeVisible()
		await page.goForward()
		await expect(page.getByRole('tabpanel', { name: 'History' })).toBeVisible()
	})

	test('a deep link opens that tab on a hard load', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/team', { waitUntil: 'domcontentloaded' })
		const href = await employeeLink(page).first().getAttribute('href')
		const url = new URL(href!, 'http://x')
		url.searchParams.set('tab', 'compensation')

		await page.goto(`${url.pathname}${url.search}`, { waitUntil: 'domcontentloaded' })
		await expect(page.getByRole('tabpanel', { name: 'Compensation & Payroll' })).toBeVisible()
	})
})

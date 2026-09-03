import { test, expect } from '@playwright/test'
import { login, USERS, nextWeekdayISO } from './helpers'

// #67 — origin-aware BackButton: returns to the page actually navigated from,
// falls back to the static target on hard loads, honors a validated ?from hint.
test.describe.configure({ mode: 'serial' })

test.describe('Back navigation', () => {
	test('employee opened from /team returns to /team (HR)', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/team', { waitUntil: 'domcontentloaded' })
		await page.waitForLoadState('networkidle') // hydrate so the click stays client-side

		await page.locator('a[href^="/employees/"]').first().click()
		await page.waitForURL(/\/employees\/.+/)

		// Origin ≠ fallback, so the button reads generic "Back" and targets /team,
		// not the HR fallback /employees (the wrong-origin bug).
		const back = page.getByRole('link', { name: 'Back', exact: true })
		await expect(back).toHaveAttribute('href', '/team')
		await back.click()
		await page.waitForURL('**/team')
	})

	test('hard-loaded employee from /team returns to /team via ?from (HR, #113)', async ({
		page
	}) => {
		await login(page, USERS.admin)
		await page.goto('/team', { waitUntil: 'domcontentloaded' })
		const href = await page.locator('a[href^="/employees/"]').first().getAttribute('href')

		// Team links carry ?from=/team (#113), so even a fresh document — with no client-side
		// origin to capture — sends Back to /team, not the role-based /employees fallback.
		expect(href).toContain('?from=/team')
		await page.goto(href!, { waitUntil: 'domcontentloaded' })
		const back = page.getByRole('link', { name: 'Back', exact: true })
		await expect(back).toHaveAttribute('href', '/team')
	})

	test('hard-loaded employee with no origin hint falls back to /employees (HR)', async ({
		page
	}) => {
		await login(page, USERS.admin)
		await page.goto('/team', { waitUntil: 'domcontentloaded' })
		const href = await page.locator('a[href^="/employees/"]').first().getAttribute('href')

		// Strip the hint to model a direct link / Employees-list entry: with neither a captured
		// origin nor a ?from, the role-based fallback (/employees for HR) still applies.
		const bare = href!.split('?')[0]
		await page.goto(bare, { waitUntil: 'domcontentloaded' })
		const back = page.getByRole('link', { name: 'Back to Employees' })
		await expect(back).toHaveAttribute('href', '/employees')
	})

	test('report tab returns to /reports', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/reports', { waitUntil: 'domcontentloaded' })
		await page.waitForLoadState('networkidle')

		await page.locator('a[href^="/reports/headcount"]').first().click()
		await page.waitForURL(/\/reports\/headcount/)

		const back = page.getByRole('link', { name: 'Back to Reports' })
		await expect(back).toHaveAttribute('href', '/reports')
		await back.click()
		await page.waitForURL('**/reports')
	})

	test('employee files a leave request for the approvals flow', async ({ page }) => {
		await login(page, USERS.employee)
		// Phase 6 retired /leave/new; ?new=leave opens the canonical form on /requests.
		await page.goto('/requests?new=leave', { waitUntil: 'domcontentloaded' })
		// Wait for hydration before touching the bound <select>; otherwise Svelte's
		// bind:value re-initialises it to empty after our selection.
		await page.waitForLoadState('networkidle')

		const leaveType = page.locator('#leaveTypeId')
		await leaveType.selectOption({ label: 'Vacation Leave' })
		await expect(leaveType).not.toHaveValue('')
		const day = nextWeekdayISO()
		await page.locator('#startDate').fill(day)
		await page.locator('#endDate').fill(day)
		await page.getByRole('button', { name: 'Submit request' }).click()
		// /requests re-renders in place rather than redirecting, so the banner is the signal.
		await expect(page.getByText('Request submitted.')).toBeVisible()
	})

	test('request detail returns to approvals, including via ?from on hard load', async ({
		page
	}) => {
		await login(page, USERS.manager)
		await page.goto('/requests/approvals', { waitUntil: 'domcontentloaded' })
		await page.waitForLoadState('networkidle')

		// The queue's "View detail" link carries ?from=/requests/approvals.
		await page.locator('a[href*="?from=/requests/approvals"]').first().click()
		await page.waitForURL(/\/requests\/.+/)

		const back = page.getByRole('link', { name: 'Back', exact: true })
		await expect(back).toHaveAttribute('href', '/requests/approvals')

		// Hard-load the same URL: no origin, so the validated ?from hint must win.
		await page.goto(page.url(), { waitUntil: 'domcontentloaded' })
		const backHard = page.getByRole('link', { name: 'Back', exact: true })
		await expect(backHard).toHaveAttribute('href', '/requests/approvals')
		await backHard.click()
		await page.waitForURL('**/requests/approvals')
	})
})

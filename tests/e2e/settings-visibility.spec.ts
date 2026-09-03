import { test, expect, type Page } from '@playwright/test'
import { login, USERS } from './helpers'

// The hub cards live in their own landmark; the sub-nav that repeats the same labels does not.
const hubCard = (page: Page, name: string | RegExp) =>
	page.getByRole('region', { name: 'Settings destinations' }).getByRole('link', { name })
const sidebarRow = (page: Page, name: string) =>
	page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true })

/**
 * #237 — the Holiday Calendar card and the Holidays nav entry were gated on ADMINISTER_SYSTEM
 * while /settings/holidays and all three of its actions require only MANAGE_HR. HR Admin and
 * Manager could use the page by typing the URL but had no way to find it.
 *
 * The negative half matters as much as the positive one: the fix must open the Holiday card and
 * NOTHING ELSE, so each role is also asserted not to gain the two genuinely system-admin cards.
 *
 * Read-only — no fixtures, no teardown.
 */

// The two roles #237 locked out: MANAGE_HR without ADMINISTER_SYSTEM.
const LOCKED_OUT = [
	{ label: 'HR Admin', user: USERS.hr },
	{ label: 'Manager', user: USERS.manager }
]

for (const { label, user } of LOCKED_OUT) {
	test(`${label} can find and open the Holiday Calendar (#237)`, async ({ page }) => {
		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })

		// Scoped: since phase 07 the hub card, the settings sub-nav row and the sidebar row all
		// carry the SAME canonical label, so an unscoped locator matches three links and
		// Playwright strict mode throws.
		const card = hubCard(page, /Holiday Calendar/)
		await expect(card).toBeVisible()
		// The Settings nav group auto-expands on a /settings route, so the child row is on screen.
		await expect(sidebarRow(page, 'Holiday Calendar')).toBeVisible()

		// The link is real, not a card pointing at a 403 — the inverse of the #237 failure.
		await card.click()
		await page.waitForURL('**/settings/holidays', { waitUntil: 'domcontentloaded' })
		await expect(page.getByRole('heading', { name: 'Public Holidays' })).toBeVisible()
		// ...and it is usable, not merely readable.
		const addHeading = page.getByRole('heading', { name: 'Add New Holiday' })
		// Retry the click until the form opens — a pre-hydration click is silently dropped
		// (verify-skill hydration gotcha; see employee-view-only.spec.ts for the same idiom).
		await expect(async () => {
			await page.getByRole('button', { name: 'Add Holiday' }).click()
			await expect(addHeading).toBeVisible({ timeout: 1000 })
		}).toPass({ timeout: 15000 })
	})

	test(`${label} still does not see the system-admin cards (#237)`, async ({ page }) => {
		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })
		await expect(page.getByRole('link', { name: /Payroll Config/ })).toHaveCount(0)
		await expect(page.getByRole('link', { name: /Roles & Access/ })).toHaveCount(0)
	})
}

test('Super Admin keeps every card and nav entry it already had (#237)', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/settings', { waitUntil: 'domcontentloaded' })
	await expect(hubCard(page, /Holiday Calendar/)).toBeVisible()
	await expect(hubCard(page, /Payroll Config/)).toBeVisible()
	// Gated on the Roles & Access capability OR after #237; must not have narrowed for the Super Admin.
	await expect(hubCard(page, /Roles & Access/)).toBeVisible()
	await expect(sidebarRow(page, 'Holiday Calendar')).toBeVisible()
})

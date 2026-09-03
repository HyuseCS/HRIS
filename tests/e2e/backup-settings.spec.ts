import { expect, test } from '@playwright/test'
import { USERS, login } from './helpers'

// #164 — the Document Backup settings surface. Two things are worth an e2e:
// the capability gate (ADMINISTER_SYSTEM, not MANAGE_HR), and that a saved schedule
// actually survives a round-trip to the database.

test.describe('Document Backup settings', () => {
	test('a Super Admin can open the page and save a schedule that persists', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/settings/backup')

		// Positive control: the page really rendered, not a redirect or an error shell.
		await expect(page.getByRole('heading', { name: 'Document Backup', level: 1 })).toBeVisible()

		const interval = page.getByLabel('Run every')
		const retention = page.getByLabel('Keep the last')
		const enabled = page.getByRole('checkbox', { name: /Back up documents automatically/ })

		// A distinctive pair, so the reload below cannot pass on a default that happened to match.
		await enabled.check()
		await interval.fill('9')
		await retention.fill('4')
		await page.getByRole('button', { name: 'Save schedule' }).click()

		// The save reports through the shared Toaster, not a page-local banner.
		await expect(page.getByText('Backup schedule saved.')).toBeVisible()

		// The real assertion: it survives a fresh load from the database.
		await page.reload()
		await expect(enabled).toBeChecked()
		await expect(interval).toHaveValue('9')
		await expect(retention).toHaveValue('4')

		// The status card must agree with the form it sits above. Scoped to the Status item's own
		// badge: a bare getByText('On') would also match the word anywhere else on the page — and
		// the run-history table has a Status column of its own.
		const statusBadge = page.locator('dl div:has(dt:text-is("Status")) dd span')
		await expect(statusBadge).toHaveText('On')

		// Put it back so the spec leaves no schedule switched on behind it.
		await enabled.uncheck()
		await interval.fill('1')
		await retention.fill('7')
		await page.getByRole('button', { name: 'Save schedule' }).click()
		await expect(page.getByText('Backup schedule saved.')).toBeVisible()
	})

	test('the page rejects an out-of-range interval instead of saving it', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/settings/backup')

		// `max="90"` is a client hint only; the server bound is the one that matters, so the
		// input is filled past it with validation bypassed the way a crafted POST would.
		await page.getByLabel('Run every').evaluate((el) => {
			const input = el as HTMLInputElement
			input.removeAttribute('max')
			input.value = '365'
			input.dispatchEvent(new Event('input', { bubbles: true }))
		})
		await page.getByRole('button', { name: 'Save schedule' }).click()

		await expect(page.getByText('Run every cannot exceed 90 days')).toBeVisible()

		// And it did not persist: a reload shows the stored value, not 365.
		await page.reload()
		await expect(page.getByLabel('Run every')).not.toHaveValue('365')
	})

	test('an HR admin without ADMINISTER_SYSTEM is refused with 403', async ({ page }) => {
		await login(page, USERS.hr)

		// Asserted on the RESPONSE, not on the absence of a tile — a missing card proves
		// nothing about whether the route itself is reachable by URL.
		const res = await page.goto('/settings/backup')
		expect(res?.status()).toBe(403)

		// And the settings index does not advertise it to them either. Scoped to the card
		// grid: "Company" alone also matches the sidebar link, and the sidebar is not what
		// this asserts. The positive control comes first — a card grid that rendered at all.
		await page.goto('/settings')
		const cards = page.locator('a[href^="/settings/"].bg-card')
		await expect(cards.filter({ hasText: 'Company Info' })).toHaveCount(1)
		await expect(cards.filter({ hasText: 'Document Backup' })).toHaveCount(0)
	})
})

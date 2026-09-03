import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

// #131: a cross-org CEO logs in, switches tenants via the sidebar switcher, and sees
// only the selected org's data. "Head of Operations" is JoJo Potato's on-branch
// Manager (#140) and does not exist in Veent — so it cleanly proves the org switched.
//
// Phase 08 item 29 turned the switcher from a custom button/popover into a native <select>
// (it had no Escape, no listbox semantics and no announced selection), so this drives it with
// selectOption instead of two clicks. The assertion that matters — the roster is JoJo's — is
// unchanged, and that is what actually proves the switch.
test.describe('Cross-org tenancy switch', () => {
	test('CEO switches from Veent to JoJo Potato and sees that org’s roster', async ({ page }) => {
		// Land in Veent (the CEO picks a tenant on the login page).
		await login(page, USERS.ceo, 'Veent')

		// The switcher shows the current org and is only rendered for multi-org members.
		const switcher = page.getByRole('combobox', { name: 'Active organization' })
		await expect(switcher).toBeVisible()
		await expect(switcher).toHaveValue(/.+/)

		// Veent has no "Head of Operations".
		await page.goto('/employees', { waitUntil: 'domcontentloaded' })
		await expect(page.getByText('Head of Operations')).toHaveCount(0)

		// Selecting fires the switch client-side, so retry until the POST actually goes out —
		// a pre-hydration selectOption changes the control without running the handler.
		await expect(async () => {
			await Promise.all([
				page.waitForResponse(
					(r) => r.url().includes('/api/v1/session/switch-org') && r.request().method() === 'POST',
					{ timeout: 2000 }
				),
				page
					.getByRole('combobox', { name: 'Active organization' })
					.selectOption({ label: 'JoJo Potato' })
			])
		}).toPass({ timeout: 15000 })

		// Now the roster is JoJo Potato's — the branch Manager's job title shows up, and it
		// never existed under Veent.
		await page.goto('/employees', { waitUntil: 'domcontentloaded' })
		await expect(page.getByText('Head of Operations').first()).toBeVisible()
	})
})

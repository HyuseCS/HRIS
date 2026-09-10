import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

// #117 — manual job-board tracking. The seed provides the common boards and one demo
// posting (jp_seed_demo) so the checklist has something to act on.
test.describe.configure({ mode: 'serial' })

test.describe('Job-board tracking (#117)', () => {
	test('HR can manage the board catalog in Settings', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/settings/job-boards', { waitUntil: 'domcontentloaded' })

		await expect(page.getByRole('heading', { name: 'Job Boards' })).toBeVisible()
		// Seeded boards materialize on load. Rows carry data-name so they survive the
		// client-side (enhance) re-render after adding — input[value] would go stale.
		await expect(page.locator('li[data-name="JobStreet"]')).toBeVisible()

		// Add a board (tolerant of a prior run — boards can't be deleted, only toggled).
		await page.getByPlaceholder('e.g. Kalibrr').fill('Kalibrr E2E')
		await page.getByRole('button', { name: 'Add board' }).click()
		const row = page.locator('li[data-name="Kalibrr E2E"]')
		await expect(row).toBeVisible()

		// Toggle active and assert the label flips — works from either starting state.
		const toggle = row.getByRole('button', { name: /Deactivate|Activate/ })
		const before = (await toggle.textContent())?.trim()
		await toggle.click()
		await expect(async () => {
			const after = (
				await row.getByRole('button', { name: /Deactivate|Activate/ }).textContent()
			)?.trim()
			expect(after).not.toBe(before)
		}).toPass()
	})

	test('HR adds a board with a URL, then closing surfaces the takedown', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/recruitment/jp_seed_demo', { waitUntil: 'domcontentloaded' })
		// Wait for hydration — the add dialog and the remove confirmation are client-only.
		await page.waitForLoadState('networkidle')

		// Keep the run rerun-safe: make sure the posting starts OPEN.
		const reopen = page.getByRole('button', { name: 'Reopen' })
		if (await reopen.count()) {
			await reopen.click()
			await expect(page.getByRole('button', { name: 'Close Posting' })).toBeVisible()
		}

		await expect(page.getByRole('heading', { name: 'Posted on' })).toBeVisible()

		// Add JobStreet through the "+" tile. Rerun-safe: a prior run leaves a TAKEN_DOWN tile
		// behind, which is still a tile, so the picker would no longer offer the board.
		const jobStreet = page.locator('[data-board="JobStreet"]')
		if ((await jobStreet.count()) === 0) {
			await page.getByRole('button', { name: 'Add board' }).click()
			await page.getByLabel('Board').selectOption({ label: 'JobStreet' })
			await page.getByRole('button', { name: 'Add', exact: true }).click()
			await expect(jobStreet).toBeVisible()
		}

		// Save the URL. On a taken-down tile this Save also re-posts the board.
		await jobStreet.locator('input[name="url"]').fill('https://jobstreet.com/jobs/123')
		await jobStreet.getByRole('button', { name: 'Save' }).click()
		await expect(jobStreet.locator('input[name="url"]')).toHaveValue(
			'https://jobstreet.com/jobs/123'
		)

		// A bad URL is rejected with a field-level error.
		await jobStreet.locator('input[name="url"]').fill('not-a-url')
		await jobStreet.getByRole('button', { name: 'Save' }).click()
		await expect(jobStreet.getByText(/valid URL/)).toBeVisible()

		// Close the posting → the still-live board is surfaced for takedown.
		await page.getByRole('button', { name: 'Close Posting' }).click()
		await expect(page.getByText(/still live on/)).toContainText('JobStreet')

		// Remove a LIVE board → takedown, not deletion: the warning clears but the tile stays.
		await jobStreet.getByRole('button', { name: 'Remove JobStreet' }).click()
		await page.getByRole('button', { name: 'Remove', exact: true }).click()
		await expect(page.getByText(/still live on/)).toHaveCount(0)
		await expect(jobStreet.getByText('Taken down')).toBeVisible()
	})
})

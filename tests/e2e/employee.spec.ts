import { test, expect } from '@playwright/test'
import { login, USERS, nextWeekdayISO } from './helpers'

// Quickstart Scenario 4 (leave) + profile self-service (US1).
test.describe.configure({ mode: 'serial' })

test.describe('Employee self-service', () => {
	test('files a leave request that appears as PENDING', async ({ page }) => {
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
		await expect(page.getByText('Request submitted.')).toBeVisible()

		// The ledger assertion is unchanged — /requests re-renders in place, so /leave is now
		// reached by navigation rather than by the action's redirect.
		await page.goto('/leave', { waitUntil: 'domcontentloaded' })
		const row = page.locator('tbody tr', { hasText: 'Vacation Leave' }).first()
		await expect(row).toBeVisible()
		await expect(row.getByText(/pending/i)).toBeVisible()
	})

	// #175: personal & contact details are HR-managed. An employee's profile is read-only —
	// no editable form, just a "contact HR" note — so they can no longer self-edit.
	test('profile is read-only for a non-HR employee', async ({ page }) => {
		await login(page, USERS.employee)
		await page.goto('/profile', { waitUntil: 'domcontentloaded' })

		await expect(page.getByText('employee details are HR-managed')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Save Changes' })).toHaveCount(0)
	})
})

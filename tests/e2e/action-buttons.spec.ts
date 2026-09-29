import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

// #68 — converted bordered action buttons still submit their forms.
// Representative smoke: the pay-codes Activate/Deactivate toggle (markup-only
// conversion, same form/action underneath). Toggled twice to leave state as found.
test('pay-code toggle submits from its bordered button', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/payroll/pay-codes', { waitUntil: 'domcontentloaded' })
	await page.waitForLoadState('networkidle') // hydrate so enhance intercepts the submit

	const firstRowToggle = () =>
		page
			.locator('tbody tr')
			.first()
			.getByRole('button', { name: /Activate|Deactivate/ })

	const before = (await firstRowToggle().textContent())!.trim()
	const after = before === 'Activate' ? 'Deactivate' : 'Activate'

	await firstRowToggle().click()
	await expect(firstRowToggle()).toHaveText(after)

	await firstRowToggle().click()
	await expect(firstRowToggle()).toHaveText(before)
})

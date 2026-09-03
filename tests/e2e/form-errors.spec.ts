import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

// #106: both pages returned fail(..., { error }) from their actions, but neither
// rendered it — benefits never destructured `form` at all, and performance nested the
// banner inside a collapsible form. Every validation failure was silent: the user saw
// the form do nothing.
//
// Each test forces one input the server will reject — stripping the HTML attribute that
// would otherwise make the browser block the submit — and asserts the server's complaint
// reaches the screen as readable text.

test('benefits surfaces a failed plan creation instead of silently doing nothing', async ({
	page
}) => {
	await login(page, USERS.admin)
	await page.goto('/benefits', { waitUntil: 'domcontentloaded' })

	const form = page.locator('form[action*="createPlan"]')
	await expect(async () => {
		await page.getByRole('button', { name: 'Add Plan' }).click()
		await expect(form).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })

	await form.locator('input[name="name"]').evaluate((el: HTMLInputElement) => {
		el.removeAttribute('required')
		el.value = ''
	})
	await form.getByRole('button', { name: 'Create', exact: true }).click()

	// The banner must appear at all — before the fix nothing rendered.
	await expect(page.getByRole('alert')).toBeVisible()
	// ...and it must be readable: createPlan returned the raw zod fieldErrors object,
	// which renders as "[object Object]".
	await expect(page.getByRole('alert')).not.toContainText('[object Object]')
})

test('the review schedule surfaces a rejected cadence in the page-level banner', async ({
	page
}) => {
	await login(page, USERS.admin)
	await page.goto('/settings/performance', { waitUntil: 'domcontentloaded' })

	// The original guard sat on /performance's cycle form, which Phase 5 deleted along with every
	// action on that page. The banner it protected now lives at settings/performance/+page.svelte,
	// so the guard moves here rather than being dropped.
	const form = page.locator('form[action*="saveConfig"]')
	await expect(form).toBeVisible()

	// `max="24"` makes the browser refuse to submit 99 at all, so the server would never see it
	// and the click would hang — same reason the benefits case above strips `required`.
	await form.locator('input[name="intervalMonths"]').evaluate((el: HTMLInputElement) => {
		el.removeAttribute('max')
		el.value = '99'
	})
	await form.getByRole('button', { name: 'Save schedule' }).click()

	// The banner must appear at all — before #106 nothing rendered.
	await expect(page.getByRole('alert')).toBeVisible()
	// ...and it must be readable: returning the raw zod fieldErrors object here renders as
	// "[object Object]", which is the defect #106 actually was.
	await expect(page.getByRole('alert')).not.toContainText('[object Object]')
})

// #178 AC17: the Goals REST route is deleted, not merely unlinked. A source grep proves the
// file is gone; only a real request proves the URL no longer answers. Positive assertion on
// the status code — "the page looks empty" would pass against a live route returning [].
test('the removed Goals API route is gone', async ({ request }) => {
	const res = await request.get('/api/v1/performance/goals')
	expect(res.status()).toBe(404)
})

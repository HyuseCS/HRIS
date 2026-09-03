import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

// Quickstart: RBAC / auth — "employee cannot access another employee's data",
// login works, protected routes require a session.
// goto uses domcontentloaded (like helpers.login) — the default 'load' can hang on
// external font/webfont requests in sandboxed/offline runners.
test.describe('Authentication & access control', () => {
	test('unauthenticated user is redirected to the login page', async ({ page }) => {
		await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
		await expect(page).toHaveURL(/\/login/)
	})

	// The failure must re-render step 2 with the email retained, not collapse back to step 1.
	test('invalid credentials are rejected', async ({ page }) => {
		await page.goto('/login', { waitUntil: 'domcontentloaded' })
		await page.getByLabel('Email').fill(USERS.admin.email)
		await page.getByRole('button', { name: 'Continue' }).click()
		await page.getByLabel('Password').fill('definitely-wrong')
		await page.getByRole('button', { name: 'Sign In' }).click()
		await expect(page.getByText('Invalid email or password')).toBeVisible()
		await expect(page.getByLabel('Password')).toBeVisible()
		await expect(page).toHaveURL(/\/login/)
	})

	// The old 'valid credentials against the wrong tenant are rejected' spec lived here. Under
	// email-first login a single-org account is never offered another org, so it has no UI path.
	// Its assertion moved to tests/unit/login-resolution.test.ts (U3), which can additionally
	// check the LOGIN_FAILED audit row's organizationId and the absence of a session — neither
	// of which is observable from the browser.

	// The finding phase 09 exists to fix: /login used to list every Veent customer to anyone.
	test('an anonymous visitor sees no customer list', async ({ page }) => {
		await page.goto('/login', { waitUntil: 'domcontentloaded' })
		await expect(page.getByText('JoJo Potato')).toHaveCount(0)
		await expect(page.getByText('Sweetleaf')).toHaveCount(0)
		// Scoped to buttons: the brand logo's alt text is legitimately 'Veent'.
		await expect(page.getByRole('button', { name: 'Veent', exact: true })).toHaveCount(0)
	})

	// Non-enumeration: an email belonging to nobody must behave exactly like a real one.
	test('an unknown email advances to the password step like any other', async ({ page }) => {
		await page.goto('/login', { waitUntil: 'domcontentloaded' })
		await page.getByLabel('Email').fill('nobody-here@example.com')
		await page.getByRole('button', { name: 'Continue' }).click()
		await expect(page.getByLabel('Password')).toBeVisible()
		await expect(page.getByRole('alert')).toHaveCount(0)
		await page.getByLabel('Password').fill('anything-at-all')
		await page.getByRole('button', { name: 'Sign In' }).click()
		await expect(page.getByText('Invalid email or password')).toBeVisible()
	})

	test('valid credentials sign in and reach the dashboard', async ({ page }) => {
		await login(page, USERS.admin)
	})

	// The CEO is the only multi-org seed account (Veent + JoJo Potato + Sweetleaf). This proves
	// the picker RENDERS and submits. It does NOT prove scoping — the CEO belongs to all three
	// seed orgs, so there is no fourth org for it to wrongly show. Scoping is proven by the
	// anonymous-visitor spec above and by the four-orgs/two-memberships unit case (U2).
	test('a multi-org account picks its company and signs in', async ({ page }) => {
		await page.goto('/login', { waitUntil: 'domcontentloaded' })
		await page.getByLabel('Email').fill(USERS.ceo.email)
		await page.getByRole('button', { name: 'Continue' }).click()
		for (const org of ['Veent', 'JoJo Potato', 'Sweetleaf']) {
			await expect(page.getByRole('radio', { name: org, exact: true })).toBeVisible()
		}
		await page.getByRole('radio', { name: 'Veent', exact: true }).check()
		await page.getByLabel('Password').fill(USERS.ceo.password)
		await page.getByRole('button', { name: 'Sign In' }).click()
		await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded' })
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
	})

	test('an employee cannot open the admin-only employees list', async ({ page }) => {
		await login(page, USERS.employee)
		await page.goto('/employees', { waitUntil: 'domcontentloaded' })
		// requireMinRole(MANAGER) throws 403 for a plain employee → Access Denied page.
		await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible()
	})
})

// Progressive enhancement. Both login steps are plain form posts, so the whole flow must
// work with JavaScript off — which the old client-side step reveal could not do.
test.describe('no-JS login', () => {
	test.use({ javaScriptEnabled: false })

	test('both steps work as ordinary page loads', async ({ page }) => {
		await login(page, USERS.admin)
	})
})

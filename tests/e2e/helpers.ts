import { expect, type Browser, type Page } from '@playwright/test'

export const USERS = {
	admin: { email: 'admin@veent.ph', password: 'Admin@1234' },
	// HR-level authority without system administration — the role #237 locked out of the
	// Settings cards. Seeded by seedProd; see prisma/seed-core.ts.
	hr: { email: 'hr@veent.ph', password: 'Hr@1234' },
	manager: { email: 'manager@veent.ph', password: 'Manager@1234' },
	employee: { email: 'employee@veent.ph', password: 'Employee@1234' },
	// Maker-checker sign-off accounts (#134).
	verifier: { email: 'verifier@veent.ph', password: 'Verifier@1234' },
	approver: { email: 'approver@veent.ph', password: 'Approver@1234' },
	// The one two-hat account in the seed (#283): VERIFIER + APPROVER, for the
	// separation-of-duties specs. Seeded by seedE2E; see prisma/seed-core.ts.
	twoHat: { email: 'verifier.approver@veent.ph', password: 'TwoHat@1234' },
	// Cross-org CEO (#131/#132): member of Veent + JoJo Potato + Sweetleaf.
	ceo: { email: 'ceo@veent.ph', password: 'Ceo@1234' },
	// Food-service tenant HR (#140) — Branches is gated to those orgs, so its spec logs in
	// here rather than as a Veent admin.
	jojoManager: { email: 'manager@jojo.ph', password: 'Manager@1234' }
}

// Deterministic Discord link for the punch → aggregate → approve E2E. `global-setup`
// pins this onto employee@veent.ph so the signed-punch test doesn't depend on the
// seed's Discord id and stays isolated from real Discord accounts.
export const E2E_DISCORD_ID = 'e2e-punch-elena'

/**
 * Pick a tenant on the two-step Avipa login (#135) and wait for the credential form.
 * Revealing the form is client-side, so the tenant click must land after hydration —
 * retry the click until the Email field appears (same pattern as the timesheet review
 * modal below), otherwise a pre-hydration click is silently dropped.
 */
export async function selectTenant(page: Page, org: string) {
	const tenant = page.getByRole('button', { name: org, exact: true })
	const email = page.getByLabel('Email')
	await expect(async () => {
		await tenant.click()
		await expect(email).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })
}

/** Log in through the real login form and wait for the dashboard. */
export async function login(page: Page, user: { email: string; password: string }, org = 'Veent') {
	// domcontentloaded (not the default 'load') so we don't block on external font/webfont
	// requests that may never settle in sandboxed/offline runners.
	await page.goto('/login', { waitUntil: 'domcontentloaded' })
	// Two-step Avipa login (#135): pick the tenant to reveal the credential form. All
	// seed test accounts live in `Veent`, so callers rarely override `org`.
	await selectTenant(page, org)
	await page.getByLabel('Email').fill(user.email)
	await page.getByLabel('Password').fill(user.password)
	await page.getByRole('button', { name: 'Sign In' }).click()
	// domcontentloaded here too — waitForURL's default 'load' hangs the same way.
	await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded' })
	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

/**
 * Advance a SUBMITTED timesheet past its VERIFY and APPROVE stages (#134) by logging in
 * as the verifier then the approver and approving the matching review card. `hoursLabel`
 * (e.g. '0.0 hrs' / '7.0 hrs') disambiguates concurrent specs' cards in the shared queue.
 */
export async function verifyAndApproveTimesheet(browser: Browser, hoursLabel: string) {
	for (const user of [USERS.verifier, USERS.approver]) {
		const ctx = await browser.newContext()
		const page = await ctx.newPage()
		await login(page, user)
		await page.goto('/requests/timesheets', { waitUntil: 'domcontentloaded' })
		const card = page
			.locator('[role="button"]', { hasText: 'Employee, Elena' })
			.filter({ hasText: hoursLabel })
		await expect(card).toBeVisible()
		const dialog = page.getByRole('dialog', { name: 'Timesheet review' })
		await expect(async () => {
			await card.click()
			await expect(dialog).toBeVisible({ timeout: 1000 })
		}).toPass({ timeout: 15000 })
		await dialog.getByRole('button', { name: 'Approve' }).click()
		await expect(card).toHaveCount(0)
		await ctx.close()
	}
}

/** A near-future weekday (YYYY-MM-DD) so leave requests count ≥ 1 working day. */
export function nextWeekdayISO(): string {
	const d = new Date()
	d.setDate(d.getDate() + 3)
	const day = d.getDay()
	if (day === 6)
		d.setDate(d.getDate() + 2) // Sat → Mon
	else if (day === 0) d.setDate(d.getDate() + 1) // Sun → Mon
	return d.toISOString().slice(0, 10)
}

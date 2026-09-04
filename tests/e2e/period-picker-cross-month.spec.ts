import { test, expect, type Page } from '@playwright/test'
import { login, USERS } from './helpers'

/**
 * #3 AC20 — the cross-month range in the browser, on ALL THREE PeriodPicker mounts.
 *
 * `period-picker-default-cutoff.spec.ts` covers the /payroll mount's defaults, its inline copy and
 * its native `min`/`max` bounds. It does NOT cover the other two mounts at all, and nothing else
 * does either. The mount that matters most is `/payroll/periods`, which is the only one that
 * OVERRIDES both field names (`startName="start" endName="end"`) to match the zod schema in
 * `payroll/periods/+page.server.ts` (`start` / `end`). Nothing type-checks that pairing: rename a
 * prop on either side and every unit test, `pnpm check` and `pnpm lint` stay green while the form
 * silently posts fields the action cannot parse. These assertions are the only thing that notices.
 *
 * Read-only by construction. No test here submits, so the suite writes nothing to the database.
 *
 * R-1 NOTE (the undecided question about `fill()` and the `max` attribute): this spec does NOT
 * depend on it. Every date filled below is INSIDE the input's own bounds, because the only range
 * used is an accepted one. `period-picker-default-cutoff.spec.ts` does depend on R-1 — it fills an
 * over-cap end date and a reversed end date, both outside the live constraint — so if R-1 resolves
 * against us, that spec needs its documented fallback and this one needs no change.
 */

// 26 Dec 2026 → 10 Jan 2027: 6/31 + 10/31 = 16/31 = 0.51613 of a month, comfortably under the cap
// and impossible to express before #3. The cap allows an end as late as 25 Jan for this start, so
// filling 10 Jan stays well inside the `max` this picker computes.
const START = '2026-12-26'
const END = '2027-01-10'
const PREVIEW = 'Dec 26 – Jan 10, 2027 (16 days) · statutory and loans prorated to 52% of a month'

/**
 * Switch the picker to Custom range and fill the cross-month range. Asserts no inline refusal.
 *
 * `compact` mounts (the New Timesheet dialog) render the four kinds as a select rather than a
 * segmented control — the buttons need ~545px and do not fit in a modal.
 */
async function fillCrossMonth(page: Page, compact = false) {
	if (compact) await page.getByLabel('Period').selectOption('CUSTOM')
	else await page.getByRole('button', { name: 'Custom range' }).click()
	await page.getByLabel('Start date').fill(START)
	await page.getByLabel('End date').fill(END)
	await expect(page.locator('#pp-custom-error')).toHaveCount(0)
}

test('the /payroll create-run picker accepts a cross-month range and states the proration', async ({
	page
}) => {
	await login(page, USERS.admin)
	await page.goto('/payroll', { waitUntil: 'domcontentloaded' })
	await page.getByRole('button', { name: 'New Payroll Run' }).click()
	await fillCrossMonth(page)

	const form = page.locator('form[action="?/create"]')
	await expect(form.locator('p[aria-live="polite"]')).toHaveText(PREVIEW)

	// Default field names on this mount, and the resolved bounds reach the form. An INVALID or
	// incomplete custom range emits empty strings, so a non-empty value here is also the proof
	// that the picker considered this range acceptable.
	await expect(form.locator('input[name="periodStart"]')).toHaveValue(START)
	await expect(form.locator('input[name="periodEnd"]')).toHaveValue(END)
})

test('the /payroll/periods picker posts the RENAMED start/end fields for a cross-month range', async ({
	page
}) => {
	await login(page, USERS.admin)
	await page.goto('/payroll/periods', { waitUntil: 'domcontentloaded' })
	await page.getByRole('button', { name: 'Open Period' }).click()
	await fillCrossMonth(page)

	const form = page.locator('form[action="?/open"]')
	await expect(form.locator('p[aria-live="polite"]')).toHaveText(PREVIEW)

	// The whole point of this test. `openSchema` in `payroll/periods/+page.server.ts` parses
	// `start` and `end`; this mount is the only one that renames them, and the rename is checked
	// by nothing else in the repo.
	await expect(form.locator('input[name="start"]')).toHaveValue(START)
	await expect(form.locator('input[name="end"]')).toHaveValue(END)

	// And the defaults must NOT also be present — a half-applied rename would post both pairs and
	// the zod schema would still parse, hiding the mistake until someone read the payload.
	await expect(form.locator('input[name="periodStart"]')).toHaveCount(0)
	await expect(form.locator('input[name="periodEnd"]')).toHaveCount(0)
})

test('the /timesheets New Timesheet dialog accepts a cross-month range', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/timesheets', { waitUntil: 'domcontentloaded' })
	await page.getByRole('button', { name: 'New Timesheet' }).click()
	await fillCrossMonth(page, true)

	const form = page.locator('form[action="/timesheets?/create"]')
	await expect(form.locator('p[aria-live="polite"]')).toHaveText(PREVIEW)

	// Default field names on this mount too.
	await expect(form.locator('input[name="periodStart"]')).toHaveValue(START)
	await expect(form.locator('input[name="periodEnd"]')).toHaveValue(END)
})

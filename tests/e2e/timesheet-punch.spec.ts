import 'dotenv/config'
import { test, expect } from '@playwright/test'
import { login, USERS, E2E_DISCORD_ID, verifyAndApproveTimesheet } from './helpers'
import { signPayload } from '../../src/lib/server/hmac'

// T142 — happy path: a signed Discord punch pair is ingested over HMAC, HR rolls the
// week into a draft timesheet, submits it on the employee's behalf, and approves it
// from the review queue (/timesheets itself never approves).
// Serial so the punch → aggregate → submit → approve lifecycle stays deterministic.
test.describe.configure({ mode: 'serial' })

const SECRET = process.env.TIMELOG_API_SECRET

// A weekday in the PREVIOUS PHT week — a distinct period from the current-week timesheet
// the approval spec creates, so the two suites never contend for the same row.
function lastWeekPhtDay(): string {
	const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
	return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) // YYYY-MM-DD
}

// Send one HMAC-signed punch exactly as scripts/discord-bot.ts does.
async function punch(
	request: import('@playwright/test').APIRequestContext,
	punchType: 'IN' | 'OUT',
	timestampIso: string
) {
	const rawBody = JSON.stringify({ discordId: E2E_DISCORD_ID, punchType, timestamp: timestampIso })
	const ts = Math.floor(Date.now() / 1000).toString()
	const signature = signPayload(rawBody, ts, SECRET as string)
	return request.post('/api/v1/timesheets/log', {
		headers: {
			'content-type': 'application/json',
			'x-hris-signature': signature,
			'x-hris-timestamp': ts
		},
		data: rawBody // send the raw string verbatim — the endpoint verifies HMAC over it
	})
}

test('signed punch → aggregate → approve', async ({ browser, request }) => {
	expect(SECRET, 'TIMELOG_API_SECRET must be set (see .env) to sign punches').toBeTruthy()

	const day = lastWeekPhtDay()
	const inIso = new Date(`${day}T09:00:00+08:00`).toISOString()
	const outIso = new Date(`${day}T17:00:00+08:00`).toISOString()

	// --- 1. Signed punches ingested over HMAC (201 Created) ---
	const inRes = await punch(request, 'IN', inIso)
	expect(inRes.status(), await inRes.text()).toBe(201)
	const outRes = await punch(request, 'OUT', outIso)
	expect(outRes.status(), await outRes.text()).toBe(201)

	// A wrong signature must be rejected (guards the auth path itself).
	const bad = await request.post('/api/v1/timesheets/log', {
		headers: {
			'content-type': 'application/json',
			'x-hris-signature': 'deadbeef',
			'x-hris-timestamp': Math.floor(Date.now() / 1000).toString()
		},
		data: JSON.stringify({ discordId: E2E_DISCORD_ID, punchType: 'IN' })
	})
	expect(bad.status()).toBe(401)

	// --- 2. HR aggregates that week's punches into a DRAFT timesheet (T139 UI) ---
	const ctx = await browser.newContext()
	const page = await ctx.newPage()
	await login(page, USERS.admin)
	await page.goto('/timesheets', { waitUntil: 'domcontentloaded' })

	// Pick the employee by option text (id isn't known to the test) and the week by any day in it.
	const empValue = await page
		.locator('#agg-employee option', { hasText: 'Employee, Elena' })
		.first()
		.getAttribute('value')
	expect(empValue).toBeTruthy()

	// Re-apply the selection until Preview enables: `bind:value` only syncs to state once the
	// component has hydrated, so a pre-hydration select/fill leaves the button disabled.
	const previewBtn = page.getByRole('button', { name: 'Preview' })
	await expect(async () => {
		await page.locator('#agg-employee').selectOption(empValue as string)
		await page.locator('#agg-week').fill(day)
		await expect(previewBtn).toBeEnabled({ timeout: 1000 })
	}).toPass({ timeout: 15000 })

	await previewBtn.click()
	// Preview populated → the commit button enables (it requires a preview matching the selection).
	const aggregateBtn = page.getByRole('button', { name: 'Aggregate week' })
	await expect(aggregateBtn).toBeEnabled()
	await aggregateBtn.click()

	// 09:00–17:00 less the unpaid 12:00–13:00 lunch = 7.00 paid hours on one day.
	// Scoped to <main>: phase 04 also toasts this message, and a page-wide locator now matches
	// both the page banner and the toast.
	await expect(page.getByRole('main').getByText(/Aggregated 7\.00 hrs across 1 day/)).toBeVisible()

	// --- 3. HR submits the aggregated draft on the employee's behalf ---
	await page.reload()
	// Disambiguate from the approval spec's current-week row by the unique 7.00 total.
	const draftRow = page
		.locator('tr', { hasText: 'Employee, Elena' })
		.filter({ hasText: /draft/i })
		.filter({ hasText: '7.00 hrs' })
	await expect(draftRow).toHaveCount(1)

	// The row opens the modal client-side; retry the click until hydration lands.
	const dialog = page.getByRole('dialog')
	await expect(async () => {
		await draftRow.click()
		await expect(dialog).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })
	// /timesheets never offers Approve — only submit-for-review.
	await expect(dialog.getByRole('button', { name: 'Approve' })).toHaveCount(0)
	await dialog.getByRole('button', { name: 'Submit for review' }).click()

	// Scoped to <main>: phase 04 also toasts this message.
	await expect(page.getByRole('main').getByText('Timesheet submitted for review.')).toBeVisible()

	// --- 4. HR submitting on the employee's behalf completed the MAKE stage (#134);
	// the Verifier then the Approver sign off the rest of the chain. ---
	await verifyAndApproveTimesheet(browser, '7.0 hrs')

	// --- 5. Back on /timesheets the aggregated week is APPROVED ---
	await page.goto('/timesheets', { waitUntil: 'domcontentloaded' })
	const approvedRow = page
		.locator('tr', { hasText: 'Employee, Elena' })
		.filter({ hasText: /approved/i })
		.filter({ hasText: '7.00 hrs' })
	await expect(approvedRow).toHaveCount(1)
	await ctx.close()
})

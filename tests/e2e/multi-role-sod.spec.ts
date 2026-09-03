import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

// #283: decision-time separation of duties, driven through the real UI as the seeded
// two-hat account (VERIFIER + APPROVER). Multi-role is what makes these reachable — one
// person now holds two stages' capabilities — so both specs are about the SAME actor
// being refused the second stage of an attempt they already decided.
//
// AC-17: after verifying, the request is awaiting APPROVE, the queue offers this actor no
// approve control, and the sidebar badge does not count it (while a different approver
// still sees it — the negative half alone would also pass if the request had vanished).
// AC-29 / D12: on the payroll detail page the sign-off control is NOT hidden; it renders
// aria-disabled, stays in the tab order, and its aria-describedby resolves to the reason.
test.describe.configure({ mode: 'serial' })

const REQUEST_REASON = 'e2e two-hat sod'
const PAYROLL_START = '2026-11-01'
const PAYROLL_END = '2026-11-15'

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		await db.request.deleteMany({ where: { reason: REQUEST_REASON } })
		const runs = await db.payrollRun.findMany({
			where: { organizationId: 'org_seed', periodStart: new Date(PAYROLL_START) },
			select: { id: true }
		})
		const ids = runs.map((r) => r.id)
		if (ids.length) {
			// Entries first (they cascade to their lines); the run delete cascades its steps.
			await db.payrollEntry.deleteMany({ where: { payrollRunId: { in: ids } } })
			await db.payrollRun.deleteMany({ where: { id: { in: ids } } })
		}
	} finally {
		await db.$disconnect()
	}
})

/** File an OT request as the employee and return its id. */
async function fileAsEmployee(page: Page): Promise<string> {
	await login(page, USERS.employee)
	const res = await page.request.post('/api/v1/requests', {
		data: { type: 'OVERTIME', date: '2026-08-04', hours: 2, reason: REQUEST_REASON },
		headers: { 'content-type': 'application/json' }
	})
	expect(res.status()).toBe(201)
	const id = (await res.json())?.request?.id as string
	expect(id).toBeTruthy()
	return id
}

/** Act on a request's live stage through the approvals form action. */
async function decideRequest(page: Page, id: string, decision: 'APPROVED' | 'RETURNED', note = '') {
	const res = await page.request.post('/requests/approvals?/decideRequest', {
		form: { id, decision, note },
		headers: { origin: new URL(page.url()).origin }
	})
	return res.status()
}

/** The sidebar's Requests badge (absent when the count is zero). */
async function requestsBadge(page: Page): Promise<number> {
	const spans = page.locator('a[href="/requests/approvals"]').locator('span')
	// span 0 is the label; the badge is only rendered when the count is > 0.
	if ((await spans.count()) < 2) return 0
	return Number((await spans.nth(1).innerText()).trim())
}

/** The queue's own "N awaiting you" total (absent when zero). */
async function queueTotal(page: Page): Promise<number> {
	const pill = page.getByText(/^\d+ awaiting you$/)
	if ((await pill.count()) === 0) return 0
	return Number((await pill.innerText()).replace(' awaiting you', '').trim())
}

test('AC-17: the two-hat user verifies a request, then cannot approve it', async ({ browser }) => {
	test.slow()

	const empCtx = await browser.newContext()
	const id = await fileAsEmployee(await empCtx.newPage())
	await empCtx.close()

	// MAKE — branch HR (the Super Admin holds MANAGE_HR) files it into the chain.
	const hrCtx = await browser.newContext()
	const hrPage = await hrCtx.newPage()
	await login(hrPage, USERS.admin)
	expect(await decideRequest(hrPage, id, 'APPROVED')).toBe(200)
	await hrCtx.close()

	// VERIFY — the two-hat user. This is the decision that bars them from APPROVE.
	const twoCtx = await browser.newContext()
	const twoPage = await twoCtx.newPage()
	await login(twoPage, USERS.twoHat)
	expect(await decideRequest(twoPage, id, 'APPROVED', 'numbers match')).toBe(200)

	// The request is still open, now awaiting APPROVE — not decided, not gone.
	await twoPage.goto(`/requests/${id}`, { waitUntil: 'domcontentloaded' })
	const detail = await twoPage.locator('body').innerText()
	expect(detail).toMatch(/PENDING/)
	expect(detail).toMatch(/Verified/)
	// D12's "explain why" half on the detail page.
	expect(detail).toContain(
		'You already decided an earlier stage of this attempt — another verifier or approver must act.'
	)

	// The queue offers this actor no control on it, and the badge agrees with the queue.
	await twoPage.goto('/requests/approvals', { waitUntil: 'domcontentloaded' })
	await expect(twoPage.getByRole('heading', { name: 'Request Approvals' })).toBeVisible()
	const barredCard = twoPage.locator('div.rounded-lg.border', { hasText: REQUEST_REASON })
	await expect(barredCard).toHaveCount(0)
	// Badge and list are rendered from the same request, so this comparison is stable under
	// concurrent specs: the badge counts exactly the list that excludes this request.
	expect(await requestsBadge(twoPage)).toBe(await queueTotal(twoPage))
	await twoCtx.close()

	// Negative control: a DIFFERENT approver still sees it with a live Approve button. Without
	// this, the assertion above would also pass if the request had been approved or deleted.
	const apprCtx = await browser.newContext()
	const apprPage = await apprCtx.newPage()
	await login(apprPage, USERS.approver)
	await apprPage.goto('/requests/approvals', { waitUntil: 'domcontentloaded' })
	const openCard = apprPage.locator('div.rounded-lg.border', { hasText: REQUEST_REASON }).first()
	await expect(openCard).toBeVisible()
	await expect(openCard.getByRole('button', { name: 'Approve' })).toBeVisible()
	await apprCtx.close()
})

test('AC-29: a barred verifier sees a disabled sign-off control with a reason', async ({
	browser
}) => {
	test.slow()

	// MAKE — computing the run makes the admin its maker (the MAKE step is auto-decided).
	const mkCtx = await browser.newContext()
	const mkPage = await mkCtx.newPage()
	await login(mkPage, USERS.admin)
	const created = await mkPage.request.post('/payroll?/create', {
		form: { periodStart: PAYROLL_START, periodEnd: PAYROLL_END },
		headers: { origin: new URL(mkPage.url()).origin }
	})
	expect(created.status()).toBe(200)
	await mkCtx.close()

	const db = new PrismaClient()
	let runId: string
	try {
		const run = await db.payrollRun.findFirstOrThrow({
			where: { organizationId: 'org_seed', periodStart: new Date(PAYROLL_START) },
			select: { id: true }
		})
		runId = run.id
	} finally {
		await db.$disconnect()
	}

	// VERIFY — the two-hat user signs off the verify stage; the run advances to APPROVE.
	const ctx = await browser.newContext()
	const page = await ctx.newPage()
	await login(page, USERS.twoHat)
	const verified = await page.request.post(`/payroll/${runId}?/decide`, {
		form: { action: 'approve', note: '' },
		headers: { origin: new URL(page.url()).origin }
	})
	expect(verified.status()).toBe(200)

	// The detail page they navigated to must not silently drop the control (D12).
	await page.goto(`/payroll/${runId}`, { waitUntil: 'domcontentloaded' })
	// Scoped to the blocked-control card, not the whole page: a page-wide aria-disabled locator
	// silently starts matching some other disabled control the day one is added.
	const blockedCard = page.locator('div:has(> p#act-blocked)')
	const blocked = blockedCard.locator('button[aria-disabled="true"]')
	await expect(blocked).toHaveText('Approve')
	// The actionable branch must NOT also be rendered.
	await expect(page.getByText('This run is awaiting your')).toHaveCount(0)

	// Still reachable by Tab — the whole reason this is aria-disabled and not `disabled`.
	// Walk the tab order from the top of the document rather than calling .focus(), which
	// would prove nothing about tabbability.
	let reached = false
	for (let i = 0; i < 120 && !reached; i++) {
		await page.keyboard.press('Tab')
		reached = await blocked.evaluate((el) => el === document.activeElement)
	}
	expect(reached).toBe(true)

	// ...and the description it points at resolves to the F5 reason, verbatim.
	const describedBy = await blocked.getAttribute('aria-describedby')
	expect(describedBy).toBeTruthy()
	// Attribute selector, not `#${id}`: an id needing CSS escaping would break the selector rather
	// than fail the assertion, which reads as a locator bug instead of a missing description.
	await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
		'You already recorded a decision on this run — another finance approver must sign it off.'
	)
	await ctx.close()
})

import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * #283/F4 — the department posting-approver mapping BINDS, and the submitter cannot decide.
 *
 * Two rules, one department:
 *   (a) a department WITH a designated approver is decidable only by that approver. HR used to
 *       override every mapping, which made the mapping decorative.
 *   (b) whoever submitted a posting may not decide it, even when they ARE the designated
 *       approver — in which case the posting is deliberately undecidable until HR remaps (D9).
 *
 * Runs serially against one department (Software Developers) whose mapping this spec owns and
 * restores. Everything is done through the real UI, since the whole point is which controls a
 * given user is offered.
 */

const DEPT = 'Software Developers'
const TITLE_A = `E2E-F4-mapped-${Date.now()}`
const TITLE_B = `E2E-F4-self-${Date.now()}`

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
	// Sweep the residue of EVERY earlier run before filing this run's postings. The self-submitted
	// posting (b) is undecidable by design, so it stays PENDING forever, and the app has no delete
	// path — the afterAll below documents that. Harmless while the dashboard card was unbounded;
	// phase 10 capped that card at 10 oldest-first, so 86 accumulated E2E-F4 rows crowded this
	// run's posting clean off it. Prisma-level fixture cleanup is the same house pattern as
	// pagination.spec.ts and container-bounds.spec.ts.
	const db = new PrismaClient()
	try {
		await db.jobPosting.deleteMany({ where: { title: { startsWith: 'E2E-F4-' } } })
	} finally {
		await db.$disconnect()
	}
})

/** Set (or clear, with '') the department's posting approver as CEO. */
async function mapApprover(page: Page, approverLabel: string) {
	await page.goto('/settings/posting-approvers', { waitUntil: 'domcontentloaded' })
	const row = page.locator('tr', { hasText: DEPT })
	const select = row.locator('select[name="approverId"]')
	// '' selects the "— HR (fallback) —" option, which clears the mapping.
	await select.selectOption(approverLabel === '' ? { value: '' } : { label: approverLabel })
	await row.getByRole('button', { name: 'Save' }).click()
	// Assert the SAVED selection, not that the control is still on screen: the select is visible
	// whether or not the save landed, so toBeVisible() passed even when the mapping never changed.
	// Matched on the option's own text, since the option VALUES are employee ids this spec never
	// learns. `selectOption({ label })` above already requires this exact string.
	await expect(row.locator('select[name="approverId"] option:checked')).toHaveText(
		approverLabel === '' ? /HR \(fallback\)/ : approverLabel
	)
}

/** Create a draft posting in DEPT and submit it for approval. */
async function createAndSubmit(page: Page, title: string) {
	await page.goto('/recruitment', { waitUntil: 'domcontentloaded' })
	await page
		.getByRole('button', { name: /New Job Posting|Create/i })
		.first()
		.click()
	await page.getByLabel('Job Title').fill(title)
	await page.getByLabel('Department').selectOption({ label: DEPT })
	await page.getByLabel('Description').fill('E2E fixture for #283 F4.')
	await page.getByRole('button', { name: 'Create Draft' }).click()

	const row = page.locator('tr', { hasText: title })
	await expect(row).toBeVisible()
	await row.locator('input[type="checkbox"]').check()
	await page.getByRole('button', { name: /Submit selected for approval/ }).click()
	await expect(page.locator('tr', { hasText: title })).toContainText(/PENDING|Pending/i)
}

/** The posting-approval card on the dashboard, scoped to one posting. */
function approvalCard(page: Page, title: string) {
	return page
		.locator('li', { hasText: title })
		.filter({ has: page.getByRole('button', { name: 'Approve' }) })
}

test('(a) a mapped department is decidable only by its designated approver', async ({
	browser
}) => {
	// CEO maps Software Developers to Apple Approver (APPROVER role only — no HR capability at
	// all, which is what proves the mapping alone confers the authority).
	const ceoCtx = await browser.newContext()
	const ceo = await ceoCtx.newPage()
	await login(ceo, USERS.ceo)
	await mapApprover(ceo, 'Approver, Apple · Sign-off Approver')

	// HR creates and submits a posting for that department.
	const hrCtx = await browser.newContext()
	const hr = await hrCtx.newPage()
	await login(hr, USERS.hr)
	await createAndSubmit(hr, TITLE_A)

	// HR can no longer approve it — this is the behaviour that changed.
	await hr.goto('/dashboard', { waitUntil: 'domcontentloaded' })
	await expect(approvalCard(hr, TITLE_A)).toHaveCount(0)

	// NEGATIVE CONTROL: the designated approver CAN. Without this, the assertion above would
	// also pass if the posting had simply become undecidable by everyone.
	const apCtx = await browser.newContext()
	const ap = await apCtx.newPage()
	await login(ap, USERS.approver)
	await ap.goto('/dashboard', { waitUntil: 'domcontentloaded' })
	await expect(approvalCard(ap, TITLE_A)).toHaveCount(1)
	await approvalCard(ap, TITLE_A).getByRole('button', { name: 'Approve' }).click()
	await expect(approvalCard(ap, TITLE_A)).toHaveCount(0)

	await ceoCtx.close()
	await hrCtx.close()
	await apCtx.close()
})

test('(b) the designated approver cannot decide a posting they submitted themselves', async ({
	browser
}) => {
	const ceoCtx = await browser.newContext()
	const ceo = await ceoCtx.newPage()
	await login(ceo, USERS.ceo)

	// Give the approver an HR hat so she can create postings at all — the two-role state this
	// whole PR exists to make possible.
	await ceo.goto('/settings/roles', { waitUntil: 'domcontentloaded' })
	// NB: 'approver@veent.ph' is a substring of 'verifier.approver@veent.ph', so a plain hasText
	// row filter matches two rows. Anchor on the exact cell text instead.
	const apRow = ceo
		.locator('tr')
		.filter({ has: ceo.getByText(USERS.approver.email, { exact: true }) })
	// The picker is a dialog now (#283) — the row itself only displays roles. It is opened by a
	// client-side handler, so a click landing before this route has hydrated is accepted by the
	// browser and silently does nothing; retry the open until it takes rather than asserting on
	// the first one. (Not a masked app bug: the control works, it just isn't wired up yet.)
	const dialog = ceo.getByRole('dialog', { name: 'Edit roles' })
	await expect(async () => {
		await apRow.getByRole('button', { name: 'Edit roles' }).click()
		await expect(dialog).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })
	// Click the LABEL, not the visually-hidden input it wraps: clicking the input directly makes
	// the label re-dispatch the activation and the option toggles twice. A real user clicks the
	// row. Selected by the value it posts — `hasText` is a case-insensitive substring match and
	// several role descriptions mention HR.
	await dialog.locator('label:has(input[value="HR_ADMIN"])').click()
	await expect(dialog.locator('input[name="roles"]:checked')).toHaveCount(2)
	await dialog.getByRole('button', { name: 'Save roles' }).click()
	// The dialog closes only on a saved change; a refusal keeps it open with the reason inline.
	await expect(dialog).toHaveCount(0)
	await expect(apRow.getByText('HR Admin', { exact: true })).toBeVisible()

	// Map the department HERE rather than inheriting (a)'s mapping: the file is serial, but a
	// dependency on a previous test's side effect means this one cannot be run alone — which is
	// exactly how it failed in isolation.
	//
	// AFTER the role edit, not before. mapApprover's save leaves an invalidation in flight, and
	// navigating to /settings/roles on top of it lands the 'Edit roles' click on unhydrated HTML —
	// the click is silently lost and the dialog never opens. Nothing follows this call on `ceo`
	// except a dashboard read, so there is nothing left to race.
	await mapApprover(ceo, 'Approver, Apple · Sign-off Approver')

	// She submits a posting for the department she approves.
	const apCtx = await browser.newContext()
	const ap = await apCtx.newPage()
	await login(ap, USERS.approver)
	await createAndSubmit(ap, TITLE_B)

	// She cannot decide it, despite being the designated approver.
	await ap.goto('/dashboard', { waitUntil: 'domcontentloaded' })
	await expect(approvalCard(ap, TITLE_B)).toHaveCount(0)

	// And nobody rescues it — D9 is deliberate: no HR-steps-in fallback. The posting is stuck
	// until the mapping changes.
	const hrCtx = await browser.newContext()
	const hr = await hrCtx.newPage()
	await login(hr, USERS.hr)
	await hr.goto('/dashboard', { waitUntil: 'domcontentloaded' })
	await expect(approvalCard(hr, TITLE_B)).toHaveCount(0)

	await ceo.goto('/dashboard', { waitUntil: 'domcontentloaded' })
	await expect(approvalCard(ceo, TITLE_B)).toHaveCount(0)

	// The escape hatch the 403 names: remap the department, and it becomes decidable again.
	await mapApprover(ceo, 'Twohat, Tina · Sign-off Verifier & Approver')
	const thCtx = await browser.newContext()
	const th = await thCtx.newPage()
	await login(th, USERS.twoHat)
	await th.goto('/dashboard', { waitUntil: 'domcontentloaded' })
	await expect(approvalCard(th, TITLE_B)).toHaveCount(1)

	await ceoCtx.close()
	await apCtx.close()
	await hrCtx.close()
	await thCtx.close()
})

test.afterAll(async ({ browser }) => {
	// Restore: clear the mapping this spec owns, and put the approver back to one role.
	const ctx = await browser.newContext()
	const page = await ctx.newPage()
	await login(page, USERS.ceo)
	await mapApprover(page, '')
	await page.goto('/settings/roles', { waitUntil: 'domcontentloaded' })
	// Restore the role set through the v1 endpoint rather than the UI. Driving cleanup through
	// the picker means racing hydration and enhance round-trips for something that is not under
	// test, and it failed that way twice — reporting an afterAll fault against a test body that
	// had passed. The API is deterministic, shares this context's session cookie, and is the same
	// writer the form action calls. The user id comes off the row's own hidden input.
	const apRow = page
		.locator('tr')
		.filter({ has: page.getByText(USERS.approver.email, { exact: true }) })
	// .first(): the row's hidden userId belongs to its ?/setActive form — since #283 the role
	// form lives in the dialog, so there is one here rather than two, but keep the disambiguation
	// in case a second row-level form returns.
	const userId = await apRow.locator('input[name="userId"]').first().inputValue()
	const res = await page.request.patch(`/api/v1/settings/users/${userId}/roles`, {
		data: { roles: ['APPROVER'] }
	})
	expect(res.ok(), `role restore failed: ${res.status()} ${await res.text()}`).toBe(true)

	// KNOWN RESIDUE: the two postings this spec files are NOT removed here. Nothing in the app
	// deletes a job posting — no form action, no v1 route — so a UI-driven teardown cannot clean
	// them. They are uniquely named (E2E-F4-*, timestamped), so they never collide with a later
	// run; the beforeAll above sweeps them at Prisma level on the NEXT run instead, which also
	// covers runs that die before any teardown.
	await ctx.close()
})

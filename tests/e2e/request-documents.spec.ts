import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * #299/AC-5 — soft-deleted request documents, end to end.
 *
 * The sequence is the bug: an approver signs off a supporting document, clears their own sign-off
 * (#283/D11 keeps `verifiedById`), the requester removes that document and uploads a replacement.
 * Before #299 the row went with the file and the signature was gone. Now the row survives as a
 * tombstone, and this spec drives the whole thing through the real form actions.
 *
 * No seed change: request-scoped fixtures are created in-spec and cleaned up in afterAll, the same
 * pattern as approval-chain.spec.ts. prisma/seed-e2e.ts deliberately seeds zero requests.
 */
test.describe.configure({ mode: 'serial' })

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')

const createdIds: string[] = []

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		if (createdIds.length) await db.request.deleteMany({ where: { id: { in: createdIds } } })
		await db.request.deleteMany({ where: { reason: 'e2e soft-delete docs' } })
	} finally {
		await db.$disconnect()
	}
})

const originOf = (page: import('@playwright/test').Page) => ({
	origin: new URL(page.url()).origin
})

// The document ids only surface in the live list's download hrefs, which is enough: this spec never
// needs an id the page does not already show.
async function liveDocIds(page: import('@playwright/test').Page, requestId: string) {
	const html = await (await page.request.get(`/requests/${requestId}`)).text()
	const re = new RegExp(`/api/v1/requests/${requestId}/documents/([A-Za-z0-9_-]+)`, 'g')
	return [...new Set([...html.matchAll(re)].map((m) => m[1]))]
}

test('a removed document keeps its row, its signer and its history entry', async ({ browser }) => {
	// ── the requester files a request and attaches one document ──────────────────────────────
	const empCtx = await browser.newContext()
	const emp = await empCtx.newPage()
	await login(emp, USERS.employee)

	const created = await emp.request.post('/api/v1/requests', {
		data: { type: 'OVERTIME', date: '2026-08-04', hours: 2, reason: 'e2e soft-delete docs' },
		headers: { 'content-type': 'application/json' }
	})
	expect(created.status()).toBe(201)
	const id = (await created.json())?.request?.id as string
	expect(id).toBeTruthy()
	createdIds.push(id)

	const upload = async (name: string) =>
		emp.request.post(`/requests/${id}?/uploadDocs`, {
			multipart: { documents: { name, mimeType: 'application/pdf', buffer: PDF } },
			headers: originOf(emp)
		})

	expect((await upload('original.pdf')).status()).toBe(200)
	const [originalId] = await liveDocIds(emp, id)
	expect(originalId).toBeTruthy()

	// ── an approver signs off on it, then clears the sign-off (#283/D11) ─────────────────────
	const apprCtx = await browser.newContext()
	const appr = await apprCtx.newPage()
	await login(appr, USERS.approver)

	const setVerified = (verified: boolean) =>
		appr.request.post(`/requests/${id}?/verifyDoc`, {
			form: { docId: originalId, verified: String(verified) },
			headers: originOf(appr)
		})

	expect((await setVerified(true)).status()).toBe(200)
	expect((await setVerified(false)).status()).toBe(200)

	// ── the requester swaps the document out ─────────────────────────────────────────────────
	const removed = await emp.request.post(`/requests/${id}?/deleteDoc`, {
		form: { docId: originalId },
		headers: originOf(emp)
	})
	expect(removed.status()).toBe(200)
	expect((await upload('replacement.pdf')).status()).toBe(200)

	await emp.goto(`/requests/${id}`, { waitUntil: 'domcontentloaded' })

	// The live list is the DOWNLOAD list: the replacement only. If tombstones leaked back into it
	// the requester would be offered a file that no longer exists.
	const live = emp.locator('h2:has-text("Supporting documents") ~ ul').first()
	await expect(live.locator('li')).toHaveCount(1)
	await expect(live).toContainText('replacement.pdf')
	await expect(live).not.toContainText('original.pdf')

	// The history panel is the AUDIT view: the removed document, and above all its signer — the
	// fact whose disappearance was the entire bug.
	const history = emp.locator('h3:has-text("Removed documents") ~ ul').first()
	await expect(history.locator('li')).toHaveCount(1)
	await expect(history).toContainText('original.pdf')
	await expect(history).toContainText(USERS.approver.email)

	// Read-only by construction — a tombstone can be neither re-removed nor re-verified.
	await expect(history.getByRole('button', { name: 'Remove' })).toHaveCount(0)
	await expect(history.getByRole('button', { name: /verif/i })).toHaveCount(0)

	// D-3, and the most counter-intuitive assertion in this spec on purpose: the ROUTE serves a
	// tombstone while its bytes survive. The 404 is keyed on the bytes being gone, never on
	// `deletedAt` — a naive 404-on-tombstone would break the audit trail's one remaining use, and
	// if D-3 is ever softened this is the line that must break loudly rather than be relaxed.
	const direct = await emp.request.get(`/api/v1/requests/${id}/documents/${originalId}`)
	expect(direct.status()).toBe(200)

	// The row is never deleted, whatever happens to the bytes.
	const db = new PrismaClient()
	try {
		const row = await db.requestDocument.findUnique({ where: { id: originalId } })
		expect(row).not.toBeNull()
		expect(row?.deletedAt).not.toBeNull()
		expect(row?.verifiedById).not.toBeNull()
	} finally {
		await db.$disconnect()
	}

	await empCtx.close()
	await apprCtx.close()
})

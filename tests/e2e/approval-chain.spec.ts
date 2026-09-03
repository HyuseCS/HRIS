import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

// #134: the three-stage maker-checker chain. An employee-filed request runs
// MAKE (branch HR) → VERIFY (Verifier) → APPROVE (Approver); any stage may return it
// to the maker with a reason. These tests drive the real chain through each role.
test.describe.configure({ mode: 'serial' })

const createdIds: string[] = []

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		if (createdIds.length) await db.request.deleteMany({ where: { id: { in: createdIds } } })
		// Belt and braces: sweep anything the driver left by its distinctive reasons.
		await db.request.deleteMany({
			where: { reason: { in: ['e2e chain happy', 'e2e chain reject'] } }
		})
	} finally {
		await db.$disconnect()
	}
})

// Helper: file an OT request as employee and capture its id from the JSON response.
async function fileAsEmployee(page: import('@playwright/test').Page, reason: string) {
	await login(page, USERS.employee)
	const res = await page.request.post('/api/v1/requests', {
		data: { type: 'OVERTIME', date: '2026-08-03', hours: 2, reason },
		headers: { 'content-type': 'application/json' }
	})
	expect(res.status()).toBe(201)
	const id = (await res.json())?.request?.id as string
	expect(id).toBeTruthy()
	createdIds.push(id)
	return id
}

// Helper: act on a request's current stage through the approvals form action.
async function decide(
	page: import('@playwright/test').Page,
	id: string,
	decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
	note = ''
) {
	const res = await page.request.post('/requests/approvals?/decideRequest', {
		form: { id, decision, note },
		headers: { origin: new URL(page.url()).origin }
	})
	return res.status()
}

test('happy path: employee → HR make → verifier → approver → APPROVED', async ({ browser }) => {
	const empCtx = await browser.newContext()
	const id = await fileAsEmployee(await empCtx.newPage(), 'e2e chain happy')
	await empCtx.close()

	// MAKE — branch HR (Super Admin holds MANAGE_HR) acts first.
	const hrCtx = await browser.newContext()
	const hrPage = await hrCtx.newPage()
	await login(hrPage, USERS.admin)
	expect(await decide(hrPage, id, 'APPROVED')).toBe(200)
	await hrCtx.close()

	// VERIFY — the Verifier.
	const vCtx = await browser.newContext()
	const vPage = await vCtx.newPage()
	await login(vPage, USERS.verifier)
	expect(await decide(vPage, id, 'APPROVED', 'numbers match')).toBe(200)
	await vCtx.close()

	// APPROVE — the Approver commits it.
	const aCtx = await browser.newContext()
	const aPage = await aCtx.newPage()
	await login(aPage, USERS.approver)
	expect(await decide(aPage, id, 'APPROVED')).toBe(200)

	await aPage.goto(`/requests/${id}`, { waitUntil: 'domcontentloaded' })
	const text = await aPage.locator('body').innerText()
	expect(text).toMatch(/approved/i)
	expect(text).toMatch(/Filed/)
	expect(text).toMatch(/Verified/)
	await aCtx.close()
})

test('reject at verify returns the request to the maker', async ({ browser }) => {
	const empCtx = await browser.newContext()
	const id = await fileAsEmployee(await empCtx.newPage(), 'e2e chain reject')
	await empCtx.close()

	// MAKE approved, then the Verifier returns it with a reason.
	const hrCtx = await browser.newContext()
	const hrPage = await hrCtx.newPage()
	await login(hrPage, USERS.admin)
	expect(await decide(hrPage, id, 'APPROVED')).toBe(200)
	await hrCtx.close()

	const vCtx = await browser.newContext()
	const vPage = await vCtx.newPage()
	await login(vPage, USERS.verifier)
	expect(await decide(vPage, id, 'RETURNED', 'missing manager sign-off')).toBe(200)

	await vPage.goto(`/requests/${id}`, { waitUntil: 'domcontentloaded' })
	const text = await vPage.locator('body').innerText()
	expect(text).toMatch(/RETURNED/)
	expect(text).toMatch(/missing manager sign-off/)
	await vCtx.close()
})

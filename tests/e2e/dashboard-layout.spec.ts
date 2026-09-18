import { test, expect, type Locator, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * Dashboard layout (18-09-26 plan): the decision cards are title-row icon buttons that open
 * an anchored dropdown panel, the page renders three zones, and no zone row ends with an orphan.
 *
 * These are the suite's first computed-style assertions. They measure `getComputedStyle`
 * rather than the rendered box, because a panel can be 400px tall by accident — one row
 * short of the cap proves nothing about the cap.
 *
 * The bounds group asserts its button is on screen BEFORE opening it. A missing
 * precondition has to fail loudly; a skipped measurement would read as a pass.
 */

const STAMP = Date.now()
const PROBIE = `E2E-LAYOUT-probie-${STAMP}`
const PROBIE_EMAIL = `e2e_layout_${STAMP}@veent.ph`
const POSTING = `E2E-LAYOUT-posting-${STAMP}`

/** startDate + 6 months is already past, so the row is inside the 21-day notice window. */
function probationStartDate() {
	const d = new Date()
	d.setMonth(d.getMonth() - 6)
	d.setDate(d.getDate() - 7)
	return d.toISOString().slice(0, 10)
}

const AWAITING_BUTTON = /awaiting your decision$/
const DECISION_BUTTONS = [
	/upcoming regularizations$/,
	/postings awaiting your approval$/,
	AWAITING_BUTTON
]

function decisionButton(page: Page, name: RegExp) {
	return page.getByRole('main').getByRole('button', { name })
}

async function openPanel(page: Page, button: Locator, name: string) {
	const panel = page.getByRole('region', { name })
	await expect(async () => {
		await button.click()
		await expect(panel).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })
	return panel
}

async function boundsOf(panel: Locator) {
	return panel.evaluate((el) => {
		const list = el.querySelector('ul')
		if (!list) throw new Error('panel has no row list')
		const box = el.getBoundingClientRect()
		return {
			overflowY: getComputedStyle(list).overflowY,
			height: box.height,
			bottom: box.bottom,
			cap: Number.parseFloat(getComputedStyle(el).maxHeight),
			viewport: window.innerHeight
		}
	})
}

async function badgeCount(button: Locator) {
	const label = (await button.getAttribute('aria-label')) ?? ''
	const match = /^(\d+) /.exec(label)
	if (!match) throw new Error(`accessible name does not start with a count: "${label}"`)
	return Number(match[1])
}

test.describe('(a) the decision panels are bounded and scroll their rows', () => {
	test.describe.configure({ mode: 'serial' })

	test.afterAll(async () => {
		const db = new PrismaClient()
		try {
			// The service filters employmentStatus ACTIVE, so offboarding the fixture takes the
			// row back off the card without deleting a record other specs may have counted.
			await db.employee.updateMany({
				where: { user: { email: PROBIE_EMAIL } },
				data: { employmentStatus: 'OFFBOARDED' }
			})
			await db.jobPosting.deleteMany({ where: { title: POSTING } })
		} finally {
			await db.$disconnect()
		}
	})

	test('the regularizations panel stays inside the viewport and scrolls its list', async ({
		page
	}) => {
		await login(page, USERS.admin)

		await page.goto('/employees/new', { waitUntil: 'domcontentloaded' })
		await page.waitForLoadState('networkidle')
		await page.getByLabel('First Name').fill('Layout')
		await page.getByLabel('Last Name').fill(PROBIE)
		await page.getByLabel('Email').fill(PROBIE_EMAIL)
		await page.getByLabel('Department').selectOption({ label: 'Human Resources' })
		await page.getByLabel('Job Title').fill('QA Engineer')
		await page.getByLabel('Start Date').fill(probationStartDate())
		await page.getByLabel('Basic Monthly Salary').fill('28000')
		await page.getByRole('button', { name: 'Create Employee' }).click()
		await page.waitForURL(/\/employees\/c[a-z0-9]{10,}$/)

		await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
		const button = decisionButton(page, /upcoming regularizations$/)
		await expect(button).toBeVisible()
		expect(await badgeCount(button)).toBeGreaterThanOrEqual(1)

		const panel = await openPanel(page, button, 'Upcoming Regularizations')
		await expect(panel.getByText(PROBIE)).toBeVisible()
		await expect(
			panel.getByRole('button', { name: 'About upcoming regularizations' })
		).toBeVisible()

		const bounds = await boundsOf(panel)
		expect(bounds.overflowY).toBe('auto')
		expect(bounds.cap).toBeGreaterThan(0)
		expect(bounds.height).toBeLessThanOrEqual(bounds.cap + 0.5)
		expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport + 0.5)
	})

	test('the postings panel stays inside the viewport and scrolls its list', async ({ browser }) => {
		// Its own fixture: reading whatever listPostingsAwaitingApprover already returns passed
		// locally on a dev database full of residue and failed on a freshly seeded CI one. HR
		// files the posting into Human Resources — a department posting-approver-sod.spec.ts
		// never maps, so it falls back to HR — and the SUBMITTER cannot decide it, which is why
		// the panel is read as admin.
		const hrCtx = await browser.newContext()
		const hr = await hrCtx.newPage()
		await login(hr, USERS.hr)
		await hr.goto('/recruitment', { waitUntil: 'domcontentloaded' })
		await hr
			.getByRole('button', { name: /New Job Posting|Create/i })
			.first()
			.click()
		await hr.getByLabel('Job Title').fill(POSTING)
		await hr.getByLabel('Department').selectOption({ label: 'Human Resources' })
		await hr.getByLabel('Description').fill('E2E fixture for the dashboard postings panel.')
		await hr.getByRole('button', { name: 'Create Draft' }).click()
		const row = hr.locator('tr', { hasText: POSTING })
		await expect(row).toBeVisible()
		await row.locator('input[type="checkbox"]').check()
		await hr.getByRole('button', { name: /Submit selected for approval/ }).click()
		await expect(hr.locator('tr', { hasText: POSTING })).toContainText(/PENDING|Pending/i)
		await hrCtx.close()

		const adminCtx = await browser.newContext()
		const page = await adminCtx.newPage()
		await login(page, USERS.admin)
		const button = decisionButton(page, /postings awaiting your approval$/)
		await expect(button).toBeVisible()
		expect(await badgeCount(button)).toBeGreaterThanOrEqual(1)

		const panel = await openPanel(page, button, 'Postings awaiting your approval')
		await expect(panel.getByText(POSTING)).toBeVisible()

		const bounds = await boundsOf(panel)
		expect(bounds.overflowY).toBe('auto')
		expect(bounds.cap).toBeGreaterThan(0)
		expect(bounds.height).toBeLessThanOrEqual(bounds.cap + 0.5)
		expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport + 0.5)
		await adminCtx.close()
	})
})

test.describe('(b) each role sees the same cards, in zones', () => {
	const ZONES = ['AT A GLANCE', 'FEED', 'DOORS']

	// employee@veent.ph is wiped by global-setup on every invocation, so its Recent Activity
	// card may or may not render. Assert the headings and the D1/D3 invariants, never a count.
	test('an employee has no decision buttons and no payroll tile', async ({ page }) => {
		await login(page, USERS.employee)
		for (const zone of ZONES) {
			await expect(page.getByRole('heading', { name: zone })).toBeVisible()
		}
		await expect(page.getByRole('heading', { name: 'NEEDS A DECISION' })).toHaveCount(0)
		for (const name of DECISION_BUTTONS) {
			await expect(decisionButton(page, name)).toHaveCount(0)
		}
		await expect(page.getByRole('link', { name: /Last Payroll/i })).toHaveCount(0)
	})

	for (const [role, user] of [
		['hr', USERS.hr],
		['admin', USERS.admin],
		['ceo', USERS.ceo]
	] as const) {
		test(`${role} sees the three zones, the payroll tile and a decision button`, async ({
			page
		}) => {
			await login(page, user)
			for (const zone of ZONES) {
				await expect(page.getByRole('heading', { name: zone })).toBeVisible()
			}
			await expect(page.getByRole('heading', { name: 'NEEDS A DECISION' })).toHaveCount(0)
			await expect(page.getByRole('link', { name: /Last Payroll/i })).toBeVisible()

			let shown = 0
			for (const name of DECISION_BUTTONS) {
				const button = decisionButton(page, name)
				if (role === 'hr') await expect(button).toBeVisible()
				if ((await button.count()) === 0) continue
				await expect(button).toBeVisible()
				const badge = button.locator('span')
				if ((await badge.count()) === 0) continue
				await expect(badge).toHaveText(/^\d+$/)
				expect(Number(await badge.innerText())).toBeGreaterThan(0)
				if (name === AWAITING_BUTTON) {
					const panel = await openPanel(page, button, 'Awaiting you')
					await expect(panel.locator('li a').first()).toBeVisible()
				}
				shown++
			}
			expect(shown, 'no decision button rendered for a role that has decisions').toBeGreaterThan(0)
		})
	}
})

test.describe('(d) an entitled role with nothing pending sees the button, not a badge', () => {
	test('a payroll officer has an empty awaiting-you panel', async ({ page }) => {
		await login(page, USERS.payroll)
		const button = decisionButton(page, AWAITING_BUTTON)
		await expect(button).toBeVisible()
		await expect(button.locator('span')).toHaveCount(0)

		const panel = await openPanel(page, button, 'Awaiting you')
		await expect(panel.getByText('Nothing pending.')).toBeVisible()
	})
})

test.describe('(c) no zone row ends with an orphan card at lg', () => {
	for (const [role, user] of [
		['employee', USERS.employee],
		['admin', USERS.admin]
	] as const) {
		test(`${role} zone grids divide evenly at 1440`, async ({ page }) => {
			await page.setViewportSize({ width: 1440, height: 1000 })
			await login(page, user)

			const grids = page.locator('[data-zone]')
			const count = await grids.count()
			expect(count).toBeGreaterThan(0)

			for (let i = 0; i < count; i++) {
				const grid = grids.nth(i)
				const shape = await grid.evaluate((el) => ({
					zone: (el as HTMLElement).dataset.zone,
					children: el.children.length,
					tracks: getComputedStyle(el).gridTemplateColumns.split(' ').length
				}))
				// A zone that renders one card is legitimately one track; any other count that
				// collapses to one means cols() emitted a class Tailwind never built (R2).
				if (shape.children > 1) {
					expect(shape.tracks, `${shape.zone} collapsed to one lg column`).toBeGreaterThan(1)
				}
				expect(shape.children % shape.tracks, `${shape.zone} leaves an orphan`).toBe(0)
			}
		})
	}
})

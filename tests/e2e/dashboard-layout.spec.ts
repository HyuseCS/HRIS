import { test, expect, type Locator } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * Dashboard layout (17-09-26 plan): the two alert cards are bounded and scroll their rows,
 * the page renders four priority zones, and no zone row ends with an orphan card at lg.
 *
 * These are the suite's first computed-style assertions. They measure `getComputedStyle`
 * rather than the rendered box, because a card can be 320px tall by accident — one row
 * short of the cap proves nothing about the cap.
 *
 * The bounds group asserts its card is on screen BEFORE measuring it. A missing
 * precondition has to fail loudly; a skipped measurement would read as a pass.
 */

const STAMP = Date.now()
const PROBIE = `E2E-LAYOUT-probie-${STAMP}`
const PROBIE_EMAIL = `e2e_layout_${STAMP}@veent.ph`

/** startDate + 6 months is already past, so the row is inside the 21-day notice window. */
function probationStartDate() {
	const d = new Date()
	d.setMonth(d.getMonth() - 6)
	d.setDate(d.getDate() - 7)
	return d.toISOString().slice(0, 10)
}

async function boundsOf(card: Locator) {
	return card.evaluate((el) => {
		const list = el.querySelector('ul')
		if (!list) throw new Error('card has no row list')
		return {
			maxHeight: getComputedStyle(el).maxHeight,
			minHeight: getComputedStyle(el).minHeight,
			overflowY: getComputedStyle(list).overflowY,
			height: el.getBoundingClientRect().height
		}
	})
}

test.describe('(a) the alert cards are bounded and scroll their rows', () => {
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
		} finally {
			await db.$disconnect()
		}
	})

	test('the regularizations card stops at 320px and scrolls its list', async ({ page }) => {
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
		const card = page.locator('div.card', { hasText: 'Upcoming Regularizations' })
		await expect(card).toBeVisible()
		await expect(card.getByText(PROBIE)).toBeVisible()

		const bounds = await boundsOf(card)
		expect(bounds.maxHeight).toBe('320px')
		expect(bounds.minHeight).toBe('112px')
		expect(bounds.overflowY).toBe('auto')
		expect(bounds.height).toBeLessThanOrEqual(320.5)
	})

	test('the postings card stops at 320px and scrolls its list', async ({ page }) => {
		// No fixture: this card is driven by whatever listPostingsAwaitingApprover already
		// returns for the account under test. Building one would rewrite the department
		// mapping posting-approver-sod.spec.ts owns and restores, and that spec races this
		// one whenever workers > 1.
		await login(page, USERS.hr)
		const card = page.locator('div.card', { hasText: 'Postings awaiting your approval' })
		await expect(card).toBeVisible()

		const bounds = await boundsOf(card)
		expect(bounds.maxHeight).toBe('320px')
		expect(bounds.minHeight).toBe('112px')
		expect(bounds.overflowY).toBe('auto')
		expect(bounds.height).toBeLessThanOrEqual(320.5)
	})
})

test.describe('(b) each role sees the same cards, in zones', () => {
	const ZONES = ['AT A GLANCE', 'FEED', 'DOORS']

	// employee@veent.ph is wiped by global-setup on every invocation, so its Recent Activity
	// card may or may not render. Assert the headings and the D1/D3 invariants, never a count.
	test('an employee has no decision zone and no payroll tile', async ({ page }) => {
		await login(page, USERS.employee)
		for (const zone of ZONES) {
			await expect(page.getByRole('heading', { name: zone })).toBeVisible()
		}
		await expect(page.getByRole('heading', { name: 'NEEDS A DECISION' })).toHaveCount(0)
		await expect(page.getByRole('link', { name: /Last Payroll/i })).toHaveCount(0)
	})

	for (const [role, user] of [
		['hr', USERS.hr],
		['admin', USERS.admin],
		['ceo', USERS.ceo]
	] as const) {
		test(`${role} sees all four zones and the payroll tile`, async ({ page }) => {
			await login(page, user)
			for (const zone of ['NEEDS A DECISION', ...ZONES]) {
				await expect(page.getByRole('heading', { name: zone })).toBeVisible()
			}
			await expect(page.getByRole('link', { name: /Last Payroll/i })).toBeVisible()
		})
	}
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

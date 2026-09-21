import { test, expect, type Page } from '@playwright/test'
import { login, USERS } from './helpers'

/**
 * N1 (owner click pass 18-09-26 / D6, revised 21-09-26): the attendance view switch is
 * two states — `Whole team` and `By employee` — plus a second labelled switch, styled the
 * same way, that flips matrix <-> per-day: `Week grid` / `Single day`. `?view=` values are
 * unchanged, so every saved link still resolves.
 */

const WHOLE_TEAM = { name: 'Whole team', exact: true } as const
const BY_EMPLOYEE = { name: 'By employee', exact: true } as const
const TO_DAY = { name: 'Single day', exact: true } as const
const TO_GRID = { name: 'Week grid', exact: true } as const

function flip(page: Page, names: { name: string; exact: true }) {
	return page.getByRole('link', names)
}

/** Follow the flip link once from the week grid to learn the server's default day. */
async function teamUrlFromFlip(page: Page) {
	await page.goto('/attendance?view=matrix', { waitUntil: 'domcontentloaded' })
	await flip(page, TO_DAY).click()
	await expect(page).toHaveURL(/view=team/)
	return page.url()
}

test.describe('Attendance view switch (N1)', () => {
	test('switch shows two states', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/attendance', { waitUntil: 'domcontentloaded' })

		await expect(page.getByRole('link', WHOLE_TEAM)).toHaveCount(1)
		await expect(page.getByRole('link', BY_EMPLOYEE)).toHaveCount(1)
		await expect(page.getByRole('link', { name: 'Team day' })).toHaveCount(0)
		await expect(page.getByRole('link', TO_GRID)).toHaveCount(1)
		await expect(page.getByRole('link', TO_DAY)).toHaveCount(1)
	})

	test('flip to per day in one click', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/attendance?view=matrix', { waitUntil: 'domcontentloaded' })

		const toDay = flip(page, TO_DAY)
		await expect(toDay).toHaveCount(1)
		await toDay.click()

		await expect(page).toHaveURL(/view=team/)
		await expect(page.getByLabel('Day')).toBeVisible()
	})

	test('flip round trip', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/attendance?view=matrix', { waitUntil: 'domcontentloaded' })

		await flip(page, TO_DAY).click()
		await expect(page).toHaveURL(/view=team/)

		const toGrid = flip(page, TO_GRID)
		await expect(toGrid).toHaveCount(1)
		await toGrid.click()

		await expect(page).toHaveURL(/view=matrix/)
		await expect(flip(page, TO_DAY)).toHaveCount(1)
	})

	test('Whole team lands on the grid', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/attendance?view=employee', { waitUntil: 'domcontentloaded' })

		await expect(flip(page, TO_DAY)).toHaveCount(0)
		await expect(flip(page, TO_GRID)).toHaveCount(0)

		await page.getByRole('link', WHOLE_TEAM).click()

		await expect(page).toHaveURL(/view=matrix/)
		await expect(page.getByRole('heading', { name: /^(Team|Branch) Attendance$/ })).toBeVisible()
	})

	test('url contract unchanged', async ({ page }) => {
		await login(page, USERS.hr)

		const teamUrl = await teamUrlFromFlip(page)
		expect(teamUrl).toMatch(/view=team&date=\d{4}-\d{2}-\d{2}/)

		await page.goto('/attendance?view=employee', { waitUntil: 'domcontentloaded' })
		const employeeId = await page.getByLabel('Employee').inputValue()
		expect(employeeId).not.toBe('')

		await page.goto('/attendance?view=matrix', { waitUntil: 'domcontentloaded' })
		await expect(page.getByRole('heading', { name: /^(Team|Branch) Attendance$/ })).toBeVisible()

		await page.goto(teamUrl, { waitUntil: 'domcontentloaded' })
		await expect(page.getByLabel('Day')).toBeVisible()

		await page.goto(`/attendance?view=employee&employeeId=${employeeId}&from=&to=`, {
			waitUntil: 'domcontentloaded'
		})
		await expect(page.getByLabel('Employee')).toBeVisible()
		expect(await page.getByLabel('Employee').inputValue()).toBe(employeeId)
	})

	test('per day controls are one row', async ({ page }) => {
		await login(page, USERS.hr)
		// Wide enough that a one-row bar cannot be forced to wrap; the pre-N1 layout put the
		// Day picker in its own block above the divider at every width, so this stays red-capable.
		await page.setViewportSize({ width: 1600, height: 900 })
		await page.goto('/attendance?view=team', { waitUntil: 'domcontentloaded' })

		const day = page.getByLabel('Day')
		const bulk = page.getByRole('button', { name: 'Lock day', exact: true })
		await expect(day).toBeVisible()
		await expect(bulk).toBeVisible()

		const d = (await day.boundingBox())!
		const b = (await bulk.boundingBox())!

		expect(
			Math.abs(d.y + d.height / 2 - (b.y + b.height / 2)),
			'Day picker and Lock day share one row'
		).toBeLessThanOrEqual(24)
		expect(d.x, 'Day picker sits right of the bulk buttons').toBeGreaterThan(b.x + b.width)

		await expect(page.locator('.border-t').filter({ has: bulk })).toHaveCount(0)
	})

	test('employee view controls untouched', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/attendance?view=employee', { waitUntil: 'domcontentloaded' })
		const employeeId = await page.getByLabel('Employee').inputValue()
		await page.goto(`/attendance?view=employee&employeeId=${employeeId}`, {
			waitUntil: 'domcontentloaded'
		})

		await expect(page.getByLabel('Employee')).toBeVisible()
		await expect(page.getByLabel('From')).toBeVisible()
		await expect(page.getByLabel('To')).toBeVisible()
		await expect(page.getByText('Quick pick:')).toBeVisible()
		await expect(page.getByText(/Range is capped at/)).toBeVisible()
	})

	test('keyboard order and names', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/attendance?view=matrix', { waitUntil: 'domcontentloaded' })

		// The title row's own control is the N7 `?` button; Tab order continues from there into
		// the switch, which is the "tabbing from the page title" order N1-AC8 names.
		await page.getByRole('button', { name: 'About Attendance', exact: true }).focus()

		for (const expected of ['Whole team', 'By employee', 'Week grid', 'Single day']) {
			await page.keyboard.press('Tab')
			const name = await page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null
				return el?.getAttribute('aria-label') ?? el?.textContent?.trim() ?? ''
			})
			expect(name, `tab order reaches ${expected}`).toBe(expected)
		}

		const toDay = flip(page, TO_DAY)
		expect((await toDay.textContent())?.trim()).toBeTruthy()
		expect(
			await toDay.evaluate((el) => el.matches(':focus-visible')),
			'the flip link shows its focus ring'
		).toBe(true)

		const focusedShadow = await toDay.evaluate((el) => getComputedStyle(el).boxShadow)
		await page.getByRole('button', { name: 'About Attendance', exact: true }).focus()
		const restingShadow = await toDay.evaluate((el) => getComputedStyle(el).boxShadow)
		expect(focusedShadow, 'the focus ring is a visible change').not.toBe(restingShadow)
	})
})

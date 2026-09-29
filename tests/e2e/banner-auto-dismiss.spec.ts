import { test, expect, type Page } from '@playwright/test'
import { login, USERS } from './helpers'

const T0 = new Date('2026-01-05T09:00:00Z').getTime()
const HOUR = 60 * 60 * 1000

async function openBenefitsCreate(page: Page) {
	await page.clock.install({ time: T0 })
	await login(page, USERS.admin)
	await page.goto('/benefits', { waitUntil: 'domcontentloaded' })
	const form = page.locator('form[action*="createPlan"]')
	await expect(async () => {
		await page.getByRole('button', { name: 'Add Plan' }).click()
		await expect(form).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })
	await page.clock.pauseAt(T0 + HOUR)
	return form
}

async function submitEmptyPlan(page: Page, form: ReturnType<Page['locator']>) {
	await form.locator('input[name="name"]').evaluate((el: HTMLInputElement) => {
		el.removeAttribute('required')
		el.value = ''
	})
	await form.getByRole('button', { name: 'Create', exact: true }).click()
}

test('a result banner closes after the toast timeout, pauses on hover and re-arms', async ({
	page
}) => {
	const form = await openBenefitsCreate(page)
	await submitEmptyPlan(page, form)

	const alert = page.getByRole('alert')
	await expect(alert).toBeVisible()
	await page.clock.runFor(5999)
	await expect(alert).toBeVisible()

	await alert.hover()
	await page.clock.runFor(60_000)
	await expect(alert).toBeVisible()

	await page.mouse.move(0, 0)
	await page.clock.runFor(6000)
	await expect(page.getByRole('alert')).toHaveCount(0)
	await expect(page.getByRole('alert', { includeHidden: true })).toHaveCount(1)

	await submitEmptyPlan(page, form)
	await expect(alert).toBeVisible()
	await page.clock.runFor(5999)
	await expect(alert).toBeVisible()
	await page.clock.runFor(1)
	await expect(page.getByRole('alert')).toHaveCount(0)
})

test('an employee card error submitted by mouse closes after the toast timeout', async ({
	page
}) => {
	await page.clock.install({ time: T0 })
	await login(page, USERS.admin)
	await page.goto('/team', { waitUntil: 'domcontentloaded' })
	await page.waitForLoadState('networkidle')
	await page.locator('a[href^="/employees/"]:not([href*="/new"])').first().click()
	await page.waitForURL(/\/employees\/[^/?]+/)
	await page.waitForLoadState('networkidle')

	const card = page
		.locator('section')
		.filter({ has: page.locator(':scope > h2', { hasText: 'Emergency Contacts' }) })
	const form = card.locator('form[action*="addEmergencyContact"]')
	await expect(form).toBeVisible()
	await page.clock.pauseAt(T0 + HOUR)

	await form.locator('input').evaluateAll((els: HTMLInputElement[]) => {
		for (const el of els) {
			el.removeAttribute('required')
			el.value = ''
		}
	})
	await form.getByRole('button', { name: 'Add Contact' }).click()

	const alert = card.getByRole('alert')
	await expect(alert).toBeVisible()
	await page.mouse.move(0, 0)
	await page.clock.runFor(5999)
	await expect(alert).toBeVisible()
	await page.clock.runFor(1)
	await expect(card.getByRole('alert')).toHaveCount(0)
	await expect(card.getByRole('alert', { includeHidden: true })).toHaveCount(1)
})

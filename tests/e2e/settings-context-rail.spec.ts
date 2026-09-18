import { test, expect, type Locator, type Page } from '@playwright/test'
import type { Role } from '@prisma/client'
import { SETTINGS_GROUP_ORDER, visibleSettings } from '../../src/lib/settings-destinations'
import { login, USERS } from './helpers'

/**
 * N2 — the settings Context Rail (phase 07 design lane, D4/D11/D14).
 *
 * The bar lists GROUPS, and only a sub-page adds a second row of that group's siblings. On
 * /settings there are no siblings, so the old hub/sub-nav duplication is gone by construction
 * rather than by a dedupe rule.
 *
 * Every expected count is derived from `src/lib/settings-destinations.ts` for the role under
 * test, never written as a literal: the group row is 5 chips for SUPER_ADMIN and HR_ADMIN but
 * 4 for MANAGER, because both `System` entries are capability-gated. A toHaveCount(5) here
 * would be red on a correct Manager page.
 *
 * Read-only — no fixtures, no teardown.
 */

test.describe.configure({ mode: 'serial' })

const ROLES = [
	{ label: 'Super Admin', user: USERS.admin, roles: ['SUPER_ADMIN'] as Role[] },
	{ label: 'HR Admin', user: USERS.hr, roles: ['HR_ADMIN'] as Role[] },
	{ label: 'Manager', user: USERS.manager, roles: ['MANAGER'] as Role[] }
]

const WIDTHS = [390, 1280, 1920]

const SUB_PAGE = '/settings/holidays'

const rail = (page: Page) => page.getByRole('navigation', { name: 'Settings sections' })
// The rail's rows are its direct children: the group row always, the sibling row only on a
// sub-page. `xpath=./div` is the relative form Playwright resolves against the nav itself.
const railRows = (page: Page) => rail(page).locator('xpath=./div')
const groupRow = (page: Page) => railRows(page).first()
const siblingRow = (page: Page) => railRows(page).nth(1)
const hub = (page: Page) => page.getByRole('region', { name: 'Settings destinations' })

const groupsFor = (roles: Role[]) => {
	const visible = visibleSettings(roles)
	return SETTINGS_GROUP_ORDER.filter((g) => visible.some((d) => d.group === g))
}

const linkTexts = async (scope: Locator) =>
	(await scope.getByRole('link').allInnerTexts()).map((t) => t.trim())

async function activeElement(page: Page) {
	return page.evaluate(() => {
		const el = document.activeElement as HTMLElement | null
		if (!el || el === document.body) return null
		return {
			id: el.id,
			text: (el.innerText ?? '').trim().split('\n')[0] ?? '',
			inRail: !!el.closest('nav[aria-label="Settings sections"]'),
			boxShadow: getComputedStyle(el).boxShadow
		}
	})
}

/**
 * Walk the real tab order. The ring is only asserted on an element reached by a genuine
 * keypress: Chromium paints :focus-visible from the last interaction type, so a programmatic
 * .focus() after a click can leave a correct ring unpainted.
 */
async function tabTrail(page: Page, stop: (el: { id: string; inRail: boolean }) => boolean) {
	const trail: { id: string; text: string; inRail: boolean; boxShadow: string }[] = []
	for (let i = 0; i < 120; i++) {
		await page.keyboard.press('Tab')
		const el = await activeElement(page)
		if (!el) continue
		trail.push(el)
		if (stop(el)) return trail
	}
	return trail
}

/**
 * Step 5's pre-flight, kept as a test instead of a throwaway file: if the relative import of
 * the app module stops resolving under the Playwright runner, this file fails loudly at
 * collection instead of contributing a silent zero to a green run.
 */
test('settings-destinations resolves under the Playwright runner', () => {
	expect(SETTINGS_GROUP_ORDER).toHaveLength(5)
	expect(visibleSettings(['SUPER_ADMIN'] as Role[])).toHaveLength(17)
	expect(visibleSettings(['HR_ADMIN'] as Role[])).toHaveLength(14)
	expect(visibleSettings(['MANAGER'] as Role[])).toHaveLength(12)
	expect(groupsFor(['MANAGER'] as Role[])).toHaveLength(4)
})

// N2-T1 — N2-AC1
for (const { label, user, roles } of ROLES) {
	test(`N2-T1 ${label}: bar lists groups only`, async ({ page }) => {
		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })

		expect(await linkTexts(groupRow(page))).toEqual(['All settings', ...groupsFor(roles)])

		// ...and no destination label is reachable as a link anywhere in the rail.
		for (const d of visibleSettings(roles)) {
			await expect(rail(page).getByRole('link', { name: d.label, exact: true })).toHaveCount(0)
		}
	})
}

// N2-T2 — N2-AC2
for (const { label, user, roles } of ROLES) {
	test(`N2-T2 ${label}: no destination is listed twice on the hub`, async ({ page }) => {
		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })

		for (const d of visibleSettings(roles)) {
			await expect(rail(page).getByRole('link', { name: d.label, exact: true })).toHaveCount(0)
			await expect(hub(page).getByRole('link', { name: d.label, exact: true })).toHaveCount(1)
		}
	})
}

// N2-T3 — N2-AC3
for (const { label, user, roles } of ROLES) {
	test(`N2-T3 ${label}: siblings only, sub-page only`, async ({ page }) => {
		await login(page, user)

		await page.goto('/settings', { waitUntil: 'domcontentloaded' })
		await expect(railRows(page)).toHaveCount(1)

		await page.goto(SUB_PAGE, { waitUntil: 'domcontentloaded' })
		await expect(railRows(page)).toHaveCount(2)

		const visible = visibleSettings(roles)
		const currentGroup = visible.find((d) => d.href === SUB_PAGE)?.group
		expect(currentGroup, `${SUB_PAGE} is not a destination visible to ${label}`).toBeTruthy()
		const expected = visible.filter((d) => d.group === currentGroup)

		expect(await linkTexts(siblingRow(page))).toEqual(expected.map((d) => d.label))
		// No other group's destination leaked into the row.
		for (const other of visible.filter((x) => x.group !== currentGroup)) {
			await expect(
				siblingRow(page).getByRole('link', { name: other.label, exact: true })
			).toHaveCount(0)
		}
	})
}

// N2-T4 — N2-AC4
test('N2-T4 search filters the cards only', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 })
	await login(page, USERS.admin)
	await page.goto('/settings', { waitUntil: 'domcontentloaded' })

	const search = page.getByLabel('Search settings')
	const cards = hub(page).getByRole('link')
	const railLinks = groupRow(page).getByRole('link')
	const sidebarLinks = page.getByRole('navigation', { name: 'Main' }).getByRole('link')

	const all = await cards.count()
	const railBefore = await railLinks.count()
	const sidebarBefore = await sidebarLinks.count()
	expect(all).toBeGreaterThan(0)

	// Beside the heading, not under it: same line, and clear of it horizontally.
	const heading = page.getByRole('heading', { name: 'Settings', level: 1 })
	const headingBox = await heading.boundingBox()
	const searchBox = await search.boundingBox()
	if (!headingBox || !searchBox) throw new Error('heading or search control is not laid out')
	expect(
		Math.abs(headingBox.y + headingBox.height / 2 - (searchBox.y + searchBox.height / 2))
	).toBeLessThanOrEqual(24)
	expect(searchBox.x).toBeGreaterThan(headingBox.x + headingBox.width)

	await search.fill('holiday')
	await expect(cards).not.toHaveCount(all)
	const filtered = await cards.count()
	expect(filtered).toBeGreaterThan(0)
	for (const name of await cards.allInnerTexts()) {
		expect(name.toLowerCase()).toContain('holiday')
	}
	// The filter is over the cards and nothing else.
	await expect(railLinks).toHaveCount(railBefore)
	await expect(sidebarLinks).toHaveCount(sidebarBefore)

	await search.fill('')
	await expect(cards).toHaveCount(all)

	await search.fill('zzzznotathing')
	await expect(cards).toHaveCount(0)
	await expect(hub(page).getByText(/No settings match/)).toContainText('zzzznotathing')

	// Below `sm` it takes its own row instead of squeezing the title.
	await search.fill('')
	await page.setViewportSize({ width: 390, height: 900 })
	const narrowHeading = await heading.boundingBox()
	const narrowSearch = await search.boundingBox()
	if (!narrowHeading || !narrowSearch) throw new Error('heading or search control is not laid out')
	expect(narrowSearch.y).toBeGreaterThanOrEqual(narrowHeading.y + narrowHeading.height)
})

// N2-T5 — N2-AC5
for (const width of WIDTHS) {
	test(`N2-T5 one line at ${width} for every role`, async ({ browser }) => {
		const heights: number[] = []
		for (const { label, user } of ROLES) {
			const context = await browser.newContext({ viewport: { width, height: 900 } })
			const page = await context.newPage()
			try {
				await login(page, user)
				await page.goto('/settings', { waitUntil: 'domcontentloaded' })

				// One line means every chip shares a top edge — a height check alone cannot tell a
				// single line from two overlapping ones.
				const tops = await groupRow(page)
					.getByRole('link')
					.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
				expect(tops.length, `${label} at ${width} rendered no chips`).toBeGreaterThan(1)
				expect(new Set(tops).size, `${label} at ${width} wrapped the group row`).toBe(1)

				const box = await groupRow(page).boundingBox()
				if (!box) throw new Error('group row is not laid out')
				heights.push(Math.round(box.height))
			} finally {
				await context.close()
			}
		}
		expect(new Set(heights).size, `group row height changes by role at ${width}`).toBe(1)
	})
}

// N2-T6 — N2-AC5
test('N2-T6 no sideways scroll', async ({ page }) => {
	await login(page, USERS.admin)
	for (const width of WIDTHS) {
		await page.setViewportSize({ width, height: 900 })
		for (const path of ['/settings', SUB_PAGE]) {
			await page.goto(path, { waitUntil: 'domcontentloaded' })
			await expect(rail(page)).toBeVisible()
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			)
			expect(overflow, `${path} scrolls sideways at ${width}`).toBe(0)
		}
	}
})

// N2-T7a — N2-AC6
test('N2-T7a current state is marked on the rail', async ({ page }) => {
	await login(page, USERS.admin)
	const groups = groupsFor(['SUPER_ADMIN'] as Role[])

	await page.goto('/settings', { waitUntil: 'domcontentloaded' })
	const allSettings = rail(page).getByRole('link', { name: 'All settings', exact: true })
	await expect(allSettings).toHaveAttribute('aria-current', 'page')

	const group = groups[1]
	await rail(page).getByRole('link', { name: group, exact: true }).click()
	await page.waitForURL(/\/settings\?g=/)
	await expect(rail(page).getByRole('link', { name: group, exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	)
	await expect(allSettings).not.toHaveAttribute('aria-current', /.*/)

	await page.goto(SUB_PAGE, { waitUntil: 'domcontentloaded' })
	const currentLabel = visibleSettings(['SUPER_ADMIN'] as Role[]).find((d) => d.href === SUB_PAGE)
		?.label as string
	await expect(
		siblingRow(page).getByRole('link', { name: currentLabel, exact: true })
	).toHaveAttribute('aria-current', 'page')
})

// N2-T7b — N2-AC6
test('N2-T7b every rail link takes a visible focus ring', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/settings', { waitUntil: 'domcontentloaded' })
	await expect(rail(page)).toBeVisible()

	const trail = await tabTrail(page, (el) => el.inRail)
	const focused = trail.at(-1)
	expect(focused?.inRail, 'the tab walk never reached a rail link').toBe(true)
	expect(focused?.boxShadow, 'a Tab-focused rail link paints no ring').not.toBe('none')
})

// N2-T7c — N2-AC6
test('N2-T7c tab order runs All settings → groups → search', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/settings', { waitUntil: 'domcontentloaded' })
	await expect(rail(page)).toBeVisible()

	const trail = await tabTrail(page, (el) => el.id === 'settings-search')
	const searchAt = trail.findIndex((el) => el.id === 'settings-search')
	expect(searchAt, 'the tab walk never reached the search box').toBeGreaterThan(-1)

	const railAt = trail.map((el, i) => (el.inRail ? i : -1)).filter((i) => i > -1)
	expect(railAt.length, 'the tab walk reached no rail link').toBeGreaterThan(0)
	expect(Math.max(...railAt), 'the search box comes before the last group link').toBeLessThan(
		searchAt
	)
	expect(trail.filter((el) => el.inRail).map((el) => el.text)).toEqual([
		'All settings',
		...groupsFor(['SUPER_ADMIN'] as Role[])
	])
})

// N2-T7d — N2-AC6
test('N2-T7d the match count is announced politely', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/settings', { waitUntil: 'domcontentloaded' })

	// Scoped to the destinations landmark on purpose: the app layout mounts a Toaster, which
	// renders a polite live region of its own, so a page-wide count is never 1.
	const live = hub(page).locator('[aria-live="polite"]')
	await expect(live).toHaveCount(1)
	await expect(live).toHaveText(/^\d+ of \d+ settings shown$/)

	const before = await live.textContent()
	await page.getByLabel('Search settings').fill('holiday')
	await expect(live).not.toHaveText(before ?? '')
	await expect(live).toHaveText(/^\d+ of \d+ settings shown$/)
})

import { test, expect, type Locator, type Page } from '@playwright/test'
import type { Role } from '@prisma/client'
import { SETTINGS_DESTINATIONS, visibleSettings } from '../../src/lib/settings-destinations'
import { login, USERS } from './helpers'

/**
 * A2 — the three settings surfaces must AGREE, proven in the DOM.
 *
 * `settings-context-rail.spec.ts` already pins the rail's own shape, and its 17/14/12 check is a
 * straight module call: it proves `visibleSettings`, never a rendered page. Everything here is
 * read out of the browser and compared against the array, so a surface that drifts from the
 * source of truth — an EXTRA card for a hidden destination, a sidebar child the hub never shows,
 * one destination under two names — is red even while the module stays green.
 *
 * Set equality, not "each expected one is present": the second form cannot see an extra.
 *
 * CEO is here because nothing else covers it on any settings surface, and it is the only role
 * reaching `Roles & Access` through the MANAGE_USER_ROLES leg rather than ADMINISTER_SYSTEM.
 *
 * Every expected value is derived from `src/lib/settings-destinations.ts` for the role under
 * test; the literals below are asserted against that derivation first, so a `visibleSettings`
 * that returned [] cannot make the loops pass vacuously.
 *
 * Read-only — no fixtures, no teardown.
 */

const ROLES = [
	{ label: 'Super Admin', user: USERS.admin, roles: ['SUPER_ADMIN'] as Role[], hub: 17, side: 8 },
	{ label: 'HR Admin', user: USERS.hr, roles: ['HR_ADMIN'] as Role[], hub: 14, side: 7 },
	{ label: 'Manager', user: USERS.manager, roles: ['MANAGER'] as Role[], hub: 12, side: 7 },
	{ label: 'CEO', user: USERS.ceo, roles: ['CEO'] as Role[], hub: 17, side: 8 }
]

const hub = (page: Page) => page.getByRole('region', { name: 'Settings destinations' })
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' })

/**
 * A hub card is a link wrapping TWO paragraphs — label then description — so its accessible name
 * is the pair concatenated and `getByRole('link', { name: label, exact: true })` silently counts
 * zero. Identify the card by its label paragraph, exactly as the Context Rail spec does.
 */
const hubCard = (page: Page, label: string) =>
	hub(page)
		.getByRole('link')
		.filter({ has: page.getByText(label, { exact: true }) })

/** One snapshot of every card's LABEL — the first paragraph, not the concatenated name. */
const hubLabels = (page: Page) =>
	hub(page)
		.getByRole('link')
		.evaluateAll((els) => els.map((el) => (el.querySelector('p')?.textContent ?? '').trim()))

/**
 * The Settings group's children are the sibling div of its toggle. The group header is a
 * `<button>`, not a link, and it carries the same text as the hub's `h1`, so it is located by
 * role inside `nav[Main]` and the children are taken relative to it — never by a class or a
 * page-wide text match.
 */
const settingsToggle = (page: Page) =>
	mainNav(page).getByRole('button', { name: 'Settings', exact: true })

const settingsChildren = (page: Page) =>
	settingsToggle(page).locator('xpath=./following-sibling::div[1]')

async function openSettingsGroup(page: Page): Promise<Locator> {
	const toggle = settingsToggle(page)
	await expect(toggle).toBeVisible()
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
	await expect(toggle).toHaveAttribute('aria-expanded', 'true')
	return settingsChildren(page)
}

const inSidebarLabels = new Set(
	SETTINGS_DESTINATIONS.filter((d) => d.inSidebar).map((d) => d.label)
)

const sorted = (xs: string[]) => [...xs].sort()

// A2-T1 — the hub card set is exactly visibleSettings(roles).
for (const { label, user, roles, hub: count } of ROLES) {
	test(`A2-T1 ${label}: hub cards are exactly the visible destinations`, async ({ page }) => {
		const expected = visibleSettings(roles).map((d) => d.label)
		expect(expected, `${label} derives no destinations`).toHaveLength(count)

		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })

		await expect(hub(page).getByRole('link')).toHaveCount(count)
		expect(sorted(await hubLabels(page))).toEqual(sorted(expected))
	})
}

// A2-T2 — the sidebar's Settings children are exactly ['All settings', ...visible ∩ inSidebar].
for (const { label, user, roles, side } of ROLES) {
	test(`A2-T2 ${label}: sidebar Settings children match the source`, async ({ page }) => {
		const expected = [
			'All settings',
			...visibleSettings(roles)
				.filter((d) => d.inSidebar)
				.map((d) => d.label)
		]
		expect(expected, `${label} derives no sidebar children`).toHaveLength(side)

		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })

		const children = await openSettingsGroup(page)
		const links = children.getByRole('link')
		await expect(links).toHaveCount(side)
		expect((await links.allInnerTexts()).map((t) => t.trim())).toEqual(expected)
	})
}

// A2-T3 — Roles & Access, scoped separately to each surface, with a positive control.
for (const { label, user, roles } of ROLES) {
	const expected = visibleSettings(roles).some((d) => d.label === 'Roles & Access') ? 1 : 0

	test(`A2-T3 ${label}: Roles & Access is ${expected ? 'on' : 'off'} both surfaces`, async ({
		page
	}) => {
		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })

		// Positive control first: a count of 0 also passes on a blank page, on a bounce to /login,
		// and on a hub that never rendered. Every role sees Holiday Calendar on both surfaces.
		await expect(hubCard(page, 'Holiday Calendar')).toHaveCount(1)
		await expect(
			mainNav(page).getByRole('link', { name: 'Holiday Calendar', exact: true })
		).toHaveCount(1)

		await expect(hubCard(page, 'Roles & Access')).toHaveCount(expected)
		await expect(
			mainNav(page).getByRole('link', { name: 'Roles & Access', exact: true })
		).toHaveCount(expected)
	})
}

// A2-T4 — one destination, one rendered string, on both surfaces that carry it.
for (const { label, user, roles } of ROLES) {
	test(`A2-T4 ${label}: sidebar and hub render the same label`, async ({ page }) => {
		const expected = visibleSettings(roles)
			.filter((d) => d.inSidebar)
			.map((d) => d.label)
		expect(expected.length, `${label} derives no shared destinations`).toBeGreaterThan(0)

		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })

		const children = await openSettingsGroup(page)
		const sidebar = (await children.getByRole('link').allInnerTexts())
			.map((t) => t.trim())
			.filter((t) => t !== 'All settings')
		const cards = (await hubLabels(page)).filter((t) => inSidebarLabels.has(t))

		expect(sidebar).toEqual(expected)
		expect(cards).toEqual(expected)
	})
}

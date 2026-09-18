import { test, expect, type Browser, type Page } from '@playwright/test'
import { login, USERS } from './helpers'

test.describe.configure({ mode: 'serial' })

const VIEWPORTS = [390, 1024, 1280, 1440, 1536, 1920]
const TOLERANCE = 8
const SUMMARY_TEXT = 'Complete later — 12 optional fields'
const SECTION_LINKS = [
	'Personal Information',
	'Contact Information',
	'Account',
	'Employment Details'
]

const TAB_SEQUENCE = [
	'lastName',
	'middleName',
	'contactPhone',
	'contactAddress',
	'email',
	'password',
	'role',
	'discordId',
	'departmentId',
	'jobTitle',
	'employmentType',
	'startDate',
	'Open calendar',
	'rateType',
	'basicMonthlySalary',
	'reportsToId',
	'positionId',
	'workScheduleId'
]

let page: Page
let close: () => Promise<void>

test.beforeAll(async ({ browser }: { browser: Browser }) => {
	const ctx = await browser.newContext()
	page = await ctx.newPage()
	close = () => ctx.close()
	await login(page, USERS.admin)
})

test.afterAll(async () => {
	await close()
})

async function openAt(width: number) {
	await page.setViewportSize({ width, height: 900 })
	await page.goto('/employees/new', { waitUntil: 'domcontentloaded' })
	await page.waitForLoadState('networkidle')
	await expect(page.locator('#sec-personal')).toBeAttached()
}

function formColumn() {
	return page.locator('#sec-personal')
}

function rail() {
	return page.locator('form[action="?/create"] aside')
}

async function boxOf(selector: string) {
	return page.evaluate((sel) => {
		const el = document.querySelector(sel)
		if (!el) throw new Error(`no element for ${sel}`)
		const b = el.getBoundingClientRect()
		return { top: b.top, bottom: b.bottom, width: b.width }
	}, selector)
}

async function expectedFormWidth(width: number) {
	return page.evaluate(
		({ nominal }) => {
			const base = document.documentElement.clientWidth
			const content = nominal >= 1024 ? base - 304 : base - 32
			return nominal >= 1536 ? content - 288 : content
		},
		{ nominal: width }
	)
}

async function tabWalk(steps: number) {
	const stops: string[] = []
	for (let i = 0; i < steps; i++) {
		await page.keyboard.press('Tab')
		stops.push(
			await page.evaluate(() => {
				const el = document.activeElement as HTMLElement | null
				if (!el || el === document.body) return '<body>'
				return el.id || el.getAttribute('aria-label') || (el.textContent ?? '').trim()
			})
		)
	}
	return stops
}

async function domCounts() {
	return page.evaluate(() => {
		const named = (name: string) =>
			Array.from(document.querySelectorAll('button, a, input[type=submit]')).filter((el) => {
				const text =
					el instanceof HTMLInputElement ? el.value : (el.textContent ?? '').replace(/\s+/g, ' ')
				return text.trim() === name
			}).length
		return { create: named('Create Employee'), cancel: named('Cancel') }
	})
}

test('N3-T1 the form column measures its derived width at six viewports', async () => {
	for (const width of VIEWPORTS) {
		await openAt(width)
		const expected = await expectedFormWidth(width)
		const box = await formColumn().boundingBox()
		expect(box, `no form column box at ${width}`).not.toBeNull()
		expect(
			Math.abs((box?.width ?? 0) - expected),
			`form column at ${width}: got ${box?.width}, expected ${expected}`
		).toBeLessThanOrEqual(TOLERANCE)
		if (width === 1280 || width === 1440) {
			expect(box?.width ?? 0, `form column at ${width} must beat today's 768 cap`).toBeGreaterThan(
				768
			)
		}
	}
})

test('N3-T2 no sideways scroll at six viewports', async () => {
	for (const width of VIEWPORTS) {
		await openAt(width)
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
		expect(overflow, `horizontal overflow at ${width}`).toBe(0)
	}
})

test('N3-T3 the rail is a 256px sticky aside at 1536 and 1920', async () => {
	for (const width of [1536, 1920]) {
		await openAt(width)
		const box = await rail().boundingBox()
		expect(
			Math.abs((box?.width ?? 0) - 256),
			`rail width at ${width}: ${box?.width}`
		).toBeLessThanOrEqual(4)

		const maxScroll = await page.evaluate(
			() => document.documentElement.scrollHeight - window.innerHeight
		)
		expect(
			maxScroll,
			`page at ${width} is not scrollable enough to test stickiness`
		).toBeGreaterThanOrEqual(500)

		await page.evaluate(() => window.scrollTo(0, 200))
		await page.waitForFunction(() => window.scrollY === 200)
		const first = await boxOf('form[action="?/create"] aside')
		await page.evaluate(() => window.scrollTo(0, 500))
		await page.waitForFunction(() => window.scrollY === 500)
		const second = await boxOf('form[action="?/create"] aside')

		expect(
			Math.abs(second.top - first.top),
			`rail moved with the page at ${width}: ${first.top} → ${second.top}`
		).toBeLessThanOrEqual(TOLERANCE)
		expect(second.top, `rail scrolled out of view at ${width}`).toBeGreaterThanOrEqual(0)
		await page.evaluate(() => window.scrollTo(0, 0))
	}
})

test('N3-T4 the rail is a full-width block under the form at 1440 and a column at 1536', async () => {
	await openAt(1440)
	let column = await boxOf('#sec-personal')
	let aside = await boxOf('form[action="?/create"] aside')
	expect(aside.top, 'at 1440 the rail must sit under the form column').toBeGreaterThanOrEqual(
		column.bottom
	)
	expect(
		Math.abs(aside.width - column.width),
		`rail width at 1440: ${aside.width}`
	).toBeLessThanOrEqual(TOLERANCE)

	await openAt(1536)
	column = await boxOf('#sec-personal')
	aside = await boxOf('form[action="?/create"] aside')
	expect(aside.top, 'at 1536 the rail must sit beside the form column').toBeLessThan(column.bottom)
	expect(Math.abs(aside.width - 256), `rail width at 1536: ${aside.width}`).toBeLessThanOrEqual(4)
})

test('N3-T5 the rail contents stack after the form and stay in the tab order at 390', async () => {
	await openAt(390)
	const column = await boxOf('#sec-personal')
	const aside = await boxOf('form[action="?/create"] aside')
	expect(aside.top).toBeGreaterThanOrEqual(column.bottom)

	await page.locator('#workScheduleId').focus()
	const stops = await tabWalk(1 + SECTION_LINKS.length + 1)
	expect(stops).toEqual([SUMMARY_TEXT, ...SECTION_LINKS, 'Create Employee'])
})

test('N3-T6 the jump control moves focus to the first invalid field at 390', async () => {
	await openAt(390)
	await page.getByLabel('First Name').fill('Testcase')
	await page.getByLabel('Last Name').fill('Layout')
	await page.getByLabel('Email').fill(`e2e_n3_${Date.now()}@veent.ph`)
	await page.getByLabel('Department').selectOption({ label: 'Human Resources' })
	await page.getByLabel('Job Title').fill('QA Engineer')
	await page.getByLabel('Start Date').fill('2026-03-02')
	await page.getByLabel('Basic Monthly Salary').fill('28000')
	await page.getByText(SUMMARY_TEXT).click()
	await page.getByLabel('SSS Number').fill('1234')
	await page.getByRole('button', { name: 'Create Employee' }).click()

	const jump = page.getByRole('link', { name: 'Go to the first one' })
	await expect(jump, 'the rejected save did not render the rail error block').toBeVisible()
	await expect(rail().getByText(/\d+ fields? need attention/)).toBeVisible()

	await jump.click()
	const focused = await page.evaluate(() => document.activeElement?.id ?? '<body>')
	expect(focused).toBe('sssNumber')
})

test('N3-T7 exactly one Create Employee and one Cancel at six viewports', async () => {
	for (const width of VIEWPORTS) {
		await openAt(width)
		const counts = await domCounts()
		expect(counts.create, `Create Employee count at ${width}`).toBe(1)
		expect(counts.cancel, `Cancel count at ${width}`).toBe(1)
	}
})

test('N3-T8 the disclosure summary string is frozen', async () => {
	await openAt(1280)
	const text = await page.evaluate(
		() => document.querySelector('details > summary')?.textContent ?? ''
	)
	expect(text).toBe(SUMMARY_TEXT)
})

test('N3-T9 opening the disclosure does not move the rail at 1920', async () => {
	await openAt(1920)
	await page.evaluate(() => window.scrollTo(0, 0))
	const before = await boxOf('form[action="?/create"] aside')
	await page.getByText(SUMMARY_TEXT).click()
	await expect(page.locator('details[open]')).toBeAttached()
	const after = await boxOf('form[action="?/create"] aside')
	expect(
		Math.abs(after.top - before.top),
		`rail moved ${before.top} → ${after.top}`
	).toBeLessThanOrEqual(1)
})

test('N3-T10 the form tab order is unchanged above and below 2xl', async () => {
	for (const width of [1280, 1920]) {
		await openAt(width)
		await page.locator('#firstName').focus()
		expect(await page.evaluate(() => document.activeElement?.id)).toBe('firstName')
		const stops = await tabWalk(TAB_SEQUENCE.length)
		expect(stops, `tab order at ${width}`).toEqual(TAB_SEQUENCE)
	}
})

test('N3-T11 the page renders exactly one h1', async () => {
	await openAt(1280)
	await expect(page.locator('h1')).toHaveCount(1)
})

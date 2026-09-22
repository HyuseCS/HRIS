import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

// N6: the Employee Assignments table on /settings/org filters and pages through the address
// (`empSearch`, `empUnassigned`, `empPage`). Seeds 25 unassigned employees under a distinctive
// surname so every multi-page walk stays inside rows this spec owns — pagination.spec.ts injects
// its own 25 rows into the same org and `fullyParallel` is on, so an unfiltered walk would race it.
test.describe.configure({ mode: 'serial' })

const SURNAME = 'Zzorgtest'
const COUNT = 25
const PAGE_SIZE = 20

test.beforeAll(async () => {
	const db = new PrismaClient()
	try {
		const admin = await db.user.findFirstOrThrow({
			where: { email: 'admin@veent.ph' },
			select: { organizationId: true }
		})
		const department = await db.department.findFirstOrThrow({
			where: { organizationId: admin.organizationId },
			select: { id: true }
		})
		for (let i = 1; i <= COUNT; i++) {
			const n = String(i).padStart(3, '0')
			const user = await db.user.upsert({
				where: { email: `zzorgtest${n}@example.test` },
				update: {},
				create: {
					organizationId: admin.organizationId,
					email: `zzorgtest${n}@example.test`,
					// These rows are list fixtures only — nobody logs in as them.
					passwordHash: 'not-a-real-hash',
					roles: ['EMPLOYEE'],
					isActive: false
				}
			})
			await db.employee.upsert({
				where: { userId: user.id },
				update: { positionId: null },
				create: {
					userId: user.id,
					organizationId: admin.organizationId,
					employeeNumber: `ZZO-${n}`,
					firstName: `Row${n}`,
					lastName: SURNAME,
					departmentId: department.id,
					jobTitle: 'Org Fixture',
					employmentType: 'REGULAR',
					startDate: new Date('2026-01-05'),
					basicMonthlySalary: 10000,
					rateType: 'MONTHLY'
				}
			})
		}
	} finally {
		await db.$disconnect()
	}
})

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		// Payroll entries first: a compute running in another spec attaches them to these ACTIVE
		// fixtures and that FK is RESTRICT, so deleting the employee first takes the run down.
		await db.payrollEntry.deleteMany({ where: { employee: { lastName: SURNAME } } })
		await db.employee.deleteMany({ where: { lastName: SURNAME } })
		await db.user.deleteMany({ where: { email: { startsWith: 'zzorgtest' } } })
	} catch {
		// Best-effort, same as pagination.spec.ts: leftovers are swept by
		// scripts/clean-e2e-employees.ts rather than failing teardown.
	} finally {
		await db.$disconnect()
	}
})

const assignments = (page: Page) =>
	page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Employee Assignments' }) })

const rows = (page: Page) => assignments(page).locator('tbody tr')

/** The section's own statement of what it is showing: "Showing N of M employees". */
async function counts(page: Page) {
	const text = await assignments(page)
		.getByText(/Showing \d+ of \d+ employees/)
		.innerText()
	const m = /Showing (\d+) of (\d+) employees/.exec(text)
	if (!m) throw new Error(`Unreadable counter: ${text}`)
	return { n: Number(m[1]), m: Number(m[2]) }
}

/**
 * The assignments table has settled: it is on screen with at least one row. Auto-retrying, so
 * every read after it is taken against a DOM that has stopped moving.
 */
async function settled(page: Page) {
	await expect(assignments(page)).toBeVisible()
	await expect(rows(page).first()).toBeVisible()
}

async function goto(page: Page, query: string) {
	await page.goto(`/settings/org${query}`, { waitUntil: 'domcontentloaded' })
	await settled(page)
}

test.beforeEach(async ({ page }) => {
	await login(page, USERS.admin)
})

test('table is bounded and offers a paging control', async ({ page }) => {
	await goto(page, '')

	expect((await rows(page).allInnerTexts()).length).toBeLessThanOrEqual(PAGE_SIZE)
	await expect(assignments(page).getByRole('navigation', { name: 'Pagination' })).toBeVisible()
})

test('page 2 and back', async ({ page }) => {
	await goto(page, `?empSearch=${SURNAME}`)
	const first = await rows(page).allInnerTexts()
	expect(first).toHaveLength(PAGE_SIZE)

	await goto(page, `?empSearch=${SURNAME}&empPage=2`)
	const second = await rows(page).allInnerTexts()
	expect(second).toHaveLength(COUNT - PAGE_SIZE)
	for (const row of second) expect(first).not.toContain(row)

	await goto(page, `?empSearch=${SURNAME}`)
	expect(await rows(page).allInnerTexts()).toEqual(first)
})

test('filters survive a reload', async ({ page }) => {
	await goto(page, '')
	await assignments(page).getByLabel('Search employees').fill(SURNAME)
	await assignments(page).getByRole('button', { name: 'Filter' }).click()
	await page.waitForURL(new RegExp(`empSearch=${SURNAME}`), { waitUntil: 'domcontentloaded' })
	const before = await rows(page).allInnerTexts()
	expect(before).toHaveLength(PAGE_SIZE)

	await page.reload({ waitUntil: 'domcontentloaded' })
	expect(page.url()).toContain(`empSearch=${SURNAME}`)
	expect(await rows(page).allInnerTexts()).toEqual(before)
})

test('the filter applies on every page, not just the first', async ({ page }) => {
	await goto(page, `?empSearch=${SURNAME}&empUnassigned=1`)

	let seen = 0
	for (;;) {
		await settled(page)
		// One atomic read of every select on this page. Counting and then indexing re-resolves
		// the locator per index, and a row set that changes underneath turns nth() into a miss.
		const values = await assignments(page)
			.locator('tbody tr select')
			.evaluateAll((els) => els.map((e) => (e as HTMLSelectElement).value))
		expect(values.length).toBeGreaterThan(0)
		expect(values.every((v) => v === '')).toBe(true)
		seen += values.length

		const next = assignments(page).getByRole('link', { name: 'Next →' })
		if ((await next.count()) === 0) break
		await next.click()
		await page.waitForURL(/empPage=/, { waitUntil: 'domcontentloaded' })
	}
	expect(seen).toBeGreaterThan(PAGE_SIZE)
})

test('a filter change resets to page 1, paging keeps the filter', async ({ page }) => {
	await goto(page, `?empSearch=${SURNAME}&empPage=2`)
	await expect(rows(page)).toHaveCount(COUNT - PAGE_SIZE)

	await assignments(page).getByLabel('Only unassigned').check()
	await page.waitForURL(/empUnassigned=1/, { waitUntil: 'domcontentloaded' })
	const url = new URL(page.url())
	expect(url.searchParams.get('empUnassigned')).toBe('1')
	expect(url.searchParams.get('empSearch')).toBe(SURNAME)
	expect(url.searchParams.get('empPage') ?? '1').toBe('1')
	await expect(rows(page)).toHaveCount(PAGE_SIZE)

	await assignments(page).getByRole('link', { name: 'Next →' }).click()
	await page.waitForURL(/empPage=2/, { waitUntil: 'domcontentloaded' })
	const paged = new URL(page.url())
	expect(paged.searchParams.get('empUnassigned')).toBe('1')
	expect(paged.searchParams.get('empSearch')).toBe(SURNAME)
	expect(paged.searchParams.get('empPage')).toBe('2')
})

test('Clear restores the unfiltered first page', async ({ page }) => {
	await goto(page, `?empSearch=${SURNAME}&empUnassigned=1&empPage=2`)

	await assignments(page).getByRole('link', { name: 'Clear' }).click()
	await page.waitForURL(/\/settings\/org$/, { waitUntil: 'domcontentloaded' })
	expect(new URL(page.url()).search).toBe('')
	await expect(assignments(page).getByLabel('Search employees')).toHaveValue('')
	await expect(assignments(page).getByLabel('Only unassigned')).not.toBeChecked()
	const { n, m } = await counts(page)
	expect(n).toBe(m)
})

test('the counter tells the truth', async ({ page }) => {
	await goto(page, '')
	const unfiltered = await counts(page)
	expect(unfiltered.n).toBe(unfiltered.m)

	await goto(page, `?empSearch=${SURNAME}`)
	const filtered = await counts(page)
	expect(filtered.m).toBe(unfiltered.m)
	expect(filtered.n).toBe(COUNT)

	let summed = (await rows(page).allInnerTexts()).length
	await goto(page, `?empSearch=${SURNAME}&empPage=2`)
	summed += (await rows(page).allInnerTexts()).length
	expect(summed).toBe(filtered.n)
	expect((await counts(page)).n).toBe(filtered.n)
})

test('no paging control when the filtered set fits on one page', async ({ page }) => {
	await goto(page, `?empSearch=${SURNAME}%2C%20Row00`)

	expect((await rows(page).allInnerTexts()).length).toBeLessThan(PAGE_SIZE)
	await expect(assignments(page).getByRole('navigation', { name: 'Pagination' })).toHaveCount(0)
})

test('the filters and the paging control are reachable', async ({ page }) => {
	await goto(page, '')

	await expect(assignments(page).getByLabel('Search employees')).toBeVisible()

	const unassigned = assignments(page).getByLabel('Only unassigned')
	await unassigned.focus()
	await page.keyboard.press('Space')
	await page.waitForURL(/empUnassigned=1/, { waitUntil: 'domcontentloaded' })
	await expect(assignments(page).getByLabel('Only unassigned')).toBeChecked()

	const linkNames = await assignments(page)
		.getByRole('navigation', { name: 'Pagination' })
		.getByRole('link')
		.evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
	expect(linkNames.length).toBeGreaterThan(0)
	expect(linkNames.every((name) => name !== '')).toBe(true)

	await assignments(page).getByLabel('Search employees').fill(SURNAME)
	await assignments(page).getByRole('button', { name: 'Filter' }).click()
	await page.waitForURL(new RegExp(`empSearch=${SURNAME}`), { waitUntil: 'domcontentloaded' })
	expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
})

test('assigning a position from a row still works', async ({ page }) => {
	await goto(page, `?empSearch=${SURNAME}%2C%20Row001`)

	const positionRows = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Positions' }) })
		.locator('tbody tr')
	const catalog = (await positionRows.allInnerTexts()).length
	expect(catalog).toBeGreaterThan(0)

	const row = rows(page).first()
	const select = row.locator('select')
	// Every catalogued position plus the "— Unassigned —" option: paging the assignments
	// table must not truncate what a row can be assigned to.
	await expect(select.locator('option')).toHaveCount(catalog + 1)

	const option = select.locator('option').nth(1)
	const value = (await option.getAttribute('value')) ?? ''
	const title = await option.innerText()
	await select.selectOption(value)
	await row.getByRole('button', { name: 'Save' }).click()

	await expect(assignments(page).locator('tbody tr select')).toHaveValue(value)
	expect(title.trim()).not.toBe('')
})

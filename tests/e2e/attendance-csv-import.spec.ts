import { test, expect, type Locator, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * A1 — the #200 backlog CSV import on /attendance. The card renders for food-service tenants only
 * (`data.showAmPm` → `isFoodServiceOrg`), so this logs into JoJo Potato rather than Veent.
 *
 * Expectations come from source, not from the rendered page: the three outcome sentences are the
 * `alreadyImported` / `nothing` / `partial` branches in `AttendanceHrGrid.svelte`, the detail line
 * is that card's own counts, the error text is `parseBacklogCsv`'s `Unexpected column in the
 * header: …`, and the punch rows are checked against the `backlog:<number>:<date>:<slot>`
 * `dedupKey` that `importBacklogCsv` writes. The idempotence case is the same file uploaded twice,
 * which is exactly what the card promises ("Re-uploading the same file changes nothing").
 *
 * 2027-05-04/05 are this spec's own window — weekdays, unclaimed by any other spec, and swept in
 * beforeAll as well as afterAll because `global-setup` never touches `attendanceDay` or backlog
 * `timeLog` rows and a CI retry leaves residue.
 *
 * Traps guarded: the `<details>` summary and the submit button both read `Import backlog CSV`, so
 * the button is located by role INSIDE its own form (never `getByText`, which would also match the
 * summary and the paragraph copy); and the import result box and the app toaster both carry
 * `role="status"`, so every result assertion is scoped to the card.
 */

const DAYS = ['2027-05-04', '2027-05-05'] as const
const SLOTS = ['amIn', 'amOut', 'pmIn', 'pmOut'] as const
const HEADER = 'employeeNumber,date,amIn,amOut,pmIn,pmOut'

async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
	const db = new PrismaClient()
	try {
		return await fn(db)
	} finally {
		await db.$disconnect()
	}
}

let crew: { id: string; employeeNumber: string }

const dedupKeys = () =>
	DAYS.flatMap((d) => SLOTS.map((s) => `backlog:${crew.employeeNumber}:${d}:${s}`))

async function sweep() {
	await withDb(async (db) => {
		crew ??= await db.employee.findFirstOrThrow({
			where: { organizationId: 'org_jojo', employmentStatus: 'ACTIVE' },
			orderBy: { employeeNumber: 'asc' },
			select: { id: true, employeeNumber: true }
		})
		await db.timeLog.deleteMany({ where: { dedupKey: { in: dedupKeys() } } })
		await db.attendanceDay.deleteMany({
			where: { employeeId: crew.id, date: { in: DAYS.map((d) => new Date(d)) } }
		})
	})
}

const validCsv = () =>
	[HEADER, ...DAYS.map((d) => `${crew.employeeNumber},${d},08:00,11:00,13:00,17:00`)].join('\n')

/** Open the collapsed import card and return it. Everything else is scoped to this locator. */
async function openImportCard(page: Page): Promise<Locator> {
	await login(page, USERS.jojoManager, 'JoJo Potato')
	await page.goto('/attendance', { waitUntil: 'domcontentloaded' })
	const card = page.locator('details').filter({ hasText: 'Import backlog CSV' })
	await expect(card).toHaveCount(1)
	await card.locator('summary').click()
	await expect(card.locator('input#backlog')).toBeVisible()
	return card
}

async function upload(card: Locator, name: string, csv: string) {
	await card.locator('input#backlog').setInputFiles({
		name,
		mimeType: 'text/csv',
		buffer: Buffer.from(csv, 'utf8')
	})
	// By role, inside the form: the `<details>` summary carries the same string.
	await card
		.locator('form[action="?/importBacklog"]')
		.getByRole('button', { name: 'Import backlog CSV' })
		.click()
}

test.describe('Backlog CSV import (food-service tenants)', () => {
	// The duplicate case is the first upload's own result, so these two are genuinely ordered.
	test.describe.configure({ mode: 'serial' })

	test.beforeAll(sweep)
	test.afterAll(sweep)

	test('a valid file writes its punches and reports what landed', async ({ page }) => {
		test.slow()
		const card = await openImportCard(page)
		await upload(card, 'backlog-a1-first.csv', validCsv())

		const result = card.locator('[role="status"]')
		await expect(result).toContainText('Import complete — 2 rows applied.')
		await expect(result).toContainText(
			'Applied 2 rows (8 punches), skipped 0 duplicates, rejected 0 rows.'
		)

		const written = await withDb((db) =>
			db.timeLog.findMany({
				where: { employeeId: crew.id, dedupKey: { in: dedupKeys() } },
				select: { dedupKey: true },
				orderBy: { dedupKey: 'asc' }
			})
		)
		expect(written.map((w) => w.dedupKey)).toEqual([...dedupKeys()].sort())
	})

	test('re-uploading the same file changes nothing and says so', async ({ page }) => {
		test.slow()
		const card = await openImportCard(page)
		await upload(card, 'backlog-a1-first.csv', validCsv())

		const result = card.locator('[role="status"]')
		await expect(result).toContainText(
			'Already imported — every row in this file was here already.'
		)
		await expect(result).toContainText(
			'Applied 0 rows (0 punches), skipped 2 duplicates, rejected 0 rows.'
		)

		const count = await withDb((db) =>
			db.timeLog.count({ where: { employeeId: crew.id, dedupKey: { in: dedupKeys() } } })
		)
		expect(count).toBe(8)
	})
})

test.describe('Backlog CSV import — a malformed file', () => {
	test('an unexpected column rejects the whole file in the card', async ({ page }) => {
		test.slow()
		const card = await openImportCard(page)
		await upload(
			card,
			'backlog-a1-malformed.csv',
			'employeeNumber,date,amIn,bogus\nX,2027-05-04,08:00,1'
		)

		// Scoped to the card: the app toaster echoes the same failure as a `role="status"` region.
		await expect(card.getByRole('alert')).toContainText('Unexpected column in the header: bogus')
		await expect(card.locator('[role="status"]')).toHaveCount(0)
	})
})

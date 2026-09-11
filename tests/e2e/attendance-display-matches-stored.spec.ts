import { test, expect, type Locator, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * F10b — after a correction every cell on that row must show what the database now holds, with no
 * reload. The assertions read the DOM and compare it against the Prisma row, never against the
 * value the spec typed: a spec that checks its own input back would stay green on the stale render
 * this section exists to remove.
 *
 * Aug 11–12 2026 is this spec's own window. The seed has no attendance there, and no other spec
 * writes an OVERTIME request on those days, so the derived overtime cap is a known zero.
 */
test.describe.configure({ mode: 'serial' })

const FROM = '2026-08-11'
const TO = '2026-08-12'
const EDITED = new Date(`${FROM}T00:00:00Z`)
const SIBLING = new Date(`${TO}T00:00:00Z`)

let employeeId: string

const own = () => ({ employeeId, date: { gte: EDITED, lte: SIBLING } })

async function seed() {
	const db = new PrismaClient()
	try {
		const emp = await db.employee.findFirstOrThrow({
			where: { user: { email: USERS.employee.email } },
			select: { id: true }
		})
		employeeId = emp.id
		await db.attendanceDay.deleteMany({ where: own() })
		for (const date of [EDITED, SIBLING]) {
			const key = date.toISOString().slice(0, 10)
			await db.attendanceDay.create({
				data: {
					employeeId,
					date,
					status: 'PRESENT',
					// 09:00–18:00 PHT, but the stored hours are deliberately wrong: a correction has
					// to move them, so an unchanged cell cannot pass for a fresh one.
					timeIn: new Date(`${key}T01:00:00Z`),
					timeOut: new Date(`${key}T10:00:00Z`),
					workedHours: 3,
					regularHours: 3
				}
			})
		}
	} finally {
		await db.$disconnect()
	}
}

test.beforeAll(seed)

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		await db.attendanceDay.deleteMany({ where: own() })
	} finally {
		await db.$disconnect()
	}
})

const url = () => `/attendance?view=employee&employeeId=${employeeId}&from=${FROM}&to=${TO}`

/** The day table renders Date, Status, In, Out, Reg, OT, Night, Late/UT, then the actions cell. */
const CELL = { reg: 4, ot: 5, night: 6, lateUt: 7 }

const rowFor = (page: Page, date: Date) =>
	page.locator('tbody tr').filter({ hasText: `Aug ${date.getUTCDate()}` })

const cell = (row: Locator, which: keyof typeof CELL) => row.locator('td').nth(CELL[which])

async function storedRow(date: Date) {
	const db = new PrismaClient()
	try {
		return await db.attendanceDay.findFirstOrThrow({ where: { employeeId, date } })
	} finally {
		await db.$disconnect()
	}
}

async function expectRowMatchesStored(row: Locator, date: Date) {
	const stored = await storedRow(date)
	await expect(cell(row, 'reg')).toHaveText(Number(stored.regularHours).toFixed(2))
	await expect(cell(row, 'ot')).toContainText(Number(stored.overtimeHours).toFixed(2))
	await expect(cell(row, 'night')).toHaveText(Number(stored.nightDiffHours).toFixed(2))
	await expect(cell(row, 'lateUt')).toHaveText(`${stored.lateMinutes}/${stored.undertimeMinutes}`)
	await expect(row.locator('select[name="status"]')).toHaveValue(stored.status)
	return stored
}

test('a saved row shows the stored values without a reload, and its siblings keep theirs', async ({
	page
}) => {
	test.slow()
	await login(page, USERS.admin)
	await page.goto(url(), { waitUntil: 'domcontentloaded' })

	const edited = rowFor(page, EDITED)
	const sibling = rowFor(page, SIBLING)
	await expect(cell(edited, 'reg')).toHaveText('3.00')

	await edited.locator('input[name="timeIn"]').fill('09:00')
	await edited.locator('input[name="timeOut"]').fill('17:00')
	await edited.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.getByText('Attendance day saved.')).toBeVisible()

	// The stored hours must have moved off the seeded 3.00 — otherwise "DOM equals database" would
	// be satisfied by the pre-save render and prove nothing.
	const stored = await expectRowMatchesStored(edited, EDITED)
	expect(Number(stored.regularHours)).not.toBe(3)

	// F3 negative control: the untouched row is not blanked or re-rendered by its neighbour's save.
	await expect(cell(sibling, 'reg')).toHaveText('3.00')
	await expect(sibling.locator('input[name="timeIn"]')).toHaveValue('09:00')
	await expect(sibling.locator('input[name="timeOut"]')).toHaveValue('18:00')

	// Clearing both punches re-derives the day as ABSENT server-side while the dropdown still reads
	// PRESENT — the status half of the same staleness.
	// Wait the first toast out: both saves say the same sentence, so a stale one would satisfy the
	// second wait before the second save had landed.
	await expect(page.getByText('Attendance day saved.')).toBeHidden({ timeout: 15000 })
	await edited.locator('input[name="timeIn"]').fill('')
	await edited.locator('input[name="timeOut"]').fill('')
	await edited.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.getByText('Attendance day saved.')).toBeVisible()

	const cleared = await expectRowMatchesStored(edited, EDITED)
	expect(cleared.status).toBe('ABSENT')
})

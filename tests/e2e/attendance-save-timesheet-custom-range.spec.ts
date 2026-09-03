import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * #163 criteria 14, 15 and 16 — Save as timesheet on /attendance now accepts a custom same-month
 * span (it was greyed out before this change), and saving an OVERLAPPING span for the same
 * employee comes back as a visible form error, never a 500 page.
 *
 * June 2026 is this spec's own month: the seed has no attendance there, so the seven
 * AttendanceDay rows below are the only thing in range and the day count is exact.
 */
test.describe.configure({ mode: 'serial' })

const FROM = '2026-06-03'
const TO = '2026-06-09'
const OVERLAP_FROM = '2026-06-07'
const OVERLAP_TO = '2026-06-14'

// Every timesheet query in this spec is bounded by BOTH ends of the only window it writes in
// (Jun 3 – Jun 14): the saved Jun 3–9 sheet, and the Jun 7–14 one it expects to be refused. A
// `periodStart >= Jun 1` filter would delete unrelated fixtures and make other specs depend on
// the order they run in.
const ownSheets = () => ({
	employeeId,
	periodStart: { gte: new Date(FROM) },
	periodEnd: { lte: new Date(OVERLAP_TO) }
})

let employeeId: string

test.beforeAll(async () => {
	const db = new PrismaClient()
	try {
		const emp = await db.employee.findFirstOrThrow({
			where: { user: { email: USERS.employee.email } },
			select: { id: true }
		})
		employeeId = emp.id
		await db.attendanceDay.deleteMany({
			where: { employeeId, date: { gte: new Date(FROM), lte: new Date('2026-06-14') } }
		})
		const stale = await db.timesheet.findMany({ where: ownSheets(), select: { id: true } })
		const staleIds = stale.map((t) => t.id)
		if (staleIds.length) {
			await db.timesheetEntry.deleteMany({ where: { timesheetId: { in: staleIds } } })
			await db.timesheet.deleteMany({ where: { id: { in: staleIds } } })
		}
		// Seven consecutive PRESENT days, 8h each, so the range saves as exactly 7 entries.
		for (let i = 0; i < 7; i++) {
			const day = new Date(`2026-06-0${3 + i}T00:00:00Z`)
			await db.attendanceDay.create({
				data: {
					employeeId,
					date: day,
					status: 'PRESENT',
					timeIn: new Date(`2026-06-0${3 + i}T01:00:00Z`),
					timeOut: new Date(`2026-06-0${3 + i}T10:00:00Z`),
					workedHours: 8,
					regularHours: 8
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
		const sheets = await db.timesheet.findMany({ where: ownSheets(), select: { id: true } })
		const ids = sheets.map((t) => t.id)
		if (ids.length) {
			await db.timesheetEntry.deleteMany({ where: { timesheetId: { in: ids } } })
			await db.timesheet.deleteMany({ where: { id: { in: ids } } })
		}
		await db.attendanceDay.deleteMany({
			where: { employeeId, date: { gte: new Date(FROM), lte: new Date('2026-06-14') } }
		})
	} finally {
		await db.$disconnect()
	}
})

const attendanceUrl = (from: string, to: string) =>
	`/attendance?view=employee&employeeId=${employeeId}&from=${from}&to=${to}`

test('a custom range saves as a timesheet, and a second overlapping one is refused', async ({
	page
}) => {
	test.slow()
	await login(page, USERS.admin)

	await page.goto(attendanceUrl(FROM, TO), { waitUntil: 'domcontentloaded' })
	const save = page.getByRole('button', { name: 'Save as timesheet' })
	// The whole point of #163 on this surface: this button used to be disabled for a 7-day span.
	await expect(save).toBeEnabled()
	await save.click()
	await expect(page.getByText('Timesheet saved (7 days).')).toBeVisible()

	const db = new PrismaClient()
	try {
		const sheets = await db.timesheet.findMany({
			where: ownSheets(),
			select: { periodStart: true, periodEnd: true }
		})
		expect(sheets).toHaveLength(1)
		expect(sheets[0].periodStart.toISOString().slice(0, 10)).toBe(FROM)
		expect(sheets[0].periodEnd.toISOString().slice(0, 10)).toBe(TO)
	} finally {
		await db.$disconnect()
	}

	// An overlapping span for the SAME employee is a 409 surfaced as a form error on the same
	// page — the attendance table is still rendered, so this is not a 500 error page.
	await page.goto(attendanceUrl(OVERLAP_FROM, OVERLAP_TO), { waitUntil: 'domcontentloaded' })
	await page.getByRole('button', { name: 'Save as timesheet' }).click()
	await expect(page.getByText('This range overlaps an existing timesheet')).toBeVisible()
	await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible()

	const db2 = new PrismaClient()
	try {
		const count = await db2.timesheet.count({ where: ownSheets() })
		expect(count).toBe(1)
	} finally {
		await db2.$disconnect()
	}
})

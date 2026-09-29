import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { findTimesheetCard, login, USERS } from './helpers'

// The page-walk inside `findTimesheetCard` is dead code unless something pushes the card it
// looks for off page 1, and a grep for the `Next →` string proves only that it was typed.
// Eleven SUBMITTED timesheets do it for real at the queue's pageSize of 10, and the queue is
// ordered `submittedAt asc`, so the newest — the one carrying the distinctive hours label —
// is always on the LAST page.
test.describe.configure({ mode: 'serial' })

const COUNT = 11
const FILLER_HOURS = 4
const TARGET_HOURS = 9.9
const TARGET_CARD = '9.9 hrs'

const seededIds: string[] = []

test.beforeAll(async () => {
	const db = new PrismaClient()
	try {
		const employee = await db.employee.findFirstOrThrow({
			where: { user: { email: USERS.employee.email } },
			select: { id: true }
		})
		const now = new Date()
		for (let i = 0; i < COUNT; i++) {
			// One distinct month each: `employeeId_periodStart` is unique, and month +7 is
			// already taken by the bulk-feedback fixture in form-errors.spec.ts.
			const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 14 + i, 5))
			const periodEnd = new Date(
				Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 4)
			)
			const hours = i === COUNT - 1 ? TARGET_HOURS : FILLER_HOURS
			const row = {
				periodEnd,
				status: 'SUBMITTED' as const,
				// Ascending, and newer than every other row in the queue, so the target sorts last.
				submittedAt: new Date(now.getTime() + i * 1000),
				totalHours: hours,
				reviewedAt: null,
				reviewedById: null,
				rejectionReason: null
			}
			const entry = {
				date: periodStart,
				hoursWorked: hours,
				otHours: 0,
				notes: 'e2e page-walk fixture'
			}
			const ts = await db.timesheet.upsert({
				where: { employeeId_periodStart: { employeeId: employee.id, periodStart } },
				create: {
					employeeId: employee.id,
					periodStart,
					...row,
					entries: { create: [entry] }
				},
				update: { ...row, entries: { deleteMany: {}, create: [entry] } },
				select: { id: true }
			})
			seededIds.push(ts.id)
		}
		// An empty approval chain routes these down the legacy VIEW_TEAM branch, which is what
		// makes them visible to the admin account this spec uses.
		await db.approvalStep.deleteMany({ where: { timesheetId: { in: seededIds } } })
	} finally {
		await db.$disconnect()
	}
})

test.afterAll(async () => {
	if (!seededIds.length) return
	const db = new PrismaClient()
	try {
		// Only the ids seeded above — every other row in this queue belongs to somebody else.
		await db.timesheet.deleteMany({ where: { id: { in: seededIds } } })
	} catch {
		// Best-effort teardown: leftovers are visible fixtures, a thrown teardown is a red suite.
	} finally {
		await db.$disconnect()
	}
	seededIds.length = 0
})

test('the timesheet queue helper walks past page 1 to reach the newest card', async ({ page }) => {
	await login(page, USERS.admin)

	// Negative control. If the target were on page 1 this test could pass with the walk
	// removed, so pin that it is not, and that there is somewhere left to walk to.
	await page.goto('/requests/timesheets', { waitUntil: 'domcontentloaded' })
	await expect(
		page.locator('[role="button"]', { hasText: 'Employee, Elena' }).filter({ hasText: TARGET_CARD })
	).toHaveCount(0)
	await expect(page.getByRole('link', { name: 'Next →' })).toBeVisible()

	const card = await findTimesheetCard(page, TARGET_CARD)
	await expect(card).toBeVisible()

	const landedOn = Number(new URL(page.url()).searchParams.get('page'))
	expect(landedOn).toBeGreaterThanOrEqual(2)
})

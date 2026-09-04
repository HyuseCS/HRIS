import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * The New Timesheet dialog names the employee it creates for, so HR can prepare a sheet on
 * someone's behalf — the flow #165 left without an owner once employees stopped creating
 * their own.
 *
 * The period is a whole month five months out, deliberately with no punches in it. That is
 * the case issue #214 flagged as unreachable: the aggregate panel needs punches and
 * /attendance "Save as timesheet" rejects an empty range outright, so this dialog is the
 * only surface that can produce a sheet for a period with nothing recorded in it.
 *
 * Serial — beforeAll runs once per worker under fullyParallel, and these tests share one
 * created timesheet. The far-future period keeps it clear of every other spec's rows and,
 * under `periodStart desc`, on page 1 of the team table.
 */
test.describe.configure({ mode: 'serial' })

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
]

// Five months out: no punches exist there, so the created sheet totals 0.00 hrs — the
// assertion that matters. Five rather than three because timesheet-approval.spec seeds its
// own fixture for this same employee three months out, and Timesheet is unique on
// (employeeId, periodStart) — two specs on the same month collide in setup.
function targetMonth() {
	const d = new Date()
	const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 5, 1))
	return {
		monthName: MONTHS[start.getUTCMonth()],
		year: start.getUTCFullYear(),
		periodStart: start
	}
}

const { monthName, year, periodStart } = targetMonth()

let employeeId: string

/** Remove the sheet under test so a re-run starts from nothing to create. */
async function dropFixture() {
	const db = new PrismaClient()
	try {
		const employee = await db.employee.findFirstOrThrow({
			where: { user: { email: USERS.employee.email } },
			select: { id: true }
		})
		employeeId = employee.id
		await db.timesheet.deleteMany({ where: { employeeId, periodStart } })
	} finally {
		await db.$disconnect()
	}
}

test.beforeAll(dropFixture)
test.afterAll(dropFixture)

/** Open the dialog, retrying until hydration lands (a pre-hydration click is dropped). */
async function openDialog(page: import('@playwright/test').Page) {
	const dialog = page.getByRole('dialog', { name: 'New Timesheet' })
	await expect(async () => {
		await page.getByRole('button', { name: 'New Timesheet' }).click()
		await expect(dialog).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })
	return dialog
}

test('HR creates a timesheet for another employee in a period with no punches', async ({
	page
}) => {
	test.slow()
	await login(page, USERS.admin)
	await page.goto('/timesheets', { waitUntil: 'domcontentloaded' })

	const dialog = await openDialog(page)
	const create = dialog.getByRole('button', { name: 'Create timesheet' })

	// Nothing is preselected, so Create stays disabled until an employee is named — a
	// mis-click must never silently produce a sheet for the wrong person.
	await expect(dialog.locator('#nt-employee')).toHaveValue('')
	await expect(create).toBeDisabled()

	const empValue = await dialog
		.locator('#nt-employee option', { hasText: 'Employee, Elena' })
		.first()
		.getAttribute('value')
	expect(empValue).toBeTruthy()
	await dialog.locator('#nt-employee').selectOption(empValue as string)
	await expect(create).toBeEnabled()

	await dialog.locator('#pp-month').selectOption({ label: monthName })
	await dialog.locator('#pp-year').selectOption({ label: String(year) })
	await dialog.locator('#pp-kind').selectOption('WHOLE_MONTH')
	await create.click()

	// Redirects back to /timesheets, where the new DRAFT sits under the chosen employee in
	// the team table — not under the HR user who created it.
	await page.waitForURL('**/timesheets')
	const row = page
		.locator('tr', { hasText: 'Employee, Elena' })
		.filter({ hasText: /draft/i })
		.filter({ hasText: '0.00 hrs' })
	await expect(row).toHaveCount(1)

	const db = new PrismaClient()
	try {
		const ts = await db.timesheet.findFirstOrThrow({ where: { employeeId, periodStart } })
		expect(ts.status).toBe('DRAFT')
		expect(Number(ts.totalHours)).toBe(0)
	} finally {
		await db.$disconnect()
	}
})

test('an HR user with no employee record of their own can still create', async ({ page }) => {
	// The button used to require `myEmployeeId`, so a user with no Employee row never saw it. The
	// picker names the target, so their own record is irrelevant.
	//
	// #315: this used to log in as the seeded CEO, described as having no Employee row. That
	// stopped being true in `d06ffe2` — `prisma/seed-core.ts` now gives the CEO EMP-900 so the
	// Profile page resolves, and today EVERY loginable seeded account owns one. The assertion
	// below was therefore unsatisfiable on a fresh database and failed 3/3 in CI. It needs a user
	// that genuinely has no employee record, so it makes one and removes it again; the password
	// hash is copied from the admin so the real login form still drives the sign-in.
	const db = new PrismaClient()
	const email = 'e2e-no-employee@veent.ph'
	try {
		const admin = await db.user.findUniqueOrThrow({ where: { email: USERS.admin.email } })
		const solo = await db.user.upsert({
			where: { email },
			update: { roles: ['HR_ADMIN'], isActive: true },
			create: {
				email,
				passwordHash: admin.passwordHash,
				roles: ['HR_ADMIN'],
				organizationId: admin.organizationId
			}
		})
		await db.userOrganization.upsert({
			where: {
				userId_organizationId: { userId: solo.id, organizationId: admin.organizationId }
			},
			update: {},
			create: { userId: solo.id, organizationId: admin.organizationId }
		})

		await login(page, { email, password: USERS.admin.password })
		await page.goto('/timesheets', { waitUntil: 'domcontentloaded' })
		// The positive control comes FIRST (#315). `toHaveCount(0)` is satisfied by an error page
		// just as happily as by correct behaviour, so prove the page rendered before trusting an
		// absence.
		await expect(page.getByRole('heading', { name: 'Timesheets', level: 1 })).toBeVisible()
		await expect(page.getByRole('heading', { name: 'My Timesheets' })).toHaveCount(0)

		const dialog = await openDialog(page)
		await expect(dialog.locator('#nt-employee')).toBeVisible()
		await expect(dialog.locator('#nt-employee option', { hasText: 'Employee, Elena' })).toHaveCount(
			1
		)
	} finally {
		const solo = await db.user.findUnique({ where: { email }, select: { id: true } })
		if (solo) {
			// Logging in writes an audit row, and `AuditLog.actorId` is RESTRICT, so the user
			// cannot go until its own trail does. Sessions cascade, so they need no help.
			await db.auditLog.deleteMany({ where: { actorId: solo.id } })
			await db.user.delete({ where: { id: solo.id } })
		}
		await db.$disconnect()
	}
})

test('creating the same period twice surfaces the conflict in the dialog', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/timesheets', { waitUntil: 'domcontentloaded' })

	const dialog = await openDialog(page)
	const empValue = await dialog
		.locator('#nt-employee option', { hasText: 'Employee, Elena' })
		.first()
		.getAttribute('value')
	await dialog.locator('#nt-employee').selectOption(empValue as string)
	await dialog.locator('#pp-month').selectOption({ label: monthName })
	await dialog.locator('#pp-year').selectOption({ label: String(year) })
	await dialog.locator('#pp-kind').selectOption('WHOLE_MONTH')
	await dialog.getByRole('button', { name: 'Create timesheet' }).click()

	// 409 from createTimesheet, rendered in place rather than throwing the user out.
	await expect(dialog.getByText(/already exists/i)).toBeVisible()
})

test('an employee id from another organization is rejected', async ({ page }) => {
	// createTimesheet trusts the id it is given — it checks the period shape and the
	// duplicate constraint but never the org — so the tenancy check lives in the action
	// (resolveOrgEmployee). Same class of hole as #97.
	const db = new PrismaClient()
	let foreignId: string
	try {
		const foreign = await db.employee.findFirstOrThrow({
			where: { user: { organization: { name: 'JoJo Potato' } } },
			select: { id: true }
		})
		foreignId = foreign.id
	} finally {
		await db.$disconnect()
	}

	await login(page, USERS.admin) // signed in to Veent
	const res = await page.request.post('/timesheets?/create', {
		form: { employeeId: foreignId, periodStart: '2099-03-01', periodEnd: '2099-03-31' },
		headers: { origin: new URL(page.url()).origin }
	})
	// A form action returns 200 with a failure payload; the id must not resolve.
	expect(await res.text()).toContain('Employee not found')

	const check = new PrismaClient()
	try {
		expect(await check.timesheet.count({ where: { employeeId: foreignId } })).toBe(0)
	} finally {
		await check.$disconnect()
	}
})

import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

// #64: shared server-side pagination. Seeds 25 employees with a distinctive
// surname so the search filter isolates them from rows other tests create, then
// walks the /employees list: ≤20 rows per page, range label, page + filter in
// the URL, browser back restoring page 1.
test.describe.configure({ mode: 'serial' })

const SURNAME = 'Zzpagetest'
const COUNT = 25

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
				where: { email: `zzpagetest${n}@example.test` },
				update: {},
				create: {
					organizationId: admin.organizationId,
					email: `zzpagetest${n}@example.test`,
					// These rows are list fixtures only — nobody logs in as them.
					passwordHash: 'not-a-real-hash',
					roles: ['EMPLOYEE'],
					isActive: false
				}
			})
			await db.employee.upsert({
				where: { userId: user.id },
				update: {},
				create: {
					userId: user.id,
					organizationId: admin.organizationId,
					employeeNumber: `ZZP-${n}`,
					firstName: `Row${n}`,
					lastName: SURNAME,
					departmentId: department.id,
					jobTitle: 'Pagination Fixture',
					// Deliberately ACTIVE: /employees defaults to the active tab, so offboarding these
					// would hide them from the very list this test paginates. Payroll compute in
					// another spec does sweep them in and attach entries, which is why teardown
					// clears those first and is best-effort.
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
		// These 25 fixtures are ACTIVE employees, so a payroll compute running in another spec
		// sweeps them in and attaches payroll entries. That FK is RESTRICT, so deleting the
		// employee first fails and takes the run down with it — the entries go first.
		await db.payrollEntry.deleteMany({ where: { employee: { lastName: SURNAME } } })
		await db.employee.deleteMany({ where: { lastName: SURNAME } })
		await db.user.deleteMany({ where: { email: { startsWith: 'zzpagetest' } } })
	} catch {
		// Best-effort: a concurrent compute can attach another entry between the two deletes.
		// Leftovers are swept by scripts/clean-e2e-employees.ts rather than failing teardown.
	} finally {
		await db.$disconnect()
	}
})

test('employees list paginates with filter and page state in the URL', async ({ page }) => {
	await login(page, USERS.admin)

	// Filter applied: 25 matches at 10 per page → 3 pages, the first one full.
	await page.goto(`/employees?search=${SURNAME}`, { waitUntil: 'domcontentloaded' })
	await expect(page.getByText(`1–10 of ${COUNT}`)).toBeVisible()
	await expect(page.locator('tbody tr')).toHaveCount(10)

	// Next → page 2: URL carries BOTH the filter and the page.
	await page.getByRole('link', { name: 'Next →' }).click()
	await page.waitForURL(`**/employees?search=${SURNAME}&page=2`, {
		waitUntil: 'domcontentloaded'
	})
	await expect(page.getByText(`11–20 of ${COUNT}`)).toBeVisible()
	await expect(page.locator('tbody tr')).toHaveCount(10)

	// Browser back restores page 1 with the filter intact.
	await page.goBack({ waitUntil: 'domcontentloaded' })
	await expect(page).toHaveURL(new RegExp(`search=${SURNAME}(?!.*page=2)`))
	await expect(page.getByText(`1–10 of ${COUNT}`)).toBeVisible()

	// Out-of-range pages clamp to the last real page instead of rendering empty.
	await page.goto(`/employees?search=${SURNAME}&page=99`, { waitUntil: 'domcontentloaded' })
	await expect(page.getByText(`21–25 of ${COUNT}`)).toBeVisible()
})

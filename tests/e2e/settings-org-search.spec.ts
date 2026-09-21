import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

// A5: the Employee Assignments search on /settings/org is a case-insensitive substring over
// `name` OR `jobTitle` (src/routes/(app)/settings/org/+page.server.ts:29-36). The sibling spec
// settings-org-assignments.spec.ts only ever asserts row COUNTS, so it cannot see a predicate
// that matches the wrong rows, and it never exercises the `jobTitle` half at all. Expectations
// here were derived from that filter plus the markup at +page.svelte:262-357.
//
// Two disjoint fixture groups with opaque, mutually non-matching surnames make exclusion
// provable by identity: group A can only be right if every group-B row is absent.
//
// Traps guarded: tokens are opaque codes, not English words any control uses, and none is a
// substring of another or of Zzpagetest / Zzorgtest / 'E2E ' (getByRole name matching is a
// case-insensitive substring); row sets are read as ONE evaluateAll snapshot and asserted
// non-empty before any .every(), because an empty table satisfies every() vacuously — which is
// exactly what a broken search would look like; the prefix is swept in beforeAll as well as
// afterAll, since CI retries leave residue and scripts/clean-e2e-employees.ts only knows
// ['e2e_', 'probe_', 'zzpagetest'].

// Serial at file scope, like pagination.spec.ts:10 and settings-org-assignments.spec.ts:9:
// Playwright runs beforeAll once PER WORKER under fullyParallel, so four independent tests meant
// several workers racing the same seeding loop on the same unique email. One worker owns the
// fixture now. The cost is real — a red beforeAll SKIPS the rest of the file rather than failing
// each test — so the seed below is P2002-tolerant too and cannot red on a retry or a stray run.
test.describe.configure({ mode: 'serial' })

const GROUP_A = { surname: 'Qxvarnek', jobTitle: 'Jtplinder', count: 6, prefix: 'ZZS-A' }
const GROUP_B = { surname: 'Hzmoduly', jobTitle: 'Ksrevonu', count: 5, prefix: 'ZZS-B' }
const NO_MATCH = 'Vfnoxzil'
const EMAIL_PREFIX = 'zzsrchtest'

const isUniqueRace = (e: unknown) => (e as { code?: string }).code === 'P2002'

async function sweep(db: PrismaClient) {
	try {
		// Payroll entries first: a compute running in another spec attaches them to these
		// fixtures and that FK is RESTRICT, so deleting the employee first takes the run down.
		const lastName = { in: [GROUP_A.surname, GROUP_B.surname] }
		await db.payrollEntry.deleteMany({ where: { employee: { lastName } } })
		await db.employee.deleteMany({ where: { lastName } })
		await db.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
	} catch {
		// Best-effort, same as pagination.spec.ts: leftovers are swept by
		// scripts/clean-e2e-employees.ts rather than failing the run.
	}
}

test.beforeAll(async () => {
	const db = new PrismaClient()
	try {
		await sweep(db)
		const admin = await db.user.findFirstOrThrow({
			where: { email: 'admin@veent.ph' },
			select: { organizationId: true }
		})
		const department = await db.department.findFirstOrThrow({
			where: { organizationId: admin.organizationId },
			select: { id: true }
		})
		for (const [tag, group] of [
			['a', GROUP_A],
			['b', GROUP_B]
		] as const) {
			for (let i = 1; i <= group.count; i++) {
				const n = String(i).padStart(3, '0')
				const email = `${EMAIL_PREFIX}${tag}${n}@example.test`
				const user = await db.user
					.upsert({
						where: { email },
						update: {},
						create: {
							organizationId: admin.organizationId,
							email,
							// These rows are list fixtures only — nobody logs in as them.
							passwordHash: 'not-a-real-hash',
							roles: ['EMPLOYEE'],
							isActive: false
						}
					})
					.catch((e) => {
						if (!isUniqueRace(e)) throw e
						return db.user.findUniqueOrThrow({ where: { email } })
					})
				await db.employee
					.upsert({
						where: { userId: user.id },
						update: {
							lastName: group.surname,
							jobTitle: group.jobTitle,
							employmentStatus: 'OFFBOARDED'
						},
						create: {
							userId: user.id,
							organizationId: admin.organizationId,
							employeeNumber: `${group.prefix}${n}`,
							firstName: `Row${tag.toUpperCase()}${n}`,
							lastName: group.surname,
							departmentId: department.id,
							jobTitle: group.jobTitle,
							employmentType: 'REGULAR',
							// Not ACTIVE (the schema default): computePayroll selects
							// { organizationId, employmentStatus: 'ACTIVE' }, so ACTIVE fixtures let a parallel
							// payroll run attach entries to rows this spec's teardown then deletes — a RESTRICT
							// FK 500. listAssignableEmployees filters on organizationId only and the table
							// renders no status, so these rows still appear and no assertion here is affected.
							employmentStatus: 'OFFBOARDED',
							startDate: new Date('2026-01-05'),
							basicMonthlySalary: 10000,
							rateType: 'MONTHLY'
						}
					})
					.catch((e) => {
						// The same P2002 race, on employeeNumber: the row a concurrent seed created is identical.
						if (!isUniqueRace(e)) throw e
					})
			}
		}
	} finally {
		await db.$disconnect()
	}
})

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		await sweep(db)
	} finally {
		await db.$disconnect()
	}
})

const assignments = (page: Page) =>
	page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'Employee Assignments' }) })

/**
 * One atomic read of the section's DATA rows as {name, jobTitle}. Scoped with `:has(select)`
 * because an empty result still renders a tbody row — the "No employees match this filter"
 * empty state — so a bare `tbody tr` count can never be 0 and would read as one phantom row.
 */
async function snapshot(page: Page) {
	await expect(assignments(page)).toBeVisible()
	return assignments(page)
		.locator('tbody tr:has(select)')
		.evaluateAll((rows) =>
			rows.map((r) => {
				const cells = r.querySelectorAll('td')
				return {
					name: (cells[0]?.textContent ?? '').trim(),
					jobTitle: (cells[1]?.textContent ?? '').trim()
				}
			})
		)
}

async function counts(page: Page) {
	const text = await assignments(page)
		.getByText(/Showing \d+ of \d+ employees/)
		.innerText()
	const m = /Showing (\d+) of (\d+) employees/.exec(text)
	if (!m) throw new Error(`Unreadable counter: ${text}`)
	return { n: Number(m[1]), m: Number(m[2]) }
}

const search = (page: Page, token: string) =>
	page.goto(`/settings/org?empSearch=${token}`, { waitUntil: 'domcontentloaded' })

test.beforeEach(async ({ page }) => {
	await login(page, USERS.admin)
})

test('a name search returns group A and excludes every group B row by identity', async ({
	page
}) => {
	await page.goto('/settings/org', { waitUntil: 'domcontentloaded' })
	await assignments(page).getByLabel('Search employees').fill(GROUP_A.surname)
	// exact: true — getByRole name matching is a case-insensitive SUBSTRING by default, so a
	// later control named e.g. 'Clear filters' or 'Filters' would silently answer to this.
	await assignments(page).getByRole('button', { name: 'Filter', exact: true }).click()
	await page.waitForURL(new RegExp(`empSearch=${GROUP_A.surname}`), {
		waitUntil: 'domcontentloaded'
	})

	const rows = await snapshot(page)
	expect(rows.length).toBeGreaterThan(0)
	expect(rows).toHaveLength(GROUP_A.count)
	expect(rows.every((r) => r.name.includes(GROUP_A.surname))).toBe(true)
	expect(rows.some((r) => r.name.includes(GROUP_B.surname))).toBe(false)
	for (let i = 1; i <= GROUP_B.count; i++) {
		const absent = `${GROUP_B.surname}, RowB${String(i).padStart(3, '0')}`
		expect(rows.map((r) => r.name)).not.toContain(absent)
	}
})

test('the jobTitle half of the predicate matches rows whose name lacks the token', async ({
	page
}) => {
	await search(page, GROUP_A.jobTitle)

	const rows = await snapshot(page)
	expect(rows.length).toBeGreaterThan(0)
	expect(rows).toHaveLength(GROUP_A.count)
	expect(rows.every((r) => r.jobTitle === GROUP_A.jobTitle)).toBe(true)
	// The token appears in no name, so these rows can only have matched on jobTitle.
	expect(rows.every((r) => !r.name.includes(GROUP_A.jobTitle))).toBe(true)
	expect(rows.some((r) => r.name.includes(GROUP_B.surname))).toBe(false)
})

test('the search is case-insensitive', async ({ page }) => {
	await search(page, GROUP_A.surname.toLowerCase())
	const lower = await snapshot(page)
	expect(lower.length).toBeGreaterThan(0)
	expect(lower).toHaveLength(GROUP_A.count)

	await search(page, GROUP_A.surname.toUpperCase())
	const upper = await snapshot(page)
	expect(upper).toEqual(lower)

	await search(page, GROUP_B.jobTitle.toUpperCase())
	const titleUpper = await snapshot(page)
	expect(titleUpper.length).toBeGreaterThan(0)
	expect(titleUpper.every((r) => r.jobTitle === GROUP_B.jobTitle)).toBe(true)
	expect(titleUpper).toHaveLength(GROUP_B.count)
})

test('a no-match search yields no rows and an honest counter', async ({ page }) => {
	// Positive control in the same flow: if the page were blank or erroring, this half would
	// fail too, so the zero-row assertion below cannot pass for the wrong reason.
	await search(page, GROUP_B.surname)
	const control = await snapshot(page)
	expect(control.length).toBeGreaterThan(0)
	expect(control).toHaveLength(GROUP_B.count)
	const before = await counts(page)
	expect(before.n).toBe(GROUP_B.count)
	expect(before.m).toBeGreaterThan(before.n)

	await search(page, NO_MATCH)
	const rows = await snapshot(page)
	expect(rows).toHaveLength(0)
	await expect(assignments(page).getByText('No employees match this filter')).toBeVisible()
	// Both numbers come out of the ONE string this render emitted. The org-wide total is not
	// this spec's to own — sibling specs create and delete employees in the same organization
	// under fullyParallel — so it is asserted non-zero, never equal to an earlier read.
	const after = await counts(page)
	expect(after.n).toBe(0)
	expect(after.m).toBeGreaterThan(0)
})

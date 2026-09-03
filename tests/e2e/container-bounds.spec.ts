import { test, expect, type Locator } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * UI/UX overhaul phase 10 (`container-bounds`) — the runtime half of the dashboard gates.
 *
 * THIS SPEC SEEDS ITS OWN FIXTURES, and it has to. The base seed has zero PROBATIONARY
 * employees, zero public holidays and exactly one job posting, which is OPEN — so all three
 * capped cards render empty or not at all, and a `toHaveCount(10)` would fail at 0 rather than
 * pass at 10. Same shape as `pagination.spec.ts`: serial mode, a distinctive marker, and a
 * best-effort teardown that clears `payrollEntry` FIRST because that FK is RESTRICT and a
 * payroll compute in another spec sweeps ACTIVE fixtures in.
 *
 * WHAT IT DOES NOT PROVE. Three cards on one page at two viewport widths. The other twenty
 * bounded containers in this phase have no runtime gate — they rest on the owner's look pass.
 */

test.describe.configure({ mode: 'serial' })

const MARKER = 'Zzboundtest'
const EMAIL_PREFIX = 'zzboundtest'
const DEPARTMENT = 'Zzbound Department'
const COUNT = 12
const CAP = 10

/** Midnight UTC `days` from now. */
const dayFromNow = (days: number) => {
	const d = new Date()
	d.setUTCDate(d.getUTCDate() + days)
	d.setUTCHours(0, 0, 0, 0)
	return d
}

test.beforeAll(async () => {
	const db = new PrismaClient()
	try {
		const admin = await db.user.findFirstOrThrow({
			where: { email: 'admin@veent.ph' },
			select: { id: true, organizationId: true }
		})
		const orgId = admin.organizationId

		// A department of its own, MAPPED to the admin (EMP-001) as designated approver.
		// `canApprovePosting` makes a mapped department decidable ONLY by its designated
		// approver; unmapped ones fall back to EVERY HR holder — which put these fixtures on
		// posting-approver-sod's twoHat card and pushed its own posting past the new cap of 10.
		// Mapping to the actor this spec logs in as keeps the card populated here and empty
		// everywhere else.
		const department = await db.department.upsert({
			where: { organizationId_name: { organizationId: orgId, name: DEPARTMENT } },
			update: {},
			create: { organizationId: orgId, name: DEPARTMENT }
		})
		const adminEmployee = await db.employee.findFirstOrThrow({
			where: { userId: admin.id },
			select: { id: true }
		})
		await db.postingApprover.upsert({
			where: {
				organizationId_departmentId: { organizationId: orgId, departmentId: department.id }
			},
			update: { approverId: adminEmployee.id },
			create: { organizationId: orgId, departmentId: department.id, approverId: adminEmployee.id }
		})

		// (a) Probationary staff inside the 21-day regularization notice window. Six months of
		// service exactly, so `regularizationDate` lands on or about today.
		const startDate = new Date()
		startDate.setUTCMonth(startDate.getUTCMonth() - 6)
		startDate.setUTCHours(0, 0, 0, 0)

		for (let i = 1; i <= COUNT; i++) {
			const n = String(i).padStart(3, '0')
			const user = await db.user.upsert({
				where: { email: `${EMAIL_PREFIX}${n}@example.test` },
				update: {},
				create: {
					organizationId: orgId,
					email: `${EMAIL_PREFIX}${n}@example.test`,
					// List fixtures only — nobody logs in as them.
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
					organizationId: orgId,
					employeeNumber: `ZZB-${n}`,
					firstName: `Bound${n}`,
					lastName: MARKER,
					departmentId: department.id,
					jobTitle: 'Container Bounds Fixture',
					// ACTIVE and PROBATIONARY are both load-bearing: the service filters on exactly
					// that pair, so offboarding these would empty the very card this spec counts.
					employmentType: 'PROBATIONARY',
					employmentStatus: 'ACTIVE',
					startDate,
					basicMonthlySalary: 10000,
					rateType: 'MONTHLY'
				}
			})
		}

		// (b) Holidays inside the 14-day event window — the cheapest way to overflow Upcoming
		// Events, since the base seed has none at all.
		for (let i = 1; i <= COUNT; i++) {
			const date = dayFromNow(i)
			await db.publicHoliday.create({
				data: {
					organizationId: orgId,
					date,
					name: `${MARKER} Holiday ${String(i).padStart(3, '0')}`,
					type: 'SPECIAL_NON_WORKING',
					year: date.getUTCFullYear()
				}
			})
		}

		// (c) Postings awaiting approval. `submittedById` must NOT be the logged-in actor, or the
		// service filters them out as self-approval.
		const submitter = await db.user.findFirstOrThrow({
			where: { email: 'employee@veent.ph' },
			select: { id: true }
		})
		for (let i = 1; i <= COUNT; i++) {
			await db.jobPosting.create({
				data: {
					organizationId: orgId,
					departmentId: department.id,
					title: `${MARKER} Posting ${String(i).padStart(3, '0')}`,
					description: 'Container bounds fixture.',
					status: 'PENDING_APPROVAL',
					createdById: submitter.id,
					submittedById: submitter.id
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
		// payrollEntry first: the fixtures are ACTIVE, so a compute in another spec attaches
		// entries, and that FK is RESTRICT — deleting the employee first takes the run down.
		await db.payrollEntry.deleteMany({ where: { employee: { lastName: MARKER } } })
		await db.employee.deleteMany({ where: { lastName: MARKER } })
		await db.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
		await db.jobPosting.deleteMany({ where: { title: { startsWith: MARKER } } })
		await db.publicHoliday.deleteMany({ where: { name: { startsWith: MARKER } } })
		// PostingApprover has no department relation field — resolve the id by name.
		const dept = await db.department.findFirst({
			where: { name: DEPARTMENT },
			select: { id: true }
		})
		if (dept) await db.postingApprover.deleteMany({ where: { departmentId: dept.id } })
		await db.department.deleteMany({ where: { name: DEPARTMENT } })
	} catch {
		// Best-effort, same as pagination.spec.ts: a concurrent compute can attach an entry
		// between two deletes. Leftovers are swept rather than failing teardown.
	} finally {
		await db.$disconnect()
	}
})

/** scrollHeight > clientHeight — the box really is holding more than it shows. */
const overflows = (el: Locator) => el.evaluate((node) => node.scrollHeight > node.clientHeight + 1)

const computed = (el: Locator, property: string) =>
	el.evaluate((node, p) => getComputedStyle(node).getPropertyValue(p), property)

test('the three dashboard cards cap at ten and scroll inside their boxes', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

	// ── G6, counts ───────────────────────────────────────────────────────────
	const events = page.getByRole('region', { name: 'Upcoming events' })
	const regularizations = page
		.locator('div.card', { hasText: 'Upcoming Regularizations' })
		.locator('ul')
	const postings = page
		.locator('div.card', { hasText: 'Postings awaiting your approval' })
		.locator('ul')

	await expect(events.locator('> li')).toHaveCount(CAP)
	await expect(regularizations.locator('> li')).toHaveCount(CAP)
	await expect(postings.locator('> li')).toHaveCount(CAP)

	// ── G6, the two view-all links ───────────────────────────────────────────
	await expect(page.getByRole('link', { name: 'View all employees' })).toBeVisible()
	await expect(page.getByRole('link', { name: 'View all postings' })).toBeVisible()

	// ── G9, the asserted ABSENCE, scoped to the one named card ───────────────
	// Upcoming Events has no destination to link to — there is no /events page — so the card
	// must carry no view-all link. Page-wide absence would prove nothing; the other two cards
	// have one each.
	await expect(events.getByRole('link', { name: /view all/i })).toHaveCount(0)

	// ── G7, geometry ─────────────────────────────────────────────────────────
	// Two patterns, and the assertion differs by design. `.card-scroll` sets an explicit
	// max-height; the Upcoming Events list instead stretches to its grid row via
	// `min-h-0 flex-1`, which sets NO max-height at all — asserting one there would fail on
	// correct code. And whether ten capped rows actually EXCEED the grid-driven row height is
	// viewport-dependent (they fit on a tall desktop), so `overflows` is not a valid gate for
	// this card either — the first full-suite run proved that. What correct code guarantees is
	// the MECHANISM: the box scrolls instead of growing (`overflow-y: auto`) and is allowed to
	// shrink below its content (`flex-grow: 1`, `min-height: 0`). Whether it looks right when
	// it does overflow is on the owner look pass, like the other twenty containers.
	expect(await computed(events, 'overflow-y')).toBe('auto')
	expect(await computed(events, 'flex-grow')).toBe('1')
	expect(await computed(events, 'min-height')).toBe('0px')

	for (const list of [regularizations, postings]) {
		expect(await overflows(list)).toBe(true)
		expect(await computed(list, 'max-height')).not.toBe('none')
	}
})

test('the capped dashboard fits a 390px viewport without horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await login(page, USERS.admin)
	await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

	// The `grid-cols-1` min-content floor: an implicit `auto` column plus a truncated line
	// pushes the card past 390px. Tailwind's numbered variant emits `minmax(0, 1fr)` instead.
	const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
	expect(scrollWidth).toBeLessThanOrEqual(390)

	// Still bounded at the narrow width — a `min(60vh, 28rem)` box resolves to 60vh here.
	const regularizations = page
		.locator('div.card', { hasText: 'Upcoming Regularizations' })
		.locator('ul')
	expect(await overflows(regularizations)).toBe(true)
})

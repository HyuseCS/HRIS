import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import type { ComplaintStatus, InventoryStatus } from '@prisma/client'
import { login, USERS } from './helpers'

// A4 — page-2-and-back coverage for the three paginated lists that had none:
// /separations, /inventory and /complaints (HR branch). /employees and /settings/org are
// covered by pagination.spec.ts and settings-org-assignments.spec.ts; nothing here touches them.
//
// Expectations are derived from source, not from a run:
//   - Pagination.svelte renders NOTHING unless total > pageSize (line 28), has no numbered
//     page links, and turns `← Previous` / `Next →` into plain <span>s at the ends. The label
//     is `start–end of total` with an EN-DASH.
//   - /separations and /inventory paginate on `page` at a fixed 20 (+page.server.ts).
//   - /complaints (HR) paginates on `page` at fitPageSize(rowPx 39, chromePx 226), which is
//     viewport-derived and clamped to [5,50] — so its page size is READ OFF THE PAGER, never
//     assumed. The employee branch's second pager uses `myPage`; logging in as HR keeps this
//     spec on the `page` one.
//
// Traps guarded: every role query is `exact: true` and every fixture is named with an opaque
// code (a fixture containing an English control word answers to that control's role query);
// row identity is taken in ONE evaluateAll snapshot and asserted non-empty before any
// `.every()`; both hooks sweep this file's own prefixes, because scripts/clean-e2e-employees.ts
// does not know them and a CI retry leaves residue behind.
//
// CLIENT-SIDE NAVIGATION RACE: `goBack()` and a `Next →` click both settle on the URL while the
// OLD page's rows are still in the DOM — SvelteKit commits the re-render after that. A snapshot
// taken in that window compares the previous page's rows (this file's first browser run failed
// exactly there, twice). So every client-side navigation is followed by `expectRangeStart`, a
// retrying web-first assertion on the pager's own label, before anything reads the table. The
// `page.goto` calls need no such gate: each one is a fresh document whose table is already
// server-rendered in the HTML that `domcontentloaded` waits for.
//
// Each route gets its own describe with a single test: fullyParallel is on, so one test per
// describe is what keeps beforeAll/afterAll bracketing exactly the test that uses them —
// and it is why there is no file-scope serial here (a file-scope serial SKIPS later tests when
// an earlier fixture chain fails, losing coverage without going red).

const FIXED_PAGE_SIZE = 20

const pager = (page: Page) => page.getByRole('navigation', { name: 'Pagination' })

// `${start}–${end} of ${total}` (EN-DASH). The pager's second "… of …" is `Page N of M`, so
// this takes the first match in DOM order — the range <p> that precedes the controls.
const rangeLabel = (page: Page) => pager(page).getByText(/of /).first()

/** The pager's own statement of what it is showing — the only honest source for page size. */
async function range(page: Page) {
	const label = await rangeLabel(page).innerText()
	const m = /(\d+)–(\d+) of (\d+)/.exec(label)
	if (!m) throw new Error(`Unreadable pager label: ${label}`)
	return { start: Number(m[1]), end: Number(m[2]), total: Number(m[3]) }
}

/**
 * Gate after every client-side navigation: retries until the pager says the NEW page is on
 * screen. Anchored on `start`, which differs between any two pages, so it cannot go green on
 * the outgoing page's label — unlike a row count, which page 1 and page 2 can share.
 */
async function expectRangeStart(page: Page, start: number) {
	await expect(rangeLabel(page)).toHaveText(new RegExp(`^${start}–\\d+ of \\d+$`))
}

/**
 * ONE snapshot of the rendered row identities. count() + nth(i) races the DOM, and an empty
 * page makes any later `.every()` vacuously true — so the non-empty check happens here.
 */
async function rowKeys(page: Page, selector: string, attr: string): Promise<string[]> {
	const keys = await page
		.locator(selector)
		.evaluateAll((els, a) => els.map((el) => el.getAttribute(a) ?? ''), attr)
	expect(keys.length, `${selector} rendered no rows to compare`).toBeGreaterThan(0)
	expect(
		keys.filter((k) => k === ''),
		`every row carries ${attr}`
	).toEqual([])
	return keys
}

function assertDisjoint(page1: string[], page2: string[]) {
	const seen = new Set(page1)
	expect(
		page2.filter((k) => seen.has(k)),
		'page 2 repeats no row from page 1'
	).toEqual([])
}

/** On the last page `Next →` is a <span>, not a link. Previous must still BE a link. */
async function expectLastPageEnds(page: Page) {
	await expect(pager(page).getByRole('link', { name: 'Next →', exact: true })).toHaveCount(0)
	await expect(pager(page).getByRole('link', { name: '← Previous', exact: true })).toHaveCount(1)
}

// ---------------------------------------------------------------------------
// /separations — fixed page size 20, no filters at all.
// ---------------------------------------------------------------------------

const SEP_LAST = 'Zzpgsep'
const SEP_EMAIL = 'zzpgsep001@example.test'
const SEP_COUNT = 25
// The first cell holds the name link AND the row holds an "Open" link, both to the same
// /separations/{id}; scoping to the first cell keeps one key per row.
const SEP_ROWS = 'tbody tr td:first-child a[href^="/separations/"]'

test.describe('separations list pagination', () => {
	test.beforeAll(async () => {
		const db = new PrismaClient()
		try {
			const admin = await db.user.findFirstOrThrow({
				where: { email: USERS.admin.email },
				select: { organizationId: true }
			})
			const department = await db.department.findFirstOrThrow({
				where: { organizationId: admin.organizationId },
				select: { id: true }
			})
			const user = await db.user.upsert({
				where: { email: SEP_EMAIL },
				update: {},
				create: {
					organizationId: admin.organizationId,
					email: SEP_EMAIL,
					passwordHash: 'not-a-real-hash',
					roles: ['EMPLOYEE'],
					isActive: false
				}
			})
			const employee = await db.employee.upsert({
				where: { userId: user.id },
				update: { employmentStatus: 'OFFBOARDED' },
				create: {
					userId: user.id,
					organizationId: admin.organizationId,
					employeeNumber: 'ZZPGSEP-001',
					firstName: 'Rowholder',
					lastName: SEP_LAST,
					departmentId: department.id,
					jobTitle: 'Separation Pagination Fixture',
					employmentType: 'REGULAR',
					// OFFBOARDED so a concurrent payroll compute does not sweep the row in and
					// attach a RESTRICT-ed payroll entry to it.
					employmentStatus: 'OFFBOARDED',
					startDate: new Date('2026-01-05'),
					basicMonthlySalary: 10000,
					rateType: 'MONTHLY'
				}
			})

			// Sweep first: a killed or retried run leaves these behind and the extra rows would
			// shift every page boundary below.
			await db.separationRecord.deleteMany({ where: { employeeId: employee.id } })
			await db.separationRecord.createMany({
				data: Array.from({ length: SEP_COUNT }, (_, i) => ({
					organizationId: admin.organizationId,
					employeeId: employee.id,
					type: 'RESIGNATION' as const,
					effectiveDate: new Date(Date.UTC(2030, 0, 1 + i)),
					// The list has NO filter, and separations.spec.ts creates its own records in
					// parallel. createdAt is the sort key (desc), so pinning these to a far future
					// date puts all 25 above anything another spec inserts — pages 1 and 2 are then
					// this spec's rows whatever else lands in the org.
					createdAt: new Date(Date.UTC(2099, 0, 1 + i))
				}))
			})
			const seeded = await db.separationRecord.count({ where: { employeeId: employee.id } })
			expect(seeded, 'separation fixtures exist before the walk').toBe(SEP_COUNT)
		} finally {
			await db.$disconnect()
		}
	})

	test.afterAll(async () => {
		const db = new PrismaClient()
		try {
			// FK order: records point at the employee, payroll entries are RESTRICT, employee → user
			// is RESTRICT. Best-effort — a concurrent compute can attach an entry between deletes.
			await db.separationRecord.deleteMany({ where: { employee: { lastName: SEP_LAST } } })
			await db.payrollEntry.deleteMany({ where: { employee: { lastName: SEP_LAST } } })
			await db.employee.deleteMany({ where: { lastName: SEP_LAST } })
			await db.user.deleteMany({ where: { email: { startsWith: 'zzpgsep' } } })
		} catch {
			// Leftovers are swept by this spec's own beforeAll on the next run.
		} finally {
			await db.$disconnect()
		}
	})

	test('pages forward, restores page 1 on back, and clamps an out-of-range page', async ({
		page
	}) => {
		await login(page, USERS.admin)
		await page.goto('/separations', { waitUntil: 'domcontentloaded' })

		// Page 1: full at the declared fixed size, with this spec's 25 rows at least behind it.
		const first = await range(page)
		expect(first.start).toBe(1)
		expect(first.end).toBe(FIXED_PAGE_SIZE)
		expect(first.total).toBeGreaterThanOrEqual(SEP_COUNT)
		await expect(page.locator(SEP_ROWS)).toHaveCount(FIXED_PAGE_SIZE)
		const page1 = await rowKeys(page, SEP_ROWS, 'href')

		// Next → page 2, and page 2 shows different records.
		await page.getByRole('link', { name: 'Next →', exact: true }).click()
		await page.waitForURL(/[?&]page=2(&|$)/, { waitUntil: 'domcontentloaded' })
		await expectRangeStart(page, FIXED_PAGE_SIZE + 1)
		const second = await range(page)
		expect(second.start).toBe(FIXED_PAGE_SIZE + 1)
		expect(second.total).toBe(first.total)
		const page2 = await rowKeys(page, SEP_ROWS, 'href')
		expect(page2).toHaveLength(second.end - second.start + 1)
		assertDisjoint(page1, page2)

		// Browser back restores page 1 with the identical row set, not merely a page-1 URL.
		await page.goBack({ waitUntil: 'domcontentloaded' })
		await expect(page).toHaveURL(/\/separations$/)
		await expectRangeStart(page, 1)
		await expect(page.locator(SEP_ROWS)).toHaveCount(FIXED_PAGE_SIZE)
		expect(await rowKeys(page, SEP_ROWS, 'href')).toEqual(page1)

		// ?page=99 clamps to the last real page instead of rendering empty.
		await page.goto('/separations?page=99', { waitUntil: 'domcontentloaded' })
		const last = await range(page)
		expect(last.total).toBeGreaterThanOrEqual(SEP_COUNT)
		expect(last.end).toBe(last.total)
		expect(last.start).toBe(last.total - ((last.total - 1) % FIXED_PAGE_SIZE))
		await expect(page.locator(SEP_ROWS)).toHaveCount(last.end - last.start + 1)
		await expectLastPageEnds(page)
	})
})

// ---------------------------------------------------------------------------
// /inventory — fixed page size 20, real filters (search, category, status, view).
// ---------------------------------------------------------------------------

const INV_PREFIX = 'ZZPGINV-'
const INV_COUNT = 25
const INV_IN_STOCK = 22
const INV_RETIRED = INV_COUNT - INV_IN_STOCK
const INV_CAT_MAIN = 'ZZCATA'
const INV_CAT_FEW = 'ZZCATB'
const INV_ROWS = 'tbody tr[data-name]'

test.describe('inventory list pagination', () => {
	test.beforeAll(async () => {
		const db = new PrismaClient()
		try {
			const admin = await db.user.findFirstOrThrow({
				where: { email: USERS.admin.email },
				select: { organizationId: true }
			})
			// Distinct from inventory.spec.ts's 'E2E ' prefix, which runs in parallel against the
			// same org — its rows must not show up in these counts, nor these in its row locators.
			await db.inventoryItem.deleteMany({
				where: { organizationId: admin.organizationId, name: { startsWith: INV_PREFIX } }
			})
			await db.inventoryItem.createMany({
				data: Array.from({ length: INV_COUNT }, (_, i) => {
					const few = i >= INV_IN_STOCK
					return {
						organizationId: admin.organizationId,
						name: `${INV_PREFIX}${String(i + 1).padStart(3, '0')}`,
						category: few ? INV_CAT_FEW : INV_CAT_MAIN,
						quantity: 1,
						unit: 'pc',
						status: (few ? 'RETIRED' : 'IN_STOCK') as InventoryStatus,
						// Sorted oldest-last by createdAt desc, so these 25 sit BELOW the seed items
						// and below anything inventory.spec.ts creates — its unfiltered row lookups
						// keep finding their rows on page 1.
						createdAt: new Date(Date.UTC(2000, 0, 1 + i))
					}
				})
			})
			const seeded = await db.inventoryItem.count({
				where: { organizationId: admin.organizationId, name: { startsWith: INV_PREFIX } }
			})
			expect(seeded, 'inventory fixtures exist before the walk').toBe(INV_COUNT)
		} finally {
			await db.$disconnect()
		}
	})

	test.afterAll(async () => {
		const db = new PrismaClient()
		try {
			await db.inventoryItem.deleteMany({ where: { name: { startsWith: INV_PREFIX } } })
		} catch {
			// Leftovers are swept by this spec's own beforeAll on the next run.
		} finally {
			await db.$disconnect()
		}
	})

	test('pages a filtered set, keeps the filter in the URL, and hides the pager when it fits', async ({
		page
	}) => {
		await login(page, USERS.admin)

		// The search filter isolates this spec's rows, so `total` is an exact claim.
		await page.goto(`/inventory?search=${INV_PREFIX}`, { waitUntil: 'domcontentloaded' })
		const first = await range(page)
		expect(first.start).toBe(1)
		expect(first.end).toBe(FIXED_PAGE_SIZE)
		expect(first.total).toBe(INV_COUNT)
		await expect(page.locator(INV_ROWS)).toHaveCount(FIXED_PAGE_SIZE)
		const page1 = await rowKeys(page, INV_ROWS, 'data-name')

		// Next → page 2: the search survives into the URL and the rows are different items.
		await page.getByRole('link', { name: 'Next →', exact: true }).click()
		await page.waitForURL(/[?&]page=2(&|$)/, { waitUntil: 'domcontentloaded' })
		await expect(page).toHaveURL(/[?&]search=ZZPGINV-/)
		await expect(page).toHaveURL(/[?&]page=2(&|$)/)
		await expectRangeStart(page, FIXED_PAGE_SIZE + 1)
		const second = await range(page)
		expect(second.start).toBe(FIXED_PAGE_SIZE + 1)
		expect(second.end).toBe(INV_COUNT)
		const page2 = await rowKeys(page, INV_ROWS, 'data-name')
		expect(page2).toHaveLength(INV_COUNT - FIXED_PAGE_SIZE)
		assertDisjoint(page1, page2)

		// Back restores page 1 with the identical row set and the filter intact.
		await page.goBack({ waitUntil: 'domcontentloaded' })
		await expect(page).toHaveURL(/[?&]search=ZZPGINV-/)
		await expect(page).not.toHaveURL(/[?&]page=2(&|$)/)
		await expectRangeStart(page, 1)
		await expect(page.locator(INV_ROWS)).toHaveCount(FIXED_PAGE_SIZE)
		expect(await rowKeys(page, INV_ROWS, 'data-name')).toEqual(page1)

		// ?page=99 clamps to the last real page of the FILTERED set.
		await page.goto(`/inventory?search=${INV_PREFIX}&page=99`, { waitUntil: 'domcontentloaded' })
		const last = await range(page)
		expect(last.total).toBe(INV_COUNT)
		expect(last.start).toBe(FIXED_PAGE_SIZE + 1)
		expect(last.end).toBe(INV_COUNT)
		await expect(page.locator(INV_ROWS)).toHaveCount(INV_COUNT - FIXED_PAGE_SIZE)
		await expectLastPageEnds(page)

		// Every active param rides along to page 2, including the view switch. In grid view the
		// table is not rendered at all, so this step asserts the URL and the pager label only.
		await page.goto(`/inventory?search=${INV_PREFIX}&status=IN_STOCK&view=grid`, {
			waitUntil: 'domcontentloaded'
		})
		const filtered = await range(page)
		expect(filtered.total).toBe(INV_IN_STOCK)
		await page.getByRole('link', { name: 'Next →', exact: true }).click()
		await page.waitForURL(/[?&]page=2(&|$)/, { waitUntil: 'domcontentloaded' })
		await expect(page).toHaveURL(/[?&]search=ZZPGINV-/)
		await expect(page).toHaveURL(/[?&]status=IN_STOCK/)
		await expect(page).toHaveURL(/[?&]view=grid/)
		await expectRangeStart(page, FIXED_PAGE_SIZE + 1)
		const filteredSecond = await range(page)
		expect(filteredSecond.start).toBe(FIXED_PAGE_SIZE + 1)
		expect(filteredSecond.end).toBe(INV_IN_STOCK)

		// A filtered set that fits on one page renders no pager at all — and still renders rows,
		// so the absent pager is not the absent page.
		await page.goto(`/inventory?search=${INV_PREFIX}&category=${INV_CAT_FEW}`, {
			waitUntil: 'domcontentloaded'
		})
		await expect(page.locator(INV_ROWS)).toHaveCount(INV_RETIRED)
		await expect(pager(page)).toHaveCount(0)
	})
})

// ---------------------------------------------------------------------------
// /complaints (HR branch) — page size is viewport-derived; nothing here assumes a number.
// ---------------------------------------------------------------------------

const CMP_PREFIX = 'ZZPGCMP-'
const CMP_LAST = 'Zzpgcmp'
const CMP_EMAIL = 'zzpgcmp001@example.test'
// fitPageSize clamps to [5,50], so 60 rows put a pager on the page at ANY window height.
const CMP_COUNT = 60
const CMP_ROWS = 'tbody tr a[href^="/complaints/"]'

test.describe('complaints list pagination (HR branch)', () => {
	test.beforeAll(async () => {
		const db = new PrismaClient()
		try {
			const hr = await db.user.findFirstOrThrow({
				where: { email: USERS.hr.email },
				select: { id: true, organizationId: true }
			})
			const department = await db.department.findFirstOrThrow({
				where: { organizationId: hr.organizationId },
				select: { id: true }
			})
			const user = await db.user.upsert({
				where: { email: CMP_EMAIL },
				update: {},
				create: {
					organizationId: hr.organizationId,
					email: CMP_EMAIL,
					passwordHash: 'not-a-real-hash',
					roles: ['EMPLOYEE'],
					isActive: false
				}
			})
			const employee = await db.employee.upsert({
				where: { userId: user.id },
				update: { employmentStatus: 'OFFBOARDED' },
				create: {
					userId: user.id,
					organizationId: hr.organizationId,
					employeeNumber: 'ZZPGCMP-001',
					firstName: 'Threadholder',
					lastName: CMP_LAST,
					departmentId: department.id,
					jobTitle: 'Complaint Pagination Fixture',
					employmentType: 'REGULAR',
					employmentStatus: 'OFFBOARDED',
					startDate: new Date('2026-01-05'),
					basicMonthlySalary: 10000,
					rateType: 'MONTHLY'
				}
			})

			await db.hrComplaint.deleteMany({ where: { subject: { startsWith: CMP_PREFIX } } })
			await db.hrComplaint.createMany({
				data: Array.from({ length: CMP_COUNT }, (_, i) => ({
					organizationId: hr.organizationId,
					employeeId: employee.id,
					openedById: hr.id,
					subject: `${CMP_PREFIX}${String(i + 1).padStart(3, '0')}`,
					// The HR list's only filter is status. RESOLVED isolates these rows: the seed
					// creates no complaints and page-header-helptip.spec.ts's single fixture is OPEN.
					status: 'RESOLVED' as ComplaintStatus,
					resolvedAt: new Date()
				}))
			})
			const seeded = await db.hrComplaint.count({
				where: { organizationId: hr.organizationId, status: 'RESOLVED' }
			})
			expect(seeded, 'the RESOLVED set is exactly this spec’s fixtures').toBe(CMP_COUNT)
		} finally {
			await db.$disconnect()
		}
	})

	test.afterAll(async () => {
		const db = new PrismaClient()
		try {
			await db.hrComplaint.deleteMany({ where: { subject: { startsWith: CMP_PREFIX } } })
			await db.payrollEntry.deleteMany({ where: { employee: { lastName: CMP_LAST } } })
			await db.employee.deleteMany({ where: { lastName: CMP_LAST } })
			await db.user.deleteMany({ where: { email: { startsWith: 'zzpgcmp' } } })
		} catch {
			// Leftovers are swept by this spec's own beforeAll on the next run.
		} finally {
			await db.$disconnect()
		}
	})

	test('pages the HR queue at the viewport-derived size, back and clamp included', async ({
		page
	}) => {
		await login(page, USERS.hr)
		await page.goto('/complaints?status=RESOLVED', { waitUntil: 'domcontentloaded' })

		// The page size is whatever fitPageSize derived for THIS window — read it, never assume it.
		const first = await range(page)
		expect(first.start).toBe(1)
		expect(first.total).toBe(CMP_COUNT)
		expect(first.end).toBeLessThan(CMP_COUNT)
		const size = first.end
		expect(size, 'page size is inside fitPageSize’s clamp').toBeGreaterThanOrEqual(5)
		expect(size).toBeLessThanOrEqual(50)
		await expect(page.locator(CMP_ROWS)).toHaveCount(size)
		const page1 = await rowKeys(page, CMP_ROWS, 'href')

		// Next → page 2 on the `page` param (NOT the employee branch's `myPage`).
		await page.getByRole('link', { name: 'Next →', exact: true }).click()
		await page.waitForURL(/[?&]page=2(&|$)/, { waitUntil: 'domcontentloaded' })
		await expect(page).toHaveURL(/[?&]status=RESOLVED/)
		await expect(page).not.toHaveURL(/myPage=/)
		await expectRangeStart(page, size + 1)
		const second = await range(page)
		expect(second.start).toBe(size + 1)
		expect(second.end).toBe(Math.min(size * 2, CMP_COUNT))
		const page2 = await rowKeys(page, CMP_ROWS, 'href')
		expect(page2).toHaveLength(second.end - second.start + 1)
		assertDisjoint(page1, page2)

		// Back restores page 1 with the identical threads and the status filter intact.
		await page.goBack({ waitUntil: 'domcontentloaded' })
		await expect(page).toHaveURL(/[?&]status=RESOLVED/)
		await expect(page).not.toHaveURL(/[?&]page=2(&|$)/)
		await expectRangeStart(page, 1)
		await expect(page.locator(CMP_ROWS)).toHaveCount(size)
		expect(await rowKeys(page, CMP_ROWS, 'href')).toEqual(page1)

		// ?page=99 clamps to the last real page of the filtered set.
		await page.goto('/complaints?status=RESOLVED&page=99', { waitUntil: 'domcontentloaded' })
		const last = await range(page)
		expect(last.total).toBe(CMP_COUNT)
		expect(last.end).toBe(CMP_COUNT)
		expect(last.start).toBe(CMP_COUNT - ((CMP_COUNT - 1) % size))
		await expect(page.locator(CMP_ROWS)).toHaveCount(last.end - last.start + 1)
		await expectLastPageEnds(page)
	})
})

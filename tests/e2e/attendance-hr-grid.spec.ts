import { test, expect, type Locator, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'
import { manilaShortDay } from '../../src/lib/utils/dates'

/**
 * A1 — the HR correction grid's own controls: the team-day bulk bar, the exceptions filter, the
 * per-row correct/reset pair, the employee-view per-page bulk bar, and the pinned Save column.
 * `attendance-view-switch` owns the two-state switch, `attendance-display-matches-stored` owns
 * per-row Save in the EMPLOYEE view, `attendance-save-timesheet-custom-range` owns the timesheet
 * button, and `employee-view-only` owns the employee-role lockout — none of that is repeated here.
 *
 * Expectations are derived from source, not from what the DOM happens to render:
 *  - the toast strings are the server's own (`attendance/+page.server.ts` `bulkSaved`, `lockTeam`,
 *    `unlockTeam`, `correct`, `resetDay`), and the day name comes from the production
 *    `manilaShortDay` rather than a re-implementation, so a formatter change reddens the test;
 *  - the two confirm dialogs and their DIFFERENT confirm labels come from the two `ConfirmButton`
 *    call sites in `AttendanceHrGrid.svelte` (`Reset` for resetDay, `Recalculate` for resetAll);
 *  - every stored assertion reads Prisma back, never the value the spec typed.
 *
 * 2027-03-04 (team day), 2027-03-08/09 (employee range) and 2027-03-11 (sticky column) are this
 * spec's own windows — all weekdays, so a punch-less day derives ABSENT rather than REST_DAY, and
 * none of them is claimed by another spec. `global-setup` never touches `attendanceDay`, so each
 * window is swept in beforeAll as well as afterAll: a CI retry leaves residue behind.
 *
 * No team fixture names a seeded PERSON. The team grid pages the whole ACTIVE roster
 * (`fitPageSize`, capped at 50 rows) and half a dozen concurrent specs seed tens of employees into
 * the same org, so no particular employee is reliably on page 1 — a spec that assumed one reds for
 * a roster change it has nothing to do with. Each describe instead reads the rows the page renders
 * and seeds the day for THOSE employees; every claim here is true of any row.
 *
 * Traps guarded throughout: `getByRole` name matching is a case-insensitive SUBSTRING unless
 * `exact: true` — `Save` sits inside `Save as timesheet`, `Save N changed days on this page` and
 * `Saving…`; `Lock day` sits inside `Unlock day`; and `Recalculate` is four different things (a
 * per-row trigger, a bulk trigger, a dialog confirm button, and a `role="group"` wrapping
 * `Refresh`). Every control below is matched exactly and scoped to its row, group or dialog.
 */

const DAY = '2027-03-04'
const DATE = new Date(`${DAY}T00:00:00Z`)
const TEAM_URL = `/attendance?view=team&date=${DAY}`

const FROM = '2027-03-08'
const TO = '2027-03-09'
const RANGE_DAYS = [FROM, TO] as const

const STICKY_DAY = '2027-03-11'
const STICKY_DATE = new Date(`${STICKY_DAY}T00:00:00Z`)

type Emp = { id: string; employeeNumber: string }

async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
	const db = new PrismaClient()
	try {
		return await fn(db)
	} finally {
		await db.$disconnect()
	}
}

function employeeByEmail(db: PrismaClient, email: string): Promise<Emp> {
	return db.employee.findFirstOrThrow({
		where: { user: { email } },
		select: { id: true, employeeNumber: true }
	})
}

/** A worked 09:00–18:00 PHT day. `manuallyEdited` decides whether Refresh may overwrite it. */
function presentDay(employeeId: string, dayKey: string, manuallyEdited: boolean) {
	return {
		employeeId,
		date: new Date(`${dayKey}T00:00:00Z`),
		status: 'PRESENT' as const,
		timeIn: new Date(`${dayKey}T01:00:00Z`),
		timeOut: new Date(`${dayKey}T10:00:00Z`),
		workedHours: 8,
		regularHours: 8,
		manuallyEdited
	}
}

/**
 * Rows are found by employee NUMBER, an opaque code no control on this page is named after. The
 * parentheses are part of the match: the number is rendered as `({t.employeeNumber})`, and a bare
 * `hasText` substring would let `EMP-1` answer for `EMP-10`.
 */
const rowOf = (page: Page, employeeNumber: string) =>
	page.locator('tbody tr').filter({ hasText: `(${employeeNumber})` })

/**
 * Employee numbers of the rendered team rows, in render order, from ONE snapshot. Parsed out of
 * the first cell rather than counted as rows: the `{:else}` empty state is a `<tr>` too, so a row
 * count would let an empty grid satisfy a set-wide claim vacuously.
 */
async function rowNumbers(page: Page, atLeast = 1): Promise<string[]> {
	const cells = await page
		.locator('tbody tr td:first-child')
		.evaluateAll((els) => els.map((e) => e.textContent ?? ''))
	const numbers = cells.flatMap((t) => /\(([^)]+)\)$/.exec(t.trim())?.[1] ?? [])
	expect(numbers.length, `team rows rendered: ${JSON.stringify(cells)}`).toBeGreaterThanOrEqual(
		atLeast
	)
	return numbers
}

/** `employeeNumber` is unique per ORG, not globally — resolve inside the admin's own tenant. */
async function employeesByNumber(db: PrismaClient, numbers: string[]): Promise<Emp[]> {
	const { organizationId } = await db.employee.findFirstOrThrow({
		where: { user: { email: USERS.admin.email } },
		select: { organizationId: true }
	})
	return Promise.all(
		numbers.map((employeeNumber) =>
			db.employee.findFirstOrThrow({
				where: { organizationId, employeeNumber },
				select: { id: true, employeeNumber: true }
			})
		)
	)
}

/**
 * Seed `dayKey` for the first `count` employees the grid actually shows, reload, and hand them
 * back in render order. Only the FIRST is `manuallyEdited`: Refresh leaves that one PRESENT while
 * every other row re-derives to ABSENT, which is the single non-exception row the exceptions test
 * measures against. Seeding is also what makes a row editable — without a day the cell reads
 * "no record".
 */
async function seedShownRows(
	page: Page,
	count: number,
	dayKey: string,
	date: Date
): Promise<Emp[]> {
	const numbers = await rowNumbers(page, count)
	const shown = await withDb(async (db) => {
		const emps = await employeesByNumber(db, numbers.slice(0, count))
		await db.attendanceDay.deleteMany({ where: { date } })
		await db.attendanceDay.createMany({
			data: emps.map((e, i) => presentDay(e.id, dayKey, i === 0))
		})
		return emps
	})
	await page.reload({ waitUntil: 'domcontentloaded' })
	return shown
}

async function shownCount(page: Page): Promise<number> {
	const text = (await page.getByText(/^\d+ shown$/).textContent()) ?? ''
	const m = /(\d+) shown/.exec(text)
	expect(m, `no "N shown" counter, got ${JSON.stringify(text)}`).not.toBeNull()
	return Number(m![1])
}

/** The enhanced forms POST to `?/<action>`; match the decoded URL so an encoded `/` still hits. */
const posts = (page: Page, action: string) =>
	page.waitForRequest((r) => r.method() === 'POST' && decodeURIComponent(r.url()).includes(action))

test.describe('Attendance team day — bulk bar, exceptions and per-row correction', () => {
	// The whole day is one fixture: Refresh, Lock and the manual edit each rewrite it, so these
	// tests are genuinely ordered. Serial is scoped to this describe, never to the file.
	test.describe.configure({ mode: 'serial' })
	// Tall enough for ~38 rows at `fitPageSize` (rowPx 45, chromePx 475). The three rows below are
	// the FIRST three the grid renders, so a roster that grows under us moves them down the page
	// rather than off it — but they are still asserted present, never assumed.
	test.use({ viewport: { width: 1280, height: 2200 } })

	let anchor: Emp
	let target: Emp
	let control: Emp

	test.beforeAll(async () => {
		await withDb((db) => db.attendanceDay.deleteMany({ where: { date: DATE } }))
	})

	test.afterAll(async () => {
		await withDb((db) => db.attendanceDay.deleteMany({ where: { date: DATE } }))
	})

	test('Refresh re-derives the day, Lock/Unlock closes and reopens it, Export CSV links to it', async ({
		page
	}) => {
		test.slow()
		await login(page, USERS.admin)
		await page.goto(TEAM_URL, { waitUntil: 'domcontentloaded' })
		// Serial describe: the three rows the whole describe corrects are chosen HERE, off the
		// rendered page, and the day is seeded for them.
		;[anchor, target, control] = await seedShownRows(page, 3, DAY, DATE)

		const anchorRow = rowOf(page, anchor.employeeNumber)
		await expect(anchorRow).toHaveCount(1)

		await expect(page.getByRole('link', { name: 'Export CSV' })).toHaveAttribute(
			'href',
			`/attendance/export?view=team&date=${DAY}`
		)

		// Scoped to the group: the empty-state copy ("No punches yet, or use Refresh.") also says
		// Refresh, and the group is the only place the button lives.
		const refresh = page
			.getByRole('group', { name: 'Recalculate' })
			.getByRole('button', { name: 'Refresh', exact: true })
		const derived = posts(page, '?/deriveTeam')
		await refresh.click()
		await derived
		// The re-derive itself, not merely that the POST went out: a weekday with no punches
		// derives ABSENT, so the machine-written row must come back ABSENT while the manually
		// edited one is left PRESENT. A no-op Refresh leaves both PRESENT and reds both lines.
		// Polled through the DOM because `posts()` resolves when the request is SENT.
		const targetStatus = rowOf(page, target.employeeNumber).locator('select[name="status"]')
		await expect(targetStatus).toHaveValue('ABSENT')
		const anchorStatus = anchorRow.locator('select[name="status"]')
		await expect(anchorStatus).toHaveValue('PRESENT')

		const lockGroup = page.getByRole('group', { name: 'Lock & release' })
		// exact: `Lock day` is a substring of `Unlock day` under the default matcher.
		const locked = posts(page, '?/lockTeam')
		await lockGroup.getByRole('button', { name: 'Lock day', exact: true }).click()
		await locked
		await expect(page.getByText('Attendance locked for the day.')).toBeVisible()

		const actions = anchorRow.locator('td').last()
		await expect(actions.getByText('locked', { exact: true })).toBeVisible()
		// The paired claim: `anchorStatus` was asserted PRESENT three lines up, so this zero is the
		// editor genuinely going away. A `Save` count of zero would NOT be — the button only
		// renders on a dirty row, and the lock POST re-renders the table, dropping edit state; it
		// would read zero with or without the lock.
		await expect(anchorStatus).toHaveCount(0)

		const unlock = lockGroup.getByRole('button', { name: 'Unlock day', exact: true })
		await expect(unlock).toHaveCount(1)
		await unlock.click()
		await expect(page.getByText('Attendance reopened for the day.')).toBeVisible()

		await expect(actions.getByText('locked', { exact: true })).toHaveCount(0)
		await expect(anchorStatus).toBeVisible()
		await anchorStatus.selectOption('ON_LEAVE')
		await expect(anchorRow.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
	})

	test('Exceptions only drops the page param and filters the clean row out of the count', async ({
		page
	}) => {
		await login(page, USERS.admin)
		await page.goto(`${TEAM_URL}&page=1`, { waitUntil: 'domcontentloaded' })

		const anchorRow = rowOf(page, anchor.employeeNumber)
		await expect(anchorRow).toHaveCount(1)
		const before = await shownCount(page)

		// The accessible name is the whole label ("Exceptions only absent, incomplete & late"), so
		// this is a deliberate substring match.
		await page.getByRole('checkbox', { name: 'Exceptions only' }).check()

		await expect(page).toHaveURL(/exceptions=1/)
		expect(new URL(page.url()).searchParams.has('page')).toBe(false)
		// Settles the re-render before the counter is read, and is the assertion itself: the one
		// PRESENT row must be gone.
		await expect(anchorRow).toHaveCount(0)

		const after = await shownCount(page)
		expect(after).toBeLessThan(before)

		// ONE snapshot, asserted non-empty before any set-wide claim — an empty page would satisfy
		// the "anchor is absent" assertion vacuously. Whole-number equality, not a substring.
		const numbers = await rowNumbers(page)
		expect(numbers).not.toContain(anchor.employeeNumber)
		expect(numbers).toContain(target.employeeNumber)
	})

	test('correcting a team row saves it and stores what the row shows', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto(TEAM_URL, { waitUntil: 'domcontentloaded' })

		const row = rowOf(page, target.employeeNumber)
		const save = row.getByRole('button', { name: 'Save', exact: true })
		await expect(row).toHaveCount(1)
		await expect(save).toHaveCount(0)

		await row.locator('select[name="status"]').selectOption('ON_LEAVE')
		await expect(save).toBeVisible()
		await save.click()
		await expect(page.getByText(`${manilaShortDay(DATE)} saved.`)).toBeVisible()

		const stored = await withDb((db) =>
			db.attendanceDay.findFirstOrThrow({ where: { employeeId: target.id, date: DATE } })
		)
		expect(stored.status).toBe('ON_LEAVE')
		expect(stored.manuallyEdited).toBe(true)
		await expect(row.locator('select[name="status"]')).toHaveValue(stored.status)
	})

	test('Recalculate discards the manual edit, and only an edited row offers it', async ({
		page
	}) => {
		await login(page, USERS.admin)
		await page.goto(TEAM_URL, { waitUntil: 'domcontentloaded' })

		const edited = rowOf(page, target.employeeNumber)
		const untouched = rowOf(page, control.employeeNumber)
		// exact + row scope: the bulk trigger, the dialog confirm and the `role="group"` wrapper
		// all answer to a loose `Recalculate`.
		const trigger = (row: Locator) => row.getByRole('button', { name: 'Recalculate', exact: true })

		await expect(untouched).toHaveCount(1)
		// The positive control on the next line is what stops this zero from being vacuous.
		await expect(trigger(untouched)).toHaveCount(0)
		await expect(trigger(edited)).toHaveCount(1)

		await trigger(edited).click()
		const dialog = page.getByRole('alertdialog', { name: 'Discard the manual edit?' })
		await expect(dialog).toBeVisible()
		// resetDay confirms with `Reset`; only resetAll confirms with `Recalculate`.
		await dialog.getByRole('button', { name: 'Reset', exact: true }).click()

		await expect(page.getByText(`${manilaShortDay(DATE)} recalculated from punches.`)).toBeVisible()
		const stored = await withDb((db) =>
			db.attendanceDay.findFirstOrThrow({ where: { employeeId: target.id, date: DATE } })
		)
		expect(stored.manuallyEdited).toBe(false)
		// The edit is DISCARDED, not just unflagged: the corrected ON_LEAVE has to be replaced by
		// what the punches derive, and a punch-less weekday derives ABSENT. Clearing the flag alone
		// would leave ON_LEAVE standing and pass the line above.
		expect(stored.status).toBe('ABSENT')
	})
})

test.describe('Attendance employee view — save all and recalculate all on this page', () => {
	test.use({ viewport: { width: 1280, height: 2200 } })

	let self: Emp

	test.beforeAll(async () => {
		await withDb(async (db) => {
			self = await employeeByEmail(db, USERS.employee.email)
			await db.attendanceDay.deleteMany({
				where: { employeeId: self.id, date: { in: RANGE_DAYS.map((d) => new Date(d)) } }
			})
			await db.attendanceDay.createMany({
				data: RANGE_DAYS.map((d) => presentDay(self.id, d, false))
			})
		})
	})

	test.afterAll(async () => {
		await withDb((db) =>
			db.attendanceDay.deleteMany({
				where: { employeeId: self.id, date: { in: RANGE_DAYS.map((d) => new Date(d)) } }
			})
		)
	})

	test('the per-page bulk bar saves both dirty days and then discards both edits', async ({
		page
	}) => {
		test.slow()
		await login(page, USERS.admin)
		await page.goto(`/attendance?view=employee&employeeId=${self.id}&from=${FROM}&to=${TO}`, {
			waitUntil: 'domcontentloaded'
		})

		const rows = RANGE_DAYS.map((d) =>
			page.locator('tbody tr').filter({ hasText: manilaShortDay(new Date(`${d}T00:00:00Z`)) })
		)
		for (const row of rows) await expect(row).toHaveCount(1)

		// Exact full labels: `Save`, `Saving…` and `Save as timesheet` all answer to a loose `Save`.
		await expect(
			page.getByRole('button', { name: 'Save 0 changed days on this page', exact: true })
		).toBeDisabled()

		for (const row of rows) await row.locator('input[name="timeIn"]').fill('10:00')

		const saveAll = page.getByRole('button', {
			name: 'Save 2 changed days on this page',
			exact: true
		})
		await expect(saveAll).toBeEnabled()
		await saveAll.click()
		await expect(page.getByText('Saved 2 days.')).toBeVisible()

		for (const d of RANGE_DAYS) {
			const stored = await withDb((db) =>
				db.attendanceDay.findFirstOrThrow({
					where: { employeeId: self.id, date: new Date(`${d}T00:00:00Z`) }
				})
			)
			expect(stored.manuallyEdited).toBe(true)
			expect(stored.timeIn?.toISOString()).toBe(`${d}T02:00:00.000Z`)
		}

		const resetAll = page.getByRole('button', {
			name: 'Recalculate 2 days on this page',
			exact: true
		})
		await expect(resetAll).toBeEnabled()
		await resetAll.click()

		const dialog = page.getByRole('alertdialog', { name: 'Discard 2 manual edits?' })
		await expect(dialog).toBeVisible()
		// resetAll confirms with `Recalculate` — resetDay's dialog confirms with `Reset`.
		await dialog.getByRole('button', { name: 'Recalculate', exact: true }).click()
		await expect(page.getByText('Recalculated 2 days.')).toBeVisible()

		for (const d of RANGE_DAYS) {
			const stored = await withDb((db) =>
				db.attendanceDay.findFirstOrThrow({
					where: { employeeId: self.id, date: new Date(`${d}T00:00:00Z`) }
				})
			)
			expect(stored.manuallyEdited).toBe(false)
			// Same as the team-row reset: the typed 10:00 has to be gone, not merely unflagged.
			// These days have no punches, so the re-derive leaves no time in at all.
			expect(stored.timeIn).toBeNull()
		}
	})
})

test.describe('Attendance team day — the Save column stays pinned', () => {
	// Narrow enough that the twelve-ish column team table genuinely scrolls; the assertion below
	// proves it rather than assuming it.
	test.use({ viewport: { width: 480, height: 900 } })

	test.beforeAll(async () => {
		await withDb((db) => db.attendanceDay.deleteMany({ where: { date: STICKY_DATE } }))
	})

	test.afterAll(async () => {
		await withDb((db) => db.attendanceDay.deleteMany({ where: { date: STICKY_DATE } }))
	})

	test('the actions cell is inside the right edge with the overflow unscrolled, and does not move when its siblings do', async ({
		page
	}) => {
		await login(page, USERS.admin)
		await page.goto(`/attendance?view=team&date=${STICKY_DAY}`, { waitUntil: 'domcontentloaded' })
		// This viewport fits ~9 rows, so the row under test is whoever the grid lists first. An
		// editable row widens In/Out to the TimePicker's own width, which is what makes the table
		// overflow a narrow viewport — so it has to be the seeded one.
		const [pinned] = await seedShownRows(page, 1, STICKY_DAY, STICKY_DATE)

		const row = rowOf(page, pinned.employeeNumber)
		await expect(row).toHaveCount(1)
		const container = page.locator('div.overflow-x-auto').filter({ has: page.locator('table') })
		await expect(container).toHaveCount(1)

		const actionsCell = row.locator('td').last()
		const plainCell = row.locator('td').first()
		const boxOf = async (l: Locator, what: string) => {
			const b = await l.boundingBox()
			expect(b, `${what} has no box`).not.toBeNull()
			return b!
		}
		const scrollTo = async (x: number) => {
			await container.evaluate((el, to) => {
				el.scrollLeft = to
			}, x)
			await expect.poll(() => container.evaluate((el) => Math.round(el.scrollLeft))).toBe(x)
		}

		// Derived from the real layout, never a guessed number — and the claim is meaningless
		// without it, so a table that fits reds here instead of passing quietly.
		const max = await container.evaluate((el) => Math.round(el.scrollWidth - el.clientWidth))
		expect(max, 'the team table does not overflow this viewport — nothing to pin').toBeGreaterThan(
			0
		)

		// Every tolerance below is HALF THE SCROLL DISTANCE, not a pixel count anyone chose. Each
		// measurement has exactly two possible outcomes: pinned (a few px of jitter — the scrollbar
		// and subpixel layout genuinely move the right edge between the two scroll positions) or
		// unpinned (the full `max`, hundreds of px). Half the distance is the empty middle between
		// them, so the threshold is far above the noise and just as far below the signal. Whatever
		// the viewport does to the noise floor, it scales with the same number the signal does.
		const half = max / 2

		// scrollLeft 0 is the discriminating position. The whole overflow is still to the RIGHT, so
		// the last column's right edge sits `max` px PAST the container's right edge unless it is
		// pinned. At full right scroll both cases land flush against that edge — which is why
		// measuring there proves nothing.
		await scrollTo(0)
		const box = await boxOf(container, 'the scroll container')
		const pinnedAt0 = await boxOf(actionsCell, 'the actions cell')
		const plainAt0 = await boxOf(plainCell, 'the employee cell')
		const right = box.x + box.width
		expect(pinnedAt0.x).toBeGreaterThanOrEqual(box.x)
		expect(pinnedAt0.x + pinnedAt0.width - right).toBeLessThan(half)
		// Positive control for that pair: an unpinned cell IS where the unscrolled table puts it.
		expect(Math.abs(plainAt0.x - box.x)).toBeLessThan(half)

		// The second, independent proof: scrolling moves the row's other cells by the full scroll
		// distance and leaves the pinned one where it was. Stated against the sibling's MEASURED
		// travel rather than against a constant — an unpinned actions cell travels exactly as far
		// as the sibling does, so the ratio, not the pixel count, is what separates the two.
		await scrollTo(max)
		const pinnedAtMax = await boxOf(actionsCell, 'the actions cell')
		const plainAtMax = await boxOf(plainCell, 'the employee cell')
		const siblingTravel = plainAt0.x - plainAtMax.x
		expect(Math.abs(siblingTravel - max)).toBeLessThan(half)
		expect(Math.abs(pinnedAtMax.x - pinnedAt0.x)).toBeLessThan(siblingTravel / 2)
	})
})

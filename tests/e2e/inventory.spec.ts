import { test, expect, type Locator, type Page } from '@playwright/test'
import { login, USERS } from './helpers'

// #114 — Inventory registry. The seed provides three demo items (MacBook, Office Chair,
// retired Projector). Rows carry data-name so they can be targeted after a client-side
// nav (Svelte updates the value property, not the SSR value attribute).
test.describe.configure({ mode: 'serial' })

// ponytail: this spec creates its own User + Employee rather than picking an existing one.
// A pick is silently nulled when another spec deletes its own fixtures (assignedTo is SetNull),
// which makes the assertion vacuously green. Do not replace this with a query.
//
// Every inventory row this spec creates — the DB fixture and every disposable item made
// through the modal — is named with SPEC_PREFIX, and both hooks delete that prefix inside the
// admin's org. `CI=1` retries twice, so a test that fails AFTER its create leaves the row
// behind; without the beforeAll sweep the next run finds several and every row locator is a
// strict-mode violation. No seed item can be swept: the three are `MacBook Pro 14"`,
// `Office Chair` and `Projector (old)` (prisma/seed-core.ts), none of which starts with 'E2E '.
const SPEC_PREFIX = 'E2E '
// Disposable items also carry a per-run, per-create suffix, so a leftover row from a failed
// attempt can never collide with the row the retry creates.
const RUN_ID = `${Date.now().toString(36)}${process.pid.toString(36)}`
let tempSeq = 0
const tempName = (label: string) => `${SPEC_PREFIX}Temp ${label} ${RUN_ID}-${++tempSeq}`

const FIXTURE_NAME = `${SPEC_PREFIX}Fixture Asset`
const FIXTURE_NOTES = 'E2E notes sentinel — must survive a modal save'
const FIXTURE_EMAIL = 'zzinvfixture@example.test'
const FIXTURE_LAST = 'Zzinvfixture'
const FIXTURE_FIRST = 'Holder'
// `empName` renders `${lastName}, ${firstName}` (inventory/+page.svelte).
const FIXTURE_HOLDER_NAME = `${FIXTURE_LAST}, ${FIXTURE_FIRST}`
let fixtureHolderId = ''
let fixtureOrgId = ''

// itemSchema's ten field names (src/routes/(app)/inventory/+page.server.ts), sorted.
const FIELD_NAMES = [
	'assignedToId',
	'category',
	'location',
	'name',
	'notes',
	'quantity',
	'serialNumber',
	'status',
	'unit',
	'value'
]

const LIST_SELECTOR = 'section[tabindex="-1"]'

// Rows and cards both carry data-name and CSS hides one of them, so the helper matches the
// attribute and :visible, never `tr`. The value is single-quoted because one seed name ends
// in a double quote (`MacBook Pro 14"`), which would close a double-quoted selector early.
const sel = (name: string) => `[data-name='${name.replace(/'/g, "\\'")}']`
const row = (page: Page, name: string) => page.locator(`${sel(name)}:visible`)
const rowButton = (page: Page, name: string) => row(page, name).locator('button')
const dialog = (page: Page) => page.getByRole('dialog')

async function gotoInventory(page: Page, query = '') {
	await page.goto(`/inventory${query}`, { waitUntil: 'domcontentloaded' })
	await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible()
}

async function gotoFixture(page: Page) {
	await gotoInventory(page, `?search=${encodeURIComponent(FIXTURE_NAME)}`)
	await expect(row(page, FIXTURE_NAME)).toBeVisible()
}

async function openItem(page: Page, name: string) {
	await rowButton(page, name).click()
	await expect(dialog(page)).toBeVisible()
	return dialog(page)
}

async function createItem(page: Page, name: string) {
	await page.getByRole('button', { name: 'Add item' }).click()
	const d = dialog(page)
	await expect(d).toBeVisible()
	await d.locator('#i-name').fill(name)
	await d.getByRole('button', { name: 'Create item' }).click()
	await expect(d).toBeHidden()
	await expect(row(page, name)).toBeVisible()
}

async function deleteItem(page: Page, name: string) {
	const d = await openItem(page, name)
	await d.getByRole('button', { name: 'Delete' }).click()
	await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
	await expect(row(page, name)).toHaveCount(0)
}

const fieldNamesOf = (d: Locator) =>
	d.evaluate((el) =>
		[...el.querySelectorAll('[name]')]
			.map((n) => n.getAttribute('name'))
			.filter((n): n is string => !!n && n !== 'id')
			.sort()
	)

test.beforeAll(async () => {
	const { PrismaClient } = await import('@prisma/client')
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

		// Required fields taken from prisma/schema.prisma: User needs organizationId, email,
		// passwordHash; Employee needs userId, organizationId, employeeNumber (unique per org),
		// firstName, lastName, departmentId, jobTitle, employmentType, startDate,
		// basicMonthlySalary. Same shape pagination.spec.ts:28-58 uses.
		const user = await db.user.upsert({
			where: { email: FIXTURE_EMAIL },
			update: {},
			create: {
				organizationId: admin.organizationId,
				email: FIXTURE_EMAIL,
				// Fixture only — nobody logs in as this row.
				passwordHash: 'not-a-real-hash',
				roles: ['EMPLOYEE'],
				isActive: false
			}
		})
		const holder = await db.employee.upsert({
			where: { userId: user.id },
			// OFFBOARDED on both paths, so a leftover row from a killed run is corrected, never
			// inherited. OFFBOARDED is what keeps them out of the load's
			// `where: { employmentStatus: 'ACTIVE' }`, which is what makes the page's preserved
			// option render and `selectedBefore` non-empty.
			update: { employmentStatus: 'OFFBOARDED' },
			create: {
				userId: user.id,
				organizationId: admin.organizationId,
				employeeNumber: 'ZZINV-001',
				firstName: FIXTURE_FIRST,
				lastName: FIXTURE_LAST,
				departmentId: department.id,
				jobTitle: 'Inventory Fixture',
				employmentType: 'REGULAR',
				employmentStatus: 'OFFBOARDED',
				startDate: new Date('2026-01-05'),
				basicMonthlySalary: 10000,
				rateType: 'MONTHLY'
			}
		})
		fixtureHolderId = holder.id
		fixtureOrgId = admin.organizationId

		// Sweep this spec's own history FIRST: the DB fixture and any disposable rows a killed
		// or retried previous run left behind. Scoped to the admin's org and to SPEC_PREFIX.
		await db.inventoryItem.deleteMany({
			where: { organizationId: admin.organizationId, name: { startsWith: SPEC_PREFIX } }
		})
		await db.inventoryItem.create({
			data: {
				organizationId: admin.organizationId,
				name: FIXTURE_NAME,
				category: 'Laptop',
				quantity: 1,
				unit: 'pc',
				status: 'ASSIGNED',
				assignedToId: fixtureHolderId,
				notes: FIXTURE_NOTES
			}
		})

		// The fixture must be REAL before any guard runs on it. Without this, a silently
		// unassigned or notes-less item makes both N5-AC5 and N5-AC9 vacuously green.
		const check = await db.inventoryItem.findFirstOrThrow({ where: { name: FIXTURE_NAME } })
		expect(check.assignedToId, 'fixture item must be assigned').toBe(fixtureHolderId)
		expect(check.notes, 'fixture item must carry notes').toBe(FIXTURE_NOTES)
		expect(holder.employmentStatus, 'fixture holder must be inactive').toBe('OFFBOARDED')
	} finally {
		await db.$disconnect()
	}
})

test.afterAll(async () => {
	const { PrismaClient } = await import('@prisma/client')
	const db = new PrismaClient()
	try {
		// FK ORDER. InventoryItem.assignedTo is SetNull, but payrollEntry → employee is RESTRICT
		// (pagination.spec.ts:70-72 hit exactly this), and employee → user is RESTRICT. So:
		//   1. the item (it points at the employee)
		//   2. any payroll entries attached to the employee by a concurrent compute
		//   3. the employee
		//   4. the user
		// try/catch so a failed assertion earlier in the run can never leave the org dirty AND
		// take teardown down with it. NOTHING ELSE SWEEPS THIS FIXTURE: scripts/clean-e2e-employees
		// matches email prefixes only, and its list is ['e2e_', 'probe_', 'zzpagetest'] —
		// zzinvfixture@example.test matches none of them. This teardown is the only cleanup.
		// Same prefix sweep as beforeAll, so a disposable item whose own test failed before
		// deleting it does not survive the run either. `beforeAll` may not have reached the
		// assignment, so the org is re-resolved when it is missing.
		if (!fixtureOrgId) {
			const admin = await db.user.findFirst({
				where: { email: 'admin@veent.ph' },
				select: { organizationId: true }
			})
			fixtureOrgId = admin?.organizationId ?? ''
		}
		const mine = { organizationId: fixtureOrgId, name: { startsWith: SPEC_PREFIX } }
		await db.inventoryItem.deleteMany({ where: mine })
		await db.payrollEntry.deleteMany({ where: { employee: { lastName: FIXTURE_LAST } } })
		await db.employee.deleteMany({ where: { lastName: FIXTURE_LAST } })
		await db.user.deleteMany({ where: { email: FIXTURE_EMAIL } })

		// Prove the teardown actually emptied, in the same process that owns the fixture.
		expect(await db.inventoryItem.count({ where: mine })).toBe(0)
		expect(await db.employee.count({ where: { lastName: FIXTURE_LAST } })).toBe(0)
		expect(await db.user.count({ where: { email: FIXTURE_EMAIL } })).toBe(0)
	} catch {
		// Best-effort.
	} finally {
		await db.$disconnect()
	}
})

test.describe('Inventory (#114)', () => {
	test('lists items and filters by status', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoInventory(page)

		await expect(row(page, 'Office Chair')).toBeVisible()
		await expect(row(page, 'Projector (old)')).toBeVisible()

		// Filter to RETIRED → only the retired projector remains.
		await page.locator('#f-status').selectOption('RETIRED')
		await page.getByRole('button', { name: 'Filter' }).click()
		await expect(page).toHaveURL(/status=RETIRED/)
		await expect(row(page, 'Projector (old)')).toBeVisible()
		await expect(row(page, 'Office Chair')).toHaveCount(0)

		await page.getByRole('link', { name: 'Clear' }).click()
		await expect(row(page, 'Office Chair')).toBeVisible()
	})

	test('no sideways scroll at three widths in both views', async ({ page }) => {
		await login(page, USERS.admin)

		for (const view of ['', '?view=grid']) {
			for (const width of [390, 1280, 1920]) {
				await page.setViewportSize({ width, height: 800 })
				await gotoInventory(page, view)
				await expect(row(page, 'Office Chair')).toBeVisible()

				const doc = await page.evaluate(() => ({
					scrollWidth: document.documentElement.scrollWidth,
					clientWidth: document.documentElement.clientWidth
				}))
				expect(doc.scrollWidth - doc.clientWidth, `document at ${width} ${view || 'list'}`).toBe(0)

				// No descendant of the items panel is wider than the panel itself.
				const wider = await page.evaluate((listSelector) => {
					const panel = document.querySelector(listSelector)
					if (!panel) return ['items panel not found']
					const panelWidth = panel.getBoundingClientRect().width
					return [...panel.querySelectorAll('*')]
						.filter((el) => el.getBoundingClientRect().width > panelWidth + 1)
						.map((el) => `${el.tagName}.${el.className}`)
				}, LIST_SELECTOR)
				expect(wider, `panel overflow at ${width} ${view || 'list'}`).toEqual([])
			}
		}
	})

	test('modal fits three viewports including a short one', async ({ page }) => {
		await login(page, USERS.admin)

		for (const size of [
			{ width: 390, height: 844 },
			{ width: 1280, height: 720 },
			{ width: 1280, height: 360 }
		]) {
			await page.setViewportSize(size)
			await gotoFixture(page)
			const d = await openItem(page, FIXTURE_NAME)

			const panel = await d.boundingBox()
			expect(panel, `panel box at ${size.width}×${size.height}`).not.toBeNull()
			expect(panel!.height, `panel height at ${size.width}×${size.height}`).toBeLessThanOrEqual(
				size.height * 0.9 + 1
			)
			expect(panel!.y).toBeGreaterThanOrEqual(-1)
			expect(panel!.y + panel!.height).toBeLessThanOrEqual(size.height + 1)

			// Title, Delete and the Save row stay inside the viewport — only the fields scroll.
			for (const part of [
				d.locator('#inv-edit-title'),
				d.getByRole('button', { name: 'Delete' }),
				d.getByRole('button', { name: 'Save' })
			]) {
				const box = await part.boundingBox()
				expect(box, `part box at ${size.width}×${size.height}`).not.toBeNull()
				expect(box!.y).toBeGreaterThanOrEqual(-1)
				expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1)
			}

			await expect(d.locator('.overflow-y-auto')).toHaveCount(1)
			await page.keyboard.press('Escape')
			await expect(d).toBeHidden()
		}
	})

	test('rows carry no controls', async ({ page }) => {
		await login(page, USERS.admin)

		for (const view of ['', '?view=grid']) {
			await gotoInventory(page, view)
			const r = row(page, 'Office Chair')
			await expect(r).toBeVisible()
			await expect(r.locator('input, select, textarea')).toHaveCount(0)
			await expect(r.locator('button')).toHaveCount(1)
			await expect(r.locator('form')).toHaveCount(0)
			// No per-row form anywhere in the items panel.
			await expect(page.locator(`${LIST_SELECTOR} form`)).toHaveCount(0)
		}
	})

	test('view toggle defaults to list and survives reload', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoInventory(page)

		const toggle = page.getByRole('group', { name: 'View' })
		await expect(toggle.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page')
		await expect(page.locator(`${LIST_SELECTOR} table`)).toBeVisible()
		await expect(page.locator(`${LIST_SELECTOR} ul`)).toBeHidden()

		await toggle.getByRole('link', { name: 'Grid' }).click()
		await expect(page).toHaveURL(/view=grid/)
		await expect(page.locator(`${LIST_SELECTOR} ul`)).toBeVisible()
		await expect(page.locator(`${LIST_SELECTOR} table`)).toHaveCount(0)
		await expect(toggle.getByRole('link', { name: 'Grid' })).toHaveAttribute('aria-current', 'page')

		await page.reload({ waitUntil: 'domcontentloaded' })
		await expect(page.locator(`${LIST_SELECTOR} ul`)).toBeVisible()
		await expect(page.locator(`${LIST_SELECTOR} table`)).toHaveCount(0)
	})

	test('both views open the same modal', async ({ page }) => {
		await login(page, USERS.admin)

		await gotoInventory(page)
		const fromList = await openItem(page, 'Office Chair')
		const listTitle = await fromList.locator('#inv-edit-title').innerText()
		await page.keyboard.press('Escape')
		await expect(fromList).toBeHidden()

		await gotoInventory(page, '?view=grid')
		const fromGrid = await openItem(page, 'Office Chair')
		expect(await fromGrid.locator('#inv-edit-title').innerText()).toBe(listTitle)
		expect(await fieldNamesOf(fromGrid)).toEqual(FIELD_NAMES)
	})

	test('add item uses the shared modal', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoInventory(page)
		const name = tempName('shared-modal')

		// The old `Add an item` disclosure is gone.
		await expect(page.locator('details')).toHaveCount(0)
		await expect(page.locator('#a-name')).toHaveCount(0)

		await page.getByRole('button', { name: 'Add item' }).click()
		const d = dialog(page)
		await expect(d).toBeVisible()
		await expect(d.getByRole('button', { name: 'Create item' })).toBeVisible()
		const createFields = await fieldNamesOf(d)
		expect(createFields).toEqual(FIELD_NAMES)

		await d.locator('#i-name').fill(name)
		await d.getByRole('button', { name: 'Create item' }).click()
		await expect(d).toBeHidden()
		await expect(row(page, name)).toBeVisible()

		// Edit mode renders the identical field set, with `Save` instead of `Create item`.
		const edit = await openItem(page, name)
		await expect(edit.getByRole('button', { name: 'Save' })).toBeVisible()
		expect(await fieldNamesOf(edit)).toEqual(createFields)
		await page.keyboard.press('Escape')
		await expect(edit).toBeHidden()

		await deleteItem(page, name)
	})

	test('delete from the modal, behind a confirm', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoInventory(page)
		const name = tempName('delete')
		await createItem(page, name)

		// Delete exists only inside the modal.
		await expect(row(page, name).getByRole('button', { name: 'Delete' })).toHaveCount(0)

		const d = await openItem(page, name)
		await d.getByRole('button', { name: 'Delete' }).click()

		// The confirm step stands between the click and the removal.
		const confirm = page.getByRole('alertdialog')
		await expect(confirm).toBeVisible()
		await expect(row(page, name)).toBeVisible()

		await confirm.getByRole('button', { name: 'Delete' }).click()
		await expect(row(page, name)).toHaveCount(0)
		await expect(d).toBeHidden()
	})

	test('the assign invariant is enforced', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoInventory(page)
		const name = tempName('invariant')
		await createItem(page, name)

		const d = await openItem(page, name)
		await d.locator('#i-status').selectOption('ASSIGNED')
		await d.getByRole('button', { name: 'Save' }).click()

		// The toaster renders the same words, so this is scoped to the first match.
		await expect(page.getByText(/Select an employee/).first()).toBeVisible()
		await expect(d).toBeVisible()

		await d.locator('#i-assigned').selectOption({ index: 1 })
		await d.getByRole('button', { name: 'Save' }).click()
		await expect(d).toBeHidden()

		await deleteItem(page, name)
	})

	test('a rejected save keeps the modal open and the edits', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoInventory(page)
		const name = tempName('reject')
		await createItem(page, name)

		const d = await openItem(page, name)
		await d.locator('#i-status').selectOption('ASSIGNED')
		await d.locator('#i-location').fill('Bench 7')
		await d.getByRole('button', { name: 'Save' }).click()
		await expect(page.getByText(/Select an employee/).first()).toBeVisible()

		// The modal is still open AND the user's edits are still there. With `update()` left at
		// its default `reset: true` both of these revert — that is NC-1.
		await expect(d).toBeVisible()
		await expect(d.locator('#i-status')).toHaveValue('ASSIGNED')
		await expect(d.locator('#i-location')).toHaveValue('Bench 7')

		await d.locator('#i-assigned').selectOption({ index: 1 })
		await d.getByRole('button', { name: 'Save' }).click()
		await expect(d).toBeHidden()

		await deleteItem(page, name)
	})

	test('inactive holder is preserved on save', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoFixture(page)

		const d = await openItem(page, FIXTURE_NAME)
		const assigned = d.locator('#i-assigned')
		await expect(assigned).toHaveValue(fixtureHolderId)
		const holderLabel = await assigned.evaluate((el) =>
			(el as HTMLSelectElement).selectedOptions[0]?.textContent?.trim()
		)
		expect(holderLabel, 'the inactive holder stays selectable and selected').toBe(
			FIXTURE_HOLDER_NAME
		)

		// Save without touching the assignee.
		await d.locator('#i-serial').fill('ZZ-INV-SERIAL')
		await d.getByRole('button', { name: 'Save' }).click()
		await expect(d).toBeHidden()

		const reopened = await openItem(page, FIXTURE_NAME)
		await expect(reopened.locator('#i-serial')).toHaveValue('ZZ-INV-SERIAL')
		await expect(reopened.locator('#i-assigned')).toHaveValue(fixtureHolderId)
		await expect(reopened.locator('#i-status')).toHaveValue('ASSIGNED')
	})

	test('a modal save preserves a non-empty notes value', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoFixture(page)

		const d = await openItem(page, FIXTURE_NAME)
		await expect(d.locator('#i-notes')).toHaveValue(FIXTURE_NOTES)

		// Change a DIFFERENT field and save.
		await d.locator('#i-location').fill('Storeroom B')
		await d.getByRole('button', { name: 'Save' }).click()
		await expect(d).toBeHidden()

		const reopened = await openItem(page, FIXTURE_NAME)
		await expect(reopened.locator('#i-location')).toHaveValue('Storeroom B')
		await expect(reopened.locator('#i-notes')).toHaveValue(FIXTURE_NOTES)
	})

	test('focus after a delete lands on the list', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoInventory(page)
		const name = tempName('focus')
		await createItem(page, name)

		const d = await openItem(page, name)
		await d.getByRole('button', { name: 'Delete' }).click()
		await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
		await expect(row(page, name)).toHaveCount(0)
		await expect(d).toBeHidden()

		const focus = await page.evaluate((listSelector) => {
			const el = document.activeElement
			const list = document.querySelector(listSelector)
			return {
				tag: el ? el.tagName : null,
				isBody: el === document.body,
				attached: !!el && document.contains(el),
				inList: !!el && !!list && (el === list || list.contains(el))
			}
		}, LIST_SELECTOR)

		expect(focus.isBody, 'focus must not fall to <body>').toBe(false)
		expect(focus.attached, 'focus must not be on a detached node').toBe(true)
		expect(focus.inList, `focus must be in the items list, was ${focus.tag}`).toBe(true)
	})

	test('the row is a real button with a name', async ({ page }) => {
		await login(page, USERS.admin)

		for (const view of ['', '?view=grid']) {
			await gotoInventory(page, view)
			await expect(page.locator('tr[role="button"]')).toHaveCount(0)

			const btn = rowButton(page, 'Office Chair')
			await expect(btn).toHaveCount(1)
			expect(await btn.evaluate((el) => el.tagName)).toBe('BUTTON')
			expect(await btn.evaluate((el) => el.getAttribute('type'))).toBe('button')
			await expect(btn).toHaveAccessibleName(/^Edit Office Chair/)
		}
	})

	test('Enter and Space both open; Space does not scroll', async ({ page }) => {
		await login(page, USERS.admin)
		// A short viewport, so the page is genuinely scrollable and the Space check can fail.
		await page.setViewportSize({ width: 1280, height: 360 })
		await gotoInventory(page)

		const scrollable = await page.evaluate(
			() => document.documentElement.scrollHeight > document.documentElement.clientHeight
		)
		expect(scrollable, 'the page must be scrollable or the Space check is vacuous').toBe(true)

		const btn = rowButton(page, 'Office Chair')
		const d = dialog(page)

		await btn.focus()
		await page.keyboard.press('Enter')
		await expect(d).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(d).toBeHidden()

		await btn.focus()
		const before = await page.evaluate(() => window.scrollY)
		await page.keyboard.press(' ')
		await expect(d).toBeVisible()
		expect(await page.evaluate(() => window.scrollY), 'Space must not scroll the page').toBe(before)
	})

	test('focus on open and on close', async ({ page }) => {
		await login(page, USERS.admin)
		await gotoInventory(page)

		const btn = rowButton(page, 'Office Chair')
		await btn.focus()
		await page.keyboard.press('Enter')
		const d = dialog(page)
		await expect(d).toBeVisible()

		const inside = await page.evaluate(() => {
			const panel = document.querySelector('[role="dialog"][aria-modal="true"]')
			return !!panel && !!document.activeElement && panel.contains(document.activeElement)
		})
		expect(inside, 'focus must move into the dialog').toBe(true)

		await page.keyboard.press('Escape')
		await expect(d).toBeHidden()
		await expect(btn).toBeFocused()
	})
})

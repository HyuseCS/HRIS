import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * A3: the `/employees/new` two-tier hire form — the BEHAVIOUR of the "Complete later"
 * disclosure, not its geometry. `employees-new-layout.spec.ts` owns the Companion Rail
 * measurements and only ever clicks the summary as a means to an end; `admin.spec.ts`
 * submits a required-only form inside a helper without ever saying so. The three claims
 * here were unasserted anywhere:
 *
 *   1. the disclosure actually hides its 11 optional fields until it is opened,
 *   2. `open={optionalHasError}` opens it by itself when the server rejects a field
 *      inside it — with nobody having clicked the summary,
 *   3. the "Required to hire" set alone is a complete, submittable hire.
 *
 * Expectations derived from `src/routes/(app)/employees/new/+page.svelte` (the `<details>`
 * at :457, the three inner fieldsets at :467/:531/:570) and the create action's zod schema
 * at `+page.server.ts:58-129` (minimum payload, `redirect(303, '/employees/<id>')`).
 *
 * Traps guarded:
 *   - `getByRole`/`getByLabel` name matching is a case-insensitive SUBSTRING. `Account
 *     Name`/`Account Number` collide with the `Account` legend and `Contact Name` with
 *     `Contact Information`, so every field here is addressed by its stable `#id`.
 *   - The fixture surname and email prefix are opaque codes, never a word a control uses,
 *     and the email carries a per-run nonce — a CI retry leaving residue would otherwise
 *     fail the create on a duplicate email, i.e. for the wrong reason.
 *   - `scripts/clean-e2e-employees.ts` only sweeps `e2e_`/`probe_`/`zzpagetest`, so this
 *     prefix gets no global cleanup: it is swept in `beforeAll` as well as `afterAll`.
 *   - Teardown deletes payrollEntry → employee → user, best-effort: a concurrent payroll
 *     compute sweeps every ACTIVE employee and `payrollEntry → employee` is RESTRICT.
 *   - Visibility is asserted with Playwright's real visibility, which understands a closed
 *     `<details>`, AND with the `open` attribute — the attribute alone is not the
 *     user-facing claim.
 */

const SURNAME = 'Qxdisc'
const EMAIL_PREFIX = 'qxdisc_'

// One representative optional field per inner fieldset: Government IDs, Emergency Contact,
// Bank / GCash Details. If the disclosure ever hid only some of its contents, picking one
// per fieldset is what would catch it.
const HIDDEN_FIELD_IDS = ['#sssNumber', '#emergencyContactName', '#bankAccountNumber']

const SSS_FORMAT_ERROR = 'SSS must be 10 digits (e.g. 34-1234567-8)'

let organizationId: string
let departmentId: string

function freshEmail() {
	return `${EMAIL_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}@veent.ph`
}

async function sweep() {
	const db = new PrismaClient()
	const mine = { user: { email: { startsWith: EMAIL_PREFIX } } }
	try {
		await db.payrollEntry.deleteMany({ where: { employee: mine } })
		await db.employee.deleteMany({ where: mine })
		await db.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } })
	} catch {
		// Best-effort, same reasoning as pagination.spec.ts: a concurrent payroll compute can
		// attach a new entry between the deletes. A stray row is better than a failed run.
	} finally {
		await db.$disconnect()
	}
}

test.beforeAll(async () => {
	// Swept up front too: this prefix is not in clean-e2e-employees.ts, so a crashed run
	// leaves residue that nothing else will ever remove.
	await sweep()
	const db = new PrismaClient()
	try {
		const admin = await db.user.findFirstOrThrow({
			where: { email: USERS.admin.email },
			select: { organizationId: true }
		})
		organizationId = admin.organizationId
		const department = await db.department.findFirstOrThrow({
			where: { organizationId },
			select: { id: true }
		})
		departmentId = department.id
	} finally {
		await db.$disconnect()
	}
})

test.afterAll(sweep)

async function openForm(page: Page) {
	await page.goto('/employees/new', { waitUntil: 'domcontentloaded' })
	await page.waitForLoadState('networkidle')
	await expect(page.locator('#sec-personal')).toBeAttached()
}

function disclosure(page: Page) {
	return page.locator('form[action="?/create"] details')
}

function summary(page: Page) {
	return disclosure(page).locator('> summary')
}

/** The minimum payload the create action accepts; nothing here lives in the disclosure. */
async function fillRequiredOnly(page: Page, email: string) {
	await page.locator('#firstName').fill('Ana')
	await page.locator('#lastName').fill(SURNAME)
	await page.locator('#email').fill(email)
	await page.locator('#departmentId').selectOption(departmentId)
	await page.locator('#jobTitle').fill('QA Engineer')
	await page.locator('#startDate').fill('2026-03-02')
	// The label is dynamic (`{rate.label}`); the id is not.
	await page.locator('#basicMonthlySalary').fill('28000')
}

/**
 * Count summary clicks on `document` in the capture phase, so the counter survives any
 * Svelte re-render of the form after the action response. Read back to prove the
 * disclosure opened on its own.
 */
async function watchSummaryClicks(page: Page) {
	await page.evaluate(() => {
		const w = window as unknown as { __summaryClicks: number }
		w.__summaryClicks = 0
		document.addEventListener(
			'click',
			(e) => {
				if ((e.target as HTMLElement | null)?.closest('details > summary')) w.__summaryClicks++
			},
			true
		)
	})
}

function summaryClicks(page: Page) {
	return page.evaluate(() => (window as unknown as { __summaryClicks: number }).__summaryClicks)
}

test('A3-T1 the disclosure hides its optional fields until it is opened, and hides them again', async ({
	page
}) => {
	await login(page, USERS.admin)
	await openForm(page)

	await expect(disclosure(page)).not.toHaveAttribute('open', /.*/)
	for (const id of HIDDEN_FIELD_IDS) {
		await expect(page.locator(id), `${id} must be attached but hidden while closed`).toBeAttached()
		await expect(page.locator(id), `${id} is visible before the disclosure was opened`).toBeHidden()
	}

	await summary(page).click()

	await expect(disclosure(page)).toHaveAttribute('open', /.*/)
	for (const id of HIDDEN_FIELD_IDS) {
		await expect(page.locator(id), `${id} did not appear when the disclosure opened`).toBeVisible()
	}
	// Visible is not the same as usable — one of them is actually typed into.
	await page.locator('#emergencyContactName').fill('Bayani Cruz')
	await expect(page.locator('#emergencyContactName')).toHaveValue('Bayani Cruz')

	await summary(page).click()

	await expect(disclosure(page)).not.toHaveAttribute('open', /.*/)
	for (const id of HIDDEN_FIELD_IDS) {
		await expect(page.locator(id), `${id} is still visible after closing`).toBeHidden()
	}
})

test('A3-T2 a server rejection inside the disclosure opens it without anyone clicking the summary', async ({
	page
}) => {
	await login(page, USERS.admin)
	await openForm(page)
	await watchSummaryClicks(page)

	await fillRequiredOnly(page, freshEmail())

	// The bad value goes in through the DOM precisely BECAUSE the field is hidden: filling it
	// would mean opening the disclosure first, which is the thing this test must not do. The
	// input is not disabled, so it is still serialised into the submitted FormData.
	await page.locator('#sssNumber').evaluate((el) => {
		;(el as HTMLInputElement).value = '1234'
	})

	await expect(
		disclosure(page),
		'the disclosure was already open before submit'
	).not.toHaveAttribute('open', /.*/)

	await page.getByRole('button', { name: 'Create Employee', exact: true }).click()

	await expect(
		disclosure(page),
		'the rejected optional field stayed in a collapsed container'
	).toHaveAttribute('open', /.*/)
	await expect(page.locator('#sssNumber')).toBeVisible()
	await expect(page.locator('#sssNumber')).toHaveValue('1234')
	await expect(page.getByText(SSS_FORMAT_ERROR)).toBeVisible()
	expect(await summaryClicks(page), 'the disclosure was opened by a click, not by the error').toBe(
		0
	)

	// Nothing was created: the submit failed validation.
	await expect(page).toHaveURL(/\/employees\/new$/)
})

test('A3-T3 the required-to-hire set alone creates the employee, with the optional fields empty', async ({
	page
}) => {
	await login(page, USERS.admin)
	await openForm(page)
	await watchSummaryClicks(page)

	const email = freshEmail()
	await fillRequiredOnly(page, email)

	await expect(disclosure(page), 'the disclosure was opened before submitting').not.toHaveAttribute(
		'open',
		/.*/
	)

	await page.getByRole('button', { name: 'Create Employee', exact: true }).click()
	await page.waitForURL(/\/employees\/c[a-z0-9]{10,}$/)

	expect(await summaryClicks(page), 'the disclosure was opened during this test').toBe(0)

	const db = new PrismaClient()
	try {
		const created = await db.employee.findFirstOrThrow({
			where: { user: { email } },
			select: {
				id: true,
				lastName: true,
				organizationId: true,
				sssNumber: true,
				philhealthNumber: true,
				pagibigNumber: true,
				tinNumber: true,
				emergencyContactName: true,
				emergencyContactRelation: true,
				emergencyContactPhone: true,
				bankName: true,
				bankAccountName: true,
				bankAccountNumber: true,
				gcashNumber: true
			}
		})
		expect(created.lastName).toBe(SURNAME)
		expect(created.organizationId).toBe(organizationId)
		// The redirect target is the row that was just written, not some other employee.
		expect(page.url()).toContain(`/employees/${created.id}`)

		const { id: _id, lastName: _l, organizationId: _o, ...optional } = created
		for (const [field, value] of Object.entries(optional)) {
			expect(value ?? '', `${field} was populated by a form that never showed it`).toBe('')
		}
	} finally {
		await db.$disconnect()
	}
})

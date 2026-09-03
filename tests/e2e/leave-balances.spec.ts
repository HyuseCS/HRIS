import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS, nextWeekdayISO } from './helpers'

// #137 (HR-facing balances view) + #150 (privileged roles could not see any balances).
test.describe.configure({ mode: 'serial' })

test.describe('Leave balances', () => {
	test('HR reaches the org-wide balances view from /leave', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/leave', { waitUntil: 'domcontentloaded' })

		// #150: admins have no balances of their own, so before this the panel was blank
		// with no route to anyone else's.
		await page.getByRole('link', { name: 'View all balances' }).click()
		await page.waitForURL('**/leave/balances')

		await expect(page.getByRole('heading', { name: 'Leave Balances', level: 1 })).toBeVisible()
		// Seeded leave types render as columns.
		await expect(page.getByRole('columnheader', { name: /Vacation Leave/ })).toBeVisible()
		await expect(page.getByRole('columnheader', { name: /Service Incentive Leave/ })).toBeVisible()

		// Elena is seeded with the org's default allocation.
		const row = page.locator('tbody tr[data-employee="EMP-004"]')
		await expect(row).toBeVisible()
		await expect(row).toContainText('Employee, Elena')
	})

	test('filters the balances table by search term', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/leave/balances?search=EMP-004', { waitUntil: 'domcontentloaded' })

		await expect(page.locator('tbody tr[data-employee="EMP-004"]')).toBeVisible()
		await expect(page.locator('tbody tr[data-employee="EMP-003"]')).toHaveCount(0)
	})

	// Phase 6 / S2. The retired door must keep working, and it must land on a page with the leave
	// form OPEN — landing on /requests with the form closed is the same "old link, wrong surface"
	// bug the redirect exists to avoid. The 308 status itself is pinned in
	// tests/unit/leave-new-redirect.test.ts; this is the half only a browser can prove.
	test('the retired /leave/new lands on the canonical form, already open', async ({ page }) => {
		await login(page, USERS.employee)
		await page.goto('/leave/new', { waitUntil: 'domcontentloaded' })

		await expect(page).toHaveURL(/\/requests\?new=leave$/)
		await expect(page.locator('#leaveTypeId')).toBeVisible()
		// Positive control: the form is open because of the param, not because it is always open.
		await page.goto('/requests', { waitUntil: 'domcontentloaded' })
		await expect(page.locator('#leaveTypeId')).toHaveCount(0)
	})

	test('a regular employee cannot open the HR balances view', async ({ page }) => {
		await login(page, USERS.employee)
		const res = await page.goto('/leave/balances', { waitUntil: 'domcontentloaded' })
		expect(res?.status()).toBe(403)
	})

	// The SIL tenure gate is enforced server-side (unit-tested in leave-tenure.test.ts); this
	// covers the other half — that a filer under a year is told so up front instead of
	// filling in dates and being refused on submit. Every seeded employee is over a year, so
	// the spec moves the start date and puts it back.
	test('a filer under one year sees Service Incentive Leave disabled', async ({ page }) => {
		const db = new PrismaClient()
		const elena = await db.employee.findFirstOrThrow({ where: { employeeNumber: 'EMP-004' } })
		const originalStart = elena.startDate
		const threeMonthsAgo = new Date()
		threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

		try {
			await db.employee.update({
				where: { id: elena.id },
				data: { startDate: threeMonthsAgo }
			})

			await login(page, USERS.employee)
			// Phase 6 retired /leave/new; ?new=leave opens the canonical form on /requests.
			await page.goto('/requests?new=leave', { waitUntil: 'domcontentloaded' })
			await page.waitForLoadState('networkidle')

			const sil = page.locator('#leaveTypeId option', { hasText: 'Service Incentive Leave' })
			await expect(sil).toBeDisabled()
			await expect(sil).toContainText('available after 1 year')

			// An ungated type stays selectable.
			await expect(page.locator('#leaveTypeId option', { hasText: 'Vacation Leave' })).toBeEnabled()
		} finally {
			await db.employee.update({ where: { id: elena.id }, data: { startDate: originalStart } })
			await db.$disconnect()
		}
	})

	test('the 201 file shows the employee leave ledger', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/leave/balances?search=EMP-004', { waitUntil: 'domcontentloaded' })
		// #287. The row is a `role="link"` <tr> whose navigation is an `onclick` -> `goto`, with no
		// <a href> underneath — so a click that lands before hydration is silently DROPPED and the
		// wait below then hangs for the full 120s. That is what made this spec fail only under a
		// loaded parallel run. Retry the click until the URL actually moves; same idiom as
		// `selectTenant` in helpers.ts.
		// domcontentloaded, not waitForURL's default 'load': helpers.ts documents that external
		// font requests never settle in a sandboxed runner, so 'load' times out on a navigation
		// that already happened.
		const row = page.locator('tbody tr[data-employee="EMP-004"]')
		await expect(async () => {
			await row.click()
			await page.waitForURL(/\/employees\/[^/]+$/, {
				waitUntil: 'domcontentloaded',
				timeout: 2000
			})
		}).toPass({ timeout: 30_000 })

		const panel = page.locator('section', { hasText: 'Leave Balances' }).first()
		await expect(panel).toBeVisible()
		await expect(panel).toContainText('Vacation Leave')
		await expect(panel).toContainText('Service Incentive Leave')
	})

	// An approver should not have to open the filer's 201 file to see whether the days are
	// actually there, and the type being requested must be the one highlighted.
	// Switching users needs a fresh context — the login helper drives the real form, which a
	// live session would skip straight past. Same pattern as verifyAndApproveTimesheet.
	test('a leave request detail shows the filer’s balances', async ({ browser }) => {
		const filerCtx = await browser.newContext()
		const filer = await filerCtx.newPage()
		try {
			await login(filer, USERS.employee)
			// Phase 6 retired /leave/new; ?new=leave opens the canonical form on /requests.
			await filer.goto('/requests?new=leave', { waitUntil: 'domcontentloaded' })
			await filer.waitForLoadState('networkidle')

			const leaveType = filer.locator('#leaveTypeId')
			await leaveType.selectOption({ label: 'Sick Leave' })
			await expect(leaveType).not.toHaveValue('')
			const day = nextWeekdayISO()
			await filer.locator('#startDate').fill(day)
			await filer.locator('#endDate').fill(day)
			await filer.getByRole('button', { name: 'Submit request' }).click()
			await expect(filer.getByText('Request submitted.')).toBeVisible()
		} finally {
			await filerCtx.close()
		}

		const reviewCtx = await browser.newContext()
		const reviewer = await reviewCtx.newPage()
		try {
			await login(reviewer, USERS.admin)
			await reviewer.goto('/leave', { waitUntil: 'domcontentloaded' })
			await reviewer.locator('tbody tr', { hasText: 'Sick Leave' }).first().click()
			await reviewer.waitForURL(/\/requests\/[^/]+$/)

			const requested = reviewer.locator('[data-leave-type="Sick Leave"]')
			await expect(requested).toBeVisible()
			await expect(requested).toContainText('This request')
			// Other types are listed, but not flagged as the one being drawn against.
			const other = reviewer.locator('[data-leave-type="Vacation Leave"]')
			await expect(other).toBeVisible()
			await expect(other).not.toContainText('This request')
		} finally {
			await reviewCtx.close()
		}
	})
})

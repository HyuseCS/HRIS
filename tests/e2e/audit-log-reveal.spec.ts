import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * #242 — the audit log's own payload is masked for everyone, and reaching it is itself an
 * audited event. The unit file pins the `reveal` action; this is the browser half: nothing
 * else in the tree proves click → POST → audit row written → payload rendered.
 *
 * Driven off one seeded UPDATE/Employee entry shaped like `recordCompensationChange`'s
 * (`{ basicMonthlySalary, rateType }` pairs), with deliberately distinctive figures so the
 * "absent before, present after" assertions can grep the whole DOM rather than trusting a
 * selector. Serial — all three tests share that entry.
 */
test.describe.configure({ mode: 'serial' })

// Figures chosen because nothing else in tests/, prisma/ or src/ uses them.
const OLD_SALARY = '414141'
const NEW_SALARY = '424242'

let auditId: string

/** The reveal button's accessible name is its aria-label, not its visible text. */
const REVEAL_BUTTON = /^Reveal the recorded changes/

test.beforeAll(async () => {
	const db = new PrismaClient()
	try {
		const actor = await db.user.findFirstOrThrow({
			where: { email: 'admin@veent.ph' },
			select: { id: true, roles: true, organizationId: true }
		})
		const employee = await db.employee.findFirstOrThrow({
			where: { user: { email: 'employee@veent.ph' } },
			select: { id: true }
		})
		const entry = await db.auditLog.create({
			data: {
				organizationId: actor.organizationId,
				actorId: actor.id,
				actorRoles: actor.roles,
				action: 'UPDATE',
				entityType: 'Employee',
				entityId: employee.id,
				oldValue: { basicMonthlySalary: Number(OLD_SALARY), rateType: 'MONTHLY' },
				newValue: { basicMonthlySalary: Number(NEW_SALARY), rateType: 'MONTHLY' }
			}
		})
		auditId = entry.id
	} finally {
		await db.$disconnect()
	}
})

test.afterAll(async () => {
	// A seed that failed before assigning this left nothing to clean up, and deleting on an
	// undefined id throws a Prisma validation error that buries the real failure.
	if (!auditId) return

	const db = new PrismaClient()
	try {
		// By id, never by a date or value filter: the log is shared with every other tenant and
		// with whoever is testing by hand, and a filtered delete would take their rows too. The
		// reveal's own VIEW rows are ours as well — found by our seeded entry's cuid, which
		// nothing else can carry, then deleted by the ids that lookup returns.
		const spawned = await db.auditLog.findMany({
			where: { entityType: 'AuditLog', entityId: auditId },
			select: { id: true }
		})
		await db.auditLog.deleteMany({
			where: { id: { in: [auditId, ...spawned.map((row) => row.id)] } }
		})
	} finally {
		await db.$disconnect()
	}
})

test('an ADMINISTER_SYSTEM holder sees a masked log, reveals one entry, and the reveal is audited', async ({
	page
}) => {
	// admin@veent.ph is SUPER_ADMIN, which holds both MANAGE_HR (the page) and
	// ADMINISTER_SYSTEM (the reveal).
	await login(page, USERS.admin)
	await page.goto('/reports/audit-log', { waitUntil: 'domcontentloaded' })
	await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible()

	// Masked on arrival — the payload is not in the DOM at all, for anyone. Masking is done
	// in `load`, not hidden by CSS, so the grep is the assertion that actually pins it.
	const before = await page.content()
	expect(before).not.toContain(OLD_SALARY)
	expect(before).not.toContain(NEW_SALARY)

	// Our entry, located by the hidden id its own reveal form carries — the Entity ID column
	// shows the audited employee, which other rows share.
	const row = page
		.locator('tbody tr')
		.filter({ has: page.locator(`input[name="id"][value="${auditId}"]`) })
	await expect(row).toHaveCount(1)

	// Plain form action submit, so it works with or without hydration having finished.
	await row.getByRole('button', { name: REVEAL_BUTTON }).click()
	await expect(page.locator('pre', { hasText: OLD_SALARY })).toBeVisible()
	await expect(page.locator('pre', { hasText: NEW_SALARY })).toBeVisible()

	// The point of the whole issue: the reveal recorded itself. Matched on the entry we
	// revealed — `VIEW` + `AuditLog` alone would also match another spec's or another
	// tester's reveal, which would make this pass without our click having been logged.
	await page.goto('/reports/audit-log', { waitUntil: 'domcontentloaded' })
	const viewRow = page
		.locator('tbody tr')
		.filter({ has: page.getByText('VIEW', { exact: true }) })
		.filter({ has: page.getByText('AuditLog', { exact: true }) })
		.filter({ hasText: auditId.slice(0, 12) })
	await expect(viewRow).toHaveCount(1)

	// And revealing is one entry at a time: the payload is masked again on the next load.
	expect(await page.content()).not.toContain(NEW_SALARY)
})

test('MANAGE_HR without ADMINISTER_SYSTEM reads the log masked and is offered no reveal', async ({
	page
}) => {
	// hr@veent.ph is HR_ADMIN: MANAGE_HR (so the page loads) but no ADMINISTER_SYSTEM.
	await login(page, USERS.hr)
	await page.goto('/reports/audit-log', { waitUntil: 'domcontentloaded' })
	await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible()

	const html = await page.content()
	expect(html).not.toContain(OLD_SALARY)
	expect(html).not.toContain(NEW_SALARY)

	// No dead control: `canReveal` is false, so entries that have changes read "Hidden"
	// rather than offering a button that would 403. The visible "Hidden" is what makes the
	// zero count meaningful — it proves a with-changes row was actually rendered.
	await expect(page.getByText('Hidden').first()).toBeVisible()
	await expect(page.getByRole('button', { name: REVEAL_BUTTON })).toHaveCount(0)
})

import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

/**
 * #305 — "who may act needs a live check".
 *
 * Every other separation test in this repo mocks `$lib/server/db` and calls the handler
 * directly, which proves what the code DOES but never that the deployed page actually opens
 * or closes for a real logged-in user. This is the first e2e coverage of /separations at all;
 * future separation e2e work belongs in this file rather than a second spec.
 *
 * Both halves matter. E1 alone would still pass if the gate were deleted; E2 alone would
 * still pass if the page were broken for everyone.
 */
test.describe('Separations capability gate (#305)', () => {
	test('an HR admin reaches the separations list', async ({ page }) => {
		// hr@veent.ph is HR_ADMIN — MANAGE_HR without system administration.
		await login(page, USERS.hr)
		const res = await page.goto('/separations', { waitUntil: 'domcontentloaded' })

		expect(res?.status()).toBe(200)
		await expect(page.getByRole('heading', { name: 'Separations', level: 1 })).toBeVisible()
	})

	test('a plain employee is refused', async ({ page }) => {
		// employee@veent.ph holds only EMPLOYEE, which does not carry MANAGE_HR.
		await login(page, USERS.employee)
		const res = await page.goto('/separations', { waitUntil: 'domcontentloaded' })

		expect(res?.status()).toBe(403)
		// A 403 that still rendered the list would be worse than no gate at all.
		await expect(page.getByRole('heading', { name: 'Separations', level: 1 })).toHaveCount(0)
	})
})

/**
 * #304 — the finalize -> undo cycle, against the real database.
 *
 * Every other #304 test mocks `$lib/server/db`, so it proves what the code DOES and never that
 * a real Postgres transaction rolls back or that the break-glass capability holds in the
 * deployed app. These four do, in order, against one tagged fixture.
 *
 * Fixture is its own user + employee, never a seeded account: finalizing offboards the person
 * and disables their login, which would poison every other spec that logs in as them.
 */
test.describe.configure({ mode: 'serial' })

const TAG = 'e2e-undo-304'
const LOAN_A = 3000
const LOAN_B = 7000

let separationId = ''
let employeeId = ''
let userId = ''
let loanAId = ''
let loanBId = ''

async function cleanup() {
	const db = new PrismaClient()
	try {
		const employees = await db.employee.findMany({
			where: { employeeNumber: TAG },
			select: { id: true, userId: true }
		})
		const empIds = employees.map((e) => e.id)
		const separations = await db.separationRecord.findMany({
			where: { employeeId: { in: empIds } },
			select: { id: true }
		})
		await db.auditLog.deleteMany({ where: { entityId: { in: separations.map((s) => s.id) } } })
		// clearance_items cascade off separation_records.
		await db.separationRecord.deleteMany({ where: { employeeId: { in: empIds } } })
		await db.loan.deleteMany({ where: { employeeId: { in: empIds } } })
		await db.cashAdvance.deleteMany({ where: { employeeId: { in: empIds } } })
		await db.employee.deleteMany({ where: { id: { in: empIds } } })
		await db.user.deleteMany({ where: { id: { in: employees.map((e) => e.userId) } } })
	} finally {
		await db.$disconnect()
	}
}

async function seed() {
	const db = new PrismaClient()
	try {
		// The clearer is HR, never the SUPER_ADMIN doing the finalize — #297 bars whoever
		// cleared an item, so an admin-cleared fixture could not be finalized at all.
		const hr = await db.user.findFirstOrThrow({
			where: { email: USERS.hr.email },
			select: { id: true, organizationId: true }
		})
		const department = await db.department.findFirstOrThrow({
			where: { organizationId: hr.organizationId },
			select: { id: true }
		})

		const user = await db.user.create({
			data: {
				organizationId: hr.organizationId,
				email: `${TAG}@veent.test`,
				passwordHash: 'not-a-real-hash',
				roles: ['EMPLOYEE'],
				isActive: true
			}
		})
		const employee = await db.employee.create({
			data: {
				userId: user.id,
				organizationId: hr.organizationId,
				employeeNumber: TAG,
				firstName: 'Undo',
				lastName: 'Fixture',
				departmentId: department.id,
				jobTitle: 'Analyst',
				employmentType: 'REGULAR',
				employmentStatus: 'ACTIVE',
				startDate: new Date('2025-01-01'),
				basicMonthlySalary: 20000
			}
		})
		const loanA = await db.loan.create({
			data: {
				employeeId: employee.id,
				type: TAG,
				principal: LOAN_A,
				balance: LOAN_A,
				installment: 500,
				status: 'ACTIVE'
			}
		})
		const loanB = await db.loan.create({
			data: {
				employeeId: employee.id,
				type: TAG,
				principal: LOAN_B,
				balance: LOAN_B,
				installment: 500,
				status: 'ACTIVE'
			}
		})
		const separation = await db.separationRecord.create({
			data: {
				organizationId: hr.organizationId,
				employeeId: employee.id,
				type: 'RESIGNATION',
				status: 'CLEARED',
				effectiveDate: new Date('2026-08-31'),
				clearanceItems: {
					create: [
						{
							label: 'Return IT assets',
							area: 'IT',
							status: 'CLEARED',
							clearedById: hr.id,
							clearedAt: new Date()
						}
					]
				}
			}
		})

		separationId = separation.id
		employeeId = employee.id
		userId = user.id
		loanAId = loanA.id
		loanBId = loanB.id
	} finally {
		await db.$disconnect()
	}
}

test.beforeAll(async () => {
	await cleanup()
	await seed()
})
test.afterAll(cleanup)

/** Both destructive controls sit behind a `confirm()`; Playwright dismisses dialogs by default. */
async function acceptConfirms(page: import('@playwright/test').Page) {
	page.on('dialog', (d) => d.accept())
}

test.describe('Separation finalize -> undo (#304)', () => {
	test('finalizing writes off both loans, offboards, and disables the login', async ({ page }) => {
		await login(page, USERS.admin)
		acceptConfirms(page)
		await page.goto(`/separations/${separationId}`, { waitUntil: 'domcontentloaded' })
		await page.getByRole('button', { name: 'Finalize & offboard' }).click()
		await expect(page.getByText('Separation finalized.')).toBeVisible()

		const db = new PrismaClient()
		try {
			const loans = await db.loan.findMany({ where: { employeeId }, orderBy: { principal: 'asc' } })
			expect(loans.map((l) => [Number(l.balance), l.status])).toEqual([
				[0, 'PAID'],
				[0, 'PAID']
			])
			const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId } })
			expect(employee.employmentStatus).toBe('OFFBOARDED')
			expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).isActive).toBe(false)

			// The snapshot is what makes the undo below possible at all — assert it POSITIVELY,
			// naming both loan ids, rather than merely "not null".
			const record = await db.separationRecord.findUniqueOrThrow({ where: { id: separationId } })
			const snapshot = record.preFinalizeState as { loans: { id: string; balance: string }[] }
			expect(snapshot.loans.map((l) => l.id).sort()).toEqual([loanAId, loanBId].sort())
			expect(snapshot.loans.map((l) => l.balance).sort()).toEqual(['3000', '7000'])
		} finally {
			await db.$disconnect()
		}
	})

	test('an HR admin without OVERRIDE_FINALIZED cannot undo it', async ({ page }) => {
		// hr@veent.ph holds MANAGE_HR, which opens the page, but NOT OVERRIDE_FINALIZED.
		await login(page, USERS.hr)

		// POST the action directly. Asserting only that the button is hidden proves nothing —
		// this repo has that recorded as a lesson.
		// Same-origin header so this exercises the action's capability check rather than
		// SvelteKit's CSRF rejection — both refuse, but the role gate is what is under test
		// (the #111 spec makes the same distinction).
		const res = await page.request.post(`/separations/${separationId}?/undo`, {
			form: { reopenClearance: 'false' },
			headers: { origin: new URL(page.url()).origin }
		})

		// NOT asserted on the status code, and that is deliberate. This action follows
		// `finalize`'s shape: it CATCHES the service's HttpError and returns `fail(403)`, and a
		// non-enhanced form POST answers a `fail` by re-rendering the page — status 200, whether
		// the action succeeded or refused. (The #111 reveal spec CAN assert 403 because its
		// action lets `requireAnyCapability` throw.) So the status here is not evidence; the
		// rendered refusal and the database rows below are.
		expect(await res.text()).toContain('Insufficient permissions')

		const db = new PrismaClient()
		try {
			const record = await db.separationRecord.findUniqueOrThrow({ where: { id: separationId } })
			expect(record.status).toBe('FINALIZED')
			expect(
				await db.auditLog.count({ where: { entityId: separationId, action: 'SEPARATION_UNDO' } })
			).toBe(0)
			// The money did not move either.
			expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).isActive).toBe(false)
		} finally {
			await db.$disconnect()
		}
	})

	test('a super admin undo restores the money, the status and the login', async ({ page }) => {
		await login(page, USERS.admin)
		acceptConfirms(page)
		await page.goto(`/separations/${separationId}`, { waitUntil: 'domcontentloaded' })
		await page.getByRole('button', { name: 'Undo finalization' }).click()
		await expect(page.getByText('Finalization undone.')).toBeVisible()

		const db = new PrismaClient()
		try {
			// POSITIVE: the exact principals, never "not zero".
			const loanA = await db.loan.findUniqueOrThrow({ where: { id: loanAId } })
			expect(Number(loanA.balance)).toBe(LOAN_A)
			expect(loanA.status).toBe('ACTIVE')
			const loanB = await db.loan.findUniqueOrThrow({ where: { id: loanBId } })
			expect(Number(loanB.balance)).toBe(LOAN_B)
			expect(loanB.status).toBe('ACTIVE')

			const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId } })
			expect(employee.employmentStatus).toBe('ACTIVE')
			expect(employee.endDate).toBeNull()
			expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).isActive).toBe(true)

			const record = await db.separationRecord.findUniqueOrThrow({ where: { id: separationId } })
			// Items were kept, so CLEARED — not OPEN (B-4).
			expect(record.status).toBe('CLEARED')
			// B-1: the snapshot SURVIVES a full undo, which is what stops the page claiming
			// "partially restored" on every reload.
			expect(record.preFinalizeState).not.toBeNull()

			const audit = await db.auditLog.findFirstOrThrow({
				where: { entityId: separationId, action: 'SEPARATION_UNDO' }
			})
			expect(audit.oldValue).not.toBeNull()
		} finally {
			await db.$disconnect()
		}

		// The banner must be ABSENT on a fully restored record, on a real reload (B-1 / step 8b).
		await page.goto(`/separations/${separationId}`, { waitUntil: 'domcontentloaded' })
		await expect(page.getByText('Partially restored')).toHaveCount(0)
	})

	test('a balance that moved since finalize is refused, and nothing sticks', async ({ page }) => {
		await login(page, USERS.admin)
		acceptConfirms(page)

		// Re-finalize so there is something to undo again.
		await page.goto(`/separations/${separationId}`, { waitUntil: 'domcontentloaded' })
		await page.getByRole('button', { name: 'Finalize & offboard' }).click()
		await expect(page.getByText('Separation finalized.')).toBeVisible()

		const db = new PrismaClient()
		try {
			// Somebody paid against the loan between the finalize and the undo. The restore is
			// conditional on `{ balance: 0, status: 'PAID' }`, so this is the one path the design
			// can be made to throw on. Whichever loan the restore loop reaches first, the loop
			// throws before it can complete — the 409 is deterministic even though the loop order
			// is not.
			await db.loan.update({ where: { id: loanBId }, data: { balance: 42 } })
		} finally {
			await db.$disconnect()
		}

		// Window the audit count from HERE. The successful undo in the previous test also wrote a
		// SEPARATION_UNDO row seconds ago, so an unwindowed count asserts the wrong run.
		const beforeUndo = new Date()
		await page.goto(`/separations/${separationId}`, { waitUntil: 'domcontentloaded' })
		await page.getByRole('button', { name: 'Undo finalization' }).click()
		await expect(page.getByText(/balance changed since finalizing/)).toBeVisible()

		const db2 = new PrismaClient()
		try {
			const record = await db2.separationRecord.findUniqueOrThrow({ where: { id: separationId } })
			// THE ROLLBACK PROOF, and it is this row alone (B-6). The compare-and-set claim is the
			// ONLY write that precedes the balance check, so the record is the one thing that
			// would have stuck if Postgres had not rolled the transaction back. All FOUR columns
			// the claim writes, not just `status`.
			expect(record.status).toBe('FINALIZED')
			expect(record.finalizedAt).not.toBeNull()
			expect(record.finalizedById).not.toBeNull()
			expect(record.finalPayAmount).not.toBeNull()

			// VACUOUS NEGATIVE CONTROLS — these three writes come AFTER the balance check in
			// `undoSeparation`, so on this path they never ran at all. They pass whether the
			// transaction rolled back or not, and they are NOT rollback evidence. Kept only to
			// catch a future reordering that moves them above the money.
			expect((await db2.user.findUniqueOrThrow({ where: { id: userId } })).isActive).toBe(false)
			expect(
				(await db2.employee.findUniqueOrThrow({ where: { id: employeeId } })).employmentStatus
			).toBe('OFFBOARDED')
			expect(
				await db2.auditLog.count({
					where: {
						entityId: separationId,
						action: 'SEPARATION_UNDO',
						createdAt: { gt: beforeUndo }
					}
				})
			).toBe(0)
		} finally {
			await db2.$disconnect()
		}
	})
})

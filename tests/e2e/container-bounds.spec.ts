import { test, expect, type Locator, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

test.describe.configure({ mode: 'serial' })

const PREFIX = 'Zzbnd'
const RUN = `${PREFIX}${Date.now().toString(36)}`
const COUNT = 12
const CAP = 10

const EVENTS = 'Upcoming events'
const APPROVER_POSTING = `${RUN} Approver posting`
const PANELS = [
	[/upcoming regularizations$/, 'Upcoming Regularizations', 'View all employees', '/employees'],
	[
		/postings awaiting your approval$/,
		'Postings awaiting your approval',
		'View all postings',
		'/recruitment'
	]
] as const

const dayFromNow = (days: number) => {
	const d = new Date()
	d.setUTCDate(d.getUTCDate() + days)
	d.setUTCHours(0, 0, 0, 0)
	return d
}

async function sweep(db: PrismaClient, organizationId: string, marker: string) {
	// payrollEntry first: the fixtures are ACTIVE, so a compute in another spec attaches
	// entries, and that FK is RESTRICT — deleting the employee first takes the run down.
	await db.payrollEntry.deleteMany({
		where: { employee: { organizationId, lastName: { startsWith: marker } } }
	})
	await db.employee.deleteMany({ where: { organizationId, lastName: { startsWith: marker } } })
	await db.user.deleteMany({ where: { email: { startsWith: marker.toLowerCase() } } })
	await db.jobPosting.deleteMany({ where: { organizationId, title: { startsWith: marker } } })
	await db.publicHoliday.deleteMany({ where: { organizationId, name: { startsWith: marker } } })
	const departments = await db.department.findMany({
		where: { organizationId, name: { startsWith: marker } },
		select: { id: true }
	})
	const ids = departments.map((d) => d.id)
	await db.postingApprover.deleteMany({ where: { organizationId, departmentId: { in: ids } } })
	await db.department.deleteMany({ where: { id: { in: ids } } })
}

async function orgOf(db: PrismaClient) {
	const admin = await db.user.findFirstOrThrow({
		where: { email: USERS.admin.email },
		select: { organizationId: true }
	})
	return admin.organizationId
}

test.beforeAll(async () => {
	const db = new PrismaClient()
	try {
		const organizationId = await orgOf(db)
		await sweep(db, organizationId, PREFIX)

		const employeeOf = (email: string) =>
			db.employee.findFirstOrThrow({
				where: { organizationId, user: { email } },
				select: { id: true }
			})
		const manager = await employeeOf(USERS.manager.email)
		const approver = await employeeOf(USERS.approver.email)
		const managerDept = await db.department.create({ data: { organizationId, name: `${RUN} M` } })
		const approverDept = await db.department.create({ data: { organizationId, name: `${RUN} A` } })
		await db.postingApprover.createMany({
			data: [
				{ organizationId, departmentId: managerDept.id, approverId: manager.id },
				{ organizationId, departmentId: approverDept.id, approverId: approver.id }
			]
		})

		for (let i = 1; i <= COUNT; i++) {
			const n = String(i).padStart(3, '0')
			const startDate = dayFromNow(i + 3)
			startDate.setUTCMonth(startDate.getUTCMonth() - 6)
			await db.user.create({
				data: {
					organizationId,
					email: `${RUN.toLowerCase()}-${n}@example.test`,
					// List fixtures only — nobody logs in as them.
					passwordHash: 'not-a-real-hash',
					roles: ['EMPLOYEE'],
					isActive: false,
					employee: {
						create: {
							organizationId,
							employeeNumber: `${RUN}-${n}`,
							firstName: `Bound${n}`,
							lastName: RUN,
							departmentId: managerDept.id,
							jobTitle: 'Container Bounds Fixture',
							// ACTIVE and PROBATIONARY are both load-bearing: the service filters on exactly
							// that pair, so offboarding these would empty the very card this spec counts.
							employmentType: 'PROBATIONARY',
							employmentStatus: 'ACTIVE',
							startDate,
							basicMonthlySalary: 10000,
							rateType: 'MONTHLY'
						}
					}
				}
			})
		}

		await db.publicHoliday.createMany({
			data: Array.from({ length: COUNT }, (_, i) => {
				const date = dayFromNow(i + 1)
				return {
					organizationId,
					date,
					name: `${RUN} Holiday ${String(i + 1).padStart(3, '0')}`,
					type: 'SPECIAL_NON_WORKING' as const,
					year: date.getUTCFullYear()
				}
			})
		})

		// (c) Postings awaiting approval. `submittedById` must NOT be the logged-in actor, or the
		// service filters them out as self-approval.
		const submitter = await db.user.findFirstOrThrow({
			where: { email: USERS.employee.email },
			select: { id: true }
		})
		const posting = (departmentId: string, title: string) => ({
			organizationId,
			departmentId,
			title,
			description: 'Container bounds fixture.',
			status: 'PENDING_APPROVAL' as const,
			createdById: submitter.id,
			submittedById: submitter.id
		})
		await db.jobPosting.createMany({
			data: [
				...Array.from({ length: COUNT }, (_, i) =>
					posting(managerDept.id, `${RUN} Posting ${String(i + 1).padStart(3, '0')}`)
				),
				posting(approverDept.id, APPROVER_POSTING)
			]
		})
	} finally {
		await db.$disconnect()
	}
})

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		await sweep(db, await orgOf(db), RUN)
	} catch {
		// Best-effort, same as pagination.spec.ts: a concurrent compute can attach an entry
		// between two deletes. Leftovers are swept rather than failing teardown.
	} finally {
		await db.$disconnect()
	}
})

function decisionButton(page: Page, name: RegExp) {
	return page.getByRole('main').getByRole('button', { name })
}

async function openPanel(page: Page, button: Locator, name: string) {
	const panel = page.getByRole('region', { name, exact: true })
	await expect(async () => {
		await button.click()
		await expect(panel).toBeVisible({ timeout: 1000 })
	}).toPass({ timeout: 15000 })
	return panel
}

async function badgeCount(button: Locator) {
	const label = (await button.getAttribute('aria-label')) ?? ''
	const match = /^(\d+) /.exec(label)
	if (!match) throw new Error(`accessible name does not start with a count: "${label}"`)
	return Number(match[1])
}

const scrollStyle = (el: Locator) =>
	el.evaluate((node) => {
		const s = getComputedStyle(node)
		return { maxHeight: s.maxHeight, overflowY: s.overflowY }
	})

async function expectInsideViewport(region: Locator) {
	const box = await region.evaluate((el) => {
		const r = el.getBoundingClientRect()
		return {
			left: r.left,
			right: r.right,
			viewport: window.innerWidth,
			scrollWidth: document.documentElement.scrollWidth
		}
	})
	expect(box.scrollWidth).toBeLessThanOrEqual(390)
	expect(box.left).toBeGreaterThanOrEqual(-0.5)
	expect(box.right).toBeLessThanOrEqual(box.viewport + 0.5)
}

test('the three dashboard lists cap at ten, badge the true total and scroll inside', async ({
	page
}) => {
	await login(page, USERS.manager)

	const events = page.getByRole('region', { name: EVENTS, exact: true })
	await expect(events.locator('ul > li')).toHaveCount(CAP)
	await expect(events.getByRole('link', { name: /view all/i })).toHaveCount(0)
	const eventsStyle = await scrollStyle(events)
	expect(eventsStyle.maxHeight).not.toBe('none')
	expect(eventsStyle.overflowY).toBe('auto')

	for (const [label, region, linkName, href] of PANELS) {
		const button = decisionButton(page, label)
		await expect(button).toBeVisible()
		const total = await badgeCount(button)
		expect(total).toBeGreaterThan(CAP)
		await expect(button.locator('span')).toHaveText(String(total))

		const panel = await openPanel(page, button, region)
		const list = panel.locator('ul')
		await expect(list.locator(':scope > li')).toHaveCount(CAP)
		expect((await scrollStyle(list)).overflowY).toBe('auto')

		const viewAll = panel.getByRole('link', { name: linkName, exact: true })
		await expect(viewAll).toBeVisible()
		await expect(viewAll).toHaveAttribute('href', href)
	}
})

test('a mapped approver without HR sees the posting but no View all postings link', async ({
	page
}) => {
	await login(page, USERS.approver)
	await expect(async () => {
		await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
		await expect(decisionButton(page, /upcoming regularizations$/)).toHaveCount(0)
	}).toPass({ timeout: 60000 })

	const panel = await openPanel(
		page,
		decisionButton(page, /postings awaiting your approval$/),
		'Postings awaiting your approval'
	)
	await expect(panel.getByRole('link', { name: APPROVER_POSTING, exact: true })).toBeVisible()
	await expect(panel.getByRole('link', { name: 'View all postings', exact: true })).toHaveCount(0)
})

test('the capped dashboard fits a 390px viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await login(page, USERS.manager)

	await expectInsideViewport(page.getByRole('region', { name: EVENTS, exact: true }))
	for (const [label, region] of PANELS) {
		await expectInsideViewport(await openPanel(page, decisionButton(page, label), region))
	}
})

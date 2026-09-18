import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

const DESCRIPTION = 'Record resignations and terminations'
const TIP_LABEL = 'About Separations'

function tipButton(page: Page) {
	return page.getByRole('button', { name: TIP_LABEL, exact: true })
}

test.describe('PageHeader description HelpTip', () => {
	test('hover reveals', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/separations', { waitUntil: 'domcontentloaded' })
		const tip = page.getByRole('tooltip')
		await expect(tip).toHaveCount(1)
		await expect(tip).toHaveCSS('opacity', '0')

		await tipButton(page).hover()

		await expect(tip).toHaveCSS('opacity', '1')
		await expect(tip).toContainText(DESCRIPTION)
	})

	test('focus reveals', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/separations', { waitUntil: 'domcontentloaded' })
		const tip = page.getByRole('tooltip')
		await expect(tip).toHaveCSS('opacity', '0')

		await tipButton(page).focus()

		await expect(tip).toHaveCSS('opacity', '1')
	})

	test('no standalone description paragraph', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/separations', { waitUntil: 'domcontentloaded' })

		await expect(page.getByText(DESCRIPTION, { exact: false })).toHaveCount(1)
		await expect(page.getByRole('tooltip')).toContainText(DESCRIPTION)
	})

	test('anchoring and overflow at three widths', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/separations', { waitUntil: 'domcontentloaded' })
		const tip = page.getByRole('tooltip')
		const heading = page.getByRole('heading', { name: 'Separations', level: 1 })

		for (const width of [1280, 768, 375]) {
			await page.setViewportSize({ width, height: 900 })
			await tipButton(page).focus()
			await expect(tip).toHaveCSS('opacity', '1')

			const box = (await tip.boundingBox())!
			const title = (await heading.boundingBox())!

			expect(box.y, `tooltip sits below the title row at ${width}px`).toBeGreaterThanOrEqual(
				title.y + title.height - 2
			)
			expect(box.x, `tooltip overlaps the title horizontally at ${width}px`).toBeLessThan(
				title.x + title.width
			)
			expect(
				box.x + box.width,
				`tooltip overlaps the title horizontally at ${width}px`
			).toBeGreaterThan(title.x)

			expect(box.x, `tooltip does not spill left at ${width}px`).toBeGreaterThanOrEqual(0)
			expect(box.x + box.width, `tooltip does not spill right at ${width}px`).toBeLessThanOrEqual(
				width
			)
		}
	})

	test('exactly one description-path help control per page', async ({ page }) => {
		const pages = [
			{ path: '/settings/roles', heading: 'Roles & Permissions', fromDescription: 0, total: 1 },
			{ path: '/leave/balances', heading: 'Leave Balances', fromDescription: 0, total: 1 },
			{ path: '/attendance', heading: 'Attendance', fromDescription: 1, total: 2 },
			{ path: '/dashboard', heading: 'Dashboard', fromDescription: 0, total: 0 }
		]

		await login(page, USERS.admin)

		for (const entry of pages) {
			await page.goto(entry.path, { waitUntil: 'domcontentloaded' })
			await expect(page.getByRole('heading', { name: entry.heading, level: 1 })).toBeVisible()

			await expect(
				page.getByRole('button', { name: `About ${entry.heading}`, exact: true }),
				`${entry.path} description-path help control`
			).toHaveCount(entry.fromDescription)

			await expect(
				page.getByRole('button', { name: /^About / }),
				`${entry.path} total help controls`
			).toHaveCount(entry.total)
		}
	})

	test('keyboard reach + aria-describedby resolves', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/separations', { waitUntil: 'domcontentloaded' })
		const button = tipButton(page)
		await expect(button).toHaveCount(1)

		let reached = false
		for (let i = 0; i < 60 && !reached; i++) {
			await page.keyboard.press('Tab')
			reached = await button.evaluate((el) => el === document.activeElement)
		}
		expect(reached, 'the ? control is reachable by Tab').toBe(true)

		expect(
			await button.evaluate((el) => el.matches(':focus-visible')),
			'the ? control shows its focus ring'
		).toBe(true)

		const id = await button.getAttribute('aria-describedby')
		expect(id, 'aria-describedby is set').toBeTruthy()
		const described = page.locator(`#${id}`)
		await expect(described).toContainText(DESCRIPTION)
		await expect(described).toHaveCSS('opacity', '1')
	})
})

test.describe('complaints detail keeps an identifying title', () => {
	const SUBJECT = 'Zzhelptip inquiry fixture'
	let complaintId = ''
	let employeeNumber = ''

	test.beforeAll(async () => {
		const db = new PrismaClient()
		try {
			const hr = await db.user.findUniqueOrThrow({ where: { email: USERS.hr.email } })
			const employee = await db.employee.findFirstOrThrow({
				where: { organizationId: hr.organizationId },
				orderBy: { employeeNumber: 'asc' }
			})
			employeeNumber = employee.employeeNumber
			const complaint = await db.hrComplaint.create({
				data: {
					organizationId: hr.organizationId,
					employeeId: employee.id,
					openedById: hr.id,
					subject: SUBJECT
				}
			})
			complaintId = complaint.id
		} finally {
			await db.$disconnect()
		}
	})

	test.afterAll(async () => {
		const db = new PrismaClient()
		try {
			await db.hrComplaint.deleteMany({ where: { subject: SUBJECT } })
		} finally {
			await db.$disconnect()
		}
	})

	test('title is the subject and the identity line lives in the tooltip', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto(`/complaints/${complaintId}`, { waitUntil: 'domcontentloaded' })

		await expect(page.getByRole('heading', { name: SUBJECT, level: 1 })).toBeVisible()

		const button = page.getByRole('button', { name: `About ${SUBJECT}`, exact: true })
		await expect(button).toHaveCount(1)
		await button.focus()

		const id = await button.getAttribute('aria-describedby')
		const described = page.locator(`#${id}`)
		await expect(described).toHaveCSS('opacity', '1')
		await expect(described).toContainText('For ')
		await expect(described).toContainText(employeeNumber)
	})
})

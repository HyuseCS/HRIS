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

	test('hovering where the bubble will appear does not reveal it', async ({ page }) => {
		await login(page, USERS.hr)
		await page.goto('/separations', { waitUntil: 'domcontentloaded' })
		const tip = page.getByRole('tooltip')
		await expect(tip).toHaveCSS('opacity', '0')

		const bubble = (await tip.boundingBox())!
		const button = (await tipButton(page).boundingBox())!
		const probeX = bubble.x + 24
		const probeY = bubble.y + bubble.height / 2
		expect(probeX, 'the probe sits left of the ? control').toBeLessThan(button.x)
		expect(probeY, 'the probe sits below the ? control').toBeGreaterThan(button.y + button.height)

		await page.mouse.move(probeX, probeY)
		await page.waitForTimeout(400)
		await expect(tip, 'the hidden bubble must not reveal itself').toHaveCSS('opacity', '0')

		// Negative control: the same pointer, on the ?, does reveal it — so a pass above is a real
		// pass, not a mouse that never worked.
		await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2)
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

test.describe('PageHeader description snippets', () => {
	const CONFIG_TEXT = 'Configure payroll frequency and cutoff dates'
	const RATES_TEXT = 'the payroll engine computes with'
	const LEAVE_TEXT = 'Your leave balances and history'
	const ONBOARDING_TEXT = "The steps shown on each employee's 201 file"

	test('a link in the description is reachable by keyboard and clickable', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/payroll/config', { waitUntil: 'domcontentloaded' })

		await expect(page.getByText(CONFIG_TEXT, { exact: false })).toHaveCount(1)

		const button = page.getByRole('button', { name: 'About Payroll Configuration', exact: true })
		await expect(button).toHaveCount(1)
		const tip = page.getByRole('tooltip')
		await expect(tip).toHaveCount(1)
		await expect(tip).toHaveCSS('opacity', '0')

		await button.focus()
		await expect(tip).toHaveCSS('opacity', '1')
		await expect(tip).toContainText(CONFIG_TEXT)

		// The link sits next in the tab order, and focus inside the bubble keeps it open —
		// without both, a description link would be unreachable.
		const link = tip.getByRole('link', { name: 'Statutory Rates', exact: true })
		await page.keyboard.press('Tab')
		expect(
			await link.evaluate((el) => el === document.activeElement),
			'the description link is the next tab stop after the ? control'
		).toBe(true)
		await expect(tip).toHaveCSS('opacity', '1')

		// A real pointer click — it fails if the bubble refuses pointer events.
		await link.click()
		await page.waitForURL('**/payroll/statutory-rates', { waitUntil: 'domcontentloaded' })
	})

	test('the pointer can travel from the ? into the tooltip and click the link', async ({
		page
	}) => {
		await login(page, USERS.admin)
		await page.goto('/payroll/config', { waitUntil: 'domcontentloaded' })

		const button = page.getByRole('button', { name: 'About Payroll Configuration', exact: true })
		const tip = page.getByRole('tooltip')
		await expect(tip).toHaveCSS('opacity', '0')

		const b = (await button.boundingBox())!
		await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
		await expect(tip).toHaveCSS('opacity', '1')
		expect(
			await button.evaluate((el) => el === document.activeElement),
			'this is the hover path — the ? must not be focused'
		).toBe(false)

		// This link wraps onto a second line, and the centre of a wrapped inline element's bounding
		// box sits in the dead space between its line boxes — there it hits the bubble, not the
		// link. Aim at the first line box. `link.click()` would paper over this; raw mouse events
		// do not hit-test, so they click whatever is really there.
		const link = tip.getByRole('link', { name: 'Statutory Rates', exact: true })
		const point = await link.evaluate((el) => {
			const r = el.getClientRects()[0]
			return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
		})

		// Crossing the gap between the ? and the bubble leaves the pointer over neither.
		await page.mouse.move(point.x, point.y, { steps: 12 })
		await expect(tip, 'the bubble survives the gap').toHaveCSS('opacity', '1')
		expect(
			await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, point),
			'the pointer really is on the link when the click below lands'
		).toBe('A')

		await page.mouse.down()
		await page.mouse.up()
		await page.waitForURL('**/payroll/statutory-rates', { waitUntil: 'domcontentloaded' })
	})

	test('a description that branches on capability renders its branch in the tooltip', async ({
		page
	}) => {
		await login(page, USERS.admin)
		await page.goto('/payroll/statutory-rates', { waitUntil: 'domcontentloaded' })

		await expect(page.getByText(RATES_TEXT, { exact: false })).toHaveCount(1)

		const button = page.getByRole('button', { name: 'About Statutory Rates', exact: true })
		await expect(button).toHaveCount(1)
		await button.focus()

		const tip = page.getByRole('tooltip')
		await expect(tip).toHaveCount(1)
		await expect(tip).toHaveCSS('opacity', '1')
		await expect(tip).toContainText(RATES_TEXT)
		await expect(tip).toContainText('You can edit and apply these directly.')
	})

	test('the leave description link is reachable by keyboard and clickable', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/leave', { waitUntil: 'domcontentloaded' })

		await expect(page.getByText(LEAVE_TEXT, { exact: false })).toHaveCount(1)

		const button = page.getByRole('button', { name: 'About Leave', exact: true })
		await expect(button).toHaveCount(1)
		const tip = page.getByRole('tooltip')
		await expect(tip).toHaveCount(1)
		await expect(tip).toHaveCSS('opacity', '0')

		await button.focus()
		await expect(tip).toHaveCSS('opacity', '1')
		await expect(tip).toContainText(LEAVE_TEXT)

		const link = tip.getByRole('link', { name: 'Requests/Approvals', exact: true })
		await page.keyboard.press('Tab')
		expect(
			await link.evaluate((el) => el === document.activeElement),
			'the description link is the next tab stop after the ? control'
		).toBe(true)
		await expect(tip).toHaveCSS('opacity', '1')

		await link.click()
		await page.waitForURL('**/requests', { waitUntil: 'domcontentloaded' })
	})

	test('the onboarding description keeps its emphasis inside the tooltip', async ({ page }) => {
		await login(page, USERS.admin)
		await page.goto('/settings/onboarding', { waitUntil: 'domcontentloaded' })

		await expect(page.getByText(ONBOARDING_TEXT, { exact: false })).toHaveCount(1)

		const button = page.getByRole('button', { name: 'About Onboarding Checklist', exact: true })
		await expect(button).toHaveCount(1)
		await button.focus()

		const tip = page.getByRole('tooltip')
		await expect(tip).toHaveCount(1)
		await expect(tip).toHaveCSS('opacity', '1')
		await expect(tip).toContainText(ONBOARDING_TEXT)
		await expect(tip.locator('span.font-medium', { hasText: 'Derived' })).toHaveCount(1)
		await expect(tip.locator('span.font-medium', { hasText: 'Manual' })).toHaveCount(1)
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

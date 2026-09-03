import { chromium, type FullConfig } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { E2E_DISCORD_ID } from './helpers'

/**
 * Resets the seeded employee's transactional data before the E2E run so tests
 * that create a current-week timesheet / leave request are deterministic across
 * repeated runs. Relies on the seed having been applied (`pnpm db:seed:e2e`).
 */
/**
 * Prime the hot routes once, before any test's clock is running.
 *
 * Written when the suite ran against `pnpm dev`, where vite compiled each route on its first
 * request and that cost landed on whichever test reached it first. #287 moved the suite onto
 * the production build (see `playwright.config.ts`), so there is no compilation left to pay
 * and this is now belt-and-braces: it still primes the OS/page cache and the client bundle,
 * and it costs a few seconds. Best-effort either way — a warmup miss must never fail the suite.
 */
async function warmRoutes(base: string) {
	// /login first — every test goes through it. The rest redirect to /login when
	// unauthenticated, which still forces their server modules to compile.
	const routes = ['/login', '/dashboard', '/timesheets', '/employees', '/performance', '/benefits']

	for (const route of routes) {
		try {
			await fetch(`${base}${route}`, { signal: AbortSignal.timeout(60_000), redirect: 'manual' })
		} catch {
			// Server not up yet, or this route is slow — tests will surface it properly.
		}
	}

	// The fetch loop compiles server modules, but the two-step Avipa login (#135) reveals
	// its credential form client-side, so the first *browser* hit to /login pays the client
	// bundle + hydration cost. Prime it here in a real browser so the first test doesn't
	// flake waiting for the tenant button to become interactive. Best-effort.
	try {
		const browser = await chromium.launch()
		const page = await browser.newPage()
		await page.goto(`${base}/login`, { waitUntil: 'load', timeout: 60_000 })
		// Clicking the tenant button forces hydration; if it reveals the Email field the
		// bundle is warm. Swallow failures — this is a warmup, not an assertion.
		await page
			.getByRole('button', { name: 'Veent', exact: true })
			.click({ timeout: 30_000 })
			.catch(() => {})
		await page
			.getByLabel('Email')
			.waitFor({ state: 'visible', timeout: 10_000 })
			.catch(() => {})
		await browser.close()
	} catch {
		// Chromium not available or server slow — tests will surface any real problem.
	}
}

async function globalSetup(config: FullConfig) {
	// Take the URL from the config Playwright hands us rather than re-deriving it from E2E_PORT.
	// This file used to parse the port itself and defaulted to 5173, so when #287 moved the suite
	// to 4173 the warmup silently pointed at whatever was on the old port — your dev server, if
	// one was up. One source of truth, and it cannot drift again.
	const base = config.projects[0].use.baseURL!
	await warmRoutes(base)
	const db = new PrismaClient()
	try {
		const employee = await db.employee.findFirst({
			where: { user: { email: 'employee@veent.ph' } },
			select: { id: true }
		})

		if (!employee) {
			throw new Error(
				'E2E seed missing: employee@veent.ph not found. Run `pnpm db:seed:e2e` before the E2E suite.'
			)
		}

		// Raw punches accumulate across runs and would otherwise mis-pair on re-aggregation,
		// so clear them and pin a known discordId for the signed-punch → aggregate E2E.
		await db.timeLog.deleteMany({ where: { employeeId: employee.id } })
		await db.employee.update({ where: { id: employee.id }, data: { discordId: E2E_DISCORD_ID } })

		await db.timesheetEntry.deleteMany({ where: { timesheet: { employeeId: employee.id } } })
		await db.timesheet.deleteMany({ where: { employeeId: employee.id } })
		await db.leaveRequest.deleteMany({ where: { employeeId: employee.id } })
		// Leave now flows through the unified Request model; reset it too (steps/documents
		// cascade) so leave-filing tests stay deterministic across repeated runs.
		await db.request.deleteMany({ where: { employeeId: employee.id } })

		// Restore full leave balances (approved requests in prior runs decrement them).
		const balances = await db.leaveBalance.findMany({ where: { employeeId: employee.id } })
		for (const b of balances) {
			await db.leaveBalance.update({
				where: { id: b.id },
				data: { used: 0, remaining: b.allocated }
			})
		}
	} finally {
		await db.$disconnect()
	}
}

export default globalSetup

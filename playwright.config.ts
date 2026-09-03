import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets parallel checkouts/worktrees run their own suite without
// colliding on (or silently reusing) another checkout's server. --strictPort
// makes vite fail loudly instead of drifting to a port the baseURL doesn't match.
//
// #287: 4173 (vite preview's own default), NOT 5173 — the suite no longer shares a port with
// `pnpm dev`, so running it never fights your dev server and never silently tests through it.
const port = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	// Playwright's 30s default is not enough here: these specs log in through the real
	// two-step form, and a cold login costs ~60s on a loaded machine or a CI runner. That
	// is the whole budget gone before the assertion under test runs, which is why
	// payslip-tenancy already flaked locally. Suite-wide rather than per-spec — the cost is
	// the login, and every spec pays it.
	timeout: 120_000,
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: `http://localhost:${port}`,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	// #287 — build once, then serve the BUILT app. The suite used to run against `pnpm dev`,
	// where vite compiles each route on its first request. That cost landed on whichever test
	// reached a route first and, under parallel workers, pushed hydration past the retry budgets
	// in `selectTenant` and the dialog helpers: 9 failed / 24 skipped in 6.2m on a cold server,
	// against 1 failed in 2.5m on a warm one. Nothing about the tests changed between those runs
	// — only how warm vite was, which is exactly why a local run could not be trusted.
	//
	// Against the production build the same 127 tests pass in 35s. `pnpm build` costs ~12s, so
	// this is faster end to end as well as honest, and it tests what actually ships.
	webServer: {
		command: `pnpm build && pnpm preview --port ${port} --strictPort`,
		url: `http://localhost:${port}`,
		// NOT `!CI`. Reuse would skip the build above and quietly test a stale bundle — the very
		// "a green run is luck" failure #287 is about. A fresh build every run is worth 12s.
		reuseExistingServer: false,
		// The default 60s does not cover build + boot on a loaded CI runner.
		timeout: 180_000
	}
})

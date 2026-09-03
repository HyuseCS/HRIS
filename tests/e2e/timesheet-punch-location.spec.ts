import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login } from './helpers'

/**
 * #177 — the web punch surface, end to end.
 *
 * The unit specs prove what the route DECIDES. This proves the two things they cannot: that a
 * browser actually reaches the page, hands over a real geolocation reading, and that the
 * employee then sees their own coordinates back with an accuracy qualifier — and that revoking
 * the permission costs them nothing but the coordinates.
 *
 * Runs as a JoJo Potato crew member: /punch is food-service only, and the crew account is the
 * plainest possible EMPLOYEE — no HR capability is involved in punching for oneself.
 *
 * Serial: both cases punch as the same employee, and the action debounces to one punch per
 * employee per type per PHT minute.
 */
test.describe.configure({ mode: 'serial' })

const CREW = { email: 'benjie@jojo.ph', password: 'Employee@1234' }
const TENANT = 'JoJo Potato'

// Cagayan de Oro — where the seeded JoJo stores are.
const FIX = { latitude: 8.4772, longitude: 124.6459 }

/**
 * Hold every geolocation answer back by CAPTURE_MS, so the capture window — normally 2–8 s on a
 * real phone with `enableHighAccuracy`, and near-instant under Playwright's synthetic fix — is a
 * real, deterministic span the test can act inside. Without this the race below cannot be staged
 * at all: the reading arrives before a second tap could ever land.
 */
const CAPTURE_MS = 1500

/**
 * Drop every WEB punch this account already has, before each test.
 *
 * The action debounces on `web:<employeeId>:<type>:<PHT minute>`, so a rerun inside the same
 * minute — a CI retry, or simply running this file twice — replays a used key and gets a 409,
 * failing a test that would otherwise pass. Deleting the rows frees the key.
 *
 * WEB only, and only this crew account: the DISCORD punches are seeded fixtures other suites
 * aggregate and assert hour totals against, so they must survive. Both punch tests below still
 * run serially and each still owns one punch TYPE — this removes the cross-RUN collision, not
 * the within-run one.
 */
async function clearWebPunches() {
	const db = new PrismaClient()
	try {
		await db.timeLog.deleteMany({
			where: { source: 'WEB', employee: { user: { email: CREW.email } } }
		})
	} finally {
		await db.$disconnect()
	}
}

test.beforeEach(clearWebPunches)

async function slowGeolocation(context: BrowserContext) {
	await context.addInitScript((ms) => {
		const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation)
		Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
			configurable: true,
			value: (...args: Parameters<typeof real>) => setTimeout(() => real(...args), ms)
		})
	}, CAPTURE_MS)
}

async function openPunchPage(context: BrowserContext): Promise<Page> {
	const page = await context.newPage()
	await login(page, CREW, TENANT)
	await page.goto('/punch', { waitUntil: 'domcontentloaded' })
	await expect(page.getByRole('heading', { name: 'Punch', exact: true })).toBeVisible()
	// Wait for hydration. A pre-hydration click submits the form natively and punches WITHOUT a
	// location — correct behaviour (the punch is never lost), but not what these specs assert on.
	// Same class of race the login helper documents: a pre-hydration click is silently dropped.
	await expect(page.locator('form[data-ready="true"]')).toBeVisible()
	return page
}

test('a granted location is captured, and a second tap inside the capture window cannot change the punch type', async ({
	browser
}) => {
	const context = await browser.newContext({
		permissions: ['geolocation'],
		geolocation: FIX
	})
	await slowGeolocation(context)
	const page = await openPunchPage(context)

	// A real <button>, reached by its accessible name — not a div with a click handler.
	await page.getByRole('button', { name: 'Punch In' }).click()

	// THE REGRESSION. The lock has to be up from the TAP, not from the submit — the submit is
	// still CAPTURE_MS away. Before the fix `punch.busy` was the only guard, so it was still
	// false here: both buttons stayed live, the status line still claimed nothing had been
	// requested, and a tap of Punch Out re-entered the handler and reassigned the hidden
	// `punchType` field. The first request then submitted with no submitter, the hidden field
	// won, and an OUT was recorded for someone who tapped IN.
	// `data-ready` says the handler is live; `data-busy` says a punch is in flight — which now
	// starts at the tap, so this is true long before the form is submitted.
	await expect(page.locator('form[data-busy="true"]')).toBeVisible()
	const status = page.getByRole('status')
	await expect(status).toContainText(/Finding your location/)
	const punchOut = page.getByRole('button', { name: 'Punch Out' })
	await expect(punchOut).toBeDisabled()
	await expect(page.getByRole('button', { name: 'Punching in…' })).toBeVisible()

	// `dispatchEvent` rather than `click`: it fires the handler even on a disabled button, so this
	// asserts the JS re-entry guard itself and not merely the `disabled` attribute in front of it.
	await punchOut.dispatchEvent('click')

	// The live region reports the granted state, with the accuracy figure the SPEC requires — and
	// says "reading", never "captured", because nothing is stored yet at that point.
	await expect(status).toContainText(/Got a location reading/)

	// The outcome lives in its own assertive region, so a screen reader marks it as the ANSWER.
	const outcome = page.getByRole('alert')
	await expect(outcome).toContainText(/Punched in with your location\./)
	await expect(outcome).not.toContainText(/Punched out/)

	// The page now answers "am I clocked in?" without scrolling.
	await expect(page.getByText(/Clocked in since /)).toBeVisible()

	// The newest punch — the list is newest-first — is the IN that was tapped. A stolen OUT would
	// sit here instead.
	const row = page.getByRole('listitem').first()
	await expect(row).toContainText('Clock in')

	// The employee sees their OWN reading back: a map they can check, with the accuracy qualifier
	// in the trigger's own label so it can never be read apart from it.
	const map = row.getByRole('button', { name: /View on map/ })
	await expect(map).toContainText(/\((?:±\d+ m|accuracy unknown)\)/)

	// The map opens in place rather than navigating away, and it is centred on THIS punch.
	await map.click()
	const dialog = page.getByRole('dialog', { name: 'Punch location' })
	await expect(dialog).toBeVisible()
	await expect(dialog.getByTestId('punch-map')).toHaveAttribute('data-lat', /^8\.4772/)
	// Leaflet mounted rather than leaving an empty box — its own container class is the proof.
	await expect(dialog.locator('.leaflet-container')).toBeVisible()
	// The qualifier rides along inside the modal too.
	await expect(dialog).toContainText(/(?:±\d+ m|Accuracy unknown)/)

	// Escape closes it, and the page underneath is still the punch page.
	await page.keyboard.press('Escape')
	await expect(dialog).toBeHidden()
	await expect(page).toHaveURL(/\/punch$/)

	await context.close()
})

test('a denied permission still records the punch, driven by keyboard alone', async ({
	browser
}) => {
	// No geolocation permission granted at all: getCurrentPosition takes the error path, which
	// is the branch that must never cost the employee their punch.
	//
	// Keyboard-only activation rides along here rather than in a test of its own: the action
	// debounces to one punch per employee per TYPE per PHT minute, there are exactly two types,
	// and the granted-location case above already owns IN. A third punch inside the same minute
	// would collide with one of them and assert the debounce instead of the thing under test.
	const context = await browser.newContext()
	const page = await openPunchPage(context)

	const punchOut = page.getByRole('button', { name: 'Punch Out' })
	await punchOut.focus()
	await expect(punchOut).toBeFocused()
	await page.keyboard.press('Enter')

	// The punch is the assertion that matters. The location copy varies by browser (denied vs
	// no fix), so assert that it is one of the punch-anyway states rather than pinning one.
	await expect(page.getByRole('alert')).toContainText(/Punched out without a location\./)
	await expect(page.getByRole('status')).toContainText(/punching without it\./)

	const row = page.getByRole('listitem').filter({ hasText: 'Clock out' }).first()
	await expect(row).toContainText('No location recorded')

	await context.close()
})

test('/punch does not exist for a non-food-service tenant', async ({ browser }) => {
	// The negative control (criterion 20). Veent's admin never sees this page, and a direct
	// navigation is refused by the load guard rather than the missing nav link.
	const context = await browser.newContext()
	const page = await context.newPage()
	await login(page, { email: 'admin@veent.ph', password: 'Admin@1234' })

	await expect(page.getByRole('link', { name: 'Punch' })).toHaveCount(0)

	const res = await page.goto('/punch', { waitUntil: 'domcontentloaded' })
	expect(res?.status()).toBe(404)

	await context.close()
})

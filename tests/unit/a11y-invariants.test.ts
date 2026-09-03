import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UI/UX overhaul phase 08 (§S4, §S6) — the accessibility invariants.
 *
 * WHAT THESE GATES DO NOT PROVE. Every one is a source scan, the same shape as
 * `copy-invariants.test.ts`. They prove an attribute is present or absent in a file. They do NOT
 * prove a link is reachable by keyboard, that a screen reader announces a row as a row, that the
 * focus trap in the mobile drawer actually holds, or that any of it has adequate contrast. There is
 * no component-render tier in this repo (`vitest.config.ts` is `environment: 'node'`), which is
 * exactly the residual recorded in `a11y-component-test-harness_NOTE_03-09-26.md`. The live half is
 * the owner's keyboard walk and screen-reader pass, listed in the phase report.
 *
 * They exist so a later edit cannot silently put `role="link"` back on a `<tr>`, or drop the text
 * equivalent off a colour-only status signal, without CI saying so.
 */

const SRC = join(import.meta.dirname, '../../src')

const sourceFiles = () =>
	readdirSync(SRC, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(ts|svelte)$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name))
		.filter((path) => !path.includes('.svelte-kit'))

const rel = (path: string) => path.slice(SRC.length + 1)

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

// ── S4 items 22-25 — row semantics (design ruling R1) ────────────────────────
/**
 * R1: a table row is a table row. The row's primary cell carries a real `<a href>` (or, where the
 * row opens a modal rather than a URL, a real `<button>`); the whole-row click survives only as a
 * mouse convenience. `role="link"` on a `<tr>` lied to a screen reader — it announced a link that
 * swallowed every cell — and `tabindex="0"` put a fake stop in the tab order that could not be
 * middle-clicked, copied or opened in a new tab.
 */
describe('table rows are rows, not fake links (S4 items 22-25)', () => {
	/** The five rows converted by this phase, and the href each one's real link carries. */
	const CONVERTED_ROWS: Array<[file: string, href: string]> = [
		['routes/(app)/employees/+page.svelte', 'href="/employees/{emp.id}"'],
		['routes/(app)/requests/+page.svelte', 'href="/requests/{req.id}"'],
		['routes/(app)/leave/balances/+page.svelte', 'href="/employees/{row.id}"'],
		['routes/(app)/leave/+page.svelte', 'href="/requests/{req.id}"'],
		['routes/(app)/recruitment/+page.svelte', 'href="/recruitment/{jp.id}"']
	]

	it('no source file anywhere carries role="link"', () => {
		const offenders = sourceFiles()
			.filter((path) => readFileSync(path, 'utf8').includes('role="link"'))
			.map(rel)
		expect(offenders).toEqual([])
	})

	it('the scan can still see a role="link" (self-check)', () => {
		// Guards the test above against silently passing because the needle was mistyped. If this
		// ever fails, the gate is broken, not the code.
		expect('<tr role="link" tabindex="0">'.includes('role="link"')).toBe(true)
	})

	it.each(CONVERTED_ROWS)('%s puts a real link in its primary cell', (file, href) => {
		expect(read(file)).toContain(href)
	})

	it('the timesheets row opens its modal from a real button, not from the row', () => {
		// Carve-out: this row has no URL — it opens a review modal — so R1's "real <a>" does not
		// apply. A real <button> in the period cell is the same shape with the right element.
		const page = read('routes/(app)/timesheets/+page.svelte')
		expect(page).toContain('aria-label="Review timesheet for')
		expect(page).not.toContain('role="link"')
	})

	it('no converted row is still a focusable fake control', () => {
		// A `tabindex="0"` left on the <tr> would put the row back in the tab order alongside the
		// new link, which is the double-stop R1 exists to remove.
		for (const [file] of CONVERTED_ROWS) {
			expect(read(file), file).not.toContain('tabindex="0"')
		}
		expect(read('routes/(app)/timesheets/+page.svelte')).not.toContain('tabindex="0"')
	})
})

// ── S5 items 27-29 — the drawer and the org switcher ─────────────────────────
describe('the mobile drawer and the org switcher are keyboard-operable (S5 items 27-29)', () => {
	const layout = () => read('routes/(app)/+layout.svelte')

	it('the drawer announces itself as a modal and the hamburger says so too', () => {
		const page = layout()
		expect(page).toContain('aria-controls="main-sidebar"')
		expect(page).toContain('aria-expanded={sidebarOpen}')
		expect(page).toContain(`aria-label={sidebarOpen ? 'Main menu' : undefined}`)
		// Conditional on purpose: above lg this same <aside> is the persistent page sidebar, and
		// a permanent aria-modal would tell a reader the rest of the page is inert when it is not.
		expect(page).toContain(`role={sidebarOpen ? 'dialog' : undefined}`)
	})

	it('the drawer traps Tab, closes on Escape and hands focus back to the hamburger', () => {
		const page = layout()
		expect(page).toContain('onkeydown={onDrawerKeydown}')
		expect(page).toContain(`if (e.key === 'Escape')`)
		expect(page).toContain('hamburgerEl?.focus()')
		// The backdrop and the in-drawer close button must restore focus too, not just hide it.
		expect(page.match(/onclick=\{closeDrawer\}/g)).toHaveLength(2)
	})

	it('the org switcher is a native select, not a hand-rolled popover', () => {
		const page = layout()
		expect(page).toContain(`aria-label="Active organization"`)
		expect(page).toContain('onchange={(e) => switchOrg(e.currentTarget.value)}')
		// The popover's open/close state is gone with it — a leftover would mean both exist.
		expect(page).not.toContain('orgMenuOpen')
	})

	it('the sidebar nav keeps its landmark name', () => {
		// Phase 02 already added this (item 28); the gate keeps it.
		expect(layout()).toContain('<nav aria-label="Main"')
	})
})

// ── S6 items 31-33 — no status is signalled by colour alone ──────────────────
describe('colour is never the only signal (S6 items 31-33)', () => {
	it('the payroll manual-override marker carries text, not just a yellow asterisk', () => {
		const page = read('routes/(app)/payroll/+page.svelte')
		expect(page).toContain('has a manual override')
	})

	it('the schedules On/Off pills are switches with a checked state and a name', () => {
		const page = read('routes/(app)/settings/schedules/+page.svelte')
		// Two pills: the org-wide one and the per-schedule one.
		expect(page.match(/role="switch"/g)).toHaveLength(2)
		expect(page.match(/aria-checked=/g)).toHaveLength(2)
		expect(page).toContain('Track tardiness for')
	})

	it('the approvals count indicator is a number with a name, not a bare dot', () => {
		// Phase 02 already satisfied this one; the gate keeps it satisfied.
		expect(read('routes/(app)/+layout.svelte')).toContain('awaiting your decision')
	})
})

// ── S6 items 35-37 — announcement and focus affordances ──────────────────────
describe('icon, tab and error affordances (S6 items 35-37)', () => {
	it('no bare emoji is used as an icon in an app route', () => {
		const offenders = sourceFiles()
			.filter((path) => rel(path).startsWith('routes/'))
			.filter((path) => /\p{Emoji_Presentation}/u.test(readFileSync(path, 'utf8')))
			.map(rel)
		expect(offenders).toEqual([])
	})

	it('the template Editor/Preview pane switch has tab semantics', () => {
		const page = read('routes/(app)/performance/templates/[id]/+page.svelte')
		expect(page).toContain('role="tablist"')
		expect(page.match(/role="tab"/g)).toHaveLength(2)
		expect(page.match(/aria-selected=/g)).toHaveLength(2)
	})

	it('the five long pages take a failed submit to the error', () => {
		// Addendum §F. The action is the mechanism; a page that dropped it would leave HR staring
		// at an unchanged screen after a failed save far below the fold.
		const PAGES = [
			'routes/(app)/attendance/+page.svelte',
			'routes/(app)/payroll/statutory-rates/+page.svelte',
			'routes/(app)/requests/approvals/+page.svelte',
			'routes/(app)/settings/roles/+page.svelte',
			'routes/(app)/employees/[id]/+page.svelte'
		]
		for (const page of PAGES) {
			expect(read(page), page).toContain('use:scrollToError')
		}
	})

	it('the scroll-to-error action honours prefers-reduced-motion', () => {
		const action = read('lib/actions/scrollToError.ts')
		expect(action).toContain('prefers-reduced-motion')
		// Smooth is the default; reduced motion must get the jump, not a slower smooth.
		expect(action).toContain(`reduced ? 'auto' : 'smooth'`)
	})
})

// ── S6 items 34, 38-40 — per-area affordances ────────────────────────────────
describe('per-area affordances (S6 items 34, 38-40)', () => {
	it('the onboarding manual-step control clears the 24px minimum target', () => {
		const page = read('routes/(app)/employees/[id]/+page.svelte')
		// h-6 = 24px. The old control was h-4 (16px).
		expect(page).toContain("aria-label=\"{step.done ? 'Uncheck' : 'Check'} {step.label}\"")
		expect(page).not.toContain('mt-0.5 flex h-4 w-4 flex-none')
	})

	it('the audit-log filters reflect the active URL params', () => {
		const page = read('routes/(app)/reports/audit-log/+page.svelte')
		// All five controls, or the active filter goes invisible after submit for the missing one.
		expect(page).toContain(`selected={param('actor') === actor.id}`)
		expect(page).toContain(`selected={param('entity') === et}`)
		expect(page).toContain(`selected={param('action') === a}`)
		expect(page).toContain(`value={param('start')}`)
		expect(page).toContain(`value={param('end')}`)
	})

	it('the audit-log entity id can be read and copied', () => {
		const page = read('routes/(app)/reports/audit-log/+page.svelte')
		expect(page).toContain('title={log.entityId}')
		expect(page).toContain('select-all')
	})

	it('the login error box is announced and readable in both themes', () => {
		const page = read('routes/(auth)/login/+page.svelte')
		expect(page).toContain('role="alert"')
		// `text-red-400` alone is a dark-mode colour; on light it was pale red on near-white.
		expect(page).toContain('text-red-600 dark:text-red-400')
		expect(page).not.toMatch(/class="mb-4 rounded bg-destructive\/15[^"]*text-red-400"/)
	})

	it('the deliberate non-enumeration login message survives (R5 negative control)', () => {
		// Guards the whole S6 sweep against "improving" the one error string that is vague on
		// purpose. If this ever fails, an agent has widened scope into the auth flow.
		expect(read('routes/(auth)/login/+page.server.ts')).toContain('Invalid email or password')
	})
})

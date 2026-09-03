import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UI/UX overhaul phase 08 (§S2, §S3) — the copy and naming invariants.
 *
 * WHAT THESE GATES DO NOT PROVE. Every one is a source scan. They prove a string is present or
 * absent in a file. They do NOT prove `/inquiries` renders, that the 308 actually fires for an old
 * bookmark, that the login page looks right, or that any rewritten error sentence ever reaches a
 * person's screen. That half rests on `tests/e2e/auth.spec.ts` and the live walk recorded in the
 * phase report. A green run here is compatible with the page being broken — read the report too.
 *
 * They exist because the alternative is a shell one-liner in a report that nothing re-runs, and the
 * defects they catch (a reintroduced `/complaints` href, an Avipa string, a machine-voiced error)
 * are exactly the kind that creep back in silently.
 */

const SRC = join(import.meta.dirname, '../../src')

const sourceFiles = () =>
	readdirSync(SRC, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(ts|svelte)$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name))
		// SvelteKit's generated output can appear under a route dir; it is not source.
		.filter((path) => !path.includes('.svelte-kit'))

const rel = (path: string) => path.slice(SRC.length + 1)

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

// ── S2 item 10/11 — the /complaints → /inquiries alias ───────────────────────
/**
 * The four redirect stubs are the only files allowed to say `/complaints`: two of them redirect
 * from it and the other two are the mandatory (never-rendered) page components. Everything else —
 * including the `/complaints/{id}` notification link targets the complaints service builds — points
 * at `/inquiries`. The module path, the Prisma models and the audit entity names still say
 * "complaint"; those are data keys, not URLs, and are deliberately untouched.
 */
const REDIRECT_STUBS = [
	'routes/(app)/complaints/+page.server.ts',
	'routes/(app)/complaints/+page.svelte',
	'routes/(app)/complaints/[id]/+page.server.ts',
	'routes/(app)/complaints/[id]/+page.svelte'
]

describe('the inquiries route alias (S2 items 10-11)', () => {
	/**
	 * A URL, not the module path. `$lib/server/services/complaints` is a data key and stays — the
	 * `(?<!services)` is what tells the two apart, so this must never be loosened to a bare
	 * `includes('/complaints')`.
	 */
	const COMPLAINTS_URL = /(?<!services)\/complaints(?![A-Za-z])/

	it('no source file outside the four redirect stubs points at /complaints', () => {
		const offenders = sourceFiles()
			.filter((path) => !REDIRECT_STUBS.includes(rel(path)))
			// Catches `href="/complaints`, `'/complaints'` and the backtick template literals.
			.filter((path) => COMPLAINTS_URL.test(readFileSync(path, 'utf8')))
			.map(rel)
		expect(offenders).toEqual([])
	})

	it('all four redirect stubs exist and 308 to the new URL', () => {
		for (const stub of REDIRECT_STUBS) {
			expect(existsSync(join(SRC, stub)), `${stub} is missing`).toBe(true)
		}
		expect(read(REDIRECT_STUBS[0])).toContain("redirect(308, '/inquiries')")
		expect(read(REDIRECT_STUBS[2])).toContain('redirect(308, `/inquiries/${params.id}`)')
	})

	it('the complaints service still writes its notification links to /inquiries', () => {
		const service = read('lib/server/services/complaints/index.ts')
		expect(service).toContain('`/inquiries/${complaint.id}`')
		expect(service).not.toContain('/complaints/')
	})

	it('the scan sees a stray URL but not the service import (guards against a vacuous pass)', () => {
		expect(COMPLAINTS_URL.test('href="/complaints/{c.id}"')).toBe(true)
		expect(COMPLAINTS_URL.test("import x from '$lib/server/services/complaints'")).toBe(false)
	})
})

// ── S2 item 12 — the login rebrand ───────────────────────────────────────────
describe('the login page reads Veent HRIS, not Avipa (S2 item 12)', () => {
	const login = () => read('routes/(auth)/login/+page.svelte')

	it('uses the Veent logo asset', () => {
		expect(login()).toContain('src="/veent-logo.png"')
		expect(login()).not.toContain('avipa-logo')
	})

	it('says Veent HRIS in the tab title and the footer', () => {
		expect(login()).toContain('<title>Sign In — Veent HRIS</title>')
		expect(login()).toContain('Veent HRIS · {new Date().getFullYear()}')
	})

	/**
	 * One documented survivor: a comment INSIDE `loginSchema`. Phase 08's AC5 requires that schema
	 * block to stay byte-for-byte untouched so the "the auth flow was not silently changed" check
	 * is a plain empty diff, and a brand word in a comment is not worth weakening that proof. It
	 * goes with the email-first login plan (see the backlog note).
	 */
	const ALLOWED_AVIPA = 'routes/(auth)/login/+page.server.ts'

	it('leaves no Avipa string anywhere in src/ except the one AC5 protects', () => {
		const offenders = sourceFiles()
			.filter((path) => /avipa/i.test(readFileSync(path, 'utf8')))
			.map(rel)
		expect(offenders).toEqual([ALLOWED_AVIPA])
	})

	it('the surviving Avipa mention is a comment inside loginSchema, not rendered copy', () => {
		const lines = read(ALLOWED_AVIPA)
			.split('\n')
			.filter((line) => /avipa/i.test(line))
		expect(lines).toHaveLength(1)
		expect(lines[0].trim().startsWith('//')).toBe(true)
	})
})

// ── S2 item 15 — the R2 title policy ─────────────────────────────────────────
/**
 * A separation and an inquiry are each the sensitive fact in themselves, so neither may put a
 * person's name or a free-text subject in the browser tab, the history list or a shared screen.
 * `employees/[id]` and `recruitment/applicant/[applicantId]` keep their names on purpose — there
 * the record simply *is* that person and carries no adverse inference.
 */
describe('sensitive titles leak no name or subject (S2 item 15, R2)', () => {
	const SENSITIVE = ['routes/(app)/separations/', 'routes/(app)/inquiries/']

	it('no separations or inquiries <title> interpolates a name or a subject', () => {
		const offenders: string[] = []
		for (const path of sourceFiles()) {
			if (!SENSITIVE.some((dir) => rel(path).startsWith(dir))) continue
			for (const [title] of readFileSync(path, 'utf8').matchAll(/<title>[\s\S]*?<\/title>/g)) {
				if (/firstName|lastName|\.subject/.test(title)) offenders.push(`${rel(path)}: ${title}`)
			}
		}
		expect(offenders).toEqual([])
	})

	/**
	 * Route files only. A `<title>` inside an inline `<svg>` is a chart tooltip, not the browser
	 * tab — `HeadcountTrend.svelte` and `PayrollCostBar.svelte` both use one, and holding them to
	 * the document-title policy would be nonsense.
	 */
	it('every document title in a route ends with the product name', () => {
		const offenders: string[] = []
		for (const path of sourceFiles()) {
			if (!rel(path).startsWith('routes/')) continue
			for (const [title] of readFileSync(path, 'utf8').matchAll(/<title>[\s\S]*?<\/title>/g)) {
				if (!title.includes('— Veent HRIS</title>')) offenders.push(`${rel(path)}: ${title}`)
			}
		}
		expect(offenders).toEqual([])
	})
})

// ── S2 item 14 — the #182 noun ruling ────────────────────────────────────────
/**
 * Owner ruling 03-09-26: a physical location is a "Store" on every surface, and `/team` — the
 * people roster — is "Team" for every tenant. The old pairing had the sidebar calling the roster
 * "Branches" and the store registry "Stores", which read as an inversion to anyone who knew the
 * route names. `tests/unit/nav-sections.test.ts` pins the nav half; this pins the page half.
 */
describe('the Stores/Team noun ruling reaches non-nav surfaces (S2 item 14)', () => {
	it('the store registry page says Stores, never Branch, in its visible copy', () => {
		const page = read('routes/(app)/branches/+page.svelte')
		expect(page).toContain('<title>Stores — Veent HRIS</title>')
		expect(page).toContain('title="Stores"')
		// Data keys keep the word: the route, the query param, the Prisma model and the label map.
		const visibleBranchWords = page
			.split('\n')
			.filter((line) => /branch/i.test(line))
			.filter(
				(line) =>
					!/BRANCH_STATUS_LABELS|href="\/branches"|\?branch=|data\.branches|domain="branch"/.test(
						line
					)
			)
		expect(visibleBranchWords).toEqual([])
	})

	it('the roster page is Team for every tenant, with no isFoodService swap left', () => {
		const page = read('routes/(app)/team/+page.svelte')
		expect(page).toContain('<title>Team — Veent HRIS</title>')
		expect(page).toContain('title="Team Attendance"')
		expect(page).not.toContain('isFoodService')
	})
})

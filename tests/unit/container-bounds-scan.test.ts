import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UI/UX overhaul phase 10 (`container-bounds`) — the source-scan half of the gates.
 *
 * WHAT THESE GATES DO NOT PROVE. Every assertion here reads a file as text. They prove a
 * string is or is not present in source. They do NOT prove a list renders, that a cap applies
 * at runtime, or that a scroll box is usable — there is no component-render tier in this repo
 * (`vitest.config.ts` is `environment: 'node'`). The runtime half is
 * `tests/e2e/container-bounds.spec.ts` for the dashboard, and the owner's look pass everywhere
 * else.
 *
 * They exist so a later edit cannot quietly put a cap where phase 10's research proved a cap
 * corrupts derived data (the six fetch-vs-markup traps), or add a `take` to one of the thirteen
 * pages that already paginate properly.
 */

const SRC = join(import.meta.dirname, '../../src')
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

// ── G5 — the thirteen paginated pages are unchanged ──────────────────────────
/**
 * These pages already do the honest thing: `paginate(url, total)` plus a `Pagination.svelte`
 * control. Phase 10 is a bounding phase, not a pagination phase, and adding a cap on top of a
 * page that already pages would silently hide rows the reader can otherwise reach. The scan
 * pins two things: the `paginate(` call is still there, and no literal-number `take` or
 * `.slice(0,` was added beside it. A legitimate paginated slice is always keyed off
 * `pagination.skip`/`pagination.take`, never off a constant.
 */
describe('the thirteen paginated pages gained no cap (G5)', () => {
	const PAGINATED = [
		'routes/(app)/attendance/+page.server.ts',
		'routes/(app)/employees/+page.server.ts',
		'routes/(app)/inquiries/+page.server.ts',
		'routes/(app)/inventory/+page.server.ts',
		'routes/(app)/leave/+page.server.ts',
		'routes/(app)/payslips/+page.server.ts',
		'routes/(app)/recruitment/+page.server.ts',
		'routes/(app)/reports/audit-log/+page.server.ts',
		'routes/(app)/requests/+page.server.ts',
		'routes/(app)/requests/approvals/+page.server.ts',
		'routes/(app)/requests/proposals/+page.server.ts',
		'routes/(app)/separations/+page.server.ts',
		'routes/(app)/timesheets/+page.server.ts'
	]

	it.each(PAGINATED)('%s still paginates', (file) => {
		expect(read(file), file).toContain('paginate(')
	})

	const STRING_SLICES: Record<string, string[]> = {
		'routes/(app)/attendance/+page.server.ts': ['toISOString().slice(0, 10)'],
		'routes/(app)/reports/audit-log/+page.server.ts': ['.trim().slice(0, 100)'],
		'routes/(app)/requests/+page.server.ts': ['manilaDayKey(new Date()).slice(0, 4)']
	}

	it.each(PAGINATED)('%s has no literal take and no constant slice', (file) => {
		const source = read(file)
		const stripped = (STRING_SLICES[file] ?? []).reduce(
			(text, entry) => text.split(entry).join(''),
			source
		)
		expect(source.match(/take:\s*\d/g), `${file} gained a literal take`).toBeNull()
		expect(stripped.match(/\.slice\(0,/g), `${file} gained a constant slice`).toBeNull()
	})
})

// ── G10 — the traps the research proved must never be capped ─────────────────
describe('the fetch-vs-markup traps hold (G10)', () => {
	/**
	 * T5. The documents array is not just the Documents panel — it is fed to
	 * `getEmployeeOnboarding` as `documents.map((d) => d.category)`, which decides whether each
	 * onboarding step reads as done. Cap the fetch and the checklist starts claiming a step is
	 * outstanding when its document exists. The panel is render-capped instead.
	 */
	it('employees/[id] documents are not query-capped', () => {
		const source = read('routes/(app)/employees/[id]/+page.server.ts')
		expect(source).toContain('listEmployeeDocuments(params.id, locals.user!.organizationId)')
		expect(source).toContain('documents.map((d) => d.category)')
		expect(source.match(/documents\.slice\(/g)).toBeNull()
	})

	it('the attendance members query is not capped', () => {
		const source = read('routes/(app)/attendance/+page.server.ts')
		const [, after] = source.split('const members = await db.employee.findMany(')
		expect(after, 'attendance members query not found').toBeDefined()
		const block = after.slice(0, after.indexOf('})'))
		expect(block).toContain('take: pagination.take')
		expect(block.match(/take:\s*\d/g), 'attendance members gained a literal take').toBeNull()
		expect(source).toContain('employeeId: { in: members.map((m) => m.id) }')
	})

	/**
	 * T4. Capping a roster picker makes a person unreachable — the form simply cannot name them.
	 * A native `<select>` scrolls itself and the checkbox list already carries `max-h-48`. The
	 * honest fix for a long roster is a typeahead, recorded in
	 * `backlog/roster-select-typeahead_NOTE_04-09-26.md`.
	 */
	const PICKERS: Array<[file: string, each: string]> = [
		['routes/(app)/dashboard/+page.svelte', '{#each data.awardEmployees as e (e.id)}'],
		['routes/(app)/employees/[id]/+page.svelte', '{#each data.supervisorOptions as opt (opt.id)}'],
		['routes/(app)/employees/[id]/+page.svelte', '{#each data.supervisorOptions as s (s.id)}'],
		['routes/(app)/benefits/+page.svelte', '{#each data.employees as e (e.id)}'],
		['routes/(app)/settings/posting-approvers/+page.svelte', '{#each data.employees as e (e.id)}'],
		['routes/(app)/payroll/salary-grades/+page.svelte', '{#each data.grades as g (g.id)}']
	]

	it.each(PICKERS)('%s picker is uncapped', (file, each) => {
		expect(read(file), `${file} — ${each}`).toContain(each)
	})

	it('both salary-grade each blocks are uncapped', () => {
		const source = read('routes/(app)/payroll/salary-grades/+page.svelte')
		expect(source.split('{#each data.grades as g (g.id)}').length - 1).toBe(2)
	})

	/**
	 * D-6. `/leave/balances` IS the view-all destination for `/leave`. A destination that
	 * silently drops rows is worse than an unbounded one, so this page gets the scroll box and
	 * no cap. Query-level pagination is the honest fix and stays in the backlog note.
	 */
	it('/leave/balances has no render cap', () => {
		const source = read('routes/(app)/leave/balances/+page.svelte')
		expect(source.match(/\.slice\(0,/g), '/leave/balances gained a cap').toBeNull()
		expect(source).not.toContain('RENDER_CAP')
	})
})

describe('the plain sites are bounded (G13)', () => {
	const PLAIN_SITES: Array<[file: string, count: number]> = [
		['routes/(app)/benefits/+page.svelte', 2],
		['routes/(app)/performance/+page.svelte', 4],
		['routes/(app)/payroll/[id]/+page.svelte', 1],
		['routes/(app)/profile/+page.svelte', 3],
		['routes/(app)/branches/+page.svelte', 1],
		['routes/(app)/departments/+page.svelte', 1],
		['routes/(app)/payroll/statutory-rates/+page.svelte', 2],
		['routes/(app)/settings/offboarding/+page.svelte', 1],
		['routes/(app)/settings/org/+page.svelte', 2],
		['routes/(app)/settings/posting-approvers/+page.svelte', 1],
		['routes/(app)/settings/schedules/+page.svelte', 1],
		['routes/(app)/payroll/pay-codes/+page.svelte', 2],
		['routes/(app)/payroll/salary-grades/+page.svelte', 2],
		['routes/(app)/settings/leave-types/+page.svelte', 1],
		['routes/(app)/settings/job-boards/+page.svelte', 1],
		['routes/(app)/settings/onboarding/+page.svelte', 1],
		['routes/(app)/performance/templates/+page.svelte', 1],
		['routes/(app)/settings/org-chart/+page.svelte', 2]
	]

	it.each(PLAIN_SITES)('%s has card-scroll at least %i times', (file, count) => {
		expect(read(file).split('card-scroll').length - 1, file).toBeGreaterThanOrEqual(count)
	})

	it('employees/[id] and its cards have card-scroll at least 10 times', () => {
		const cards = readdirSync(join(SRC, 'lib/components/employees/detail'))
			.filter((f) => f.endsWith('.svelte'))
			.map((f) => `lib/components/employees/detail/${f}`)
		const source = ['routes/(app)/employees/[id]/+page.svelte', ...cards].map(read).join('\n')
		expect(source.split('card-scroll').length - 1).toBeGreaterThanOrEqual(10)
	})

	it('the 201 file render-caps its long lists', () => {
		expect(read('routes/(app)/employees/[id]/+page.svelte')).toContain('LIST_RENDER_CAP')
		expect(read('lib/components/employees/detail/EmploymentHistoryCard.svelte')).toContain(
			'history.slice(0, LIST_RENDER_CAP)'
		)
	})
})

describe('the dropped sites keep their shape (G14)', () => {
	it.each([
		'routes/(app)/leave/balances/+page.svelte',
		'routes/(app)/settings/roles/+page.svelte',
		'routes/(app)/team/+page.svelte'
	])('%s has no card-scroll', (file) => {
		expect(read(file), file).not.toContain('card-scroll')
	})
})

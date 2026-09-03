import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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

	it.each(PAGINATED)('%s has no literal take and no constant slice', (file) => {
		const source = read(file)
		expect(source.match(/take:\s*\d/g), `${file} gained a literal take`).toBeNull()
		expect(source.match(/\.slice\(0,/g), `${file} gained a constant slice`).toBeNull()
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

	/**
	 * T3. The `/team` members query is reused twice — as `employeeId: { in: members.map(...) }`
	 * for the attendance fetch, and to build `attendanceMap`. Capping members would silently
	 * change which people the matrix has attendance for, which reads as missing data rather than
	 * as a cap. The matrix gets a markup bound only.
	 */
	it('the /team members query is not capped', () => {
		const source = read('routes/(app)/team/+page.server.ts')
		expect(source).toContain('employeeId: { in: members.map((m) => m.id) }')
		expect(source.match(/take:/g), '/team members gained a take').toBeNull()
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
		['routes/(app)/settings/posting-approvers/+page.svelte', '{#each data.employees as e (e.id)}']
	]

	it.each(PICKERS)('%s picker is uncapped', (file, each) => {
		expect(read(file), `${file} — ${each}`).toContain(each)
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

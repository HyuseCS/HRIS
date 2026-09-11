import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UI/UX overhaul phase 05 (§S10) — exactly one success surface per action per page.
 *
 * This repo has shipped the same defect class four times: PR #13 suppressed two toasts without
 * proving the replacement surface still existed (zero surfaces), the owner pass then found the
 * employee offboard reporting TWICE (toast + page banner, F1) and the net-pay override reporting
 * NOTHING at all (F2). One rule: a success is announced once, in one place.
 *
 * Per (page, action) row the gate pins the current, deliberate shape:
 *   - `expectServerSaved` — does the server action return a `saved:` string? That string IS the
 *     toast, so returning one is the toast being wired and omitting one is the toast being off.
 *   - `present` — needles that must still be in the page source. For an inline/banner surface the
 *     needle is the markup it guards, so deleting the banner goes red.
 *   - `absent` — needles that must NOT appear. On a toast-only page that is every success banner
 *     and every <FormFeedback>, so ADDING a second surface goes red too.
 *
 * WHAT THIS GATE DOES NOT PROVE. It is a source scan, exactly like `destructive-confirms.test.ts`.
 * It proves text co-occurs in a file. It does NOT prove a surface mounts, is inside the viewport,
 * is reachable by keyboard, or is read before it dismisses. A green run here is compatible with
 * every one of these surfaces being unreachable. The per-site needles also mean it proves each
 * site still matches ITS DECLARED SHAPE — a site that changes shape correctly will go red and
 * needs its row updated. That is maintenance cost, not a defect.
 *
 * KNOWN GAPS recorded, not fixed, by this gate:
 *   1. `attendance` ?/saveAll and ?/resetAll genuinely report TWICE — a toast plus the per-row
 *      result panel that carries the per-day failure reasons a toast cannot. Declared below as
 *      `documented-double`. Not fixed here: phase 05 plan A forbids touching any attendance file
 *      (AC-P6), and the panel's detail is load-bearing. Owner decision needed.
 *   2. `ConfirmButton` passes no `error` option to `submitFeedback`, so any ConfirmButton failure
 *      toasts AND renders its page's `form?.error` block. Not reachable through the UI on the
 *      pages audited here (the only failure path needs a missing proposal id), so it is recorded
 *      rather than fixed.
 *   3. The `employees/[id]` DONE map is covered by three of its fifteen actions. The other twelve
 *      share the same single banner and the same `{action, success: true}` server shape.
 */

const SRC = join(import.meta.dirname, '../../src')

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

/** Whitespace-insensitive containment: the formatter may wrap a long attribute at any space. */
const flat = (s: string) => s.replace(/\s+/g, ' ')

/** The body of one form action, from its `name: async (` line to the next action's. */
function actionBlock(source: string, name: string): string | null {
	const start = source.search(new RegExp(`\\n\\t${name}: async \\(`))
	if (start === -1) return null
	const rest = source.slice(start + 1)
	const end = rest.search(/\n\t\w+: async \(/)
	return end === -1 ? rest : rest.slice(0, end)
}

const NO_SUCCESS_BANNER = ['kind="success"', '<FormFeedback']

type Row = {
	site: string
	page: string
	server: string
	action: string
	surface: 'toast' | 'inline' | 'documented-double'
	expectServerSaved: boolean
	present: string[]
	absent: string[]
	note?: string
}

const SITES: Row[] = [
	{
		site: 'employees/[id] offboard',
		page: 'routes/(app)/employees/[id]/+page.svelte',
		server: 'routes/(app)/employees/[id]/+page.server.ts',
		action: 'offboard',
		surface: 'inline',
		// F1: the server DOES return a `saved` string, so the toast is off only because the client
		// binding says so. The banner survives the card that offboarding unmounts.
		expectServerSaved: true,
		present: [
			'const offboard = submitFeedback({ error: null, success: null })',
			'{#if form?.action === \'offboard\' && form?.saved} <Banner kind="success" class="lg:col-span-2" message={form.saved} />'
		],
		// Adding offboard to the DONE map would re-create the double from the other direction.
		absent: ["offboard: '"]
	},
	{
		site: 'employees/[id] setSupervisors (DONE map)',
		page: 'routes/(app)/employees/[id]/+page.svelte',
		server: 'routes/(app)/employees/[id]/+page.server.ts',
		action: 'setSupervisors',
		surface: 'inline',
		expectServerSaved: false,
		present: [
			'{#if savedNotice} <Banner kind="success" message={savedNotice} />',
			"setSupervisors: 'Supervisors saved.'",
			'action="?/setSupervisors"'
		],
		absent: ["form?.action === 'setSupervisors' && form?.success"]
	},
	{
		site: 'employees/[id] addLoan (DONE map)',
		page: 'routes/(app)/employees/[id]/+page.svelte',
		server: 'routes/(app)/employees/[id]/+page.server.ts',
		action: 'addLoan',
		surface: 'inline',
		expectServerSaved: false,
		present: [
			'{#if savedNotice} <Banner kind="success" message={savedNotice} />',
			"addLoan: 'Loan added.'",
			'action="?/addLoan"'
		],
		absent: ["form?.action === 'addLoan' && form?.success"]
	},
	{
		site: 'employees/[id] uploadDocument (DONE map)',
		page: 'routes/(app)/employees/[id]/+page.svelte',
		server: 'routes/(app)/employees/[id]/+page.server.ts',
		action: 'uploadDocument',
		surface: 'inline',
		expectServerSaved: false,
		present: [
			'{#if savedNotice} <Banner kind="success" message={savedNotice} />',
			"uploadDocument: 'Document uploaded.'",
			'action="?/uploadDocument"'
		],
		absent: ["form?.action === 'uploadDocument' && form?.success"]
	},
	{
		site: 'payroll/config update',
		page: 'routes/(app)/payroll/config/+page.svelte',
		server: 'routes/(app)/payroll/config/+page.server.ts',
		action: 'update',
		surface: 'inline',
		expectServerSaved: true,
		present: ['<FormFeedback {form} action="update" />', 'use:enhance={saveConfig.enhance}'],
		// The toast is off because the page never imports the toast helper at all.
		absent: ['submitFeedback']
	},
	{
		site: 'payroll/config updateRates',
		page: 'routes/(app)/payroll/config/+page.svelte',
		server: 'routes/(app)/payroll/config/+page.server.ts',
		action: 'updateRates',
		surface: 'inline',
		expectServerSaved: true,
		present: ['<FormFeedback {form} action="updateRates" />', 'use:enhance={saveRates.enhance}'],
		absent: ['submitFeedback']
	},
	{
		site: 'payroll/[id] override',
		page: 'routes/(app)/payroll/[id]/+page.svelte',
		server: 'routes/(app)/payroll/[id]/+page.server.ts',
		action: 'override',
		surface: 'toast',
		// F2: before the fix this action returned neither `action` nor `saved`, so nothing was said.
		expectServerSaved: true,
		present: [
			'action="?/override"',
			'use:enhance={overrideG.enhance}',
			'submitFeedback({ error: null })'
		],
		absent: NO_SUCCESS_BANNER
	},
	{
		site: 'payroll/statutory-rates saveStatutoryRates',
		page: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		server: 'routes/(app)/payroll/statutory-rates/+page.server.ts',
		action: 'saveStatutoryRates',
		surface: 'toast',
		expectServerSaved: true,
		present: [
			"const saveAction = data.canManage ? '?/saveStatutoryRates' : '?/proposeStatutoryRates'",
			'action={saveAction}',
			'use:enhance={saveGuard.enhance}'
		],
		absent: NO_SUCCESS_BANNER
	},
	{
		site: 'payroll/statutory-rates proposeStatutoryRates',
		page: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		server: 'routes/(app)/payroll/statutory-rates/+page.server.ts',
		action: 'proposeStatutoryRates',
		surface: 'toast',
		expectServerSaved: true,
		present: [
			"const saveAction = data.canManage ? '?/saveStatutoryRates' : '?/proposeStatutoryRates'",
			'action={saveAction}',
			'use:enhance={saveGuard.enhance}'
		],
		absent: NO_SUCCESS_BANNER
	},
	{
		site: 'payroll/statutory-rates confirmProposal',
		page: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		server: 'routes/(app)/payroll/statutory-rates/+page.server.ts',
		action: 'confirmProposal',
		surface: 'toast',
		expectServerSaved: true,
		present: ['<ConfirmButton action="?/confirmProposal"'],
		absent: NO_SUCCESS_BANNER
	},
	{
		site: 'payroll/statutory-rates rejectProposal',
		page: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		server: 'routes/(app)/payroll/statutory-rates/+page.server.ts',
		action: 'rejectProposal',
		surface: 'toast',
		expectServerSaved: true,
		present: ['<ConfirmButton action="?/rejectProposal"'],
		absent: NO_SUCCESS_BANNER
	},
	{
		site: 'payroll/periods release',
		page: 'routes/(app)/payroll/periods/+page.svelte',
		server: 'routes/(app)/payroll/periods/+page.server.ts',
		action: 'release',
		surface: 'toast',
		expectServerSaved: true,
		present: ['<ConfirmButton action="?/release"'],
		absent: NO_SUCCESS_BANNER
	},
	{
		site: 'payroll/periods void',
		page: 'routes/(app)/payroll/periods/+page.svelte',
		server: 'routes/(app)/payroll/periods/+page.server.ts',
		action: 'void',
		surface: 'toast',
		expectServerSaved: true,
		present: ['<ConfirmButton action="?/void"'],
		absent: NO_SUCCESS_BANNER
	},
	{
		site: 'settings/roles setActive',
		page: 'routes/(app)/settings/roles/+page.svelte',
		server: 'routes/(app)/settings/roles/+page.server.ts',
		action: 'setActive',
		surface: 'toast',
		expectServerSaved: true,
		// Two triggers (deactivate / re-activate), one action, one surface either way.
		present: ['<ConfirmButton action="?/setActive"'],
		absent: NO_SUCCESS_BANNER
	},
	{
		site: 'separations/[id] finalize',
		page: 'routes/(app)/separations/[id]/+page.svelte',
		server: 'routes/(app)/separations/[id]/+page.server.ts',
		action: 'finalize',
		surface: 'inline',
		// Gates on `form?.finalized`, not on `form.action` — the server returns neither `action` nor
		// `saved`, which is what keeps the toast silent. Do not re-wire this to match the others.
		expectServerSaved: false,
		present: [
			'{#if form?.finalized} <Banner kind="success" message="Separation finalized. The employee is now offboarded and their login is disabled." />'
		],
		absent: []
	},
	{
		site: 'separations/[id] undo',
		page: 'routes/(app)/separations/[id]/+page.svelte',
		server: 'routes/(app)/separations/[id]/+page.server.ts',
		action: 'undo',
		surface: 'inline',
		expectServerSaved: false,
		present: [
			'{#if form?.undone} <Banner kind="success"> Finalization undone. The case is back to {form.status} and the employee\'s login is enabled again. </Banner>'
		],
		absent: []
	},
	{
		site: 'attendance resetDay',
		page: 'routes/(app)/attendance/+page.svelte',
		server: 'routes/(app)/attendance/+page.server.ts',
		action: 'resetDay',
		surface: 'toast',
		expectServerSaved: true,
		present: ['<ConfirmButton action="?/resetDay"'],
		absent: NO_SUCCESS_BANNER
	},
	{
		site: 'attendance saveAll',
		page: 'routes/(app)/attendance/+page.svelte',
		server: 'routes/(app)/attendance/+page.server.ts',
		action: 'saveAll',
		surface: 'documented-double',
		expectServerSaved: true,
		present: [
			'<form method="POST" action="?/saveAll" use:enhance={saveAll.enhance}>',
			'const saveAll = submitFeedback({ inner: clearOkRows })',
			"{#if form && 'results' in form && (form.action === 'saveAll' || form.action === 'resetAll') && form.results}"
		],
		absent: [],
		note: 'Known gap 1 — toast AND per-row result panel. The panel carries per-day failure reasons the toast cannot. Untouched: AC-P6 forbids editing any attendance file in phase 05 plan A.'
	},
	{
		site: 'attendance resetAll',
		page: 'routes/(app)/attendance/+page.svelte',
		server: 'routes/(app)/attendance/+page.server.ts',
		action: 'resetAll',
		surface: 'documented-double',
		expectServerSaved: true,
		present: [
			'<ConfirmButton action="?/resetAll"',
			"{#if form && 'results' in form && (form.action === 'saveAll' || form.action === 'resetAll') && form.results}"
		],
		absent: [],
		note: 'Known gap 1 — same pair as ?/saveAll: toast plus the shared result panel.'
	}
]

describe('S10 — exactly one success surface per action per page', () => {
	for (const row of SITES) {
		it(`${row.site} reports as declared (${row.surface})`, () => {
			const page = flat(read(row.page))
			const block = actionBlock(read(row.server), row.action)

			expect(block, `${row.server} no longer declares the ${row.action} form action`).not.toBeNull()

			expect(
				/\bsaved:/.test(block as string),
				row.expectServerSaved
					? `${row.server} ?/${row.action} must return a \`saved:\` string — that string IS the toast. Returning nothing is the F2 shape: the action reports nothing at all.`
					: `${row.server} ?/${row.action} must NOT return a \`saved:\` string — this site answers on the page, and a \`saved\` string would toast on top of it. That is the F1 double.`
			).toBe(row.expectServerSaved)

			for (const needle of row.present) {
				expect(
					page.includes(flat(needle)),
					`${row.page} lost the surface needle for ${row.site}:\n  ${needle}\nEither the surface was removed (the PR #13 zero-surface defect) or it changed shape — restore it, or update this row and say why in the phase 05 report.`
				).toBe(true)
			}

			for (const needle of row.absent) {
				expect(
					page.includes(flat(needle)),
					`${row.page} grew a SECOND success surface for ${row.site}:\n  ${needle}\nThis site already answers once. Two answers is the F1 double-report defect.`
				).toBe(false)
			}
		})
	}
})

describe('S10 — the gate is not vacuous', () => {
	it('covers every site the phase 05 plan names, and every row was actually read', () => {
		expect(SITES.length).toBeGreaterThanOrEqual(19)

		for (const row of SITES) {
			// A row whose files vanished, or that declares nothing, would pass its own `it()` forever.
			expect(read(row.page).length, `${row.page} is empty`).toBeGreaterThan(1000)
			expect(read(row.server).length, `${row.server} is empty`).toBeGreaterThan(1000)
			expect(row.present.length, `${row.site} declares no needle`).toBeGreaterThan(0)
			for (const needle of [...row.present, ...row.absent])
				expect(needle.trim().length, `${row.site} declares an empty needle`).toBeGreaterThan(3)
		}
	})

	it('holds every documented double to a written reason', () => {
		const doubles = SITES.filter((r) => r.surface === 'documented-double')
		// Exactly the two attendance bulk actions. A third would be a silent exception.
		expect(doubles.map((r) => r.site)).toEqual(['attendance saveAll', 'attendance resetAll'])
		for (const row of doubles) expect(row.note?.length ?? 0).toBeGreaterThan(40)
	})
})

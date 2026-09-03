import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UI/UX overhaul phase 05 (§T3) — the structural destructive-action gates.
 *
 * One rule, sixteen call sites: anything irreversible, money-affecting or person-affecting goes
 * through the kit `ConfirmButton`/`ConfirmDialog` with a message that names the consequence.
 *
 * WHAT THESE GATES DO NOT PROVE. They are source scans. They prove text is present in a file.
 * They do NOT prove a dialog renders, opens on click, traps focus, or that its confirm button
 * submits the form — the repo has no component-interaction harness, so that half of the phase
 * rests on the live spot-check recorded in the phase report. A green run here is compatible with
 * every dialog being unreachable. Read the report, not just this file.
 */

const SRC = join(import.meta.dirname, '../../src')

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

/** Whitespace-insensitive containment: the formatter may wrap a long attribute at any space. */
const flat = (s: string) => s.replace(/\s+/g, ' ')

const sourceFiles = () =>
	readdirSync(SRC, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(ts|svelte)$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name))

// ── G1 — every §T3 action is routed through the kit confirm ───────────────────
// Co-occurrence, not containment: without a parser this proves the file imports the primitive and
// mentions the action, never that THIS action sits inside THAT wrapper. Named in the phase report.
const WIRING: { file: string; actions: string[] }[] = [
	{ file: 'routes/(app)/employees/[id]/+page.svelte', actions: ['?/offboard'] },
	{ file: 'routes/(app)/payroll/periods/+page.svelte', actions: ['?/void', '?/release'] },
	{ file: 'routes/(app)/payroll/[id]/+page.svelte', actions: ['?/override'] },
	{ file: 'routes/(app)/payroll/config/+page.svelte', actions: ['?/updateRates'] },
	{
		file: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		actions: [
			'?/confirmProposal',
			'?/rejectProposal',
			'?/saveStatutoryRates',
			'?/proposeStatutoryRates'
		]
	},
	{ file: 'routes/(app)/performance/reviews/[id]/+page.svelte', actions: ['?/release'] },
	{ file: 'routes/(app)/settings/roles/+page.svelte', actions: ['?/setActive'] },
	{ file: 'routes/(app)/separations/[id]/+page.svelte', actions: ['?/finalize', '?/undo'] },
	// Phase 07 §S5 split the attendance page by persona: both `?/resetDay` render sites moved with
	// the correction grid into this component. The route file no longer carries a confirm.
	{ file: 'lib/components/attendance/AttendanceHrGrid.svelte', actions: ['?/resetDay'] }
]

describe('G1 — every §T3 destructive action is routed through the kit confirm', () => {
	for (const { file, actions } of WIRING) {
		it(`${file} imports the kit confirm and carries ${actions.join(', ')}`, () => {
			const source = read(file)

			expect(
				/import\s+Confirm(?:Button|Dialog)\s+from\s+'\$lib\/components\/ui\/Confirm(?:Button|Dialog)\.svelte'/.test(
					source
				),
				`${file} must import ConfirmButton or ConfirmDialog — §T3 requires a confirm before every irreversible action`
			).toBe(true)

			for (const action of actions) {
				expect(
					// Single-quoted too: the statutory save action is picked in the script block.
					source.includes(`"${action}"`) || source.includes(`'${action}'`),
					`${file} must still carry the ${action} form action`
				).toBe(true)
			}
		})
	}

	it('the statutory proposal Confirm/Reject pair is ConfirmButton-wrapped (the last #108 gap)', () => {
		const source = flat(read('routes/(app)/payroll/statutory-rates/+page.svelte'))
		for (const action of ['?/confirmProposal', '?/rejectProposal']) {
			expect(
				new RegExp(`<ConfirmButton action="\\${action}"`).test(source),
				`${action} must be wrapped in ConfirmButton — its busy state is that form's single-submit guard`
			).toBe(true)
		}
	})
})

// ── G2 — zero native confirm() calls remain in src/ ───────────────────────────
// Comments are stripped first: `submit-guard.svelte.ts` explains the cancel seam using the words
// `confirm()` and must not trip the gate. A `function confirm()` DECLARATION (ConfirmDialog,
// ReasonDialog) is a local handler, not the browser's blocking dialog. `beforeunload` is the one
// native prompt a browser gives no alternative to.
const stripComments = (source: string) =>
	source
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/(^|[^:])\/\/.*$/gm, '$1')

const NATIVE_CONFIRM = /(?<!function\s)(?<![\w.$])confirm\s*\(/

describe('G2 — no native confirm() calls in src/', () => {
	it('finds zero, excluding function declarations and beforeunload', () => {
		const offenders: string[] = []

		for (const path of sourceFiles()) {
			const lines = stripComments(readFileSync(path, 'utf8')).split('\n')
			lines.forEach((line, i) => {
				if (!NATIVE_CONFIRM.test(line)) return
				if (/function\s+confirm\s*\(/.test(line)) return
				if (/beforeunload/i.test(line)) return
				offenders.push(`${path.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`)
			})
		}

		expect(
			offenders,
			`native confirm() is banned in src/ — use ConfirmButton/ConfirmDialog:\n${offenders.join('\n')}`
		).toEqual([])
	})

	it('is not blind: the scan reaches every source file', () => {
		// Non-vacuity. A glob that matched nothing would pass the assertion above forever.
		expect(sourceFiles().length).toBeGreaterThan(100)
	})
})

// ── G3 — the consequence-naming copy survives a later softening edit ──────────
// One exact NON-interpolated substring per drafted message. 17 messages across 16 sites: site 9
// has two (manage / approval paths) and site 14 has a base plus its conditional clause.
const COPY: { site: string; file: string; needle: string }[] = [
	{
		site: '1 offboard',
		file: 'routes/(app)/employees/[id]/+page.svelte',
		needle: 'they stop appearing in active-employee lists and payroll runs'
	},
	{
		site: '2 period void',
		file: 'routes/(app)/payroll/periods/+page.svelte',
		needle: 'amortization it collected is credited back to the employees'
	},
	{
		site: '3 period release',
		file: 'routes/(app)/payroll/periods/+page.svelte',
		needle: 'the only way back is to void the period'
	},
	{
		site: '4 run void (verify-only, the model message)',
		file: 'routes/(app)/payroll/+page.svelte',
		needle: 'the same exact period cannot be created again'
	},
	{
		site: '5 net-pay override',
		file: 'routes/(app)/payroll/[id]/+page.svelte',
		needle: 'the computed amount is replaced, not adjusted'
	},
	{
		site: '6 DOLE multipliers',
		file: 'routes/(app)/payroll/config/+page.svelte',
		needle:
			'These multipliers set overtime, night differential, rest-day and holiday pay for every payroll run from now on'
	},
	{
		site: '7 statutory proposal confirm',
		file: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		needle: 'These rates become the live tax and contribution tables for the whole organization'
	},
	{
		site: '8 statutory proposal reject',
		file: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		needle: 'there is no draft to return to'
	},
	{
		site: '9a statutory save (manage path)',
		file: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		needle: 'These become the live tax and contribution tables for the whole organization'
	},
	{
		site: '9b statutory submit (approval path)',
		file: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		needle: 'Nothing changes for payroll until it is approved'
	},
	{
		site: '10 statutory dirty guard',
		file: 'routes/(app)/payroll/statutory-rates/+page.svelte',
		needle: 'Leaving now discards them'
	},
	{
		site: '11 release review',
		file: 'routes/(app)/performance/reviews/[id]/+page.svelte',
		needle: 'once they can see it, they have seen it'
	},
	{
		site: '12 deactivate login',
		file: 'routes/(app)/settings/roles/+page.svelte',
		needle: 'Their employee record, payroll history and documents are untouched'
	},
	{
		site: '13 separation finalize',
		file: 'routes/(app)/separations/[id]/+page.svelte',
		needle: 'This snapshots final pay, offboards the employee, and disables their login'
	},
	{
		site: '14 separation undo (base)',
		file: 'routes/(app)/separations/[id]/+page.svelte',
		needle: 'puts the employee back to their previous employment status, and RE-ENABLES their login'
	},
	{
		site: '14 separation undo (re-open clause)',
		file: 'routes/(app)/separations/[id]/+page.svelte',
		needle: 'the case returns to OPEN and every item goes back to pending'
	},
	{
		site: '15 attendance reset',
		// Phase 07 §S5: moved with the correction grid — see the WIRING note above.
		file: 'lib/components/attendance/AttendanceHrGrid.svelte',
		needle: 'thrown away and re-derived from the raw punches'
	}
]

describe('G3 — every confirm message still names its consequence', () => {
	it('covers all 17 drafted messages', () => {
		expect(COPY.length).toBe(17)
	})

	for (const { site, file, needle } of COPY) {
		it(`site ${site} still says "${needle}"`, () => {
			expect(
				flat(read(file)).includes(flat(needle)),
				`${file} lost the consequence-naming copy for site ${site}. Softening a destructive message is the regression this gate exists to catch — restore the wording or update the phase 05 plan first.`
			).toBe(true)
		})
	}
})

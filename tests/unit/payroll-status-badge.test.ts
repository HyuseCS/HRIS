import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { badgeFor, toneFor } from '$lib/components/ui/badge'
import { PAYROLL_RUN_STATUS_LABELS } from '$lib/labels'

/**
 * UI/UX overhaul phase 06 (§T5) — a payroll run's status must read the same colour wherever it is
 * shown. It did not: the list page carried a 4-way map while the detail page carried a 2-way
 * expression, so a VOIDED run was red in the list and blue on its own page.
 *
 * Phase 03 already routed both call sites through the shared `Badge`, which resolves tone in
 * `badge.ts`. This pins the run's four-way contract on that one helper so no later phase can fork
 * it back apart — the contract is APPROVED→green, COMPUTED→blue, VOIDED→red, DRAFT→gray.
 */

const RUN_TONES = {
	APPROVED: 'green',
	COMPUTED: 'blue',
	VOIDED: 'red',
	DRAFT: 'gray'
} as const

describe('payroll run status badge', () => {
	it('maps all four run statuses to the list page original tones', () => {
		for (const [status, tone] of Object.entries(RUN_TONES)) {
			expect(toneFor(status, 'payrollRun')).toBe(tone)
		}
	})

	it('covers every PayrollRunStatus the schema defines', () => {
		expect(Object.keys(RUN_TONES).sort()).toEqual(Object.keys(PAYROLL_RUN_STATUS_LABELS).sort())
	})

	it('labels a run status from the shared label map', () => {
		expect(badgeFor('VOIDED', { domain: 'payrollRun' })).toEqual({ tone: 'red', label: 'Voided' })
	})
})

// ── Both call sites consume the helper ────────────────────────────────────────
// A source scan, not a render: it proves no page-local run-status colour expression survived. It
// does NOT prove the badge renders — the repo has no component harness (see badge-tone.test.ts).
const SRC = join(import.meta.dirname, '../../src')
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

describe('payroll pages hold no local run-status colour map', () => {
	for (const file of [
		'routes/(app)/payroll/+page.svelte',
		'routes/(app)/payroll/[id]/+page.svelte'
	])
		it(`${file} renders the run status through the shared Badge`, () => {
			const source = read(file)
			expect(source).toContain('<Badge status={run.status} domain="payrollRun" />')
			expect(source).not.toMatch(/badge-(green|blue|red|gray|yellow)/)
		})
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UI/UX overhaul phase 05 remediation A (§S3) — the payroll-config multiplier form.
 *
 * WHAT THIS GATE DOES NOT PROVE. It is a source scan. It proves the enhance callback asks for
 * `reset: false`; it does NOT prove the six inputs keep their values in a browser, because the
 * repo has no component-interaction harness. The live pass recorded in the phase report is the
 * only proof of the rendered behaviour.
 */

const PAGE = join(import.meta.dirname, '../../src/routes/(app)/payroll/config/+page.svelte')

const flat = (s: string) => s.replace(/\s+/g, ' ')

describe('payroll config multiplier form', () => {
	it('should not let a native form reset blank the six bound multiplier inputs', () => {
		const source = readFileSync(PAGE, 'utf8')
		const guard = source.match(/const saveRates = createSubmitGuard\([\s\S]*?\n\t\}\)/)?.[0]

		expect(guard, 'saveRates guard not found — re-anchor this gate').toBeTruthy()
		expect(flat(guard!)).toContain('await update({ reset: false })')
	})
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UI/UX overhaul phase 05 remediation A (§S3, §S4) — the payroll-config forms.
 *
 * WHAT THESE GATES DO NOT PROVE. They are source scans. They prove the enhance callback asks for
 * `reset: false`, and that each card carries its own action-gated feedback slot with its own
 * server string. They do NOT prove the six inputs keep their values in a browser, that a banner
 * renders, or how far it sits from the button that caused it — the repo has no
 * component-interaction harness. The live pass recorded in the phase report is the only proof of
 * the rendered behaviour.
 */

const ROUTE = join(import.meta.dirname, '../../src/routes/(app)/payroll/config')
const PAGE = join(ROUTE, '+page.svelte')
const SERVER = join(ROUTE, '+page.server.ts')

const flat = (s: string) => s.replace(/\s+/g, ' ')

describe('payroll config multiplier form', () => {
	it('should not let a native form reset blank the six bound multiplier inputs', () => {
		const source = readFileSync(PAGE, 'utf8')
		const guard = source.match(/const saveRates = createSubmitGuard\([\s\S]*?\n\t\}\)/)?.[0]

		expect(guard, 'saveRates guard not found — re-anchor this gate').toBeTruthy()
		expect(flat(guard!)).toContain('await update({ reset: false })')
	})
})

describe('payroll config feedback', () => {
	const page = () => flat(readFileSync(PAGE, 'utf8'))

	it('should give each card its own feedback slot, gated on its own action', () => {
		const source = page()

		expect(source).toContain('<FormFeedback {form} action="update" />')
		expect(source).toContain('<FormFeedback {form} action="updateRates" />')
	})

	it('should keep each feedback slot in the same row as the button it answers for', () => {
		const source = page()

		for (const [action, label] of [
			['update', 'Save Configuration'],
			['updateRates', 'Save Multipliers']
		]) {
			const slot = source.indexOf(`<FormFeedback {form} action="${action}" />`)
			const button = source.indexOf(label, slot)

			expect(slot, `no ${action} slot`).toBeGreaterThan(-1)
			expect(button, `no ${label} button after the ${action} slot`).toBeGreaterThan(slot)
			expect(source.slice(slot, button)).not.toContain('</div>')
		}
	})

	it('should not leave a page-level banner answering for both actions', () => {
		expect(page()).not.toContain('Payroll configuration saved successfully.')
	})

	it('should return a distinct message per action from the server', () => {
		const server = flat(readFileSync(SERVER, 'utf8'))

		expect(server).toContain("return { action: 'update', saved: 'Payroll configuration saved.' }")
		expect(server).toContain("return { action: 'updateRates', saved: 'Multipliers saved.' }")
		expect(server).not.toContain('return { success: true }')
	})
})

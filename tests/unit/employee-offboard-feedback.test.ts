import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * F1. Confirming an offboard reported `Employee offboarded.` twice at once — the page Banner AND a
 * success toast. The toast is the surface that goes: a successful offboard flips employmentStatus
 * to OFFBOARDED, which unmounts the card holding the button, so the Banner is deliberately
 * rendered outside that block and is the only surface that survives the action.
 *
 * This is a source sweep, not a render test. It pins the whole shape, because suppressing a toast
 * is only safe while its replacement surface exists: the binding that stays silent, the Banner
 * that answers instead, the Banner sitting outside the dying block, and the server action still
 * returning the `saved` string the Banner prints. Drop any one of those and the offboard reports
 * nowhere at all.
 */

const dir = resolve(__dirname, '../../src/routes/(app)/employees/[id]')
const server = readFileSync(resolve(dir, '+page.server.ts'), 'utf8')
const template = readFileSync(resolve(dir, '+page.svelte'), 'utf8')

describe('employees/[id] offboard feedback (F1)', () => {
	it('finds the page’s submitFeedback bindings at all — the sweep is not scanning an empty set', () => {
		const bindings = [...template.matchAll(/const \w+ = submitFeedback\(/g)]
		expect(bindings.length).toBeGreaterThanOrEqual(20)
	})

	it('silences the offboard toast, and only that one', () => {
		expect(template).toContain('const offboard = submitFeedback({ error: null, success: null })')
		const silenced = [
			...template.matchAll(/const (\w+) = submitFeedback\([^)]*success: null[^)]*\)/g)
		]
		expect(silenced.map((m) => m[1])).toEqual(['offboard'])
	})

	it('keeps the Banner that reports the offboard instead', () => {
		expect(template).toMatch(
			/\{#if form\?\.action === 'offboard' && form\?\.saved\}\s*<Banner kind="success"/
		)
	})

	it('keeps that Banner outside every block the offboard unmounts', () => {
		const banner = template.indexOf("{#if form?.action === 'offboard' && form?.saved}")
		expect(banner).toBeGreaterThan(-1)

		const dying = [
			...template.matchAll(/\{#if canManage && employee\.employmentStatus === 'ACTIVE'\}/g)
		].map((m) => m.index!)
		expect(dying.length).toBeGreaterThan(0)

		for (const start of dying) {
			let depth = 0
			let end = template.length
			for (const tag of template.slice(start).matchAll(/\{[#/](?:if|each|await|key|snippet)/g)) {
				depth += tag[0][1] === '#' ? 1 : -1
				if (depth === 0) {
					end = start + tag.index!
					break
				}
			}
			expect(banner < start || banner > end).toBe(true)
		}
	})

	it('keeps the server returning the string that Banner prints', () => {
		expect(server).toContain("return { action, saved: 'Employee offboarded.' }")
	})
})

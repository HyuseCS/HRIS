import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * P0-7. `employees/[id]` has 21 form actions and used to carry ONE ungated `{#if form?.error}`
 * slot — inside the Update Profile card, which is itself gated on `canManage && status ===
 * 'ACTIVE'`. So for an OFFBOARDED employee, a failed document upload, loan add or contact delete
 * rendered nowhere at all: the action failed and the page said nothing.
 *
 * This is a source sweep, not a render test. It reads the two files and asserts that every action
 * which can return a `fail()` has its name in a scoped slot. A render test would need a DOM and
 * would only cover the one card it drove; the whole defect was about the cards nobody drove.
 *
 * It is also the tripwire for phase 07, which splits this page into tabs — moving a card without
 * its slot puts the defect straight back.
 */

const dir = resolve(__dirname, '../../src/routes/(app)/employees/[id]')
const server = readFileSync(resolve(dir, '+page.server.ts'), 'utf8')
const template = readFileSync(resolve(dir, '+page.svelte'), 'utf8')

/** Every `name: async (...)` at the top level of the `actions` object. */
const actionNames = [...server.matchAll(/^\t([a-zA-Z]+): async/gm)].map((m) => m[1])

/** Actions that can hand the template an error string at all. */
function canFail(name: string): boolean {
	const start = server.indexOf(`\t${name}: async`)
	const rest = server.slice(start + 1)
	const next = rest.search(/^\t[a-zA-Z]+: async/m)
	const body = next === -1 ? rest : rest.slice(0, next)
	return body.includes('fail(')
}

/** Action names named by a scoped slot — either the shared snippet or a hand-written `{#if}`. */
const slotted = new Set([
	...[...template.matchAll(/actionError\(\[([^\]]*)\]\)/gs)].flatMap((m) =>
		[...m[1].matchAll(/'([a-zA-Z]+)'/g)].map((x) => x[1])
	),
	...[...template.matchAll(/form\?\.action === '([a-zA-Z]+)'/g)].map((m) => m[1])
])

describe('employees/[id] error slots (P0-7)', () => {
	it('finds the page’s actions at all — the sweep is not scanning an empty set', () => {
		// Without this the two assertions below would both pass on a parser that matched nothing.
		expect(actionNames.length).toBeGreaterThanOrEqual(20)
		expect(actionNames).toContain('addLoan')
		expect(actionNames).toContain('uploadDocument')
	})

	it('gives every failable action its own scoped error slot', () => {
		const failable = actionNames.filter(canFail)
		expect(failable.length).toBeGreaterThanOrEqual(20)
		expect(failable.filter((name) => !slotted.has(name))).toEqual([])
	})

	it('keeps the only ungated error slot off the page', () => {
		// The original defect in one line: an unscoped block paints EVERY action's failure into
		// whichever card happens to hold it.
		const ungated = [...template.matchAll(/\{#if form\?\.error\}/g)]
		expect(ungated).toHaveLength(0)
	})
})

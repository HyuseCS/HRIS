import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

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
const moduleDir = resolve(__dirname, '../../src/lib/server/employee-detail')
const cardDir = resolve(__dirname, '../../src/lib/components/employees/detail')
const filesIn = (folder: string, ext: string) =>
	readdirSync(folder)
		.filter((f) => f.endsWith(ext))
		.sort()
		.map((f) => resolve(folder, f))
const read = (path: string) => readFileSync(path, 'utf8')

const servers = [resolve(dir, '+page.server.ts'), ...filesIn(moduleDir, '.ts')].map(read)
const page = read(resolve(dir, '+page.svelte'))
const cards = filesIn(cardDir, '.svelte')
const templates = [page, ...cards.map(read)]

/** Every `name: async (...)` at the top level of the `actions` object. */
const actionNames = servers.flatMap((server) =>
	[...server.matchAll(/^\t([a-zA-Z]+): async/gm)].map((m) => m[1])
)

/** Actions that can hand the template an error string at all. */
function canFail(name: string): boolean {
	const server = servers.find((s) => s.includes(`\t${name}: async`))!
	const start = server.indexOf(`\t${name}: async`)
	const rest = server.slice(start + 1)
	const next = rest.search(/^\t[a-zA-Z]+: async/m)
	const body = next === -1 ? rest : rest.slice(0, next)
	return body.includes('fail(')
}

/** Action names named by a scoped slot — either the shared snippet or a hand-written `{#if}`. */
const slotted = new Set(
	templates.flatMap((template) => [
		...[...template.matchAll(/actionError\(\[([^\]]*)\]\)/gs)].flatMap((m) =>
			[...m[1].matchAll(/'([a-zA-Z]+)'/g)].map((x) => x[1])
		),
		...[...template.matchAll(/form\?\.action === '([a-zA-Z]+)'/g)].map((m) => m[1])
	])
)

describe('employees/[id] error slots (P0-7)', () => {
	it('finds the page’s actions at all — the sweep is not scanning an empty set', () => {
		// Without this the two assertions below would both pass on a parser that matched nothing.
		expect(actionNames.length).toBeGreaterThanOrEqual(20)
		expect(actionNames).toContain('addLoan')
		expect(actionNames).toContain('uploadDocument')
		expect(new Set(actionNames).size).toBe(actionNames.length)
	})

	it('gives every failable action its own scoped error slot', () => {
		const failable = actionNames.filter(canFail)
		expect(failable.length).toBeGreaterThanOrEqual(20)
		expect(failable.filter((name) => !slotted.has(name))).toEqual([])
	})

	it('keeps the only ungated error slot off the page', () => {
		// The original defect in one line: an unscoped block paints EVERY action's failure into
		// whichever card happens to hold it.
		const ungated = templates.flatMap((template) => [
			...template.matchAll(/\{#if form\?\.error\}/g)
		])
		expect(ungated).toHaveLength(0)
	})

	it('every detail card is imported and rendered by the page', () => {
		expect(cards.length).toBe(17)
		for (const file of cards) {
			const name = basename(file, '.svelte')
			expect(page, `${name} is not imported by the page`).toContain(
				`import ${name} from '$lib/components/employees/detail/${name}.svelte'`
			)
			expect(page, `${name} is not rendered by the page`).toMatch(
				new RegExp('<' + name + '[\\s/>]')
			)
		}
	})
})

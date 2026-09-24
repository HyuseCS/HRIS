import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dirname, '../../src')

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

const svelteFiles = (readdirSync(SRC, { recursive: true }) as string[])
	.filter((f) => f.endsWith('.svelte'))
	.map((f) => f.split('\\').join('/'))

const EXCLUDED = new Set(['lib/components/ui/Banner.svelte'])

const EXPECTED: Record<string, number> = {
	'lib/components/ui/FormFeedback.svelte': 2
}

const BOTH_ACTIONS = 0

const STAYS: [string, string][] = [
	['lib/components/ui/FormFeedback.svelte', 'mine?.notice'],
	['lib/components/employees/detail/ChangeSalaryCard.svelte', 'notice'],
	['lib/components/employees/detail/PromoteCard.svelte', 'notice'],
	[
		'lib/components/attendance/AttendanceHrGrid.svelte',
		"form.action === 'saveAll' || form.action === 'resetAll'"
	],
	['routes/(auth)/login/+page.svelte', 'form?.error || data.accountDisabled'],
	['routes/(app)/recruitment/[id]/+page.svelte', '{#if stillLive'],
	['routes/(app)/performance/templates/[id]/+page.svelte', '{#if data.structureError'],
	['routes/(app)/performance/templates/[id]/+page.svelte', '{#if data.openReviewCount'],
	['routes/(app)/performance/templates/+page.svelte', '{#if data.backfillCount'],
	['routes/(app)/performance/+page.svelte', '{#if data.templateBackfill'],
	['routes/(app)/requests/+page.svelte', 'notice'],
	['routes/(app)/requests/[id]/+page.svelte', '{#if data.actBlockedReason'],
	['routes/(app)/separations/[id]/+page.svelte', '{#if data.partiallyRestored'],
	['routes/(app)/settings/backup/+page.svelte', '{#if neverRan']
]

const countTokens = (source: string) =>
	source
		.split('\n')
		.filter((line) => !/^\s*import\b/.test(line))
		.join('\n')
		.match(/\bautoDismiss\b/g)?.length ?? 0

const countAll = (re: RegExp) =>
	svelteFiles.reduce((n, f) => n + (read(f).match(re)?.length ?? 0), 0)

describe('#42 action-result banners close by themselves', () => {
	it('Test 1: every autoDismiss site is expected, with the exact count', () => {
		const actual: Record<string, number> = {}
		for (const f of svelteFiles) {
			if (EXCLUDED.has(f)) continue
			const n = countTokens(read(f))
			if (n > 0) actual[f] = n
		}
		expect(actual).toEqual(EXPECTED)
	})

	it('Test 2: STAYS anchors carry no autoDismiss up to the first {: or {/', () => {
		expect(countTokens(read('lib/components/ui/LoadError.svelte'))).toBe(0)
		for (const [file, anchor] of STAYS) {
			const source = read(file)
			const at = source.indexOf(anchor)
			expect(at, `${file}: ${anchor}`).toBeGreaterThan(-1)
			const rest = source.slice(at)
			const ends = ['{:', '{/if}', '{/snippet}'].map((m) => rest.indexOf(m)).filter((i) => i > -1)
			const slice = rest.slice(0, ends.length ? Math.min(...ends) : undefined)
			expect(slice, `${file}: ${anchor}`).not.toMatch(/\bautoDismiss\b/)
		}
	})

	it('Test 3: use:autoDismiss comes before use:scrollToError on the same element', () => {
		expect(countAll(/use:scrollToError[^>]*use:autoDismiss/g)).toBe(0)
		expect(countAll(/use:autoDismiss[^>]*use:scrollToError/g)).toBe(BOTH_ACTIONS)
	})

	it('Test 4: Banner is opt-in and wires the action', () => {
		const banner = read('lib/components/ui/Banner.svelte')
		expect(banner).toContain('autoDismiss: dismiss = false')
		expect(banner).toContain('use:autoDismiss={dismiss}')
	})
})

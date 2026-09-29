import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dirname, '../../src')
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

const SITES: { file: string; anchor: string; count: number }[] = [
	{
		file: 'lib/components/attendance/AttendanceHrGrid.svelte',
		anchor: 'rounded-lg border bg-card lg:card-scroll',
		count: 1
	},
	{
		file: 'routes/(app)/leave/balances/+page.svelte',
		anchor: 'min-h-0 flex-1 overflow-x-auto',
		count: 1
	},
	{ file: 'routes/(app)/settings/roles/+page.svelte', anchor: 'overflow-x-auto', count: 1 },
	{ file: 'routes/(app)/performance/+page.svelte', anchor: 'overflow-x-auto', count: 2 },
	{
		file: 'lib/components/attendance/TeamMatrix.svelte',
		anchor: 'min-h-0 flex-1 overflow-auto',
		count: 1
	}
]

const wrappers = (source: string) =>
	[
		...source.matchAll(
			/<div\s+class="([^"]*phone-scroll[^"]*)"\s*>\s*<table[^>]*>\s*<thead\s+class="([^"]*)"/g
		)
	].map((m) => ({ wrapper: m[1], thead: m[2] }))

describe('phone-scroll utility', () => {
	it('caps the box below lg at the viewport minus the mobile top bar', () => {
		const css = read('app.css')
		const rule = css.match(/\.phone-scroll\s*\{([^}]*)\}/)
		expect(rule).not.toBeNull()
		expect(rule![1]).toContain('max-lg:max-h-[calc(100dvh-3.5rem)]')
		expect(rule![1]).toContain('max-lg:overflow-y-auto')
	})
})

describe('tables keep their header pinned below lg', () => {
	for (const { file, anchor, count } of SITES) {
		it(`${file}: ${count} wrapper(s) carry phone-scroll with a sticky opaque thead`, () => {
			const found = wrappers(read(file))
			expect(found).toHaveLength(count)
			for (const { wrapper, thead } of found) {
				expect(wrapper.split(' ')).toContain('phone-scroll')
				expect(wrapper).toContain(anchor)
				const classes = thead.split(' ')
				expect(classes).toContain('sticky')
				expect(classes).toContain('top-0')
				expect(classes).toContain('bg-card')
				expect(classes).not.toContain('bg-muted/50')
				expect(classes.some((c) => /^z-\d+$/.test(c))).toBe(true)
			}
		})
	}

	it('the attendance range table is also bounded at lg', () => {
		const [range] = wrappers(read('lib/components/attendance/AttendanceHrGrid.svelte'))
		expect(range.wrapper.split(' ')).toContain('lg:card-scroll')
	})
})

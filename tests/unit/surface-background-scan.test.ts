import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const SMALL_TAGS = new Set([
	'button',
	'a',
	'span',
	'input',
	'select',
	'textarea',
	'summary',
	'kbd',
	'code',
	'img'
])
const ROUNDED = /^rounded(-(sm|md|lg|xl|2xl|3xl))?$/
const GREY = /^bg-(muted|background|accent|secondary)(\/\S+)?$/
const EXEMPT = ['border-dashed', 'border-input', 'border-destructive']

type Site = { tag: string; cls: string; anchor: string }

function classAttrs(src: string): Site[] {
	const sites: Site[] = []
	const re = /\bclass="/g
	let m: RegExpExecArray | null
	while ((m = re.exec(src))) {
		let i = m.index + m[0].length
		let depth = 0
		let cls = ''
		while (i < src.length) {
			const c = src[i]
			if (c === '{') depth++
			if (c === '}') depth--
			if (c === '"' && depth === 0) break
			cls += c
			i++
		}
		const lt = src.lastIndexOf('<', m.index)
		const tag = src.slice(lt + 1).match(/^([a-zA-Z][\w:-]*)/)?.[1] ?? '?'
		const anchor = cls.split('{')[0].replace(/\s+/g, ' ').trim()
		sites.push({ tag, cls, anchor })
	}
	return sites
}

function isFlagged({ tag, cls }: Pick<Site, 'tag' | 'cls'>): boolean {
	const tokens = cls
		.replace(/[{}?:'`()]/g, ' ')
		.split(/\s+/)
		.filter(Boolean)
	if (!tokens.includes('border')) return false
	if (!tokens.some((t) => ROUNDED.test(t))) return false
	if (SMALL_TAGS.has(tag.toLowerCase())) return false
	if (tokens.some((t) => EXEMPT.includes(t))) return false
	if (!tokens.some((t) => t.startsWith('bg-'))) return true
	return !tokens.includes('bg-card') && tokens.some((t) => GREY.test(t))
}

const flagSource = (src: string) => classAttrs(src).filter(isFlagged)

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) walk(path, out)
		else if (path.endsWith('.svelte')) out.push(path)
	}
	return out
}

const CARVE_OUTS: { file: string; anchor: string; count: number; why: string }[] = [
	{
		file: 'src/lib/components/attendance/AttendanceHrGrid.svelte',
		anchor: 'inline-flex max-w-full flex-wrap rounded-lg border p-1 text-sm',
		count: 2,
		why: 'segmented control'
	},
	{
		file: 'src/lib/components/attendance/AttendanceHrGrid.svelte',
		anchor: 'rounded-md border px-3 py-2 text-sm',
		count: 1,
		why: 'status tint'
	},
	{
		file: 'src/lib/components/payroll/CalculatorWindow.svelte',
		anchor:
			'fixed z-50 flex max-h-[90vh] max-w-[90vw] flex-col overflow-hidden rounded-lg border bg-background shadow-xl',
		count: 1,
		why: 'floating window'
	},
	{
		file: 'src/lib/components/timesheets/PunchMapDialog.svelte',
		anchor: 'mt-3 h-72 w-full overflow-hidden rounded-md border border-border bg-muted',
		count: 1,
		why: 'map frame'
	},
	{
		file: 'src/lib/components/ui/PeriodPicker.svelte',
		anchor: 'flex min-h-9 w-fit flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1',
		count: 1,
		why: 'segmented control'
	},
	{
		file: 'src/lib/components/ui/Toaster.svelte',
		anchor:
			'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg',
		count: 1,
		why: 'toast'
	},
	{
		file: 'src/routes/(app)/dashboard/+page.svelte',
		anchor: 'flex items-start gap-3 rounded-lg border p-3 transition-colors',
		count: 1,
		why: 'read/unread status tint'
	},
	{
		file: 'src/routes/(app)/inventory/+page.svelte',
		anchor: 'inline-flex rounded-md border p-0.5',
		count: 1,
		why: 'segmented control'
	},
	{
		file: 'src/routes/(app)/recruitment/[id]/+page.svelte',
		anchor: 'flex min-h-[11rem] flex-col gap-2 rounded-lg border bg-muted p-3',
		count: 1,
		why: 'kanban column'
	},
	{
		file: 'src/routes/(app)/reports/[type]/+page.svelte',
		anchor:
			'flex h-40 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground',
		count: 1,
		why: 'grey empty-state box'
	},
	{
		file: 'src/routes/(app)/requests/[id]/+page.svelte',
		anchor: 'rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground',
		count: 1,
		why: 'callout note'
	},
	{
		file: 'src/routes/(app)/settings/roles/+page.svelte',
		anchor:
			'flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground',
		count: 1,
		why: 'callout note'
	},
	{
		file: 'src/routes/(app)/team/+page.svelte',
		anchor: 'inline-flex rounded-md border p-0.5',
		count: 1,
		why: 'segmented control'
	}
]

const repoFlagged = [
	...walk(join(ROOT, 'src/routes')),
	...walk(join(ROOT, 'src/lib/components'))
].flatMap((path) =>
	flagSource(readFileSync(path, 'utf8')).map((site) => ({
		file: relative(ROOT, path),
		...site
	}))
)

describe('surface background scan', () => {
	it.each([
		'<div class="rounded-lg border p-4">',
		'<div class="rounded-md border bg-muted/50 p-4">',
		`<label class="rounded-lg border px-3 {on ? 'a' : 'b'}">`
	])('flags %s', (src) => {
		expect(flagSource(src)).toHaveLength(1)
	})

	it.each([
		'<div class="rounded-lg border bg-card p-4">',
		'<p class="rounded-lg border border-dashed p-8">',
		'<button class="rounded-md border">',
		'<img src={logo} alt="" class="mt-2 h-12 w-auto rounded border object-contain" />'
	])('spares %s', (src) => {
		expect(flagSource(src)).toHaveLength(0)
	})

	it('repo has no bordered box without a card surface outside the carve-outs', () => {
		const uncovered = repoFlagged
			.filter((s) => !CARVE_OUTS.some((c) => c.file === s.file && c.anchor === s.anchor))
			.map((s) => `${s.file}: ${s.cls.replace(/\s+/g, ' ').trim()}`)
		expect(uncovered).toEqual([])
	})

	it.each(CARVE_OUTS)('carve-out $file "$anchor" matches exactly $count flagged sites', (c) => {
		const matched = repoFlagged.filter((s) => s.file === c.file && s.anchor === c.anchor)
		expect(matched).toHaveLength(c.count)
	})
})

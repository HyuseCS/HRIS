import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const header = readFileSync('src/lib/components/ui/PageHeader.svelte', 'utf8')

function sourceFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) sourceFiles(path, out)
		else if (entry.endsWith('.svelte')) out.push(path)
	}
	return out
}

describe('PageHeader renders its description as a HelpTip', () => {
	it('carries no standalone description paragraph', () => {
		expect(header).not.toMatch(/<p[^>]*>\s*\{description\}/)
	})

	it('renders exactly one HelpTip, named from the title, guarded by description', () => {
		expect(header).toMatch(/\{#if description\}\s*<HelpTip label=\{`About \$\{title\}`\}>/)
		expect(header.match(/<HelpTip/g)).toHaveLength(1)
	})

	it('renders the description whether it is a string or a snippet', () => {
		expect(header).toMatch(
			/\{#if typeof description === 'function'\}\{@render description\(\)\}\{:else\}\{description\}\{\/if\}/
		)
		expect(header.slice(header.indexOf('let {'), header.indexOf('} = $props()'))).toContain(
			'description?: string | Snippet'
		)
	})

	it('lets the tooltip content take pointer events, so a description link stays clickable', () => {
		const tip = header.slice(header.indexOf('<HelpTip'), header.indexOf('</HelpTip>'))
		expect(tip).toMatch(/class="[^"]*\bpointer-events-auto\b/)
	})

	it('keeps the HelpTip inside the only relative ancestor it can anchor to', () => {
		const clusterStart = header.indexOf('<div class="relative')
		expect(clusterStart).toBeGreaterThan(-1)
		const cluster = header.slice(clusterStart, header.indexOf('</div>', clusterStart))
		expect(cluster).toContain('<HelpTip')
	})

	it('keeps the props list unchanged', () => {
		const props = header.slice(header.indexOf('let {'), header.indexOf('} = $props()'))
		for (const prop of ['title:', 'description?:', 'badge?:', 'back?:']) {
			expect(props).toContain(prop)
		}
		expect(props).not.toContain('actions')
	})

	it('no call site passes both a description and a badge HelpTip', () => {
		const offenders = sourceFiles('src').filter((path) => {
			const src = readFileSync(path, 'utf8')
			const openingTags = [...src.matchAll(/<PageHeader\b[^>]*>/g)].map((m) => m[0])
			const described =
				openingTags.some((tag) => /\bdescription=/.test(tag)) ||
				/\{#snippet description\(\)\}/.test(src)
			if (!described) return false
			const badge = src.match(/\{#snippet badge\(\)\}([\s\S]*?)\{\/snippet\}/)
			return !!badge && badge[1].includes('HelpTip')
		})
		expect(offenders).toEqual([])
	})
})

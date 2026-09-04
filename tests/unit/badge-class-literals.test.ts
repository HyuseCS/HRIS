import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Tailwind emits a `@layer components` rule only when its class name appears LITERALLY in a file
 * matched by `content` in `tailwind.config.ts`. `Badge.svelte` used to build the class as
 * `badge-{tone}`, which is not a literal, so `.badge-red`, `.badge-yellow` and `.badge-blue` were
 * purged out of the stylesheet and those statuses rendered as unstyled text. Green and gray only
 * survived because four unrelated files happened to spell them out.
 *
 * `pnpm check` cannot see this — the markup is valid either way. This is the check that can.
 */

const SRC = 'src'

function sourceFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) sourceFiles(path, out)
		else if (/\.(svelte|ts|js|html)$/.test(entry)) out.push(path)
	}
	return out
}

describe('badge class literals survive Tailwind purging', () => {
	// The base `.badge` is only ever reached through `@apply`, which Tailwind inlines at build
	// time, so it does not need a literal. The tone classes are used as class names and do.
	const tones = [...readFileSync('src/app.css', 'utf8').matchAll(/\.badge-(\w+)\s*\{/g)].map(
		(m) => `badge-${m[1]}`
	)

	const haystack = sourceFiles(SRC)
		.filter((f) => !f.endsWith('app.css'))
		.map((f) => readFileSync(f, 'utf8'))
		.join('\n')

	it('finds every .badge-* tone defined in app.css', () => {
		expect(tones.length).toBeGreaterThan(0)
	})

	it.each(tones)('%s appears as a literal string in src/', (tone) => {
		// A bare occurrence inside a comment would satisfy Tailwind too, so this asserts exactly
		// what Tailwind asserts — nothing more.
		expect(haystack).toContain(tone)
	})

	it('no component builds a badge class by interpolation', () => {
		const offenders = sourceFiles(SRC)
			.filter((f) => f.endsWith('.svelte'))
			.filter((f) => /class=["']badge-\{/.test(readFileSync(f, 'utf8')))
		expect(offenders).toEqual([])
	})
})

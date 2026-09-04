import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Two badge CSS contracts, both invisible to `pnpm check` because the markup is valid either way.
 *
 * 1. PURGING. Tailwind emits a `@layer components` rule only when its class name appears LITERALLY
 *    in a file matched by `content` in `tailwind.config.ts`. `Badge.svelte` used to build the class
 *    as `badge-{tone}`, which is not a literal, so `.badge-red`, `.badge-yellow` and `.badge-blue`
 *    were purged out of the stylesheet and those statuses rendered as unstyled text. Green and gray
 *    only survived because four unrelated files happened to spell them out.
 *
 * 2. THE LEADING DOT. `.badge::before` draws the dot on every status pill, and each `.badge-*` tone
 *    rule reaches it by starting with `@apply badge`. Deleting either half strips the dot silently.
 *    Three independent reviewers have read `src/app.css` and concluded the dot was dead code,
 *    because the mechanism only appears in the built stylesheet.
 */

const SRC = 'src'

// The tone classes are used as class names and need a literal in `src/`; that is what the first
// describe block asserts. The base `.badge` survives twice over: `@apply` inlines it at build time,
// AND Tailwind's content scanner is a naive text scan, so the bare token in
// `{@const badge = ...}` at `src/routes/(app)/team/+page.svelte:143` counts as a literal too.
const appCss = readFileSync('src/app.css', 'utf8')
// One tone-discovery regex for both describe blocks, so the two cannot drift apart.
const toneRules = [...appCss.matchAll(/\.badge-(\w+)\s*\{/g)].map((m) => ({
	tone: `badge-${m[1]}`,
	// The rule body: everything from the opening brace to the first closing brace.
	body: appCss.slice(m.index + m[0].length, appCss.indexOf('}', m.index))
}))
const tones = toneRules.map((r) => r.tone)

function sourceFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) sourceFiles(path, out)
		else if (/\.(svelte|ts|js|html)$/.test(entry)) out.push(path)
	}
	return out
}

describe('badge class literals survive Tailwind purging', () => {
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

/**
 * This block guards the SOURCE rule in `src/app.css` — nothing more. It does NOT prove the dot
 * reaches the shipped stylesheet. That was verified once by hand on 2026-09-04 with:
 *
 *   rm -rf build && pnpm build
 *   grep -o '\.badge[a-zA-Z-]*:before{' build/client/_app/immutable/assets/*.css
 *
 * which returned a `:before` for `.badge` and all five tones. If a Tailwind upgrade ever changes
 * what `@apply` copies, these assertions will still pass while the dot disappears. Re-run the
 * build grep by hand after any Tailwind version bump.
 */
describe('the badge leading dot survives in src/app.css', () => {
	it('.badge::before exists and declares content', () => {
		// Match the selector PLUS its declaration block, so a stray mention in a comment cannot
		// satisfy this.
		const rule = appCss.match(/\.badge::before\s*\{([^}]*)\}/)
		expect(rule).not.toBeNull()
		expect(rule![1]).toContain('content:')
	})

	it.each(toneRules.map((r) => r.tone))('%s still routes through @apply badge', (tone) => {
		// Deleting `badge` from one tone's @apply strips the dot from that tone only, which no
		// whole-file grep would catch.
		const rule = toneRules.find((r) => r.tone === tone)!
		expect(rule.body).toMatch(/@apply\s+badge(?![\w-])/)
	})
})

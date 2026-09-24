import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'

const solidFill = (line: string) =>
	/\bbg-(green|red|orange)-\d{3}(?![/\d])/.test(line) && /\btext-white\b/.test(line)

const ALLOWED = 'bg-green-500 text-white'

const hits = (readdirSync('src', { recursive: true, withFileTypes: true }) as Dirent[])
	.filter((d) => d.isFile() && d.name.endsWith('.svelte'))
	.map((d) => join(d.parentPath, d.name))
	.flatMap((f) =>
		readFileSync(f, 'utf8')
			.split('\n')
			.flatMap((line, i) => (solidFill(line) ? [{ at: `${f}:${i + 1}`, line }] : []))
	)

describe('solid-fill buttons go through the button classes', () => {
	it('should match a solid fill and ignore a tint', () => {
		expect(solidFill('class="rounded-md bg-green-600 px-4 text-white"')).toBe(true)
		expect(solidFill('bg-green-600/10 text-white')).toBe(false)
	})

	it('should find no solid green, red or orange text-white line outside the allowlist', () => {
		expect(hits.filter((h) => !h.line.includes(ALLOWED)).map((h) => h.at)).toEqual([])
	})

	it('should keep the checklist toggle allowlist until it is migrated', () => {
		const allowed = hits.filter((h) => h.line.includes(ALLOWED))
		expect(allowed.length).toBeGreaterThanOrEqual(1)
		expect(allowed.length).toBeLessThanOrEqual(2)
	})
})

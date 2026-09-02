import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// #6: an employee self-lookup keyed on `userId` must also filter on `organizationId`. Without it a
// user who belongs to more than one organization gets their HOME-org employee row whichever tenant
// the session is in — a cross-tenant read of pay, leave and performance data.
//
// The unit suite cannot police this. Every affected test stubbed the Prisma call with
// `mockResolvedValue`, which discards the `where` argument entirely, so it is green before the fix,
// green after, and green if the fix filters on the wrong column. That blindness is exactly why 43
// unscoped lookups shipped across many PRs. So we scan the source instead.

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')

// Exact, per site. A wildcard here turns this test into decoration.
const ALLOWED: { file: string; line: number; reason: string }[] = []

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name)
		if (statSync(full).isDirectory()) return walk(full)
		return /\.(ts|svelte)$/.test(name) ? [full] : []
	})
}

/**
 * The balanced `{…}` beginning at or after `from`, or `null` if the next non-space character is
 * not `{` — which is how a `where` built from a variable shows up, and is a parse failure rather
 * than a pass.
 */
function balanced(src: string, from: number): string | null {
	let i = from
	while (i < src.length && /\s/.test(src[i])) i++
	if (src[i] !== '{') return null
	const open = i
	let depth = 0
	let quote = ''
	for (; i < src.length; i++) {
		const c = src[i]
		if (quote) {
			if (c === '\\') i++
			else if (c === quote) quote = ''
			continue
		}
		if (c === '/' && src[i + 1] === '/') {
			const nl = src.indexOf('\n', i)
			if (nl === -1) return null
			i = nl
			continue
		}
		if (c === '/' && src[i + 1] === '*') {
			const end = src.indexOf('*/', i + 2)
			if (end === -1) return null
			i = end + 1
			continue
		}
		if (c === "'" || c === '"' || c === '`') quote = c
		else if (c === '{' || c === '(' || c === '[') depth++
		else if (c === '}' || c === ')' || c === ']') {
			depth--
			if (depth === 0) return src.slice(open, i + 1)
		}
	}
	return null
}

type Site = { file: string; line: number; where: string | null }

const sites: Site[] = []
for (const path of walk(SRC)) {
	const rel = relative(ROOT, path)
	const src = readFileSync(path, 'utf8')
	for (const m of src.matchAll(/\.employee\.(findUnique|findFirst)\s*\(/g)) {
		const at = m.index!
		const lineStart = src.lastIndexOf('\n', at) + 1
		const before = src.slice(lineStart, at).trimStart()
		if (before.startsWith('*') || before.startsWith('//')) continue // prose, not a call
		const options = balanced(src, at + m[0].length - 1 + 1)
		const line = src.slice(0, at).split('\n').length
		if (options === null) {
			sites.push({ file: rel, line, where: null })
			continue
		}
		const w = options.search(/\bwhere\s*:/)
		if (w === -1) {
			sites.push({ file: rel, line, where: null })
			continue
		}
		sites.push({
			file: rel,
			line,
			where: balanced(options, options.indexOf(':', w) + 1)
		})
	}
}

/** A self-lookup is one whose `where` keys on the user, rather than on an employee id. */
const selfSites = sites.filter((s) => s.where !== null && /\buserId\b/.test(s.where))
// A parse miss yields `null`, which matches no filter below — without this bucket such a site
// would drop out of every assertion and read as compliant. Unknown is not clean.
const unparsedSites = sites.filter((s) => s.where === null)

describe('employee self-lookups are scoped to the active organization (#6)', () => {
	it('finds the call sites at all', () => {
		expect(sites.length).toBeGreaterThan(50)
		expect(selfSites.length).toBeGreaterThan(30)
	})

	it('parses the where clause of every employee lookup', () => {
		const unknown = unparsedSites.map((s) => `${s.file}:${s.line}`)
		expect(
			unknown,
			`the \`where\` of these lookups could not be parsed, so this sweep says nothing about them:\n${unknown.join('\n')}`
		).toEqual([])
	})

	it('every self-lookup also filters on organizationId, except the allow-list', () => {
		const allowed = new Set(ALLOWED.map((a) => `${a.file}:${a.line}`))
		const bad = selfSites
			.filter((s) => !/\borganizationId\b/.test(s.where!))
			.map((s) => `${s.file}:${s.line}`)
			.filter((k) => !allowed.has(k))
		expect(
			bad,
			`these look up an employee by \`userId\` with no org filter, so a multi-org user gets their home-org row in every tenant:\n${bad.join('\n')}`
		).toEqual([])
	})

	it.each(ALLOWED)('allow-list entry $file:$line is still live ($reason)', ({ file, line }) => {
		expect(selfSites.some((s) => s.file === file && s.line === line)).toBe(true)
	})
})

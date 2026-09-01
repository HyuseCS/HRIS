import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// #5: `writeAuditLog(ctx, payload, client)` must take the enclosing transaction's client so the
// audit row commits or rolls back with the mutation it records. The unit suite cannot police this
// — 26 test files mock `$transaction` as `fn(dbMock)`, which makes `tx === db` and the assertion
// unfalsifiable — and many call sites have no test at all. So we scan the source instead.

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')
const DEFINITION = 'src/lib/server/audit.ts'

// Exact, per site. A wildcard here turns this test into decoration.
const ALLOWED = [
	{
		file: 'src/lib/server/services/employees.ts',
		count: 1,
		reason: 'audits a PII read; no mutation to roll back with'
	},
	{
		file: 'src/routes/(auth)/login/+page.server.ts',
		count: 2,
		reason: 'failed login has no mutation; successful login must outlive a lastLoginAt failure'
	},
	{
		file: 'src/routes/(app)/reports/audit-log/+page.server.ts',
		count: 1,
		reason: 'audits a reveal read; the write-before-return ordering is the guarantee'
	}
]

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name)
		if (statSync(full).isDirectory()) return walk(full)
		return /\.(ts|svelte)$/.test(name) ? [full] : []
	})
}

/** Top-level arguments of the call whose `(` sits at `open`, split on depth-0 commas. */
function args(src: string, open: number): string[] {
	const out: string[] = []
	let depth = 0
	let start = open + 1
	let quote = ''
	for (let i = open; i < src.length; i++) {
		const c = src[i]
		if (quote) {
			if (c === '\\') i++
			else if (c === quote) quote = ''
			continue
		}
		if (c === "'" || c === '"' || c === '`') quote = c
		else if (c === '(' || c === '[' || c === '{') depth++
		else if (c === ')' || c === ']' || c === '}') {
			depth--
			if (depth === 0) {
				out.push(src.slice(start, i))
				return out
			}
		} else if (c === ',' && depth === 1) {
			out.push(src.slice(start, i))
			start = i + 1
		}
	}
	return out
}

const sites: { file: string; line: number; client: string }[] = []
for (const path of walk(SRC)) {
	const rel = relative(ROOT, path)
	if (rel === DEFINITION) continue // the declaration itself
	const src = readFileSync(path, 'utf8')
	for (let i = src.indexOf('writeAuditLog('); i !== -1; i = src.indexOf('writeAuditLog(', i + 1)) {
		const lineStart = src.lastIndexOf('\n', i) + 1
		const before = src.slice(lineStart, i).trimStart()
		if (before.startsWith('*') || before.startsWith('//')) continue // prose, not a call
		sites.push({
			file: rel,
			line: src.slice(0, i).split('\n').length,
			client: (args(src, i + 'writeAuditLog'.length)[2] ?? '').trim()
		})
	}
}

const dbSites = sites.filter((s) => s.client === 'db')

describe('writeAuditLog call sites', () => {
	it('finds the call sites at all', () => {
		expect(sites.length).toBeGreaterThan(100)
	})

	it('passes a transaction client everywhere except the allow-list', () => {
		const allowed = new Set(ALLOWED.map((a) => a.file))
		const bad = dbSites.filter((s) => !allowed.has(s.file)).map((s) => `${s.file}:${s.line}`)
		expect(bad, `these pass the shared \`db\`, not a transaction client:\n${bad.join('\n')}`).toEqual([])
	})

	it.each(ALLOWED)('allow-list entry $file is still live ($reason)', ({ file, count }) => {
		expect(dbSites.filter((s) => s.file === file)).toHaveLength(count)
	})
})

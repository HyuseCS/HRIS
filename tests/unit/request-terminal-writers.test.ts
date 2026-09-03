import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * #299/AC-10 — a tripwire on the set of files that can close a request.
 *
 * D-6 evicts a request's tombstoned bytes once it reaches a terminal status, and the eviction is
 * called explicitly at each of the three sites that write one. Three explicit calls is the honest
 * shape — the modes carry different semantics and a generic "terminal hook" abstraction is
 * speculative flexibility — but it leaves one question with no answer: what catches a FOURTH
 * writer? Nothing did. This does.
 *
 * A new file in this set means a new way to close a request exists and D-6 does not fire on it, so
 * those requests hold their tombstoned files forever, silently. The correct response to a red here
 * is to add the eviction call at the new site, NOT to widen the allow-list.
 *
 * Keyed on `request.update` / `request.updateMany`, never on the status literal alone: `src/` is
 * full of `status: 'APPROVED'` belonging to Timesheet, PayrollRun, ActionProposal and statutory
 * rates, plus `where`-clause reads. A scan that matched those would be noise, and noise gets
 * deleted by the next person who trips over it.
 *
 * Same static-scan shape as rbac-no-rank-helpers.test.ts, and it walks all of src/ for the same
 * reason: a terminal write placed directly in a +page.server.ts must not be invisible to it.
 */
const SRC = join(import.meta.dirname, '../../src')

const TERMINAL = ['APPROVED', 'REJECTED', 'CANCELLED']

// The `data` payload trails the call across several lines, so match the call and then look ahead.
const WRITE = /(?:db|tx)\.request\.(?:update|updateMany)\(/g

const isComment = (line: string) => /^\s*(?:\/\/|\/\*|\*)/.test(line)

const stripComments = (source: string) =>
	source
		.split('\n')
		.map((l) => (isComment(l) ? '' : l))
		.join('\n')

// A terminal write sets status to one of the three literals, or to a computed transition (the
// `transition.status` shape decide() uses, which resolves to them at runtime).
const setsTerminalStatus = (window: string) => {
	const status = window.match(/status:\s*('(\w+)'|[A-Za-z_$][\w$]*\.status)/)
	if (!status) return false
	return status[2] ? TERMINAL.includes(status[2]) : true
}

const terminalWriterFiles = () => {
	const found = new Set<string>()

	for (const entry of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !/\.(ts|svelte)$/.test(entry.name)) continue
		const path = join(entry.parentPath, entry.name)
		const source = stripComments(readFileSync(path, 'utf8'))

		for (const m of source.matchAll(WRITE)) {
			if (setsTerminalStatus(source.slice(m.index, m.index + 300))) {
				found.add(relative(SRC, path))
			}
		}
	}
	return [...found].sort()
}

describe('every writer of a terminal Request.status is wired to #299/D-6', () => {
	it('recognises a terminal write and ignores a non-terminal one', () => {
		expect(setsTerminalStatus(`{ where: { id }, data: { status: 'CANCELLED' } })`)).toBe(true)
		expect(setsTerminalStatus(`{ data: { status: transition.status, currentStage } })`)).toBe(true)
		expect(
			setsTerminalStatus(`{ where: { id }, data: { status: 'PENDING', currentStage } })`)
		).toBe(false)
		expect(setsTerminalStatus(`{ where: { id }, data: { currentStage } })`)).toBe(false)
	})

	it('is exactly the two files that call evictTombstonedBytes', () => {
		expect(terminalWriterFiles()).toEqual([
			'lib/server/services/approvals.ts',
			'lib/server/services/requests/index.ts'
		])
	})

	// Naming the set is not enough — both files must actually make the call. Together these two
	// assertions say: these are the only closers, and both of them evict.
	it('and both of them evict', () => {
		for (const f of terminalWriterFiles()) {
			expect(readFileSync(join(SRC, f), 'utf8')).toContain('evictTombstonedBytes(')
		}
	})
})

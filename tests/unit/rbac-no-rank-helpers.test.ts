import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #282 finish-line guard.
 *
 * The rank ladder (`ROLE_HIERARCHY` + `hasMinRole` / `hasAnyMinRole` / `requireAnyMinRole`) is
 * deleted: `MANAGER`, `HR_ADMIN` and `CEO` all ranked 2, so the only two floors ever passed —
 * `'MANAGER'` and `'HR_ADMIN'` — admitted an identical set, and that set is exactly `MANAGE_HR`.
 * A floor therefore said nothing a capability does not say, while reading as if it did: the guards
 * at the root of #228, #234, #243 and #275 all looked like restrictions and were empty sets.
 *
 * Authority is now `can`/`canAny` (WHAT) plus `canTouchEmployee` (WHOSE), and nothing else.
 * Deleting the exports makes reintroduction a compile error — but only until someone hand-rolls
 * the comparison again, which is what this scan catches. Whole-line comments are skipped, because
 * the history of why the ladder went is worth keeping written down.
 */
const BANNED = /\b(?:ROLE_HIERARCHY|hasMinRole|hasAnyMinRole|requireAnyMinRole|requireMinRole)\b/

const isComment = (line: string) => /^\s*(?:\/\/|\/\*|\*)/.test(line)

const ROOTS = ['../../src'].map((r) => join(import.meta.dirname, r))

describe('the rank ladder stays deleted (#282)', () => {
	it('flags a reintroduction, in any of its forms', () => {
		expect(
			[
				`export const ROLE_HIERARCHY: Record<Role, number> = {`,
				`if (!hasAnyMinRole(user.roles, 'HR_ADMIN')) error(403)`,
				`requireAnyMinRole(locals.user!.roles, 'MANAGER')`,
				`const ok = hasMinRole(user.role, 'HR_ADMIN')`
			].filter((line) => !BANNED.test(line))
		).toEqual([])
	})

	it('leaves the capability forms and the historical comments alone', () => {
		expect(
			[
				`requireAnyCapability(user.roles, 'MANAGE_HR')`,
				`canAny(user.roles, 'ADMINISTER_HR_ORGWIDE')`,
				`// this was requireAnyMinRole('HR_ADMIN') before #282`,
				` * ROLE_HIERARCHY ranked MANAGER level with HR_ADMIN`
			].filter((line) => !isComment(line) && BANNED.test(line))
		).toEqual([])
	})

	it('has no rank-helper call left anywhere in src/', () => {
		const offenders: string[] = []

		for (const root of ROOTS) {
			for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
				if (!entry.isFile() || !/\.(ts|svelte)$/.test(entry.name)) continue
				const path = join(entry.parentPath, entry.name)
				readFileSync(path, 'utf8')
					.split('\n')
					.forEach((line, i) => {
						if (!isComment(line) && BANNED.test(line)) offenders.push(`${path}:${i + 1}`)
					})
			}
		}

		expect(
			offenders,
			`Rank floors are gone — use a capability (\`canAny\`) or an object check (\`canTouchEmployee\`):\n${offenders.join('\n')}`
		).toEqual([])
	})
})

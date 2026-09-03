import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #178 SPEC acceptance criterion 4 — the structural no-scoring gate.
 *
 * The app performs NO arithmetic on evaluation scores. HR calculates by hand. The evaluator
 * types every rating, every subtotal and the overall total, and picks the interpretation band.
 * Section weights, section maxima and band ranges are labels the form prints — never inputs to
 * a formula. Range validation (one typed number against one stored bound) is not calculation
 * and stays.
 *
 * Every other guard on this rule is a comment or a code review. This scan is the only
 * mechanical one, so it is deliberately shaped like the Goal-removal gate (#178 plan item 48):
 * walk the tree, collect offenders, name the rule in the failure message. Whole-line comments
 * are skipped, because writing down *why* the scoring engine does not exist is the point.
 */
const WHY =
	'the app performs no arithmetic on evaluation scores — see #178 SPEC acceptance criterion 4.'

const BANNED = /\b(?:computeScore|calculateTotal|deriveBand|sumSubtotals?|weightedTotal)\b/

const isComment = (line: string) => /^\s*(?:\/\/|\/\*|\*|<!--)/.test(line)

const SRC = join(import.meta.dirname, '../../src')
const PERFORMANCE_DIR = join(SRC, 'lib/server/performance')
const REVIEW_PAGE = join(SRC, 'routes/(app)/performance/reviews/[id]/+page.svelte')

const sourceFiles = () =>
	readdirSync(SRC, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(ts|svelte)$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name))

describe('no scoring engine exists (#178 AC4)', () => {
	it('has no scoring.ts under src/lib/server/performance/', () => {
		// Non-vacuity: the directory this gate watches must actually be there.
		expect(existsSync(PERFORMANCE_DIR), `${PERFORMANCE_DIR} is missing — this gate is blind`).toBe(
			true
		)

		expect(
			readdirSync(PERFORMANCE_DIR).filter((name) => name === 'scoring.ts'),
			`src/lib/server/performance/scoring.ts must not exist: ${WHY}`
		).toEqual([])
	})

	it('has no score-computing identifier anywhere in src/', () => {
		const files = sourceFiles()

		// Non-vacuity: a bad path or an unexpanded glob would leave this scan at zero files.
		expect(
			files.length,
			`scanned ${files.length} files under ${SRC} — this gate is blind`
		).toBeGreaterThan(0)

		const offenders: string[] = []
		for (const path of files) {
			readFileSync(path, 'utf8')
				.split('\n')
				.forEach((line, i) => {
					if (!isComment(line) && BANNED.test(line)) offenders.push(`${path}:${i + 1}`)
				})
		}

		expect(
			offenders,
			`No function may sum ratings into a subtotal, weight subtotals into a total, or derive a band from a total — ${WHY}\n${offenders.join('\n')}`
		).toEqual([])
	})

	it('has no .reduce( in the review page', () => {
		// Non-vacuity: the page is rewritten into the real evaluation form later in #178; if it
		// ever stops existing, this gate must fail loudly rather than pass on nothing.
		expect(existsSync(REVIEW_PAGE), `${REVIEW_PAGE} is missing — this gate is blind`).toBe(true)

		const offenders = readFileSync(REVIEW_PAGE, 'utf8')
			.split('\n')
			.map((line, i) => ({ line, at: i + 1 }))
			.filter(({ line }) => !isComment(line) && line.includes('.reduce('))
			.map(({ at }) => `${REVIEW_PAGE}:${at}`)

		expect(
			offenders,
			`The review form captures typed numbers, it does not fold them — ${WHY}\n${offenders.join('\n')}`
		).toEqual([])
	})
})

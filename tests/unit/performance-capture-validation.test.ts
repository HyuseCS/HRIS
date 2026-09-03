import { describe, it, expect } from 'vitest'
import { answersSchemaFor } from '../../src/lib/server/performance/schemas'
import { accountExecutive } from '../../prisma/seed-performance-templates'
import type { Answers, TemplateStructure } from '../../src/lib/server/performance/types'

/**
 * #178 SPEC AC5 — the range boundaries of `answersSchemaFor`.
 *
 * VALIDATION IS NOT CALCULATION. Every number in these fixtures is one the evaluator TYPED. The
 * schema compares each typed number against ONE declared bound from the template. It never sums
 * criteria into a subtotal, never sums subtotals into a total, and never checks the picked band
 * against the total — so none of these cases assert on a computed value, and none ever should.
 *
 * The fixture is the seeded Account Executive structure, not a hand-typed one, so a drift between
 * the seed and this validator fails here rather than on a real review. Its Section 3
 * (`PRODUCT KNOWLEDGE & PRESENTATION`) carries `maximum: null` — that is the case behind the
 * "no subtotal line" test.
 *
 * Each case mutates a known-good `answers` by exactly ONE field, so a rejection has one cause.
 */

const structure: TemplateStructure = accountExecutive()
const schema = answersSchemaFor(structure)

const bounded = structure.sections.filter((s) => s.maximum !== null)
const unbounded = structure.sections.filter((s) => s.maximum === null)
const firstCriterionId = structure.sections[0].criteria[0].id

/** A complete, in-range answer set. Every number here was typed by the evaluator. */
function validAnswers(): Answers {
	return {
		version: 1,
		criteria: Object.fromEntries(
			structure.sections.flatMap((s) => s.criteria.map((c) => [c.id, { rating: 3, remark: '' }]))
		),
		// Only the sections that print a subtotal line. Deliberately NOT the sum of anything.
		sectionSubtotals: Object.fromEntries(bounded.map((s) => [s.id, 1])),
		totalScore: 88,
		interpretationBandId: structure.interpretationBands[0].id,
		narratives: Object.fromEntries(structure.narrativeBlocks.map((n) => [n.id, 'text'])),
		recommendationIds: [structure.recommendationOptions[0].id]
	}
}

function parse(mutate: (a: Answers) => void) {
	const answers = validAnswers()
	mutate(answers)
	return schema.safeParse(answers)
}

/**
 * Asserts the rejection came from the field under test. Without this, a case could go green on an
 * unrelated issue (a `.strict()` complaint elsewhere) and prove nothing about the boundary.
 */
function expectRejectedAt(res: ReturnType<typeof parse>, path: (string | number)[]) {
	expect(res.success).toBe(false)
	expect(res.error?.issues.map((i) => i.path.join('.'))).toContain(path.join('.'))
}

describe('the fixture is the shape these boundaries assume', () => {
	it('has exactly one section with maximum: null', () => {
		expect(unbounded).toHaveLength(1)
		expect(bounded.length).toBeGreaterThan(0)
	})

	it('accepts a fully in-range answer set', () => {
		expect(schema.safeParse(validAnswers()).success).toBe(true)
	})
})

describe('criterion rating against the declared rating scale', () => {
	it('accepts a rating at the scale max', () => {
		const res = parse((a) => {
			a.criteria[firstCriterionId].rating = structure.ratingScale.max
		})
		expect(res.success).toBe(true)
	})

	it('rejects a rating one above the scale max', () => {
		const res = parse((a) => {
			a.criteria[firstCriterionId].rating = structure.ratingScale.max + 1
		})
		expectRejectedAt(res, ['criteria', firstCriterionId, 'rating'])
	})

	it('rejects a rating one below the scale min', () => {
		const res = parse((a) => {
			a.criteria[firstCriterionId].rating = structure.ratingScale.min - 1
		})
		expectRejectedAt(res, ['criteria', firstCriterionId, 'rating'])
	})

	it('rejects a non-integer rating — whole numbers only, no fractions', () => {
		const res = parse((a) => {
			a.criteria[firstCriterionId].rating = 3.5
		})
		expectRejectedAt(res, ['criteria', firstCriterionId, 'rating'])
	})

	it('rejects a rating keyed to a criterion that is not on this form', () => {
		const res = parse((a) => {
			a.criteria['crit_not_on_this_form'] = { rating: 3 }
		})
		expectRejectedAt(res, ['criteria', 'crit_not_on_this_form'])
	})
})

describe('section subtotal against that section declared maximum', () => {
	it('accepts a subtotal exactly at the section maximum', () => {
		const section = bounded[0]
		const res = parse((a) => {
			a.sectionSubtotals[section.id] = section.maximum as number
		})
		expect(res.success).toBe(true)
	})

	it('rejects a subtotal one above the section maximum', () => {
		const section = bounded[0]
		const res = parse((a) => {
			a.sectionSubtotals[section.id] = (section.maximum as number) + 1
		})
		expectRejectedAt(res, ['sectionSubtotals', section.id])
	})

	it('rejects any subtotal for a section whose maximum is null — it prints no subtotal line', () => {
		// Deliberately 0, the value that slips past any `subtotal > maximum` comparison when
		// `maximum` is null (`0 > null` is false). A rejection here can only come from the
		// "this category has no subtotal line" rule itself.
		const res = parse((a) => {
			a.sectionSubtotals[unbounded[0].id] = 0
		})
		expectRejectedAt(res, ['sectionSubtotals', unbounded[0].id])
	})
})

describe('total score against the declared ceiling', () => {
	it('accepts a total exactly at the ceiling', () => {
		const res = parse((a) => {
			a.totalScore = structure.totalCeiling
		})
		expect(res.success).toBe(true)
	})

	it('rejects a total one above the ceiling — 101/100 must never land on an HR record', () => {
		const res = parse((a) => {
			a.totalScore = structure.totalCeiling + 1
		})
		expectRejectedAt(res, ['totalScore'])
	})
})

describe('picked ids must exist on this review form', () => {
	it('rejects an interpretation band that is not on this form', () => {
		const res = parse((a) => {
			a.interpretationBandId = 'band_not_on_this_form'
		})
		expectRejectedAt(res, ['interpretationBandId'])
	})
})

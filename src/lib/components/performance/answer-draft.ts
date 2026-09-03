import type { Answers, TemplateStructure } from '$lib/server/performance/types'

/**
 * The evaluator's in-progress answers, as the form holds them (#178 item 131).
 *
 * Every numeric field is a STRING here because that is what a text input gives back. The one
 * and only conversion to a number happens at the server boundary, in `answersSchemaFor`'s
 * `z.coerce` — so there is exactly one place where a typed "4" becomes a 4, and no client-side
 * parsing that could round, clamp or reinterpret it on the way.
 *
 * THE RULE THIS FILE CARRIES: **the app performs NO arithmetic on evaluation scores.** Nothing
 * below sums a criterion into a subtotal, a subtotal into a total, or a total into a band. Every
 * value moves through verbatim. Section maxima and the total ceiling are bounds the server's
 * range validator compares against; they are never operands here.
 *
 * `selfAssessment` and `employeeComments` are employee-authored, live in their own Prisma
 * columns, and must never appear in this shape — `answers` is nulled wholesale by redaction.
 */
export interface AnswerDraft {
	criteria: Record<string, { rating: string; remark: string }>
	sectionSubtotals: Record<string, string>
	totalScore: string
	interpretationBandId: string
	narratives: Record<string, string>
	recommendationIds: string[]
	recommendationOther: string
	kpiActuals: Record<string, string>
}

/** Reads one stored value back out as the exact text the evaluator typed. */
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/**
 * Builds the draft for one review: a slot for every field its OWN snapshot declares, pre-filled
 * from `stored` when the review already carries answers.
 *
 * `stored` is read defensively. It is server-validated on write, but a row written before a
 * template edit — or by hand — must render as an empty box, never crash the page.
 *
 * Only sections that declare a `maximum` get a subtotal slot: a section with `maximum: null`
 * prints no subtotal line on the paper form and the server rejects one outright.
 */
export function answerDraft(structure: TemplateStructure, stored: unknown): AnswerDraft {
	const answers = (stored ?? {}) as Partial<Answers>
	const criteria: AnswerDraft['criteria'] = {}
	for (const section of structure.sections) {
		for (const criterion of section.criteria) {
			const saved = answers.criteria?.[criterion.id]
			criteria[criterion.id] = { rating: text(saved?.rating), remark: text(saved?.remark) }
		}
	}

	const sectionSubtotals: Record<string, string> = {}
	for (const section of structure.sections) {
		if (section.maximum === null) continue
		sectionSubtotals[section.id] = text(answers.sectionSubtotals?.[section.id])
	}

	const narratives: Record<string, string> = {}
	for (const block of structure.narrativeBlocks) {
		narratives[block.id] = text(answers.narratives?.[block.id])
	}

	const kpiActuals: Record<string, string> = {}
	for (const kpi of structure.kpiRows ?? []) {
		kpiActuals[kpi.id] = text(answers.kpiActuals?.[kpi.id])
	}

	return {
		criteria,
		sectionSubtotals,
		totalScore: text(answers.totalScore),
		interpretationBandId: text(answers.interpretationBandId),
		narratives,
		recommendationIds: Array.isArray(answers.recommendationIds)
			? [...answers.recommendationIds]
			: [],
		recommendationOther: text(answers.recommendationOther),
		kpiActuals
	}
}

/**
 * The whole draft as the ONE `answers` form field the `?/submitScores` action reads — the same
 * decision as the template builder's single `structure` field: one field, one parse, one failure
 * mode, instead of index-encoded input names and a bespoke parser.
 *
 * An untouched numeric box is OMITTED rather than sent as `""`, because `z.coerce.number()` turns
 * `""` into `0` and a silent zero is indistinguishable from a typed one on an HR record. A
 * criterion with a remark but no rating IS sent, so the server rejects it visibly on that row
 * instead of quietly dropping what the evaluator wrote.
 */
export function serialiseAnswers(draft: AnswerDraft): string {
	const criteria: Record<string, { rating: string; remark?: string }> = {}
	for (const [id, answer] of Object.entries(draft.criteria)) {
		if (answer.rating === '' && answer.remark === '') continue
		criteria[id] = answer.remark === '' ? { rating: answer.rating } : answer
	}

	const sectionSubtotals: Record<string, string> = {}
	for (const [id, subtotal] of Object.entries(draft.sectionSubtotals)) {
		if (subtotal !== '') sectionSubtotals[id] = subtotal
	}

	return JSON.stringify({
		version: 1,
		criteria,
		sectionSubtotals,
		totalScore: draft.totalScore,
		interpretationBandId: draft.interpretationBandId,
		narratives: draft.narratives,
		recommendationIds: draft.recommendationIds,
		...(draft.recommendationOther === '' ? {} : { recommendationOther: draft.recommendationOther }),
		...(Object.keys(draft.kpiActuals).length === 0 ? {} : { kpiActuals: draft.kpiActuals })
	})
}

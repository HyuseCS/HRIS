/**
 * The three JSON shapes the whole evaluation feature depends on (#178, plan §4).
 *
 * Types only — no logic, no `$lib/server/db` import — so the seed, the services, the routes and
 * the unit tests all describe the same contract. `schemas.ts` is the runtime half; Postgres
 * validates none of this, so a write path that skips its zod schema is a silent-corruption hole.
 *
 * `version` is present on all three shapes so a future shape change can be detected rather than
 * guessed at.
 *
 * THE RULE THIS FILE EXISTS UNDER: the app performs NO arithmetic on evaluation scores. Weights,
 * section maxima and interpretation bands are LABELS the form prints. `maximum` and `totalCeiling`
 * are read by a range validator and by nothing else. Nothing sums, weights or derives anything.
 */

/**
 * The four signatory roles. A TypeScript union validated by zod, NOT a Prisma enum: it lives
 * inside JSON, where a Prisma enum could not constrain it and would only add a migration.
 */
export type SignatoryRole =
	'EMPLOYEE' | 'IMMEDIATE_SUPERVISOR' | 'HR_REPRESENTATIVE' | 'DEPARTMENT_HEAD'

export const SIGNATORY_ROLES = [
	'EMPLOYEE',
	'IMMEDIATE_SUPERVISOR',
	'HR_REPRESENTATIVE',
	'DEPARTMENT_HEAD'
] as const

export interface RatingScaleRow {
	value: number
	description: string
}

/** `min`/`max` are the ONLY numbers the criterion-rating validator reads. `rows` is printed. */
export interface RatingScale {
	min: number
	max: number
	rows: RatingScaleRow[]
}

export interface TemplateCriterion {
	id: string
	text: string
}

export interface TemplateSection {
	id: string
	name: string
	/** PRINTED ONLY. No code reads this as a number. Ever. */
	weightLabel: string
	/**
	 * Read ONLY by the subtotal range validator. `null` = this section prints no subtotal line
	 * and captures no subtotal (the AE form's Section 3).
	 */
	maximum: number | null
	criteria: TemplateCriterion[]
}

/** PRINTED ONLY, plus the id list the evaluator picks from. `rangeLabel` is free text. */
export interface InterpretationBand {
	id: string
	rangeLabel: string
	label: string
}

/** Free-text blocks the EVALUATOR fills. Array order is render order. */
export interface NarrativeBlock {
	id: string
	label: string
}

/** `allowsFreeText: true` renders the "Other: ____" companion input. */
export interface RecommendationOption {
	id: string
	label: string
	allowsFreeText: boolean
}

/** `target` is a free-text label ("100%", "Within 24 hours") — never compared to anything. */
export interface KpiRow {
	id: string
	indicator: string
	target: string
}

/** ORDERED. Index 0 signs first. This IS the sequential sign-off rule's source of truth. */
export interface SignatorySlot {
	id: string
	role: SignatoryRole
	label: string
}

export interface TemplateStructure {
	version: 1
	ratingScale: RatingScale
	sections: TemplateSection[]
	interpretationBands: InterpretationBand[]
	/** Read ONLY by the total range validator. Printed as "Total Score: ___ / 100". */
	totalCeiling: number
	narrativeBlocks: NarrativeBlock[]
	recommendationOptions: RecommendationOption[]
	/** Optional. Present on Admin Staff, absent on AE. */
	kpiRows?: KpiRow[]
	signatoryOrder: SignatorySlot[]
}

/** Keyed by snapshot criterion id. `rating` is TYPED by the evaluator and stored verbatim. */
export interface CriterionAnswer {
	rating: number
	remark?: string
}

/**
 * Everything the EVALUATOR types or picks. NOTHING here is derived.
 *
 * The redaction rule this shape exists to make safe: `answers` holds ONLY evaluator/HR-authored
 * content, so redaction is the single operation `answers = null` — no field-picking inside JSON
 * and no way to leak one field by forgetting it. NEVER put employee-authored content in here;
 * `selfAssessment` and `employeeComments` are separate Prisma columns.
 */
export interface Answers {
	version: 1
	criteria: Record<string, CriterionAnswer>
	/** Keyed by section id. TYPED. NOT summed from `criteria` — never, by anything. */
	sectionSubtotals: Record<string, number>
	/** TYPED. NOT derived from the subtotals. */
	totalScore: number
	/** PICKED from `interpretationBands`. NOT looked up from `totalScore`. */
	interpretationBandId: string
	narratives: Record<string, string>
	/** Multi-select — the paper form is a checklist, not a radio. */
	recommendationIds: string[]
	recommendationOther?: string
	/** Keyed by kpi row id. Free text, TYPED. Never compared to `target`. */
	kpiActuals?: Record<string, string>
}

/**
 * Written INSIDE the same `$transaction` that creates the review. Read on every render.
 * NEVER refreshed — no code path may write `templateSnapshot` on an existing review.
 */
export interface TemplateSnapshot {
	version: 1
	templateId: string
	templateName: string
	snapshotAt: string
	structure: TemplateStructure
}

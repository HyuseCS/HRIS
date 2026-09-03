import { z, type ZodType, type ZodTypeDef } from 'zod'
import { newId } from '../../performance/ids'
import { SIGNATORY_ROLES, type Answers, type TemplateStructure } from './types'

/**
 * Every write boundary for the evaluation feature (#178, plan §5), in ONE module. Pure — no DB
 * import — so it is unit-testable and so every writer reaches the same rules.
 *
 * This is the accepted price of the JSON design: **Postgres validates nothing inside `structure`
 * or `answers`**, so a write path that skips its schema here is a silent-corruption hole with no
 * backstop.
 *
 * VALIDATION IS NOT CALCULATION. `maximum` and `totalCeiling` are bounds a range check compares
 * ONE typed number against. Nothing in this module — or anywhere in this feature — sums criterion
 * ratings into a subtotal, weights subtotals into a total, or derives a band from a total. HR
 * calculates outside the app; the app stores and prints what HR types.
 */

/** Re-exported so the seed, the services and the builder all mint ids the same way. */
export { newId }

// ── Template structure ───────────────────────────────────────────────────────

const ratingScaleSchema = z
	.object({
		// The ONLY two numbers the criterion-rating validator reads.
		min: z.number().int(),
		max: z.number().int(),
		rows: z
			.array(z.object({ value: z.number().int(), description: z.string() }).strict())
			.min(1, 'The rating scale needs at least one row')
	})
	.strict()
	.refine((s) => s.min <= s.max, { message: 'Rating scale min must not exceed max' })

const criterionSchema = z
	.object({
		id: z.string().min(1, 'Every criterion needs an id'),
		text: z.string()
	})
	.strict()

const sectionSchema = z
	.object({
		id: z.string().min(1, 'Every category needs an id'),
		name: z.string(),
		// PRINTED ONLY. No code reads this as a number. Ever.
		weightLabel: z.string(),
		// Read ONLY by the subtotal range validator (Phase 6). null = no subtotal line at all.
		maximum: z.number().int().nonnegative('A category maximum cannot be negative').nullable(),
		criteria: z.array(criterionSchema)
	})
	.strict()

const bandSchema = z
	.object({
		id: z.string().min(1, 'Every interpretation band needs an id'),
		// Free text — nothing parses it, because nothing derives a band.
		rangeLabel: z.string(),
		label: z.string()
	})
	.strict()

const narrativeBlockSchema = z
	.object({ id: z.string().min(1, 'Every narrative block needs an id'), label: z.string() })
	.strict()

const recommendationOptionSchema = z
	.object({
		id: z.string().min(1, 'Every recommendation needs an id'),
		label: z.string(),
		allowsFreeText: z.boolean()
	})
	.strict()

const kpiRowSchema = z
	.object({
		id: z.string().min(1, 'Every KPI row needs an id'),
		indicator: z.string(),
		// Free-text label ("100%", "Within 24 hours") — never a number, never compared to anything.
		target: z.string()
	})
	.strict()

const signatorySlotSchema = z
	.object({
		id: z.string().min(1, 'Every signatory needs an id'),
		role: z.enum(SIGNATORY_ROLES),
		label: z.string()
	})
	.strict()

/**
 * The one gate on `PerformanceTemplate.structure`. Every id inside a structure must be unique:
 * answers, and the sequential sign-off rule, key off these ids, so a duplicate silently makes two
 * rows share one answer.
 */
export const templateStructureSchema = z
	.object({
		version: z.literal(1),
		ratingScale: ratingScaleSchema,
		sections: z.array(sectionSchema),
		interpretationBands: z.array(bandSchema),
		// Read ONLY by the total range validator (Phase 6). Printed as "Total Score: ___ / 100".
		totalCeiling: z.number().int().positive(),
		narrativeBlocks: z.array(narrativeBlockSchema),
		recommendationOptions: z.array(recommendationOptionSchema),
		kpiRows: z.array(kpiRowSchema).optional(),
		// ORDERED. Index 0 signs first — this IS the sequential rule's source of truth, so an
		// empty list would mean a review nobody can ever sign.
		signatoryOrder: z.array(signatorySlotSchema).min(1, 'A template needs at least one signatory')
	})
	.strict()
	.superRefine((structure, ctx) => {
		const seen = new Set<string>()
		const ids = [
			...structure.sections.flatMap((s) => [s.id, ...s.criteria.map((c) => c.id)]),
			...structure.interpretationBands.map((b) => b.id),
			...structure.narrativeBlocks.map((n) => n.id),
			...structure.recommendationOptions.map((r) => r.id),
			...(structure.kpiRows ?? []).map((k) => k.id),
			...structure.signatoryOrder.map((s) => s.id)
		]
		for (const id of ids) {
			if (seen.has(id)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Duplicate id "${id}" — every row in a template needs its own id`
				})
				return
			}
			seen.add(id)
		}
	})

/** Name + active flag. The structure is validated separately by `templateStructureSchema`. */
export const templateMetaSchema = z.object({
	name: z.string().trim().min(1, 'Give the template a name').max(200),
	isActive: z.boolean()
})

/**
 * The starting point for a brand-new template, and the shared content both seeded forms carry
 * (plan §9): the 5→1 rating scale, the six interpretation bands, `totalCeiling: 100`, the three
 * narrative blocks, the six recommendation options, and the sign-off order.
 *
 * The signatory order is deliberately NOT the paper form's top-to-bottom layout (which lists the
 * Employee first): signing is sequential, and the employee attests AFTER they can see what they
 * are signing.
 *
 * Fresh ids on every call — ids are per-template and never shared between two templates.
 */
export function blankTemplateStructure(): TemplateStructure {
	return {
		version: 1,
		ratingScale: {
			min: 1,
			max: 5,
			rows: [
				{ value: 5, description: 'Outstanding - Consistently exceeds expectations' },
				{ value: 4, description: 'Very Good - Frequently exceeds expectations' },
				{ value: 3, description: 'Satisfactory - Meets expectations' },
				{ value: 2, description: 'Needs improvement - Occasionally falls short' },
				{ value: 1, description: 'Unsatisfactory - Consistently below expectations' }
			]
		},
		sections: [
			{
				id: newId('sec'),
				name: '',
				weightLabel: '',
				maximum: null,
				criteria: [{ id: newId('crit'), text: '' }]
			}
		],
		interpretationBands: [
			{ id: newId('band'), rangeLabel: '95-100', label: 'Outstanding' },
			{ id: newId('band'), rangeLabel: '90-94', label: 'Very Good' },
			{ id: newId('band'), rangeLabel: '85-89', label: 'Good' },
			{ id: newId('band'), rangeLabel: '80-84', label: 'Satisfactory' },
			{ id: newId('band'), rangeLabel: '75-79', label: 'Needs Improvement' },
			{ id: newId('band'), rangeLabel: 'Below 75', label: 'Unsatisfactory' }
		],
		totalCeiling: 100,
		narrativeBlocks: [
			{ id: newId('nb'), label: 'Strengths' },
			{ id: newId('nb'), label: 'Areas for Improvement' },
			{ id: newId('nb'), label: 'Development Plan' }
		],
		recommendationOptions: [
			{ id: newId('rec'), label: 'Regularization', allowsFreeText: false },
			{ id: newId('rec'), label: 'Salary Increase', allowsFreeText: false },
			{ id: newId('rec'), label: 'Promotion Candidate', allowsFreeText: false },
			{ id: newId('rec'), label: 'Performance Improvement Plan (PIP)', allowsFreeText: false },
			{ id: newId('rec'), label: 'Further Coaching Required', allowsFreeText: false },
			{ id: newId('rec'), label: 'Other', allowsFreeText: true }
		],
		signatoryOrder: [
			{ id: newId('sig'), role: 'IMMEDIATE_SUPERVISOR', label: 'Immediate Supervisor' },
			{ id: newId('sig'), role: 'HR_REPRESENTATIVE', label: 'HR Representative' },
			{ id: newId('sig'), role: 'DEPARTMENT_HEAD', label: 'Department Head' },
			{ id: newId('sig'), role: 'EMPLOYEE', label: 'Employee' }
		]
	}
}

// ── Capture-time answers (plan §5, boundary #6) ──────────────────────────────

// answersSchemaFor(snapshot) builds a zod schema BOUND to one review's snapshot. It is the
// only place the "validate but never calculate" line is enforced, and it must not be
// duplicated at any call site.
//
// It enforces exactly four things:
//   1. every criterion key exists in the snapshot (unknown key → reject)
//   2. each rating is an integer within [ratingScale.min, ratingScale.max]
//   3. each section subtotal is a non-negative integer <= that section's `maximum`
//      (a section with maximum === null accepts NO subtotal at all)
//   4. totalScore is a non-negative integer <= structure.totalCeiling
// and that interpretationBandId / recommendationIds / narrative keys / kpi keys all exist in
// the snapshot.
//
// It DOES NOT and MUST NOT: sum criteria, compare a subtotal to the sum of its criteria,
// compare the total to the sum of the subtotals, or check that the picked band matches the
// typed total. HR calculates; a mismatch is HR's number to own, not the app's to reject.
// The third generic is `unknown` because the numeric fields are `z.coerce` — form posts arrive
// as strings. The output type is `Answers` exactly.
export function answersSchemaFor(
	structure: TemplateStructure
): ZodType<Answers, ZodTypeDef, unknown> {
	const { min, max } = structure.ratingScale
	// Section id → its declared maximum. `null` means the section captures no subtotal at all.
	const sectionMaxima = new Map(structure.sections.map((s) => [s.id, s.maximum]))
	const criterionIds = new Set(structure.sections.flatMap((s) => s.criteria.map((c) => c.id)))
	const bandIds = new Set(structure.interpretationBands.map((b) => b.id))
	const narrativeIds = new Set(structure.narrativeBlocks.map((n) => n.id))
	const recommendationIds = new Set(structure.recommendationOptions.map((r) => r.id))
	const kpiIds = new Set((structure.kpiRows ?? []).map((k) => k.id))

	return z
		.object({
			version: z.literal(1),
			criteria: z.record(
				z
					.object({
						// Ints only. No `.multipleOf(0.5)`, no Decimal — fractions are not a thing here.
						rating: z.coerce
							.number()
							.int('A rating must be a whole number')
							.min(min, `A rating cannot be below ${min}`)
							.max(max, `A rating cannot be above ${max}`),
						remark: z.string().optional()
					})
					.strict()
			),
			// The per-section ceiling is keyed by section id, so it is checked in the refine below.
			sectionSubtotals: z.record(
				z.coerce.number().int('A subtotal must be a whole number').nonnegative()
			),
			totalScore: z.coerce
				.number()
				.int('The total must be a whole number')
				.nonnegative()
				.max(structure.totalCeiling, `The total cannot exceed ${structure.totalCeiling}`),
			interpretationBandId: z.string(),
			narratives: z.record(z.string()),
			recommendationIds: z.array(z.string()),
			recommendationOther: z.string().optional(),
			kpiActuals: z.record(z.string()).optional()
		})
		.strict()
		.superRefine((answers, ctx) => {
			const reject = (path: (string | number)[], message: string) =>
				ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })

			for (const id of Object.keys(answers.criteria)) {
				if (!criterionIds.has(id)) {
					reject(['criteria', id], `"${id}" is not a criterion on this review's form`)
				}
			}

			for (const [id, subtotal] of Object.entries(answers.sectionSubtotals)) {
				if (!sectionMaxima.has(id)) {
					reject(['sectionSubtotals', id], `"${id}" is not a category on this review's form`)
					continue
				}
				const maximum = sectionMaxima.get(id) ?? null
				if (maximum === null) {
					reject(['sectionSubtotals', id], 'This category has no subtotal line')
				} else if (subtotal > maximum) {
					reject(['sectionSubtotals', id], `This subtotal cannot exceed ${maximum}`)
				}
			}

			if (!bandIds.has(answers.interpretationBandId)) {
				reject(['interpretationBandId'], 'Pick an interpretation band from this form')
			}

			for (const id of Object.keys(answers.narratives)) {
				if (!narrativeIds.has(id)) {
					reject(['narratives', id], `"${id}" is not a narrative block on this review's form`)
				}
			}

			answers.recommendationIds.forEach((id, i) => {
				if (!recommendationIds.has(id)) {
					reject(['recommendationIds', i], `"${id}" is not a recommendation on this review's form`)
				}
			})

			for (const id of Object.keys(answers.kpiActuals ?? {})) {
				if (!kpiIds.has(id)) {
					reject(['kpiActuals', id], `"${id}" is not a KPI row on this review's form`)
				}
			}
		})
}

// ── The remaining write boundaries (plan §5) ─────────────────────────────────
// `releaseSchema` is deliberately absent: the RELEASE action's only input is the route param,
// and inventing a body shape now would be a guess Phase 8 has to undo.

/** Employee's own pre-scoring self-assessment. */
export const selfAssessmentSchema = z.object({
	selfAssessment: z.string().trim().min(1, 'Self-assessment cannot be empty')
})

/** The paper form's "Employee Comments" — employee-authored, ALWAYS visible to them. */
export const employeeCommentsSchema = z.object({
	employeeComments: z.string().trim().min(1, 'Comments cannot be empty')
})

/** One signatory attesting one slot: typed name + the slot they claim. */
export const signoffSchema = z.object({
	slotId: z.string().min(1),
	typedName: z.string().trim().min(1, 'Type your full name to sign').max(200)
})

/** HR assigning a template to an employee. Empty string = "— none —", stored as null. */
export const assignTemplateSchema = z.object({
	assignedTemplateId: z
		.string()
		.trim()
		.transform((v) => (v === '' ? null : v))
		.nullable()
})

/** Per-org cadence. Bounds mirror the schema comment on `PerformanceConfig.intervalMonths`. */
export const performanceConfigSchema = z.object({
	enabled: z.boolean(),
	intervalMonths: z.coerce.number().int().min(1).max(24),
	dueDays: z.coerce.number().int().min(0).max(365)
})

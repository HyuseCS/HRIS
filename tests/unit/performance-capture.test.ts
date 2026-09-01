import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from 'svelte/server'
import type { Role } from '@prisma/client'
import ReviewFormRender from '../../src/lib/components/performance/ReviewFormRender.svelte'
import { accountExecutive, adminStaff } from '../../prisma/seed-performance-templates'
import { answerDraft, serialiseAnswers } from '../../src/lib/components/performance/answer-draft'

/**
 * #178 SPEC AC4 — THE ROUND TRIP. What the evaluator TYPES is what is STORED is what is RENDERED
 * BACK, across repeated reads.
 *
 * This is the test that catches a scoring engine. The app performs no arithmetic on evaluation
 * scores, so every number below must survive the whole path untouched — and the fixtures are
 * chosen so that any arithmetic would be visible: the typed subtotals are NOT the sums of their
 * criteria, the typed total is NOT the sum of the subtotals, and the picked band is NOT the one
 * whose range contains the total. If anything ever sums, weights, rounds, clamps or "corrects"
 * these values, the deep-equals below go red.
 *
 * It runs the REAL path end to end, not a re-implementation of it:
 *
 *   answerDraft (what the form shows)
 *     → serialiseAnswers (the one `answers` form field)
 *       → the real `?/submitScores` action
 *         → the real `answersSchemaFor` parse
 *           → the real `submitScores` service
 *             → the exact object handed to Prisma
 *               → answerDraft again (what the form shows next time)
 *
 * Prisma and the audit log are the only mocks. Strings are deliberately awkward — leading and
 * trailing spaces, a newline, quotes, a non-ASCII character, "0" and "007" — because a silent
 * `.trim()`, a JSON re-encode or a number coercion anywhere on that path would eat exactly those.
 */

const { dbMock, txMock, writeAuditLog } = vi.hoisted(() => {
	// #324: `submitScores` now writes the update and its audit row in one transaction, so the
	// update the assertions read is the one made on the tx client.
	const txMock = { performanceReview: { update: vi.fn() } }
	return {
		txMock,
		dbMock: {
			performanceReview: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
			employee: { findUnique: vi.fn() },
			$transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
		},
		writeAuditLog: vi.fn()
	}
})
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const page = await import('../../src/routes/(app)/performance/reviews/[id]/+page.server')

const ORG = 'org_seed'
const REVIEW_ID = 'rev_1'
const REVIEWER = 'emp_reviewer'
const structure = adminStaff()
const snapshot = {
	version: 1,
	templateId: 'tmpl_admin',
	templateName: 'Admin Staff',
	snapshotAt: '2026-08-01T00:00:00.000Z',
	structure
}

/** The ids the evaluator is typing against, taken from the snapshot rather than invented. */
const allCriteria = structure.sections.flatMap((s) => s.criteria)
const untouched = allCriteria[allCriteria.length - 1]
const typedCriteria = allCriteria.slice(0, -1)

/** Every string here is exactly what the evaluator typed, awkwardness included. */
const REMARKS = [
	'  leading and trailing spaces  ',
	'two\nlines',
	'quotes "inside" and a backslash \\',
	'0',
	'007',
	'ñ, ≥99% and an em—dash'
]

const TYPED = {
	ratings: (i: number) => String((i % 5) + 1),
	remark: (i: number) => REMARKS[i % REMARKS.length],
	// NOT the sums of their criteria — on purpose. Each is well under its section maximum.
	subtotals: ['21', '19', '0', '23', '7'],
	// NOT the sum of the subtotals (which is 70). Also not a round number.
	totalScore: '88',
	// NOT the band whose range contains 88. The evaluator picks; nothing looks it up.
	bandIndex: 5,
	narrative: (i: number) => `narrative ${i} — ${REMARKS[i % REMARKS.length]}`,
	kpi: (i: number) => (i === 0 ? '98%' : i === 1 ? '  same business day  ' : `${i}`)
}

/** Fills a fresh draft the way the evaluator would fill the form, and returns it. */
function typedDraft() {
	const draft = answerDraft(structure, null)
	typedCriteria.forEach((criterion, i) => {
		draft.criteria[criterion.id] = { rating: TYPED.ratings(i), remark: TYPED.remark(i) }
	})
	structure.sections.forEach((section, i) => {
		draft.sectionSubtotals[section.id] = TYPED.subtotals[i]
	})
	draft.totalScore = TYPED.totalScore
	draft.interpretationBandId = structure.interpretationBands[TYPED.bandIndex].id
	structure.narrativeBlocks.forEach((block, i) => {
		draft.narratives[block.id] = TYPED.narrative(i)
	})
	draft.recommendationIds = [
		structure.recommendationOptions[0].id,
		structure.recommendationOptions[5].id
	]
	draft.recommendationOther = 'Lateral move to Enterprise Sales'
	;(structure.kpiRows ?? []).forEach((kpi, i) => {
		draft.kpiActuals[kpi.id] = TYPED.kpi(i)
	})
	return draft
}

const event = (answers: string) =>
	({
		request: {
			formData: async () => {
				const fd = new FormData()
				fd.set('answers', answers)
				return fd
			}
		},
		locals: { user: { id: 'user_reviewer', organizationId: ORG, roles: ['MANAGER' as Role] } },
		params: { id: REVIEW_ID },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** Runs the real action and returns the exact `answers` object handed to Prisma. */
async function submit(answersField: string) {
	txMock.performanceReview.update.mockImplementation(({ data }: { data: unknown }) => ({
		...(data as object),
		id: REVIEW_ID
	}))
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const result = await (page.actions.submitScores as any)(event(answersField))
	expect(result, `the action rejected the submission: ${JSON.stringify(result)}`).toEqual({
		success: true
	})
	return txMock.performanceReview.update.mock.calls[0][0].data.answers
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
	dbMock.employee.findUnique.mockResolvedValue({ id: REVIEWER })
	dbMock.performanceReview.findFirst.mockResolvedValue({
		id: REVIEW_ID,
		status: 'PENDING',
		templateSnapshot: snapshot,
		answers: null,
		employee: { id: 'emp_subject', firstName: 'A', lastName: 'B' },
		reviewer: { id: REVIEWER, firstName: 'C', lastName: 'D' },
		cycle: { id: 'cyc_1', name: 'Cycle', status: 'ACTIVE' }
	})
	dbMock.performanceReview.findUnique.mockResolvedValue({
		id: REVIEW_ID,
		reviewerId: REVIEWER,
		templateSnapshot: snapshot
	})
})

describe('an empty form starts empty — no zeroes anywhere', () => {
	it('gives every field of the snapshot a slot, and every numeric slot is blank', () => {
		const draft = answerDraft(structure, null)

		expect(Object.keys(draft.criteria).sort()).toEqual(allCriteria.map((c) => c.id).sort())
		// A `0` here would be the app answering for the evaluator, and would read as a real score.
		for (const answer of Object.values(draft.criteria)) expect(answer.rating).toBe('')
		for (const subtotal of Object.values(draft.sectionSubtotals)) expect(subtotal).toBe('')
		expect(draft.totalScore).toBe('')
		expect(draft.interpretationBandId).toBe('')
		expect(draft.recommendationIds).toEqual([])
	})

	it('gives no subtotal slot to a category that declares no maximum', () => {
		// The AE form's Section 3 — the paper form prints no subtotal line for it, and the server
		// rejects one, so the form must not offer a box.
		const ae = accountExecutive()
		const unbounded = ae.sections.filter((s) => s.maximum === null)
		expect(unbounded).toHaveLength(1)

		const slots = Object.keys(answerDraft(ae, null).sectionSubtotals)
		expect(slots).not.toContain(unbounded[0].id)
		expect(slots).toHaveLength(ae.sections.length - 1)
	})
})

describe('what the evaluator typed is what is stored (AC4)', () => {
	it('stores every value verbatim, and nothing it was not given', async () => {
		const stored = await submit(serialiseAnswers(typedDraft()))

		expect(stored).toEqual({
			version: 1,
			criteria: Object.fromEntries(
				typedCriteria.map((criterion, i) => [
					criterion.id,
					{ rating: Number(TYPED.ratings(i)), remark: TYPED.remark(i) }
				])
			),
			sectionSubtotals: Object.fromEntries(
				structure.sections.map((section, i) => [section.id, Number(TYPED.subtotals[i])])
			),
			totalScore: 88,
			interpretationBandId: structure.interpretationBands[TYPED.bandIndex].id,
			narratives: Object.fromEntries(
				structure.narrativeBlocks.map((block, i) => [block.id, TYPED.narrative(i)])
			),
			recommendationIds: [
				structure.recommendationOptions[0].id,
				structure.recommendationOptions[5].id
			],
			recommendationOther: 'Lateral move to Enterprise Sales',
			kpiActuals: Object.fromEntries(
				(structure.kpiRows ?? []).map((kpi, i) => [kpi.id, TYPED.kpi(i)])
			)
		})

		// A criterion the evaluator never touched is absent, not stored as a zero rating.
		expect(stored.criteria).not.toHaveProperty(untouched.id)
	})

	it('writes the scores and their audit row in ONE transaction (#324)', async () => {
		await submit(serialiseAnswers(typedDraft()))

		// The mutation ran on the tx client, never on the shared `db`.
		expect(txMock.performanceReview.update).toHaveBeenCalledTimes(1)
		expect(dbMock.performanceReview.update).not.toHaveBeenCalled()
		// And the audit write shares that transaction: a failed audit rolls the scores back
		// instead of leaving them standing unrecorded behind a 500.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), txMock)
	})

	it('leaves awkward text exactly as typed — no trim, no re-encode', async () => {
		const stored = await submit(serialiseAnswers(typedDraft()))
		const remarks = typedCriteria.map((c) => stored.criteria[c.id].remark)

		expect(remarks).toContain('  leading and trailing spaces  ')
		expect(remarks).toContain('two\nlines')
		expect(remarks).toContain('quotes "inside" and a backslash \\')
		// "007" must not come back as 7, and "0" must stay a string: remarks are text, not numbers.
		expect(remarks).toContain('007')
		expect(remarks).toContain('0')
		expect(remarks).toContain('ñ, ≥99% and an em—dash')

		// KPI actuals are free text compared to nothing. "98%" is not a number and must not become one.
		const kpiIds = (structure.kpiRows ?? []).map((k) => k.id)
		expect(stored.kpiActuals[kpiIds[0]]).toBe('98%')
		expect(stored.kpiActuals[kpiIds[1]]).toBe('  same business day  ')
		expect(typeof stored.kpiActuals[kpiIds[2]]).toBe('string')
	})

	it('stores the typed numbers even though they add up to nothing in particular', async () => {
		const stored = await submit(serialiseAnswers(typedDraft()))

		// The proof that nothing computed: each of these would be a DIFFERENT number if it had been.
		const firstSection = structure.sections[0]
		let sumOfFirstSection = 0
		for (const criterion of firstSection.criteria) {
			sumOfFirstSection += stored.criteria[criterion.id]?.rating ?? 0
		}
		expect(stored.sectionSubtotals[firstSection.id]).toBe(21)
		expect(stored.sectionSubtotals[firstSection.id]).not.toBe(sumOfFirstSection)

		let sumOfSubtotals = 0
		for (const section of structure.sections) sumOfSubtotals += stored.sectionSubtotals[section.id]
		expect(sumOfSubtotals).toBe(70)
		expect(stored.totalScore).toBe(88)

		// 88 falls in the "90-94"/"85-89" region of the seeded bands; the evaluator picked the last
		// band anyway, and the app kept their choice.
		expect(stored.interpretationBandId).toBe(structure.interpretationBands[5].id)
	})

	it('sends a subtotal a category never got as a blank, not as a zero', async () => {
		const draft = typedDraft()
		draft.sectionSubtotals[structure.sections[1].id] = ''
		const stored = await submit(serialiseAnswers(draft))

		// `z.coerce.number()` turns "" into 0, and a silent zero is indistinguishable from a typed
		// one on an HR record — so an untouched box is omitted instead of sent.
		expect(stored.sectionSubtotals).not.toHaveProperty(structure.sections[1].id)
		expect(answerDraft(structure, stored).sectionSubtotals[structure.sections[1].id]).toBe('')
	})
})

describe('what is stored is what is rendered back, read after read (AC4)', () => {
	it('renders back exactly what was typed', async () => {
		const typed = typedDraft()
		const stored = await submit(serialiseAnswers(typed))

		expect(answerDraft(structure, stored)).toEqual(typed)
	})

	it('is stable across repeated reads and re-submits', async () => {
		const typed = typedDraft()
		const first = await submit(serialiseAnswers(typed))

		// Read it back, submit exactly that, read it back again — three times. A value that drifts
		// by rounding, trimming or re-deriving moves on one of these passes.
		let readBack = answerDraft(structure, first)
		let stored = first
		for (let pass = 0; pass < 3; pass++) {
			vi.clearAllMocks()
			dbMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) =>
				fn(txMock)
			)
			dbMock.employee.findUnique.mockResolvedValue({ id: REVIEWER })
			dbMock.performanceReview.findFirst.mockResolvedValue({
				id: REVIEW_ID,
				status: 'SCORED',
				templateSnapshot: snapshot,
				answers: stored,
				employee: { id: 'emp_subject', firstName: 'A', lastName: 'B' },
				reviewer: { id: REVIEWER, firstName: 'C', lastName: 'D' },
				cycle: { id: 'cyc_1', name: 'Cycle', status: 'ACTIVE' }
			})
			dbMock.performanceReview.findUnique.mockResolvedValue({
				id: REVIEW_ID,
				reviewerId: REVIEWER,
				templateSnapshot: snapshot
			})

			stored = await submit(serialiseAnswers(readBack))
			expect(stored).toEqual(first)
			readBack = answerDraft(structure, stored)
			expect(readBack).toEqual(typed)
		}
	})
})

describe('the form itself renders it back — one component, two modes', () => {
	/** The real component, server-rendered. Not a description of what it would draw. */
	const html = (props: Record<string, unknown>) =>
		render(ReviewFormRender, { props: { structure, ...props } }).body

	it('shows the stored values in `fill`, read straight back out of what Prisma was given', async () => {
		const stored = await submit(serialiseAnswers(typedDraft()))
		const body = html({ mode: 'fill', answers: answerDraft(structure, stored), disabled: true })

		expect(body).toContain('value="88"') // the typed total
		expect(body).toContain('value="21"') // the first typed subtotal
		expect(body).toContain('value="98%"') // a KPI actual, still free text
		expect(body).toContain('two\nlines') // a remark, newline intact
		// The band the evaluator picked is the selected one — not one looked up from 88.
		expect(body).toContain(`value="${structure.interpretationBands[5].id}" selected`)
	})

	it('shows EMPTY boxes in `preview` — never a zero, never a value', () => {
		const body = html({ mode: 'preview' })

		// The builder's pane must promise nothing about numbers. A `0 / 100` there would teach HR
		// exactly the wrong model of who calculates.
		expect(body).toContain('written in by the evaluator')
		expect(body).not.toContain('value="0"')
		expect(body).not.toContain('value="88"')
		// And it is the SAME component the evaluator fills in, so the field lists cannot drift.
		for (const criterion of allCriteria) expect(body).toContain(criterion.text)
	})
})

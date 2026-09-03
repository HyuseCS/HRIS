import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #178 item 127/136 — SPEC AC8 at the API layer.
 *
 * `GET /api/v1/performance/reviews` returns two arms. The page load has always redacted the
 * subject's view; this endpoint did not. That was a latent inconsistency until `answers` started
 * holding every rating, remark, subtotal, total, band and narrative the evaluator typed — at which
 * point an employee calling this endpoint about their own review received the entire evaluation
 * before HR released anything. Withheld by default.
 *
 * Only `$lib/server/db` and the audit writer are mocked, so the real route calls the real
 * `listReviewsForEmployee` and the real `redactForSubject`. Deleting `.map(redactForSubject)` from
 * the route turns this file red.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn() },
		performanceReview: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { GET } = await import('../../src/routes/api/v1/performance/reviews/+server')

const ANSWERS = {
	version: 1,
	criteria: { crit_quality: { rating: 4, remark: 'Hit target in 5 of 6 months.' } },
	sectionSubtotals: { sec_core: 26 },
	totalScore: 88,
	interpretationBandId: 'band_outstanding',
	narratives: { nb_strengths: 'Closes hard deals.' },
	recommendationIds: ['rec_regular']
}

// Every evaluator-authored token that must not reach the subject, including the values nested
// inside the JSON column. A partial leak — `answers` nulled but a rating echoed under some other
// key — has to fail this list, not just an `answers === null` check.
const EVALUATOR_TOKENS = [
	'crit_quality',
	'Hit target in 5 of 6 months.',
	'sec_core',
	'88',
	'band_outstanding',
	'Closes hard deals.',
	'rec_regular',
	'Exceeds expectations; promote next cycle.'
]

const SUBJECT_REVIEW = {
	id: 'rev-subject',
	employeeId: 'emp1',
	reviewerId: 'mgr1',
	status: 'SCORED',
	// employee-authored — the subject wrote these and must keep seeing them
	selfAssessment: 'I shipped the payroll module.',
	employeeComments: 'Noted, thank you.',
	// evaluator-authored — must not survive
	managerComments: 'Exceeds expectations; promote next cycle.',
	overallRating: 5,
	answers: ANSWERS,
	cycle: { id: 'cyc1', name: 'H1 2026', status: 'ACTIVE' },
	reviewer: { id: 'mgr1', firstName: 'Maria', lastName: 'Santos' }
}

const REVIEWER_REVIEW = {
	id: 'rev-reviewer',
	employeeId: 'emp2',
	reviewerId: 'emp1',
	status: 'SCORED',
	selfAssessment: null,
	employeeComments: null,
	managerComments: 'Meets expectations.',
	overallRating: 3,
	answers: ANSWERS,
	cycle: { id: 'cyc1', name: 'H1 2026', status: 'ACTIVE' },
	employee: { id: 'emp2', firstName: 'Jose', lastName: 'Cruz' }
}

function callGet() {
	return GET({ locals: { user: { id: 'u1' } } } as never)
}

describe('GET /api/v1/performance/reviews redaction (#178 AC8)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbMock.employee.findFirst.mockResolvedValue({ id: 'emp1' })
		dbMock.performanceReview.findMany.mockImplementation(
			async ({ where }: { where: { employeeId?: string; reviewerId?: string } }) =>
				where.employeeId ? [SUBJECT_REVIEW] : [REVIEWER_REVIEW]
		)
	})

	it('nulls answers on the subject arm', async () => {
		const body = await (await callGet()).json()
		expect(body.asSubject).toHaveLength(1)
		expect(body.asSubject[0].answers).toBeNull()
		expect(body.asSubject[0].managerComments).toBeNull()
		expect(body.asSubject[0].overallRating).toBeNull()
	})

	it('leaves no evaluator-typed value anywhere in the subject arm', async () => {
		const body = await (await callGet()).json()
		// Serialise the whole arm, not just `answers`: this catches a partial leak where the blob
		// is nulled but a rating, band or narrative is echoed under another key.
		const serialized = JSON.stringify(body.asSubject)
		for (const token of EVALUATOR_TOKENS) {
			expect(serialized).not.toContain(token)
		}
	})

	it('still returns what the subject IS allowed to see (positive control)', async () => {
		const body = await (await callGet()).json()
		const row = body.asSubject[0]
		expect(row.id).toBe('rev-subject')
		expect(row.status).toBe('SCORED')
		expect(row.selfAssessment).toBe('I shipped the payroll module.')
		expect(row.employeeComments).toBe('Noted, thank you.')
		expect(row.cycle).toEqual({ id: 'cyc1', name: 'H1 2026', status: 'ACTIVE' })
		expect(row.reviewer).toEqual({ id: 'mgr1', firstName: 'Maria', lastName: 'Santos' })
	})

	it('leaves the reviewer arm whole — the evaluator reads their own work', async () => {
		const body = await (await callGet()).json()
		expect(body.asReviewer).toHaveLength(1)
		expect(body.asReviewer[0].answers).toEqual(ANSWERS)
		expect(body.asReviewer[0].managerComments).toBe('Meets expectations.')
	})

	it('returns empty arms when the user has no employee record', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		const body = await (await callGet()).json()
		expect(body).toEqual({ asSubject: [], asReviewer: [] })
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #282 §3-B — `/performance/reviews/[id]`.
 *
 * The comment on the guard says "a review is private to its two participants… HR may read any
 * review in the org", but the guard was `requireAnyMinRole(user.roles,'HR_ADMIN')`, which MANAGER
 * clears (#133) — so any manager read any employee's self-assessment, manager comments and rating.
 *
 * Fixed with `assertCanTouchEmployee` (decision B3), the object-level check. Note this both NARROWS
 * (a manager loses strangers) and WIDENS (an EMPLOYEE-role supervisor or branch manager gains their
 * own people, who are 403'd today) — accepted knowingly, because it matches how /employees/[id]
 * already scopes exactly those people.
 */

const { dbMock, listReportIdsFor, getReview, redactForSubject } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	getReview: vi.fn(),
	redactForSubject: vi.fn(),
	dbMock: {
		employee: { findFirst: vi.fn() },
		branch: { findMany: vi.fn() },
		// #178 item 143 — the load also reads the sign-off relations. Not what this file guards,
		// so it resolves to nothing: no snapshot, no slots, no signature block.
		performanceReview: { findFirst: vi.fn(), findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))

/**
 * SPREAD THE REAL MODULE, override two exports.
 *
 * This mock's hand-written export list broke three times during #178 — every phase that added an
 * import to the route turned this file red, and a partial factory can also go GREEN while proving
 * nothing, because the missing export is only reached on a path the test does not take. Spreading
 * `importOriginal()` ends both failure modes: a new export needs no edit here.
 *
 * `redactForSubject` is a SPY WRAPPING THE REAL FUNCTION, not an identity stub. The call
 * assertions below still work, and the API-route case at the bottom gets real redaction on real
 * data — an identity stub there would have proved nothing at all.
 */
vi.mock('$lib/server/services/performance', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/services/performance')>()
	redactForSubject.mockImplementation(actual.redactForSubject)
	return { ...actual, getReview, redactForSubject }
})

const { load } = await import('../../src/routes/(app)/performance/reviews/[id]/+page.server')
const { GET } = await import('../../src/routes/api/v1/performance/reviews/+server')

const ORG = 'org1'
const ME = 'me-emp'
const SUBJECT = 'subject-emp'
const REVIEWER = 'reviewer-emp'

/**
 * #6 collapsed the route's own "who am I" lookup, `canTouchEmployee`'s self lookup, and its closing
 * target lookup onto ONE `findFirst` mock — the first two share the exact where-shape
 * (`where: { userId, organizationId }`), and the third is keyed by `id` instead. `selfRow` answers
 * both userId-keyed calls (they resolve the same actor, so they must agree), `targetRow` answers the
 * id-keyed one. A plain `mockResolvedValue` would hand the target's `{ branchId }` row to a
 * userId-keyed call, leaving `.id` undefined and turning every fail-closed case green for the wrong
 * reason.
 */
let selfRow: { id: string } | null
let targetRow: { branchId: string | null } | null

const event = (roles: Role[]) =>
	({
		locals: { user: { id: 'user-actor', organizationId: ORG, roles } },
		params: { id: 'review1' }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** `PageServerLoad` widens its return to `void | …`; every case here wants the object. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadData = (roles: Role[]) => load(event(roles)) as Promise<any>

beforeEach(() => {
	vi.clearAllMocks()
	getReview.mockResolvedValue({
		id: 'review1',
		employee: { id: SUBJECT },
		reviewer: { id: REVIEWER },
		managerComments: 'private',
		overallRating: 4,
		// #178 item 156 — a TEMPLATE-BASED review, the shape every review has since Phase 5.
		// The old fixture predated the template work, so the 403 was last proven against a review
		// that can no longer exist.
		templateSnapshot: { structure: { version: 1 } },
		answers: { totalScore: 88, narratives: { nb_strengths: 'Closes hard deals.' } },
		releasedAt: null
	})
	dbMock.performanceReview.findMany.mockResolvedValue([])
	selfRow = { id: ME }
	targetRow = { branchId: null }
	dbMock.employee.findFirst.mockImplementation(({ where }) =>
		Promise.resolve(where.userId ? selfRow : targetRow)
	)
	dbMock.branch.findMany.mockResolvedValue([])
	dbMock.performanceReview.findFirst.mockResolvedValue(null)
	listReportIdsFor.mockResolvedValue([])
})

describe('review privacy is object-scoped, not rank-scoped (#282 §3-B)', () => {
	it('denies a MANAGER who is neither participant nor the subject’s manager', async () => {
		await expect(load(event(['MANAGER']))).rejects.toMatchObject({ status: 403 })
		// The leak was the review body coming back — pin that nothing is returned, not just a status.
		expect(redactForSubject).not.toHaveBeenCalled()
	})

	it('denies that MANAGER a TEMPLATE-BASED review too (#178 item 156, AC9)', async () => {
		// Same guard, re-proven against the shape reviews actually have now: a snapshotted template
		// and an `answers` blob. A 403 proven only against the pre-template fixture would not tell
		// anyone whether the evaluation itself is reachable.
		const result = await loadData(['MANAGER']).catch((e: unknown) => e)
		expect(result).toMatchObject({ status: 403 })
		expect(JSON.stringify(result)).not.toContain('Closes hard deals.')
		expect(JSON.stringify(result)).not.toContain('88')
	})

	it('allows HR_ADMIN any review in the org', async () => {
		const res = await loadData(['HR_ADMIN'])
		expect(res.review).toMatchObject({ id: 'review1' })
		expect(res.isSubject).toBe(false)
	})

	it('allows a MANAGER the review of their own report (B3)', async () => {
		listReportIdsFor.mockResolvedValue([SUBJECT])
		const res = await loadData(['MANAGER'])
		expect(res.review).toMatchObject({ id: 'review1' })
	})

	it('still lets the subject read their own review, redacted (#179)', async () => {
		selfRow = { id: SUBJECT }
		const res = await loadData(['EMPLOYEE'])
		expect(res.isSubject).toBe(true)
		// Pins that the fix did not over-narrow: a participant never reaches the object check.
		expect(redactForSubject).toHaveBeenCalled()
		// AND that it actually redacted. The spy wraps the REAL function, so this is the returned
		// payload, not the mock's word for it — the whole page data is searched, because a partial
		// leak echoes a value under some other key while `answers` reads null.
		expect(res.review.answers).toBeNull()
		expect(JSON.stringify(res)).not.toContain('Closes hard deals.')
		expect(JSON.stringify(res)).not.toContain('88')
	})

	it('still lets the reviewer read it unredacted', async () => {
		selfRow = { id: REVIEWER }
		const res = await loadData(['EMPLOYEE'])
		expect(res.isReviewer).toBe(true)
		expect(redactForSubject).not.toHaveBeenCalled()
	})
})

/**
 * #178 item 156 — SPEC AC8 AT THE API LAYER, in this file, on purpose.
 *
 * The page load and `GET /api/v1/performance/reviews` are two doors to the same review, and this
 * file's whole subject is who may open which door. A page-load-only proof leaves the endpoint
 * unwatched, which is exactly how the endpoint shipped unredacted until item 127.
 *
 * The real service and the real redaction run here — only `$lib/server/db` is mocked.
 */
describe('the same privacy rule at the API layer (#178 item 156, AC8)', () => {
	const ANSWERS = {
		version: 1,
		criteria: { crit_quality: { rating: 4, remark: 'Hit target in 5 of 6 months.' } },
		totalScore: 88,
		narratives: { nb_strengths: 'Closes hard deals.' }
	}

	const row = (released: Date | null) => ({
		id: 'review1',
		employeeId: SUBJECT,
		reviewerId: REVIEWER,
		status: 'SCORED',
		selfAssessment: 'I shipped the payroll module.',
		employeeComments: 'Noted, thank you.',
		managerComments: 'private',
		overallRating: 4,
		answers: ANSWERS,
		releasedAt: released
	})

	const callGet = () => GET({ locals: { user: { id: 'user-actor' } } } as never)

	beforeEach(() => {
		selfRow = { id: SUBJECT }
	})

	it('withholds the evaluation from its subject while it is unreleased', async () => {
		dbMock.performanceReview.findMany.mockImplementation(
			async ({ where }: { where: { employeeId?: string } }) => (where.employeeId ? [row(null)] : [])
		)
		const body = await (await callGet()).json()
		expect(body.asSubject[0].answers).toBeNull()
		expect(body.asSubject[0].managerComments).toBeNull()
		const serialized = JSON.stringify(body.asSubject)
		for (const token of [
			'crit_quality',
			'Hit target in 5 of 6 months.',
			'88',
			'Closes hard deals.',
			'private'
		]) {
			expect(serialized).not.toContain(token)
		}
		// POSITIVE CONTROL: the probe can see anything at all. Without this the assertions above
		// would also pass on an empty response.
		expect(body.asSubject[0].employeeComments).toBe('Noted, thank you.')
		expect(body.asSubject[0].selfAssessment).toBe('I shipped the payroll module.')
	})

	it('hands it over once HR has released it — the negative control for the case above', async () => {
		dbMock.performanceReview.findMany.mockImplementation(
			async ({ where }: { where: { employeeId?: string } }) =>
				where.employeeId ? [row(new Date('2026-08-27T02:00:00Z'))] : []
		)
		const body = await (await callGet()).json()
		expect(body.asSubject[0].answers).toEqual(ANSWERS)
		expect(body.asSubject[0].managerComments).toBe('private')
	})
})

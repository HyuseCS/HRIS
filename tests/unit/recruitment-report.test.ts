import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * #197 — `generateRecruitmentReport`, the Detailed Reports row mapper for recruitment.
 *
 * A pure read-and-map: no guards, no writes. Two consumers depend on the row SHAPE literally —
 * the reports table renders `row[column]` and the CSV export uses the object keys as headers —
 * so a renamed key is a silently broken export, not a type error. Same reasoning as
 * `separation-report.test.ts`.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: { jobPosting: { findMany: vi.fn() } }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { generateRecruitmentReport } = await import('$lib/server/services/recruitment')

const RANGE = { startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') }

/** An applicant that reached `stages` in order and now sits at the last one given. */
const applicant = (current: string, ...reached: string[]) => ({
	currentStage: current,
	stageHistory: reached.map((stage) => ({ stage }))
})

/**
 * Both dates sit on a day boundary in UTC: one late (20:00Z), one early (02:00Z). That is
 * deliberate — the mapper uses `toISOString()`, so in ANY timezone with a non-zero offset at
 * least one row renders a different day than the local calendar date would. A switch to a
 * local-date formatter turns this file red instead of green.
 */
function postings() {
	return [
		{
			title: 'Software Developer',
			status: 'CLOSED',
			postedAt: new Date('2026-06-01T20:00:00Z'),
			closedAt: new Date('2026-07-15T02:00:00Z'),
			department: { name: 'Engineering' },
			applicants: [
				// Interviewed, then rejected. `currentStage` has moved on — only history remembers.
				applicant('REJECTED', 'APPLIED', 'SCREENING', 'INTERVIEW'),
				applicant('HIRED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED'),
				applicant('SCREENING', 'APPLIED', 'SCREENING')
			]
		},
		{
			title: 'HR Assistant',
			status: 'OPEN',
			postedAt: new Date('2026-07-20T00:00:00Z'),
			closedAt: null,
			department: { name: 'Human Resources' },
			applicants: []
		}
	]
}

beforeEach(() => {
	vi.clearAllMocks()
	// DaysOpen on an OPEN posting measures against "now", so pin it.
	vi.useFakeTimers()
	vi.setSystemTime(new Date('2026-08-19T00:00:00Z'))
	dbMock.jobPosting.findMany.mockResolvedValue(postings())
})

afterEach(() => {
	vi.useRealTimers()
})

describe('generateRecruitmentReport', () => {
	it('emits the exact key set the table and the CSV header depend on', async () => {
		const [row] = await generateRecruitmentReport('org1', RANGE)

		// Key ORDER is the CSV column order, so assert the array, not just membership.
		expect(Object.keys(row)).toEqual([
			'Title',
			'Department',
			'Status',
			'Posted',
			'Closed',
			'Applicants',
			'Interviewed',
			'Hired',
			'DaysOpen'
		])
	})

	it('counts an applicant who was interviewed and then rejected', async () => {
		const [closed] = await generateRecruitmentReport('org1', RANGE)

		// The whole point of reading stageHistory instead of currentStage. Counting
		// `currentStage === 'INTERVIEW'` would score this posting 0 — one rejected, one hired,
		// nobody sitting at INTERVIEW — and quietly understate every funnel in the report.
		expect(closed.Interviewed).toBe(2)
		expect(closed.Hired).toBe(1)
		expect(closed.Applicants).toBe(3)
	})

	it('renders dates as UTC calendar days, not local ones', async () => {
		const [closed, open] = await generateRecruitmentReport('org1', RANGE)

		expect(closed.Posted).toBe('2026-06-01')
		expect(closed.Closed).toBe('2026-07-15')
		// An open posting has no close date, and the cell must be blank rather than a fake one.
		expect(open.Closed).toBe('')
	})

	it('measures DaysOpen to the close date, and to today while still open', async () => {
		const [closed, open] = await generateRecruitmentReport('org1', RANGE)

		// 2026-06-01T20:00Z → 2026-07-15T02:00Z is 43.25 days.
		expect(closed.DaysOpen).toBe(43)
		// 2026-07-20 → the pinned today, 2026-08-19.
		expect(open.DaysOpen).toBe(30)
	})

	it('filters on postedAt so unpublished drafts cannot appear, and honours the department', async () => {
		await generateRecruitmentReport('org1', { ...RANGE, departmentId: 'dept-eng' })

		const where = dbMock.jobPosting.findMany.mock.calls[0][0].where
		expect(where.organizationId).toBe('org1')
		// DRAFT and PENDING_APPROVAL have a null postedAt, so this range IS the exclusion —
		// there is no status filter to delete by accident.
		expect(where.postedAt).toEqual({ gte: RANGE.startDate, lte: RANGE.endDate })
		expect(where.departmentId).toBe('dept-eng')
	})

	it('omits the department filter entirely when none is given', async () => {
		await generateRecruitmentReport('org1', RANGE)

		// Key ABSENCE, not `undefined`: a stray `departmentId: undefined` is fine for Prisma but
		// would mask a conditional spread that had stopped being conditional.
		expect('departmentId' in dbMock.jobPosting.findMany.mock.calls[0][0].where).toBe(false)
	})
})

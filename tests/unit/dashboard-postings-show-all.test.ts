import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

const { dbMock, listPostingsAwaitingApprover } = vi.hoisted(() => ({
	listPostingsAwaitingApprover: vi.fn(),
	dbMock: {
		employee: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
		request: { count: vi.fn() },
		payrollRun: { findFirst: vi.fn() },
		attendanceDay: { groupBy: vi.fn() },
		postingApprover: { count: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/announcements', () => ({
	listRecentAnnouncements: vi.fn(async () => []),
	createAnnouncement: vi.fn()
}))
vi.mock('$lib/server/services/approvals', () => ({
	listPendingApprovals: vi.fn(async () => ({
		items: [],
		counts: { total: 0, requests: 0, timesheets: 0, payrollRuns: 0, proposals: 0 }
	}))
}))
vi.mock('$lib/server/services/notifications', () => ({ listRecent: vi.fn(async () => []) }))
vi.mock('$lib/server/services/awards', () => ({
	grantAward: vi.fn(),
	listRecentAwards: vi.fn(async () => [])
}))
vi.mock('$lib/server/services/dashboard', () => ({
	listUpcomingRegularizations: vi.fn(async () => []),
	listTodaysBirthdays: vi.fn(async () => []),
	listUpcomingEvents: vi.fn(async () => []),
	getMyStatus: vi.fn(async () => null)
}))
vi.mock('$lib/server/services/recruitment', () => ({
	listPostingsAwaitingApprover,
	decideJobPosting: vi.fn()
}))

const { load } = await import('../../src/routes/(app)/dashboard/+page.server')

const ORG = 'org1'
const USER_ID = 'user-approver'
const EMP_ID = 'emp-approver'
const POSTINGS = Array.from({ length: 12 }, (_, i) => ({
	id: `posting-${i + 1}`,
	title: `Posting ${i + 1}`,
	department: 'Ops'
}))

type LoadResult = { postingsToApprove: unknown[]; postingsToApproveTotal: number }

const run = async (roles: Role[], query = '') =>
	(await load({
		locals: { user: { id: USER_ID, organizationId: ORG, roles } },
		url: new URL(`http://localhost/dashboard${query}`)
	} as unknown as Parameters<typeof load>[0])) as LoadResult

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.count.mockResolvedValue(0)
	dbMock.employee.findFirst.mockImplementation(
		async ({ where }: { where: { userId: string; organizationId: string } }) =>
			where.userId === USER_ID && where.organizationId === ORG ? { id: EMP_ID } : null
	)
	dbMock.employee.findMany.mockResolvedValue([])
	dbMock.request.count.mockResolvedValue(0)
	dbMock.payrollRun.findFirst.mockResolvedValue(null)
	dbMock.attendanceDay.groupBy.mockResolvedValue([])
	dbMock.postingApprover.count.mockImplementation(
		async ({ where }: { where: { organizationId: string; approverId: string } }) =>
			where.organizationId === ORG && where.approverId === EMP_ID ? 1 : 0
	)
	listPostingsAwaitingApprover.mockResolvedValue(POSTINGS)
})

describe('dashboard load — postings to approve, show all', () => {
	it('returns every pending posting to a mapped non-HR approver who asks for all', async () => {
		const data = await run(['EMPLOYEE'], '?postings=all')

		expect(listPostingsAwaitingApprover).toHaveBeenCalledWith(ORG, EMP_ID, ['EMPLOYEE'], USER_ID)
		expect(data.postingsToApprove).toEqual(POSTINGS)
		expect(data.postingsToApprove).toHaveLength(12)
		expect(data.postingsToApproveTotal).toBe(12)
	})

	it('keeps the cap of 10 for the same approver without the param', async () => {
		const data = await run(['EMPLOYEE'])

		expect(data.postingsToApprove).toEqual(POSTINGS.slice(0, 10))
		expect(data.postingsToApproveTotal).toBe(12)
	})

	it('ignores the param for HR, who has the recruitment page', async () => {
		const data = await run(['HR_ADMIN'], '?postings=all')

		expect(data.postingsToApprove).toEqual(POSTINGS.slice(0, 10))
		expect(data.postingsToApproveTotal).toBe(12)
	})

	it('keeps the cap for a user who approves no department', async () => {
		dbMock.postingApprover.count.mockResolvedValue(0)

		const data = await run(['EMPLOYEE'], '?postings=all')

		expect(data.postingsToApprove).toEqual(POSTINGS.slice(0, 10))
	})
})

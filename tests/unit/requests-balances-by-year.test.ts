import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { dbMock, getLeaveBalances, countRequests, listRequests } = vi.hoisted(() => ({
	getLeaveBalances: vi.fn(),
	countRequests: vi.fn(),
	listRequests: vi.fn(),
	dbMock: {
		employee: { findFirst: vi.fn() },
		leaveType: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/leave', () => ({ getLeaveBalances }))
vi.mock('$lib/server/services/requests', () => ({
	countRequests,
	listRequests,
	createRequest: vi.fn(),
	cancelRequest: vi.fn(),
	resubmitRequest: vi.fn(),
	deleteRequest: vi.fn()
}))
vi.mock('$lib/server/services/requests/documents', () => ({
	uploadsFromForm: vi.fn(),
	saveRequestDocuments: vi.fn()
}))

const { load } = await import('../../src/routes/(app)/requests/+page.server')

const event = () =>
	({
		locals: { user: { id: 'user-1', roles: ['EMPLOYEE'], organizationId: 'org-1' } },
		cookies: { get: () => undefined },
		url: new URL('http://localhost/requests')
	}) as never

type Loaded = { balancesByYear: Record<number, { remaining: number }[]> }

beforeEach(() => {
	vi.clearAllMocks()
	vi.useFakeTimers()
	dbMock.employee.findFirst.mockResolvedValue({ id: 'emp-1', startDate: new Date('2020-01-01') })
	dbMock.leaveType.findMany.mockResolvedValue([])
	countRequests.mockResolvedValue(0)
	listRequests.mockResolvedValue([])
	getLeaveBalances.mockImplementation((_id: string, year: number) =>
		Promise.resolve(
			year === 2026
				? [{ id: 'b1', year, allocated: '15', used: '2', remaining: '13', leaveType: {} }]
				: []
		)
	)
})

afterEach(() => {
	vi.useRealTimers()
})

describe('/requests load balances by year', () => {
	it('reads the current Manila year and the next one', async () => {
		vi.setSystemTime(new Date('2026-09-17T04:00:00Z'))
		const { balancesByYear } = (await load(event())) as unknown as Loaded
		expect(getLeaveBalances.mock.calls.map((c) => c[1]).sort()).toEqual([2026, 2027])
		expect(Object.keys(balancesByYear)).toEqual(['2026', '2027'])
		expect(balancesByYear[2026][0].remaining).toBe(13)
		expect(balancesByYear[2027]).toEqual([])
	})

	it('uses the Manila year on New Year morning, not the UTC one', async () => {
		vi.setSystemTime(new Date('2026-12-31T16:30:00Z'))
		const { balancesByYear } = (await load(event())) as unknown as Loaded
		expect(Object.keys(balancesByYear)).toEqual(['2027', '2028'])
	})
})

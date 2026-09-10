import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

const { dbMock } = vi.hoisted(() => ({
	dbMock: { employee: { findFirst: vi.fn() }, timesheet: { findMany: vi.fn() } }
}))
const { canActOnStageMock, liveChainMock } = vi.hoisted(() => ({
	canActOnStageMock: vi.fn(),
	liveChainMock: vi.fn()
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/approvals', () => ({
	decide: vi.fn(),
	listPendingRequestsForApprover: vi.fn(),
	canActOnStage: canActOnStageMock,
	liveChain: liveChainMock,
	timesheetSoD: vi.fn()
}))
vi.mock('$lib/server/services/timesheets', () => ({
	reviewTimesheet: vi.fn(),
	listTimesheetsForReview: vi.fn()
}))

const timesheets = await import('../../src/routes/(app)/requests/timesheets/+page.server')

const REVIEWER_ROLES: Role[] = ['HR_ADMIN']

const LIVE_STEP = { stage: 'VERIFY', stageKind: 'ROLE', role: 'VERIFIER' }

const row = (id: string) => ({
	id,
	employeeId: `emp-${id}`,
	status: 'SUBMITTED',
	totalHours: 8,
	approvalSteps: [{ id: `step-${id}` }],
	employee: { id: `emp-${id}`, firstName: 'A', lastName: 'B' },
	entries: []
})

const load = (search = '') =>
	timesheets.load({
		locals: { user: { id: 'actor', organizationId: 'org1', roles: REVIEWER_ROLES } },
		url: new URL(`http://localhost/requests/timesheets${search}`)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<any>

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue({ id: 'emp-self' })
	liveChainMock.mockReturnValue({ currentStep: LIVE_STEP })
	canActOnStageMock.mockReturnValue(true)
})

describe('requests/timesheets load pagination', () => {
	it('returns the first page slice plus a pagination object', async () => {
		dbMock.timesheet.findMany.mockResolvedValue(
			Array.from({ length: 25 }, (_, i) => row(`ts${i + 1}`))
		)

		const res = await load()

		expect(res.pendingTimesheets).toHaveLength(10)
		expect(res.pagination.page).toBe(1)
		expect(res.pagination.total).toBe(25)
		expect(res.pagination.totalPages).toBe(3)
	})

	it('returns the tail of the list for ?page=3, not page 1', async () => {
		dbMock.timesheet.findMany.mockResolvedValue(
			Array.from({ length: 25 }, (_, i) => row(`ts${i + 1}`))
		)

		const res = await load('?page=3')

		expect(res.pagination.page).toBe(3)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(res.pendingTimesheets.map((t: any) => t.id)).toEqual([
			'ts21',
			'ts22',
			'ts23',
			'ts24',
			'ts25'
		])
	})
})

describe('requests/timesheets load stage fields', () => {
	it('carries the live step stage kind and role, keeps currentStage, and drops approvalSteps', async () => {
		dbMock.timesheet.findMany.mockResolvedValue([row('ts1')])

		const res = await load()

		expect(res.pendingTimesheets).toHaveLength(1)
		const [ts] = res.pendingTimesheets
		expect(ts.currentStage).toBe('VERIFY')
		expect(ts.currentStageKind).toBe('ROLE')
		expect(ts.currentStageRole).toBe('VERIFIER')
		expect(ts).not.toHaveProperty('approvalSteps')
	})
})

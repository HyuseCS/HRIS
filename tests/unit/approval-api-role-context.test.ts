import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * The two approval API twins pass the full role set to the maker-checker chain (#247).
 *
 * Both of these were invisible to the sweep that found the rest of #247: neither route touches a
 * multi-role service directly. `reviewTimesheet` reaches `rolesOf` through an import from
 * `./approvals`, and `reviewLeaveRequest` reaches it one hop further still, by delegating to
 * `decide`. A grep for the known readers found neither.
 *
 * Both PAGE twins were already correct — `(app)/requests/timesheets/+page.server.ts:66` and
 * `(app)/requests/approvals/+page.server.ts:124,160` — so the UI honoured a [MANAGER, VERIFIER]
 * user's second role and the API silently did not. That divergence is the whole reason these tests
 * are worth keeping.
 *
 * Stage authority is capability-keyed: VERIFY needs VERIFY_REQUESTS (VERIFIER), APPROVE needs
 * APPROVE_SIGNOFF (APPROVER). MANAGER holds neither, but clears both routes' own
 * `requireMinRole('MANAGER')` gate — so a refusal here comes from the chain, not the route.
 * Neither route re-maps 403, so it propagates as a thrown HttpError rather than a Response.
 */

const { dbMock, txMock, notify, applyApprovedRequest } = vi.hoisted(() => {
	const txMock = {
		approvalStep: { update: vi.fn() },
		request: { update: vi.fn() },
		timesheet: { update: vi.fn() }
	}
	return {
		txMock,
		notify: vi.fn().mockResolvedValue(undefined),
		applyApprovedRequest: vi.fn().mockResolvedValue(null),
		dbMock: {
			request: { findFirst: vi.fn() },
			timesheet: { findFirst: vi.fn() },
			employee: { findFirst: vi.fn() },
			$transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/notifications', () => ({ notify }))
vi.mock('$lib/server/services/requests/apply', () => ({ applyApprovedRequest }))

const { PATCH: timesheetRoute } = await import('../../src/routes/api/v1/timesheets/[id]/+server')
const { PATCH: leaveRoute } = await import('../../src/routes/api/v1/leave/[id]/+server')

const ACTOR_USER = 'user-actor'
const ACTOR_EMP = 'actor-emp'
const OWNER_EMP = 'owner-emp'
const ORG = 'org1'
const WRONG_STAGE = 'You cannot act on this stage'

/** MANAGER is the primary role throughout — it clears both routes' gate and no stage capability. */
const event = (roles: Role[], id: string) =>
	({
		locals: { user: { id: ACTOR_USER, organizationId: ORG, roles } },
		params: { id },
		request: { json: async () => ({ action: 'approve' }) },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** MAKE signed off, the open step is the one under test. */
const chain = (openStage: 'VERIFY' | 'APPROVE') => [
	{ id: 's1', attempt: 1, stageIndex: 0, stage: 'MAKE', decision: 'APPROVED', actorId: 'user-mk' },
	{ id: 's2', attempt: 1, stageIndex: 1, stage: openStage, decision: null, actorId: null }
]

beforeEach(() => {
	vi.clearAllMocks()
	// The actor is somebody other than the owner, so separation of duties never decides these.
	dbMock.employee.findFirst.mockResolvedValue({ id: ACTOR_EMP })
	dbMock.timesheet.findFirst.mockResolvedValue({
		id: 'ts1',
		employeeId: OWNER_EMP,
		status: 'SUBMITTED',
		employee: { reportsToId: null },
		approvalSteps: chain('VERIFY')
	})
	dbMock.request.findFirst.mockResolvedValue({
		id: 'req1',
		employeeId: OWNER_EMP,
		type: 'LEAVE',
		status: 'PENDING',
		currentStage: 1,
		dateFrom: new Date('2026-01-05'),
		payload: {},
		employee: { reportsToId: null, userId: 'user-owner' },
		// #283: decide() includes documents for the F3 bar; without this key req.documents.map
		// throws before any guard runs.
		documents: [],
		steps: chain('APPROVE')
	})
	txMock.timesheet.update.mockResolvedValue({ id: 'ts1', status: 'APPROVED' })
})

describe('PATCH /api/v1/timesheets/[id]', () => {
	it('refuses [MANAGER] on the VERIFY stage, and decides nothing', async () => {
		await expect(timesheetRoute(event(['MANAGER'], 'ts1'))).rejects.toMatchObject({
			status: 403,
			body: { message: WRONG_STAGE }
		})
		expect(txMock.approvalStep.update).not.toHaveBeenCalled()
		expect(txMock.timesheet.update).not.toHaveBeenCalled()
	})

	it('lets a [MANAGER, VERIFIER] user act on the VERIFY stage', async () => {
		const res = await timesheetRoute(event(['MANAGER', 'VERIFIER'], 'ts1'))
		expect(res.status).toBe(200)
		expect(txMock.approvalStep.update).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 's2' } })
		)
	})
})

describe('PATCH /api/v1/leave/[id]', () => {
	it('refuses [MANAGER] on the APPROVE stage, and decides nothing', async () => {
		await expect(leaveRoute(event(['MANAGER'], 'req1'))).rejects.toMatchObject({
			status: 403,
			body: { message: WRONG_STAGE }
		})
		expect(txMock.approvalStep.update).not.toHaveBeenCalled()
		expect(txMock.request.update).not.toHaveBeenCalled()
	})

	it('lets a [MANAGER, APPROVER] user act on the APPROVE stage', async () => {
		const res = await leaveRoute(event(['MANAGER', 'APPROVER'], 'req1'))
		expect(res.status).toBe(200)
		expect(txMock.approvalStep.update).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 's2' } })
		)
	})
})

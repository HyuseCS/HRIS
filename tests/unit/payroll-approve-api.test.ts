import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * `POST /api/v1/payroll/[id]?action=approve` — the API twin of the run sign-off.
 *
 * It used to call a second approve implementation, `approveRun`, which gated on MANAGE_PAYROLL and
 * wrote `status: 'APPROVED'` straight to the row. MANAGE_PAYROLL holds MANAGER, so a branch manager
 * could sign off payroll that #174 reserves for CEO / Super Admin. Confirmed live before the fix:
 * the endpoint answered a manager's POST with 400 "Override note required for flagged entries" —
 * a message from *inside* the service, which is the proof that authorization had already passed.
 *
 * It also skipped the #134 chain entirely: no stage capability, no separation of duties, and the
 * run's APPROVE step left open and undecided on an approved run, so the audit trail showed a run
 * nobody had approved.
 *
 * `decidePayrollRun` is now the one approve path, shared with the UI action. These tests run it for
 * real against a mocked client rather than asserting the route called it — MANAGER holds
 * APPROVE_REQUESTS and so passes the route's own gate, which means the denial being tested comes
 * from the service. Mocking it away would assert nothing.
 */

const { dbMock, txMock } = vi.hoisted(() => {
	const txMock = {
		approvalStep: { update: vi.fn() },
		payrollRun: { update: vi.fn() }
	}
	return {
		txMock,
		dbMock: {
			payrollRun: { findFirst: vi.fn() },
			$transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { POST } = await import('../../src/routes/api/v1/payroll/[id]/+server')

const MAKER = 'user-maker'
const ACTOR = 'user-actor'
const RUN_ID = 'run1'

/** Attempt 1, MAKE and VERIFY signed off — the open step is APPROVE, the finance gate. */
const AT_APPROVE_STAGE = [
	{ id: 's1', attempt: 1, stageIndex: 0, stage: 'MAKE', decision: 'APPROVED', actorId: MAKER },
	{ id: 's2', attempt: 1, stageIndex: 1, stage: 'VERIFY', decision: 'APPROVED', actorId: 'user-v' },
	{ id: 's3', attempt: 1, stageIndex: 2, stage: 'APPROVE', decision: null, actorId: null }
]

const runFixture = (over: Record<string, unknown> = {}) => ({
	id: RUN_ID,
	organizationId: 'org1',
	status: 'COMPUTED',
	approvalSteps: AT_APPROVE_STAGE,
	...over
})

const call = (role: Role | null, roles?: Role[], actorId = ACTOR) =>
	POST({
		// A single `role` argument means a one-element set — the route reads \`roles\` only (#282).
		locals:
			role === null
				? {}
				: { user: { id: actorId, organizationId: 'org1', roles: roles ?? [role] } },
		params: { id: RUN_ID },
		url: new URL(`http://x/api/v1/payroll/${RUN_ID}?action=approve`)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.payrollRun.findFirst.mockResolvedValue(runFixture())
})

describe('who may approve a run through the API', () => {
	// The escalation this endpoint shipped with. MANAGER clears the route gate (APPROVE_REQUESTS)
	// and is stopped by the stage capability, exactly as it is in the UI.
	it('refuses a MANAGER, and writes nothing', async () => {
		const res = await call('MANAGER')
		expect(res.status).toBe(403)
		expect(await res.json()).toMatchObject({ error: 'You cannot act on this stage' })
		expect(txMock.payrollRun.update).not.toHaveBeenCalled()
		expect(txMock.approvalStep.update).not.toHaveBeenCalled()
	})

	// Payroll's preparers, not its approvers (#174). Both hold MANAGE_PAYROLL, which is precisely
	// what the deleted `approveRun` gated on.
	for (const role of ['HR_ADMIN', 'PAYROLL_OFFICER'] as Role[]) {
		it(`refuses ${role} — prepares payroll, does not sign it off`, async () => {
			const res = await call(role)
			expect(res.status).toBe(403)
			expect(txMock.payrollRun.update).not.toHaveBeenCalled()
		})
	}

	// APPROVER signs off HR requests (leave, OT) but never money — PAYROLL_STAGE_CAPABILITY routes
	// the APPROVE stage to APPROVE_FINANCE for exactly this reason.
	it('refuses the generic APPROVER on a financial sign-off', async () => {
		const res = await call('APPROVER')
		expect(res.status).toBe(403)
		expect(txMock.payrollRun.update).not.toHaveBeenCalled()
	})

	it('refuses an EMPLOYEE at the route gate, before the service is reached', async () => {
		const res = await call('EMPLOYEE')
		expect(res.status).toBe(403)
		expect(dbMock.payrollRun.findFirst).not.toHaveBeenCalled()
	})

	it('refuses an unauthenticated caller', async () => {
		const res = await call(null)
		expect(res.status).toBe(401)
	})

	for (const role of ['CEO', 'SUPER_ADMIN'] as Role[]) {
		it(`lets ${role} approve, recording the step as well as the status`, async () => {
			const res = await call(role)
			expect(res.status).toBe(200)
			expect(await res.json()).toMatchObject({
				data: { status: 'APPROVED', stage: 'APPROVE', decision: 'APPROVED' }
			})
			// Both halves. `approveRun` wrote the status and left the step undecided.
			expect(txMock.payrollRun.update).toHaveBeenCalledWith(
				expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) })
			)
			expect(txMock.approvalStep.update).toHaveBeenCalledWith(
				expect.objectContaining({ where: { id: 's3' } })
			)
		})
	}

	// The full role set decides stage authority, so this is the one ctx field the route cannot
	// omit — unlike the fail-closed cases #247 tracks, dropping it would deny a legitimate approver.
	it('reads the full role set, not just the primary role (#133)', async () => {
		const res = await call('MANAGER', ['MANAGER', 'CEO'])
		expect(res.status).toBe(200)
		expect(txMock.payrollRun.update).toHaveBeenCalled()
	})
})

describe('the chain rules the old endpoint had no notion of', () => {
	// `approveRun` had no separation-of-duties check at all, so a CEO could sign off the very run
	// they prepared.
	it('refuses the maker of the run, even holding APPROVE_FINANCE', async () => {
		const res = await call('CEO', undefined, MAKER)
		expect(res.status).toBe(403)
		expect(await res.json()).toMatchObject({
			error: 'You cannot sign off a payroll run you prepared'
		})
		expect(txMock.payrollRun.update).not.toHaveBeenCalled()
	})

	it('refuses a run that is not COMPUTED', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(runFixture({ status: 'DRAFT' }))
		const res = await call('CEO')
		expect(res.status).toBe(400)
	})

	it('refuses a run whose chain has no open stage', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(
			runFixture({
				approvalSteps: AT_APPROVE_STAGE.map((s) =>
					s.stage === 'APPROVE' ? { ...s, decision: 'RETURNED', actorId: 'user-v' } : s
				)
			})
		)
		const res = await call('CEO')
		expect(res.status).toBe(400)
	})

	it('404s on an unknown run', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(null)
		const res = await call('CEO')
		expect(res.status).toBe(404)
	})
})

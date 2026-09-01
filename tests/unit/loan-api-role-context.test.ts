import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * The four loan / cash-advance API twins pass the FULL role set to their writers (#247).
 *
 * #253 put `assertMayWriteLoan` in front of all four writers, and its unrestricted arm is
 * `canAny(actorRoles, 'VIEW_PAY_ORGWIDE')`. But every route built its `AuditContext` with
 * `actorRole` alone, so the guard could only ever see the primary role and the multi-role arm was
 * dead on arrival: a [MANAGER, FINANCE] user — entitled to administer pay org-wide — was scoped
 * down to their reporting line and refused. Fail-closed, so a bug rather than a hole, and invisible
 * to #253's own tests because those construct the ctx directly instead of going through a route.
 *
 * Each case is a PAIR. The refusal half is not optional: a route that ignored roles entirely and
 * admitted everyone would pass the success half on its own.
 *
 * The message is asserted, not just the status. All four routes can also refuse at
 * `requirePayrollManage`, and a status-only assertion would let the wrong layer answer — the trap
 * `proposal-queue.test.ts` documents. Note the routes re-map only 400/404, so a 403 from the
 * service propagates as a thrown HttpError rather than a Response; SvelteKit renders it in
 * production, but a direct handler call rejects.
 */

const { dbMock, tx, listReportIdsFor } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	// #324: the four writers run the mutation on the transaction client, so the mutation mocks
	// live on `tx`. The guard reads stay on `dbMock` — they run before the transaction opens.
	tx: {
		loan: { create: vi.fn(), update: vi.fn() },
		cashAdvance: { create: vi.fn(), update: vi.fn() }
	},
	dbMock: {
		$transaction: vi.fn(),
		employee: { findUnique: vi.fn(), findFirst: vi.fn() },
		branch: { findMany: vi.fn() },
		loan: { findFirst: vi.fn() },
		cashAdvance: { findFirst: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))

const { POST: createLoanRoute } = await import('../../src/routes/api/v1/payroll/loans/+server')
const { PATCH: updateLoanRoute } =
	await import('../../src/routes/api/v1/payroll/loans/[id]/+server')
const { POST: createCaRoute } =
	await import('../../src/routes/api/v1/payroll/cash-advances/+server')
const { PATCH: updateCaRoute } =
	await import('../../src/routes/api/v1/payroll/cash-advances/[id]/+server')

const ACTOR_USER = 'user-actor'
const ORG = 'org1'
const DENIED = 'You can only manage your own team or a branch you manage.'

const SELF = { id: 'self-emp', userId: ACTOR_USER, branchId: null }
const REPORT = { id: 'report-emp', userId: 'user-report', branchId: null }
const STRANGER = { id: 'stranger-emp', userId: 'user-stranger', branchId: null }

/**
 * MANAGER clears `requirePayrollManage`, so anything refused below is refused by the service —
 * which is the point. `roles` is what the route now forwards.
 */
const event = (roles: Role[], body: unknown, id?: string) =>
	({
		locals: { user: { id: ACTOR_USER, organizationId: ORG, roles } },
		params: { id },
		request: { json: async () => body },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

const LOAN_BODY = { employeeId: STRANGER.id, principal: 50000, installment: 5000 }
const CA_BODY = { employeeId: STRANGER.id, amount: 10000, installment: 2000 }
const PATCH_BODY = { installment: 999 }

beforeEach(() => {
	vi.clearAllMocks()
	// The actor's own record, plus a reporting line that does NOT contain the target.
	dbMock.employee.findUnique.mockResolvedValue({ id: SELF.id })
	listReportIdsFor.mockResolvedValue([REPORT.id])
	dbMock.branch.findMany.mockResolvedValue([])
	// `requireEmployee` and `canTouchEmployee`'s closing org lookup both land here.
	dbMock.employee.findFirst.mockResolvedValue(STRANGER)
	dbMock.loan.findFirst.mockResolvedValue({ id: 'loan1', employeeId: STRANGER.id })
	dbMock.cashAdvance.findFirst.mockResolvedValue({ id: 'ca1', employeeId: STRANGER.id })
	tx.loan.create.mockResolvedValue({ id: 'loan-new' })
	tx.cashAdvance.create.mockResolvedValue({ id: 'ca-new' })
	tx.loan.update.mockResolvedValue({ id: 'loan1' })
	tx.cashAdvance.update.mockResolvedValue({ id: 'ca1' })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('POST /api/v1/payroll/loans', () => {
	it('refuses [MANAGER] on a stranger, and writes nothing', async () => {
		await expect(createLoanRoute(event(['MANAGER'], LOAN_BODY))).rejects.toMatchObject({
			status: 403,
			body: { message: DENIED }
		})
		expect(tx.loan.create).not.toHaveBeenCalled()
	})

	it('admits [MANAGER, FINANCE] on the same stranger', async () => {
		const res = await createLoanRoute(event(['MANAGER', 'FINANCE'], LOAN_BODY))
		expect(res.status).toBe(201)
		expect(tx.loan.create).toHaveBeenCalled()
	})
})

describe('PATCH /api/v1/payroll/loans/[id]', () => {
	it('refuses [MANAGER] on a stranger, and writes nothing', async () => {
		await expect(updateLoanRoute(event(['MANAGER'], PATCH_BODY, 'loan1'))).rejects.toMatchObject({
			status: 403,
			body: { message: DENIED }
		})
		expect(tx.loan.update).not.toHaveBeenCalled()
	})

	it('admits [MANAGER, FINANCE] on the same stranger', async () => {
		const res = await updateLoanRoute(event(['MANAGER', 'FINANCE'], PATCH_BODY, 'loan1'))
		expect(res.status).toBe(200)
		expect(tx.loan.update).toHaveBeenCalled()
	})
})

describe('POST /api/v1/payroll/cash-advances', () => {
	it('refuses [MANAGER] on a stranger, and writes nothing', async () => {
		await expect(createCaRoute(event(['MANAGER'], CA_BODY))).rejects.toMatchObject({
			status: 403,
			body: { message: DENIED }
		})
		expect(tx.cashAdvance.create).not.toHaveBeenCalled()
	})

	it('admits [MANAGER, FINANCE] on the same stranger', async () => {
		const res = await createCaRoute(event(['MANAGER', 'FINANCE'], CA_BODY))
		expect(res.status).toBe(201)
		expect(tx.cashAdvance.create).toHaveBeenCalled()
	})
})

describe('PATCH /api/v1/payroll/cash-advances/[id]', () => {
	it('refuses [MANAGER] on a stranger, and writes nothing', async () => {
		await expect(updateCaRoute(event(['MANAGER'], PATCH_BODY, 'ca1'))).rejects.toMatchObject({
			status: 403,
			body: { message: DENIED }
		})
		expect(tx.cashAdvance.update).not.toHaveBeenCalled()
	})

	it('admits [MANAGER, FINANCE] on the same stranger', async () => {
		const res = await updateCaRoute(event(['MANAGER', 'FINANCE'], PATCH_BODY, 'ca1'))
		expect(res.status).toBe(200)
		expect(tx.cashAdvance.update).toHaveBeenCalled()
	})
})

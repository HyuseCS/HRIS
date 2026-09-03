import { describe, it, expect, vi, beforeEach } from 'vitest'
import { error } from '@sveltejs/kit'
import type { Role } from '@prisma/client'

/**
 * #319 — voiding a payroll run existed only on the v1 API, so the overlap 409 introduced by #163
 * ("void the conflicting run to proceed") named an action the payroll screen could not perform.
 * This pins the new form action: who reaches it, that it hands the service the right run, and
 * that a service refusal comes back inline instead of blowing up to an error page.
 *
 * `voidRun` itself is mocked here on purpose. Its real guard, compare-and-set and
 * amortization reversal are already pinned by `override-finalized-guard.test.ts`, which runs the
 * real implementation through the API twin; standing that transaction up again to learn "was the
 * service reached" would be disproportionate. The assertion here is the wiring.
 */

const { runsMock, payrollMock } = vi.hoisted(() => ({
	runsMock: { voidRun: vi.fn() },
	payrollMock: { listPayrollRuns: vi.fn(), createPayrollRun: vi.fn(), computePayroll: vi.fn() }
}))
vi.mock('$lib/server/services/payroll/runs', () => runsMock)
vi.mock('$lib/server/services/payroll/index', () => payrollMock)
vi.mock('$lib/server/db', () => ({ db: {} }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { actions, load } = await import('../../src/routes/(app)/payroll/+page.server')

const user = (roles: Role[]) => ({ id: 'u1', organizationId: 'org1', roles })

const formEvent = (roles: Role[], body: Record<string, string> = {}) =>
	({
		locals: { user: user(roles) },
		request: { formData: async () => new Map(Object.entries(body)) },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

beforeEach(() => {
	vi.clearAllMocks()
	runsMock.voidRun.mockResolvedValue({ id: 'r1', status: 'VOIDED' })
	payrollMock.listPayrollRuns.mockReturnValue(Promise.resolve([]))
})

describe('the void action', () => {
	it('refuses a payroll manager without OVERRIDE_FINALIZED', async () => {
		// PAYROLL_OFFICER holds MANAGE_PAYROLL but not OVERRIDE_FINALIZED — the exact actor who
		// creates runs and therefore meets the overlap 409.
		await expect(actions.void(formEvent(['PAYROLL_OFFICER'], { id: 'r1' }))).rejects.toMatchObject({
			status: 403
		})
		expect(runsMock.voidRun).not.toHaveBeenCalled()
	})

	it('refuses an actor with no roles at all', async () => {
		await expect(actions.void(formEvent([], { id: 'r1' }))).rejects.toMatchObject({ status: 403 })
		expect(runsMock.voidRun).not.toHaveBeenCalled()
	})

	it('admits a Super Admin and hands the service the posted run', async () => {
		await actions.void(formEvent(['SUPER_ADMIN'], { id: 'r1' }))
		expect(runsMock.voidRun).toHaveBeenCalledTimes(1)
		const [id, orgId, ctx] = runsMock.voidRun.mock.calls[0]
		expect(id).toBe('r1')
		// Org-scoped, so a run id from another tenant cannot be voided by guessing it.
		expect(orgId).toBe('org1')
		expect(ctx).toMatchObject({
			actorId: 'u1',
			organizationId: 'org1',
			actorRoles: ['SUPER_ADMIN']
		})
	})

	it('admits an actor whose authority comes from a secondary role', async () => {
		await actions.void(formEvent(['EMPLOYEE', 'SUPER_ADMIN'], { id: 'r1' }))
		expect(runsMock.voidRun).toHaveBeenCalledTimes(1)
	})

	it('surfaces a service refusal inline instead of throwing to an error page', async () => {
		// A real HttpError, not a look-alike: the route branches on `isHttpError`, which a plain
		// object with the same fields does not satisfy — a mock that faked the shape would have
		// asserted the rethrow path while claiming to test the inline one.
		runsMock.voidRun.mockImplementation(() => error(400, 'Payroll run is already voided'))
		const res = await actions.void(formEvent(['SUPER_ADMIN'], { id: 'r1' }))
		expect(res).toMatchObject({ status: 400, data: { error: 'Payroll run is already voided' } })
	})

	it('rejects a missing run id before reaching the service', async () => {
		const res = await actions.void(formEvent(['SUPER_ADMIN'], {}))
		expect(res).toMatchObject({ status: 400 })
		expect(runsMock.voidRun).not.toHaveBeenCalled()
	})
})

describe('the load function', () => {
	it('grants canVoid only to a holder of OVERRIDE_FINALIZED', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const ev = (roles: Role[]) => ({ locals: { user: user(roles) } }) as any
		// `load`'s declared return widens to `void | …` through SvelteKit's generated types, so read
		// the field off an explicit shape rather than asserting on the union.
		const canVoidFor = async (roles: Role[]) =>
			((await load(ev(roles))) as unknown as { canVoid: boolean }).canVoid
		expect(await canVoidFor(['SUPER_ADMIN'])).toBe(true)
		expect(await canVoidFor(['PAYROLL_OFFICER'])).toBe(false)
	})
})

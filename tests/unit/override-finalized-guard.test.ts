import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #224 — the CEO gained ADMINISTER_SYSTEM, so every irreversible operation that used to lean on
 * "Super Admin is the only system administrator" now has to name OVERRIDE_FINALIZED explicitly.
 * The failure mode this guards is a call site left pointing at ADMINISTER_SYSTEM, which would
 * silently hand the CEO the ability to void payroll they themselves approved (APPROVE_FINANCE)
 * and to reopen attendance days the payroll they run was computed from.
 *
 * So these exercise the enforcement points, not the capability table — `rbac.test.ts` already
 * pins who holds what, and a second copy of that would not catch a mis-pointed guard.
 *
 * All three writers now carry their own guard, matching the epic's rule that guards live in the
 * service and not the route. For the route-level tests `voidPeriod` and `unlockRange` stay mocked —
 * the assertion there is "was the service reached", and standing up voidPeriod's
 * amortization-reversal transaction to learn that would be disproportionate — while the real
 * implementations are pulled in separately below to pin the guard itself. `voidRun` is left real
 * throughout, so the API twin above it runs the real check.
 *
 * #256 adds the other half. Every enforcement point above now judges the FULL role set, so each
 * gets three more cases: a multi-role actor whose authority comes only from a secondary role is
 * admitted (the fix), the write is asserted to have actually happened (a guard that silently
 * no-ops would pass a bare `resolves`), and an actor carrying an EMPTY role set still refuses —
 * no roles means no authority, i.e. CLOSED, never open.
 */

const { dbMock, periodsMock, attendanceMock } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: {
			findFirst: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			findUniqueOrThrow: vi.fn()
		},
		employee: { findMany: vi.fn(), findUnique: vi.fn() },
		// Only the first lookup each real service makes past its guard — enough to tell "refused"
		// from "admitted" without standing up voidPeriod's amortization-reversal transaction.
		payrollPeriod: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
		attendanceDay: { updateMany: vi.fn() },
		$transaction: async (fn: (tx: unknown) => unknown) => fn(dbMock)
	},
	periodsMock: {
		listPeriods: vi.fn(),
		openPeriod: vi.fn(),
		importAttendance: vi.fn(),
		generate: vi.fn(),
		lock: vi.fn(),
		release: vi.fn(),
		voidPeriod: vi.fn()
	},
	attendanceMock: {
		countAttendanceDays: vi.fn(),
		listAttendanceDays: vi.fn(),
		listTeamDay: vi.fn(),
		deriveRange: vi.fn(),
		autoDeriveFromPunches: vi.fn(),
		correctDay: vi.fn(),
		lockRange: vi.fn(),
		unlockRange: vi.fn(),
		resetDayToDerived: vi.fn(),
		createTimesheetFromAttendance: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/payroll/periods', () => periodsMock)
vi.mock('$lib/server/services/attendance', () => attendanceMock)

const { voidRun } = await import('$lib/server/services/payroll/runs')
const { POST: runApi } = await import('../../src/routes/api/v1/payroll/[id]/+server')
const { POST: periodApi } = await import('../../src/routes/api/v1/payroll/periods/[id]/+server')
const { actions: periodActions } =
	await import('../../src/routes/(app)/payroll/periods/+page.server')
const { actions: attendanceActions } =
	await import('../../src/routes/(app)/attendance/+page.server')

const user = (role: Role, roles: Role[] = [role]) => ({
	id: 'u1',
	organizationId: 'org1',
	role,
	roles
})
const ctx = (role: Role, roles: Role[] = [role]) => ({
	organizationId: 'org1',
	actorId: 'u1',
	actorRoles: roles
})

/**
 * #256: the authority the actor holds through a SECOND role. Primary role is EMPLOYEE, so nothing
 * but the full set can admit them — which is the whole point of the widening.
 */
const SECONDARY: Role[] = ['EMPLOYEE', 'SUPER_ADMIN']

/**
 * An actor carrying no roles at all — the one shape left now that `AuditContext.actorRoles` is
 * required. No roles means no authority: it must be refused, never admitted.
 */
const ctxWithNoRoles = () => ({ organizationId: 'org1', actorId: 'u1', actorRoles: [] as Role[] })

/** A form-action event; `body` becomes the POSTed fields. */
const formEvent = (role: Role, body: Record<string, string> = {}, roles: Role[] = [role]) =>
	({
		locals: { user: user(role, roles) },
		request: { formData: async () => new Map(Object.entries(body)) },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** An API event for POST /:id?action=void. */
const apiEvent = (role: Role, roles: Role[] = [role]) =>
	({
		locals: { user: user(role, roles) },
		params: { id: 'x1' },
		url: new URL('http://localhost/?action=void'),
		request: { json: async () => ({}) },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

const RANGE = { employeeId: 'emp1', from: '2026-07-01', to: '2026-07-15' }

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.payrollRun.findFirst.mockResolvedValue({ id: 'x1', status: 'APPROVED' })
	dbMock.payrollRun.update.mockResolvedValue({ id: 'x1', status: 'VOIDED' })
	dbMock.payrollRun.updateMany.mockResolvedValue({ count: 1 })
	dbMock.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: 'x1', status: 'VOIDED' })
	dbMock.payrollPeriod.updateMany.mockResolvedValue({ count: 1 })
	// No such period: an admitted caller gets 404 from the lookup, which distinguishes it from the
	// 403 a refused one never gets past.
	dbMock.payrollPeriod.findFirst.mockResolvedValue(null)
	dbMock.attendanceDay.updateMany.mockResolvedValue({ count: 3 })
})

describe('voiding a payroll run (#224)', () => {
	it('denies the CEO and never reaches the database', async () => {
		await expect(voidRun('x1', 'org1', ctx('CEO'))).rejects.toMatchObject({ status: 403 })
		expect(dbMock.payrollRun.findFirst).not.toHaveBeenCalled()
	})

	it('still allows the Super Admin', async () => {
		await expect(voidRun('x1', 'org1', ctx('SUPER_ADMIN'))).resolves.toMatchObject({
			status: 'VOIDED'
		})
	})

	it('denies the CEO through the v1 API twin', async () => {
		expect((await runApi(apiEvent('CEO'))).status).toBe(403)
	})

	it('admits an actor holding SUPER_ADMIN as a secondary role, and voids (#256)', async () => {
		await expect(voidRun('x1', 'org1', ctx('EMPLOYEE', SECONDARY))).resolves.toMatchObject({
			status: 'VOIDED'
		})
		expect(dbMock.payrollRun.updateMany).toHaveBeenCalled()
	})

	it('refuses an actor carrying an empty role set', async () => {
		await expect(voidRun('x1', 'org1', ctxWithNoRoles())).rejects.toMatchObject({
			status: 403
		})
		expect(dbMock.payrollRun.findFirst).not.toHaveBeenCalled()
	})

	it('still allows a single-role Super Admin through the v1 API twin', async () => {
		expect((await runApi(apiEvent('SUPER_ADMIN'))).status).toBe(200)
		expect(dbMock.payrollRun.updateMany).toHaveBeenCalled()
	})

	it('admits the secondary-role actor through the v1 API twin (#256)', async () => {
		expect((await runApi(apiEvent('EMPLOYEE', SECONDARY))).status).toBe(200)
		expect(dbMock.payrollRun.updateMany).toHaveBeenCalled()
	})
})

describe('voiding a payroll period (#224)', () => {
	it('denies the CEO on the form action', async () => {
		await expect(periodActions.void!(formEvent('CEO', { id: 'p1' }))).rejects.toMatchObject({
			status: 403
		})
		expect(periodsMock.voidPeriod).not.toHaveBeenCalled()
	})

	it('still allows the Super Admin on the form action', async () => {
		await periodActions.void!(formEvent('SUPER_ADMIN', { id: 'p1' }))
		expect(periodsMock.voidPeriod).toHaveBeenCalled()
	})

	it('denies the CEO through the v1 API twin', async () => {
		expect((await periodApi(apiEvent('CEO'))).status).toBe(403)
		expect(periodsMock.voidPeriod).not.toHaveBeenCalled()
	})

	// The ctx assertion is the other half of the fix: widening the guard alone would let a
	// secondary-role actor past the route and straight into the service's own 403.
	it('admits the secondary-role actor on the form action, forwarding the set (#256)', async () => {
		await periodActions.void!(formEvent('EMPLOYEE', { id: 'p1' }, SECONDARY))
		expect(periodsMock.voidPeriod).toHaveBeenCalledWith(
			'p1',
			'org1',
			expect.objectContaining({ actorRoles: SECONDARY })
		)
	})

	it('admits the secondary-role actor through the v1 API twin, forwarding the set (#256)', async () => {
		expect((await periodApi(apiEvent('EMPLOYEE', SECONDARY))).status).toBe(200)
		expect(periodsMock.voidPeriod).toHaveBeenCalledWith(
			'x1',
			'org1',
			expect.objectContaining({ actorRoles: SECONDARY })
		)
	})

	it('still allows a single-role Super Admin through the v1 API twin', async () => {
		expect((await periodApi(apiEvent('SUPER_ADMIN'))).status).toBe(200)
		expect(periodsMock.voidPeriod).toHaveBeenCalled()
	})
})

describe('reopening locked attendance days (#224)', () => {
	it('denies the CEO on unlock', async () => {
		await expect(attendanceActions.unlock!(formEvent('CEO', RANGE))).rejects.toMatchObject({
			status: 403
		})
		expect(attendanceMock.unlockRange).not.toHaveBeenCalled()
	})

	it('denies the CEO on unlockTeam', async () => {
		await expect(
			attendanceActions.unlockTeam!(formEvent('CEO', { date: '2026-07-01' }))
		).rejects.toMatchObject({ status: 403 })
		expect(attendanceMock.unlockRange).not.toHaveBeenCalled()
	})

	it('still allows the Super Admin on both', async () => {
		await attendanceActions.unlock!(formEvent('SUPER_ADMIN', RANGE))
		await attendanceActions.unlockTeam!(formEvent('SUPER_ADMIN', { date: '2026-07-01' }))
		expect(attendanceMock.unlockRange).toHaveBeenCalledTimes(2)
	})

	// Locking is ordinary HR work and must NOT have been dragged along by the split.
	it('leaves locking to HR', async () => {
		await attendanceActions.lock!(formEvent('HR_ADMIN', RANGE))
		expect(attendanceMock.lockRange).toHaveBeenCalled()
	})

	it('admits the secondary-role actor on both, forwarding the set (#256)', async () => {
		await attendanceActions.unlock!(formEvent('EMPLOYEE', RANGE, SECONDARY))
		await attendanceActions.unlockTeam!(formEvent('EMPLOYEE', { date: '2026-07-01' }, SECONDARY))
		expect(attendanceMock.unlockRange).toHaveBeenCalledTimes(2)
		expect(attendanceMock.unlockRange).toHaveBeenLastCalledWith(
			'org1',
			expect.anything(),
			expect.objectContaining({ actorRoles: SECONDARY })
		)
	})
})

/**
 * The routes above call mocked services, so they prove the route checks. These call the real
 * implementations to prove a direct caller — a third route, a job, the next API twin — is refused
 * too. The guard runs before any lookup, so nothing below it needs standing up.
 */
describe('the services refuse a direct unauthorized caller (#224)', () => {
	const realVoidPeriod = async () =>
		(
			await vi.importActual<typeof import('$lib/server/services/payroll/periods')>(
				'$lib/server/services/payroll/periods'
			)
		).voidPeriod

	const realUnlockRange = async () =>
		(
			await vi.importActual<typeof import('$lib/server/services/attendance')>(
				'$lib/server/services/attendance'
			)
		).unlockRange

	const RANGE_DATES = { from: new Date('2026-07-01'), to: new Date('2026-07-15') }

	it('voidPeriod denies the CEO', async () => {
		await expect((await realVoidPeriod())('p1', 'org1', ctx('CEO'))).rejects.toMatchObject({
			status: 403
		})
		expect(dbMock.payrollPeriod.findFirst).not.toHaveBeenCalled()
	})

	it('unlockRange denies the CEO', async () => {
		await expect((await realUnlockRange())('org1', RANGE_DATES, ctx('CEO'))).rejects.toMatchObject({
			status: 403
		})
		expect(dbMock.attendanceDay.updateMany).not.toHaveBeenCalled()
	})

	// No roles, no authority — the fail-closed floor now that the set is the only carrier.
	it('voidPeriod refuses an empty role set', async () => {
		await expect((await realVoidPeriod())('p1', 'org1', ctxWithNoRoles())).rejects.toMatchObject({
			status: 403
		})
		expect(dbMock.payrollPeriod.findFirst).not.toHaveBeenCalled()
	})

	it('unlockRange refuses an empty role set', async () => {
		await expect(
			(await realUnlockRange())('org1', RANGE_DATES, ctxWithNoRoles())
		).rejects.toMatchObject({ status: 403 })
		expect(dbMock.attendanceDay.updateMany).not.toHaveBeenCalled()
	})

	// 404 rather than 403 is the proof of admission: the guard passed and the lookup ran.
	it('voidPeriod admits a secondary-role actor (#256)', async () => {
		await expect(
			(await realVoidPeriod())('p1', 'org1', ctx('EMPLOYEE', SECONDARY))
		).rejects.toMatchObject({ status: 404 })
		expect(dbMock.payrollPeriod.findFirst).toHaveBeenCalled()
	})

	it('unlockRange admits a secondary-role actor, and unlocks (#256)', async () => {
		await expect(
			(await realUnlockRange())('org1', RANGE_DATES, ctx('EMPLOYEE', SECONDARY))
		).resolves.toEqual({ unlocked: 3 })
		expect(dbMock.attendanceDay.updateMany).toHaveBeenCalled()
	})
})

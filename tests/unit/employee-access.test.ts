import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { CAPABILITIES } from '$lib/rbac'

/**
 * #228 — object-level scoping for employee records.
 *
 * The original guard was `requireMinRole('MANAGER')` + `if (!can(role,'MANAGE_HR'))`, which is an
 * empty set: MANAGER ranks level with HR_ADMIN *and* holds MANAGE_HR. It read as a restriction and
 * never ran, so every MANAGER could read and modify every employee in the tenant. These tests pin
 * both the capability split and the resulting rule.
 */

const { dbMock, listReportIdsFor } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn() },
		branch: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))

const { canTouchEmployee, assertCanTouchEmployee, listVisibleEmployeeIds } =
	await import('$lib/server/services/employee-access')

/** `roles` omitted leaves it undefined, so the fallback reproduces the single-role rule exactly. */
const actor = (role: Role, roles?: Role[]) => ({
	id: 'user1',
	roles: roles ?? [role],
	organizationId: 'org1'
})
/** The manager's own employee record. */
const SELF = { id: 'mgr-emp' }

/** Employees sitting in a branch the manager runs; only consulted when they manage one. */
let branchStaff: { id: string }[] = []
/** Ids the org filter rejects, standing in for a record in another tenant. */
let foreignIds: string[] = []
/** The actor's own employee row, or `null` for "no record in the ACTIVE org". */
let selfRow: { id: string } | null = null
/** What the closing target lookup returns, or `null` for "that row is in another tenant". */
let targetRow: { branchId: string | null } | null = null

beforeEach(() => {
	vi.clearAllMocks()
	listReportIdsFor.mockResolvedValue([])
	dbMock.branch.findMany.mockResolvedValue([])
	branchStaff = []
	foreignIds = []
	selfRow = SELF
	targetRow = { branchId: null }
	// #6 made the self lookup a `findFirst` too, so ONE `vi.fn()` now serves both calls: the self
	// lookup keyed by `userId` and the closing target lookup keyed by `id`. Discriminate on the
	// where-shape, as `findMany` below already does. A plain `mockResolvedValue` would hand the
	// target's row to the self lookup, leaving `self.id` undefined — which turns every fail-closed
	// case green for the wrong reason instead of failing.
	dbMock.employee.findFirst.mockImplementation(({ where }) =>
		Promise.resolve(where.userId ? selfRow : targetRow)
	)
	// Two different findMany calls: "who is in my branches" (keyed by branchId) and the closing
	// org filter (keyed by id). Discriminate on the where-shape rather than call order, so a
	// manager with no branches — who skips the first call entirely — still resolves correctly.
	dbMock.employee.findMany.mockImplementation(({ where }) =>
		Promise.resolve(
			where.branchId
				? branchStaff
				: (where.id?.in ?? [])
						.filter((id: string) => !foreignIds.includes(id))
						.map((id: string) => ({ id }))
		)
	)
})

describe('the capability split this fix depends on (#228)', () => {
	// #282 deleted `ROLE_HIERARCHY`, which this used to derive the floor's role set from. The claim
	// is the same one, stated directly: MANAGE_HR holds MANAGER, so it cannot express "real HR".
	it('MANAGE_HR cannot express "real HR" — it holds MANAGER', () => {
		expect([...CAPABILITIES.MANAGE_HR].sort()).toEqual([
			'CEO',
			'HR_ADMIN',
			'MANAGER',
			'SUPER_ADMIN'
		])
	})

	it('ADMINISTER_HR_ORGWIDE is the one that actually excludes MANAGER', () => {
		expect(CAPABILITIES.ADMINISTER_HR_ORGWIDE).not.toContain('MANAGER')
		expect([...CAPABILITIES.ADMINISTER_HR_ORGWIDE].sort()).toEqual([
			'CEO',
			'HR_ADMIN',
			'SUPER_ADMIN'
		])
	})
})

describe('canTouchEmployee (#228)', () => {
	it('lets HR_ADMIN reach anyone without even looking up a team', async () => {
		expect(await canTouchEmployee(actor('HR_ADMIN'), 'stranger')).toBe(true)
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
	})

	it('lets CEO and SUPER_ADMIN reach anyone', async () => {
		expect(await canTouchEmployee(actor('CEO'), 'stranger')).toBe(true)
		expect(await canTouchEmployee(actor('SUPER_ADMIN'), 'stranger')).toBe(true)
	})

	it('refuses a MANAGER on an employee who is neither their report nor in their branch', async () => {
		expect(await canTouchEmployee(actor('MANAGER'), 'stranger')).toBe(false)
	})

	it('allows a MANAGER on their own record', async () => {
		expect(await canTouchEmployee(actor('MANAGER'), SELF.id)).toBe(true)
	})

	it('allows a MANAGER on a direct or additional report (#176)', async () => {
		listReportIdsFor.mockResolvedValue(['report1'])
		expect(await canTouchEmployee(actor('MANAGER'), 'report1')).toBe(true)
	})

	it('allows a MANAGER on someone in a branch they manage', async () => {
		dbMock.branch.findMany.mockResolvedValue([{ id: 'br1' }])
		targetRow = { branchId: 'br1' }
		expect(await canTouchEmployee(actor('MANAGER'), 'crew1')).toBe(true)
	})

	it('refuses a report who belongs to another organization', async () => {
		// Rows written before #235 can still point across tenants (every writer validates now).
		// The relationship must not survive the org filter.
		listReportIdsFor.mockResolvedValue(['report1'])
		targetRow = null
		expect(await canTouchEmployee(actor('MANAGER'), 'report1')).toBe(false)
	})

	it('refuses a MANAGER on someone in a branch they do NOT manage', async () => {
		dbMock.branch.findMany.mockResolvedValue([{ id: 'br1' }])
		targetRow = { branchId: 'br2' }
		expect(await canTouchEmployee(actor('MANAGER'), 'crew2')).toBe(false)
	})

	it('fails closed when the actor has no employee record of their own', async () => {
		selfRow = null
		expect(await canTouchEmployee(actor('MANAGER'), 'anyone')).toBe(false)
	})

	// #6 — the self lookup was an unscoped `findUnique`, so a multi-org actor got their HOME-org
	// row whichever tenant the session was in. Asserted on the query, not the result: a fixture can
	// only show which row came back, and every row here belongs to org1, so no result-shaped
	// assertion can see a missing filter.
	it('scopes the self lookup to the active organization (#6)', async () => {
		await canTouchEmployee(actor('MANAGER'), 'stranger')
		expect(dbMock.employee.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { userId: 'user1', organizationId: 'org1' } })
		)
	})
})

/**
 * #234 — the roster list. `requireMinRole('HR_ADMIN')` gated both the page and its offboard
 * action, and MANAGER clears that floor (#133), so every manager saw the whole tenant and could
 * offboard anyone in it. Same dead-guard shape as #228, one file over.
 */
describe('listVisibleEmployeeIds (#234)', () => {
	it('returns null — unrestricted — for the org-wide roles, without querying', async () => {
		for (const role of ['HR_ADMIN', 'CEO', 'SUPER_ADMIN'] as const) {
			expect(await listVisibleEmployeeIds(actor(role))).toBeNull()
		}
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
	})

	it('shows a MANAGER with no team only themselves', async () => {
		expect(await listVisibleEmployeeIds(actor('MANAGER'))).toEqual([SELF.id])
	})

	it('shows a MANAGER their reports alongside themselves', async () => {
		listReportIdsFor.mockResolvedValue(['report1', 'report2'])
		const visible = await listVisibleEmployeeIds(actor('MANAGER'))
		expect(visible).toEqual(expect.arrayContaining([SELF.id, 'report1', 'report2']))
		expect(visible).toHaveLength(3)
	})

	it('shows a MANAGER everyone in a branch they run', async () => {
		dbMock.branch.findMany.mockResolvedValue([{ id: 'br1' }])
		branchStaff = [{ id: 'crew1' }, { id: 'crew2' }]
		const visible = await listVisibleEmployeeIds(actor('MANAGER'))
		expect(visible).toEqual(expect.arrayContaining([SELF.id, 'crew1', 'crew2']))
	})

	it('does not double-count someone who is both a report and in the branch', async () => {
		listReportIdsFor.mockResolvedValue(['crew1'])
		dbMock.branch.findMany.mockResolvedValue([{ id: 'br1' }])
		branchStaff = [{ id: 'crew1' }]
		expect(await listVisibleEmployeeIds(actor('MANAGER'))).toEqual([SELF.id, 'crew1'])
	})

	it('drops a report belonging to another organization', async () => {
		listReportIdsFor.mockResolvedValue(['report1', 'foreign1'])
		foreignIds = ['foreign1']
		expect(await listVisibleEmployeeIds(actor('MANAGER'))).not.toContain('foreign1')
	})

	it('scopes the self lookup to the active organization (#6)', async () => {
		await listVisibleEmployeeIds(actor('MANAGER'))
		expect(dbMock.employee.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { userId: 'user1', organizationId: 'org1' } })
		)
	})

	it('returns nobody — not everybody — when the actor has no employee record', async () => {
		selfRow = null
		// The dangerous failure would be `null`, which the callers read as "unrestricted".
		expect(await listVisibleEmployeeIds(actor('MANAGER'))).toEqual([])
	})

	// The invariant that keeps the two halves honest: a roster must never list a row whose 201
	// file then 403s. If one function's rule drifts from the other's, this fails.
	it('agrees with canTouchEmployee on every id it returns', async () => {
		listReportIdsFor.mockResolvedValue(['report1'])
		dbMock.branch.findMany.mockResolvedValue([{ id: 'br1' }])
		branchStaff = [{ id: 'crew1' }]
		const visible = (await listVisibleEmployeeIds(actor('MANAGER')))!

		for (const id of visible) {
			targetRow = { branchId: id === 'crew1' ? 'br1' : null }
			expect(await canTouchEmployee(actor('MANAGER'), id)).toBe(true)
		}
	})
})

describe('assertCanTouchEmployee (#228)', () => {
	it('throws 403 rather than 404 — the record exists, the actor just cannot have it', async () => {
		await expect(assertCanTouchEmployee(actor('MANAGER'), 'stranger')).rejects.toMatchObject({
			status: 403
		})
	})

	it('resolves quietly for an allowed pairing', async () => {
		listReportIdsFor.mockResolvedValue(['report1'])
		await expect(assertCanTouchEmployee(actor('MANAGER'), 'report1')).resolves.toBeUndefined()
	})
})

/**
 * #247 — both functions read the FULL role set, not just the primary one.
 *
 * `can(user.role, 'ADMINISTER_HR_ORGWIDE')` saw only the primary role, so a [MANAGER, HR_ADMIN]
 * user — org-wide HR on their second role — was scoped to a reporting line and denied 201 files and
 * roster rows they are entitled to. Fail-closed, so nobody gained reach; they simply lost it.
 *
 * This is the one fail-OPEN change in #247, which is why each case asserts BOTH halves: the
 * single-role actor must still be refused. The trust source is unchanged — `User.roles`, the same
 * column `auth.ts` already reads, and `MANAGE_USER_ROLES` is CEO-only, so nobody can widen
 * themselves.
 */
describe('the full role set decides, not the primary role (#247)', () => {
	it('canTouchEmployee: admits [MANAGER, HR_ADMIN] on a stranger, refuses a bare [MANAGER]', async () => {
		expect(await canTouchEmployee(actor('MANAGER', ['MANAGER', 'HR_ADMIN']), 'stranger')).toBe(true)
		// Admitted BY THE CAPABILITY, not by accident of the fixtures: the org-wide arm returns
		// before any team is looked up. Asserted first, on untouched mocks — without it, a mutation
		// returning true unconditionally would also pass.
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()

		expect(await canTouchEmployee(actor('MANAGER', ['MANAGER']), 'stranger')).toBe(false)
	})

	it('listVisibleEmployeeIds: unrestricted for [MANAGER, HR_ADMIN], scoped for a bare [MANAGER]', async () => {
		expect(await listVisibleEmployeeIds(actor('MANAGER', ['MANAGER']))).toEqual([SELF.id])

		expect(await listVisibleEmployeeIds(actor('MANAGER', ['MANAGER', 'HR_ADMIN']))).toBeNull()
	})

	/**
	 * The lockstep invariant, which the single-role version of this test could not catch: widening
	 * one function and not the other leaves a roster that hides people whose 201 files open fine.
	 * `null` is the unrestricted contract, so the assertion is that contract — anyone is reachable.
	 */
	it('the two stay in step for a multi-role actor', async () => {
		const multi = actor('MANAGER', ['MANAGER', 'HR_ADMIN'])
		expect(await listVisibleEmployeeIds(multi)).toBeNull()
		expect(await canTouchEmployee(multi, 'anyone-at-all')).toBe(true)
	})

	it('assertCanTouchEmployee surfaces it through the throwing wrapper', async () => {
		await expect(
			assertCanTouchEmployee(actor('MANAGER', ['MANAGER']), 'stranger')
		).rejects.toMatchObject({ status: 403 })

		await expect(
			assertCanTouchEmployee(actor('MANAGER', ['MANAGER', 'HR_ADMIN']), 'stranger')
		).resolves.toBeUndefined()
	})
})

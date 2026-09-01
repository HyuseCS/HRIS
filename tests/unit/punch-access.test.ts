import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #282 §3-A — `GET /api/v1/timesheets/:employeeId/punches`.
 *
 * The route's own doc comment said "the owner, the owner's manager, HR_ADMIN, or SUPER_ADMIN", but
 * the guard was `hasAnyMinRole(user.roles, 'HR_ADMIN')` — which MANAGER clears (#133 ranks them
 * level) — so the hand-rolled owner/direct-manager fallback below it never ran for a manager and
 * every MANAGER read every employee's raw punches org-wide.
 *
 * Replaced by `canTouchEmployee`, the same object-level check `/employees/[id]` uses. That NARROWS
 * a manager off strangers and WIDENS them onto additional supervisees (#176) and branch staff,
 * which is the consistency the route was missing.
 */

const { dbMock, listReportIdsFor, listPunches } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	listPunches: vi.fn(),
	dbMock: {
		employee: { findUnique: vi.fn(), findFirst: vi.fn() },
		branch: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))
vi.mock('$lib/server/services/timelog', () => ({ listPunches }))

const { GET } = await import('../../src/routes/api/v1/timesheets/[id]/punches/+server')

const ORG = 'org1'
const SELF = 'mgr-emp'
const REPORT = 'report-emp'
const CREW = 'crew-emp'
const STRANGER = 'stranger-emp'

/** Which branch each employee id sits in, for the branch arm of `canTouchEmployee`. */
const branchOf: Record<string, string | null> = { [CREW]: 'br1' }

const event = (roles: Role[], employeeId: string) =>
	({
		locals: { user: { id: 'user-actor', organizationId: ORG, roles } },
		params: { id: employeeId },
		url: { searchParams: new URLSearchParams() }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

beforeEach(() => {
	vi.clearAllMocks()
	listPunches.mockResolvedValue([])
	listReportIdsFor.mockResolvedValue([])
	dbMock.branch.findMany.mockResolvedValue([])
	dbMock.employee.findUnique.mockResolvedValue({ id: SELF })
	// Two different findFirst calls share one mock: the route resolves the target (`select: { id }`)
	// and `canTouchEmployee` re-resolves it for the branch arm (`select: { branchId }`). Both now
	// scope on the same `organizationId` column, so discriminate on the `select` — never on the
	// where-shape, which is the thing under test — and not on call order.
	dbMock.employee.findFirst.mockImplementation(({ where, select }) =>
		Promise.resolve(
			select?.branchId
				? { branchId: branchOf[where.id] ?? null }
				: { id: where.id, userId: `user-${where.id}`, reportsToId: null }
		)
	)
})

describe('punch access is object-scoped, not rank-scoped (#282 §3-A)', () => {
	it('denies a MANAGER a stranger’s punches', async () => {
		const res = await GET(event(['MANAGER'], STRANGER))
		expect(res.status).toBe(403)
		// The leak was that the punches came back at all — assert the read never happened, not just
		// the status, so a guard that 403s after fetching would still fail.
		expect(listPunches).not.toHaveBeenCalled()
	})

	it('allows a MANAGER their own report', async () => {
		listReportIdsFor.mockResolvedValue([REPORT])
		const res = await GET(event(['MANAGER'], REPORT))
		expect(res.status).toBe(200)
		expect(listPunches).toHaveBeenCalledWith(REPORT, expect.anything())
	})

	it('allows a MANAGER someone in a branch they run', async () => {
		dbMock.branch.findMany.mockResolvedValue([{ id: 'br1' }])
		const res = await GET(event(['MANAGER'], CREW))
		expect(res.status).toBe(200)
	})

	it('allows the owner their own punches', async () => {
		const res = await GET(event(['EMPLOYEE'], SELF))
		expect(res.status).toBe(200)
	})

	it('allows HR_ADMIN anyone, without looking up a team', async () => {
		const res = await GET(event(['HR_ADMIN'], STRANGER))
		expect(res.status).toBe(200)
		// Guards against the classic slip of swapping `canTouchEmployee` for a truthiness test on
		// `listVisibleEmployeeIds`, whose `null` ("unrestricted") is falsy and would deny HR.
		expect(dbMock.employee.findUnique).not.toHaveBeenCalled()
	})

	it('still 404s an employee outside the caller’s organization', async () => {
		dbMock.employee.findFirst.mockImplementation(({ where }) =>
			Promise.resolve(where.user ? null : null)
		)
		const res = await GET(event(['HR_ADMIN'], STRANGER))
		expect(res.status).toBe(404)
	})
})

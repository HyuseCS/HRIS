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
		employee: { findFirst: vi.fn() },
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

/** The actor's own employee row, or `null` for "no record in the active org". */
let selfRow: { id: string } | null
/** Which employee ids resolve at all when looked up by `id` and scoped to the org. */
let targetsInOrg: Set<string>

beforeEach(() => {
	vi.clearAllMocks()
	listPunches.mockResolvedValue([])
	listReportIdsFor.mockResolvedValue([])
	dbMock.branch.findMany.mockResolvedValue([])
	selfRow = { id: SELF }
	targetsInOrg = new Set([SELF, REPORT, CREW, STRANGER])
	// THREE calls share one mock now: the route's own target lookup (`where.id`, `select: { id }`),
	// `canTouchEmployee`'s self lookup (`where.userId` — #6 made this a `findFirst` too, previously
	// it discriminated on `select.branchId` alone, which left the self lookup falling into the
	// `select.branchId`-absent branch keyed by `where.id` — undefined for a userId-keyed call, so
	// `self.id` came back `undefined` and every fail-closed case went green for the wrong reason),
	// and `canTouchEmployee`'s target lookup (`where.id`, `select: { branchId }`). Discriminate on
	// `where.userId` first, then on `select.branchId` — never on call order.
	dbMock.employee.findFirst.mockImplementation(({ where, select }) => {
		if (where.userId) return Promise.resolve(selfRow)
		if (!targetsInOrg.has(where.id)) return Promise.resolve(null)
		return Promise.resolve(
			select?.branchId ? { branchId: branchOf[where.id] ?? null } : { id: where.id }
		)
	})
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
		// `listVisibleEmployeeIds`, whose `null` ("unrestricted") is falsy and would deny HR. Only the
		// route's own target lookup should fire — `canTouchEmployee` short-circuits on
		// ADMINISTER_HR_ORGWIDE and never reaches its self lookup.
		expect(dbMock.employee.findFirst).toHaveBeenCalledTimes(1)
	})

	it('still 404s an employee outside the caller’s organization', async () => {
		targetsInOrg = new Set()
		const res = await GET(event(['HR_ADMIN'], STRANGER))
		expect(res.status).toBe(404)
	})
})

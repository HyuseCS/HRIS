import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #275, the requests half — `GET /api/v1/requests`.
 *
 * The route asked `hasAnyMinRole(user.roles, 'MANAGER')` and then handed the caller's `employeeId`
 * straight to `listRequests`, so any MANAGER read any employee's leave and OT history. With no
 * `employeeId` at all the filter was simply absent and the response was the whole organization.
 *
 * Second leak on the same line: a caller with NO employee record yielded `employeeId: undefined`,
 * which the where-builder drops — so the self-only path also returned the entire org. `[]` closes
 * it.
 *
 * Scoped with `listVisibleEmployeeIds`, the roster helper, not `listVisiblePayEmployeeIds`. The pay
 * helper's only difference is that it opens up for VIEW_PAY_ORGWIDE, which here would WIDEN the
 * route for PAYROLL_OFFICER and FINANCE — self-only today. Widening is a regression, not a fix.
 */

const { dbMock, listReportIdsFor, listRequests, countRequests, getLeaveBalances } = vi.hoisted(
	() => ({
		listReportIdsFor: vi.fn(),
		listRequests: vi.fn(),
		countRequests: vi.fn(),
		getLeaveBalances: vi.fn(),
		dbMock: {
			employee: { findFirst: vi.fn(), findMany: vi.fn() },
			branch: { findMany: vi.fn() },
			leaveType: { findMany: vi.fn() }
		}
	})
)

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))
vi.mock('$lib/server/services/leave', () => ({ getLeaveBalances }))
vi.mock('$lib/server/services/requests', () => ({
	listRequests,
	countRequests,
	createRequest: vi.fn(),
	deleteRequest: vi.fn()
}))

const { GET } = await import('../../src/routes/api/v1/requests/+server')
const { load } = await import('../../src/routes/(app)/leave/+page.server')

const ACTOR_USER = 'user-actor'
const ORG = 'org1'
const SELF = 'self-emp'
const REPORT = 'report-emp'
const STRANGER = 'stranger-emp'

const event = (roles: Role[], employeeId?: string) =>
	({
		locals: { user: { id: ACTOR_USER, organizationId: ORG, roles } },
		url: { searchParams: new URLSearchParams(employeeId ? { employeeId } : {}) }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** What the route actually asked the service for. */
const params = () => listRequests.mock.calls[0][0]

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue({ id: SELF })
	listReportIdsFor.mockResolvedValue([REPORT])
	dbMock.branch.findMany.mockResolvedValue([])
	dbMock.employee.findMany.mockImplementation(({ where }) =>
		Promise.resolve((where.id?.in ?? []).map((id: string) => ({ id })))
	)
	listRequests.mockResolvedValue([])
	countRequests.mockResolvedValue(0)
	getLeaveBalances.mockResolvedValue([])
	dbMock.leaveType.findMany.mockResolvedValue([])
})

describe('GET /api/v1/requests', () => {
	// This route throws `error(403)` rather than returning an `apiError` response — matching the file.
	it('refuses a MANAGER asking for an employee outside their line', async () => {
		await expect(GET(event(['MANAGER'], STRANGER))).rejects.toMatchObject({ status: 403 })
		expect(listRequests).not.toHaveBeenCalled()
	})

	it('lets a MANAGER ask for their own direct report', async () => {
		await GET(event(['MANAGER'], REPORT))
		expect(params().employeeIds).toEqual([REPORT])
	})

	// The default case, and the wider of the two leaks: no employeeId used to mean no filter.
	it('scopes an unfiltered MANAGER listing to their team', async () => {
		await GET(event(['MANAGER']))
		expect(params().employeeIds).toEqual(expect.arrayContaining([SELF, REPORT]))
		expect(params().employeeIds).not.toContain(STRANGER)
	})

	/**
	 * The allow-list has two sources — direct reports and managed-branch staff — and the 403 guard
	 * must honour both. Without this case, dropping the branch arm from the helper would still leave
	 * every test above green, since STRANGER is outside the reporting line in all of them.
	 */
	it('lets a MANAGER ask for an employee reachable only through a branch they manage', async () => {
		dbMock.branch.findMany.mockResolvedValue([{ id: 'branch1' }])
		dbMock.employee.findMany.mockImplementation(({ where }) =>
			Promise.resolve(
				where.branchId ? [{ id: STRANGER }] : (where.id?.in ?? []).map((id: string) => ({ id }))
			)
		)
		await GET(event(['MANAGER'], STRANGER))
		expect(params().employeeIds).toEqual([STRANGER])
	})

	it('leaves an HR_ADMIN unrestricted', async () => {
		await GET(event(['HR_ADMIN']))
		expect(params().employeeIds).toBeUndefined()
	})

	it('lets an HR_ADMIN filter to any employee', async () => {
		await GET(event(['HR_ADMIN'], STRANGER))
		expect(params().employeeIds).toEqual([STRANGER])
	})

	/**
	 * The regression guard for the helper choice. FINANCE holds VIEW_PAY_ORGWIDE but not
	 * ADMINISTER_HR_ORGWIDE and does not clear the MANAGER rank, so it stays self-only here — using
	 * the pay helper would have opened the whole org's leave history to it.
	 */
	it('keeps FINANCE self-only', async () => {
		await GET(event(['FINANCE'], STRANGER))
		expect(params().employeeIds).toEqual([SELF])
	})

	it('keeps a PAYROLL_OFFICER self-only', async () => {
		await GET(event(['PAYROLL_OFFICER']))
		expect(params().employeeIds).toEqual([SELF])
	})

	it('keeps an EMPLOYEE to their own requests', async () => {
		await GET(event(['EMPLOYEE'], STRANGER))
		expect(params().employeeIds).toEqual([SELF])
	})

	// The second leak: no employee record must mean no rows, not every row.
	it('returns nothing for a non-manager with no employee record', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		await GET(event(['EMPLOYEE']))
		expect(params().employeeIds).toEqual([])
	})

	it('returns nothing for a MANAGER with no employee record', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		await GET(event(['MANAGER']))
		expect(params().employeeIds).toEqual([])
	})

	it('honours a secondary role carrying org-wide HR reach (#133)', async () => {
		await GET(event(['MANAGER', 'HR_ADMIN'], STRANGER))
		expect(params().employeeIds).toEqual([STRANGER])
	})
})

/**
 * The page twin (#275, twin-door #235/#259). `/leave` carried the identical bug: `isManager` gated
 * on VIEW_TEAM and then passed `employeeId: undefined`, which the where-builder drops — so the page
 * listed the whole organization's leave. Same helper choice as the route above, and deliberately
 * written longhand: #275 exists because a review fixed one door and missed its twin.
 *
 * `listParams` feeds BOTH `countRequests` and `listRequests`, so each case pins both.
 */
const loadEvent = (roles: Role[]) =>
	({
		locals: { user: { id: ACTOR_USER, organizationId: ORG, roles } },
		url: new URL('http://localhost/leave')
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** What the page asked the service for — the count and the rows must agree. */
const pageParams = () => {
	expect(countRequests.mock.calls[0][0]).toEqual(listRequests.mock.calls[0][0])
	return listRequests.mock.calls[0][0]
}

describe('/leave page load', () => {
	it('scopes a MANAGER to their visible roster', async () => {
		await load(loadEvent(['MANAGER']))
		expect(pageParams().employeeIds).toEqual(expect.arrayContaining([SELF, REPORT]))
		expect(pageParams().employeeIds).not.toContain(STRANGER)
	})

	it('includes the staff of a branch the MANAGER manages', async () => {
		dbMock.branch.findMany.mockResolvedValue([{ id: 'branch1' }])
		dbMock.employee.findMany.mockImplementation(({ where }) =>
			Promise.resolve(
				where.branchId ? [{ id: STRANGER }] : (where.id?.in ?? []).map((id: string) => ({ id }))
			)
		)
		await load(loadEvent(['MANAGER']))
		expect(pageParams().employeeIds).toEqual(expect.arrayContaining([SELF, REPORT, STRANGER]))
	})

	// `null` from the helper means unrestricted — no employee filter at all, not an empty list.
	it('leaves an HR_ADMIN unrestricted', async () => {
		await load(loadEvent(['HR_ADMIN']))
		expect(pageParams().employeeIds).toBeUndefined()
	})

	it('leaves a CEO unrestricted', async () => {
		await load(loadEvent(['CEO']))
		expect(pageParams().employeeIds).toBeUndefined()
	})

	it('keeps a plain EMPLOYEE to their own rows', async () => {
		await load(loadEvent(['EMPLOYEE']))
		expect(pageParams().employeeIds).toEqual([SELF])
	})

	// The regression guard for the helper choice: the pay helper would have opened the org to these.
	it('keeps FINANCE self-only', async () => {
		await load(loadEvent(['FINANCE']))
		expect(pageParams().employeeIds).toEqual([SELF])
	})

	it('keeps a PAYROLL_OFFICER self-only', async () => {
		await load(loadEvent(['PAYROLL_OFFICER']))
		expect(pageParams().employeeIds).toEqual([SELF])
	})

	// The second leak: `[]`, never `undefined` — an undefined filter is dropped and leaks the org.
	it('gives a MANAGER with no employee record an empty allow-list, not undefined', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		await load(loadEvent(['MANAGER']))
		expect(pageParams().employeeIds).toEqual([])
		expect(pageParams().employeeIds).not.toBeUndefined()
	})

	it('honours a secondary role carrying org-wide HR reach (#133)', async () => {
		await load(loadEvent(['MANAGER', 'HR_ADMIN']))
		expect(pageParams().employeeIds).toBeUndefined()
	})

	// #64 and the existing short-circuit must keep working.
	it('still returns no rows for a non-manager with no employee record', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		const result = await load(loadEvent(['EMPLOYEE']))
		expect(listRequests).not.toHaveBeenCalled()
		expect(countRequests).not.toHaveBeenCalled()
		expect(result).toMatchObject({ requests: [], pagination: { total: 0 } })
	})

	it('still paginates the request list (#64)', async () => {
		countRequests.mockResolvedValue(25)
		await load(loadEvent(['EMPLOYEE']))
		expect(listRequests.mock.calls[0][1]).toEqual({ skip: 0, take: 10 })
	})
})

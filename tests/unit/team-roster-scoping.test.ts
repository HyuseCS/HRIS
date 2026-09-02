import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #6 — the /team roster, and the one site where the org-scoping fix was itself the regression.
 *
 * `memberScope` starts as `{}` and is only narrowed for a non-admin. Spread into a Prisma `where`,
 * `{}` is not a filter — it is the WHOLE org roster. Before #6 the self lookup was an unscoped
 * `findUnique`, so a multi-org actor always found their home-org row and the null branch was
 * unreachable. Adding the org filter is what makes it reachable: the same actor in a tenant where
 * they have no employee row now falls through with `myEmployee === null`.
 *
 * `VIEW_TEAM` includes MANAGER; `ADMINISTER_HR_RECORDS` does not. `switch-org` gates on membership
 * alone and `UserOrganization` carries no role column, so this is any multi-org MANAGER, not just
 * the CEO. The fix is `{ id: { in: [] } }` — an empty positive restriction, never an absent one.
 *
 * The sweep in `self-lookup-org-sweep.test.ts` cannot see this class: the site is correctly scoped
 * and still widens, because the widening happens in a different clause. Only this file covers it.
 */

const { dbMock, listReportIdsFor, autoDeriveFromPunches } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	autoDeriveFromPunches: vi.fn(),
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn() },
		attendanceDay: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))
vi.mock('$lib/server/services/attendance', () => ({ autoDeriveFromPunches }))

// The real rbac module, deliberately: the claim is about the actual capability sets, and mocking
// `canAny` would let MANAGER drift into ADMINISTER_HR_RECORDS without this file noticing.
const { load } = await import('../../src/routes/(app)/team/+page.server')

const ORG = 'org-active'
/** The actor's own employee row — present in the active org, or absent because it is elsewhere. */
let selfRow: { id: string } | null = null

const event = (roles: Role[]) =>
	({
		locals: { user: { id: 'user-1', roles, organizationId: ORG } },
		url: new URL('http://localhost/team'),
		getClientAddress: () => '127.0.0.1'
	}) as never

/** The `where` the roster query actually received. */
const rosterWhere = () => dbMock.employee.findMany.mock.calls[0][0].where

beforeEach(() => {
	vi.clearAllMocks()
	selfRow = { id: 'emp-self' }
	listReportIdsFor.mockResolvedValue([])
	autoDeriveFromPunches.mockResolvedValue(undefined)
	dbMock.attendanceDay.findMany.mockResolvedValue([])
	dbMock.employee.findMany.mockResolvedValue([])
	// Discriminate on the where-shape: the self lookup keys on `userId`, the roster on `id`.
	dbMock.employee.findFirst.mockImplementation(({ where }: { where: { userId?: string } }) =>
		Promise.resolve(where.userId ? selfRow : null)
	)
})

describe('/team roster scoping (#6)', () => {
	it('scopes the self lookup to the active organization', async () => {
		await load(event(['MANAGER']))
		expect(dbMock.employee.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { userId: 'user-1', organizationId: ORG } })
		)
	})

	it('restricts a MANAGER whose employee row is in another org to nobody', async () => {
		selfRow = null
		await load(event(['MANAGER']))
		// `{ in: [] }` and not an absent `id`. The dangerous failure is `{}`, which reads as "no
		// filter" and returns every active employee in the tenant.
		expect(rosterWhere().id).toEqual({ in: [] })
		expect(listReportIdsFor).not.toHaveBeenCalled()
	})

	// The positive control. Without it, a mutation that hard-codes `{ in: [] }` for everyone would
	// pass the row above and quietly empty every manager's roster.
	it('still gives that MANAGER their reports when the row IS in the active org', async () => {
		listReportIdsFor.mockResolvedValue(['report-1', 'report-2'])
		await load(event(['MANAGER']))
		expect(rosterWhere().id).toEqual({ in: ['report-1', 'report-2'] })
		expect(listReportIdsFor).toHaveBeenCalledWith('emp-self')
	})

	// The other direction: HR reads the roster unfiltered by design, and must keep doing so even
	// with no employee row of their own. Narrowing this would be the over-correction.
	it('leaves an ADMINISTER_HR_RECORDS holder unrestricted, with or without a row', async () => {
		selfRow = null
		await load(event(['HR_ADMIN']))
		expect(rosterWhere().id).toBeUndefined()
		expect(rosterWhere().organizationId).toBe(ORG)
	})
})

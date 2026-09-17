import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #6 — the /team roster, and the one site where the org-scoping fix was itself the regression.
 *
 * The roster `where` carries no `id` until it is narrowed for a non-admin. Without one it is not a
 * filter — it is the WHOLE org roster. Before #6 the self lookup was an unscoped
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

const { dbMock, listReportIdsFor } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))

// The real rbac module, deliberately: the claim is about the actual capability sets, and mocking
// `canAny` would let MANAGER drift into ADMINISTER_HR_RECORDS without this file noticing.
const { load } = await import('../../src/routes/(app)/team/+page.server')

const ORG = 'org-active'
/** The actor's own employee row — present in the active org, or absent because it is elsewhere. */
let selfRow: { id: string } | null = null

const event = (roles: Role[], query = '') =>
	({
		locals: { user: { id: 'user-1', roles, organizationId: ORG } },
		url: new URL(`http://localhost/team${query}`)
	}) as never

/** The `where` the roster query actually received. */
const rosterWhere = () => dbMock.employee.findMany.mock.calls[0][0].where

type Row = {
	id: string
	organizationId: string
	isActive: boolean
	employmentStatus: string
	firstName: string
	lastName: string
	employeeNumber: string
	jobTitle: string
}
let table: Row[] = []

type Where = {
	organizationId?: string
	user?: { isActive?: boolean }
	employmentStatus?: { not?: string }
	id?: { in: string[] }
	OR?: Record<string, { contains: string; mode: string }>[]
}

const matches = (row: Row, where: Where) =>
	(where.organizationId === undefined || row.organizationId === where.organizationId) &&
	(where.user?.isActive === undefined || row.isActive === where.user.isActive) &&
	(where.employmentStatus?.not === undefined ||
		row.employmentStatus !== where.employmentStatus.not) &&
	(where.id === undefined || where.id.in.includes(row.id)) &&
	(where.OR === undefined ||
		where.OR.some((clause) =>
			Object.entries(clause).some(([field, { contains, mode }]) => {
				expect(mode).toBe('insensitive')
				return String(row[field as keyof Row])
					.toLowerCase()
					.includes(contains.toLowerCase())
			})
		))

const row = (id: string, over: Partial<Row> = {}): Row => ({
	id,
	organizationId: ORG,
	isActive: true,
	employmentStatus: 'ACTIVE',
	firstName: id,
	lastName: id,
	employeeNumber: `EMP-${id}`,
	jobTitle: 'Cook',
	...over
})

const returnedIds = (result: unknown) =>
	(result as { people: { id: string }[] }).people.map((p) => p.id)

beforeEach(() => {
	vi.clearAllMocks()
	selfRow = { id: 'emp-self' }
	listReportIdsFor.mockResolvedValue([])
	table = [
		row('report-1'),
		row('report-2'),
		row('stranger'),
		row('other-org', { organizationId: 'org-other' }),
		row('inactive-user', { isActive: false }),
		row('offboarded', { employmentStatus: 'OFFBOARDED' })
	]
	dbMock.employee.count.mockImplementation(({ where }: { where: Where }) =>
		Promise.resolve(table.filter((r) => matches(r, where)).length)
	)
	dbMock.employee.findMany.mockImplementation(
		({ where, skip, take }: { where: Where; skip: number; take: number }) =>
			Promise.resolve(
				table
					.filter((r) => matches(r, where))
					.slice(skip, skip + take)
					.map((r) => ({ ...r, companyEmail: null, department: { name: 'Kitchen' } }))
			)
	)
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
		expect(returnedIds(await load(event(['MANAGER'])))).toEqual([])
	})

	// The positive control. Without it, a mutation that hard-codes `{ in: [] }` for everyone would
	// pass the row above and quietly empty every manager's roster.
	it('still gives that MANAGER their reports when the row IS in the active org', async () => {
		listReportIdsFor.mockResolvedValue(['report-1', 'report-2'])
		const result = await load(event(['MANAGER']))
		expect(rosterWhere().id).toEqual({ in: ['report-1', 'report-2'] })
		expect(listReportIdsFor).toHaveBeenCalledWith('emp-self')
		expect(returnedIds(result)).toEqual(['report-1', 'report-2'])
	})

	// The other direction: HR reads the roster unfiltered by design, and must keep doing so even
	// with no employee row of their own. Narrowing this would be the over-correction.
	it('leaves an ADMINISTER_HR_RECORDS holder unrestricted, with or without a row', async () => {
		selfRow = null
		await load(event(['HR_ADMIN']))
		expect(rosterWhere().id).toBeUndefined()
		expect(rosterWhere().organizationId).toBe(ORG)
	})

	it('drops other orgs, deactivated logins and offboarded staff for HR', async () => {
		const result = await load(event(['HR_ADMIN']))
		expect(rosterWhere()).toMatchObject({
			organizationId: ORG,
			user: { isActive: true },
			employmentStatus: { not: 'OFFBOARDED' }
		})
		expect(returnedIds(result)).toEqual(['report-1', 'report-2', 'stranger'])
	})

	it('searches name, employee number and job title inside the scope, trimmed', async () => {
		table.push(row('report-3', { jobTitle: 'Head Chef' }))
		listReportIdsFor.mockResolvedValue(['report-1', 'report-3'])
		const result = await load(event(['MANAGER'], '?search=%20%20chef%20'))
		expect(rosterWhere().OR).toEqual(
			['firstName', 'lastName', 'employeeNumber', 'jobTitle'].map((field) => ({
				[field]: { contains: 'chef', mode: 'insensitive' }
			}))
		)
		expect(returnedIds(result)).toEqual(['report-3'])
	})

	it('caps the search term at 100 characters', async () => {
		const result = (await load(event(['HR_ADMIN'], `?search=${'a'.repeat(150)}`))) as {
			search: string
		}
		expect(result.search).toHaveLength(100)
	})

	it('sends no OR clause for a blank search', async () => {
		await load(event(['HR_ADMIN'], '?search=%20%20'))
		expect(rosterWhere().OR).toBeUndefined()
	})

	it('pages by the view: 9 on the grid, 12 on the list', async () => {
		await load(event(['HR_ADMIN']))
		expect(dbMock.employee.findMany.mock.calls[0][0].take).toBe(9)
		vi.clearAllMocks()
		await load(event(['HR_ADMIN'], '?view=list'))
		expect(dbMock.employee.findMany.mock.calls[0][0].take).toBe(12)
	})

	it('selects no sensitive field', async () => {
		await load(event(['HR_ADMIN']))
		expect(Object.keys(dbMock.employee.findMany.mock.calls[0][0].select).sort()).toEqual([
			'branch',
			'companyEmail',
			'department',
			'employeeNumber',
			'employmentStatus',
			'firstName',
			'id',
			'jobTitle',
			'lastName'
		])
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * AVIPA #4 — every org filter on an Employee read went through the `user` relation
 * (`employee: { user: { organizationId } }`). That is the wrong column. `User.organizationId` is
 * the user's PRIMARY org; the org a request acts in is `ctx.organizationId`, resolved in
 * `hooks.server.ts:38`, and `Employee` carries its own indexed `organizationId`.
 *
 * Every other org-scoping test in this repo fixtures a CONVERGED employee, where
 * `Employee.organizationId === Employee.user.organizationId` — those pass under both the old shape
 * and the new one, so none of them can catch a revert. This file constructs the DIVERGENT
 * precondition that tells the two apart, and asserts both directions:
 *
 *   1. missing rows      — acting in the employee's own org, the row IS returned (old shape misses it)
 *   2. cross-tenant leak — acting in the user's primary org, the row is NOT returned (old shape leaks it)
 *
 * The mocked client APPLIES the `where` it is given to the fixtures rather than shape-matching, so
 * a filter that is present but reads the wrong column still fails here.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findMany: vi.fn() },
		request: { findMany: vi.fn() },
		timesheet: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { listEmployees } = await import('../../src/lib/server/services/employees')
const { listRequests } = await import('../../src/lib/server/services/requests/index')
const { listTimesheets } = await import('../../src/lib/server/services/timesheets')

const ORG_A = 'org-A'
const ORG_B = 'org-B'

/** The divergent row: its own org is A, its user's primary org is B. */
const DIVERGENT = { id: 'emp-div', organizationId: ORG_A, user: { organizationId: ORG_B } }
/** The converged control: both columns say A. This is the only shape the rest of the suite has. */
const CONVERGED = { id: 'emp-conv', organizationId: ORG_A, user: { organizationId: ORG_A } }

const EMPLOYEES = [DIVERGENT, CONVERGED]
const REQUESTS = [
	{ id: 'req-div', employeeId: DIVERGENT.id, employee: DIVERGENT },
	{ id: 'req-conv', employeeId: CONVERGED.id, employee: CONVERGED }
]
const TIMESHEETS = [
	{ id: 'ts-div', employeeId: DIVERGENT.id, employee: DIVERGENT },
	{ id: 'ts-conv', employeeId: CONVERGED.id, employee: CONVERGED }
]

type Where = Record<string, unknown>

/**
 * Recursive so it handles BOTH filter shapes: the top-level `organizationId` column and the nested
 * relation form (`user: { organizationId }`, `employee: { organizationId }`, and the old
 * `employee: { user: { organizationId } }`). If it only understood top-level keys, the reverted
 * shape would match nothing and direction 2 would pass vacuously.
 */
const matches = (row: Record<string, unknown>, where: Where): boolean =>
	Object.entries(where).every(([key, cond]) => {
		if (cond && typeof cond === 'object')
			return matches((row[key] ?? {}) as Record<string, unknown>, cond as Where)
		return row[key] === cond
	})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findMany.mockImplementation(async ({ where }: { where: Where }) =>
		EMPLOYEES.filter((e) => matches(e, where))
	)
	dbMock.request.findMany.mockImplementation(async ({ where }: { where: Where }) =>
		REQUESTS.filter((r) => matches(r, where))
	)
	dbMock.timesheet.findMany.mockImplementation(async ({ where }: { where: Where }) =>
		TIMESHEETS.filter((t) => matches(t, where))
	)
})

describe('employeeListWhere — via listEmployees', () => {
	it('returns the divergent employee when acting in its OWN org', async () => {
		const rows = await listEmployees(ORG_A)
		expect(rows.map((r) => r.id)).toEqual(['emp-div', 'emp-conv'])
	})

	it('does NOT return it when acting in its user’s primary org', async () => {
		expect(await listEmployees(ORG_B)).toEqual([])
	})

	it('filters on the Employee column, never the user relation', async () => {
		await listEmployees(ORG_A)
		const { where } = dbMock.employee.findMany.mock.calls[0][0]
		expect(where.organizationId).toBe(ORG_A)
		expect(where.user).toBeUndefined()
	})
})

describe('requestListWhere — via listRequests', () => {
	it('returns the divergent employee’s request when acting in that employee’s org', async () => {
		const rows = await listRequests({ organizationId: ORG_A })
		expect(rows.map((r) => r.id)).toEqual(['req-div', 'req-conv'])
	})

	it('does NOT return it when acting in the user’s primary org', async () => {
		expect(await listRequests({ organizationId: ORG_B })).toEqual([])
	})

	it('filters on the Employee column, never the user relation', async () => {
		await listRequests({ organizationId: ORG_A })
		const { where } = dbMock.request.findMany.mock.calls[0][0]
		expect(where.employee).toEqual({ organizationId: ORG_A })
	})
})

describe('timesheetListWhere — via listTimesheets', () => {
	it('returns the divergent employee’s timesheet when acting in that employee’s org', async () => {
		const rows = await listTimesheets({ organizationId: ORG_A })
		expect(rows.map((r) => r.id)).toEqual(['ts-div', 'ts-conv'])
	})

	it('does NOT return it when acting in the user’s primary org', async () => {
		expect(await listTimesheets({ organizationId: ORG_B })).toEqual([])
	})

	it('filters on the Employee column, never the user relation', async () => {
		await listTimesheets({ organizationId: ORG_A })
		const { where } = dbMock.timesheet.findMany.mock.calls[0][0]
		expect(where.employee).toEqual({ organizationId: ORG_A })
	})
})

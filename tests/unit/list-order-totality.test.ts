import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Every paginated or sliced list must ask the DB for a TOTAL order (plan AC-1). A list sorted on
 * one non-unique column has none: page 1 and page 2 are separate queries, Postgres may return tied
 * rows in a different relative order per query, so a row can render twice while another becomes
 * unreachable. The fix at all ten sites is one appended `{ id: ... }` term.
 *
 * Expectations were derived by reading each call site and the Prisma schema: every model here keys
 * on `id String @id @default(cuid())`, so `id` is unique on all ten. The primary sort column
 * asserted per case is the one the site already sorted on before the fix.
 *
 * WHAT THIS PROVES: that each site PASSES an `orderBy` array whose final term keys on `id`. The
 * assertion is structural, not a snapshot — it survives a harmless refactor but still reddens if
 * the terms are reordered, if `id` is swapped for a non-unique column, or if the array collapses
 * back into a bare object.
 *
 * WHAT IT DOES NOT PROVE: anything behavioural. It is a change-detector. It cannot check that `id`
 * is unique (a human read the schema for that), it does not prove Postgres honours the requested
 * order, that the route renders it, or that page 2 disagrees with page 1 in a browser. That proof
 * lives in the tied-fixture page walks in `tests/e2e/pagination-lists.spec.ts` and in the
 * integration-tier page-disjointness test. A green run here is intent, never behaviour.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		payrollEntry: { count: vi.fn(), findMany: vi.fn() },
		employee: { findFirst: vi.fn(), findMany: vi.fn() },
		timesheet: { findMany: vi.fn() },
		request: { findMany: vi.fn() },
		auditLog: { count: vi.fn(), findMany: vi.fn() },
		jobPosting: { findMany: vi.fn() },
		actionProposal: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn() }))

const { load: payslipsLoad } = await import('../../src/routes/(app)/payslips/+page.server')
const { load: auditLogLoad } = await import('../../src/routes/(app)/reports/audit-log/+page.server')
const { load: timesheetQueueLoad } =
	await import('../../src/routes/(app)/requests/timesheets/+page.server')
const { listTimesheets } = await import('../../src/lib/server/services/timesheets')
const { listRequests } = await import('../../src/lib/server/services/requests/index')
const { listEmployees } = await import('../../src/lib/server/services/employees')
const { listJobPostings } = await import('../../src/lib/server/services/recruitment')
const { listAssignableEmployees } = await import('../../src/lib/server/services/settings/org')
const { listActionableProposals } = await import('../../src/lib/server/services/action-proposals')
const { listPendingRequestsForApprover } = await import('../../src/lib/server/services/approvals')

const ORG = 'org-1'

const event = (path: string) =>
	({
		locals: { user: { id: 'user-1', organizationId: ORG, roles: ['HR_ADMIN'] } },
		cookies: { get: () => undefined },
		url: new URL(`http://localhost${path}`)
	}) as never

type FindManyMock = { mock: { calls: unknown[][] } }

const CASES: {
	site: string
	primary: string
	run: () => unknown
	query: () => FindManyMock
}[] = [
	{
		site: 'F1 /payslips loader',
		primary: 'payrollRun',
		run: () => payslipsLoad(event('/payslips')),
		query: () => dbMock.payrollEntry.findMany
	},
	{
		site: 'F2 listTimesheets',
		primary: 'periodStart',
		run: () => listTimesheets({ organizationId: ORG }, { skip: 0, take: 10 }),
		query: () => dbMock.timesheet.findMany
	},
	{
		site: 'F3 listRequests',
		primary: 'createdAt',
		run: () => listRequests({ organizationId: ORG }, { skip: 0, take: 10 }),
		query: () => dbMock.request.findMany
	},
	{
		site: 'F4 /reports/audit-log loader',
		primary: 'createdAt',
		run: () => auditLogLoad(event('/reports/audit-log')),
		query: () => dbMock.auditLog.findMany
	},
	{
		site: 'F5 listEmployees',
		primary: 'lastName',
		run: () => listEmployees(ORG, undefined, { skip: 0, take: 10 }),
		query: () => dbMock.employee.findMany
	},
	{
		site: 'F6 listJobPostings',
		primary: 'createdAt',
		run: () => listJobPostings(ORG, undefined, { skip: 0, take: 10 }),
		query: () => dbMock.jobPosting.findMany
	},
	{
		site: 'F7 listAssignableEmployees',
		primary: 'lastName',
		run: () => listAssignableEmployees(ORG),
		query: () => dbMock.employee.findMany
	},
	{
		site: 'F8 listActionableProposals',
		primary: 'createdAt',
		run: () => listActionableProposals(ORG, { actorId: 'user-1', roles: ['HR_ADMIN'] }),
		query: () => dbMock.actionProposal.findMany
	},
	{
		site: 'F9 /requests/timesheets loader',
		primary: 'submittedAt',
		run: () => timesheetQueueLoad(event('/requests/timesheets')),
		query: () => dbMock.timesheet.findMany
	},
	{
		site: 'F10 listPendingRequestsForApprover',
		primary: 'createdAt',
		run: () => listPendingRequestsForApprover(ORG, ['HR_ADMIN'], 'emp-self', 'user-1'),
		query: () => dbMock.request.findMany
	}
]

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.payrollEntry.count.mockResolvedValue(0)
	dbMock.auditLog.count.mockResolvedValue(0)
	dbMock.employee.findFirst.mockResolvedValue({ id: 'emp-self' })
	for (const model of Object.values(dbMock))
		if ('findMany' in model) model.findMany.mockResolvedValue([])
})

describe('paginated list orderBy totality', () => {
	it.each(CASES)('$site ends its orderBy in a unique id term', async ({ primary, run, query }) => {
		await run()

		const calls = query().mock.calls
		expect(calls).toHaveLength(1)
		const { orderBy } = calls[0][0] as { orderBy?: unknown }

		expect(Array.isArray(orderBy)).toBe(true)
		const terms = orderBy as Record<string, unknown>[]
		expect(Object.keys(terms[0])).toEqual([primary])
		expect(Object.keys(terms[terms.length - 1])).toEqual(['id'])
		expect(terms[terms.length - 1].id).toMatch(/^(asc|desc)$/)
	})
})

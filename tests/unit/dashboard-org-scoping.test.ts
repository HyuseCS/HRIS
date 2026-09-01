import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #259 — `getManagerMetrics` resolved direct reports off `reportsToId` alone, with no organization
 * filter, so a row in another tenant naming this actor as its manager was counted as one of their
 * reports. That leaks aggregate counts of another org's pending timesheets and leave across the
 * tenant boundary, and inflates `teamHeadcount`.
 *
 * The read-side half of #235 (which closed the write side). #235 stops NEW cross-tenant
 * `reportsToId` values being planted; it does not clean rows written before it, so the read has to
 * defend itself.
 *
 * The mocked client applies the `where` clauses it is given to the fixtures below, rather than
 * asserting on the query shape — an org filter that is present but wrong still fails here.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
		timesheet: { count: vi.fn() },
		request: { count: vi.fn() },
		auditLog: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { getManagerMetrics } = await import('../../src/lib/server/services/dashboard')

const ORG_A = 'orgA'
const ORG_B = 'orgB'

// The actor: a PAYROLL_OFFICER/FINANCE user in org A (the only roles the dashboard route sends to
// getManagerMetrics — MANAGE_HR holders, MANAGER included, get getAdminMetrics instead).
const ACTOR = { id: 'empA', userId: 'uA', organizationId: ORG_A }

const EMPLOYEES = [
	ACTOR,
	// A genuine report, same org.
	{ id: 'empA1', reportsToId: 'empA', employmentStatus: 'ACTIVE', organizationId: ORG_A },
	// The planted row: another tenant's employee naming our actor as their manager.
	{ id: 'empB1', reportsToId: 'empA', employmentStatus: 'ACTIVE', organizationId: ORG_B }
]

const TIMESHEETS = [
	{ employeeId: 'empA1', status: 'SUBMITTED' },
	{ employeeId: 'empB1', status: 'SUBMITTED' }
]

const REQUESTS = [
	{ employeeId: 'empA1', type: 'LEAVE', status: 'PENDING' },
	{ employeeId: 'empB1', type: 'LEAVE', status: 'PENDING' }
]

// #242 — a real compensation-change row, the shape `recordCompensationChange` writes. The salary
// figures below are what must never reach the dashboard payload.
const OLD_SALARY = 41234
const NEW_SALARY = 57891

const AUDIT_LOGS = [
	{
		id: 'log1',
		organizationId: ORG_A,
		action: 'UPDATE',
		entityType: 'Employee',
		entityId: 'empA1',
		oldValue: { basicMonthlySalary: OLD_SALARY, rateType: 'MONTHLY' },
		newValue: {
			basicMonthlySalary: NEW_SALARY,
			rateType: 'MONTHLY',
			effectiveDate: '2026-01-01'
		},
		ipAddress: '203.0.113.7',
		userAgent: 'Mozilla/5.0 (audit)',
		actorId: 'uHR',
		// #294: the two deliberately disagree — the entry was written while the actor was HR_ADMIN,
		// and the actor holds PAYROLL_OFFICER today. An assertion where both match proves nothing.
		actorRoles: ['HR_ADMIN'],
		createdAt: new Date('2026-01-01T00:00:00Z'),
		actor: { email: 'hr@orga.test', roles: ['PAYROLL_OFFICER'] }
	}
]

/**
 * Emulates Prisma's projection, so the fixture narrows only when the query actually asks it to:
 * a `select` returns its listed fields, an `include` returns every scalar. Without this the
 * assertions below would be vacuous — the mock would hand back the full row either way.
 */
const project = (row: Record<string, unknown>, args: Record<string, unknown>) => {
	const select = args.select as Record<string, unknown> | undefined
	if (!select) return { ...row }
	const out: Record<string, unknown> = {}
	for (const [key, spec] of Object.entries(select)) {
		if (spec === true) out[key] = row[key]
		else if (spec && typeof spec === 'object')
			out[key] = project(row[key] as Record<string, unknown>, spec as Record<string, unknown>)
	}
	return out
}

// Only the operators getManagerMetrics actually uses.
type Where = Record<string, unknown>
const matches = (row: Record<string, unknown>, where: Where): boolean =>
	Object.entries(where).every(([key, cond]) => {
		if (cond && typeof cond === 'object' && 'in' in cond) {
			return (cond.in as unknown[]).includes(row[key])
		}
		return row[key] === cond
	})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockImplementation(async ({ where }: { where: Where }) =>
		EMPLOYEES.find((e) => matches(e, where))
	)
	dbMock.employee.findMany.mockImplementation(async ({ where }: { where: Where }) =>
		EMPLOYEES.filter((e) => matches(e, where))
	)
	dbMock.employee.count.mockImplementation(
		async ({ where }: { where: Where }) => EMPLOYEES.filter((e) => matches(e, where)).length
	)
	dbMock.timesheet.count.mockImplementation(
		async ({ where }: { where: Where }) => TIMESHEETS.filter((t) => matches(t, where)).length
	)
	dbMock.request.count.mockImplementation(
		async ({ where }: { where: Where }) => REQUESTS.filter((r) => matches(r, where)).length
	)
	dbMock.auditLog.findMany.mockImplementation(async (args: { where: Where }) =>
		AUDIT_LOGS.filter((l) => matches(l, args.where)).map((l) => project(l, args))
	)
})

describe('getManagerMetrics — a cross-tenant reportsToId must not leak counts (#259)', () => {
	it('counts only the reports inside the actor’s own organization', async () => {
		const metrics = await getManagerMetrics('uA', ORG_A)

		expect(metrics.teamHeadcount).toBe(1)
	})

	it('does not count another tenant’s pending timesheets or leave', async () => {
		const metrics = await getManagerMetrics('uA', ORG_A)

		expect(metrics.pendingApprovals).toEqual({ timesheets: 1, leave: 1 })
	})

	it('scopes the direct-reports lookup itself, not just the headcount', async () => {
		await getManagerMetrics('uA', ORG_A)

		const { where } = dbMock.employee.findMany.mock.calls[0][0]
		expect(where).toMatchObject({ reportsToId: 'empA', organizationId: ORG_A })
		// The Employee's own column, never the `user` relation: `User.organizationId` is the user's
		// PRIMARY org, which is not necessarily the org this request is acting in.
		expect(where.user).toBeUndefined()
	})
})

/**
 * #242 — the same `recentActivity` rows were fetched with a bare `include`, so every AuditLog
 * scalar shipped to whoever called `GET /api/v1/dashboard`: the before/after salary payload of
 * every compensation change, plus the actor's IP and user agent. Only PAYROLL_OFFICER and FINANCE
 * reach this branch (MANAGE_HR holders get `getAdminMetrics`), and neither holds
 * ADMINISTER_SYSTEM — the capability that gates the same payload on `/reports/audit-log`.
 */
describe('getManagerMetrics — audit-log payloads must not ride along (#242)', () => {
	it('does not return the before/after values of a compensation change', async () => {
		const metrics = await getManagerMetrics('uA', ORG_A)

		expect(metrics.recentActivity).toHaveLength(1)
		const serialized = JSON.stringify(metrics.recentActivity)
		expect(serialized).not.toContain(String(OLD_SALARY))
		expect(serialized).not.toContain(String(NEW_SALARY))
	})

	it('does not return the actor’s IP address or user agent', async () => {
		const metrics = await getManagerMetrics('uA', ORG_A)

		expect(metrics.recentActivity[0]).not.toHaveProperty('ipAddress')
		expect(metrics.recentActivity[0]).not.toHaveProperty('userAgent')
	})

	// The assertion that still bites if the fixture is ever emptied: it pins the query, not the rows.
	it('asks for an explicit column list, never a bare include', async () => {
		await getManagerMetrics('uA', ORG_A)

		const args = dbMock.auditLog.findMany.mock.calls[0][0]
		expect(args.include).toBeUndefined()
		expect(args.select).toEqual({
			id: true,
			action: true,
			entityType: true,
			entityId: true,
			createdAt: true,
			actorRoles: true,
			actor: { select: { email: true } }
		})
	})

	it('still shows the actor of each recent entry', async () => {
		const metrics = await getManagerMetrics('uA', ORG_A)

		expect(metrics.recentActivity[0]).toMatchObject({
			id: 'log1',
			action: 'UPDATE',
			actor: { email: 'hr@orga.test' }
		})
	})

	// #294 — the roles came from the `actor` relation, so a role change rewrote the authority
	// reported on every historical entry that actor had ever written.
	it('reports the roles held when the entry was written, not the actor’s roles today', async () => {
		const metrics = await getManagerMetrics('uA', ORG_A)

		expect(metrics.recentActivity[0]).toMatchObject({ actorRoles: ['HR_ADMIN'] })
		expect(JSON.stringify(metrics.recentActivity)).not.toContain('PAYROLL_OFFICER')
	})
})

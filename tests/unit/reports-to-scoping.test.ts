import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #235 — a reporting line must not cross tenants. `reportsToId` is a client-supplied foreign key,
 * and two of its three writers took it as given: `createEmployee` wrote it straight through, and
 * `updateEmployee` (reachable live via `PATCH /api/v1/employees/[id]` with plain JSON) wrote it
 * with `data: input`. Only `promoteEmployee` checked. All three now route through one helper.
 *
 * Error shape is `promoteEmployee`'s, deliberately: 404 'Manager not found' cross-org, 400 for a
 * self-report. DB + audit + bcrypt are mocked, so the services run for real against the mock.
 */

// No pay or employment-type field appears in any body below, so `promoteEmployee` never runs and
// the only transaction is createEmployee's — which takes the same mock as its client.
const { dbMock, bcryptHash } = vi.hoisted(() => {
	return {
		bcryptHash: vi.fn().mockResolvedValue('hashed'),
		dbMock: {
			user: { findUnique: vi.fn(), create: vi.fn() },
			// findFirst answers BOTH getEmployee's subject lookup and the new manager lookup, so the
			// per-path call order below is what each test pins.
			employee: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
				findUniqueOrThrow: vi.fn(),
				create: vi.fn(),
				update: vi.fn()
			},
			organization: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
			// createEmployee allocates leave entitlement (#137) and seeds the #170/#171 comp and #222
			// employment-type baselines inside the same transaction.
			leaveType: { findMany: vi.fn() },
			leaveBalance: { findMany: vi.fn(), createMany: vi.fn() },
			employeeCompensation: { create: vi.fn(), findMany: vi.fn() },
			employeeEmploymentType: { create: vi.fn(), findMany: vi.fn() },
			payrollRun: { findFirst: vi.fn() },
			$transaction: vi.fn()
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('bcrypt', () => ({ default: { hash: bcryptHash } }))
vi.mock('$lib/server/services/action-proposals', () => ({
	createProposal: vi.fn().mockResolvedValue({ id: 'prop-1' }),
	// A factory mock replaces the whole module, so both exports employees.ts imports must be present.
	assertMayConfirmProposal: vi.fn()
}))

const { createEmployee, updateEmployee } = await import('$lib/server/services/employees')
const { PATCH } = await import('../../src/routes/api/v1/employees/[id]/+server')

const ORG = 'org1'
const CTX = {
	organizationId: ORG,
	actorId: 'user1',
	actorRoles: ['HR_ADMIN'] as Role[],
	ipAddress: 'test'
}

const HIRE = {
	email: 'new@veent.ph',
	password: 'pw',
	role: 'EMPLOYEE' as Role,
	firstName: 'New',
	lastName: 'Hire',
	departmentId: 'dept1',
	jobTitle: 'Analyst',
	employmentType: 'REGULAR' as const,
	startDate: new Date('2026-01-01'),
	basicMonthlySalary: 30000
}

/** The existing 201 file updateEmployee diffs against. No reporting line yet. */
const EMP = {
	id: 'emp1',
	userId: 'user-emp1',
	reportsToId: null as string | null,
	branchId: null,
	basicMonthlySalary: 30000,
	rateType: 'MONTHLY' as const,
	employmentType: 'REGULAR' as const,
	startDate: new Date('2024-01-01')
}

const HR_USER = {
	id: 'u1',
	organizationId: ORG,
	roles: ['HR_ADMIN'] as Role[]
}

const patch = (body: unknown) =>
	PATCH({
		locals: { user: HR_USER },
		params: { id: 'emp1' },
		request: { json: async () => body }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock))
	dbMock.user.findUnique.mockResolvedValue(null)
	dbMock.user.create.mockResolvedValue({ id: 'user-new' })
	dbMock.organization.findUniqueOrThrow.mockResolvedValue({ employeeNumberPrefix: 'EMP' })
	dbMock.organization.findUnique.mockResolvedValue(null) // no Discord invite configured (#186)
	dbMock.employee.findMany.mockResolvedValue([])
	dbMock.employee.create.mockResolvedValue({ id: 'emp-new', employeeNumber: 'EMP-001' })
	dbMock.employee.update.mockResolvedValue(EMP)
	// #5: updateEmployee reads its `before` snapshot inside the transaction.
	dbMock.employee.findUniqueOrThrow.mockResolvedValue(EMP)
	dbMock.leaveType.findMany.mockResolvedValue([])
	dbMock.leaveBalance.findMany.mockResolvedValue([])
	dbMock.leaveBalance.createMany.mockResolvedValue({ count: 0 })
	dbMock.employeeCompensation.findMany.mockResolvedValue([]) // no history → getEmployee heal is a no-op
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
	dbMock.payrollRun.findFirst.mockResolvedValue(null)
})

describe('createEmployee — the hire path validates the reporting line (#235)', () => {
	it('refuses a manager from another tenant', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null) // org-scoped lookup finds nothing

		await expect(
			createEmployee(ORG, { ...HIRE, reportsToId: 'emp-other-org' }, CTX)
		).rejects.toMatchObject({ status: 404 })

		// Nothing was written — the guard runs before the transaction opens.
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(dbMock.user.create).not.toHaveBeenCalled()
		expect(dbMock.employee.create).not.toHaveBeenCalled()
	})

	it('accepts a same-org manager and writes the line', async () => {
		dbMock.employee.findFirst.mockResolvedValue({ id: 'mgr1' })

		await createEmployee(ORG, { ...HIRE, reportsToId: 'mgr1' }, CTX)

		expect(dbMock.employee.create).toHaveBeenCalledTimes(1)
		expect(dbMock.employee.create.mock.calls[0][0].data.reportsToId).toBe('mgr1')
	})

	it('does not look anything up when the hire has no reporting line', async () => {
		await createEmployee(ORG, HIRE, CTX)

		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
		expect(dbMock.employee.create).toHaveBeenCalledTimes(1)
	})

	it('validates the manager BEFORE hashing the password', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)

		await expect(
			createEmployee(ORG, { ...HIRE, reportsToId: 'emp-other-org' }, CTX)
		).rejects.toMatchObject({ status: 404 })

		// The lookup ran and bcrypt did not: the guard sits ahead of the hash, so a hire that cannot
		// succeed never burns 300ms of bcrypt at cost 12. Were it placed after, hash would be called.
		expect(dbMock.employee.findFirst).toHaveBeenCalledTimes(1)
		expect(bcryptHash).not.toHaveBeenCalled()
	})
})

describe('updateEmployee — the second writer validates it too (#235)', () => {
	it('refuses a manager from another tenant', async () => {
		// #1 getEmployee resolves the subject; #2 the org-scoped manager lookup finds nothing.
		dbMock.employee.findFirst.mockResolvedValueOnce(EMP).mockResolvedValueOnce(null)

		await expect(
			updateEmployee('emp1', ORG, { reportsToId: 'emp-other-org' }, CTX)
		).rejects.toMatchObject({ status: 404 })

		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})

	it('accepts a same-org manager', async () => {
		dbMock.employee.findFirst.mockResolvedValueOnce(EMP).mockResolvedValueOnce({ id: 'mgr1' })

		await updateEmployee('emp1', ORG, { reportsToId: 'mgr1' }, CTX)

		expect(dbMock.employee.update).toHaveBeenCalledTimes(1)
		expect(dbMock.employee.update.mock.calls[0][0].data.reportsToId).toBe('mgr1')
	})

	it('refuses to make an employee their own manager', async () => {
		dbMock.employee.findFirst.mockResolvedValue(EMP)

		await expect(updateEmployee('emp1', ORG, { reportsToId: 'emp1' }, CTX)).rejects.toMatchObject({
			status: 400
		})

		// The self-check short-circuits before any query: only getEmployee's own lookup ran.
		expect(dbMock.employee.findFirst).toHaveBeenCalledTimes(1)
		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})

	it('skips the check when the reporting line is unchanged', async () => {
		// Re-saving a 201 file whose manager predates this check must not fail every unrelated edit.
		dbMock.employee.findFirst.mockResolvedValue({ ...EMP, reportsToId: 'mgr1' })

		await updateEmployee('emp1', ORG, { reportsToId: 'mgr1' }, CTX)

		expect(dbMock.employee.findFirst).toHaveBeenCalledTimes(1)
		expect(dbMock.employee.update).toHaveBeenCalledTimes(1)
	})
})

/**
 * The live route: no UI needed, plain JSON reaches the service with a caller-supplied `reportsToId`.
 * Since #263 that service is `promoteEmployee`, not `updateEmployee` — same helper, same statuses,
 * which is why both cases below hold unchanged. The route's catch flattens any 404 to 'Employee not
 * found', so assert on status — that flattening is pre-existing and desirable (a forged id learns
 * nothing).
 */
describe('PATCH /api/v1/employees/[id] — the reporting line is org-scoped (#235)', () => {
	it('refuses a cross-tenant reportsToId', async () => {
		// #1 getEmployee inside updateEmployee → #2 the manager lookup finds nothing.
		dbMock.employee.findFirst.mockResolvedValueOnce(EMP).mockResolvedValueOnce(null)

		const res = await patch({ reportsToId: 'emp-other-org' })

		expect(res.status).toBe(404)
		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})

	it('still applies a same-org reportsToId', async () => {
		// Inside promoteEmployee: #1 getEmployee → #2 manager lookup. Then #3, the route's own
		// getEmployee re-fetch for the masked response.
		dbMock.employee.findFirst
			.mockResolvedValueOnce(EMP)
			.mockResolvedValueOnce({ id: 'mgr1' })
			.mockResolvedValueOnce({ ...EMP, reportsToId: 'mgr1' })

		const res = await patch({ reportsToId: 'mgr1' })

		expect(res.status).toBe(200)
		expect(dbMock.employee.update.mock.calls[0][0].data.reportsToId).toBe('mgr1')
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import type { Role } from '@prisma/client'

/**
 * Employee number allocation. DB + audit + bcrypt are mocked so this stays in the fast unit
 * suite; assertions are on the number handed to `employee.create`.
 *
 * The rule under test replaced `count + 1`, which is not a sequence: it drifts from the numbers
 * actually issued the moment anyone is deleted or a different width is in play. Both were true
 * in practice, which is how EMP-0013 came to be issued after EMP-0014 already existed and then
 * how onboarding started failing against the (organizationId, employeeNumber) unique index.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		user: { findUnique: vi.fn(), create: vi.fn() },
		employee: { create: vi.fn(), findMany: vi.fn() },
		organization: { findUniqueOrThrow: vi.fn() },
		// createEmployee allocates the new hire's leave entitlement inside the same transaction
		// (#137), so the transaction client has to answer these too. Left empty: this file is
		// about number allocation, and an org with no leave types simply allocates nothing.
		leaveType: { findMany: vi.fn() },
		leaveBalance: { findMany: vi.fn(), createMany: vi.fn() },
		// createEmployee also seeds the #170/#171 compensation baseline inside the transaction,
		// and the #222 employment-type baseline alongside it.
		employeeCompensation: { create: vi.fn() },
		employeeEmploymentType: { create: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))

const { createEmployee } = await import('$lib/server/services/employees')

const ORG = 'org1'
const ctx = {
	organizationId: ORG,
	actorId: 'user1',
	actorRoles: ['HR_ADMIN'] as Role[],
	ipAddress: 'test'
}
const input = {
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

/** The employeeNumber that reached employee.create on the nth call (1-indexed). */
const numberOnCall = (n = 1) => dbMock.employee.create.mock.calls[n - 1][0].data.employeeNumber

function conflictOn(field: string) {
	return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
		code: 'P2002',
		clientVersion: 'test',
		meta: { target: ['organizationId', field] }
	})
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock))
	dbMock.user.findUnique.mockResolvedValue(null)
	dbMock.user.create.mockResolvedValue({ id: 'user-new' })
	dbMock.organization.findUniqueOrThrow.mockResolvedValue({ employeeNumberPrefix: 'EMP' })
	dbMock.employee.findMany.mockResolvedValue([])
	dbMock.leaveType.findMany.mockResolvedValue([])
	dbMock.leaveBalance.findMany.mockResolvedValue([])
	dbMock.leaveBalance.createMany.mockResolvedValue({ count: 0 })
	dbMock.employee.create.mockResolvedValue({ id: 'emp-new', employeeNumber: 'EMP-001' })
})

describe('employee number allocation', () => {
	it('starts at 001 for an organization with no employees', async () => {
		await createEmployee(ORG, input, ctx)
		expect(numberOnCall()).toBe('EMP-001')
	})

	it('continues from the highest number in use, not the row count', async () => {
		// The exact shape that broke: 3 rows, but the highest issued number is 14. A count-based
		// scheme would produce EMP-004; the correct answer is one past the highest.
		dbMock.employee.findMany.mockResolvedValue([
			{ employeeNumber: 'EMP-001' },
			{ employeeNumber: 'EMP-0013' },
			{ employeeNumber: 'EMP-0014' }
		])
		await createEmployee(ORG, input, ctx)
		expect(numberOnCall()).toBe('EMP-015')
	})

	it('is unaffected by gaps left behind when an employee is deleted', async () => {
		dbMock.employee.findMany.mockResolvedValue([
			{ employeeNumber: 'EMP-001' },
			{ employeeNumber: 'EMP-009' }
		])
		await createEmployee(ORG, input, ctx)
		// Never reuses 002-008 — a reissued number would collide with historical payslips.
		expect(numberOnCall()).toBe('EMP-010')
	})

	it('uses the organization’s own prefix', async () => {
		dbMock.organization.findUniqueOrThrow.mockResolvedValue({ employeeNumberPrefix: 'JJ' })
		dbMock.employee.findMany.mockResolvedValue([
			{ employeeNumber: 'JJ-001' },
			{ employeeNumber: 'JJ-004' }
		])
		await createEmployee(ORG, input, ctx)
		expect(numberOnCall()).toBe('JJ-005')
	})

	it('pads to three digits and keeps going past the width', async () => {
		dbMock.employee.findMany.mockResolvedValue([{ employeeNumber: 'EMP-999' }])
		await createEmployee(ORG, input, ctx)
		expect(numberOnCall()).toBe('EMP-1000')
	})

	it('ignores an unparsable number rather than throwing', async () => {
		dbMock.employee.findMany.mockResolvedValue([
			{ employeeNumber: 'LEGACY' },
			{ employeeNumber: 'EMP-007' }
		])
		await createEmployee(ORG, input, ctx)
		expect(numberOnCall()).toBe('EMP-008')
	})
})

describe('losing the allocation race', () => {
	it('retries with a fresh number when another create takes it first', async () => {
		dbMock.employee.findMany
			.mockResolvedValueOnce([{ employeeNumber: 'EMP-004' }])
			.mockResolvedValueOnce([{ employeeNumber: 'EMP-005' }]) // the winner landed meanwhile
		dbMock.employee.create
			.mockRejectedValueOnce(conflictOn('employeeNumber'))
			.mockResolvedValueOnce({ id: 'emp-new', employeeNumber: 'EMP-006' })

		await createEmployee(ORG, input, ctx)

		expect(dbMock.employee.create).toHaveBeenCalledTimes(2)
		expect(numberOnCall(1)).toBe('EMP-005')
		expect(numberOnCall(2)).toBe('EMP-006')
	})

	it('does not retry a conflict on a different unique constraint', async () => {
		// A duplicate Discord ID is the caller's problem — retrying just repeats it.
		dbMock.employee.create.mockRejectedValue(conflictOn('discordId'))
		await expect(createEmployee(ORG, input, ctx)).rejects.toMatchObject({ code: 'P2002' })
		expect(dbMock.employee.create).toHaveBeenCalledTimes(1)
	})

	it('gives up rather than looping forever', async () => {
		dbMock.employee.create.mockRejectedValue(conflictOn('employeeNumber'))
		await expect(createEmployee(ORG, input, ctx)).rejects.toMatchObject({ code: 'P2002' })
		expect(dbMock.employee.create).toHaveBeenCalledTimes(5)
	})

	it('audits the number that was actually persisted, not the first one attempted', async () => {
		const { writeAuditLog } = await import('$lib/server/audit')
		dbMock.employee.findMany
			.mockResolvedValueOnce([{ employeeNumber: 'EMP-004' }])
			.mockResolvedValueOnce([{ employeeNumber: 'EMP-005' }])
		dbMock.employee.create
			.mockRejectedValueOnce(conflictOn('employeeNumber'))
			.mockResolvedValueOnce({ id: 'emp-new', employeeNumber: 'EMP-006' })

		await createEmployee(ORG, input, ctx)

		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({ newValue: expect.objectContaining({ employeeNumber: 'EMP-006' }) }),
			// #5: the audit row is written inside the hire transaction, on its client.
			dbMock
		)
	})
})

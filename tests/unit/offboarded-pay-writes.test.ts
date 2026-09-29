import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import type { AuditContext } from '$lib/server/services/types'

const { dbMock, tx, listReportIdsFor } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	tx: {
		loan: { create: vi.fn(), update: vi.fn() },
		cashAdvance: { create: vi.fn(), update: vi.fn() },
		employeeEarning: { create: vi.fn() },
		employeeDeduction: { create: vi.fn() }
	},
	dbMock: {
		$transaction: vi.fn(),
		employee: { findFirst: vi.fn() },
		branch: { findMany: vi.fn() },
		loan: { findFirst: vi.fn() },
		cashAdvance: { findFirst: vi.fn() },
		deductionType: { findFirst: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))

const { writeAuditLog } = await import('$lib/server/audit')
const { SELF_ACTION_DENIED, OFFBOARDED_NO_NEW_PAY } =
	await import('$lib/server/services/employee-access')
const { createLoan, updateLoan, createCashAdvance, updateCashAdvance } =
	await import('$lib/server/services/payroll/loans')
const { createEmployeeEarning } = await import('$lib/server/services/payroll/employee-earnings')
const { createEmployeeDeduction } = await import('$lib/server/services/payroll/employee-deductions')

const ACTOR_USER = 'user-actor'
const ORG = 'org1'
const DENIED = 'You can only manage your own team or a branch you manage.'

type Row = { id: string; userId: string; branchId: null; employmentStatus: string }

const ACTOR_ROW: Row = {
	id: 'self-emp',
	userId: ACTOR_USER,
	branchId: null,
	employmentStatus: 'ACTIVE'
}

const ROWS: Record<string, Row> = {
	'emp-off': { id: 'emp-off', userId: 'user-off', branchId: null, employmentStatus: 'OFFBOARDED' },
	'emp-active': {
		id: 'emp-active',
		userId: 'user-active',
		branchId: null,
		employmentStatus: 'ACTIVE'
	},
	'emp-leave': {
		id: 'emp-leave',
		userId: 'user-leave',
		branchId: null,
		employmentStatus: 'ON_LEAVE'
	},
	'emp-self-off': {
		id: 'emp-self-off',
		userId: ACTOR_USER,
		branchId: null,
		employmentStatus: 'OFFBOARDED'
	}
}

const ctx = (roles: Role[]): AuditContext => ({
	organizationId: ORG,
	actorId: ACTOR_USER,
	actorRoles: roles
})
const CTX = ctx(['HR_ADMIN'])

const CREATES = [
	{
		name: 'createLoan',
		run: (employeeId: string, c: AuditContext) =>
			createLoan(employeeId, ORG, { principal: 50000, installment: 5000 }, c),
		create: tx.loan.create
	},
	{
		name: 'createCashAdvance',
		run: (employeeId: string, c: AuditContext) =>
			createCashAdvance(employeeId, ORG, { amount: 10000, installment: 2000 }, c),
		create: tx.cashAdvance.create
	},
	{
		name: 'createEmployeeEarning',
		run: (employeeId: string, c: AuditContext) =>
			createEmployeeEarning(
				employeeId,
				ORG,
				{ kind: 'ALLOWANCE', label: 'Transport', monthlyAmount: 2000 },
				c
			),
		create: tx.employeeEarning.create
	},
	{
		name: 'createEmployeeDeduction',
		run: (employeeId: string, c: AuditContext) =>
			createEmployeeDeduction(employeeId, ORG, { deductionTypeId: 'dt1', monthlyAmount: 500 }, c),
		create: tx.employeeDeduction.create
	}
]

beforeEach(() => {
	vi.clearAllMocks()
	listReportIdsFor.mockResolvedValue([])
	dbMock.branch.findMany.mockResolvedValue([])
	dbMock.deductionType.findFirst.mockResolvedValue({
		id: 'dt1',
		code: 'CUSTOM',
		isActive: true,
		isStatutory: false
	})
	dbMock.loan.findFirst.mockResolvedValue({ id: 'loan1', employeeId: 'emp-off' })
	dbMock.cashAdvance.findFirst.mockResolvedValue({ id: 'ca1', employeeId: 'emp-off' })
	tx.loan.create.mockResolvedValue({ id: 'loan-new' })
	tx.cashAdvance.create.mockResolvedValue({ id: 'ca-new' })
	tx.employeeEarning.create.mockResolvedValue({ id: 'earning-new' })
	tx.employeeDeduction.create.mockResolvedValue({ id: 'deduction-new' })
	tx.loan.update.mockResolvedValue({ id: 'loan1' })
	tx.cashAdvance.update.mockResolvedValue({ id: 'ca1' })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
	dbMock.employee.findFirst.mockImplementation(
		({
			where,
			select
		}: {
			where: { id?: string; userId?: string }
			select?: Record<string, boolean>
		}) => {
			const row = where.userId ? ACTOR_ROW : ROWS[where.id ?? '']
			if (!row) return Promise.resolve(null)
			return Promise.resolve(
				select
					? Object.fromEntries(
							Object.keys(select)
								.filter((k) => select[k])
								.map((k) => [k, row[k as keyof Row]])
						)
					: row
			)
		}
	)
})

describe.each(CREATES)('$name', ({ run, create }) => {
	it('refuses OFFBOARDED with 409 and writes nothing', async () => {
		await expect(run('emp-off', CTX)).rejects.toMatchObject({
			status: 409,
			body: { message: OFFBOARDED_NO_NEW_PAY }
		})
		expect(create).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('accepts ACTIVE', async () => {
		await expect(run('emp-active', CTX)).resolves.toBeDefined()
		expect(create).toHaveBeenCalledTimes(1)
	})

	it('accepts ON_LEAVE', async () => {
		await expect(run('emp-leave', CTX)).resolves.toBeDefined()
		expect(create).toHaveBeenCalledTimes(1)
	})

	it('self check still wins over the offboarded check', async () => {
		await expect(run('emp-self-off', CTX)).rejects.toMatchObject({
			status: 403,
			body: { message: SELF_ACTION_DENIED }
		})
		expect(create).not.toHaveBeenCalled()
	})
})

describe('updates on an OFFBOARDED employee stay allowed', () => {
	it("updateLoan on an OFFBOARDED employee's loan still succeeds", async () => {
		await expect(updateLoan('loan1', ORG, { status: 'PAID' }, CTX)).resolves.toBeDefined()
		expect(tx.loan.update).toHaveBeenCalled()
	})

	it("updateCashAdvance on an OFFBOARDED employee's advance still succeeds", async () => {
		await expect(updateCashAdvance('ca1', ORG, { status: 'PAID' }, CTX)).resolves.toBeDefined()
		expect(tx.cashAdvance.update).toHaveBeenCalled()
	})
})

describe.each(CREATES.slice(0, 2))(
	'$name — scope check wins over the offboarded check',
	({ run, create }) => {
		it('refuses a MANAGER with no reporting line to the employee with 403, not 409', async () => {
			await expect(run('emp-off', ctx(['MANAGER']))).rejects.toMatchObject({
				status: 403,
				body: { message: DENIED }
			})
			expect(create).not.toHaveBeenCalled()
		})
	}
)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * Separation of duties on pay and employment terms.
 *
 * `offboardEmployee` already refused self-offboarding (#158) and the approvals chain already
 * refuses self-decisions (#75/#174), but every other writer that moves an actor's own money or
 * terms was open: `requireMinRole('HR_ADMIN')` admits MANAGER (level rank in ROLE_HIERARCHY), and
 * the object-level check from #228 deliberately says yes to one's own record — so a manager could
 * open their own 201 file and record their own raise, promotion, loan or statutory exemption.
 *
 * The guard sits in each service so the form action and the v1 API twin are covered by one check.
 * DB and audit are mocked: only the guard is under test, not what happens after it.
 *
 * #224 Part 2 / #243 moved TWO of these writers off the hard 403: `recordCompensationChange` and
 * `promoteEmployee` now file a proposal for a second authorized person to confirm, because a CEO
 * with nobody above them could otherwise never record their own contractual raise. Their cases live
 * in `pay-proposal-routing.test.ts`. Everything still listed here keeps the hard 403 deliberately —
 * a proposal path on role or account changes would be a privilege-escalation surface.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), update: vi.fn() },
		// getEmployee's heal-on-read (#170 Stage 1.5, #222) reads both effective-dated histories.
		employeeCompensation: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
		employeeEmploymentType: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
		employeeEarning: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
		employeeDeduction: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
		employeeStatutoryConfig: { upsert: vi.fn() },
		deductionType: { findFirst: vi.fn() },
		loan: { create: vi.fn() },
		cashAdvance: { create: vi.fn() },
		user: { updateMany: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/notifications', () => ({
	notify: vi.fn().mockResolvedValue(undefined)
}))

const { SELF_ACTION_DENIED } = await import('$lib/server/services/employee-access')
const { updateEmployee } = await import('$lib/server/services/employees')
const { createLoan, createCashAdvance } = await import('$lib/server/services/payroll/loans')
const { createEmployeeEarning, endEmployeeEarning } =
	await import('$lib/server/services/payroll/employee-earnings')
const { createEmployeeDeduction, endEmployeeDeduction } =
	await import('$lib/server/services/payroll/employee-deductions')
const { setStatutoryExemption, setEmployerShareExternal, setStatutoryAllocation } =
	await import('$lib/server/services/payroll/employee-statutory')

const SELF = 'user-self'
const CTX: AuditContext = {
	organizationId: 'org1',
	actorId: SELF,
	actorRoles: ['MANAGER'],
	ipAddress: 'test'
}
const EFF = new Date('2026-08-01')

/** The actor's own 201 file — what every writer below must refuse to move. */
const own = { id: 'emp-self', userId: SELF, basicMonthlySalary: 30000, rateType: 'MONTHLY' }
const other = {
	id: 'emp-other',
	userId: 'user-other',
	basicMonthlySalary: 30000,
	rateType: 'MONTHLY'
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
	dbMock.$transaction.mockImplementation(async (arg: unknown) =>
		typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(dbMock) : arg
	)
})

/** The security property: the call is refused, with the separation-of-duties reason. */
async function refusesSelf(fn: () => Promise<unknown>) {
	await expect(fn()).rejects.toMatchObject({
		status: 403,
		body: { message: SELF_ACTION_DENIED }
	})
}

/**
 * The converse: the guard let this through. Downstream may still fail on an unmocked write —
 * that is fine and not what this asserts, so only the guard's own rejection is ruled out.
 */
async function clearsGuard(fn: () => Promise<unknown>) {
	await fn().catch((e: { body?: { message?: string } }) => {
		expect(e?.body?.message).not.toBe(SELF_ACTION_DENIED)
	})
}

describe('employment-terms writers refuse the actor’s own record', () => {
	beforeEach(() => dbMock.employee.findFirst.mockResolvedValue(own))

	it('updateEmployee — no setting your own title, department, status or end date', async () => {
		for (const terms of [
			{ jobTitle: 'CFO' },
			{ departmentId: 'dept-9' },
			{ employmentStatus: 'OFFBOARDED' as const },
			{ endDate: EFF }
		]) {
			await refusesSelf(() => updateEmployee('emp-self', 'org1', terms, CTX))
		}
		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})

	// The carve-out that makes the guard field-scoped rather than blanket: /profile's update action
	// routes through updateEmployee for the signed-in user and must keep working.
	it('updateEmployee — still allows self-service contact edits', async () => {
		dbMock.employee.update.mockResolvedValue(own)
		await clearsGuard(() =>
			updateEmployee('emp-self', 'org1', { contactPhone: '0917', contactAddress: 'Cebu' }, CTX)
		)
	})
})

describe('payroll money writers refuse the actor’s own record', () => {
	beforeEach(() => dbMock.employee.findFirst.mockResolvedValue(own))

	it('createLoan / createCashAdvance', async () => {
		await refusesSelf(() =>
			createLoan('emp-self', 'org1', { principal: 50000, installment: 5000 }, CTX)
		)
		await refusesSelf(() =>
			createCashAdvance('emp-self', 'org1', { amount: 5000, installment: 1000 }, CTX)
		)
		expect(dbMock.loan.create).not.toHaveBeenCalled()
		expect(dbMock.cashAdvance.create).not.toHaveBeenCalled()
	})

	it('createEmployeeEarning — no granting yourself an allowance', async () => {
		await refusesSelf(() =>
			createEmployeeEarning(
				'emp-self',
				'org1',
				{ kind: 'ALLOWANCE', label: 'Car', monthlyAmount: 20000 },
				CTX
			)
		)
		expect(dbMock.employeeEarning.create).not.toHaveBeenCalled()
	})

	it('createEmployeeDeduction', async () => {
		await refusesSelf(() =>
			createEmployeeDeduction(
				'emp-self',
				'org1',
				{ deductionTypeId: 'dt1', monthlyAmount: 500 },
				CTX
			)
		)
		expect(dbMock.employeeDeduction.create).not.toHaveBeenCalled()
	})

	// Ending is the direction that actually enriches: cancelling your own deduction stops your own
	// repayment. Guarded on both sides so the rule needs no per-field reasoning to apply.
	it('endEmployeeEarning / endEmployeeDeduction', async () => {
		dbMock.employeeEarning.findFirst.mockResolvedValue({
			id: 'ee1',
			isActive: true,
			employee: { userId: SELF }
		})
		dbMock.employeeDeduction.findFirst.mockResolvedValue({
			id: 'ed1',
			isActive: true,
			employee: { userId: SELF }
		})

		await refusesSelf(() => endEmployeeEarning('ee1', 'org1', CTX))
		await refusesSelf(() => endEmployeeDeduction('ed1', 'org1', CTX))
		expect(dbMock.employeeEarning.update).not.toHaveBeenCalled()
		expect(dbMock.employeeDeduction.update).not.toHaveBeenCalled()
	})

	it('statutory exemption / employer share / allocation — these change net pay', async () => {
		await refusesSelf(() => setStatutoryExemption('emp-self', 'org1', 'SSS', true, CTX))
		await refusesSelf(() => setEmployerShareExternal('emp-self', 'org1', 'SSS', true, CTX))
		await refusesSelf(() => setStatutoryAllocation('emp-self', 'org1', 'SSS', 'FIRST', CTX))
		expect(dbMock.employeeStatutoryConfig.upsert).not.toHaveBeenCalled()
	})
})

describe('the same writers still work on somebody else', () => {
	beforeEach(() => dbMock.employee.findFirst.mockResolvedValue(other))

	// HR_ADMIN, not the MANAGER the self-guard cases use. The loan writers now also require the
	// target to be in the actor's pay scope, so a MANAGER is no longer an "authorized actor" for an
	// arbitrary employee — that is the point of the guard, not a regression. This block asserts the
	// converse property (the self-guard does not over-block someone who IS authorized), so it needs
	// a role that genuinely is: HR_ADMIN holds VIEW_PAY_ORGWIDE. The MANAGER-scoped cases live in
	// `loan-write-scoping.test.ts`.
	const ORGWIDE: AuditContext = { ...CTX, actorRoles: ['HR_ADMIN'] }

	it('lets an authorized actor act on another employee', async () => {
		dbMock.deductionType.findFirst.mockResolvedValue({
			id: 'dt1',
			code: 'UNIFORM',
			label: 'Uniform'
		})
		dbMock.employeeEarning.findFirst.mockResolvedValue({
			id: 'ee1',
			isActive: true,
			employee: { userId: 'user-other' }
		})

		await clearsGuard(() =>
			createLoan('emp-other', 'org1', { principal: 50000, installment: 5000 }, ORGWIDE)
		)
		await clearsGuard(() =>
			createEmployeeEarning(
				'emp-other',
				'org1',
				{ kind: 'ALLOWANCE', label: 'Car', monthlyAmount: 20000 },
				CTX
			)
		)
		await clearsGuard(() => endEmployeeEarning('ee1', 'org1', CTX))
		await clearsGuard(() => setStatutoryExemption('emp-other', 'org1', 'SSS', true, CTX))
		await clearsGuard(() => updateEmployee('emp-other', 'org1', { jobTitle: 'CFO' }, CTX))

		expect(dbMock.loan.create).toHaveBeenCalled()
		expect(dbMock.employeeStatutoryConfig.upsert).toHaveBeenCalled()
	})
})

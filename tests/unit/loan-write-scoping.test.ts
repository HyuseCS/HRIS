import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import type { AuditContext } from '$lib/server/services/types'
import { CAPABILITIES } from '$lib/rbac'

/**
 * Who may write a loan or cash advance.
 *
 * The four writers carried, at most, `assertNotSelf` on the creates and nothing but an org filter on
 * the updates. The reporting-line check lived one layer up in the employee page's `scopedToEmployee`
 * wrapper, so the v1 API twins — gated on `requirePayrollManage`, which holds MANAGER — reached any
 * employee in the organization. Confirmed live before the fix: a MANAGER whose only report was one
 * other employee PATCHed an unrelated employee's installment to 999 and got a 200 back.
 *
 * The updates were the worse half: with no `assertNotSelf` at all, an actor could edit their OWN
 * loan, which is the self-dealing #243 closed for compensation.
 *
 * The PAYROLL_OFFICER and FINANCE cases are the ones that would silently regress. Neither role holds
 * `ADMINISTER_HR_ORGWIDE` and neither has a reporting line, so gating on `canTouchEmployee` alone
 * would lock the two roles that exist to administer pay out of every loan — and no seed account
 * carries either role, so nothing else in the repo would notice.
 */

const { dbMock, tx, listReportIdsFor } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	// #324: the four writers now open a transaction and run the mutation on the client it hands
	// them, so the mutation mocks live on `tx`, not `dbMock`. The guard reads stay on `dbMock` —
	// they run before the transaction opens.
	tx: {
		loan: { create: vi.fn(), update: vi.fn() },
		cashAdvance: { create: vi.fn(), update: vi.fn() }
	},
	dbMock: {
		$transaction: vi.fn(),
		employee: { findUnique: vi.fn(), findFirst: vi.fn() },
		branch: { findMany: vi.fn() },
		loan: { findFirst: vi.fn() },
		cashAdvance: { findFirst: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { writeAuditLog } = await import('$lib/server/audit')
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))

const { createLoan, updateLoan, createCashAdvance, updateCashAdvance } =
	await import('$lib/server/services/payroll/loans')
const { SELF_ACTION_DENIED } = await import('$lib/server/services/employee-access')

const ACTOR_USER = 'user-actor'
const ORG = 'org1'

/** The actor's own employee record. */
const SELF = { id: 'self-emp', userId: ACTOR_USER, branchId: null }
const REPORT = { id: 'report-emp', userId: 'user-report', branchId: null }
const STRANGER = { id: 'stranger-emp', userId: 'user-stranger', branchId: null }

const ctx = (role: Role, roles?: Role[]): AuditContext => ({
	organizationId: ORG,
	actorId: ACTOR_USER,
	actorRoles: roles ?? [role]
})

/**
 * `requireEmployee` (selects id/userId) and `canTouchEmployee`'s closing org-scoped lookup (selects
 * branchId) both land on `employee.findFirst`, so the fixture carries every field either reads.
 */
const targeting = (emp: typeof SELF) => dbMock.employee.findFirst.mockResolvedValue(emp)

const DENIED = 'You can only manage your own team or a branch you manage.'
const LOAN_DATA = { principal: 50000, installment: 5000 }
const CA_DATA = { amount: 10000, installment: 2000 }

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findUnique.mockResolvedValue({ id: SELF.id })
	listReportIdsFor.mockResolvedValue([REPORT.id])
	dbMock.branch.findMany.mockResolvedValue([])
	dbMock.loan.findFirst.mockResolvedValue({ id: 'loan1', employeeId: STRANGER.id })
	dbMock.cashAdvance.findFirst.mockResolvedValue({ id: 'ca1', employeeId: STRANGER.id })
	// The creates dereference the new row for the audit entry.
	tx.loan.create.mockResolvedValue({ id: 'loan-new' })
	tx.cashAdvance.create.mockResolvedValue({ id: 'ca-new' })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('the capability containment the loan guard depends on', () => {
	/**
	 * `assertCanTouchEmployee` now receives the full role set (#247), so this no longer licenses a
	 * single-role delegation. What it still pins is the ORDER of `assertMayWriteLoan`'s two arms:
	 * the capability check runs first, and if `VIEW_PAY_ORGWIDE` ever stopped containing
	 * `ADMINISTER_HR_ORGWIDE`, an org-wide HR holder would fall through to a reporting-line check
	 * they may not satisfy. Same containment `payslip-access.test.ts` pins, relied on again here.
	 */
	it('VIEW_PAY_ORGWIDE contains every ADMINISTER_HR_ORGWIDE holder', () => {
		for (const role of CAPABILITIES.ADMINISTER_HR_ORGWIDE) {
			expect(CAPABILITIES.VIEW_PAY_ORGWIDE).toContain(role)
		}
	})
})

describe('updateLoan — the door that was open', () => {
	it('refuses a MANAGER editing an employee who does not report to them', async () => {
		targeting(STRANGER)
		await expect(
			updateLoan('loan1', ORG, { installment: 999 }, ctx('MANAGER'))
		).rejects.toMatchObject({
			status: 403,
			body: { message: DENIED }
		})
		expect(tx.loan.update).not.toHaveBeenCalled()
	})

	it('refuses an actor editing their OWN loan, with the separation-of-duties reason', async () => {
		dbMock.loan.findFirst.mockResolvedValue({ id: 'loan1', employeeId: SELF.id })
		targeting(SELF)
		await expect(
			updateLoan('loan1', ORG, { installment: 1 }, ctx('MANAGER'))
		).rejects.toMatchObject({
			status: 403,
			body: { message: SELF_ACTION_DENIED }
		})
		expect(tx.loan.update).not.toHaveBeenCalled()
	})

	it("lets a MANAGER edit their own report's loan", async () => {
		dbMock.loan.findFirst.mockResolvedValue({ id: 'loan1', employeeId: REPORT.id })
		targeting(REPORT)
		await updateLoan('loan1', ORG, { installment: 999 }, ctx('MANAGER'))
		expect(tx.loan.update).toHaveBeenCalled()
	})

	it('still 404s on a loan outside the actor org, before any scope check', async () => {
		dbMock.loan.findFirst.mockResolvedValue(null)
		await expect(
			updateLoan('loan1', ORG, { installment: 1 }, ctx('HR_ADMIN'))
		).rejects.toMatchObject({
			status: 404
		})
	})
})

describe('the org-wide pay roles keep full reach', () => {
	// Longhand rather than derived from CAPABILITIES: PAYROLL_OFFICER and FINANCE having no
	// reporting line and no ADMINISTER_HR_ORGWIDE is the entire reason this arm exists, and a
	// table-driven loop would restate the implementation instead of pinning the intent.
	for (const role of ['HR_ADMIN', 'PAYROLL_OFFICER', 'FINANCE', 'CEO', 'SUPER_ADMIN'] as Role[]) {
		it(`${role} may edit the loan of an employee who does not report to them`, async () => {
			targeting(STRANGER)
			await updateLoan('loan1', ORG, { installment: 999 }, ctx(role))
			expect(tx.loan.update).toHaveBeenCalled()
		})
	}

	it('still refuses those roles on their own loan', async () => {
		dbMock.loan.findFirst.mockResolvedValue({ id: 'loan1', employeeId: SELF.id })
		targeting(SELF)
		await expect(updateLoan('loan1', ORG, { installment: 1 }, ctx('CEO'))).rejects.toMatchObject({
			status: 403,
			body: { message: SELF_ACTION_DENIED }
		})
	})

	it('reads the full role set, not just the primary role (#133)', async () => {
		targeting(STRANGER)
		await updateLoan('loan1', ORG, { installment: 999 }, ctx('MANAGER', ['MANAGER', 'FINANCE']))
		expect(tx.loan.update).toHaveBeenCalled()
	})
})

describe('updateCashAdvance carries the same guard', () => {
	it('refuses a MANAGER editing a non-report', async () => {
		targeting(STRANGER)
		await expect(
			updateCashAdvance('ca1', ORG, { installment: 999 }, ctx('MANAGER'))
		).rejects.toMatchObject({ status: 403, body: { message: DENIED } })
		expect(tx.cashAdvance.update).not.toHaveBeenCalled()
	})

	it('refuses an actor editing their own cash advance', async () => {
		dbMock.cashAdvance.findFirst.mockResolvedValue({ id: 'ca1', employeeId: SELF.id })
		targeting(SELF)
		await expect(
			updateCashAdvance('ca1', ORG, { installment: 1 }, ctx('MANAGER'))
		).rejects.toMatchObject({ status: 403, body: { message: SELF_ACTION_DENIED } })
	})

	it("lets a MANAGER edit their report's cash advance", async () => {
		dbMock.cashAdvance.findFirst.mockResolvedValue({ id: 'ca1', employeeId: REPORT.id })
		targeting(REPORT)
		await updateCashAdvance('ca1', ORG, { installment: 999 }, ctx('MANAGER'))
		expect(tx.cashAdvance.update).toHaveBeenCalled()
	})
})

describe('the creates gained the scope arm they never had', () => {
	// assertNotSelf was already here; the reporting line was not, so a MANAGER could open a loan
	// against any employee in the org as long as it was not their own record.
	it('refuses a MANAGER creating a loan for a non-report', async () => {
		targeting(STRANGER)
		await expect(createLoan(STRANGER.id, ORG, LOAN_DATA, ctx('MANAGER'))).rejects.toMatchObject({
			status: 403,
			body: { message: DENIED }
		})
		expect(tx.loan.create).not.toHaveBeenCalled()
	})

	it('refuses a MANAGER creating a cash advance for a non-report', async () => {
		targeting(STRANGER)
		await expect(
			createCashAdvance(STRANGER.id, ORG, CA_DATA, ctx('MANAGER'))
		).rejects.toMatchObject({ status: 403, body: { message: DENIED } })
		expect(tx.cashAdvance.create).not.toHaveBeenCalled()
	})

	it('lets a MANAGER create a loan for a report', async () => {
		targeting(REPORT)
		await createLoan(REPORT.id, ORG, LOAN_DATA, ctx('MANAGER'))
		expect(tx.loan.create).toHaveBeenCalled()
		// #324: the audit write shares the transaction. A loan create has no unique key, so a
		// committed loan with a failed audit row is unrecoverable.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('rejects a non-positive installment only AFTER the scope check', async () => {
		targeting(STRANGER)
		await expect(
			createLoan(STRANGER.id, ORG, { principal: 50000, installment: 0 }, ctx('MANAGER'))
		).rejects.toMatchObject({ status: 403 })
	})
})

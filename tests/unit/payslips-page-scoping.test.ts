import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #6 — /payslips was a live cross-tenant read of pay data, not a latent one.
 *
 * The self lookup was already a `findFirst` but carried no org filter, and `user.organizationId`
 * was bound on the line above and never used. `payslipVisibleRunFilter` has no org clause of its
 * own, so nothing downstream re-checked it: a multi-org actor sitting in tenant B was served
 * tenant A's gross pay, deductions and net pay.
 *
 * The empty state is the designed answer, not a redirect — accounts with no employee record of
 * their own (approver, verifier, CEO) already land here legitimately.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn() },
		payrollEntry: { count: vi.fn(), findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { load } = await import('../../src/routes/(app)/payslips/+page.server')

const ORG = 'org-active'
/** The actor's own employee row, or `null` because it lives in another tenant. */
let selfRow: { id: string } | null = null

const event = () =>
	({
		locals: { user: { id: 'user-1', roles: ['EMPLOYEE'], organizationId: ORG } },
		url: new URL('http://localhost/payslips')
	}) as never

beforeEach(() => {
	vi.clearAllMocks()
	selfRow = { id: 'emp-self' }
	dbMock.employee.findFirst.mockImplementation(() => Promise.resolve(selfRow))
	dbMock.payrollEntry.count.mockResolvedValue(1)
	dbMock.payrollEntry.findMany.mockResolvedValue([{ id: 'entry-1' }])
})

describe('/payslips scoping (#6)', () => {
	it('scopes the self lookup to the active organization', async () => {
		await load(event())
		expect(dbMock.employee.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { userId: 'user-1', organizationId: ORG } })
		)
	})

	it('serves the empty state, and reads no pay data at all, when the row is in another org', async () => {
		selfRow = null
		const result = (await load(event())) as { payslips: unknown[] }
		expect(result.payslips).toEqual([])
		// The stronger half: not merely an empty result, but no pay query issued. A `where` built
		// from an undefined employee id would still return rows for somebody.
		expect(dbMock.payrollEntry.findMany).not.toHaveBeenCalled()
		expect(dbMock.payrollEntry.count).not.toHaveBeenCalled()
	})

	// The positive control. Without it a mutation that returns the empty state unconditionally
	// passes the row above while hiding every payslip from everyone.
	it('still serves payslips when the row IS in the active org', async () => {
		const result = (await load(event())) as { payslips: unknown[] }
		expect(result.payslips).toHaveLength(1)
		expect(dbMock.payrollEntry.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: expect.objectContaining({ employeeId: 'emp-self' }) })
		)
	})
})

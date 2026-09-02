import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { CAPABILITIES } from '$lib/rbac'

/**
 * #249 — who may read a payslip.
 *
 * `VIEW_PAYROLL_REPORTS` gained MANAGER in #133, and the payslip doors gated on it alone, so a
 * MANAGER read every employee's gross, statutory deductions and net by id — the case #123's title
 * named and #228/#234 answered everywhere else. `canReadPayslip` is now the single rule behind all
 * three doors.
 *
 * The PAYROLL_OFFICER and FINANCE cases below are the ones that matter most: the fix as originally
 * written in the issue ("add canTouchEmployee to the non-owner branch") would have locked both roles
 * out of every payslip, because `canTouchEmployee` short-circuits on ADMINISTER_HR_ORGWIDE, which
 * neither holds. Nothing in the repo would have caught it — neither role appears in any seed.
 */

const { dbMock, listReportIdsFor } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn() },
		branch: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))

const { canReadPayslip } = await import('$lib/server/services/payroll/payslip-fetch')

const ACTOR_USER = 'user1'
/** The actor's own employee record, when they have one. */
const SELF = { id: 'self-emp' }
const STRANGER = { id: 'stranger-emp', userId: 'user-stranger' }
const REPORT = { id: 'report-emp', userId: 'user-report' }

const actor = (role: Role, roles?: Role[]) => ({
	id: ACTOR_USER,
	roles: roles ?? [role],
	organizationId: 'org1'
})

/** The actor's own employee row, or `null` for "no record in the active org". */
let selfRow: { id: string } | null
/** The closing target lookup's result, or `null` for "not in your org". */
let targetRow: { branchId: string | null } | null

beforeEach(() => {
	vi.clearAllMocks()
	selfRow = SELF
	// `canTouchEmployee` closes with an org-scoped lookup of the target; a null result means "not in
	// your org" and denies. In-org and on no branch is the default here.
	targetRow = { branchId: null }
	// #6 made `canTouchEmployee`'s self lookup a `findFirst` too, so ONE `vi.fn()` now serves both
	// calls: the self lookup keyed by `userId` and the target lookup keyed by `id`. A plain
	// `mockResolvedValue` would hand the target's row to the self lookup, leaving `self.id`
	// undefined and turning every fail-closed case green for the wrong reason.
	dbMock.employee.findFirst.mockImplementation(({ where }) =>
		Promise.resolve(where.userId ? selfRow : targetRow)
	)
	listReportIdsFor.mockResolvedValue([])
	dbMock.branch.findMany.mockResolvedValue([])
})

describe('the capability containment canReadPayslip depends on', () => {
	/**
	 * What this pins changed with #247, and it is worth more now than before.
	 *
	 * It used to license a workaround: `canTouchEmployee` read one role, and containment was the
	 * proof that its short-circuit could never decide the answer here. `canTouchEmployee` now reads
	 * the full set, so that argument is moot.
	 *
	 * What containment still guarantees is the ORDER of the two arms. `canReadPayslip` checks
	 * VIEW_PAY_ORGWIDE and only then delegates; if VIEW_PAY_ORGWIDE ever stopped containing
	 * ADMINISTER_HR_ORGWIDE, an org-wide HR holder would fall through to a reporting-line check and
	 * be denied payslips they hold. That is a live invariant, and this is still its warning.
	 */
	it('VIEW_PAY_ORGWIDE contains every ADMINISTER_HR_ORGWIDE holder', () => {
		for (const role of CAPABILITIES.ADMINISTER_HR_ORGWIDE) {
			expect(CAPABILITIES.VIEW_PAY_ORGWIDE).toContain(role)
		}
	})

	// Written longhand: MANAGER being the sole difference is the whole design, and deriving it from
	// the table would prove nothing.
	it('MANAGER is the only payroll-report role without org-wide payslip reach', () => {
		const residue = CAPABILITIES.VIEW_PAYROLL_REPORTS.filter(
			(r) => !(CAPABILITIES.VIEW_PAY_ORGWIDE as readonly Role[]).includes(r)
		)
		expect(residue).toEqual(['MANAGER'])
	})
})

describe('canReadPayslip', () => {
	it('lets anyone read their own payslip, whatever their role', async () => {
		expect(await canReadPayslip(actor('EMPLOYEE'), { id: 'x', userId: ACTOR_USER })).toBe(true)
	})

	describe('org-wide payroll roles reach any payslip', () => {
		for (const role of ['HR_ADMIN', 'SUPER_ADMIN', 'PAYROLL_OFFICER', 'FINANCE', 'CEO'] as const) {
			it(`${role} reads a stranger's payslip`, async () => {
				expect(await canReadPayslip(actor(role), STRANGER)).toBe(true)
			})
		}

		/**
		 * The exact regression the issue's own suggested fix would have shipped. A PAYROLL_OFFICER
		 * typically has no employee record at all, so delegating to `canTouchEmployee` would fail
		 * closed on its "no self record" branch and deny them every payslip in the system.
		 */
		it('a PAYROLL_OFFICER with no employee record of their own still reads any payslip', async () => {
			selfRow = null
			expect(await canReadPayslip(actor('PAYROLL_OFFICER'), STRANGER)).toBe(true)
			// Never delegated: the org-wide arm answered first.
			expect(listReportIdsFor).not.toHaveBeenCalled()
		})
	})

	describe('MANAGER is scoped to their reporting line', () => {
		it('reads a direct report’s payslip', async () => {
			listReportIdsFor.mockResolvedValue([REPORT.id])
			expect(await canReadPayslip(actor('MANAGER'), REPORT)).toBe(true)
		})

		it('reads a payslip of someone in a branch they manage', async () => {
			dbMock.branch.findMany.mockResolvedValue([{ id: 'branch1' }])
			targetRow = { branchId: 'branch1' }
			expect(await canReadPayslip(actor('MANAGER'), STRANGER)).toBe(true)
		})

		it('cannot read a non-report’s payslip — the #249 case', async () => {
			expect(await canReadPayslip(actor('MANAGER'), STRANGER)).toBe(false)
		})
	})

	describe('roles with no payroll reach at all', () => {
		for (const role of ['EMPLOYEE', 'VERIFIER', 'APPROVER'] as const) {
			it(`${role} cannot read a stranger's payslip`, async () => {
				expect(await canReadPayslip(actor(role), STRANGER)).toBe(false)
			})
		}

		/**
		 * The only test that dies if the VIEW_PAYROLL_REPORTS arm is deleted. `canTouchEmployee`
		 * knows about reporting lines but nothing about payroll, so without that arm an ordinary
		 * EMPLOYEE who happens to supervise someone would inherit their report's payslip.
		 */
		it('an EMPLOYEE who supervises someone still cannot read that report’s payslip', async () => {
			listReportIdsFor.mockResolvedValue([REPORT.id])
			expect(await canReadPayslip(actor('EMPLOYEE'), REPORT)).toBe(false)
		})
	})

	// #133: the full set decides, not the primary label.
	it('honours a secondary role that carries org-wide reach', async () => {
		expect(await canReadPayslip(actor('MANAGER', ['MANAGER', 'FINANCE']), STRANGER)).toBe(true)
	})
})

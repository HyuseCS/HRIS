import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #278 — nobody reads a payslip while its payroll run is still a draft.
 *
 * The draft gate at the PDF door (`fetchPayslipDocument`) used to let any `VIEW_PAYROLL_REPORTS`
 * holder — CEO, HR_ADMIN, FINANCE, PAYROLL_OFFICER, SUPER_ADMIN and, since #133, MANAGER — read a
 * payslip whose run was DRAFT or COMPUTED. The JSON door never had that escape. Visibility now
 * begins at filing for everyone: `run.status === 'APPROVED' || run.period?.status === 'RELEASED'`.
 *
 * Two structural properties this file exists to protect:
 *
 *  - Every negative row asserts the MESSAGE, not just the 403. Both guards on this path answer 403
 *    ('Access denied' from the access gate, 'Payslip not yet available' from the draft gate), so a
 *    status-only assertion passes even when the wrong guard was deleted. U8 is the row that pins
 *    the order of the two.
 *  - The owner rows are the fail-OPEN sentinels, and they catch DIFFERENT mistakes. U5
 *    (owner on DRAFT → 403) dies if the visibility test is deleted outright. U7 (owner on APPROVED
 *    → ok) dies if the visibility test is deleted while the privileged escape is kept, i.e. the
 *    inverse edit that leaves `if (!isPrivileged) 403`. Keep both.
 */

const { dbMock, canTouchEmployee } = vi.hoisted(() => ({
	canTouchEmployee: vi.fn(),
	dbMock: {
		payrollEntry: { findUnique: vi.fn() },
		organization: { findUnique: vi.fn() },
		attendanceDay: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
// The MANAGER arm of `canReadPayslip` is the only consumer, and mocking it keeps this file off the
// supervisors/branch query graph entirely.
vi.mock('$lib/server/services/employee-access', () => ({ canTouchEmployee }))

const { fetchPayslipDocument } = await import('$lib/server/services/payroll/payslip-fetch')

const ACTOR = 'user-actor'
const STRANGER_USER = 'user-stranger'

/**
 * A complete entry, in exactly the shape Door A's `include` selects — `payrollRun.period` included,
 * because that is where the RELEASED arm of `isPayslipVisible` reads from. Complete so the visible
 * rows reach `ok: true` through the real assembler rather than blowing up on a missing field.
 */
function entryFor(
	runStatus: string,
	periodStatus: string | null,
	targetUserId: string | null = STRANGER_USER
) {
	return {
		id: 'entry1',
		employeeId: 'emp1',
		hoursWorked: 80,
		basicPay: 30000,
		grossPay: 30000,
		sssEe: 0,
		philhealthEe: 0,
		pagibigEe: 0,
		withholdingTax: 0,
		totalDeductions: 0,
		netPay: 30000,
		earnings: [],
		deductions: [],
		employee: {
			firstName: 'Elena',
			lastName: 'Employee',
			middleName: null,
			employeeNumber: 'EMP-0001',
			jobTitle: 'Analyst',
			employmentType: 'REGULAR',
			basicMonthlySalary: 30000,
			rateType: 'MONTHLY',
			organizationId: 'org1',
			userId: targetUserId
		},
		payrollRun: {
			periodStart: new Date('2025-04-01'),
			periodEnd: new Date('2025-04-15'),
			status: runStatus,
			approvedAt: null,
			organizationId: 'org1',
			period: periodStatus === null ? null : { status: periodStatus }
		}
	}
}

const ctx = (role: Role, roles?: Role[]) => ({
	userId: ACTOR,
	role,
	roles: roles ?? [role],
	organizationId: 'org1'
})

const NOT_YET = 'Payslip not yet available'

beforeEach(() => {
	vi.clearAllMocks()
	canTouchEmployee.mockResolvedValue(false)
	dbMock.organization.findUnique.mockResolvedValue({
		name: 'Veent',
		address: 'Manila',
		logoUrl: null
	})
	dbMock.attendanceDay.findMany.mockResolvedValue([])
})

describe('fetchPayslipDocument — draft visibility (#278)', () => {
	describe('no capability opens a payslip whose run is not visible', () => {
		// U1–U3b: every org-wide payroll role. Each holds VIEW_PAYROLL_REPORTS and each used to
		// read straight through a draft. All five non-MANAGER holders are listed on purpose —
		// the guard is capability-based, but a bypass restored for one role would otherwise
		// leave this suite green.
		const privileged: [string, Role, string, string | null][] = [
			['U1 CEO on a DRAFT run with no period', 'CEO', 'DRAFT', null],
			['U2 HR_ADMIN on a COMPUTED run in a LOCKED period', 'HR_ADMIN', 'COMPUTED', 'LOCKED'],
			['U3 FINANCE on a COMPUTED run in a GENERATED period', 'FINANCE', 'COMPUTED', 'GENERATED'],
			['U3a PAYROLL_OFFICER on a DRAFT run in an OPEN period', 'PAYROLL_OFFICER', 'DRAFT', 'OPEN'],
			['U3b SUPER_ADMIN on a COMPUTED run with no period', 'SUPER_ADMIN', 'COMPUTED', null]
		]
		for (const [name, role, runStatus, periodStatus] of privileged) {
			it(`${name} → 403 '${NOT_YET}'`, async () => {
				dbMock.payrollEntry.findUnique.mockResolvedValue(entryFor(runStatus, periodStatus))
				expect(await fetchPayslipDocument('entry1', ctx(role))).toEqual({
					ok: false,
					status: 403,
					message: NOT_YET
				})
			})
		}

		it('U4 MANAGER reading a direct report on a DRAFT run → 403', async () => {
			// The one row that reaches `canTouchEmployee`: MANAGER is the only VIEW_PAYROLL_REPORTS
			// role without VIEW_PAY_ORGWIDE, so the access gate delegates to the reporting line.
			canTouchEmployee.mockResolvedValue(true)
			dbMock.payrollEntry.findUnique.mockResolvedValue(entryFor('DRAFT', 'OPEN'))
			expect(await fetchPayslipDocument('entry1', ctx('MANAGER'))).toEqual({
				ok: false,
				status: 403,
				message: NOT_YET
			})
		})
	})

	it('U5 the owner cannot preview their own DRAFT payslip — fail-CLOSED sentinel', async () => {
		// Dies if `isPayslipVisible(...)` is deleted outright. An owner is not privileged either way,
		// so this row is blind to the escape being kept — that is U7's job.
		dbMock.payrollEntry.findUnique.mockResolvedValue(entryFor('DRAFT', 'OPEN', ACTOR))
		expect(await fetchPayslipDocument('entry1', ctx('EMPLOYEE'))).toEqual({
			ok: false,
			status: 403,
			message: NOT_YET
		})
	})

	describe('the fix does not over-block', () => {
		it('U6 a RELEASED period opens a DRAFT run', async () => {
			dbMock.payrollEntry.findUnique.mockResolvedValue(entryFor('DRAFT', 'RELEASED'))
			expect((await fetchPayslipDocument('entry1', ctx('CEO'))).ok).toBe(true)
		})

		it('U7 an APPROVED run opens for its owner — fail-CLOSED sentinel', async () => {
			// Dies if `isPayslipVisible(...)` is deleted while `!isPrivileged` is kept, leaving
			// `if (!isPrivileged) 403`. U5 stays green under that edit; this row is the one that fails.
			dbMock.payrollEntry.findUnique.mockResolvedValue(entryFor('APPROVED', 'LOCKED', ACTOR))
			expect((await fetchPayslipDocument('entry1', ctx('EMPLOYEE'))).ok).toBe(true)
		})
	})

	it('U8 the access gate still answers first, with its own message', async () => {
		// The only row that distinguishes "the draft gate fired" from "the access gate fired".
		dbMock.payrollEntry.findUnique.mockResolvedValue(entryFor('DRAFT', 'OPEN'))
		expect(await fetchPayslipDocument('entry1', ctx('EMPLOYEE'))).toEqual({
			ok: false,
			status: 403,
			message: 'Access denied'
		})
	})
})

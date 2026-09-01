import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #249, the run-level half — the part the payslip fix does NOT cover.
 *
 * `MANAGE_PAYROLL` and `VIEW_PAYROLL_REPORTS` both hold MANAGER (#133 made them on-branch HR), so
 * narrowing the three payslip doors left a branch manager reading every employee's gross, itemized
 * statutory deductions and net through the run-detail page, its API twin, and the payroll register.
 *
 * The override case is the serious one, and the only WRITE path here: `requirePayrollManage` admits
 * MANAGER, and the sole other filter was the organization — so a manager could post any employee's
 * entryId and set their net pay. Scoping the view without scoping this would be worse than leaving
 * both open, because the UI would then imply a boundary the server does not enforce.
 */

const { dbMock, tx, listReportIdsFor, writeAuditLog } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	writeAuditLog: vi.fn(),
	// #5: the override writes now run on the transaction client, not on `db`.
	tx: {
		payrollEntry: { update: vi.fn() },
		payrollRun: { update: vi.fn() }
	},
	dbMock: {
		$transaction: vi.fn(),
		employee: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
		branch: { findMany: vi.fn() },
		payrollEntry: { findFirst: vi.fn(), update: vi.fn() },
		payrollRun: { findFirst: vi.fn(), update: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { listVisiblePayEmployeeIds } = await import('$lib/server/services/employee-access')
const { overridePayrollEntry, getPayrollRun } = await import('$lib/server/services/payroll/index')
const { getRunWithEntries } = await import('$lib/server/services/payroll/runs')

const ACTOR = 'user1'
const SELF = { id: 'mgr-emp' }
const REPORT_EMP = 'report-emp'
const STRANGER_EMP = 'stranger-emp'

const actor = (role: Role, roles?: Role[]) => ({
	id: ACTOR,
	roles: roles ?? [role],
	organizationId: 'org1'
})
const ctxOf = (role: Role, roles?: Role[]) => ({
	organizationId: 'org1',
	actorId: ACTOR,
	actorRoles: roles ?? [role],
	ipAddress: '127.0.0.1'
})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findUnique.mockResolvedValue(SELF)
	listReportIdsFor.mockResolvedValue([])
	dbMock.branch.findMany.mockResolvedValue([])
	dbMock.employee.findMany.mockImplementation(({ where }) =>
		Promise.resolve((where.id?.in ?? []).map((id: string) => ({ id })))
	)
	dbMock.employee.findFirst.mockResolvedValue({ branchId: null })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('listVisiblePayEmployeeIds', () => {
	// `null` is the "no filter" contract every caller relies on; returning [] here would blank the
	// run for HR instead of showing everything.
	describe('returns null (unrestricted) for the org-wide payroll roles', () => {
		for (const role of ['HR_ADMIN', 'SUPER_ADMIN', 'PAYROLL_OFFICER', 'FINANCE', 'CEO'] as const) {
			it(role, async () => {
				expect(await listVisiblePayEmployeeIds(actor(role))).toBeNull()
			})
		}
	})

	/**
	 * The regression this helper exists to avoid. `listVisibleEmployeeIds` opens up only for
	 * ADMINISTER_HR_ORGWIDE, which PAYROLL_OFFICER and FINANCE do not hold — delegating straight to
	 * it would scope the two roles whose job IS payroll down to a reporting line they don't have,
	 * emptying every run and report for them.
	 */
	it('never delegates to the roster helper for a PAYROLL_OFFICER', async () => {
		dbMock.employee.findUnique.mockResolvedValue(null)
		expect(await listVisiblePayEmployeeIds(actor('PAYROLL_OFFICER'))).toBeNull()
		expect(listReportIdsFor).not.toHaveBeenCalled()
	})

	it('scopes a MANAGER to their reports, their branch and themselves', async () => {
		listReportIdsFor.mockResolvedValue([REPORT_EMP])
		const ids = await listVisiblePayEmployeeIds(actor('MANAGER'))
		expect(ids).toEqual(expect.arrayContaining([SELF.id, REPORT_EMP]))
		expect(ids).not.toContain(STRANGER_EMP)
	})

	it('honours a secondary role carrying org-wide reach (#133)', async () => {
		expect(await listVisiblePayEmployeeIds(actor('MANAGER', ['MANAGER', 'FINANCE']))).toBeNull()
	})
})

describe('overridePayrollEntry — the write path', () => {
	const entryFor = (employeeId: string) => ({
		id: 'entry1',
		employeeId,
		netPay: 30000,
		payrollRunId: 'run1',
		payrollRun: { id: 'run1', status: 'COMPUTED' }
	})

	beforeEach(() => {
		tx.payrollEntry.update.mockResolvedValue({ id: 'entry1' })
		tx.payrollRun.update.mockResolvedValue({ id: 'run1' })
	})

	/**
	 * The #249 write case. Before this guard a manager could rewrite the net pay of anyone in the
	 * tenant. Asserting no write happened, not just that it threw — a guard placed after the update
	 * would still throw and would still have changed the row.
	 */
	it('refuses a MANAGER overriding an employee outside their line', async () => {
		dbMock.payrollEntry.findFirst.mockResolvedValue(entryFor(STRANGER_EMP))
		await expect(
			overridePayrollEntry('entry1', 'org1', { netPay: 1 }, 'note', ctxOf('MANAGER'))
		).rejects.toMatchObject({ status: 403 })
		expect(tx.payrollEntry.update).not.toHaveBeenCalled()
	})

	it('allows a MANAGER overriding their own direct report', async () => {
		listReportIdsFor.mockResolvedValue([REPORT_EMP])
		dbMock.payrollEntry.findFirst.mockResolvedValue(entryFor(REPORT_EMP))
		await overridePayrollEntry('entry1', 'org1', { netPay: 1 }, 'note', ctxOf('MANAGER'))
		expect(tx.payrollEntry.update).toHaveBeenCalled()
		// #5: the audit write shares the transaction with the override it records.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	// The counterweight: the payroll specialists must keep working. A PAYROLL_OFFICER has no
	// employee record, so a reporting-line-only guard would deny them every override.
	it('leaves a PAYROLL_OFFICER unrestricted', async () => {
		dbMock.employee.findUnique.mockResolvedValue(null)
		dbMock.payrollEntry.findFirst.mockResolvedValue(entryFor(STRANGER_EMP))
		await overridePayrollEntry('entry1', 'org1', { netPay: 1 }, 'note', ctxOf('PAYROLL_OFFICER'))
		expect(tx.payrollEntry.update).toHaveBeenCalled()
	})

	it('leaves an HR_ADMIN unrestricted', async () => {
		dbMock.payrollEntry.findFirst.mockResolvedValue(entryFor(STRANGER_EMP))
		await overridePayrollEntry('entry1', 'org1', { netPay: 1 }, 'note', ctxOf('HR_ADMIN'))
		expect(tx.payrollEntry.update).toHaveBeenCalled()
	})

	// Order matters: the approved-run refusal must still come first, so an org-wide role gets the
	// "cannot override approved payroll" 400 rather than being silently allowed past it.
	it('still refuses an approved run before any scoping question', async () => {
		dbMock.payrollEntry.findFirst.mockResolvedValue({
			...entryFor(STRANGER_EMP),
			payrollRun: { id: 'run1', status: 'APPROVED' }
		})
		await expect(
			overridePayrollEntry('entry1', 'org1', { netPay: 1 }, 'note', ctxOf('HR_ADMIN'))
		).rejects.toMatchObject({ status: 400 })
		expect(tx.payrollEntry.update).not.toHaveBeenCalled()
	})
})

describe('getPayrollRun — the entry filter and its totals', () => {
	// Stored columns are org-wide (60 people); the two entries are this manager's slice.
	const RUN = {
		id: 'run1',
		organizationId: 'org1',
		status: 'COMPUTED',
		totalGross: 999_999,
		totalDeductions: 111_111,
		totalNet: 888_888,
		entries: [
			{ employeeId: REPORT_EMP, grossPay: 30_000, totalDeductions: 5_000, netPay: 25_000 },
			{ employeeId: SELF.id, grossPay: 45_000, totalDeductions: 7_000, netPay: 38_000 }
		],
		approvalSteps: []
	}

	beforeEach(() => dbMock.payrollRun.findFirst.mockResolvedValue(RUN))

	it('passes the allow-list to the entry query when scoped', async () => {
		await getPayrollRun('run1', 'org1', ['MANAGER'], [REPORT_EMP, SELF.id])
		const { include } = dbMock.payrollRun.findFirst.mock.calls[0][0]
		expect(include.entries.where).toEqual({ employeeId: { in: [REPORT_EMP, SELF.id] } })
	})

	it('leaves the query unfiltered when unrestricted', async () => {
		await getPayrollRun('run1', 'org1', ['HR_ADMIN'], null)
		const { include } = dbMock.payrollRun.findFirst.mock.calls[0][0]
		expect(include.entries.where).toBeUndefined()
	})

	/**
	 * The subtle half. The run's stored totals describe the WHOLE run, so handing them back beside a
	 * filtered table renders as "this is the run" over rows that are not — a manager would read an
	 * org-wide payroll cost next to their own two people. Recomputed in the service so no caller can
	 * forget; the page then labels the view as a slice.
	 */
	it('replaces the org-wide totals with totals over the visible entries', async () => {
		const run = await getPayrollRun('run1', 'org1', ['MANAGER'], [REPORT_EMP, SELF.id])
		expect(Number(run.totalGross)).toBe(75_000)
		expect(Number(run.totalDeductions)).toBe(12_000)
		expect(Number(run.totalNet)).toBe(63_000)
	})

	it('keeps the run’s own totals when unrestricted', async () => {
		const run = await getPayrollRun('run1', 'org1', ['HR_ADMIN'], null)
		expect(Number(run.totalGross)).toBe(999_999)
		expect(Number(run.totalNet)).toBe(888_888)
	})
})

/**
 * The API twin, and the bug that got past every test above.
 *
 * `getRunWithEntries` is a SEPARATE function from `getPayrollRun`, serving `/api/v1/payroll/[id]`.
 * The entry filter was added to both, but the totals recompute only to the first — so the endpoint
 * returned two rows totalling ~38k beside the run's stored org-wide 184k, disclosing the whole
 * organization's payroll cost to a scoped manager.
 *
 * Nothing caught it: the tests above assert on the QUERY (`include.entries.where`), which was
 * correct, not on the response body, where the leak was. Found by reading the live endpoint. These
 * assert what ships.
 */
describe('getRunWithEntries — the API twin', () => {
	const RUN = {
		id: 'run1',
		organizationId: 'org1',
		totalGross: 184_100,
		totalDeductions: 35_446,
		totalNet: 148_653,
		entries: [
			{ employeeId: REPORT_EMP, grossPay: 15_350, totalDeductions: 1_656, netPay: 13_693 },
			{ employeeId: SELF.id, grossPay: 22_500, totalDeductions: 3_542, netPay: 18_957 }
		]
	}

	beforeEach(() => dbMock.payrollRun.findFirst.mockResolvedValue(RUN))

	it('filters the entries to the allow-list', async () => {
		await getRunWithEntries('run1', 'org1', [REPORT_EMP, SELF.id])
		const { include } = dbMock.payrollRun.findFirst.mock.calls[0][0]
		expect(include.entries.where).toEqual({ employeeId: { in: [REPORT_EMP, SELF.id] } })
	})

	it('returns totals over the visible entries, not the run’s org-wide figures', async () => {
		const run = await getRunWithEntries('run1', 'org1', [REPORT_EMP, SELF.id])
		expect(Number(run.totalGross)).toBe(37_850)
		expect(Number(run.totalNet)).toBe(32_650)
		// The specific leak: the org-wide figure must not survive anywhere in the payload.
		expect(JSON.stringify(run)).not.toContain('184100')
	})

	it('keeps the run’s own totals when unrestricted', async () => {
		const run = await getRunWithEntries('run1', 'org1', null)
		expect(Number(run.totalGross)).toBe(184_100)
	})
})

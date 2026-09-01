import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #249, the reporting surface.
 *
 * `VIEW_PAYROLL_REPORTS` holds MANAGER (#133 made them on-branch HR), so a branch manager reaches
 * every report in `PAYROLL_REPORT_TYPES` — and all five are built from per-employee pay. The first
 * pass scoped only `generatePayrollRegister`, which left the same figures reachable one report over:
 * the loan summary's balances, the BIR alphalist's gross, tax and TIN, and — in aggregate — the
 * whole organization's payroll cost by department and its statutory bill.
 *
 * The aggregate cases are here for the reason `getRunWithEntries` was: filtering the rows a report
 * is BUILT from and returning the org-wide total anyway is the same disclosure wearing a hat.
 *
 * Every test asserts on the returned rows, not only on the query. The `getRunWithEntries` bug got
 * past a suite that checked the `where` clause and never looked at what shipped.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: { findMany: vi.fn() },
		payrollEntry: { findMany: vi.fn() },
		loan: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))

const {
	generatePayrollCosts,
	generatePayrollRegister,
	generateLoanSummary,
	generateGovernmentRemittance,
	generateBIRWithholding
} = await import('$lib/server/services/reports')

const MINE = 'mine-emp'
const THEIRS = 'stranger-emp'
/** What `listVisiblePayEmployeeIds` hands a MANAGER; `null` is the unrestricted contract. */
const ALLOWED = [MINE]
const RANGE = { startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') }

const employee = (n: string, lastName: string) => ({
	firstName: 'Pat',
	lastName,
	employeeNumber: n,
	tinNumber: `TIN-${n}`
})

const PAYROLL_ENTRIES = [
	{
		employeeId: MINE,
		grossPay: 30_000,
		sssEe: 1_000,
		sssEr: 2_000,
		philhealthEe: 500,
		philhealthEr: 500,
		pagibigEe: 100,
		pagibigEr: 100,
		withholdingTax: 900,
		totalDeductions: 2_500,
		netPay: 27_500,
		payrollRun: { periodStart: RANGE.startDate, periodEnd: RANGE.endDate },
		employee: employee('E1', 'Mine')
	},
	{
		employeeId: THEIRS,
		grossPay: 500_000,
		sssEe: 4_000,
		sssEr: 8_000,
		philhealthEe: 2_000,
		philhealthEr: 2_000,
		pagibigEe: 200,
		pagibigEr: 200,
		withholdingTax: 90_000,
		totalDeductions: 96_200,
		netPay: 403_800,
		payrollRun: { periodStart: RANGE.startDate, periodEnd: RANGE.endDate },
		employee: employee('E2', 'Stranger')
	}
]

const LOANS = [
	{
		employeeId: MINE,
		principal: 10_000,
		balance: 8_000,
		installment: 500,
		status: 'ACTIVE',
		employee: employee('E1', 'Mine')
	},
	{
		employeeId: THEIRS,
		principal: 900_000,
		balance: 750_000,
		installment: 30_000,
		status: 'ACTIVE',
		employee: employee('E2', 'Stranger')
	}
]

const RUN_ENTRIES = [
	{ employeeId: MINE, grossPay: 30_000, netPay: 27_500, employee: { department: { name: 'Ops' } } },
	{
		employeeId: THEIRS,
		grossPay: 500_000,
		netPay: 403_800,
		employee: { department: { name: 'Executive' } }
	}
]

/** Applies the `employeeId: { in: … }` clause the way Postgres would, so the ROWS prove the filter. */
const applyFilter = <T extends { employeeId: string }>(
	rows: T[],
	clause?: { in: string[] }
): T[] => (clause ? rows.filter((r) => clause.in.includes(r.employeeId)) : rows)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.payrollEntry.findMany.mockImplementation(({ where }) =>
		Promise.resolve(applyFilter(PAYROLL_ENTRIES, where.employeeId))
	)
	dbMock.loan.findMany.mockImplementation(({ where }) =>
		Promise.resolve(applyFilter(LOANS, where.employeeId))
	)
	dbMock.payrollRun.findMany.mockImplementation(({ select }) =>
		Promise.resolve([
			{
				periodStart: RANGE.startDate,
				periodEnd: RANGE.endDate,
				totalGross: 530_000,
				totalNet: 431_300,
				entries: applyFilter(RUN_ENTRIES, select.entries.where?.employeeId)
			}
		])
	)
})

describe('generatePayrollRegister', () => {
	it('returns only the allow-listed employee’s pay', async () => {
		const rows = await generatePayrollRegister('org1', RANGE, ALLOWED)
		expect(rows.map((r) => r.Employee)).toEqual(['Mine, Pat (E1)'])
		expect(rows[0].Gross).toBe(30_000)
	})

	it('returns every employee when unrestricted', async () => {
		const rows = await generatePayrollRegister('org1', RANGE, null)
		expect(rows).toHaveLength(2)
		expect(dbMock.payrollEntry.findMany.mock.calls[0][0].where.employeeId).toBeUndefined()
	})
})

describe('generateLoanSummary', () => {
	/**
	 * A loan's principal and outstanding balance are pay data — the report names the employee beside
	 * how much of their salary is already committed. It was left unscoped when the register was fixed.
	 */
	it('returns only the allow-listed employee’s loans', async () => {
		const rows = await generateLoanSummary('org1', RANGE, ALLOWED)
		expect(rows.map((r) => r.Employee)).toEqual(['Mine, Pat (E1)'])
		expect(rows[0].Balance).toBe(8_000)
	})

	it('filters on Loan.employeeId, not the payroll-entry relation', async () => {
		await generateLoanSummary('org1', RANGE, ALLOWED)
		const { where } = dbMock.loan.findMany.mock.calls[0][0]
		expect(where.employeeId).toEqual({ in: ALLOWED })
		// The pre-existing clauses must survive: dropping either would widen the report to other
		// tenants or resurrect settled loans.
		expect(where.status).toBe('ACTIVE')
		expect(where.employee).toEqual({ organizationId: 'org1' })
	})

	it('returns every employee’s loans when unrestricted', async () => {
		const rows = await generateLoanSummary('org1', RANGE, null)
		expect(rows).toHaveLength(2)
		expect(dbMock.loan.findMany.mock.calls[0][0].where.employeeId).toBeUndefined()
	})
})

describe('generateBIRWithholding', () => {
	/** The register's own figures under another heading, plus the TIN — a government ID (#111). */
	it('returns only the allow-listed employee’s gross, tax and TIN', async () => {
		const rows = await generateBIRWithholding('org1', RANGE, ALLOWED)
		expect(rows.map((r) => r.Employee)).toEqual(['Mine, Pat (E1)'])
		expect(rows[0].Gross).toBe(30_000)
		expect(rows[0].TaxWithheld).toBe(900)
		expect(JSON.stringify(rows)).not.toContain('TIN-E2')
	})

	it('returns every employee when unrestricted', async () => {
		const rows = await generateBIRWithholding('org1', RANGE, null)
		expect(rows).toHaveLength(2)
	})
})

describe('generateGovernmentRemittance', () => {
	/**
	 * Aggregate-only output, so nothing here names an employee — but the totals ARE the organization's
	 * statutory bill, and the employer shares scale with total payroll. Unfiltered it discloses the
	 * org-wide cost to a scoped manager exactly as `getRunWithEntries`'s stored totals did.
	 */
	it('totals only the allow-listed employee’s contributions', async () => {
		const rows = await generateGovernmentRemittance('org1', RANGE, ALLOWED)
		const sss = rows.find((r) => r.Contribution === 'SSS')!
		expect(sss.EmployeeShare).toBe(1_000)
		expect(sss.EmployerShare).toBe(2_000)
		const bir = rows.find((r) => r.Contribution === 'Withholding Tax (BIR)')!
		expect(bir.EmployeeShare).toBe(900)
	})

	it('totals the whole organization when unrestricted', async () => {
		const rows = await generateGovernmentRemittance('org1', RANGE, null)
		expect(rows.find((r) => r.Contribution === 'SSS')!.EmployeeShare).toBe(5_000)
		expect(rows.find((r) => r.Contribution === 'Withholding Tax (BIR)')!.EmployeeShare).toBe(90_900)
	})
})

describe('generatePayrollCosts', () => {
	/**
	 * The department breakdown is the plainest reading of "what this organization spends on payroll".
	 * Its rows are built from `run.entries`, so the filter goes on the include, not the top-level
	 * where — a run the manager has one person in must still appear, with only that person in it.
	 */
	it('reports only the departments the allow-list reaches, at their own totals', async () => {
		const rows = await generatePayrollCosts('org1', RANGE, ALLOWED)
		expect(rows.map((r) => r.Department)).toEqual(['Ops'])
		expect(rows[0].TotalGross).toBe(30_000)
		expect(rows[0].HeadCount).toBe(1)
		// The run's stored org-wide totals are selected but never emitted; pin that they stay out.
		expect(JSON.stringify(rows)).not.toContain('530000')
	})

	it('reports every department when unrestricted', async () => {
		const rows = await generatePayrollCosts('org1', RANGE, null)
		expect(rows.map((r) => r.Department).sort()).toEqual(['Executive', 'Ops'])
		expect(dbMock.payrollRun.findMany.mock.calls[0][0].select.entries.where).toBeUndefined()
	})
})

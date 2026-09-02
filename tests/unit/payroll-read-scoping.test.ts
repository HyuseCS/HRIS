import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #275 — the three v1 payroll READ doors the #249 sweep did not reach.
 *
 * All three take an `employeeId` from the caller and guard only on `requirePayrollManage`, which
 * holds MANAGER (#133 made them on-branch HR). A capability says WHAT an actor may do, never WHOSE
 * record — so a branch manager could read any colleague's loan balances, cash-advance balances and
 * full pay computation by passing their id. `assertMayWriteLoan` already covered the writes; the
 * reads had no equivalent.
 *
 * Written longhand, one describe per route, with no shared loop across them. That is the point:
 * #275 exists because an automated review caught the loans endpoint and missed its cash-advances
 * twin. A table would restate the implementation instead of pinning each door.
 *
 * The FINANCE-alone cases are the trap. FINANCE holds VIEW_PAY_ORGWIDE but NOT MANAGE_PAYROLL, so
 * it is refused at the guard before scoping is ever reached — the allow-list is never resolved.
 * `[MANAGER, FINANCE]` is the multi-role case that must pass.
 */

const { dbMock, listReportIdsFor, listLoans, listCashAdvances, previewPayroll } = vi.hoisted(
	() => ({
		listReportIdsFor: vi.fn(),
		listLoans: vi.fn(),
		listCashAdvances: vi.fn(),
		previewPayroll: vi.fn(),
		dbMock: {
			employee: { findFirst: vi.fn(), findMany: vi.fn() },
			branch: { findMany: vi.fn() },
			payrollConfig: { findUnique: vi.fn() },
			employeeEarning: { groupBy: vi.fn() }
		}
	})
)

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor }))
vi.mock('$lib/server/services/payroll/loans', () => ({
	listLoans,
	createLoan: vi.fn(),
	listCashAdvances,
	createCashAdvance: vi.fn()
}))
// Partial mock: the routes below need `previewPayroll` stubbed, but `loadCalculatorData` is itself
// under test here, so the rest of the module stays real.
vi.mock('$lib/server/services/payroll/calculator', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	previewPayroll
}))

const { loadCalculatorData } = await import('$lib/server/services/payroll/calculator')
const { GET: loansRoute } = await import('../../src/routes/api/v1/payroll/loans/+server')
const { GET: cashAdvancesRoute } =
	await import('../../src/routes/api/v1/payroll/cash-advances/+server')
const { POST: calculatorRoute } = await import('../../src/routes/api/v1/payroll/calculator/+server')
const { actions: calculatorPage } =
	await import('../../src/routes/(app)/payroll/calculator/+page.server')

const ACTOR_USER = 'user-actor'
const ORG = 'org1'

const SELF = 'self-emp'
const REPORT = 'report-emp'
const STRANGER = 'stranger-emp'
/** Every active employee in the org, in the order the roster query returns them. */
const ROSTER = [SELF, REPORT, STRANGER]

/** There is no primary role — `roles` is the whole identity both layers read (#247, #282). */
const user = (roles: Role[]) => ({
	id: ACTOR_USER,
	organizationId: ORG,
	roles
})

/** GET events: the employee id rides the query string. */
const getEvent = (roles: Role[], employeeId?: string) =>
	({
		locals: { user: user(roles) },
		url: { searchParams: new URLSearchParams(employeeId ? { employeeId } : {}) }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** POST event for the v1 calculator: the employee id rides the JSON body. */
const postEvent = (roles: Role[], body: unknown) =>
	({
		locals: { user: user(roles) },
		request: { json: async () => body }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** Form event for the calculator page twin. */
const formEvent = (roles: Role[], fields: Record<string, string>) =>
	({
		locals: { user: user(roles) },
		request: { formData: async () => new URLSearchParams(fields) }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

const PREVIEW = { grossPay: 30000, netPay: 25000 }

beforeEach(() => {
	vi.clearAllMocks()
	// The actor's own record, plus a reporting line that does NOT contain the stranger.
	dbMock.employee.findFirst.mockResolvedValue({ id: SELF })
	listReportIdsFor.mockResolvedValue([REPORT])
	dbMock.branch.findMany.mockResolvedValue([])
	// Two different reads land on `employee.findMany`: `listVisibleEmployeeIds` closes with an
	// org-scoped re-read of the ids it gathered, and `loadCalculatorData` pulls the active roster
	// (the only one carrying `employmentStatus`), optionally id-filtered.
	dbMock.employee.findMany.mockImplementation(({ where }) => {
		if (where.employmentStatus) {
			const allowed: string[] = where.id?.in ?? ROSTER
			return Promise.resolve(ROSTER.filter((id) => allowed.includes(id)).map((id) => ({ id })))
		}
		return Promise.resolve((where.id?.in ?? []).map((id: string) => ({ id })))
	})
	// Every employee in the org carries a recurring allowance — that amount is the thing that must
	// not travel to a manager who cannot see the employee.
	dbMock.payrollConfig.findUnique.mockResolvedValue({ payFrequency: 'MONTHLY' })
	dbMock.employeeEarning.groupBy.mockImplementation(({ where }) => {
		const allowed: string[] = where.employeeId?.in ?? ROSTER
		return Promise.resolve(
			ROSTER.filter((id) => allowed.includes(id)).map((id) => ({
				employeeId: id,
				kind: 'ALLOWANCE',
				_sum: { monthlyAmount: 2000 }
			}))
		)
	})
	listLoans.mockResolvedValue([])
	listCashAdvances.mockResolvedValue([])
	previewPayroll.mockResolvedValue(PREVIEW)
})

describe('GET /api/v1/payroll/loans', () => {
	it('refuses a MANAGER asking for an employee outside their line, and reads nothing', async () => {
		const res = await loansRoute(getEvent(['MANAGER'], STRANGER))
		expect(res.status).toBe(403)
		expect(listLoans).not.toHaveBeenCalled()
	})

	it('lets a MANAGER read their own direct report', async () => {
		const res = await loansRoute(getEvent(['MANAGER'], REPORT))
		expect(res.status).toBe(200)
		expect(listLoans).toHaveBeenCalledWith(REPORT, ORG)
	})

	it('lets a MANAGER read their own record', async () => {
		const res = await loansRoute(getEvent(['MANAGER'], SELF))
		expect(res.status).toBe(200)
		expect(listLoans).toHaveBeenCalledWith(SELF, ORG)
	})

	// `null` from the helper means unrestricted and must not be read as an empty allow-list.
	it('leaves an HR_ADMIN unrestricted', async () => {
		const res = await loansRoute(getEvent(['HR_ADMIN'], STRANGER))
		expect(res.status).toBe(200)
		expect(listLoans).toHaveBeenCalledWith(STRANGER, ORG)
	})

	// The role that exists to administer pay has no reporting line at all — scoping it would deny
	// every employee.
	it('leaves a PAYROLL_OFFICER with no employee record unrestricted', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		const res = await loansRoute(getEvent(['PAYROLL_OFFICER'], STRANGER))
		expect(res.status).toBe(200)
		expect(listLoans).toHaveBeenCalledWith(STRANGER, ORG)
	})

	// FINANCE holds VIEW_PAY_ORGWIDE but not MANAGE_PAYROLL: refused at the guard, so the allow-list
	// is never resolved. Asserting the layer, not just the status.
	it('refuses FINANCE alone at the guard, before any scoping', async () => {
		const res = await loansRoute(getEvent(['FINANCE'], STRANGER))
		expect(res.status).toBe(403)
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
		expect(listLoans).not.toHaveBeenCalled()
	})

	it('admits [MANAGER, FINANCE] on the same stranger', async () => {
		const res = await loansRoute(getEvent(['MANAGER', 'FINANCE'], STRANGER))
		expect(res.status).toBe(200)
		expect(listLoans).toHaveBeenCalledWith(STRANGER, ORG)
	})

	// The 400 stays in front of the scoping, so a malformed request costs no query.
	it('still 400s a missing employeeId without resolving the allow-list', async () => {
		const res = await loansRoute(getEvent(['MANAGER']))
		expect(res.status).toBe(400)
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
	})
})

describe('GET /api/v1/payroll/cash-advances', () => {
	it('refuses a MANAGER asking for an employee outside their line, and reads nothing', async () => {
		const res = await cashAdvancesRoute(getEvent(['MANAGER'], STRANGER))
		expect(res.status).toBe(403)
		expect(listCashAdvances).not.toHaveBeenCalled()
	})

	it('lets a MANAGER read their own direct report', async () => {
		const res = await cashAdvancesRoute(getEvent(['MANAGER'], REPORT))
		expect(res.status).toBe(200)
		expect(listCashAdvances).toHaveBeenCalledWith(REPORT, ORG)
	})

	it('lets a MANAGER read their own record', async () => {
		const res = await cashAdvancesRoute(getEvent(['MANAGER'], SELF))
		expect(res.status).toBe(200)
		expect(listCashAdvances).toHaveBeenCalledWith(SELF, ORG)
	})

	it('leaves an HR_ADMIN unrestricted', async () => {
		const res = await cashAdvancesRoute(getEvent(['HR_ADMIN'], STRANGER))
		expect(res.status).toBe(200)
		expect(listCashAdvances).toHaveBeenCalledWith(STRANGER, ORG)
	})

	it('leaves a PAYROLL_OFFICER with no employee record unrestricted', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		const res = await cashAdvancesRoute(getEvent(['PAYROLL_OFFICER'], STRANGER))
		expect(res.status).toBe(200)
		expect(listCashAdvances).toHaveBeenCalledWith(STRANGER, ORG)
	})

	it('refuses FINANCE alone at the guard, before any scoping', async () => {
		const res = await cashAdvancesRoute(getEvent(['FINANCE'], STRANGER))
		expect(res.status).toBe(403)
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
		expect(listCashAdvances).not.toHaveBeenCalled()
	})

	it('admits [MANAGER, FINANCE] on the same stranger', async () => {
		const res = await cashAdvancesRoute(getEvent(['MANAGER', 'FINANCE'], STRANGER))
		expect(res.status).toBe(200)
		expect(listCashAdvances).toHaveBeenCalledWith(STRANGER, ORG)
	})

	it('still 400s a missing employeeId without resolving the allow-list', async () => {
		const res = await cashAdvancesRoute(getEvent(['MANAGER']))
		expect(res.status).toBe(400)
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
	})
})

describe('POST /api/v1/payroll/calculator', () => {
	const body = (employeeId: string) => ({ employeeId, attendance: { regularHours: 8 } })

	it('refuses a MANAGER previewing an employee outside their line, and computes nothing', async () => {
		const res = await calculatorRoute(postEvent(['MANAGER'], body(STRANGER)))
		expect(res.status).toBe(403)
		expect(previewPayroll).not.toHaveBeenCalled()
	})

	it('lets a MANAGER preview their own direct report', async () => {
		const res = await calculatorRoute(postEvent(['MANAGER'], body(REPORT)))
		expect(res.status).toBe(200)
		expect(previewPayroll).toHaveBeenCalled()
		expect(previewPayroll.mock.calls[0][0]).toBe(REPORT)
	})

	it('lets a MANAGER preview their own record', async () => {
		const res = await calculatorRoute(postEvent(['MANAGER'], body(SELF)))
		expect(res.status).toBe(200)
		expect(previewPayroll.mock.calls[0][0]).toBe(SELF)
	})

	it('leaves an HR_ADMIN unrestricted', async () => {
		const res = await calculatorRoute(postEvent(['HR_ADMIN'], body(STRANGER)))
		expect(res.status).toBe(200)
		expect(previewPayroll.mock.calls[0][0]).toBe(STRANGER)
	})

	it('leaves a PAYROLL_OFFICER with no employee record unrestricted', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		const res = await calculatorRoute(postEvent(['PAYROLL_OFFICER'], body(STRANGER)))
		expect(res.status).toBe(200)
		expect(previewPayroll.mock.calls[0][0]).toBe(STRANGER)
	})

	it('refuses FINANCE alone at the guard, before any scoping', async () => {
		const res = await calculatorRoute(postEvent(['FINANCE'], body(STRANGER)))
		expect(res.status).toBe(403)
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
		expect(previewPayroll).not.toHaveBeenCalled()
	})

	it('admits [MANAGER, FINANCE] on the same stranger', async () => {
		const res = await calculatorRoute(postEvent(['MANAGER', 'FINANCE'], body(STRANGER)))
		expect(res.status).toBe(200)
		expect(previewPayroll.mock.calls[0][0]).toBe(STRANGER)
	})

	it('still 400s an invalid body without resolving the allow-list', async () => {
		const res = await calculatorRoute(postEvent(['MANAGER'], { employeeId: '' }))
		expect(res.status).toBe(400)
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
	})
})

/**
 * The page twin of the endpoint above — not in #275 as filed, found while fixing it. Its employee id
 * comes from the form, and `requirePayrollManage` admits MANAGER there too, so scoping only the API
 * would have left this action as the way around it (the twin-door lesson from #235/#259).
 */
describe('the /payroll/calculator preview action', () => {
	const fields = (employeeId: string) => ({ employeeId, regularHours: '8' })

	it('refuses a MANAGER previewing an employee outside their line, and computes nothing', async () => {
		await expect(
			calculatorPage.preview(formEvent(['MANAGER'], fields(STRANGER)))
		).rejects.toMatchObject({ status: 403 })
		expect(previewPayroll).not.toHaveBeenCalled()
	})

	it('lets a MANAGER preview their own direct report', async () => {
		const res = await calculatorPage.preview(formEvent(['MANAGER'], fields(REPORT)))
		expect(res).toMatchObject({ employeeId: REPORT })
		expect(previewPayroll.mock.calls[0][0]).toBe(REPORT)
	})

	it('leaves an HR_ADMIN unrestricted', async () => {
		const res = await calculatorPage.preview(formEvent(['HR_ADMIN'], fields(STRANGER)))
		expect(res).toMatchObject({ employeeId: STRANGER })
		expect(previewPayroll.mock.calls[0][0]).toBe(STRANGER)
	})
})

/**
 * `loadCalculatorData` — the roster feeding the calculator dropdown, loaded by
 * `/payroll/+layout.server.ts` for anyone with MANAGE_PAYROLL, i.e. every MANAGER (#133).
 *
 * Two leaks in one call: the roster names the whole org, and `recurringDefaults` carries each
 * employee's allowance/incentive amount. The second is the one that matters — scoping only the
 * dropdown would still ship the money. Scoped with the PAY helper, the same one the v1 calculator
 * route above uses, so the dropdown offers exactly the employees the preview will accept.
 */
describe('loadCalculatorData (calculator roster + recurring defaults)', () => {
	const actor = (roles: Role[]) => user(roles)

	it('gives a MANAGER only the employees in their line', async () => {
		const { employees } = await loadCalculatorData(actor(['MANAGER']))
		expect(employees.map((e) => e.id)).toEqual([SELF, REPORT])
	})

	it('withholds the stranger from a MANAGER, roster and money alike', async () => {
		const { employees, recurringDefaults } = await loadCalculatorData(actor(['MANAGER']))
		expect(employees.map((e) => e.id)).not.toContain(STRANGER)
		expect(recurringDefaults[STRANGER]).toBeUndefined()
	})

	it('still prefills the MANAGER their own and their report’s amounts', async () => {
		const { recurringDefaults } = await loadCalculatorData(actor(['MANAGER']))
		expect(Object.keys(recurringDefaults).sort()).toEqual([REPORT, SELF].sort())
		expect(recurringDefaults[REPORT]).toEqual({ allowances: 2000, incentives: 0 })
	})

	it('pushes the id filter into the earnings query, not just the roster one', async () => {
		await loadCalculatorData(actor(['MANAGER']))
		const [{ where }] = dbMock.employeeEarning.groupBy.mock.calls[0]
		expect(where.employeeId).toEqual({ in: [SELF, REPORT] })
	})

	it('never carries an amount for an employee absent from the roster', async () => {
		const { employees, recurringDefaults } = await loadCalculatorData(actor(['MANAGER']))
		const visible = employees.map((e) => e.id)
		for (const id of Object.keys(recurringDefaults)) expect(visible).toContain(id)
	})

	it('leaves an HR_ADMIN the unfiltered roster', async () => {
		const { employees, recurringDefaults } = await loadCalculatorData(actor(['HR_ADMIN']))
		expect(employees.map((e) => e.id)).toEqual(ROSTER)
		expect(Object.keys(recurringDefaults).sort()).toEqual([...ROSTER].sort())
	})

	it('leaves a PAYROLL_OFFICER unfiltered — VIEW_PAY_ORGWIDE, and no id filter is applied', async () => {
		const { employees } = await loadCalculatorData(actor(['PAYROLL_OFFICER']))
		expect(employees.map((e) => e.id)).toEqual(ROSTER)
		const [{ where }] = dbMock.employeeEarning.groupBy.mock.calls[0]
		expect(where.employeeId).toBeUndefined()
	})
})

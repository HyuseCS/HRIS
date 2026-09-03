import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, USERS } from './helpers'

// #97: GET /api/v1/payroll/payslips/[id] looked the entry up by id alone and only
// enforced ownership for the EMPLOYEE role, so every privileged role (MANAGER, HR_ADMIN,
// PAYROLL_OFFICER, FINANCE, SUPER_ADMIN) could read another organization's payslip —
// full salary breakdown plus employee PII — just by knowing an id.
//
// The seed ships a single org, so this spec builds a second one to have something
// genuinely foreign to reach for, and removes it afterwards.
//
// Serial — beforeAll runs once per worker under fullyParallel, so without this the file's
// tests land on different workers and race to create the same hard-coded FOREIGN org id
// (Prisma unique-constraint failure in setup). Same reason pii/timesheet-punch are serial.
test.describe.configure({ mode: 'serial' })

const FOREIGN = 'e2e-tenancy-97'
// Distinct period so it can't collide with @@unique([organizationId, periodStart, periodEnd]).
const OWN_PERIOD = { start: new Date('2025-03-01'), end: new Date('2025-03-15') }

let foreignEntryId: string
let ownEntryId: string
/** Same org, same run, but NOT the manager's report — the #249 case. */
let strangerEntryId: string

test.beforeAll(async () => {
	const db = new PrismaClient()
	try {
		const org = await db.organization.create({
			data: { id: FOREIGN, name: 'Rival Corp' }
		})
		const dept = await db.department.create({
			data: { organizationId: org.id, name: 'Rival Dept' }
		})
		const user = await db.user.create({
			data: {
				organizationId: org.id,
				email: `${FOREIGN}@rival.test`,
				passwordHash: 'not-a-real-hash',
				roles: ['EMPLOYEE']
			}
		})
		const employee = await db.employee.create({
			data: {
				userId: user.id,
				organizationId: org.id,
				employeeNumber: 'RIV-0001',
				firstName: 'Rival',
				lastName: 'Employee',
				departmentId: dept.id,
				jobTitle: 'Analyst',
				employmentType: 'REGULAR',
				startDate: new Date('2025-01-01'),
				basicMonthlySalary: 99999
			}
		})
		// APPROVED so the payslip is genuinely visible — otherwise a 403 could come from
		// the visibility gate and the tenancy check would go untested.
		const run = await db.payrollRun.create({
			data: {
				organizationId: org.id,
				periodStart: new Date('2025-02-01'),
				periodEnd: new Date('2025-02-15'),
				status: 'APPROVED'
			}
		})
		const entry = await db.payrollEntry.create({
			data: {
				payrollRunId: run.id,
				employeeId: employee.id,
				hoursWorked: 80,
				basicPay: 50000,
				grossPay: 50000,
				sssEe: 0,
				sssEr: 0,
				philhealthEe: 0,
				philhealthEr: 0,
				pagibigEe: 0,
				pagibigEr: 0,
				withholdingTax: 0,
				totalDeductions: 0,
				netPay: 50000
			}
		})
		foreignEntryId = entry.id

		// A matching payslip inside the seeded org, so the positive control below is a
		// real assertion rather than a skip: the scope must block the foreign row and
		// still return this one.
		const own = await db.employee.findFirstOrThrow({
			where: { user: { email: 'employee@veent.ph' } },
			select: { id: true, organizationId: true }
		})
		const ownRun = await db.payrollRun.create({
			data: {
				organizationId: own.organizationId,
				periodStart: OWN_PERIOD.start,
				periodEnd: OWN_PERIOD.end,
				status: 'APPROVED'
			}
		})
		const ownEntry = await db.payrollEntry.create({
			data: {
				payrollRunId: ownRun.id,
				employeeId: own.id,
				hoursWorked: 80,
				basicPay: 30000,
				grossPay: 30000,
				sssEe: 0,
				sssEr: 0,
				philhealthEe: 0,
				philhealthEr: 0,
				pagibigEe: 0,
				pagibigEr: 0,
				withholdingTax: 0,
				totalDeductions: 0,
				netPay: 30000
			}
		})
		ownEntryId = ownEntry.id

		// #249: `own` above is the manager's DIRECT report (seed-core.ts:764,777), which is why the
		// old "a manager reads it" test passed identically whether MANAGER was org-wide or scoped to
		// their line — it proved nothing for months. Both properties are asserted below rather than
		// assumed, so seed drift breaks the test instead of quietly hollowing it out.
		const ownReportsTo = await db.employee.findUniqueOrThrow({
			where: { id: own.id },
			select: { reportsToId: true }
		})
		const manager = await db.employee.findFirstOrThrow({
			where: { user: { email: 'manager@veent.ph' } },
			select: { id: true }
		})
		if (ownReportsTo.reportsToId !== manager.id) {
			throw new Error('seed drift: employee@veent.ph no longer reports to manager@veent.ph')
		}

		// Hannah HR: same org, reports to nobody. The same target manager-org-wide-timesheets.spec.ts
		// picks, for the same reason.
		const stranger = await db.employee.findFirstOrThrow({
			where: { user: { email: 'hr@veent.ph' } },
			select: { id: true, reportsToId: true }
		})
		if (stranger.reportsToId !== null) {
			throw new Error('seed drift: hr@veent.ph gained a manager and is no longer a stranger')
		}
		const strangerEntry = await db.payrollEntry.create({
			data: {
				payrollRunId: ownRun.id,
				employeeId: stranger.id,
				hoursWorked: 80,
				basicPay: 45000,
				grossPay: 45000,
				sssEe: 0,
				sssEr: 0,
				philhealthEe: 0,
				philhealthEr: 0,
				pagibigEe: 0,
				pagibigEr: 0,
				withholdingTax: 0,
				totalDeductions: 0,
				netPay: 45000
			}
		})
		strangerEntryId = strangerEntry.id
	} finally {
		await db.$disconnect()
	}
})

test.afterAll(async () => {
	const db = new PrismaClient()
	try {
		// Children first — these relations are all RESTRICT on delete.
		await db.payrollEntry.deleteMany({
			where: { payrollRun: { periodStart: OWN_PERIOD.start, periodEnd: OWN_PERIOD.end } }
		})
		await db.payrollRun.deleteMany({
			where: { periodStart: OWN_PERIOD.start, periodEnd: OWN_PERIOD.end }
		})
		await db.payrollEntry.deleteMany({ where: { payrollRun: { organizationId: FOREIGN } } })
		await db.payrollRun.deleteMany({ where: { organizationId: FOREIGN } })
		await db.employee.deleteMany({ where: { organizationId: FOREIGN } })
		await db.user.deleteMany({ where: { organizationId: FOREIGN } })
		await db.department.deleteMany({ where: { organizationId: FOREIGN } })
		await db.organization.deleteMany({ where: { id: FOREIGN } })
	} finally {
		await db.$disconnect()
	}
})

// Every privileged role, not just one: the bug was that the ownership branch ran for
// EMPLOYEE only, so each of these had an unguarded path to the row.
for (const role of ['admin', 'manager'] as const) {
	test(`${role} cannot read another organization's payslip`, async ({ page }) => {
		await login(page, USERS[role])
		const response = await page.request.get(`/api/v1/payroll/payslips/${foreignEntryId}`)

		// 404, not 403: a foreign id must be indistinguishable from one that doesn't exist.
		expect(response.status()).toBe(404)

		// And none of the payslip's contents leak through the error body.
		const body = await response.text()
		expect(body).not.toContain('Rival')
		expect(body).not.toContain('50000')
		expect(body).not.toContain('RIV-0001')
	})
}

test('an in-org payslip is still readable — the scope did not over-block', async ({ page }) => {
	await login(page, USERS.admin)
	const response = await page.request.get(`/api/v1/payroll/payslips/${ownEntryId}`)
	expect(response.status()).toBe(200)
})

// ─── #123: same-org privilege, not just cross-org ────────────────────────────
// The tenancy fix above scoped the *query* to the caller's org. Inside the org the handler
// still only checked ownership when role === 'EMPLOYEE', so any other authenticated role
// could read any payslip by id. The PDF path already applied the right rule via
// fetchPayslipDocument; the JSON endpoint had drifted away from it.
//
// ownEntryId belongs to employee@veent.ph, so for every role below it is someone else's.

// Sign-off roles exist to advance the maker-checker chain (#134); they hold neither
// MANAGE_PAYROLL nor VIEW_PAYROLL_REPORTS and have no business reading pay data.
for (const role of ['verifier', 'approver'] as const) {
	test(`${role} cannot read another employee's payslip in the same org`, async ({ page }) => {
		await login(page, USERS[role])

		const json = await page.request.get(`/api/v1/payroll/payslips/${ownEntryId}`)
		expect(json.status(), 'JSON payslip').toBe(403)
		const body = await json.text()
		expect(body).not.toContain('30000') // gross / net
		expect(body).not.toContain('Employee') // employee name
		expect(body).not.toContain('philhealthEe') // nor the payload's field names
		expect(body).not.toContain('grossPay')

		// Same rule on the PDF sibling — one shared check, so neither is a way around the other.
		const pdf = await page.request.get(`/api/v1/payroll/payslips/${ownEntryId}/pdf`)
		expect(pdf.status(), 'PDF payslip').toBe(403)
	})
}

test('the owning employee can still read their own payslip', async ({ page }) => {
	// The ownership path is what the role check must not break: this is the whole reason the
	// endpoint is reachable below the payroll roles at all.
	await login(page, USERS.employee)
	const response = await page.request.get(`/api/v1/payroll/payslips/${ownEntryId}`)
	expect(response.status()).toBe(200)
})

test('a manager reads a DIRECT REPORT’s payslip (#249)', async ({ page }) => {
	// employee@veent.ph reports to manager@veent.ph (seed-core.ts:764,777), asserted in beforeAll.
	// A manager reviewing their own team's pay is the access #133 intended; what it must not carry
	// is the rest of the org, which the next test pins.
	await login(page, USERS.manager)
	const response = await page.request.get(`/api/v1/payroll/payslips/${ownEntryId}`)
	expect(response.status()).toBe(200)
})

test('a manager cannot read a NON-report’s payslip (#249)', async ({ page }) => {
	// The titular case of #123, left open when #133 added MANAGER to VIEW_PAYROLL_REPORTS and the
	// capability alone became the gate. The message matters: the visibility gate on this same route
	// also answers 403, so a status-only assertion would pass with the access check deleted.
	await login(page, USERS.manager)
	const response = await page.request.get(`/api/v1/payroll/payslips/${strangerEntryId}`)
	expect(response.status()).toBe(403)
	expect((await response.json()).error).toBe('Access denied')

	const body = await response.text()
	expect(body).not.toContain('45000')
	expect(body).not.toContain('grossPay')
	expect(body).not.toContain('Hannah')
})

test('a manager cannot pull a NON-report’s payslip PDF either (#249)', async ({ page }) => {
	// The PDF is a separate handler through a separate service. It had NO manager coverage at all,
	// and its comment claimed managers were blocked while the code let them through — so this is the
	// case that makes "one shared rule, no door is a way around another" actually true.
	await login(page, USERS.manager)
	const response = await page.request.get(`/api/v1/payroll/payslips/${strangerEntryId}/pdf`)
	expect(response.status()).toBe(403)
	expect((await response.json()).error).toBe('Access denied')
})

test('a manager CAN pull a direct report’s payslip PDF (#249)', async ({ page }) => {
	// The counterweight: this fails if the PDF door is narrowed past the reporting line.
	await login(page, USERS.manager)
	const response = await page.request.get(`/api/v1/payroll/payslips/${ownEntryId}/pdf`)
	expect(response.status()).toBe(200)
	expect(response.headers()['content-type']).toContain('application/pdf')
})

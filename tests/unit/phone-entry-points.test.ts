import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #24 — every phone entry point rejects `abc` and still accepts a real number.
 *
 * The rule itself is pinned in phone.test.ts. What this file pins is the WIRING: each schema is
 * private to its route module, so a rule that exists but is not applied at one of these nine sites
 * would pass every unit test of the rule and still let `abc` into the database. Asserted at the
 * route layer, through the real handler, with the writer service mocked — so the negative case
 * proves the writer was never reached and the positive case proves it was.
 *
 * The positive list is not decoration. The rule is deliberately lenient because real numbers are
 * already stored in every one of these shapes; a rule that passed by refusing everything would
 * break editing records that are fine today.
 */

const GOOD = ['09171234567', '+639171234567', '0917 123 4567', '(02) 8123 4567', '02-8123-4567']
const BAD = 'abc'

const {
	dbMock,
	employees,
	recruitment,
	emergency,
	branchSvc,
	access,
	notifications,
	requestDocs,
	leaveHelpers,
	tx
} = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
		jobPosting: { findFirst: vi.fn() },
		applicant: { findFirst: vi.fn().mockResolvedValue(null) },
		department: { findMany: vi.fn().mockResolvedValue([]) },
		request: { findFirst: vi.fn() },
		$transaction: vi.fn()
	},
	employees: {
		createEmployee: vi.fn().mockResolvedValue({ id: 'emp-new' }),
		updateEmployee: vi.fn().mockResolvedValue(undefined),
		getEmployee: vi.fn().mockResolvedValue({ id: 'emp-1', rateType: 'MONTHLY' }),
		offboardEmployee: vi.fn(),
		promoteEmployee: vi.fn().mockResolvedValue({}),
		revealEmployeeSensitive: vi.fn(),
		getEmploymentHistory: vi.fn(),
		recordCompensationChange: vi.fn(),
		AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
		NO_CHANGE_MESSAGE: 'No change',
		NO_CHANGE_STATUS: 400
	},
	recruitment: {
		applyToPosting: vi.fn().mockResolvedValue({ id: 'app-1' }),
		advanceApplicant: vi.fn()
	},
	emergency: {
		addEmergencyContact: vi.fn().mockResolvedValue(undefined),
		deleteEmergencyContact: vi.fn()
	},
	branchSvc: {
		BRANCH_STATUSES: ['OPEN', 'CLOSED'] as const,
		createBranch: vi.fn().mockResolvedValue(undefined),
		updateBranch: vi.fn().mockResolvedValue(undefined),
		toggleBranchStatus: vi.fn(),
		listBranches: vi.fn().mockResolvedValue([]),
		branchHeadcounts: vi.fn().mockResolvedValue({ unassigned: 0 }),
		listAssignableBranches: vi.fn().mockResolvedValue([]),
		selectableBranches: vi.fn().mockResolvedValue([])
	},
	access: {
		assertCanTouchEmployee: vi.fn().mockResolvedValue(undefined),
		canTouchEmployee: vi.fn().mockResolvedValue(true)
	},
	notifications: { sendWelcomeEmail: vi.fn() },
	requestDocs: {
		uploadsFromForm: vi.fn().mockResolvedValue([]),
		saveRequestDocuments: vi.fn().mockResolvedValue(undefined)
	},
	leaveHelpers: {
		assertLeaveEligibility: vi.fn().mockResolvedValue(undefined),
		computeLeaveTotalDays: vi.fn().mockResolvedValue(1),
		assertLeaveBalance: vi.fn().mockResolvedValue(undefined),
		meetsLeaveTenure: vi.fn().mockReturnValue(true),
		deductLeaveBalance: vi.fn(),
		workdaysBetween: vi.fn().mockReturnValue(1)
	},
	tx: { request: { create: vi.fn().mockResolvedValue({ id: 'req-1' }) } }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/employees', () => employees)
vi.mock('$lib/server/services/recruitment', () => recruitment)
vi.mock('$lib/server/services/emergencyContacts', () => emergency)
vi.mock('$lib/server/services/branches', () => branchSvc)
vi.mock('$lib/server/services/employee-access', () => access)
vi.mock('$lib/server/notifications', () => notifications)
vi.mock('$lib/server/services/requests/documents', () => requestDocs)
vi.mock('$lib/server/services/requests/leave', () => leaveHelpers)

const { actions: employeeActions } =
	await import('../../src/routes/(app)/employees/[id]/+page.server')
const { actions: newEmployeeActions } =
	await import('../../src/routes/(app)/employees/new/+page.server')
const { actions: profileActions } = await import('../../src/routes/(app)/profile/+page.server')
const { actions: applyActions } =
	await import('../../src/routes/(app)/recruitment/[id]/apply/+page.server')
const { actions: branchActions } = await import('../../src/routes/(app)/branches/+page.server')
const { actions: requestActions } = await import('../../src/routes/(app)/requests/+page.server')
const { POST: applicantsPost } =
	await import('../../src/routes/api/v1/recruitment/[id]/applicants/+server')
const { PATCH: employeePatch } = await import('../../src/routes/api/v1/employees/[id]/+server')

// `org_jojo` is a food-service tenant, so the Branches route's requireFoodServiceOrg passes.
const HR = { id: 'user-1', organizationId: 'org_jojo', roles: ['HR_ADMIN'] as Role[] }

const formEvent = (fields: Record<string, string>) => {
	const body = new FormData()
	for (const [k, v] of Object.entries(fields)) body.set(k, v)
	return {
		request: { formData: async () => body },
		locals: { user: HR },
		params: { id: 'emp-1' },
		// Phase 04 gave the create actions a redirect flash, so they call `cookies.set`.
		cookies: { set: () => {}, get: () => undefined, delete: () => {} },
		getClientAddress: () => '127.0.0.1'
	} as never
}

const jsonEvent = (body: unknown) =>
	({
		request: { json: async () => body },
		locals: { user: HR },
		params: { id: 'emp-1' }
	}) as never

/** Normalise every handler's rejection shape to `{ rejected, message }`. */
type Outcome = { rejected: boolean; message: string }

// SvelteKit handlers are typed MaybePromise, so these take an unknown/sync-or-async thunk.
const fromFail = async (run: () => unknown): Promise<Outcome> => {
	let result: unknown
	try {
		result = await run()
	} catch (e) {
		// employees/new redirects on success; a redirect is an acceptance, not a rejection.
		if (e && typeof e === 'object' && 'status' in e && 'location' in e)
			return { rejected: false, message: '' }
		throw e
	}
	const r = result as { status?: number; data?: Record<string, unknown> } | undefined
	if (!r || typeof r.status !== 'number') return { rejected: false, message: '' }
	const data = r.data ?? {}
	const fieldErrors = (data.fieldErrors ?? {}) as Record<string, string[]>
	return {
		rejected: true,
		message: [String(data.error ?? ''), ...Object.values(fieldErrors).flat()].join(' ')
	}
}

const fromResponse = async (run: () => Response | Promise<Response>): Promise<Outcome> => {
	const res = await run()
	if (res.status < 400) return { rejected: false, message: '' }
	const body = (await res.json()) as { error?: string; details?: unknown }
	return { rejected: true, message: JSON.stringify(body) }
}

/** A complete new-hire payload; only the phone under test varies. */
const newHire = (phone: string) => ({
	email: 'new.hire@veent.ph',
	firstName: 'New',
	lastName: 'Hire',
	role: 'EMPLOYEE',
	departmentId: 'dept-1',
	jobTitle: 'Crew',
	startDate: '2026-01-05',
	basicMonthlySalary: '20000',
	emergencyContactPhone: phone
})

type EntryPoint = {
	name: string
	/** Writer that must be reached on accept and never reached on reject. */
	writer: () => { mock: { calls: unknown[][] } }
	submit: (phone: string) => Promise<Outcome>
	/** Fields this entry point leaves optional — omitting the phone must stay valid. */
	optional?: boolean
	omit?: () => Promise<Outcome>
}

const ENTRY_POINTS: EntryPoint[] = [
	{
		name: 'employees/[id] ?/addEmergencyContact (required)',
		writer: () => emergency.addEmergencyContact,
		submit: (phone) =>
			fromFail(() =>
				employeeActions.addEmergencyContact(
					formEvent({ name: 'Ana Cruz', relationship: 'Sister', phone })
				)
			)
	},
	{
		name: 'employees/[id] ?/update contactPhone',
		writer: () => employees.updateEmployee,
		submit: (phone) => fromFail(() => employeeActions.update(formEvent({ contactPhone: phone })))
	},
	{
		name: 'employees/[id] ?/update emergencyContactPhone',
		writer: () => employees.updateEmployee,
		submit: (phone) =>
			fromFail(() => employeeActions.update(formEvent({ emergencyContactPhone: phone })))
	},
	{
		name: 'employees/new ?/create emergencyContactPhone',
		writer: () => employees.createEmployee,
		submit: (phone) => fromFail(() => newEmployeeActions.create(formEvent(newHire(phone)))),
		optional: true,
		omit: () => {
			const { emergencyContactPhone: _drop, ...rest } = newHire('')
			return fromFail(() => newEmployeeActions.create(formEvent(rest)))
		}
	},
	{
		name: 'profile ?/update contactPhone',
		writer: () => employees.updateEmployee,
		submit: (phone) => fromFail(() => profileActions.update(formEvent({ contactPhone: phone })))
	},
	{
		name: 'recruitment/[id]/apply ?/apply phone',
		writer: () => recruitment.applyToPosting,
		submit: (phone) =>
			fromFail(() =>
				applyActions.apply(
					formEvent({
						firstName: 'Jo',
						lastName: 'Reyes',
						email: 'jo.reyes@veent.ph',
						phone
					})
				)
			),
		optional: true,
		omit: () =>
			fromFail(() =>
				applyActions.apply(
					formEvent({ firstName: 'Jo', lastName: 'Reyes', email: 'jo.reyes@veent.ph' })
				)
			)
	},
	{
		name: 'api/v1/recruitment/[id]/applicants POST phone',
		writer: () => recruitment.applyToPosting,
		submit: (phone) =>
			fromResponse(() =>
				applicantsPost(
					jsonEvent({
						firstName: 'Jo',
						lastName: 'Reyes',
						email: 'jo.reyes@veent.ph',
						phone
					})
				)
			),
		optional: true,
		omit: () =>
			fromResponse(() =>
				applicantsPost(
					jsonEvent({ firstName: 'Jo', lastName: 'Reyes', email: 'jo.reyes@veent.ph' })
				)
			)
	},
	{
		name: 'api/v1/employees/[id] PATCH contactPhone',
		writer: () => employees.updateEmployee,
		submit: (phone) => fromResponse(() => employeePatch(jsonEvent({ contactPhone: phone })))
	},
	{
		name: 'branches ?/create contactPhone',
		writer: () => branchSvc.createBranch,
		submit: (phone) =>
			fromFail(() =>
				branchActions.create(formEvent({ name: 'Katipunan', status: 'OPEN', contactPhone: phone }))
			)
	},
	{
		name: 'requests ?/create INFO_UPDATE phone',
		writer: () => tx.request.create,
		submit: (phone) =>
			fromFail(() =>
				requestActions.create(
					formEvent({
						type: 'INFO_UPDATE',
						field: 'contactPhone',
						requestedValue: phone,
						reason: 'Changed SIM'
					})
				)
			)
	}
]

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue({
		id: 'emp-1',
		reportsToId: null,
		startDate: new Date('2024-01-01')
	})
	dbMock.employee.findMany.mockResolvedValue([])
	dbMock.jobPosting.findFirst.mockResolvedValue({
		id: 'post-1',
		status: 'OPEN',
		organizationId: HR.organizationId
	})
	dbMock.applicant.findFirst.mockResolvedValue(null)
	dbMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
	tx.request.create.mockResolvedValue({ id: 'req-1' })
})

describe.each(ENTRY_POINTS)('$name', (entry) => {
	// The negative control. Before the fix this FAILS at every entry point — `abc` is accepted
	// and reaches the writer, which is the whole of #24 Part 1.
	it('rejects "abc" and never reaches the writer', async () => {
		const outcome = await entry.submit(BAD)
		expect(outcome.rejected).toBe(true)
		expect(outcome.message).toMatch(/7-15 digits/)
		expect(entry.writer()).not.toHaveBeenCalled()
	})

	// The positive control. A rule that rejected everything would pass the test above.
	it.each(GOOD)('accepts %s', async (phone) => {
		const outcome = await entry.submit(phone)
		expect(outcome).toEqual({ rejected: false, message: '' })
		expect(entry.writer()).toHaveBeenCalled()
	})

	if (entry.optional) {
		it('stays valid with no phone submitted at all', async () => {
			const outcome = await entry.omit!()
			expect(outcome).toEqual({ rejected: false, message: '' })
			expect(entry.writer()).toHaveBeenCalled()
		})
	}
})

/**
 * #24's "also worth checking": `email` is `z.string().email()` in employees/new and login, and the
 * two applicant paths were to be confirmed to match. They do — both already carry `.email()`. This
 * pins that, because "confirmed by reading it" is not a guard: the API route in particular is easy
 * to add a field to without the form's rule.
 */
describe('applicant email is validated at both doors (#24)', () => {
	it('the /apply form rejects a malformed address', async () => {
		const outcome = await fromFail(() =>
			applyActions.apply(formEvent({ firstName: 'Jo', lastName: 'Reyes', email: 'not-an-email' }))
		)
		expect(outcome.rejected).toBe(true)
		expect(recruitment.applyToPosting).not.toHaveBeenCalled()
	})

	it('the v1 API rejects a malformed address', async () => {
		const outcome = await fromResponse(() =>
			applicantsPost(jsonEvent({ firstName: 'Jo', lastName: 'Reyes', email: 'not-an-email' }))
		)
		expect(outcome.rejected).toBe(true)
		expect(recruitment.applyToPosting).not.toHaveBeenCalled()
	})

	it('both accept a well-formed address', async () => {
		expect(
			await fromFail(() =>
				applyActions.apply(
					formEvent({ firstName: 'Jo', lastName: 'Reyes', email: 'jo.reyes@veent.ph' })
				)
			)
		).toEqual({ rejected: false, message: '' })
		expect(
			await fromResponse(() =>
				applicantsPost(
					jsonEvent({ firstName: 'Jo', lastName: 'Reyes', email: 'jo.reyes@veent.ph' })
				)
			)
		).toEqual({ rejected: false, message: '' })
	})
})

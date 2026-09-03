import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { MASKED_SALARY } from '$lib/utils/format'

/**
 * #170 blocker fix — the v1 PATCH must NOT write pay straight onto the Employee row (the payroll
 * run reads period-end salary from EmployeeCompensation history, so a bare write is silently lost).
 * A salary/rateType change must delegate to `recordCompensationChange`, which inserts a history
 * snapshot; resending the current salary is a no-op, not a 400. DB + audit + bcrypt are mocked so
 * the whole PATCH → service → history-write chain runs for real against the mocked client.
 */

const { dbMock, txMock } = vi.hoisted(() => {
	const txMock = {
		employeeCompensation: { create: vi.fn(), findFirst: vi.fn() },
		employee: { update: vi.fn() }
	}
	return {
		txMock,
		dbMock: {
			// getEmployee (raw + masked) reads this; updateEmployee would write here (must NOT for pay).
			employee: { findFirst: vi.fn(), update: vi.fn() },
			// getEmployee's heal-on-read (#170 Stage 1.5, #222) queries the comp + type history.
			employeeCompensation: { findMany: vi.fn() },
			employeeEmploymentType: { findMany: vi.fn() },
			payrollRun: { findFirst: vi.fn() },
			$transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))
vi.mock('$lib/server/services/action-proposals', () => ({
	createProposal: vi.fn().mockResolvedValue({ id: 'prop-1' }),
	// Imported by employees.ts for the audited reveal. Unused here, but a factory mock replaces the
	// whole module, so omitting it makes the import undefined rather than absent.
	assertMayConfirmProposal: vi.fn()
}))

const { PATCH } = await import('../../src/routes/api/v1/employees/[id]/+server')
const { AWAITING_CONFIRMATION } = await import('$lib/server/services/employees')
const { createProposal } = await import('$lib/server/services/action-proposals')

const HR_USER = {
	id: 'u1',
	organizationId: 'org1',
	roles: ['HR_ADMIN'] as Role[]
}

const EMP = {
	id: 'emp1',
	basicMonthlySalary: 30000,
	rateType: 'MONTHLY' as const,
	employmentType: 'REGULAR' as const,
	startDate: new Date('2024-01-01'),
	// present so maskEmployee has something to mask on the re-fetch
	sssNumber: '34-1234567-8',
	bankAccountNumber: '000123456789'
}

const patch = (body: unknown, user = HR_USER) =>
	PATCH({
		locals: { user },
		params: { id: 'emp1' },
		request: { json: async () => body }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue(EMP)
	dbMock.employee.update.mockResolvedValue(EMP) // updateEmployee still handles non-pay fields
	dbMock.employeeCompensation.findMany.mockResolvedValue([]) // no history → getEmployee heal is a no-op
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
	dbMock.payrollRun.findFirst.mockResolvedValue(null) // no frozen run in the way
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
	// the re-derived current cache after the change
	txMock.employeeCompensation.findFirst.mockResolvedValue({
		basicMonthlySalary: 50000,
		rateType: 'MONTHLY'
	})
})

/** No Employee-row write (the updateEmployee path) may carry pay fields — those go to history. */
function assertNoBarePayWrite() {
	for (const [arg] of dbMock.employee.update.mock.calls) {
		expect(arg.data).not.toHaveProperty('basicMonthlySalary')
		expect(arg.data).not.toHaveProperty('rateType')
	}
}

describe('PATCH /api/v1/employees/[id] — pay routes through the history writer (#170)', () => {
	it('a salary change writes an EmployeeCompensation snapshot, not a bare Employee pay write', async () => {
		const res = await patch({ basicMonthlySalary: 50000 })

		expect(res.status).toBe(200)
		// Delegated: the history row is inserted (effective today, rateType carried forward)…
		expect(txMock.employeeCompensation.create).toHaveBeenCalledTimes(1)
		expect(txMock.employeeCompensation.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				employeeId: 'emp1',
				basicMonthlySalary: 50000,
				rateType: 'MONTHLY'
			})
		})
		// …and pay never leaks into the generic Employee-row update.
		assertNoBarePayWrite()

		// Response is the masked re-fetch (salary sentinel), never the raw pre-change record.
		const payload = await res.json()
		expect(payload.data.basicMonthlySalary).toBe(MASKED_SALARY)
	})

	it('resending the current salary is a no-op, not a 400', async () => {
		const res = await patch({ basicMonthlySalary: 30000 }) // === current

		expect(res.status).toBe(200)
		// No snapshot written when nothing actually changed…
		expect(txMock.employeeCompensation.create).not.toHaveBeenCalled()
		// …and the response is a normal (masked) record, carrying no error.
		const payload = await res.json()
		expect(payload.error).toBeUndefined()
		expect(payload.data.basicMonthlySalary).toBe(MASKED_SALARY)
	})

	it('a rateType-only change also delegates to the history writer', async () => {
		const res = await patch({ rateType: 'DAILY' })

		expect(res.status).toBe(200)
		expect(txMock.employeeCompensation.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				employeeId: 'emp1',
				basicMonthlySalary: 30000,
				rateType: 'DAILY'
			})
		})
		assertNoBarePayWrite()
	})
})

/**
 * #224 Part 2 / #243 — a pay change the actor may not make alone is FILED, not applied. The PATCH
 * still re-fetches and returns the record, so without a distinct status the caller would read their
 * own unchanged salary back under a 200 and conclude the raise landed. 202 says "accepted, not yet
 * applied", which is exactly the state of the row.
 */
describe('PATCH /api/v1/employees/[id] — a routed pay change answers 202', () => {
	beforeEach(() => dbMock.employee.findFirst.mockResolvedValue({ ...EMP, userId: HR_USER.id }))

	it('files a proposal and reports it instead of claiming success', async () => {
		const res = await patch({ basicMonthlySalary: 50000 }) // HR admin, own record → self-action

		expect(res.status).toBe(202)
		const payload = await res.json()
		expect(payload.notice).toBe(AWAITING_CONFIRMATION)
		expect(payload.proposalId).toBe('prop-1')
		// Nothing was written: the returned record is the pre-change one, which is why the status
		// must not be 200.
		expect(txMock.employeeCompensation.create).not.toHaveBeenCalled()
		assertNoBarePayWrite()
	})

	/**
	 * The pay writer runs BEFORE the non-pay one. It can now refuse for reasons the value pre-check
	 * cannot see — a 409 when nobody in the org could confirm the proposal, a 403 from the
	 * object-level guard — and the two writers are separate transactions. In the old order those
	 * rejections left the non-pay fields of the same PATCH committed: a half-applied request that
	 * answered with an error.
	 */
	it('leaves non-pay fields untouched when the pay half is refused', async () => {
		vi.mocked(createProposal).mockRejectedValueOnce(
			Object.assign(new Error('no confirmer'), { status: 409, body: { message: 'no confirmer' } })
		)

		const res = await patch({ basicMonthlySalary: 50000, jobTitle: 'Team Lead' })

		expect(res.status).toBe(409)
		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})
})

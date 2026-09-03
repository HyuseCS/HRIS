import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { employmentTypeAt } from '$lib/utils/employment-type'

/**
 * #222 — promoteEmployee is one atomic career event. The three things that have to hold:
 *  - the rate-basis pairing (#189) is judged on the RESULTING state, so PART_TIME/HOURLY → REGULAR
 *    is rejected on its own but accepted when the same call moves the rate;
 *  - every changed field lands in ONE audit entry (the 201 timeline renders one event, not N);
 *  - pay and employment type are written as effective-dated snapshots, never straight onto the row.
 * DB + audit are mocked, so the whole service runs for real against the mocked client.
 */

const DAY = 24 * 60 * 60 * 1000

const { dbMock, txMock, writeAuditLog } = vi.hoisted(() => {
	const txMock = {
		employeeCompensation: { create: vi.fn(), findFirst: vi.fn() },
		employeeEmploymentType: { create: vi.fn(), findFirst: vi.fn() },
		employee: { update: vi.fn() }
	}
	return {
		txMock,
		writeAuditLog: vi.fn().mockResolvedValue(undefined),
		dbMock: {
			employee: { findFirst: vi.fn(), update: vi.fn() },
			employeeCompensation: { findMany: vi.fn() },
			employeeEmploymentType: { findMany: vi.fn() },
			position: { findFirst: vi.fn() },
			payrollRun: { findFirst: vi.fn() },
			$transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))

const { promoteEmployee } = await import('$lib/server/services/employees')

const CTX = {
	organizationId: 'org1',
	actorId: 'u1',
	actorRoles: ['HR_ADMIN'] as Role[],
	ipAddress: 't'
}
const TODAY = new Date()

/** A part-time, hourly-paid hire — the case #222 calls out as the invalid-pairing trap. */
const PART_TIMER = {
	id: 'emp1',
	startDate: new Date(Date.now() - 400 * DAY),
	basicMonthlySalary: 120,
	rateType: 'HOURLY',
	employmentType: 'PART_TIME',
	jobTitle: 'Crew',
	positionId: null,
	reportsToId: null
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
	dbMock.employee.findFirst.mockResolvedValue(PART_TIMER)
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
	dbMock.payrollRun.findFirst.mockResolvedValue(null)
	txMock.employeeCompensation.findFirst.mockResolvedValue({
		basicMonthlySalary: 25000,
		rateType: 'MONTHLY'
	})
	txMock.employeeEmploymentType.findFirst.mockResolvedValue({ employmentType: 'REGULAR' })
})

describe('promoteEmployee rate-basis pairing (#222 / #189)', () => {
	it('rejects PART_TIME (HOURLY) → REGULAR when the rate basis does not move with it', async () => {
		await expect(
			promoteEmployee('emp1', 'org1', { employmentType: 'REGULAR', effectiveDate: TODAY }, CTX)
		).rejects.toMatchObject({ status: 400 })
		expect(txMock.employee.update).not.toHaveBeenCalled()
	})

	it('accepts the same change when the call also moves the rate to MONTHLY', async () => {
		await expect(
			promoteEmployee(
				'emp1',
				'org1',
				{
					employmentType: 'REGULAR',
					basicMonthlySalary: 25000,
					rateType: 'MONTHLY',
					effectiveDate: TODAY
				},
				CTX
			)
		).resolves.toBeTruthy()
		// Both snapshots written; the Employee row only ever gets the re-derived cache.
		expect(txMock.employeeCompensation.create).toHaveBeenCalledTimes(1)
		expect(txMock.employeeEmploymentType.create).toHaveBeenCalledTimes(1)
	})
})

describe('promoteEmployee audit (#222)', () => {
	it('records every changed field in ONE entry so the timeline shows one event', async () => {
		dbMock.position.findFirst.mockResolvedValue({ id: 'pos2', salaryGrade: null })
		await promoteEmployee(
			'emp1',
			'org1',
			{
				positionId: 'pos2',
				jobTitle: 'Shift Lead',
				employmentType: 'REGULAR',
				basicMonthlySalary: 25000,
				rateType: 'MONTHLY',
				effectiveDate: TODAY
			},
			CTX
		)
		expect(writeAuditLog).toHaveBeenCalledTimes(1)
		const [, entry] = writeAuditLog.mock.calls[0]
		expect(entry.newValue).toMatchObject({
			positionId: 'pos2',
			jobTitle: 'Shift Lead',
			employmentType: 'REGULAR',
			basicMonthlySalary: 25000,
			rateType: 'MONTHLY'
		})
		expect(entry.oldValue).toMatchObject({ jobTitle: 'Crew', employmentType: 'PART_TIME' })
		// The effective date rides along so the timeline can distinguish it from the recorded-on date.
		expect(entry.newValue.effectiveDate).toBeInstanceOf(Date)
	})

	it('rejects a promotion that changes nothing', async () => {
		await expect(
			promoteEmployee('emp1', 'org1', { jobTitle: 'Crew', effectiveDate: TODAY }, CTX)
		).rejects.toMatchObject({ status: 400 })
	})
})

describe('promoteEmployee guards (#222)', () => {
	it('refuses a position from another tenant', async () => {
		dbMock.position.findFirst.mockResolvedValue(null) // org-scoped lookup finds nothing
		await expect(
			promoteEmployee('emp1', 'org1', { positionId: 'pos-other-org', effectiveDate: TODAY }, CTX)
		).rejects.toMatchObject({ status: 404 })
	})

	it('refuses to make an employee their own manager', async () => {
		await expect(
			promoteEmployee('emp1', 'org1', { reportsToId: 'emp1', effectiveDate: TODAY }, CTX)
		).rejects.toMatchObject({ status: 400 })
	})

	it('refuses a manager from another tenant', async () => {
		// getEmployee resolves the subject; the org-scoped manager lookup then finds nothing.
		dbMock.employee.findFirst.mockResolvedValueOnce(PART_TIMER).mockResolvedValueOnce(null)
		await expect(
			promoteEmployee('emp1', 'org1', { reportsToId: 'emp-other-org', effectiveDate: TODAY }, CTX)
		).rejects.toMatchObject({ status: 404 })
	})

	it('refuses an effective date before the hire date', async () => {
		await expect(
			promoteEmployee(
				'emp1',
				'org1',
				{ jobTitle: 'Shift Lead', effectiveDate: new Date(Date.now() - 500 * DAY) },
				CTX
			)
		).rejects.toMatchObject({ status: 400 })
	})

	it('warns but does not block when the new salary is outside the band', async () => {
		dbMock.position.findFirst.mockResolvedValue({
			id: 'pos2',
			salaryGrade: { name: 'SG-3', minSalary: 30000, maxSalary: 40000 }
		})
		const { notice } = await promoteEmployee(
			'emp1',
			'org1',
			{
				positionId: 'pos2',
				employmentType: 'REGULAR',
				basicMonthlySalary: 25000,
				rateType: 'MONTHLY',
				effectiveDate: TODAY
			},
			CTX
		)
		expect(notice).toMatch(/below the SG-3 band/)
		expect(txMock.employee.update).toHaveBeenCalled() // recorded anyway
	})
})

describe('promoteEmployee future dating (#222)', () => {
	const NEXT_WEEK = new Date(Date.now() + 7 * DAY)

	it('refuses to future-date a change to position, title or reporting line', async () => {
		// Those are plain columns — they would apply on save, i.e. a week early.
		await expect(
			promoteEmployee('emp1', 'org1', { jobTitle: 'Shift Lead', effectiveDate: NEXT_WEEK }, CTX)
		).rejects.toMatchObject({ status: 400 })
		expect(txMock.employee.update).not.toHaveBeenCalled()
	})

	it('allows a pay/type-only promotion to be future-dated, leaving the cache alone', async () => {
		// Every snapshot is future-dated, so the re-derivation (effectiveDate ≤ today) finds nothing.
		txMock.employeeCompensation.findFirst.mockResolvedValue(null)
		txMock.employeeEmploymentType.findFirst.mockResolvedValue(null)
		await promoteEmployee(
			'emp1',
			'org1',
			{
				employmentType: 'REGULAR',
				rateType: 'MONTHLY',
				basicMonthlySalary: 25000,
				effectiveDate: NEXT_WEEK
			},
			CTX
		)
		expect(txMock.employeeCompensation.create).toHaveBeenCalledTimes(1)
		expect(txMock.employeeEmploymentType.create).toHaveBeenCalledTimes(1)
		// The row must not carry the future values forward before their date.
		const data = txMock.employee.update.mock.calls[0]?.[0]?.data ?? {}
		expect(data).not.toHaveProperty('basicMonthlySalary')
		expect(data).not.toHaveProperty('rateType')
		expect(data).not.toHaveProperty('employmentType')
	})
})

describe('promoteEmployee hire-date floor (#266)', () => {
	/**
	 * The floor guards records that CARRY the effective date — the pay/type snapshots, and the
	 * HISTORY_FIELDS the timeline renders it against. It ran unconditionally, so it also refused a
	 * reporting-line change, which is neither: `reportsToId` is not a HISTORY_FIELD, and as a plain
	 * column it applies the moment the promotion saves whatever date it carries. The visible cost
	 * was that a hire who had not started yet could not be re-pointed at a different manager at all,
	 * through `?/promote` or (after #263) through the v1 PATCH — both pass today's date.
	 *
	 * `:158-167` above is the companion case and stays UNMODIFIED: it sends a jobTitle, which IS a
	 * HISTORY_FIELD, so the floor must still refuse it. The two together pin both edges of the gate.
	 */
	const PRE_BOARDED = { ...PART_TIMER, startDate: new Date(Date.now() + 30 * DAY) }

	it('lets a reporting-line change through for a hire who has not started yet', async () => {
		// #1 getEmployee resolves the subject; #2 the org-scoped manager lookup finds the new manager.
		dbMock.employee.findFirst
			.mockResolvedValueOnce(PRE_BOARDED)
			.mockResolvedValueOnce({ id: 'mgr9' })

		await expect(
			promoteEmployee('emp1', 'org1', { reportsToId: 'mgr9', effectiveDate: TODAY }, CTX)
		).resolves.toBeTruthy()

		expect(txMock.employee.update.mock.calls[0][0].data.reportsToId).toBe('mgr9')
		expect(writeAuditLog).toHaveBeenCalledTimes(1)
	})

	it('still refuses a pay change dated before the hire date', async () => {
		dbMock.employee.findFirst.mockResolvedValue(PRE_BOARDED)

		// The message, not just the status: three different 400s are reachable from this input shape
		// (the pairing check, NO_CHANGE and the floor), and only one of them proves the floor fired.
		await expect(
			promoteEmployee(
				'emp1',
				'org1',
				{
					basicMonthlySalary: 30000,
					rateType: 'MONTHLY',
					employmentType: 'REGULAR',
					effectiveDate: TODAY
				},
				CTX
			)
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'Effective date cannot be before the hire date.' }
		})

		expect(txMock.employee.update).not.toHaveBeenCalled()
		expect(txMock.employeeCompensation.create).not.toHaveBeenCalled()
	})
})

describe('employmentTypeAt (#222)', () => {
	const row = (type: string, effDays: number, seqDays = effDays) => ({
		employmentType: type as 'REGULAR',
		effectiveDate: new Date(Date.now() + effDays * DAY),
		changedAt: new Date(Date.now() + seqDays * DAY)
	})

	it('ignores a future-dated snapshot until its date arrives', () => {
		const history = [row('PROBATIONARY', -400), row('REGULAR', 7)]
		expect(employmentTypeAt(history, new Date(), 'PROBATIONARY')).toBe('PROBATIONARY')
		expect(employmentTypeAt(history, new Date(Date.now() + 8 * DAY), 'PROBATIONARY')).toBe(
			'REGULAR'
		)
	})

	it('leaves the current value alone when a correction is backdated below a later change', () => {
		const history = [row('PROBATIONARY', -400), row('REGULAR', -30), row('CONTRACTUAL', -100, 0)]
		expect(employmentTypeAt(history, new Date(), 'PROBATIONARY')).toBe('REGULAR')
	})

	it('falls back to the cached column when there is no history at all', () => {
		expect(employmentTypeAt([], new Date(), 'INTERN')).toBe('INTERN')
	})
})

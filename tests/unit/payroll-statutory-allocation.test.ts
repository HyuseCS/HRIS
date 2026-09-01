import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import {
	computeEmployeeResult,
	type EmployeeComputeConfig
} from '$lib/server/services/payroll/calculator'
import {
	emptyAttendance,
	type EmployeeComp,
	type AttendanceInput
} from '$lib/server/services/payroll/types'

/**
 * Per-employee statutory EE-share period allocation (#173, Feature E). HR can load the full monthly
 * EE share onto one semi-monthly cutoff (FIRST/SECOND) instead of splitting it (EVEN). Only the EE
 * share moves — the ER share and withholding tax keep their normal `× periodShare` proration — and
 * only on a FIRST_HALF/SECOND_HALF run; a WHOLE_MONTH/legacy period ignores allocation.
 */

const comp: EmployeeComp = { basicMonthlySalary: 30000, rateType: 'MONTHLY' }
const att = (over: Partial<AttendanceInput> = {}): AttendanceInput => ({
	...emptyAttendance(),
	...over
})
const cfg = (over: Partial<EmployeeComputeConfig> = {}): EmployeeComputeConfig => ({
	taxableByCode: new Map([['BASIC', true]]),
	periodShare: 0.5,
	loans: [],
	cashAdvances: [],
	...over
})
const FULL_PERIOD_HOURS = 88
const alloc = (mode: 'EVEN' | 'FIRST' | 'SECOND') => ({
	sss: mode,
	philhealth: mode,
	pagibig: mode
})

const run = (over: Partial<EmployeeComputeConfig>) =>
	computeEmployeeResult(comp, att({ regularHours: FULL_PERIOD_HOURS }), {}, cfg(over)).statutory

// Full monthly EE (WHOLE_MONTH run, share 1) — the figure a cutoff's allocation redistributes.
const monthly = run({ periodShare: 1, periodKind: 'WHOLE_MONTH' })
// Today's behaviour: an even semi-monthly split, no allocation field.
const evenBaseline = run({ periodShare: 0.5 })

describe('computeEmployeeResult — EE-share allocation (#173, Feature E)', () => {
	it('EVEN with no field set is byte-identical to today', () => {
		const withField = run({
			periodShare: 0.5,
			periodKind: 'FIRST_HALF',
			statutoryAllocations: alloc('EVEN')
		})
		expect(withField.sssEe).toBe(evenBaseline.sssEe)
		expect(withField.philhealthEe).toBe(evenBaseline.philhealthEe)
		expect(withField.pagibigEe).toBe(evenBaseline.pagibigEe)
	})

	it('FIRST_HALF run: FIRST = full monthly EE, SECOND = 0, EVEN = half', () => {
		const first = run({
			periodShare: 0.5,
			periodKind: 'FIRST_HALF',
			statutoryAllocations: alloc('FIRST')
		})
		const second = run({
			periodShare: 0.5,
			periodKind: 'FIRST_HALF',
			statutoryAllocations: alloc('SECOND')
		})
		const even = run({
			periodShare: 0.5,
			periodKind: 'FIRST_HALF',
			statutoryAllocations: alloc('EVEN')
		})
		expect(first.sssEe).toBe(monthly.sssEe)
		expect(second.sssEe).toBe(0)
		expect(even.sssEe).toBe(evenBaseline.sssEe)
	})

	it('SECOND_HALF run: SECOND = full monthly EE, FIRST = 0, EVEN = half (mirror)', () => {
		const first = run({
			periodShare: 0.5,
			periodKind: 'SECOND_HALF',
			statutoryAllocations: alloc('FIRST')
		})
		const second = run({
			periodShare: 0.5,
			periodKind: 'SECOND_HALF',
			statutoryAllocations: alloc('SECOND')
		})
		const even = run({
			periodShare: 0.5,
			periodKind: 'SECOND_HALF',
			statutoryAllocations: alloc('EVEN')
		})
		expect(second.philhealthEe).toBe(monthly.philhealthEe)
		expect(first.philhealthEe).toBe(0)
		expect(even.philhealthEe).toBe(evenBaseline.philhealthEe)
	})

	it('WHOLE_MONTH run pays the full EE regardless of allocation mode', () => {
		const first = run({
			periodShare: 1,
			periodKind: 'WHOLE_MONTH',
			statutoryAllocations: alloc('FIRST')
		})
		const second = run({
			periodShare: 1,
			periodKind: 'WHOLE_MONTH',
			statutoryAllocations: alloc('SECOND')
		})
		expect(first.pagibigEe).toBe(monthly.pagibigEe)
		expect(second.pagibigEe).toBe(monthly.pagibigEe)
	})

	it('allocation never touches the ER share or tax — only the EE line moves', () => {
		const first = run({
			periodShare: 0.5,
			periodKind: 'FIRST_HALF',
			statutoryAllocations: alloc('FIRST')
		})
		expect(first.sssEr).toBe(evenBaseline.sssEr)
		expect(first.philhealthEr).toBe(evenBaseline.philhealthEr)
		expect(first.pagibigEr).toBe(evenBaseline.pagibigEr)
		expect(first.withholdingTax).toBe(evenBaseline.withholdingTax)
	})

	it('reconciliation: a FIRST-mode employee’s two cutoffs sum to the monthly EE', () => {
		const firstHalf = run({
			periodShare: 0.5,
			periodKind: 'FIRST_HALF',
			statutoryAllocations: alloc('FIRST')
		})
		const secondHalf = run({
			periodShare: 0.5,
			periodKind: 'SECOND_HALF',
			statutoryAllocations: alloc('FIRST')
		})
		expect(firstHalf.sssEe + secondHalf.sssEe).toBe(monthly.sssEe)
		expect(firstHalf.philhealthEe + secondHalf.philhealthEe).toBe(monthly.philhealthEe)
		expect(firstHalf.pagibigEe + secondHalf.pagibigEe).toBe(monthly.pagibigEe)
	})
})

// ─── Service: setStatutoryAllocation ───────────────────────────────────────────

const { dbMock, tx } = vi.hoisted(() => ({
	// #324: the setters now upsert on the transaction client, so the upsert mock lives on `tx`.
	tx: { employeeStatutoryConfig: { upsert: vi.fn() } },
	dbMock: {
		$transaction: vi.fn(),
		employee: { findFirst: vi.fn() },
		employeeStatutoryConfig: { findMany: vi.fn() }
	}
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { setStatutoryAllocation } = await import('$lib/server/services/payroll/employee-statutory')

const ctx = {
	organizationId: 'org1',
	actorId: 'user1',
	actorRoles: ['HR_ADMIN'] as Role[],
	ipAddress: 'test'
}

describe('setStatutoryAllocation (#173, Feature E)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbMock.employee.findFirst.mockResolvedValue({
			id: 'emp1',
			basicMonthlySalary: 30000,
			rateType: 'MONTHLY'
		})
		tx.employeeStatutoryConfig.upsert.mockResolvedValue({ id: 'cfg1' })
		dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
	})

	it('upserts only the allocation (preserving exempt + external) and audits it', async () => {
		const { writeAuditLog } = await import('$lib/server/audit')
		await setStatutoryAllocation('emp1', 'org1', 'SSS', 'FIRST', ctx)

		// Neither create nor update mentions `exempt`/`employerSharePaidExternally` — the shared row's
		// other flags are preserved (create defaults them to false; update leaves them as-is).
		expect(tx.employeeStatutoryConfig.upsert).toHaveBeenCalledWith({
			where: { employeeId_contribution: { employeeId: 'emp1', contribution: 'SSS' } },
			create: { employeeId: 'emp1', contribution: 'SSS', allocation: 'FIRST' },
			update: { allocation: 'FIRST' }
		})
		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({
				entityType: 'EmployeeStatutoryConfig',
				entityId: 'cfg1',
				newValue: { contribution: 'SSS', allocation: 'FIRST' }
			}),
			// #324: the audit write shares the transaction.
			tx
		)
	})

	it('rejects an employee outside the caller’s organization', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		await expect(
			setStatutoryAllocation('emp1', 'org1', 'SSS', 'SECOND', ctx)
		).rejects.toMatchObject({ status: 404 })
		expect(tx.employeeStatutoryConfig.upsert).not.toHaveBeenCalled()
	})
})

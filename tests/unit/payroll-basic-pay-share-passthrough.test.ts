import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import {
	computeEmployeeResult,
	type EmployeeComputeConfig
} from '$lib/server/services/payroll/calculator'
import { emptyAttendance, type EmployeeComp } from '$lib/server/services/payroll/types'

/**
 * AC9 — closes the research gap that nothing between `createPayrollRun` and
 * `earnings.ts:71` (`D(comp.basicMonthlySalary).times(periodShare)`) clamps `periodShare`.
 *
 * Half one documents, in executable form, that `computeEmployeeResult` passes ANY
 * `periodShare` straight through to basic pay — unclamped. That is why the refusal for an
 * over-cap range has to live at `createPayrollRun`, not downstream: nothing here will save you.
 *
 * Half two proves that refusal actually fires, before any write, for the exact range this
 * plan uses as its over-cap example (`1 May → 15 Jun 2026` = 31/31 + 15/30 = 1.5).
 */

const SALARY = 20000

const fixedComp: EmployeeComp = { basicMonthlySalary: SALARY, rateType: 'MONTHLY' }

const cfg = (periodShare: number): EmployeeComputeConfig => ({
	taxableByCode: new Map(),
	periodShare,
	loans: [],
	cashAdvances: []
})

const basicOf = (r: ReturnType<typeof computeEmployeeResult>) =>
	r.earnings.find((c) => c.code === 'BASIC')?.amount ?? 0

describe('AC9 — basic pay share passthrough is unclamped', () => {
	it('a periodShare above 1 (1.5) is not clamped — basic pay is salary × 1.5', () => {
		const r = computeEmployeeResult(fixedComp, emptyAttendance(), {}, cfg(1.5))
		expect(basicOf(r)).toBeCloseTo(SALARY * 1.5, 2)
	})

	it('a fractional periodShare (0.55376…, 20 May → 5 Jun 2026) passes through exactly as given', () => {
		const share = 12 / 31 + 5 / 30 // 0.55376…
		const r = computeEmployeeResult(fixedComp, emptyAttendance(), {}, cfg(share))
		expect(basicOf(r)).toBeCloseTo(SALARY * share, 2)
	})
})

const { dbMock, writeAuditLog } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: { findUnique: vi.fn(), create: vi.fn() },
		$transaction: vi.fn(),
		$executeRaw: vi.fn()
	},
	writeAuditLog: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { createPayrollRun } = await import('$lib/server/services/payroll/index')

const ORG = 'org1'
const ctx = { organizationId: ORG, actorId: 'u1', actorRoles: ['SUPER_ADMIN'] as Role[] }
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.payrollRun.findUnique.mockResolvedValue(null)
	dbMock.payrollRun.create.mockResolvedValue({ id: 'run1' })
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
		typeof fn === 'function' ? fn(dbMock) : []
	)
})

// The WHOLE string, not a substring and not a bare 400. A bare `status: 400` would also pass
// against the deleted same-month rule, which refused this range for an unrelated reason — this
// assertion is what makes the test prove the CAP.
const OVER_CAP_150 =
	'A custom period cannot cover more than one month of pay. This range covers 150% of a month. Shorten it.'

describe('AC9 — createPayrollRun refuses the range that would have produced 1.5', () => {
	it('1 May → 15 Jun 2026 (31/31 + 15/30 = 1.5) is refused by the cap, before any write', async () => {
		await expect(
			createPayrollRun(ORG, d('2026-05-01'), d('2026-06-15'), ctx)
		).rejects.toMatchObject({ status: 400, body: { message: OVER_CAP_150 } })
		expect(dbMock.payrollRun.create).not.toHaveBeenCalled()
	})
})

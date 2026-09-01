import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { utcMidnight } from '$lib/utils/pay-periods'

/**
 * #170 Stage 1.5 — "record is truth, cache healed on access", no scheduler:
 *  - recordCompensationChange now ACCEPTS a future effective date, and a future insert must NOT move
 *    the current cache (its re-derivation is bounded to effectiveDate ≤ today).
 *  - getEmployee heals Employee.{basicMonthlySalary,rateType} from the history on read, so the first
 *    read on/after a future change's effective date corrects the cache. DB/audit/bcrypt are mocked.
 */

const DAY = 24 * 60 * 60 * 1000

const { dbMock, txMock } = vi.hoisted(() => {
	const txMock = {
		employeeCompensation: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
		employee: { update: vi.fn() }
	}
	return {
		txMock,
		dbMock: {
			employee: { findFirst: vi.fn(), update: vi.fn() },
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

const { getEmployee, recordCompensationChange } = await import('$lib/server/services/employees')
const { writeAuditLog } = await import('$lib/server/audit')

const CTX = {
	organizationId: 'org1',
	actorId: 'u1',
	actorRoles: ['HR_ADMIN'] as Role[],
	ipAddress: 't'
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
	dbMock.payrollRun.findFirst.mockResolvedValue(null)
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	txMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
})

describe('getEmployee heal-on-read (#170 Stage 1.5)', () => {
	it('heals a stale cache once a change`s effective date has passed', async () => {
		dbMock.employee.findFirst.mockResolvedValue({
			id: 'emp1',
			basicMonthlySalary: 30000,
			rateType: 'MONTHLY'
		})
		// A raise effective yesterday that the cache never caught up to.
		const yst = new Date(Date.now() - DAY)
		dbMock.employeeCompensation.findMany.mockResolvedValue([
			{ basicMonthlySalary: 50000, rateType: 'MONTHLY', effectiveDate: yst, changedAt: yst }
		])

		const e = await getEmployee('emp1', 'org1') // no opts → raw, healed value

		expect(dbMock.employee.update).toHaveBeenCalledTimes(1)
		const arg = dbMock.employee.update.mock.calls[0][0]
		expect(Number(arg.data.basicMonthlySalary)).toBe(50000)
		expect(arg.data.rateType).toBe('MONTHLY')
		expect(Number(e.basicMonthlySalary)).toBe(50000)
	})

	it('ignores a future-dated change and leaves the cache untouched', async () => {
		dbMock.employee.findFirst.mockResolvedValue({
			id: 'emp1',
			basicMonthlySalary: 30000,
			rateType: 'MONTHLY'
		})
		const past = new Date('2024-01-01')
		const tomorrow = new Date(Date.now() + DAY)
		dbMock.employeeCompensation.findMany.mockResolvedValue([
			{ basicMonthlySalary: 30000, rateType: 'MONTHLY', effectiveDate: past, changedAt: past },
			{
				basicMonthlySalary: 60000,
				rateType: 'MONTHLY',
				effectiveDate: tomorrow,
				changedAt: new Date()
			}
		])

		const e = await getEmployee('emp1', 'org1')

		expect(dbMock.employee.update).not.toHaveBeenCalled() // already current at 30000
		expect(Number(e.basicMonthlySalary)).toBe(30000)
	})
})

describe('recordCompensationChange — future effective date (#170 Stage 1.5)', () => {
	it('accepts a future date, inserts the snapshot there, and does NOT move the cache', async () => {
		dbMock.employee.findFirst.mockResolvedValue({
			id: 'emp1',
			basicMonthlySalary: 30000,
			rateType: 'MONTHLY',
			employmentType: 'REGULAR',
			startDate: new Date('2024-01-01')
		})
		// The cache re-derivation (effectiveDate ≤ today) still resolves to the current 30000 row.
		txMock.employeeCompensation.findFirst.mockResolvedValue({
			basicMonthlySalary: 30000,
			rateType: 'MONTHLY'
		})

		const future = new Date(Date.now() + 30 * DAY)
		await expect(
			recordCompensationChange(
				'emp1',
				'org1',
				{ basicMonthlySalary: 50000, effectiveDate: future },
				CTX
			)
		).resolves.toBeDefined() // no "future date" rejection

		// Snapshot recorded at the future effective date.
		const createArg = txMock.employeeCompensation.create.mock.calls[0][0]
		expect(createArg.data.basicMonthlySalary).toBe(50000)
		expect(createArg.data.effectiveDate.getTime()).toBe(utcMidnight(future).getTime())

		// Cache re-derivation is bounded to today, so the future row can't be selected…
		const deriveArg = txMock.employeeCompensation.findFirst.mock.calls[0][0]
		expect(deriveArg.where.effectiveDate.lte.getTime()).toBe(utcMidnight(new Date()).getTime())
		// …and the cache is synced to the unchanged current figure, not the future 50000.
		const updateArg = txMock.employee.update.mock.calls[0][0]
		expect(Number(updateArg.data.basicMonthlySalary)).toBe(30000)
	})
})


describe('recordCompensationChange — the audit\'s "before" is read inside the transaction (#5)', () => {
	// The pre-transaction read is for validation only. If the audit reuses it, two concurrent changes
	// to the same employee both log the same prior pay — one of them a figure it never replaced.
	it('logs the prior pay from the tx-scoped history, not the one read before the transaction', async () => {
		dbMock.employee.findFirst.mockResolvedValue({
			id: 'emp1',
			basicMonthlySalary: 30000,
			rateType: 'MONTHLY',
			employmentType: 'REGULAR',
			startDate: new Date('2024-01-01')
		})
		// Read before the transaction opens: still shows 30000.
		dbMock.employeeCompensation.findMany.mockResolvedValue([
			{
				basicMonthlySalary: 30000,
				rateType: 'MONTHLY',
				effectiveDate: new Date('2024-01-01'),
				changedAt: new Date('2024-01-01')
			}
		])
		// Inside the transaction: a concurrent raise to 40000 has already committed.
		txMock.employeeCompensation.findMany.mockResolvedValue([
			{
				basicMonthlySalary: 30000,
				rateType: 'MONTHLY',
				effectiveDate: new Date('2024-01-01'),
				changedAt: new Date('2024-01-01')
			},
			{
				basicMonthlySalary: 40000,
				rateType: 'MONTHLY',
				effectiveDate: new Date('2024-06-01'),
				changedAt: new Date('2024-06-01')
			}
		])
		txMock.employeeCompensation.findFirst.mockResolvedValue({
			basicMonthlySalary: 50000,
			rateType: 'MONTHLY'
		})

		await recordCompensationChange(
			'emp1',
			'org1',
			{ basicMonthlySalary: 50000, effectiveDate: new Date() },
			CTX
		)

		const [, payload] = vi.mocked(writeAuditLog).mock.calls[0]
		expect(payload.oldValue).toEqual({ basicMonthlySalary: 40000, rateType: 'MONTHLY' })
		// The history read that fed it ran on the transaction client, never on `db`.
		expect(txMock.employeeCompensation.findMany).toHaveBeenCalled()
	})
})

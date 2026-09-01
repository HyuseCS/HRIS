import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #5 / G2 — positive paths for `employee-earnings.ts`.
 *
 * The service was converted to run its write and its audit row inside one `$transaction` with no
 * test that ever exercised the succeeding path, so nothing observed that `writeAuditLog` receives
 * the transaction client. Code review and a static grep were the only evidence.
 *
 * `tx` here is a SEPARATE object from `dbMock`. That is the whole point: 26 files in this repo
 * mock `$transaction` as `(fn) => fn(dbMock)`, which makes `tx === db` and turns the third-argument
 * assertion into a tautology that passes whichever client the source passes. Written that way this
 * file would prove nothing.
 *
 * Note the split: the guard reads (`employee.findFirst`, `employeeEarning.findFirst`) run BEFORE
 * the transaction opens and so live on `dbMock`; only `create`/`update` live on `tx`.
 */

const { dbMock, tx } = vi.hoisted(() => ({
	tx: { employeeEarning: { create: vi.fn(), update: vi.fn() } },
	dbMock: {
		$transaction: vi.fn(),
		employee: { findFirst: vi.fn() },
		employeeEarning: { findFirst: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
const { writeAuditLog } = await import('$lib/server/audit')

const { createEmployeeEarning, endEmployeeEarning } = await import(
	'$lib/server/services/payroll/employee-earnings'
)
const { SELF_ACTION_DENIED } = await import('$lib/server/services/employee-access')

const ORG = 'org1'
const ACTOR_USER = 'user-actor'
const TARGET = { id: 'emp-target', userId: 'user-target' }

const ctx: AuditContext = { organizationId: ORG, actorId: ACTOR_USER, actorRoles: ['HR_ADMIN'] }

const DATA = { kind: 'ALLOWANCE' as const, label: 'Transport', monthlyAmount: 2000 }

beforeEach(() => {
	vi.clearAllMocks()
	// `requireEmployee` selects id + userId; `assertNotSelf` compares userId to ctx.actorId.
	dbMock.employee.findFirst.mockResolvedValue(TARGET)
	// The pre-read for the end path carries the nested employee `assertNotSelf` is handed.
	dbMock.employeeEarning.findFirst.mockResolvedValue({
		id: 'earn1',
		isActive: true,
		employee: { userId: TARGET.userId }
	})
	// The audit payload dereferences `.id` off the created row.
	tx.employeeEarning.create.mockResolvedValue({ id: 'earn-new' })
	tx.employeeEarning.update.mockResolvedValue({ id: 'earn1', isActive: false })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('createEmployeeEarning', () => {
	it('creates the row on the transaction client and audits on that same client', async () => {
		const earning = await createEmployeeEarning(TARGET.id, ORG, DATA, ctx)

		expect(earning).toEqual({ id: 'earn-new' })
		expect(tx.employeeEarning.create).toHaveBeenCalledWith({
			data: {
				employeeId: TARGET.id,
				kind: DATA.kind,
				label: DATA.label,
				monthlyAmount: DATA.monthlyAmount
			}
		})
		// The claim under test. `tx` is not `dbMock`, so this fails if the source passes `db`.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({
				action: 'CREATE',
				entityType: 'EmployeeEarning',
				entityId: 'earn-new'
			}),
			tx
		)
	})

	it('refuses an actor creating a recurring earning on their own record', async () => {
		dbMock.employee.findFirst.mockResolvedValue({ id: 'self-emp', userId: ACTOR_USER })
		await expect(createEmployeeEarning('self-emp', ORG, DATA, ctx)).rejects.toMatchObject({
			status: 403,
			body: { message: SELF_ACTION_DENIED }
		})
		expect(tx.employeeEarning.create).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('rejects a non-positive amount before opening the transaction', async () => {
		await expect(
			createEmployeeEarning(TARGET.id, ORG, { ...DATA, monthlyAmount: 0 }, ctx)
		).rejects.toMatchObject({ status: 400 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})
})

describe('endEmployeeEarning', () => {
	it('deactivates on the transaction client and audits on that same client', async () => {
		const updated = await endEmployeeEarning('earn1', ORG, ctx)

		expect(updated).toEqual({ id: 'earn1', isActive: false })
		expect(tx.employeeEarning.update).toHaveBeenCalledWith({
			where: { id: 'earn1' },
			data: { isActive: false }
		})
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({
				action: 'UPDATE',
				entityType: 'EmployeeEarning',
				entityId: 'earn1',
				newValue: { isActive: false }
			}),
			tx
		)
	})

	it('refuses an actor ending their own recurring earning', async () => {
		dbMock.employeeEarning.findFirst.mockResolvedValue({
			id: 'earn1',
			isActive: true,
			employee: { userId: ACTOR_USER }
		})
		await expect(endEmployeeEarning('earn1', ORG, ctx)).rejects.toMatchObject({
			status: 403,
			body: { message: SELF_ACTION_DENIED }
		})
		expect(tx.employeeEarning.update).not.toHaveBeenCalled()
	})

	it('refuses to end an already-ended earning, without opening a transaction', async () => {
		dbMock.employeeEarning.findFirst.mockResolvedValue({
			id: 'earn1',
			isActive: false,
			employee: { userId: TARGET.userId }
		})
		await expect(endEmployeeEarning('earn1', ORG, ctx)).rejects.toMatchObject({ status: 409 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('is org-scoped — a row outside the org is a 404', async () => {
		dbMock.employeeEarning.findFirst.mockResolvedValue(null)
		await expect(endEmployeeEarning('earn1', ORG, ctx)).rejects.toMatchObject({ status: 404 })
		expect(dbMock.employeeEarning.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'earn1', employee: { organizationId: ORG } } })
		)
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #5 / G2 — positive paths for `employee-deductions.ts`.
 *
 * Same gap as the earnings twin: the write and its audit row were moved into one `$transaction`
 * with no test that ever reached the succeeding path, so nothing observed that `writeAuditLog`
 * gets the transaction client.
 *
 * `tx` is a SEPARATE object from `dbMock` on purpose. With the `(fn) => fn(dbMock)` shape used by
 * 26 other files in this repo, `tx === db` and the third-argument assertion passes whichever
 * client the source hands over — it would prove nothing.
 *
 * `./money` is left real; it is pure Decimal math and nothing here touches it.
 */

const { dbMock, tx } = vi.hoisted(() => ({
	tx: { employeeDeduction: { create: vi.fn(), update: vi.fn() } },
	dbMock: {
		$transaction: vi.fn(),
		employee: { findFirst: vi.fn() },
		deductionType: { findFirst: vi.fn() },
		employeeDeduction: { findFirst: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
const { writeAuditLog } = await import('$lib/server/audit')

const { createEmployeeDeduction, endEmployeeDeduction } =
	await import('$lib/server/services/payroll/employee-deductions')
const { SELF_ACTION_DENIED } = await import('$lib/server/services/employee-access')

const ORG = 'org1'
const ACTOR_USER = 'user-actor'
const TARGET = { id: 'emp-target', userId: 'user-target' }

const ctx: AuditContext = { organizationId: ORG, actorId: ACTOR_USER, actorRoles: ['HR_ADMIN'] }

const TYPE = { id: 'dt1', code: 'COOP', label: 'Cooperative', isActive: true, isStatutory: false }
const DATA = { deductionTypeId: TYPE.id, label: 'Coop share', monthlyAmount: 500 }

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue(TARGET)
	// Read BEFORE the transaction; three separate 400/404s hang off its fields.
	dbMock.deductionType.findFirst.mockResolvedValue(TYPE)
	dbMock.employeeDeduction.findFirst.mockResolvedValue({
		id: 'ded1',
		isActive: true,
		employee: { userId: TARGET.userId }
	})
	// The audit payload dereferences `.id` off the created row.
	tx.employeeDeduction.create.mockResolvedValue({ id: 'ded-new' })
	tx.employeeDeduction.update.mockResolvedValue({ id: 'ded1', isActive: false })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('createEmployeeDeduction', () => {
	it('creates the row on the transaction client and audits on that same client', async () => {
		const deduction = await createEmployeeDeduction(TARGET.id, ORG, DATA, ctx)

		expect(deduction).toEqual({ id: 'ded-new' })
		expect(tx.employeeDeduction.create).toHaveBeenCalledWith({
			data: {
				employeeId: TARGET.id,
				deductionTypeId: TYPE.id,
				label: 'Coop share',
				monthlyAmount: 500
			}
		})
		// The claim under test. `tx` is not `dbMock`, so this fails if the source passes `db`.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({
				action: 'CREATE',
				entityType: 'EmployeeDeduction',
				entityId: 'ded-new',
				// The code comes off the resolved type, not off the caller's input.
				newValue: { code: TYPE.code, label: 'Coop share', monthlyAmount: 500 }
			}),
			tx
		)
	})

	it('blanks a whitespace-only label to null rather than storing it', async () => {
		await createEmployeeDeduction(TARGET.id, ORG, { ...DATA, label: '   ' }, ctx)
		expect(tx.employeeDeduction.create).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ label: null }) })
		)
	})

	it('refuses a statutory deduction code before opening the transaction', async () => {
		dbMock.deductionType.findFirst.mockResolvedValue({ ...TYPE, isStatutory: true })
		await expect(createEmployeeDeduction(TARGET.id, ORG, DATA, ctx)).rejects.toMatchObject({
			status: 400,
			body: { message: 'Statutory deductions are computed automatically' }
		})
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('is org-scoped on the deduction code — one from another org is a 404', async () => {
		dbMock.deductionType.findFirst.mockResolvedValue(null)
		await expect(createEmployeeDeduction(TARGET.id, ORG, DATA, ctx)).rejects.toMatchObject({
			status: 404
		})
		expect(dbMock.deductionType.findFirst).toHaveBeenCalledWith({
			where: { id: TYPE.id, organizationId: ORG }
		})
	})

	it('refuses an actor creating a recurring deduction on their own record', async () => {
		dbMock.employee.findFirst.mockResolvedValue({ id: 'self-emp', userId: ACTOR_USER })
		await expect(createEmployeeDeduction('self-emp', ORG, DATA, ctx)).rejects.toMatchObject({
			status: 403,
			body: { message: SELF_ACTION_DENIED }
		})
		expect(tx.employeeDeduction.create).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})
})

describe('endEmployeeDeduction', () => {
	it('deactivates on the transaction client and audits on that same client', async () => {
		const updated = await endEmployeeDeduction('ded1', ORG, ctx)

		expect(updated).toEqual({ id: 'ded1', isActive: false })
		expect(tx.employeeDeduction.update).toHaveBeenCalledWith({
			where: { id: 'ded1' },
			data: { isActive: false }
		})
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({
				action: 'UPDATE',
				entityType: 'EmployeeDeduction',
				entityId: 'ded1',
				newValue: { isActive: false }
			}),
			tx
		)
	})

	// Ending one's own deduction cancels one's own repayment — self-dealing, hence the guard.
	it('refuses an actor ending their own recurring deduction', async () => {
		dbMock.employeeDeduction.findFirst.mockResolvedValue({
			id: 'ded1',
			isActive: true,
			employee: { userId: ACTOR_USER }
		})
		await expect(endEmployeeDeduction('ded1', ORG, ctx)).rejects.toMatchObject({
			status: 403,
			body: { message: SELF_ACTION_DENIED }
		})
		expect(tx.employeeDeduction.update).not.toHaveBeenCalled()
	})

	it('refuses to end an already-ended deduction, without opening a transaction', async () => {
		dbMock.employeeDeduction.findFirst.mockResolvedValue({
			id: 'ded1',
			isActive: false,
			employee: { userId: TARGET.userId }
		})
		await expect(endEmployeeDeduction('ded1', ORG, ctx)).rejects.toMatchObject({ status: 409 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('is org-scoped — a row outside the org is a 404', async () => {
		dbMock.employeeDeduction.findFirst.mockResolvedValue(null)
		await expect(endEmployeeDeduction('ded1', ORG, ctx)).rejects.toMatchObject({ status: 404 })
		expect(dbMock.employeeDeduction.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'ded1', employee: { organizationId: ORG } } })
		)
	})
})

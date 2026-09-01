import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #305 — the create/read half of separation.ts: createSeparation's three guards, its
 * clearance seeding and audit write, plus the org scoping on listSeparations and
 * getSeparation. T8 is the #306 regression fence: the clearance items are ordered by
 * `area`, the enum that replaced the old free-text `department` column.
 */

const { dbMock, tx } = vi.hoisted(() => {
	const tx = { separationRecord: { create: vi.fn() } }
	return {
		tx,
		dbMock: {
			employee: { findFirst: vi.fn() },
			separationRecord: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
			$transaction: vi.fn()
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/notifications', () => ({
	sendOffboardingNoticeEmail: vi.fn(),
	sendRequestStatusEmail: vi.fn()
}))
vi.mock('$lib/server/services/offboarding', () => ({ clearanceTemplateForOrg: vi.fn() }))

const { createSeparation, listSeparations, getSeparation } =
	await import('$lib/server/services/separation')
const { writeAuditLog } = await import('$lib/server/audit')
const { clearanceTemplateForOrg } = await import('$lib/server/services/offboarding')

const ctx: AuditContext = {
	organizationId: 'org1',
	actorId: 'user-hr',
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
}

const input = {
	employeeId: 'emp1',
	type: 'RESIGNATION' as const,
	effectiveDate: new Date('2026-09-30T00:00:00Z'),
	reason: 'Better offer'
}

// Shaped exactly like clearanceTemplateForOrg's return: label + the #306 enum + the
// optional plain departmentId column.
const TEMPLATE = [
	{ label: 'Return company equipment', area: 'IT' as const, departmentId: null },
	{ label: 'Settle outstanding loans', area: 'FINANCE' as const, departmentId: 'dept-fin' }
]

const activeEmployee = {
	id: 'emp1',
	employmentStatus: 'ACTIVE',
	firstName: 'Robin',
	lastName: 'Santos',
	user: { email: 'robin@veent.ph' }
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue(activeEmployee)
	dbMock.separationRecord.findFirst.mockResolvedValue(null)
	dbMock.separationRecord.findMany.mockResolvedValue([])
	tx.separationRecord.create.mockResolvedValue({ id: 'sep-new' })
	dbMock.$transaction.mockImplementation((fn: (c: typeof tx) => unknown) => fn(tx))
	vi.mocked(clearanceTemplateForOrg).mockResolvedValue(TEMPLATE)
})

describe('createSeparation — guards (#305)', () => {
	it('rejects an unknown employee', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)

		await expect(createSeparation('org1', input, ctx)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Employee not found' }
		})
		expect(tx.separationRecord.create).not.toHaveBeenCalled()
	})

	it('refuses an already-offboarded employee', async () => {
		dbMock.employee.findFirst.mockResolvedValue({
			...activeEmployee,
			employmentStatus: 'OFFBOARDED'
		})

		await expect(createSeparation('org1', input, ctx)).rejects.toMatchObject({
			status: 409,
			body: { message: 'Employee is already offboarded' }
		})
		expect(tx.separationRecord.create).not.toHaveBeenCalled()
	})

	it('refuses a second open case', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue({ id: 'sep-open' })

		await expect(createSeparation('org1', input, ctx)).rejects.toMatchObject({
			status: 409,
			body: { message: 'An open separation case already exists for this employee' }
		})
		// The existing-case lookup must ignore FINALIZED cases, or a closed separation
		// would permanently bar the employee from a second one.
		expect(dbMock.separationRecord.findFirst.mock.calls[0][0]).toMatchObject({
			where: { employeeId: 'emp1', status: { not: 'FINALIZED' } }
		})
		expect(tx.separationRecord.create).not.toHaveBeenCalled()
	})
})

describe('createSeparation — seeding and audit (#305)', () => {
	it('seeds clearance items from the org template', async () => {
		await createSeparation('org1', input, ctx)

		expect(clearanceTemplateForOrg).toHaveBeenCalledWith('org1')
		expect(tx.separationRecord.create.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				data: expect.objectContaining({
					organizationId: 'org1',
					employeeId: 'emp1',
					// Each template row reaches the nested create carrying its `area` (#306).
					clearanceItems: {
						create: [
							{ label: 'Return company equipment', area: 'IT', departmentId: null },
							{ label: 'Settle outstanding loans', area: 'FINANCE', departmentId: 'dept-fin' }
						]
					}
				})
			})
		)
	})

	it('writes an audit log for the new case', async () => {
		await createSeparation('org1', input, ctx)

		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({
				action: 'CREATE',
				entityType: 'SeparationRecord',
				entityId: 'sep-new'
			}),
			// AVIPA #5: the audit write shares the create's transaction.
			tx
		)
	})
})

describe('listSeparations / getSeparation — org scoping (#305)', () => {
	it("lists only the caller's org", async () => {
		await listSeparations('org1')

		expect(dbMock.separationRecord.findMany.mock.calls[0][0]).toEqual(
			expect.objectContaining({ where: { organizationId: 'org1' } })
		)
	})

	it("hides another org's case", async () => {
		// The row exists, but not in org2 — so the org-filtered findFirst misses.
		dbMock.separationRecord.findFirst.mockResolvedValue(null)

		await expect(getSeparation('sep1', 'org2')).rejects.toMatchObject({
			status: 404,
			body: { message: 'Separation record not found' }
		})
		expect(dbMock.separationRecord.findFirst.mock.calls[0][0]).toMatchObject({
			where: { id: 'sep1', organizationId: 'org2' }
		})
	})

	it('orders clearance items by area', async () => {
		// #306 regression fence: this was `{ department: 'asc' }` before the enum landed.
		dbMock.separationRecord.findFirst.mockResolvedValue({ id: 'sep1', clearanceItems: [] })

		await getSeparation('sep1', 'org1')

		expect(dbMock.separationRecord.findFirst.mock.calls[0][0]).toMatchObject({
			include: { clearanceItems: { orderBy: { area: 'asc' } } }
		})
	})
})

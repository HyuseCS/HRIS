import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #306 — the two rules guarding `OffboardingChecklistItem.departmentId`.
 *
 * Both live in one private helper (`resolveDepartmentId`) precisely so `addItem` and `updateItem`
 * cannot drift apart, so each rule is asserted through BOTH write paths rather than once.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		department: { findFirst: vi.fn() },
		offboardingChecklistItem: {
			aggregate: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			findFirst: vi.fn()
		},
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn() }))

const { addItem, updateItem } = await import('$lib/server/services/offboarding')

const CTX = {
	organizationId: 'org1',
	actorId: 'user-a',
	actorRoles: ['HR_ADMIN'] as Role[],
	ipAddress: '::1'
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
	dbMock.offboardingChecklistItem.aggregate.mockResolvedValue({ _max: { order: 2 } })
	dbMock.offboardingChecklistItem.create.mockResolvedValue({ id: 'item-new' })
	dbMock.offboardingChecklistItem.update.mockResolvedValue({ id: 'item-1' })
	dbMock.offboardingChecklistItem.findFirst.mockResolvedValue({ id: 'item-1' })
	dbMock.department.findFirst.mockResolvedValue({ id: 'dept-own' })
})

describe('departmentId is scoped to the caller org (#306)', () => {
	it('refuses a department id belonging to another org, on add', async () => {
		// The org filter is what makes this a 404-shaped miss rather than a successful write.
		dbMock.department.findFirst.mockResolvedValue(null)

		await expect(
			addItem('org1', { label: 'Hand over keys', area: 'ADMIN', departmentId: 'dept-other' }, CTX)
		).rejects.toMatchObject({ status: 400, body: { message: 'Unknown department' } })

		expect(dbMock.department.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'dept-other', organizationId: 'org1' } })
		)
		expect(dbMock.offboardingChecklistItem.create).not.toHaveBeenCalled()
	})

	it('refuses a department id belonging to another org, on update', async () => {
		dbMock.department.findFirst.mockResolvedValue(null)

		await expect(
			updateItem(
				'org1',
				'item-1',
				{ label: 'Hand over keys', area: 'ADMIN', departmentId: 'dept-other' },
				CTX
			)
		).rejects.toMatchObject({ status: 400, body: { message: 'Unknown department' } })

		expect(dbMock.offboardingChecklistItem.update).not.toHaveBeenCalled()
	})

	it('stores a department the caller does own', async () => {
		// Negative control: without this, the two tests above would also pass if the helper
		// refused every department id.
		await addItem('org1', { label: 'Hand over keys', area: 'ADMIN', departmentId: 'dept-own' }, CTX)

		expect(dbMock.offboardingChecklistItem.create).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ departmentId: 'dept-own' }) })
		)
	})
})

describe('IMMEDIATE_SUPERVISOR never carries a department (#306 D2)', () => {
	it('drops a submitted department id on add', async () => {
		await addItem(
			'org1',
			{ label: 'Handover complete', area: 'IMMEDIATE_SUPERVISOR', departmentId: 'dept-own' },
			CTX
		)

		expect(dbMock.offboardingChecklistItem.create).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ departmentId: null }) })
		)
		// It is dropped before the lookup, not after — a relationship is never a department, so
		// there is nothing to validate.
		expect(dbMock.department.findFirst).not.toHaveBeenCalled()
	})

	it('drops a submitted department id on update', async () => {
		await updateItem(
			'org1',
			'item-1',
			{ label: 'Handover complete', area: 'IMMEDIATE_SUPERVISOR', departmentId: 'dept-own' },
			CTX
		)

		expect(dbMock.offboardingChecklistItem.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ departmentId: null }) })
		)
		expect(dbMock.department.findFirst).not.toHaveBeenCalled()
	})
})

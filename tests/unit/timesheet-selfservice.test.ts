import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { periodOf } from '../../src/lib/utils/pay-periods'

/**
 * #58 employee self-service authorization. DB + audit are mocked so these stay in the fast unit
 * suite; assertions are on whether the mutation was allowed to reach the DB.
 *
 * Rules under test:
 * - deleteTimesheet: owner may delete their own DRAFT/REJECTED; not SUBMITTED/APPROVED; a non-owner
 *   without a management role is rejected; managers/HR keep their scope.
 * - updateTimesheetEntries (the sync path): owner may replace entries only on their own DRAFT.
 * - attendanceEntriesForRange maps AttendanceDay rows to timesheet entries.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		timesheet: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
			findUnique: vi.fn(),
			// #324: updateTimesheetEntries re-reads its before-image inside the transaction rather
			// than carrying one down from the guard read above it.
			findUniqueOrThrow: vi.fn(),
			create: vi.fn(),
			delete: vi.fn(),
			update: vi.fn()
		},
		timesheetEntry: { deleteMany: vi.fn() },
		employee: { findUnique: vi.fn() },
		attendanceDay: { findMany: vi.fn() },
		$transaction: vi.fn(),
		// #163: createTimesheet takes an advisory lock as the first statement of its transaction.
		$executeRaw: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { deleteTimesheet, updateTimesheetEntries, createTimesheet } =
	await import('$lib/server/services/timesheets')
const { attendanceEntriesForRange } = await import('$lib/server/services/attendance')

const ORG = 'org1'
// The timesheet's owner employee; reportsTo the manager employee 'mgr-emp'.
const makeTs = (over: Record<string, unknown> = {}) => ({
	id: 'ts1',
	status: 'DRAFT',
	employeeId: 'emp-owner',
	periodStart: new Date('2026-07-13'),
	periodEnd: new Date('2026-07-19'),
	employee: { id: 'emp-owner', firstName: 'A', lastName: 'B', reportsToId: 'mgr-emp' },
	entries: [],
	...over
})
const ctx = (actorRole: Role, actorId = 'user1') => ({
	organizationId: ORG,
	actorId,
	actorRoles: [actorRole],
	ipAddress: 'test'
})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock))
	dbMock.timesheet.findUniqueOrThrow.mockResolvedValue({
		totalHours: 8,
		_count: { entries: 1 }
	})
	dbMock.timesheet.update.mockResolvedValue({ entries: [] })
	dbMock.timesheet.delete.mockResolvedValue({})
	dbMock.timesheetEntry.deleteMany.mockResolvedValue({})
})

describe('deleteTimesheet — owner vs manager authorization', () => {
	it('lets the owner delete their own DRAFT', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs())
		dbMock.employee.findUnique.mockResolvedValue({ id: 'emp-owner' }) // actor is the owner
		await deleteTimesheet('ts1', ORG, ctx('EMPLOYEE'))
		expect(dbMock.timesheet.delete).toHaveBeenCalledTimes(1)
	})

	it('lets the owner delete their own REJECTED', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs({ status: 'REJECTED' }))
		dbMock.employee.findUnique.mockResolvedValue({ id: 'emp-owner' })
		await deleteTimesheet('ts1', ORG, ctx('EMPLOYEE'))
		expect(dbMock.timesheet.delete).toHaveBeenCalledTimes(1)
	})

	it('blocks the owner from deleting a SUBMITTED timesheet', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs({ status: 'SUBMITTED' }))
		dbMock.employee.findUnique.mockResolvedValue({ id: 'emp-owner' })
		await expect(deleteTimesheet('ts1', ORG, ctx('EMPLOYEE'))).rejects.toMatchObject({
			status: 400
		})
		expect(dbMock.timesheet.delete).not.toHaveBeenCalled()
	})

	it('blocks the owner from deleting an APPROVED timesheet', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs({ status: 'APPROVED' }))
		dbMock.employee.findUnique.mockResolvedValue({ id: 'emp-owner' })
		await expect(deleteTimesheet('ts1', ORG, ctx('EMPLOYEE'))).rejects.toMatchObject({
			status: 400
		})
		expect(dbMock.timesheet.delete).not.toHaveBeenCalled()
	})

	it("blocks a non-owner employee from deleting someone else's timesheet", async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs())
		dbMock.employee.findUnique.mockResolvedValue({ id: 'emp-other' }) // not the owner
		await expect(deleteTimesheet('ts1', ORG, ctx('EMPLOYEE'))).rejects.toMatchObject({
			status: 403
		})
		expect(dbMock.timesheet.delete).not.toHaveBeenCalled()
	})

	it('lets a manager delete a direct report’s timesheet (any status)', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs({ status: 'SUBMITTED' }))
		dbMock.employee.findUnique.mockResolvedValue({ id: 'mgr-emp' }) // actor manages the owner
		await deleteTimesheet('ts1', ORG, ctx('MANAGER'))
		expect(dbMock.timesheet.delete).toHaveBeenCalledTimes(1)
	})

	// MANAGER is the branch title for on-branch HR (JoJo/Sweetleaf) and carries HR_ADMIN's
	// authority, so it is no longer narrowed to direct reports. Both cases below used to 403.
	it('lets a manager act on an employee who is not their direct report', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs({ status: 'SUBMITTED' }))
		dbMock.employee.findUnique.mockResolvedValue({ id: 'someone-else' })
		await deleteTimesheet('ts1', ORG, ctx('MANAGER'))
		expect(dbMock.timesheet.delete).toHaveBeenCalledTimes(1)
	})

	it('lets a manager act on an employee with no reporting line at all', async () => {
		// The common shape in practice — most employees have reportsToId unset, which made the
		// old `reportsToId !== actor.id` check reject every manager for them.
		dbMock.timesheet.findFirst.mockResolvedValue(
			makeTs({ employee: { id: 'emp-owner', firstName: 'A', lastName: 'B', reportsToId: null } })
		)
		dbMock.employee.findUnique.mockResolvedValue({ id: 'mgr-emp' })
		await deleteTimesheet('ts1', ORG, ctx('MANAGER'))
		expect(dbMock.timesheet.delete).toHaveBeenCalledTimes(1)
	})

	it('still rejects a non-management role acting on someone else’s timesheet', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs())
		dbMock.employee.findUnique.mockResolvedValue({ id: 'emp-other' })
		await expect(deleteTimesheet('ts1', ORG, ctx('FINANCE'))).rejects.toMatchObject({ status: 403 })
		expect(dbMock.timesheet.delete).not.toHaveBeenCalled()
	})
})

describe('updateTimesheetEntries — owner sync path', () => {
	it('lets the owner replace entries on their own DRAFT', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs())
		dbMock.employee.findUnique.mockResolvedValue({ id: 'emp-owner' })
		await updateTimesheetEntries('ts1', ORG, [], ctx('EMPLOYEE'))
		expect(dbMock.$transaction).toHaveBeenCalledTimes(1)
		// #324: the before-image is read inside that transaction, not from the guard read above it.
		expect(dbMock.timesheet.findUniqueOrThrow).toHaveBeenCalledWith({
			where: { id: 'ts1' },
			select: { totalHours: true, _count: { select: { entries: true } } }
		})
	})

	it('blocks the owner from editing a SUBMITTED timesheet', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs({ status: 'SUBMITTED' }))
		dbMock.employee.findUnique.mockResolvedValue({ id: 'emp-owner' })
		await expect(updateTimesheetEntries('ts1', ORG, [], ctx('EMPLOYEE'))).rejects.toMatchObject({
			status: 400
		})
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('blocks a non-owner employee from editing entries', async () => {
		dbMock.timesheet.findFirst.mockResolvedValue(makeTs())
		dbMock.employee.findUnique.mockResolvedValue({ id: 'emp-other' })
		await expect(updateTimesheetEntries('ts1', ORG, [], ctx('EMPLOYEE'))).rejects.toMatchObject({
			status: 403
		})
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})
})

// #163 replaced the standard-shape gate (#129) with a same-month sanity gate: a mid-month week
// is now a legal custom period, and only a cross-month or reversed range is refused.
describe('createTimesheet — same-month period gate (#163)', () => {
	const may = periodOf('FIRST_HALF', 2026, 4) // 2026-05-01 … 2026-05-15

	it('rejects a cross-month period before touching the DB', async () => {
		await expect(
			createTimesheet(
				'emp-owner',
				new Date('2026-05-13'),
				new Date('2026-06-02'),
				[],
				ctx('HR_ADMIN')
			)
		).rejects.toMatchObject({ status: 400 })
		expect(dbMock.timesheet.findMany).not.toHaveBeenCalled()
		expect(dbMock.timesheet.findUnique).not.toHaveBeenCalled()
		expect(dbMock.timesheet.create).not.toHaveBeenCalled()
	})

	it('rejects a reversed period before touching the DB', async () => {
		await expect(
			createTimesheet(
				'emp-owner',
				new Date('2026-05-21'),
				new Date('2026-05-13'),
				[],
				ctx('HR_ADMIN')
			)
		).rejects.toMatchObject({ status: 400 })
		expect(dbMock.timesheet.findMany).not.toHaveBeenCalled()
		expect(dbMock.timesheet.findUnique).not.toHaveBeenCalled()
		expect(dbMock.timesheet.create).not.toHaveBeenCalled()
	})

	it('creates a timesheet for a standard period', async () => {
		dbMock.timesheet.findMany.mockResolvedValue([])
		dbMock.timesheet.findUnique.mockResolvedValue(null)
		dbMock.timesheet.create.mockResolvedValue({ id: 'ts-new', entries: [] })
		await createTimesheet('emp-owner', may.periodStart, may.periodEnd, [], ctx('HR_ADMIN'))
		expect(dbMock.timesheet.create).toHaveBeenCalledTimes(1)
	})

	it('creates a timesheet for a custom same-month range', async () => {
		dbMock.timesheet.findMany.mockResolvedValue([])
		dbMock.timesheet.findUnique.mockResolvedValue(null)
		dbMock.timesheet.create.mockResolvedValue({ id: 'ts-custom', entries: [] })
		await createTimesheet(
			'emp-owner',
			new Date('2026-05-13'),
			new Date('2026-05-21'),
			[],
			ctx('HR_ADMIN')
		)
		expect(dbMock.timesheet.create).toHaveBeenCalledTimes(1)
	})
})

describe('attendanceEntriesForRange — mapping', () => {
	it('maps each AttendanceDay to an entry (hoursWorked = reg + ot)', async () => {
		dbMock.attendanceDay.findMany.mockResolvedValue([
			{
				date: new Date('2026-07-13'),
				timeIn: new Date('2026-07-13T01:00:00Z'),
				timeOut: new Date('2026-07-13T11:00:00Z'),
				regularHours: 8,
				overtimeHours: 1,
				note: null,
				status: 'PRESENT'
			}
		])
		const entries = await attendanceEntriesForRange(
			'emp-owner',
			new Date('2026-07-13'),
			new Date('2026-07-13')
		)
		expect(entries).toEqual([
			{
				date: new Date('2026-07-13'),
				timeIn: new Date('2026-07-13T01:00:00Z'),
				timeOut: new Date('2026-07-13T11:00:00Z'),
				hoursWorked: 9,
				otHours: 1,
				notes: 'PRESENT'
			}
		])
	})

	it('returns [] when the range has no attendance', async () => {
		dbMock.attendanceDay.findMany.mockResolvedValue([])
		expect(
			await attendanceEntriesForRange('emp-owner', new Date('2026-07-13'), new Date('2026-07-19'))
		).toEqual([])
	})
})

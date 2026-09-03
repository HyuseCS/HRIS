import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #3 research gap 6 — `createTimesheetFromAttendance` has NO period gate of its own. It calls
 * `createTimesheet` and inherits whatever that service refuses, which means the size cap reached
 * the attendance "Save as timesheet" button silently when C5 landed. Nothing proved that, so a
 * refactor giving this path its own write would drop the cap and nobody would notice.
 *
 * Adding a gate here would be a second truth that can drift. The proof is a test instead: an
 * over-cap range is refused with the exact cap copy from `customRangeError`, and nothing in
 * `attendance/index.ts` mentions a cap — so the refusal can only have come from `createTimesheet`.
 *
 * Mock discipline: `employee.findFirst` and `attendanceDay.findMany` both apply their real `where`
 * over an in-memory row set. A blanket `mockResolvedValue` would make this file unable to fail on
 * a wrong org scope or a wrong date window.
 */

const EMP = 'emp1'
const ORG = 'org1'

const { dbMock, writeAuditLog, rows } = vi.hoisted(() => {
	const rows: { current: { employeeId: string; date: Date }[] } = { current: [] }
	return {
		rows,
		dbMock: {
			employee: {
				// An ABSENT key is no filter, exactly as Prisma reads it — so dropping the org scope
				// from the query makes this return the row, and the wrong-org case below goes red.
				// A mock that treated a missing `organizationId` as a mismatch would hide that.
				findFirst: vi.fn(async ({ where }: { where: { id?: string; organizationId?: string } }) =>
					(where.id === undefined || where.id === 'emp1') &&
					(where.organizationId === undefined || where.organizationId === 'org1')
						? { id: 'emp1' }
						: null
				)
			},
			attendanceDay: {
				findMany: vi.fn(
					async ({ where }: { where: { employeeId: string; date: { gte: Date; lte: Date } } }) =>
						rows.current
							.filter(
								(r) =>
									r.employeeId === where.employeeId &&
									r.date >= where.date.gte &&
									r.date <= where.date.lte
							)
							.map((r) => ({
								date: r.date,
								timeIn: null,
								timeOut: null,
								regularHours: 8,
								overtimeHours: 0,
								note: null,
								status: 'PRESENT'
							}))
				)
			},
			timesheet: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
			$transaction: vi.fn(),
			$executeRaw: vi.fn()
		},
		writeAuditLog: vi.fn().mockResolvedValue(undefined)
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { createTimesheetFromAttendance } = await import('$lib/server/services/attendance')

const ctx = { organizationId: ORG, actorId: 'u1', actorRoles: ['HR_ADMIN'] as Role[] }
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** One attendance day per date given, for `emp1`. */
const seed = (...isos: string[]) => {
	rows.current = isos.map((iso) => ({ employeeId: EMP, date: d(iso) }))
}

const OVER_CAP_110 =
	'A custom period cannot cover more than one month of pay. This range covers 110% of a month. Shorten it.'

const save = (from: string, to: string) =>
	createTimesheetFromAttendance(EMP, ORG, d(from), d(to), ctx)

beforeEach(() => {
	vi.clearAllMocks()
	rows.current = []
	dbMock.timesheet.findMany.mockResolvedValue([])
	dbMock.timesheet.findUnique.mockResolvedValue(null)
	dbMock.timesheet.create.mockResolvedValue({ id: 'ts1', entries: [] })
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
		typeof fn === 'function' ? fn(dbMock) : []
	)
})

describe('createTimesheetFromAttendance inherits the size cap (#3, AC3)', () => {
	it('saves a cross-month range under the cap, on the Manila day bounds', async () => {
		seed('2026-12-26', '2027-01-05', '2027-01-10')
		await save('2026-12-26', '2027-01-10')
		expect(dbMock.timesheet.create).toHaveBeenCalledTimes(1)
		const arg = dbMock.timesheet.create.mock.calls[0][0]
		expect(arg.data.periodStart).toEqual(d('2026-12-26'))
		expect(arg.data.periodEnd).toEqual(d('2027-01-10'))
	})

	it('refuses an over-cap range with the exact cap copy, and writes nothing', async () => {
		// 1 Feb → 3 Mar 2026 is 28/28 + 3/31 = 1.0968. Attendance EXISTS in the range, so the empty
		// -range 400 cannot be what refuses it — the only other refusal on this path is the cap
		// inside `createTimesheet`.
		seed('2026-02-10', '2026-03-02')
		await expect(save('2026-02-01', '2026-03-03')).rejects.toMatchObject({
			status: 400,
			body: { message: OVER_CAP_110 }
		})
		expect(dbMock.attendanceDay.findMany).toHaveBeenCalled()
		expect(dbMock.timesheet.create).not.toHaveBeenCalled()
	})

	it('still refuses an empty range first, before the period gate', async () => {
		// No rows seeded, and the range is over the cap. The empty-range message must win, proving
		// the inherited gate did not move ahead of it.
		await expect(save('2026-02-01', '2026-03-03')).rejects.toMatchObject({
			status: 400,
			body: { message: 'No attendance in this range to save as a timesheet.' }
		})
		expect(dbMock.timesheet.create).not.toHaveBeenCalled()
	})

	it('404s for an employee outside the caller organisation, before reading attendance', async () => {
		seed('2026-05-20')
		await expect(
			createTimesheetFromAttendance(EMP, 'other-org', d('2026-05-20'), d('2026-06-05'), ctx)
		).rejects.toMatchObject({ status: 404 })
		expect(dbMock.attendanceDay.findMany).not.toHaveBeenCalled()
		expect(dbMock.timesheet.create).not.toHaveBeenCalled()
	})
})

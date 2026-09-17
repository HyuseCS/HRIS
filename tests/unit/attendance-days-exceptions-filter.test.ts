import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		attendanceDay: { count: vi.fn(), findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn() }))

const { countAttendanceDays, listAttendanceDays } = await import('$lib/server/services/attendance')

const FROM = new Date('2026-07-01')
const TO = new Date('2026-07-15')
const EXCEPTIONS = { in: ['ABSENT', 'INCOMPLETE', 'LATE'] }

describe('attendance days exceptions filter', () => {
	beforeEach(() => {
		dbMock.attendanceDay.count.mockReset().mockResolvedValue(0)
		dbMock.attendanceDay.findMany.mockReset().mockResolvedValue([])
	})

	it('filters count and list by exception status when exceptionsOnly is true', async () => {
		await countAttendanceDays('emp1', FROM, TO, true)
		await listAttendanceDays('emp1', FROM, TO, 'desc', {
			skip: 0,
			take: 10,
			exceptionsOnly: true
		})

		expect(dbMock.attendanceDay.count.mock.calls[0][0].where).toEqual({
			employeeId: 'emp1',
			date: { gte: FROM, lte: TO },
			status: EXCEPTIONS
		})
		expect(dbMock.attendanceDay.findMany.mock.calls[0][0].where).toEqual({
			employeeId: 'emp1',
			date: { gte: FROM, lte: TO },
			status: EXCEPTIONS
		})
	})

	it('does not filter by status when exceptionsOnly is false or omitted', async () => {
		await countAttendanceDays('emp1', FROM, TO, false)
		await countAttendanceDays('emp1', FROM, TO)
		await listAttendanceDays('emp1', FROM, TO, 'desc', { skip: 0, take: 10 })
		await listAttendanceDays('emp1', FROM, TO)

		const unfiltered = { employeeId: 'emp1', date: { gte: FROM, lte: TO } }
		for (const [args] of dbMock.attendanceDay.count.mock.calls) {
			expect(args.where).toEqual(unfiltered)
		}
		for (const [args] of dbMock.attendanceDay.findMany.mock.calls) {
			expect(args.where).toEqual(unfiltered)
		}
		expect(dbMock.attendanceDay.count).toHaveBeenCalledTimes(2)
		expect(dbMock.attendanceDay.findMany).toHaveBeenCalledTimes(2)
	})
})

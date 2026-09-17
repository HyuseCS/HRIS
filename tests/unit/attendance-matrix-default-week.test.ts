import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Role } from '@prisma/client'

const { dbMock, autoDeriveFromPunches } = vi.hoisted(() => ({
	autoDeriveFromPunches: vi.fn(),
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
		attendanceDay: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/supervisors', () => ({ listReportIdsFor: vi.fn() }))
vi.mock('$lib/server/services/attendance', () => ({
	countAttendanceDays: vi.fn(),
	listAttendanceDays: vi.fn(),
	listTeamDay: vi.fn(),
	countTeamDay: vi.fn(),
	deriveRange: vi.fn(),
	autoDeriveFromPunches,
	correctDay: vi.fn(),
	lockRange: vi.fn(),
	unlockRange: vi.fn(),
	resetDayToDerived: vi.fn(),
	createTimesheetFromAttendance: vi.fn()
}))
vi.mock('$lib/server/services/attendance/import', () => ({
	importBacklogCsv: vi.fn(),
	MAX_IMPORT_BYTES: 1,
	MAX_IMPORT_ROWS: 1
}))

const { load } = await import('../../src/routes/(app)/attendance/+page.server')

const event = (roles: Role[], query = '') =>
	({
		locals: { user: { id: 'user-1', roles, organizationId: 'org-1' } },
		url: new URL(`http://localhost/attendance${query}`),
		getClientAddress: () => '127.0.0.1'
	}) as never

type Matrix = { startDate: string; endDate: string; dates: string[] }

beforeEach(() => {
	vi.clearAllMocks()
	vi.useFakeTimers()
	autoDeriveFromPunches.mockResolvedValue(undefined)
	dbMock.attendanceDay.findMany.mockResolvedValue([])
	dbMock.employee.findMany.mockResolvedValue([])
	dbMock.employee.count.mockResolvedValue(0)
	dbMock.employee.findFirst.mockResolvedValue(null)
})

afterEach(() => {
	vi.useRealTimers()
})

describe('/attendance matrix default week', () => {
	const cases = [
		['Thursday midday PHT', '2026-09-17T04:00:00Z'],
		['Monday 00:30 PHT', '2026-09-13T16:30:00Z'],
		['Monday 07:59 PHT', '2026-09-13T23:59:00Z'],
		['Sunday 23:30 PHT', '2026-09-20T15:30:00Z']
	] as const

	it.each(cases)('is the Manila Monday..Sunday week at %s', async (_label, iso) => {
		vi.setSystemTime(new Date(iso))
		const { matrix } = (await load(event(['HR_ADMIN']))) as unknown as { matrix: Matrix }
		expect(matrix.startDate).toBe('2026-09-14')
		expect(matrix.endDate).toBe('2026-09-20')
		expect(matrix.dates).toEqual([
			'2026-09-14',
			'2026-09-15',
			'2026-09-16',
			'2026-09-17',
			'2026-09-18',
			'2026-09-19',
			'2026-09-20'
		])
		const range = autoDeriveFromPunches.mock.calls[0][1]
		expect(range.from.toISOString()).toBe('2026-09-14T00:00:00.000Z')
		expect(range.to.toISOString()).toBe('2026-09-20T00:00:00.000Z')
	})

	it('keeps explicit start and end params', async () => {
		vi.setSystemTime(new Date('2026-09-17T04:00:00Z'))
		const { matrix } = (await load(
			event(['HR_ADMIN'], '?start=2026-09-01&end=2026-09-03')
		)) as unknown as { matrix: Matrix }
		expect(matrix.startDate).toBe('2026-09-01')
		expect(matrix.endDate).toBe('2026-09-03')
		expect(matrix.dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
	})
})

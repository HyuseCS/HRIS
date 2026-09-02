import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #162 — the attendance CSV export gains four columns for food-service tenants only (contract
 * instruction E2; risk R4 had no automated gate at all).
 *
 * The trap this pins: `exportToCSV` takes its header list from `rows[0]` ONLY
 * (`reports.ts` — `const headers = Object.keys(rows[0])`). A key spread onto some rows and not
 * others silently drops columns for every later row, or shifts them, depending on which row is
 * first. So the fixtures below deliberately put a day-less row FIRST and a day-less row LAST.
 */

const { dbMock, listTeamDay, listAttendanceDays } = vi.hoisted(() => ({
	listTeamDay: vi.fn(),
	listAttendanceDays: vi.fn(),
	dbMock: { employee: { findFirst: vi.fn() } }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/attendance', () => ({ listTeamDay, listAttendanceDays }))

const { GET } = await import('../../src/routes/(app)/attendance/export/+server')

const JOJO = 'org_jojo' // food-service
const VEENT = 'org_veent' // not food-service
const D = (iso: string) => new Date(iso)

const dayRow = {
	status: 'PRESENT',
	timeIn: D('2026-07-13T00:00:00Z'), // PHT 08:00
	timeOut: D('2026-07-13T09:00:00Z'), // PHT 17:00
	amTimeIn: D('2026-07-13T00:00:00Z'),
	amTimeOut: D('2026-07-13T03:00:00Z'), // PHT 11:00
	pmTimeIn: D('2026-07-13T05:00:00Z'), // PHT 13:00
	pmTimeOut: D('2026-07-13T09:00:00Z'),
	regularHours: 8,
	overtimeHours: 0,
	nightDiffHours: 0,
	lateMinutes: 0,
	undertimeMinutes: 0,
	isLocked: false,
	date: D('2026-07-13')
}

const event = (org: string, params: Record<string, string>, roles: Role[] = ['HR_ADMIN']) =>
	({
		locals: { user: { id: 'user1', organizationId: org, roles } },
		url: { searchParams: new URLSearchParams(params) }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

const lines = async (res: Response) => (await res.text()).split('\r\n')

beforeEach(() => {
	vi.clearAllMocks()
	// A day-less row first AND last, so a non-uniform key set cannot hide.
	listTeamDay.mockResolvedValue([
		{ id: 'e0', name: 'No Record', employeeNumber: 'JJ-0000', departmentName: null, day: null },
		{
			id: 'e1',
			name: 'Split Shift',
			employeeNumber: 'JJ-0001',
			departmentName: 'Kitchen',
			day: dayRow
		},
		{ id: 'e2', name: 'Also None', employeeNumber: 'JJ-0002', departmentName: null, day: null }
	])
	listAttendanceDays.mockResolvedValue([
		dayRow,
		{ ...dayRow, amTimeIn: null, amTimeOut: null, pmTimeIn: null, pmTimeOut: null }
	])
	// Every request here is HR_ADMIN, so `canManage` is always true and the route's self-lookup
	// branch (line ~83) is never reached — only the target lookup below fires. No `where`-shape
	// collision to guard against in this file; the mock stays a plain `mockResolvedValue`.
	dbMock.employee.findFirst.mockResolvedValue({ employeeNumber: 'JJ-0001' })
})

describe('#162 — attendance CSV export columns (E2)', () => {
	it('adds the four headers for a food-service tenant, team view', async () => {
		const out = await lines(await GET(event(JOJO, { view: 'team', date: '2026-07-13' })))
		expect(out[0]).toContain('AM In,AM Out,PM In,PM Out')
		// Placed right after Time Out, before the hour columns.
		expect(out[0]).toContain('Time Out,AM In,AM Out,PM In,PM Out,Regular Hrs')
		expect(out[1]).toContain(',,,,') // the day-less first row carries four empty cells
		expect(out[2]).toContain('08:00,11:00,13:00,17:00')
	})

	it('every line has the same field count, day-less rows included', async () => {
		for (const ev of [
			event(JOJO, { view: 'team', date: '2026-07-13' }),
			event(JOJO, { employeeId: 'e1', from: '2026-07-13', to: '2026-07-13' })
		]) {
			const out = await lines(await GET(ev))
			const counts = new Set(out.map((l) => l.split(',').length))
			expect(counts.size, out.join('\n')).toBe(1)
		}
	})

	it('omits the four headers entirely for a non-food-service tenant', async () => {
		const out = await lines(await GET(event(VEENT, { view: 'team', date: '2026-07-13' })))
		for (const h of ['AM In', 'AM Out', 'PM In', 'PM Out']) expect(out[0]).not.toContain(h)
		expect(out[0]).toContain('Time Out,Regular Hrs')
		const counts = new Set(out.map((l) => l.split(',').length))
		expect(counts.size).toBe(1)
	})

	it('adds them to the single-employee view too', async () => {
		const out = await lines(
			await GET(event(JOJO, { employeeId: 'e1', from: '2026-07-13', to: '2026-07-13' }))
		)
		expect(out[0]).toContain('Time Out,AM In,AM Out,PM In,PM Out,Regular Hrs')
		expect(out[1]).toContain('08:00,11:00,13:00,17:00')
		// The second row has no split — four empty cells, not four missing ones.
		expect(out[2].split(',').length).toBe(out[0].split(',').length)
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { error } from '@sveltejs/kit'
import type { Role } from '@prisma/client'

/**
 * F11c / D9 — `?/saveAll` saves every changed day on the visible page and reports EACH ROW.
 *
 * A bare count reproduces F10 at bulk scale: the user is told "3 saved, 2 skipped" and cannot tell
 * which two days are still wrong. So the assertions below are on the per-row `results` entries —
 * the date and the reason — not only on the counts.
 *
 * The wire format is one `rows` field carrying a JSON array. `Object.fromEntries(formData)`
 * collapses duplicate keys, and the row inputs belong to their own per-row form via `form="c-{id}"`,
 * so a bulk form cannot reuse them. The array is validated row by row with the same `correctSchema`
 * the single-row door uses, so the bulk door cannot accept what single-save refuses.
 */

const correctDay = vi.hoisted(() => vi.fn())

vi.mock('$lib/server/db', () => ({ db: {} }))
vi.mock('$lib/server/services/attendance', () => ({
	countAttendanceDays: vi.fn(),
	listAttendanceDays: vi.fn(),
	listTeamDay: vi.fn(),
	deriveRange: vi.fn(),
	autoDeriveFromPunches: vi.fn(),
	correctDay,
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

const attendance = await import('../../src/routes/(app)/attendance/+page.server')

const SUPER: Role[] = ['SUPER_ADMIN']

type Row = Record<string, string>
type Result = { id: string; date: string; ok: boolean; reason?: string }

const saveAll = (rows: Row[] | string) => {
	const body = new FormData()
	body.set('rows', typeof rows === 'string' ? rows : JSON.stringify(rows))
	return attendance.actions.saveAll({
		request: { formData: async () => body },
		locals: { user: { id: 'actor', organizationId: 'org1', roles: SUPER } },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<any>
}

const row = (id: string, date: string, extra: Row = {}) => ({
	id,
	date,
	timeIn: '09:00',
	timeOut: '17:00',
	status: 'PRESENT',
	...extra
})

const locked = () => error(409, 'This attendance day is locked and cannot be edited')

beforeEach(() => {
	vi.clearAllMocks()
	correctDay.mockResolvedValue(undefined)
})

describe('?/saveAll reports every row it touched (#F11c, D9)', () => {
	it('a partial is a SUCCESS carrying counts and a reason for each row that failed', async () => {
		correctDay.mockImplementation((id: string) => {
			if (id === 'day2') throw locked()
			return Promise.resolve(undefined)
		})

		const res = await saveAll([
			row('day1', '2026-09-01'),
			row('day2', '2026-09-02'),
			row('day3', '2026-09-03')
		])

		expect(res.status).toBeUndefined()
		expect(res.action).toBe('saveAll')
		expect(res.saved).toBe('Saved 2 days, 1 skipped.')

		const results = res.results as Result[]
		expect(results).toHaveLength(3)
		// The whole point of D9: the failed row is named, with the service's own words.
		const failed = results.filter((r) => !r.ok)
		expect(failed).toEqual([
			{
				id: 'day2',
				date: '2026-09-02',
				ok: false,
				reason: 'This attendance day is locked and cannot be edited'
			}
		])
		expect(results.filter((r) => r.ok).map((r) => r.date)).toEqual(['2026-09-01', '2026-09-03'])
	})

	it('a total failure is a fail(400) that still names every row and why', async () => {
		correctDay.mockImplementation(() => {
			throw locked()
		})

		const res = await saveAll([row('day1', '2026-09-01'), row('day2', '2026-09-02')])

		expect(res.status).toBe(400)
		expect(res.data.error).toContain('No days were saved')
		const results = res.data.results as Result[]
		expect(results.map((r) => r.date)).toEqual(['2026-09-01', '2026-09-02'])
		expect(
			results.every((r) => r.reason === 'This attendance day is locked and cannot be edited')
		).toBe(true)
	})

	it('the bulk door strips hand-typed hours exactly like the single-row door', async () => {
		await saveAll([row('day1', '2026-09-01', { regularHours: '7.25', overtimeHours: '3' })])

		expect(correctDay).toHaveBeenCalledOnce()
		const data = correctDay.mock.calls[0][2] as Record<string, unknown>
		expect(data).not.toHaveProperty('regularHours')
		expect(data).not.toHaveProperty('overtimeHours')
		expect(data.timeIn).toEqual(new Date('2026-09-01T09:00:00+08:00'))
	})

	it('refuses more rows than one page can hold, without running a single write', async () => {
		const rows = Array.from({ length: 11 }, (_, i) => row(`day${i}`, '2026-09-01'))

		const res = await saveAll(rows)

		expect(res.status).toBe(400)
		expect(res.data.error).toContain('Too many days')
		expect(correctDay).not.toHaveBeenCalled()
	})

	it('accepts a full page of rows', async () => {
		const rows = Array.from({ length: 10 }, (_, i) => row(`day${i}`, '2026-09-01'))

		const res = await saveAll(rows)

		expect(res.action).toBe('saveAll')
		expect(correctDay).toHaveBeenCalledTimes(10)
	})

	it('refuses a malformed body instead of trusting it', async () => {
		expect((await saveAll('not json')).status).toBe(400)
		expect((await saveAll([])).status).toBe(400)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((await saveAll([{ date: '2026-09-01' } as any])).status).toBe(400)
		expect((await saveAll([row('day1', '')])).status).toBe(400)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((await saveAll([row('day1', '2026-09-01', { status: 'NOPE' } as any)])).status).toBe(400)
		expect(correctDay).not.toHaveBeenCalled()
	})

	it('lets an unexpected error escape rather than reporting it as a skipped row', async () => {
		correctDay.mockImplementation(() => {
			throw new Error('connection reset')
		})

		await expect(saveAll([row('day1', '2026-09-01')])).rejects.toThrow('connection reset')
	})
})

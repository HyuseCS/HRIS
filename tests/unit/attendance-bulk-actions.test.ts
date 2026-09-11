import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
const resetDayToDerived = vi.hoisted(() => vi.fn())

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
	resetDayToDerived,
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

const resetAll = (rows: { id?: string; date?: string }[] | string) => {
	const body = new FormData()
	body.set('rows', typeof rows === 'string' ? rows : JSON.stringify(rows))
	return attendance.actions.resetAll({
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
	resetDayToDerived.mockResolvedValue(undefined)
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

/**
 * F11c second half — `?/resetAll` is `?/resetDay` over every manually edited day on the page. It
 * acts on COMMITTED state, so a row it touches loses hand-entered corrections; the per-row report
 * is the only way the user learns which days survived.
 *
 * The service already refuses a locked day and a non-ACTIVE employee with a 409. Those refusals are
 * NOT pre-filtered in the action — they become the per-row `reason`, in the service's own words.
 */
describe('?/resetAll recalculates every edited day and reports each row (#F11c, D9)', () => {
	it("a partial is a SUCCESS and the refused row carries the service's own words", async () => {
		resetDayToDerived.mockImplementation((id: string) => {
			if (id === 'day2') throw locked()
			return Promise.resolve(undefined)
		})

		const res = await resetAll([
			{ id: 'day1', date: '2026-09-01' },
			{ id: 'day2', date: '2026-09-02' },
			{ id: 'day3', date: '2026-09-03' }
		])

		expect(res.status).toBeUndefined()
		expect(res.action).toBe('resetAll')
		expect(res.saved).toBe('Recalculated 2 days, 1 skipped.')

		const results = res.results as Result[]
		expect(results).toHaveLength(3)
		expect(results.filter((r) => !r.ok)).toEqual([
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
		resetDayToDerived.mockImplementation(() => {
			throw locked()
		})

		const res = await resetAll([
			{ id: 'day1', date: '2026-09-01' },
			{ id: 'day2', date: '2026-09-02' }
		])

		expect(res.status).toBe(400)
		expect(res.data.error).toContain('No days were recalculated')
		const results = res.data.results as Result[]
		expect(results.map((r) => r.date)).toEqual(['2026-09-01', '2026-09-02'])
		expect(
			results.every((r) => r.reason === 'This attendance day is locked and cannot be edited')
		).toBe(true)
	})

	it('refuses more rows than one page can hold, without running a single reset', async () => {
		const rows = Array.from({ length: 11 }, (_, i) => ({ id: `day${i}`, date: '2026-09-01' }))

		const res = await resetAll(rows)

		expect(res.status).toBe(400)
		expect(res.data.error).toContain('Too many days')
		expect(resetDayToDerived).not.toHaveBeenCalled()
	})

	it('accepts a full page of rows', async () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ id: `day${i}`, date: '2026-09-01' }))

		expect((await resetAll(rows)).action).toBe('resetAll')
		expect(resetDayToDerived).toHaveBeenCalledTimes(10)
	})

	it('refuses a malformed body instead of trusting it', async () => {
		expect((await resetAll('not json')).status).toBe(400)
		expect((await resetAll([])).status).toBe(400)
		expect((await resetAll([{ date: '2026-09-01' }])).status).toBe(400)
		expect((await resetAll([{ id: 'day1', date: '' }])).status).toBe(400)
		expect(resetDayToDerived).not.toHaveBeenCalled()
	})

	it('lets an unexpected error escape rather than reporting it as a skipped row', async () => {
		resetDayToDerived.mockImplementation(() => {
			throw new Error('connection reset')
		})

		await expect(resetAll([{ id: 'day1', date: '2026-09-01' }])).rejects.toThrow('connection reset')
	})
})

// ── The bulk trigger's blast radius is visible BEFORE the click (A5.4, A5.5) ──
// Source scans. They prove the count and the page-scope wording are in the file; they cannot prove
// the button renders or that the number shown is right — that is the owner's L7 step.
describe('the Recalculate-all trigger states its scope', () => {
	const page = readFileSync(
		join(import.meta.dirname, '../../src/routes/(app)/attendance/+page.svelte'),
		'utf8'
	).replace(/\s+/g, ' ')

	it('selects only the unlocked, manually edited rows that are actually shown', () => {
		expect(page).toContain(
			'const editedDays = $derived(dayRows.map(rowOf).filter((d) => !d.isLocked && d.manuallyEdited))'
		)
	})

	it('puts the count in the trigger label and says the scope is this page', () => {
		expect(page).toContain('triggerLabel="Recalculate {editedCount} on this page"')
		expect(page).toContain("`${editedDays.length} ${editedDays.length === 1 ? 'day' : 'days'}`")
	})

	it('is disabled when nothing qualifies', () => {
		expect(page).toContain('disabled={editedDays.length === 0}')
	})

	it('names the employee and the date range in the dialog, not just the count', () => {
		expect(page).toContain('message="{editedCount} for {selectedEmployeeName} {editedSpan}')
		expect(page).toContain('between ${fmtDate(new Date(Math.min(...times)))}')
	})
})

import { describe, it, expect } from 'vitest'
import { pairPunchesToDailyHours, type PunchLite } from '$lib/server/services/timelog'
import { manilaDayKey, manilaWeekEnd, manilaWeekStart } from '$lib/utils/dates'

// Helper: build a punch from a UTC ISO string.
const p = (punchType: 'IN' | 'OUT', iso: string): PunchLite => ({
	punchType,
	timestamp: new Date(iso)
})

describe('manila timezone helpers (UTC+8)', () => {
	it('buckets a UTC instant into the correct PHT calendar day across midnight', () => {
		// 23:30 PHT Jul 6  == 15:30 UTC Jul 6
		expect(manilaDayKey(new Date('2026-07-06T15:30:00Z'))).toBe('2026-07-06')
		// 00:30 PHT Jul 7  == 16:30 UTC Jul 6
		expect(manilaDayKey(new Date('2026-07-06T16:30:00Z'))).toBe('2026-07-07')
	})

	it('computes the PHT week start (Mon 00:00 PHT) as a UTC instant', () => {
		// Wed Jul 8 2026, 13:00 PHT -> week Monday is Jul 6, 00:00 PHT == Jul 5 16:00 UTC
		expect(manilaWeekStart(new Date('2026-07-08T05:00:00Z')).toISOString()).toBe(
			'2026-07-05T16:00:00.000Z'
		)
	})

	it.each([
		['Sunday 23:30 PHT', '2026-07-12T15:30:00Z', '2026-07-06', '2026-07-12'],
		['Monday 00:30 PHT', '2026-07-12T16:30:00Z', '2026-07-13', '2026-07-19'],
		['Monday 07:59 PHT', '2026-07-12T23:59:00Z', '2026-07-13', '2026-07-19']
	])('keys the PHT week at %s', (_label, iso, monday, sunday) => {
		expect(manilaDayKey(manilaWeekStart(new Date(iso)))).toBe(monday)
		expect(manilaDayKey(manilaWeekEnd(new Date(iso)))).toBe(sunday)
	})
})

describe('pairPunchesToDailyHours', () => {
	it('pairs a simple IN/OUT into that PHT day, less the lunch break, all regular', () => {
		const { hoursByDay, otByDay, warnings } = pairPunchesToDailyHours([
			p('IN', '2026-07-06T01:00:00Z'), // 09:00 PHT
			p('OUT', '2026-07-06T09:00:00Z') // 17:00 PHT (8h gross − 1h lunch), fully in-window
		])
		expect(hoursByDay).toEqual({ '2026-07-06': 7 })
		expect(otByDay).toEqual({ '2026-07-06': 0 })
		expect(warnings).toHaveLength(0)
	})

	it('splits time outside 08:00–17:00 into overtime (07:00–19:00 → reg 8, OT 3)', () => {
		const { hoursByDay, otByDay } = pairPunchesToDailyHours([
			p('IN', '2026-07-05T23:00:00Z'), // 07:00 PHT Jul 6 (1h before window)
			p('OUT', '2026-07-06T11:00:00Z') // 19:00 PHT Jul 6 (2h after window)
		])
		// 12h gross − 1h lunch = 11h paid; 3h outside the window is OT, so reg = 8.
		expect(hoursByDay).toEqual({ '2026-07-06': 11 })
		expect(otByDay).toEqual({ '2026-07-06': 3 })
	})

	it('sums multiple pairs within the same day, splitting reg/OT per shift', () => {
		const { hoursByDay, otByDay } = pairPunchesToDailyHours([
			p('IN', '2026-07-06T01:00:00Z'), // 09:00 PHT
			p('OUT', '2026-07-06T05:00:00Z'), // 13:00 PHT (4h gross − 1h lunch = 3h, no OT)
			p('IN', '2026-07-06T06:00:00Z'), // 14:00 PHT
			p('OUT', '2026-07-06T09:30:00Z') // 17:30 PHT (3.5h; 0.5h after 17:00 is OT)
		])
		expect(hoursByDay).toEqual({ '2026-07-06': 6.5 })
		expect(otByDay).toEqual({ '2026-07-06': 0.5 })
	})

	it('keeps the next-day regular window for an overnight shift (16:00→10:00)', () => {
		const { hoursByDay, otByDay } = pairPunchesToDailyHours([
			p('IN', '2026-07-06T08:00:00Z'), // 16:00 PHT Jul 6
			p('OUT', '2026-07-07T02:00:00Z') // 10:00 PHT Jul 7
		])
		// 18h worked; regular = 16:00–17:00 (1h) + next day 08:00–10:00 (2h) = 3h; OT = 15h.
		expect(hoursByDay).toEqual({ '2026-07-06': 18 })
		expect(otByDay).toEqual({ '2026-07-06': 15 })
	})

	it('treats an overnight shift as all overtime and deducts no lunch', () => {
		const { hoursByDay, otByDay, warnings } = pairPunchesToDailyHours([
			p('IN', '2026-07-06T15:00:00Z'), // 23:00 PHT Jul 6
			p('OUT', '2026-07-06T19:00:00Z') // 03:00 PHT Jul 7 (4h, all outside the window)
		])
		expect(hoursByDay).toEqual({ '2026-07-06': 4 })
		expect(otByDay).toEqual({ '2026-07-06': 4 })
		expect(warnings).toHaveLength(0)
	})

	it('deducts only the worked portion of the lunch window (partial overlap)', () => {
		const { hoursByDay, otByDay } = pairPunchesToDailyHours([
			p('IN', '2026-07-06T04:30:00Z'), // 12:30 PHT
			p('OUT', '2026-07-06T09:00:00Z') // 17:00 PHT (4.5h gross − 0.5h lunch = 4h, no OT)
		])
		expect(hoursByDay).toEqual({ '2026-07-06': 4 })
		expect(otByDay).toEqual({ '2026-07-06': 0 })
	})

	it('sorts out-of-order punches before pairing', () => {
		const { hoursByDay } = pairPunchesToDailyHours([
			p('OUT', '2026-07-06T09:00:00Z'),
			p('IN', '2026-07-06T01:00:00Z')
		])
		expect(hoursByDay).toEqual({ '2026-07-06': 7 })
	})

	it('warns on a missing OUT and does not count it', () => {
		const { hoursByDay, otByDay, warnings } = pairPunchesToDailyHours([
			p('IN', '2026-07-06T01:00:00Z'), // dangling IN
			p('IN', '2026-07-06T02:00:00Z'), // 10:00 PHT
			p('OUT', '2026-07-06T10:00:00Z') // 18:00 PHT (8h gross − 1h lunch; 1h after 17:00 is OT)
		])
		expect(hoursByDay).toEqual({ '2026-07-06': 7 })
		expect(otByDay).toEqual({ '2026-07-06': 1 })
		expect(warnings.some((w) => w.includes('Missing OUT'))).toBe(true)
	})

	it('skips a shift longer than 24h as a likely missing OUT, and warns', () => {
		const { hoursByDay, otByDay, warnings } = pairPunchesToDailyHours([
			p('IN', '2026-07-06T00:00:00Z'), // 08:00 PHT Jul 6
			p('OUT', '2026-07-08T00:00:00Z') // 08:00 PHT Jul 8 (48h — forgotten clock-out)
		])
		expect(hoursByDay).toEqual({})
		expect(otByDay).toEqual({})
		expect(warnings.some((w) => w.includes('24h'))).toBe(true)
	})

	it('warns on a stray OUT with no matching IN', () => {
		const { hoursByDay, otByDay, warnings } = pairPunchesToDailyHours([
			p('OUT', '2026-07-06T09:00:00Z')
		])
		expect(hoursByDay).toEqual({})
		expect(otByDay).toEqual({})
		expect(warnings.some((w) => w.includes('without a matching IN'))).toBe(true)
	})

	it('returns empty result for no punches', () => {
		expect(pairPunchesToDailyHours([])).toEqual({ hoursByDay: {}, otByDay: {}, warnings: [] })
	})
})

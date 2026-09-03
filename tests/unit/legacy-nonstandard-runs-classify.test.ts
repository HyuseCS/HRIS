import { describe, it, expect } from 'vitest'
import { classifyLegacyRun } from '../../scripts/legacy-nonstandard-runs'
import { periodOf } from '../../src/lib/utils/pay-periods'

/**
 * #163 pre-flight, review round 2 — the script is about to be run against production, so the two
 * groups it prints have to be exactly right. `periodShareOf` keeps the flat 0.5 for a reversed or
 * cross-month pair, so those rows do NOT move; only a same-month non-standard range does.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('classifyLegacyRun — rows whose numbers will move', () => {
	it('a same-month non-standard range moves to its day-count share', () => {
		// May 3–9 is 7 of May's 31 days.
		expect(classifyLegacyRun(d('2026-05-03'), d('2026-05-09'))).toEqual({
			moves: true,
			oldShare: 0.5,
			newShare: 7 / 31
		})
	})

	it('reports the real dev-DB row (May 11–25, 2022) as moving', () => {
		const v = classifyLegacyRun(d('2022-05-11'), d('2022-05-25'))
		expect(v.moves).toBe(true)
		expect(v).toMatchObject({ oldShare: 0.5, newShare: 15 / 31 })
	})

	it('a cross-month range at or under the cap now day-counts and moves', () => {
		expect(classifyLegacyRun(d('2026-05-20'), d('2026-06-05'))).toEqual({
			moves: true,
			oldShare: 0.5,
			newShare: 12 / 31 + 5 / 30
		})
	})
})

describe('classifyLegacyRun — rows that are unaffected', () => {
	it('a cross-month range over the one-month cap keeps the flat 0.5', () => {
		expect(classifyLegacyRun(d('2026-05-01'), d('2026-06-14'))).toEqual({
			moves: false,
			reason: 'over the one-month cap — keeps the historical flat 0.5'
		})
	})

	it('a reversed range keeps the flat 0.5, and says so rather than "cross-month"', () => {
		expect(classifyLegacyRun(d('2026-05-20'), d('2026-05-05'))).toEqual({
			moves: false,
			reason: 'reversed range — keeps the historical flat 0.5'
		})
	})

	it('a same-month range whose day-count share IS 0.5 does not move', () => {
		// June 2–16 is 15 of June's 30 days — exactly the share it already takes.
		expect(classifyLegacyRun(d('2026-06-02'), d('2026-06-16'))).toMatchObject({ moves: false })
	})

	it('a standard shape is frozen', () => {
		for (const kind of ['FIRST_HALF', 'SECOND_HALF', 'WHOLE_MONTH'] as const) {
			const p = periodOf(kind, 2026, 4)
			expect(classifyLegacyRun(p.periodStart, p.periodEnd)).toMatchObject({ moves: false })
		}
	})
})

import { describe, it, expect } from 'vitest'
import {
	isCycleDue,
	nextCyclePeriod,
	planReviewsForCycle,
	DEFAULT_INTERVAL_MONTHS,
	type PlannableEmployee
} from '$lib/server/performance/cycle-plan'

// #178 plan item 93 — the pure cycle planner. SPEC AC3 (nobody is silently skipped),
// AC14 (per-org cadence, default 2 months, changes are never retroactive) and AC15
// (a cycle cannot be double-created).
//
// Every case passes `now` explicitly. The module reads no clock, so these tests need no
// database, no fake timers and no ambient timezone: they are the same on any machine.

const iso = (d: Date) => d.toISOString().slice(0, 10)
const enabled = (intervalMonths: number) => ({ enabled: true, intervalMonths })

describe('isCycleDue — MANILA basis, measured from the last cycle end (AC14)', () => {
	const now = new Date('2026-08-27T02:00:00.000Z')

	it('is false when the organization has generation disabled, however overdue', () => {
		expect(isCycleDue({ enabled: false, intervalMonths: 2 }, null, now)).toBe(false)
		expect(isCycleDue({ enabled: false, intervalMonths: 2 }, new Date(0), now)).toBe(false)
	})

	it('is true when the organization has never had a cycle', () => {
		expect(isCycleDue(enabled(2), null, now)).toBe(true)
	})

	it('is false before the interval has elapsed since the last cycle ENDED', () => {
		// Ended Jul 31 → next boundary Sep 30. Aug 27 is inside the interval.
		expect(isCycleDue(enabled(2), new Date('2026-07-31T00:00:00Z'), now)).toBe(false)
	})

	it('is true the day after the period it would cover has closed', () => {
		// Closed Jun 30 → the next period is Jul 1 – Aug 31, so Sep 1 is the first due day.
		const lastEnd = new Date('2026-06-30T00:00:00Z')
		expect(isCycleDue(enabled(2), lastEnd, new Date('2026-08-31T02:00:00Z'))).toBe(false)
		expect(isCycleDue(enabled(2), lastEnd, new Date('2026-09-01T02:00:00Z'))).toBe(true)
	})

	// REGRESSION: `addUTCMonths` overflows short months (Jul 31 + 2 = Oct 1, not Sep 30). A
	// boundary computed by stepping the CLOSE date would be a day wrong for every month-end
	// cadence, so the boundary is the period's own end instead.
	it('is not thrown off by a month-end close date', () => {
		const lastEnd = new Date('2026-07-31T00:00:00Z') // next period: Aug 1 – Sep 30
		expect(isCycleDue(enabled(2), lastEnd, new Date('2026-09-30T02:00:00Z'))).toBe(false)
		expect(isCycleDue(enabled(2), lastEnd, new Date('2026-10-01T02:00:00Z'))).toBe(true)
	})

	it('honours a per-organization interval of 1 month, and of 6', () => {
		const lastEnd = new Date('2026-07-31T00:00:00Z')
		expect(isCycleDue(enabled(1), lastEnd, new Date('2026-09-01T02:00:00Z'))).toBe(true)
		expect(isCycleDue(enabled(6), lastEnd, new Date('2026-09-01T02:00:00Z'))).toBe(false)
	})

	// THE BUG CLASS THIS BASIS EXISTS TO PREVENT (#320). PHT is UTC+8, so from 16:00 UTC the
	// Manila calendar is already on the next day. Both instants below are the SAME UTC day —
	// a UTC-based comparison would give them the same answer, and be a day late for HR.
	it('flips on the MANILA day boundary, not the UTC one', () => {
		const lastEnd = new Date('2026-07-31T00:00:00Z') // period Aug 1 – Sep 30; due Oct 1 PHT
		const beforeInManila = new Date('2026-09-30T15:59:59.999Z') // Sep 30, 23:59 PHT
		const afterInManila = new Date('2026-09-30T16:00:00.000Z') // Oct 1, 00:00 PHT
		expect(iso(beforeInManila)).toBe(iso(afterInManila)) // same UTC day — the trap
		expect(isCycleDue(enabled(2), lastEnd, beforeInManila)).toBe(false)
		expect(isCycleDue(enabled(2), lastEnd, afterInManila)).toBe(true)
	})
})

describe('nextCyclePeriod — UTC month stepping (AC14)', () => {
	it('defaults to a two-month period when the org has no config row', () => {
		expect(DEFAULT_INTERVAL_MONTHS).toBe(2)
		const p = nextCyclePeriod(
			new Date('2026-07-31T00:00:00Z'),
			DEFAULT_INTERVAL_MONTHS,
			new Date('2026-10-01T02:00:00Z')
		)
		expect(iso(p.startDate)).toBe('2026-08-01')
		expect(iso(p.endDate)).toBe('2026-09-30')
		expect(p.name).toBe('Aug–Sep 2026')
	})

	it('seeds a month-aligned first period from the MANILA month of `now`', () => {
		const p = nextCyclePeriod(null, 2, new Date('2026-08-27T02:00:00Z'))
		expect(iso(p.startDate)).toBe('2026-06-01')
		expect(iso(p.endDate)).toBe('2026-07-31')
		expect(p.name).toBe('Jun–Jul 2026')
	})

	it('seeds from the Manila month even when `now` is still the previous month in UTC', () => {
		// 2026-08-31T16:00Z is Sep 1 in Manila, so the seed period ends Aug 31, not Jul 31.
		const p = nextCyclePeriod(null, 2, new Date('2026-08-31T16:00:00Z'))
		expect(iso(p.startDate)).toBe('2026-07-01')
		expect(iso(p.endDate)).toBe('2026-08-31')
	})

	it('never overlaps the previous period: it starts the day after it closed', () => {
		const p = nextCyclePeriod(new Date('2026-09-30T00:00:00Z'), 2, new Date('2026-10-01T02:00:00Z'))
		expect(iso(p.startDate)).toBe('2026-10-01')
		expect(iso(p.endDate)).toBe('2026-11-30')
	})

	it('keeps UTC-midnight anchors and does not mutate its input', () => {
		const lastEnd = new Date('2026-09-30T00:00:00Z')
		const p = nextCyclePeriod(lastEnd, 2, new Date('2026-10-01T02:00:00Z'))
		expect(p.startDate.toISOString()).toBe('2026-10-01T00:00:00.000Z')
		expect(p.endDate.toISOString()).toBe('2026-11-30T00:00:00.000Z')
		expect(lastEnd.toISOString()).toBe('2026-09-30T00:00:00.000Z')
	})

	it('crosses the year boundary, and names both years', () => {
		const p = nextCyclePeriod(new Date('2026-11-30T00:00:00Z'), 2, new Date('2027-01-01T02:00:00Z'))
		expect(iso(p.startDate)).toBe('2026-12-01')
		expect(iso(p.endDate)).toBe('2027-01-31')
		expect(p.name).toBe('Dec 2026–Jan 2027')
	})

	it('names a one-month period with a single month', () => {
		const p = nextCyclePeriod(new Date('2026-07-31T00:00:00Z'), 1, new Date('2026-09-01T02:00:00Z'))
		expect(p.name).toBe('Aug 2026')
		expect(iso(p.endDate)).toBe('2026-08-31')
	})

	it('survives February and a leap year without drifting the day of month', () => {
		const p = nextCyclePeriod(new Date('2027-12-31T00:00:00Z'), 2, new Date('2028-01-01T02:00:00Z'))
		expect(iso(p.startDate)).toBe('2028-01-01')
		expect(iso(p.endDate)).toBe('2028-02-29')
	})
})

describe('changing the cadence is never retroactive (AC14)', () => {
	// The organization ran one bi-monthly cycle, then HR changed the setting to 3 months.
	const generated = nextCyclePeriod(
		new Date('2026-07-31T00:00:00Z'),
		2,
		new Date('2026-10-01T02:00:00Z')
	)

	it('applies the new interval to the NEXT cycle only', () => {
		const next = nextCyclePeriod(generated.endDate, 3, new Date('2026-10-01T02:00:00Z'))
		expect(iso(next.startDate)).toBe('2026-10-01')
		expect(iso(next.endDate)).toBe('2026-12-31')
		expect(next.name).toBe('Oct–Dec 2026')
	})

	// THE NEGATIVE CASE: the already-generated row is what a stored ReviewCycle holds. Planning
	// with the new interval must leave it byte-identical — nothing here rewrites history.
	it('leaves the already-generated period untouched', () => {
		const before = { ...generated }
		nextCyclePeriod(generated.endDate, 3, new Date('2026-10-01T02:00:00Z'))
		expect(generated.startDate.toISOString()).toBe(before.startDate.toISOString())
		expect(generated.endDate.toISOString()).toBe(before.endDate.toISOString())
		expect(generated.name).toBe(before.name)
	})

	it('does not re-open the previous cycle just because the interval grew', () => {
		// Aug–Sep closed Sep 30. Under the new 3-month setting the next boundary is Dec 31,
		// so an Oct tick is not due — the change delays the future, it does not revisit the past.
		expect(isCycleDue(enabled(3), generated.endDate, new Date('2026-10-15T02:00:00Z'))).toBe(false)
	})
})

describe('a missed boundary yields exactly ONE cycle, never a backlog (AC15)', () => {
	// The cron was down from October to March: three bi-monthly boundaries went by.
	const lastEnd = new Date('2026-09-30T00:00:00Z')
	const now = new Date('2027-03-15T02:00:00Z')

	it('is due', () => {
		expect(isCycleDue(enabled(2), lastEnd, now)).toBe(true)
	})

	it('returns one period, and it is the one immediately after the gap', () => {
		const p = nextCyclePeriod(lastEnd, 2, now)
		expect(iso(p.startDate)).toBe('2026-10-01')
		expect(iso(p.endDate)).toBe('2026-11-30')
	})

	it('one tick creates one cycle — the shape of the answer cannot hold a backlog', () => {
		// `nextCyclePeriod` returns a single object, so there is no catch-up loop to write.
		// This mirrors `isRunDue`'s audited "fires once, not N times" semantics in backup/plan.ts.
		const p = nextCyclePeriod(lastEnd, 2, now)
		expect(Array.isArray(p)).toBe(false)
		expect(Object.keys(p).sort()).toEqual(['endDate', 'name', 'startDate'])
	})
})

describe('planReviewsForCycle — nobody is silently skipped (AC3)', () => {
	const ok = (id: string): PlannableEmployee => ({
		id,
		reportsToId: `mgr-${id}`,
		assignedTemplateId: 'tpl-1'
	})

	it('plans one review per eligible employee, with the manager as reviewer', () => {
		const { toCreate, unreviewable } = planReviewsForCycle([ok('e1'), ok('e2')], [])
		expect(unreviewable).toEqual([])
		expect(toCreate).toEqual([
			{ employeeId: 'e1', reviewerId: 'mgr-e1', templateId: 'tpl-1' },
			{ employeeId: 'e2', reviewerId: 'mgr-e2', templateId: 'tpl-1' }
		])
	})

	it('reports no-template-assigned', () => {
		const { toCreate, unreviewable } = planReviewsForCycle(
			[{ id: 'e1', reportsToId: 'mgr-1', assignedTemplateId: null }],
			[]
		)
		expect(toCreate).toEqual([])
		expect(unreviewable).toEqual([{ employeeId: 'e1', reasons: ['no-template-assigned'] }])
	})

	it('reports no-manager', () => {
		const { toCreate, unreviewable } = planReviewsForCycle(
			[{ id: 'e1', reportsToId: null, assignedTemplateId: 'tpl-1' }],
			[]
		)
		expect(toCreate).toEqual([])
		expect(unreviewable).toEqual([{ employeeId: 'e1', reasons: ['no-manager'] }])
	})

	it('reports template-invalid when the assigned template failed its schema', () => {
		const { toCreate, unreviewable } = planReviewsForCycle(
			[
				{
					id: 'e1',
					reportsToId: 'mgr-1',
					assignedTemplateId: 'tpl-1',
					templateStructureValid: false
				}
			],
			[]
		)
		expect(toCreate).toEqual([])
		expect(unreviewable).toEqual([{ employeeId: 'e1', reasons: ['template-invalid'] }])
	})

	// BOTH reasons, not the first one. Reporting only "no template" would have HR assign a
	// template, re-run, and only then be told the employee also has no manager.
	it('reports BOTH reasons for an employee missing a template AND a manager', () => {
		const { unreviewable } = planReviewsForCycle(
			[{ id: 'e1', reportsToId: null, assignedTemplateId: null }],
			[]
		)
		expect(unreviewable).toEqual([
			{ employeeId: 'e1', reasons: ['no-template-assigned', 'no-manager'] }
		])
	})

	it('reports both an invalid template and a missing manager together', () => {
		const { unreviewable } = planReviewsForCycle(
			[{ id: 'e1', reportsToId: null, assignedTemplateId: 'tpl-1', templateStructureValid: false }],
			[]
		)
		expect(unreviewable[0].reasons).toEqual(['template-invalid', 'no-manager'])
	})

	it('keeps each employee in exactly one bucket', () => {
		const { toCreate, unreviewable } = planReviewsForCycle(
			[ok('e1'), { id: 'e2', reportsToId: null, assignedTemplateId: null }],
			[]
		)
		expect(toCreate.map((r) => r.employeeId)).toEqual(['e1'])
		expect(unreviewable.map((u) => u.employeeId)).toEqual(['e2'])
	})
})

describe('planReviewsForCycle is idempotent (AC15)', () => {
	const roster = [
		{ id: 'e1', reportsToId: 'mgr-1', assignedTemplateId: 'tpl-1' },
		{ id: 'e2', reportsToId: null, assignedTemplateId: 'tpl-1' }
	]

	it('plans nothing on a second run over the same cycle', () => {
		const first = planReviewsForCycle(roster, [])
		expect(first.toCreate).toHaveLength(1)
		const second = planReviewsForCycle(
			roster,
			first.toCreate.map((r) => r.employeeId)
		)
		expect(second.toCreate).toEqual([])
	})

	it('skips an employee who already has a review — they are not "unreviewable" either', () => {
		const { toCreate, unreviewable } = planReviewsForCycle(roster, ['e1'])
		expect(toCreate).toEqual([])
		// e2 still has no manager and is still reported; e1 appears nowhere.
		expect(unreviewable).toEqual([{ employeeId: 'e2', reasons: ['no-manager'] }])
	})

	it('adds only the newcomer when the roster grew since the first run', () => {
		const { toCreate } = planReviewsForCycle(
			[...roster, { id: 'e3', reportsToId: 'mgr-3', assignedTemplateId: 'tpl-1' }],
			['e1']
		)
		expect(toCreate).toEqual([{ employeeId: 'e3', reviewerId: 'mgr-3', templateId: 'tpl-1' }])
	})
})

// §0 — the app performs NO arithmetic on evaluation scores. This module plans cycles and
// reviews; a score must not be reachable from anything it returns.
describe('the planner touches no score', () => {
	it('returns no numeric score field of any kind', () => {
		const { toCreate } = planReviewsForCycle(
			[{ id: 'e1', reportsToId: 'm', assignedTemplateId: 't' }],
			[]
		)
		expect(Object.keys(toCreate[0])).toEqual(['employeeId', 'reviewerId', 'templateId'])
	})
})

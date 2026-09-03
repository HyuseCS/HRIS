import { describe, it, expect } from 'vitest'
import {
	remindersDue,
	DUE_SOON_DAYS,
	type RemindableReview
} from '../../src/lib/server/performance/reminder-plan'

// #178 / SPEC AC16 — the reminder planner. One case per trigger point, each asserting WHICH
// CHANNELS fire, plus de-duplication and escalation. The channel split lives in the pure
// module precisely so it can be asserted here rather than only in a cron shell.
//
// The planner is pure and takes `now` as an argument, so every case below is a fixed instant.

const DAY = 24 * 60 * 60 * 1000
const CFG = { dueDays: 14 }

// 08:00 PHT on 1 Aug 2026. Stored as the UTC instant, as Prisma returns it.
const OPENED_AT = new Date('2026-08-01T00:00:00Z')

function review(over: Partial<RemindableReview> = {}): RemindableReview {
	return {
		id: 'rev-1',
		status: 'PENDING',
		createdAt: OPENED_AT,
		completedAt: null,
		lastReminderAt: null,
		lastReminderKind: null,
		...over
	}
}

/** `days` after the review opened, at the same clock time. */
function dayAfterOpen(days: number): Date {
	return new Date(OPENED_AT.getTime() + days * DAY)
}

describe('remindersDue — trigger points and channels (SPEC AC16)', () => {
	it('a freshly opened review reminds "opened" in-app AND by email', () => {
		const out = remindersDue([review()], CFG, dayAfterOpen(1))
		expect(out).toEqual([{ reviewId: 'rev-1', kind: 'opened', channels: ['in-app', 'email'] }])
	})

	it('a review inside the due-soon window reminds "due-soon" in-app ONLY — no email', () => {
		const out = remindersDue([review()], CFG, dayAfterOpen(CFG.dueDays - DUE_SOON_DAYS))
		expect(out).toHaveLength(1)
		expect(out[0].kind).toBe('due-soon')
		expect(out[0].channels).toEqual(['in-app'])
		expect(out[0].channels).not.toContain('email')
	})

	it('a review past its due day reminds "overdue" in-app AND by email', () => {
		const out = remindersDue([review()], CFG, dayAfterOpen(CFG.dueDays + 1))
		expect(out).toEqual([{ reviewId: 'rev-1', kind: 'overdue', channels: ['in-app', 'email'] }])
	})

	it('a completed but unacknowledged review reminds "awaiting-ack" in-app ONLY — no email', () => {
		const r = review({ status: 'COMPLETED', completedAt: dayAfterOpen(5) })
		const out = remindersDue([r], CFG, dayAfterOpen(6))
		expect(out).toHaveLength(1)
		expect(out[0].kind).toBe('awaiting-ack')
		expect(out[0].channels).toEqual(['in-app'])
		expect(out[0].channels).not.toContain('email')
	})

	it('an ACKNOWLEDGED review is never reminded about', () => {
		const r = review({ status: 'ACKNOWLEDGED', completedAt: dayAfterOpen(5) })
		expect(remindersDue([r], CFG, dayAfterOpen(99))).toEqual([])
	})
})

describe('remindersDue — one reminder per review per run', () => {
	it('sends only the most urgent kind when a review is both overdue and awaiting acknowledgement', () => {
		const r = review({ status: 'COMPLETED', completedAt: dayAfterOpen(20) })
		const out = remindersDue([r], CFG, dayAfterOpen(21))
		expect(out).toHaveLength(1)
		expect(out[0].kind).toBe('overdue')
	})
})

describe('remindersDue — de-duplication and escalation', () => {
	it('does not resend the same kind twice in a row', () => {
		const r = review({ lastReminderKind: 'overdue', lastReminderAt: dayAfterOpen(15) })
		expect(remindersDue([r], CFG, dayAfterOpen(16))).toEqual([])
	})

	it('still sends when the kind escalates from due-soon to overdue', () => {
		const r = review({
			lastReminderKind: 'due-soon',
			lastReminderAt: dayAfterOpen(CFG.dueDays - 1)
		})
		const out = remindersDue([r], CFG, dayAfterOpen(CFG.dueDays + 1))
		expect(out).toHaveLength(1)
		expect(out[0].kind).toBe('overdue')
	})
})

describe('remindersDue — short cycles (dueDays <= DUE_SOON_DAYS)', () => {
	// `dueDays` is legal from 1 (PERFORMANCE_CONFIG_BOUNDS), so HR can set a cycle shorter than
	// the 3-day due-soon window. Unfloored, `dueDays - DUE_SOON_DAYS` is negative and the nudge
	// day lands BEFORE the open day, so `due-soon` wins on day zero and the employee never gets
	// the `opened` reminder — the only kind that carries an email. Revert the `Math.max` in
	// reminder-plan.ts and this case fails.
	it('plans "opened", not "due-soon", on the open day of a 2-day cycle', () => {
		const out = remindersDue([review()], { dueDays: 2 }, OPENED_AT)
		expect(out).toEqual([{ reviewId: 'rev-1', kind: 'opened', channels: ['in-app', 'email'] }])
	})
})

describe('remindersDue — Manila basis (#320 trap)', () => {
	// The due instant is 2026-08-15T00:00:00Z, whose MANILA day is 2026-08-15. `now` below is
	// 2026-08-15T16:30:00Z — still 15 Aug in UTC, but already 00:30 on 16 Aug in Manila. The
	// review IS overdue on the office calendar. A UTC-basis comparison answers "not overdue"
	// and is the exact #320 bug class, so this case fails if manilaDayKey is dropped.
	it('uses the Manila calendar day, not the UTC day, to decide "overdue"', () => {
		const out = remindersDue([review()], CFG, new Date('2026-08-15T16:30:00Z'))
		expect(out).toHaveLength(1)
		expect(out[0].kind).toBe('overdue')
	})
})

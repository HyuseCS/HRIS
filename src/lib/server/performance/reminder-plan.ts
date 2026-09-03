import { manilaDayKey } from '$lib/utils/dates'

// The pure core of performance-review reminders (#178, plan items 164-166). NOTHING in this
// file may touch the database, the filesystem or the network, and there is no `Date.now()` —
// time is ALWAYS an argument. That is what makes every reminder decision reproducible in a
// unit test, and the only reason `scripts/send-review-reminders.ts` can stay a thin IO shell.
// Modelled on `src/lib/server/performance/cycle-plan.ts`.
//
// TIMEZONE BASIS: MANILA, everywhere in this file. "Is this review due yet?" is a wall-clock
// business question, and a UTC answer is 8 hours out — enough to flip the day, which is the
// #320 bug class. Contrast `nextCyclePeriod`, which steps months in UTC because a
// day-of-month must survive the step. Do not harmonise the two.
//
// THE RULE THIS FILE EXISTS UNDER (plan §0): the app performs NO arithmetic on evaluation
// scores. This module plans reminders. It never computes, sums or averages a score.

export type ReminderKind = 'opened' | 'due-soon' | 'overdue' | 'awaiting-ack'

export type ReminderChannel = 'in-app' | 'email'

/**
 * SPEC AC16, the stated channel split. THE CHANNEL DECISION LIVES HERE, in the pure module,
 * not in the cron shell — that is what makes it unit-testable.
 *
 * `opened` and `overdue` carry an email because they are the two the employee/evaluator may
 * not be in the app to see. `due-soon` and `awaiting-ack` are nudges, and emailing every
 * nudge is how a notification channel gets muted.
 */
export const REMINDER_CHANNELS: Record<ReminderKind, readonly ReminderChannel[]> = {
	opened: ['in-app', 'email'],
	'due-soon': ['in-app'],
	overdue: ['in-app', 'email'],
	'awaiting-ack': ['in-app']
}

/**
 * How many days before the due day a review starts nudging as `due-soon`.
 *
 * A constant, not configuration: `PerformanceConfig` carries `dueDays` and nothing else, and
 * a second knob nobody has asked for is a setting HR has to understand. Widen it here if the
 * nudge lands too late.
 */
export const DUE_SOON_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Most urgent first. `remindersDue` returns AT MOST ONE reminder per review per run — the
 * first kind in this order that applies — so a stale review does not fire three separate
 * notifications on the same tick.
 *
 * `overdue` outranks `awaiting-ack` deliberately (plan O-7): a review that was completed late
 * and is still unacknowledged is chased with the louder, email-carrying reminder. Reversing
 * that is a one-line change to this array.
 */
const PRECEDENCE: readonly ReminderKind[] = ['overdue', 'awaiting-ack', 'due-soon', 'opened']

export interface RemindableReview {
	id: string
	/** `PerformanceReview.status`, as the raw enum string. */
	status: string
	/** When the review was opened. The due day is measured from here. */
	createdAt: Date
	/** Set once every signatory has attested. Null while the review is still in progress. */
	completedAt: Date | null
	lastReminderAt: Date | null
	/** The `ReminderKind` last sent, or null if this review has never been reminded. */
	lastReminderKind: string | null
}

export interface PlannedReminder {
	reviewId: string
	kind: ReminderKind
	channels: readonly ReminderChannel[]
}

/**
 * Which reviews should be reminded about right now, and on which channels.
 *
 * A review that is already ACKNOWLEDGED is finished and is never reminded about.
 *
 * DE-DUPLICATION: a review whose `lastReminderKind` already equals the kind computed for this
 * run is skipped. The job runs several times a day, so without this every tick would resend
 * the same nudge. Escalation still fires — `due-soon` followed by `overdue` is a DIFFERENT
 * kind, so it is sent.
 */
export function remindersDue(
	reviews: RemindableReview[],
	cfg: { dueDays: number },
	now: Date
): PlannedReminder[] {
	const today = manilaDayKey(now)
	const planned: PlannedReminder[] = []

	for (const r of reviews) {
		if (r.status === 'ACKNOWLEDGED') continue

		const dueDay = manilaDayKey(new Date(r.createdAt.getTime() + cfg.dueDays * DAY_MS))
		const nudgeDay = manilaDayKey(
			// Floored at one day: `dueDays` is legal from 1, and an unfloored window puts the
			// nudge day on or before the open day, so `due-soon` would win on day zero and the
			// employee would never get `opened`.
			new Date(r.createdAt.getTime() + Math.max(1, cfg.dueDays - DUE_SOON_DAYS) * DAY_MS)
		)

		const applies: Record<ReminderKind, boolean> = {
			// Past the due day on the Manila calendar. Still computed once the review is
			// complete but unacknowledged — that overlap is plan O-7, resolved by PRECEDENCE.
			overdue: today > dueDay,
			// Every signatory has attested, but the employee has not confirmed they have seen it.
			'awaiting-ack': r.completedAt !== null,
			'due-soon': today >= nudgeDay,
			// The floor: an open review that is neither due soon nor overdue.
			opened: true
		}

		const kind = PRECEDENCE.find((k) => applies[k])
		if (!kind) continue
		if (r.lastReminderKind === kind) continue

		planned.push({ reviewId: r.id, kind, channels: REMINDER_CHANNELS[kind] })
	}
	return planned
}

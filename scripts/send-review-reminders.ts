// Performance review reminders (#178, plan items 167-169). Nudges the people who still owe
// something on an open review — in-app always, plus a real email for the two loud kinds.
//
//   pnpm exec dotenv -e .env.dev -- tsx scripts/send-review-reminders.ts --dry-run
//
// Runs several times a day from the droplet crontab (see scripts/README.md) — the app has no
// scheduler. It is a companion to generate-review-cycles.ts, not part of it: "due soon" and
// "overdue" must be evaluated against real time, not just at cycle-open, so this job runs on
// its own, more frequent schedule.
//
// A THIN IO SHELL, mirroring scripts/generate-review-cycles.ts. Every reminder decision —
// which kind applies, which channels it carries, and whether it was already sent — belongs to
// the pure planner in src/lib/server/performance/reminder-plan.ts. THERE IS DELIBERATELY NO
// DATE ARITHMETIC IN THIS FILE — no setUTCDate, no getDate, no manual day maths. #320 was
// caused by date logic duplicated across files that then disagreed.
//
// THE RULE THIS FILE EXISTS UNDER (plan §0): the app performs NO arithmetic on evaluation
// scores. This script reminds. It never computes a subtotal, a total or an average.
//
// NO AUDIT ROW, DELIBERATELY (plan item 167): a reminder is not a domain mutation, and the
// `lastReminderAt` / `lastReminderKind` columns are the durable record — the same reasoning
// backup-documents.ts documents for skipping audit. It therefore does NOT need the seeded
// system@veent.ph user.
//
// NO ADVISORY LOCK, DELIBERATELY (plan item 168, re-evaluated there rather than inherited):
// overlap needs two runs of this script alive at once, and the de-duplication columns make a
// genuine overlap produce at worst ONE duplicate notification, which is harmless — versus the
// connection-pinning trap (src/lib/server/backup/plan.ts) a session lock would add. Revisit if
// the job ever grows past a minute of runtime.
//
// Email needs the six SMTP_* vars; with SMTP_HOST unset every send falls back to a [NOTIFY]
// console line and nothing throws. See src/lib/server/mailer.ts.

import 'dotenv/config'
import { db } from '../src/lib/server/db'
import {
	remindersDue,
	type PlannedReminder,
	type ReminderKind
} from '../src/lib/server/performance/reminder-plan'
import { notify } from '../src/lib/server/services/notifications'
import { sendReviewNoticeEmail, type ReviewNoticeKind } from '../src/lib/server/notifications'
import { getPerformanceConfig } from '../src/lib/server/services/performance'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

/**
 * Who is nudged, per kind. The EVALUATOR owes the form; the EMPLOYEE owes the
 * acknowledgement; an overdue review chases both because either one may be the blocker.
 */
const RECIPIENTS: Record<ReminderKind, ('employee' | 'reviewer')[]> = {
	opened: ['employee'],
	'due-soon': ['reviewer'],
	overdue: ['employee', 'reviewer'],
	'awaiting-ack': ['employee']
}

/**
 * The `build*` message that goes with each kind, or null for the in-app-only kinds. A total
 * lookup rather than an `as` cast: a fifth ReminderKind will not compile until someone decides
 * whether it carries an email. The CHANNEL decision still belongs to the planner — this only
 * says which wording exists.
 */
const NOTICE_KIND: Record<ReminderKind, ReviewNoticeKind | null> = {
	opened: 'opened',
	'due-soon': null,
	overdue: 'overdue',
	'awaiting-ack': null
}

const MESSAGE: Record<ReminderKind, (cycleName: string) => string> = {
	opened: (c) => `Your performance review for ${c} is open.`,
	'due-soon': (c) => `The performance review for ${c} is due soon.`,
	overdue: (c) => `The performance review for ${c} is overdue.`,
	'awaiting-ack': (c) => `Please acknowledge your completed performance review for ${c}.`
}

type Party = { userId: string; email: string; name: string }

function party(p: {
	firstName: string
	lastName: string
	user: { id: string; email: string }
}): Party {
	return { userId: p.user.id, email: p.user.email, name: `${p.firstName} ${p.lastName}` }
}

async function main() {
	// ONE instant for the whole sweep, so every review is asked the same "is it due?" question
	// even if the run takes minutes.
	const now = new Date()
	let failures = 0
	let sent = 0

	const orgs = await db.organization.findMany({
		select: { id: true },
		orderBy: { id: 'asc' }
	})

	for (const org of orgs) {
		try {
			// No row means never configured. `getPerformanceConfig` returns the defaults and
			// creates nothing — only the settings page writes a config row.
			const config = await getPerformanceConfig(org.id)
			if (!config.enabled) {
				console.log(`  org ${org.id}: review cycles not enabled — skipped`)
				continue
			}

			// Org-scoped on the DIRECT Employee.organizationId column, never through `user` —
			// #323 is a pre-existing repo-wide pattern and this must not become another site.
			const reviews = await db.performanceReview.findMany({
				where: { employee: { organizationId: org.id }, status: { not: 'ACKNOWLEDGED' } },
				select: {
					id: true,
					status: true,
					createdAt: true,
					completedAt: true,
					lastReminderAt: true,
					lastReminderKind: true,
					cycle: { select: { name: true } },
					employee: {
						select: { firstName: true, lastName: true, user: { select: { id: true, email: true } } }
					},
					reviewer: {
						select: { firstName: true, lastName: true, user: { select: { id: true, email: true } } }
					}
				}
			})

			const byId = new Map(reviews.map((r) => [r.id, r]))
			const planned: PlannedReminder[] = remindersDue(reviews, { dueDays: config.dueDays }, now)

			if (planned.length === 0) {
				console.log(`  org ${org.id}: nothing due (${reviews.length} open review(s))`)
				continue
			}

			for (const p of planned) {
				const review = byId.get(p.reviewId)
				if (!review) continue
				const cycleName = review.cycle.name
				const link = `/performance/reviews/${review.id}`
				const parties = RECIPIENTS[p.kind].map((who) =>
					party(who === 'employee' ? review.employee : review.reviewer)
				)

				if (dryRun) {
					console.log(
						`  org ${org.id}: DRY RUN — review ${review.id} "${cycleName}": ${p.kind} ` +
							`via ${p.channels.join('+')} to ${parties.map((r) => r.email).join(', ')}`
					)
					continue
				}

				// `channels` is the PLANNER's decision (SPEC AC16), never this script's — the shell
				// only obeys it.
				const noticeKind = p.channels.includes('email') ? NOTICE_KIND[p.kind] : null

				for (const r of parties) {
					await notify(r.userId, MESSAGE[p.kind](cycleName), link, 'PERFORMANCE')
					if (noticeKind) {
						sendReviewNoticeEmail(r.email, noticeKind, {
							recipientName: r.name,
							cycleName,
							reviewUrl: link
						})
					}
				}

				// The de-duplication record. Written AFTER the fan-out, so a crash mid-send
				// resends the in-app notice rather than silently swallowing it. For EMAIL it
				// records an ATTEMPT, not a delivery: `deliver` (mailer.ts) returns void and
				// swallows send failures, so a bounce or an SMTP outage is invisible here.
				await db.performanceReview.update({
					where: { id: review.id },
					data: { lastReminderAt: now, lastReminderKind: p.kind }
				})
				sent++
			}

			console.log(
				`  org ${org.id}: ${planned.length} reminder(s) ${dryRun ? 'planned' : 'sent'} ` +
					`(${reviews.length} open review(s))`
			)
		} catch (e) {
			// Per-org try/catch: one org must never abort the sweep.
			console.error(`  org ${org.id}: ${(e as Error).message}`)
			failures++
		}
	}

	if (failures > 0) {
		console.error(`\n${failures} organization(s) failed.`)
		process.exit(1)
	}
	console.log(`\nDone — ${dryRun ? '0 sent (dry run)' : `${sent} review(s) reminded`}.`)
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())

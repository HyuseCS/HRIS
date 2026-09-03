// Automatic performance review-cycle generation (#178, plan items 98/99). Each organization
// sets its own cadence at Settings → Performance; this entry point only OFFERS every org a
// chance to generate. It creates the next ReviewCycle as ACTIVE, opens a review for every
// active employee that can have one, and notifies each of them.
//
//   pnpm exec dotenv -e .env.dev -- tsx scripts/generate-review-cycles.ts --dry-run
//   pnpm exec dotenv -e .env.dev -- tsx scripts/generate-review-cycles.ts --force
//
// Runs nightly from the droplet crontab (see scripts/README.md) — the app has no scheduler.
//
// A THIN IO SHELL, mirroring scripts/backup-documents.ts. Every scheduling decision belongs
// to the pure planner in src/lib/server/performance/cycle-plan.ts, and every write belongs to
// src/lib/server/services/performance.ts. THERE IS DELIBERATELY NO DATE ARITHMETIC IN THIS
// FILE — no setUTCMonth, no getMonth, no manual day maths. #320 was caused by month logic
// duplicated across files that then disagreed; `isCycleDue` (Manila basis) and
// `nextCyclePeriod` (UTC month-stepping) are the single source of both answers.
//
// THE RULE THIS FILE EXISTS UNDER (plan §0): the app performs NO arithmetic on evaluation
// scores. This script plans and creates. It never computes a subtotal, a total or an average.
//
// NO ADVISORY LOCK, DELIBERATELY (plan item 99): cycle generation fires at most once every
// `intervalMonths` from a single hand-installed crontab line, and the ReviewCycle
// @@unique([organizationId, startDate, endDate]) plus the single $transaction turns any
// genuine overlap into a caught P2002 rather than a duplicate row — a lock would add the
// `withSingleConnection` connection-pinning trap (backup/plan.ts) for a race that cannot
// produce a bad row. (Phase 9's reminder job is a different case and is re-evaluated there.)
//
// Unlike backup-documents.ts, this DOES write an AuditLog row and therefore needs the seeded
// system@veent.ph user — AuditLog.actorId is a non-nullable FK. A cycle appearing in HR's list
// with no actor is unexplainable, whereas a BackupRun row is self-documenting.

import 'dotenv/config'
import { Prisma } from '@prisma/client'
import { db } from '../src/lib/server/db'
import { isCycleDue, nextCyclePeriod } from '../src/lib/server/performance/cycle-plan'
import {
	createCycleAndOpenReviews,
	getPerformanceConfig,
	planCycleRoster
} from '../src/lib/server/services/performance'
import { notify } from '../src/lib/server/services/notifications'
import { sendReviewNoticeEmail } from '../src/lib/server/notifications'
import type { AuditContext } from '../src/lib/server/services/types'

const SYSTEM_EMAIL = 'system@veent.ph'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')

function isDuplicateCycle(e: unknown): boolean {
	return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
}

async function main() {
	const systemUser = await db.user.findUnique({
		where: { email: SYSTEM_EMAIL },
		select: { id: true, roles: true }
	})
	if (!systemUser) {
		console.error(
			`No ${SYSTEM_EMAIL} user found — the audit trail needs it. Run \`pnpm db:seed\` first.`
		)
		process.exit(1)
	}

	// ONE instant for the whole sweep, so every org is asked the same "is it due?" question
	// even if the run takes minutes.
	const now = new Date()
	let failures = 0

	const orgs = await db.organization.findMany({
		select: { id: true, name: true },
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

			// Measured from the last cycle's END: a period can only be evaluated once it closed.
			const last = await db.reviewCycle.findFirst({
				where: { organizationId: org.id },
				orderBy: { endDate: 'desc' },
				select: { endDate: true }
			})
			const lastCycleEnd = last?.endDate ?? null

			if (!force && !isCycleDue(config, lastCycleEnd, now)) {
				console.log(`  org ${org.id}: not due`)
				continue
			}

			const period = nextCyclePeriod(lastCycleEnd, config.intervalMonths, now)

			if (dryRun) {
				// The SAME read+plan the real run uses, with `null` for "no cycle exists yet" —
				// a preview computed a second way is a preview that can lie.
				const { toCreate, unreviewable } = await planCycleRoster(org.id, null)
				console.log(
					`  org ${org.id}: DRY RUN — would create cycle "${period.name}" ` +
						`(${period.startDate.toISOString().slice(0, 10)} – ${period.endDate.toISOString().slice(0, 10)}) ` +
						`and open ${toCreate.length} review(s); ${unreviewable.length} employee(s) unreviewable`
				)
				for (const u of unreviewable) {
					console.log(`      ${u.employeeId}: ${u.reasons.join(', ')}`)
				}
				continue
			}

			const ctx: AuditContext = {
				organizationId: org.id,
				actorId: systemUser.id,
				actorRoles: systemUser.roles
			}

			// The cycle row, its reviews and the audit row all commit in ONE $transaction inside
			// the service. There is nothing to compensate for: a failure anywhere — including a
			// hard kill mid-write — leaves no cycle behind, which matters because an ACTIVE cycle
			// with zero reviews is unrecoverable now that no UI opens reviews by hand.
			let opened: Awaited<ReturnType<typeof createCycleAndOpenReviews>>
			try {
				opened = await createCycleAndOpenReviews(org.id, period, ctx)
			} catch (e) {
				// The @@unique doing its job: a second invocation for the same period is not an
				// error, it is the idempotency guarantee.
				if (isDuplicateCycle(e)) {
					console.log(`  org ${org.id}: cycle "${period.name}" already generated — skipped`)
					continue
				}
				throw e
			}

			// Every review in a cycle created moments ago is new, so this notifies exactly the
			// employees this run affected and nobody twice. BOTH sides are told at open: without
			// the reviewer nudge the evaluator first hears at the `due-soon` reminder, which is
			// `dueDays - 3` days later (scripts/send-review-reminders.ts).
			const reviews = await db.performanceReview.findMany({
				where: { cycleId: opened.cycle.id },
				select: {
					id: true,
					employee: {
						select: {
							userId: true,
							firstName: true,
							lastName: true,
							user: { select: { email: true } }
						}
					},
					reviewer: { select: { userId: true } }
				}
			})
			for (const review of reviews) {
				await notify(
					review.employee.userId,
					`Your performance review for ${period.name} is open.`,
					`/performance/reviews/${review.id}`,
					'PERFORMANCE'
				)
				// The cron never sends this one: `reviewRows()` pre-stamps `lastReminderKind:
				// 'opened'`, and `remindersDue` skips a kind it already stamped. That pre-stamp is
				// what stops a duplicate in-app notice, so the email has to be sent from here.
				sendReviewNoticeEmail(review.employee.user.email, 'opened', {
					recipientName: `${review.employee.firstName} ${review.employee.lastName}`,
					cycleName: period.name,
					reviewUrl: `/performance/reviews/${review.id}`
				})
				// Self-review: one person can hold both roles in a small org, and two notifications
				// about the same review would be noise.
				if (review.reviewer.userId !== review.employee.userId) {
					await notify(
						review.reviewer.userId,
						`Performance review for ${review.employee.firstName} ${review.employee.lastName} ` +
							`(${period.name}) is open for you to complete.`,
						`/performance/reviews/${review.id}`,
						'PERFORMANCE'
					)
				}
			}

			console.log(
				`  org ${org.id}: created cycle "${period.name}" — ${opened.opened} review(s) opened, ` +
					`${opened.unreviewable.length} employee(s) unreviewable`
			)
			for (const u of opened.unreviewable) {
				console.log(`      ${u.employeeId}: ${u.reasons.join(', ')}`)
			}
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
	console.log('\nDone.')
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())

import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
// A VALUE import, not `import type`: `Prisma.PrismaClientKnownRequestError` is needed at
// runtime by the P2002 catch in `attestSignoff`.
import { Prisma } from '@prisma/client'
import { CAPABILITIES } from '$lib/rbac'
import {
	DEFAULT_INTERVAL_MONTHS,
	planReviewsForCycle,
	type CyclePeriod,
	type UnreviewableEmployee
} from '$lib/server/performance/cycle-plan'
import { answersSchemaFor, templateStructureSchema } from '$lib/server/performance/schemas'
import { isFullySigned, nextSignatorySlot } from '$lib/server/performance/signoff-plan'
import type { ReminderKind } from '$lib/server/performance/reminder-plan'
import type { SignatorySlot } from '$lib/server/performance/types'
import { notify } from './notifications'
import type { AuditContext } from './types'

// ── Review Cycles (org-scoped) ──────────────────────────────────────────────

export async function listReviewCycles(organizationId: string) {
	return db.reviewCycle.findMany({
		where: { organizationId },
		orderBy: { startDate: 'desc' }
	})
}

// ── Performance Reviews (scoped by employee / reviewer) ──────────────────────

// #178 AC6 (was #179): the employee sees NOTHING the evaluator or HR authored until HR RELEASES
// the review. `releasedAt` is that release, and it is the only thing this gate reads — not the
// status, which advances for reasons of its own and would let a workflow change quietly open the
// evaluation.
//
// `answers` holds EVERY evaluator-authored value — ratings, subtotals, total, band, narratives,
// recommendations — in one JSON column, which is exactly why redaction is the single operation
// `answers = null`: no field-picking inside the JSON, and no way to leak one field by forgetting
// it. `managerComments` and `overallRating` are the pre-#178 columns holding the same class of
// content on old rows, so they ride the same gate.
//
// Withheld by DEFAULT: a review with no `releasedAt` — including one whose caller forgot to
// select the column, which arrives as `undefined` — redacts. Only an explicit release opens it.
//
// `selfAssessment` and `employeeComments` are employee-authored, live in their own columns, and
// are never touched in either state.
//
// Renamed from `redactHrAuthored` (#179's unconditional two-field version): the name described
// what it stripped, and the thing that matters now is WHO it strips it for and WHEN.
export function redactForSubject<
	T extends {
		managerComments: string | null
		overallRating: number | null
		answers: unknown
		releasedAt: Date | null
	}
>(review: T): T {
	if (review.releasedAt) return review
	return { ...review, managerComments: null, overallRating: null, answers: null }
}

export async function listReviewsForEmployee(employeeId: string) {
	return db.performanceReview.findMany({
		where: { employeeId },
		include: {
			cycle: { select: { id: true, name: true, status: true } },
			reviewer: { select: { id: true, firstName: true, lastName: true } }
		},
		orderBy: { createdAt: 'desc' }
	})
}

export async function listReviewsForReviewer(reviewerId: string) {
	return db.performanceReview.findMany({
		where: { reviewerId },
		include: {
			cycle: { select: { id: true, name: true, status: true } },
			employee: { select: { id: true, firstName: true, lastName: true } }
		},
		orderBy: { createdAt: 'desc' }
	})
}

export async function getReview(id: string, organizationId: string) {
	const review = await db.performanceReview.findFirst({
		where: { id, cycle: { organizationId } },
		include: {
			cycle: { select: { id: true, name: true, status: true } },
			employee: { select: { id: true, firstName: true, lastName: true } },
			reviewer: { select: { id: true, firstName: true, lastName: true } },
			// #178 item 153 — who released it, for the "released by X on Y" line. Names only; the
			// row already carries `releasedAt` and `releasedByEmployeeId`.
			releasedBy: { select: { firstName: true, lastName: true } }
		}
	})
	if (!review) error(404, 'Performance review not found')
	return review
}

export async function saveSelfAssessment(
	id: string,
	employeeId: string,
	text: string,
	ctx: AuditContext
) {
	const review = await db.performanceReview.findUnique({ where: { id } })
	if (!review) error(404, 'Performance review not found')
	if (review.employeeId !== employeeId) {
		error(409, 'Only the review subject can submit a self-assessment')
	}

	// #324 — one transaction: a failed audit write must not leave the change standing
	// unrecorded while the caller sees a 500.
	return await db.$transaction(async (tx) => {
		const updated = await tx.performanceReview.update({
			where: { id },
			data: {
				selfAssessment: text,
				status: 'SELF_ASSESSMENT',
				submittedAt: new Date()
			}
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PerformanceReview',
				entityId: id,
				newValue: { status: updated.status, submittedAt: updated.submittedAt }
			},
			tx
		)

		return updated
	})
}

/**
 * The evaluator submits what they TYPED (#178 item 123). Capture only — see plan §0: this
 * function stores verbatim and never sums, weights or derives anything.
 *
 * Replaces the deleted `submitManagerReview`, which wrote `managerComments`/`overallRating` and
 * jumped straight to COMPLETED. Those two columns stay on the model because existing rows hold
 * data, but nothing writes them again; the new lifecycle stops at SCORED and routes through
 * SIGNING.
 */
export async function submitScores(
	id: string,
	reviewerId: string,
	answers: unknown,
	ctx: AuditContext
) {
	const review = await db.performanceReview.findUnique({ where: { id } })
	if (!review) error(404, 'Performance review not found')
	if (review.reviewerId !== reviewerId) {
		error(409, 'Only the assigned reviewer can submit scores')
	}

	// RE-VALIDATED HERE, server-side, against THIS review's OWN SNAPSHOT — not the live template
	// and not the caller's word. The page action parses the same answers, but a direct POST
	// bypasses the action entirely, so the service is the last line of defence; and the snapshot
	// is the form the review was opened against, so it is the only correct contract to check.
	const snapshot = review.templateSnapshot as { structure?: unknown } | null
	const structure = templateStructureSchema.safeParse(snapshot?.structure)
	if (!structure.success) error(409, 'This review has no readable form template')

	const parsed = answersSchemaFor(structure.data).safeParse(answers)
	if (!parsed.success) error(422, parsed.error.issues[0]?.message ?? 'Invalid scores')

	// #324 — one transaction: a failed audit write must not leave the change standing
	// unrecorded while the caller sees a 500.
	return await db.$transaction(async (tx) => {
		const updated = await tx.performanceReview.update({
			where: { id },
			data: {
				answers: parsed.data as unknown as Prisma.InputJsonValue,
				status: 'SCORED'
			}
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PerformanceReview',
				entityId: id,
				// STATUS ONLY. The answers must NEVER go in here: the audit log is readable by more
				// people than the review is, so logging them would hand every rating to readers the
				// release gate is meant to hold back. #242 already burned this codebase in exactly
				// this way.
				newValue: { status: updated.status }
			},
			tx
		)

		return updated
	})
}

/**
 * The paper form's "Employee Comments" (#178 item 124) — employee-authored, its OWN column, and
 * ALWAYS visible to the employee. Distinct from `selfAssessment`, which is the pre-scoring stage.
 * Never written into `answers`, which redaction nulls wholesale.
 */
export async function saveEmployeeComments(
	id: string,
	employeeId: string,
	text: string,
	ctx: AuditContext
) {
	const review = await db.performanceReview.findUnique({ where: { id } })
	if (!review) error(404, 'Performance review not found')
	if (review.employeeId !== employeeId) {
		error(409, 'Only the review subject can leave employee comments')
	}

	// #324 — one transaction: a failed audit write must not leave the change standing
	// unrecorded while the caller sees a 500.
	return await db.$transaction(async (tx) => {
		const updated = await tx.performanceReview.update({
			where: { id },
			data: { employeeComments: text }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PerformanceReview',
				entityId: id,
				// That it happened and when — not the text. Same reason as `submitScores`.
				newValue: { employeeCommentsAt: updated.updatedAt }
			},
			tx
		)

		return updated
	})
}

/**
 * HR RELEASES the review to its subject (#178 item 151, SPEC AC7).
 *
 * This is the switch `redactForSubject` reads. Until it is thrown the employee's copy of their
 * own review arrives with `answers` nulled; after it, they see what was written about them.
 *
 * THE CAPABILITY IS ENFORCED AT THE ACTION (`ADMINISTER_HR_ORGWIDE`), not here, matching every
 * other route-guarded surface in this feature. What lives here is the ORG SCOPE, through
 * `cycle.organizationId` — the only path, because `PerformanceReview` carries no
 * `organizationId` column of its own. Same scoping as `getReview` and `attestSignoff`.
 *
 * IDEMPOTENT. A second Release is a no-op: it must not restamp `releasedAt` or overwrite
 * `releasedByEmployeeId`. The first release is the moment the employee became entitled to see the
 * evaluation, and re-stamping it would falsify that record. No audit row and no notification
 * either — nothing changed, so nothing is claimed to have.
 *
 * `userId` is the ACTOR'S USER ID, as every other action in this feature passes.
 * `releasedByEmployeeId` stores an EMPLOYEE id — the UI renders the releaser's name through the
 * `releasedBy` relation and `User` carries no name fields — so the user id is RESOLVED to the
 * actor's employee row here. An HR user with no employee record still releases; the attribution
 * column is left null (the FK is `ON DELETE SET NULL`, so absent attribution is a state the
 * schema allows) and the audit row still names the actor in its own `actorId`.
 */
export async function releaseReview(
	id: string,
	organizationId: string,
	userId: string,
	ctx: AuditContext
) {
	const outcome = await db.$transaction(async (tx) => {
		const review = await tx.performanceReview.findFirst({
			where: { id, cycle: { organizationId } },
			include: { employee: { select: { userId: true } } }
		})
		if (!review) error(404, 'Performance review not found')

		if (review.releasedAt) return { review, released: false as const }

		const releaser = await tx.employee.findFirst({
			where: { userId, organizationId },
			select: { id: true }
		})
		const updated = await tx.performanceReview.update({
			where: { id },
			data: { releasedAt: new Date(), releasedByEmployeeId: releaser?.id ?? null }
		})

		// #324 — `tx` as the third argument, so the audit row shares the fate of the release it
		// describes. A release standing unrecorded is exactly the gap that rule exists to close.
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PerformanceReview',
				entityId: id,
				newValue: {
					releasedAt: updated.releasedAt,
					releasedByEmployeeId: updated.releasedByEmployeeId
				}
			},
			tx
		)

		return { review: { ...updated, employee: review.employee }, released: true as const }
	})

	// AFTER the commit, and only on a real release. Notifying inside the transaction would send a
	// "your review is ready" the rollback then unsends, and notifying on the idempotent path would
	// let a second click re-nudge the employee about nothing.
	if (outcome.released && outcome.review.employee.userId) {
		await notify(
			outcome.review.employee.userId,
			'Your performance evaluation has been released. You can now read it.',
			`/performance/reviews/${id}`,
			'PERFORMANCE'
		)
	}

	return outcome.review
}

// Employee acknowledges a completed review (final step of the cycle).
export async function acknowledgeReview(id: string, employeeId: string, ctx: AuditContext) {
	const review = await db.performanceReview.findUnique({ where: { id } })
	if (!review) error(404, 'Performance review not found')
	if (review.employeeId !== employeeId) error(409, 'Only the review subject can acknowledge')
	if (review.status !== 'COMPLETED') error(400, 'Only a completed review can be acknowledged')

	// #324 — one transaction: a failed audit write must not leave the change standing
	// unrecorded while the caller sees a 500.
	return await db.$transaction(async (tx) => {
		const updated = await tx.performanceReview.update({
			where: { id },
			data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PerformanceReview',
				entityId: id,
				newValue: { status: 'ACKNOWLEDGED' }
			},
			tx
		)
		return updated
	})
}

// ── Automatic cycle generation (#178) ────────────────────────────────────────

/**
 * The shared read + plan behind `openReviewsForCycle`, `listUnreviewable` and
 * `createCycleAndOpenReviews` — and behind the generator script's `--dry-run` preview, which
 * is why it is exported rather than module-private.
 *
 * `cycleId: null` means "no cycle exists yet" (the generator planning a cycle it is about to
 * create). Nobody can already hold a review in a cycle that does not exist, so the
 * already-reviewed set is empty and the query is skipped entirely. That makes a `--dry-run`
 * preview and the real run the SAME code path, so the preview cannot drift from the truth.
 *
 * ORG SCOPING (#323): employees are scoped on the model's OWN `organizationId` column, never
 * through `user: { organizationId }`. A join through the parent asks a different question and
 * is the repo-wide defect class this feature must not add to.
 *
 * The `templateStructureSchema.safeParse` happens HERE and not in the pure planner, because
 * the parse result is needed for the review's `templateSnapshot` anyway. A template whose
 * stored `structure` no longer parses makes its employees `template-invalid` — they are
 * reported to HR, and every other employee's review is still created.
 */
export async function planCycleRoster(organizationId: string, cycleId: string | null) {
	const [employees, existing] = await Promise.all([
		db.employee.findMany({
			where: { organizationId, employmentStatus: 'ACTIVE' },
			select: {
				id: true,
				reportsToId: true,
				assignedTemplateId: true,
				assignedTemplate: { select: { id: true, name: true, structure: true } }
			}
		}),
		cycleId
			? db.performanceReview.findMany({ where: { cycleId }, select: { employeeId: true } })
			: []
	])

	// One parse per template, not per employee — a 300-person org shares a handful of templates.
	const validById = new Map<string, boolean>()
	for (const e of employees) {
		const t = e.assignedTemplate
		if (!t || validById.has(t.id)) continue
		validById.set(t.id, templateStructureSchema.safeParse(t.structure).success)
	}

	const plan = planReviewsForCycle(
		employees.map((e) => ({
			id: e.id,
			reportsToId: e.reportsToId,
			assignedTemplateId: e.assignedTemplateId,
			templateStructureValid: e.assignedTemplateId ? validById.get(e.assignedTemplateId) : undefined
		})),
		existing.map((r) => r.employeeId)
	)

	const templateById = new Map(
		employees.flatMap((e) =>
			e.assignedTemplate ? [[e.assignedTemplate.id, e.assignedTemplate]] : []
		)
	)
	return { ...plan, templateById }
}

/**
 * The `performanceReview.createMany` rows for a planned roster — shared VERBATIM by
 * `openReviewsForCycle` and `createCycleAndOpenReviews`, because a snapshot written two
 * slightly different ways is a snapshot that disagrees with itself.
 *
 * One `snapshotAt` instant for the whole batch, so every review opened by this run agrees on
 * when it was snapshotted.
 */
function reviewRows(
	cycleId: string,
	toCreate: Awaited<ReturnType<typeof planCycleRoster>>['toCreate'],
	templateById: Awaited<ReturnType<typeof planCycleRoster>>['templateById']
) {
	const snapshotAt = new Date().toISOString()
	return toCreate.map((r) => {
		const t = templateById.get(r.templateId)!
		return {
			cycleId,
			employeeId: r.employeeId,
			reviewerId: r.reviewerId,
			templateId: r.templateId,
			// §4.3 — `structure` copied VERBATIM off the template row. Written inside the caller's
			// transaction and never refreshed: editing the template later must not change what an
			// opened review shows.
			templateSnapshot: {
				version: 1,
				templateId: t.id,
				templateName: t.name,
				snapshotAt,
				structure: t.structure as Prisma.InputJsonValue
			},
			status: 'PENDING' as const,
			// Pre-stamped so the reminder cron's `opened` kind does not fire a SECOND notice for
			// an event the cycle generator already announced. `lastReminderAt` stays null because
			// no reminder was actually sent — the generator's own notification stands in for the
			// `opened` nudge. Escalation is untouched: `due-soon`/`overdue` are different kinds.
			lastReminderKind: 'opened' satisfies ReminderKind
		}
	})
}

/**
 * Open a review for every active employee the cycle can plan one for.
 *
 * Idempotent: an employee already holding a review in this cycle is neither re-created nor
 * reported. Everyone else who gets nothing comes back in `unreviewable` WITH THE REASONS —
 * the old `skipped` count conflated "already had one" with "had no manager", so HR could not
 * tell a healthy re-run from a broken roster.
 *
 * ONE `$transaction` per org: the reviews and the audit row commit or roll back together
 * (#324 — `tx` is passed as `writeAuditLog`'s third argument).
 */
export async function openReviewsForCycle(
	cycleId: string,
	organizationId: string,
	ctx: AuditContext
) {
	const cycle = await db.reviewCycle.findFirst({
		where: { id: cycleId, organizationId },
		select: { id: true }
	})
	if (!cycle) error(404, 'Review cycle not found')

	const { toCreate, unreviewable, templateById } = await planCycleRoster(organizationId, cycleId)

	await db.$transaction(async (tx) => {
		if (toCreate.length) {
			await tx.performanceReview.createMany({ data: reviewRows(cycleId, toCreate, templateById) })
		}

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'ReviewCycle',
				entityId: cycleId,
				newValue: { reviewsOpened: toCreate.length, unreviewable: unreviewable.length }
			},
			tx
		)
	})

	return { opened: toCreate.length, unreviewable }
}

/**
 * Create the next cycle as ACTIVE **and** open its reviews in ONE `$transaction` (plan item 98).
 *
 * WHY THIS EXISTS AT ALL. The generator used to create the cycle, then call
 * `openReviewsForCycle`, which opens its own transaction — a nested transaction runs on a
 * different pooled connection and cannot see the uncommitted cycle, so the two writes could
 * never share one. The script compensated by deleting the cycle again on any throw, which is
 * correct on every *exception* path but not on a hard process kill between the two writes:
 * that left an ACTIVE cycle with zero reviews, and since the manual "Open reviews" button was
 * removed there is no way back from that state. Here the cycle row, every review row and the
 * audit row commit together or not at all, so the orphan is not reachable.
 *
 * P2002 ON THE `@@unique([organizationId, startDate, endDate])` IS DELIBERATELY NOT CAUGHT.
 * A second invocation for the same period is the idempotency guarantee, not a failure, and
 * only the caller knows how to report it — the script prints "already generated — skipped"
 * and carries on. Swallowing it here would hide a real duplicate from every other caller.
 *
 * The roster read happens BEFORE the transaction opens, the same way `openReviewsForCycle`
 * does it: reads do not need to be in the write transaction, and holding one open across them
 * would stretch the transaction window for nothing.
 */
export async function createCycleAndOpenReviews(
	organizationId: string,
	period: CyclePeriod,
	ctx: AuditContext
) {
	// `null` — the cycle does not exist yet, so nobody can already hold a review in it.
	const { toCreate, unreviewable, templateById } = await planCycleRoster(organizationId, null)

	return db.$transaction(async (tx) => {
		const cycle = await tx.reviewCycle.create({
			data: {
				organizationId,
				name: period.name,
				startDate: period.startDate,
				endDate: period.endDate,
				// ACTIVE, not DRAFT: nothing activates a cycle by hand any more — the manual HR cycle
				// UI is gone, so a DRAFT cycle would never be opened by anybody.
				status: 'ACTIVE'
			},
			select: { id: true, name: true }
		})

		if (toCreate.length) {
			await tx.performanceReview.createMany({
				data: reviewRows(cycle.id, toCreate, templateById)
			})
		}

		// #324 — `tx` as the third argument, so the audit row shares the fate of the writes it
		// describes.
		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'ReviewCycle',
				entityId: cycle.id,
				newValue: {
					name: period.name,
					startDate: period.startDate,
					endDate: period.endDate,
					status: 'ACTIVE',
					reviewsOpened: toCreate.length
				}
			},
			tx
		)

		return { cycle, opened: toCreate.length, unreviewable }
	})
}

/**
 * Who this cycle could not open a review for, and why.
 *
 * NO TABLE, DELIBERATELY (plan item 95). The list is RECOMPUTED on read by re-running the same
 * pure planner against the current roster and the cycle's existing reviews. A persisted list
 * would go stale the moment HR assigns a template or a manager — it would keep naming people
 * who are fixed. This is one extra query and it is always current. It looks like an omission
 * otherwise, which is why it is written down here.
 */
export async function listUnreviewable(
	cycleId: string,
	organizationId: string
): Promise<UnreviewableEmployee[]> {
	const cycle = await db.reviewCycle.findFirst({
		where: { id: cycleId, organizationId },
		select: { id: true }
	})
	if (!cycle) error(404, 'Review cycle not found')

	const { unreviewable } = await planCycleRoster(organizationId, cycleId)
	return unreviewable
}

// ── Sequential sign-off (#178, plan items 140-142) ───────────────────────────

/**
 * The review shape `resolveSlotHolders` reads, declared STRUCTURALLY rather than as a Prisma
 * payload type so the same function serves `attestSignoff` and `listStalledSignoffs` without
 * either being forced to select exactly the other's columns.
 */
export interface SignoffReview {
	cycle: { organizationId: string }
	employee: {
		userId: string | null
		department: { head: { userId: string | null } | null } | null
	}
	reviewer: { userId: string | null }
}

/**
 * The one include both sign-off readers use. Shared rather than written twice, because two
 * slightly different selects are two slightly different answers to "whose turn is it".
 */
const SIGNOFF_REVIEW_INCLUDE = {
	cycle: { select: { organizationId: true, name: true } },
	employee: {
		select: {
			id: true,
			firstName: true,
			lastName: true,
			userId: true,
			department: { select: { name: true, head: { select: { userId: true } } } }
		}
	},
	reviewer: { select: { userId: true } },
	signoffs: { select: { slotId: true } }
} satisfies Prisma.PerformanceReviewInclude

/**
 * The ordered signatory list for ONE review, read from ITS OWN immutable `templateSnapshot`.
 *
 * NEVER from `PerformanceTemplate.structure`: reordering a template must change the reviews
 * opened afterwards and leave every review already opened exactly as it was. Reading the live
 * template here would silently rewrite the signature order of work in progress.
 *
 * `null` = the snapshot is missing or no longer parses. The caller reports that rather than
 * guessing an order.
 */
function snapshotSignatoryOrder(templateSnapshot: unknown): SignatorySlot[] | null {
	const parsed = templateStructureSchema.safeParse(
		(templateSnapshot as { structure?: unknown } | null)?.structure
	)
	return parsed.success ? parsed.data.signatoryOrder : null
}

/**
 * The USER ids allowed to attest one slot (plan item 140).
 *
 * AN EMPTY ARRAY MEANS STALLED (SPEC AC12) — it is a reportable state, not an error, so this
 * must never throw. A department with no head, in particular, is the ordinary case this
 * feature was asked to surface to HR rather than crash on.
 *
 * HR_REPRESENTATIVE is read from the CAPABILITY TABLE, never from role literals: hard-coding
 * `['HR_ADMIN','SUPER_ADMIN']` duplicates `src/lib/rbac.ts` and silently misses any role added
 * there later. Same shape as `notifyAdmins` in `backup/run.ts`.
 *
 * A null `userId` (an employee with no login) filters OUT. It must not become `[null]`, which
 * would make a stalled slot look staffed and let `holders.includes(userId)` pass on a nullish
 * caller id.
 */
export async function resolveSlotHolders(
	slot: SignatorySlot,
	review: SignoffReview
): Promise<string[]> {
	const only = (userId: string | null | undefined) => (userId ? [userId] : [])

	switch (slot.role) {
		case 'EMPLOYEE':
			return only(review.employee.userId)
		case 'IMMEDIATE_SUPERVISOR':
			return only(review.reviewer.userId)
		case 'DEPARTMENT_HEAD':
			return only(review.employee.department?.head?.userId)
		case 'HR_REPRESENTATIVE': {
			const users = await db.user.findMany({
				where: {
					organizationId: review.cycle.organizationId,
					isActive: true,
					roles: { hasSome: [...CAPABILITIES.ADMINISTER_HR_RECORDS] }
				},
				select: { id: true }
			})
			return users.map((u) => u.id)
		}
	}
}

/**
 * One signatory attests one slot (plan item 141).
 *
 * THE OUT-OF-TURN REJECTION SPEC AC11 REQUIRES LIVES HERE, in the service — not only in the
 * UI. The page hides the Attest button for anyone whose turn it is not, but a direct POST
 * skips the page entirely, so a UI-only check is not a guard at all.
 *
 * THERE IS DELIBERATELY NO SAME-SIGNER CHECK. One person may legitimately hold several slots
 * on the same review (in a small org the immediate supervisor is often also the department
 * head). `@@unique([reviewId, slotId])` is on the SLOT only, for exactly this reason.
 *
 * `isFullySigned` is recomputed INSIDE the transaction from the rows that exist AFTER the
 * insert. Computing it on the pre-insert list is the drift `signoff-plan.ts` exists to
 * prevent: the last signatory's own row would not be counted and the review would never reach
 * COMPLETED.
 */
export async function attestSignoff(
	id: string,
	organizationId: string,
	userId: string,
	typedName: string,
	ctx: AuditContext
) {
	// Trust boundary: the typed name arrives from a form post and lands in a VarChar(200).
	const name = typedName.trim()
	if (!name) error(400, 'Type your full name to attest')
	if (name.length > 200) error(400, 'Typed name must be 200 characters or fewer')

	// Org-scoped through `cycle.organizationId`, exactly as `getReview` does. Cross-tenant
	// WRITING was already closed by the holder check below, but an unscoped lookup still let a
	// caller in another org tell "this review exists" from "it does not" by the 409-vs-404 it
	// got back. Every other reader in this file scopes; this one now does too.
	const review = await db.performanceReview.findFirst({
		where: { id, cycle: { organizationId } },
		include: SIGNOFF_REVIEW_INCLUDE
	})
	if (!review) error(404, 'Performance review not found')

	const signatoryOrder = snapshotSignatoryOrder(review.templateSnapshot)
	if (!signatoryOrder) error(409, 'This review has no readable form template')

	const slot = nextSignatorySlot(signatoryOrder, review.signoffs)
	if (!slot) error(400, 'This review is already fully signed')

	const holders = await resolveSlotHolders(slot, review)
	if (!holders.includes(userId)) {
		error(409, `This review is waiting on the ${slot.label} — it is not your turn to sign`)
	}

	// Denormalized from the SNAPSHOT slot at attest time, per the column comments on
	// ReviewSignoff. The turn check above still derives from the order, never from `order`.
	const order = signatoryOrder.findIndex((s) => s.id === slot.id)

	try {
		return await db.$transaction(async (tx) => {
			const signoff = await tx.reviewSignoff.create({
				data: {
					reviewId: id,
					slotId: slot.id,
					roleLabel: slot.label,
					order,
					attestedByUserId: userId,
					typedName: name
				},
				select: { id: true }
			})

			// POST-INSERT rows, read back inside the same transaction — see the note above.
			const signed = await tx.reviewSignoff.findMany({
				where: { reviewId: id },
				select: { slotId: true }
			})
			const complete = isFullySigned(signatoryOrder, signed)

			const updated = await tx.performanceReview.update({
				where: { id },
				data: complete ? { status: 'COMPLETED', completedAt: new Date() } : { status: 'SIGNING' }
			})

			// #324 — `tx` as the third argument, so the audit row shares the fate of the signature
			// it describes. The typed name is not logged: it is on the signoff row, and the audit
			// log is readable by more people than the review is.
			await writeAuditLog(
				ctx,
				{
					action: 'CREATE',
					entityType: 'ReviewSignoff',
					entityId: signoff.id,
					newValue: {
						reviewId: id,
						slotId: slot.id,
						roleLabel: slot.label,
						order,
						status: updated.status
					}
				},
				tx
			)

			return updated
		})
	} catch (e) {
		// THE RACE THE RELATIONAL TABLE EXISTS FOR: two valid holders of one slot attesting at
		// the same instant. The unique constraint is the arbiter — a pre-read cannot be, because
		// both readers would see the slot unsigned.
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
			error(409, 'That signature was just recorded by someone else')
		}
		throw e
	}
}

export interface StalledSignoff {
	reviewId: string
	employeeId: string
	employeeName: string
	departmentName: string
	cycleName: string
	slot: SignatorySlot
}

/**
 * Reviews in SCORED/SIGNING whose next slot resolves to NOBODY (plan item 142, SPEC AC12).
 *
 * A SEPARATE VIEW FROM `listUnreviewable`, deliberately: unreviewable means the review was
 * never created; stalled means it exists, is part-way through, and cannot advance. Merging
 * them would hide one behind the other.
 *
 * RECOMPUTED ON READ, with no stored flag — the same reasoning as `listUnreviewable`. A
 * persisted "stalled" boolean goes stale the moment HR assigns a department head, and would
 * keep naming reviews that are already unblocked.
 *
 * Org-scoped through `cycle.organizationId` because PerformanceReview carries no
 * `organizationId` column of its own — the same scoping `getReview` uses.
 */
export async function listStalledSignoffs(organizationId: string): Promise<StalledSignoff[]> {
	const reviews = await db.performanceReview.findMany({
		where: { status: { in: ['SCORED', 'SIGNING'] }, cycle: { organizationId } },
		include: SIGNOFF_REVIEW_INCLUDE
	})

	const stalled = await Promise.all(
		reviews.map(async (review) => {
			const signatoryOrder = snapshotSignatoryOrder(review.templateSnapshot)
			if (!signatoryOrder) return null
			const slot = nextSignatorySlot(signatoryOrder, review.signoffs)
			if (!slot) return null
			const holders = await resolveSlotHolders(slot, review)
			if (holders.length) return null
			return {
				reviewId: review.id,
				employeeId: review.employee.id,
				employeeName: `${review.employee.firstName} ${review.employee.lastName}`,
				departmentName: review.employee.department.name,
				cycleName: review.cycle.name,
				slot
			}
		})
	)

	return stalled.filter((s): s is StalledSignoff => s !== null)
}

// ── Cadence config (#178) ────────────────────────────────────────────────────

export const PERFORMANCE_CONFIG_BOUNDS = {
	intervalMonths: { min: 1, max: 24 },
	dueDays: { min: 1, max: 180 }
} as const

/**
 * The org's cadence settings, or the schema defaults when no row exists.
 *
 * Deliberately NOT written on read, mirroring `getBackupSettings`: the generator cron reads
 * this every night, and a config row created as a side effect of a read would claim an org was
 * configured by someone when nobody had touched it. Only `savePerformanceConfig` creates it.
 */
export async function getPerformanceConfig(organizationId: string) {
	const config = await db.performanceConfig.findUnique({
		where: { organizationId },
		select: { enabled: true, intervalMonths: true, dueDays: true }
	})
	return config ?? { enabled: true, intervalMonths: DEFAULT_INTERVAL_MONTHS, dueDays: 14 }
}

/**
 * Save the cadence settings.
 *
 * The bounds are enforced HERE, not only in the route's zod schema: the service is the last
 * line of defence and a direct caller (a script, the cron, a later route) bypasses the route
 * entirely. An unbounded `intervalMonths` of 0 makes every tick due forever.
 */
export async function savePerformanceConfig(
	organizationId: string,
	data: { enabled: boolean; intervalMonths: number; dueDays: number },
	ctx: AuditContext
) {
	const { intervalMonths, dueDays } = PERFORMANCE_CONFIG_BOUNDS
	if (
		!Number.isInteger(data.intervalMonths) ||
		data.intervalMonths < intervalMonths.min ||
		data.intervalMonths > intervalMonths.max
	) {
		error(
			400,
			`Interval must be a whole number between ${intervalMonths.min} and ${intervalMonths.max} months`
		)
	}
	if (!Number.isInteger(data.dueDays) || data.dueDays < dueDays.min || data.dueDays > dueDays.max) {
		error(400, `Due days must be a whole number between ${dueDays.min} and ${dueDays.max}`)
	}

	// One transaction: a failed audit write must not leave a cadence change standing unrecorded,
	// and reading `before` inside it stops two concurrent saves logging the same oldValue.
	return await db.$transaction(async (tx) => {
		const before = await tx.performanceConfig.findUnique({
			where: { organizationId },
			select: { enabled: true, intervalMonths: true, dueDays: true }
		})
		const config = await tx.performanceConfig.upsert({
			where: { organizationId },
			create: { organizationId, ...data },
			update: data,
			select: { id: true, enabled: true, intervalMonths: true, dueDays: true }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PerformanceConfig',
				entityId: config.id,
				oldValue: before ?? undefined,
				newValue: data
			},
			tx
		)
		return config
	})
}

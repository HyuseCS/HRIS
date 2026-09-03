import { addUTCMonths, manilaDayKey } from '$lib/utils/dates'

// The pure core of automatic review-cycle generation (#178, plan items 92/98). NOTHING in
// this file may touch the database, the filesystem or the network, and there is no
// `Date.now()` — time is ALWAYS an argument. That is what makes every scheduling decision
// reproducible in a unit test, and it is the only reason `scripts/generate-review-cycles.ts`
// can stay a thin IO shell with no date arithmetic of its own. Modelled on
// `src/lib/server/backup/plan.ts`.
//
// TWO TIMEZONE BASES LIVE IN THIS FILE, deliberately, and each exported function names its
// own at the point of use (plan §PHASE 5, "Dates first — the #320 trap"):
//   - "is a cycle due yet?"  → MANILA. A wall-clock business question; a UTC answer is 8
//     hours out and flips the day around the boundary.
//   - "what are the period's dates?" → UTC month-stepping. The day-of-month must survive
//     the step; local-time month math drifts a day for PHT.
// Do not harmonise them. `monthsOfService` (Manila) and `regularizationDate` (UTC) disagree
// for exactly the same reason.
//
// THE RULE THIS FILE EXISTS UNDER (plan §0): the app performs NO arithmetic on evaluation
// scores. This module plans cycles and reviews. It must never compute, sum or average a score.

/** Falls back to `PerformanceConfig.intervalMonths`'s schema default when no row exists. */
export const DEFAULT_INTERVAL_MONTHS = 2

const DAY_MS = 24 * 60 * 60 * 1000

const MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
]

/**
 * Is this organization due for a new review cycle?
 *
 * **MANILA basis.** Both sides of the comparison go through `manilaDayKey`, so the question
 * asked is the one HR in PHT actually asks: "is today, on the office calendar, on or past the
 * boundary day?" A raw UTC comparison answers a different question and is wrong by up to 8
 * hours — enough to flip the day, which is the #320 bug class.
 *
 * Measured from the last cycle's **END**, never its start: a cycle covers a period that can
 * only be evaluated once it has finished, so the next one becomes due one full interval after
 * the previous period closed.
 *
 * The boundary is `nextCyclePeriod`'s own `endDate` rather than a second piece of month math,
 * so the two exports cannot drift apart — and so month-end overflow cannot creep in. Stepping
 * a Jul 31 close forward two months lands on Oct 1, not Sep 30 (`addUTCMonths` overflows short
 * months by design), which would have made every close-of-month cadence a day wrong.
 *
 * There is **NO CATCH-UP LOOP**, matching `isRunDue`'s audited semantics in
 * `src/lib/server/backup/plan.ts`. Three missed boundaries still produce ONE cycle on the next
 * tick — the caller creates a single period and the org is back on cadence.
 */
export function isCycleDue(
	cfg: { enabled: boolean; intervalMonths: number },
	lastCycleEnd: Date | null,
	now: Date
): boolean {
	if (!cfg.enabled) return false
	if (!lastCycleEnd) return true
	// The period is built in UTC (day-of-month stability); the comparison that follows buckets
	// both instants into Manila calendar days. Due strictly AFTER the period's last day.
	const { endDate } = nextCyclePeriod(lastCycleEnd, cfg.intervalMonths, now)
	return manilaDayKey(now) > manilaDayKey(endDate)
}

export interface CyclePeriod {
	startDate: Date
	endDate: Date
	name: string
}

/**
 * The dates of the next cycle to create.
 *
 * **UTC month-stepping basis**, via `addUTCMonths`. The returned dates are UTC-midnight
 * anchors, the same convention `regularizationDate` uses, so the day-of-month survives the
 * step. Periods are CLOSED at both ends and never overlap: the previous cycle ending Sep 30
 * gives Oct 1 – Nov 30.
 *
 * `now` is read **only** when the organization has no cycle yet (MANILA basis there — the
 * seed period is anchored on today's PHT calendar month, so a 16:00-UTC tick does not seed
 * the previous month). Once `lastCycleEnd` exists the answer is a function of it alone: that
 * is what makes "no catch-up" true, because however late the tick is, exactly one period
 * comes back.
 */
export function nextCyclePeriod(
	lastCycleEnd: Date | null,
	intervalMonths: number,
	now: Date
): CyclePeriod {
	let startDate: Date
	if (lastCycleEnd) {
		// The day after the previous close — UTC parts, because the stored end is a UTC-midnight anchor.
		startDate = new Date(lastCycleEnd.getTime() + DAY_MS)
		startDate = new Date(
			Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
		)
	} else {
		// First cycle: the whole months ending with the month before today's MANILA month, so
		// the org starts month-aligned and every later period inherits that alignment.
		const [y, m] = manilaDayKey(now).split('-').map(Number)
		startDate = addUTCMonths(new Date(Date.UTC(y, m - 1, 1)), -intervalMonths)
	}
	// End = one day before the same day-of-month `intervalMonths` on. Stepping from the START
	// (not the end) keeps month-end overflow out of it: Aug 1 + 2 = Oct 1 → Sep 30.
	const endDate = new Date(addUTCMonths(startDate, intervalMonths).getTime() - DAY_MS)
	return { startDate, endDate, name: cycleName(startDate, endDate) }
}

/**
 * The generated label, e.g. `"Aug–Sep 2026"` / `"Dec 2026–Jan 2027"` / `"Aug 2026"`.
 *
 * **UTC basis** — read straight off the UTC-midnight anchors `nextCyclePeriod` built, so the
 * printed months are the ones the stored dates say. Display only; nothing parses it back.
 */
function cycleName(startDate: Date, endDate: Date): string {
	const sy = startDate.getUTCFullYear()
	const ey = endDate.getUTCFullYear()
	const sm = MONTH_NAMES[startDate.getUTCMonth()]
	const em = MONTH_NAMES[endDate.getUTCMonth()]
	if (sy !== ey) return `${sm} ${sy}–${em} ${ey}`
	if (sm === em) return `${sm} ${sy}`
	return `${sm}–${em} ${sy}`
}

/** Why an active employee gets no review this cycle. HR sees these; nobody is silently skipped. */
export type UnreviewableReason = 'no-template-assigned' | 'no-manager' | 'template-invalid'

export interface PlannableEmployee {
	id: string
	/** The evaluator. Null = nobody can be asked to write the review. */
	reportsToId: string | null
	/** Explicit assignment only — never inferred from department or position. */
	assignedTemplateId: string | null
	/**
	 * `false` when the assigned template's `structure` column failed
	 * `templateStructureSchema.safeParse`. Defaults to `true`; only read when a template is
	 * assigned. The parse itself is the caller's, because the caller needs the parsed
	 * structure for the review's `templateSnapshot` anyway.
	 */
	templateStructureValid?: boolean
}

export interface PlannedReview {
	employeeId: string
	reviewerId: string
	templateId: string
}

export interface UnreviewableEmployee {
	employeeId: string
	/** ALL the reasons that apply, never just the first — an employee can fail on both counts. */
	reasons: UnreviewableReason[]
}

/**
 * Split the roster into "open a review" and "tell HR why not".
 *
 * **No timezone basis — this function reads no clock at all.** It is pure set logic over the
 * roster the caller already scoped and queried.
 *
 * Idempotent: an employee already holding a review in this cycle is skipped entirely — they
 * are neither created again nor reported as unreviewable. Running the generator twice over the
 * same cycle therefore plans nothing the second time.
 *
 * An employee missing BOTH a template and a manager reports BOTH reasons. Short-circuiting on
 * the first failure would have HR fix one thing, re-run, and be told about the next.
 */
export function planReviewsForCycle(
	employees: PlannableEmployee[],
	existingEmployeeIds: Iterable<string>
): { toCreate: PlannedReview[]; unreviewable: UnreviewableEmployee[] } {
	const seen = new Set(existingEmployeeIds)
	const toCreate: PlannedReview[] = []
	const unreviewable: UnreviewableEmployee[] = []

	for (const e of employees) {
		if (seen.has(e.id)) continue
		const reasons: UnreviewableReason[] = []
		if (!e.assignedTemplateId) reasons.push('no-template-assigned')
		else if (e.templateStructureValid === false) reasons.push('template-invalid')
		if (!e.reportsToId) reasons.push('no-manager')

		if (reasons.length) unreviewable.push({ employeeId: e.id, reasons })
		else
			toCreate.push({
				employeeId: e.id,
				reviewerId: e.reportsToId!,
				templateId: e.assignedTemplateId!
			})
	}
	return { toCreate, unreviewable }
}

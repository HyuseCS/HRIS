// Standard Philippine pay-period shapes (#129). The client runs a semi-monthly cadence:
//   • FIRST_HALF   — the 1st through the 15th
//   • SECOND_HALF  — the 16th through the (dynamic) end of month
//   • WHOLE_MONTH  — the 1st through the end of month (benefits / adjustment runs)
//
// Periods are represented as UTC-midnight calendar dates (`new Date(Date.UTC(y, m, d))`),
// matching the `<input type="date">` convention used across the app — a date input value
// of "2026-05-01" parses to exactly this instant, so pickers and stored rows round-trip
// without timezone drift. The data model is unchanged; the shape lives in this helper, the
// service layer, and the UI. Legacy off-cycle rows with arbitrary dates stay readable —
// `describePeriod`/`isValidStandardPeriod` simply report them as non-standard.

import { manilaDayKey } from './dates'

export type PeriodKind = 'FIRST_HALF' | 'SECOND_HALF' | 'WHOLE_MONTH'

export const PERIOD_KINDS: readonly PeriodKind[] = ['FIRST_HALF', 'SECOND_HALF', 'WHOLE_MONTH']

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
]

/** Number of days in the given month. `month0` is 0-based (0 = January). */
export function daysInMonth(year: number, month0: number): number {
	// Day 0 of the next month is the last day of this one.
	return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

/** UTC-midnight calendar date. */
function utcDay(year: number, month0: number, day: number): Date {
	return new Date(Date.UTC(year, month0, day))
}

/** Bounds of a standard period. `month0` is 0-based; the end date is inclusive. */
export function periodOf(
	kind: PeriodKind,
	year: number,
	month0: number
): { periodStart: Date; periodEnd: Date } {
	const eom = daysInMonth(year, month0)
	switch (kind) {
		case 'FIRST_HALF':
			return { periodStart: utcDay(year, month0, 1), periodEnd: utcDay(year, month0, 15) }
		case 'SECOND_HALF':
			return { periodStart: utcDay(year, month0, 16), periodEnd: utcDay(year, month0, eom) }
		case 'WHOLE_MONTH':
			return { periodStart: utcDay(year, month0, 1), periodEnd: utcDay(year, month0, eom) }
	}
}

/** Inclusive day count of a period (FIRST_HALF is always 15; the others vary by month). */
export function periodDays(start: Date, end: Date): number {
	const ms = utcMidnight(end).getTime() - utcMidnight(start).getTime()
	return Math.round(ms / (24 * 60 * 60 * 1000)) + 1
}

/** UTC-midnight first calendar day of `d`'s month — the statutory basis anchor for #170/#171. */
export function firstDayOfMonth(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

/** Drop any intra-day component so comparisons are on the calendar day only. */
export function utcMidnight(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Classify a stored (start, end) pair. Returns the matched `kind` (or null when the pair
 * isn't one of the three standard shapes) plus display metadata. `label` reads e.g.
 * "May 2026 · 1–15", "May 2026 · 16–31", or "May 2026 · Whole month"; non-standard pairs
 * fall back to a plain range label so legacy rows still render.
 */
export function describePeriod(
	start: Date,
	end: Date
): { kind: PeriodKind | null; year: number; month0: number; label: string } {
	const s = utcMidnight(start)
	const e = utcMidnight(end)
	const year = s.getUTCFullYear()
	const month0 = s.getUTCMonth()
	const monthName = MONTH_NAMES[month0]

	// A standard period never spans two months, so start and end share year+month.
	const sameMonth = e.getUTCFullYear() === year && e.getUTCMonth() === month0
	if (sameMonth) {
		const startDay = s.getUTCDate()
		const endDay = e.getUTCDate()
		const eom = daysInMonth(year, month0)
		if (startDay === 1 && endDay === 15)
			return { kind: 'FIRST_HALF', year, month0, label: `${monthName} ${year} · 1–15` }
		if (startDay === 16 && endDay === eom)
			return { kind: 'SECOND_HALF', year, month0, label: `${monthName} ${year} · 16–${eom}` }
		if (startDay === 1 && endDay === eom)
			return { kind: 'WHOLE_MONTH', year, month0, label: `${monthName} ${year} · Whole month` }
	}

	// Non-standard / legacy row: describe the raw range without a kind.
	return { kind: null, year, month0, label: `${formatDay(s)} – ${formatDay(e)}` }
}

function formatDay(d: Date): string {
	return `${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** True when (start, end) is exactly one of the three standard period shapes. */
export function isValidStandardPeriod(start: Date, end: Date): boolean {
	return describePeriod(start, end).kind !== null
}

/**
 * Every calendar month the inclusive range touches, in order. Empty for a reversed range.
 * One walker, two consumers (`summedMonthShare` and the cutoff guard) — month arithmetic
 * written twice is month arithmetic that drifts once.
 */
export function monthsTouched(start: Date, end: Date): { year: number; month0: number }[] {
	const s = utcMidnight(start)
	const e = utcMidnight(end)
	if (e.getTime() < s.getTime()) return []
	const last = firstDayOfMonth(e).getTime()
	const out: { year: number; month0: number }[] = []
	let cursor = firstDayOfMonth(s)
	while (cursor.getTime() <= last) {
		out.push({ year: cursor.getUTCFullYear(), month0: cursor.getUTCMonth() })
		cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
	}
	return out
}

/**
 * Sum, over every month the range touches, of that month's slice as a fraction of the month:
 * inclusive days inside the month ÷ days in the month. `1 Feb → 3 Mar 2026` is 28/28 + 3/31.
 *
 * NON-THROWING by contract, and `0` for a reversed range — the picker calls it for display and
 * `scripts/legacy-nonstandard-runs.ts` calls it for a read-only scan of stored rows.
 *
 * For a same-month range this is arithmetically identical to `periodDays ÷ daysInMonth`: one term,
 * same numerator, same divisor. That identity is what keeps the #163 peso goldens still.
 */
export function summedMonthShare(start: Date, end: Date): number {
	const s = utcMidnight(start)
	const e = utcMidnight(end)
	let acc = 0
	for (const { year, month0 } of monthsTouched(s, e)) {
		const eom = daysInMonth(year, month0)
		const sliceStart = Math.max(s.getTime(), Date.UTC(year, month0, 1))
		const sliceEnd = Math.min(e.getTime(), Date.UTC(year, month0, eom))
		acc += periodDays(new Date(sliceStart), new Date(sliceEnd)) / eom
	}
	return acc
}

/**
 * Fraction of a monthly figure that accrues in this period, for statutory proration (#129/#163/#3).
 *
 * The three standard shapes are FROZEN and must never move: WHOLE_MONTH carries the full month
 * (exactly 1) and FIRST_HALF / SECOND_HALF carry exactly 0.5, for every month length. There is no
 * single-formula simplification — May 1–15 is 15/31 = 0.4839 by day count, but the client's
 * semi-monthly cadence pays it as half a month. Those three short-circuits stay physically ABOVE
 * the day counting; do not reorder them and do not fold them into the sum.
 *
 * Anything else prorates by `summedMonthShare` — the summed month slices — so a custom range that
 * crosses a calendar-month boundary (#3) carries the fraction it actually covers, not a flat half.
 *
 * The one-month CAP DOES NOT LIVE HERE. It lives at the three service gates (`createPayrollRun`,
 * `openPeriod`, `createTimesheet`) via `customRangeError`, so an over-cap range is refused before
 * anything is written. A NEW range therefore cannot reach this function above the cap.
 *
 * What can is a legacy stored pair: `computePayroll` gates on run status only, never on period
 * shape, so a legacy cross-month or reversed row still arrives here on Recompute. Those keep the
 * historical flat 0.5 — a reversed or zero share, and an over-cap one too. Over-cap rows are NOT
 * clamped to 1: clamping would silently turn a stored 92-day row into a full month's pay, and
 * `earnings.ts` multiplies basic pay by this share with no second clamp downstream. The result is
 * therefore always in (0, 1], with no tolerance — see the exhaustive sweep in the unit tests.
 */
export function periodShareOf(start: Date, end: Date): number {
	const kind = describePeriod(start, end).kind
	if (kind === 'WHOLE_MONTH') return 1
	if (kind === 'FIRST_HALF' || kind === 'SECOND_HALF') return 0.5
	const share = summedMonthShare(start, end)
	if (!(share > 0)) return 0.5 // reversed / NaN — legacy rows only
	if (share > 1) return 0.5 // an over-cap LEGACY row keeps its historical flat half-month
	return share
}

/** e.g. "June 2026" — the month the cutoff refusal must name once two months are in play. */
export function monthYearLabel(year: number, month0: number): string {
	return `${MONTH_NAMES[month0]} ${year}`
}

/**
 * The refusal for a custom range, or null when it is acceptable. NON-THROWING by contract: the
 * PeriodPicker calls it for its inline message and cannot call SvelteKit's `error()`. The three
 * service gates wrap it in `error(400, …)`. One function, so the browser copy and the 400 body are
 * the same string by construction — before this, both strings were duplicated verbatim across four
 * files with nothing checking they agreed.
 *
 * The cap is one month of pay and the comparison is the bare `share > 1` — no constant, no epsilon.
 * A tolerance would only be needed if a legitimate range summed to exactly 1 in exact arithmetic but
 * landed above 1 in IEEE-754. No such range exists: the slice-tuple space is finite and was
 * enumerated exhaustively (69,876 tuples, 116 of them summing to exactly 1, all landing on float 1).
 * That property is held by a test, not by this comment — see 'the cap needs no tolerance'.
 */
export function customRangeError(start: Date, end: Date): string | null {
	if (utcMidnight(end) < utcMidnight(start)) return 'End date must be on or after the start date.'
	const share = summedMonthShare(start, end)
	if (share > 1)
		return `A custom period cannot cover more than one month of pay. This range covers ${Math.round(share * 100)}% of a month. Shorten it.`
	return null
}

/**
 * True when two inclusive ranges share at least one PHILIPPINE calendar day (#163).
 *
 * Overlap must be decided on the day the range means, not on the instant it is stored. New rows
 * are written as UTC midnight (`<input type="date">`), but legacy rows sit on PHT day boundaries —
 * a stored `2026-08-09T16:00:00.000Z` is **August 10** in Manila. Truncating that to UTC August 9
 * reports a range ending August 9 as overlapping when the two are merely adjacent, and refuses a
 * legitimate save. Both conventions bucket correctly through `manilaDayKey`, and `YYYY-MM-DD`
 * strings compare safely with `<=`.
 *
 * Callers keep a DB range filter as the cheap coarse pass; it must be widened by a day on each
 * side, because a row whose UTC bounds fall outside the window can still be inside it in Manila.
 */
export function rangesOverlapInManila(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
	return manilaDayKey(aStart) <= manilaDayKey(bEnd) && manilaDayKey(bStart) <= manilaDayKey(aEnd)
}

/** Human range for a picker preview, e.g. "May 1 – May 15, 2026 (15 days)". */
export function formatPeriodPreview(start: Date, end: Date): string {
	const s = utcMidnight(start)
	const e = utcMidnight(end)
	const startStr = `${MONTH_NAMES[s.getUTCMonth()].slice(0, 3)} ${s.getUTCDate()}`
	const endStr = `${MONTH_NAMES[e.getUTCMonth()].slice(0, 3)} ${e.getUTCDate()}, ${e.getUTCFullYear()}`
	return `${startStr} – ${endStr} (${periodDays(s, e)} days)`
}

/** YYYY-MM-DD of a UTC-midnight period date, for `<input type="date">` / hidden fields. */
export function toPeriodInputValue(d: Date): string {
	return utcMidnight(d).toISOString().slice(0, 10)
}

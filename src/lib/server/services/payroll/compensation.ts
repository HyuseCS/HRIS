/**
 * Mid-period compensation resolver (#170/#171). Pure and DB-free so it unit-tests in isolation and
 * the payroll engine stays the only place that touches the DB.
 *
 * Given an employee's effective-dated compensation history and a pay period, it produces:
 *  - `segments`  — the day-split basic-pay segments (a change effective mid-period starts a new one),
 *                  each carrying a `weight` = periodShare · (segment working days / period working
 *                  days), so Σ weight == periodShare and the segments reconcile to today's proration.
 *  - `statutoryBasis` — the comp effective on the FIRST calendar day of the period's month. This is
 *                  the Finance "next month" rule (#170 decision B): a change effective on day 1 counts
 *                  that month; a change effective day 2..EOM only reaches statutory the following month.
 *  - `periodEnd` — the latest comp in effect during the period (drives premium/tardiness rate and the
 *                  pay-basis flip in Stage 2).
 *
 * Working-day counts are holiday-aware, so the caller injects `countWorkingDays` (the run already has
 * `computeWorkingDays` + the holiday list); the resolver never imports a holiday calendar.
 *
 * Parity: with no history (or only a hire-baseline row effective ≤ periodStart) there is one full-period
 * segment whose weight is exactly `periodShare`, and `statutoryBasis` == `periodEnd`, so the engine's
 * output is byte-identical to the pre-#170 behaviour.
 */

import type { RateType } from '@prisma/client'
import { D, type Money, type MoneyLike } from './money'
import { firstDayOfMonth, periodDays, utcMidnight } from '$lib/utils/pay-periods'

/** One persisted `EmployeeCompensation` row (loose shape — independent of the Prisma client type). */
export interface CompRow {
	basicMonthlySalary: MoneyLike
	rateType: RateType
	effectiveDate: Date
	changedAt: Date
}

export interface Comp {
	salary: Money
	rateType: RateType
}

export interface CompSegment extends Comp {
	/** Inclusive UTC-midnight bounds of this segment within the period (Stage 2 splits attendance here). */
	start: Date
	end: Date
	/** periodShare · (segment working days / period working days); Σ weight == periodShare. */
	weight: Money
}

export interface PeriodCompensation {
	segments: CompSegment[]
	statutoryBasis: Comp
	periodEnd: Comp
}

const DAY_MS = 24 * 60 * 60 * 1000
const dayBefore = (d: Date): Date => new Date(d.getTime() - DAY_MS)

/** Lift history into decimal rows, ascending by (effectiveDate, changedAt) so the last row on/before
 *  a date wins the tiebreak. */
function sortedRows(history: CompRow[]) {
	return history
		.map((r) => ({
			salary: D(r.basicMonthlySalary),
			rateType: r.rateType,
			eff: utcMidnight(r.effectiveDate).getTime(),
			seq: r.changedAt.getTime()
		}))
		.sort((a, b) => a.eff - b.eff || a.seq - b.seq)
}

/** The comp in effect at time `t`: the latest row with effectiveDate ≤ t, else `fallback`. `rows`
 *  must be pre-sorted by `sortedRows`; `t` is a UTC-midnight epoch ms. */
function compAt(rows: ReturnType<typeof sortedRows>, t: number, fallback: Comp): Comp {
	let picked: (typeof rows)[number] | undefined
	for (const r of rows) {
		if (r.eff <= t) picked = r
		else break
	}
	return picked ? { salary: picked.salary, rateType: picked.rateType } : fallback
}

/**
 * The employee's current compensation as of `asOf` (#170 Stage 1.5): the latest snapshot with
 * effectiveDate ≤ asOf (UTC-midnight, changedAt tiebreak), else `fallback`. A future-dated snapshot
 * is ignored until its date arrives. This is the read the cache-heal in `getEmployee` uses, so
 * secondary readers (display, final pay) reflect the correct current figure without a scheduler.
 */
export function currentCompensation(
	history: CompRow[],
	asOf: Date,
	fallback: { basicMonthlySalary: MoneyLike; rateType: RateType }
): Comp {
	return compAt(sortedRows(history), utcMidnight(asOf).getTime(), {
		salary: D(fallback.basicMonthlySalary),
		rateType: fallback.rateType
	})
}

export function compensationForPeriod(
	history: CompRow[],
	periodStart: Date,
	periodEnd: Date,
	periodShare: number,
	fallback: { basicMonthlySalary: MoneyLike; rateType: RateType },
	countWorkingDays: (start: Date, end: Date) => number
): PeriodCompensation {
	const start = utcMidnight(periodStart)
	const end = utcMidnight(periodEnd)
	const share = D(periodShare)
	const fallbackComp: Comp = { salary: D(fallback.basicMonthlySalary), rateType: fallback.rateType }

	const rows = sortedRows(history)
	const compOn = (d: Date): Comp => compAt(rows, d.getTime(), fallbackComp)

	// Accepted limitation (D2, cross-month-periods-3 SPEC — see
	// process/features/flexible-periods/active/cross-month-periods-3_02-09-26/cross-month-periods-3_SPEC_02-09-26.md):
	// for a cross-month period this still anchors the statutory bracket basis to the FIRST day of
	// month ONE, not the period's own start. A pay change effective in month two therefore does NOT
	// move that employee's SSS/PhilHealth/Pag-IBIG bracket for this period — only their basic pay
	// (below) reflects the mid-period change; statutory catches up the following month. This is a
	// deliberate owner decision, not a bug — do NOT extend the #170/#171 segment machinery to "fix"
	// it. The `payroll-mid-period`, `compensation-resolver`, `payroll-statutory-basis`,
	// `compensation-heal` and `employee-api-compensation` suites are the parity detector: if any of
	// them goes red, this anchor moved and the change is wrong.
	const statutoryBasis = compOn(firstDayOfMonth(start))
	const periodEndComp = compOn(end)

	// Segment boundaries: distinct change dates strictly inside (start, end]. A change effective on
	// periodStart is not a boundary — it simply sets the first segment's comp.
	const boundaries = [
		...new Set(rows.map((r) => r.eff).filter((t) => t > start.getTime() && t <= end.getTime()))
	].sort((a, b) => a - b)

	const starts = [start, ...boundaries.map((t) => new Date(t))]
	const ranges = starts.map((s, i) => ({
		start: s,
		end: i < starts.length - 1 ? dayBefore(starts[i + 1]) : end
	}))

	let segments: CompSegment[]
	if (ranges.length === 1) {
		// No in-period change: one segment carrying the whole period's share exactly (parity anchor).
		const c = compOn(start)
		segments = [{ start: ranges[0].start, end: ranges[0].end, ...c, weight: share }]
	} else {
		const wd = ranges.map((r) => countWorkingDays(r.start, r.end))
		const totalWd = wd.reduce((a, b) => a + b, 0)
		// Degenerate period with zero working days → fall back to calendar-day weighting.
		const totalCal = periodDays(start, end)
		segments = ranges.map((r, i) => {
			const c = compOn(r.start)
			// Multiply before the single division so the per-segment weights sum back to periodShare
			// without a double-rounding drift (decimal.js divides at 20 sig figs).
			const weight =
				totalWd > 0
					? share.times(wd[i]).dividedBy(totalWd)
					: share.times(periodDays(r.start, r.end)).dividedBy(totalCal)
			return { start: r.start, end: r.end, ...c, weight }
		})
	}

	return { segments, statutoryBasis, periodEnd: periodEndComp }
}

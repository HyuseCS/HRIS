import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import { Prisma, type Role } from '@prisma/client'
import { canAny } from '$lib/rbac'
import { computeEmployeeResult } from './calculator'
import { compensationForPeriod, type CompSegment } from './compensation'
import { ratesFromRule } from './rates'
import { statutoryRatesFromConfig } from './statutory-rates'
import { type AmortItem } from './deductions'
import { recurringDeductionComponents } from './employee-deductions'
import {
	statutoryExemptions,
	employerShareExternals,
	statutoryAllocations
} from './employee-statutory'
import { D, q2, q2n, sum, ZERO } from './money'
import { emptyAttendance, round2, type ComputeSegment, type EmployeeComp } from './types'
import { buildAttendanceInput, buildSegmentAttendance } from '../attendance/input'
import { computeWorkingDays, manilaDayKey } from '$lib/utils/dates'
import {
	customRangeError,
	describePeriod,
	isValidStandardPeriod,
	monthYearLabel,
	monthsTouched,
	periodOf,
	periodShareOf,
	rangesOverlapInManila,
	utcMidnight
} from '$lib/utils/pay-periods'
import { formatShortDate } from '$lib/utils/format'
import { ensurePayrollApprovalChain } from '../approvals'
import { assertCanTouchEmployee } from '../employee-access'
import type { AuditContext } from '../types'

function groupByEmployee<T extends { employeeId: string }>(rows: T[]): Map<string, T[]> {
	const map = new Map<string, T[]>()
	for (const row of rows) {
		const list = map.get(row.employeeId) ?? []
		list.push(row)
		map.set(row.employeeId, list)
	}
	return map
}

/**
 * #170/#171 Stage 2: turn the resolver's day-split segments into engine `ComputeSegment`s — one per
 * segment, carrying its own comp basis, working-day weight, attendance slice and holiday-aware
 * `expectedHours`. Attendance comes from `buildSegmentAttendance` (real AttendanceDay rows bucketed
 * by day); when there are none, the whole-period `regularHours` is split by working-day share, so the
 * per-segment hours sum back to the period total. Comp uses the engine's default working-day/hours
 * factors (same as the period-end comp), so `hourlyRateOf` matches across the split.
 */
export async function buildComputeSegments(
	employeeId: string,
	segments: CompSegment[],
	regularHours: number,
	workingDays: number,
	holidayDates: Date[],
	dailyHours: number
): Promise<ComputeSegment[]> {
	const perSegAtt = await buildSegmentAttendance(
		employeeId,
		segments.map((s) => ({ start: s.start, end: s.end }))
	)
	return segments.map((seg, i) => {
		const wd = computeWorkingDays(seg.start, seg.end, holidayDates)
		// ponytail: guard the degenerate zero-working-day period (share/expected collapse to 0 —
		// no work, no basic — rather than NaN).
		const share = workingDays > 0 ? wd / workingDays : 0
		return {
			comp: { basicMonthlySalary: seg.salary, rateType: seg.rateType },
			weight: seg.weight,
			attendance: perSegAtt
				? perSegAtt[i]
				: { ...emptyAttendance(), regularHours: regularHours * share },
			expectedHours: wd * dailyHours
		}
	})
}

/**
 * #163: the advisory-lock key serializing every writer of payroll runs for one org-month. Both
 * `createPayrollRun` and `openPeriod` take it as the first statement of their transaction, so the
 * two paths serialize against each other as well as against themselves.
 *
 * The month, not the exact range: the check the lock protects is "does this range intersect any
 * other range", which two concurrent requests for DIFFERENT but overlapping ranges both pass
 * otherwise — and `@@unique([organizationId, periodStart, periodEnd])` does not cover that, because
 * the bounds differ. A run never spans two months (`isSameMonthRange`), so the month is the
 * smallest key that covers every range the check can read.
 *
 * The month of the REQUESTED period start on the MANILA calendar, never a bound derived from the
 * overlap query's widened window — that window starts a day early, so two overlapping ranges either
 * side of a month boundary would take two different locks and serialize against nothing.
 */
export function payrollRunLockKey(organizationId: string, periodStart: Date): string {
	return `payroll-run:${organizationId}:${manilaDayKey(periodStart).slice(0, 7)}`
}

/**
 * Take the org-month lock inside `tx`. Transaction-scoped: Postgres releases it on commit OR
 * rollback, so there is nothing to unlock and no way to leak one.
 */
export async function lockPayrollMonth(
	tx: Prisma.TransactionClient,
	organizationId: string,
	periodStart: Date
) {
	const key = payrollRunLockKey(organizationId, periodStart)
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`
}

/**
 * #163: refuse a payroll run whose range intersects an existing (non-voided) run for the org.
 *
 * Fires only when at least one side is a CUSTOM range. A standard-vs-standard intersection is
 * allowed through, because a WHOLE_MONTH adjustment run running alongside the two halves is a
 * documented, supported workflow — an unconditional guard would silently delete it. Deciding
 * "every conflict is standard" needs every candidate row, which is why this is `findMany`.
 *
 * Comparisons are on MANILA calendar days, not raw stored timestamps and not UTC-truncated ones:
 * existing rows are not guaranteed to sit on UTC midnight (a row written from a PHT day boundary
 * carries 16:00/15:59:59, and 2026-08-09T16:00Z is August 10 in Manila). A raw timestamp
 * comparison misses a genuinely shared day; a UTC truncation invents one that does not exist.
 *
 * Consequence, by design: once one custom run exists in a month, that month's normal 1–15 run is
 * refused until the custom run is voided. The 409 says so.
 */
export async function assertNoOverlappingRun(
	organizationId: string,
	periodStart: Date,
	periodEnd: Date,
	// The caller's transaction client when there is one, so the read happens INSIDE the advisory
	// lock. Defaults to `db` — a read on its own is still correct, just not serialized.
	client: Prisma.TransactionClient = db
) {
	// Coarse DB filter, widened by a day on each side: a row stored on a PHT boundary can be one
	// UTC day outside this window and still share a Manila day with the range. The real decision is
	// the Manila-calendar comparison below.
	const day = 24 * 60 * 60 * 1000
	const from = new Date(utcMidnight(periodStart).getTime() - day)
	const dayAfterEnd = new Date(utcMidnight(periodEnd).getTime() + 2 * day)
	const candidates = await client.payrollRun.findMany({
		where: {
			organizationId,
			status: { not: 'VOIDED' },
			periodStart: { lt: dayAfterEnd },
			periodEnd: { gte: from }
		},
		select: { id: true, periodStart: true, periodEnd: true }
	})
	const hits = candidates.filter((h) =>
		rangesOverlapInManila(periodStart, periodEnd, h.periodStart, h.periodEnd)
	)
	if (hits.length === 0) return
	if (
		isValidStandardPeriod(periodStart, periodEnd) &&
		hits.every((h) => isValidStandardPeriod(h.periodStart, h.periodEnd))
	)
		return
	const hit = hits.find((h) => !isValidStandardPeriod(h.periodStart, h.periodEnd)) ?? hits[0]
	error(
		409,
		`This range overlaps an existing payroll run (${formatShortDate(hit.periodStart)} – ${formatShortDate(hit.periodEnd)}). Void the conflicting run to proceed.`
	)
}

/**
 * #163 (review round 2), widened by #3: refuse a CUSTOM range that overlaps a cutoff window some
 * employee's statutory allocation designates, in ANY month the range touches.
 *
 * A FIRST/SECOND allocation loads the WHOLE month's employee SSS/PhilHealth/Pag-IBIG share onto one
 * standard run — the 1–15 run for FIRST, the 16–EOM run for SECOND — and every other run in that
 * month takes ZERO (`resolveEE`, `calculator.ts:158-169`). That is only safe while the designated
 * run can still be created. The overlap guard above refuses it once a custom run covers those days,
 * and the month would then collect either nothing (no cutoff run) or, if the cutoff run is created
 * first and the custom one is merely adjacent, an outcome that depends on creation order.
 *
 * Rather than track that ambiguity through the engine, make it impossible: a custom range may not
 * touch a designated cutoff window at all, so the cutoff run is always creatable and `resolveEE`'s
 * ZERO on a custom range is always correct.
 *
 * The guard walks EVERY month `monthsTouched` reports, not just the start month. Deriving the month
 * from the start alone was a live hole (#3 / research F5), not merely a strictness question: a
 * FIRST-only org could create `20 May → 5 Jun`, which misses May 1–15 and was therefore allowed,
 * and which then swallows June's whole 1–15 window while every employee takes the custom range's
 * ZERO — so June collects nothing. Because a cross-month range always covers month one's 16–EOM
 * window and month two's 1–15 window, an org with ANY active FIRST or SECOND allocation is now
 * refused EVERY cross-month range. That totality is what `resolveEE`'s ZERO depends on.
 *
 * This is a positive restriction — accept only if no touched month's designated window is
 * overlapped — so a shape nobody enumerated is refused rather than allowed.
 *
 * STANDARD periods are unrestricted — they are the cutoff runs. An org where every employee is EVEN
 * (the default, no config row) has no designated window and is unaffected.
 */
export async function assertCustomRangeClearOfCutoff(
	organizationId: string,
	periodStart: Date,
	periodEnd: Date,
	// The caller's transaction client when there is one, so the read happens INSIDE the advisory
	// lock. Defaults to `db`.
	client: Prisma.TransactionClient = db
) {
	if (isValidStandardPeriod(periodStart, periodEnd)) return

	const allocations = await client.employeeStatutoryConfig.findMany({
		where: {
			employee: { organizationId, employmentStatus: 'ACTIVE' },
			allocation: { not: 'EVEN' }
		},
		distinct: ['allocation'],
		select: { allocation: true }
	})
	if (allocations.length === 0) return

	// Every MANILA month the range touches — the same calendar the overlap comparison uses. A
	// `YYYY-MM-DD` key parses to UTC midnight, which is the convention `monthsTouched` works in.
	const months = monthsTouched(
		new Date(manilaDayKey(periodStart)),
		new Date(manilaDayKey(periodEnd))
	)

	for (const { year, month0 } of months) {
		for (const { allocation } of allocations) {
			const kind = allocation === 'FIRST' ? 'FIRST_HALF' : 'SECOND_HALF'
			const window = periodOf(kind, year, month0)
			if (!rangesOverlapInManila(periodStart, periodEnd, window.periodStart, window.periodEnd))
				continue
			const label = allocation === 'FIRST' ? '1–15' : `16–${window.periodEnd.getUTCDate()}`
			const standard = allocation === 'FIRST' ? 'First half' : 'Second half'
			// The month named is the CLASHING window's own month, never the range start — with two
			// months in play that is the only way to tell which one blocked the range.
			error(
				400,
				`A custom period cannot overlap the ${label} cutoff of ${monthYearLabel(year, month0)}, because that run collects the whole month's employee statutory share for some employees. Use a range outside it, or run the standard ${standard} period.`
			)
		}
	}
}

export async function createPayrollRun(
	organizationId: string,
	periodStart: Date,
	periodEnd: Date,
	ctx: AuditContext
) {
	// #3: a range may now cross a calendar-month boundary; the same-month rule is replaced by a
	// SIZE cap. `customRangeError` stops a reversed range (a negative day count would produce
	// negative deductions) and a range whose summed month slices exceed one month of pay (nothing
	// downstream clamps `periodShare` — `earnings.ts` multiplies basic pay by it raw). It is a
	// positive restriction: only a range it accepts proceeds. It runs before the transaction, so a
	// refusal writes nothing at all — not even an audit row. The same function backs the
	// PeriodPicker's inline message, so the browser copy and this 400 body cannot drift apart.
	const invalid = customRangeError(periodStart, periodEnd)
	if (invalid) error(400, invalid)

	// One transaction, under the org-month advisory lock: check-then-act is otherwise exactly what
	// this is. Two concurrent requests for DIFFERENT but overlapping custom ranges both read an
	// empty conflict set and both insert, and the unique constraint cannot catch it because their
	// bounds differ. The lock is taken FIRST so both reads below are serialized with the insert.
	const run = await db.$transaction(async (tx: Prisma.TransactionClient) => {
		await lockPayrollMonth(tx, organizationId, periodStart)

		// Kept ahead of the overlap guard on purpose (S1). `voidRun` only flips status, so the row and
		// its @@unique([organizationId, periodStart, periodEnd]) survive; the overlap guard excludes
		// VOIDED rows, so without this a void-then-recreate would reach `create` and raise a raw Prisma
		// P2002 — a 500 page instead of today's clean 409.
		const existing = await tx.payrollRun.findUnique({
			where: { organizationId_periodStart_periodEnd: { organizationId, periodStart, periodEnd } }
		})
		if (existing) error(409, 'Payroll run for this period already exists')

		await assertNoOverlappingRun(organizationId, periodStart, periodEnd, tx)
		await assertCustomRangeClearOfCutoff(organizationId, periodStart, periodEnd, tx)

		const created = await tx.payrollRun.create({
			data: { organizationId, periodStart, periodEnd }
		})

		// #5: the audit row commits with the run it records. Outside this closure a failed audit
		// write returned a 500 while the run itself stayed committed and unrecorded.
		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'PayrollRun',
				entityId: created.id,
				newValue: { periodStart, periodEnd }
			},
			tx
		)

		return created
	})

	// Compute in the same request (#138): the numbers are deterministic given attendance, so
	// making HR click a separate "Compute" was friction without a decision attached. The run
	// comes back COMPUTED; "Recompute" on the detail page re-derives it after later edits
	// (e.g. assigning a recurring allowance).
	await computePayroll(run.id, organizationId, ctx)

	return db.payrollRun.findUniqueOrThrow({ where: { id: run.id } })
}

/**
 * Compute a draft payroll run using the earnings/deductions engine and persist itemized
 * PayrollEarning/PayrollDeduction line items (PAY-008).
 *
 * Interim attendance sourcing (until the Attendance engine, Phase 11.3): `regularHours` come
 * from the employee's APPROVED timesheets for the period; when none exist, a monthly-salaried
 * employee is paid for the full scheduled hours (working days × 8). OT/holiday/night-diff buckets
 * are zero until real attendance is available. Statutory contributions are monthly, prorated to the
 * period by pay frequency (semi-monthly ÷2). Loan/cash-advance balances are NOT mutated here —
 * the deduction is computed from current balances and shown as a line item; the actual decrement +
 * LoanPayment happens at lock time (Slice 2, PAY-021), which keeps compute safely re-runnable.
 */
export async function computePayroll(runId: string, organizationId: string, ctx: AuditContext) {
	const run = await db.payrollRun.findFirst({ where: { id: runId, organizationId } })
	if (!run) error(404, 'Payroll run not found')
	// Recomputing a COMPUTED run is safe — entries are wiped and rebuilt in one
	// transaction below. Only approval locks the numbers.
	if (run.status !== 'DRAFT' && run.status !== 'COMPUTED')
		error(400, 'Only draft or computed payroll runs can be computed')

	const [
		employees,
		earningTypes,
		loansAll,
		advancesAll,
		enrollmentsAll,
		payRateRule,
		statutoryRateConfig,
		recurringAll,
		recurringDeductionsAll,
		statutoryExemptAll,
		statutoryExternalAll,
		statutoryAllocationAll,
		compensationAll,
		holidays
	] = await Promise.all([
		db.employee.findMany({ where: { organizationId, employmentStatus: 'ACTIVE' } }),
		// #163: payrollConfig is no longer read here — proration comes from the period shape alone.
		db.earningType.findMany({ where: { organizationId }, select: { code: true, taxable: true } }),
		db.loan.findMany({
			where: { employee: { organizationId }, status: 'ACTIVE', balance: { gt: 0 } }
		}),
		db.cashAdvance.findMany({
			where: { employee: { organizationId }, status: 'ACTIVE', balance: { gt: 0 } }
		}),
		// Active benefit enrollments whose plan charges the employee (T148).
		db.benefitEnrollment.findMany({
			where: { status: 'ACTIVE', plan: { organizationId, employeeCost: { gt: 0 } } },
			select: { id: true, employeeId: true, plan: { select: { name: true, employeeCost: true } } }
		}),
		db.payRateRule.findUnique({ where: { organizationId } }),
		// Org statutory rate overrides (#220) — one optional org row, resolved to effective rates below.
		db.statutoryRateConfig.findUnique({ where: { organizationId } }),
		// Recurring allowance/incentive assignments feed the adjustment buckets (#65).
		db.employeeEarning.findMany({
			where: { employee: { organizationId }, isActive: true }
		}),
		// Recurring custom-deduction assignments from Settings → Pay Codes (#66).
		db.employeeDeduction.findMany({
			where: { employee: { organizationId }, isActive: true, deductionType: { isActive: true } },
			include: { deductionType: { select: { code: true, label: true } } }
		}),
		// Per-employee statutory exemptions (#173) — only the exempt rows matter; enrolled is
		// the default (no row). Grouped by employee like the other per-employee data below.
		db.employeeStatutoryConfig.findMany({
			where: { employee: { organizationId }, exempt: true },
			select: { employeeId: true, contribution: true }
		}),
		// Per-employee "employer share paid externally" (#173, Feature C) — zeroes the ER share only.
		// Mirrors the exempt fetch/grouping; independent flag on the same config row.
		db.employeeStatutoryConfig.findMany({
			where: { employee: { organizationId }, employerSharePaidExternally: true },
			select: { employeeId: true, contribution: true }
		}),
		// Per-employee EE-share cutoff allocation (#173, Feature E) — only non-EVEN rows matter; EVEN
		// is the default (half split). Grouped by employee like the other per-employee data below.
		db.employeeStatutoryConfig.findMany({
			where: { employee: { organizationId }, allocation: { not: 'EVEN' } },
			select: { employeeId: true, contribution: true, allocation: true }
		}),
		// #170: effective-dated compensation history for every employee, so the resolver can
		// day-split a run that straddles a salary change and lag statutory to decision B. Ordered
		// ascending so a same-day change's later `changedAt` wins the tiebreak; grouped by employee
		// below like the other per-employee data. An employee with no rows falls back to their
		// current cache, reproducing the pre-#170 numbers exactly.
		db.employeeCompensation.findMany({
			where: { employee: { organizationId } },
			orderBy: [{ effectiveDate: 'asc' }, { changedAt: 'asc' }]
		}),
		// Public holidays inside the period — the scheduled-hours fallback below must not
		// bill them as ordinary working days.
		db.publicHoliday.findMany({
			where: {
				organizationId,
				date: { gte: run.periodStart, lte: run.periodEnd }
			},
			select: { date: true }
		})
	])

	// Requirement #1 (review): taxability comes from EarningType config, not hard-coded defaults.
	const taxableByCode = new Map(earningTypes.map((e) => [e.code, e.taxable]))
	// Premium-pay multipliers from PayRateRule (falls back to DOLE defaults when unset).
	const rates = ratesFromRule(payRateRule)
	// #220: statutory tables from StatutoryRateConfig (falls back to the hardcoded PH defaults when
	// unset). Resolved once and threaded into the shared engine identically to the preview.
	const statutoryRates = statutoryRatesFromConfig(statutoryRateConfig)
	// Requirement #5 (review) + #129: prorate monthly statutory to the run's ACTUAL period
	// shape — WHOLE_MONTH carries the full month (1), either half carries 0.5. This replaces
	// reading the org-wide payFrequency, which mis-prorated an org that mixes half-month and
	// whole-month (e.g. benefits-only) runs. A WHOLE_MONTH adjustment run alongside the two
	// halves is a supported workflow, so the three shapes must keep their frozen shares.
	// #163: a custom same-month range prorates by inclusive day count ÷ days in the month; the
	// org-wide payFrequency no longer influences proration at all (it was already dead for every
	// standard shape). Legacy stored pairs keep the historical flat 0.5 — see periodShareOf.
	const periodShare = periodShareOf(run.periodStart, run.periodEnd)
	// #173 (Feature E): the run's cutoff kind, computed once, drives EE-share allocation in the
	// engine. WHOLE_MONTH/legacy periods (null) make allocation moot — the engine falls back to
	// `× periodShare` there.
	const periodKind = describePeriod(run.periodStart, run.periodEnd).kind
	// #163: a custom (non-standard) range collects a proportional slice of the flat monthly
	// installment; a standard period keeps taking the full installment exactly as today. Four
	// ~7-day May runs therefore collect 4 × 7/31 ≈ 0.90 of one installment — under a month's worth.
	const amortShare = periodKind === null ? periodShare : 1
	const loansByEmp = groupByEmployee(loansAll)
	const advancesByEmp = groupByEmployee(advancesAll)
	const enrollmentsByEmp = groupByEmployee(enrollmentsAll)
	const recurringByEmp = groupByEmployee(recurringAll)
	const recurringDeductionsByEmp = groupByEmployee(recurringDeductionsAll)
	const statutoryExemptByEmp = groupByEmployee(statutoryExemptAll)
	const statutoryExternalByEmp = groupByEmployee(statutoryExternalAll)
	const statutoryAllocationByEmp = groupByEmployee(statutoryAllocationAll)
	const compensationByEmp = groupByEmployee(compensationAll)
	// Holidays were previously passed as [], so a period containing public holidays
	// counted them as ordinary working days. That inflates `scheduledHours` below, and
	// since BASIC = regularHours * hourlyRate, it inflated basic pay for every employee
	// falling back to the schedule (i.e. with no approved timesheet hours).
	const workingDays = computeWorkingDays(
		run.periodStart,
		run.periodEnd,
		holidays.map((h) => h.date)
	)
	// #163: the COARSE bounds of the timesheet INTERSECTION query below, at both levels — which
	// sheets are candidates, and which of their entries come back. Widened by a day on each side,
	// like every other query in this file that feeds a Manila-calendar decision: a stored row is not
	// guaranteed to sit on UTC midnight, and 2026-05-09T16:00Z is May 10 in Manila, so a row whose
	// UTC bounds fall outside this window can still be inside the run. The real decisions are made
	// in JS on Manila day keys — see `runStartKey` / `runEndKey`.
	const day = 24 * 60 * 60 * 1000
	const tsFrom = new Date(utcMidnight(run.periodStart).getTime() - day)
	const tsUntil = new Date(utcMidnight(run.periodEnd).getTime() + 2 * day)
	const runStartKey = manilaDayKey(run.periodStart)
	const runEndKey = manilaDayKey(run.periodEnd)

	const perEmployee: Array<{
		entry: Prisma.PayrollEntryUncheckedCreateWithoutEarningsInput
		earnings: Array<{ code: string; label: string; amount: number; taxable: boolean }>
		deductions: Array<{ code: string; label: string; amount: number; refId: string | null }>
	}> = []
	// #119: run totals are the exact sum of the entries' already-quantized figures, so the run
	// header reconciles against its entry rows the same way an entry reconciles against its lines.
	let totalGross = ZERO
	let totalDeductions = ZERO
	let totalNet = ZERO

	for (const emp of employees) {
		// #170: resolve the period's compensation from the effective-dated history (holiday-aware
		// working-day weighting). With no history it returns a single full-period segment whose
		// weight is exactly `periodShare` and `statutoryBasis === periodEnd`, so everything below
		// reduces to the pre-#170 behaviour.
		const periodComp = compensationForPeriod(
			compensationByEmp.get(emp.id) ?? [],
			run.periodStart,
			run.periodEnd,
			periodShare,
			{ basicMonthlySalary: emp.basicMonthlySalary, rateType: emp.rateType },
			(s, e) =>
				computeWorkingDays(
					s,
					e,
					holidays.map((h) => h.date)
				)
		)
		// Period-end comp drives basic/premium/tardiness rates — NOT the current cache, which for a
		// past run with a later change would be too high.
		const comp: EmployeeComp = {
			basicMonthlySalary: periodComp.periodEnd.salary,
			rateType: periodComp.periodEnd.rateType
		}
		// Decision B: statutory always follows the day-1-of-month comp (every rate type).
		const statutoryComp: EmployeeComp = {
			basicMonthlySalary: periodComp.statutoryBasis.salary,
			rateType: periodComp.statutoryBasis.rateType
		}
		// A pure MONTHLY salary-amount split takes the Stage 1 `basicSegments` path (unchanged); any
		// other in-period split (hourly/daily rate change, or a MONTHLY↔hourly flip) is Stage 2 and
		// goes through `segments` (built below). A single segment (no change) takes neither → parity.
		const segments = periodComp.segments
		const monthlyOnlySplit = segments.length > 1 && segments.every((s) => s.rateType === 'MONTHLY')
		const stage2Split = segments.length > 1 && !monthlyOnlySplit
		const basicSegments = monthlyOnlySplit ? segments : undefined
		// A flip is a Stage 2 split whose segments don't all share one rateType — flag for manual review.
		const isFlip = stage2Split && new Set(segments.map((s) => s.rateType)).size > 1

		// #163: sourced by INTERSECTION, not containment. A sheet counts when it shares any day with
		// the run, and only the ENTRIES whose date falls inside the run are summed — so a custom
		// May 3–9 run reads exactly those days out of a standard May 1–15 sheet instead of seeing
		// nothing and paying full scheduled hours for days no timesheet supports.
		//
		// The query is only the cheap coarse pass; both decisions are made below on MANILA calendar
		// days. A UTC-derived bound counts a May 10 (PHT) entry stored as 2026-05-09T16:00Z inside a
		// May 3–9 run — paying a day the run does not cover — and can include or exclude a whole
		// sheet stored on a PHT boundary for the same reason.
		const candidateSheets = await db.timesheet.findMany({
			where: {
				employeeId: emp.id,
				status: 'APPROVED',
				periodStart: { lt: tsUntil },
				periodEnd: { gte: tsFrom }
			},
			include: { entries: { where: { date: { gte: tsFrom, lt: tsUntil } } } }
		})
		const approvedHours = candidateSheets
			.filter((ts) =>
				rangesOverlapInManila(run.periodStart, run.periodEnd, ts.periodStart, ts.periodEnd)
			)
			.flatMap((ts) => ts.entries)
			.filter((e) => {
				const k = manilaDayKey(e.date)
				return k >= runStartKey && k <= runEndKey
			})
			// Hours, not money — plain number arithmetic is correct here. Named `acc` so it does not
			// shadow the exact-money `sum` helper imported above.
			.reduce((acc, e) => acc + Number(e.hoursWorked), 0)
		const scheduledHours = workingDays * (comp.dailyWorkingHours ?? 8)
		const regularHours = approvedHours > 0 ? approvedHours : scheduledHours

		const loans: AmortItem[] = (loansByEmp.get(emp.id) ?? []).map((l) => ({
			refId: l.id,
			label: l.type ?? 'Loan',
			installment: q2(D(l.installment).times(amortShare)),
			balance: l.balance
		}))
		const cashAdvances: AmortItem[] = (advancesByEmp.get(emp.id) ?? []).map((a) => ({
			refId: a.id,
			label: 'Cash advance',
			installment: q2(D(a.installment).times(amortShare)),
			balance: a.balance
		}))

		// Prefer derived attendance (OT/holiday/night-diff buckets); fall back to timesheet hours.
		const attInput = await buildAttendanceInput(emp.id, run.periodStart, run.periodEnd)
		const attendance = attInput ?? { ...emptyAttendance(), regularHours }

		// Recurring allowances/incentives, prorated to the period like statutory (#65).
		const recurring = recurringByEmp.get(emp.id) ?? []
		// #119: sum exactly, prorate exactly, quantize once — not sum→round→scale→round.
		const monthlyOf = (kind: 'ALLOWANCE' | 'INCENTIVE') =>
			sum(recurring.filter((r) => r.kind === kind).map((r) => D(r.monthlyAmount)))
		const adjustments = {
			allowances: q2n(monthlyOf('ALLOWANCE').times(periodShare)),
			incentives: q2n(monthlyOf('INCENTIVE').times(periodShare))
		}

		// Employee-paid benefit costs, prorated to the period (T148). These go INTO the engine as
		// discretionary deductions rather than being subtracted from net afterwards (#103) — a
		// post-hoc subtraction bypasses the affordability gate and can drive net negative again.
		const benefitDeductions = (enrollmentsByEmp.get(emp.id) ?? []).map((e) => ({
			code: 'BENEFIT',
			label: e.plan.name,
			// Each benefit line quantizes once, here — it is a payable line like any other.
			amount: q2n(D(e.plan.employeeCost).times(periodShare)),
			taxable: false,
			refId: e.id
		}))

		// #170/#171 Stage 2: for a mixed-basis split, resolve per-segment attendance + expected hours.
		const computeSegments = stage2Split
			? await buildComputeSegments(
					emp.id,
					segments,
					regularHours,
					workingDays,
					holidays.map((h) => h.date),
					comp.dailyWorkingHours ?? 8
				)
			: undefined

		// Shared engine — identical to the Payroll Calculator for the same inputs.
		const result = computeEmployeeResult(comp, attendance, adjustments, {
			taxableByCode,
			rates,
			statutoryRates,
			periodShare,
			// #170: decision-B statutory basis (always), the MONTHLY day-split (Stage 1), and the
			// mixed-basis segment split (Stage 2) — mutually exclusive; a single segment passes none.
			statutoryComp,
			basicSegments,
			segments: computeSegments,
			// Holiday-aware schedule for the period — values absences for fixed-basic staff (#121).
			expectedHours: scheduledHours,
			statutoryExemptions: statutoryExemptions(statutoryExemptByEmp.get(emp.id) ?? []),
			employerShareExternal: employerShareExternals(statutoryExternalByEmp.get(emp.id) ?? []),
			statutoryAllocations: statutoryAllocations(statutoryAllocationByEmp.get(emp.id) ?? []),
			periodKind,
			loans,
			cashAdvances,
			recurringDeductions: [
				...recurringDeductionComponents(recurringDeductionsByEmp.get(emp.id) ?? [], periodShare),
				...benefitDeductions
			]
		})
		const paidHours =
			attendance.regularHours +
			attendance.overtimeHours +
			attendance.restDayHours +
			attendance.restDayOtHours +
			attendance.regularHolidayHours +
			attendance.regularHolidayOtHours +
			attendance.specialHolidayHours +
			attendance.specialHolidayOtHours
		// #103: a floored net is never silent — it means deductions outran gross and someone has to
		// look at it. Zero paid hours stays a separate, more specific reason. #171: a mid-period
		// pay-type flip mixes bases we value approximately (premiums stay at the period-end rate), so
		// surface it for manual review — but never block the run.
		// #163 (S8): with INTERSECTION sourcing this now means what it says — no APPROVED timesheet
		// entry falls on any day of this custom range, so the hours are the schedule's estimate and
		// not a record of work. Flag it so the estimate is visible on the run detail row rather than
		// shipped as fact.
		const estimatedFromSchedule = periodKind === null && !attInput && approvedHours === 0
		const isFlagged = paidHours === 0 || result.uncollected > 0 || isFlip || estimatedFromSchedule
		const flagReason =
			paidHours === 0
				? 'No hours recorded for period'
				: result.uncollected > 0
					? `Deductions exceed pay — ₱${result.uncollected.toFixed(2)} uncollected`
					: isFlip
						? 'Mid-period pay-type change — verify manually'
						: estimatedFromSchedule
							? 'Hours estimated from schedule — no timesheet covers this custom period'
							: null

		perEmployee.push({
			entry: {
				payrollRunId: runId,
				employeeId: emp.id,
				hoursWorked: round2(paidHours),
				basicPay: result.basicPay,
				grossPay: result.grossPay,
				sssEe: result.statutory.sssEe,
				sssEr: result.statutory.sssEr,
				philhealthEe: result.statutory.philhealthEe,
				philhealthEr: result.statutory.philhealthEr,
				pagibigEe: result.statutory.pagibigEe,
				pagibigEr: result.statutory.pagibigEr,
				withholdingTax: result.statutory.withholdingTax,
				totalDeductions: result.totalDeductions,
				netPay: result.netPay,
				isFlagged,
				flagReason
			},
			earnings: result.earnings.map((c) => ({
				code: c.code,
				label: c.label,
				amount: c.amount,
				taxable: c.taxable
			})),
			// Benefits are already among `result.deductions` — the engine took them through the same
			// affordability gate as every other discretionary line (#103).
			deductions: result.deductions.map((c) => ({
				code: c.code,
				label: c.label,
				amount: c.amount,
				refId: c.refId ?? null
			}))
		})

		totalGross = totalGross.plus(result.grossPay)
		totalDeductions = totalDeductions.plus(result.totalDeductions)
		totalNet = totalNet.plus(result.netPay)
	}

	await db.$transaction(async (tx: Prisma.TransactionClient) => {
		// Cascade deletes the old entries' line items via onDelete: Cascade.
		await tx.payrollEntry.deleteMany({ where: { payrollRunId: runId } })
		for (const p of perEmployee) {
			await tx.payrollEntry.create({
				data: { ...p.entry, earnings: { create: p.earnings }, deductions: { create: p.deductions } }
			})
		}
		await tx.payrollRun.update({
			where: { id: runId },
			data: {
				status: 'COMPUTED',
				totalGross,
				totalDeductions,
				totalNet
			}
		})

		// #5: the audit row commits with the recompute it records.
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PayrollRun',
				entityId: runId,
				newValue: {
					status: 'COMPUTED',
					totalGross: totalGross.toNumber(),
					totalNet: totalNet.toNumber()
				}
			},
			tx
		)
	})

	// Open (or reopen, after a return) the maker-checker chain (#134). The computing
	// user is the maker; the chain enters at VERIFY. A recompute during an open review
	// is a no-op here, so numbers can be re-derived without disturbing sign-offs.
	await ensurePayrollApprovalChain(runId, ctx.actorId)

	return db.payrollRun.findUnique({
		where: { id: runId },
		include: {
			entries: {
				include: {
					employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
					earnings: true,
					deductions: true
				}
			}
		}
	})
}

export async function approvePayroll(runId: string, organizationId: string, ctx: AuditContext) {
	const run = await db.payrollRun.findFirst({ where: { id: runId, organizationId } })
	if (!run) error(404, 'Payroll run not found')
	if (run.status !== 'COMPUTED') error(400, 'Only computed payroll runs can be approved')

	// #5: one transaction — a failed audit write must not leave the approval standing unrecorded.
	return await db.$transaction(async (tx: Prisma.TransactionClient) => {
		const updated = await tx.payrollRun.update({
			where: { id: runId },
			data: { status: 'APPROVED', approvedById: ctx.actorId, approvedAt: new Date() }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'PayrollRun',
				entityId: runId,
				newValue: { status: 'APPROVED' }
			},
			tx
		)

		return updated
	})
}

export async function overridePayrollEntry(
	entryId: string,
	organizationId: string,
	overrides: { netPay?: number; flagReason?: string },
	note: string,
	ctx: AuditContext
) {
	const entry = await db.payrollEntry.findFirst({
		where: { id: entryId, payrollRun: { organizationId } },
		include: { payrollRun: true }
	})
	if (!entry) error(404, 'Payroll entry not found')
	if (entry.payrollRun.status === 'APPROVED') error(400, 'Cannot override approved payroll')

	// #249: object-level scoping on the WRITE path, and the reason it matters more than the read.
	// `requirePayrollManage` admits MANAGER (#133), and until now the only other filter was the
	// organization — so a manager could post any employee's entryId and set their net pay, for
	// people they cannot see and do not manage. Scoping the run view without scoping this would be
	// worse than not scoping at all: the UI would imply a boundary the server does not enforce.
	//
	// In the service, not the action, because `overridePayrollEntry` is reachable from the run page
	// and any future API twin alike — the same rule #243 settled for the pay writers.
	//
	// The capability arm comes first and is not optional: `assertCanTouchEmployee` opens up only for
	// ADMINISTER_HR_ORGWIDE, which PAYROLL_OFFICER does not hold, so delegating to it alone would
	// scope the one role whose job is running payroll down to a reporting line it does not have.
	if (!canAny(ctx.actorRoles, 'VIEW_PAY_ORGWIDE')) {
		// ponytail: `roles` is a no-op here today, for the same containment reason as the arm above —
		// passed so reordering the two cannot silently reintroduce the single-role bug (#247).
		await assertCanTouchEmployee(
			{ id: ctx.actorId, roles: ctx.actorRoles, organizationId },
			entry.employeeId
		)
	}

	// #5: one transaction — a failed audit write must not leave an override standing unrecorded.
	// The two updates keep their original order inside it.
	return await db.$transaction(async (tx: Prisma.TransactionClient) => {
		const updated = await tx.payrollEntry.update({
			where: { id: entryId },
			data: { ...overrides, isFlagged: false }
		})

		await tx.payrollRun.update({
			where: { id: entry.payrollRunId },
			data: { hasOverride: true, overrideNote: note }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'PAYROLL_OVERRIDE',
				entityType: 'PayrollEntry',
				entityId: entryId,
				oldValue: { netPay: Number(entry.netPay) },
				newValue: { ...overrides, note }
			},
			tx
		)

		return updated
	})
}

// Finance approvers (CEO / Super Admin) are the company-wide finance authority and reach
// every tenant's payroll to sign it off (#174); everyone else is scoped to their own org.
// Passing no roles keeps the strict org filter — callers opt into the wider scope.
export function payrollOrgFilter(organizationId: string, roles?: Role[]) {
	return roles && canAny(roles, 'APPROVE_FINANCE') ? {} : { organizationId }
}

export async function listPayrollRuns(organizationId: string, roles?: Role[]) {
	return db.payrollRun.findMany({
		where: payrollOrgFilter(organizationId, roles),
		orderBy: { periodStart: 'desc' },
		include: { organization: { select: { name: true } } }
	})
}

/**
 * A payroll run with its entries.
 *
 * `visibleEmployeeIds` restricts which entries come back — `null`/omitted means every entry in the
 * run. #249: a MANAGER holds MANAGE_PAYROLL (#133 made them on-branch HR), so they reach this run,
 * but a run carries every employee's gross, itemized statutory deductions and net. Without the
 * filter a branch manager reads the whole organization's pay here, which is the same leak the
 * payslip doors were narrowed to close — reached by another road.
 *
 * The caller supplies the list via `listVisiblePayEmployeeIds` rather than this function deriving
 * it, because the callers already know the actor and one of them (the register) scopes a different
 * query with the same allow-list.
 *
 * When the entries ARE scoped, the run's stored `totalGross` / `totalDeductions` / `totalNet` are
 * replaced by totals over the visible entries. Those columns are org-wide, so returning them beside
 * a filtered list would render as "this is the whole run" over rows that are not — and the run
 * header displays exactly those three figures. Done here rather than in each caller so no caller
 * can forget and show a total that contradicts its own table.
 */
export async function getPayrollRun(
	id: string,
	organizationId: string,
	roles?: Role[],
	visibleEmployeeIds?: string[] | null
) {
	const run = await db.payrollRun.findFirst({
		where: { id, ...payrollOrgFilter(organizationId, roles) },
		include: {
			entries: {
				...(visibleEmployeeIds != null && {
					where: { employeeId: { in: visibleEmployeeIds } }
				}),
				include: {
					employee: {
						select: {
							firstName: true,
							lastName: true,
							employeeNumber: true,
							department: { select: { name: true } }
						}
					},
					// Itemized lines for the run-detail breakdown (allowances, incentives,
					// OT, statutory, loans, …) — not just the aggregate columns.
					earnings: true,
					deductions: true
				},
				orderBy: { employee: { lastName: 'asc' } }
			},
			// #278: the run-detail page needs the period's status to decide whether its payslips are
			// visible yet — `isPayslipVisible` reads the RELEASED arm from here.
			period: { select: { status: true } },
			// Maker-checker chain (#134), append-only across attempts, with the acting
			// user's email for attribution in the history view.
			approvalSteps: {
				include: { actor: { select: { email: true } } },
				orderBy: [{ attempt: 'asc' }, { stageIndex: 'asc' }]
			}
		}
	})
	if (!run) error(404, 'Payroll run not found')
	if (visibleEmployeeIds == null) return run
	return {
		...run,
		totalGross: sum(run.entries.map((e) => e.grossPay)),
		totalDeductions: sum(run.entries.map((e) => e.totalDeductions)),
		totalNet: sum(run.entries.map((e) => e.netPay))
	}
}

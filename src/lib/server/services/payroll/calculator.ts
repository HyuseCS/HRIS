import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import {
	listVisiblePayEmployeeIds,
	type EmployeeAccessActor
} from '$lib/server/services/employee-access'
import { computeEarnings } from './earnings'
import { ratesFromRule, type PayRates } from './rates'
import { statutoryRatesFromConfig } from './statutory-rates'
import { computeDeductions, computeTardiness, computeAbsence, type AmortItem } from './deductions'
import { recurringDeductionComponents } from './employee-deductions'
import {
	statutoryExemptions,
	employerShareExternals,
	statutoryAllocations
} from './employee-statutory'
import { computeStatutoryDeductions, type StatutoryRates } from './ph-statutory'
import type { StatutoryAllocation } from '@prisma/client'
import type { PeriodKind } from '$lib/utils/pay-periods'
import { D, q2n, sum, sumQ, ZERO, type Money } from './money'
import {
	absenceHoursOf,
	basicPayBasis,
	expectedHoursOf,
	hourlyRateOf,
	monthlyBasisOf,
	type AttendanceInput,
	type ComputeSegment,
	type EmployeeComp,
	type PayAdjustments,
	type PayComponent,
	type RateType
} from './types'

/**
 * Shared per-employee payroll computation (PAY-015). Both the real run (`computePayrollRun`)
 * and the what-if Payroll Calculator call this, so a preview is byte-for-byte identical to what a
 * run would produce for the same inputs — that is the guarantee PAY-018 tests.
 */

export interface EmployeeComputeConfig {
	/** Code → taxable, from EarningType config. Overrides the engine defaults. */
	taxableByCode: Map<string, boolean>
	/** Monthly-statutory proration: 0.5 for semi-monthly, 1 for monthly. */
	periodShare: number
	loans: AmortItem[]
	cashAdvances: AmortItem[]
	/** Recurring custom deductions (#66), already prorated to the period. */
	recurringDeductions?: PayComponent[]
	/**
	 * Per-employee statutory exemptions (#173). A flagged contribution is not enrolled, so BOTH
	 * its EE and ER share are zeroed before proration. Withholding tax is never exempted. Omitted →
	 * all contributions on (the default).
	 */
	statutoryExemptions?: { sss: boolean; philhealth: boolean; pagibig: boolean }
	/**
	 * Per-employee "employer share paid externally" (#173, Feature C). A flagged contribution has its
	 * ER share zeroed before proration; the EE share is still deducted and tax is untouched. Independent
	 * of `statutoryExemptions` (which zeroes both shares). Omitted → all ER shares kept (the default).
	 */
	employerShareExternal?: { sss: boolean; philhealth: boolean; pagibig: boolean }
	/**
	 * Per-employee statutory EE-share cutoff choice (#173, Feature E). EVEN (or omitted) keeps the
	 * `× periodShare` split; FIRST/SECOND load the full monthly EE onto one semi-monthly cutoff. Only
	 * meaningful when `periodKind` is FIRST_HALF or SECOND_HALF — WHOLE_MONTH/legacy runs ignore it.
	 * ER share and tax keep their normal proration regardless.
	 */
	statutoryAllocations?: {
		sss: StatutoryAllocation
		philhealth: StatutoryAllocation
		pagibig: StatutoryAllocation
	}
	/**
	 * Which standard cutoff this run covers (#173, Feature E), from `describePeriod(start, end).kind`.
	 * Drives `statutoryAllocations`; omitted/null (preview has no period) → allocation is moot and the
	 * EE share falls back to `× periodShare`.
	 */
	periodKind?: PeriodKind | null
	/** Org premium-pay multipliers (from PayRateRule); omitted → DOLE defaults. */
	rates?: PayRates
	/**
	 * Org statutory rate overrides (#220), resolved from `StatutoryRateConfig` via
	 * `statutoryRatesFromConfig`. Omitted (or all fields absent) → the hardcoded PH tables in
	 * `ph-statutory.ts`, i.e. today's numbers. Wired identically in the run and the preview.
	 */
	statutoryRates?: StatutoryRates
	/**
	 * Paid hours the period actually schedules, used to value absences for fixed-basic staff
	 * (#121). The real run passes its holiday-aware `scheduledHours`; omitted → derived from the
	 * employee's working days × daily hours × `periodShare`.
	 */
	expectedHours?: number
	/**
	 * #170 (decision B): the comp effective on the FIRST calendar day of the period's month — the
	 * statutory basis. Statutory (SSS/PhilHealth/Pag-IBIG/tax) is computed from THIS, not the
	 * period-end comp, so a raise effective mid-month only reaches statutory the following month.
	 * Omitted → statutory uses `comp` (today's behaviour, and the no-change parity anchor).
	 */
	statutoryComp?: EmployeeComp
	/**
	 * #170: day-split basic-pay segments for a MONTHLY mid-period salary change. Each carries a
	 * `weight` = periodShare · (segment working days / period working days), Σ weight == periodShare,
	 * so basic = Σ (salary × weight). Only passed for a pure MONTHLY amount split (the run guards
	 * pay-type flips and hourly/daily to Stage 2); omitted → basic prorates by `× periodShare`.
	 */
	basicSegments?: { salary: Money; rateType: RateType; weight: Money }[]
	/**
	 * #170 Stage 2: day-split segments for a MIXED-basis mid-period change (an hourly/daily rate
	 * change, or a MONTHLY↔hourly pay-type flip). Takes precedence over `basicSegments`. BASIC,
	 * TARDINESS and ABSENCE become sums over these segments (each valued by its own basis/rate/
	 * expectedHours); premiums, statutory, loans, recurring and the #103 floor stay period-aggregate.
	 * Omitted → the Stage 1 `basicSegments` path or the single-value default (parity).
	 */
	segments?: ComputeSegment[]
}

export interface ProratedStatutory {
	sssEe: number
	sssEr: number
	philhealthEe: number
	philhealthEr: number
	pagibigEe: number
	pagibigEr: number
	withholdingTax: number
}

export interface EmployeeComputeResult {
	earnings: PayComponent[]
	deductions: PayComponent[]
	basicPay: number
	grossPay: number
	taxableGross: number
	totalDeductions: number
	netPay: number
	statutory: ProratedStatutory
	/** Deductions gross could not fund (#103). > 0 means net was floored and needs review. */
	uncollected: number
}

/**
 * The employee share for one contribution in this period (#173, Feature E). On a semi-monthly
 * cutoff: EVEN keeps the half split; FIRST loads the full monthly EE onto the 1–15 cutoff (0 on the
 * other), SECOND onto the 16–EOM cutoff. Returns a Money that the caller quantizes once, exactly
 * like the pre-existing EE line.
 *
 * #163: a CUSTOM same-month range has `kind === null`, and under FIRST or SECOND it takes ZERO —
 * the designated cutoff run still collects the whole month, so a month never exceeds 100% of the
 * monthly EE contribution. WHOLE_MONTH and `undefined` (the preview path, which never supplies a
 * kind) are checked FIRST and stay on `× share`, which is the guard rail: neither may ever fall
 * into the custom-range ZERO branch. ER share and withholding tax keep `× share` regardless.
 *
 * #163 (review round 2): the ZERO is SAFE because a custom range can no longer overlap a
 * designated cutoff window at all — `assertCustomRangeClearOfCutoff` (services/payroll/index.ts)
 * refuses one with a 400 in both write paths. The cutoff run the allocation hands the month to is
 * therefore always still creatable, so this branch can never leave a month uncollected, and the
 * outcome no longer depends on which run was created first.
 */
function resolveEE(
	monthlyEE: Money,
	mode: StatutoryAllocation,
	kind: PeriodKind | null | undefined,
	share: Money
): Money {
	if (kind === 'WHOLE_MONTH' || kind === undefined) return monthlyEE.times(share)
	if (mode === 'FIRST' || mode === 'SECOND') {
		return kind === (mode === 'FIRST' ? 'FIRST_HALF' : 'SECOND_HALF') ? monthlyEE : ZERO
	}
	return monthlyEE.times(share) // EVEN — the normal split (share is 0.5 on a cutoff)
}

export function computeEmployeeResult(
	comp: EmployeeComp,
	attendance: AttendanceInput,
	adjustments: PayAdjustments,
	cfg: EmployeeComputeConfig
): EmployeeComputeResult {
	const earnings = computeEarnings(comp, attendance, adjustments, cfg.rates, {
		periodShare: cfg.periodShare,
		basicSegments: cfg.basicSegments,
		segments: cfg.segments
	})
	// Requirement: taxability from EarningType config.
	for (const c of earnings.components) {
		const configured = cfg.taxableByCode.get(c.code)
		if (configured !== undefined) c.taxable = configured
	}
	// Lines-authoritative: the taxable subtotal is the sum of already-quantized earning lines.
	const taxableGross = sumQ(
		earnings.components.filter((c) => c.taxable).map((c) => c.amount)
	).toNumber()

	// #119: the monthly statutory figures come back EXACT, are prorated in decimal, and quantize
	// exactly once — here. Previously each was rounded, scaled by 0.5, then rounded again.
	// #120: brackets are defined on a MONTHLY salary credit, so hourly staff are projected to a
	// monthly equivalent first — passing a raw hourly rate would floor them in the lowest bracket.
	// #170 (decision B): statutory follows the day-1-of-month comp when supplied, so a mid-month
	// raise only lifts contributions the following month. `statutoryComp === comp` (the no-change
	// case, and the default) keeps today's numbers exactly.
	const m = computeStatutoryDeductions(
		monthlyBasisOf(cfg.statutoryComp ?? comp),
		cfg.statutoryRates
	)
	// #173: an exempted contribution is not enrolled — zero BOTH its EE and ER share before
	// proration, leaving the other contributions and their proration untouched. Withholding tax
	// is never exempted (income-based exemption is already the ₱0 bracket), so it is always
	// computed from the full contributions — `m.withholdingTax` is not affected here.
	const ex = cfg.statutoryExemptions
	// #173 (Feature C): "employer share paid externally" zeroes the ER share only. Exempt already
	// zeroes both shares, so a contribution that is exempt makes this a no-op (EE stays 0 either way).
	const ext = cfg.employerShareExternal
	// #173 (Feature E): the EE share may be loaded onto one semi-monthly cutoff instead of split.
	// Applied AFTER the exempt check — an exempt contribution stays 0 (its allocation is moot). ER
	// share and tax keep `× share` proration. Omitted → EVEN (unchanged).
	const alloc = cfg.statutoryAllocations
	const kind = cfg.periodKind
	const share = D(cfg.periodShare)
	const statutory: ProratedStatutory = {
		sssEe: ex?.sss ? 0 : q2n(resolveEE(m.sssEe, alloc?.sss ?? 'EVEN', kind, share)),
		sssEr: ex?.sss || ext?.sss ? 0 : q2n(m.sssEr.times(share)),
		philhealthEe: ex?.philhealth
			? 0
			: q2n(resolveEE(m.philhealthEe, alloc?.philhealth ?? 'EVEN', kind, share)),
		philhealthEr: ex?.philhealth || ext?.philhealth ? 0 : q2n(m.philhealthEr.times(share)),
		pagibigEe: ex?.pagibig ? 0 : q2n(resolveEE(m.pagibigEe, alloc?.pagibig ?? 'EVEN', kind, share)),
		pagibigEr: ex?.pagibig || ext?.pagibig ? 0 : q2n(m.pagibigEr.times(share)),
		withholdingTax: q2n(m.withholdingTax.times(share))
	}

	// #121: tardiness and absence are fixed-basic semantics. For hourly staff the unworked time is
	// already missing from `regularHours` (and therefore from BASIC), so charging these lines too
	// would deduct the same minutes a second time.
	const fixedBasic = basicPayBasis(comp) === 'FIXED'
	const expectedHours = cfg.expectedHours ?? expectedHoursOf(comp, cfg.periodShare)

	// #170 Stage 2: a mixed-basis split values tardiness/absence PER SEGMENT — each FIXED segment
	// against its own rate and its own `expectedHours` (wd_i × dailyHours), so a MONTHLY→hourly flip
	// never charges the MONTHLY half for the hourly half's hours (#121). Hourly segments contribute
	// nothing (their unworked time is already absent from BASIC). Absent → today's single-basis path.
	const segFixed = cfg.segments?.filter((s) => basicPayBasis(s.comp) === 'FIXED')
	const tardinessAmount = segFixed
		? sum(
				segFixed.map((s) =>
					computeTardiness(
						hourlyRateOf(s.comp),
						s.attendance.lateMinutes,
						s.attendance.undertimeMinutes
					)
				)
			)
		: undefined
	const absenceAmount = segFixed
		? sum(
				segFixed.map((s) =>
					computeAbsence(hourlyRateOf(s.comp), absenceHoursOf(s.attendance, s.expectedHours))
				)
			)
		: undefined

	const ded = computeDeductions({
		gross: earnings.gross,
		hourlyRate: hourlyRateOf(comp),
		lateMinutes: cfg.segments ? 0 : fixedBasic ? attendance.lateMinutes : 0,
		undertimeMinutes: cfg.segments ? 0 : fixedBasic ? attendance.undertimeMinutes : 0,
		absenceHours: cfg.segments ? 0 : fixedBasic ? absenceHoursOf(attendance, expectedHours) : 0,
		tardinessAmount,
		absenceAmount,
		statutory: {
			sssEe: statutory.sssEe,
			philhealthEe: statutory.philhealthEe,
			pagibigEe: statutory.pagibigEe,
			withholdingTax: statutory.withholdingTax
		},
		loans: cfg.loans,
		cashAdvances: cfg.cashAdvances,
		recurring: cfg.recurringDeductions
	})

	return {
		earnings: earnings.components,
		deductions: ded.components,
		basicPay: earnings.components.find((c) => c.code === 'BASIC')?.amount ?? 0,
		grossPay: earnings.gross,
		taxableGross,
		totalDeductions: ded.total,
		netPay: ded.net,
		statutory,
		uncollected: ded.uncollected
	}
}

/**
 * Roster + recurring-earning defaults for the calculator UI (full page and the floating
 * panel on payroll pages, #72). Prefill amounts are prorated exactly like computePayroll.
 *
 * #275: MANAGE_PAYROLL gates the only call site and holds MANAGER (#133), so an unscoped load
 * handed every branch manager the whole org's roster AND its per-employee allowance/incentive
 * amounts. Scoped with the PAY helper — not the roster one — because this is compensation, so
 * VIEW_PAY_ORGWIDE holders (FINANCE, PAYROLL_OFFICER) legitimately see org-wide; it is also the
 * helper `api/v1/payroll/calculator` uses, which keeps the dropdown and the preview guard in step.
 * `null` = unrestricted, so no id filter at all.
 */
export async function loadCalculatorData(actor: EmployeeAccessActor) {
	const organizationId = actor.organizationId
	const visibleIds = await listVisiblePayEmployeeIds(actor)
	const idFilter = visibleIds ? { id: { in: visibleIds } } : {}

	const [employees, config, recurring] = await Promise.all([
		db.employee.findMany({
			where: { organizationId, employmentStatus: 'ACTIVE', ...idFilter },
			select: { id: true, firstName: true, lastName: true, employeeNumber: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		}),
		db.payrollConfig.findUnique({ where: { organizationId }, select: { payFrequency: true } }),
		db.employeeEarning.groupBy({
			by: ['employeeId', 'kind'],
			where: {
				employee: { organizationId },
				isActive: true,
				...(visibleIds ? { employeeId: { in: visibleIds } } : {})
			},
			_sum: { monthlyAmount: true }
		})
	])

	const periodShare = (config?.payFrequency ?? 'SEMI_MONTHLY') === 'MONTHLY' ? 1 : 0.5
	const recurringDefaults: Record<string, { allowances: number; incentives: number }> = {}
	for (const g of recurring) {
		const rec = (recurringDefaults[g.employeeId] ??= { allowances: 0, incentives: 0 })
		const amount = q2n(D(g._sum.monthlyAmount ?? 0).times(periodShare))
		if (g.kind === 'ALLOWANCE') rec.allowances = amount
		else rec.incentives = amount
	}

	return { employees, recurringDefaults }
}

/**
 * What-if preview for one employee (PAY-016 / PAY-017). Loads the employee's compensation and the
 * org's rate/frequency + active loans, then runs the shared engine WITHOUT persisting anything.
 */
export async function previewPayroll(
	employeeId: string,
	organizationId: string,
	input: { attendance: AttendanceInput; adjustments?: PayAdjustments }
) {
	const employee = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true, firstName: true, lastName: true, basicMonthlySalary: true, rateType: true }
	})
	if (!employee) error(404, 'Employee not found')

	const [
		config,
		earningTypes,
		loansAll,
		advancesAll,
		payRateRule,
		statutoryRateConfig,
		recurringDeductions,
		statutoryConfigs
	] = await Promise.all([
		db.payrollConfig.findUnique({ where: { organizationId } }),
		db.earningType.findMany({ where: { organizationId }, select: { code: true, taxable: true } }),
		db.loan.findMany({ where: { employeeId, status: 'ACTIVE', balance: { gt: 0 } } }),
		db.cashAdvance.findMany({ where: { employeeId, status: 'ACTIVE', balance: { gt: 0 } } }),
		db.payRateRule.findUnique({ where: { organizationId } }),
		// Org statutory rate overrides (#220) — resolved identically to the real run (run↔preview parity).
		db.statutoryRateConfig.findUnique({ where: { organizationId } }),
		// Recurring custom deductions apply in the preview too (#66) — same as a real run.
		db.employeeDeduction.findMany({
			where: { employeeId, isActive: true, deductionType: { isActive: true } },
			include: { deductionType: { select: { code: true, label: true } } }
		}),
		// Per-employee statutory config (#173): exemptions, externally-paid ER share, and EE-share
		// allocation all live on one row — fetch once and partition in memory below (same as a real run).
		db.employeeStatutoryConfig.findMany({
			where: { employeeId },
			select: {
				contribution: true,
				exempt: true,
				employerSharePaidExternally: true,
				allocation: true
			}
		})
	])

	const periodShare = (config?.payFrequency ?? 'SEMI_MONTHLY') === 'MONTHLY' ? 1 : 0.5
	const cfg: EmployeeComputeConfig = {
		taxableByCode: new Map(earningTypes.map((e) => [e.code, e.taxable])),
		rates: ratesFromRule(payRateRule),
		statutoryRates: statutoryRatesFromConfig(statutoryRateConfig),
		periodShare,
		statutoryExemptions: statutoryExemptions(statutoryConfigs.filter((c) => c.exempt)),
		employerShareExternal: employerShareExternals(
			statutoryConfigs.filter((c) => c.employerSharePaidExternally)
		),
		statutoryAllocations: statutoryAllocations(
			statutoryConfigs.filter((c) => c.allocation !== 'EVEN')
		),
		recurringDeductions: recurringDeductionComponents(recurringDeductions, periodShare),
		loans: loansAll.map((l) => ({
			refId: l.id,
			label: l.type ?? 'Loan',
			installment: l.installment,
			balance: l.balance
		})),
		cashAdvances: advancesAll.map((a) => ({
			refId: a.id,
			label: 'Cash advance',
			installment: a.installment,
			balance: a.balance
		}))
	}

	const comp: EmployeeComp = {
		basicMonthlySalary: employee.basicMonthlySalary,
		rateType: employee.rateType
	}
	const result = computeEmployeeResult(comp, input.attendance, input.adjustments ?? {}, cfg)

	return {
		employee: { id: employee.id, firstName: employee.firstName, lastName: employee.lastName },
		...result
	}
}

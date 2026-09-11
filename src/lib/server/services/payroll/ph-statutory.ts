/**
 * Philippines statutory deductions per TRAIN Law and latest contribution tables.
 * SSS: per EC table (January 2024 schedule), PhilHealth: 5% of MSC, Pag-IBIG: 2% capped PHP 200.
 */

import { D, ZERO, type Money, type MoneyLike } from './money'

export interface SSSBracket {
	salaryFloor: number
	salaryCeiling: number
	totalContribution: number
	eeShare: number
	erShare: number
}

export const SSS_TABLE_2024: SSSBracket[] = [
	{ salaryFloor: 0, salaryCeiling: 4249.99, totalContribution: 570, eeShare: 180, erShare: 390 },
	{
		salaryFloor: 4250,
		salaryCeiling: 4749.99,
		totalContribution: 637.5,
		eeShare: 202.5,
		erShare: 435
	},
	{ salaryFloor: 4750, salaryCeiling: 5249.99, totalContribution: 705, eeShare: 225, erShare: 480 },
	{
		salaryFloor: 5250,
		salaryCeiling: 5749.99,
		totalContribution: 772.5,
		eeShare: 247.5,
		erShare: 525
	},
	{ salaryFloor: 5750, salaryCeiling: 6249.99, totalContribution: 840, eeShare: 270, erShare: 570 },
	{
		salaryFloor: 6250,
		salaryCeiling: 6749.99,
		totalContribution: 907.5,
		eeShare: 292.5,
		erShare: 615
	},
	{ salaryFloor: 6750, salaryCeiling: 7249.99, totalContribution: 975, eeShare: 315, erShare: 660 },
	{
		salaryFloor: 7250,
		salaryCeiling: 7749.99,
		totalContribution: 1042.5,
		eeShare: 337.5,
		erShare: 705
	},
	{
		salaryFloor: 7750,
		salaryCeiling: 8249.99,
		totalContribution: 1110,
		eeShare: 360,
		erShare: 750
	},
	{
		salaryFloor: 8250,
		salaryCeiling: 8749.99,
		totalContribution: 1177.5,
		eeShare: 382.5,
		erShare: 795
	},
	{
		salaryFloor: 8750,
		salaryCeiling: 9249.99,
		totalContribution: 1245,
		eeShare: 405,
		erShare: 840
	},
	{
		salaryFloor: 9250,
		salaryCeiling: 9749.99,
		totalContribution: 1312.5,
		eeShare: 427.5,
		erShare: 885
	},
	{
		salaryFloor: 9750,
		salaryCeiling: 10249.99,
		totalContribution: 1380,
		eeShare: 450,
		erShare: 930
	},
	{
		salaryFloor: 10250,
		salaryCeiling: 10749.99,
		totalContribution: 1447.5,
		eeShare: 472.5,
		erShare: 975
	},
	{
		salaryFloor: 10750,
		salaryCeiling: 11249.99,
		totalContribution: 1515,
		eeShare: 495,
		erShare: 1020
	},
	{
		salaryFloor: 11250,
		salaryCeiling: 11749.99,
		totalContribution: 1582.5,
		eeShare: 517.5,
		erShare: 1065
	},
	{
		salaryFloor: 11750,
		salaryCeiling: 12249.99,
		totalContribution: 1650,
		eeShare: 540,
		erShare: 1110
	},
	{
		salaryFloor: 12250,
		salaryCeiling: 12749.99,
		totalContribution: 1717.5,
		eeShare: 562.5,
		erShare: 1155
	},
	{
		salaryFloor: 12750,
		salaryCeiling: 13249.99,
		totalContribution: 1785,
		eeShare: 585,
		erShare: 1200
	},
	{
		salaryFloor: 13250,
		salaryCeiling: 13749.99,
		totalContribution: 1852.5,
		eeShare: 607.5,
		erShare: 1245
	},
	{
		salaryFloor: 13750,
		salaryCeiling: 14249.99,
		totalContribution: 1920,
		eeShare: 630,
		erShare: 1290
	},
	{
		salaryFloor: 14250,
		salaryCeiling: 14749.99,
		totalContribution: 1987.5,
		eeShare: 652.5,
		erShare: 1335
	},
	{
		salaryFloor: 14750,
		salaryCeiling: 15249.99,
		totalContribution: 2055,
		eeShare: 675,
		erShare: 1380
	},
	{
		salaryFloor: 15250,
		salaryCeiling: 15749.99,
		totalContribution: 2122.5,
		eeShare: 697.5,
		erShare: 1425
	},
	{
		salaryFloor: 15750,
		salaryCeiling: 16249.99,
		totalContribution: 2190,
		eeShare: 720,
		erShare: 1470
	},
	{
		salaryFloor: 16250,
		salaryCeiling: 16749.99,
		totalContribution: 2257.5,
		eeShare: 742.5,
		erShare: 1515
	},
	{
		salaryFloor: 16750,
		salaryCeiling: 17249.99,
		totalContribution: 2325,
		eeShare: 765,
		erShare: 1560
	},
	{
		salaryFloor: 17250,
		salaryCeiling: 17749.99,
		totalContribution: 2392.5,
		eeShare: 787.5,
		erShare: 1605
	},
	{
		salaryFloor: 17750,
		salaryCeiling: 18249.99,
		totalContribution: 2460,
		eeShare: 810,
		erShare: 1650
	},
	{
		salaryFloor: 18250,
		salaryCeiling: 18749.99,
		totalContribution: 2527.5,
		eeShare: 832.5,
		erShare: 1695
	},
	{
		salaryFloor: 18750,
		salaryCeiling: 19249.99,
		totalContribution: 2595,
		eeShare: 855,
		erShare: 1740
	},
	{
		salaryFloor: 19250,
		salaryCeiling: 19749.99,
		totalContribution: 2662.5,
		eeShare: 877.5,
		erShare: 1785
	},
	{
		salaryFloor: 19750,
		salaryCeiling: 20249.99,
		totalContribution: 2730,
		eeShare: 900,
		erShare: 1830
	},
	{
		salaryFloor: 20250,
		salaryCeiling: Infinity,
		totalContribution: 2880,
		eeShare: 900,
		erShare: 1980
	}
]

export function computeSSS(
	monthlySalary: MoneyLike,
	brackets: SSSBracket[] = SSS_TABLE_2024
): { ee: Money; er: Money } {
	const table = brackets.length ? brackets : SSS_TABLE_2024
	const salary = D(monthlySalary)
	const bracket =
		table.find((b) => salary.gte(b.salaryFloor) && salary.lte(b.salaryCeiling)) ??
		table[table.length - 1]

	// Fixed peso amounts straight off the table — exact by nature, no arithmetic involved.
	return { ee: D(bracket.eeShare), er: D(bracket.erShare) }
}

export function computePhilhealth(
	monthlySalary: MoneyLike,
	opts?: { rate?: MoneyLike; floor?: number; ceiling?: number }
): { ee: Money; er: Money } {
	const RATE = opts?.rate ?? '0.05'
	const FLOOR = opts?.floor ?? 10000
	const CEILING = opts?.ceiling ?? 100000

	// Exact: a salary of ₱10,000.20 lands the EE share on exactly 250.005, a half-centavo that
	// float arithmetic would perturb before it ever reaches the rounding step (#119).
	const salary = D(monthlySalary)
	const msc = salary.lt(FLOOR) ? D(FLOOR) : salary.gt(CEILING) ? D(CEILING) : salary
	const share = msc.times(RATE).dividedBy(2)

	return { ee: share, er: share }
}

export function computePagibig(
	monthlySalary: MoneyLike,
	opts?: { rate?: MoneyLike; cap?: number }
): { ee: Money; er: Money } {
	const RATE = opts?.rate ?? '0.02'
	// ₱200 = 2% of the ₱10,000 monthly-compensation ceiling (HDMF Circular 460, effective Feb 2024;
	// was ₱100 under the old ₱5,000 ceiling). ponytail: single rate for both shares — the ≤₱1,500
	// tier (EE 1% / ER 2%) is unmodelled; no real payroll pays under ₱1,500/mo. Add split EE/ER rates
	// only if that population ever appears.
	const CAP = opts?.cap ?? 200

	const raw = D(monthlySalary).times(RATE)
	const share = raw.gt(CAP) ? D(CAP) : raw

	return { ee: share, er: share }
}

export interface TaxBracket {
	floor: number
	ceiling: number
	baseTax: number
	rate: number
	excessOver: number
}

export const BIR_MONTHLY_TAX_TABLE: TaxBracket[] = [
	{ floor: 0, ceiling: 20833, baseTax: 0, rate: 0, excessOver: 0 },
	{ floor: 20833, ceiling: 33332, baseTax: 0, rate: 0.15, excessOver: 20833 },
	{ floor: 33333, ceiling: 66666, baseTax: 1875, rate: 0.2, excessOver: 33333 },
	{ floor: 66667, ceiling: 166666, baseTax: 8541.8, rate: 0.25, excessOver: 66667 },
	{ floor: 166667, ceiling: 666666, baseTax: 33541.8, rate: 0.3, excessOver: 166667 },
	{ floor: 666667, ceiling: Infinity, baseTax: 183541.8, rate: 0.35, excessOver: 666667 }
]

export function computeWithholdingTax(
	taxableMonthlyIncome: MoneyLike,
	brackets: TaxBracket[] = BIR_MONTHLY_TAX_TABLE
): Money {
	const table = brackets.length ? brackets : BIR_MONTHLY_TAX_TABLE
	const income = D(taxableMonthlyIncome)
	const bracket =
		table.find((b) => income.gte(b.floor) && income.lte(b.ceiling)) ?? table[table.length - 1]

	// Bracket rates (0.15/0.20/0.25/0.30/0.35) are exact as decimals; as binary floats they are not.
	return D(bracket.baseTax).plus(income.minus(bracket.excessOver).times(D(bracket.rate)))
}

/**
 * Monthly statutory figures, EXACT and unquantized (#119). The caller prorates to the period and
 * quantizes once — rounding here and again after scaling was the round → scale → round defect.
 */
export interface StatutoryResult {
	sssEe: Money
	sssEr: Money
	philhealthEe: Money
	philhealthEr: Money
	pagibigEe: Money
	pagibigEr: Money
	withholdingTax: Money
	totalDeductions: Money
	netPay: Money
}

/**
 * Effective statutory rates for one computation (#220). Every field is optional; an absent field
 * makes the compute fn fall back to its hardcoded default, so `computeStatutoryDeductions(gross)`
 * with no `rates` is byte-for-byte identical to the pre-#220 behaviour (the parity guarantee).
 */
export interface StatutoryRates {
	sssBrackets?: SSSBracket[]
	taxBrackets?: TaxBracket[]
	philhealth?: { rate?: MoneyLike; floor?: number; ceiling?: number }
	pagibig?: { rate?: MoneyLike; cap?: number }
}

// An Infinity ceiling can't cross JSON or the DB — store null, revive to Infinity on read.
export const sssBracketsToWire = (rows: SSSBracket[]) =>
	rows.map((b) => ({
		...b,
		salaryCeiling: Number.isFinite(b.salaryCeiling) ? b.salaryCeiling : null
	}))
export const taxBracketsToWire = (rows: TaxBracket[]) =>
	rows.map((b) => ({ ...b, ceiling: Number.isFinite(b.ceiling) ? b.ceiling : null }))

/**
 * Current PH legal values as the SEED/REFERENCE (#220). StatutoryRateConfig is now the
 * authoritative source; each org's row is seeded to exactly this, the editor prefills it, and the
 * resolver still falls back to it when a row is missing so a fresh org never computes zero tax.
 * Shape matches what StatutoryRateConfig persists (Infinity ceilings already wired to null).
 */
export const DEFAULT_STATUTORY_RATE_CONFIG = {
	philhealthRate: 0.05,
	philhealthFloor: 10000,
	philhealthCeiling: 100000,
	pagibigRate: 0.02,
	pagibigCap: 200,
	sssBrackets: sssBracketsToWire(SSS_TABLE_2024),
	taxBrackets: taxBracketsToWire(BIR_MONTHLY_TAX_TABLE)
}

export function computeStatutoryDeductions(
	grossPay: MoneyLike,
	rates?: StatutoryRates
): StatutoryResult {
	const gross = D(grossPay)
	const sss = computeSSS(gross, rates?.sssBrackets)
	const ph = computePhilhealth(gross, rates?.philhealth)
	const pi = computePagibig(gross, rates?.pagibig)

	// Tax base is gross minus the EXACT contributions, never the rounded ones.
	const totalEeDeductions = sss.ee.plus(ph.ee).plus(pi.ee)
	const taxableIncome = gross.minus(totalEeDeductions)
	const rawTax = computeWithholdingTax(taxableIncome, rates?.taxBrackets)
	const tax = rawTax.lt(0) ? ZERO : rawTax

	const totalDeductions = totalEeDeductions.plus(tax)

	return {
		sssEe: sss.ee,
		sssEr: sss.er,
		philhealthEe: ph.ee,
		philhealthEr: ph.er,
		pagibigEe: pi.ee,
		pagibigEr: pi.er,
		withholdingTax: tax,
		totalDeductions,
		netPay: gross.minus(totalDeductions)
	}
}

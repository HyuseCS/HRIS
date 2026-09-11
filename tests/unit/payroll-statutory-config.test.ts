import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import {
	computeStatutoryDeductions,
	computeWithholdingTax,
	DEFAULT_STATUTORY_RATE_CONFIG,
	type StatutoryRates
} from '$lib/server/services/payroll/ph-statutory'
import {
	statutoryRatesFromConfig,
	deriveTaxBrackets,
	sssBracketsSchema,
	taxBracketsSchema,
	statutoryRateInputSchema,
	type StatutoryRateConfigRow
} from '$lib/server/services/payroll/statutory-rates'

// #220: the SEEDED path. A StatutoryRateConfig row seeded to the current legal values (exactly what
// `prisma/seed-core.ts` writes and the editor prefills) must resolve to the same effective rates as
// the hardcoded fallback — this is the parity guarantee for the "config is authoritative" model.
const seededRow: StatutoryRateConfigRow = {
	philhealthRate: new Prisma.Decimal(DEFAULT_STATUTORY_RATE_CONFIG.philhealthRate),
	philhealthFloor: new Prisma.Decimal(DEFAULT_STATUTORY_RATE_CONFIG.philhealthFloor),
	philhealthCeiling: new Prisma.Decimal(DEFAULT_STATUTORY_RATE_CONFIG.philhealthCeiling),
	pagibigRate: new Prisma.Decimal(DEFAULT_STATUTORY_RATE_CONFIG.pagibigRate),
	pagibigCap: new Prisma.Decimal(DEFAULT_STATUTORY_RATE_CONFIG.pagibigCap),
	sssBrackets: DEFAULT_STATUTORY_RATE_CONFIG.sssBrackets as unknown as Prisma.JsonValue,
	taxBrackets: DEFAULT_STATUTORY_RATE_CONFIG.taxBrackets as unknown as Prisma.JsonValue
}
const SEEDED = statutoryRatesFromConfig(seededRow)

/**
 * #220 configurable statutory rate tables. The parity block is the safety gate: with no config the
 * engine must reproduce today's hardcoded numbers exactly. Then: overrides change the result, and
 * incoherent tables are rejected on save.
 */

const s = (m: { toString(): string }) => m.toString()

// Baselines from the hardcoded engine (SSS_TABLE_2024, BIR_MONTHLY_TAX_TABLE, PhilHealth
// 0.05/10000/100000, Pag-IBIG 0.02/200). Byte-for-byte, not a tolerance. The three resolver paths
// must agree; the Pag-IBIG cap is ₱200 (2% of the ₱10,000 ceiling, HDMF Circular 460).
const PARITY: Record<
	string,
	{
		sssEe: string
		philhealthEe: string
		pagibigEe: string
		tax: string
		total: string
		net: string
	}
> = {
	'3000': {
		sssEe: '180',
		philhealthEe: '250',
		pagibigEe: '60',
		tax: '0',
		total: '490',
		net: '2510'
	},
	'15000': {
		sssEe: '675',
		philhealthEe: '375',
		pagibigEe: '200',
		tax: '0',
		total: '1250',
		net: '13750'
	},
	'30000': {
		sssEe: '900',
		philhealthEe: '750',
		pagibigEe: '200',
		tax: '1097.55',
		total: '2947.55',
		net: '27052.45'
	},
	'50000': {
		sssEe: '900',
		philhealthEe: '1250',
		pagibigEe: '200',
		tax: '4738.4',
		total: '7088.4',
		net: '42911.6'
	},
	'250000': {
		sssEe: '900',
		philhealthEe: '2500',
		pagibigEe: '200',
		tax: '57461.7',
		total: '61061.7',
		net: '188938.3'
	},
	'10000.20': {
		sssEe: '450',
		philhealthEe: '250.005',
		pagibigEe: '200',
		tax: '0',
		total: '900.005',
		net: '9100.195'
	}
}

describe('parity — no config row AND the seeded config reproduce the hardcoded engine exactly', () => {
	for (const [salary, exp] of Object.entries(PARITY)) {
		it(`salary ${salary}`, () => {
			// Three paths must all land on the exact hardcoded numbers: the "no argument" fallback, the
			// empty resolver output (statutoryRatesFromConfig(null)), and — the #220 rework gate — the
			// SEEDED config resolved through the authoritative path.
			for (const rates of [undefined, statutoryRatesFromConfig(null), SEEDED] as (
				StatutoryRates | undefined
			)[]) {
				const r = computeStatutoryDeductions(salary, rates)
				expect(s(r.sssEe)).toBe(exp.sssEe)
				expect(s(r.philhealthEe)).toBe(exp.philhealthEe)
				expect(s(r.pagibigEe)).toBe(exp.pagibigEe)
				expect(s(r.withholdingTax)).toBe(exp.tax)
				expect(s(r.totalDeductions)).toBe(exp.total)
				expect(s(r.netPay)).toBe(exp.net)
			}
		})
	}
})

describe('overrides change the computed deduction', () => {
	it('a raised tax-exempt threshold zeroes tax that the default would charge', () => {
		const rates: StatutoryRates = {
			taxBrackets: [
				{ floor: 0, ceiling: 50000, baseTax: 0, rate: 0, excessOver: 0 },
				{ floor: 50000, ceiling: Infinity, baseTax: 0, rate: 0.2, excessOver: 50000 }
			]
		}
		// 30000 gross → default tax 1097.55; with the exemption up to 50k it becomes 0.
		expect(s(computeStatutoryDeductions(30000).withholdingTax)).toBe('1097.55')
		expect(s(computeStatutoryDeductions(30000, rates).withholdingTax)).toBe('0')
	})

	it('an edited SSS bracket changes the EE share', () => {
		const rates: StatutoryRates = {
			sssBrackets: [
				{
					salaryFloor: 0,
					salaryCeiling: Infinity,
					totalContribution: 1500,
					eeShare: 500,
					erShare: 1000
				}
			]
		}
		expect(s(computeStatutoryDeductions(30000, rates).sssEe)).toBe('500')
	})

	it('an edited PhilHealth rate changes the EE share; scalars are independent of brackets', () => {
		const rates: StatutoryRates = { philhealth: { rate: '0.03' } }
		// 30000 clamped in-range → 30000 × 0.03 / 2 = 450 (default is 750). SSS/tax untouched.
		const r = computeStatutoryDeductions(30000, rates)
		expect(s(r.philhealthEe)).toBe('450')
		expect(s(r.sssEe)).toBe('900')
	})
})

describe('statutoryRatesFromConfig resolver', () => {
	it('null config yields an empty override set (all defaults)', () => {
		expect(statutoryRatesFromConfig(null)).toEqual({})
	})

	it('revives a null JSON ceiling back to Infinity and keeps exact Decimal rates', () => {
		const resolved = statutoryRatesFromConfig({
			philhealthRate: new Prisma.Decimal('0.0400'),
			sssBrackets: [
				{
					salaryFloor: 0,
					salaryCeiling: 9999.99,
					totalContribution: 1000,
					eeShare: 400,
					erShare: 600
				},
				{
					salaryFloor: 10000,
					salaryCeiling: null,
					totalContribution: 2000,
					eeShare: 800,
					erShare: 1200
				}
			]
		})
		expect(resolved.sssBrackets?.[1].salaryCeiling).toBe(Infinity)
		// A very high salary lands the open-ended top bracket (proves Infinity revival works).
		expect(s(computeStatutoryDeductions(500000, resolved).sssEe)).toBe('800')
		expect(s(computeStatutoryDeductions(30000, resolved).philhealthEe)).toBe('600') // 30000×0.04/2
	})

	it('an empty sssBrackets array falls back to the hardcoded table (never a []-crash)', () => {
		const resolved = statutoryRatesFromConfig({ sssBrackets: [] })
		expect(resolved.sssBrackets).toBeUndefined()
		// Falls through to SSS_TABLE_2024 rather than dereferencing an out-of-range bracket.
		expect(s(computeStatutoryDeductions(3000, resolved).sssEe)).toBe('180')
	})

	it('a bracket row with a non-numeric field falls back to the hardcoded table (no NaN)', () => {
		const resolved = statutoryRatesFromConfig({
			sssBrackets: [
				{
					salaryFloor: 0,
					salaryCeiling: 'oops',
					totalContribution: 570,
					eeShare: 180,
					erShare: 390
				}
			] as unknown as Prisma.JsonValue
		})
		expect(resolved.sssBrackets).toBeUndefined()
		const r = computeStatutoryDeductions(3000, resolved)
		expect(s(r.sssEe)).toBe('180')
		expect(Number.isNaN(r.sssEe.toNumber())).toBe(false)
	})
})

describe('validation rejects incoherent tables (trust boundary)', () => {
	const validSss = [
		{ salaryFloor: 0, salaryCeiling: 9999.99, totalContribution: 1000, eeShare: 400, erShare: 600 },
		{
			salaryFloor: 10000,
			salaryCeiling: null,
			totalContribution: 2000,
			eeShare: 800,
			erShare: 1200
		}
	]
	const validTax = [
		{ floor: 0, ceiling: 20833, baseTax: 0, rate: 0, excessOver: 0 },
		{ floor: 20833, ceiling: null, baseTax: 0, rate: 0.2, excessOver: 20833 }
	]

	it('accepts a well-formed SSS and tax table', () => {
		expect(sssBracketsSchema.safeParse(validSss).success).toBe(true)
		expect(taxBracketsSchema.safeParse(validTax).success).toBe(true)
	})

	it('rejects an unsorted SSS table', () => {
		const bad = [validSss[1], validSss[0]] // descending floors
		expect(sssBracketsSchema.safeParse(bad).success).toBe(false)
	})

	it('rejects an SSS table whose first bracket does not cover 0', () => {
		const bad = [{ ...validSss[0], salaryFloor: 5000 }, validSss[1]]
		expect(sssBracketsSchema.safeParse(bad).success).toBe(false)
	})

	it('rejects overlapping tax brackets', () => {
		const bad = [
			{ floor: 0, ceiling: 30000, baseTax: 0, rate: 0, excessOver: 0 },
			{ floor: 20833, ceiling: null, baseTax: 0, rate: 0.2, excessOver: 20833 } // floor < prev ceiling
		]
		expect(taxBracketsSchema.safeParse(bad).success).toBe(false)
	})

	it('rejects a tax rate outside [0,1]', () => {
		const bad = [
			{ floor: 0, ceiling: 20833, baseTax: 0, rate: 0, excessOver: 0 },
			{ floor: 20833, ceiling: null, baseTax: 0, rate: 1.5, excessOver: 20833 }
		]
		expect(taxBracketsSchema.safeParse(bad).success).toBe(false)
	})

	it('rejects a table whose last bracket is not open-ended', () => {
		const bad = [
			{ floor: 0, ceiling: 20833, baseTax: 0, rate: 0, excessOver: 0 },
			{ floor: 20833, ceiling: 999999, baseTax: 0, rate: 0.2, excessOver: 20833 }
		]
		expect(taxBracketsSchema.safeParse(bad).success).toBe(false)
	})

	it('rejects a full payload whose PhilHealth floor exceeds its ceiling', () => {
		const parsed = statutoryRateInputSchema.safeParse({
			philhealthRate: 0.05,
			philhealthFloor: 20000,
			philhealthCeiling: 10000,
			pagibigRate: 0.02,
			pagibigCap: 100,
			sssBrackets: null,
			taxBrackets: null
		})
		expect(parsed.success).toBe(false)
	})

	it('accepts a full payload that clears every override (all null)', () => {
		const parsed = statutoryRateInputSchema.safeParse({
			philhealthRate: null,
			philhealthFloor: null,
			philhealthCeiling: null,
			pagibigRate: null,
			pagibigCap: null,
			sssBrackets: null,
			taxBrackets: null
		})
		expect(parsed.success).toBe(true)
	})
})

// #220: saving through the editor makes only ranges+rates authoritative and DERIVES the tax
// baseTax/excessOver. Under the 2023 BIR table deriving reproduces the shipped baseTax exactly, so
// the derived path owes the SAME pesos as the seeded one at every salary — no row is excepted. The
// old ₱250k exception existed only because the 2018 table's exact-thirds boundaries could not be
// re-derived from its integer floors; that drift is gone.
const seededDerivedRow: StatutoryRateConfigRow = {
	...seededRow,
	taxBrackets: deriveTaxBrackets(
		DEFAULT_STATUTORY_RATE_CONFIG.taxBrackets.map((b) => ({ ...b }))
	) as unknown as Prisma.JsonValue
}
const SEEDED_DERIVED = statutoryRatesFromConfig(seededDerivedRow)

describe('seeded config with DERIVED baseTax reproduces the computed tax (#220)', () => {
	it('the derived table owes the same pesos as the seeded one at every salary', () => {
		expect(seededDerivedRow.taxBrackets).toEqual(seededRow.taxBrackets)
	})

	for (const [salary, exp] of Object.entries(PARITY)) {
		it(`salary ${salary}`, () => {
			const r = computeStatutoryDeductions(salary, SEEDED_DERIVED)
			expect(s(r.sssEe)).toBe(exp.sssEe)
			expect(s(r.philhealthEe)).toBe(exp.philhealthEe)
			expect(s(r.pagibigEe)).toBe(exp.pagibigEe)
			expect(s(r.withholdingTax)).toBe(exp.tax)
			expect(s(r.totalDeductions)).toBe(exp.total)
			expect(s(r.netPay)).toBe(exp.net)
		})
	}
})

describe('editing tax ranges/rates re-derives baseTax and the tax follows (#220)', () => {
	const withInfinity = <T extends { ceiling: number | null }>(rows: T[]) =>
		rows.map((b) => ({ ...b, ceiling: b.ceiling ?? Infinity }))

	it('re-derives cumulative baseTax and moving the exempt threshold lowers the tax', () => {
		const table = withInfinity(
			deriveTaxBrackets([
				{ floor: 0, ceiling: 20000, rate: 0 },
				{ floor: 20000, ceiling: 50000, rate: 0.2 },
				{ floor: 50000, ceiling: null, rate: 0.3 }
			])
		)
		// baseTax = [0, 0, (50000-20000)*0.2 = 6000]; excessOver = floor.
		expect(table.map((b) => b.baseTax)).toEqual([0, 0, 6000])
		expect(table.map((b) => b.excessOver)).toEqual([0, 20000, 50000])
		// income 60000 → 6000 + (60000-50000)*0.3 = 9000
		expect(s(computeWithholdingTax(60000, table))).toBe('9000')

		// Raise the exempt threshold to 30000 → the top bracket's baseTax re-derives to 4000, so the
		// same income taxes less (7000). Editing a range coherently shifts downstream tax.
		const edited = withInfinity(
			deriveTaxBrackets([
				{ floor: 0, ceiling: 30000, rate: 0 },
				{ floor: 30000, ceiling: 50000, rate: 0.2 },
				{ floor: 50000, ceiling: null, rate: 0.3 }
			])
		)
		expect(edited.map((b) => b.baseTax)).toEqual([0, 0, 4000])
		expect(s(computeWithholdingTax(60000, edited))).toBe('7000')
	})
})

describe('rate percentage round-trip — load ×100 / save ÷100 drifts nothing (#220)', () => {
	it('recovers the exact decimal for every seeded rate', () => {
		const decimals = [
			DEFAULT_STATUTORY_RATE_CONFIG.philhealthRate,
			DEFAULT_STATUTORY_RATE_CONFIG.pagibigRate,
			...DEFAULT_STATUTORY_RATE_CONFIG.taxBrackets.map((b) => b.rate)
		]
		for (const d of decimals) {
			expect((d * 100) / 100).toBe(d)
		}
	})
})

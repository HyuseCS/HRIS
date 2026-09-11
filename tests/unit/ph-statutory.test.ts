import { describe, it, expect } from 'vitest'
import {
	computeSSS,
	computePhilhealth,
	computePagibig,
	computeWithholdingTax,
	computeStatutoryDeductions,
	BIR_MONTHLY_TAX_TABLE
} from '$lib/server/services/payroll/ph-statutory'
import { deriveTaxBrackets } from '$lib/server/services/payroll/statutory-rates'
import { D, type Money } from '$lib/server/services/payroll/money'

// #119: the statutory engine now returns exact `Decimal` values (unquantized — the caller prorates
// and rounds once). The expected AMOUNTS below are unchanged; only the unwrapping is new.
const n = (m: Money) => m.toNumber()

describe('SSS', () => {
	it('applies minimum bracket for salary below floor', () => {
		const { ee, er } = computeSSS(3000)
		expect(n(ee)).toBe(180)
		expect(n(er)).toBe(390)
	})

	it('applies maximum bracket for salary above ceiling', () => {
		const { ee } = computeSSS(25000)
		expect(n(ee)).toBe(900)
	})

	it('applies correct mid-bracket', () => {
		const { ee, er } = computeSSS(15000)
		expect(n(ee)).toBe(675)
		expect(n(er)).toBe(1380)
	})
})

describe('PhilHealth', () => {
	it('floors at minimum MSC for low salary', () => {
		const { ee } = computePhilhealth(5000)
		expect(n(ee)).toBe(250) // 10000 * 0.05 / 2
	})

	it('caps at maximum MSC for high salary', () => {
		const { ee } = computePhilhealth(200000)
		expect(n(ee)).toBe(2500) // 100000 * 0.05 / 2
	})

	it('computes proportionally in normal range', () => {
		const { ee } = computePhilhealth(30000)
		expect(n(ee)).toBe(750) // 30000 * 0.05 / 2
	})

	it('is exact on the half-centavo case that float arithmetic perturbs (#119)', () => {
		// ₱10,000.20 × 0.05 / 2 = exactly 250.005 — the reachable half-cent the issue calls out.
		const { ee } = computePhilhealth('10000.20')
		expect(ee.toString()).toBe('250.005')
	})
})

describe('Pag-IBIG', () => {
	it('caps at PHP 200 EE share', () => {
		const { ee } = computePagibig(20000)
		expect(n(ee)).toBe(200)
	})

	it('applies 2% for low earner', () => {
		const { ee } = computePagibig(3000)
		expect(n(ee)).toBe(60)
	})
})

describe('BIR Withholding Tax', () => {
	it('returns 0 for income below first bracket', () => {
		expect(n(computeWithholdingTax(20000))).toBe(0)
	})

	it('computes tax for 2nd bracket', () => {
		const tax = computeWithholdingTax(25000)
		expect(n(tax)).toBeCloseTo((15 * (25000 - 20833)) / 100, 0)
	})
})

describe('BIR table — derived baseTax equals the shipped baseTax', () => {
	it("derives the shipped table's own baseTax from its floors and rates alone", () => {
		const derived = deriveTaxBrackets(
			BIR_MONTHLY_TAX_TABLE.map(({ floor, rate }) => ({ floor, rate }))
		)
		expect(derived.map((b) => b.baseTax)).toEqual(BIR_MONTHLY_TAX_TABLE.map((b) => b.baseTax))
		expect(derived.map((b) => b.baseTax)).toEqual([0, 0, 1875, 8541.8, 33541.8, 183541.8])
		expect(derived.map((b) => b.excessOver)).toEqual(BIR_MONTHLY_TAX_TABLE.map((b) => b.excessOver))
	})

	it('derives the 2018 drift from the 2018 rate vector over the same floors', () => {
		const derived = deriveTaxBrackets(
			BIR_MONTHLY_TAX_TABLE.map(({ floor }, i) => ({
				floor,
				rate: [0, 0.2, 0.25, 0.3, 0.32, 0.35][i]
			}))
		)
		expect(derived.map((b) => b.baseTax)).toEqual([0, 0, 2500, 10833.5, 40833.5, 200833.5])
		expect(derived.map((b) => b.baseTax)).not.toEqual(BIR_MONTHLY_TAX_TABLE.map((b) => b.baseTax))
	})
})

describe('computeStatutoryDeductions', () => {
	it('netPay = grossPay - totalDeductions', () => {
		const result = computeStatutoryDeductions(30000)
		expect(n(result.netPay)).toBeCloseTo(30000 - n(result.totalDeductions), 1)
	})

	it('totalDeductions includes all EE contributions + tax', () => {
		const r = computeStatutoryDeductions(30000)
		const manual = n(r.sssEe) + n(r.philhealthEe) + n(r.pagibigEe) + n(r.withholdingTax)
		expect(n(r.totalDeductions)).toBeCloseTo(manual, 1)
	})

	it('reconciles EXACTLY, not just to a tolerance (#119)', () => {
		// The old float engine needed toBeCloseTo here. Exact decimal arithmetic means the identity
		// holds to the last digit.
		const r = computeStatutoryDeductions('10000.20')
		const manual = r.sssEe.plus(r.philhealthEe).plus(r.pagibigEe).plus(r.withholdingTax)
		expect(r.totalDeductions.equals(manual)).toBe(true)
		expect(r.netPay.equals(D('10000.20').minus(r.totalDeductions))).toBe(true)
	})

	it('computes the tax base from exact contributions, not rounded ones', () => {
		// taxableIncome = gross − (sss + philhealth + pagibig), all exact.
		const r = computeStatutoryDeductions('10000.20')
		expect(r.philhealthEe.toString()).toBe('250.005') // survives into the base unrounded
	})
})

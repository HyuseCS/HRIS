import { describe, it, expect } from 'vitest'
import {
	summarizeChanges,
	type WireConfig
} from '$lib/server/services/payroll/statutory-change-summary'
import {
	BIR_MONTHLY_TAX_TABLE,
	SSS_TABLE_2024,
	DEFAULT_STATUTORY_RATE_CONFIG
} from '$lib/server/services/payroll/ph-statutory'
import { deriveTaxBrackets, deriveSssTotals } from '$lib/server/services/payroll/statutory-rates'
import type { StatutoryRateInput } from '$lib/server/services/payroll/statutory-rates'

const NO_CHANGE = 'No effective change vs the live rates.'

// jsonb normalises key order to length, then alphabetical — this is the shape the DB returns.
const jsonbOrder = <T extends Record<string, unknown>>(row: T) =>
	Object.fromEntries(
		Object.keys(row)
			.sort((a, b) => a.length - b.length || a.localeCompare(b))
			.map((k) => [k, row[k]])
	)

const sssPayload = deriveSssTotals(
	SSS_TABLE_2024.map((b) => ({
		salaryFloor: b.salaryFloor,
		salaryCeiling: Number.isFinite(b.salaryCeiling) ? b.salaryCeiling : null,
		eeShare: b.eeShare,
		erShare: b.erShare
	}))
)
const taxPayload = deriveTaxBrackets(
	BIR_MONTHLY_TAX_TABLE.map((b) => ({
		floor: b.floor,
		ceiling: Number.isFinite(b.ceiling) ? b.ceiling : null,
		rate: b.rate
	}))
)

const liveConfig = (over: Partial<WireConfig> = {}): WireConfig => ({
	philhealthRate: 0.05,
	philhealthFloor: 10000,
	philhealthCeiling: 100000,
	pagibigRate: 0.02,
	pagibigCap: 200,
	sssBrackets: sssPayload.map(jsonbOrder),
	taxBrackets: taxPayload.map(jsonbOrder),
	...over
})

const payload = (over: Partial<StatutoryRateInput> = {}) =>
	({
		philhealthRate: 0.05,
		philhealthFloor: 10000,
		philhealthCeiling: 100000,
		pagibigRate: 0.02,
		pagibigCap: 200,
		sssBrackets: sssPayload,
		taxBrackets: taxPayload,
		...over
	}) as StatutoryRateInput

describe('summarizeChanges', () => {
	it('does not report an SSS change when only the key order differs', () => {
		expect(summarizeChanges(payload(), liveConfig())).not.toContain(
			'SSS contribution table changed'
		)
	})

	it('does not report a tax change when only the key order differs', () => {
		expect(summarizeChanges(payload(), liveConfig())).not.toContain(
			'BIR withholding-tax table changed'
		)
	})

	it('reports a genuinely changed SSS eeShare', () => {
		const edited = sssPayload.map((b, i) => (i === 0 ? { ...b, eeShare: b.eeShare + 5 } : b))
		expect(summarizeChanges(payload({ sssBrackets: edited }), liveConfig())).toContain(
			'SSS contribution table changed'
		)
	})

	it('reports a genuinely changed tax rate', () => {
		const edited = taxPayload.map((b, i) => (i === 2 ? { ...b, rate: 0.21 } : b))
		expect(summarizeChanges(payload({ taxBrackets: edited }), liveConfig())).toContain(
			'BIR withholding-tax table changed'
		)
	})

	it('reports a bracket-count change', () => {
		expect(summarizeChanges(payload({ sssBrackets: sssPayload.slice(1) }), liveConfig())).toContain(
			'SSS contribution table changed'
		)
	})

	it('reports only the Pag-IBIG cap when only the cap changed', () => {
		expect(summarizeChanges(payload({ pagibigCap: 99999 }), liveConfig())).toEqual([
			'Pag-IBIG cap: ₱200 → ₱99,999'
		])
	})

	it('returns the no-effective-change fallback when nothing changed', () => {
		expect(summarizeChanges(payload(), liveConfig())).toEqual([NO_CHANGE])
	})

	it('treats an Infinity live ceiling and a null payload ceiling as equal', () => {
		const rawSss = deriveSssTotals(
			SSS_TABLE_2024.map((b) => ({
				salaryFloor: b.salaryFloor,
				salaryCeiling: b.salaryCeiling,
				eeShare: b.eeShare,
				erShare: b.erShare
			}))
		)
		const rawTax = deriveTaxBrackets(
			BIR_MONTHLY_TAX_TABLE.map((b) => ({ floor: b.floor, ceiling: b.ceiling, rate: b.rate }))
		)
		expect(
			summarizeChanges(payload(), liveConfig({ sssBrackets: rawSss, taxBrackets: rawTax }))
		).toEqual([NO_CHANGE])
	})

	it('reports no change for an org with no config row vs an identical wire payload', () => {
		expect(summarizeChanges(payload(), DEFAULT_STATUTORY_RATE_CONFIG as WireConfig)).toEqual([
			NO_CHANGE
		])
	})
})

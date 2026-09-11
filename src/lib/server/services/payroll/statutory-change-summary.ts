import type { StatutoryRateInput } from './statutory-rates'

export type WireConfig = {
	philhealthRate: number
	philhealthFloor: number
	philhealthCeiling: number
	pagibigRate: number
	pagibigCap: number
	sssBrackets: unknown
	taxBrackets: unknown
}

const SSS_FIELDS = [
	'salaryFloor',
	'salaryCeiling',
	'eeShare',
	'erShare',
	'totalContribution'
] as const
const TAX_FIELDS = ['floor', 'ceiling', 'baseTax', 'rate', 'excessOver'] as const

const openCeiling = (v: unknown) => (v == null || v === Infinity ? null : Number(v))

function bracketsEqual(
	a: unknown,
	b: unknown,
	fields: readonly string[],
	ceilingField: string
): boolean {
	if (!Array.isArray(a) || !Array.isArray(b)) return false
	if (a.length !== b.length) return false
	return a.every((row, i) => {
		const pv = row as Record<string, unknown>
		const lv = b[i] as Record<string, unknown>
		return fields.every((f) =>
			f === ceilingField
				? openCeiling(pv[f]) === openCeiling(lv[f])
				: Number(pv[f]) === Number(lv[f])
		)
	})
}

// Human-readable diff of a proposed payload against the live config, for the review panel.
export function summarizeChanges(payload: StatutoryRateInput, live: WireConfig): string[] {
	const out: string[] = []
	const pct = (v: number) => `${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%`
	const peso = (v: number) => `₱${v.toLocaleString('en-PH')}`
	const scalar = (label: string, pv: number | null, lv: number, fmt: (v: number) => string) => {
		if (pv != null && pv !== lv) out.push(`${label}: ${fmt(lv)} → ${fmt(pv)}`)
	}
	scalar('PhilHealth rate', payload.philhealthRate, live.philhealthRate, pct)
	scalar('PhilHealth floor', payload.philhealthFloor, live.philhealthFloor, peso)
	scalar('PhilHealth ceiling', payload.philhealthCeiling, live.philhealthCeiling, peso)
	scalar('Pag-IBIG rate', payload.pagibigRate, live.pagibigRate, pct)
	scalar('Pag-IBIG cap', payload.pagibigCap, live.pagibigCap, peso)
	if (
		payload.sssBrackets &&
		!bracketsEqual(payload.sssBrackets, live.sssBrackets, SSS_FIELDS, 'salaryCeiling')
	)
		out.push('SSS contribution table changed')
	if (
		payload.taxBrackets &&
		!bracketsEqual(payload.taxBrackets, live.taxBrackets, TAX_FIELDS, 'ceiling')
	)
		out.push('BIR withholding-tax table changed')
	return out.length ? out : ['No effective change vs the live rates.']
}

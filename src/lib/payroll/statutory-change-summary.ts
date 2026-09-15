export type WireConfig = {
	philhealthRate: number
	philhealthFloor: number
	philhealthCeiling: number
	pagibigRate: number
	pagibigCap: number
	sssBrackets: unknown
	taxBrackets: unknown
}

export type ChangePayload = {
	philhealthRate: number | null
	philhealthFloor: number | null
	philhealthCeiling: number | null
	pagibigRate: number | null
	pagibigCap: number | null
	sssBrackets: unknown
	taxBrackets: unknown
}

export const NO_EFFECTIVE_CHANGE = 'No effective change vs the live rates.'

type Fmt = (v: number | null) => string

const pct: Fmt = (v) => `${(Number(v) * 100).toFixed(2).replace(/\.?0+$/, '')}%`
const peso: Fmt = (v) => (v == null ? '∞' : `₱${v.toLocaleString('en-PH')}`)
const openCeiling = (v: unknown) => (v == null || v === Infinity ? null : Number(v))

const SSS_FIELDS: [string, string, Fmt][] = [
	['salaryFloor', 'salary floor', peso],
	['salaryCeiling', 'salary ceiling', peso],
	['eeShare', 'EE share', peso],
	['erShare', 'ER share', peso]
]
const TAX_FIELDS: [string, string, Fmt][] = [
	['floor', 'floor', peso],
	['ceiling', 'ceiling', peso],
	['rate', 'rate', pct]
]

function bracketChanges(
	name: string,
	payload: unknown,
	live: unknown,
	fields: [string, string, Fmt][],
	ceilingField: string
): string[] {
	if (!Array.isArray(payload)) return []
	const liveRows = Array.isArray(live) ? live : []
	const out: string[] = []
	const rows = Math.max(payload.length, liveRows.length)
	for (let i = 0; i < rows; i++) {
		if (i >= liveRows.length) {
			out.push(`${name} row ${i + 1} added`)
			continue
		}
		if (i >= payload.length) {
			out.push(`${name} row ${i + 1} removed`)
			continue
		}
		const pv = payload[i] as Record<string, unknown>
		const lv = liveRows[i] as Record<string, unknown>
		for (const [key, label, fmt] of fields) {
			const read = (row: Record<string, unknown>) =>
				key === ceilingField ? openCeiling(row[key]) : Number(row[key])
			const p = fmt(read(pv))
			const l = fmt(read(lv))
			if (p !== l) out.push(`${name} row ${i + 1} ${label}: ${l} → ${p}`)
		}
	}
	return out
}

export function summarizeChanges(payload: ChangePayload, live: WireConfig): string[] {
	const out: string[] = []
	const scalar = (label: string, pv: number | null, lv: number, fmt: Fmt) => {
		if (pv != null && fmt(pv) !== fmt(lv)) out.push(`${label}: ${fmt(lv)} → ${fmt(pv)}`)
	}
	scalar('PhilHealth rate', payload.philhealthRate, live.philhealthRate, pct)
	scalar('PhilHealth floor', payload.philhealthFloor, live.philhealthFloor, peso)
	scalar('PhilHealth ceiling', payload.philhealthCeiling, live.philhealthCeiling, peso)
	scalar('Pag-IBIG rate', payload.pagibigRate, live.pagibigRate, pct)
	scalar('Pag-IBIG cap', payload.pagibigCap, live.pagibigCap, peso)
	out.push(
		...bracketChanges('SSS', payload.sssBrackets, live.sssBrackets, SSS_FIELDS, 'salaryCeiling')
	)
	out.push(...bracketChanges('BIR', payload.taxBrackets, live.taxBrackets, TAX_FIELDS, 'ceiling'))
	return out.length ? out : [NO_EFFECTIVE_CHANGE]
}

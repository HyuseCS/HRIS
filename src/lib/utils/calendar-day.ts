const DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/

export function parseDay(raw: string): { y: number; m: number; d: number } | null {
	const match = DATE_RE.exec(raw.trim())
	if (!match) return null
	const y = Number(match[1])
	const m = Number(match[2])
	const d = Number(match[3])
	if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null
	return { y, m, d }
}

export function formatDay(y: number, m: number, d: number): string {
	return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function normalizeDate(raw: string): string | null {
	if (raw.trim() === '') return ''
	const parsed = parseDay(raw)
	return parsed === null ? null : formatDay(parsed.y, parsed.m, parsed.d)
}

export function daysInMonth(y: number, m: number): number {
	return new Date(y, m, 0).getDate()
}

export function addDays(
	y: number,
	m: number,
	d: number,
	delta: number
): { y: number; m: number; d: number } {
	const date = new Date(y, m - 1, d + delta)
	return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
}

export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
	const date = new Date(y, m - 1 + delta, 1)
	return { y: date.getFullYear(), m: date.getMonth() + 1 }
}

export function weekday(y: number, m: number, d: number): number {
	return new Date(y, m - 1, d).getDay()
}

export function todayParts(): { y: number; m: number; d: number } {
	const now = new Date()
	return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
}

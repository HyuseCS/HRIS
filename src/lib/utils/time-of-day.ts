export const DAY_MINUTES = 1440

const TIME_RE = /^(\d{1,2})[:. ]?(\d{2})?$/

export function parseTime(raw: string): number | null {
	const match = TIME_RE.exec(raw.trim())
	if (!match) return null
	const h = Number(match[1])
	const m = match[2] === undefined ? 0 : Number(match[2])
	if (h > 23 || m > 59) return null
	return h * 60 + m
}

export function formatTime(min: number): string {
	const wrapped = ((min % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
	const h = Math.floor(wrapped / 60)
	const m = wrapped % 60
	return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

export function normalizeTime(raw: string): string | null {
	if (raw.trim() === '') return ''
	const min = parseTime(raw)
	return min === null ? null : formatTime(min)
}

function angleSteps(dx: number, dy: number, degPerStep: number, steps: number): number {
	const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
	return Math.round(deg / degPerStep) % steps
}

export function angleToMinute(dx: number, dy: number): number {
	return angleSteps(dx, dy, 6, 60)
}

export function angleToHour(dx: number, dy: number): number {
	return angleSteps(dx, dy, 30, 12)
}

export function handAngle(value: number, steps: number): number {
	return (value * 360) / steps
}

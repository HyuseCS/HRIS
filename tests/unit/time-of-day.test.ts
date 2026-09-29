import { describe, it, expect } from 'vitest'
import {
	DAY_MINUTES,
	parseTime,
	formatTime,
	normalizeTime,
	angleToMinute,
	angleToHour,
	handAngle
} from '$lib/utils/time-of-day'

const allTimes = Array.from({ length: DAY_MINUTES }, (_, i) => {
	const h = String(Math.floor(i / 60)).padStart(2, '0')
	const m = String(i % 60).padStart(2, '0')
	return `${h}:${m}`
})

describe('parseTime', () => {
	it.each([
		['09:00', 540],
		['9:00', 540],
		['8', 480],
		['12', 720],
		['23', 1380],
		['8:', 480],
		['123', 83],
		['830', 510],
		['0830', 510],
		['0900', 540],
		['8.30', 510],
		['8 30', 510],
		['00:00', 0],
		['23:59', 1439],
		['09:00 ', 540]
	])('parses %j as %i', (raw, expected) => {
		expect(parseTime(raw)).toBe(expected)
	})

	it.each(['', '   ', '93', '09:0', '24:00', '12:60', '25:61', '-1:00', 'abc', '9:aa', '09:00:30'])(
		'rejects %j',
		(raw) => {
			expect(parseTime(raw)).toBeNull()
		}
	)
})

describe('formatTime', () => {
	it.each([
		[0, '00:00'],
		[540, '09:00'],
		[1439, '23:59'],
		[1440, '00:00'],
		[-60, '23:00']
	])('formats %i as %j', (min, expected) => {
		expect(formatTime(min)).toBe(expected)
	})

	it('round-trips every wall-clock minute and never emits seconds', () => {
		for (const t of allTimes) {
			const out = formatTime(parseTime(t)!)
			expect(out).toBe(t)
			expect(out).not.toMatch(/:\d{2}:/)
		}
	})
})

describe('normalizeTime', () => {
	it('is the identity on every valid HH:MM', () => {
		for (const t of allTimes) expect(normalizeTime(t)).toBe(t)
	})

	it.each([
		['', ''],
		['  ', ''],
		['830', '08:30']
	])('normalizes %j to %j', (raw, expected) => {
		expect(normalizeTime(raw)).toBe(expected)
	})

	it.each(['abc', '9300'])('returns null for junk %j, never a clear', (raw) => {
		expect(normalizeTime(raw)).toBeNull()
	})
})

describe('angleToMinute', () => {
	it.each([
		[0, -1, 0],
		[1, 0, 15],
		[0, 1, 30],
		[-1, 0, 45]
	])('offset (%i, %i) is minute %i', (dx, dy, expected) => {
		expect(angleToMinute(dx, dy)).toBe(expected)
	})

	it('rounds a point just off a tick to the nearest minute', () => {
		const at = (deg: number) => {
			const r = (deg * Math.PI) / 180
			return angleToMinute(Math.sin(r), -Math.cos(r))
		}
		expect(at(92)).toBe(15)
		expect(at(94)).toBe(16)
		expect(at(358)).toBe(0)
	})
})

describe('angleToHour', () => {
	it.each([
		[0, -1, 0],
		[1, 0, 3],
		[0, 1, 6],
		[-1, 0, 9]
	])('offset (%i, %i) is hour %i', (dx, dy, expected) => {
		expect(angleToHour(dx, dy)).toBe(expected)
	})
})

describe('handAngle', () => {
	it.each([
		[15, 60, 90],
		[3, 12, 90],
		[0, 60, 0]
	])('value %i over %i steps is %i degrees', (value, steps, expected) => {
		expect(handAngle(value, steps)).toBe(expected)
	})
})

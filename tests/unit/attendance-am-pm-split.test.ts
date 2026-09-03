import { describe, it, expect } from 'vitest'
import {
	deriveAttendanceDay,
	DEFAULT_AM_PM_MIN_GAP_MINUTES,
	type AttPunchType,
	type ScheduleDay,
	type DayType
} from '$lib/server/services/attendance/derive'

/**
 * #162 — the AM/PM display split. `derive.ts` is DB-free, so these are pure specs with no mocks:
 * a punch array in, four extra nullable fields out. The split is DISPLAY ONLY, which A1 pins by
 * asserting `workedHours` is byte-identical with the flag on and off.
 *
 * Amendment 1 (A9–A13) covers the per-organization threshold. The threshold arrives as a
 * millisecond argument on `DeriveInput`; NULL in the column becomes `undefined` here and falls
 * back to DEFAULT_AM_PM_MIN_GAP_MINUTES.
 */

const T = (hhmm: string) => `2026-07-13T${hhmm}:00+08:00` // Mon, PHT
const p = (punchType: AttPunchType, iso: string) => ({ punchType, timestamp: new Date(iso) })
const SCHED_8_5: ScheduleDay = { startMinutes: 480, endMinutes: 1020, breakMinutes: 60 }

function derive(
	punches: ReturnType<typeof p>[],
	opts: {
		splitAmPm?: boolean
		amPmMinGapMs?: number
		schedule?: ScheduleDay | null
		dayType?: DayType
	} = {}
) {
	return deriveAttendanceDay({
		punches,
		schedule: opts.schedule === undefined ? SCHED_8_5 : opts.schedule,
		dayType: opts.dayType ?? 'REGULAR',
		splitAmPm: opts.splitAmPm ?? true,
		amPmMinGapMs: opts.amPmMinGapMs
	})
}

/** PHT clock time of a result field, or null — reads better than comparing ISO strings. */
const at = (d: Date | null) =>
	d
		? new Date(d).toLocaleTimeString('en-PH', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
				timeZone: 'Asia/Manila'
			})
		: null

// 08:00–11:00 + 13:00–17:00 — the canonical food-service split shift.
const SPLIT_SHIFT = [
	p('IN', T('08:00')),
	p('OUT', T('11:00')),
	p('IN', T('13:00')),
	p('OUT', T('17:00'))
]

// 08:00–11:00 + 11:20–17:00 — a 20-minute gap, deliberately between the 5-minute floor and the
// 30-minute default. This is the punch set the whole amendment turns on.
const NARROW_GAP_SHIFT = [
	p('IN', T('08:00')),
	p('OUT', T('11:00')),
	p('IN', T('11:20')),
	p('OUT', T('17:00'))
]

describe('#162 — AM/PM split (A1–A8)', () => {
	it('A1 splits a two-block day at the mid-day gap and leaves the hours untouched', () => {
		const r = derive(SPLIT_SHIFT)
		expect(at(r.amTimeIn)).toBe('08:00')
		expect(at(r.amTimeOut)).toBe('11:00')
		expect(at(r.pmTimeIn)).toBe('13:00')
		expect(at(r.pmTimeOut)).toBe('17:00')
		// timeIn/timeOut keep their pre-#162 meaning: first punch, last punch.
		expect(at(r.timeIn)).toBe('08:00')
		expect(at(r.timeOut)).toBe('17:00')
		// Display-only: the flag cannot move a single hour.
		const off = derive(SPLIT_SHIFT, { splitAmPm: false })
		expect(r.workedHours).toBe(off.workedHours)
		expect(r.regularHours).toBe(off.regularHours)
		expect(r.overtimeHours).toBe(off.overtimeHours)
		expect(r.lateMinutes).toBe(off.lateMinutes)
		expect(r.undertimeMinutes).toBe(off.undertimeMinutes)
	})

	it('A2 with splitAmPm off, nothing but the four AM/PM keys differs (negative control)', () => {
		// Rewritten per contract instruction E7: the whole result object cannot deep-equal a
		// pre-#162 baseline once the type gains four keys. Deleting exactly those four from BOTH
		// results proves the flag changes nothing else, which is what criterion 2 needs.
		const on = derive(SPLIT_SHIFT, { splitAmPm: true }) as unknown as Record<string, unknown>
		const off = derive(SPLIT_SHIFT, { splitAmPm: false }) as unknown as Record<string, unknown>
		for (const k of ['amTimeIn', 'amTimeOut', 'pmTimeIn', 'pmTimeOut']) {
			expect(off[k]).toBeNull()
			delete on[k]
			delete off[k]
		}
		expect(on).toEqual(off)
	})

	it('A3 picks the longest gap, not the first', () => {
		const r = derive([
			p('IN', T('08:00')),
			p('OUT', T('10:00')),
			p('IN', T('10:20')),
			p('OUT', T('12:00')),
			p('IN', T('14:00')),
			p('OUT', T('17:00'))
		])
		// The 20-minute gap at 10:00 is below the 30-minute default and would not qualify anyway;
		// what this pins is that the 2-hour gap wins the scan, not the first one found.
		expect(at(r.amTimeOut)).toBe('12:00')
		expect(at(r.pmTimeIn)).toBe('14:00')
		expect(at(r.amTimeIn)).toBe('08:00')
		expect(at(r.pmTimeOut)).toBe('17:00')
	})

	it('A4 leaves a below-threshold gap alone', () => {
		const r = derive([
			p('IN', T('08:00')),
			p('OUT', T('12:00')),
			p('IN', T('12:10')),
			p('OUT', T('17:00'))
		])
		expect(r.amTimeIn).toBeNull()
		expect(r.amTimeOut).toBeNull()
		expect(r.pmTimeIn).toBeNull()
		expect(r.pmTimeOut).toBeNull()
		expect(at(r.timeIn)).toBe('08:00')
		expect(at(r.timeOut)).toBe('17:00')
	})

	it('A5 reports an AM block with a PM block still running', () => {
		const r = derive([p('IN', T('08:00')), p('OUT', T('11:00')), p('IN', T('13:00'))])
		expect(at(r.amTimeIn)).toBe('08:00')
		expect(at(r.amTimeOut)).toBe('11:00')
		expect(at(r.pmTimeIn)).toBe('13:00')
		expect(r.pmTimeOut).toBeNull()
		expect(r.status).toBe('INCOMPLETE')
	})

	it('A6 a lone IN does not throw and splits nothing', () => {
		const r = derive([p('IN', T('08:00'))])
		expect(r.status).toBe('INCOMPLETE')
		expect(r.amTimeIn).toBeNull()
		expect(r.amTimeOut).toBeNull()
		expect(r.pmTimeIn).toBeNull()
		expect(r.pmTimeOut).toBeNull()
	})

	it('A7 breaks a tie towards the earliest gap (determinism)', () => {
		const r = derive([
			p('IN', T('08:00')),
			p('OUT', T('09:00')),
			p('IN', T('10:00')),
			p('OUT', T('11:00')),
			p('IN', T('12:00')),
			p('OUT', T('13:00'))
		])
		expect(at(r.amTimeOut)).toBe('09:00')
		expect(at(r.pmTimeIn)).toBe('10:00')
	})

	it('A8 keeps amTimeIn === timeIn and pmTimeOut === timeOut wherever a PM block closes', () => {
		for (const punches of [
			SPLIT_SHIFT,
			[
				p('IN', T('08:00')),
				p('OUT', T('10:00')),
				p('IN', T('10:20')),
				p('OUT', T('12:00')),
				p('IN', T('14:00')),
				p('OUT', T('17:00'))
			],
			[p('IN', T('08:00')), p('OUT', T('11:00')), p('IN', T('13:00'))]
		]) {
			const r = derive(punches)
			expect(r.amTimeIn!.getTime()).toBe(r.timeIn!.getTime())
			if (r.pmTimeOut) expect(r.pmTimeOut.getTime()).toBe(r.timeOut!.getTime())
		}
	})
})

describe('#162 — a dangling IN competes with the closed gaps (A14–A17)', () => {
	// The open gap used to be an else-branch, reached only when NO closed gap qualified, so a
	// narrow-but-qualifying closed gap won the day and the still-running block vanished. Gap
	// sizes below are written as literal clock times on purpose: sizing a fixture off the
	// threshold constant would move both sides of the comparison and stay green under mutation.

	it('A14 the wider open gap beats a qualifying closed gap', () => {
		// closed gap 10:00→11:00 = 1 h (qualifies); open gap 13:00→16:00 = 3 h (wider).
		const r = derive([
			p('IN', T('08:00')),
			p('OUT', T('10:00')),
			p('IN', T('11:00')),
			p('OUT', T('13:00')),
			p('IN', T('16:00'))
		])
		expect(at(r.amTimeIn)).toBe('08:00')
		expect(at(r.amTimeOut)).toBe('13:00')
		expect(at(r.pmTimeIn)).toBe('16:00')
		expect(r.pmTimeOut).toBeNull()
		expect(r.status).toBe('INCOMPLETE')
	})

	it('A15 a wider closed gap still wins over the open gap', () => {
		// closed gap 10:00→14:00 = 4 h; open gap 15:00→16:00 = 1 h.
		const r = derive([
			p('IN', T('08:00')),
			p('OUT', T('10:00')),
			p('IN', T('14:00')),
			p('OUT', T('15:00')),
			p('IN', T('16:00'))
		])
		expect(at(r.amTimeIn)).toBe('08:00')
		expect(at(r.amTimeOut)).toBe('10:00')
		expect(at(r.pmTimeIn)).toBe('14:00')
		expect(at(r.pmTimeOut)).toBe('15:00')
	})

	it('A16 an exact tie between a closed gap and the open gap goes to the closed one', () => {
		// closed gap 10:00→12:00 = 2 h; open gap 14:00→16:00 = 2 h. Earliest qualifying gap wins,
		// and the open gap is always the latest, so the closed boundary keeps the day.
		const r = derive([
			p('IN', T('08:00')),
			p('OUT', T('10:00')),
			p('IN', T('12:00')),
			p('OUT', T('14:00')),
			p('IN', T('16:00'))
		])
		expect(at(r.amTimeIn)).toBe('08:00')
		expect(at(r.amTimeOut)).toBe('10:00')
		expect(at(r.pmTimeIn)).toBe('12:00')
		expect(at(r.pmTimeOut)).toBe('14:00')
	})

	it('A17 an open gap that is widest but below the threshold splits nothing', () => {
		// closed gap 12:00→12:10 = 10 min; open gap 13:00→13:20 = 20 min. The open gap wins the
		// comparison and still fails the 30-minute default, so the day stays unsplit. Without the
		// threshold test on the open gap this would manufacture a PM block at 13:20.
		const r = derive([
			p('IN', T('08:00')),
			p('OUT', T('12:00')),
			p('IN', T('12:10')),
			p('OUT', T('13:00')),
			p('IN', T('13:20'))
		])
		expect(r.amTimeIn).toBeNull()
		expect(r.amTimeOut).toBeNull()
		expect(r.pmTimeIn).toBeNull()
		expect(r.pmTimeOut).toBeNull()
	})
})

describe('#162 Amendment 1 — per-organization threshold (A9–A13)', () => {
	it('A9 an undefined threshold falls back to the built-in default', () => {
		expect(DEFAULT_AM_PM_MIN_GAP_MINUTES).toBe(30)
		const r = derive(NARROW_GAP_SHIFT, { amPmMinGapMs: undefined })
		expect(r.amTimeIn).toBeNull()
		expect(r.pmTimeIn).toBeNull()
	})

	it('A10 a 15-minute threshold splits the same punches', () => {
		const r = derive(NARROW_GAP_SHIFT, { amPmMinGapMs: 15 * 60_000 })
		expect(at(r.amTimeIn)).toBe('08:00')
		expect(at(r.amTimeOut)).toBe('11:00')
		expect(at(r.pmTimeIn)).toBe('11:20')
		expect(at(r.pmTimeOut)).toBe('17:00')
	})

	it('A11 a 30-minute threshold does not split them', () => {
		const r = derive(NARROW_GAP_SHIFT, { amPmMinGapMs: 30 * 60_000 })
		expect(r.amTimeIn).toBeNull()
		expect(r.amTimeOut).toBeNull()
		expect(r.pmTimeIn).toBeNull()
		expect(r.pmTimeOut).toBeNull()
	})

	it('A12 a non-finite or non-positive threshold falls back instead of propagating', () => {
		// Two punch sets are needed to make this spec able to fail at all. Against a set that does
		// NOT split under the default, a negative or zero threshold would split (proving the `> 0`
		// clause); against a set that DOES split under the default, NaN/Infinity would stop it
		// (proving `Number.isFinite`). One set alone leaves half the guard vacuous — with the guard
		// deleted, `gap >= NaN` and `gap >= Infinity` are both false, which looks like a pass.
		for (const bad of [NaN, Infinity]) {
			const r = derive(SPLIT_SHIFT, { amPmMinGapMs: bad })
			expect(at(r.amTimeOut)).toBe('11:00')
			expect(at(r.pmTimeIn)).toBe('13:00')
		}
		for (const bad of [-1, 0, -60_000]) {
			const r = derive(NARROW_GAP_SHIFT, { amPmMinGapMs: bad })
			expect(r.amTimeIn).toBeNull()
			expect(r.pmTimeIn).toBeNull()
		}
	})

	it('A13 the threshold is per-call state, not module state', () => {
		const punches = NARROW_GAP_SHIFT
		const before = punches.map((x) => x.timestamp.getTime())
		const low = derive(punches, { amPmMinGapMs: 15 * 60_000 })
		const high = derive(punches, { amPmMinGapMs: 30 * 60_000 })
		expect(at(low.pmTimeIn)).toBe('11:20')
		expect(high.pmTimeIn).toBeNull()
		// Calling in the other order gives the same two answers — no cached first threshold.
		const highFirst = derive(punches, { amPmMinGapMs: 30 * 60_000 })
		const lowSecond = derive(punches, { amPmMinGapMs: 15 * 60_000 })
		expect(highFirst.pmTimeIn).toBeNull()
		expect(at(lowSecond.pmTimeIn)).toBe('11:20')
		expect(punches.map((x) => x.timestamp.getTime())).toEqual(before)
	})
})

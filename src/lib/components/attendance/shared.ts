import type { SubmitFunction } from '@sveltejs/kit'
import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
import { periodOf, toPeriodInputValue, type PeriodKind } from '$lib/utils/pay-periods'
import type { PageData, ActionData } from '../../../routes/(app)/attendance/$types'

/**
 * Shared setup for the two attendance persona views (phase 07 §S5).
 *
 * `+page.svelte` splits into `AttendanceSelfView` (an employee looking at their own days) and
 * `AttendanceHrGrid` (the correction grid). Everything both of them need lives here so the split
 * duplicates markup, never logic.
 */

export type AttendanceData = PageData
export type AttendanceForm = ActionData
export type DayRow = PageData['days'][number]
export type TeamRow = PageData['team'][number]

// Don't reset the form on success: enhance's default form.reset() clears the cross-cell
// (form=…) inputs, and Svelte only re-syncs inputs whose value changed — so untouched
// Reg/OT/times would blank out. Keep values; invalidateAll refreshes them from the server.
export const keepValues: SubmitFunction =
	() =>
	async ({ update }) =>
		update({ reset: false })

/**
 * #108: these bulk actions rewrite whole ranges/days — a double-click re-runs the derive or
 * re-locks mid-flight. One guard per singleton form.
 *
 * #200: the backlog import writes punches for a whole file — a double-submit would re-run it.
 *
 * Created ONCE by `+page.svelte` and threaded into `AttendanceHrGrid` as a prop. A guard
 * re-created inside the child would carry its own in-flight flag and re-open the double-submit
 * hole these exist to close.
 */
export function createAttendanceGuards() {
	return {
		derive: createSubmitGuard(),
		lock: submitFeedback(),
		unlock: submitFeedback(),
		saveTimesheet: createSubmitGuard(),
		deriveTeam: createSubmitGuard(),
		lockTeam: submitFeedback(),
		unlockTeam: submitFeedback(),
		importBacklog: createSubmitGuard()
	}
}
export type AttendanceGuards = ReturnType<typeof createAttendanceGuards>
export type RowGuard = (key: string, inner?: SubmitFunction) => ReturnType<typeof submitFeedback>

// #163: the range stays free-form and "Save as timesheet" now accepts any same-month span —
// createTimesheet validates it server-side and refuses an overlap with a 409. Quick-picks still
// snap to a standard pay period. from/to are YYYY-MM-DD (UTC-midnight days).

/** Set the From/To inputs to a range and re-run the GET filter (same path the date inputs use). */
export function applyRange(from: string, to: string) {
	const f = document.getElementById('from') as HTMLInputElement | null
	const t = document.getElementById('to') as HTMLInputElement | null
	if (!f || !t) return
	f.value = from
	t.value = to
	f.form?.requestSubmit()
}
export function pickPeriod(kind: PeriodKind, monthsBack = 0) {
	const now = new Date()
	let y = now.getFullYear()
	let m = now.getMonth() - monthsBack
	while (m < 0) {
		m += 12
		y--
	}
	const p = periodOf(kind, y, m)
	applyRange(toPeriodInputValue(p.periodStart), toPeriodInputValue(p.periodEnd))
}
export const QUICK_PICKS: { label: string; kind: PeriodKind; monthsBack?: number }[] = [
	{ label: 'First half', kind: 'FIRST_HALF' },
	{ label: 'Second half', kind: 'SECOND_HALF' },
	{ label: 'This month', kind: 'WHOLE_MONTH' },
	{ label: 'Prev month', kind: 'WHOLE_MONTH', monthsBack: 1 }
]

export const STATUSES = [
	'PRESENT',
	'LATE',
	'ABSENT',
	'INCOMPLETE',
	'ON_LEAVE',
	'HOLIDAY',
	'REST_DAY'
]

/**
 * "Exceptions only" — surface the rows that need HR action (failed to time in, incomplete logs,
 * tardiness) so the morning fail-check doesn't mean scrolling the whole sheet.
 */
export const isException = (s: string) => s === 'ABSENT' || s === 'INCOMPLETE' || s === 'LATE'

export function fmtDate(d: string | Date) {
	return new Date(d).toLocaleDateString('en-PH', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'Asia/Manila'
	})
}
export function fmtTime(d: string | Date | null) {
	if (!d) return '—'
	return new Date(d).toLocaleTimeString('en-PH', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Asia/Manila'
	})
}
export const n = (x: unknown) => Number(x)

// When In/Out are entered manually, auto-fill Reg (and OT overflow) to mirror the derive
// engine: worked = (Out − In) − 1h break past 5h; Reg = min(worked, 8), OT = the rest.
// HR can still override the numbers afterward.
export function recalcHours(e: Event) {
	const el = e.currentTarget as HTMLInputElement
	const fid = el.getAttribute('form')
	if (!fid) return
	const q = (name: string) =>
		document.querySelector<HTMLInputElement>(`input[name="${name}"][form="${fid}"]`)
	const tin = q('timeIn')?.value
	const tout = q('timeOut')?.value
	const reg = q('regularHours')
	const ot = q('overtimeHours')
	if (!tin || !tout || !reg || !ot) return
	const [ih, im] = tin.split(':').map(Number)
	const [oh, om] = tout.split(':').map(Number)
	let mins = oh * 60 + om - (ih * 60 + im)
	if (mins < 0) mins += 1440 // overnight out
	const gross = mins / 60
	const worked = Math.max(0, gross - (gross > 5 ? 1 : 0))
	reg.value = Math.min(worked, 8).toFixed(2)
	ot.value = Math.max(0, worked - 8).toFixed(2)
}

/** 24h HH:MM for a `<input type="time">`, in Manila time; '' when no punch. */
export function toTimeInput(d: string | Date | null) {
	if (!d) return ''
	return new Date(d).toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone: 'Asia/Manila'
	})
}
/** YYYY-MM-DD (Manila) for the row's date, sent so the server can rebuild edited timestamps. */
export function toDateKey(d: string | Date) {
	return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

// Editable cells that read as plain text until focused, then reveal an input affordance.
// Content-sized (not w-full) so the table columns spread evenly instead of one ballooning.
export const CELL =
	'h-7 rounded border border-transparent bg-transparent px-1 text-xs hover:bg-muted/40 focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring'
export const CELL_NUM =
	CELL +
	' w-16 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
export const CELL_SEL = CELL + ' appearance-none'
export const CELL_TIME = CELL + ' w-24'

// Heroicons (outline, 24×24) — match the inline-SVG convention used in the app nav.
export const IC = {
	refresh:
		'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
	lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
	lockOpen:
		'M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
	download:
		'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
	document:
		'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
}

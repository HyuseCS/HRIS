import type { PageData, ActionData } from '../../../routes/(app)/attendance/$types'
import type { PeriodKind } from '$lib/utils/pay-periods'

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

export const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'INCOMPLETE', 'ON_LEAVE', 'HOLIDAY', 'REST_DAY']

export function fmtTime(d: string | Date | null) {
	if (!d) return '—'
	return new Date(d).toLocaleTimeString('en-PH', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Asia/Manila'
	})
}
export const n = (x: unknown) => Number(x)

// 24h HH:MM for a <input type="time">, in Manila time; '' when no punch.
export function toTimeInput(d: string | Date | null) {
	if (!d) return ''
	return new Date(d).toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone: 'Asia/Manila'
	})
}
// YYYY-MM-DD (Manila) for the row's date, sent so the server can rebuild edited timestamps.
export function toDateKey(d: string | Date) {
	return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

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

export const QUICK_PICKS: { label: string; kind: PeriodKind; monthsBack?: number }[] = [
	{ label: 'First half', kind: 'FIRST_HALF' },
	{ label: 'Second half', kind: 'SECOND_HALF' },
	{ label: 'This month', kind: 'WHOLE_MONTH' },
	{ label: 'Prev month', kind: 'WHOLE_MONTH', monthsBack: 1 }
]

/**
 * Tone + label resolution for `Badge.svelte`.
 *
 * Kept in a plain module rather than the component so it is unit-testable without rendering:
 * `vitest.config.ts` runs `environment: 'node'`, so nothing in this repo can mount a component.
 * Mirrors the existing `Table.svelte` + `table.ts` split.
 *
 * This module invents no colours. The five tones are exactly the `.badge-*` classes in `app.css`.
 * Two colours the old hand-rolled helpers used — orange (RETURNED, OFFER) and purple (SCORED,
 * SIGNING, INTERVIEW) — have no badge token, so they resolve to the nearest tone that does.
 */

import {
	APPLICANT_STAGE_LABELS,
	APPROVAL_DECISION_LABELS,
	ATTENDANCE_STATUS_LABELS,
	BENEFIT_ENROLLMENT_STATUS_LABELS,
	BRANCH_STATUS_LABELS,
	CLEARANCE_STATUS_LABELS,
	COMPLAINT_CATEGORY_LABELS,
	COMPLAINT_STATUS_LABELS,
	EMPLOYMENT_STATUS_LABELS,
	EMPLOYMENT_TYPE_LABELS,
	INVENTORY_STATUS_LABELS,
	LEAVE_REQUEST_STATUS_LABELS,
	LOAN_STATUS_LABELS,
	PAYROLL_PERIOD_STATUS_LABELS,
	PAYROLL_RUN_STATUS_LABELS,
	REQUEST_STATUS_LABELS,
	REQUEST_TYPE_LABELS,
	REVIEW_CYCLE_STATUS_LABELS,
	REVIEW_STATUS_LABELS,
	SEPARATION_STATUS_LABELS,
	SEPARATION_TYPE_LABELS,
	TIMESHEET_STATUS_LABELS,
	labelFor
} from '$lib/labels'

export type BadgeTone = 'green' | 'red' | 'yellow' | 'blue' | 'gray'

/** One key per label map in `$lib/labels.ts`. */
export type BadgeDomain =
	| 'timesheet'
	| 'leave'
	| 'request'
	| 'requestType'
	| 'approval'
	| 'payrollRun'
	| 'payrollPeriod'
	| 'separationType'
	| 'separation'
	| 'clearance'
	| 'review'
	| 'reviewCycle'
	| 'applicant'
	| 'complaint'
	| 'complaintCategory'
	| 'inventory'
	| 'branch'
	| 'employment'
	| 'employmentType'
	| 'attendance'
	| 'benefitEnrollment'
	| 'loan'

export const DOMAIN_LABELS: Record<BadgeDomain, Record<string, string>> = {
	timesheet: TIMESHEET_STATUS_LABELS,
	leave: LEAVE_REQUEST_STATUS_LABELS,
	request: REQUEST_STATUS_LABELS,
	requestType: REQUEST_TYPE_LABELS,
	approval: APPROVAL_DECISION_LABELS,
	payrollRun: PAYROLL_RUN_STATUS_LABELS,
	payrollPeriod: PAYROLL_PERIOD_STATUS_LABELS,
	separationType: SEPARATION_TYPE_LABELS,
	separation: SEPARATION_STATUS_LABELS,
	clearance: CLEARANCE_STATUS_LABELS,
	review: REVIEW_STATUS_LABELS,
	reviewCycle: REVIEW_CYCLE_STATUS_LABELS,
	applicant: APPLICANT_STAGE_LABELS,
	complaint: COMPLAINT_STATUS_LABELS,
	complaintCategory: COMPLAINT_CATEGORY_LABELS,
	inventory: INVENTORY_STATUS_LABELS,
	branch: BRANCH_STATUS_LABELS,
	employment: EMPLOYMENT_STATUS_LABELS,
	employmentType: EMPLOYMENT_TYPE_LABELS,
	attendance: ATTENDANCE_STATUS_LABELS,
	benefitEnrollment: BENEFIT_ENROLLMENT_STATUS_LABELS,
	loan: LOAN_STATUS_LABELS
}

/**
 * Status → tone, shared across domains. A status name means the same thing wherever it appears,
 * which is why this is one table and not nineteen: APPROVED is green on a timesheet, a leave
 * request and a payroll run alike.
 */
const BASE_TONES: Record<string, BadgeTone> = {
	// terminal-good
	APPROVED: 'green',
	RELEASED: 'green',
	CLEARED: 'green',
	RESOLVED: 'green',
	COMPLETED: 'green',
	ACKNOWLEDGED: 'green',
	HIRED: 'green',
	IN_STOCK: 'green',
	ACTIVE: 'green',
	PRESENT: 'green',
	PAID: 'green',
	// terminal-bad
	REJECTED: 'red',
	VOIDED: 'red',
	ABSENT: 'red',
	// waiting on someone
	PENDING: 'yellow',
	OPEN: 'yellow',
	LOCKED: 'yellow',
	ON_LEAVE: 'yellow',
	SCREENING: 'yellow',
	LATE: 'yellow',
	WAIVED: 'yellow',
	// was orange before this phase
	INCOMPLETE: 'yellow',
	// was orange before this phase; orange has no badge token
	RETURNED: 'yellow',
	OFFER: 'yellow',
	// in progress
	SUBMITTED: 'blue',
	COMPUTED: 'blue',
	IMPORTED: 'blue',
	GENERATED: 'blue',
	RESPONDED: 'blue',
	ASSIGNED: 'blue',
	APPLIED: 'blue',
	HOLIDAY: 'blue',
	// was purple before this phase; purple has no badge token
	SELF_ASSESSMENT: 'blue',
	SCORED: 'blue',
	SIGNING: 'blue',
	INTERVIEW: 'blue',
	// inert
	DRAFT: 'gray',
	CANCELLED: 'gray',
	FINALIZED: 'gray',
	CLOSED: 'gray',
	RETIRED: 'gray',
	OFFBOARDED: 'gray',
	REST_DAY: 'gray',
	TERMINATED: 'gray'
}

/**
 * Domains where a status name genuinely means something different.
 *
 * `OPEN` is the whole reason this table exists: an open branch is a working branch (green), an
 * open payroll period is one nothing has happened to yet (gray), and an open separation or
 * complaint is a case waiting on someone (yellow, the base).
 */
const DOMAIN_TONES: Partial<Record<BadgeDomain, Record<string, BadgeTone>>> = {
	branch: { OPEN: 'green' },
	// On an attendance row, ON_LEAVE is a day type sitting beside LATE — keeping the base yellow
	// would make the two indistinguishable in the column they share.
	attendance: { ON_LEAVE: 'blue' },
	// An active loan is money still being collected — in progress, not a good outcome.
	loan: { ACTIVE: 'blue' },
	payrollPeriod: { OPEN: 'gray' }
}

/** Unknown status, or a domain that does not tone it → `gray`. Never throws. */
export function toneFor(status: string, domain?: BadgeDomain): BadgeTone {
	const override = domain ? DOMAIN_TONES[domain]?.[status] : undefined
	return override ?? BASE_TONES[status] ?? 'gray'
}

/**
 * Resolve what a badge should render. An unknown status degrades to a gray badge showing the raw
 * value — never blank, never a throw, because a status pill that vanishes reads as "no status".
 */
export function badgeFor(
	status: string,
	options: { domain?: BadgeDomain; tone?: BadgeTone; label?: string } = {}
): { tone: BadgeTone; label: string } {
	const map = options.domain ? DOMAIN_LABELS[options.domain] : undefined
	return {
		tone: options.tone ?? toneFor(status, options.domain),
		label: options.label ?? (map ? labelFor(map, status) : status)
	}
}

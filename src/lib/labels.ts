/**
 * Enum → human label maps, sourced from `prisma/schema.prisma`.
 *
 * This module is COPY-ONLY. It imports nothing from `$lib/server`, and nothing may branch on a
 * value read out of it — a label is display text, so changing one must never change behaviour.
 * Compare against the enum value itself, never against `labelFor(...)`.
 *
 * Labels are Sentence case ("On leave", "Part time"), not SCREAMING_CASE. Each map is typed as a
 * `Record` over its Prisma enum, so a new enum member is a compile error here, and
 * `tests/unit/labels.test.ts` re-checks the same thing at runtime against `@prisma/client`.
 */

import type {
	ApplicantStage,
	ApprovalDecision,
	AttendanceStatus,
	BenefitEnrollmentStatus,
	BranchStatus,
	ClearanceStatus,
	ComplaintCategory,
	ComplaintStatus,
	EmploymentStatus,
	EmploymentType,
	InventoryStatus,
	LeaveRequestStatus,
	LoanStatus,
	PayrollPeriodStatus,
	PayrollRunStatus,
	RequestStatus,
	RequestType,
	ReviewCycleStatus,
	ReviewStatus,
	SeparationStatus,
	SeparationType,
	TimesheetStatus
} from '@prisma/client'

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
	PRESENT: 'Present',
	LATE: 'Late',
	ABSENT: 'Absent',
	INCOMPLETE: 'Incomplete',
	ON_LEAVE: 'On leave',
	HOLIDAY: 'Holiday',
	REST_DAY: 'Rest day'
}

export const BENEFIT_ENROLLMENT_STATUS_LABELS: Record<BenefitEnrollmentStatus, string> = {
	ACTIVE: 'Active',
	WAIVED: 'Waived',
	TERMINATED: 'Terminated'
}

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
	ACTIVE: 'Active',
	PAID: 'Paid',
	CANCELLED: 'Cancelled'
}

export const TIMESHEET_STATUS_LABELS: Record<TimesheetStatus, string> = {
	DRAFT: 'Draft',
	SUBMITTED: 'Submitted',
	APPROVED: 'Approved',
	REJECTED: 'Rejected'
}

export const LEAVE_REQUEST_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
	PENDING: 'Pending',
	APPROVED: 'Approved',
	REJECTED: 'Rejected',
	CANCELLED: 'Cancelled'
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
	PENDING: 'Pending',
	APPROVED: 'Approved',
	REJECTED: 'Rejected',
	RETURNED: 'Returned',
	CANCELLED: 'Cancelled'
}

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
	LEAVE: 'Leave',
	OVERTIME: 'Overtime',
	UNDERTIME: 'Undertime',
	OFFICIAL_BUSINESS: 'Official business',
	REST_DAY_WORK: 'Rest day work',
	HOLIDAY_WORK: 'Holiday work',
	INFO_UPDATE: 'Info update'
}

export const APPROVAL_DECISION_LABELS: Record<ApprovalDecision, string> = {
	APPROVED: 'Approved',
	REJECTED: 'Rejected',
	RETURNED: 'Returned'
}

export const PAYROLL_RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = {
	DRAFT: 'Draft',
	COMPUTED: 'Computed',
	APPROVED: 'Approved',
	VOIDED: 'Voided'
}

export const PAYROLL_PERIOD_STATUS_LABELS: Record<PayrollPeriodStatus, string> = {
	OPEN: 'Open',
	IMPORTED: 'Imported',
	GENERATED: 'Generated',
	LOCKED: 'Locked',
	RELEASED: 'Released',
	VOIDED: 'Voided'
}

export const SEPARATION_TYPE_LABELS: Record<SeparationType, string> = {
	RESIGNATION: 'Resignation',
	TERMINATION: 'Termination'
}

export const SEPARATION_STATUS_LABELS: Record<SeparationStatus, string> = {
	OPEN: 'Open',
	CLEARED: 'Cleared',
	FINALIZED: 'Finalized'
}

export const CLEARANCE_STATUS_LABELS: Record<ClearanceStatus, string> = {
	PENDING: 'Pending',
	CLEARED: 'Cleared'
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
	PENDING: 'Pending',
	SELF_ASSESSMENT: 'Self assessment',
	SCORED: 'Scored',
	SIGNING: 'Signing',
	COMPLETED: 'Completed',
	ACKNOWLEDGED: 'Acknowledged'
}

export const REVIEW_CYCLE_STATUS_LABELS: Record<ReviewCycleStatus, string> = {
	DRAFT: 'Draft',
	ACTIVE: 'Active',
	CLOSED: 'Closed'
}

export const APPLICANT_STAGE_LABELS: Record<ApplicantStage, string> = {
	APPLIED: 'Applied',
	SCREENING: 'Screening',
	INTERVIEW: 'Interview',
	OFFER: 'Offer',
	HIRED: 'Hired',
	REJECTED: 'Rejected'
}

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
	OPEN: 'Open',
	RESPONDED: 'Responded',
	RESOLVED: 'Resolved'
}

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
	CLASSIFICATION: 'Classification',
	ATTENDANCE: 'Attendance',
	CONDUCT: 'Conduct',
	PERFORMANCE: 'Performance',
	OTHER: 'Other'
}

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
	IN_STOCK: 'In stock',
	ASSIGNED: 'Assigned',
	RETIRED: 'Retired'
}

export const BRANCH_STATUS_LABELS: Record<BranchStatus, string> = {
	OPEN: 'Open',
	CLOSED: 'Closed'
}

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
	ACTIVE: 'Active',
	ON_LEAVE: 'On leave',
	OFFBOARDED: 'Offboarded'
}

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
	REGULAR: 'Regular',
	PART_TIME: 'Part time',
	CONTRACTUAL: 'Contractual',
	PROBATIONARY: 'Probationary',
	ON_CALL: 'On call',
	INTERN: 'Intern'
}

/**
 * Look up a label, falling back to the raw enum value.
 *
 * The fallback is mandatory: an unmapped value must render as itself, never blank. A blank status
 * cell reads as "no status" and is indistinguishable from a real empty one.
 */
export function labelFor(map: Record<string, string>, value: string): string {
	return map[value] ?? value
}

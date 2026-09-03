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
	BackupRunStatus,
	BenefitEnrollmentStatus,
	BranchStatus,
	ClearanceStatus,
	ComplaintCategory,
	ComplaintStatus,
	EmploymentStatus,
	EmploymentType,
	InventoryStatus,
	JobPostingStatus,
	LeaveRequestStatus,
	LoanStatus,
	OfferStatus,
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

export const BACKUP_RUN_STATUS_LABELS: Record<BackupRunStatus, string> = {
	RUNNING: 'Running',
	SUCCESS: 'Success',
	PARTIAL: 'Partial',
	FAILED: 'Failed'
}

export const JOB_POSTING_STATUS_LABELS: Record<JobPostingStatus, string> = {
	DRAFT: 'Draft',
	PENDING_APPROVAL: 'Pending approval',
	OPEN: 'Open',
	CLOSED: 'Closed'
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
	// "Pending" rather than "Sent": the applicant page has always read it as the state it puts
	// the offer in, not the act of sending, and that copy is preserved here rather than at the
	// call site.
	SENT: 'Pending',
	ACCEPTED: 'Accepted',
	DECLINED: 'Declined'
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
	// "Returned for changes" rather than "Returned": on its own the word does not say who has to
	// act next, and this state is the one where the filer, not the approver, holds the request.
	RETURNED: 'Returned for changes',
	CANCELLED: 'Cancelled'
}

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
	LEAVE: 'Leave',
	OVERTIME: 'Overtime',
	UNDERTIME: 'Undertime',
	OFFICIAL_BUSINESS: 'Official business',
	REST_DAY_WORK: 'Rest-day work',
	HOLIDAY_WORK: 'Holiday work',
	INFO_UPDATE: 'Information update'
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

/**
 * These name the stage of the clearance, not the row's own adjective. "Open" and "Cleared" read as
 * states of the *employee* to anyone outside HR; the case is what is open, and what is cleared is
 * the checklist, after which HR still has to finalize.
 */
export const SEPARATION_STATUS_LABELS: Record<SeparationStatus, string> = {
	OPEN: 'Clearance in progress',
	CLEARED: 'Ready to finalize',
	FINALIZED: 'Finalized'
}

export const CLEARANCE_STATUS_LABELS: Record<ClearanceStatus, string> = {
	PENDING: 'Pending',
	CLEARED: 'Cleared'
}

/**
 * Each label names who is holding the review. A one-word status here ("Signing", "Scored") does not
 * tell an employee or an evaluator whether the next move is theirs.
 */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
	PENDING: 'Not started',
	SELF_ASSESSMENT: 'Employee self-assessment',
	SCORED: 'Scored by evaluator',
	SIGNING: 'Awaiting signatures',
	COMPLETED: 'Completed',
	ACKNOWLEDGED: 'Acknowledged by employee'
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

/**
 * Both complaint pages already said "Awaiting employee" / "Awaiting HR" rather than echoing the
 * enum. That copy names who is holding the case, which is the only thing a reader wants from it,
 * so it is the shared wording rather than a per-page override.
 */
export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
	OPEN: 'Awaiting employee',
	RESPONDED: 'Awaiting HR',
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
 * Report table column keys → human headers. These keys are not a Prisma enum — they are the
 * `columns` string list `reports/[type]/+page.server.ts` builds per report, and they double as the
 * CSV header and the row-object keys, so they cannot be renamed at source. Only the rendered header
 * is translated. A key with no entry falls back to itself via `labelFor`.
 */
export const REPORT_COLUMN_LABELS: Record<string, string> = {
	Applicants: 'Applicants',
	Balance: 'Outstanding balance',
	Clearance: 'Clearance',
	Closed: 'Closed',
	Contribution: 'Contribution',
	DaysOpen: 'Days open',
	Department: 'Department',
	EffectiveDate: 'Effective date',
	Employee: 'Employee',
	EmployeeCount: 'Employees',
	EmployeeNumber: 'Employee number',
	EmployeeShare: 'Employee share',
	EmployerShare: 'Employer share',
	FinalPay: 'Final pay',
	Gross: 'Gross pay',
	// Both spellings exist in the report definitions; map each rather than renaming a data key.
	HeadCount: 'Headcount',
	Headcount: 'Headcount',
	Hired: 'Hired',
	Installment: 'Installment',
	Interviewed: 'Interviewed',
	LateDays: 'Late days',
	LateMinutes: 'Late minutes',
	LeaveType: 'Leave type',
	Net: 'Net pay',
	NightDiffHours: 'Night differential hours',
	OtherDeductions: 'Other deductions',
	OvertimeHours: 'Overtime hours',
	PagIBIG: 'Pag-IBIG',
	Period: 'Period',
	PhilHealth: 'PhilHealth',
	Posted: 'Posted',
	Principal: 'Loan principal',
	RawOvertimeHours: 'Raw overtime hours',
	SSS: 'SSS',
	Status: 'Status',
	TIN: 'TIN',
	Tax: 'Withholding tax',
	TaxWithheld: 'Tax withheld',
	Title: 'Title',
	Total: 'Total',
	TotalDaysUsed: 'Days used',
	TotalGross: 'Total gross pay',
	TotalHours: 'Total hours',
	TotalNet: 'Total net pay',
	Type: 'Type',
	UndertimeMinutes: 'Undertime minutes'
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

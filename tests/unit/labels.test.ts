import { describe, it, expect } from 'vitest'
import {
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

/**
 * `$lib/labels.ts` is what stops a status pill rendering blank. The failure mode is silent: a new
 * enum member ships, no map entry exists, and `Badge` shows the raw SCREAMING_CASE value (or, if
 * the fallback were ever dropped, nothing at all). These assert against the runtime enum objects
 * from `@prisma/client`, so adding a member to `prisma/schema.prisma` turns this file red.
 *
 * The maps are also typed `Record<Enum, string>`, so a missing key is a compile error too. That is
 * deliberate belt-and-braces: the type check only runs under `pnpm check`, and CI runs format
 * first and skips the rest on failure.
 */

const CASES: [string, Record<string, string>, Record<string, string>][] = [
	['TimesheetStatus', TimesheetStatus, TIMESHEET_STATUS_LABELS],
	['LeaveRequestStatus', LeaveRequestStatus, LEAVE_REQUEST_STATUS_LABELS],
	['RequestStatus', RequestStatus, REQUEST_STATUS_LABELS],
	['RequestType', RequestType, REQUEST_TYPE_LABELS],
	['ApprovalDecision', ApprovalDecision, APPROVAL_DECISION_LABELS],
	['PayrollRunStatus', PayrollRunStatus, PAYROLL_RUN_STATUS_LABELS],
	['PayrollPeriodStatus', PayrollPeriodStatus, PAYROLL_PERIOD_STATUS_LABELS],
	['SeparationType', SeparationType, SEPARATION_TYPE_LABELS],
	['SeparationStatus', SeparationStatus, SEPARATION_STATUS_LABELS],
	['ClearanceStatus', ClearanceStatus, CLEARANCE_STATUS_LABELS],
	['ReviewStatus', ReviewStatus, REVIEW_STATUS_LABELS],
	['ReviewCycleStatus', ReviewCycleStatus, REVIEW_CYCLE_STATUS_LABELS],
	['ApplicantStage', ApplicantStage, APPLICANT_STAGE_LABELS],
	['ComplaintStatus', ComplaintStatus, COMPLAINT_STATUS_LABELS],
	['ComplaintCategory', ComplaintCategory, COMPLAINT_CATEGORY_LABELS],
	['InventoryStatus', InventoryStatus, INVENTORY_STATUS_LABELS],
	['BranchStatus', BranchStatus, BRANCH_STATUS_LABELS],
	['EmploymentStatus', EmploymentStatus, EMPLOYMENT_STATUS_LABELS],
	['EmploymentType', EmploymentType, EMPLOYMENT_TYPE_LABELS],
	['AttendanceStatus', AttendanceStatus, ATTENDANCE_STATUS_LABELS],
	['BenefitEnrollmentStatus', BenefitEnrollmentStatus, BENEFIT_ENROLLMENT_STATUS_LABELS],
	['LoanStatus', LoanStatus, LOAN_STATUS_LABELS]
]

describe('labels.ts covers every mapped Prisma enum', () => {
	it('maps every enum the phase-03 badges render', () => {
		expect(CASES).toHaveLength(22)
	})

	for (const [name, prismaEnum, labels] of CASES) {
		it(`${name}: every member has a non-blank label`, () => {
			const members = Object.values(prismaEnum)
			expect(members.length).toBeGreaterThan(0)
			for (const member of members) {
				expect(labels[member], `${name}.${member} has no label`).toBeTruthy()
			}
		})

		it(`${name}: the map adds no key the enum does not have`, () => {
			expect(Object.keys(labels).sort()).toEqual(Object.values(prismaEnum).sort())
		})
	}
})

describe('labelFor', () => {
	it('returns the mapped label for a known value', () => {
		expect(labelFor(EMPLOYMENT_STATUS_LABELS, 'ON_LEAVE')).toBe('On leave')
	})

	it('falls back to the raw value for an unknown key — never blank', () => {
		expect(labelFor(EMPLOYMENT_STATUS_LABELS, 'NOT_A_STATUS')).toBe('NOT_A_STATUS')
	})

	it('falls back for the empty string rather than returning undefined', () => {
		expect(labelFor(EMPLOYMENT_STATUS_LABELS, '')).toBe('')
	})
})

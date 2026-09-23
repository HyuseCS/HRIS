import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	ApplicantStage,
	ApprovalDecision,
	AttendanceStatus,
	BackupRunStatus,
	BenefitEnrollmentStatus,
	BenefitPlanType,
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
	Role,
	SeparationStatus,
	SeparationType,
	TimesheetStatus
} from '@prisma/client'
import {
	APPLICANT_STAGE_LABELS,
	APPROVAL_DECISION_LABELS,
	ATTENDANCE_STATUS_LABELS,
	BACKUP_RUN_STATUS_LABELS,
	BENEFIT_ENROLLMENT_STATUS_LABELS,
	BENEFIT_PLAN_TYPE_LABELS,
	BRANCH_STATUS_LABELS,
	CLEARANCE_STATUS_LABELS,
	COMPLAINT_CATEGORY_LABELS,
	COMPLAINT_STATUS_LABELS,
	EMPLOYMENT_STATUS_LABELS,
	EMPLOYMENT_TYPE_LABELS,
	INVENTORY_STATUS_LABELS,
	JOB_POSTING_STATUS_LABELS,
	LEAVE_REQUEST_STATUS_LABELS,
	LOAN_STATUS_LABELS,
	OFFER_STATUS_LABELS,
	PAYROLL_PERIOD_STATUS_LABELS,
	PAYROLL_RUN_STATUS_LABELS,
	REPORT_COLUMN_LABELS,
	REQUEST_STATUS_LABELS,
	REQUEST_TYPE_LABELS,
	REVIEW_CYCLE_STATUS_LABELS,
	REVIEW_STATUS_LABELS,
	SEPARATION_STATUS_LABELS,
	SEPARATION_TYPE_LABELS,
	TIMESHEET_STATUS_LABELS,
	labelFor
} from '$lib/labels'
import { ROLE_LABELS } from '$lib/rbac'

/**
 * `$lib/labels.ts` is what stops a status pill rendering blank. The failure mode is silent: a new
 * enum member ships, no map entry exists, and `Badge` shows the raw SCREAMING_CASE value (or, if
 * the fallback were ever dropped, nothing at all). These assert against the runtime enum objects
 * from `@prisma/client`, so adding a member to `prisma/schema.prisma` turns this file red.
 *
 * The maps are also typed `Record<Enum, string>`, so a missing key is a compile error too. That is
 * deliberate belt-and-braces: the type check only runs under `bun run check`, and CI runs format
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
	['LoanStatus', LoanStatus, LOAN_STATUS_LABELS],
	['BackupRunStatus', BackupRunStatus, BACKUP_RUN_STATUS_LABELS],
	['JobPostingStatus', JobPostingStatus, JOB_POSTING_STATUS_LABELS],
	['OfferStatus', OfferStatus, OFFER_STATUS_LABELS],
	['BenefitPlanType', BenefitPlanType, BENEFIT_PLAN_TYPE_LABELS],
	['Role', Role, ROLE_LABELS]
]

describe('labels.ts covers every mapped Prisma enum', () => {
	it('maps every enum the phase-03 badges render', () => {
		expect(CASES).toHaveLength(27)
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

// ── Phase 08 S1 — adoption, not just totality ────────────────────────────────
/**
 * WHAT THESE TWO GATES DO NOT PROVE. They are source scans. The first proves no `.svelte` file
 * under `src/routes` or `src/lib` renders an enum raw or dressed up; it cannot prove the label that
 * replaced one reads well, or that the element ever renders. The second proves every declared
 * report column has a header entry; it cannot prove the header is the right English for the
 * number under it.
 *
 * The scan walks every `.svelte` file under `src/routes` and `src/lib` with three regexes:
 * BARE catches a raw `{x.status}` / `{x.type}` / `{x.employmentType}` / `{x.employmentStatus}` /
 * `{x.role}` interpolation; DRESSED catches an enum field dressed up in place
 * (`x.type.replace(...)`, `x.status.toLowerCase(...)`); UNDERSCORE catches any
 * `.replace('_', ' ')` / `.replace(/_/g, ' ')` fallback, wherever the value came from. One hit is
 * allowed: `{$page.status}` in `src/routes/+error.svelte`, an HTTP status code, not an enum. It is
 * matched by file AND exact text, so a second hit in that file still fails.
 *
 * Measured blind spots — none of these is caught: `{x?.status}`, `{x.status ?? …}`,
 * `{fn(x.status)}`, `.split('_').join(' ')`, enum fields outside BARE's name list (e.g. `source`,
 * `action`), string builders in `.ts` files, and an enum aliased into a variable with an unrelated
 * name and rendered bare. Latent false positive: a script template literal `${x.status}` matches
 * BARE.
 */
const APP = join(import.meta.dirname, '../../src/routes/(app)')
const ROOT = join(import.meta.dirname, '../..')

const SVELTE_FILES = ['src/routes', 'src/lib'].flatMap((dir) =>
	readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
		.filter((rel) => rel.endsWith('.svelte'))
		.map((rel) => join(dir, rel))
)

/**
 * A raw enum reaching the page as text: `{req.status}`, `{s.type}`, `{form.status}`. The
 * `(?<!=)` rules out `status={s.status}`, which is a prop binding into `Badge` — that path already
 * goes through `$lib/labels`, so it is the fix, not the defect.
 */
const BARE =
	/(?<!=)\{\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)*\.(?:status|type|employmentType|employmentStatus|role)\s*\}/g
const DRESSED =
	/\.(?:status|type|employmentType|role|stage|category)\s*\.\s*(?:replace|replaceAll|toLowerCase)\s*\(/g
const UNDERSCORE = /\.replace(?:All)?\(\s*(?:'_'|"_"|\/_\/g?)\s*,\s*['"] ['"]\s*\)/g

const SCANS: [string, RegExp][] = [
	['BARE', BARE],
	['DRESSED', DRESSED],
	['UNDERSCORE', UNDERSCORE]
]

const ALLOWED: [string, string] = [join('src/routes', '+error.svelte'), '{$page.status}']

function enumHits(file: string, source: string): string[] {
	return SCANS.flatMap(([name, regex]) =>
		[...source.matchAll(regex)]
			.filter((match) => !(file === ALLOWED[0] && match[0] === ALLOWED[1]))
			.map((match) => {
				const line = source.slice(0, match.index).split('\n').length
				return `${file}:${line} ${name} ${match[0]}`
			})
	)
}

describe('every .svelte file renders enums through $lib/labels, not raw or dressed up', () => {
	it('the walk found the svelte files (guards against an empty walk)', () => {
		expect(SVELTE_FILES.length).toBeGreaterThan(50)
	})

	for (const file of SVELTE_FILES) {
		it(`${file} interpolates no raw or dressed-up enum`, () => {
			expect(enumHits(file, readFileSync(join(ROOT, file), 'utf8'))).toEqual([])
		})
	}

	it('the scan can still see a raw, a dressed and an underscore-fallback enum', () => {
		expect('<td>{s.status}</td>'.match(BARE)).toEqual(['{s.status}'])
		expect('<Badge status={s.status} />'.match(BARE)).toBeNull()
		expect("x.employmentType.replace('_', ' ')".match(DRESSED)).toEqual([
			'.employmentType.replace('
		])
		expect("r.toLowerCase().replace(/_/g, ' ')".match(UNDERSCORE)).toEqual([".replace(/_/g, ' ')"])
		for (const [, regex] of SCANS) {
			expect("x.replace('-', ' ')".match(regex)).toBeNull()
		}
	})
})

describe('REPORT_COLUMN_LABELS covers every column the report loader declares', () => {
	it('has a header for each key in reports/[type]/+page.server.ts', () => {
		const source = readFileSync(join(APP, 'reports/[type]/+page.server.ts'), 'utf8')
		const declared = [...source.matchAll(/columns = \[([^\]]*)\]/g)].flatMap((match) =>
			[...match[1].matchAll(/'([^']+)'/g)].map((key) => key[1])
		)
		expect(declared.length).toBeGreaterThan(0)
		for (const key of declared) {
			expect(REPORT_COLUMN_LABELS[key], `report column "${key}" has no header label`).toBeTruthy()
		}
	})
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

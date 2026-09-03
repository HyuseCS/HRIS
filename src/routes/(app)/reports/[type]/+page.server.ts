import { error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { listVisiblePayEmployeeIds } from '$lib/server/services/employee-access'
import {
	generateHeadcount,
	generateAttendance,
	generatePayrollCosts,
	generateLeaveUtilization,
	generatePayrollRegister,
	generateTardiness,
	generateOvertime,
	generateLoanSummary,
	generateGovernmentRemittance,
	generateBIRWithholding
} from '$lib/server/services/reports'
import { generateSeparationReport } from '$lib/server/services/separation'
import { generateRecruitmentReport } from '$lib/server/services/recruitment'
import { canAny } from '$lib/server/rbac'
import type { PageServerLoad } from './$types'

const VALID_TYPES = [
	'headcount',
	'attendance',
	'payroll-costs',
	'leave-utilization',
	'payroll-register',
	'tardiness',
	'overtime',
	'loan-summary',
	'government-remittance',
	'bir-withholding',
	'separation',
	'recruitment'
] as const
// Payroll reports are visible to Payroll Officer / Finance; the rest are HR-only.
const PAYROLL_REPORT_TYPES = [
	'payroll-costs',
	'payroll-register',
	'loan-summary',
	'government-remittance',
	'bir-withholding'
]

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = locals.user!

	const type = params.type as string
	if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) error(404, 'Unknown report type')

	// Payroll reports open to Payroll Officer / Finance; everything else HR-only.
	// #249: MANAGER holds VIEW_PAYROLL_REPORTS (#133), so it clears the gate above for every payroll
	// report — and each of them is built from per-employee pay. Resolve the allow-list once here and
	// hand it to all five, so no report can be added to the list above and quietly ship unscoped.
	// `null` = unrestricted, which is what the org-wide payroll roles get.
	let visiblePayIds: string[] | null = null
	if (PAYROLL_REPORT_TYPES.includes(type)) {
		if (!canAny(user.roles, 'VIEW_PAYROLL_REPORTS')) error(403, 'Insufficient permissions')
		visiblePayIds = await listVisiblePayEmployeeIds({
			id: user.id,
			roles: user.roles,
			organizationId: user.organizationId
		})
	} else {
		requireAnyCapability(user.roles, 'MANAGE_HR')
	}

	// Parse filter params
	const startDate = url.searchParams.get('start')
		? new Date(url.searchParams.get('start')!)
		: new Date(new Date().getFullYear(), 0, 1)
	const endDate = url.searchParams.get('end') ? new Date(url.searchParams.get('end')!) : new Date()
	const departmentId = url.searchParams.get('department') ?? undefined

	// Load departments for the filter selector
	const departments = await db.department.findMany({
		where: { organizationId: user.organizationId },
		select: { id: true, name: true }
	})

	// Generate report
	let results: unknown[] = []
	let columns: string[] = []

	if (type === 'headcount') {
		results = await generateHeadcount(user.organizationId, { startDate, endDate, departmentId })
		columns = ['Period', 'Headcount', 'Department']
	} else if (type === 'attendance') {
		results = await generateAttendance(user.organizationId, { startDate, endDate, departmentId })
		columns = ['Employee', 'Period', 'TotalHours', 'Status']
	} else if (type === 'payroll-costs') {
		results = await generatePayrollCosts(user.organizationId, { startDate, endDate }, visiblePayIds)
		columns = ['Period', 'Department', 'TotalGross', 'TotalNet', 'HeadCount']
	} else if (type === 'leave-utilization') {
		results = await generateLeaveUtilization(user.organizationId, { startDate, endDate })
		columns = ['LeaveType', 'TotalDaysUsed', 'EmployeeCount']
	} else if (type === 'payroll-register') {
		results = await generatePayrollRegister(
			user.organizationId,
			{ startDate, endDate },
			visiblePayIds
		)
		columns = [
			'Employee',
			'Period',
			'Gross',
			'SSS',
			'PhilHealth',
			'PagIBIG',
			'Tax',
			'OtherDeductions',
			'Net'
		]
	} else if (type === 'tardiness') {
		results = await generateTardiness(user.organizationId, { startDate, endDate, departmentId })
		columns = ['Employee', 'LateDays', 'LateMinutes', 'UndertimeMinutes']
	} else if (type === 'overtime') {
		results = await generateOvertime(user.organizationId, { startDate, endDate, departmentId })
		columns = ['Employee', 'OvertimeHours', 'RawOvertimeHours', 'NightDiffHours']
	} else if (type === 'loan-summary') {
		results = await generateLoanSummary(user.organizationId, { startDate, endDate }, visiblePayIds)
		columns = ['Employee', 'Principal', 'Balance', 'Installment', 'Status']
	} else if (type === 'government-remittance') {
		results = await generateGovernmentRemittance(
			user.organizationId,
			{ startDate, endDate },
			visiblePayIds
		)
		columns = ['Contribution', 'EmployeeShare', 'EmployerShare', 'Total']
	} else if (type === 'bir-withholding') {
		results = await generateBIRWithholding(
			user.organizationId,
			{ startDate, endDate },
			visiblePayIds
		)
		columns = ['Employee', 'TIN', 'Gross', 'TaxWithheld']
	} else if (type === 'separation') {
		results = await generateSeparationReport(user.organizationId, { startDate, endDate })
		columns = [
			'EmployeeNumber',
			'Employee',
			'Department',
			'Type',
			'EffectiveDate',
			'Status',
			'Clearance',
			'FinalPay'
		]
	} else if (type === 'recruitment') {
		// departmentId is honoured here — a JobPosting carries one directly, so the page's
		// existing department selector filters this report without any extra plumbing.
		results = await generateRecruitmentReport(user.organizationId, {
			startDate,
			endDate,
			departmentId
		})
		columns = [
			'Title',
			'Department',
			'Status',
			'Posted',
			'Closed',
			'Applicants',
			'Interviewed',
			'Hired',
			'DaysOpen'
		]
	}

	return {
		reportType: type,
		results,
		columns,
		departments,
		startDate: startDate.toISOString().slice(0, 10),
		endDate: endDate.toISOString().slice(0, 10),
		selectedDepartment: departmentId
	}
}

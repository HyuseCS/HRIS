import { json, error } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability, requirePayrollReports } from '$lib/server/rbac'
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
	generateBIRWithholding,
	exportToCSV
} from '$lib/server/services/reports'
import { generateSeparationReport } from '$lib/server/services/separation'
import { generateRecruitmentReport } from '$lib/server/services/recruitment'
import type { RequestHandler } from './$types'

const DAY_MS = 86_400_000
const MAX_RANGE_DAYS = 366

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
// Payroll reports are also visible to Payroll Officer / Finance; the rest are HR-only.
const PAYROLL_REPORT_TYPES = [
	'payroll-costs',
	'payroll-register',
	'loan-summary',
	'government-remittance',
	'bir-withholding'
] as const

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Unauthorized')

	const user = locals.user

	const type = params.type
	if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
		error(404, 'Unknown report type')
	}

	// #249: MANAGER holds VIEW_PAYROLL_REPORTS (#133), so it clears the gate for every payroll report
	// — and each of them is built from per-employee pay. Resolve the allow-list once here and hand it
	// to all five, so no report can be added to the list above and quietly ship unscoped. `null` =
	// unrestricted. The `export=csv` branch below serializes this same `results`, so it is covered.
	let visiblePayIds: string[] | null = null
	if (PAYROLL_REPORT_TYPES.includes(type as (typeof PAYROLL_REPORT_TYPES)[number])) {
		requirePayrollReports(user.roles)
		visiblePayIds = await listVisiblePayEmployeeIds({
			id: user.id,
			roles: user.roles,
			organizationId: user.organizationId
		})
	} else {
		requireAnyCapability(user.roles, 'MANAGE_HR')
	}

	const dateParam = z.coerce.date()
	const rawStart = url.searchParams.get('start')
	const rawEnd = url.searchParams.get('end')

	const parsedStart = rawStart ? dateParam.safeParse(rawStart) : null
	const parsedEnd = rawEnd ? dateParam.safeParse(rawEnd) : null
	if ((rawStart && !parsedStart!.success) || (rawEnd && !parsedEnd!.success)) {
		error(400, 'Invalid start or end date')
	}

	const startDate = parsedStart?.success
		? parsedStart.data
		: new Date(new Date().getFullYear(), 0, 1)
	const endDate = parsedEnd?.success ? parsedEnd.data : new Date()

	if (endDate.getTime() < startDate.getTime()) {
		error(400, 'End date must be on or after start date')
	}
	if (endDate.getTime() - startDate.getTime() > MAX_RANGE_DAYS * DAY_MS) {
		error(400, `Date range must be ${MAX_RANGE_DAYS} days or fewer`)
	}

	const departmentId = url.searchParams.get('department') ?? undefined
	const exportCsv = url.searchParams.get('export') === 'csv'

	let results: Record<string, unknown>[] = []

	if (type === 'headcount') {
		results = await generateHeadcount(user.organizationId, { startDate, endDate, departmentId })
	} else if (type === 'attendance') {
		results = await generateAttendance(user.organizationId, { startDate, endDate, departmentId })
	} else if (type === 'payroll-costs') {
		results = await generatePayrollCosts(user.organizationId, { startDate, endDate }, visiblePayIds)
	} else if (type === 'leave-utilization') {
		results = await generateLeaveUtilization(user.organizationId, { startDate, endDate })
	} else if (type === 'payroll-register') {
		results = await generatePayrollRegister(
			user.organizationId,
			{ startDate, endDate },
			visiblePayIds
		)
	} else if (type === 'tardiness') {
		results = await generateTardiness(user.organizationId, { startDate, endDate, departmentId })
	} else if (type === 'overtime') {
		results = await generateOvertime(user.organizationId, { startDate, endDate, departmentId })
	} else if (type === 'loan-summary') {
		results = await generateLoanSummary(user.organizationId, { startDate, endDate }, visiblePayIds)
	} else if (type === 'government-remittance') {
		results = await generateGovernmentRemittance(
			user.organizationId,
			{ startDate, endDate },
			visiblePayIds
		)
	} else if (type === 'bir-withholding') {
		results = await generateBIRWithholding(
			user.organizationId,
			{ startDate, endDate },
			visiblePayIds
		)
	} else if (type === 'separation') {
		results = await generateSeparationReport(user.organizationId, { startDate, endDate })
	} else if (type === 'recruitment') {
		results = await generateRecruitmentReport(user.organizationId, { startDate, endDate })
	}

	if (exportCsv) {
		const csv = exportToCSV(results)
		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${type}.csv"`
			}
		})
	}

	return json({ results })
}

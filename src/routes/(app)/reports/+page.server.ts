import { error } from '@sveltejs/kit'
import { canAny } from '$lib/server/rbac'
import {
	getHeadcountByDepartment,
	getLeaveUtilizationReport,
	getPayrollSummaryReport,
	getAttritionReport
} from '$lib/server/services/reports'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
	const roles = locals.user!.roles
	// MANAGE_HR sees all reports; Payroll Officer / Finance see payroll only.
	const canViewHrReports = canAny(roles, 'MANAGE_HR')
	if (!canViewHrReports && !canAny(roles, 'VIEW_PAYROLL_REPORTS'))
		error(403, 'Insufficient permissions')

	// #249: the summary is pre-aggregated run totals, so an employee allow-list cannot filter it the
	// way `reports/[type]` filters the five per-employee reports. MANAGER holds VIEW_PAYROLL_REPORTS
	// (#133) but is scoped to their reporting line on every other pay surface, so gate it on the
	// org-wide capability rather than ship them the whole organization's payroll bill.
	const canViewPayOrgwide = canAny(roles, 'VIEW_PAY_ORGWIDE')

	const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()))
	const orgId = locals.user!.organizationId

	const [headcountByDept, leaveUtilization, payrollSummary, attrition] = await Promise.all([
		canViewHrReports ? getHeadcountByDepartment(orgId) : Promise.resolve([]),
		canViewHrReports ? getLeaveUtilizationReport(orgId, year) : Promise.resolve([]),
		canViewPayOrgwide ? getPayrollSummaryReport(orgId, year) : Promise.resolve([]),
		canViewHrReports
			? getAttritionReport(orgId, year)
			: Promise.resolve({ hired: 0, offboarded: 0 })
	])

	return { headcountByDept, leaveUtilization, payrollSummary, attrition, year, canViewHrReports }
}

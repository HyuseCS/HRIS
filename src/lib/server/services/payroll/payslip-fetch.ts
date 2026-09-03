/**
 * Hydrates a PayslipDocument from Prisma, enforcing the same authorization
 * rules as the JSON payslip endpoint. Owns the DB shape → DTO mapping so
 * the assembler stays DB-free and testable.
 */

import { db } from '$lib/server/db'
import { canAny } from '$lib/rbac'
import { canTouchEmployee } from '$lib/server/services/employee-access'
import type { Role } from '@prisma/client'
import { isPayslipVisible } from './runs'
import {
	assemblePayslipDocument,
	type HydrateInput,
	type PayslipDocument
} from './payslip-document'

export interface FetchPayslipContext {
	userId: string
	roles: Role[]
	organizationId: string
}

/**
 * May this user read this payslip? (#249)
 *
 * The single implementation behind every payslip door — the JSON endpoint, the PDF, and the
 * `/payslips/[id]` page. #249 exists precisely because two of those drifted apart and a third
 * carried its own hardcoded role list, so a second copy of this rule is the bug, not the fix.
 *
 * Owner → org-wide payroll roles → a manager's own reporting line → denied.
 */
export async function canReadPayslip(
	user: { id: string; roles: Role[]; organizationId: string },
	target: { id: string; userId: string | null }
): Promise<boolean> {
	if (target.userId === user.id) return true

	const roles = user.roles
	if (canAny(roles, 'VIEW_PAY_ORGWIDE')) return true

	// Load-bearing, not redundant: without it any EMPLOYEE who happens to supervise someone would
	// reach their report's payslip through `canTouchEmployee`, which knows about reporting lines but
	// nothing about payroll.
	if (!canAny(roles, 'VIEW_PAYROLL_REPORTS')) return false

	// MANAGER is the only role that gets here — see VIEW_PAY_ORGWIDE's docblock. Scoped to the
	// reporting line, the same rule the 201 file and the roster enforce (#228/#234).
	//
	// `canTouchEmployee` now reads the full role set (#247), but that changes nothing here and this
	// call site never depended on it either way: its only role-dependent line is the
	// ADMINISTER_HR_ORGWIDE short-circuit, and every holder of that capability was already admitted
	// by the arm above, VIEW_PAY_ORGWIDE being a superset of it. The containment test below still
	// pins that — what it protects is the ORDER of these two arms, not the old single-role read.
	//
	// The widening was revisited rather than reversed: this call site's reasoning held, but the 201
	// file and roster call sites have no capability arm in front of them, so there the single-role
	// short-circuit WAS the deciding factor and denied [MANAGER, HR_ADMIN] users their own records.
	return canTouchEmployee(user, target.id)
}

export type FetchResult =
	{ ok: true; document: PayslipDocument } | { ok: false; status: 401 | 403 | 404; message: string }

export async function fetchPayslipDocument(
	entryId: string,
	ctx: FetchPayslipContext
): Promise<FetchResult> {
	const entry = await db.payrollEntry.findUnique({
		where: { id: entryId },
		include: {
			employee: {
				select: {
					firstName: true,
					lastName: true,
					middleName: true,
					employeeNumber: true,
					jobTitle: true,
					employmentType: true,
					basicMonthlySalary: true,
					rateType: true,
					organizationId: true,
					userId: true
				}
			},
			payrollRun: {
				select: {
					periodStart: true,
					periodEnd: true,
					status: true,
					approvedAt: true,
					organizationId: true,
					period: { select: { status: true, releasedAt: true } }
				}
			},
			earnings: { select: { code: true, label: true, amount: true } },
			deductions: { select: { code: true, label: true, amount: true } }
		}
	})

	if (!entry) return { ok: false, status: 404, message: 'Payslip not found' }
	if (entry.payrollRun.organizationId !== ctx.organizationId) {
		return { ok: false, status: 404, message: 'Payslip not found' }
	}

	// #249: one shared rule with the JSON endpoint and the /payslips page. This previously tested
	// VIEW_PAYROLL_REPORTS alone (through a `canViewPayrollReports` helper, deleted in #273), with a
	// comment claiming "MANAGER stays blocked from peers' compensation" — the opposite of what it
	// did, since #133 put MANAGER in VIEW_PAYROLL_REPORTS.
	const allowed = await canReadPayslip(
		{ id: ctx.userId, roles: ctx.roles, organizationId: ctx.organizationId },
		{ id: entry.employeeId, userId: entry.employee.userId }
	)
	if (!allowed) return { ok: false, status: 403, message: 'Access denied' }

	// #278: visibility begins at filing, and no capability opens a draft. This used to let any
	// VIEW_PAYROLL_REPORTS holder read a payslip out of a DRAFT or COMPUTED run, which the JSON door
	// never did — so the same entry answered 200 or 403 depending on which door you knocked on.
	// Finance still reconciles a run before approval, through the payroll exports and /payroll/[id];
	// a payslip is the filed document, not a preview of one.
	if (!isPayslipVisible(entry.payrollRun)) {
		return { ok: false, status: 403, message: 'Payslip not yet available' }
	}

	const organization = await db.organization.findUnique({
		where: { id: entry.payrollRun.organizationId },
		select: { name: true, address: true, logoUrl: true }
	})
	if (!organization) return { ok: false, status: 404, message: 'Organization not found' }

	// Attendance summary for the period. Working days = distinct AttendanceDay rows in range;
	// present days = those whose status counts as attended (PRESENT or LATE). OT hours per
	// bucket feed the OVERTIME table's HRS column on the PDF.
	const days = await db.attendanceDay.findMany({
		where: {
			employeeId: entry.employeeId,
			date: { gte: entry.payrollRun.periodStart, lte: entry.payrollRun.periodEnd }
		},
		select: {
			status: true,
			lateMinutes: true,
			overtimeHours: true,
			restDayOtHours: true,
			regularHolidayOtHours: true,
			specialHolidayOtHours: true
		}
	})
	const attendance = {
		daysOfWork: days.length,
		daysOfPresent: days.filter((d) => d.status === 'PRESENT' || d.status === 'LATE').length,
		lateMinutes: days.reduce((acc, d) => acc + (d.lateMinutes ?? 0), 0),
		overtimeHours: days.reduce((s, d) => s + Number(d.overtimeHours), 0),
		restDayOtHours: days.reduce((s, d) => s + Number(d.restDayOtHours), 0),
		regularHolidayOtHours: days.reduce((s, d) => s + Number(d.regularHolidayOtHours), 0),
		specialHolidayOtHours: days.reduce((s, d) => s + Number(d.specialHolidayOtHours), 0)
	}

	const input: HydrateInput = {
		entry: {
			hoursWorked: Number(entry.hoursWorked),
			basicPay: Number(entry.basicPay),
			grossPay: Number(entry.grossPay),
			sssEe: Number(entry.sssEe),
			philhealthEe: Number(entry.philhealthEe),
			pagibigEe: Number(entry.pagibigEe),
			withholdingTax: Number(entry.withholdingTax),
			totalDeductions: Number(entry.totalDeductions),
			netPay: Number(entry.netPay),
			earnings: entry.earnings.map((e) => ({
				code: e.code,
				label: e.label,
				amount: Number(e.amount)
			})),
			deductions: entry.deductions.map((d) => ({
				code: d.code,
				label: d.label,
				amount: Number(d.amount)
			}))
		},
		employee: {
			firstName: entry.employee.firstName,
			lastName: entry.employee.lastName,
			middleName: entry.employee.middleName,
			employeeNumber: entry.employee.employeeNumber,
			jobTitle: entry.employee.jobTitle,
			employmentType: entry.employee.employmentType,
			basicMonthlySalary: Number(entry.employee.basicMonthlySalary),
			rateType: entry.employee.rateType
		},
		organization,
		run: {
			periodStart: entry.payrollRun.periodStart,
			periodEnd: entry.payrollRun.periodEnd,
			approvedAt: entry.payrollRun.approvedAt,
			releasedAt: entry.payrollRun.period?.releasedAt ?? null
		},
		attendance
	}

	return { ok: true, document: assemblePayslipDocument(input) }
}

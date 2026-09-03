import { error } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { isPayslipVisible } from '$lib/server/services/payroll/runs'
import { canReadPayslip } from '$lib/server/services/payroll/payslip-fetch'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!

	const entry = await db.payrollEntry.findUnique({
		where: { id: params.id },
		include: {
			employee: {
				select: {
					firstName: true,
					lastName: true,
					employeeNumber: true,
					jobTitle: true,
					userId: true,
					organizationId: true,
					department: { select: { name: true } }
				}
			},
			payrollRun: {
				select: {
					periodStart: true,
					periodEnd: true,
					status: true,
					approvedAt: true,
					period: { select: { status: true } },
					organizationId: true
				}
			}
		}
	})

	if (!entry) error(404, 'Payslip not found')
	if (entry.payrollRun.organizationId !== user.organizationId) {
		error(404, 'Payslip not found')
	}

	// #249: the same shared rule as the JSON and PDF doors. This was a hardcoded role set that
	// omitted CEO, so the "Payslip" link the run-detail page renders 403'd for them, and it could
	// only ever drift from the capability table — the anti-pattern `rbac.ts` exists to retire.
	if (!(await canReadPayslip(user, { id: entry.employeeId, userId: entry.employee.userId }))) {
		error(403, 'Access denied')
	}
	// #278: the same strict rule as the JSON and PDF doors — no capability opens a payslip whose run
	// is still a draft.
	if (!isPayslipVisible(entry.payrollRun)) {
		error(403, 'Payslip not yet available')
	}

	return {
		entry: {
			...entry,
			grossPay: Number(entry.grossPay),
			sssEe: Number(entry.sssEe),
			philhealthEe: Number(entry.philhealthEe),
			pagibigEe: Number(entry.pagibigEe),
			withholdingTax: Number(entry.withholdingTax),
			totalDeductions: Number(entry.totalDeductions),
			netPay: Number(entry.netPay)
		}
	}
}

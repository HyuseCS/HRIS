import { json } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { apiError } from '$lib/server/api-error'
import { isPayslipVisible } from '$lib/server/services/payroll/runs'
import { canReadPayslip } from '$lib/server/services/payroll/payslip-fetch'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const user = locals.user

	// Scoped at the query, not checked afterwards: PayrollEntry has no organizationId
	// of its own, so tenancy runs through payrollRun. The role gate below only ever
	// constrained EMPLOYEE, which left every privileged role able to read any org's
	// payslip by id. Filtering here also makes a foreign id indistinguishable from a
	// nonexistent one (404, not 403) — no cross-org existence disclosure.
	const entry = await db.payrollEntry.findFirst({
		where: { id: params.id, payrollRun: { organizationId: user.organizationId } },
		include: {
			employee: {
				select: {
					firstName: true,
					lastName: true,
					employeeNumber: true,
					jobTitle: true,
					department: { select: { name: true } },
					userId: true
				}
			},
			payrollRun: {
				select: {
					periodStart: true,
					periodEnd: true,
					status: true,
					approvedAt: true,
					period: { select: { status: true } }
				}
			}
		}
	})

	if (!entry) return apiError(404, 'Payslip not found')

	// #249: owner, or an org-wide payroll role, or a manager reaching their own reporting line.
	// This gate used to be the payroll-view capability alone, which #133 had quietly opened to every
	// MANAGER.
	if (!(await canReadPayslip(user, { id: entry.employeeId, userId: entry.employee.userId }))) {
		return apiError(403, 'Access denied')
	}

	// #278: both gates above and below are now shared verbatim with the PDF and the /payslips page,
	// so no door is a way around another. The claim used to cover the access gate only — this door
	// was already strict about drafts while the other two let VIEW_PAYROLL_REPORTS holders straight
	// through, which is the bug #278 closed.
	if (!isPayslipVisible(entry.payrollRun)) {
		return apiError(403, 'Payslip not yet available')
	}

	return json({ data: entry })
}

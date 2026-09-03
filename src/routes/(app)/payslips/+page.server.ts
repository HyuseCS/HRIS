import { db } from '$lib/server/db'
import { paginate } from '$lib/server/pagination'
import { payslipVisibleRunFilter } from '$lib/server/services/payroll/runs'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!

	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})

	// Accounts without a linked employee record (e.g. approver, verifier, CEO)
	// have no payslips of their own — show the empty state rather than bouncing
	// them to the dashboard.
	if (!myEmployee) {
		return { payslips: [], pagination: paginate(url, 0) }
	}

	const where = {
		employeeId: myEmployee.id,
		payrollRun: payslipVisibleRunFilter
	}
	const total = await db.payrollEntry.count({ where })
	const pagination = paginate(url, total)

	const payslips = await db.payrollEntry.findMany({
		where,
		include: {
			payrollRun: {
				select: {
					periodStart: true,
					periodEnd: true,
					status: true
				}
			}
		},
		orderBy: {
			payrollRun: { periodStart: 'desc' }
		},
		skip: pagination.skip,
		take: pagination.take
	})

	return { payslips, pagination }
}

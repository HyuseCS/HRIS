import { db } from '$lib/server/db'
import { requireAnyCapability } from '$lib/server/rbac'
import { listOrgLeaveBalances } from '$lib/server/services/leave'
import type { PageServerLoad } from './$types'

// HR-facing org-wide leave balances (#137, and the fix for #150 — privileged roles had no
// way to see anyone's balances but their own, which for HR/CEO meant an empty panel).
export const load: PageServerLoad = async ({ locals, url }) => {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')

	const organizationId = locals.user!.organizationId
	const year = Number(url.searchParams.get('year')) || new Date().getFullYear()
	const departmentId = url.searchParams.get('department') ?? ''
	const search = url.searchParams.get('search') ?? ''

	const [employees, departments, leaveTypes] = await Promise.all([
		listOrgLeaveBalances({
			organizationId,
			year,
			departmentId: departmentId || undefined,
			search: search || undefined
		}),
		db.department.findMany({
			where: { organizationId },
			select: { id: true, name: true },
			orderBy: { name: 'asc' }
		}),
		// Column set for the matrix. Active types only, so a retired type doesn't add a
		// permanently empty column — historical balances for it still exist on the 201 file.
		db.leaveType.findMany({
			where: { organizationId, isActive: true },
			select: { id: true, name: true, minMonthsOfService: true },
			orderBy: { name: 'asc' }
		})
	])

	// Flatten to a matrix row per employee: one cell per leave type, in column order, so the
	// template never has to search the nested balances for every cell.
	const rows = employees.map((e) => {
		const byType = new Map(e.leaveBalances.map((b) => [b.leaveType.id, b]))
		return {
			id: e.id,
			employeeNumber: e.employeeNumber,
			name: `${e.lastName}, ${e.firstName}`,
			department: e.department.name,
			startDate: e.startDate,
			cells: leaveTypes.map((lt) => {
				const b = byType.get(lt.id)
				return b
					? {
							leaveTypeId: lt.id,
							allocated: Number(b.allocated),
							used: Number(b.used),
							remaining: Number(b.remaining)
						}
					: null
			})
		}
	})

	return { rows, departments, leaveTypes, year, departmentId, search }
}

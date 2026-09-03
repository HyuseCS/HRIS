import { canAny } from '$lib/server/rbac'
import { error } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { listAttendanceDays, listTeamDay } from '$lib/server/services/attendance'
import { exportToCSV } from '$lib/server/services/reports'
import { manilaDayKey } from '$lib/utils/dates'
import { isFoodServiceOrg } from '$lib/orgs'
import type { RequestHandler } from './$types'

const DAY_MS = 86_400_000
const MAX_RANGE_DAYS = 62

const fmtTime = (d: Date | null) =>
	d
		? new Date(d).toLocaleTimeString('en-PH', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
				timeZone: 'Asia/Manila'
			})
		: ''
const num = (x: unknown) => Number(x).toFixed(2)

// Export attendance as a timesheet CSV. Mirrors the page's access model: managers export any
// employee or the whole team for a day; a regular employee exports only their own records.
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user
	const canManage = canAny(user.roles, 'MANAGE_HR')
	const view = canManage && url.searchParams.get('view') === 'team' ? 'team' : 'employee'
	const today = manilaDayKey(new Date())

	let rows: Record<string, unknown>[] = []
	let filename = 'attendance.csv'

	// #162 — four extra columns for food-service tenants. Spread into EVERY row, including rows
	// with no day: `exportToCSV` takes its header list from `rows[0]` only, so a key present on
	// some rows and absent on others silently drops columns for the rest of the file.
	const showAmPm = isFoodServiceOrg(user.organizationId)
	const amPmCols = (
		d:
			| {
					amTimeIn: Date | null
					amTimeOut: Date | null
					pmTimeIn: Date | null
					pmTimeOut: Date | null
			  }
			| null
			| undefined
	) =>
		showAmPm
			? {
					'AM In': fmtTime(d?.amTimeIn ?? null),
					'AM Out': fmtTime(d?.amTimeOut ?? null),
					'PM In': fmtTime(d?.pmTimeIn ?? null),
					'PM Out': fmtTime(d?.pmTimeOut ?? null)
				}
			: {}

	if (view === 'team') {
		const date = url.searchParams.get('date') ?? today
		const team = await listTeamDay(user.organizationId, date)
		rows = team.map((t) => ({
			Employee: t.name,
			'Employee No': t.employeeNumber,
			Department: t.departmentName ?? '',
			Date: date,
			Status: t.day?.status ?? 'NO RECORD',
			'Time In': fmtTime(t.day?.timeIn ?? null),
			'Time Out': fmtTime(t.day?.timeOut ?? null),
			...amPmCols(t.day),
			'Regular Hrs': t.day ? num(t.day.regularHours) : '',
			'OT Hrs': t.day ? num(t.day.overtimeHours) : '',
			'Night Diff Hrs': t.day ? num(t.day.nightDiffHours) : '',
			'Late Min': t.day?.lateMinutes ?? '',
			'Undertime Min': t.day?.undertimeMinutes ?? '',
			Locked: t.day?.isLocked ? 'Yes' : 'No'
		}))
		filename = `attendance-team-${date}.csv`
	} else {
		let employeeId = canManage ? url.searchParams.get('employeeId') : null
		if (!canManage) {
			const me = await db.employee.findFirst({
				where: { userId: user.id, organizationId: user.organizationId },
				select: { id: true }
			})
			employeeId = me?.id ?? null
		}
		if (!employeeId) error(400, 'No employee selected')

		const emp = await db.employee.findFirst({
			where: { id: employeeId, organizationId: user.organizationId },
			select: { employeeNumber: true }
		})
		if (!emp) error(404, 'Employee not found')

		let from = url.searchParams.get('from') ?? manilaDayKey(new Date(Date.now() - 13 * DAY_MS))
		const to = url.searchParams.get('to') ?? today
		if (new Date(to).getTime() - new Date(from).getTime() > MAX_RANGE_DAYS * DAY_MS) {
			from = manilaDayKey(new Date(new Date(to).getTime() - MAX_RANGE_DAYS * DAY_MS))
		}

		const days = await listAttendanceDays(employeeId, new Date(from), new Date(to))
		rows = days.map((d) => ({
			Date: manilaDayKey(d.date),
			Status: d.status,
			'Time In': fmtTime(d.timeIn),
			'Time Out': fmtTime(d.timeOut),
			...amPmCols(d),
			'Regular Hrs': num(d.regularHours),
			'OT Hrs': num(d.overtimeHours),
			'Night Diff Hrs': num(d.nightDiffHours),
			'Late Min': d.lateMinutes,
			'Undertime Min': d.undertimeMinutes,
			Locked: d.isLocked ? 'Yes' : 'No'
		}))
		filename = `timesheet-${emp.employeeNumber}-${from}_to_${to}.csv`
	}

	const csv = exportToCSV(rows)
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	})
}

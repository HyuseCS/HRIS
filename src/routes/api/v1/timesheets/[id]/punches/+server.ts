import { json } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { canTouchEmployee } from '$lib/server/services/employee-access'
import { listPunches } from '$lib/server/services/timelog'
import { apiError } from '$lib/server/api-error'
import type { RequestHandler } from './$types'

// GET /api/v1/timesheets/:employeeId/punches?from=&to=
// List raw TimeLog punches for an employee within an optional [from, to] window.
// Access: the owner, anyone who may touch the owner's record (`canTouchEmployee` — their
// manager, a branch manager, org-wide HR).
// (`params.id` is the employeeId — the segment reuses the existing [id] param name,
// which SvelteKit requires for sibling dynamic routes.)
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const user = locals.user
	const employeeId = params.id

	// Resolve the target employee (scoped to the caller's org).
	const target = await db.employee.findFirst({
		where: { id: employeeId, organizationId: user.organizationId },
		select: { id: true }
	})
	if (!target) return apiError(404, 'Employee not found')

	// #282: object-level scoping, the same check /employees/[id] uses. The guard here used to be
	// `hasAnyMinRole(user.roles,'HR_ADMIN')` with a hand-rolled owner/direct-manager fallback — and
	// MANAGER clears that floor (#133), so the fallback never ran and every manager read every
	// employee's raw punches. `canTouchEmployee` also picks up additional supervisees (#176) and
	// branch staff, which the hand-rolled `reportsToId` comparison missed.
	if (!(await canTouchEmployee(user, employeeId))) return apiError(403, 'Insufficient permissions')

	// Optional window; reject unparseable dates.
	const fromParam = url.searchParams.get('from')
	const toParam = url.searchParams.get('to')
	const from = fromParam ? new Date(fromParam) : undefined
	const to = toParam ? new Date(toParam) : undefined
	if (from && isNaN(from.getTime())) return apiError(400, 'Invalid "from" date')
	if (to && isNaN(to.getTime())) return apiError(400, 'Invalid "to" date')

	const punches = await listPunches(target.id, { from, to })
	return json({ data: punches, count: punches.length })
}

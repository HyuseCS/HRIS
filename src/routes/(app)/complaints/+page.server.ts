import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import type { ComplaintCategory, ComplaintStatus } from '@prisma/client'
import { db } from '$lib/server/db'
import { canAny } from '$lib/rbac'
import { paginate } from '$lib/server/pagination'
import {
	openComplaint,
	listComplaintsForOrg,
	countComplaintsForOrg,
	listComplaintsForEmployee,
	COMPLAINT_CATEGORIES
} from '$lib/server/services/complaints'
import { listVisibleEmployeeIds } from '$lib/server/services/employee-access'
import type { Actions, PageServerLoad } from './$types'

const STATUSES: ComplaintStatus[] = ['OPEN', 'RESPONDED', 'RESOLVED']

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	const isHr = canAny(user.roles, 'MANAGE_HR')

	if (isHr) {
		const statusParam = url.searchParams.get('status') ?? ''
		const status = STATUSES.includes(statusParam as ComplaintStatus)
			? (statusParam as ComplaintStatus)
			: undefined
		// `null` for HR/CEO/Super-Admin (unrestricted); an id list for a manager, possibly empty.
		// `[]` is truthy, so the filter is still emitted and matches nothing — fail-closed.
		const visibleIds = await listVisibleEmployeeIds(user)
		const filters = { status, ...(visibleIds && { employeeIds: visibleIds }) }

		const total = await countComplaintsForOrg(user.organizationId, filters)
		const pagination = paginate(url, total)
		const [complaints, employees] = await Promise.all([
			listComplaintsForOrg(user.organizationId, filters, {
				skip: pagination.skip,
				take: pagination.take
			}),
			db.employee.findMany({
				where: {
					organizationId: user.organizationId,
					employmentStatus: 'ACTIVE',
					// Scoped too, not just the list: an unscoped dropdown reads the whole roster out
					// to a manager before the 403 on submit ever fires.
					...(visibleIds && { id: { in: visibleIds } })
				},
				select: { id: true, firstName: true, lastName: true, employeeNumber: true },
				orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
			})
		])
		return {
			isHr: true,
			complaints,
			employees,
			pagination,
			statusFilter: status ?? '',
			categories: COMPLAINT_CATEGORIES
		}
	}

	// Employee view: only the inquiries raised against them.
	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
	const complaints = myEmployee
		? await listComplaintsForEmployee(myEmployee.id, user.organizationId)
		: []
	return { isHr: false, complaints, hasEmployee: Boolean(myEmployee) }
}

const openSchema = z.object({
	employeeId: z.string().min(1),
	subject: z.string().trim().min(1).max(200),
	category: z.enum(COMPLAINT_CATEGORIES as [ComplaintCategory, ...ComplaintCategory[]]),
	message: z.string().trim().min(1)
})

export const actions: Actions = {
	open: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		if (!canAny(user.roles, 'MANAGE_HR')) return fail(403, { error: 'Insufficient permissions.' })

		const raw = Object.fromEntries(await request.formData()) as Record<string, string>
		const parsed = openSchema.safeParse(raw)
		if (!parsed.success) {
			return fail(422, {
				error: 'Please fix the highlighted fields.',
				fieldErrors: parsed.error.flatten().fieldErrors,
				values: raw
			})
		}

		const ctx = {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		}
		try {
			await openComplaint(parsed.data, ctx)
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message), values: raw })
			throw e
		}
		return { message: 'Inquiry opened.' }
	}
}

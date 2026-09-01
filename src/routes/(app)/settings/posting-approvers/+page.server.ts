import { fail, isHttpError } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import {
	listPostingApprovers,
	setPostingApprover,
	clearPostingApprover
} from '$lib/server/services/posting-approvers'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
	const [rows, employees] = await Promise.all([
		listPostingApprovers(locals.user!.organizationId),
		db.employee.findMany({
			where: { organizationId: locals.user!.organizationId, employmentStatus: 'ACTIVE' },
			select: { id: true, firstName: true, lastName: true, jobTitle: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		})
	])
	return { rows, employees }
}

function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}

export const actions: Actions = {
	set: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = await request.formData()
		const departmentId = data.get('departmentId') as string
		const approverId = data.get('approverId') as string
		if (!departmentId) return fail(400, { error: 'Missing department' })
		// An empty approver clears the mapping (falls back to HR).
		try {
			if (!approverId) {
				await clearPostingApprover(
					locals.user!.organizationId,
					departmentId,
					ctxOf(locals, getClientAddress())
				)
			} else {
				await setPostingApprover(
					locals.user!.organizationId,
					departmentId,
					approverId,
					ctxOf(locals, getClientAddress())
				)
			}
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	}
}

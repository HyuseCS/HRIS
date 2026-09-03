import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { db } from '$lib/server/db'
import { canAny } from '$lib/rbac'
import {
	getComplaint,
	postComplaintMessage,
	resolveComplaint
} from '$lib/server/services/complaints'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!
	const isHr = canAny(user.roles, 'MANAGE_HR')

	// Resolved before the fetch: the service owns admission now, and it needs the actor's own
	// employee id to decide the subject arm. `load` has no `getClientAddress` and `getComplaint`
	// writes no audit row, so the optional `ipAddress` is correctly omitted.
	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
	const ctx = {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles
	}
	const complaint = await getComplaint(params.id, ctx, myEmployee?.id ?? null)
	const isSubject = myEmployee?.id === complaint.employeeId

	return { complaint, isHr, isSubject }
}

const replySchema = z.object({ body: z.string().trim().min(1) })

export const actions: Actions = {
	reply: async ({ request, locals, getClientAddress, params }) => {
		const user = locals.user!

		const myEmployee = await db.employee.findFirst({
			where: { userId: user.id, organizationId: user.organizationId },
			select: { id: true }
		})
		const ctx = {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		}
		const parsed = replySchema.safeParse({ body: (await request.formData()).get('body') })
		if (!parsed.success) return fail(422, { error: 'Message cannot be empty.' })

		try {
			await postComplaintMessage(params.id, parsed.data.body, ctx, myEmployee?.id ?? null)
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { message: 'Reply sent.' }
	},

	resolve: async ({ locals, getClientAddress, params }) => {
		const user = locals.user!
		if (!canAny(user.roles, 'MANAGE_HR')) return fail(403, { error: 'Insufficient permissions.' })

		const ctx = {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		}
		try {
			await resolveComplaint(params.id, ctx)
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { message: 'Inquiry resolved.' }
	}
}

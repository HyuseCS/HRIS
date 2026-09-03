import { fail, isHttpError, redirect } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { getLeaveBalances } from '$lib/server/services/leave'
import { createRequest } from '$lib/server/services/requests'
import { meetsLeaveTenure } from '$lib/server/services/requests/leave'
import { requestSchema } from '$lib/server/schemas/requests'
import { setFlash } from '$lib/server/flash'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!

	const employee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId }
	})
	if (!employee) redirect(303, '/leave')

	const [leaveTypes, balances] = await Promise.all([
		db.leaveType.findMany({
			where: { organizationId: user.organizationId, isActive: true },
			orderBy: { name: 'asc' }
		}),
		getLeaveBalances(employee!.id, new Date().getFullYear())
	])

	return {
		// The tenure gate is enforced server-side in createRequest; this only pre-marks the
		// ineligible options so the form can grey them out instead of letting someone fill in
		// dates and get refused on submit (#137).
		leaveTypes: leaveTypes.map((lt) => ({
			...lt,
			eligible: meetsLeaveTenure(employee!.startDate, lt.minMonthsOfService)
		})),
		// Coerce Decimal balance fields to numbers at the boundary so PageData matches
		// BalanceSummary's numeric prop types (the transport hook serializes at runtime).
		balances: balances.map((b) => ({
			...b,
			allocated: Number(b.allocated),
			used: Number(b.used),
			remaining: Number(b.remaining)
		})),
		myEmployeeId: employee!.id
	}
}

export const actions: Actions = {
	// Files a unified Request (type=LEAVE) — same flow as the Requests/Approvals page,
	// so leave shows there, in /leave, and routes through the approval chain.
	create: async ({ request, locals, getClientAddress, cookies }) => {
		const user = locals.user!

		const employee = await db.employee.findFirst({
			where: { userId: user.id, organizationId: user.organizationId },
			select: { id: true }
		})
		if (!employee) return fail(400, { error: 'No employee profile found.' })

		const f = await request.formData()
		const parsed = requestSchema.safeParse({
			type: 'LEAVE',
			leaveTypeId: (f.get('leaveTypeId') as string) || undefined,
			startDate: (f.get('startDate') as string) || undefined,
			endDate: (f.get('endDate') as string) || undefined,
			reason: (f.get('reason') as string) || undefined
		})
		if (!parsed.success) {
			return fail(422, { error: parsed.error.errors[0]?.message ?? 'Invalid input.' })
		}
		if (parsed.data.type === 'LEAVE' && parsed.data.endDate < parsed.data.startDate) {
			return fail(422, { error: 'End date must be on or after start date.' })
		}

		try {
			await createRequest(employee.id, user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			if (e instanceof Error) return fail(422, { error: e.message })
			throw e
		}

		setFlash(cookies, { kind: 'success', message: 'Your leave request was filed.' })
		redirect(303, '/leave')
	}
}

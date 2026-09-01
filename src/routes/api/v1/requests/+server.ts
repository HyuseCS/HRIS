import { json, error } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { createRequest, listRequests } from '$lib/server/services/requests'
import { requestSchema } from '$lib/server/schemas/requests'
import { canAny } from '$lib/server/rbac'
import { listVisibleEmployeeIds } from '$lib/server/services/employee-access'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user

	// Non-managers only ever see their own requests.
	const isManager = canAny(user.roles, 'VIEW_TEAM')
	// #6: scoped to the ACTIVE org, so a cross-org account no longer resolves its home-tenant
	// profile here.
	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})

	// #275: a MANAGER used to get whatever `employeeId` they asked for — or, with none, the whole
	// organization's leave and OT. The roster helper, NOT `listVisiblePayEmployeeIds`: the pay
	// helper's only difference is that it opens up for VIEW_PAY_ORGWIDE, which here would WIDEN this
	// route for PAYROLL_OFFICER and FINANCE, who are self-only today.
	//
	// `[]` rather than `undefined` for a caller with no employee record: an undefined filter is
	// dropped from the where clause and the response becomes the entire org.
	const visibleEmployeeIds = isManager
		? await listVisibleEmployeeIds(user)
		: myEmployee
			? [myEmployee.id]
			: []
	const requestedId = isManager ? (url.searchParams.get('employeeId') ?? undefined) : undefined
	if (requestedId && visibleEmployeeIds && !visibleEmployeeIds.includes(requestedId))
		error(403, 'You can only manage your own team or a branch you manage.')

	const results = await listRequests({
		organizationId: user.organizationId,
		// `null` from the helper means unrestricted, so no employee filter at all.
		employeeIds: requestedId ? [requestedId] : (visibleEmployeeIds ?? undefined),
		type: (url.searchParams.get('type') as never) ?? undefined,
		status: url.searchParams.get('status') ?? undefined
	})
	return json({ results })
}

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user

	// #6: scoped to the ACTIVE org, so a cross-org account no longer resolves its home-tenant
	// profile here.
	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
	if (!myEmployee) error(400, 'No employee profile found')

	const parsed = requestSchema.safeParse(await request.json())
	if (!parsed.success) error(422, parsed.error.errors[0]?.message ?? 'Invalid input')

	const created = await createRequest(myEmployee.id, user.organizationId, parsed.data, {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	})
	return json({ request: created }, { status: 201 })
}

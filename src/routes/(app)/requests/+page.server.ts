import { fail, isHttpError } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { paginate } from '$lib/server/pagination'
import {
	createRequest,
	countRequests,
	listRequests,
	cancelRequest,
	resubmitRequest,
	deleteRequest
} from '$lib/server/services/requests'
import { uploadsFromForm, saveRequestDocuments } from '$lib/server/services/requests/documents'
import { getLeaveBalances } from '$lib/server/services/leave'
import { meetsLeaveTenure } from '$lib/server/services/requests/leave'
import { requestSchema } from '$lib/server/schemas/requests'
import type { Actions, PageServerLoad } from './$types'

/**
 * #6 — the caller's OWN employee row, scoped to the ACTIVE org.
 *
 * A cross-org account (the CEO, #224) carries a profile in its home tenant only, so an
 * unscoped `userId` lookup resolves that home-tenant employee whichever org the session is
 * currently in. Same shape as `findSelfEmployee` in punch/+page.server.ts. `startDate` is read
 * by `load` only (leave-tenure gating); the actions use `id`.
 */
function findSelfEmployee(user: { id: string; organizationId: string }) {
	return db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true, startDate: true }
	})
}

// Self-service: the current user's own requests. Approvals live under
// /requests/timesheets and /requests/approvals.
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	const myEmployee = await findSelfEmployee(user)

	// #64: one count + one page query.
	const listParams = myEmployee
		? { organizationId: user.organizationId, employeeId: myEmployee.id }
		: null
	const total = listParams ? await countRequests(listParams) : 0
	const pagination = paginate(url, total)

	const [requests, leaveTypes] = await Promise.all([
		listParams
			? listRequests(listParams, { skip: pagination.skip, take: pagination.take })
			: Promise.resolve([]),
		db.leaveType.findMany({
			where: { organizationId: user.organizationId, isActive: true },
			orderBy: { name: 'asc' },
			select: { id: true, name: true, minMonthsOfService: true }
		})
	])

	// The balance affordance the retired /leave/new form carried (phase 6, S2). It cannot join the
	// Promise.all above — that runs before `myEmployee` is known to be non-null, and passing
	// `myEmployee!.id` there is exactly the failure mode. A caller with no employee record can file
	// nothing, so it has no balances to show.
	const balances = myEmployee ? await getLeaveBalances(myEmployee.id, new Date().getFullYear()) : []

	return {
		requests,
		// Coerce Decimal balance fields to numbers at the boundary so PageData matches
		// BalanceSummary's numeric prop types (the transport hook serializes at runtime).
		balances: balances.map((b) => ({
			...b,
			allocated: Number(b.allocated),
			used: Number(b.used),
			remaining: Number(b.remaining)
		})),
		// Tenure-gated types are greyed out in the file form; createRequest is the real
		// enforcement point (#137). Without an employee record nothing is filable anyway.
		leaveTypes: leaveTypes.map((lt) => ({
			...lt,
			eligible: myEmployee ? meetsLeaveTenure(myEmployee.startDate, lt.minMonthsOfService) : false
		})),
		hasEmployee: Boolean(myEmployee),
		pagination
	}
}

// Build the type-specific raw payload from flat form fields, keyed by request type.
function rawFromForm(type: string, f: FormData): Record<string, unknown> {
	const s = (k: string) => (f.get(k) as string) || undefined
	switch (type) {
		case 'LEAVE':
			return {
				type,
				leaveTypeId: s('leaveTypeId'),
				startDate: s('startDate'),
				endDate: s('endDate'),
				reason: s('reason')
			}
		case 'OFFICIAL_BUSINESS':
			return {
				type,
				startDate: s('startDate'),
				endDate: s('endDate'),
				location: s('location'),
				purpose: s('purpose')
			}
		case 'OVERTIME':
		case 'UNDERTIME':
		case 'REST_DAY_WORK':
		case 'HOLIDAY_WORK':
			return { type, date: s('date'), hours: s('hours'), reason: s('reason') }
		case 'INFO_UPDATE':
			return {
				type,
				field: s('field'),
				currentValue: s('currentValue'),
				requestedValue: s('requestedValue'),
				reason: s('reason')
			}
		default:
			return { type }
	}
}

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		const myEmployee = await findSelfEmployee(user)
		if (!myEmployee) return fail(400, { error: 'No employee profile found.' })

		const f = await request.formData()
		const raw = rawFromForm(f.get('type') as string, f)
		const parsed = requestSchema.safeParse(raw)
		if (!parsed.success) {
			const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>
			return fail(422, {
				error: 'Please fix the highlighted fields.',
				fieldErrors,
				// Echo the submitted strings back so a non-enhanced rerender keeps them.
				values: raw as Record<string, string>
			})
		}

		const ctx = {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		}
		try {
			// uploadsFromForm validates count/size/type up front, so a bad file fails
			// here — before the request row is created.
			const uploads = await uploadsFromForm(f)
			const created = await createRequest(myEmployee.id, user.organizationId, parsed.data, ctx)
			try {
				await saveRequestDocuments(created.id, myEmployee.id, user.organizationId, uploads, ctx)
			} catch (e) {
				// Documents failed to persist — remove the just-created request so no
				// orphan is left behind; the original error is what the user sees.
				await deleteRequest(created.id, user.organizationId, ctx).catch(() => {})
				throw e
			}
		} catch (e: unknown) {
			if (isHttpError(e))
				return fail(e.status, {
					error: String(e.body.message),
					values: raw as Record<string, string>
				})
			throw e
		}
		return { message: 'Request submitted.' }
	},

	cancel: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		const myEmployee = await findSelfEmployee(user)
		if (!myEmployee) return fail(400, { error: 'No employee profile found.' })

		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing request id.' })

		try {
			await cancelRequest(id, myEmployee.id, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { message: 'Request cancelled.' }
	},

	resubmit: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		const myEmployee = await findSelfEmployee(user)
		if (!myEmployee) return fail(400, { error: 'No employee profile found.' })

		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing request id.' })

		try {
			await resubmitRequest(id, myEmployee.id, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { message: 'Request re-submitted.' }
	}
}

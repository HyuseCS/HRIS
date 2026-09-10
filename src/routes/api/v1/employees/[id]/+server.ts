import { json } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	getEmployee,
	updateEmployee,
	offboardEmployee,
	promoteEmployee,
	AWAITING_CONFIRMATION,
	NO_CHANGE_MESSAGE,
	NO_CHANGE_STATUS
} from '$lib/server/services/employees'
import { canTouchEmployee } from '$lib/server/services/employee-access'
import { apiError } from '$lib/server/api-error'
import { govIdSchema } from '$lib/utils/gov-ids'
import { isValidPhone, phoneError } from '$lib/utils/phone'
import { isRateBasisAllowed, RATE_BASIS_MISMATCH } from '$lib/utils/rate-basis'
import { EMPLOYMENT_TYPES } from '$lib/utils/employment-type'
import { z } from 'zod'
import type { RequestHandler } from './$types'

// #264: `.strict()`, not a plain `z.object`. Zod strips unknown keys by default, so a PATCH naming
// a field this schema does not know — a typo, a stale client, a column that used to exist — was a
// 200 that silently discarded it. Silent data loss on a write is the same trap #235 and #263 each
// refused for one specific field (`docs/plans/235-reportstoid-cross-tenant.md:77`, §3.2 here); this
// applies the same rule to the whole body. Every caller was audited first: nothing in `src` fetches
// this route, no e2e spec PATCHes it, and all eight bodies in the unit suites are subsets of the
// fields below, so nothing legitimate newly 400s.
//
// It does NOT subsume the handler's `employmentStatus` rejection, and must not be read as licence
// to delete that field from this schema. `employmentStatus` is a KNOWN key, so strict never sees
// it — and only the handler's own 400 names `POST ?action=offboard`. Deleting the field would swap
// an actionable message for a bare 'Invalid request body'.
const updateSchema = z
	.object({
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		middleName: z.string().optional(),
		// #24: same rule as the employee page — a PATCH is a second door onto the same column.
		contactPhone: z.string().optional().refine(isValidPhone, phoneError('Phone')),
		contactAddress: z.string().optional(),
		departmentId: z.string().optional(),
		jobTitle: z.string().optional(),
		employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
		employmentStatus: z.enum(['ACTIVE', 'ON_LEAVE', 'OFFBOARDED']).optional(),
		basicMonthlySalary: z.coerce.number().positive().optional(),
		rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
		// #191: a PATCH only carries the fields the caller intends to change, so anything sent
		// here is by definition new and is format-checked and stored canonically. #267: "sent" is
		// literal — an omitted field is absent from parsed.data and is never written; an explicit ""
		// is a request to clear. Both depend on govIdSchema keeping absent and empty distinct.
		sssNumber: govIdSchema('sssNumber'),
		philhealthNumber: govIdSchema('philhealthNumber'),
		pagibigNumber: govIdSchema('pagibigNumber'),
		tinNumber: govIdSchema('tinNumber'),
		reportsToId: z.string().optional()
	})
	.strict()

const offboardSchema = z.object({
	endDate: z.coerce.date()
})

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	try {
		requireAnyCapability(locals.user.roles, 'VIEW_TEAM')
	} catch {
		return apiError(403, 'Insufficient permissions')
	}

	try {
		const employee = await getEmployee(params.id, locals.user.organizationId, {
			viewerRoles: locals.user.roles
		})

		// Object-level access control (#228): a MANAGER is scoped to their own team and the branches
		// they manage; HR/CEO/Super-Admin are unrestricted. This was gated on `!can(role,'MANAGE_HR')`,
		// which is never true — MANAGER holds MANAGE_HR — so the check never ran.
		if (!(await canTouchEmployee(locals.user, params.id))) {
			return apiError(403, 'You can only view your own team members.')
		}
		return json({ data: employee })
	} catch (e: unknown) {
		const err = e as { status?: number; body?: { message?: string } }
		if (err?.status === 404) return apiError(404, 'Employee not found')
		throw e
	}
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	try {
		requireAnyCapability(locals.user.roles, 'MANAGE_HR')
	} catch {
		return apiError(403, 'Insufficient permissions')
	}

	// #228: same object-level scoping as the 201 page — a MANAGER may only write to their own team
	// or a branch they manage. Before any parsing, so a rejected caller learns nothing.
	if (!(await canTouchEmployee(locals.user, params.id))) {
		return apiError(403, 'You can only edit your own team members.')
	}

	const body = await request.json()
	const parsed = updateSchema.safeParse(body)

	if (!parsed.success) {
		// #24: field detail alongside the message, matching the applicants route — 'Invalid request
		// body' alone does not tell an API caller which field was wrong or what shape it wanted.
		return apiError(400, 'Invalid request body', parsed.error.flatten())
	}

	// #170/#222: pay and employment type must never be written straight onto the Employee row — both
	// are effective-dated, so a bare Employee write would desync the history the payroll run reads.
	// Split them out: everything else still goes through updateEmployee, while pay and type go to
	// promoteEmployee, which records both as effective-today snapshots in ONE transaction. It has to
	// be one call rather than two writers: the rate-basis pairing (#189) can only be validated on the
	// resulting state, and a PART_TIME/HOURLY → REGULAR/MONTHLY change is invalid at every
	// intermediate step. Resending the same values is a no-op, not an error.
	//
	// #263 puts `reportsToId` in the same split, for an authorization reason rather than a history
	// one: promoteEmployee is the writer that routes a change through propose→confirm (#224 Part 2 /
	// #243), and it is the only reporting-line path the UI has. Left in `rest` it reached
	// updateEmployee, which has no proposal call at all — so a MANAGER re-pointed a reporting line
	// unilaterally through the API while the same edit in the UI needed a second person. It must be
	// destructured OUT, not merely added to the call below: written by both writers, the column would
	// land immediately while the proposal it just filed is still pending.
	const { basicMonthlySalary, rateType, employmentType, employmentStatus, reportsToId, ...rest } =
		parsed.data

	// #263: employment status is not a plain column. `offboardEmployee` sets it together with
	// `endDate` AND `User.isActive = false` — the flag `isSessionBlocked` reads (access-guard.ts) —
	// so writing the column alone leaves an OFFBOARDED employee holding a live session, and writing
	// it back to ACTIVE leaves a reactivated one locked out. ON_LEAVE has no writer anywhere and
	// silently drops the employee from every `employmentStatus: 'ACTIVE'` payroll and attendance
	// query. Rejected loudly rather than dropped from `updateSchema`: zod strips unknown keys, so a
	// removal would make this a silent 200 that discards the field.
	if (employmentStatus !== undefined) {
		return apiError(
			400,
			'Employment status is not editable here — offboarding goes through POST ?action=offboard, which also records the end date and deactivates the login.'
		)
	}

	const ctx = {
		organizationId: locals.user.organizationId,
		actorId: locals.user.id,
		actorRoles: locals.user.roles
	}

	try {
		// The two writers below are separate transactions, so a pairing that promoteEmployee will
		// reject must be caught BEFORE updateEmployee commits the unrelated fields — otherwise a
		// rejected PATCH still half-applies. Cheap pre-check against the resulting state; the writer
		// re-validates authoritatively.
		if (employmentType !== undefined || rateType !== undefined) {
			const current = await getEmployee(params.id, locals.user.organizationId)
			if (
				!isRateBasisAllowed(rateType ?? current.rateType, employmentType ?? current.employmentType)
			) {
				return apiError(400, RATE_BASIS_MISMATCH)
			}
		}
		// #224 Part 2 / #243 / #263: set when the change was filed for confirmation instead of applied.
		//
		// Runs BEFORE updateEmployee for the same reason as the pairing pre-check above, which the
		// pre-check alone no longer covers: promoteEmployee can now refuse for reasons that have
		// nothing to do with the values (a 409 when no one in the org could confirm the proposal).
		// Committing `rest` first would leave those rejections half-applied. Neither writer reads the
		// other's fields, so the order is free.
		//
		// ONE call, never one per field: a PATCH carrying pay AND a reporting line is one career event
		// and must file ONE proposal, or the two halves become independently confirmable.
		let proposalId: string | undefined
		if (
			basicMonthlySalary !== undefined ||
			rateType !== undefined ||
			employmentType !== undefined ||
			reportsToId !== undefined
		) {
			try {
				;({ proposalId } = await promoteEmployee(
					params.id,
					locals.user.organizationId,
					{ basicMonthlySalary, rateType, employmentType, reportsToId, effectiveDate: new Date() },
					ctx
				))
			} catch (e: unknown) {
				// A PATCH resending the current salary/pay type/employment type/reporting line is a no-op,
				// not a failure — swallow only the writer's "no change" 400 and let the (unchanged) record be
				// returned. Any other 400 (an invalid rate/type pairing, a manager outside the org, a
				// self-report) still propagates to the client below.
				const err = e as { status?: number; body?: { message?: string } }
				if (!(err?.status === NO_CHANGE_STATUS && err.body?.message === NO_CHANGE_MESSAGE)) {
					throw e
				}
			}
		}
		if (Object.keys(rest).length > 0) {
			await updateEmployee(params.id, locals.user.organizationId, rest, ctx)
		}
		// #111: re-fetch masked so the response reflects the new salary, never the pre-change record.
		const employee = await getEmployee(params.id, locals.user.organizationId, {
			viewerRoles: locals.user.roles
		})
		// 202, not 200: the pay and/or reporting-line change is on file awaiting a second authorized
		// person, so `data` does NOT yet reflect it. Returning 200 would tell the caller their raise or
		// their re-org landed when it has not. Any other fields in the same PATCH did apply — they are
		// not routed through proposals.
		if (proposalId) {
			return json({ data: employee, proposalId, notice: AWAITING_CONFIRMATION }, { status: 202 })
		}
		return json({ data: employee })
	} catch (e: unknown) {
		const err = e as { status?: number; body?: { message?: string } }
		if (err?.status === 404) return apiError(404, 'Employee not found')
		if (err?.status === 400) return apiError(400, err.body?.message ?? 'Bad request')
		// createProposal refuses up front when nobody else in the org could ever confirm it.
		if (err?.status === 409) return apiError(409, err.body?.message ?? 'Conflict')
		throw e
	}
}

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const action = url.searchParams.get('action')

	if (action === 'offboard') {
		try {
			requireAnyCapability(locals.user.roles, 'MANAGE_HR')
		} catch {
			return apiError(403, 'Insufficient permissions')
		}
		// #228: offboarding is the most destructive write here — scope it like the rest.
		if (!(await canTouchEmployee(locals.user, params.id))) {
			return apiError(403, 'You can only offboard your own team members.')
		}

		const body = await request.json()
		const parsed = offboardSchema.safeParse(body)

		if (!parsed.success) {
			return apiError(400, 'Invalid request body: endDate is required')
		}

		try {
			const result = await offboardEmployee(
				params.id,
				locals.user.organizationId,
				parsed.data.endDate,
				{
					organizationId: locals.user.organizationId,
					actorId: locals.user.id,
					actorRoles: locals.user.roles
				}
			)
			return json({ data: result })
		} catch (e: unknown) {
			const err = e as { status?: number; body?: { message?: string } }
			if (err?.status === 404) return apiError(404, 'Employee not found')
			if (err?.status === 400) return apiError(400, err.body?.message ?? 'Bad request')
			throw e
		}
	}

	return apiError(400, 'Unknown action')
}

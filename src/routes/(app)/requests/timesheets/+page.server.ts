import { fail, isHttpError, redirect } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { canAny } from '$lib/server/rbac'
import { reviewTimesheet } from '$lib/server/services/timesheets'
import { canActOnStage, liveChain, timesheetSoD } from '$lib/server/services/approvals'
import type { Role } from '@prisma/client'
import type { Actions, PageServerLoad, RequestEvent } from './$types'

// A timesheet's maker-checker chain (#134) can be actioned by makers (MANAGE_HR),
// verifiers, or approvers — whoever holds the current stage's capability.
function canReviewTimesheets(roles: Role[]) {
	return (
		canAny(roles, 'MANAGE_HR') ||
		canAny(roles, 'VERIFY_REQUESTS') ||
		canAny(roles, 'APPROVE_SIGNOFF')
	)
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	const roles = user.roles
	if (!canReviewTimesheets(roles)) redirect(303, '/requests')

	// #6: scoped to the ACTIVE org, so a cross-org account no longer resolves its home-tenant
	// profile here.
	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})

	// All SUBMITTED timesheets in the org (never one's own — #75); filtered below to the
	// ones whose live stage this user can act on.
	const submitted = await db.timesheet.findMany({
		where: {
			status: 'SUBMITTED',
			// #6: after the org scoping above this self-exclusion drops for a cross-org actor, and
			// that is safe. Dropping a NEGATIVE self-exclusion re-admits exactly one person's rows —
			// the actor's own — which the independent org filter on the next line has already
			// excluded. Dropping a POSITIVE restriction is what widens a query; this is not that.
			...(myEmployee ? { employeeId: { not: myEmployee.id } } : {}),
			employee: { organizationId: user.organizationId }
		},
		include: {
			employee: { select: { id: true, firstName: true, lastName: true } },
			entries: { orderBy: { date: 'asc' } },
			approvalSteps: true
		},
		orderBy: { submittedAt: 'asc' }
	})

	const pendingTimesheets = submitted
		.filter((ts) => {
			const live = liveChain(ts.approvalSteps)
			// Legacy step-less timesheets keep the old manager-ladder direct review.
			if (!live || !live.currentStep) return canAny(roles, 'VIEW_TEAM')
			return canActOnStage(
				live.currentStep.stage,
				roles,
				myEmployee?.id ?? null,
				ts.employeeId,
				timesheetSoD(user.id, ts.approvalSteps, live.attempt)
			)
		})
		.map(({ approvalSteps, ...ts }) => ({
			...ts,
			currentStage: liveChain(approvalSteps)?.currentStep?.stage ?? null
		}))

	return { pendingTimesheets }
}

function ctxOf(event: RequestEvent) {
	const u = event.locals.user!
	return {
		organizationId: u.organizationId,
		actorId: u.id,
		actorRoles: u.roles,
		ipAddress: event.getClientAddress()
	}
}

export const actions: Actions = {
	// Single approve/reject from the review modal (matches the modal's ?/review contract).
	review: async (event) => {
		const user = event.locals.user!
		const roles = user.roles
		if (!canReviewTimesheets(roles)) return fail(403, { error: 'Insufficient permissions' })

		const data = await event.request.formData()
		const id = data.get('id') as string
		const approved = data.get('approved') === 'true'
		const rejectionReason = ((data.get('rejectionReason') as string) ?? '').trim()
		if (!id) return fail(400, { error: 'Missing timesheet id' })
		if (!approved && !rejectionReason)
			return fail(400, { error: 'A reason is required to reject.' })

		try {
			await reviewTimesheet(
				id,
				user.organizationId,
				approved,
				approved ? undefined : rejectionReason,
				ctxOf(event)
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}

		// The page already renders `form?.saved`; the action just never populated it.
		return { action: 'review', saved: approved ? 'Timesheet approved.' : 'Timesheet rejected.' }
	},

	// Bulk approve each selected (submitted) timesheet; non-submitted ones are skipped.
	approveMany: async (event) => {
		const user = event.locals.user!
		const roles = user.roles
		if (!canReviewTimesheets(roles)) return fail(403, { error: 'Insufficient permissions' })

		const ids = String((await event.request.formData()).get('ids') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
		if (!ids.length) return fail(400, { error: 'No timesheets selected' })

		const ctx = ctxOf(event)
		let done = 0
		let skipped = 0
		for (const id of ids) {
			try {
				await reviewTimesheet(id, user.organizationId, true, undefined, ctx)
				done++
			} catch {
				skipped++
			}
		}
		return {
			saved: `Approved ${done} timesheet${done === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}.`
		}
	},

	// Bulk reject each selected (submitted) timesheet with one shared reason; non-submitted ones
	// throw and are counted as skipped rather than aborting the batch.
	rejectMany: async (event) => {
		const user = event.locals.user!
		const roles = user.roles
		if (!canReviewTimesheets(roles)) return fail(403, { error: 'Insufficient permissions' })

		const data = await event.request.formData()
		const ids = String(data.get('ids') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
		const reason = ((data.get('rejectionReason') as string) ?? '').trim()
		if (!ids.length) return fail(400, { error: 'No timesheets selected' })
		if (reason === '') return fail(400, { error: 'A reason is required to reject.' })

		const ctx = ctxOf(event)
		let done = 0
		let skipped = 0
		for (const id of ids) {
			try {
				await reviewTimesheet(id, user.organizationId, false, reason, ctx)
				done++
			} catch {
				skipped++
			}
		}
		return {
			saved: `Rejected ${done} timesheet${done === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}.`
		}
	}
}

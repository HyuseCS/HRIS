import { error } from '@sveltejs/kit'
import type { ComplaintCategory, ComplaintStatus } from '@prisma/client'
import { db } from '$lib/server/db'
import { canAny } from '$lib/rbac'
import { writeAuditLog } from '$lib/server/audit'
import { notify } from '$lib/server/services/notifications'
import {
	assertCanTouchEmployee,
	listVisibleEmployeeIds,
	type EmployeeAccessActor
} from '$lib/server/services/employee-access'
import type { AuditContext } from '$lib/server/services/types'

// HR complaints / inquiries (#112): a two-way thread HR opens against an employee. HR opens
// it (seeding the first message), the employee responds, HR may reply again, and HR resolves
// it. Status pings between OPEN (awaiting the employee) and RESPONDED (awaiting HR) with each
// reply, and lands on RESOLVED when HR closes it. Org scoping is by HrComplaint.organizationId,
// which is stamped at open time and never trusted from client input.

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
	'CLASSIFICATION',
	'ATTENDANCE',
	'CONDUCT',
	'PERFORMANCE',
	'OTHER'
]

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
	CLASSIFICATION: 'Employment classification',
	ATTENDANCE: 'Attendance',
	CONDUCT: 'Conduct',
	PERFORMANCE: 'Performance',
	OTHER: 'Other'
}

export interface OpenComplaintInput {
	employeeId: string
	subject: string
	category: ComplaintCategory
	message: string
}

interface ComplaintFilters {
	status?: ComplaintStatus
	employeeId?: string
	/** The actor's visible-employee allow-list. `null` from `listVisibleEmployeeIds` means
	 * unrestricted, so the caller simply omits the field. */
	employeeIds?: string[]
}

/**
 * Object-level admission for one inquiry thread (#112, #228).
 *
 * Two arms on purpose. A `MANAGE_HR` holder goes through the shared employee-scope rule, which
 * keeps a MANAGER pinned to their own team or branch while `ADMINISTER_HR_ORGWIDE` holders
 * short-circuit to org-wide reach inside `canTouchEmployee`. Everyone else must BE the subject.
 *
 * Collapsing the two arms into `assertCanTouchEmployee` alone would WIDEN access, not simplify it:
 * `canTouchEmployee` admits an actor's reports regardless of role, so a plain EMPLOYEE who happens
 * to be someone's `reportsToId` would reach their report's thread. `rbac.ts:29-36` says the same
 * thing from the other side — never use `MANAGE_HR` to decide "may reach any employee record".
 *
 * Lives in the service, not the route: `getComplaint` is called from two places in the `[id]`
 * route, and `resolveComplaint` never loads the row in the route at all.
 */
export async function assertCanReachComplaint(
	ctx: AuditContext,
	complaintEmployeeId: string,
	actorEmployeeId: string | null
): Promise<void> {
	if (canAny(ctx.actorRoles, 'MANAGE_HR')) {
		await assertCanTouchEmployee(
			{ id: ctx.actorId, roles: ctx.actorRoles, organizationId: ctx.organizationId },
			complaintEmployeeId
		)
		return
	}
	if (actorEmployeeId !== complaintEmployeeId) error(403, 'You do not have access to this inquiry.')
}

// HR opens an inquiry against an employee, seeding the thread with the first message.
export async function openComplaint(input: OpenComplaintInput, ctx: AuditContext) {
	const employee = await db.employee.findFirst({
		where: { id: input.employeeId, organizationId: ctx.organizationId },
		select: { id: true, user: { select: { id: true } } }
	})
	if (!employee) error(404, 'Employee not found')
	// Order matters: the org 404 first, so an out-of-org id stays 404 rather than leaking
	// existence as a 403. `null` for the actor's own employee id — opening is HR-only, so the
	// subject arm must never admit here.
	await assertCanReachComplaint(ctx, employee.id, null)

	// One transaction: a failed audit write must not leave a new inquiry standing unrecorded.
	const complaint = await db.$transaction(async (tx) => {
		const created = await tx.hrComplaint.create({
			data: {
				organizationId: ctx.organizationId,
				employeeId: employee.id,
				openedById: ctx.actorId,
				subject: input.subject,
				category: input.category,
				status: 'OPEN',
				messages: { create: { authorId: ctx.actorId, body: input.message } }
			}
		})

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'HrComplaint',
				entityId: created.id,
				newValue: { subject: input.subject, category: input.category }
			},
			tx
		)

		return created
	})

	await notify(
		employee.user.id,
		`HR opened an inquiry: ${input.subject}`,
		`/complaints/${complaint.id}`
	)
	return complaint
}

// Append a message to the thread. `actorEmployeeId` is the acting user's own employee id (or
// null) — when it matches the subject the reply is from the employee (→ RESPONDED, notify the
// opener); otherwise it is an HR reply (→ OPEN, notify the employee).
export async function postComplaintMessage(
	complaintId: string,
	body: string,
	ctx: AuditContext,
	actorEmployeeId: string | null
) {
	const complaint = await db.hrComplaint.findFirst({
		where: { id: complaintId, organizationId: ctx.organizationId },
		include: {
			employee: {
				select: { id: true, firstName: true, lastName: true, user: { select: { id: true } } }
			},
			openedBy: { select: { id: true } }
		}
	})
	if (!complaint) error(404, 'Inquiry not found')
	if (complaint.status === 'RESOLVED')
		error(400, 'This inquiry is resolved and can no longer be replied to.')
	await assertCanReachComplaint(ctx, complaint.employeeId, actorEmployeeId)

	const fromEmployee = actorEmployeeId != null && actorEmployeeId === complaint.employeeId
	const status: ComplaintStatus = fromEmployee ? 'RESPONDED' : 'OPEN'

	// One transaction: a failed audit write must not leave a reply standing unrecorded.
	await db.$transaction(async (tx) => {
		await tx.hrComplaintMessage.create({ data: { complaintId, authorId: ctx.actorId, body } })
		await tx.hrComplaint.update({ where: { id: complaintId }, data: { status } })

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'HrComplaint',
				entityId: complaintId,
				newValue: { reply: fromEmployee ? 'employee' : 'hr', status }
			},
			tx
		)
	})

	if (fromEmployee) {
		await notify(
			complaint.openedBy.id,
			`${complaint.employee.firstName} ${complaint.employee.lastName} responded to: ${complaint.subject}`,
			`/complaints/${complaintId}`
		)
	} else {
		await notify(
			complaint.employee.user.id,
			`HR replied to inquiry: ${complaint.subject}`,
			`/complaints/${complaintId}`
		)
	}
	return { status }
}

// HR closes the thread.
export async function resolveComplaint(complaintId: string, ctx: AuditContext) {
	const complaint = await db.hrComplaint.findFirst({
		where: { id: complaintId, organizationId: ctx.organizationId },
		include: { employee: { select: { user: { select: { id: true } } } } }
	})
	if (!complaint) error(404, 'Inquiry not found')
	// Above the already-resolved early return: otherwise an out-of-scope actor re-resolving a
	// resolved thread gets a silent 200 that confirms the thread exists.
	await assertCanReachComplaint(ctx, complaint.employeeId, null)
	if (complaint.status === 'RESOLVED') return complaint

	// One transaction: a failed audit write must not leave a resolved inquiry standing
	// unrecorded.
	const updated = await db.$transaction(async (tx) => {
		const row = await tx.hrComplaint.update({
			where: { id: complaintId },
			data: { status: 'RESOLVED', resolvedAt: new Date() }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'HrComplaint',
				entityId: complaintId,
				oldValue: { status: complaint.status },
				newValue: { status: 'RESOLVED' }
			},
			tx
		)

		return row
	})

	await notify(
		complaint.employee.user.id,
		`Your HR inquiry was marked resolved: ${complaint.subject}`,
		`/complaints/${complaintId}`
	)
	return updated
}

// HR-side list (whole org, newest activity first).
export function listComplaintsForOrg(
	organizationId: string,
	filters: ComplaintFilters = {},
	page?: { skip: number; take: number }
) {
	return db.hrComplaint.findMany({
		where: complaintWhere(organizationId, filters),
		include: {
			employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
			_count: { select: { messages: true } }
		},
		orderBy: { updatedAt: 'desc' },
		...(page && { skip: page.skip, take: page.take })
	})
}

export function countComplaintsForOrg(organizationId: string, filters: ComplaintFilters = {}) {
	return db.hrComplaint.count({ where: complaintWhere(organizationId, filters) })
}

// Employee-side list (only the inquiries raised against them).
export function listComplaintsForEmployee(employeeId: string, organizationId: string) {
	return db.hrComplaint.findMany({
		where: { employeeId, organizationId },
		// employee is included (though the subject already knows who they are) to keep the row
		// shape identical to the HR list, so the shared table component needs no per-branch cast.
		include: {
			employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
			_count: { select: { messages: true } }
		},
		orderBy: { updatedAt: 'desc' }
	})
}

/**
 * How many inquiry threads are waiting on this actor — the sidebar badge count (#112).
 *
 * The status already says whose turn it is, so the badge needs no new state: RESPONDED means the
 * employee answered and HR owes the reply; OPEN means HR spoke last and the subject owes it. Both
 * arms are summed because one actor can be owed on both at once — a manager who is also the
 * subject of a thread. They can never double-count a single row: a row holds exactly one status,
 * and the two arms match on different statuses.
 *
 * Scoped through `listVisibleEmployeeIds`, the same helper the Inquiries list filters on, so the
 * count can never promise a thread the page then 403s. `null` is unrestricted; `[]` is truthy, so
 * the `in: []` predicate is still emitted and matches nothing — fail-closed, never `?.length &&`.
 * The subject arm runs for everyone, so a non-`MANAGE_HR` actor issues that count and nothing else.
 */
export async function countWaitingInquiries(actor: EmployeeAccessActor): Promise<number> {
	const self = await db.employee.findFirst({
		where: { userId: actor.id, organizationId: actor.organizationId },
		select: { id: true }
	})

	let total = 0
	if (canAny(actor.roles, 'MANAGE_HR')) {
		const visibleIds = await listVisibleEmployeeIds(actor)
		total += await db.hrComplaint.count({
			where: {
				organizationId: actor.organizationId,
				status: 'RESPONDED',
				...(visibleIds && { employeeId: { in: visibleIds } })
			}
		})
	}
	if (self) {
		total += await db.hrComplaint.count({
			where: { organizationId: actor.organizationId, status: 'OPEN', employeeId: self.id }
		})
	}
	return total
}

export async function getComplaint(id: string, ctx: AuditContext, actorEmployeeId: string | null) {
	const complaint = await db.hrComplaint.findFirst({
		where: { id, organizationId: ctx.organizationId },
		include: {
			employee: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					employeeNumber: true,
					user: { select: { id: true } }
				}
			},
			openedBy: { select: { id: true, email: true } },
			messages: {
				orderBy: { createdAt: 'asc' },
				include: { author: { select: { id: true, email: true } } }
			}
		}
	})
	if (!complaint) error(404, 'Inquiry not found')
	await assertCanReachComplaint(ctx, complaint.employeeId, actorEmployeeId)
	return complaint
}

function complaintWhere(organizationId: string, filters: ComplaintFilters) {
	return {
		organizationId,
		...(filters.status && { status: filters.status }),
		// `employeeId` NARROWS to one employee; `employeeIds` is a CEILING (the actor's whole
		// visible set). They must intersect, so the allow-list goes in a separate `AND` key —
		// writing both into `employeeId` would let the ceiling overwrite the narrower filter and
		// the query would return MORE rows than asked for. A scoping filter must never widen.
		...(filters.employeeId && { employeeId: filters.employeeId }),
		...(filters.employeeIds && { AND: [{ employeeId: { in: filters.employeeIds } }] })
	}
}

import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import { canAny } from '$lib/server/rbac'
import { writeAuditLog } from '$lib/server/audit'
import { notify } from './notifications'
import type { AuditContext } from './types'

// ─── Employee awards (#180) ───────────────────────────────────────────────────
// HR recognises an employee; the award announces on the dashboard feed and pings the
// recipient. Recent awards (last few weeks) surface in the feed.

const RECENT_AWARD_DAYS = 30

export async function grantAward(
	organizationId: string,
	input: { employeeId: string; title: string; note?: string },
	ctx: AuditContext
) {
	const title = input.title.trim()
	if (!title) error(400, 'An award title is required')
	const employee = await db.employee.findFirst({
		where: { id: input.employeeId, organizationId },
		select: {
			id: true,
			userId: true,
			firstName: true,
			lastName: true,
			user: { select: { roles: true } }
		}
	})
	if (!employee) error(404, 'Employee not found')

	// Recognition is only worth something if somebody else confers it (#308). The route gate is
	// MANAGE_HR, which MANAGER holds, so without this a manager could decorate themselves.
	if (employee.userId === ctx.actorId)
		error(403, 'You cannot award yourself — ask another admin to do it.')

	// And HR does not decorate HR: awarding anyone who themselves holds MANAGE_HR is reserved to
	// the executives. #282 deleted ROLE_HIERARCHY, so "higher rank" is expressed the only way this
	// codebase still has — a capability. ADMINISTER_SYSTEM is exactly {CEO, SUPER_ADMIN}.
	if (canAny(employee.user.roles, 'MANAGE_HR') && !canAny(ctx.actorRoles, 'ADMINISTER_SYSTEM'))
		error(403, 'Only an executive may award a manager or HR admin.')

	// One transaction: a failed audit write must not leave an award standing unrecorded.
	const award = await db.$transaction(async (tx) => {
		const created = await tx.award.create({
			data: {
				organizationId,
				employeeId: employee.id,
				title,
				note: input.note?.trim() || null,
				awardedById: ctx.actorId
			}
		})

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'Award',
				entityId: created.id,
				newValue: { employeeId: employee.id, title }
			},
			tx
		)
		return created
	})

	await notify(
		employee.userId,
		`You received an award: ${title}. Congratulations!`,
		'/dashboard',
		'AWARD'
	)
	return award
}

// Recent awards for the dashboard feed, newest first, with the recipient's name resolved.
export async function listRecentAwards(organizationId: string, asOf: Date = new Date()) {
	const since = new Date(asOf)
	since.setUTCDate(since.getUTCDate() - RECENT_AWARD_DAYS)
	const awards = await db.award.findMany({
		where: { organizationId, createdAt: { gte: since } },
		orderBy: { createdAt: 'desc' },
		take: 5
	})
	if (!awards.length) return []

	const employees = await db.employee.findMany({
		where: { id: { in: awards.map((a) => a.employeeId) } },
		select: { id: true, firstName: true, lastName: true }
	})
	const nameById = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]))

	return awards.map((a) => ({
		id: a.id,
		title: a.title,
		note: a.note,
		employeeName: nameById.get(a.employeeId) ?? 'An employee',
		createdAt: a.createdAt
	}))
}

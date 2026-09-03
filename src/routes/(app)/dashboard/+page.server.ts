import { fail } from '@sveltejs/kit'
import { z } from 'zod'
import { db } from '$lib/server/db'
import { manilaDayKey } from '$lib/utils/dates'
import { canAny, requireAnyCapability } from '$lib/server/rbac'
import { listRecentAnnouncements, createAnnouncement } from '$lib/server/services/announcements'
import { countPendingApprovals } from '$lib/server/services/approvals'
import { listRecent } from '$lib/server/services/notifications'
import { grantAward, listRecentAwards } from '$lib/server/services/awards'
import {
	listUpcomingRegularizations,
	listTodaysBirthdays,
	listUpcomingEvents,
	getMyStatus
} from '$lib/server/services/dashboard'
import { listPostingsAwaitingApprover, decideJobPosting } from '$lib/server/services/recruitment'
import { isHttpError } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	const orgId = user.organizationId
	const canPost = canAny(user.roles, 'MANAGE_HR')
	// The "Last Payroll" tile is payroll-report data, not general dashboard info (#132).
	const canViewPayroll = canAny(user.roles, 'VIEW_PAYROLL_REPORTS')
	// Since #165 employees don't create timesheets, so the quick action would only send them
	// to a 403. Same capability the /timesheets create action enforces.
	const canCreateTimesheet = canAny(user.roles, 'MANAGE_HR')

	// Today's PHT day, stored as the UTC-midnight date key used by AttendanceDay.
	const todayKey = manilaDayKey(new Date())
	const today = new Date(`${todayKey}T00:00:00Z`)

	const [headcount, onLeaveToday, pending, lastPayrollRun, attendanceGroups] = await Promise.all([
		db.employee.count({
			where: { organizationId: orgId, employmentStatus: 'ACTIVE' }
		}),
		// Employees on approved leave that spans today.
		db.request.count({
			where: {
				employee: { organizationId: orgId },
				type: 'LEAVE',
				status: 'APPROVED',
				dateFrom: { lte: today },
				dateTo: { gte: today }
			}
		}),
		// Items awaiting THIS user's decision — requests, timesheets, and payroll runs
		// (#134) — the same per-user, stage-aware count the sidebar badge uses, so the two
		// always agree. A payroll run pending sign-off now shows here (previously missing).
		countPendingApprovals({
			id: user.id,
			roles: user.roles,
			organizationId: orgId
		}),
		db.payrollRun.findFirst({
			where: { organizationId: orgId },
			orderBy: { createdAt: 'desc' },
			select: { periodStart: true, periodEnd: true, status: true, totalNet: true }
		}),
		// Today's derived attendance, grouped by status.
		db.attendanceDay.groupBy({
			by: ['status'],
			where: { date: today, employee: { organizationId: orgId } },
			_count: { _all: true }
		})
	])

	const attStatus = (s: string) => attendanceGroups.find((g) => g.status === s)?._count._all ?? 0
	const attendance = {
		present: attStatus('PRESENT'),
		late: attStatus('LATE'),
		absent: attStatus('ABSENT'),
		onLeave: attStatus('ON_LEAVE'),
		derived: attendanceGroups.reduce((s, g) => s + g._count._all, 0)
	}

	const [announcements, birthdays, myStatus, awards, upcomingEvents] = await Promise.all([
		listRecentAnnouncements(orgId, 5),
		// Today's birthday greeting, surfaced in the announcements feed (#167).
		listTodaysBirthdays(orgId),
		// The viewer's own standing for the status card (#167) — employment, leave left,
		// what's waiting on them, and their work setup. All their own data, so ungated.
		getMyStatus(user.id, orgId),
		// Recent employee awards, announced in the feed (#180).
		listRecentAwards(orgId),
		// Side panel. Employment matters (probation reviews, contract ends, other people's
		// leave) go only to the HR ladder; everyone still sees their own.
		listUpcomingEvents(orgId, { userId: user.id, canSeeSensitive: canPost })
	])

	// HR grants awards from the dashboard — roster for the recipient picker.
	const awardEmployees = canPost
		? await db.employee.findMany({
				where: { organizationId: orgId, employmentStatus: 'ACTIVE' },
				select: { id: true, firstName: true, lastName: true },
				orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
			})
		: []

	// HR's advance warning of probationary staff coming up for regularization (#168).
	const regularizations = canPost ? await listUpcomingRegularizations(orgId) : []

	// Job postings awaiting this user's approval (#195) — the departments they're the
	// approver for, plus HR-fallback postings. Needs the viewer's employee id.
	const roles = user.roles
	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: orgId },
		select: { id: true }
	})
	const postingsToApprove = await listPostingsAwaitingApprover(
		orgId,
		myEmployee?.id ?? null,
		roles,
		user.id
	)

	// Recent activity — payslip releases, request outcomes, etc. (#169) persisted after the
	// toast is gone.
	// 25, not 8: this panel is the ONLY way to recover a toast that was missed, and an unread
	// backlog longer than the list was unrecoverable.
	const recentActivity = await listRecent(user.id, 25)

	return {
		canPost,
		canViewPayroll,
		canCreateTimesheet,
		announcements,
		regularizations,
		birthdays,
		myStatus,
		awards,
		awardEmployees,
		postingsToApprove,
		recentActivity,
		upcomingEvents,
		metrics: {
			headcount,
			onLeaveToday,
			pendingApprovals: pending.total,
			pendingRequests: pending.requests,
			pendingTimesheets: pending.timesheets,
			pendingPayrollRuns: pending.payrollRuns,
			pendingProposals: pending.proposals,
			// Withhold payroll figures from clients that may not view them.
			lastPayrollRun: canViewPayroll ? lastPayrollRun : null,
			attendance
		}
	}
}

const announcementSchema = z.object({
	title: z.string().min(1, 'Title is required').max(150),
	body: z.string().min(1, 'Message is required').max(2000)
})

export const actions: Actions = {
	postAnnouncement: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const parsed = announcementSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success)
			return fail(422, {
				action: 'postAnnouncement',
				error: parsed.error.errors[0]?.message ?? 'Invalid input'
			})

		await createAnnouncement(user.organizationId, parsed.data, {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		})
		return { action: 'postAnnouncement', posted: true }
	},

	// Approve or send back a job posting from the approver's dashboard card (#195).
	decidePosting: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		const roles = user.roles
		const data = await request.formData()
		const id = data.get('id') as string
		const approve = data.get('action') === 'approve'
		const note = (data.get('note') as string) || undefined
		if (!id)
			return fail(400, {
				action: 'decidePosting',
				error: 'That job posting is no longer on screen. Reload the page and try again.'
			})

		const myEmployee = await db.employee.findFirst({
			where: { userId: user.id, organizationId: user.organizationId },
			select: { id: true }
		})
		try {
			await decideJobPosting(
				id,
				user.organizationId,
				{ approve, note },
				{ employeeId: myEmployee?.id ?? null, roles },
				{
					organizationId: user.organizationId,
					actorId: user.id,
					actorRoles: user.roles,
					ipAddress: getClientAddress()
				}
			)
		} catch (e) {
			if (isHttpError(e))
				return fail(e.status, { action: 'decidePosting', error: String(e.body.message) })
			throw e
		}
		// `postingDecided` was a dead flag — nothing rendered it. The named action is what lets the
		// error land under Postings instead of under "Give award".
		return {
			action: 'decidePosting',
			saved: approve ? 'Posting approved.' : 'Posting sent back to draft.'
		}
	},

	// HR grants an employee award, announced on the dashboard feed (#180).
	giveAward: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')
		const data = await request.formData()
		const employeeId = data.get('employeeId') as string
		const title = (data.get('title') as string) ?? ''
		const note = (data.get('note') as string) || undefined
		if (!employeeId || !title.trim())
			return fail(422, { action: 'giveAward', error: 'Pick an employee and a title.' })
		try {
			await grantAward(
				user.organizationId,
				{ employeeId, title, note },
				{
					organizationId: user.organizationId,
					actorId: user.id,
					actorRoles: user.roles,
					ipAddress: getClientAddress()
				}
			)
		} catch (e) {
			if (isHttpError(e))
				return fail(e.status, { action: 'giveAward', error: String(e.body.message) })
			throw e
		}
		return { action: 'giveAward', awarded: true }
	}
}

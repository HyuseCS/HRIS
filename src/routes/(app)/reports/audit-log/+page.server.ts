import { error, fail } from '@sveltejs/kit'
import { z } from 'zod'
import { canAny, requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { paginate } from '$lib/server/pagination'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')
	const isSuperAdmin = canAny(user.roles, 'ADMINISTER_SYSTEM')

	const actorId = url.searchParams.get('actor') ?? undefined
	const entityType = url.searchParams.get('entity') ?? undefined
	const action = url.searchParams.get('action') ?? undefined
	const startDate = url.searchParams.get('start')
		? new Date(url.searchParams.get('start')!)
		: undefined
	const endDate = url.searchParams.get('end') ? new Date(url.searchParams.get('end')!) : undefined

	const where = {
		organizationId: user.organizationId,
		...(actorId && { actorId }),
		...(entityType && { entityType }),
		...(action && { action: action as never }),
		...(startDate || endDate ? { createdAt: { gte: startDate, lte: endDate } } : {})
	}

	// #64: shared helper (audit log keeps its 50-row pages); count first so an
	// out-of-range ?page= clamps to the last page.
	const total = await db.auditLog.count({ where })
	const pagination = paginate(url, total, { pageSize: 50 })

	const [logs, actors] = await Promise.all([
		db.auditLog.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			skip: pagination.skip,
			take: pagination.take,
			// An explicit select, not `include`: `include` returns every scalar, and the rows are
			// spread wholesale below, so `ipAddress`, `userAgent` and `actorId` would
			// ship to the client. The same bare-`include` shape was the dashboard leak this issue
			// fixed (#242) — the type annotation on the map below hides it, it does not prevent it.
			select: {
				id: true,
				action: true,
				entityType: true,
				entityId: true,
				oldValue: true,
				newValue: true,
				createdAt: true,
				// The actor's role set AS RECORDED AT THE TIME (#282). The `actor` relation would
				// show today's roles on a year-old entry.
				actorRoles: true,
				actor: { select: { email: true } }
			}
		}),
		db.user.findMany({
			where: { organizationId: user.organizationId },
			select: { id: true, email: true }
		})
	])

	// #242: the payload is masked for everyone, ADMINISTER_SYSTEM included. Reaching it is an
	// audited event — the `reveal` action below. `hasChanges` is all the page needs to know
	// whether an entry has anything to reveal.
	const sanitizedLogs = logs.map(
		(log: {
			id: string
			action: string
			entityType: string
			entityId: string
			oldValue: unknown
			newValue: unknown
			createdAt: Date
			actorRoles: string[]
			actor: { email: string }
		}) => ({
			...log,
			oldValue: null,
			newValue: null,
			hasChanges: log.oldValue !== null || log.newValue !== null
		})
	)

	return {
		logs: sanitizedLogs,
		// Cosmetic (Constitution P2) — the action re-checks. This only keeps a caller who cannot
		// reveal from being shown a button that will 403.
		canReveal: isSuperAdmin,
		actors,
		pagination,
		// Hand-maintained — extend it whenever a new entityType starts being audited, or that
		// entity's rows cannot be filtered for at all. `PayrollPeriod` was missing until #298.
		entityTypes: [
			'Employee',
			'Timesheet',
			'Request',
			'LeaveRequest',
			'PayrollRun',
			'PayrollPeriod',
			'JobPosting',
			'Applicant',
			'Department',
			'HrComplaint'
		]
	}
}

const revealSchema = z.object({ id: z.string().min(1) })

export const actions: Actions = {
	/**
	 * One entry's `oldValue` / `newValue`, in exchange for an audit record (#242) — the same
	 * bargain `revealEmployeeSensitive` strikes for the 201 file. No `audit: false` escape
	 * hatch: that option exists there for one internal caller, and reproducing it here would
	 * reopen the untraceable read this closes. No self-reveal exemption either — an audit row
	 * is about an actor, not an employee, so "my own record" has no meaning for it.
	 */
	reveal: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		// Both gates live here, not in `load`: SvelteKit does not run a page's load for a form
		// action, so an action without its own check is reachable by anyone who can POST.
		requireAnyCapability(user.roles, 'MANAGE_HR')
		requireAnyCapability(user.roles, 'ADMINISTER_SYSTEM')

		const parsed = revealSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success)
			return fail(400, { action: 'reveal', error: 'Select an audit log entry to reveal.' })

		// The organization filter belongs in the `where`. Fetching by id and comparing the org
		// afterwards is a cross-tenant read that merely declines to print what it found.
		const entry = await db.auditLog.findFirst({
			where: { id: parsed.data.id, organizationId: user.organizationId },
			select: { id: true, oldValue: true, newValue: true }
		})
		if (!entry) error(404, 'Audit log entry not found')

		// Written before the payload is returned, so a failed write means no reveal — a reveal
		// that outlived its record is exactly the defect this fixes.
		// #5: deliberately NOT transactional — `db`, not a `tx`. This audits a READ; that ordering
		// is the whole guarantee, and there is no mutation to roll back with.
		await writeAuditLog(
			{
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress(),
				userAgent: request.headers.get('user-agent') ?? undefined
			},
			{ action: 'VIEW', entityType: 'AuditLog', entityId: entry.id },
			db
		)

		return { revealed: entry }
	}
}

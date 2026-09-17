import type { Prisma } from '@prisma/client'
import { requireAnyCapability, canAny } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { isFoodServiceOrg } from '$lib/orgs'
import { listReportIdsFor } from '$lib/server/services/supervisors'
import { paginate } from '$lib/server/pagination'
import { autoDeriveFromPunches } from '$lib/server/services/attendance'
import { manilaDayKey } from '$lib/utils/dates'
import { parseView, type Person } from '$lib/components/people/people'
import type { PageServerLoad } from './$types'

const SEARCH_MAX = 100

export const load: PageServerLoad = async ({ locals, url, getClientAddress }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'VIEW_TEAM')

	const isAdmin = canAny(user.roles, 'ADMINISTER_HR_RECORDS')
	// Food-service tenants label this roster "Branches" (#182), so the heading follows suit.
	const isFoodService = isFoodServiceOrg(user.organizationId)
	const search = (url.searchParams.get('search') ?? '').trim().slice(0, SEARCH_MAX)
	const { view, pageSize } = parseView(url.searchParams.get('view'))

	// Get team members. A manager's team is everyone who reports to them as primary OR
	// additional supervisor (#176); HR/Super Admin see the whole org.
	const where: Prisma.EmployeeWhereInput = {
		organizationId: user.organizationId,
		user: { isActive: true },
		employmentStatus: { not: 'OFFBOARDED' }
	}
	// #6: an absent `id` here means "no filter", which returns the whole org. A non-admin with no employee
	// row in the ACTIVE org has no reports, so the answer is the empty list — never the
	// unfiltered one. Same `[]`-not-`undefined` discipline as leave/+page.server.ts:38.
	if (!isAdmin) {
		const myEmployee = await db.employee.findFirst({
			where: { userId: user.id, organizationId: user.organizationId },
			select: { id: true }
		})
		where.id = { in: myEmployee ? await listReportIdsFor(myEmployee.id) : [] }
	}
	if (search) {
		where.OR = (['firstName', 'lastName', 'employeeNumber', 'jobTitle'] as const).map((field) => ({
			[field]: { contains: search, mode: 'insensitive' }
		}))
	}

	const today = view === 'grid' ? new Date(manilaDayKey(new Date())) : null
	if (today) {
		await autoDeriveFromPunches(
			user.organizationId,
			{ from: today, to: today },
			{
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			}
		)
	}

	const total = await db.employee.count({ where })
	const pagination = paginate(url, total, { pageSize })
	const rows = await db.employee.findMany({
		where,
		select: {
			id: true,
			firstName: true,
			lastName: true,
			jobTitle: true,
			employeeNumber: true,
			companyEmail: true,
			employmentStatus: true,
			department: { select: { name: true } },
			branch: isFoodService ? { select: { name: true } } : false,
			attendanceDays: today ? { where: { date: today }, select: { status: true }, take: 1 } : false
		},
		orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
		skip: pagination.skip,
		take: pagination.take
	})

	const people: Person[] = rows.map(({ department, branch, attendanceDays, ...rest }) => ({
		...rest,
		unit: isFoodService ? (branch?.name ?? null) : department.name,
		...(today && { todayStatus: attendanceDays?.[0]?.status ?? null })
	}))

	return { people, pagination, search, view, isAdmin, isFoodService }
}

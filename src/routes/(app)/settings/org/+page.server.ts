import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	listPositions,
	createPosition,
	updatePosition,
	getOrgChart,
	listAssignableEmployees,
	assignEmployeePosition
} from '$lib/server/services/settings/org'
import { listSalaryGrades } from '$lib/server/services/settings/master'
import { paginate } from '$lib/server/pagination'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const [positions, orgChart, salaryGrades, allEmployees] = await Promise.all([
		listPositions(user.organizationId),
		getOrgChart(user.organizationId),
		listSalaryGrades(user.organizationId),
		listAssignableEmployees(user.organizationId)
	])

	const empSearch = (url.searchParams.get('empSearch') ?? '').trim()
	const empUnassigned = url.searchParams.get('empUnassigned') === '1'
	const needle = empSearch.toLowerCase()
	const filtered = allEmployees.filter(
		(e) =>
			(!empUnassigned || !e.positionId) &&
			(needle === '' ||
				e.name.toLowerCase().includes(needle) ||
				e.jobTitle.toLowerCase().includes(needle))
	)

	// Sliced here, not in the query: `listAssignableEmployees` is a shared service and giving it
	// skip/take is out of this phase's bounds. This caps what the page RENDERS, not what the
	// load fetches — the query cost is tracked as a backlog item.
	const employeePagination = paginate(url, filtered.length, { param: 'empPage', pageSize: 20 })

	return {
		positions,
		orgChart,
		salaryGrades,
		employees: filtered.slice(
			employeePagination.skip,
			employeePagination.skip + employeePagination.take
		),
		employeeTotal: allEmployees.length,
		employeePagination,
		empSearch,
		empUnassigned
	}
}

const positionSchema = z.object({
	title: z.string().min(1, 'Title is required'),
	level: z.coerce.number().int().optional(),
	departmentId: z.string().optional()
})

const editSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1, 'Title is required'),
	level: z.coerce.number().int().optional(),
	departmentId: z.string().optional(),
	salaryGradeId: z.string().optional(),
	isActive: z.enum(['true', 'false']).optional()
})

const assignSchema = z.object({
	employeeId: z.string().min(1),
	positionId: z.string().optional()
})

function ctxFrom(user: App.Locals['user'], ip: string) {
	return {
		organizationId: user!.organizationId,
		actorId: user!.id,
		actorRoles: user!.roles,
		ipAddress: ip
	}
}

export const actions: Actions = {
	createPosition: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const raw = Object.fromEntries(await request.formData())
		const parsed = positionSchema.safeParse(raw)

		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input. Please check the form fields.',
				fieldErrors: parsed.error.flatten().fieldErrors
			})
		}

		try {
			await createPosition(
				user.organizationId,
				{
					title: parsed.data.title,
					level: parsed.data.level,
					departmentId: parsed.data.departmentId || undefined
				},
				ctxFrom(user, getClientAddress())
			)
		} catch (err) {
			if (isHttpError(err) && err.status === 409) return fail(409, { error: err.body.message })
			throw err
		}
	},

	updatePosition: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const raw = Object.fromEntries(await request.formData())
		const parsed = editSchema.safeParse(raw)

		if (!parsed.success) {
			return fail(400, {
				error: 'Invalid input. Please check the form fields.',
				fieldErrors: parsed.error.flatten().fieldErrors
			})
		}

		try {
			await updatePosition(
				parsed.data.id,
				user.organizationId,
				{
					title: parsed.data.title,
					level: parsed.data.level,
					departmentId: parsed.data.departmentId || undefined,
					salaryGradeId: parsed.data.salaryGradeId || null,
					isActive: parsed.data.isActive === undefined ? undefined : parsed.data.isActive === 'true'
				},
				ctxFrom(user, getClientAddress())
			)
		} catch (err) {
			if (isHttpError(err) && err.status === 409) return fail(409, { error: err.body.message })
			throw err
		}
	},

	assignEmployee: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const raw = Object.fromEntries(await request.formData())
		const parsed = assignSchema.safeParse(raw)

		if (!parsed.success) {
			return fail(400, { error: 'Invalid input. Please check the form fields.' })
		}

		try {
			await assignEmployeePosition(
				parsed.data.employeeId,
				user.organizationId,
				parsed.data.positionId || null,
				ctxFrom(user, getClientAddress())
			)
		} catch (err) {
			if (isHttpError(err) && err.status === 404) return fail(404, { error: err.body.message })
			throw err
		}
	}
}

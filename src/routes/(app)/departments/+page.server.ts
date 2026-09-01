import { fail } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { canAny } from '$lib/rbac'
import {
	listDepartments,
	createDepartment,
	updateDepartment,
	setDepartmentHead
} from '$lib/server/services/departments'
import { updateEmployee } from '$lib/server/services/employees'
import { db } from '$lib/server/db'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	// Same gate as the actions (the nav already hides this page from non-admins);
	// the load now returns the org's employee roster for the Members panel.
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
	const [departments, employees] = await Promise.all([
		listDepartments(locals.user!.organizationId),
		// For the per-department Members panel (#71): current members + assignable others.
		db.employee.findMany({
			where: { organizationId: locals.user!.organizationId, employmentStatus: 'ACTIVE' },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				employeeNumber: true,
				departmentId: true
			},
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		})
	])
	// #178: naming a department head is an org-wide structural setting, so it is gated on
	// ADMINISTER_HR_ORGWIDE — not the page's MANAGE_HR, which has included MANAGER since #133.
	return {
		departments,
		employees,
		canSetHead: canAny(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
	}
}

const nameSchema = z.object({
	name: z.string().min(1, 'Name is required')
})

const updateSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1, 'Name is required')
})

// An empty headEmployeeId clears the head — a department with no head is a valid state.
const headSchema = z.object({
	departmentId: z.string().min(1),
	headEmployeeId: z.string()
})

const assignSchema = z.object({
	employeeId: z.string().min(1),
	departmentId: z.string().min(1)
})

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!

		const raw = Object.fromEntries(await request.formData())
		const parsed = nameSchema.safeParse(raw)

		if (!parsed.success) {
			return fail(400, { error: parsed.error.errors[0]?.message ?? 'Invalid input' })
		}

		await createDepartment(user.organizationId, parsed.data.name, {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		})
	},

	update: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!

		const raw = Object.fromEntries(await request.formData())
		const parsed = updateSchema.safeParse(raw)

		if (!parsed.success) {
			return fail(400, { error: parsed.error.errors[0]?.message ?? 'Invalid input' })
		}

		await updateDepartment(parsed.data.id, user.organizationId, parsed.data.name, {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		})
	},

	// Transfer an existing employee into a department (#71). Goes through
	// updateEmployee so the change lands in the employment-history audit trail.
	assignEmployee: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!

		const parsed = assignSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { error: 'Select an employee to assign' })

		const department = await db.department.findFirst({
			where: { id: parsed.data.departmentId, organizationId: user.organizationId },
			select: { id: true }
		})
		if (!department) return fail(404, { error: 'Department not found' })

		await updateEmployee(
			parsed.data.employeeId,
			user.organizationId,
			{ departmentId: department.id },
			{
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			}
		)
	},

	// #178: name or clear the department head who attests the DEPARTMENT_HEAD signatory slot.
	setHead: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
		const user = locals.user!

		const parsed = headSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid input' })

		await setDepartmentHead(
			parsed.data.departmentId,
			user.organizationId,
			parsed.data.headEmployeeId || null,
			{
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			}
		)
	}
}

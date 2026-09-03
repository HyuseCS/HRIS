import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability, requireFoodServiceOrg } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import {
	listBranches,
	branchHeadcounts,
	createBranch,
	updateBranch,
	toggleBranchStatus,
	BRANCH_STATUSES,
	type BranchInput
} from '$lib/server/services/branches'
import type { Actions, PageServerLoad } from './$types'

/** Both guards, in this order, on the load and on every action. */
function guard(locals: App.Locals) {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
	requireFoodServiceOrg(locals.user!.organizationId)
}

export const load: PageServerLoad = async ({ locals, url }) => {
	guard(locals)
	const organizationId = locals.user!.organizationId

	const filter = {
		search: url.searchParams.get('search') ?? '',
		status: url.searchParams.get('status') ?? ''
	}

	const [branches, headcounts, employees] = await Promise.all([
		listBranches(organizationId, filter),
		branchHeadcounts(organizationId),
		db.employee.findMany({
			where: { organizationId, employmentStatus: 'ACTIVE' },
			select: { id: true, firstName: true, lastName: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		})
	])

	return {
		branches,
		// A Map isn't serializable across the load boundary — hand the page a plain record.
		headcount: Object.fromEntries(headcounts.byBranch),
		unassigned: headcounts.unassigned,
		employees,
		filter
	}
}

const branchSchema = z.object({
	name: z.string().min(1).max(120),
	address: z.string().max(300).optional(),
	contactPhone: z.string().max(40).optional(),
	status: z.enum(BRANCH_STATUSES),
	managerId: z.string().optional(),
	notes: z.string().max(2000).optional()
})

function inputOf(d: z.infer<typeof branchSchema>): BranchInput {
	return {
		name: d.name,
		address: d.address ?? null,
		contactPhone: d.contactPhone ?? null,
		status: d.status,
		managerId: d.managerId ?? null,
		notes: d.notes ?? null
	}
}

function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}

async function run(fn: () => Promise<unknown>) {
	try {
		await fn()
		return { success: true }
	} catch (e: unknown) {
		if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
		throw e
	}
}

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress }) => {
		guard(locals)
		const parsed = branchSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(422, { error: 'Check the branch fields and try again.' })
		return run(() =>
			createBranch(
				locals.user!.organizationId,
				inputOf(parsed.data),
				ctxOf(locals, getClientAddress())
			)
		)
	},

	update: async ({ request, locals, getClientAddress }) => {
		guard(locals)
		const data = Object.fromEntries(await request.formData())
		const id = data.id as string
		if (!id) return fail(400, { error: 'Missing id' })
		const parsed = branchSchema.safeParse(data)
		if (!parsed.success) return fail(422, { error: 'Check the branch fields and try again.' })
		return run(() =>
			updateBranch(
				locals.user!.organizationId,
				id,
				inputOf(parsed.data),
				ctxOf(locals, getClientAddress())
			)
		)
	},

	toggle: async ({ request, locals, getClientAddress }) => {
		guard(locals)
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing id' })
		return run(() =>
			toggleBranchStatus(locals.user!.organizationId, id, ctxOf(locals, getClientAddress()))
		)
	}
}

import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	listLeaveTypes,
	createLeaveType,
	updateLeaveType,
	toggleLeaveType,
	type LeaveTypeInput
} from '$lib/server/services/settings/master'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
	return { leaveTypes: await listLeaveTypes(locals.user!.organizationId) }
}

const leaveTypeSchema = z.object({
	name: z.string().min(1).max(60),
	// Checkboxes post "on" when ticked and are absent otherwise → coerce.boolean handles both.
	isPaid: z.coerce.boolean(),
	defaultDaysPerYear: z.coerce.number().min(0).max(365),
	allowCarryOver: z.coerce.boolean(),
	maxCarryOverDays: z.coerce.number().min(0).max(365).optional(),
	// Tenure gate (#137): 0 = available from day one. Capped at 10 years.
	minMonthsOfService: z.coerce.number().int().min(0).max(120).default(0)
})

function inputOf(d: z.infer<typeof leaveTypeSchema>): LeaveTypeInput {
	return {
		name: d.name,
		isPaid: d.isPaid,
		defaultDaysPerYear: d.defaultDaysPerYear,
		allowCarryOver: d.allowCarryOver,
		maxCarryOverDays: d.maxCarryOverDays ?? null,
		minMonthsOfService: d.minMonthsOfService
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
	add: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = leaveTypeSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(422, { error: 'Invalid leave type values' })
		return run(() =>
			createLeaveType(
				locals.user!.organizationId,
				inputOf(parsed.data),
				ctxOf(locals, getClientAddress())
			)
		)
	},

	update: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = Object.fromEntries(await request.formData())
		const id = data.id as string
		if (!id) return fail(400, { error: 'Missing id' })
		const parsed = leaveTypeSchema.safeParse(data)
		if (!parsed.success) return fail(422, { error: 'Invalid leave type values' })
		return run(() =>
			updateLeaveType(
				locals.user!.organizationId,
				id,
				inputOf(parsed.data),
				ctxOf(locals, getClientAddress())
			)
		)
	},

	toggle: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing id' })
		return run(() =>
			toggleLeaveType(locals.user!.organizationId, id, ctxOf(locals, getClientAddress()))
		)
	}
}

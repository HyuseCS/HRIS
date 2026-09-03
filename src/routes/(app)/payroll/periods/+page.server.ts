import { fail } from '@sveltejs/kit'
import { z } from 'zod'
import { canAny, requireAnyCapability, requirePayrollManage } from '$lib/server/rbac'
import {
	listPeriods,
	openPeriod,
	importAttendance,
	generate,
	lock,
	release,
	voidPeriod
} from '$lib/server/services/payroll/periods'
import type { Actions, PageServerLoad, RequestEvent } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	requirePayrollManage(locals.user!.roles)
	return {
		periods: await listPeriods(locals.user!.organizationId),
		canVoid: canAny(locals.user!.roles, 'OVERRIDE_FINALIZED')
	}
}

function ctxOf(event: RequestEvent) {
	const user = event.locals.user!
	return {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: event.getClientAddress()
	}
}

/** Map a thrown SvelteKit error from the service into a form `fail`. */
function toFail(e: unknown) {
	const err = e as { status?: number; body?: { message?: string } }
	if (err?.status && [400, 404, 409].includes(err.status)) {
		return fail(err.status, { error: err.body?.message ?? 'Action failed' })
	}
	throw e
}

const openSchema = z.object({
	name: z.string().min(1),
	start: z.coerce.date(),
	end: z.coerce.date(),
	cutoff: z.coerce.number().int().optional()
})

export const actions: Actions = {
	open: async (event) => {
		requirePayrollManage(event.locals.user!.roles)
		const parsed = openSchema.safeParse(Object.fromEntries(await event.request.formData()))
		if (!parsed.success) return fail(400, { error: 'Invalid period details' })
		try {
			await openPeriod(
				event.locals.user!.organizationId,
				{
					name: parsed.data.name,
					startDate: parsed.data.start,
					endDate: parsed.data.end,
					cutoff: parsed.data.cutoff
				},
				ctxOf(event)
			)
		} catch (e) {
			return toFail(e)
		}
	},

	import: async (event) => {
		requirePayrollManage(event.locals.user!.roles)
		const id = (await event.request.formData()).get('id') as string
		try {
			await importAttendance(id, event.locals.user!.organizationId, ctxOf(event))
		} catch (e) {
			return toFail(e)
		}
	},

	generate: async (event) => {
		requirePayrollManage(event.locals.user!.roles)
		const id = (await event.request.formData()).get('id') as string
		try {
			await generate(id, event.locals.user!.organizationId, ctxOf(event))
		} catch (e) {
			return toFail(e)
		}
	},

	lock: async (event) => {
		requirePayrollManage(event.locals.user!.roles)
		const data = await event.request.formData()
		const id = data.get('id') as string
		const overrideNote = ((data.get('overrideNote') as string) || '').trim() || undefined
		try {
			await lock(id, event.locals.user!.organizationId, ctxOf(event), overrideNote)
		} catch (e) {
			return toFail(e)
		}
	},

	release: async (event) => {
		requirePayrollManage(event.locals.user!.roles)
		const id = (await event.request.formData()).get('id') as string
		try {
			await release(id, event.locals.user!.organizationId, ctxOf(event))
		} catch (e) {
			return toFail(e)
		}
	},

	void: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'OVERRIDE_FINALIZED')
		const id = (await event.request.formData()).get('id') as string
		try {
			await voidPeriod(id, event.locals.user!.organizationId, ctxOf(event))
		} catch (e) {
			return toFail(e)
		}
	}
}

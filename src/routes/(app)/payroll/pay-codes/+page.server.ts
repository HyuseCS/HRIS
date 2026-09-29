import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	listPayCodes,
	createEarningType,
	createDeductionType,
	toggleEarningType,
	toggleDeductionType
} from '$lib/server/services/settings/master'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')
	return listPayCodes(user.organizationId)
}

const earningSchema = z.object({
	code: z.string().min(1).max(30),
	label: z.string().min(1).max(100),
	taxable: z
		.union([z.literal('on'), z.literal('true'), z.literal('')])
		.optional()
		.transform((v) => v === 'on' || v === 'true'),
	multiplier: z.coerce
		.number()
		.min(0)
		.max(10)
		.optional()
		.or(z.literal('').transform(() => undefined))
})

const deductionSchema = z.object({
	code: z.string().min(1).max(30),
	label: z.string().min(1).max(100),
	isStatutory: z
		.union([z.literal('on'), z.literal('true'), z.literal('')])
		.optional()
		.transform((v) => v === 'on' || v === 'true')
})

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
	addEarning: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = earningSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(422, { error: 'Invalid earning code' })
		const { code, label, taxable, multiplier } = parsed.data
		return run(() =>
			createEarningType(
				locals.user!.organizationId,
				{ code, label, taxable, multiplier: multiplier ?? null },
				ctxOf(locals, getClientAddress())
			)
		)
	},

	addDeduction: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = deductionSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(422, { error: 'Invalid deduction code' })
		const { code, label, isStatutory } = parsed.data
		return run(() =>
			createDeductionType(
				locals.user!.organizationId,
				{ code, label, isStatutory },
				ctxOf(locals, getClientAddress())
			)
		)
	},

	toggleEarning: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing id' })
		return run(() =>
			toggleEarningType(locals.user!.organizationId, id, ctxOf(locals, getClientAddress()))
		)
	},

	toggleDeduction: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing id' })
		return run(() =>
			toggleDeductionType(locals.user!.organizationId, id, ctxOf(locals, getClientAddress()))
		)
	}
}

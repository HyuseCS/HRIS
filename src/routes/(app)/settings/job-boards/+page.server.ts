import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	listJobBoards,
	ensureSeededBoards,
	createJobBoard,
	updateJobBoard,
	toggleJobBoard
} from '$lib/server/services/job-boards'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
	// Materialize the common boards on first visit so recruitment's checklist isn't empty.
	await ensureSeededBoards(locals.user!.organizationId)
	return { boards: await listJobBoards(locals.user!.organizationId) }
}

const boardSchema = z.object({ name: z.string().min(1).max(60) })

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
		const parsed = boardSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(422, { error: 'A board name is required (max 60 chars).' })
		return run(() =>
			createJobBoard(
				locals.user!.organizationId,
				parsed.data.name,
				ctxOf(locals, getClientAddress())
			)
		)
	},

	update: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = Object.fromEntries(await request.formData())
		const id = data.id as string
		if (!id) return fail(400, { error: 'Missing id' })
		const parsed = boardSchema.safeParse(data)
		if (!parsed.success) return fail(422, { error: 'A board name is required (max 60 chars).' })
		return run(() =>
			updateJobBoard(
				locals.user!.organizationId,
				id,
				parsed.data.name,
				ctxOf(locals, getClientAddress())
			)
		)
	},

	toggle: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing id' })
		return run(() =>
			toggleJobBoard(locals.user!.organizationId, id, ctxOf(locals, getClientAddress()))
		)
	}
}

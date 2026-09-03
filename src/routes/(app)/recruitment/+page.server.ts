import { fail } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { failFromError } from '$lib/server/form-fail'
import { paginate } from '$lib/server/pagination'
import {
	countJobPostings,
	listJobPostings,
	createJobPosting,
	submitJobPostingForApproval,
	advanceApplicant
} from '$lib/server/services/recruitment'
import { db } from '$lib/server/db'
import { z } from 'zod'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')

	// #64: paginate the postings list (the per-posting Kanban board is not paginated).
	const total = await countJobPostings(locals.user!.organizationId)
	const pagination = paginate(url, total)

	const [postings, departments] = await Promise.all([
		listJobPostings(locals.user!.organizationId, undefined, {
			skip: pagination.skip,
			take: pagination.take
		}),
		db.department.findMany({
			where: { organizationId: locals.user!.organizationId },
			orderBy: { name: 'asc' }
		})
	])

	return { postings, departments, pagination }
}

const createSchema = z.object({
	title: z.string().min(1),
	departmentId: z.string().min(1),
	description: z.string().min(1)
})

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const raw = Object.fromEntries(await request.formData())
		const parsed = createSchema.safeParse(raw)
		if (!parsed.success) return fail(400, { error: 'Invalid input' })

		try {
			await createJobPosting(user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e) {
			return failFromError(e)
		}
		return { success: true, message: `Job posting “${parsed.data.title}” created as a draft.` }
	},

	// Submit a draft for approval (#195); it goes OPEN only once its approver signs off.
	submit: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const data = await request.formData()
		const id = data.get('id') as string

		try {
			await submitJobPostingForApproval(id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e) {
			return failFromError(e)
		}
		return { success: true, message: 'Job posting submitted for approval.' }
	},

	// Bulk-submit selected draft postings for approval (mass posting).
	submitMany: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const ids = (await request.formData()).getAll('ids').map(String).filter(Boolean)
		if (!ids.length) return fail(400, { error: 'No postings selected.' })

		const ctx = {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		}
		// Submit each; skip any that aren't drafts rather than failing the batch.
		let submitted = 0
		for (const id of ids) {
			try {
				await submitJobPostingForApproval(id, user.organizationId, ctx)
				submitted++
			} catch {
				// ignore individual failures (e.g. not a draft) so the rest still submit
			}
		}
		return {
			success: true,
			submitted,
			message: `${submitted} of ${ids.length} selected posting(s) submitted for approval.`
		}
	},

	advance: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const data = await request.formData()
		const applicantId = data.get('applicantId') as string
		const stage = data.get('stage') as string
		const notes = data.get('notes') as string | undefined

		await advanceApplicant(applicantId, user.organizationId, stage as never, notes, {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		})
	}
}

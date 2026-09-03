import { fail, isHttpError, redirect } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { failFromError } from '$lib/server/form-fail'
import { db } from '$lib/server/db'
import { advanceApplicant, convertApplicantToEmployee } from '$lib/server/services/recruitment'
import { getPostingBoards, liveChannels, setChannel } from '$lib/server/services/job-boards'
import { setFlash } from '$lib/server/flash'
import type { Actions, PageServerLoad } from './$types'

// A robust http(s) check (mirrors the #109 resumeUrl approach) so the board URL field
// can't store javascript: or bare strings.
function isHttpUrl(v: string): boolean {
	try {
		const u = new URL(v)
		return u.protocol === 'http:' || u.protocol === 'https:'
	} catch {
		return false
	}
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = locals.user!
	// Recruitment is HR-only (the list page and every action on this page already require
	// it); the load was missing the gate, so any signed-in employee could read a posting's
	// applicant pipeline by id. Match the actions' capability.
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const posting = await db.jobPosting.findFirst({
		where: { id: params.id, organizationId: user.organizationId },
		include: { department: true }
	})

	if (!posting) {
		return redirect(302, '/recruitment')
	}

	const applicants = await db.applicant.findMany({
		where: { jobPostingId: params.id },
		orderBy: { createdAt: 'asc' }
	})

	// Where this role has been advertised (#117). When it's CLOSED, `stillLive` is the
	// list of boards that still need a takedown — surfaced so filled roles don't keep
	// collecting applicants from stale external listings.
	const boards = await getPostingBoards(user.organizationId, params.id)
	const stillLive = posting.status === 'CLOSED' ? liveChannels(boards) : []

	return {
		posting,
		applicants,
		userRoles: user.roles,
		boards,
		postedCount: boards.filter((b) => b.live).length,
		boardCount: boards.length,
		stillLive
	}
}

const advanceStageSchema = z.object({
	applicantId: z.string().min(1),
	stage: z.enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']),
	// #52: optional note from the Kanban's stage-move dialog. Blank textarea
	// submissions become undefined so empty strings never land in stage history.
	notes: z
		.string()
		.optional()
		.transform((v) => (v?.trim() ? v.trim() : undefined))
})

export const actions: Actions = {
	advanceStage: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const raw = Object.fromEntries(await request.formData())
		const parsed = advanceStageSchema.safeParse(raw)
		if (!parsed.success) {
			return fail(400, { error: 'Invalid input', details: parsed.error.flatten() })
		}

		const ctx = {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles,
			ipAddress: getClientAddress()
		}

		try {
			await advanceApplicant(
				parsed.data.applicantId,
				user.organizationId,
				parsed.data.stage,
				parsed.data.notes,
				ctx
			)
		} catch (e) {
			return failFromError(e)
		}
	},

	updateStatus: async ({ request, locals, params }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const data = await request.formData()
		const status = data.get('status') as string

		const validStatuses = ['OPEN', 'CLOSED', 'DRAFT']
		if (!validStatuses.includes(status)) {
			return fail(400, { error: 'Invalid status' })
		}

		const posting = await db.jobPosting.findFirst({
			where: { id: params.id, organizationId: user.organizationId }
		})

		if (!posting) {
			return fail(404, { error: 'Posting not found' })
		}

		try {
			await db.jobPosting.update({
				where: { id: params.id },
				data: {
					status: status as 'OPEN' | 'CLOSED' | 'DRAFT',
					...(status === 'OPEN' && !posting.postedAt ? { postedAt: new Date() } : {}),
					...(status === 'CLOSED' ? { closedAt: new Date() } : {})
				}
			})
		} catch (e) {
			return failFromError(e)
		}
	},

	setChannel: async ({ request, locals, params, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const data = await request.formData()
		const boardId = data.get('boardId') as string
		if (!boardId) return fail(400, { error: 'Missing board id' })
		const posted = data.get('posted') === 'on' || data.get('posted') === 'true'
		const url = ((data.get('url') as string) ?? '').trim()

		// Field-level: reject a bad URL, echoing the board id so the row can show the error.
		if (posted && url && !isHttpUrl(url)) {
			return fail(400, {
				error: 'Enter a valid URL starting with http:// or https://',
				channelBoardId: boardId
			})
		}

		try {
			await setChannel(
				user.organizationId,
				params.id,
				boardId,
				{ posted, url: url || null },
				{
					organizationId: user.organizationId,
					actorId: user.id,
					actorRoles: user.roles,
					ipAddress: getClientAddress()
				}
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	convert: async ({ request, locals, getClientAddress, cookies }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const data = await request.formData()
		const applicantId = data.get('applicantId') as string
		if (!applicantId) {
			return fail(400, { error: 'Applicant ID required' })
		}

		let newEmployee
		try {
			newEmployee = await convertApplicantToEmployee(applicantId, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}

		setFlash(cookies, {
			kind: 'success',
			message: `${newEmployee.firstName} ${newEmployee.lastName} was hired and now has an employee record.`
		})
		return redirect(302, `/employees/${newEmployee.id}`)
	}
}

import { fail, isHttpError, redirect } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { setFlash } from '$lib/server/flash'
import {
	getApplicant,
	scheduleInterview,
	recordInterviewFeedback,
	deleteInterview,
	issueOffer,
	respondToOffer,
	deleteOffer,
	convertApplicantToEmployee
} from '$lib/server/services/recruitment'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const [applicant, departments] = await Promise.all([
		getApplicant(params.applicantId, user.organizationId),
		db.department.findMany({
			where: { organizationId: user.organizationId },
			orderBy: { name: 'asc' },
			select: { id: true, name: true }
		})
	])

	// #52: resolve stage-history actors to emails in one batched query (no schema
	// relation on ApplicantStageHistory.changedById, so join here).
	const changedByIds = [
		...new Set(applicant.stageHistory.map((h) => h.changedById).filter((id): id is string => !!id))
	]
	const actors = changedByIds.length
		? await db.user.findMany({
				where: { id: { in: changedByIds } },
				select: { id: true, email: true }
			})
		: []
	const stageActors: Record<string, string> = Object.fromEntries(actors.map((a) => [a.id, a.email]))

	return { applicant, departments, stageActors }
}

function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}

const interviewSchema = z.object({
	// Date and time come from separate GUI pickers, combined server-side.
	scheduledDate: z.string().min(1),
	scheduledTime: z.string().min(1),
	mode: z.enum(['ONSITE', 'VIDEO', 'PHONE']),
	interviewer: z.string().trim().min(1),
	location: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null))
})

const offerSchema = z.object({
	jobTitle: z.string().trim().min(1),
	departmentId: z
		.string()
		.optional()
		.transform((v) => (v ? v : null)),
	monthlySalary: z.coerce.number().positive(),
	startDate: z.coerce.date(),
	notes: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null))
})

export const actions: Actions = {
	scheduleInterview: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = interviewSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success)
			return fail(400, { error: 'Date, time, mode, and interviewer are required.' })
		const scheduledAt = new Date(`${parsed.data.scheduledDate}T${parsed.data.scheduledTime}`)
		if (Number.isNaN(scheduledAt.getTime())) return fail(400, { error: 'Invalid date or time.' })
		try {
			await scheduleInterview(
				params.applicantId,
				locals.user!.organizationId,
				{
					scheduledAt,
					mode: parsed.data.mode,
					interviewer: parsed.data.interviewer,
					location: parsed.data.location
				},
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	recordFeedback: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = await request.formData()
		const interviewId = data.get('interviewId') as string
		const feedback = ((data.get('feedback') as string) ?? '').trim()
		if (!interviewId) return fail(400, { error: 'Missing interview id.' })
		try {
			await recordInterviewFeedback(
				interviewId,
				locals.user!.organizationId,
				feedback,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	deleteInterview: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const interviewId = (await request.formData()).get('interviewId') as string
		if (!interviewId) return fail(400, { error: 'Missing interview id.' })
		try {
			await deleteInterview(
				interviewId,
				locals.user!.organizationId,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	issueOffer: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = offerSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success)
			return fail(400, { error: 'Job title, salary, and start date are required.' })
		try {
			await issueOffer(
				params.applicantId,
				locals.user!.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	respondOffer: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = await request.formData()
		const offerId = data.get('offerId') as string
		const accepted = data.get('accepted') === 'true'
		if (!offerId) return fail(400, { error: 'Missing offer id.' })
		try {
			await respondToOffer(
				offerId,
				locals.user!.organizationId,
				accepted,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	deleteOffer: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const offerId = (await request.formData()).get('offerId') as string
		if (!offerId) return fail(400, { error: 'Missing offer id.' })
		try {
			await deleteOffer(offerId, locals.user!.organizationId, ctxOf(locals, getClientAddress()))
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { success: true }
	},

	convert: async ({ locals, params, getClientAddress, cookies }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		let employee
		try {
			employee = await convertApplicantToEmployee(
				params.applicantId,
				locals.user!.organizationId,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		// The redirect throws the action payload away, so without this the 201 file just appears
		// with no sign that the conversion is what put it there.
		setFlash(cookies, {
			kind: 'success',
			message: `${employee.firstName} ${employee.lastName} was converted to an employee. Onboarding has started.`
		})
		return redirect(302, `/employees/${employee.id}`)
	}
}

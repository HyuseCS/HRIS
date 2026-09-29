import { json } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { applyToPosting, advanceApplicant } from '$lib/server/services/recruitment'
import { apiError, badRequest, forbidden, notFound } from '$lib/server/api-error'
import { isValidPhone, phoneError } from '$lib/utils/phone'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const applySchema = z.object({
	firstName: z.string().min(1),
	lastName: z.string().min(1),
	email: z.string().email(),
	// #24: the same rule as the /apply form — this route is a second door onto the same data.
	phone: z.string().optional().refine(isValidPhone, phoneError('Phone number')),
	coverLetter: z.string().optional(),
	resumeUrl: z
		.string()
		.url()
		.refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL')
		.optional()
})

const advanceSchema = z.object({
	applicantId: z.string().min(1),
	stage: z.enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']),
	notes: z.string().optional()
})

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const user = locals.user

	try {
		requireAnyCapability(user.roles, 'MANAGE_HR')
	} catch {
		return forbidden()
	}

	// Verify posting belongs to the organization
	const posting = await db.jobPosting.findFirst({
		where: { id: params.id, organizationId: user.organizationId }
	})

	if (!posting) return notFound('Job posting')

	const applicants = await db.applicant.findMany({
		where: { jobPostingId: params.id },
		orderBy: { createdAt: 'asc' }
	})

	return json({ data: applicants, count: applicants.length })
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	// Verify the posting is OPEN
	const posting = await db.jobPosting.findFirst({
		where: { id: params.id, organizationId: locals.user.organizationId }
	})

	if (!posting) return notFound('Job posting')

	if (posting.status !== 'OPEN') {
		return badRequest('This position is not accepting applications')
	}

	let body: unknown
	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	const parsed = applySchema.safeParse(body)
	if (!parsed.success) {
		return badRequest('Invalid input', parsed.error.flatten())
	}

	// Check for duplicate
	const existing = await db.applicant.findFirst({
		where: { jobPostingId: params.id, email: parsed.data.email }
	})

	if (existing) {
		return apiError(409, 'Already applied', { email: parsed.data.email })
	}

	const applicant = await applyToPosting(params.id, locals.user.organizationId, {
		firstName: parsed.data.firstName,
		lastName: parsed.data.lastName,
		email: parsed.data.email,
		phone: parsed.data.phone,
		coverLetter: parsed.data.coverLetter
	})

	return json({ data: applicant }, { status: 201 })
}

export const PATCH: RequestHandler = async ({ request, locals, getClientAddress }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const user = locals.user

	try {
		requireAnyCapability(user.roles, 'MANAGE_HR')
	} catch {
		return forbidden()
	}

	let body: unknown
	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	const parsed = advanceSchema.safeParse(body)
	if (!parsed.success) {
		return badRequest('Invalid input', parsed.error.flatten())
	}

	const ctx = {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	}

	const updated = await advanceApplicant(
		parsed.data.applicantId,
		user.organizationId,
		parsed.data.stage,
		parsed.data.notes,
		ctx
	)

	return json({ data: updated })
}

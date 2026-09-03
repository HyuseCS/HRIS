import { json } from '@sveltejs/kit'
import { canAny, requireAnyCapability } from '$lib/server/rbac'
import { listJobPostings, createJobPosting } from '$lib/server/services/recruitment'
import { apiError, badRequest, forbidden } from '$lib/server/api-error'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const createSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	requirements: z.string().optional(),
	location: z.string().optional(),
	departmentId: z.string().min(1),
	employmentType: z
		.enum(['REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'PART_TIME', 'ON_CALL', 'INTERN'])
		.optional()
})

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const user = locals.user
	// EMPLOYEE sees OPEN only; HR_ADMIN and above see all
	const isHrAdmin = canAny(user.roles, 'MANAGE_HR')

	const postings = await listJobPostings(user.organizationId, isHrAdmin ? undefined : 'OPEN')

	return json({ data: postings, count: postings.length })
}

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
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

	const parsed = createSchema.safeParse(body)
	if (!parsed.success) {
		return badRequest('Invalid input', parsed.error.flatten())
	}

	const ctx = {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: getClientAddress()
	}

	const posting = await createJobPosting(
		user.organizationId,
		{
			title: parsed.data.title,
			description: parsed.data.description,
			departmentId: parsed.data.departmentId
		},
		ctx
	)

	return json({ data: posting }, { status: 201 })
}

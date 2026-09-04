import { fail, redirect } from '@sveltejs/kit'
import { z } from 'zod'
import { db } from '$lib/server/db'
import { applyToPosting } from '$lib/server/services/recruitment'
import { isValidPhone, phoneError } from '$lib/utils/phone'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, params }) => {
	const posting = await db.jobPosting.findFirst({
		where: { id: params.id, organizationId: locals.user!.organizationId },
		include: { department: { select: { name: true } } }
	})

	if (!posting || posting.status !== 'OPEN') {
		return redirect(302, '/recruitment')
	}

	return { posting }
}

const applySchema = z.object({
	firstName: z.string().min(1, 'First name is required'),
	lastName: z.string().min(1, 'Last name is required'),
	email: z.string().email('A valid email address is required'),
	// #24: optional, so an omitted phone stays valid — but a supplied one must look like a number.
	phone: z.string().optional().refine(isValidPhone, phoneError('Phone number')),
	coverLetter: z.string().optional(),
	resumeUrl: z
		.string()
		.url('Resume URL must be a valid URL')
		.refine((u) => /^https?:\/\//i.test(u), 'Resume URL must start with http(s)://')
		.optional()
})

export const actions: Actions = {
	apply: async ({ request, locals, params }) => {
		const raw = Object.fromEntries(await request.formData())

		// Clean up empty optional fields
		const cleaned = {
			...raw,
			phone: raw.phone || undefined,
			coverLetter: raw.coverLetter || undefined,
			resumeUrl: raw.resumeUrl || undefined
		}

		const parsed = applySchema.safeParse(cleaned)
		if (!parsed.success) {
			return fail(400, {
				error: 'Please correct the errors below.',
				fieldErrors: parsed.error.flatten().fieldErrors,
				values: raw as Record<string, string>
			})
		}

		// Check for duplicate application (same email, same posting)
		const existing = await db.applicant.findFirst({
			where: { jobPostingId: params.id, email: parsed.data.email }
		})

		if (existing) {
			return fail(409, {
				error: 'An applicant with this email has already been added to this posting.',
				values: raw as Record<string, string>
			})
		}

		await applyToPosting(params.id, locals.user!.organizationId, {
			firstName: parsed.data.firstName,
			lastName: parsed.data.lastName,
			email: parsed.data.email,
			phone: parsed.data.phone,
			coverLetter: parsed.data.coverLetter
		})

		// HR-only "add applicant" flow — land back on the posting's board so the
		// new card is visible, rather than an applicant-facing thank-you panel.
		return redirect(303, `/recruitment/${params.id}`)
	}
}

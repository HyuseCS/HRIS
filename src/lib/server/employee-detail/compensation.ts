import { fail } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { failFromError } from '$lib/server/form-fail'
import { recordCompensationChange, promoteEmployee } from '$lib/server/services/employees'
import { EMPLOYMENT_TYPES } from '$lib/utils/employment-type'
import { z } from 'zod'
import { ctxOf } from './shared'
import type { Actions } from '../../../routes/(app)/employees/[id]/$types'

// #170: an effective-dated salary / pay-type change. Salary is masked (reveal-to-edit), so an empty
// field means "unchanged", not 0 — same preprocess as the update form. At least one of salary /
// rateType must actually be supplied; the service enforces the date bounds and the rate/type pairing.
const changeCompensationSchema = z
	.object({
		basicMonthlySalary: z.preprocess(
			(v) => (v === '' ? undefined : v),
			z.coerce.number().positive().optional()
		),
		rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
		effectiveDate: z.coerce.date(),
		note: z
			.string()
			.trim()
			.max(500)
			.optional()
			.transform((v) => (v ? v : undefined))
	})
	.refine((d) => d.basicMonthlySalary !== undefined || d.rateType !== undefined, {
		message: 'Enter a new salary or pay type.'
	})

// #222: a promotion — one atomic career event. Every field is optional (the service requires at
// least one real change); an empty positionId/jobTitle means "not part of this promotion", never
// "clear it", so the promote form can never blank a field the HR user did not touch. Salary is
// masked (reveal-to-edit), so an empty amount means unchanged — the same preprocess as above.
const promoteSchema = z.object({
	effectiveDate: z.coerce.date(),
	positionId: z
		.string()
		.optional()
		.transform((v) => (v ? v : undefined)),
	jobTitle: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : undefined)),
	reportsToId: z
		.string()
		.optional()
		.transform((v) => (v ? v : undefined)),
	employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
	basicMonthlySalary: z.preprocess(
		(v) => (v === '' ? undefined : v),
		z.coerce.number().positive().optional()
	),
	rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
	note: z
		.string()
		.trim()
		.max(500)
		.optional()
		.transform((v) => (v ? v : undefined))
})

export const compensationActions: Actions = {
	// #170: record an effective-dated salary / pay-type change. Gated on MANAGE_HR, which a MANAGER
	// holds — the control that stops a MANAGER moving pay directly is `proposeIfRequired`
	// (`$lib/server/services/employees.ts`), which routes their change through propose→confirm (#243).
	// The service inserts the snapshot, re-derives the current cache and audits atomically; a
	// backdate into an approved run comes back as a notice.
	changeCompensation: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		// Discriminator: this form shares the page's single `form` prop with every other action, so its
		// message block gates on `form.action` to ignore a sibling form's success/error.
		const action = 'changeCompensation'
		const parsed = changeCompensationSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) {
			const messages = parsed.error.errors.map((e) => e.message).filter(Boolean)
			return fail(400, { action, error: messages.length ? messages.join(' · ') : 'Invalid input' })
		}
		try {
			const { notice } = await recordCompensationChange(
				params.id,
				locals.user!.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
			return { action, success: true, notice }
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
	},

	// #222: promote — position, title, reporting line, employment type and pay as ONE audited event.
	// Same MANAGE_HR gate as changeCompensation, and the same real control: a MANAGER reaches the
	// action but `proposeIfRequired` (#243) turns their pay move into a proposal rather than a write.
	promote: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const action = 'promote'
		const parsed = promoteSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) {
			const messages = parsed.error.errors.map((e) => e.message).filter(Boolean)
			return fail(400, { action, error: messages.length ? messages.join(' · ') : 'Invalid input' })
		}
		try {
			const { notice } = await promoteEmployee(
				params.id,
				locals.user!.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
			return { action, success: true, notice }
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
	}
}

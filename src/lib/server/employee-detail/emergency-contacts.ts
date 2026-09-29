import { fail, isHttpError } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { addEmergencyContact, deleteEmergencyContact } from '$lib/server/services/emergencyContacts'
import { isValidPhone, phoneError } from '$lib/utils/phone'
import { z } from 'zod'
import { ctxOf } from './shared'
import type { Actions } from '../../../routes/(app)/employees/[id]/$types'

const emergencyContactSchema = z.object({
	name: z.string().trim().min(1, 'Name is required.'),
	relationship: z.string().trim().min(1, 'Relationship is required.'),
	// #24: required AND format-checked. Every message is written out so the action can surface
	// zod's first issue verbatim without leaking a raw "String must contain at least 1
	// character(s)" at the user.
	phone: z.string().trim().min(1, 'Phone is required.').refine(isValidPhone, phoneError('Phone'))
})

export const emergencyContactActions: Actions = {
	addEmergencyContact: async ({ request, locals, params, getClientAddress }) => {
		const action = 'addEmergencyContact'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = emergencyContactSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) {
			// #24: the phone is now format-checked as well as required, so the generic "are required"
			// text would name the wrong problem. Every field in the schema carries its own message.
			const message = parsed.error.errors[0]?.message
			return fail(400, {
				action,
				error: message ?? 'Name, relationship, and phone are required.'
			})
		}
		try {
			await addEmergencyContact(
				params.id,
				locals.user!.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	deleteEmergencyContact: async ({ request, locals, getClientAddress }) => {
		const action = 'deleteEmergencyContact'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const contactId = (await request.formData()).get('contactId') as string
		if (!contactId) return fail(400, { action, error: 'Missing contact id.' })
		try {
			await deleteEmergencyContact(
				contactId,
				locals.user!.organizationId,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	}
}

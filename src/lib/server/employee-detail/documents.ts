import { fail, isHttpError } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { saveEmployeeDocument, deleteEmployeeDocument } from '$lib/server/services/documents'
import { ctxOf } from './shared'
import type { Actions } from '../../../routes/(app)/employees/[id]/$types'

const DOC_CATEGORIES = [
	'CONTRACT',
	'GOVERNMENT_ID',
	'RESUME',
	'PAYROLL_FORM',
	'EXIT_DOCUMENT',
	'OTHER'
] as const

export const documentActions: Actions = {
	uploadDocument: async ({ request, locals, params, getClientAddress }) => {
		const action = 'uploadDocument'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')

		const data = await request.formData()
		const file = data.get('file')
		const categoryRaw = data.get('category') as string
		const label = (data.get('label') as string) || ''

		if (!(file instanceof File) || file.size === 0)
			return fail(400, { action, error: 'Please choose a file to upload.' })
		const category = DOC_CATEGORIES.includes(categoryRaw as never)
			? (categoryRaw as (typeof DOC_CATEGORIES)[number])
			: 'OTHER'
		const bytes = Buffer.from(await file.arrayBuffer())

		try {
			await saveEmployeeDocument(
				params.id,
				locals.user!.organizationId,
				{ category, label, fileName: file.name, mimeType: file.type, bytes },
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	deleteDocument: async ({ request, locals, getClientAddress }) => {
		const action = 'deleteDocument'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const docId = (await request.formData()).get('docId') as string
		if (!docId) return fail(400, { action, error: 'Missing document id.' })
		try {
			await deleteEmployeeDocument(
				docId,
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

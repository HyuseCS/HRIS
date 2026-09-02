import { error } from '@sveltejs/kit'
import { getEmployeeDocument } from '$lib/server/services/documents'
import { readStoredFile } from '$lib/server/storage'
import { db } from '$lib/server/db'
import { canAny } from '$lib/server/rbac'
import type { RequestHandler } from './$types'

// Stream a stored employee document. Access: HR_ADMIN/SUPER_ADMIN, or the employee
// who owns the document (their own 201 file). Everyone else 403.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user

	const doc = await getEmployeeDocument(params.docId, user.organizationId)
	if (doc.employeeId !== params.id) error(404, 'Document not found')

	const isHr = canAny(user.roles, 'ADMINISTER_HR_RECORDS')
	if (!isHr) {
		// #6: the ACTIVE org, not the home tenant. `me?.id !== doc.employeeId` below already
		// fails closed when this resolves to null.
		const me = await db.employee.findFirst({
			where: { userId: user.id, organizationId: user.organizationId },
			select: { id: true }
		})
		if (me?.id !== doc.employeeId) error(403, 'Insufficient permissions')
	}

	const bytes = await readStoredFile(doc.storageKey)
	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': doc.mimeType,
			'Content-Length': String(doc.size),
			'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
			'Cache-Control': 'private, no-store',
			// #74: never let the browser second-guess the stored content type.
			'X-Content-Type-Options': 'nosniff'
		}
	})
}

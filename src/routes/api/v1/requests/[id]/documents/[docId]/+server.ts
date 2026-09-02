import { error } from '@sveltejs/kit'
import { getRequestDocument } from '$lib/server/services/requests/documents'
import { canAny } from '$lib/server/rbac'
import { readStoredFile } from '$lib/server/storage'
import { db } from '$lib/server/db'
import type { RequestHandler } from './$types'

// Stream a request's supporting document. Access: the employee who filed the
// request, or any approver role (the same set that can open the request detail).
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Unauthorized')
	const user = locals.user

	const doc = await getRequestDocument(params.docId, user.organizationId)
	if (doc.requestId !== params.id) error(404, 'Document not found')

	if (!canAny(user.roles, 'APPROVE_REQUESTS')) {
		// #6: scoped to the ACTIVE org, so a cross-org account no longer resolves its home-tenant
		// profile here.
		const me = await db.employee.findFirst({
			where: { userId: user.id, organizationId: user.organizationId },
			select: { id: true }
		})
		if (me?.id !== doc.request.employeeId) error(403, 'Insufficient permissions')
	}

	// #299/D-3: a tombstoned document is still downloadable WHILE its bytes survive — the reviewer
	// can see it in the detail page's history panel, so serving it is the honest answer. The 404 is
	// keyed on the bytes being gone (storageKey nulled by eviction), never on `deletedAt`. Enforced
	// here at the route, not only in Svelte, because this URL is reachable directly.
	if (!doc.storageKey) error(404, 'File no longer available')

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

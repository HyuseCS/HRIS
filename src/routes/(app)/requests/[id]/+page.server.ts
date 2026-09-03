import { error, fail, isHttpError } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { getRequest } from '$lib/server/services/requests'
import {
	uploadsFromForm,
	saveRequestDocuments,
	deleteRequestDocument,
	setRequestDocumentVerified
} from '$lib/server/services/requests/documents'
import { canAny } from '$lib/server/rbac'
import { getLeaveBalances } from '$lib/server/services/leave'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!
	const req = await getRequest(params.id, user.organizationId)
	if (!req) error(404, 'Request not found')

	// Owner, or any approver (managers/HR/super-admin plus payroll officers) who can see
	// others' requests — the same set allowed in the approvals queue, so a reviewer can open
	// the detail of a request they're able to act on.
	const isOwner = (await myEmployeeId(user)) === req.employeeId
	const canReview = canAny(user.roles, 'APPROVE_REQUESTS')
	if (!isOwner && !canReview) error(403, 'Insufficient permissions')

	// LEAVE requests store their leaveTypeId in the JSON payload (no relation); resolve it to a
	// name for the details panel.
	let leaveTypeName: string | null = null
	// The filer's ledger for the year the leave falls in (#137). An approver deciding a leave
	// request should not have to open the 201 file to see whether the days are actually there
	// — and the balance is only deducted on final approval, so what is shown here is what the
	// request will draw against.
	let leaveBalances: {
		id: string
		name: string
		allocated: number
		used: number
		remaining: number
		isRequested: boolean
	}[] = []

	if (req.type === 'LEAVE') {
		const leaveTypeId = ((req.payload ?? {}) as Record<string, unknown>).leaveTypeId
		if (typeof leaveTypeId === 'string') {
			const lt = await db.leaveType.findFirst({
				where: { id: leaveTypeId, organizationId: user.organizationId },
				select: { name: true }
			})
			leaveTypeName = lt?.name ?? null
		}

		// Year of the leave itself, not today's — a December filing for January leave draws
		// on next year's allocation, and showing this year's would misinform the approver.
		const year = (req.dateFrom ?? new Date()).getFullYear()
		leaveBalances = (await getLeaveBalances(req.employeeId, year))
			.map((b) => ({
				id: b.id,
				name: b.leaveType.name,
				allocated: Number(b.allocated),
				used: Number(b.used),
				remaining: Number(b.remaining),
				isRequested: b.leaveTypeId === leaveTypeId
			}))
			// The type being drawn against leads; the rest stay alphabetical as context.
			// Otherwise the number the reviewer actually needs sits wherever the alphabet
			// happens to put it.
			.sort((a, b) =>
				a.isRequested === b.isRequested ? a.name.localeCompare(b.name) : a.isRequested ? -1 : 1
			)
	}

	// #283/D12: this page is where an approver comes to ask "why can't I act on this?" — the
	// approvals QUEUE deliberately omits barred items (AC-15/AC-21/US-8), so without this the
	// answer is nowhere. There is no decide control on this page to disable (the actions here are
	// uploadDocs / deleteDoc / verifyDoc only), so D12's "explain why" half lands as a read-only
	// line. Same inputs as the service guard, so the two cannot drift.
	//
	// Both comparisons are User ids on both sides: steps.actorId and documents.verifiedById are
	// User ids, as is user.id. Compare either against an Employee id and this silently never fires.
	const attempt = Math.max(1, ...req.steps.map((s) => s.attempt))
	const actBlockedReason = !canReview
		? null
		: req.steps.some((s) => s.attempt === attempt && s.decision != null && s.actorId === user.id)
			? 'You already decided an earlier stage of this attempt — another verifier or approver must act.'
			: // #299/C-5: documentHistory, NOT documents. This line is the F3 mirror and must give the
				// same answer as decide()'s bar, which reads tombstoned signers too. On the live list it
				// would go quiet the moment the requester removed the document — the approvals queue
				// would keep barring this actor (correctly) while the page they came to for "why can't
				// I act on this?" told them nothing was wrong.
				req.documentHistory.some((d) => d.verifiedById === user.id) &&
				  !canAny(user.roles, 'ADMINISTER_SYSTEM')
				? 'You signed off a supporting document on this request — another approver must decide it.'
				: null

	return { request: req, isOwner, canReview, leaveTypeName, leaveBalances, actBlockedReason }
}

function ctxOf(locals: App.Locals, ip: string) {
	const user = locals.user!
	return {
		organizationId: user.organizationId,
		actorId: user.id,
		actorRoles: user.roles,
		ipAddress: ip
	}
}

/**
 * #6 — the caller's OWN employee id, scoped to the ACTIVE org. Takes the user rather than a
 * bare `userId` because the org is not derivable from the id alone: without it a cross-org
 * account's home-tenant profile resolves here whichever org the session is in. Matches
 * `findSelfEmployee(user)` at punch/+page.server.ts.
 */
async function myEmployeeId(user: { id: string; organizationId: string }) {
	const me = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
	return me?.id ?? null
}

export const actions: Actions = {
	// Owner attaches more documents while the request is still PENDING/RETURNED
	// (e.g. a request was returned with "please attach the receipt").
	uploadDocs: async ({ request, locals, params, getClientAddress }) => {
		const user = locals.user!
		const employeeId = await myEmployeeId(user)
		if (!employeeId) return fail(400, { error: 'No employee profile found.' })

		const data = await request.formData()
		try {
			const uploads = await uploadsFromForm(data)
			if (!uploads.length) return fail(400, { error: 'Please choose a file to upload.' })
			await saveRequestDocuments(
				params.id,
				employeeId,
				user.organizationId,
				uploads,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			if (e instanceof Error) return fail(400, { error: e.message })
			throw e
		}
		return { message: 'Document uploaded.' }
	},

	deleteDoc: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		const employeeId = await myEmployeeId(user)
		if (!employeeId) return fail(400, { error: 'No employee profile found.' })

		const docId = (await request.formData()).get('docId') as string
		if (!docId) return fail(400, { error: 'Missing document id.' })

		try {
			await deleteRequestDocument(
				docId,
				employeeId,
				user.organizationId,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			if (e instanceof Error) return fail(400, { error: e.message })
			throw e
		}
		return { message: 'Document removed.' }
	},

	// Approver signs off on a document (or clears the sign-off).
	verifyDoc: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		if (!canAny(user.roles, 'APPROVE_REQUESTS')) {
			return fail(403, { error: 'Insufficient permissions' })
		}

		const data = await request.formData()
		const docId = data.get('docId') as string
		const verified = data.get('verified') === 'true'
		if (!docId) return fail(400, { error: 'Missing document id.' })

		try {
			await setRequestDocumentVerified(
				docId,
				user.organizationId,
				verified,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			if (e instanceof Error) return fail(400, { error: e.message })
			throw e
		}
		return { message: verified ? 'Document marked as verified.' : 'Verification cleared.' }
	}
}

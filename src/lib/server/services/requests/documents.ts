import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import { writeAuditLog } from '$lib/server/audit'
import {
	saveFile,
	deleteStoredFile,
	isAllowedType,
	contentMatchesType,
	MAX_UPLOAD_BYTES
} from '$lib/server/storage'
import type { RequestDocument } from '@prisma/client'
import type { AuditContext } from '../types'

// Supporting documents attached to a Request (issue #51). Bytes share the T162
// store (UPLOAD_DIR) with EmployeeDocument; rows carry a verification sign-off
// set by an approver during review.
//
// #283/D11: the two sign-off columns mean DIFFERENT things. `verifiedAt` means "currently
// verified" and is what every consumer keys on. `verifiedById` is the durable record of who LAST
// signed off, and it survives a clear — because the #283/F3 bar (a document's verifier may not
// also decide that request) reads it, and a field that a barred actor can null in one click is
// not a bar at all.

export const MAX_REQUEST_DOCS = 5

export interface RequestUpload {
	fileName: string
	mimeType: string
	bytes: Buffer
}

// Shared count/size/type checks. File satisfies this shape, so the form parser can
// validate metadata BEFORE buffering any bytes.
function assertUploadMetadata(
	files: { name: string; size: number; type: string }[],
	existingCount = 0
) {
	if (files.length + existingCount > MAX_REQUEST_DOCS) {
		error(400, `A request can have at most ${MAX_REQUEST_DOCS} supporting documents`)
	}
	for (const f of files) {
		if (!f.size) error(400, `"${f.name}" is empty`)
		if (f.size > MAX_UPLOAD_BYTES) error(413, `"${f.name}" exceeds the 10 MB limit`)
		if (!isAllowedType(f.type)) {
			error(415, `"${f.name}" has an unsupported type. Allowed: PDF, PNG, JPEG, WEBP`)
		}
	}
}

// Validate a batch of uploads without touching disk — runs again inside
// saveRequestDocuments with the request's existing document count.
export function assertValidRequestUploads(files: RequestUpload[], existingCount = 0) {
	assertUploadMetadata(
		files.map((f) => ({ name: f.fileName, size: f.bytes.byteLength, type: f.mimeType })),
		existingCount
	)
}

// Collect the optional `documents` uploads from a form. Browsers submit an empty File
// when the input is left blank — those are filtered out. Count/size/type are checked
// from the File metadata before buffering, so an invalid batch never allocates and a
// bad file fails before any request row is created.
export async function uploadsFromForm(f: FormData): Promise<RequestUpload[]> {
	const entries = f
		.getAll('documents')
		.filter((e): e is File => e instanceof File && e.size > 0 && Boolean(e.name))
	assertUploadMetadata(entries)
	const uploads: RequestUpload[] = []
	for (const e of entries) {
		uploads.push({
			fileName: e.name,
			mimeType: e.type,
			bytes: Buffer.from(await e.arrayBuffer())
		})
	}
	return uploads
}

// Attach uploads to the employee's own still-editable request. Used right after
// createRequest (status PENDING) and from the detail page while PENDING/RETURNED.
export async function saveRequestDocuments(
	requestId: string,
	employeeId: string,
	organizationId: string,
	files: RequestUpload[],
	ctx: AuditContext
) {
	if (!files.length) return []

	const req = await db.request.findFirst({
		where: { id: requestId, employeeId, employee: { organizationId } },
		// #299/D-5: the cap means 5 LIVE documents. Tombstones are kept forever, so counting them
		// would lock a requester out of their own request after two swaps — the cap would ratchet
		// down instead of holding. Filtered `_count` is supported by the installed Prisma 5.22.
		select: {
			id: true,
			status: true,
			_count: { select: { documents: { where: { deletedAt: null } } } }
		}
	})
	if (!req) error(404, 'Request not found')
	if (req.status !== 'PENDING' && req.status !== 'RETURNED') {
		error(400, 'Documents can only be added while a request is pending or returned')
	}
	assertValidRequestUploads(files, req._count.documents)
	// #74: verify each file's magic bytes match its declared (allowlisted) type before
	// touching disk, so a renamed file can't be stored under a trusted content type.
	for (const f of files) {
		if (!contentMatchesType(f.bytes, f.mimeType))
			error(415, `"${f.fileName}" contents do not match its type. Allowed: PDF, PNG, JPEG, WEBP`)
	}

	const docs: RequestDocument[] = []
	const savedKeys: string[] = []
	try {
		for (const f of files) {
			const saved = await saveFile(f.bytes, f.mimeType, `requests/${requestId}`)
			savedKeys.push(saved.storageKey)
			const doc = await db.requestDocument.create({
				data: {
					requestId,
					label: f.fileName,
					fileName: f.fileName,
					mimeType: f.mimeType,
					size: saved.size,
					storageKey: saved.storageKey
				}
			})
			docs.push(doc)
			await writeAuditLog(ctx, {
				action: 'CREATE',
				entityType: 'RequestDocument',
				entityId: doc.id,
				newValue: { requestId, fileName: f.fileName, size: saved.size }
			})
		}
	} catch (e) {
		// A mid-batch failure must not leave earlier uploads half-attached: drop the rows
		// and bytes stored so far (best-effort), then surface the original error.
		if (docs.length) {
			await db.requestDocument
				.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } })
				.catch(() => {})
		}
		for (const key of savedKeys) await deleteStoredFile(key).catch(() => {})
		throw e
	}
	return docs
}

// Returns the row incl. storageKey (plus the owning request) so the download route
// can stream the file and check access.
//
// #299/I-4: deliberately TOMBSTONE-BLIND — no `deletedAt` filter here. Each of the three callers
// branches on `deletedAt` itself because they need three different answers: the delete path 404s
// (D-2), the verify path 409s (D-1/P-6), and the download route serves a tombstone while its bytes
// survive and 404s only once `storageKey` is null (D-3). A filter here would pick one of those
// three for everyone.
export async function getRequestDocument(docId: string, organizationId: string) {
	const doc = await db.requestDocument.findFirst({
		where: { id: docId, request: { employee: { organizationId } } },
		include: { request: { select: { id: true, employeeId: true } } }
	})
	if (!doc) error(404, 'Document not found')
	return doc
}

// Approver marks a document as verified (or clears the sign-off). Role gating
// (APPROVER_ROLES) is the caller's job; this enforces org scoping only.
export async function setRequestDocumentVerified(
	docId: string,
	organizationId: string,
	verified: boolean,
	ctx: AuditContext
) {
	const doc = await getRequestDocument(docId, organizationId)
	// #299/D-1 + P-6: a tombstone can be neither verified nor un-verified. 409, not 404, and the
	// difference is not pedantry — under D-3 the reviewer is looking at this exact row RIGHT NOW in
	// the detail page's "Removed documents" panel, with its filename and its signer. Telling them
	// "not found" for a row on their screen produces a bug report. 409 is the code this file
	// already uses for "you can see it, you may not do this to it" (the delete lock below).
	if (doc.deletedAt) error(409, 'Removed documents cannot be verified')
	const updated = await db.requestDocument.update({
		where: { id: doc.id },
		data: verified
			? { verifiedById: ctx.actorId, verifiedAt: new Date() }
			: // #283/D11: clearing the sign-off clears verifiedAt ONLY. Nulling verifiedById too would
				// let a barred approver un-verify their own sign-off and then decide the request, which
				// is the whole F3 bypass — no ADMINISTER_SYSTEM needed, and the selfVerifiedEvidence
				// audit marker never fires. Every other consumer keys on verifiedAt (approvals.ts's
				// queue filter, the delete lock below, requests/[id] and requests/approvals), so
				// "currently verified" still means verifiedAt != null and the ordinary un-verify
				// correction path is unchanged.
				//
				// ponytail: known ceiling — if a DIFFERENT actor later verifies this same document,
				// verifiedById is overwritten and the earlier signer's bar is forgotten. Two people
				// must collude, so it is accepted for now; the upgrade path is a
				// RequestDocumentVerification history table (one row per sign-off), at which point the
				// F3 bar reads the whole history instead of a scalar.
				{ verifiedAt: null }
	})
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'RequestDocument',
		entityId: doc.id,
		newValue: { requestId: doc.requestId, verified }
	})
	return updated
}

// #299/I-3 — the ONE place bytes are ever evicted. Two modes, one helper, because the ordering
// below must be enforced in exactly one place: `keepNewest = 3` is the FIFO cap fired on every
// removal, `keepNewest = 0` is the terminal-status sweep (D-6) fired once a request reaches
// APPROVED, REJECTED or CANCELLED and the cap stops applying.
//
// The FIFO key is `deletedAt`, NEVER `uploadedAt` (I-1). Creation order and deletion order diverge
// the moment documents are swapped out of upload order — a doc uploaded first but removed last is
// the NEWEST tombstone, and sorting by `uploadedAt` would evict it first. That is a real bug, not a
// stylistic choice.
//
// Unlink precedes the null, always (P-3). Null first and the pointer is gone while the file
// remains: a permanent orphan that `sweep-orphan-uploads.ts` can never reclaim, because a file with
// no row is swept while a file with a NULLED row is invisible to both sides. For the same reason an
// unlink failure `continue`s without nulling — the key stays, the sweep correctly ignores the file,
// and the next eviction cycle retries.
//
// This function touches ONE column. `deletedAt`, `verifiedById`, `verifiedAt`, `fileName` and
// `uploadedAt` are never written here, and no row is ever deleted — that is the whole point of
// #299.
export async function evictTombstonedBytes(requestId: string, keepNewest: number) {
	const tombstoned = await db.requestDocument.findMany({
		where: { requestId, deletedAt: { not: null }, storageKey: { not: null } },
		orderBy: { deletedAt: 'asc' },
		select: { id: true, storageKey: true }
	})
	const evict = keepNewest > 0 ? tombstoned.slice(0, -keepNewest) : tombstoned

	for (const row of evict) {
		if (!row.storageKey) continue
		try {
			await deleteStoredFile(row.storageKey)
		} catch (e) {
			console.error('[storage] failed to evict', row.storageKey, e)
			continue
		}
		await db.requestDocument.update({ where: { id: row.id }, data: { storageKey: null } })
	}
}

// Owner removes a document from their own still-editable request. Verified docs are
// locked — an approver already signed off on that exact file, so it can't be swapped
// out from under them.
//
// #299: this SOFT-deletes. The row is kept forever — `verifiedById` is what the #283/F3 bar reads,
// and a hard delete erased it, so un-verify -> delete -> re-upload laundered a signer's signature
// away and let them decide their own evidence. Only the bytes may go, and only through
// `evictTombstonedBytes` above. The 409 on `verifiedAt` is unchanged and deliberate: it blocks
// removing a CURRENTLY verified document, which is a different rule from this one.
export async function deleteRequestDocument(
	docId: string,
	employeeId: string,
	organizationId: string,
	ctx: AuditContext
) {
	const doc = await getRequestDocument(docId, organizationId)

	const req = await db.request.findFirst({
		where: { id: doc.requestId, employeeId },
		select: { id: true, status: true }
	})
	if (!req) error(403, 'You can only remove documents from your own requests')
	if (req.status !== 'PENDING' && req.status !== 'RETURNED') {
		error(400, 'Documents can only be removed while a request is pending or returned')
	}
	if (doc.verifiedAt) error(409, 'Verified documents cannot be removed')
	// #299/D-2: already a tombstone — gone from the requester's active set, so 404 is honest here
	// (unlike the verify path, which shows the row). It also closes the FIFO-gaming path: repeated
	// deletes of one id cannot force extra eviction cycles.
	if (doc.deletedAt) error(404, 'Document not found')

	// The guards above ran against a separate read, so re-assert both of them in the WHERE. Without
	// that, two concurrent removals of one id each write a `deletedAt` AND a DELETE audit entry, and
	// a verify landing between the read and this write tombstones a document that is now verified —
	// exactly what the 409 above promises it will not do.
	const { count } = await db.requestDocument.updateMany({
		where: { id: doc.id, deletedAt: null, verifiedAt: null },
		data: { deletedAt: new Date() }
	})
	if (count === 0) error(409, 'This document changed while it was being removed')
	// Bytes are a cleanup concern and the user's removal already succeeded, so a storage failure
	// must not surface as an error or skip the DELETE audit entry — same reasoning as the inline
	// unlink this replaced.
	await evictTombstonedBytes(doc.requestId, 3).catch((e) =>
		console.error('[storage] failed to evict tombstoned bytes for', doc.requestId, e)
	)
	await writeAuditLog(ctx, {
		action: 'DELETE',
		entityType: 'RequestDocument',
		entityId: doc.id,
		// #299: `verifiedById` joins the entry. Today's audit cannot reconstruct who signed a
		// removed document — the same amnesia this issue exists to close, one layer up.
		oldValue: {
			requestId: doc.requestId,
			fileName: doc.fileName,
			verifiedById: doc.verifiedById
		}
	})
	return { deleted: true }
}

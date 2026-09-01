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
import type { EmployeeDocumentCategory } from '@prisma/client'
import type { AuditContext } from './types'

async function assertEmployeeInOrg(employeeId: string, organizationId: string) {
	const emp = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true }
	})
	if (!emp) error(404, 'Employee not found')
}

export async function listEmployeeDocuments(employeeId: string, organizationId: string) {
	await assertEmployeeInOrg(employeeId, organizationId)
	return db.employeeDocument.findMany({
		where: { employeeId },
		select: {
			id: true,
			category: true,
			label: true,
			fileName: true,
			mimeType: true,
			size: true,
			uploadedAt: true,
			uploadedBy: { select: { email: true } }
		},
		orderBy: { uploadedAt: 'desc' }
	})
}

export async function saveEmployeeDocument(
	employeeId: string,
	organizationId: string,
	input: {
		category: EmployeeDocumentCategory
		label: string
		fileName: string
		mimeType: string
		bytes: Buffer
	},
	ctx: AuditContext
) {
	await assertEmployeeInOrg(employeeId, organizationId)

	if (!input.bytes.byteLength) error(400, 'Empty file')
	if (input.bytes.byteLength > MAX_UPLOAD_BYTES) error(413, 'File exceeds the 10 MB limit')
	if (!isAllowedType(input.mimeType))
		error(415, 'Unsupported file type. Allowed: PDF, PNG, JPEG, WEBP')
	// #74: the declared MIME is browser-supplied — verify the bytes really are that
	// format so a renamed file can't be stored under a trusted content type.
	if (!contentMatchesType(input.bytes, input.mimeType))
		error(415, 'File contents do not match its type. Allowed: PDF, PNG, JPEG, WEBP')

	const saved = await saveFile(input.bytes, input.mimeType, `employees/${employeeId}`)

	const doc = await db.employeeDocument.create({
		data: {
			employeeId,
			category: input.category,
			label: input.label.trim() || input.fileName,
			fileName: input.fileName,
			mimeType: input.mimeType,
			size: saved.size,
			storageKey: saved.storageKey,
			uploadedById: ctx.actorId
		}
	})

	await writeAuditLog(ctx, {
		action: 'CREATE',
		entityType: 'EmployeeDocument',
		entityId: doc.id,
		newValue: { employeeId, category: input.category, fileName: input.fileName, size: saved.size }
	})

	return doc
}

// Returns the row incl. storageKey so the download route can stream the file.
export async function getEmployeeDocument(docId: string, organizationId: string) {
	const doc = await db.employeeDocument.findFirst({
		where: { id: docId, employee: { organizationId } }
	})
	if (!doc) error(404, 'Document not found')
	return doc
}

export async function deleteEmployeeDocument(
	docId: string,
	organizationId: string,
	ctx: AuditContext
) {
	const doc = await getEmployeeDocument(docId, organizationId)
	await db.employeeDocument.delete({ where: { id: doc.id } })
	await deleteStoredFile(doc.storageKey)
	await writeAuditLog(ctx, {
		action: 'DELETE',
		entityType: 'EmployeeDocument',
		entityId: doc.id,
		oldValue: { employeeId: doc.employeeId, fileName: doc.fileName }
	})
}

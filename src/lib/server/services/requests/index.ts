import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { deleteStoredFile } from '$lib/server/storage'
import { error } from '@sveltejs/kit'
import { Prisma } from '@prisma/client'
import {
	requestSchema,
	deriveRequestColumns,
	type RequestInput
} from '$lib/server/schemas/requests'
import { buildApprovalChain } from './routing'
import { canAny } from '$lib/server/rbac'
import { computeLeaveTotalDays, assertLeaveBalance, assertLeaveEligibility } from './leave'
import { evictTombstonedBytes } from './documents'
import type { AuditContext } from '../types'

// Create a request and its resolved approval chain in one transaction. The chain
// comes from DEFAULT_ROUTING; the supervisor stage is only included when the
// employee actually has a reportsTo. currentStage starts at 0 (first pending step).
export async function createRequest(
	employeeId: string,
	organizationId: string,
	input: RequestInput,
	ctx: AuditContext
) {
	const parsed = requestSchema.parse(input)
	const cols = deriveRequestColumns(parsed)

	const employee = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true, reportsToId: true, startDate: true }
	})
	if (!employee) error(404, 'Employee not found')

	// LEAVE carries balance semantics: check the type's tenure gate, compute workdays,
	// verify balance up front, and stash totalDays into the payload so approval can deduct
	// it later. This is the only choke point all three filing paths (/leave/new, /requests,
	// and the v1 API) share, so the gate belongs here rather than in any one route.
	let payload: Record<string, unknown> = parsed
	if (parsed.type === 'LEAVE') {
		await assertLeaveEligibility(organizationId, parsed.leaveTypeId, employee.startDate)
		const totalDays = await computeLeaveTotalDays(organizationId, parsed.startDate, parsed.endDate)
		await assertLeaveBalance(
			employeeId,
			parsed.leaveTypeId,
			parsed.startDate.getFullYear(),
			totalDays
		)
		payload = { ...parsed, totalDays }
	}

	// Maker-checker chain (#134): when the filer is branch HR/Manager (MANAGE_HR) they
	// are the maker, so MAKE completes at file-time and the chain opens at VERIFY. An
	// employee filing their own request leaves MAKE for branch HR to act on first.
	const filerIsMaker = canAny(ctx.actorRoles, 'MANAGE_HR')
	const { steps, currentStage } = buildApprovalChain({
		attempt: 1,
		makerUserId: filerIsMaker ? ctx.actorId : null,
		decidedAt: new Date()
	})

	// One transaction: a failed audit write must not leave a filed request standing unrecorded.
	return await db.$transaction(async (tx) => {
		const created = await tx.request.create({
			data: {
				employeeId,
				type: parsed.type,
				status: 'PENDING',
				dateFrom: cols.dateFrom,
				dateTo: cols.dateTo,
				hours: cols.hours,
				reason: cols.reason,
				payload: payload as unknown as Prisma.InputJsonValue,
				currentStage,
				steps: { create: steps }
			},
			include: { steps: { orderBy: [{ attempt: 'asc' }, { stageIndex: 'asc' }] } }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'Request',
				entityId: created.id,
				newValue: { type: parsed.type, dateFrom: cols.dateFrom, stages: steps.length }
			},
			tx
		)

		return created
	})
}

interface RequestListParams {
	organizationId: string
	employeeId?: string
	/** Allow-list form, for callers that scope a list to the employees they may see (#275). */
	employeeIds?: string[]
	type?: RequestInput['type']
	status?: string
}

function requestListWhere(params: RequestListParams): Prisma.RequestWhereInput {
	return {
		employee: { organizationId: params.organizationId },
		// Both forms combine rather than overwrite. As two spreads onto the same key the allow-list
		// won, so a caller supplying both would have had its single-id filter silently widened to the
		// whole list — the fail-open direction, and the exact class of bug #275 is about.
		...(params.employeeId || params.employeeIds
			? {
					employeeId: {
						...(params.employeeId && { equals: params.employeeId }),
						...(params.employeeIds && { in: params.employeeIds })
					}
				}
			: {}),
		...(params.type && { type: params.type }),
		...(params.status && { status: params.status as never })
	}
}

export async function countRequests(params: RequestListParams) {
	return db.request.count({ where: requestListWhere(params) })
}

export async function listRequests(
	params: RequestListParams,
	pageArgs?: { skip: number; take: number }
) {
	return db.request.findMany({
		where: requestListWhere(params),
		include: {
			employee: { select: { id: true, firstName: true, lastName: true } },
			steps: { orderBy: { stageIndex: 'asc' } }
		},
		orderBy: { createdAt: 'desc' },
		...(pageArgs && { skip: pageArgs.skip, take: pageArgs.take })
	})
}

// #299: `documents` and `documentHistory` are DELIBERATELY DIFFERENT ARRAYS, derived from one
// unfiltered query.
//
//   documents        = the DOWNLOAD list. Tombstones EXCLUDED — there is nothing to download and
//                      nothing to act on, so the detail page's live list and its Remove/Verify
//                      controls read this one.
//   documentHistory  = the AUDIT view. Tombstones INCLUDED — it is what the "Removed documents"
//                      panel renders, and it is what actBlockedReason (+page.server.ts) reads so
//                      the page agrees with decide()'s F3 bar instead of contradicting the queue.
//
// Collapsing them into one array breaks AC-5 in one direction and the #283/F3 audit trail in the
// other, depending on which filter survives. This is the one derived-array site in #299 and it is
// the easiest place in the codebase to reintroduce the bug by "tidying up".
export async function getRequest(id: string, organizationId: string) {
	const req = await db.request.findFirst({
		where: { id, employee: { organizationId } },
		include: {
			employee: { select: { id: true, firstName: true, lastName: true } },
			steps: {
				orderBy: { stageIndex: 'asc' },
				include: { actor: { select: { id: true, email: true } } }
			},
			documents: {
				orderBy: { uploadedAt: 'asc' },
				include: { verifiedBy: { select: { id: true, email: true } } }
			}
		}
	})
	if (!req) return null
	return {
		...req,
		documents: req.documents.filter((d) => d.deletedAt === null),
		documentHistory: req.documents
	}
}

// Employee re-submits a RETURNED request. Append-only (#134): the prior attempt's steps
// stay as frozen history and a fresh attempt is created, re-entering at MAKE so branch HR
// re-checks the correction before it flows to verify/approve again.
export async function resubmitRequest(id: string, employeeId: string, ctx: AuditContext) {
	const req = await db.request.findFirst({
		where: { id, employeeId },
		include: { steps: { select: { attempt: true } } }
	})
	if (!req) error(404, 'Request not found')
	if (req.status !== 'RETURNED') error(400, 'Only returned requests can be re-submitted')

	const nextAttempt = Math.max(...req.steps.map((s) => s.attempt)) + 1
	// The requester is refiling, not a maker, so MAKE stays pending for branch HR.
	const { steps, currentStage } = buildApprovalChain({
		attempt: nextAttempt,
		makerUserId: null,
		decidedAt: new Date()
	})

	const updated = await db.$transaction(async (tx) => {
		await tx.approvalStep.createMany({ data: steps.map((s) => ({ ...s, requestId: id })) })
		const row = await tx.request.update({
			where: { id },
			data: { status: 'PENDING', currentStage }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Request',
				entityId: id,
				newValue: { status: 'PENDING', resubmittedAttempt: nextAttempt }
			},
			tx
		)
		return row
	})
	return updated
}

// Employee withdraws their own still-pending request.
export async function cancelRequest(id: string, employeeId: string, ctx: AuditContext) {
	const req = await db.request.findFirst({
		where: { id, employeeId },
		select: { id: true, status: true }
	})
	if (!req) error(404, 'Request not found')
	if (req.status !== 'PENDING' && req.status !== 'RETURNED') {
		error(400, 'Only pending or returned requests can be cancelled')
	}
	// The status flip and its audit entry share one transaction (#5): a failed audit write must not
	// leave a cancelled request standing unrecorded, which is what the bare update did before.
	const updated = await db.$transaction(async (tx) => {
		const row = await tx.request.update({ where: { id }, data: { status: 'CANCELLED' } })
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Request',
				entityId: id,
				newValue: { status: 'CANCELLED' }
			},
			tx
		)
		return row
	})

	// #299/D-6a: CANCELLED is terminal — there is no path back out of it (resubmitRequest requires
	// RETURNED, decide() requires PENDING) — so the tombstoned bytes go, all of them (keepNewest 0).
	//
	// Outside the transaction, and best-effort, on purpose — same reason as decide()'s eviction in
	// approvals.ts. A filesystem unlink is not rollback-able: run it inside the $transaction above
	// and a disk error rolls back a cancellation whose bytes are gone either way. Bytes are a
	// cleanup concern; the cancellation already succeeded.
	await evictTombstonedBytes(id, 0).catch((e) =>
		console.error('[storage] failed to evict tombstoned bytes for', id, e)
	)
	return updated
}

// Hard-delete a request; its approval steps and documents cascade (schema onDelete: Cascade).
// APPROVED requests are never deletable — final approval already moved leave balances and there is
// no reversal path here, so dropping the row would desync the balance. Non-privileged callers may
// delete only their own requests; HR_ADMIN / SUPER_ADMIN may delete any request in their org.
export async function deleteRequest(id: string, organizationId: string, ctx: AuditContext) {
	const req = await db.request.findFirst({
		where: { id, employee: { organizationId } },
		select: {
			id: true,
			status: true,
			type: true,
			employeeId: true,
			documents: { select: { storageKey: true } }
		}
	})
	if (!req) error(404, 'Request not found')

	const isPrivileged = canAny(ctx.actorRoles, 'ADMINISTER_HR_RECORDS')
	if (!isPrivileged) {
		const me = await db.employee.findUnique({
			where: { userId: ctx.actorId },
			select: { id: true }
		})
		if (!me || me.id !== req.employeeId) error(403, 'You can only delete your own requests')
	}
	if (req.status === 'APPROVED') error(409, 'Approved requests cannot be deleted')

	// The row delete and its audit entry share one transaction (#5): a failed audit write must not
	// leave a request deleted with no record of who deleted it.
	await db.$transaction(async (tx) => {
		await tx.request.delete({ where: { id } })
		await writeAuditLog(
			ctx,
			{
				action: 'DELETE',
				entityType: 'Request',
				entityId: id,
				oldValue: { type: req.type, status: req.status }
			},
			tx
		)
	})

	// Row cascade removed the document rows; sweep their bytes off disk too. Each unlink
	// is best-effort — the request is already gone, so one failed cleanup must not stop
	// the rest of the sweep.
	//
	// The sweep runs AFTER the transaction commits, never inside it: a filesystem unlink is not
	// rollback-able, so a failure late in the loop would roll back a delete whose bytes are already
	// destroyed.
	//
	// #299: the select above stays UNFILTERED — a tombstoned document's file must be swept here too,
	// or deleting the request orphans it permanently. The skip below is the already-evicted case
	// (storageKey nulled by evictTombstonedBytes), not a defensive nicety: that row genuinely no
	// longer claims a file.
	for (const d of req.documents) {
		if (!d.storageKey) continue
		await deleteStoredFile(d.storageKey).catch((e) =>
			console.error('[storage] failed to remove', d.storageKey, e)
		)
	}
	return { deleted: true }
}

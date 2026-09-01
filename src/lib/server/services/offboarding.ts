import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import type { ClearanceArea } from '@prisma/client'
import { writeAuditLog } from '$lib/server/audit'
import { CLEARANCE_AREAS } from '$lib/utils/clearance-area'
import type { AuditContext } from './types'

// ─── Offboarding checklist (#192) ─────────────────────────────────────────────
//
// The mirror of the onboarding checklist: an org-scoped, ordered template HR edits in
// Settings. Opening a separation copies the active items into that case's ClearanceItem
// rows, and the transition-notice email (#185) lists them. An org that has never
// configured a checklist falls back to these built-in defaults, so separations behave
// exactly as they did before the template existed.
export const DEFAULT_OFFBOARDING_ITEMS: { label: string; area: ClearanceArea }[] = [
	{ label: 'Return company equipment (laptop, phone, peripherals)', area: 'IT' },
	{ label: 'Revoke systems & email access', area: 'IT' },
	{ label: 'Settle outstanding loans & cash advances', area: 'FINANCE' },
	{ label: 'Return ID, access cards & keys', area: 'ADMIN' },
	{ label: 'Knowledge transfer & handover complete', area: 'IMMEDIATE_SUPERVISOR' },
	{ label: '201 file & exit documents complete', area: 'HR' }
]

export async function listOffboardingItems(organizationId: string) {
	return db.offboardingChecklistItem.findMany({
		where: { organizationId },
		orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
	})
}

/**
 * The clearance tasks a new separation seeds and the transition notice lists: the org's
 * active items in order, or the built-in defaults when none are configured. Returned as
 * plain {label, area} so both the separation seed and the email reuse one source.
 */
export async function clearanceTemplateForOrg(
	organizationId: string
): Promise<{ label: string; area: ClearanceArea; departmentId?: string | null }[]> {
	const items = await db.offboardingChecklistItem.findMany({
		where: { organizationId, isActive: true },
		orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
		select: { label: true, area: true, departmentId: true }
	})
	return items.length ? items : DEFAULT_OFFBOARDING_ITEMS
}

/**
 * Materialize the default items the first time HR opens the editor, so they have the
 * familiar clearance steps to reorder/edit. Idempotent — a no-op once any row exists.
 */
export async function ensureSeeded(organizationId: string) {
	const count = await db.offboardingChecklistItem.count({ where: { organizationId } })
	if (count > 0) return
	await db.offboardingChecklistItem.createMany({
		data: DEFAULT_OFFBOARDING_ITEMS.map((it, i) => ({
			organizationId,
			label: it.label,
			area: it.area,
			order: i,
			isActive: true
		}))
	})
}

export interface OffboardingItemInput {
	label: string
	area: ClearanceArea
	departmentId?: string | null
}

// `departmentId` arrives straight off a form field, so it is checked against the caller's own
// org before it is stored — otherwise one tenant can plant another tenant's department id.
// IMMEDIATE_SUPERVISOR is a relationship, not a department, so it never carries a pointer (#306);
// the rule lives here rather than in each caller so the two write paths cannot drift apart.
async function resolveDepartmentId(
	organizationId: string,
	area: ClearanceArea,
	departmentId?: string | null
) {
	if (area === 'IMMEDIATE_SUPERVISOR' || !departmentId) return null
	const dept = await db.department.findFirst({
		where: { id: departmentId, organizationId },
		select: { id: true }
	})
	if (!dept) error(400, 'Unknown department')
	return dept.id
}

export async function addItem(
	organizationId: string,
	input: OffboardingItemInput,
	ctx: AuditContext
) {
	const label = input.label.trim()
	const area = input.area
	if (!label) error(400, 'Label is required')
	if (!CLEARANCE_AREAS.includes(area)) error(400, 'A valid clearance area is required')
	const departmentId = await resolveDepartmentId(organizationId, area, input.departmentId)
	const max = await db.offboardingChecklistItem.aggregate({
		where: { organizationId },
		_max: { order: true }
	})
	const order = (max._max.order ?? -1) + 1
	return db.$transaction(async (tx) => {
		const created = await tx.offboardingChecklistItem.create({
			data: { organizationId, label, area, departmentId, order }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'OffboardingChecklistItem',
				entityId: created.id,
				newValue: { label, area, departmentId }
			},
			tx
		)
		return created
	})
}

export async function updateItem(
	organizationId: string,
	id: string,
	input: OffboardingItemInput,
	ctx: AuditContext
) {
	const existing = await db.offboardingChecklistItem.findFirst({
		where: { id, organizationId },
		select: { id: true }
	})
	if (!existing) error(404, 'Checklist item not found')
	const label = input.label.trim()
	const area = input.area
	if (!label) error(400, 'Label is required')
	if (!CLEARANCE_AREAS.includes(area)) error(400, 'A valid clearance area is required')
	const departmentId = await resolveDepartmentId(organizationId, area, input.departmentId)
	return db.$transaction(async (tx) => {
		const updated = await tx.offboardingChecklistItem.update({
			where: { id },
			data: { label, area, departmentId }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'OffboardingChecklistItem',
				entityId: id,
				newValue: { label, area, departmentId }
			},
			tx
		)
		return updated
	})
}

export async function toggleItem(organizationId: string, id: string, ctx: AuditContext) {
	const existing = await db.offboardingChecklistItem.findFirst({
		where: { id, organizationId },
		select: { id: true, isActive: true }
	})
	if (!existing) error(404, 'Checklist item not found')
	return db.$transaction(async (tx) => {
		const updated = await tx.offboardingChecklistItem.update({
			where: { id },
			data: { isActive: !existing.isActive }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'OffboardingChecklistItem',
				entityId: id,
				newValue: { isActive: updated.isActive }
			},
			tx
		)
		return updated
	})
}

export async function deleteItem(organizationId: string, id: string, ctx: AuditContext) {
	const existing = await db.offboardingChecklistItem.findFirst({
		where: { id, organizationId },
		select: { id: true }
	})
	if (!existing) error(404, 'Checklist item not found')
	return db.$transaction(async (tx) => {
		await tx.offboardingChecklistItem.delete({ where: { id } })
		await writeAuditLog(
			ctx,
			{ action: 'DELETE', entityType: 'OffboardingChecklistItem', entityId: id },
			tx
		)
	})
}

/** Persist a new ordering. `orderedIds` must be exactly the org's items, once each. */
export async function reorderItems(
	organizationId: string,
	orderedIds: string[],
	ctx: AuditContext
) {
	const items = await db.offboardingChecklistItem.findMany({
		where: { organizationId },
		select: { id: true }
	})
	const owned = new Set(items.map((i) => i.id))
	if (orderedIds.length !== owned.size || !orderedIds.every((id) => owned.has(id)))
		error(400, 'Invalid reorder payload')
	// One transaction: a failed audit write must not leave a reordering standing unrecorded.
	// Sequential updates rather than the batched array form, which has no `tx` to hand the
	// audit — the list is one org's checklist, so the count is small.
	await db.$transaction(async (tx) => {
		for (const [i, id] of orderedIds.entries()) {
			await tx.offboardingChecklistItem.update({ where: { id }, data: { order: i } })
		}

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'OffboardingChecklistItem',
				entityId: 'reorder',
				newValue: { order: orderedIds }
			},
			tx
		)
	})
}

/** Move one item up or down one slot. A no-op at the list edge. */
export async function moveItem(
	organizationId: string,
	id: string,
	direction: 'up' | 'down',
	ctx: AuditContext
) {
	const items = await db.offboardingChecklistItem.findMany({
		where: { organizationId },
		orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
		select: { id: true }
	})
	const idx = items.findIndex((i) => i.id === id)
	if (idx === -1) error(404, 'Checklist item not found')
	const swapWith = direction === 'up' ? idx - 1 : idx + 1
	if (swapWith < 0 || swapWith >= items.length) return // already at the edge
	const ordered = items.map((i) => i.id)
	;[ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]]
	await reorderItems(organizationId, ordered, ctx)
}

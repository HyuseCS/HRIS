import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import { Prisma, type InventoryStatus } from '@prisma/client'
import { writeAuditLog } from '$lib/server/audit'
import type { AuditContext } from './types'

// ─── Inventory registry (#114) ──────────────────────────────────────────────────
//
// A simple org-scoped asset/equipment/supplies registry. v1 is pure tracking. An item
// may be assigned to an employee; assignment and status are kept consistent (ASSIGNED
// requires an assignee; any other status clears it).

export const INVENTORY_STATUSES = ['IN_STOCK', 'ASSIGNED', 'RETIRED'] as const

export interface InventoryFilter {
	search?: string
	category?: string
	status?: string
}

export async function listInventory(organizationId: string, filter: InventoryFilter = {}) {
	const where: Prisma.InventoryItemWhereInput = { organizationId }

	const q = filter.search?.trim()
	if (q) {
		where.OR = [
			{ name: { contains: q, mode: 'insensitive' } },
			{ serialNumber: { contains: q, mode: 'insensitive' } },
			{ category: { contains: q, mode: 'insensitive' } },
			{ location: { contains: q, mode: 'insensitive' } }
		]
	}
	const cat = filter.category?.trim()
	if (cat) where.category = cat
	if (filter.status && (INVENTORY_STATUSES as readonly string[]).includes(filter.status)) {
		where.status = filter.status as InventoryStatus
	}

	return db.inventoryItem.findMany({
		where,
		include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
		orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
	})
}

/** Distinct category values for the filter dropdown. */
export async function listCategories(organizationId: string) {
	const rows = await db.inventoryItem.findMany({
		where: { organizationId },
		select: { category: true },
		distinct: ['category'],
		orderBy: { category: 'asc' }
	})
	return rows.map((r) => r.category)
}

/**
 * The status/assignee invariant (pure, unit-tested): an ASSIGNED item is held by exactly
 * one employee; any other status is unassigned. Returns the assignee to persist and
 * whether an assignee is missing (which the caller rejects).
 */
export function resolveAssignedTo(
	status: InventoryStatus,
	assignedToId: string | null
): { assignedToId: string | null; needsAssignee: boolean } {
	const clean = assignedToId?.trim() || null
	if (status === 'ASSIGNED') return { assignedToId: clean, needsAssignee: clean === null }
	return { assignedToId: null, needsAssignee: false }
}

export interface InventoryInput {
	name: string
	category: string
	quantity: number
	unit: string
	location: string | null
	status: InventoryStatus
	assignedToId: string | null
	serialNumber: string | null
	value: number | null
	notes: string | null
}

/**
 * Validate + normalize a payload. Enforces the status/assignee invariant: an ASSIGNED
 * item must name an employee (verified to be in the org); any other status is unassigned.
 */
async function normalize(organizationId: string, input: InventoryInput) {
	const name = input.name.trim()
	if (!name) error(400, 'Name is required')
	const category = input.category.trim() || 'Uncategorized'
	if (!Number.isFinite(input.quantity) || input.quantity < 0)
		error(400, 'Quantity must be zero or more')
	if (input.value != null && (!Number.isFinite(input.value) || input.value < 0))
		error(400, 'Value cannot be negative')

	const { assignedToId, needsAssignee } = resolveAssignedTo(input.status, input.assignedToId)
	if (needsAssignee) error(400, 'Select an employee to assign this item to.')
	if (assignedToId) {
		const emp = await db.employee.findFirst({
			where: { id: assignedToId, organizationId },
			select: { id: true }
		})
		if (!emp) error(404, 'Assigned employee not found')
	}

	return {
		name,
		category,
		quantity: Math.floor(input.quantity),
		unit: input.unit.trim() || 'pc',
		location: input.location?.trim() || null,
		status: input.status,
		assignedToId,
		serialNumber: input.serialNumber?.trim() || null,
		value: input.value ?? null,
		notes: input.notes?.trim() || null
	}
}

export async function createInventoryItem(
	organizationId: string,
	input: InventoryInput,
	ctx: AuditContext
) {
	const data = await normalize(organizationId, input)
	return db.$transaction(async (tx) => {
		const created = await tx.inventoryItem.create({ data: { organizationId, ...data } })
		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'InventoryItem',
				entityId: created.id,
				newValue: { name: data.name, category: data.category, status: data.status }
			},
			tx
		)
		return created
	})
}

export async function updateInventoryItem(
	organizationId: string,
	id: string,
	input: InventoryInput,
	ctx: AuditContext
) {
	const existing = await db.inventoryItem.findFirst({
		where: { id, organizationId },
		select: { id: true }
	})
	if (!existing) error(404, 'Inventory item not found')
	const data = await normalize(organizationId, input)
	return db.$transaction(async (tx) => {
		const updated = await tx.inventoryItem.update({ where: { id }, data })
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'InventoryItem',
				entityId: id,
				newValue: { name: data.name, status: data.status }
			},
			tx
		)
		return updated
	})
}

export async function deleteInventoryItem(organizationId: string, id: string, ctx: AuditContext) {
	const existing = await db.inventoryItem.findFirst({
		where: { id, organizationId },
		select: { id: true, name: true }
	})
	if (!existing) error(404, 'Inventory item not found')
	return db.$transaction(async (tx) => {
		await tx.inventoryItem.delete({ where: { id } })
		await writeAuditLog(
			ctx,
			{
				action: 'DELETE',
				entityType: 'InventoryItem',
				entityId: id,
				newValue: { name: existing.name }
			},
			tx
		)
	})
}

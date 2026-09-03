import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import { Prisma, type BranchStatus } from '@prisma/client'
import { writeAuditLog } from '$lib/server/audit'
import type { AuditContext } from './types'

// ─── Branches ───────────────────────────────────────────────────────────────────
//
// The food-service tenants' physical store registry (JoJo Potato / Sweetleaf). v1 is the
// registry plus Employee.branchId — no attendance/payroll/inventory rollups.
//
// Stores are CLOSED, never deleted, because employees reference them. A closed store keeps
// its roster (history) but stops accepting assignments and has no manager on duty, so there
// is deliberately no delete function here.

export const BRANCH_STATUSES = ['OPEN', 'CLOSED'] as const

export interface BranchFilter {
	search?: string
	status?: string
}

export interface BranchManagerResolution {
	/** Manager to persist on the branch. */
	managerId: string | null
	/** True when that employee's own Employee.branchId must be re-pointed at this branch. */
	reassignManager: boolean
}

/**
 * The manager/roster invariant (pure, unit-tested): an OPEN branch may name one manager, and
 * that manager is always on the branch's own roster — naming them *is* assigning them. A
 * CLOSED store has no manager on duty.
 *
 * `branchId` is the branch being written. On create it is the id of the row just inserted,
 * which is never the manager's current branch — so `reassignManager` comes back true and the
 * assignment side effect fires. Passing null there would silently leave a new manager off
 * their own roster.
 */
export function resolveBranchManager(
	status: BranchStatus,
	managerId: string | null,
	managerCurrentBranchId: string | null,
	branchId: string | null
): BranchManagerResolution {
	const clean = managerId?.trim() || null
	if (status === 'CLOSED' || !clean) return { managerId: null, reassignManager: false }
	return { managerId: clean, reassignManager: managerCurrentBranchId !== branchId }
}

/**
 * Options for a branch picker: every OPEN branch, plus the employee's current branch even if
 * it has since CLOSED — so re-saving a 201 file never silently drops the assignment.
 */
export function selectableBranches<T extends { id: string; status: BranchStatus }>(
	branches: T[],
	currentBranchId: string | null
): T[] {
	return branches.filter((b) => b.status === 'OPEN' || b.id === currentBranchId)
}

/** Org-scoped list, OPEN first then alphabetical, with the manager for display. */
export async function listBranches(organizationId: string, filter: BranchFilter = {}) {
	const where: Prisma.BranchWhereInput = { organizationId }

	const q = filter.search?.trim()
	if (q) {
		where.OR = [
			{ name: { contains: q, mode: 'insensitive' } },
			{ address: { contains: q, mode: 'insensitive' } },
			{ contactPhone: { contains: q, mode: 'insensitive' } }
		]
	}
	if (filter.status && (BRANCH_STATUSES as readonly string[]).includes(filter.status)) {
		where.status = filter.status as BranchStatus
	}

	return db.branch.findMany({
		where,
		include: { manager: { select: { id: true, firstName: true, lastName: true } } },
		// BranchStatus declares OPEN before CLOSED, so 'asc' floats open stores to the top.
		orderBy: [{ status: 'asc' }, { name: 'asc' }]
	})
}

/**
 * Active headcount per branch, plus the unassigned count. One groupBy rather than a filtered
 * relation `_count`, which is still preview-gated (filteredRelationCount) in Prisma 5.22 —
 * don't "simplify" this into an include.
 */
export async function branchHeadcounts(organizationId: string) {
	const rows = await db.employee.groupBy({
		by: ['branchId'],
		where: { organizationId, employmentStatus: 'ACTIVE' },
		_count: { _all: true }
	})
	const byBranch = new Map<string, number>()
	let unassigned = 0
	for (const r of rows) {
		if (r.branchId) byBranch.set(r.branchId, r._count._all)
		else unassigned = r._count._all
	}
	return { byBranch, unassigned }
}

/** Assignable branches for the 201-file picker; the caller adds back the current one. */
export async function listAssignableBranches(organizationId: string) {
	return db.branch.findMany({
		where: { organizationId },
		select: { id: true, name: true, status: true },
		orderBy: [{ status: 'asc' }, { name: 'asc' }]
	})
}

export interface BranchInput {
	name: string
	address: string | null
	contactPhone: string | null
	status: BranchStatus
	managerId: string | null
	notes: string | null
}

/**
 * Validate + normalize. Resolves the named manager to an employee of THIS org (a forged id
 * from another tenant 404s here) and reports their current branch so the caller can apply the
 * manager/roster invariant against the real branch id.
 */
async function normalize(organizationId: string, input: BranchInput) {
	const name = input.name.trim()
	if (!name) error(400, 'Branch name is required')

	const managerId = input.managerId?.trim() || null
	let managerCurrentBranchId: string | null = null
	if (managerId) {
		const mgr = await db.employee.findFirst({
			where: { id: managerId, organizationId },
			select: { id: true, branchId: true }
		})
		if (!mgr) error(404, 'Branch manager not found')
		managerCurrentBranchId = mgr.branchId
	}

	return {
		data: {
			name,
			address: input.address?.trim() || null,
			contactPhone: input.contactPhone?.trim() || null,
			status: input.status,
			notes: input.notes?.trim() || null
		},
		managerId,
		managerCurrentBranchId
	}
}

export async function createBranch(organizationId: string, input: BranchInput, ctx: AuditContext) {
	const { data, managerId, managerCurrentBranchId } = await normalize(organizationId, input)
	try {
		return await db.$transaction(async (tx) => {
			const created = await tx.branch.create({ data: { organizationId, ...data } })
			// The invariant needs the real id — on create the manager is never already on this
			// branch, so this is what puts them on their own roster.
			const mgr = resolveBranchManager(data.status, managerId, managerCurrentBranchId, created.id)
			if (mgr.managerId) {
				await tx.branch.update({ where: { id: created.id }, data: { managerId: mgr.managerId } })
				if (mgr.reassignManager) {
					await tx.employee.update({
						where: { id: mgr.managerId },
						data: { branchId: created.id }
					})
				}
			}
			await writeAuditLog(
				ctx,
				{
					action: 'CREATE',
					entityType: 'Branch',
					entityId: created.id,
					newValue: { name: data.name, status: data.status, managerId: mgr.managerId }
				},
				tx
			)
			return created
		})
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
			error(409, `Branch "${input.name.trim()}" already exists`)
		throw e
	}
}

export async function updateBranch(
	organizationId: string,
	id: string,
	input: BranchInput,
	ctx: AuditContext
) {
	const existing = await db.branch.findFirst({
		where: { id, organizationId },
		select: { id: true }
	})
	if (!existing) error(404, 'Branch not found')

	const { data, managerId, managerCurrentBranchId } = await normalize(organizationId, input)
	const mgr = resolveBranchManager(data.status, managerId, managerCurrentBranchId, id)
	try {
		return await db.$transaction(async (tx) => {
			const updated = await tx.branch.update({
				where: { id },
				data: { ...data, managerId: mgr.managerId }
			})
			if (mgr.managerId && mgr.reassignManager) {
				await tx.employee.update({ where: { id: mgr.managerId }, data: { branchId: id } })
			}
			await writeAuditLog(
				ctx,
				{
					action: 'UPDATE',
					entityType: 'Branch',
					entityId: id,
					newValue: { name: data.name, status: data.status, managerId: mgr.managerId }
				},
				tx
			)
			return updated
		})
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
			error(409, `Branch "${input.name.trim()}" already exists`)
		throw e
	}
}

/**
 * Soft delete: OPEN ⇄ CLOSED. Closing clears the manager (nobody is on duty at a closed
 * store) but deliberately leaves the roster alone — its crew stay on record.
 */
export async function toggleBranchStatus(organizationId: string, id: string, ctx: AuditContext) {
	return db.$transaction(async (tx) => {
		// Read inside the transaction: this row is both the 404 guard and the `oldValue`, so
		// reading it outside lets two concurrent toggles log the same prior status. A 404 thrown
		// here rolls the (still empty) transaction back and rethrows unchanged.
		const existing = await tx.branch.findFirst({
			where: { id, organizationId },
			select: { id: true, status: true }
		})
		if (!existing) error(404, 'Branch not found')

		const status: BranchStatus = existing.status === 'OPEN' ? 'CLOSED' : 'OPEN'
		const updated = await tx.branch.update({
			where: { id },
			data: { status, ...(status === 'CLOSED' && { managerId: null }) }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Branch',
				entityId: id,
				oldValue: { status: existing.status },
				newValue: { status }
			},
			tx
		)
		return updated
	})
}

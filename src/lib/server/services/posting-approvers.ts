import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import { writeAuditLog } from '$lib/server/audit'
import type { AuditContext } from './types'

// ─── Per-department posting approvers (#195) ──────────────────────────────────
//
// A job posting must be approved before it goes OPEN. HR maps each department to the
// employee who signs off its postings (e.g. the Senior Developer for Software Developers).
// A department with no mapping falls back to HR — resolvePostingApproverId returns null and
// the approval guard lets any MANAGE_HR user act.

export async function listPostingApprovers(organizationId: string) {
	const [departments, mappings] = await Promise.all([
		db.department.findMany({
			where: { organizationId },
			orderBy: { name: 'asc' },
			select: { id: true, name: true }
		}),
		db.postingApprover.findMany({ where: { organizationId } })
	])
	// Resolve each mapping's approver name for display.
	const approverIds = mappings.map((m) => m.approverId)
	const approvers = approverIds.length
		? await db.employee.findMany({
				where: { id: { in: approverIds } },
				select: { id: true, firstName: true, lastName: true }
			})
		: []
	const nameById = new Map(approvers.map((a) => [a.id, `${a.firstName} ${a.lastName}`]))
	const approverByDept = new Map(mappings.map((m) => [m.departmentId, m]))

	return departments.map((d) => {
		const m = approverByDept.get(d.id)
		return {
			departmentId: d.id,
			departmentName: d.name,
			approverId: m?.approverId ?? null,
			approverName: m ? (nameById.get(m.approverId) ?? 'Unknown') : null
		}
	})
}

/** The employee who approves the given department's postings, or null when HR is the fallback. */
export async function resolvePostingApproverId(
	organizationId: string,
	departmentId: string
): Promise<string | null> {
	const m = await db.postingApprover.findUnique({
		where: { organizationId_departmentId: { organizationId, departmentId } },
		select: { approverId: true }
	})
	return m?.approverId ?? null
}

export async function setPostingApprover(
	organizationId: string,
	departmentId: string,
	approverId: string,
	ctx: AuditContext
) {
	const [dept, emp] = await Promise.all([
		db.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } }),
		db.employee.findFirst({
			where: { id: approverId, organizationId },
			select: { id: true }
		})
	])
	if (!dept) error(404, 'Department not found')
	if (!emp) error(404, 'Approver must be an employee in this organization')

	const saved = await db.postingApprover.upsert({
		where: { organizationId_departmentId: { organizationId, departmentId } },
		update: { approverId },
		create: { organizationId, departmentId, approverId }
	})
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'PostingApprover',
		entityId: saved.id,
		newValue: { departmentId, approverId }
	})
	return saved
}

export async function clearPostingApprover(
	organizationId: string,
	departmentId: string,
	ctx: AuditContext
) {
	await db.postingApprover.deleteMany({ where: { organizationId, departmentId } })
	await writeAuditLog(ctx, {
		action: 'DELETE',
		entityType: 'PostingApprover',
		entityId: departmentId,
		newValue: { departmentId }
	})
}

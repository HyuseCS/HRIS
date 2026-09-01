import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { assertNotSelf } from '../employee-access'
import type { AuditContext } from '../types'
import { Prisma, type Role } from '@prisma/client'

interface PositionInput {
	title: string
	level?: number
	departmentId?: string
	salaryGradeId?: string | null
	isActive?: boolean
}

export async function listPositions(organizationId: string) {
	return db.position.findMany({
		where: { organizationId },
		include: {
			department: { select: { id: true, name: true } },
			salaryGrade: { select: { id: true, name: true } },
			_count: { select: { employees: true } }
		},
		orderBy: [{ level: 'asc' }, { title: 'asc' }]
	})
}

export async function getPosition(id: string, organizationId: string) {
	const position = await db.position.findFirst({
		where: { id, organizationId },
		include: {
			department: { select: { id: true, name: true } },
			salaryGrade: { select: { id: true, name: true } },
			_count: { select: { employees: true } }
		}
	})
	if (!position) error(404, 'Position not found')
	return position
}

export async function createPosition(
	organizationId: string,
	data: PositionInput,
	ctx: AuditContext
) {
	try {
		// Mutation + audit share a transaction so a failed audit write rolls back the position.
		return await db.$transaction(async (tx) => {
			const position = await tx.position.create({
				data: {
					organizationId,
					title: data.title,
					level: data.level,
					departmentId: data.departmentId,
					salaryGradeId: data.salaryGradeId ?? undefined
				}
			})

			await writeAuditLog(
				ctx,
				{
					action: 'CREATE',
					entityType: 'Position',
					entityId: position.id,
					newValue: { title: data.title, level: data.level, departmentId: data.departmentId }
				},
				tx
			)

			return position
		})
	} catch (err) {
		// Prisma P2002 = unique constraint violation on @@unique([organizationId, title])
		if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
			error(409, 'A position with this title already exists.')
		}
		throw err
	}
}

export async function updatePosition(
	id: string,
	organizationId: string,
	data: PositionInput,
	ctx: AuditContext
) {
	const existing = await db.position.findFirst({
		where: { id, organizationId }
	})
	if (!existing) error(404, 'Position not found')

	try {
		return await db.$transaction(async (tx) => {
			const position = await tx.position.update({
				where: { id },
				data: {
					title: data.title,
					level: data.level,
					departmentId: data.departmentId,
					salaryGradeId: data.salaryGradeId,
					isActive: data.isActive
				}
			})

			await writeAuditLog(
				ctx,
				{
					action: 'UPDATE',
					entityType: 'Position',
					entityId: id,
					oldValue: {
						title: existing.title,
						level: existing.level,
						departmentId: existing.departmentId,
						salaryGradeId: existing.salaryGradeId,
						isActive: existing.isActive
					},
					newValue: {
						title: data.title,
						level: data.level,
						departmentId: data.departmentId,
						salaryGradeId: data.salaryGradeId,
						isActive: data.isActive
					}
				},
				tx
			)

			return position
		})
	} catch (err) {
		if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
			error(409, 'A position with this title already exists.')
		}
		throw err
	}
}

export async function getOrgChart(organizationId: string) {
	return db.department.findMany({
		where: { organizationId },
		select: {
			id: true,
			name: true,
			parentDepartmentId: true,
			employees: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					jobTitle: true,
					reportsToId: true
				},
				orderBy: { lastName: 'asc' }
			}
		},
		orderBy: { name: 'asc' }
	})
}

export async function listOrgUsers(organizationId: string) {
	const users = await db.user.findMany({
		where: { organizationId },
		select: {
			id: true,
			email: true,
			roles: true,
			isActive: true,
			employee: {
				select: { firstName: true, lastName: true }
			}
		},
		orderBy: { email: 'asc' }
	})

	return users.map((u) => ({
		id: u.id,
		email: u.email,
		roles: u.roles,
		isActive: u.isActive,
		employeeName: u.employee ? `${u.employee.lastName}, ${u.employee.firstName}` : null
	}))
}

// Roles an organization must never be left without an active holder of, because only a holder of
// that same role can grant it back. SUPER_ADMIN has been covered since #160; CEO joins it now that
// #248 makes the role assignable through the app — MANAGE_USER_ROLES is CEO-exclusive, so an org
// that loses its last CEO has no in-app way to appoint another. A label per role, not a bare list,
// so the 409 names the role the caller was actually looking at.
const IRREPLACEABLE_ROLES: Partial<Record<Role, string>> = {
	SUPER_ADMIN: 'super admin',
	CEO: 'CEO'
}

// Call before any write that strips `target` of their role or deactivates them. Must run inside
// the same transaction as that write (see setUserRoles/setUserActive) — counting holders and then
// writing as two separate queries is a TOCTOU race between two concurrent admin requests.
//
// Holders are counted per organization the target is reachable from: their home org AND every org
// they hold a membership in — not just the org the write was issued through. The seeded CEO
// belongs to all three tenants (#131) via membership while User.organizationId names only one; a
// check scoped to a single org either false-409s a safe demotion (if that org isn't the target's
// home org) or, the reverse gap, misses that the target is another org's *only* reachable holder
// (if that org is neither the acting org nor checked at all). Membership is the tenant boundary
// everywhere else too (api/v1/session/switch-org validates against it before currentOrgId
// changes).
//
// Scope note: offboarding deactivates the user account directly (services/separation.ts,
// services/employees.ts) and does NOT pass through here. That is a pre-existing gap in #160's
// guard, inherited rather than introduced by #248, and recoverable by reactivation.
//
// `roles` is a set, so the check is per-role rather than on a single primary role (#282): every
// irreplaceable role the target is about to LOSE is counted separately. `newRoles` is the set they
// will hold afterwards — empty for a deactivation, which loses all of them.
async function assertNotLastOfRole(
	tx: Prisma.TransactionClient,
	target: { id: string; organizationId: string; roles: Role[]; isActive: boolean },
	newRoles: Role[] = []
) {
	if (!target.isActive) return

	const lost = target.roles.filter((r) => IRREPLACEABLE_ROLES[r] && !newRoles.includes(r))
	if (lost.length === 0) return

	const memberships = await tx.userOrganization.findMany({
		where: { userId: target.id },
		select: { organizationId: true }
	})
	const affectedOrgIds = new Set([
		target.organizationId,
		...memberships.map((m) => m.organizationId)
	])

	// #283: collect EVERY stranded role before refusing. Multi-role makes one user the sole holder
	// of both SUPER_ADMIN and CEO, and throwing on the first one walks them into a second refusal
	// after they've already fixed the one they were told about. Name them all in one 409.
	// `break` on the first stranding org so a role stranded in two orgs is still named once.
	const stranded: string[] = []
	for (const role of lost) {
		for (const organizationId of affectedOrgIds) {
			const otherActiveHolders = await tx.user.count({
				where: {
					roles: { has: role },
					isActive: true,
					id: { not: target.id },
					OR: [{ organizationId }, { memberships: { some: { organizationId } } }]
				}
			})
			if (otherActiveHolders === 0) {
				stranded.push(IRREPLACEABLE_ROLES[role] as string)
				break
			}
		}
	}
	if (stranded.length > 0) {
		error(409, `Cannot remove the last active ${stranded.join(' and ')} from the organization.`)
	}
}

export async function setUserRoles(
	userId: string,
	organizationId: string,
	newRoles: Role[],
	ctx: AuditContext
) {
	// GUARDRAIL: the caller must actually hold MANAGE_USER_ROLES. This writer had no capability
	// check at all — its sole enforcement was the two routes, which makes it the one self-amplifying
	// capability (it can grant itself) guarded only at the route layer. First statement on purpose,
	// above the self-check: an unauthorized caller must not learn whether the target exists or what
	// role they hold.
	requireAnyCapability(ctx.actorRoles, 'MANAGE_USER_ROLES')

	// GUARDRAIL: separation of duties — nobody sets their own role. This lived in the roles form
	// action and again in the v1 PATCH twin, but never in this writer, so the protection was two
	// copies of a rule the service itself did not know: a third caller would have inherited none of
	// it. Enforced here, both routes are covered once and any future caller is covered by default.
	if (userId === ctx.actorId) error(403, 'You cannot change your own role.')

	// GUARDRAIL (#283/D4): a role-less user can authenticate, holds no capability, and can never be
	// repaired — assertNotLastOfRole can never be satisfied to give one back. The database default
	// for this column is `[]` and there is no check constraint behind it (db push cannot express
	// one), so this refusal and the request schemas are the whole enforcement.
	//
	// Dedupe is deliberate: the multi-select cannot post duplicates but the JSON API can, and a
	// duplicated set would write a nonsense array and a misleading audit entry.
	const roles = [...new Set(newRoles)]
	if (roles.length === 0) error(400, 'A user must keep at least one role.')

	// The target read, the last-holder count, and the write are wrapped in one serializable
	// transaction so two concurrent admin requests can't both read "another holder exists" and
	// both proceed — Serializable makes Prisma throw (P2034) on that conflict instead of letting
	// both writes land.
	const updated = await db.$transaction(
		async (tx) => {
			// GUARDRAIL: user must belong to the same organization.
			const existing = await tx.user.findFirst({
				where: { id: userId, organizationId }
			})
			if (!existing) error(404, 'User not found')

			// GUARDRAIL: don't strip the last active super admin — or, since #248, the last active
			// CEO. Keyed on the roles LOST (see assertNotLastOfRole), so re-saving an unchanged set
			// is never blocked and the caller needs no branch of its own: nothing lost means it
			// returns before it queries anything.
			await assertNotLastOfRole(tx, existing, roles)

			// `roles` is the set every capability check reads (#282: the scalar `role` is gone).
			// #283: this screen assigns the whole set, so the write replaces it wholesale — which
			// is what the caller already means by sending a set.
			const updated = await tx.user.update({
				where: { id: userId },
				data: { roles }
			})

			await writeAuditLog(
				ctx,
				{
					action: 'UPDATE',
					entityType: 'User',
					entityId: userId,
					oldValue: { roles: existing.roles },
					// #283/Q4: both sides are now the `roles` set, so an entry can be read without knowing
					// which side of the change it fell on. Historical entries keep the singular `role` key
					// and are deliberately NOT backfilled — rewriting an audit trail to look consistent is
					// worse than a trail that shows its own history.
					newValue: { roles: updated.roles }
				},
				tx
			)

			return updated
		},
		{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
	)

	return updated
}

export async function setUserActive(
	userId: string,
	organizationId: string,
	isActive: boolean,
	ctx: AuditContext
) {
	// GUARDRAIL: as with setUserRoles — nobody flips their own account. Blocks both directions, as
	// the route check it replaces did; self-reactivation is unreachable anyway, since an inactive
	// user cannot hold a session to make the call.
	if (userId === ctx.actorId) error(403, 'You cannot deactivate your own account.')

	// See setUserRoles: same atomicity reasoning — target read, holder count and write share one
	// serializable transaction so the count can't go stale between two concurrent requests.
	const updated = await db.$transaction(
		async (tx) => {
			const existing = await tx.user.findFirst({
				where: { id: userId, organizationId }
			})
			if (!existing) error(404, 'User not found')

			// GUARDRAIL: don't deactivate the last active super admin or CEO (#248) — deactivating
			// the only CEO freezes role management org-wide, since MANAGE_USER_ROLES is
			// CEO-exclusive.
			if (!isActive) {
				await assertNotLastOfRole(tx, existing)
			}

			const updated = await tx.user.update({
				where: { id: userId },
				data: { isActive }
			})

			await writeAuditLog(
				ctx,
				{
					action: 'UPDATE',
					entityType: 'User',
					entityId: userId,
					oldValue: { isActive: existing.isActive },
					newValue: { isActive }
				},
				tx
			)

			return updated
		},
		{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
	)

	return updated
}

// ─── Employee ↔ position assignment ───────────────────────────────────────────

export async function listAssignableEmployees(organizationId: string) {
	const employees = await db.employee.findMany({
		where: { organizationId },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			jobTitle: true,
			employmentStatus: true,
			positionId: true,
			position: { select: { title: true } },
			department: { select: { name: true } }
		},
		orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
	})

	return employees.map((e) => ({
		id: e.id,
		name: `${e.lastName}, ${e.firstName}`,
		jobTitle: e.jobTitle,
		employmentStatus: e.employmentStatus,
		positionId: e.positionId,
		positionTitle: e.position?.title ?? null,
		departmentName: e.department?.name ?? null
	}))
}

export async function assignEmployeePosition(
	employeeId: string,
	organizationId: string,
	positionId: string | null,
	ctx: AuditContext
) {
	const employee = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true, positionId: true, userId: true }
	})
	if (!employee) error(404, 'Employee not found')

	// A position IS an employment term, so the same separation of duties applies here as on the 201
	// file: `updateEmployee` already refuses a self-edit of jobTitle/departmentId/employmentStatus
	// (#298). This is the second door onto the same kind of change — without it, anyone holding
	// MANAGE_HR could promote themselves from Settings → Org (#308).
	assertNotSelf(ctx.actorId, employee)

	// If a position is given, it must belong to the same organization.
	if (positionId) {
		const position = await db.position.findFirst({
			where: { id: positionId, organizationId },
			select: { id: true }
		})
		if (!position) error(404, 'Position not found')
	}

	return await db.$transaction(async (tx) => {
		const updated = await tx.employee.update({
			where: { id: employeeId },
			data: { positionId }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Employee',
				entityId: employeeId,
				oldValue: { positionId: employee.positionId },
				newValue: { positionId }
			},
			tx
		)

		return updated
	})
}

// ─── Reporting hierarchy (org chart) ──────────────────────────────────────────

// Flat list of employees with their manager link, for building the reporting
// tree client-side. Only ACTIVE-org employees are surfaced.
export async function getReportingNodes(organizationId: string) {
	const employees = await db.employee.findMany({
		where: { organizationId },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			jobTitle: true,
			reportsToId: true,
			employmentStatus: true,
			department: { select: { name: true } },
			position: { select: { title: true } }
		},
		orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
	})

	return employees.map((e) => ({
		id: e.id,
		name: `${e.firstName} ${e.lastName}`,
		jobTitle: e.jobTitle,
		reportsToId: e.reportsToId,
		employmentStatus: e.employmentStatus,
		departmentName: e.department?.name ?? null,
		positionTitle: e.position?.title ?? null
	}))
}

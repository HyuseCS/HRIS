/**
 * Object-level access control for employee records (#228).
 *
 * The bug this exists to prevent: `MANAGER` holds `MANAGE_HR` (#133 made them on-branch HR) AND
 * ranks level with `HR_ADMIN`, so a guard written as `requireMinRole('MANAGER')` plus
 * `if (!can(role, 'MANAGE_HR'))` describes an EMPTY set — the two role lists are identical. Both
 * object-level checks written that way never ran, and every MANAGER could read and modify (and
 * reveal the salary, government IDs and bank details of) every employee in their tenant.
 *
 * The rule is a union because the tenants are shaped differently: branches exist only for the
 * food-service orgs (`isFoodServiceOrg`), while elsewhere a MANAGER is a department head whose
 * people simply report to them. So a MANAGER may reach an employee who is
 *   - in a branch they manage (`Branch.managerId`), or
 *   - one of their reports, primary or additional (#176), or
 *   - themselves.
 * `HR_ADMIN` / `CEO` / `SUPER_ADMIN` hold `ADMINISTER_HR_ORGWIDE` and are unrestricted.
 */

import { error } from '@sveltejs/kit'
import type { Role } from '@prisma/client'
import { db } from '$lib/server/db'
import { canAny } from '$lib/rbac'
import { listReportIdsFor } from './supervisors'

const DENIED = 'You can only manage your own team or a branch you manage.'

export interface EmployeeAccessActor {
	id: string
	/** #247: authority comes from every role the actor holds, so the full set is required. */
	roles: Role[]
	organizationId: string
}

/** True if this actor may read/modify that employee record. Org scoping is the caller's job. */
export async function canTouchEmployee(
	user: EmployeeAccessActor,
	employeeId: string
): Promise<boolean> {
	if (canAny(user.roles, 'ADMINISTER_HR_ORGWIDE')) return true

	const self = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
	// A user with HR-ish rank but no employee record of their own has no team and no branch, so
	// there is nothing they may reach. Fail closed.
	if (!self) return false
	if (self.id === employeeId) return true

	const [reportIds, managedBranches] = await Promise.all([
		listReportIdsFor(self.id),
		db.branch.findMany({
			where: { managerId: self.id, organizationId: user.organizationId },
			select: { id: true }
		})
	])
	const isReport = reportIds.includes(employeeId)
	if (!isReport && managedBranches.length === 0) return false

	// Org-scoped for BOTH paths, not just the branch one. `listReportIdsFor` matches on
	// `reportsToId`/`EmployeeSupervisor` alone, with no org filter of its own. Every writer of
	// `reportsToId` validates the manager's org since #235, but a row written before that can still
	// point across tenants, so this stays as the fail-closed backstop: an employee outside the
	// actor's org is unreachable however they relate.
	const target = await db.employee.findFirst({
		where: { id: employeeId, organizationId: user.organizationId },
		select: { branchId: true }
	})
	if (!target) return false
	return isReport || managedBranches.some((b) => b.id === target.branchId)
}

/**
 * The employee ids this actor may see in a roster, or `null` for "everyone in the org" — the
 * list-shaped counterpart to `canTouchEmployee`, for filtering rather than admitting one record.
 *
 * `null` rather than "all the ids" on purpose: HR reads the roster unfiltered, and materialising
 * every id just to feed it back as an `IN (…)` would scale with headcount for no benefit.
 *
 * Kept in step with `canTouchEmployee` by construction — same three clauses, same order — so the
 * list can never show a row whose 201 file then 403s. `employee-access.test.ts` pins that.
 */
export async function listVisibleEmployeeIds(user: EmployeeAccessActor): Promise<string[] | null> {
	if (canAny(user.roles, 'ADMINISTER_HR_ORGWIDE')) return null

	const self = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
	if (!self) return []

	const [reportIds, managedBranches] = await Promise.all([
		listReportIdsFor(self.id),
		db.branch.findMany({
			where: { managerId: self.id, organizationId: user.organizationId },
			select: { id: true }
		})
	])

	const visible = new Set([self.id, ...reportIds])
	if (managedBranches.length > 0) {
		const staff = await db.employee.findMany({
			where: {
				branchId: { in: managedBranches.map((b) => b.id) },
				organizationId: user.organizationId
			},
			select: { id: true }
		})
		for (const e of staff) visible.add(e.id)
	}
	// Org-scoped: a report row written before #235 can still point across tenants, and the roster
	// must not surface an employee from another organization.
	const inOrg = await db.employee.findMany({
		where: { id: { in: [...visible] }, organizationId: user.organizationId },
		select: { id: true }
	})
	return inOrg.map((e) => e.id)
}

export const SELF_ACTION_DENIED =
	'You cannot record pay or employment changes on your own record — ask another admin to do it.'

/**
 * Separation of duties: nobody writes their own pay or employment terms.
 *
 * A different question from `canTouchEmployee`, which asks whether a record is in the actor's
 * *scope* and deliberately answers yes to one's own file — and which HR_ADMIN / CEO / SUPER_ADMIN
 * skip entirely via `ADMINISTER_HR_ORGWIDE`. So scope never blocked self-dealing, and because
 * MANAGER ranks level with HR_ADMIN in `ROLE_HIERARCHY`, every `requireMinRole('HR_ADMIN')` writer
 * on the 201 file was reachable by any manager against their own record.
 *
 * Enforced in the service, not the route, so the form action and the v1 API twin are covered by one
 * check — the same placement `offboardEmployee` already uses for the self-offboard case.
 */
export function assertNotSelf(actorUserId: string, target: { userId: string }): void {
	if (target.userId === actorUserId) error(403, SELF_ACTION_DENIED)
}

/**
 * Org-scoped employee lookup returning just what `assertNotSelf` needs. Shared by the pay writers
 * (earnings, deductions, loans), which each carried a byte-identical copy.
 */
export async function requireEmployee(employeeId: string, organizationId: string) {
	const e = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true, userId: true }
	})
	if (!e) error(404, 'Employee not found')
	return e
}

/** Throwing form for route guards. 403 — the record may well exist, the actor just can't have it. */
export async function assertCanTouchEmployee(
	user: EmployeeAccessActor,
	employeeId: string
): Promise<void> {
	if (!(await canTouchEmployee(user, employeeId))) error(403, DENIED)
}

/**
 * The employee ids whose PAY this actor may see — payroll run entries, the payroll register, and
 * anything else that lists compensation per employee (#249).
 *
 * `null` means unrestricted; an array is the exact allow-list. Same contract as
 * `listVisibleEmployeeIds`, and it delegates there for the scoped case, so a manager's pay view and
 * their roster view can never disagree about who their team is.
 *
 * The one difference is who counts as unrestricted. `listVisibleEmployeeIds` opens up for
 * `ADMINISTER_HR_ORGWIDE` (HR_ADMIN / CEO / SUPER_ADMIN), which would leave PAYROLL_OFFICER and
 * FINANCE — the two roles that exist to read payroll — scoped down to a reporting line they do not
 * have, locking them out of every run. `VIEW_PAY_ORGWIDE` is that set plus those two.
 */
export async function listVisiblePayEmployeeIds(
	user: EmployeeAccessActor
): Promise<string[] | null> {
	if (canAny(user.roles, 'VIEW_PAY_ORGWIDE')) return null
	return listVisibleEmployeeIds(user)
}

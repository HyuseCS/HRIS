import { describe, it, expect, vi, beforeEach } from 'vitest'
import { error } from '@sveltejs/kit'
import type { Role } from '@prisma/client'

/**
 * #178 SPEC AC2 — an employee's evaluation template comes from the explicit
 * `Employee.assignedTemplateId` field and from NOTHING else.
 *
 * Two claims are pinned here, both against the route's real `load` / `actions` EXPORTS (the only
 * things SvelteKit ever calls — #290 shipped on an assertion that read a handler body instead):
 *
 *  1. **No inference.** The employee below sits in the "Sales" department with the position
 *     "Account Executive", and the org has an ACTIVE template literally named "Account
 *     Executive". If a later reader ever "helpfully" falls back to department / position / role,
 *     `load` starts returning that template's id and the first test goes red. A guessed template
 *     looks done and is wrong, which is worse than a visible unassigned employee (plan §10.1).
 *  2. **The guard.** `ADMINISTER_HR_ORGWIDE` — NOT `MANAGE_HR`, which holds MANAGER (#133) —
 *     plus `assertCanTouchEmployee`, plus an org filter on the write itself.
 *
 * MUTATION-CHECKED (plan §11.2): with the action's capability swapped to `MANAGE_HR` the two
 * MANAGER cases go red; with `organizationId` dropped from the `updateMany` where-clause the
 * cross-tenant case goes red. Both recorded in the Phase 4 report.
 *
 * NOTE on the second guard: `scopedToEmployee` already applies `assertCanTouchEmployee` to every
 * action on this page, so the action's own literal call is defence-in-depth — removing that one
 * line alone cannot go red here. What the whose-record tests below actually pin is the observable
 * behaviour: a MANAGER never reaches the write, and a write never crosses a tenant boundary.
 */

const ORG = 'org_seed'
const OTHER_ORG = 'org_other'
const EMP = 'emp-1'

const { assertCanTouchEmployee, getEmployee, listTemplates, writeAuditLog, updateMany, findFirst } =
	vi.hoisted(() => ({
		assertCanTouchEmployee: vi.fn(),
		getEmployee: vi.fn(),
		listTemplates: vi.fn(),
		writeAuditLog: vi.fn(),
		updateMany: vi.fn(),
		findFirst: vi.fn()
	}))

// The one fake row. `updateMany` honours the where-clause the way SQL does — an absent filter is
// no filter — so deleting the org filter from the action changes this mock's answer.
const tx = { employee: { updateMany } }
vi.mock('$lib/server/db', () => ({
	db: {
		$transaction: (fn: (c: typeof tx) => unknown) => fn(tx),
		performanceTemplate: { findFirst },
		department: { findMany: vi.fn().mockResolvedValue([]) },
		deductionType: { findMany: vi.fn().mockResolvedValue([]) },
		employee: { findMany: vi.fn().mockResolvedValue([]), updateMany }
	}
}))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))
vi.mock('$lib/server/services/employee-access', () => ({ assertCanTouchEmployee }))
vi.mock('$lib/server/services/performance-templates', () => ({ listTemplates }))
vi.mock('$lib/server/services/employees', () => ({
	getEmployee,
	getEmploymentHistory: vi.fn().mockResolvedValue([]),
	updateEmployee: vi.fn(),
	offboardEmployee: vi.fn(),
	revealEmployeeSensitive: vi.fn(),
	recordCompensationChange: vi.fn(),
	promoteEmployee: vi.fn()
}))
vi.mock('$lib/server/services/settings/org', () => ({
	listPositions: vi.fn().mockResolvedValue([])
}))
vi.mock('$lib/server/services/leave', () => ({ getLeaveBalances: vi.fn().mockResolvedValue([]) }))
vi.mock('$lib/server/services/benefits', () => ({
	listEnrollmentsForEmployee: vi.fn().mockResolvedValue([])
}))
vi.mock('$lib/server/services/onboarding', () => ({
	getEmployeeOnboarding: vi.fn().mockResolvedValue(null),
	setManualCompletion: vi.fn()
}))
vi.mock('$lib/server/services/branches', () => ({
	listAssignableBranches: vi.fn().mockResolvedValue([]),
	selectableBranches: vi.fn().mockReturnValue([])
}))
vi.mock('$lib/server/services/payroll/loans', () => ({
	listLoans: vi.fn().mockResolvedValue([]),
	listCashAdvances: vi.fn().mockResolvedValue([]),
	createLoan: vi.fn(),
	createCashAdvance: vi.fn()
}))
vi.mock('$lib/server/services/payroll/employee-earnings', () => ({
	listEmployeeEarnings: vi.fn().mockResolvedValue([]),
	createEmployeeEarning: vi.fn(),
	endEmployeeEarning: vi.fn()
}))
vi.mock('$lib/server/services/payroll/employee-deductions', () => ({
	listEmployeeDeductions: vi.fn().mockResolvedValue([]),
	createEmployeeDeduction: vi.fn(),
	endEmployeeDeduction: vi.fn()
}))
vi.mock('$lib/server/services/payroll/employee-statutory', () => ({
	listStatutoryRows: vi.fn().mockResolvedValue([]),
	setStatutoryExemption: vi.fn(),
	setEmployerShareExternal: vi.fn(),
	setStatutoryAllocation: vi.fn()
}))
vi.mock('$lib/server/services/attendance/schedules', () => ({
	listSchedules: vi.fn().mockResolvedValue([])
}))
vi.mock('$lib/server/services/documents', () => ({
	listEmployeeDocuments: vi.fn().mockResolvedValue([]),
	saveEmployeeDocument: vi.fn(),
	deleteEmployeeDocument: vi.fn()
}))
vi.mock('$lib/server/services/emergencyContacts', () => ({
	addEmergencyContact: vi.fn(),
	deleteEmergencyContact: vi.fn()
}))
vi.mock('$lib/server/services/supervisors', () => ({
	listAdditionalSupervisors: vi.fn().mockResolvedValue([]),
	setAdditionalSupervisors: vi.fn()
}))

const { load, actions } = await import('../../src/routes/(app)/employees/[id]/+page.server')

const event = (roles: Role[], fields: Record<string, string> = {}, org = ORG) =>
	({
		request: {
			formData: async () => {
				const fd = new FormData()
				for (const [k, v] of Object.entries(fields)) fd.set(k, v)
				return fd
			}
		},
		locals: { user: { id: 'user1', organizationId: org, roles } },
		params: { id: EMP },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

beforeEach(() => {
	vi.clearAllMocks()
	assertCanTouchEmployee.mockResolvedValue(undefined)
	// Department, position and job title all say "Account Executive" — and the assignment is
	// still null, because only the field decides.
	getEmployee.mockResolvedValue({
		id: EMP,
		branchId: null,
		assignedTemplateId: null,
		department: { id: 'dep-sales', name: 'Sales' },
		position: { id: 'pos-ae', title: 'Account Executive' },
		user: { email: 'ae@example.com', roles: ['EMPLOYEE'] }
	})
	listTemplates.mockResolvedValue([
		{ id: 'tpl-ae', name: 'Account Executive', isActive: true, sectionCount: 6 },
		{ id: 'tpl-admin', name: 'Admin Staff', isActive: true, sectionCount: 5 },
		{ id: 'tpl-old', name: 'Retired Form', isActive: false, sectionCount: 4 }
	])
	findFirst.mockImplementation(
		async ({ where }: { where: { id: string; organizationId: string } }) =>
			where.organizationId === ORG && where.id.startsWith('tpl-') ? { id: where.id } : null
	)
	updateMany.mockImplementation(
		async ({ where }: { where: { id: string; organizationId?: string } }) => {
			const row = { id: EMP, organizationId: ORG }
			const match =
				where.id === row.id &&
				(where.organizationId === undefined || where.organizationId === row.organizationId)
			return { count: match ? 1 : 0 }
		}
	)
})

describe('the template is never inferred (SPEC AC2)', () => {
	it('load reports the employee unassigned even when a template matches their position', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = (await load(event(['HR_ADMIN']))) as any
		expect(res.assignedTemplateId).toBeNull()
		// The list is offered to HR to CHOOSE from — active only, and never pre-resolved.
		expect(res.canAssignTemplate).toBe(true)
		expect(res.performanceTemplates).toEqual([
			{ id: 'tpl-ae', name: 'Account Executive' },
			{ id: 'tpl-admin', name: 'Admin Staff' }
		])
	})

	it('keeps an assigned template on the picker after it is deactivated', async () => {
		// The data-loss trap: with the option missing the browser falls back to "— none —", so
		// pressing Save on the standalone ?/assignTemplate card would clear a live assignment.
		getEmployee.mockResolvedValue({
			id: EMP,
			branchId: null,
			assignedTemplateId: 'tpl-old',
			department: { id: 'dep-sales', name: 'Sales' },
			position: { id: 'pos-ae', title: 'Account Executive' },
			user: { email: 'ae@example.com', roles: ['EMPLOYEE'] }
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = (await load(event(['HR_ADMIN']))) as any
		expect(res.performanceTemplates).toEqual([
			{ id: 'tpl-ae', name: 'Account Executive' },
			{ id: 'tpl-admin', name: 'Admin Staff' },
			{ id: 'tpl-old', name: 'Retired Form (inactive)' }
		])
	})

	it('load echoes the stored id verbatim once one is set', async () => {
		getEmployee.mockResolvedValue({
			id: EMP,
			branchId: null,
			assignedTemplateId: 'tpl-admin',
			department: { id: 'dep-sales', name: 'Sales' },
			position: { id: 'pos-ae', title: 'Account Executive' },
			user: { email: 'ae@example.com', roles: ['EMPLOYEE'] }
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = (await load(event(['HR_ADMIN']))) as any
		// "Admin Staff" contradicts both the department and the position. The field wins.
		expect(res.assignedTemplateId).toBe('tpl-admin')
	})

	it('offers no template list to an actor without ADMINISTER_HR_ORGWIDE', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = (await load(event(['MANAGER']))) as any
		expect(res.canAssignTemplate).toBe(false)
		expect(res.performanceTemplates).toEqual([])
		expect(listTemplates).not.toHaveBeenCalled()
	})

	it('writes exactly the posted id and consults nothing else', async () => {
		const res = await actions.assignTemplate!(
			event(['HR_ADMIN'], { assignedTemplateId: 'tpl-admin' })
		)
		expect(res).toEqual({ action: 'assignTemplate', success: true })
		expect(updateMany).toHaveBeenCalledWith({
			where: { id: EMP, organizationId: ORG },
			data: { assignedTemplateId: 'tpl-admin' }
		})
		// #324: the audit row rides the same transaction client as the write it records.
		expect(writeAuditLog).toHaveBeenCalledTimes(1)
		const [ctx, payload, client] = writeAuditLog.mock.calls[0]
		expect(ctx).toMatchObject({ organizationId: ORG, actorId: 'user1' })
		expect(payload).toMatchObject({
			action: 'UPDATE',
			entityType: 'Employee',
			entityId: EMP,
			newValue: { assignedTemplateId: 'tpl-admin' }
		})
		expect(client).toBe(tx)
	})
})

describe('a blank choice clears the assignment', () => {
	it('stores null and looks up no template', async () => {
		const res = await actions.assignTemplate!(event(['HR_ADMIN'], { assignedTemplateId: '' }))
		expect(res).toEqual({ action: 'assignTemplate', success: true })
		expect(updateMany).toHaveBeenCalledWith({
			where: { id: EMP, organizationId: ORG },
			data: { assignedTemplateId: null }
		})
		expect(findFirst).not.toHaveBeenCalled()
		expect(writeAuditLog.mock.calls[0][1].newValue).toEqual({ assignedTemplateId: null })
	})
})

describe('the guard', () => {
	it('403s a MANAGER reaching an employee who is not theirs, and writes nothing', async () => {
		// `error()` throws rather than returns in SvelteKit 2, so throwing it from the
		// implementation is what rejects the call.
		assertCanTouchEmployee.mockImplementation(() => {
			error(403, 'You can only manage your own team or a branch you manage.')
		})
		await expect(
			actions.assignTemplate!(event(['MANAGER'], { assignedTemplateId: 'tpl-ae' }))
		).rejects.toMatchObject({ status: 403 })
		expect(updateMany).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('403s a MANAGER even on their OWN report — MANAGE_HR is not enough here', async () => {
		// The whose-record check passes: this employee really is on their team. The capability is
		// what refuses them, and this is the case that goes red if it is ever loosened to MANAGE_HR.
		await expect(
			actions.assignTemplate!(event(['MANAGER'], { assignedTemplateId: 'tpl-ae' }))
		).rejects.toMatchObject({ status: 403 })
		expect(updateMany).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('refuses before the form body is read', async () => {
		const formData = vi.fn()
		const e = event(['MANAGER'])
		e.request.formData = formData
		await expect(actions.assignTemplate!(e)).rejects.toMatchObject({ status: 403 })
		expect(formData).not.toHaveBeenCalled()
	})

	it('404s an employee outside the actor org and writes nothing (#323)', async () => {
		// An HR_ADMIN of another tenant: capability held, `canTouchEmployee` short-circuits true for
		// ADMINISTER_HR_ORGWIDE without ever checking the org, so the org filter on the WRITE is the
		// only thing between them and another tenant's 201 file. Posting the blank clear on purpose
		// — it skips the template lookup, leaving that filter as the single guard under test.
		const res = await actions.assignTemplate!(
			event(['HR_ADMIN'], { assignedTemplateId: '' }, OTHER_ORG)
		)
		expect(res).toMatchObject({ status: 404 })
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('400s a template id belonging to another organization', async () => {
		findFirst.mockResolvedValue(null)
		const res = await actions.assignTemplate!(
			event(['HR_ADMIN'], { assignedTemplateId: 'tpl-someone-elses' })
		)
		expect(res).toMatchObject({ status: 400 })
		expect(updateMany).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})
})

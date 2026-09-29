import { fail } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { failFromError } from '$lib/server/form-fail'
import { assertCanTouchEmployee } from '$lib/server/services/employee-access'
import { setAdditionalSupervisors } from '$lib/server/services/supervisors'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { assignTemplateSchema } from '$lib/server/performance/schemas'
import { ctxOf } from './shared'
import type { Actions } from '../../../routes/(app)/employees/[id]/$types'

export const assignmentActions: Actions = {
	// Set the employee's additional supervisors (#176). HR-only.
	setSupervisors: async ({ request, locals, params, getClientAddress }) => {
		const action = 'setSupervisors'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const ids = (await request.formData()).getAll('supervisorIds').map(String).filter(Boolean)
		try {
			await setAdditionalSupervisors(
				locals.user!.organizationId,
				params.id, // the 201 file's subject
				ids,
				ctxOf(locals, getClientAddress())
			)
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
		return { action, success: true }
	},

	/**
	 * #178 item 82 — HR assigns an evaluation template to this employee.
	 *
	 * SPEC AC2: an employee's template is THIS field and nothing else. No code path may infer a
	 * template from department, position or role — a guess that looks done and is wrong is worse
	 * than a visible unassigned employee (plan §10.1).
	 *
	 * Guard order is deliberate: capability, then whose-record, then shape.
	 *   1. `ADMINISTER_HR_ORGWIDE` — NOT `MANAGE_HR`, which holds MANAGER (#133).
	 *   2. `assertCanTouchEmployee` — capabilities say WHAT, never WHOSE. `ADMINISTER_HR_ORGWIDE`
	 *      alone does not prove this employee is in the actor's organization. `scopedToEmployee`
	 *      already runs this for every action here; it is repeated as a literal line so the action
	 *      is correct read on its own (#290's VALIDATE round was lost to reading a handler body
	 *      instead of the guard).
	 *   3. only then read and parse the form body.
	 */
	assignTemplate: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
		await assertCanTouchEmployee(locals.user!, params.id)

		const action = 'assignTemplate'
		const organizationId = locals.user!.organizationId
		const parsed = assignTemplateSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid input' })
		const { assignedTemplateId } = parsed.data

		// Trust boundary: the posted id is client input. It must name a template in THIS org, or a
		// crafted post assigns another tenant's form. Org-scoped on the model's own
		// `organizationId` column, never through a relation join (#323).
		if (assignedTemplateId) {
			const template = await db.performanceTemplate.findFirst({
				where: { id: assignedTemplateId, organizationId },
				select: { id: true }
			})
			if (!template) return fail(400, { action, error: 'That template is not available here.' })
		}

		const ctx = ctxOf(locals, getClientAddress())
		// The org filter is on the WRITE, not only on the guard: `canTouchEmployee` short-circuits
		// to true for `ADMINISTER_HR_ORGWIDE` without ever looking at the org.
		// #324: the audit row is written with `tx`, so it commits or rolls back with the update.
		const count = await db.$transaction(async (tx) => {
			const { count } = await tx.employee.updateMany({
				where: { id: params.id, organizationId },
				data: { assignedTemplateId }
			})
			if (count === 1)
				await writeAuditLog(
					ctx,
					{
						action: 'UPDATE',
						entityType: 'Employee',
						entityId: params.id,
						newValue: { assignedTemplateId }
					},
					tx
				)
			return count
		})
		if (count !== 1) return fail(404, { action, error: 'Employee not found' })

		return { action, success: true }
	}
}

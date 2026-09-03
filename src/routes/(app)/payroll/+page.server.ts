import { error, fail, isHttpError } from '@sveltejs/kit'
import { requireAnyCapability, requirePayrollManage } from '$lib/server/rbac'
import { canAny } from '$lib/rbac'
import {
	listPayrollRuns,
	createPayrollRun,
	computePayroll
} from '$lib/server/services/payroll/index'
import { voidRun } from '$lib/server/services/payroll/runs'
import { z } from 'zod'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	const roles = user.roles
	// Managers run/override; the sign-off roles (Verifier/Approver) need the list to find
	// a computed run and open it to sign off (#134). Sign-off roles get a read-only view —
	// `canManage` gates the create/compute controls in the page.
	const canManage = canAny(roles, 'MANAGE_PAYROLL')
	const canSignOff = canAny(roles, 'VERIFY_REQUESTS') || canAny(roles, 'APPROVE_FINANCE')
	if (!canManage && !canSignOff) error(403, 'Insufficient permissions')
	// #319: voiding a run existed only on the v1 API, so the overlap 409's "void the conflicting
	// run to proceed" named an action the screen could not perform. Same capability the service
	// enforces (#224) — reversing a locked period's amortization overrides a finalized record.
	const canVoid = canAny(roles, 'OVERRIDE_FINALIZED')

	// Stream the runs list so the page renders a skeleton while it loads. Finance approvers
	// (CEO / Super Admin) see every tenant's runs to sign them off (#174); the page labels
	// the tenant and limits create/compute controls to the viewer's own org.
	const runs = listPayrollRuns(user.organizationId, roles)
	return { runs, canManage, canVoid, viewerOrg: user.organizationId }
}

const createSchema = z.object({
	periodStart: z.coerce.date(),
	periodEnd: z.coerce.date()
})

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requirePayrollManage(user.roles)

		const raw = Object.fromEntries(await request.formData())
		const parsed = createSchema.safeParse(raw)
		if (!parsed.success) return fail(400, { error: 'Invalid dates' })

		// Service errors (e.g. "run for this period already exists") come back as
		// HttpErrors — surface them inline instead of blowing up to an error page.
		try {
			await createPayrollRun(user.organizationId, parsed.data.periodStart, parsed.data.periodEnd, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
	},

	// #319: the twin of the v1 API's `action: 'void'`. `voidRun` re-checks the capability and owns
	// the amortization reversal, the compare-and-set and the audit write — this only wires the form
	// to it and surfaces its HttpErrors inline instead of as an error page.
	void: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'OVERRIDE_FINALIZED')

		const id = String((await request.formData()).get('id') ?? '')
		if (!id) return fail(400, { error: 'Missing run id' })

		try {
			await voidRun(id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
	},

	compute: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requirePayrollManage(user.roles)

		const data = await request.formData()
		const id = data.get('id') as string

		try {
			await computePayroll(id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
	}
}

import { fail } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	updateEmployee,
	revealEmployeeSensitive,
	getEmploymentHistory
} from '$lib/server/services/employees'
import { isFoodServiceOrg } from '$lib/orgs'
import { govIdSchema } from '$lib/utils/gov-ids'
import { isValidPhone, phoneError } from '$lib/utils/phone'
import { db } from '$lib/server/db'
import { z } from 'zod'
import { ctxOf } from './shared'
import type { Actions } from '../../../routes/(app)/employees/[id]/$types'

const updateSchema = z.object({
	jobTitle: z.string().min(1).optional(),
	departmentId: z.string().optional(),
	// #24: format-checked. Blank stays valid — an empty field here means "unchanged", not "bad".
	contactPhone: z.string().optional().refine(isValidPhone, phoneError('Phone')),
	contactAddress: z.string().optional(),
	// Company email (#186) — HR sets the real address once provisioned. Empty clears it.
	companyEmail: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	// #170: salary/rateType are NOT editable here — the quick-edit form must not write pay onto the
	// Employee row (payroll now reads period-end salary from EmployeeCompensation history, so a bare
	// write would be silently ignored). Pay changes go through the dated `?/changeCompensation` path.
	// Empty string clears the link; a value sets it (unique per employee).
	discordId: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	workScheduleId: z
		.string()
		.optional()
		.transform((v) => (v ? v : null)),
	// Store assignment. Empty string clears it. Only accepted for food-service tenants —
	// the update action strips it elsewhere.
	branchId: z
		.string()
		.optional()
		.transform((v) => (v ? v : null)),
	// Emergency contact (personal — visible to the employee's managers).
	emergencyContactName: z.string().optional(),
	emergencyContactRelation: z.string().optional(),
	emergencyContactPhone: z
		.string()
		.optional()
		.refine(isValidPhone, phoneError('Emergency contact phone')),
	// Position from the catalog. Empty string clears the assignment.
	positionId: z
		.string()
		.optional()
		.transform((v) => (v ? v : null)),
	// Government / statutory IDs (payroll registration). #111 renders these masked, so the form
	// never prefills them: an empty field means "unchanged", any value typed is new and is
	// format-checked here — exactly the bank/GCash model below.
	sssNumber: govIdSchema('sssNumber'),
	philhealthNumber: govIdSchema('philhealthNumber'),
	pagibigNumber: govIdSchema('pagibigNumber'),
	tinNumber: govIdSchema('tinNumber'),
	// Disbursement details (sensitive, HR-only). Empty string clears the field.
	bankName: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	bankAccountName: z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null)),
	// #54 leaves these blank in the form, so empty means "unchanged"; any value typed is new
	// and therefore always format-checked (#191).
	bankAccountNumber: govIdSchema('bankAccountNumber'),
	gcashNumber: govIdSchema('gcashNumber')
})

export const profileActions: Actions = {
	update: async ({ request, locals, params, getClientAddress }) => {
		const action = 'update'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!

		const raw = Object.fromEntries(await request.formData())
		const parsed = updateSchema.safeParse(raw)
		if (!parsed.success) {
			// Surface the field messages (the disbursement formats validate in the schema);
			// fall back to the generic text when zod produced none.
			const messages = parsed.error.errors.map((e) => e.message).filter(Boolean)
			return fail(400, { action, error: messages.length ? messages.join(' · ') : 'Invalid input' })
		}

		// #111: the government IDs and disbursement numbers render masked and are never prefilled,
		// so an empty submission means "leave unchanged", not "clear" — spread each only when the
		// form actually carried a value. A malformed ID stored before validation existed is simply
		// not re-submitted, so it never blocks an unrelated edit (a phone number, an address).
		// Explicit clearing is deferred until a dedicated clear affordance exists.
		const {
			sssNumber,
			philhealthNumber,
			pagibigNumber,
			tinNumber,
			bankAccountNumber,
			gcashNumber,
			branchId,
			...rest
		} = parsed.data
		const input = {
			...rest,
			...(sssNumber !== null && { sssNumber }),
			...(philhealthNumber !== null && { philhealthNumber }),
			...(pagibigNumber !== null && { pagibigNumber }),
			...(tinNumber !== null && { tinNumber }),
			...(bankAccountNumber !== null && { bankAccountNumber }),
			...(gcashNumber !== null && { gcashNumber }),
			// Branches only exist for the food-service tenants; ignore a posted branchId
			// anywhere else. updateEmployee still re-checks the branch is in this org.
			...(isFoodServiceOrg(user.organizationId) && { branchId })
		}

		try {
			await updateEmployee(params.id, user.organizationId, input, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			// Unique constraint on Employee.discordId
			if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
				return fail(409, {
					action,
					error: 'That Discord ID is already linked to another employee.'
				})
			}
			throw e
		}

		return { action, success: true }
	},

	// #111: audited reveal of every masked sensitive field (gov IDs, salary, disbursement). The
	// role check runs server-side — the UI button is cosmetic gating only (Constitution P2).
	reveal: async ({ locals, params, getClientAddress }) => {
		const action = 'reveal'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		// A self-reveal (an HR user opening their own 201 file) is exempt from the audit log —
		// own data, decision #2. Same identity comparison as load's object-level access check.
		// #6: the ACTIVE org, not the home tenant. Null here means `isSelf` is false and the
		// reveal IS audited — the safe direction for a lookup that only suppresses the audit row.
		const self = await db.employee.findFirst({
			where: { userId: locals.user!.id, organizationId: locals.user!.organizationId },
			select: { id: true }
		})
		const isSelf = self?.id === params.id
		const revealed = await revealEmployeeSensitive(
			params.id,
			locals.user!.organizationId,
			ctxOf(locals, getClientAddress()),
			{ audit: !isSelf }
		)
		// #290: the Employment History panel masks its salary figures the same way, and is
		// released by this same reveal — deliberately with NO second audit write. The single VIEW
		// row above covers both surfaces; a second one would be byte-identical and tell an
		// auditor nothing.
		const history = await getEmploymentHistory(params.id, locals.user!.organizationId, {
			unmask: true
		})
		return { action, revealed, history }
	}
}

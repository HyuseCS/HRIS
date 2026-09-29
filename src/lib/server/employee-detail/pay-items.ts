import { fail, isHttpError } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { failFromError } from '$lib/server/form-fail'
import { LOAN_TYPES } from '$lib/utils/loan-types'
import { createLoan, createCashAdvance } from '$lib/server/services/payroll/loans'
import {
	createEmployeeEarning,
	endEmployeeEarning
} from '$lib/server/services/payroll/employee-earnings'
import {
	createEmployeeDeduction,
	endEmployeeDeduction
} from '$lib/server/services/payroll/employee-deductions'
import {
	setStatutoryExemption,
	setEmployerShareExternal,
	setStatutoryAllocation
} from '$lib/server/services/payroll/employee-statutory'
import { z } from 'zod'
import { ctxOf } from './shared'
import type { Actions } from '../../../routes/(app)/employees/[id]/$types'

const loanSchema = z.object({
	type: z.enum(LOAN_TYPES),
	principal: z.coerce.number().positive(),
	installment: z.coerce.number().positive()
})
const cashAdvanceSchema = z.object({
	amount: z.coerce.number().positive(),
	installment: z.coerce.number().positive()
})
const earningSchema = z.object({
	kind: z.enum(['ALLOWANCE', 'INCENTIVE']),
	label: z.string().min(1).max(100),
	monthlyAmount: z.coerce.number().positive()
})
const deductionSchema = z.object({
	deductionTypeId: z.string().min(1),
	label: z.string().max(100).optional(),
	monthlyAmount: z.coerce.number().positive()
})
const statutoryToggleSchema = z.object({
	contribution: z.enum(['SSS', 'PHILHEALTH', 'PAGIBIG']),
	exempt: z.enum(['true', 'false']).transform((v) => v === 'true')
})
const employerShareExternalToggleSchema = z.object({
	contribution: z.enum(['SSS', 'PHILHEALTH', 'PAGIBIG']),
	external: z.enum(['true', 'false']).transform((v) => v === 'true')
})
const statutoryAllocationSchema = z.object({
	contribution: z.enum(['SSS', 'PHILHEALTH', 'PAGIBIG']),
	allocation: z.enum(['EVEN', 'FIRST', 'SECOND'])
})

export const payItemActions: Actions = {
	// ponytail: only the two loan actions were folded into ctxOf — the rest of the inline ctx
	// literals in this file are audit-only, and converting them would be churn.
	addLoan: async ({ request, locals, params, getClientAddress }) => {
		const action = 'addLoan'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = loanSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid loan details' })
		try {
			await createLoan(
				params.id,
				user.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
		return { action, success: true }
	},

	addCashAdvance: async ({ request, locals, params, getClientAddress }) => {
		const action = 'addCashAdvance'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = cashAdvanceSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid cash-advance details' })
		try {
			await createCashAdvance(
				params.id,
				user.organizationId,
				parsed.data,
				ctxOf(locals, getClientAddress())
			)
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
		return { action, success: true }
	},

	addEarning: async ({ request, locals, params, getClientAddress }) => {
		const action = 'addEarning'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = earningSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid recurring earning details' })
		try {
			await createEmployeeEarning(params.id, user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e) {
			const f = failFromError(e)
			return fail(f.status, { action, ...f.data })
		}
		return { action, success: true }
	},

	endEarning: async ({ request, locals, getClientAddress }) => {
		const action = 'endEarning'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { action, error: 'Missing earning id' })
		try {
			await endEmployeeEarning(id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	addDeduction: async ({ request, locals, params, getClientAddress }) => {
		const action = 'addDeduction'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const parsed = deductionSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid recurring deduction details' })
		try {
			await createEmployeeDeduction(params.id, user.organizationId, parsed.data, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	endDeduction: async ({ request, locals, getClientAddress }) => {
		const action = 'endDeduction'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const user = locals.user!
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { action, error: 'Missing deduction id' })
		try {
			await endEmployeeDeduction(id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	// Exempt/restore an individual employee from a statutory contribution (#173). HR-only, audited.
	toggleStatutoryExemption: async ({ request, locals, params, getClientAddress }) => {
		const action = 'toggleStatutoryExemption'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = statutoryToggleSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid statutory toggle' })
		try {
			await setStatutoryExemption(
				params.id,
				locals.user!.organizationId,
				parsed.data.contribution,
				parsed.data.exempt,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	// Toggle "employer share paid externally" for one contribution (#173, Feature C). Zeroes the ER
	// share only; the EE share is still deducted. HR-only, audited.
	toggleEmployerShareExternal: async ({ request, locals, params, getClientAddress }) => {
		const action = 'toggleEmployerShareExternal'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = employerShareExternalToggleSchema.safeParse(
			Object.fromEntries(await request.formData())
		)
		if (!parsed.success) return fail(400, { action, error: 'Invalid statutory toggle' })
		try {
			await setEmployerShareExternal(
				params.id,
				locals.user!.organizationId,
				parsed.data.contribution,
				parsed.data.external,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	},

	// Set which semi-monthly cutoff the EE share is deducted on (#173, Feature E). HR-only, audited.
	setStatutoryAllocation: async ({ request, locals, params, getClientAddress }) => {
		const action = 'setStatutoryAllocation'
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = statutoryAllocationSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(400, { action, error: 'Invalid statutory allocation' })
		try {
			await setStatutoryAllocation(
				params.id,
				locals.user!.organizationId,
				parsed.data.contribution,
				parsed.data.allocation,
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { action, error: String(e.body.message) })
			throw e
		}
		return { action, success: true }
	}
}

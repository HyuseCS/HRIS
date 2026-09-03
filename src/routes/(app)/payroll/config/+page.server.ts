import { fail } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { ratesFromRule } from '$lib/server/services/payroll/rates'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	requireAnyCapability(locals.user!.roles, 'ADMINISTER_SYSTEM')

	const [config, payRateRule] = await Promise.all([
		db.payrollConfig.findUnique({ where: { organizationId: locals.user!.organizationId } }),
		db.payRateRule.findUnique({ where: { organizationId: locals.user!.organizationId } })
	])

	// Resolved multipliers (DOLE defaults when the org has no PayRateRule row yet). Statutory rate
	// tables moved to /payroll/statutory-rates (#220), gated on the statutory-rate capabilities.
	return { config, rates: ratesFromRule(payRateRule) }
}

// Premium-pay multipliers against the base hourly rate; nightDiff is an additive fraction.
const ratesSchema = z.object({
	overtime: z.coerce.number().min(0).max(10),
	overtimePremium: z.coerce.number().min(0).max(10),
	nightDiff: z.coerce.number().min(0).max(10),
	restDay: z.coerce.number().min(0).max(10),
	regularHoliday: z.coerce.number().min(0).max(10),
	specialHoliday: z.coerce.number().min(0).max(10)
})

const configSchema = z.object({
	payFrequency: z.enum(['SEMI_MONTHLY', 'MONTHLY']),
	cutoffDay1: z.coerce.number().int().min(1).max(28).optional(),
	cutoffDay2: z.coerce.number().int().min(1).max(31).optional()
})

export const actions: Actions = {
	update: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'ADMINISTER_SYSTEM')

		const raw = Object.fromEntries(await request.formData())
		const parsed = configSchema.safeParse(raw)
		if (!parsed.success) {
			return fail(400, { error: 'Invalid configuration values', details: parsed.error.flatten() })
		}

		const { payFrequency, cutoffDay1, cutoffDay2 } = parsed.data

		// Mutation + audit share a transaction so a failed audit write rolls back the config
		// change, and reading `existing` inside it stops two concurrent saves logging the same
		// oldValue.
		await db.$transaction(async (tx) => {
			const existing = await tx.payrollConfig.findUnique({
				where: { organizationId: user.organizationId }
			})

			const config = await tx.payrollConfig.upsert({
				where: { organizationId: user.organizationId },
				create: {
					organizationId: user.organizationId,
					payFrequency,
					firstCutoff: cutoffDay1 ?? null,
					secondCutoff: cutoffDay2 ?? null,
					sssTable: {},
					birTaxTable: {}
				},
				update: {
					payFrequency,
					firstCutoff: cutoffDay1 ?? null,
					secondCutoff: cutoffDay2 ?? null
				}
			})

			await writeAuditLog(
				{
					organizationId: user.organizationId,
					actorId: user.id,
					actorRoles: user.roles,
					ipAddress: getClientAddress()
				},
				{
					action: 'UPDATE',
					entityType: 'PayrollConfig',
					entityId: config.id,
					oldValue: existing
						? {
								payFrequency: existing.payFrequency,
								firstCutoff: existing.firstCutoff,
								secondCutoff: existing.secondCutoff
							}
						: undefined,
					newValue: {
						payFrequency,
						firstCutoff: cutoffDay1 ?? null,
						secondCutoff: cutoffDay2 ?? null
					}
				},
				tx
			)
		})

		return { success: true }
	},

	updateRates: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'ADMINISTER_SYSTEM')

		const parsed = ratesSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) {
			return fail(400, { error: 'Invalid multiplier values (each must be between 0 and 10).' })
		}

		await db.$transaction(async (tx) => {
			const existing = await tx.payRateRule.findUnique({
				where: { organizationId: user.organizationId }
			})

			const rule = await tx.payRateRule.upsert({
				where: { organizationId: user.organizationId },
				create: { organizationId: user.organizationId, ...parsed.data },
				update: parsed.data
			})

			await writeAuditLog(
				{
					organizationId: user.organizationId,
					actorId: user.id,
					actorRoles: user.roles,
					ipAddress: getClientAddress()
				},
				{
					action: 'UPDATE',
					entityType: 'PayRateRule',
					entityId: rule.id,
					oldValue: existing
						? {
								overtime: Number(existing.overtime),
								overtimePremium: Number(existing.overtimePremium),
								nightDiff: Number(existing.nightDiff),
								restDay: Number(existing.restDay),
								regularHoliday: Number(existing.regularHoliday),
								specialHoliday: Number(existing.specialHoliday)
							}
						: undefined,
					newValue: parsed.data
				},
				tx
			)
		})

		return { success: true }
	}
}

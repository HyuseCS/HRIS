import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import type { StatutoryContribution, StatutoryAllocation } from '@prisma/client'
import { computePagibig, computePhilhealth, computeSSS } from './ph-statutory'
import { getStatutoryRateConfig, statutoryRatesFromConfig } from './statutory-rates'
import { monthlyBasisOf } from './types'
import { q2 } from './money'
import { assertNotSelf } from '../employee-access'
import type { AuditContext } from '../types'

/**
 * Per-employee statutory exemption (#173). HR can mark an individual employee as not enrolled in
 * SSS, PhilHealth, or Pag-IBIG; the payroll engine then zeroes BOTH shares of that contribution.
 * Absence of a row = enrolled (the default). Withholding tax is never exempted. All mutations are
 * org-scoped and audited.
 */

const CONTRIBUTIONS = ['SSS', 'PHILHEALTH', 'PAGIBIG'] as const satisfies StatutoryContribution[]

async function requireEmployee(employeeId: string, organizationId: string) {
	const e = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true, userId: true, basicMonthlySalary: true, rateType: true }
	})
	if (!e) error(404, 'Employee not found')
	return e
}

/**
 * Map exempt rows to the engine's `statutoryExemptions` flags. Shared by the real run
 * (`computePayroll`) and the calculator preview so both stay identical.
 */
export function statutoryExemptions(rows: Array<{ contribution: StatutoryContribution }>) {
	return {
		sss: rows.some((r) => r.contribution === 'SSS'),
		philhealth: rows.some((r) => r.contribution === 'PHILHEALTH'),
		pagibig: rows.some((r) => r.contribution === 'PAGIBIG')
	}
}

/**
 * Map "employer share paid externally" rows (#173, Feature C) to the engine's `employerShareExternal`
 * flags. Same shape/plumbing as `statutoryExemptions` so the real run and the preview stay identical.
 */
export function employerShareExternals(rows: Array<{ contribution: StatutoryContribution }>) {
	return {
		sss: rows.some((r) => r.contribution === 'SSS'),
		philhealth: rows.some((r) => r.contribution === 'PHILHEALTH'),
		pagibig: rows.some((r) => r.contribution === 'PAGIBIG')
	}
}

/**
 * Map allocation rows (#173, Feature E) to the engine's `statutoryAllocations`. A missing row (or an
 * EVEN row) means the default half-and-half split. Same shape/plumbing as `statutoryExemptions` so
 * the real run and the preview stay identical.
 */
export function statutoryAllocations(
	rows: Array<{ contribution: StatutoryContribution; allocation: StatutoryAllocation }>
) {
	const of = (c: StatutoryContribution): StatutoryAllocation =>
		rows.find((r) => r.contribution === c)?.allocation ?? 'EVEN'
	return { sss: of('SSS'), philhealth: of('PHILHEALTH'), pagibig: of('PAGIBIG') }
}

/**
 * The three statutory contributions with the employee's current enrollment and the monthly EE
 * amount they would owe (display-only, computed from the same rate helpers the engine uses).
 */
export async function listStatutoryRows(employeeId: string, organizationId: string) {
	const employee = await requireEmployee(employeeId, organizationId)
	const [configs, rateConfig] = await Promise.all([
		db.employeeStatutoryConfig.findMany({
			where: { employeeId },
			select: {
				contribution: true,
				exempt: true,
				employerSharePaidExternally: true,
				allocation: true
			}
		}),
		getStatutoryRateConfig(organizationId)
	])
	// Preview against the org's own rates (#220), not the hardcoded defaults — falls back to them
	// field-by-field when a config field is absent.
	const rates = statutoryRatesFromConfig(rateConfig)
	const monthly = monthlyBasisOf({
		basicMonthlySalary: employee.basicMonthlySalary,
		rateType: employee.rateType
	})
	const monthlyEe: Record<StatutoryContribution, number> = {
		SSS: q2(computeSSS(monthly, rates.sssBrackets).ee).toNumber(),
		PHILHEALTH: q2(computePhilhealth(monthly, rates.philhealth).ee).toNumber(),
		PAGIBIG: q2(computePagibig(monthly, rates.pagibig).ee).toNumber()
	}
	return CONTRIBUTIONS.map((contribution) => {
		const config = configs.find((c) => c.contribution === contribution)
		return {
			contribution,
			exempt: config?.exempt ?? false,
			employerSharePaidExternally: config?.employerSharePaidExternally ?? false,
			allocation: config?.allocation ?? 'EVEN',
			monthlyEe: monthlyEe[contribution]
		}
	})
}

/** Upsert the exemption row for one contribution and audit the change. */
export async function setStatutoryExemption(
	employeeId: string,
	organizationId: string,
	contribution: StatutoryContribution,
	exempt: boolean,
	ctx: AuditContext
) {
	assertNotSelf(ctx.actorId, await requireEmployee(employeeId, organizationId))
	// One transaction: a failed audit write must not leave an exemption standing unrecorded —
	// it zeroes both shares of a statutory contribution on every run.
	return await db.$transaction(async (tx) => {
		const row = await tx.employeeStatutoryConfig.upsert({
			where: { employeeId_contribution: { employeeId, contribution } },
			create: { employeeId, contribution, exempt },
			update: { exempt }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'EmployeeStatutoryConfig',
				entityId: row.id,
				newValue: { contribution, exempt }
			},
			tx
		)
		return row
	})
}

/**
 * Upsert the "employer share paid externally" flag (#173, Feature C) for one contribution and audit
 * it. Shares the `@@unique([employeeId, contribution])` row with `exempt`, so only this flag is
 * touched — `exempt` is preserved (created rows default it to false).
 */
export async function setEmployerShareExternal(
	employeeId: string,
	organizationId: string,
	contribution: StatutoryContribution,
	external: boolean,
	ctx: AuditContext
) {
	assertNotSelf(ctx.actorId, await requireEmployee(employeeId, organizationId))
	// One transaction: a failed audit write must not leave the flag standing unrecorded — it
	// moves the employer share off every future payslip.
	return await db.$transaction(async (tx) => {
		const row = await tx.employeeStatutoryConfig.upsert({
			where: { employeeId_contribution: { employeeId, contribution } },
			create: { employeeId, contribution, employerSharePaidExternally: external },
			update: { employerSharePaidExternally: external }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'EmployeeStatutoryConfig',
				entityId: row.id,
				newValue: { contribution, employerSharePaidExternally: external }
			},
			tx
		)
		return row
	})
}

/**
 * Upsert the EE-share cutoff allocation (#173, Feature E) for one contribution and audit it. Shares
 * the `@@unique([employeeId, contribution])` row with `exempt` + `employerSharePaidExternally`, so
 * only `allocation` is touched — the other flags are preserved (created rows default them to false).
 */
export async function setStatutoryAllocation(
	employeeId: string,
	organizationId: string,
	contribution: StatutoryContribution,
	allocation: StatutoryAllocation,
	ctx: AuditContext
) {
	assertNotSelf(ctx.actorId, await requireEmployee(employeeId, organizationId))
	// One transaction: a failed audit write must not leave the cutoff allocation standing
	// unrecorded — it changes which payslip carries the EE share.
	return await db.$transaction(async (tx) => {
		const row = await tx.employeeStatutoryConfig.upsert({
			where: { employeeId_contribution: { employeeId, contribution } },
			create: { employeeId, contribution, allocation },
			update: { allocation }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'EmployeeStatutoryConfig',
				entityId: row.id,
				newValue: { contribution, allocation }
			},
			tx
		)
		return row
	})
}

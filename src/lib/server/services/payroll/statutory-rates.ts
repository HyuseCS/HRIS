/**
 * Org-scoped statutory rate overrides (#220). Mirrors `rates.ts`/`ratesFromRule`: hardcoded PH
 * defaults live in `ph-statutory.ts`; a `StatutoryRateConfig` row overrides them field-by-field.
 * A null field (or no row) falls back to the hardcoded default, so an org with no config computes
 * byte-for-byte today's numbers — the parity guarantee.
 *
 * This module holds three things: the pure resolver (`statutoryRatesFromConfig`, wired into both the
 * real run and the preview), the on-save validation (trust boundary — HR is editing tax math), and
 * the DB-backed get/update service (org-scoped upsert + audit).
 */

import { z } from 'zod'
import { error } from '@sveltejs/kit'
import { Prisma } from '@prisma/client'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import type { AuditContext } from '../types'
import { D, q2n, ZERO } from './money'
import type { SSSBracket, TaxBracket, StatutoryRates } from './ph-statutory'

// ─── Resolver (fallback pattern) ──────────────────────────────────────────────

/**
 * Loose shape of a persisted `StatutoryRateConfig` row — accepted so this stays independent of the
 * exact Prisma client type. The two bracket columns are JSON; the open-ended last ceiling is stored
 * as `null` and revived to `Infinity` here so the runtime bracket shape matches the hardcoded tables.
 */
export interface StatutoryRateConfigRow {
	philhealthRate?: Prisma.Decimal | null
	philhealthFloor?: Prisma.Decimal | null
	philhealthCeiling?: Prisma.Decimal | null
	pagibigRate?: Prisma.Decimal | null
	pagibigCap?: Prisma.Decimal | null
	sssBrackets?: Prisma.JsonValue | null
	taxBrackets?: Prisma.JsonValue | null
}

const numOrUndef = (v: Prisma.Decimal | null | undefined): number | undefined =>
	v == null ? undefined : Number(v)

// A revived open-ended ceiling is Infinity by design; every other field must be a finite number, or
// the row is garbage. An empty array (or any garbage row) falls back to the hardcoded table via
// `undefined` — never a `[]` that would make `computeSSS`/`computeWithholdingTax` dereference `[-1]`.
const isFiniteCeiling = (n: number) => n === Infinity || Number.isFinite(n)

function reviveSssBrackets(json: Prisma.JsonValue | null | undefined): SSSBracket[] | undefined {
	if (!Array.isArray(json) || json.length === 0) return undefined
	const rows = json.map((raw) => {
		const b = raw as Record<string, unknown>
		return {
			salaryFloor: Number(b.salaryFloor),
			salaryCeiling: b.salaryCeiling == null ? Infinity : Number(b.salaryCeiling),
			totalContribution: Number(b.totalContribution),
			eeShare: Number(b.eeShare),
			erShare: Number(b.erShare)
		}
	})
	const ok = rows.every(
		(b) =>
			Number.isFinite(b.salaryFloor) &&
			isFiniteCeiling(b.salaryCeiling) &&
			Number.isFinite(b.totalContribution) &&
			Number.isFinite(b.eeShare) &&
			Number.isFinite(b.erShare)
	)
	return ok ? rows : undefined
}

function reviveTaxBrackets(json: Prisma.JsonValue | null | undefined): TaxBracket[] | undefined {
	if (!Array.isArray(json) || json.length === 0) return undefined
	const rows = json.map((raw) => {
		const b = raw as Record<string, unknown>
		return {
			floor: Number(b.floor),
			ceiling: b.ceiling == null ? Infinity : Number(b.ceiling),
			baseTax: Number(b.baseTax),
			rate: Number(b.rate),
			excessOver: Number(b.excessOver)
		}
	})
	const ok = rows.every(
		(b) =>
			Number.isFinite(b.floor) &&
			isFiniteCeiling(b.ceiling) &&
			Number.isFinite(b.baseTax) &&
			Number.isFinite(b.rate) &&
			Number.isFinite(b.excessOver)
	)
	return ok ? rows : undefined
}

/**
 * Resolve a config row (or null) into the effective `StatutoryRates`. Each field falls back to the
 * hardcoded default via `undefined` — `computeStatutoryDeductions` then uses the constant. A null
 * config yields all-undefined, i.e. exactly the pre-#220 behaviour. The PhilHealth/Pag-IBIG rates
 * are kept as their exact Prisma `Decimal` (not narrowed to a float) so `.times()` stays exact.
 */
export function statutoryRatesFromConfig(
	config: StatutoryRateConfigRow | null | undefined
): StatutoryRates {
	if (!config) return {}
	return {
		sssBrackets: reviveSssBrackets(config.sssBrackets),
		taxBrackets: reviveTaxBrackets(config.taxBrackets),
		philhealth: {
			rate: config.philhealthRate ?? undefined,
			floor: numOrUndef(config.philhealthFloor),
			ceiling: numOrUndef(config.philhealthCeiling)
		},
		pagibig: {
			rate: config.pagibigRate ?? undefined,
			cap: numOrUndef(config.pagibigCap)
		}
	}
}

// ─── Validation (trust boundary) ──────────────────────────────────────────────
// The open-ended last bracket carries `ceiling: null` (revived to Infinity). Cross-row invariants:
// sorted ascending by floor, non-overlapping, first floor covers 0, only the last bracket is
// open-ended. Non-strict contiguity is intentional — the real SSS/BIR tables leave ±0.01/±1 gaps at
// bracket boundaries, so a zero-gap rule would reject the legal tables HR must be able to enter.

const sssBracketSchema = z.object({
	salaryFloor: z.number().finite().nonnegative(),
	salaryCeiling: z.number().finite().positive().nullable(),
	totalContribution: z.number().finite().nonnegative(),
	// Peso contributions per month; a value in the millions is a fat-fingered salary in the wrong box.
	eeShare: z.number().finite().nonnegative().max(1_000_000),
	erShare: z.number().finite().nonnegative().max(1_000_000)
})

export const sssBracketsSchema = z
	.array(sssBracketSchema)
	.min(1, 'At least one SSS bracket is required.')
	.superRefine((rows, ctx) => {
		const add = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
		if (rows[0].salaryFloor > 0) add('First SSS bracket must start at 0 (cover the low end).')
		rows.forEach((b, i) => {
			const isLast = i === rows.length - 1
			if (isLast && b.salaryCeiling !== null)
				add('Last SSS bracket must be open-ended (no ceiling).')
			if (!isLast && b.salaryCeiling === null) add('Only the last SSS bracket may be open-ended.')
			if (b.salaryCeiling !== null && b.salaryCeiling < b.salaryFloor)
				add(`SSS bracket ${i + 1}: ceiling is below its floor.`)
			if (i > 0) {
				const prev = rows[i - 1]
				if (b.salaryFloor <= prev.salaryFloor)
					add('SSS brackets must be sorted ascending by floor.')
				if (prev.salaryCeiling !== null && b.salaryFloor < prev.salaryCeiling)
					add(`SSS bracket ${i + 1} overlaps the previous bracket.`)
			}
		})
	})

const taxBracketSchema = z.object({
	floor: z.number().finite().nonnegative(),
	ceiling: z.number().finite().positive().nullable(),
	baseTax: z.number().finite().nonnegative(),
	rate: z.number().finite().min(0).max(1),
	excessOver: z.number().finite().nonnegative()
})

export const taxBracketsSchema = z
	.array(taxBracketSchema)
	.min(1, 'At least one tax bracket is required.')
	.superRefine((rows, ctx) => {
		const add = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
		if (rows[0].floor > 0) add('First tax bracket must start at 0 (cover the low end).')
		rows.forEach((b, i) => {
			const isLast = i === rows.length - 1
			if (isLast && b.ceiling !== null) add('Last tax bracket must be open-ended (no ceiling).')
			if (!isLast && b.ceiling === null) add('Only the last tax bracket may be open-ended.')
			if (b.ceiling !== null && b.ceiling < b.floor)
				add(`Tax bracket ${i + 1}: ceiling is below its floor.`)
			if (i > 0) {
				const prev = rows[i - 1]
				if (b.floor <= prev.floor) add('Tax brackets must be sorted ascending by floor.')
				if (prev.ceiling !== null && b.floor < prev.ceiling)
					add(`Tax bracket ${i + 1} overlaps the previous bracket.`)
			}
		})
	})

/**
 * Full save payload. Every field is nullable — null means "clear the override, use the hardcoded
 * default". Scalars are stored as-is (PhilHealth/Pag-IBIG rate as a decimal fraction, e.g. 0.05).
 */
export const statutoryRateInputSchema = z
	.object({
		philhealthRate: z.number().min(0).max(1).nullable(),
		philhealthFloor: z.number().nonnegative().nullable(),
		philhealthCeiling: z.number().nonnegative().nullable(),
		pagibigRate: z.number().min(0).max(1).nullable(),
		pagibigCap: z.number().nonnegative().nullable(),
		sssBrackets: sssBracketsSchema.nullable(),
		taxBrackets: taxBracketsSchema.nullable()
	})
	.superRefine((v, ctx) => {
		if (
			v.philhealthFloor !== null &&
			v.philhealthCeiling !== null &&
			v.philhealthFloor > v.philhealthCeiling
		)
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'PhilHealth floor must be ≤ ceiling.'
			})
	})

export type StatutoryRateInput = z.infer<typeof statutoryRateInputSchema>

// ─── Derived read-only columns (#220) ─────────────────────────────────────────
// Only ranges + rates are user-editable; these columns are computed on save. Rates must ALREADY be
// decimals here (the % → decimal conversion happens in the server action before this runs).

/**
 * Derive the tax brackets' read-only columns from their ranges+rates. Brackets are sorted by floor;
 * `excessOver` is the bracket floor and `baseTax` accumulates the tax owed up to each floor:
 * baseTax[0] = 0; baseTax[n] = baseTax[n-1] + (floor[n] - floor[n-1]) * rate[n-1].
 */
export function deriveTaxBrackets<T extends { floor: number; rate: number }>(
	rows: T[]
): (T & { baseTax: number; excessOver: number })[] {
	const sorted = [...rows].sort((a, b) => a.floor - b.floor)
	// Accumulate in exact decimal so an HR-edited table with non-round floors/rates can't drift a
	// centavo into the persisted baseTax; quantize once per bracket at the money boundary.
	let baseTax = ZERO
	return sorted.map((row, i) => {
		if (i > 0) {
			const prev = sorted[i - 1]
			baseTax = baseTax.plus(D(row.floor).minus(prev.floor).times(prev.rate))
		}
		return { ...row, baseTax: q2n(baseTax), excessOver: row.floor }
	})
}

/** Derive each SSS bracket's read-only `totalContribution = eeShare + erShare`. */
export function deriveSssTotals<T extends { eeShare: number; erShare: number }>(
	rows: T[]
): (T & { totalContribution: number })[] {
	return rows.map((r) => ({ ...r, totalContribution: r.eeShare + r.erShare }))
}

// ─── Service (org-scoped upsert + audit) ──────────────────────────────────────

export async function getStatutoryRateConfig(organizationId: string) {
	return db.statutoryRateConfig.findUnique({ where: { organizationId } })
}

// A nullable Json column stores SQL NULL (no override) via Prisma.DbNull; an array via itself.
const jsonOrNull = (v: unknown[] | null): Prisma.InputJsonValue | typeof Prisma.DbNull =>
	v == null ? Prisma.DbNull : (v as unknown as Prisma.InputJsonValue)

/**
 * Apply a rate set to the org's live StatutoryRateConfig + audit the change with full old→new.
 * `meta` threads proposal provenance (proposer + proposal id) into the audit newValue when the
 * apply came from a confirmed proposal, so the trail records proposer AND confirmer (#220).
 */
export async function updateStatutoryRateConfig(
	organizationId: string,
	data: StatutoryRateInput,
	ctx: AuditContext,
	// Not optional any more: a required parameter cannot follow an optional one, and `client` below
	// is now required. Callers with no proposal provenance pass `undefined`.
	meta: { proposalId?: string; proposedById?: string } | undefined,
	// #5 / D12: NO `= db` default. This function is on the do-not-wrap list — "Prisma has no nested
	// interactive transactions" — so it must keep taking its client from the caller. The default made
	// the route caller's tax-table upsert and its audit row two separate commits while the site still
	// read as already-correct, because a client WAS being passed on to `writeAuditLog`.
	client: Prisma.TransactionClient
) {
	const persist = {
		philhealthRate: data.philhealthRate,
		philhealthFloor: data.philhealthFloor,
		philhealthCeiling: data.philhealthCeiling,
		pagibigRate: data.pagibigRate,
		pagibigCap: data.pagibigCap,
		sssBrackets: jsonOrNull(data.sssBrackets),
		taxBrackets: jsonOrNull(data.taxBrackets)
	}

	const existing = await client.statutoryRateConfig.findUnique({ where: { organizationId } })
	const row = await client.statutoryRateConfig.upsert({
		where: { organizationId },
		create: { organizationId, ...persist },
		update: persist
	})

	await writeAuditLog(
		ctx,
		{
			action: 'UPDATE',
			entityType: 'StatutoryRateConfig',
			entityId: row.id,
			oldValue: existing
				? {
						philhealthRate: numOrUndef(existing.philhealthRate) ?? null,
						philhealthFloor: numOrUndef(existing.philhealthFloor) ?? null,
						philhealthCeiling: numOrUndef(existing.philhealthCeiling) ?? null,
						pagibigRate: numOrUndef(existing.pagibigRate) ?? null,
						pagibigCap: numOrUndef(existing.pagibigCap) ?? null,
						sssBrackets: existing.sssBrackets ?? null,
						taxBrackets: existing.taxBrackets ?? null
					}
				: undefined,
			newValue: {
				philhealthRate: data.philhealthRate,
				philhealthFloor: data.philhealthFloor,
				philhealthCeiling: data.philhealthCeiling,
				pagibigRate: data.pagibigRate,
				pagibigCap: data.pagibigCap,
				sssBrackets: data.sssBrackets,
				taxBrackets: data.taxBrackets,
				...(meta ?? {})
			}
		},
		client
	)

	return row
}

// ─── HR-propose / CEO-confirm (#220) ──────────────────────────────────────────
// HR_ADMIN cannot edit live rates; their save records a PENDING proposal. A CEO/SUPER_ADMIN then
// confirms (applies the payload to the live config) or rejects. The payload is re-validated against
// `statutoryRateInputSchema` on apply — the trust boundary is the apply, not just the propose.

export async function listPendingProposals(organizationId: string) {
	return db.statutoryRateProposal.findMany({
		where: { organizationId, status: 'PENDING' },
		orderBy: { createdAt: 'desc' }
	})
}

export async function proposeStatutoryRates(
	organizationId: string,
	data: StatutoryRateInput,
	ctx: AuditContext
) {
	// #5: the audit row commits with the proposal it records.
	return await db.$transaction(async (tx) => {
		const proposal = await tx.statutoryRateProposal.create({
			data: {
				organizationId,
				proposedById: ctx.actorId,
				payload: data as unknown as Prisma.InputJsonValue
			}
		})

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'StatutoryRateProposal',
				entityId: proposal.id,
				newValue: { proposedById: ctx.actorId, payload: data }
			},
			tx
		)

		return proposal
	})
}

export async function confirmProposal(
	organizationId: string,
	proposalId: string,
	ctx: AuditContext
) {
	return db.$transaction(async (tx) => {
		// Atomically CLAIM the proposal: a status-guarded updateMany moves PENDING → APPLIED and only
		// succeeds once, so two confirmers racing the same proposal can't both apply it. If nothing was
		// claimed, someone else already decided it (or it never existed).
		const claim = await tx.statutoryRateProposal.updateMany({
			where: { id: proposalId, organizationId, status: 'PENDING' },
			data: { status: 'APPLIED', decidedById: ctx.actorId, decidedAt: new Date() }
		})
		if (claim.count === 0) error(404, 'Pending proposal not found')

		const proposal = await tx.statutoryRateProposal.findUniqueOrThrow({ where: { id: proposalId } })

		// GUARDRAIL (#283/F2): the proposer may not confirm their own proposal. The two gates are
		// disjoint TODAY only by accident of single-role assignment (propose is HR-Admin-only, confirm is
		// CEO/Super-Admin-only), so one [HR_ADMIN, CEO] user collapses #220's two-person rule entirely.
		// Mirrors assertMayDecide in services/action-proposals.ts, which already implements exactly this
		// check — the two propose→confirm implementations disagreed until now.
		//
		// CONFIRM only (Q2). Self-REJECT stays allowed and reads as withdrawing a mistake: it applies
		// nothing, writes no rate config, and leaves the tax tables untouched.
		//
		// Placed after the claim on purpose: the claim is the race guard, and throwing here rolls it
		// back to PENDING.
		if (proposal.proposedById === ctx.actorId) {
			error(403, 'You cannot confirm a rate change you proposed yourself.')
		}

		// Re-validate at apply time — the payload was validated on propose, but the apply is the real
		// trust boundary (a stale/tampered row must not reach the tax math). A parse failure throws and
		// the transaction rolls the claim back to PENDING.
		const data = statutoryRateInputSchema.parse(proposal.payload)
		await updateStatutoryRateConfig(
			organizationId,
			data,
			ctx,
			{ proposalId: proposal.id, proposedById: proposal.proposedById },
			tx
		)

		return proposal
	})
}

export async function rejectProposal(
	organizationId: string,
	proposalId: string,
	ctx: AuditContext
) {
	const proposal = await db.statutoryRateProposal.findFirst({
		where: { id: proposalId, organizationId, status: 'PENDING' }
	})
	if (!proposal) error(404, 'Pending proposal not found')

	// #5: the rejection and its audit row commit together.
	return await db.$transaction(async (tx) => {
		const updated = await tx.statutoryRateProposal.update({
			where: { id: proposalId },
			data: { status: 'REJECTED', decidedById: ctx.actorId, decidedAt: new Date() }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'StatutoryRateProposal',
				entityId: proposalId,
				oldValue: { status: 'PENDING', proposedById: proposal.proposedById },
				newValue: { status: 'REJECTED', decidedById: ctx.actorId }
			},
			tx
		)

		return updated
	})
}

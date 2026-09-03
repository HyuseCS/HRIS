// #3/#163 pre-flight (throwaway, READ-ONLY). Lists every DRAFT/COMPUTED PayrollRun whose
// (periodStart, periodEnd) is not one of the three standard shapes, and says — per row — whether
// the current rules will actually MOVE its numbers on the next recompute.
//
// Not every non-standard row moves. `periodShareOf` keeps the historical flat 0.5 for a reversed
// range or a cross-month range whose summed month-slice fraction is OVER the one-month cap (D6) —
// those recompute to exactly what they hold today, never clamped to 1. Any other non-standard
// range — same-month, or cross-month AT OR UNDER the cap — switches to a day-count share, and
// even then only when that share is not itself 0.5. LOCKED/RELEASED/VOIDED runs never recompute
// at all, so they are not listed.
//
//   pnpm dotenv -e .env.dev -- tsx scripts/legacy-nonstandard-runs.ts
//
// Run this against EVERY database this change reaches (dev, staging, prod) — a clean dev
// result proves nothing about the others (S9).

import { PrismaClient } from '@prisma/client'
import { pathToFileURL } from 'node:url'
import {
	isValidStandardPeriod,
	summedMonthShare,
	describePeriod,
	periodShareOf,
	utcMidnight
} from '../src/lib/utils/pay-periods'

/** The flat share every non-standard pair takes today, before #163. */
const LEGACY_SHARE = 0.5

export type RunClassification =
	{ moves: true; oldShare: number; newShare: number } | { moves: false; reason: string }

/**
 * Will #163 change this run's statutory/loan proration? Exported for the unit test — the operator
 * reads this wording before a production run, so it has to be exactly right.
 */
export function classifyLegacyRun(periodStart: Date, periodEnd: Date): RunClassification {
	if (isValidStandardPeriod(periodStart, periodEnd)) {
		return {
			moves: false,
			reason: 'standard shape — its share is frozen (0.5, or 1 for a whole month)'
		}
	}
	if (utcMidnight(periodEnd) < utcMidnight(periodStart)) {
		return { moves: false, reason: 'reversed range — keeps the historical flat 0.5' }
	}
	if (summedMonthShare(periodStart, periodEnd) > 1) {
		return { moves: false, reason: 'over the one-month cap — keeps the historical flat 0.5' }
	}
	const newShare = periodShareOf(periodStart, periodEnd)
	if (newShare === LEGACY_SHARE) {
		return {
			moves: false,
			reason: 'same-month, but its day-count share is exactly 0.5 — no change'
		}
	}
	return { moves: true, oldShare: LEGACY_SHARE, newShare }
}

const pct = (share: number) => `${(share * 100).toFixed(1)}%`

async function main() {
	const db = new PrismaClient()
	try {
		const runs = await db.payrollRun.findMany({
			where: { status: { in: ['DRAFT', 'COMPUTED'] } },
			select: {
				id: true,
				organizationId: true,
				status: true,
				periodStart: true,
				periodEnd: true,
				totalNet: true
			},
			orderBy: { periodStart: 'asc' }
		})

		const legacy = runs
			.filter((r) => !isValidStandardPeriod(r.periodStart, r.periodEnd))
			.map((r) => ({ ...r, verdict: classifyLegacyRun(r.periodStart, r.periodEnd) }))

		const describe = (r: (typeof legacy)[number]) =>
			`  ${r.id}  org=${r.organizationId}  ${r.status}  ` +
			`${r.periodStart.toISOString()} → ${r.periodEnd.toISOString()}  ` +
			`(${describePeriod(r.periodStart, r.periodEnd).label})  totalNet=${r.totalNet}`

		console.log(`Scanned ${runs.length} DRAFT/COMPUTED payroll run(s).`)
		if (legacy.length === 0) {
			console.log('No legacy exposure: 0 non-standard recomputable runs.')
			return
		}

		const moving = legacy.filter((r) => r.verdict.moves)
		const unaffected = legacy.filter((r) => !r.verdict.moves)
		console.log(
			`${legacy.length} non-standard recomputable run(s): ${moving.length} will move, ${unaffected.length} will not.\n`
		)

		console.log(`WILL MOVE on recompute — ${moving.length} run(s).`)
		console.log('Same-month non-standard ranges: statutory and loan proration switches from the')
		console.log("flat 0.5 to the range's day-count share.")
		if (moving.length === 0) console.log('  (none)')
		for (const r of moving) {
			const v = r.verdict as { moves: true; oldShare: number; newShare: number }
			console.log(`${describe(r)}\n      share ${pct(v.oldShare)} → ${pct(v.newShare)}`)
		}

		console.log(`\nUNAFFECTED — ${unaffected.length} run(s). These recompute to the same numbers.`)
		if (unaffected.length === 0) console.log('  (none)')
		for (const r of unaffected) {
			console.log(`${describe(r)}\n      ${(r.verdict as { reason: string }).reason}`)
		}
	} finally {
		await db.$disconnect()
	}
}

// Only run when invoked directly — the unit test imports `classifyLegacyRun` from this file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((e) => {
		console.error(e)
		process.exitCode = 1
	})
}

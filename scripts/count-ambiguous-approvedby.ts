// READ-ONLY (#298). Counts how many historical `payroll_runs.approvedById` rows are ambiguous —
// i.e. may name whoever LOCKED the period rather than whoever approved the run, because before
// #298 `lock()` wrote that field too. Owner decision 4: no backfill, so this quantifies the
// residue rather than fixing it.
//
//   pnpm dotenv -e .env.dev -- tsx scripts/count-ambiguous-approvedby.ts
//
// This script performs NO writes: no update, updateMany, $executeRaw or create. `pnpm check` does
// NOT typecheck scripts/**, so run it once by hand to prove it compiles.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
	const runs = await db.payrollRun.findMany({
		where: { approvedById: { not: null } },
		select: {
			organizationId: true,
			status: true,
			approvedAt: true,
			period: { select: { lockedAt: true } }
		}
	})

	const byOrg = new Map<string, { total: number; notApproved: number; nearLock: number }>()
	for (const run of runs) {
		const row = byOrg.get(run.organizationId) ?? { total: 0, notApproved: 0, nearLock: 0 }
		row.total++
		// The strong signal: `lock()` deliberately left the run COMPUTED, so an approver id on a
		// run that is not APPROVED was almost certainly written by the lock.
		if (run.status !== 'APPROVED') row.notApproved++
		// The corroborating signal: approvedAt within one second of the period's lockedAt.
		const lockedAt = run.period?.lockedAt
		if (
			run.approvedAt &&
			lockedAt &&
			Math.abs(run.approvedAt.getTime() - lockedAt.getTime()) <= 1000
		) {
			row.nearLock++
		}
		byOrg.set(run.organizationId, row)
	}

	if (byOrg.size === 0) {
		console.log('No payroll_runs carry a non-null approvedById — nothing is ambiguous.')
		return
	}
	for (const [organizationId, row] of byOrg) {
		console.log(
			`org ${organizationId}: ${row.total} run(s) with approvedById NOT NULL — ` +
				`${row.notApproved} not APPROVED (strong signal), ` +
				`${row.nearLock} with approvedAt within 1s of the period lockedAt (corroborating)`
		)
	}
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})

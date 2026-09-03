// One-off: add the `review_cycles` composite unique index on (organizationId, startDate, endDate)
// (#178).
//
//   pnpm tsx scripts/migrate-review-cycle-period-key.ts
//
// Run this BEFORE `prisma db push` on any database that already holds review cycles. Push CAN add
// the index, but it refuses to add a unique constraint to a populated table without
// `--accept-data-loss`:
//
//   ⚠️  A unique constraint covering the columns [organizationId,startDate,endDate] on the table
//       review_cycles will be added. If there are existing duplicate values, this will fail.
//
// `scripts/prestart.sh` passes no `--accept-data-loss` flag by design — see the note in
// scripts/migrate-user-role-to-roles.ts, which made the same call for the same reason: a flag added
// once silently permits every future destructive change, and the CI `schema-upgrade` job exists
// precisely to catch those.
//
// So the index is created HERE instead. Push then finds it already present, emits no warning, and
// prestart still needs no flag.
//
// The duplicate check is not ceremony. `createReviewCycle` shipped with no uniqueness check at all,
// so two HR submissions with the same dates produce two rows on any database running today, and
// `CREATE UNIQUE INDEX` over genuine duplicates fails with a bare Postgres error naming neither the
// rows nor the reason. This script REFUSES and prints the offending rows; it never de-duplicates.
// A duplicate cycle owns PerformanceReview children holding employee-authored evaluation content,
// so picking a survivor is a business decision with no safe default.
//
// Idempotent: a no-op on a fresh database and on every run after the first.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const INDEX = 'review_cycles_organizationId_startDate_endDate_key'

async function main() {
	// 1. A fresh droplet has no tables yet. Return quietly instead of throwing, so prestart's
	//    `set -e` chain reaches the push that creates the table with the index already declared.
	const [{ present }] = await db.$queryRawUnsafe<{ present: boolean }[]>(
		`select to_regclass('public.review_cycles') is not null as present`
	)
	if (!present) {
		console.log('✔ review_cycles does not exist yet — db push will create it with the index.')
		return
	}

	// 2. Refuse to build the index over data that would make it fail, and say which rows.
	//    No DELETE, no UPDATE: resolving a duplicate cycle is a human decision.
	const dupes = await db.$queryRawUnsafe<
		{ organizationId: string; startDate: Date; endDate: Date; n: bigint; ids: string[] }[]
	>(
		`
		select "organizationId", "startDate", "endDate", count(*) as n, array_agg(id) as ids
		from "review_cycles"
		group by "organizationId", "startDate", "endDate"
		having count(*) > 1
		`
	)
	if (dupes.length > 0) {
		console.error(
			`✖ ${dupes.length} duplicate (organizationId, startDate, endDate) period(s) block the index:`
		)
		for (const d of dupes) {
			const start = d.startDate.toISOString().slice(0, 10)
			const end = d.endDate.toISOString().slice(0, 10)
			console.error(
				`    org=${d.organizationId}  ${start} → ${end}  ×${d.n}  ids: ${d.ids.join(', ')}`
			)
		}
		console.error(
			'  Merge or remove the extra cycles by hand before pushing — each one owns PerformanceReview'
		)
		console.error('  rows with employee-authored content, so this script will not choose for you.')
		process.exit(1)
	}

	// 3. The index itself. Named exactly as Prisma names
	//    `@@unique([organizationId, startDate, endDate])`, so push recognises it as already applied
	//    rather than trying to add its own.
	await db.$executeRawUnsafe(
		`create unique index if not exists "${INDEX}" on "review_cycles" ("organizationId", "startDate", "endDate")`
	)

	console.log(`✔ ${INDEX} is in place.`)
	console.log('  Run `pnpm db:push` next.')
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())

// One-off: add `time_logs.dedupKey` and its composite unique index (#200).
//
//   pnpm tsx scripts/migrate-timelog-dedup-key.ts
//
// Run this BEFORE `prisma db push` on any database that already holds punches. Push CAN add both
// the column and the index, but it refuses to add a unique constraint to a populated table without
// `--accept-data-loss`:
//
//   ⚠️  A unique constraint covering the columns [dedupKey,employeeId] on the table time_logs
//       will be added. If there are existing duplicate values, this will fail.
//
// That warning is precautionary, not a real risk here. Every pre-existing punch arrived from
// Discord and carries `dedupKey = NULL`, and Postgres treats NULLs as distinct in a composite
// unique index, so no two existing rows can collide. But `scripts/prestart.sh` deliberately passes
// no `--accept-data-loss` flag — see the note in scripts/migrate-user-role-to-roles.ts, which made
// the same call for the same reason: a flag added once silently permits every future destructive
// change, and the CI `schema-upgrade` job exists precisely to catch those.
//
// So the index is created HERE instead. Push then finds it already present, emits no warning, and
// prestart still needs no flag.
//
// The duplicate check is not ceremony. A database that has already run part of this branch could
// hold WEB punches with real keys, and `CREATE UNIQUE INDEX` on genuine duplicates fails with a
// bare Postgres error naming neither the rows nor the reason. Failing first, loudly, with the
// offending keys, is the difference between a five-minute fix and an outage.
//
// Idempotent: a no-op on a fresh database and on every run after the first.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const INDEX = 'time_logs_dedupKey_employeeId_key'

async function main() {
	// 1. The column. `IF NOT EXISTS` covers both a fresh database and a re-run.
	await db.$executeRawUnsafe(`alter table "time_logs" add column if not exists "dedupKey" text`)

	// 2. Refuse to build the index over data that would make it fail, and say which rows.
	const dupes = await db.$queryRawUnsafe<{ dedupKey: string; employeeId: string; n: bigint }[]>(
		`
		select "dedupKey", "employeeId", count(*) as n
		from "time_logs"
		where "dedupKey" is not null
		group by "dedupKey", "employeeId"
		having count(*) > 1
		limit 20
		`
	)
	if (dupes.length > 0) {
		console.error(`✖ ${dupes.length} duplicate (dedupKey, employeeId) pair(s) block the index:`)
		for (const d of dupes) console.error(`    ${d.dedupKey}  employee=${d.employeeId}  ×${d.n}`)
		console.error('  Resolve these before pushing — the unique index cannot be created over them.')
		process.exit(1)
	}

	// 3. The index itself. Named exactly as Prisma names `@@unique([dedupKey, employeeId])`, so
	//    push recognises it as already applied rather than trying to add its own.
	await db.$executeRawUnsafe(
		`create unique index if not exists "${INDEX}" on "time_logs" ("dedupKey", "employeeId")`
	)

	console.log(`✔ time_logs.dedupKey and ${INDEX} are in place.`)
	console.log('  Run `pnpm db:push` next.')
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())

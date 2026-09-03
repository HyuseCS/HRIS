// One-off: rename the ReviewStatus value MANAGER_REVIEW → SCORED (#178, Phase 2).
//
//   pnpm exec dotenv -e .env.dev -- tsx scripts/migrate-review-status-scored.ts
//   pnpm db:push
//
// Run this BEFORE `prisma db push` on any database that already holds data. Postgres can
// rename an enum value in place, preserving every row that uses it — but Prisma's push cannot
// express a rename. It sees one value removed and another added, and resolves that by
// recreating the type, which means dropping rows or refusing outright with a data-loss warning.
//
// SIGNING is a pure addition and needs no help here — `db push` adds it on its own.
//
// Idempotent: safe to run before every push, and a no-op once the rename has happened. That
// also makes it safe to wire into a deploy step ahead of `prisma db push` — a fresh droplet
// or a recreated volume hits the no-op path rather than an error, so the `&&` chain keeps
// going and the app still starts.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
	const [{ type_exists, has_old, has_new }] = await db.$queryRawUnsafe<
		{ type_exists: boolean; has_old: boolean | null; has_new: boolean | null }[]
	>(`
		select
			count(*) > 0                         as type_exists,
			bool_or(enumlabel = 'MANAGER_REVIEW') as has_old,
			bool_or(enumlabel = 'SCORED')         as has_new
		from pg_enum e
		join pg_type t on t.oid = e.enumtypid
		where t.typname = 'ReviewStatus'
	`)

	// Nothing to rename on a database that has never been pushed to — the type is about to be
	// created with SCORED already in it.
	if (!type_exists) {
		console.log('✔ ReviewStatus does not exist yet — nothing to rename; db push will create it.')
		return
	}

	if (!has_old && has_new) {
		console.log('✔ Already migrated — ReviewStatus has SCORED and no MANAGER_REVIEW.')
		return
	}
	if (!has_old && !has_new) {
		throw new Error(
			'ReviewStatus has neither MANAGER_REVIEW nor SCORED — is the schema applied at all?'
		)
	}

	// Evidence, not decoration: RESEARCH concluded nothing writes MANAGER_REVIEW, but no live
	// database was ever inspected. Raw SQL, not db.performanceReview.count(): the generated
	// client is built from the current schema, which no longer declares the old value, so it
	// rejects it before the query is sent.
	const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(
		`select count(*) as count from performance_reviews where status = 'MANAGER_REVIEW'`
	)
	console.log(`  performance_reviews holding MANAGER_REVIEW: ${Number(count)}`)

	if (has_old && has_new) {
		// Both present means a push already added SCORED alongside the old value. Move the rows
		// across and drop nothing: removing an enum value needs a type rebuild, which is exactly
		// what this script exists to avoid, so MANAGER_REVIEW is left orphaned but unused.
		const moved = await db.$executeRawUnsafe(
			`UPDATE performance_reviews SET status = 'SCORED' WHERE status = 'MANAGER_REVIEW'`
		)
		console.log(`✔ Moved ${moved} review(s) from MANAGER_REVIEW to SCORED.`)
		console.log('  MANAGER_REVIEW remains defined but unused; dropping it needs a type rebuild.')
		return
	}

	// The normal path: rename in place. Every row keeps its value, no rewrite, no downtime.
	await db.$executeRawUnsafe(`ALTER TYPE "ReviewStatus" RENAME VALUE 'MANAGER_REVIEW' TO 'SCORED'`)
	console.log(`✔ Renamed MANAGER_REVIEW → SCORED. ${Number(count)} review(s) now read as SCORED.`)
	console.log('  Run `pnpm db:push` next to add the new SIGNING value.')
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})

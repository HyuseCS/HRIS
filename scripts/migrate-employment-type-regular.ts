// One-off: rename the EmploymentType value FULL_TIME → REGULAR (#172).
//
//   bunx tsx scripts/migrate-employment-type-regular.ts
//
// Run this BEFORE `prisma db push` on any database that already holds data. Postgres can rename
// an enum value in place, preserving every row that uses it — but Prisma's push cannot express
// a rename. It sees one value removed and another added, and resolves that by recreating the
// type, which means dropping rows or refusing outright with a data-loss warning.
//
// Idempotent: safe to run before every push, and a no-op once the rename has happened. That
// also makes it safe to wire into a deploy step ahead of `prisma db push`.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
	const [{ type_exists, has_old, has_new }] = await db.$queryRawUnsafe<
		{ type_exists: boolean; has_old: boolean | null; has_new: boolean | null }[]
	>(`
		select
			count(*) > 0                     as type_exists,
			bool_or(enumlabel = 'FULL_TIME') as has_old,
			bool_or(enumlabel = 'REGULAR')   as has_new
		from pg_enum e
		join pg_type t on t.oid = e.enumtypid
		where t.typname = 'EmploymentType'
	`)

	// Nothing to rename on a database that has never been pushed to — the type is about to be
	// created with REGULAR already in it. This runs as a deploy step ahead of `db push`
	// (docker-compose.yml), so a fresh droplet or a recreated volume hits this path, and it must
	// be a no-op rather than an error or the `&&` chain stops and the app never starts.
	if (!type_exists) {
		console.log('✔ EmploymentType does not exist yet — nothing to rename; db push will create it.')
		return
	}

	if (!has_old && has_new) {
		console.log('✔ Already migrated — EmploymentType has REGULAR and no FULL_TIME.')
		return
	}
	if (!has_old && !has_new) {
		throw new Error(
			'EmploymentType has neither FULL_TIME nor REGULAR — is the schema applied at all?'
		)
	}
	if (has_old && has_new) {
		// Both present means a push already added REGULAR alongside the old value. Move the rows
		// across and drop nothing: removing an enum value needs a type rebuild, which is exactly
		// what this script exists to avoid, so FULL_TIME is left orphaned but unused.
		//
		// Raw SQL, not employee.updateMany: the generated client is built from the current schema,
		// which no longer declares FULL_TIME, so it rejects the value before the query is sent.
		const moved = await db.$executeRawUnsafe(
			`UPDATE employees SET "employmentType" = 'REGULAR' WHERE "employmentType" = 'FULL_TIME'`
		)
		console.log(`✔ Moved ${moved} employee(s) from FULL_TIME to REGULAR.`)
		console.log('  FULL_TIME remains defined but unused; dropping it needs a type rebuild.')
		return
	}

	// The normal path: rename in place. Every row keeps its value, no rewrite, no downtime.
	await db.$executeRawUnsafe(`ALTER TYPE "EmploymentType" RENAME VALUE 'FULL_TIME' TO 'REGULAR'`)
	const count = await db.employee.count({ where: { employmentType: 'REGULAR' } })
	console.log(`✔ Renamed FULL_TIME → REGULAR. ${count} employee(s) now read as REGULAR.`)
	console.log('  Run `bun run db:push` next to add the new ON_CALL and INTERN values.')
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})

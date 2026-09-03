// One-off: drop the Goals feature's table and enum (#178, Phase 1).
//
//   pnpm exec dotenv -e .env.dev -- tsx scripts/migrate-drop-goals.ts [--confirm]
//   pnpm db:push
//
// Run this BEFORE `prisma db push` on any database that already holds data. The schema no
// longer declares `model Goal` or `enum GoalStatus`, so push would drop them itself — but it
// stops with a data-loss warning when the table has rows, which blocks an unattended deploy.
// Doing it here makes the destruction explicit and gated.
//
// IRREVERSIBLE: a dropped table takes its rows with it. If `goals` is not empty the script
// refuses to continue unless `--confirm` is passed, so nobody deletes live data by reflex.
//
// Idempotent: safe to run before every push, and a no-op once the drop has happened. That
// also makes it safe to wire into a deploy step ahead of `prisma db push` — a fresh droplet
// or a recreated volume hits the no-op path rather than an error, so the `&&` chain keeps
// going and the app still starts.
//
// audit_logs is deliberately left alone. Rows with entityType='Goal' have no FK to the goals
// table, so they survive the drop and stay readable as history.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const confirmed = process.argv.includes('--confirm')

async function main() {
	const [{ table_exists }] = await db.$queryRawUnsafe<{ table_exists: boolean }[]>(`
		select count(*) > 0 as table_exists
		from information_schema.tables
		where table_schema = current_schema() and table_name = 'goals'
	`)

	if (!table_exists) {
		console.log('✔ Table "goals" does not exist — nothing to drop.')
	} else {
		// Raw SQL, not db.goal.count(): the generated client is built from the current schema,
		// which no longer declares the model at all.
		const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(
			`select count(*) as count from goals`
		)
		const rows = Number(count)
		console.log(`  goals row count: ${rows}`)

		if (rows > 0 && !confirmed) {
			throw new Error(
				`Refusing to drop "goals": it holds ${rows} row(s) and this is irreversible. ` +
					'Re-run with --confirm once the loss is accepted.'
			)
		}

		await db.$executeRawUnsafe(`DROP TABLE IF EXISTS goals`)
		console.log(`✔ Dropped table "goals" (${rows} row(s) destroyed).`)
	}

	// Separate statement, and separately idempotent: the type can outlive the table if a
	// previous run was interrupted between the two drops.
	await db.$executeRawUnsafe(`DROP TYPE IF EXISTS "GoalStatus"`)
	console.log('✔ Dropped type "GoalStatus" if it existed.')

	const [{ audit_rows }] = await db.$queryRawUnsafe<{ audit_rows: bigint }[]>(
		`select count(*) as audit_rows from audit_logs where "entityType" = 'Goal'`
	)
	console.log(`✔ audit_logs rows with entityType='Goal': ${Number(audit_rows)} — untouched.`)
	console.log('  Run `pnpm db:push` next.')
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})

// One-off: replace the free-text `department` column on the two clearance tables with the
// `ClearanceArea` enum plus an optional plain `departmentId` column (#306).
//
//   pnpm dotenv -e .env.dev -- tsx scripts/migrate-clearance-area.ts
//
// Run this BEFORE `prisma db push`. Push cannot express a column rename, let alone a
// text→enum change: it sees one column dropped and another added, and offers to destroy the
// data. This is the trap that bit #172. Doing the DDL by hand first puts the database in the
// target shape, so push has nothing left to do.
//
// Idempotent: the `area`-exists guard makes a second run a no-op per table.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const TABLES = ['clearance_items', 'offboarding_checklist_items']

// Legacy free-text values → enum. Matched case-insensitively on the trimmed value.
const MAP: Record<string, string> = {
	it: 'IT',
	hr: 'HR',
	admin: 'ADMIN',
	finance: 'FINANCE',
	'immediate supervisor': 'IMMEDIATE_SUPERVISOR'
}
const FALLBACK = 'ADMIN'

async function tableExists(table: string) {
	const [{ exists }] = await db.$queryRawUnsafe<{ exists: boolean }[]>(
		`select count(*) > 0 as exists from information_schema.tables
		 where table_schema = 'public' and table_name = '${table}'`
	)
	return exists
}

async function columnExists(table: string, column: string) {
	const [{ exists }] = await db.$queryRawUnsafe<{ exists: boolean }[]>(
		`select count(*) > 0 as exists from information_schema.columns
		 where table_schema = 'public' and table_name = '${table}' and column_name = '${column}'`
	)
	return exists
}

async function migrateTable(table: string) {
	if (!(await tableExists(table))) {
		console.log(`— ${table}: table does not exist yet; db push will create it correctly.`)
		return
	}
	if (await columnExists(table, 'area')) {
		console.log(`✔ ${table}: already migrated.`)
		return
	}

	// Read before destroying: every distinct legacy value with its row count, so an operator
	// sees exactly what the catch-all swallowed.
	const rows = await db.$queryRawUnsafe<{ department: string | null; count: bigint }[]>(
		`select "department", count(*) as count from "${table}" group by 1 order by 1`
	)
	for (const r of rows) {
		const key = (r.department ?? '').trim().toLowerCase()
		const mapped = MAP[key]
		if (mapped) {
			console.log(`  ${table}: "${r.department}" (${r.count}) → ${mapped}`)
		} else {
			console.log(
				`  ⚠ ${table}: UNMAPPED "${r.department}" (${r.count} row(s)) → ${FALLBACK} (catch-all)`
			)
		}
	}

	// Temp default so ADD COLUMN NOT NULL succeeds on populated rows; dropped again below.
	await db.$executeRawUnsafe(
		`ALTER TABLE "${table}" ADD COLUMN "area" "ClearanceArea" NOT NULL DEFAULT '${FALLBACK}'`
	)
	for (const [legacy, area] of Object.entries(MAP)) {
		await db.$executeRawUnsafe(
			`UPDATE "${table}" SET "area" = '${area}'::"ClearanceArea" WHERE lower(trim("department")) = '${legacy}'`
		)
	}
	await db.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "area" DROP DEFAULT`)
	// Plain nullable column, no FK constraint at all — see §Shape of departmentId.
	await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "departmentId" TEXT`)
	await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "department"`)
	console.log(`✔ ${table}: migrated.`)
}

async function main() {
	// Postgres has no CREATE TYPE IF NOT EXISTS, and this script must survive a second run.
	await db.$executeRawUnsafe(`
		DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClearanceArea') THEN
				CREATE TYPE "ClearanceArea" AS ENUM ('IT','HR','ADMIN','FINANCE','IMMEDIATE_SUPERVISOR');
			END IF;
		END $$;
	`)
	for (const table of TABLES) await migrateTable(table)
	console.log('Run `pnpm db:push` next.')
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})

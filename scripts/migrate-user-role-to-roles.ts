// One-off: collapse the scalar `User.role` into the `User.roles` set, and replace the scalar
// `AuditLog.actorRole` with an `actorRoles` array (#282).
//
//   pnpm tsx scripts/migrate-user-role-to-roles.ts
//
// Run this BEFORE `prisma db push` on any database that already holds data. Push can add
// `audit_logs.actorRoles`, but it cannot copy the old column's values into it — a column added
// and backfilled in the same pass is not something push can express. So this script adds the
// column itself and fills it. Same reasoning as scripts/migrate-employment-type-regular.ts.
//
// Three steps, strictly in this order:
//   1. every user's scalar `role` is folded into their `roles` set, then asserted non-empty;
//   2. `audit_logs.actorRoles` is added and backfilled from `actorRole`, then asserted non-empty;
//   3. only then are `users.role` and `audit_logs.actorRole` dropped.
//
// The drops must not run before those two assertions: a user left with an empty roles set is an
// unrecoverable lockout, and an audit row with an empty actorRoles has lost its historical actor
// role for good.
//
// Why the drops live HERE rather than being left to `prisma db push`: push refuses to drop a
// populated NOT NULL column without `--accept-data-loss`, and `scripts/prestart.sh` deliberately
// passes no such flag. Dropping here means push finds nothing to drop, emits no data-loss warning,
// and prestart needs no flag — a flag which, once added, would silently permit every future
// destructive change.
//
// Idempotent: safe to run before every push, a no-op on a fresh database, and a no-op on every
// run after the first (the drops are `IF EXISTS`). Also re-entrant — each step re-derives its own
// precondition, so a run that dies halfway can simply be run again.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const BATCH_SIZE = 10_000

async function columnExists(table: string, column: string): Promise<boolean> {
	const [{ present }] = await db.$queryRawUnsafe<{ present: boolean }[]>(
		`
		select count(*) > 0 as present
		from information_schema.columns
		where table_schema = 'public' and table_name = $1 and column_name = $2
	`,
		table,
		column
	)
	return present
}

async function countRows(sql: string): Promise<number> {
	const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(sql)
	return n
}

// Every user must end up with at least one role. Nothing here should ever produce an empty set,
// but an empty set survives to the `users.role` drop as an unrecoverable lockout — the user can
// authenticate and then hold no capability at all, and assertNotLastOfRole can never be satisfied
// to give them one back. Cheap to check, catastrophic to miss.
async function assertNoRolelessUsers() {
	const empty = await countRows(
		`select count(*)::int as n from "users" where cardinality(roles) = 0`
	)
	if (empty > 0) {
		throw new Error(
			`${empty} user(s) have an empty roles set. Refusing to continue — fix these rows before ` +
				`the scalar role column is dropped, or they will be locked out with no way to be granted a role back.`
		)
	}
}

async function migrateUsers() {
	// A fresh database has no `users` table yet (this runs ahead of `db push`), and a database that
	// has already been through the whole migration has no `role` column. Both are no-ops, not errors:
	// prestart.sh is an `set -e` chain, so throwing here means the app never starts.
	if (!(await columnExists('users', 'role'))) {
		console.log('✔ users.role is already gone (or not created yet) — nothing to collapse.')
		return
	}

	// Loud stop on a genuine multi-role user whose scalar drifted outside their set. The UPDATE below
	// REPLACES the set (deliberately — it repairs the #255 desync, and appending would retain stale
	// authority), so such a row would be silently flattened to a single role. Unreachable today:
	// every writer keeps `role` inside `roles`. If it ever happens, stop rather than lose authority.
	const drifted = await countRows(
		`select count(*)::int as n from "users" where cardinality(roles) > 1 and not (role = any(roles))`
	)
	if (drifted > 0) {
		throw new Error(
			`${drifted} multi-role user(s) have a scalar role outside their roles set. Refusing to ` +
				`continue — collapsing these would silently drop the roles they actually hold. Reconcile them by hand first.`
		)
	}

	const repaired = await db.$executeRawUnsafe(
		`UPDATE "users" SET roles = ARRAY[role]::"Role"[] WHERE cardinality(roles) = 0 OR NOT (role = ANY(roles))`
	)
	console.log(
		repaired > 0
			? `✔ Repaired ${repaired} user(s) whose roles set did not contain their scalar role.`
			: '✔ Every user already carries their scalar role in roles — nothing to repair.'
	)

	await assertNoRolelessUsers()
}

async function migrateAuditLogs() {
	// Same two no-op cases as users: no table yet, or the scalar is already dropped.
	if (!(await columnExists('audit_logs', 'actorRole'))) {
		console.log(
			'✔ audit_logs.actorRole is already gone (or not created yet) — nothing to backfill.'
		)
		return
	}

	// Metadata-only on PG11+, so this is cheap even on a large table. IF NOT EXISTS makes the whole
	// step re-entrant: a run that died after the ALTER but before the backfill just continues below.
	await db.$executeRawUnsafe(
		`ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorRoles" "Role"[] NOT NULL DEFAULT '{}'`
	)

	// Batched, not one statement. This runs inside prestart.sh, which gates app startup: an unbounded
	// rewrite of a payroll-and-201-file audit history would hold a lock through the whole deploy.
	// `cardinality(...) = 0` is the cursor, so each batch is independently committed and a crash
	// mid-backfill resumes exactly where it stopped.
	let total = 0
	for (;;) {
		const moved = await db.$executeRawUnsafe(`
			UPDATE "audit_logs" SET "actorRoles" = ARRAY["actorRole"]::"Role"[]
			WHERE ctid IN (
				SELECT ctid FROM "audit_logs" WHERE cardinality("actorRoles") = 0 LIMIT ${BATCH_SIZE}
			)
		`)
		if (moved === 0) break
		total += moved
		console.log(`  … backfilled ${total} audit log row(s)`)
	}
	console.log(
		total > 0
			? `✔ Backfilled actorRoles on ${total} audit log row(s).`
			: '✔ Every audit log row already carries actorRoles — nothing to backfill.'
	)

	const empty = await countRows(
		`select count(*)::int as n from "audit_logs" where cardinality("actorRoles") = 0`
	)
	if (empty > 0) {
		throw new Error(
			`${empty} audit log row(s) still have an empty actorRoles after the backfill. Refusing to ` +
				`continue — the historical actor role would be lost when actorRole is dropped.`
		)
	}
}

// Last, and only last: both halves above have asserted that no authority and no history is lost.
// `IF EXISTS` covers the second and every later run; the `columnExists` guard additionally covers a
// fresh database, where the tables themselves do not exist yet and a bare ALTER would throw —
// prestart.sh is a `set -e` chain, so throwing here means the app never starts. Each column is
// guarded independently, so a run that dies between the two drops simply finishes on the next one.
async function dropScalarColumns() {
	if (await columnExists('users', 'role')) {
		await db.$executeRawUnsafe(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`)
		console.log('✔ Dropped users.role.')
	}
	if (await columnExists('audit_logs', 'actorRole')) {
		await db.$executeRawUnsafe(`ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "actorRole"`)
		console.log('✔ Dropped audit_logs.actorRole.')
	}
}

async function main() {
	await migrateUsers()
	await migrateAuditLogs()
	await dropScalarColumns()
	console.log('  Run `pnpm db:push` next.')
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})

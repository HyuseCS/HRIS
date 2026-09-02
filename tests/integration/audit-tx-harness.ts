import { PrismaClient, type Role } from '@prisma/client'

/**
 * Real-Postgres harness for "the audit row commits or rolls back with its mutation".
 *
 * Why this exists: 97 of the unit test files mock `$lib/server/db` wholesale and stub
 * `$transaction` as `async (fn) => fn(dbMock)`. That is a pass-through with no rollback
 * semantics, so a unit test can never observe "the mutation did NOT persist" — nothing ever
 * persisted. This tier talks to the real database so rollback is a fact, not a mock.
 *
 * The mechanism, and why it has to be this one: `db.$extends()` returns a NEW client, and
 * every service imports the singleton `db` from `$lib/server/db` as a `const`. Extending the
 * singleton in a test does nothing — the service still uses the plain client. So the test
 * file substitutes the module:
 *
 *     vi.mock('$lib/server/db', () => import('./audit-tx-harness').then((m) => m.makeInjectedDb()))
 *
 * That is NOT mocking the database away. The substituted object is a REAL PrismaClient
 * against real Postgres; only `auditLog.create` is intercepted. Replacing it with a fake
 * object would make every absence assertion pass for the wrong reason.
 *
 * Extensions DO apply inside `$transaction` on Prisma 5.22.0 — the interactive-transaction
 * client inherits the parent's extensions — so `tx.auditLog.create` is intercepted too.
 *
 * Adding a scenario is: one `vi.mock` line, `createOrgFixture()`, call the service, assert.
 *
 * Isolation limit: `fileParallelism: false` keeps this suite from racing ITSELF. Nothing
 * stops it running while the dev server or the e2e suite is live against the same database.
 * That is out of scope here; every row this suite touches carries MARKER and is deleted by
 * marker, so a concurrent session's data is never read or written.
 */

/** Every fixture row this suite creates is findable (and deletable) by this string. */
export const MARKER = 'itest-audit-tx'

/** Plain, NON-extended client. Fixtures are created and assertions are read back on this. */
export const verifyDb = new PrismaClient()

let failAudit = false
let injectedCalls = 0

/** Turn the `auditLog.create` failure injection on or off, and reset the call counter. */
export function setAuditFailure(on: boolean) {
	failAudit = on
	injectedCalls = 0
}

/** How many times the injected callback actually fired. Proves the injection was reached. */
export function injectedCallCount() {
	return injectedCalls
}

let injected: { db: unknown } | null = null

/** The module substitution payload: a real client whose `auditLog.create` can be made to throw. */
export function makeInjectedDb() {
	if (!injected) {
		const real = new PrismaClient()
		injected = {
			db: real.$extends({
				query: {
					auditLog: {
						create({ args, query }) {
							if (!failAudit) return query(args)
							injectedCalls++
							throw new Error('audit down')
						}
					}
				}
			})
		}
	}
	return injected
}

export async function disconnectAll() {
	await verifyDb.$disconnect()
	const client = injected?.db as { $disconnect?: () => Promise<void> } | undefined
	await client?.$disconnect?.()
}

/**
 * A throwaway org + actor. Fake, marker-carrying values only — nothing seeded is read or
 * mutated. No Employee is created, so `@@unique([organizationId, employeeNumber])` cannot
 * collide with seed data.
 */
export async function createOrgFixture() {
	const org = await verifyDb.organization.create({
		data: { name: `${MARKER} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
		select: { id: true }
	})
	const actor = await verifyDb.user.create({
		data: {
			organizationId: org.id,
			email: `${MARKER}-${org.id}@example.invalid`,
			passwordHash: 'x',
			roles: ['HR_ADMIN' as Role]
		},
		select: { id: true }
	})
	return {
		organizationId: org.id,
		ctx: { organizationId: org.id, actorId: actor.id, actorRoles: ['HR_ADMIN' as Role] }
	}
}

/**
 * Delete every marker-carrying row, in foreign-key-safe order. `AuditLog` and `User` both
 * reference `Organization` WITHOUT cascade, so they must go first or the org delete throws
 * and the fixtures accumulate silently. `BackupConfig` cascades with the org.
 *
 * `AttendanceDay` and `TimeLog` reference `Employee`, `Employee` references `User` and
 * `Department`, and `Department` references `Organization` — all without cascade — so the
 * attendance fixtures unwind innermost-first, and Employee must go before User.
 *
 * `PayrollRun` also references `Organization` without cascade, and `PayrollEntry` and
 * `ApprovalStep` reference `PayrollRun`. Added for the run-serialisation suite: without this the
 * org delete throws and every fixture from that file accumulates silently.
 *
 * Sweeping by MARKER (not by the ids of this run) also clears rows stranded by a crashed
 * earlier run, so the database is left as it was found.
 */
export async function cleanupFixtures() {
	const orgs = await verifyDb.organization.findMany({
		where: { name: { startsWith: MARKER } },
		select: { id: true }
	})
	if (orgs.length === 0) return
	const organizationId = { in: orgs.map((o) => o.id) }

	const employees = await verifyDb.employee.findMany({
		where: { organizationId },
		select: { id: true }
	})
	if (employees.length > 0) {
		const employeeId = { in: employees.map((e) => e.id) }
		await verifyDb.attendanceDay.deleteMany({ where: { employeeId } })
		await verifyDb.timeLog.deleteMany({ where: { employeeId } })
		await verifyDb.employee.deleteMany({ where: { id: employeeId } })
	}

	const runs = await verifyDb.payrollRun.findMany({
		where: { organizationId },
		select: { id: true }
	})
	if (runs.length > 0) {
		const payrollRunId = { in: runs.map((r) => r.id) }
		await verifyDb.approvalStep.deleteMany({ where: { payrollRunId } })
		await verifyDb.payrollEntry.deleteMany({ where: { payrollRunId } })
		await verifyDb.payrollRun.deleteMany({ where: { id: payrollRunId } })
	}

	await verifyDb.auditLog.deleteMany({ where: { organizationId } })
	await verifyDb.user.deleteMany({ where: { organizationId } })
	await verifyDb.department.deleteMany({ where: { organizationId } })
	await verifyDb.organization.deleteMany({ where: { id: organizationId } })
}

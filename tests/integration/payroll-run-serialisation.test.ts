import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { createOrgFixture, cleanupFixtures, disconnectAll, verifyDb } from './audit-tx-harness'

// Same module substitution as the other two files in this tier: a REAL PrismaClient against real
// Postgres, with the audit failure injection left OFF. Nothing in the write path may be faked
// here — `pg_advisory_xact_lock` has to actually execute, and a mocked `$executeRaw` is precisely
// the blindness this file exists to fix.
vi.mock('$lib/server/db', () => import('./audit-tx-harness').then((m) => m.makeInjectedDb()))

const { createPayrollRun } = await import('$lib/server/services/payroll/index')

/**
 * #3 C13 — the ONLY automated proof that `payrollRunLockKey` still serialises anything.
 *
 * Every payroll unit test mocks `$lib/server/db` and stubs `$executeRaw` to a no-op, so the whole
 * unit tier is blind to the advisory lock by construction: the key string is asserted in
 * `tests/unit/payroll-lock-key.test.ts`, and nothing anywhere asserts the lock has an EFFECT. C7
 * changed that key from per-org-month to per-org. Without this file the only evidence either way
 * is a manual probe nobody re-runs.
 *
 * WHAT IS RACED, and why it has to be these two ranges:
 *
 *  A = 20 May → 5 Jun 2026   (CROSS-MONTH, 12/31 + 5/30 = 0.554, under the cap)
 *  B =  1 Jun → 10 Jun 2026  (same-month, 10/30)
 *
 *  - They OVERLAP (1–5 June) but their BOUNDS DIFFER. That is deliberate:
 *    `@@unique([organizationId, periodStart, periodEnd])` cannot catch this pair, so the 409 can
 *    only come from `assertNoOverlappingRun` reading a row the other transaction inserted. Racing
 *    two IDENTICAL ranges would prove the unique constraint works and say nothing about the lock.
 *  - Neither is a standard shape, so `assertNoOverlappingRun`'s standard-vs-standard bypass does
 *    not apply and the guard actually fires.
 *  - A spans TWO months. Under C7's predecessor the key was `payroll-run:{org}:{Manila month}`, so
 *    A would have locked `…:2026-05` and B `…:2026-06` — two different locks, no serialisation,
 *    both inserts committing. That is the regression this file is the rail for, and it is why the
 *    test belongs to #3 rather than to #163.
 *
 * The fixture org has no `employeeStatutoryConfig` rows, so it is all-EVEN and
 * `assertCustomRangeClearOfCutoff` allows both ranges. It has no employees either, so the
 * `computePayroll` that follows the transaction is a no-op over an empty roster.
 *
 * Concurrency is real: Prisma's default connection pool is larger than one, so two interactive
 * transactions on one client genuinely run at the same time. If the pool were size 1 they would
 * serialise on the pool instead of on the lock, and this test would pass without proving anything
 * — worth re-reading if `connection_limit` is ever pinned in `.env.dev`.
 */

const A = { start: new Date('2026-05-20T00:00:00Z'), end: new Date('2026-06-05T00:00:00Z') }
const B = { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-06-10T00:00:00Z') }

/** The 409 from `assertNoOverlappingRun` — NOT the duplicate-key 409 from the unique constraint. */
const OVERLAP = 'overlaps an existing payroll run'
const DUPLICATE = 'Payroll run for this period already exists'

const messageOf = (e: unknown) =>
	String((e as { body?: { message?: string } })?.body?.message ?? (e as Error)?.message ?? e)
const statusOf = (e: unknown) => (e as { status?: number })?.status

describe('createPayrollRun serialises overlapping cross-month ranges (#3 AC17)', () => {
	let fixture: Awaited<ReturnType<typeof createOrgFixture>>

	beforeEach(async () => {
		fixture = await createOrgFixture()
	})

	afterEach(cleanupFixtures)
	afterAll(disconnectAll)

	it('lets exactly one of two concurrent overlapping ranges commit', async () => {
		const org = fixture.organizationId

		// No await between them: both transactions are in flight before either commits.
		const results = await Promise.allSettled([
			createPayrollRun(org, A.start, A.end, fixture.ctx),
			createPayrollRun(org, B.start, B.end, fixture.ctx)
		])

		const won = results.filter((r) => r.status === 'fulfilled')
		const lost = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]

		// Both committing is the unserialised failure — the one a mocked `$executeRaw` cannot see.
		expect(won).toHaveLength(1)
		expect(lost).toHaveLength(1)

		// The refusal must be the OVERLAP guard reading the winner's row, which is only possible if
		// the loser waited for the winner's transaction to commit and release the lock.
		expect(statusOf(lost[0].reason)).toBe(409)
		expect(messageOf(lost[0].reason)).toContain(OVERLAP)
		expect(messageOf(lost[0].reason)).not.toContain(DUPLICATE)

		// And the loser's whole transaction rolled back: one row for the org, not two.
		const rows = await verifyDb.payrollRun.findMany({
			where: { organizationId: org },
			select: { periodStart: true, periodEnd: true }
		})
		expect(rows).toHaveLength(1)
	})

	/**
	 * A positive control, and it is important to be precise about what it does and does not prove.
	 * It proves the overlap guard fires for this pair at all, and that `OVERLAP` is the copy it
	 * uses — so a green race above cannot be a green race against the wrong string. It proves
	 * NOTHING about the lock: run sequentially, the second call reads a committed row whether or
	 * not any lock exists. The concurrent case above is the only one that tests serialisation.
	 */
	it('refuses the second range sequentially too, with the same overlap copy', async () => {
		const org = fixture.organizationId
		await createPayrollRun(org, A.start, A.end, fixture.ctx)

		await expect(createPayrollRun(org, B.start, B.end, fixture.ctx)).rejects.toMatchObject({
			status: 409
		})
		await createPayrollRun(org, B.start, B.end, fixture.ctx).catch((e) => {
			expect(messageOf(e)).toContain(OVERLAP)
			expect(messageOf(e)).not.toContain(DUPLICATE)
		})

		const rows = await verifyDb.payrollRun.findMany({ where: { organizationId: org } })
		expect(rows).toHaveLength(1)
	})
})

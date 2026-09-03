import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import {
	createOrgFixture,
	createEmployeeFixture,
	cleanupFixtures,
	disconnectAll,
	verifyDb
} from './audit-tx-harness'

// Same module substitution as the other files in this tier: a REAL PrismaClient against real
// Postgres, with the audit failure injection left OFF. Nothing in the write path may be faked
// here — `pg_advisory_xact_lock` has to actually execute, and a mocked `$executeRaw` is precisely
// the blindness this file exists to fix.
vi.mock('$lib/server/db', () => import('./audit-tx-harness').then((m) => m.makeInjectedDb()))

const { createTimesheet } = await import('$lib/server/services/timesheets')

/**
 * #3 — the ONLY automated proof that `timesheetLockKey` still serialises anything.
 *
 * Every timesheet unit test mocks `$lib/server/db` and stubs `$executeRaw` to a no-op, so the whole
 * unit tier is blind to the advisory lock by construction: the key string is asserted in the unit
 * tests, and nothing anywhere asserts the lock has an EFFECT. C7 changed that key from
 * per-employee-per-month to per-employee. Without this file the only evidence either way is a
 * manual probe nobody re-runs.
 *
 * WHAT IS RACED, and why it has to be these two ranges:
 *
 *  A = 13 May → 2 Jun 2026   (CROSS-MONTH, 19/31 + 2/30 = 0.680, under the one-month cap)
 *  B =  1 Jun → 10 Jun 2026  (same-month, 10/30)
 *
 *  - They OVERLAP (1–2 June) but their BOUNDS DIFFER. That is deliberate:
 *    `@@unique([employeeId, periodStart])` cannot catch this pair, so the 409 can only come from
 *    the overlap guard reading a row the other transaction inserted. Racing two IDENTICAL ranges
 *    would prove the unique constraint works and say nothing about the lock.
 *  - Neither is a standard shape (A spans two months; B ends on the 10th, which is neither 15 nor
 *    the end of month), so `createTimesheet`'s `allStandard` bypass does not apply and the guard
 *    actually fires. If both were standard the race would pass for the wrong reason.
 *  - A spans TWO months. Under C7's predecessor the key was `timesheet:{employee}:{Manila month}`,
 *    so A would have locked `…:2026-05` and B `…:2026-06` — two different locks, no serialisation,
 *    both inserts committing. That is the regression this file is the rail for.
 *
 * Concurrency is real: Prisma's default connection pool is larger than one, so two interactive
 * transactions on one client genuinely run at the same time. If the pool were size 1 they would
 * serialise on the pool instead of on the lock, and this test would pass without proving anything
 * — worth re-reading if `connection_limit` is ever pinned in `.env.dev`.
 */

const A = { start: new Date('2026-05-13T00:00:00Z'), end: new Date('2026-06-02T00:00:00Z') }
const B = { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-06-10T00:00:00Z') }

/** One entry per save, so the insert writes a child row rather than a bare header. */
const entriesFor = (d: Date) => [{ date: d, hoursWorked: 8 }]

/** The 409 from the overlap guard — NOT the duplicate-start 409 from the unique constraint. */
const OVERLAP = 'This range overlaps an existing timesheet'
const DUPLICATE = 'Timesheet for this period already exists'

const messageOf = (e: unknown) =>
	String((e as { body?: { message?: string } })?.body?.message ?? (e as Error)?.message ?? e)
const statusOf = (e: unknown) => (e as { status?: number })?.status

describe('createTimesheet serialises overlapping cross-month ranges (#3)', () => {
	let fixture: Awaited<ReturnType<typeof createOrgFixture>>
	let employeeId: string

	beforeEach(async () => {
		fixture = await createOrgFixture()
		employeeId = await createEmployeeFixture(fixture.organizationId, fixture.ctx.actorId)
	})

	afterEach(cleanupFixtures)
	afterAll(disconnectAll)

	it('lets exactly one of two concurrent overlapping ranges commit', async () => {
		// No await between them: both transactions are in flight before either commits.
		const results = await Promise.allSettled([
			createTimesheet(employeeId, A.start, A.end, entriesFor(A.start), fixture.ctx),
			createTimesheet(employeeId, B.start, B.end, entriesFor(B.start), fixture.ctx)
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

		// And the loser's whole transaction rolled back: one row for the employee, not two.
		const rows = await verifyDb.timesheet.findMany({
			where: { employeeId },
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
		await createTimesheet(employeeId, A.start, A.end, entriesFor(A.start), fixture.ctx)

		await expect(
			createTimesheet(employeeId, B.start, B.end, entriesFor(B.start), fixture.ctx)
		).rejects.toMatchObject({ status: 409 })
		await createTimesheet(employeeId, B.start, B.end, entriesFor(B.start), fixture.ctx).catch(
			(e) => {
				expect(messageOf(e)).toContain(OVERLAP)
				expect(messageOf(e)).not.toContain(DUPLICATE)
			}
		)

		const rows = await verifyDb.timesheet.findMany({ where: { employeeId } })
		expect(rows).toHaveLength(1)
	})
})

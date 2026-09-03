import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #298 AC-2.x — who locked and who released a payroll period is now a recorded fact, and
 * `PayrollRun.approvedById` means the approver and nothing else.
 *
 * `PayrollPeriod` was the schema's only timestamp pair with no companion actor (`lockedAt` /
 * `releasedAt` and nothing else), which is why `lock()` borrowed the neighbouring run's
 * `approvedById` — it had nowhere else to write. The cost was a run that had never been approved
 * carrying an approver and an approval date.
 *
 * The load-bearing assertion is that `lockedById` is written INSIDE the atomic `updateMany` claim,
 * in the SAME call as `lockedAt` (mutation M7). That claim is what makes exactly one caller win a
 * concurrent lock (#102); writing the actor in a second statement would let the loser of the race
 * stamp its name onto a lock it did not perform.
 *
 * The db is mocked, so none of this proves the value reached Postgres or that the claim behaves
 * under real concurrency — live L3/L4 psql do that.
 */

const { dbMock, notifyMock, writeAuditLog } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: {
			update: vi.fn(),
			updateMany: vi.fn(),
			findUniqueOrThrow: vi.fn(),
			findFirst: vi.fn()
		},
		payrollPeriod: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			findUniqueOrThrow: vi.fn()
		},
		payrollEntry: { findMany: vi.fn() },
		$transaction: vi.fn()
	},
	notifyMock: { notifyMany: vi.fn().mockResolvedValue(undefined) },
	writeAuditLog: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))
vi.mock('$lib/server/services/notifications', () => notifyMock)
vi.mock('$lib/server/services/payroll/index', () => ({ computePayroll: vi.fn() }))

const { lock, release } = await import('$lib/server/services/payroll/periods')

const ctx = (actorId: string, actorRoles: Role[] = ['PAYROLL_OFFICER']) => ({
	organizationId: 'org1',
	actorId,
	actorRoles
})

const generatedPeriod = {
	id: 'p1',
	organizationId: 'org1',
	name: 'ZZ-unit',
	status: 'GENERATED',
	lockedById: null,
	runs: [{ id: 'run1', status: 'COMPUTED', approvedById: 'userA' }]
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
	dbMock.payrollEntry.findMany.mockResolvedValue([])
	// The compare-and-set claims added for the void and release races. Default to "this caller
	// won"; a test that means to lose the race overrides with `{ count: 0 }`.
	dbMock.payrollPeriod.updateMany.mockResolvedValue({ count: 1 })
	dbMock.payrollPeriod.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'RELEASED' })
	dbMock.payrollRun.updateMany.mockResolvedValue({ count: 1 })
	dbMock.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: 'r1', status: 'VOIDED' })
	dbMock.payrollPeriod.updateMany.mockResolvedValue({ count: 1 })
	dbMock.payrollPeriod.findFirst.mockResolvedValue(generatedPeriod)
	dbMock.payrollPeriod.findUnique.mockResolvedValue({ id: 'p1', status: 'LOCKED' })
	dbMock.payrollPeriod.update.mockResolvedValue({ id: 'p1', status: 'RELEASED' })
})

describe('#298 — the lock actor (AC-2.1)', () => {
	it('period-locker-recorded — lockedById is written in the SAME updateMany call as lockedAt', async () => {
		await lock('p1', 'org1', ctx('userB'))

		// M7: one call, carrying both. A second statement would satisfy a naive "was it written?"
		// assertion and still lose the atomicity that the claim exists for.
		expect(dbMock.payrollPeriod.updateMany).toHaveBeenCalledTimes(1)
		const [claim] = dbMock.payrollPeriod.updateMany.mock.calls[0]
		expect(claim.where).toEqual({ id: 'p1', status: 'GENERATED' })
		expect(claim.data.status).toBe('LOCKED')
		expect(claim.data.lockedById).toBe('userB')
		expect(claim.data.lockedAt).toBeInstanceOf(Date)
		// Nothing else may write the period actor.
		expect(dbMock.payrollPeriod.update).not.toHaveBeenCalled()
	})

	it('period-locker-recorded — the lock audit entry carries the actor as a plain fact', async () => {
		await lock('p1', 'org1', ctx('userB'))

		expect(writeAuditLog.mock.calls.at(-1)?.[1]).toMatchObject({
			action: 'UPDATE',
			entityType: 'PayrollPeriod',
			newValue: { status: 'LOCKED', lockedById: 'userB' }
		})
	})
})

describe('#298 — the release actor (AC-2.2)', () => {
	it('period-releaser-recorded — release writes releasedById, distinct from lockedById', async () => {
		dbMock.payrollPeriod.findFirst.mockResolvedValue({
			...generatedPeriod,
			status: 'LOCKED',
			lockedById: 'userB'
		})

		await release('p1', 'org1', ctx('userC'))

		const [call] = dbMock.payrollPeriod.updateMany.mock.calls[0]
		expect(call.data.status).toBe('RELEASED')
		expect(call.data.releasedById).toBe('userC')
		expect(call.data.releasedAt).toBeInstanceOf(Date)
		// Asserted positively on both sides — "not null" alone would pass if the two collapsed.
		expect(call.data.releasedById).not.toBe('userB')
		// The release is CLAIMED, like the lock: the actor and the timestamp are written in the same
		// statement that proves the period was still LOCKED. Two concurrent releases would otherwise
		// both win and the loser's `releasedAt` would overwrite the winner's — the PAYDATE printed on
		// every payslip in the period since #298.
		expect(call.where).toMatchObject({ id: 'p1', status: 'LOCKED' })
		expect(writeAuditLog.mock.calls.at(-1)?.[1].newValue).toMatchObject({
			status: 'RELEASED',
			releasedById: 'userC'
		})
	})
})

describe('#298 — approvedById means the approver (AC-2.3)', () => {
	it('approver-record-unambiguous — user A approved, user B locks, the run keeps A', async () => {
		await lock('p1', 'org1', ctx('userB'))

		// With no override note there is nothing left to write to the run at all.
		expect(dbMock.payrollRun.update).not.toHaveBeenCalled()
	})

	it('approver-record-unambiguous — an override lock still writes no approver', async () => {
		dbMock.payrollEntry.findMany.mockResolvedValue([{ id: 'e1', isFlagged: true, deductions: [] }])

		await lock('p1', 'org1', ctx('userB'), 'flagged entry accepted by finance')

		const [call] = dbMock.payrollRun.update.mock.calls[0]
		expect(call.data).toEqual({
			hasOverride: true,
			overrideNote: 'flagged entry accepted by finance'
		})
		expect(call.data).not.toHaveProperty('approvedById')
		expect(call.data).not.toHaveProperty('approvedAt')
	})
})

describe('#298 — nobody is newly blocked (AC-2.4)', () => {
	it('lock-release-capability-unchanged — lock and release still admit their existing callers', async () => {
		// No capability guard is added to either service by #298; the route-level checks are
		// unchanged. An actor who could lock and release before must still be able to.
		await expect(lock('p1', 'org1', ctx('userB', ['MANAGER']))).resolves.toBeTruthy()

		dbMock.payrollPeriod.findFirst.mockResolvedValue({ ...generatedPeriod, status: 'LOCKED' })
		await expect(release('p1', 'org1', ctx('userC', ['HR_ADMIN']))).resolves.toBeTruthy()
	})
})

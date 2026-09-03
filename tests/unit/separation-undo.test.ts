import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #304 — `undoSeparation`, the break-glass reversal of a finalized separation.
 *
 * The whole suite runs against a DISTINCT `txMock` (B-3), never a `$transaction` passthrough
 * returning `dbMock`. Without that, U4/U7/U9/U13 would all be assertions against the same
 * object and could not tell an in-transaction write from an out-of-transaction one — U13
 * provably so, the others latently.
 *
 * Assertions on KEY PRESENCE (U8/U11/U14) are deliberate: a flat mock can fake any value, but
 * it cannot fake the absence of a key the production code wrote.
 */

const { dbMock, txMock } = vi.hoisted(() => ({
	dbMock: {
		separationRecord: { findFirst: vi.fn() },
		$transaction: vi.fn()
	},
	txMock: {
		separationRecord: { updateMany: vi.fn() },
		clearanceItem: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
		employee: { update: vi.fn() },
		loan: { updateMany: vi.fn() },
		cashAdvance: { updateMany: vi.fn() },
		user: { updateMany: vi.fn() }
	}
}))
const { auditMock } = vi.hoisted(() => ({ auditMock: { writeAuditLog: vi.fn() } }))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => auditMock)
vi.mock('$lib/server/notifications', () => ({
	sendOffboardingNoticeEmail: vi.fn(),
	sendRequestStatusEmail: vi.fn()
}))

const { undoSeparation } = await import('$lib/server/services/separation')

const ctxFor = (actorId: string, roles: AuditContext['actorRoles'] = ['SUPER_ADMIN']) => ({
	organizationId: 'org1',
	actorId,
	actorRoles: roles,
	ipAddress: 'test'
})

const SNAPSHOT = {
	loans: [
		{ id: 'l1', balance: '3000', status: 'ACTIVE' },
		{ id: 'l2', balance: '7000', status: 'ACTIVE' }
	],
	cashAdvances: [{ id: 'ca1', balance: '1500', status: 'ACTIVE' }],
	employee: { employmentStatus: 'ON_LEAVE', endDate: null },
	userIds: ['u1'],
	userWasActive: true
}

const BREAKDOWN = {
	total: -10000,
	lines: [
		{ label: 'Unused leave conversion (0.00 days)', amount: 0 },
		{ label: 'Outstanding loan balances', amount: -3000 },
		{ label: 'Outstanding cash advances', amount: -7000 }
	]
}

const recordRow = (overrides: Record<string, unknown> = {}) => ({
	id: 'sep1',
	employeeId: 'emp1',
	status: 'FINALIZED',
	finalizedAt: new Date('2026-08-10'),
	finalizedById: 'user-fin',
	finalPayBreakdown: BREAKDOWN,
	preFinalizeState: SNAPSHOT,
	...overrides
})

/** The `data` object of the compare-and-set claim. */
const claimData = () => txMock.separationRecord.updateMany.mock.calls[0][0].data
const auditPayload = () => auditMock.writeAuditLog.mock.calls[0][1]

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
	dbMock.separationRecord.findFirst.mockResolvedValue(recordRow())
	txMock.separationRecord.updateMany.mockResolvedValue({ count: 1 })
	txMock.loan.updateMany.mockResolvedValue({ count: 1 })
	txMock.cashAdvance.updateMany.mockResolvedValue({ count: 1 })
	txMock.clearanceItem.findMany.mockResolvedValue([
		{ id: 'c1', clearedById: 'user-a' },
		{ id: 'c2', clearedById: null }
	])
})

describe('undoSeparation — refusals', () => {
	// U1
	it('refuses an actor without OVERRIDE_FINALIZED, before touching the database', async () => {
		await expect(
			undoSeparation('sep1', 'org1', false, ctxFor('user-hr', ['HR_ADMIN']))
		).rejects.toMatchObject({ status: 403 })

		// The guard is the FIRST line of the service, not a route decoration: nothing was read.
		expect(dbMock.separationRecord.findFirst).not.toHaveBeenCalled()
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	// U2
	it('404s an unknown id', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue(null)
		await expect(undoSeparation('nope', 'org1', false, ctxFor('su'))).rejects.toMatchObject({
			status: 404
		})
	})

	// U3
	it('400s a record that is not finalized', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue(recordRow({ status: 'CLEARED' }))
		await expect(undoSeparation('sep1', 'org1', false, ctxFor('su'))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Separation is not finalized' }
		})
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	// U4
	it('400s an undo that lost the race, and writes no money', async () => {
		txMock.separationRecord.updateMany.mockResolvedValue({ count: 0 })

		await expect(undoSeparation('sep1', 'org1', false, ctxFor('su'))).rejects.toMatchObject({
			status: 400
		})
		expect(txMock.loan.updateMany).not.toHaveBeenCalled()
		expect(txMock.employee.update).not.toHaveBeenCalled()
		expect(txMock.user.updateMany).not.toHaveBeenCalled()
		expect(auditMock.writeAuditLog).not.toHaveBeenCalled()
	})

	// U6
	it('409s when a balance moved since finalize, conditioning on the post-finalize state', async () => {
		txMock.loan.updateMany.mockResolvedValue({ count: 0 })

		await expect(undoSeparation('sep1', 'org1', false, ctxFor('su'))).rejects.toMatchObject({
			status: 409
		})

		// B-3: asserting only the count is vacuous — a flat mock throws the 409 whether the
		// `where` is the strict post-finalize state or a bare `{ id }`. The `where` is what M4.3
		// mutates, so the `where` is what has to be asserted.
		expect(txMock.loan.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: expect.objectContaining({ balance: 0, status: 'PAID' }) })
		)
	})
})

describe('undoSeparation — the restore', () => {
	// U5
	it('restores both loan balances from the snapshot', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		const calls = txMock.loan.updateMany.mock.calls
		expect(calls).toHaveLength(2)
		expect(calls[0][0].where.id).toBe('l1')
		expect(String(calls[0][0].data.balance)).toBe('3000')
		expect(calls[0][0].data.status).toBe('ACTIVE')
		expect(calls[1][0].where.id).toBe('l2')
		expect(String(calls[1][0].data.balance)).toBe('7000')
	})

	// U5b — the cash-advance loop is a SECOND copy of the loan loop, so it needs its own proof.
	it('restores the cash-advance balance from the snapshot', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		const calls = txMock.cashAdvance.updateMany.mock.calls
		expect(calls).toHaveLength(1)
		expect(calls[0][0].where.id).toBe('ca1')
		expect(String(calls[0][0].data.balance)).toBe('1500')
		expect(calls[0][0].data.status).toBe('ACTIVE')
	})

	// U6b — same B-3 reasoning as U6: assert the `where`, not just the 409.
	it('409s when a cash-advance balance moved since finalize', async () => {
		txMock.cashAdvance.updateMany.mockResolvedValue({ count: 0 })

		await expect(undoSeparation('sep1', 'org1', false, ctxFor('su'))).rejects.toMatchObject({
			status: 409
		})

		expect(txMock.cashAdvance.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: expect.objectContaining({ balance: 0, status: 'PAID' }) })
		)
	})

	// U7
	it('re-enables the login', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		expect(txMock.user.updateMany).toHaveBeenCalledWith({
			where: { employee: { id: 'emp1' } },
			data: { isActive: true }
		})
	})

	it('leaves the login disabled — and AUDITS it false — when it was already off before finalize', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue(
			recordRow({ preFinalizeState: { ...SNAPSHOT, userWasActive: false } })
		)

		await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		expect(txMock.user.updateMany).not.toHaveBeenCalled()
		// The audit line and the write must never disagree: a hardcoded `true` here would record a
		// login re-enable that never happened.
		expect(auditPayload().newValue.userIsActive).toBe(false)
	})

	it('restores the employment status the snapshot recorded, not a hardcoded ACTIVE', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		expect(txMock.employee.update.mock.calls[0][0].data).toMatchObject({
			employmentStatus: 'ON_LEAVE',
			endDate: null
		})
	})

	// U12
	it('marks a pre-#304 record partial, writes no money, and assumes ACTIVE', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue(recordRow({ preFinalizeState: null }))

		const res = await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		expect(res.partial).toBe(true)
		// The aggregate the D-4 banner names: |−3000| + |−7000|.
		expect(res.writeOff).toBe(10000)
		expect(txMock.loan.updateMany).not.toHaveBeenCalled()
		expect(txMock.cashAdvance.updateMany).not.toHaveBeenCalled()
		expect(txMock.employee.update.mock.calls[0][0].data).toMatchObject({
			employmentStatus: 'ACTIVE',
			endDate: null
		})
		expect(auditPayload().newValue.restoredStatusAssumed).toBe(true)
	})

	it('reports writeOff as null, not 0, when the breakdown is missing or malformed', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue(
			recordRow({ preFinalizeState: null, finalPayBreakdown: null })
		)

		// The banner must be able to say "amount unknown" rather than assert a peso figure it
		// does not have. Old rows are trusted, not verified (plan §CANNOT-Prove #4).
		expect((await undoSeparation('sep1', 'org1', false, ctxFor('su'))).writeOff).toBeNull()
	})

	// U14
	it('leaves preFinalizeState populated after a full undo', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		// KEY ABSENCE, so a `Prisma.DbNull` regression cannot slip through as "not null". B-1:
		// nulling the column made every restored record render the amber "could not be restored"
		// banner on reload, which is a money lie.
		expect('preFinalizeState' in claimData()).toBe(false)
		// The write-off evidence the D-4 banner reads must survive too.
		expect('finalPayBreakdown' in claimData()).toBe(false)
	})

	// U14b — two `it`s, not one with a mid-test reset: a hand-rolled reset silently drops whatever
	// the beforeEach grows later (it already dropped `cashAdvance.updateMany`).
	it('claims OPEN when clearance is re-opened', async () => {
		await undoSeparation('sep1', 'org1', true, ctxFor('su'))
		expect(claimData().status).toBe('OPEN')
		expect(auditPayload().newValue.status).toBe('OPEN')
	})

	it('claims CLEARED when the clearance items are kept', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('su'))
		expect(claimData().status).toBe('CLEARED')
		expect(auditPayload().newValue.status).toBe('CLEARED')
	})
})

describe('undoSeparation — clearance', () => {
	// U8
	it('keeps the clearer when it re-opens the items', async () => {
		await undoSeparation('sep1', 'org1', true, ctxFor('su'))

		const data = txMock.clearanceItem.updateMany.mock.calls[0][0].data
		expect(data.status).toBe('PENDING')
		// Key absence, not "is not null": the whole D-5 guard is the OMISSION of this key, and a
		// flat mock cannot fake an absent key.
		expect('clearedById' in data).toBe(false)
	})

	// U9
	it('leaves the items alone when clearance is not re-opened', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		expect(txMock.clearanceItem.updateMany).not.toHaveBeenCalled()
		expect(txMock.clearanceItem.update).not.toHaveBeenCalled()
	})

	// U15
	it('stamps previouslyClearedById on every re-opened item, before the re-open', async () => {
		await undoSeparation('sep1', 'org1', true, ctxFor('su'))

		// Only the item that HAD a clearer — c2 had none, so there is nothing to preserve.
		expect(txMock.clearanceItem.update).toHaveBeenCalledTimes(1)
		expect(txMock.clearanceItem.update).toHaveBeenCalledWith({
			where: { id: 'c1' },
			data: { previouslyClearedById: 'user-a' }
		})

		// Read-before-write: the stamp must land before the bulk re-open (M4.9).
		expect(Math.max(...txMock.clearanceItem.update.mock.invocationCallOrder)).toBeLessThan(
			txMock.clearanceItem.updateMany.mock.invocationCallOrder[0]
		)
	})
})

describe('undoSeparation — the audit entry', () => {
	// U13
	it('writes the audit inside the transaction, with a populated oldValue', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		const [, payload, client] = auditMock.writeAuditLog.mock.calls[0]
		// IDENTITY against the distinct tx mock, not truthiness (B-3).
		expect(client).toBe(txMock)
		expect(payload.action).toBe('SEPARATION_UNDO')
		expect(payload.oldValue).toMatchObject({
			status: 'FINALIZED',
			finalizedById: 'user-fin',
			clearedByIds: ['user-a'],
			loans: SNAPSHOT.loans,
			employmentStatus: 'ON_LEAVE'
		})
	})

	// U16
	it('carries the login state before and after, which no User-entity row records', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('su'))

		// B-5: the undo writes no `User` audit row on purpose (calling setUserActive would nest a
		// second transaction), so this payload is the ONLY trail of the reactivation.
		expect(auditPayload().oldValue.userIsActive).toBe(false)
		expect(auditPayload().newValue.userIsActive).toBe(true)
	})

	// U10
	it('stamps the marker when the finalizer undoes their own finalize', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('user-fin'))
		expect(auditPayload().newValue.sameActorAsFinalizer).toBe(true)
	})

	// U11
	it('omits the marker entirely on an ordinary undo', async () => {
		await undoSeparation('sep1', 'org1', false, ctxFor('someone-else'))

		// ABSENT, never present-and-false — a search for the key must return only real self-undos.
		expect('sameActorAsFinalizer' in auditPayload().newValue).toBe(false)
	})

	it('never matches null against null when a record has no finalizer', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue(recordRow({ finalizedById: null }))

		await undoSeparation('sep1', 'org1', false, ctxFor('su'))
		expect('sameActorAsFinalizer' in auditPayload().newValue).toBe(false)
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #297 — separation-of-duties at finalize.
 *  D4: nobody finalizes their own separation.
 *  D3: whoever cleared any clearance item on the case may not finalize it.
 * Both refusals come from ONE helper, finalizeBarFor, which also feeds the greyed-out
 * Finalize button, so the guard and the button cannot drift apart.
 *
 * The four clearedAnyItem cases use ZERO db mocks on purpose — this repo's recorded
 * failure mode is the vacuous mock, so the rule itself is pinned by a pure test.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		separationRecord: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
		clearanceItem: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
		employee: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
		employeeCompensation: { findMany: vi.fn() },
		leaveBalance: { findMany: vi.fn() },
		loan: { findMany: vi.fn(), updateMany: vi.fn() },
		cashAdvance: { findMany: vi.fn(), updateMany: vi.fn() },
		user: { findMany: vi.fn(), updateMany: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/notifications', () => ({
	sendOffboardingNoticeEmail: vi.fn(),
	sendRequestStatusEmail: vi.fn()
}))

const { finalizeSeparation, finalizeBarFor, clearedAnyItem } =
	await import('$lib/server/services/separation')

const SELF_MESSAGE = 'You cannot finalize your own separation — ask another admin to do it.'
const CLEARER_MESSAGE =
	'You cannot finalize a separation whose clearance items you cleared — ask another HR administrator, or your CEO, to finalize it.'

const ctxFor = (actorId: string): AuditContext => ({
	organizationId: 'org1',
	actorId,
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
})

function separationRow(
	clearanceItems: { id: string; status: string; clearedById: string | null }[],
	status = 'CLEARED'
) {
	return {
		id: 'sep1',
		organizationId: 'org1',
		employeeId: 'emp1',
		status,
		type: 'RESIGNATION',
		effectiveDate: new Date('2026-08-01'),
		finalPayAmount: null,
		finalPayBreakdown: null,
		employee: { id: 'emp1', firstName: 'Ann', lastName: 'Cruz' },
		clearanceItems
	}
}

const CLEARED_BY_A = [{ id: 'ci1', status: 'CLEARED', clearedById: 'user-a' }]

beforeEach(() => {
	vi.clearAllMocks()
	// #304: finalize's in-transaction snapshot reads the employee's logins.
	dbMock.user.findMany.mockResolvedValue([])
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock))
	// #297: the in-transaction clearance re-read. Default to "no clearers" so only the tests that
	// mean to exercise the bar do so.
	dbMock.clearanceItem.findMany.mockResolvedValue([])
	dbMock.separationRecord.findFirst.mockResolvedValue(separationRow(CLEARED_BY_A))
	dbMock.separationRecord.updateMany.mockResolvedValue({ count: 1 })
	// The separated employee's login — NOT any of the admins unless a test says so.
	dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-subject' })
	dbMock.employee.findUniqueOrThrow.mockResolvedValue({
		basicMonthlySalary: 22000,
		rateType: 'MONTHLY'
	})
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.leaveBalance.findMany.mockResolvedValue([{ remaining: 2 }])
	dbMock.loan.findMany.mockResolvedValue([{ balance: 1000 }])
	dbMock.cashAdvance.findMany.mockResolvedValue([])
})

describe('clearedAnyItem (pure — no db)', () => {
	it('clearedAnyItem: actor cleared an item -> barred', () => {
		expect(clearedAnyItem(CLEARED_BY_A, 'user-a')).toBe(true)
	})

	it('clearedAnyItem: only others cleared -> allowed', () => {
		expect(clearedAnyItem(CLEARED_BY_A, 'user-b')).toBe(false)
	})

	it('clearedAnyItem: nobody cleared -> allowed', () => {
		expect(clearedAnyItem([{ status: 'PENDING', clearedById: null }], 'user-a')).toBe(false)
	})

	it('clearedAnyItem: item un-cleared -> allowed', () => {
		// Un-ticking NULLs clearedById, so a re-opened item stops barring whoever ticked it.
		expect(clearedAnyItem([{ status: 'PENDING', clearedById: null }], 'user-a')).toBe(false)
		// #304 FLIPPED THIS. The old second half of this case read:
		//   expect(clearedAnyItem([{ status: 'PENDING', clearedById: 'user-a' }], 'user-a')).toBe(false)
		// i.e. "a stale clearedById on a non-CLEARED row must not bar". Under D-5 that is exactly
		// the laundering route: the undo's re-open sets every item PENDING while KEEPING
		// clearedById, so a status-keyed bar would let one privileged call wipe every #297 bar on
		// the case. The inverted expectation now lives in its own case below.
	})

	// ── #304/D-5 + B-2: the four cases the widened helper exists for ────────────────────────
	it('a re-opened item still bars its original clearer', () => {
		// The undo's re-open branch: status PENDING, clearedById KEPT. This is the expectation
		// #304 inverted — see the note in the case above.
		expect(clearedAnyItem([{ status: 'PENDING', clearedById: 'user-a' }], 'user-a')).toBe(true)
	})

	it('an ordinarily un-cleared item (clearedById null) still does NOT bar', () => {
		// The negative control that stops the widening becoming "everyone is barred forever".
		// An ordinary un-clear never sets previouslyClearedById, so the field is ABSENT here.
		expect(clearedAnyItem([{ status: 'PENDING', clearedById: null }], 'user-a')).toBe(false)
	})

	it('a re-opened item still bars its clearer after a third actor un-clears it', () => {
		// B-2, the whole reason previouslyClearedById exists: any MANAGE_HR holder can POST
		// ?/toggleClearance with cleared=false and NULL clearedById on a re-opened item. The bar
		// survives in the field setClearanceItem never touches.
		expect(
			clearedAnyItem(
				[{ status: 'PENDING', clearedById: null, previouslyClearedById: 'user-a' }],
				'user-a'
			)
		).toBe(true)
	})

	it('the bar on a re-opened item is permanent — a third actor re-clearing does not lift it', () => {
		// N-2, pinned as INTENDED, not as a bug to fix. Once the undo stamps an item, its
		// original clearer is barred on that case for the life of the case, even though the
		// clearance that now stands is somebody else's. See the plan's Overview table ("Who may
		// finalize after an undo-with-re-open") and the Risks row for the one-admin deadlock this
		// costs. Do NOT "fix" this to un-bar user-a.
		const items = [{ status: 'CLEARED', clearedById: 'user-c', previouslyClearedById: 'user-a' }]
		expect(clearedAnyItem(items, 'user-a')).toBe(true)
		expect(clearedAnyItem(items, 'user-c')).toBe(true)
	})
})

describe('finalizeSeparation — separation of duties', () => {
	it('finalize-refuses-clearer', async () => {
		await expect(finalizeSeparation('sep1', 'org1', ctxFor('user-a'))).rejects.toMatchObject({
			status: 403,
			body: { message: CLEARER_MESSAGE }
		})
		// Nothing mutated.
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(dbMock.separationRecord.updateMany).not.toHaveBeenCalled()
	})

	// The pre-flight bar reads the record BEFORE the transaction opens. This is the window: the
	// actor is clean when `finalizeBarFor` runs, and has become a clearer by the time the write
	// lands. Only the in-transaction re-read closes it, so this is the one case that proves it —
	// `findFirst` (pre-flight) says clean, `findMany` (inside the transaction) says otherwise.
	it('finalize-rechecks-clearers-inside-the-transaction', async () => {
		dbMock.separationRecord.findFirst.mockResolvedValue(separationRow([]))
		dbMock.clearanceItem.findMany.mockResolvedValue([{ status: 'CLEARED', clearedById: 'user-b' }])

		await expect(finalizeSeparation('sep1', 'org1', ctxFor('user-b'))).rejects.toMatchObject({
			status: 403,
			body: { message: CLEARER_MESSAGE }
		})
		// The refusal must beat the write, not follow it.
		expect(dbMock.separationRecord.updateMany).not.toHaveBeenCalled()
	})

	it('finalize-allows-clean-actor', async () => {
		// Negative control: an uninvolved admin still finalizes AND every write still happens.
		await expect(finalizeSeparation('sep1', 'org1', ctxFor('user-b'))).resolves.toMatchObject({
			total: 1000
		})

		const args = dbMock.separationRecord.updateMany.mock.calls[0][0]
		expect(args.data.status).toBe('FINALIZED')
		expect(Number(args.data.finalPayAmount)).toBe(1000)
		expect(dbMock.employee.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ employmentStatus: 'OFFBOARDED' })
			})
		)
		expect(dbMock.user.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({ data: { isActive: false } })
		)
	})

	it('finalize-refuses-self', async () => {
		// The actor IS the separated employee's user.
		dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-b' })

		await expect(finalizeSeparation('sep1', 'org1', ctxFor('user-b'))).rejects.toMatchObject({
			status: 403,
			body: { message: SELF_MESSAGE }
		})
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('finalize-allows-other-for-self-case', async () => {
		// Same case, a different admin who cleared nothing: finalizes normally.
		dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-b' })

		await expect(finalizeSeparation('sep1', 'org1', ctxFor('user-c'))).resolves.toBeDefined()
		expect(dbMock.separationRecord.updateMany).toHaveBeenCalledTimes(1)
	})

	it('finalize-guards-independent', async () => {
		// The actor is BOTH the subject and a clearer — the SELF bar wins, pinning the order.
		dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-a' })

		await expect(finalizeSeparation('sep1', 'org1', ctxFor('user-a'))).rejects.toMatchObject({
			body: { message: SELF_MESSAGE }
		})
	})

	it('finalize-bar-above-pending', async () => {
		// A barred actor on a case that ALSO has pending items gets the 403 bar, not the pending 409.
		// Telling them to go clear more items would deepen their own bar.
		dbMock.separationRecord.findFirst.mockResolvedValue(
			separationRow(
				[
					{ id: 'ci1', status: 'CLEARED', clearedById: 'user-a' },
					{ id: 'ci2', status: 'PENDING', clearedById: null }
				],
				'OPEN'
			)
		)

		await expect(finalizeSeparation('sep1', 'org1', ctxFor('user-a'))).rejects.toMatchObject({
			status: 403,
			body: { message: CLEARER_MESSAGE }
		})
	})

	it('self-guard-consistent-with-offboard', async () => {
		// AC-4.3 asserts WORDING and PLACEMENT only — never the status code. 403 here versus
		// offboardEmployee's 400 is the deliberate, recorded choice (VALIDATE G4).

		// WORDING: the same "ask another admin to do it" tail as employees.ts:1217, read from the
		// source so this goes red if either message drifts.
		const offboardSource = readFileSync('src/lib/server/services/employees.ts', 'utf8')
		expect(offboardSource).toContain('ask another admin to do it.')
		expect(SELF_MESSAGE).toContain('ask another admin to do it.')

		// PLACEMENT: in the service, decided before anything is written — the same shape as
		// offboardEmployee, so both the form action and any future v1 twin are covered.
		const bar = await finalizeBarFor(
			{ employee: { id: 'emp1' }, clearanceItems: [] },
			'user-subject'
		)
		expect(bar).toBe(SELF_MESSAGE)
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(dbMock.separationRecord.updateMany).not.toHaveBeenCalled()
	})

	it('existing-cases-unaffected', async () => {
		// A pre-guard CLEARED row with a null clearedById bars nobody — the safe direction.
		dbMock.separationRecord.findFirst.mockResolvedValue(
			separationRow([{ id: 'ci1', status: 'CLEARED', clearedById: null }])
		)

		await expect(finalizeSeparation('sep1', 'org1', ctxFor('user-a'))).resolves.toBeDefined()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #224 Part 2 / #243 — propose → confirm.
 *
 * The rules worth pinning are the ones that decide WHO may confirm, because every one of them has
 * a plausible-looking wrong version:
 *
 *   - a rank floor instead of a capability would admit MANAGER (rank 2 = HR_ADMIN), i.e. exactly
 *     the people #243 exists to stop acting alone;
 *   - one flat capability for both shapes would either let an HR_ADMIN sign off the CEO's own
 *     raise, or push every routine manager pay change to the CEO;
 *   - a capability check alone, without initiator ≠ confirmer, would let a CEO confirm their own
 *     filing, since CEO holds APPROVE_FINANCE.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		actionProposal: {
			create: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			findUniqueOrThrow: vi.fn(),
			updateMany: vi.fn()
		},
		user: { findMany: vi.fn() },
		employee: { findUnique: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/notifications', () => ({
	notifyMany: vi.fn().mockResolvedValue(undefined)
}))

const { writeAuditLog } = await import('$lib/server/audit')
const {
	createProposal,
	confirmProposal,
	rejectProposal,
	confirmerCapabilityFor,
	listActionableProposals
} = await import('$lib/server/services/action-proposals')
// Mocked above but never pulled into scope until #265, which is the first thing here to assert on
// what a notification actually says rather than merely that one was sent.
const { notifyMany } = await import('$lib/server/services/notifications')

const CEO_USER = 'user-ceo'
const TARGET_EMP = 'emp-ceo'

const ctxOf = (over: Partial<AuditContext> = {}): AuditContext => ({
	organizationId: 'org1',
	actorId: 'user-someone',
	actorRoles: ['SUPER_ADMIN'],
	...over
})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
	dbMock.user.findMany.mockResolvedValue([{ id: 'user-sa' }])
	dbMock.actionProposal.create.mockResolvedValue({ id: 'p1' })
	dbMock.actionProposal.updateMany.mockResolvedValue({ count: 1 })
	dbMock.actionProposal.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'APPLIED' })
})

/** A PENDING self-action: the CEO filed it against their own employee record. */
const selfProposal = {
	id: 'p1',
	organizationId: 'org1',
	initiatorId: CEO_USER,
	targetEmployeeId: TARGET_EMP,
	domain: 'COMPENSATION',
	payload: { basicMonthlySalary: 200000 },
	status: 'PENDING'
}

/** A PENDING proposal a manager filed for one of their reports (#243). */
const onBehalfProposal = { ...selfProposal, initiatorId: 'user-manager' }

const pendSelf = () => {
	dbMock.actionProposal.findFirst.mockResolvedValue(selfProposal)
	dbMock.employee.findUnique.mockResolvedValue({ userId: CEO_USER }) // target IS the initiator
}
const pendOnBehalf = () => {
	dbMock.actionProposal.findFirst.mockResolvedValue(onBehalfProposal)
	dbMock.employee.findUnique.mockResolvedValue({ userId: CEO_USER }) // target ≠ initiator
}

describe('which capability confirms which shape', () => {
	it('self-actions need finance sign-off, on-behalf proposals need org-wide HR', () => {
		expect(confirmerCapabilityFor(true)).toBe('APPROVE_FINANCE')
		expect(confirmerCapabilityFor(false)).toBe('ADMINISTER_HR_ORGWIDE')
	})
})

describe('confirming — who is refused', () => {
	// The whole reason this is capability-keyed and not `requireMinRole('HR_ADMIN')`: MANAGER ranks
	// level with HR_ADMIN, so a rank floor would let a manager confirm a manager's proposal.
	it('refuses a MANAGER on an on-behalf proposal', async () => {
		pendOnBehalf()
		await expect(
			confirmProposal('org1', 'p1', vi.fn(), ctxOf({ actorRoles: ['MANAGER'] }))
		).rejects.toMatchObject({ status: 403 })
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
	})

	it('refuses an HR_ADMIN on a self-action — that needs APPROVE_FINANCE', async () => {
		pendSelf()
		await expect(
			confirmProposal('org1', 'p1', vi.fn(), ctxOf({ actorRoles: ['HR_ADMIN'] }))
		).rejects.toMatchObject({ status: 403 })
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
	})

	it('allows an HR_ADMIN on an on-behalf proposal', async () => {
		pendOnBehalf()
		const apply = vi.fn().mockResolvedValue(undefined)
		await expect(
			confirmProposal('org1', 'p1', apply, ctxOf({ actorRoles: ['HR_ADMIN'] }))
		).resolves.toBeDefined()
		expect(apply).toHaveBeenCalled()
	})

	// Asserting the message, not just the 403: a CEO holds APPROVE_FINANCE, so the capability check
	// passes and only the initiator≠confirmer rule can stop them. A status-only assertion would
	// still pass with that rule deleted, because the wrong layer would answer.
	it('refuses the initiator even when they hold the right capability', async () => {
		pendSelf()
		await expect(
			confirmProposal('org1', 'p1', vi.fn(), ctxOf({ actorId: CEO_USER, actorRoles: ['CEO'] }))
		).rejects.toMatchObject({
			status: 403,
			body: { message: 'You cannot confirm a change you proposed yourself.' }
		})
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
	})

	/**
	 * The hole this closes: `isSelfAction` relates the target to the INITIATOR only. A proposal
	 * someone else filed FOR a target who happens to hold a confirming capability therefore looked
	 * like an ordinary on-behalf-of row — loose confirmer requirement, confirmer ≠ initiator
	 * satisfied — and the target could sign off their own raise. It also laundered a change they
	 * could not write directly: get a manager to file it, then confirm it yourself. #224's premise
	 * defeated through #243's door.
	 *
	 * Asserting the message, not just the 403: the capability check can also produce a 403 here, so
	 * a status-only assertion would pass with this rule deleted and prove nothing.
	 */
	it('refuses the TARGET of a proposal someone else filed, even holding the capability', async () => {
		dbMock.actionProposal.findFirst.mockResolvedValue(onBehalfProposal)
		// The target is an HR_ADMIN — holds ADMINISTER_HR_ORGWIDE, and is not the initiator.
		dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-target-hr' })
		await expect(
			confirmProposal(
				'org1',
				'p1',
				vi.fn(),
				ctxOf({ actorId: 'user-target-hr', actorRoles: ['HR_ADMIN'] })
			)
		).rejects.toMatchObject({
			status: 403,
			body: { message: 'You cannot confirm a change to your own pay.' }
		})
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
	})

	it('refuses the target on reject too — they get no say either way', async () => {
		dbMock.actionProposal.findFirst.mockResolvedValue(onBehalfProposal)
		dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-target-hr' })
		await expect(
			rejectProposal(
				'org1',
				'p1',
				'no thanks',
				ctxOf({ actorId: 'user-target-hr', actorRoles: ['HR_ADMIN'] })
			)
		).rejects.toMatchObject({ status: 403 })
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
	})

	// Reject now applies the identical rule set to confirm — an initiator cannot quietly bury their
	// own filing either. There is no withdraw feature today; add one deliberately if it is wanted.
	//
	// The message matters here, not just the status: on a self-action the initiator IS the target,
	// so the confirmer≠target rule would also refuse this with a 403. Pinning the message is what
	// makes this test prove the initiator rule specifically rather than being answered by its
	// neighbour.
	it('refuses the initiator on reject as well', async () => {
		pendSelf()
		await expect(
			rejectProposal(
				'org1',
				'p1',
				'changed my mind',
				ctxOf({ actorId: CEO_USER, actorRoles: ['CEO'] })
			)
		).rejects.toMatchObject({
			status: 403,
			body: { message: 'You cannot confirm a change you proposed yourself.' }
		})
	})

	it('lets a different APPROVE_FINANCE holder confirm the self-action', async () => {
		pendSelf()
		const apply = vi.fn().mockResolvedValue(undefined)
		await expect(
			confirmProposal(
				'org1',
				'p1',
				apply,
				ctxOf({ actorId: 'user-sa', actorRoles: ['SUPER_ADMIN'] })
			)
		).resolves.toBeDefined()
		expect(apply).toHaveBeenCalled()
	})
})

describe('confirming — applying it', () => {
	it('claims the row atomically before applying, and only from PENDING', async () => {
		pendOnBehalf()
		await confirmProposal('org1', 'p1', vi.fn().mockResolvedValue(undefined), ctxOf())
		expect(dbMock.actionProposal.updateMany).toHaveBeenCalledWith({
			where: { id: 'p1', organizationId: 'org1', status: 'PENDING' },
			data: expect.objectContaining({ status: 'APPLIED', decidedById: 'user-someone' })
		})
	})

	// The loser of a race claims nothing; it must not go on to apply the change a second time.
	it('does not apply when the claim is lost', async () => {
		pendOnBehalf()
		dbMock.actionProposal.updateMany.mockResolvedValue({ count: 0 })
		const apply = vi.fn()
		await expect(confirmProposal('org1', 'p1', apply, ctxOf())).rejects.toMatchObject({
			status: 404
		})
		expect(apply).not.toHaveBeenCalled()
	})

	// Re-validation at apply time is the real trust boundary, so a stale payload throwing must undo
	// the claim rather than burn the proposal — it runs inside the same transaction for that reason.
	it('propagates an apply failure so the claim rolls back', async () => {
		pendOnBehalf()
		const apply = vi.fn().mockRejectedValue(new Error('salary moved since this was proposed'))
		await expect(confirmProposal('org1', 'p1', apply, ctxOf())).rejects.toThrow('salary moved')
	})
})

describe('filing a proposal', () => {
	it('refuses when nobody else could ever confirm it', async () => {
		dbMock.user.findMany.mockResolvedValue([]) // initiator is the only qualified user
		await expect(
			createProposal(
				'org1',
				{
					targetEmployeeId: TARGET_EMP,
					targetUserId: CEO_USER,
					domain: 'COMPENSATION',
					payload: {}
				},
				ctxOf({ actorId: CEO_USER, actorRoles: ['CEO'] })
			)
		).rejects.toMatchObject({ status: 409 })
		// An unconfirmable row would read as success to the initiator and strand the change.
		expect(dbMock.actionProposal.create).not.toHaveBeenCalled()
	})

	it('never offers the initiator as their own confirmer', async () => {
		await createProposal(
			'org1',
			{ targetEmployeeId: TARGET_EMP, targetUserId: CEO_USER, domain: 'COMPENSATION', payload: {} },
			ctxOf({ actorId: CEO_USER, actorRoles: ['CEO'] })
		)
		expect(dbMock.user.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ id: { not: CEO_USER }, isActive: true })
			})
		)
	})

	/**
	 * The audit entry names the fields that moved, never their values. `AuditLog.newValue` is
	 * rendered by `/reports/audit-log` to every ADMINISTER_SYSTEM holder with no record of the read,
	 * so storing the raw payload would put the cleartext salary of every proposed raise on a page
	 * outside #111's audited reveal — #242's leak class, introduced by this feature.
	 *
	 * Asserting the figure's absence from the serialized entry, not just the presence of `fields`:
	 * adding `fields` while leaving `payload` in place would pass a presence-only check.
	 */
	it('records which fields a proposal touches, never the salary itself', async () => {
		await createProposal(
			'org1',
			{
				targetEmployeeId: TARGET_EMP,
				targetUserId: CEO_USER,
				domain: 'COMPENSATION',
				payload: { basicMonthlySalary: 987654, effectiveDate: '2026-01-01' }
			},
			ctxOf({ actorId: CEO_USER, actorRoles: ['CEO'] })
		)
		const entry = vi.mocked(writeAuditLog).mock.calls[0][1]
		expect(entry.newValue).toMatchObject({ fields: ['basicMonthlySalary', 'effectiveDate'] })
		expect(JSON.stringify(entry.newValue)).not.toContain('987654')
	})

	const whereUsed = async (targetUserId: string) => {
		dbMock.user.findMany.mockClear()
		await createProposal(
			'org1',
			{ targetEmployeeId: TARGET_EMP, targetUserId, domain: 'COMPENSATION', payload: {} },
			ctxOf({ actorId: CEO_USER, actorRoles: ['CEO'] })
		)
		return dbMock.user.findMany.mock.calls[0][0].where
	}

	it('looks for a finance confirmer on a self-action and an HR one otherwise', async () => {
		// Read off `roles`: it is the set `assertMayDecide` judges against, so it is the one that
		// has to carry the right capability's roles.
		const rolesUsed = async (t: string) => (await whereUsed(t)).roles.hasSome
		expect(await rolesUsed(CEO_USER)).not.toContain('HR_ADMIN') // self → APPROVE_FINANCE
		expect(await rolesUsed('user-other')).toContain('HR_ADMIN') // on behalf → HR org-wide
	})

	/**
	 * A [MANAGER, HR_ADMIN] user CAN confirm — `assertMayDecide` reads `ctx.actorRoles` (#133) — so
	 * the eligibility query has to find them too. Matching on a single primary role would miss
	 * them, and the `confirmers.length === 0` guard would then 409 a proposal as unconfirmable
	 * while a qualified confirmer was sitting right there.
	 *
	 * #282 collapsed the old two-branch OR (set, then the scalar `role` for an empty set) into one
	 * `hasSome`: the scalar column is gone and `roles` is never empty.
	 */
	it('finds confirmers by their full role set', async () => {
		const where = await whereUsed('user-other')
		expect(where.roles).toEqual({ hasSome: expect.arrayContaining(['HR_ADMIN']) })
		expect(where).not.toHaveProperty('OR')
	})
})

/**
 * The queue and `assertMayDecide` must describe the same set. A list that shows more than the guard
 * allows is #228 with a nicer front end; a list that shows less is a page of buttons that 403.
 *
 * Rows are shaped as `listActionableProposals` returns them — the target joined in, so the
 * self-action test is a comparison between two columns and never a stored flag.
 */
const SELF_ROW = {
	id: 'p-self',
	initiatorId: CEO_USER,
	target: { id: TARGET_EMP, userId: CEO_USER } // initiator IS the target
}
const ON_BEHALF_ROW = {
	id: 'p-behalf',
	initiatorId: 'user-manager',
	target: { id: 'emp-crew', userId: 'user-crew' }
}

describe('the actionable queue', () => {
	beforeEach(() => {
		dbMock.actionProposal.findMany.mockResolvedValue([SELF_ROW, ON_BEHALF_ROW])
	})

	const idsFor = async (actorId: string, roles: Role[]) =>
		(await listActionableProposals('org1', { actorId, roles })).map((r) => r.id)

	// The rule with no exceptions, and the one the database can express — so it is asserted on the
	// query rather than on the result, where a mocked findMany would answer for it.
	it('never returns rows the actor filed', async () => {
		await listActionableProposals('org1', { actorId: 'user-hr', roles: ['HR_ADMIN'] })
		expect(dbMock.actionProposal.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					organizationId: 'org1',
					status: 'PENDING',
					initiatorId: { not: 'user-hr' }
				})
			})
		)
	})

	// #243's bug shape expressed as a list: MANAGER ranks level with HR_ADMIN, so any rank floor
	// here would hand a manager the queue of proposals that exist because managers must not act
	// alone. MANAGER holds neither confirmer capability, so the queue is empty by construction.
	it('shows a MANAGER nothing at all', async () => {
		expect(await idsFor('user-manager-2', ['MANAGER'])).toEqual([])
	})

	// Both halves matter: a filter that returned everything would pass the first assertion alone.
	it('shows an HR_ADMIN the on-behalf row and NOT the CEO’s self-action', async () => {
		expect(await idsFor('user-hr', ['HR_ADMIN'])).toEqual(['p-behalf'])
	})

	it('shows APPROVE_FINANCE holders both shapes', async () => {
		expect(await idsFor('user-sa', ['SUPER_ADMIN'])).toEqual(['p-self', 'p-behalf'])
		expect(await idsFor('user-ceo-2', ['CEO'])).toEqual(['p-self', 'p-behalf'])
	})

	// The confirmer≠target rule, which `initiatorId: { not: … }` does not cover: a proposal someone
	// else filed FOR an HR_ADMIN looks like an ordinary on-behalf row, and without this the target
	// would be offered a Confirm button on their own raise (the hole 427d564 closed in the guard).
	it('drops a row whose target is the viewer, even holding the capability', async () => {
		dbMock.actionProposal.findMany.mockResolvedValue([
			{ id: 'p-mine', initiatorId: 'user-manager', target: { id: 'emp-hr', userId: 'user-hr' } }
		])
		expect(await idsFor('user-hr', ['HR_ADMIN'])).toEqual([])
	})

	/**
	 * The property that stops the list and the guard drifting apart — the failure mode behind #228.
	 * For every role × row shape, "is it in the queue" and "does confirming it 403" must be the same
	 * answer. Table-driven, so a new role or a new rule has to satisfy both sides at once.
	 */
	it('agrees with the confirm guard on every role × shape', async () => {
		const actors = [
			{ id: 'user-manager-2', roles: ['MANAGER'] },
			{ id: 'user-hr', roles: ['HR_ADMIN'] },
			{ id: 'user-ceo-2', roles: ['CEO'] },
			{ id: 'user-sa', roles: ['SUPER_ADMIN'] }
		] as const

		for (const actor of actors) {
			const visible = await idsFor(actor.id, [...actor.roles])

			for (const row of [SELF_ROW, ON_BEHALF_ROW]) {
				dbMock.actionProposal.findFirst.mockResolvedValue({
					id: row.id,
					organizationId: 'org1',
					initiatorId: row.initiatorId,
					targetEmployeeId: row.target.id,
					domain: 'COMPENSATION',
					payload: {},
					status: 'PENDING'
				})
				dbMock.employee.findUnique.mockResolvedValue({ userId: row.target.userId })

				const confirming = confirmProposal(
					'org1',
					row.id,
					vi.fn().mockResolvedValue(undefined),
					ctxOf({ actorId: actor.id, actorRoles: [...actor.roles] })
				)
				if (visible.includes(row.id)) await expect(confirming).resolves.toBeDefined()
				else await expect(confirming).rejects.toMatchObject({ status: 403 })
			}
		}
	})
})

describe('rejecting', () => {
	it('requires a reason', async () => {
		await expect(rejectProposal('org1', 'p1', '   ', ctxOf())).rejects.toMatchObject({
			status: 400
		})
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
	})

	it('applies the same confirmer rule as confirming', async () => {
		pendOnBehalf()
		await expect(
			rejectProposal('org1', 'p1', 'not budgeted', ctxOf({ actorRoles: ['MANAGER'] }))
		).rejects.toMatchObject({ status: 403 })
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
	})

	/**
	 * The rejection reason is free text one person typed about another's pay. It goes on the proposal
	 * row and to the initiator, but NOT into `AuditLog.newValue` — the same leak class the CREATE
	 * entry avoids, and for the same reason: `/reports/audit-log` renders it to every
	 * ADMINISTER_SYSTEM holder with no record of the read (#111/#242).
	 */
	it('keeps the rejection reason out of the audit entry', async () => {
		pendOnBehalf()
		dbMock.actionProposal.updateMany.mockResolvedValue({ count: 1 })
		await rejectProposal('org1', 'p1', 'over the band for this grade', ctxOf())

		const entry = vi.mocked(writeAuditLog).mock.calls.at(-1)![1]
		expect(entry.newValue).toEqual({ status: 'REJECTED', decidedById: expect.any(String) })
		expect(JSON.stringify(entry.newValue)).not.toContain('over the band')
		// Still persisted where it belongs, so the omission is not data loss.
		expect(dbMock.actionProposal.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ decisionNote: 'over the band for this grade' })
			})
		)
	})
})

/**
 * #265 — every one of the three notifications said "pay change" whatever the domain. Wrong since
 * #222 for a PROMOTION carrying only a job title or a reporting line, and #263 makes that shape
 * reachable from the v1 PATCH too, so a confirmer was told to approve a raise that is a re-org.
 * One case per call site, plus the COMPENSATION regression half — all four exercise the same
 * one-line lookup, so there is no fifth.
 */
describe('proposal notifications name the domain (#265)', () => {
	const promotionInput = {
		targetEmployeeId: TARGET_EMP,
		targetUserId: CEO_USER,
		domain: 'PROMOTION' as const,
		payload: { reportsToId: 'mgr2' }
	}

	const pendPromotion = () => {
		dbMock.actionProposal.findFirst.mockResolvedValue({
			...onBehalfProposal,
			domain: 'PROMOTION'
		})
		dbMock.employee.findUnique.mockResolvedValue({ userId: CEO_USER })
	}

	it('calls a promotion a promotion when one is filed', async () => {
		await createProposal('org1', promotionInput, ctxOf())

		expect(notifyMany).toHaveBeenCalledWith(
			['user-sa'],
			'A promotion is waiting for your confirmation.',
			'/requests/proposals'
		)
	})

	it('still calls a pay change a pay change', async () => {
		// The regression half: the existing copy must not move.
		await createProposal('org1', { ...promotionInput, domain: 'COMPENSATION' }, ctxOf())

		expect(notifyMany).toHaveBeenCalledWith(
			['user-sa'],
			'A pay change is waiting for your confirmation.',
			'/requests/proposals'
		)
	})

	it('names the domain when a proposal is confirmed', async () => {
		pendPromotion()
		await confirmProposal('org1', 'p1', vi.fn().mockResolvedValue(undefined), ctxOf())

		expect(notifyMany).toHaveBeenCalledWith(
			['user-manager'],
			'Your proposed promotion was confirmed and applied.'
		)
	})

	it('names the domain when a proposal is rejected', async () => {
		pendPromotion()
		await rejectProposal('org1', 'p1', 'wrong manager', ctxOf())

		expect(notifyMany).toHaveBeenCalledWith(
			['user-manager'],
			'Your proposed promotion was rejected: wrong manager'
		)
	})
})

/**
 * AVIPA #5 — each audit row is written on the same client as the mutation it records, so a
 * failed audit write rolls the mutation back with it.
 *
 * A DISTINCT `tx` object, not the shared `fn(dbMock)` stand-in the rest of this file uses: with
 * `tx === db` neither half of the assertion can tell the two clients apart, so a revert to a bare
 * `db.` write would still pass.
 */
describe('audit rows share their mutation transaction (AVIPA #5)', () => {
	const tx = {
		actionProposal: {
			create: vi.fn(),
			updateMany: vi.fn(),
			findUniqueOrThrow: vi.fn()
		}
	}

	beforeEach(() => {
		tx.actionProposal.create.mockResolvedValue({ id: 'p1' })
		tx.actionProposal.updateMany.mockResolvedValue({ count: 1 })
		tx.actionProposal.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'APPLIED' })
		dbMock.$transaction.mockImplementation(async (fn: (c: typeof tx) => unknown) => fn(tx))
	})

	it('files a proposal and audits it on one client', async () => {
		await createProposal(
			'org1',
			{ targetEmployeeId: TARGET_EMP, targetUserId: CEO_USER, domain: 'COMPENSATION', payload: {} },
			ctxOf({ actorId: CEO_USER, actorRoles: ['CEO'] })
		)

		expect(tx.actionProposal.create).toHaveBeenCalled()
		expect(dbMock.actionProposal.create).not.toHaveBeenCalled()
		expect(writeAuditLog).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ action: 'CREATE', entityType: 'ActionProposal' }),
			tx
		)
	})

	it('claims a proposal and audits it on one client', async () => {
		pendOnBehalf()
		await confirmProposal('org1', 'p1', vi.fn().mockResolvedValue(undefined), ctxOf())

		expect(tx.actionProposal.updateMany).toHaveBeenCalled()
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
		expect(writeAuditLog).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: 'UPDATE',
				entityType: 'ActionProposal',
				newValue: expect.objectContaining({ status: 'APPLIED' })
			}),
			tx
		)
	})

	it('rejects a proposal and audits it on one client', async () => {
		pendOnBehalf()
		await rejectProposal('org1', 'p1', 'over the band', ctxOf())

		expect(tx.actionProposal.updateMany).toHaveBeenCalled()
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
		expect(writeAuditLog).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: 'UPDATE',
				entityType: 'ActionProposal',
				newValue: expect.objectContaining({ status: 'REJECTED' })
			}),
			tx
		)
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'
import type { StatutoryRateInput } from '$lib/server/services/payroll/statutory-rates'

/**
 * #220 HR-propose / CEO-confirm lifecycle. The DB and audit are mocked so this stays in the fast
 * unit suite. Rules under test:
 *  - propose records a PENDING proposal and NEVER touches the live StatutoryRateConfig.
 *  - confirm applies the proposal's payload to the live config and marks it APPLIED.
 *  - reject marks the proposal REJECTED and leaves the live config untouched (the change is discarded).
 *  - confirm/reject of a non-pending proposal is rejected.
 *  - #283/F2: the proposer cannot CONFIRM their own proposal; self-REJECT stays allowed (Q2).
 */

const { dbMock, writeAuditLogMock } = vi.hoisted(() => {
	const db = {
		statutoryRateProposal: {
			create: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			findUniqueOrThrow: vi.fn()
		},
		statutoryRateConfig: { findUnique: vi.fn(), upsert: vi.fn() },
		$transaction: vi.fn()
	}
	// confirmProposal runs inside a $transaction; the callback gets the same mock as the tx client.
	db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(db))
	return { dbMock: db, writeAuditLogMock: vi.fn().mockResolvedValue(undefined) }
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: writeAuditLogMock }))

const { proposeStatutoryRates, confirmProposal, rejectProposal } =
	await import('$lib/server/services/payroll/statutory-rates')

const HR: AuditContext = {
	organizationId: 'org1',
	actorId: 'hr1',
	actorRoles: ['HR_ADMIN'],
	ipAddress: 't'
}
const CEO: AuditContext = {
	organizationId: 'org1',
	actorId: 'ceo1',
	actorRoles: ['CEO'],
	ipAddress: 't'
}
// #283: multi-role is live, so one person can hold both gates. This is the actor F2 exists for.
const HR_AND_CEO: AuditContext = {
	organizationId: 'org1',
	actorId: 'hr1',
	actorRoles: ['HR_ADMIN', 'CEO'],
	ipAddress: 't'
}

// A valid full payload (passes statutoryRateInputSchema): scalars set, brackets cleared.
const PAYLOAD: StatutoryRateInput = {
	philhealthRate: 0.04,
	philhealthFloor: 10000,
	philhealthCeiling: 100000,
	pagibigRate: 0.02,
	pagibigCap: 100,
	sssBrackets: null,
	taxBrackets: null
}

beforeEach(() => vi.clearAllMocks())

describe('propose', () => {
	it('creates a PENDING proposal and never touches the live config', async () => {
		dbMock.statutoryRateProposal.create.mockResolvedValue({ id: 'prop1' })

		await proposeStatutoryRates('org1', PAYLOAD, HR)

		expect(dbMock.statutoryRateProposal.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					organizationId: 'org1',
					proposedById: 'hr1',
					payload: PAYLOAD
				})
			})
		)
		// The whole point: live rates are unchanged until a confirm.
		expect(dbMock.statutoryRateConfig.upsert).not.toHaveBeenCalled()
	})
})

describe('confirmProposal', () => {
	it('atomically claims the proposal, applies the payload, and marks it APPLIED', async () => {
		// The status-guarded claim succeeds (one row moved PENDING → APPLIED).
		dbMock.statutoryRateProposal.updateMany.mockResolvedValue({ count: 1 })
		dbMock.statutoryRateProposal.findUniqueOrThrow.mockResolvedValue({
			id: 'prop1',
			organizationId: 'org1',
			proposedById: 'hr1',
			status: 'APPLIED',
			payload: PAYLOAD
		})
		dbMock.statutoryRateConfig.findUnique.mockResolvedValue(null)
		dbMock.statutoryRateConfig.upsert.mockResolvedValue({ id: 'cfg1' })

		await confirmProposal('org1', 'prop1', CEO)

		// Claim is status-guarded (only a PENDING row is moved) and stamps the confirmer.
		expect(dbMock.statutoryRateProposal.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'prop1', organizationId: 'org1', status: 'PENDING' },
				data: expect.objectContaining({ status: 'APPLIED', decidedById: 'ceo1' })
			})
		)
		// Payload reached the live config.
		expect(dbMock.statutoryRateConfig.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { organizationId: 'org1' },
				create: expect.objectContaining({ philhealthRate: 0.04, pagibigCap: 100 })
			})
		)
	})

	it('rejects a proposal that is not pending / not found (nothing claimed → no apply)', async () => {
		dbMock.statutoryRateProposal.updateMany.mockResolvedValue({ count: 0 })
		await expect(confirmProposal('org1', 'missing', CEO)).rejects.toThrow()
		expect(dbMock.statutoryRateConfig.upsert).not.toHaveBeenCalled()
	})

	/**
	 * AC-13 (#283/F2). Asserts the message, not just a 403: the surrounding route already 403s for a
	 * missing capability, so a status-only assertion would still pass with the guard deleted whenever
	 * the actor lacks the confirm capability. HR_AND_CEO holds it, so only the self-bar can refuse.
	 */
	it('refuses the proposer', async () => {
		dbMock.statutoryRateProposal.updateMany.mockResolvedValue({ count: 1 })
		dbMock.statutoryRateProposal.findUniqueOrThrow.mockResolvedValue({
			id: 'prop1',
			organizationId: 'org1',
			proposedById: 'hr1',
			status: 'APPLIED',
			payload: PAYLOAD
		})

		await expect(confirmProposal('org1', 'prop1', HR_AND_CEO)).rejects.toMatchObject({
			status: 403,
			body: { message: 'You cannot confirm a rate change you proposed yourself.' }
		})
	})

	/**
	 * AC-14. The guard sits AFTER the status-guarded claim (the claim is the race guard), so the
	 * refusal must throw before any rate config is written — the transaction then rolls the claim
	 * back to PENDING. Move the guard below updateStatutoryRateConfig and both assertions go red.
	 */
	it('rolls back cleanly when the proposer is refused', async () => {
		dbMock.statutoryRateProposal.updateMany.mockResolvedValue({ count: 1 })
		dbMock.statutoryRateProposal.findUniqueOrThrow.mockResolvedValue({
			id: 'prop1',
			organizationId: 'org1',
			proposedById: 'hr1',
			status: 'APPLIED',
			payload: PAYLOAD
		})
		dbMock.statutoryRateConfig.findUnique.mockResolvedValue(null)
		dbMock.statutoryRateConfig.upsert.mockResolvedValue({ id: 'cfg1' })

		await expect(confirmProposal('org1', 'prop1', HR_AND_CEO)).rejects.toMatchObject({
			status: 403
		})

		// updateStatutoryRateConfig never ran: no live rate write …
		expect(dbMock.statutoryRateConfig.upsert).not.toHaveBeenCalled()
		// … and no APPLIED trail claiming the rates changed.
		expect(writeAuditLogMock).not.toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ entityType: 'StatutoryRateConfig' }),
			expect.anything()
		)
	})
})

describe('rejectProposal', () => {
	// The pre-read is the payload source and the normal-path 404 — the claim below is the guard.
	const pendingPreRead = () =>
		dbMock.statutoryRateProposal.findFirst.mockResolvedValue({
			id: 'prop1',
			organizationId: 'org1',
			proposedById: 'hr1',
			status: 'PENDING'
		})

	it('marks the proposal REJECTED and discards it (live config untouched)', async () => {
		pendingPreRead()
		dbMock.statutoryRateProposal.updateMany.mockResolvedValue({ count: 1 })
		dbMock.statutoryRateProposal.findUniqueOrThrow.mockResolvedValue({
			id: 'prop1',
			status: 'REJECTED'
		})

		await rejectProposal('org1', 'prop1', CEO)

		// Claim is status- AND org-guarded, so a confirm that already applied it cannot be overwritten.
		expect(dbMock.statutoryRateProposal.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'prop1', organizationId: 'org1', status: 'PENDING' },
				data: expect.objectContaining({ status: 'REJECTED', decidedById: 'ceo1' })
			})
		)
		expect(dbMock.statutoryRateConfig.upsert).not.toHaveBeenCalled()
	})

	/**
	 * The race the claim exists for: the pre-read saw PENDING, then a confirm claimed and applied the
	 * proposal before this transaction ran. The claim matches zero rows, so the reject must 404 rather
	 * than stamp REJECTED over an APPLIED row — and it must leave no audit trail saying it did.
	 */
	it('404s and writes no audit row when the claim matches zero rows', async () => {
		pendingPreRead()
		dbMock.statutoryRateProposal.updateMany.mockResolvedValue({ count: 0 })

		await expect(rejectProposal('org1', 'prop1', CEO)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Pending proposal not found' }
		})

		expect(writeAuditLogMock).not.toHaveBeenCalled()
		expect(dbMock.statutoryRateProposal.findUniqueOrThrow).not.toHaveBeenCalled()
	})

	// #5: the audit row goes on the transaction client, and still carries the proposer from the
	// pre-read (which is why the pre-read stays even though it is no longer the guard).
	it('audits the rejection on the transaction client with the proposer from the pre-read', async () => {
		pendingPreRead()
		dbMock.statutoryRateProposal.updateMany.mockResolvedValue({ count: 1 })
		dbMock.statutoryRateProposal.findUniqueOrThrow.mockResolvedValue({
			id: 'prop1',
			status: 'REJECTED'
		})

		await rejectProposal('org1', 'prop1', CEO)

		expect(writeAuditLogMock).toHaveBeenCalledWith(
			CEO,
			expect.objectContaining({
				entityType: 'StatutoryRateProposal',
				entityId: 'prop1',
				oldValue: { status: 'PENDING', proposedById: 'hr1' },
				newValue: { status: 'REJECTED', decidedById: 'ceo1' }
			}),
			dbMock
		)
	})

	/**
	 * Q2: the bar is CONFIRM-only. A self-reject is the proposer withdrawing their own mistake — it
	 * applies nothing and leaves the tax tables untouched, so there is no two-person rule to collapse.
	 */
	it('allows the proposer to withdraw their own proposal', async () => {
		pendingPreRead()
		dbMock.statutoryRateProposal.updateMany.mockResolvedValue({ count: 1 })
		dbMock.statutoryRateProposal.findUniqueOrThrow.mockResolvedValue({
			id: 'prop1',
			status: 'REJECTED'
		})

		await rejectProposal('org1', 'prop1', HR)

		expect(dbMock.statutoryRateProposal.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'prop1', organizationId: 'org1', status: 'PENDING' },
				data: expect.objectContaining({ status: 'REJECTED', decidedById: 'hr1' })
			})
		)
		expect(dbMock.statutoryRateConfig.upsert).not.toHaveBeenCalled()
	})
})

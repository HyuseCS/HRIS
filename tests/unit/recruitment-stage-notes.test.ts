import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #52 stage-move notes. The service already accepted `notes` before the Kanban UI
 * sent one — these tests pin the behaviour the note dialog depends on:
 * - the note is persisted onto the ApplicantStageHistory row, and
 * - the stage move writes an audit entry.
 */

const { dbMock, txMock } = vi.hoisted(() => {
	const txMock = {
		applicant: { update: vi.fn() },
		applicantStageHistory: { create: vi.fn() }
	}
	return {
		txMock,
		dbMock: {
			applicant: { findFirst: vi.fn() },
			$transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock))
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { advanceApplicant } = await import('$lib/server/services/recruitment')
const { writeAuditLog } = await import('$lib/server/audit')

const CTX: AuditContext = {
	organizationId: 'org1',
	actorId: 'u1',
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.applicant.findFirst.mockResolvedValue({ id: 'app1', currentStage: 'APPLIED' })
	txMock.applicant.update.mockResolvedValue({ id: 'app1', currentStage: 'SCREENING' })
	txMock.applicantStageHistory.create.mockResolvedValue({})
})

describe('advanceApplicant — stage-move notes', () => {
	it('persists the note onto the stage-history row with the actor', async () => {
		await advanceApplicant('app1', 'org1', 'SCREENING', 'Strong portfolio, fast-track', CTX)

		expect(txMock.applicantStageHistory.create).toHaveBeenCalledWith({
			data: {
				applicantId: 'app1',
				stage: 'SCREENING',
				notes: 'Strong portfolio, fast-track',
				changedById: 'u1'
			}
		})
	})

	it('stores no note when none is given', async () => {
		await advanceApplicant('app1', 'org1', 'SCREENING', undefined, CTX)

		expect(txMock.applicantStageHistory.create).toHaveBeenCalledWith({
			data: expect.objectContaining({ notes: undefined })
		})
	})

	it('writes an audit entry for the stage move', async () => {
		await advanceApplicant('app1', 'org1', 'REJECTED', 'Did not pass screening', CTX)

		// #5: the audit write shares the transaction that commits the stage move.
		expect(writeAuditLog).toHaveBeenCalledWith(
			CTX,
			{
				action: 'UPDATE',
				entityType: 'Applicant',
				entityId: 'app1',
				newValue: { stage: 'REJECTED' }
			},
			txMock
		)
	})

	it('404s for an applicant outside the organization', async () => {
		dbMock.applicant.findFirst.mockResolvedValue(null)

		await expect(
			advanceApplicant('ghost', 'org1', 'SCREENING', undefined, CTX)
		).rejects.toMatchObject({ status: 404 })
		expect(txMock.applicantStageHistory.create).not.toHaveBeenCalled()
	})
})

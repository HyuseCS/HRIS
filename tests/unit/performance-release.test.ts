import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #178 item 154 — SPEC AC7, THE HR RELEASE GATE.
 *
 * THE TRAP THIS FILE EXISTS FOR: `MANAGE_HR` includes `MANAGER` (#133 made managers on-branch
 * HR), so a `MANAGE_HR` guard here would let a team lead release the evaluation they themselves
 * wrote to the person they wrote it about. `ADMINISTER_HR_ORGWIDE` is the capability that
 * actually excludes MANAGER, and it is the only correct guard on this action.
 *
 * MUTATION-CHECKED: with the guard in `+page.server.ts` swapped to `MANAGE_HR`, the MANAGER case
 * below goes RED. Recorded in the Phase 8 report.
 *
 * Only `$lib/server/db`, the audit writer and the notifier are mocked, so the REAL action calls
 * the REAL `releaseReview`. A refusal here is provably "never reached the database", not "the
 * service happened to reject it too".
 */

const { dbMock, txMock, writeAuditLog, notify } = vi.hoisted(() => {
	const txMock = {
		performanceReview: { findFirst: vi.fn(), update: vi.fn() },
		employee: { findFirst: vi.fn() }
	}
	return {
		txMock,
		writeAuditLog: vi.fn().mockResolvedValue(undefined),
		notify: vi.fn().mockResolvedValue(undefined),
		dbMock: {
			performanceReview: { findFirst: vi.fn(), update: vi.fn() },
			$transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))
vi.mock('$lib/server/services/notifications', () => ({ notify }))

const { actions } = await import('../../src/routes/(app)/performance/reviews/[id]/+page.server')

const ORG = 'org1'
const REVIEW = 'review1'
const HR_USER = 'user-hr'
const HR_EMPLOYEE = 'emp-hr'
const SUBJECT_USER = 'user-subject'

const event = (roles: Role[]) =>
	({
		request: { formData: async () => new FormData() },
		locals: { user: { id: HR_USER, organizationId: ORG, roles } },
		params: { id: REVIEW },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const release = (roles: Role[]) => (actions.release as any)(event(roles))

const UNRELEASED = {
	id: REVIEW,
	releasedAt: null,
	releasedByEmployeeId: null,
	employee: { userId: SUBJECT_USER }
}

beforeEach(() => {
	vi.clearAllMocks()
	txMock.performanceReview.findFirst.mockResolvedValue(UNRELEASED)
	txMock.employee.findFirst.mockResolvedValue({ id: HR_EMPLOYEE })
	txMock.performanceReview.update.mockImplementation(
		async ({ data }: { data: { releasedAt: Date; releasedByEmployeeId: string | null } }) => ({
			...UNRELEASED,
			...data
		})
	)
})

describe('only ADMINISTER_HR_ORGWIDE may release (#178 AC7)', () => {
	it('403s a MANAGER and never touches the database — the MANAGE_HR trap', async () => {
		await expect(release(['MANAGER'])).rejects.toMatchObject({ status: 403 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(txMock.performanceReview.update).not.toHaveBeenCalled()
	})

	it('403s a plain EMPLOYEE and never touches the database', async () => {
		await expect(release(['EMPLOYEE'])).rejects.toMatchObject({ status: 403 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('lets HR_ADMIN through — the positive control, so the 403s prove the guard and not a typo', async () => {
		await expect(release(['HR_ADMIN'])).resolves.toMatchObject({ success: true })
		expect(txMock.performanceReview.update).toHaveBeenCalledTimes(1)
	})
})

describe('releaseReview writes the release and its attribution', () => {
	it('sets releasedAt and the releasing HR user’s employee id', async () => {
		await release(['HR_ADMIN'])
		const { where, data } = txMock.performanceReview.update.mock.calls[0][0]
		expect(where).toEqual({ id: REVIEW })
		expect(data.releasedAt).toBeInstanceOf(Date)
		expect(data.releasedByEmployeeId).toBe(HR_EMPLOYEE)
	})

	it('org-scopes the read through cycle.organizationId — the only path on this model', async () => {
		await release(['HR_ADMIN'])
		expect(txMock.performanceReview.findFirst.mock.calls[0][0].where).toEqual({
			id: REVIEW,
			cycle: { organizationId: ORG }
		})
	})

	it('404s a review in another org, and releases nothing', async () => {
		txMock.performanceReview.findFirst.mockResolvedValue(null)
		await expect(release(['HR_ADMIN'])).resolves.toMatchObject({ status: 404 })
		expect(txMock.performanceReview.update).not.toHaveBeenCalled()
	})

	it('audits the release INSIDE the transaction (#324), with the attribution', async () => {
		await release(['HR_ADMIN'])
		expect(writeAuditLog).toHaveBeenCalledTimes(1)
		const [ctx, payload, client] = writeAuditLog.mock.calls[0]
		expect(ctx).toMatchObject({ organizationId: ORG, actorId: HR_USER, actorRoles: ['HR_ADMIN'] })
		expect(payload).toMatchObject({
			action: 'UPDATE',
			entityType: 'PerformanceReview',
			entityId: REVIEW
		})
		expect(payload.newValue.releasedAt).toBeInstanceOf(Date)
		expect(payload.newValue.releasedByEmployeeId).toBe(HR_EMPLOYEE)
		// The tx client, not the shared db — a release standing unrecorded is the gap #324 closes.
		expect(client).toBe(txMock)
	})

	it('notifies the employee that their evaluation is readable', async () => {
		await release(['HR_ADMIN'])
		expect(notify).toHaveBeenCalledTimes(1)
		expect(notify.mock.calls[0][0]).toBe(SUBJECT_USER)
		expect(notify.mock.calls[0][1]).toContain('released')
		expect(notify.mock.calls[0][2]).toBe(`/performance/reviews/${REVIEW}`)
	})

	it('releases even when the HR actor has no employee record, leaving attribution null', async () => {
		// The FK is ON DELETE SET NULL, so absent attribution is a state the schema allows. The
		// audit row still names the actor. Refusing the release instead would strand the employee.
		txMock.employee.findFirst.mockResolvedValue(null)
		await release(['HR_ADMIN'])
		expect(txMock.performanceReview.update.mock.calls[0][0].data.releasedByEmployeeId).toBeNull()
	})
})

describe('a second release is a no-op (idempotent)', () => {
	const FIRST_AT = new Date('2026-08-20T01:00:00Z')
	const ALREADY = {
		id: REVIEW,
		releasedAt: FIRST_AT,
		releasedByEmployeeId: 'emp-first-releaser',
		employee: { userId: SUBJECT_USER }
	}

	beforeEach(() => {
		txMock.performanceReview.findFirst.mockResolvedValue(ALREADY)
	})

	it('does not write again — the first attribution and timestamp stand', async () => {
		await expect(release(['HR_ADMIN'])).resolves.toMatchObject({ success: true })
		expect(txMock.performanceReview.update).not.toHaveBeenCalled()
		expect(ALREADY.releasedByEmployeeId).toBe('emp-first-releaser')
		expect(ALREADY.releasedAt).toBe(FIRST_AT)
	})

	it('writes no audit row and sends no second notification', async () => {
		await release(['HR_ADMIN'])
		expect(writeAuditLog).not.toHaveBeenCalled()
		expect(notify).not.toHaveBeenCalled()
	})
})

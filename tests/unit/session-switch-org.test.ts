import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #5 — switching the active org mutated `Session.currentOrgId` with a bare `db` write and then
 * wrote its audit row separately. A failed audit write left the session pointing at a new org
 * with no record of the move. The update and the audit row now share one transaction.
 */

const { dbMock, writeAuditLog } = vi.hoisted(() => ({
	writeAuditLog: vi.fn(),
	dbMock: {
		userOrganization: { findUnique: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { POST } = await import('../../src/routes/api/v1/session/switch-org/+server')

const ORG_A = 'orgA'
const ORG_B = 'orgB'

const tx = { session: { update: vi.fn() } }

const event = () =>
	({
		locals: {
			user: { id: 'user-1', organizationId: ORG_A, roles: ['CEO'] },
			session: { id: 'sess-1' }
		},
		request: new Request('http://x/api/v1/session/switch-org', {
			method: 'POST',
			body: JSON.stringify({ organizationId: ORG_B })
		}),
		getClientAddress: () => '10.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.userOrganization.findUnique.mockResolvedValue({ userId: 'user-1', organizationId: ORG_B })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<void>) => fn(tx))
	writeAuditLog.mockResolvedValue(undefined)
})

describe('POST /api/v1/session/switch-org', () => {
	it('switches the session org and audits it in the same transaction', async () => {
		const res = await POST(event())

		expect(res.status).toBe(200)
		await expect(res.json()).resolves.toEqual({ ok: true })
		expect(tx.session.update).toHaveBeenCalledWith({
			where: { id: 'sess-1' },
			data: { currentOrgId: ORG_B }
		})
		// #5: the audit write shares the transaction.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('records the previous org in the audit payload', async () => {
		await POST(event())

		const [, payload] = writeAuditLog.mock.calls[0]
		expect(payload).toMatchObject({
			action: 'UPDATE',
			entityType: 'Session',
			entityId: 'sess-1',
			oldValue: { currentOrgId: ORG_A },
			newValue: { currentOrgId: ORG_B }
		})
	})

	it('refuses an org the user is not a member of', async () => {
		dbMock.userOrganization.findUnique.mockResolvedValue(null)

		await expect(POST(event())).rejects.toMatchObject({ status: 403 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #5 — both login audit writes are deliberately class D: they stay OUTSIDE a transaction and pass
 * `db` explicitly. LOGIN_FAILED has no mutation to roll back with — the audit row IS the event.
 * LOGIN is paired with a `lastLoginAt` bookkeeping write, but the session cookie is already set by
 * then, so that write must never be able to erase the record of a session that exists.
 */

const { dbMock, writeAuditLog, lucia, recordFailure, recordSuccess, checkRateLimit, compare } =
	vi.hoisted(() => ({
		writeAuditLog: vi.fn(),
		recordFailure: vi.fn(),
		recordSuccess: vi.fn(),
		checkRateLimit: vi.fn(),
		compare: vi.fn(),
		lucia: {
			createSession: vi.fn(),
			createSessionCookie: vi.fn()
		},
		dbMock: {
			user: { findUnique: vi.fn(), update: vi.fn() },
			userOrganization: { findUnique: vi.fn() },
			organization: { findMany: vi.fn() }
		}
	}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))
vi.mock('$lib/server/auth', () => ({ lucia }))
vi.mock('$lib/server/rate-limit', () => ({ checkRateLimit, recordFailure, recordSuccess }))
vi.mock('bcrypt', () => ({ default: { compare } }))

const { actions } = await import('../../src/routes/(auth)/login/+page.server')

const ORG = 'org-1'
const USER = {
	id: 'user-1',
	organizationId: ORG,
	roles: ['CEO'],
	isActive: true,
	passwordHash: 'h'
}

const event = () => {
	const body = new FormData()
	body.set('email', 'a@b.com')
	body.set('password', 'pw')
	body.set('selectedOrg', ORG)
	return {
		request: new Request('http://x/login', { method: 'POST', body }),
		cookies: { set: vi.fn() },
		getClientAddress: () => '10.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

beforeEach(() => {
	vi.clearAllMocks()
	checkRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
	dbMock.user.findUnique.mockResolvedValue(USER)
	writeAuditLog.mockResolvedValue(undefined)
	lucia.createSession.mockResolvedValue({ id: 'sess-1' })
	lucia.createSessionCookie.mockReturnValue({ name: 'auth', value: 'v', attributes: {} })
})

describe('login audit writes — class D, outside any transaction', () => {
	it('records LOGIN_FAILED on a bad password, passing db explicitly', async () => {
		compare.mockResolvedValue(false)

		const result = await actions.default(event())

		expect(result).toMatchObject({ status: 401 })
		const [, payload, client] = writeAuditLog.mock.calls[0]
		expect(payload).toMatchObject({ action: 'LOGIN_FAILED', entityType: 'User', entityId: USER.id })
		expect(client).toBe(dbMock)
	})

	it('still records LOGIN when the lastLoginAt write fails', async () => {
		compare.mockResolvedValue(true)
		dbMock.user.update.mockRejectedValue(new Error('lastLoginAt down'))

		await expect(actions.default(event())).rejects.toThrow('lastLoginAt down')

		// The session cookie is already set, so the audit row must have been attempted anyway —
		// and on `db`, not a transaction client that would have rolled it back.
		const [, payload, client] = writeAuditLog.mock.calls[0]
		expect(payload).toMatchObject({ action: 'LOGIN', entityType: 'User', entityId: USER.id })
		expect(client).toBe(dbMock)
	})
})

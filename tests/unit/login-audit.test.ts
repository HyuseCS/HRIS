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
			user: { findFirst: vi.fn(), update: vi.fn() },
			userOrganization: { findUnique: vi.fn() },
			organization: { findMany: vi.fn() }
		}
	}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))
vi.mock('$lib/server/auth', () => ({ lucia }))
vi.mock('$lib/server/rate-limit', () => ({ checkRateLimit, recordFailure, recordSuccess }))
vi.mock('bcrypt', () => ({ default: { compare } }))

const { actions, load } = await import('../../src/routes/(auth)/login/+page.server')

const ORG = 'org-1'
const USER = {
	id: 'user-1',
	organizationId: ORG,
	roles: ['CEO'],
	isActive: true,
	passwordHash: 'h'
}

const DUMMY_HASH = '$2b$12$Zk.FRyDrUxKCnZx/bFGiIO4y.2eAjBetoJQLGTHPAvKRpwH26Wpwe'

const event = (email = 'a@b.com') => {
	const body = new FormData()
	body.set('email', email)
	body.set('password', 'pw')
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
	dbMock.user.findFirst.mockResolvedValue(USER)
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
		expect(dbMock.userOrganization.findUnique).not.toHaveBeenCalled()
	})
})

describe('login lookup and failure paths', () => {
	it('looks the email up case-insensitively, as typed', async () => {
		compare.mockResolvedValue(false)

		await actions.default(event('Mixed@Case.COM'))

		expect(dbMock.user.findFirst).toHaveBeenCalledWith({
			where: { email: { equals: 'Mixed@Case.COM', mode: 'insensitive' } }
		})
	})

	it('runs compare against the dummy hash for an unknown email, 401, no audit', async () => {
		dbMock.user.findFirst.mockResolvedValue(null)
		compare.mockResolvedValue(false)

		const result = await actions.default(event())

		expect(compare).toHaveBeenCalledWith('pw', DUMMY_HASH)
		expect(result).toMatchObject({ status: 401, data: { error: 'Invalid email or password' } })
		expect(recordFailure).toHaveBeenCalledOnce()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('audits LOGIN_FAILED for an inactive user and creates no session', async () => {
		dbMock.user.findFirst.mockResolvedValue({ ...USER, isActive: false })
		compare.mockResolvedValue(true)

		const result = await actions.default(event())

		expect(compare).toHaveBeenCalledWith('pw', USER.passwordHash)
		expect(result).toMatchObject({ status: 401, data: { error: 'Invalid email or password' } })
		expect(recordFailure).toHaveBeenCalledOnce()
		const [, payload, client] = writeAuditLog.mock.calls[0]
		expect(payload).toMatchObject({ action: 'LOGIN_FAILED', entityType: 'User', entityId: USER.id })
		expect(client).toBe(dbMock)
		expect(lucia.createSession).not.toHaveBeenCalled()
	})
})

describe('login load — account_disabled flag', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const run = (href: string): any => (load as any)({ locals: { user: null }, url: new URL(href) })

	it('is true when ?error=account_disabled', async () => {
		expect(await run('http://x/login?error=account_disabled')).toEqual({ accountDisabled: true })
	})

	it('is false when the param is absent', async () => {
		expect(await run('http://x/login')).toEqual({ accountDisabled: false })
	})
})

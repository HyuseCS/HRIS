import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 09 — the email-first login. These pin the security property the phase exists for:
 * `?/resolve` has exactly ONE response shape for every email in the world, so step 1 can
 * never tell a real account from an invented one; and `?/signin` never lands a session in
 * an org the account does not belong to.
 *
 * The Prisma client is mocked, so none of this proves the real query. Two fixtures stop
 * the usual vacuous pass: the unknown-email deep-equal (U1) goes red against a
 * `mockResolvedValue` that ignores the `where` clause, and the four-orgs-vs-two-memberships
 * fixture (U2) goes red if the resolution ever reads the org table instead of memberships.
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
			// Mocked ONLY as a tripwire: nothing in the login flow may read the org table.
			organization: { findMany: vi.fn() }
		}
	}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))
vi.mock('$lib/server/auth', () => ({ lucia }))
vi.mock('$lib/server/rate-limit', () => ({ checkRateLimit, recordFailure, recordSuccess }))
vi.mock('bcrypt', () => ({ default: { compare } }))

const { actions } = await import('../../src/routes/(auth)/login/+page.server')

const ALPHA = { id: 'org-a', name: 'Alpha' }
const BETA = { id: 'org-b', name: 'Beta' }

/** The whole org table — four rows. A membership-scoped picker must never show all four. */
const ALL_ORGS = [ALPHA, BETA, { id: 'org-g', name: 'Gamma' }, { id: 'org-d', name: 'Delta' }]

type Org = { id: string; name: string }

const userRow = (orgs: Org[], extra: Record<string, unknown> = {}) => ({
	id: 'user-1',
	isActive: true,
	organizationId: orgs[0].id,
	organization: orgs[0],
	memberships: orgs.map((o) => ({ organization: o })),
	roles: ['CEO'],
	passwordHash: 'h',
	...extra
})

/**
 * `user.findUnique` that honours its `where` — an unknown email really resolves to null —
 * and a `userOrganization.findUnique` keyed on the compound id, so a membership answer can
 * never be right by accident.
 */
const seedUsers = (rows: Record<string, ReturnType<typeof userRow>>) => {
	dbMock.user.findUnique.mockImplementation(
		async ({ where }: { where: { email: string } }) => rows[where.email] ?? null
	)
	dbMock.userOrganization.findUnique.mockImplementation(
		async ({
			where
		}: {
			where: { userId_organizationId: { userId: string; organizationId: string } }
		}) => {
			const { userId, organizationId } = where.userId_organizationId
			const user = Object.values(rows).find((r) => r.id === userId)
			const member = user?.memberships.some((m) => m.organization.id === organizationId)
			return member ? { id: 'uo-1', userId, organizationId } : null
		}
	)
}

const resolveEvent = (email: string) => {
	const body = new FormData()
	body.set('email', email)
	return {
		request: new Request('http://x/login?/resolve', { method: 'POST', body })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

const signinEvent = (email: string, password: string, selectedOrg?: string) => {
	const body = new FormData()
	body.set('email', email)
	body.set('password', password)
	if (selectedOrg !== undefined) body.set('selectedOrg', selectedOrg)
	return {
		request: new Request('http://x/login?/signin', { method: 'POST', body }),
		cookies: { set: vi.fn() },
		getClientAddress: () => '10.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

beforeEach(() => {
	vi.clearAllMocks()
	checkRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
	dbMock.organization.findMany.mockResolvedValue(ALL_ORGS)
	writeAuditLog.mockResolvedValue(undefined)
	lucia.createSession.mockResolvedValue({ id: 'sess-1' })
	lucia.createSessionCookie.mockReturnValue({ name: 'auth', value: 'v', attributes: {} })
})

describe('U1 — `?/resolve` has one response shape for every email', () => {
	it('unknown, malformed, single-org and inactive multi-org emails are indistinguishable', async () => {
		seedUsers({
			'solo@veent.ph': userRow([ALPHA]),
			// AC8b: a deactivated account with TWO memberships must still disclose nothing.
			'disabled@veent.ph': userRow([ALPHA, BETA], { isActive: false })
		})

		const unknown = await actions.resolve(resolveEvent('nobody@example.com'))
		const malformed = await actions.resolve(resolveEvent('not-an-email'))
		const single = await actions.resolve(resolveEvent('solo@veent.ph'))
		const inactive = await actions.resolve(resolveEvent('disabled@veent.ph'))

		expect(unknown).toEqual({ email: 'nobody@example.com', orgs: [] })
		expect(malformed).toEqual({ ...unknown, email: 'not-an-email' })
		expect(single).toEqual({ ...unknown, email: 'solo@veent.ph' })
		expect(inactive).toEqual({ ...unknown, email: 'disabled@veent.ph' })
	})

	it('never returns a failure — no branch carries a status', async () => {
		seedUsers({ 'solo@veent.ph': userRow([ALPHA]) })

		for (const email of ['nobody@example.com', 'not-an-email', 'solo@veent.ph']) {
			const result = await actions.resolve(resolveEvent(email))
			expect(result).not.toHaveProperty('status')
		}
	})

	it('does no database read at all for a malformed email', async () => {
		seedUsers({})

		await actions.resolve(resolveEvent('not-an-email'))

		expect(dbMock.user.findUnique).not.toHaveBeenCalled()
	})
})

describe('U2 — the picker is scoped to membership, not to the org table', () => {
	it('returns exactly the two orgs the user belongs to, name-sorted, out of four', async () => {
		seedUsers({ 'multi@veent.ph': userRow([BETA, ALPHA]) })

		const result = await actions.resolve(resolveEvent('multi@veent.ph'))

		expect(result).toEqual({ email: 'multi@veent.ph', orgs: [ALPHA, BETA] })
		expect(dbMock.organization.findMany).not.toHaveBeenCalled()
	})
})

describe('U3 — a forged selectedOrg is rejected', () => {
	it('401s generically, audits against the real org, and creates no session', async () => {
		seedUsers({ 'solo@veent.ph': userRow([ALPHA]) })
		compare.mockResolvedValue(true)

		const result = await actions.signin(signinEvent('solo@veent.ph', 'right-password', 'org-g'))

		expect(result).toMatchObject({
			status: 401,
			data: { error: 'Invalid email or password', email: 'solo@veent.ph', orgs: [] }
		})
		const [context, payload] = writeAuditLog.mock.calls[0]
		expect(payload).toMatchObject({ action: 'LOGIN_FAILED' })
		expect(context.organizationId).toBe(ALPHA.id)
		expect(lucia.createSession).not.toHaveBeenCalled()
	})
})

describe('U4 — the session org is never null', () => {
	it('a single-org sign-in with no selectedOrg lands in the resolved org', async () => {
		seedUsers({ 'solo@veent.ph': userRow([ALPHA]) })
		compare.mockResolvedValue(true)
		dbMock.user.update.mockResolvedValue({})

		// The success path ends in a redirect, which SvelteKit throws.
		await expect(
			actions.signin(signinEvent('solo@veent.ph', 'right-password'))
		).rejects.toMatchObject({ status: 302 })

		expect(lucia.createSession).toHaveBeenCalledWith('user-1', { currentOrgId: ALPHA.id })
		const [context, payload] = writeAuditLog.mock.calls[0]
		expect(payload).toMatchObject({ action: 'LOGIN' })
		expect(context.organizationId).toBe(ALPHA.id)
	})
})

describe('U6 — an inactive account cannot sign in either', () => {
	it('401s generically without a session', async () => {
		seedUsers({ 'disabled@veent.ph': userRow([ALPHA, BETA], { isActive: false }) })
		compare.mockResolvedValue(true)

		const result = await actions.signin(signinEvent('disabled@veent.ph', 'right-password'))

		expect(result).toMatchObject({ status: 401 })
		expect(lucia.createSession).not.toHaveBeenCalled()
	})
})

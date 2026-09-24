import { describe, it, expect, vi } from 'vitest'

const { lucia } = vi.hoisted(() => ({
	lucia: {
		sessionCookieName: 'auth',
		validateSession: vi.fn(),
		invalidateSession: vi.fn(),
		createSessionCookie: vi.fn(),
		createBlankSessionCookie: vi.fn()
	}
}))

vi.mock('$lib/server/auth', () => ({ lucia }))

const { handle } = await import('../../src/hooks.server')

describe('handle — a blocked user', () => {
	it('invalidates the session and blanks the cookie before redirecting', async () => {
		lucia.validateSession.mockResolvedValue({
			session: { id: 'sess-1', fresh: false, currentOrgId: null },
			user: { id: 'u1', organizationId: 'org-1', isActive: false }
		})
		lucia.invalidateSession.mockResolvedValue(undefined)
		lucia.createBlankSessionCookie.mockReturnValue({ name: 'auth', value: '', attributes: {} })
		const set = vi.fn()
		const resolve = vi.fn()

		await expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(handle as any)({ event: { cookies: { get: () => 'sess-1', set }, locals: {} }, resolve })
		).rejects.toMatchObject({ status: 302, location: '/login?error=account_disabled' })

		expect(lucia.invalidateSession).toHaveBeenCalledWith('sess-1')
		expect(set).toHaveBeenCalledWith('auth', '', { path: '.' })
		expect(resolve).not.toHaveBeenCalled()
	})
})

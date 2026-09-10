import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * B1 — /settings/roles rendered every login in the organisation (212 rows, 196 setActive forms
 * in one page load). The `load` now filters on `?q=` and slices to a page before returning.
 *
 * These pin the load's arithmetic only: which rows survive the filter, how many reach the page,
 * and that an explicit `?page=` is honoured on top of a filter. They do NOT prove the page
 * renders a filter form or a <Pagination> — no component harness exists in this repo.
 */

const { listOrgUsersMock } = vi.hoisted(() => ({ listOrgUsersMock: vi.fn() }))

vi.mock('$lib/server/services/settings/org', () => ({
	listOrgUsers: listOrgUsersMock,
	setUserRoles: vi.fn(),
	setUserActive: vi.fn()
}))

const roles = await import('../../src/routes/(app)/settings/roles/+page.server')

const SUPER: Role[] = ['SUPER_ADMIN']

const user = (n: number, email: string) => ({
	id: `u${n}`,
	email,
	roles: ['EMPLOYEE'],
	isActive: true,
	employeeName: `Person ${n}`
})

const load = (query: string) =>
	roles.load({
		locals: { user: { id: 'actor', organizationId: 'org1', roles: SUPER } },
		url: new URL(`http://localhost/settings/roles${query}`)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<{
		users: { email: string }[]
		pagination: { page: number; total: number; totalPages: number }
	}>

beforeEach(() => {
	vi.clearAllMocks()
})

describe('/settings/roles load', () => {
	it('returns only the users matching ?q=, and honours ?page= on top of the filter', async () => {
		listOrgUsersMock.mockResolvedValue([
			...Array.from({ length: 12 }, (_, i) => user(i, `match${i}@veent.ph`)),
			...Array.from({ length: 3 }, (_, i) => user(100 + i, `other${i}@veent.ph`))
		])

		const res = await load('?q=match&page=2')

		expect(res.pagination.total).toBe(12)
		expect(res.pagination.totalPages).toBe(2)
		expect(res.pagination.page).toBe(2)
		expect(res.users).toHaveLength(2)
		for (const u of res.users) expect(u.email).toContain('match')
	})

	it('caps an unfiltered load at one page and reports the true total', async () => {
		listOrgUsersMock.mockResolvedValue(
			Array.from({ length: 30 }, (_, i) => user(i, `person${i}@veent.ph`))
		)

		const res = await load('')

		expect(res.users).toHaveLength(10)
		expect(res.pagination.page).toBe(1)
		expect(res.pagination.total).toBe(30)
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PATCH /api/v1/settings/users/:id/roles — the v1 twin of the Settings → Roles form.
 *
 * #283/Q3 renames this from `/role` and widens the body from `{ role }` to `{ roles: [...] }`.
 * The handler holds no guardrail of its own beyond the capability check: everything else — last
 * super admin, last CEO, self-change, empty set — lives in setUserRoles, which is what makes the
 * two callers agree. So what these pin is the WIRING: that the parsed set reaches the service
 * unchanged, and that a refusal happens before the service is reached at all.
 *
 * Every case asserts the arguments or that the service was NOT called. "The handler resolved" would
 * pass with the body silently truncated to one role, which is exactly the bug this endpoint is
 * being changed to prevent.
 */

const setUserRoles = vi.hoisted(() => vi.fn())
vi.mock('$lib/server/services/settings/org', () => ({ setUserRoles }))

const { PATCH } = await import('../../src/routes/api/v1/settings/users/[id]/roles/+server')

const CEO = {
	id: 'user-ceo',
	organizationId: 'org1',
	roles: ['CEO']
}

const call = (body: unknown, user: unknown = CEO) =>
	(PATCH as unknown as (e: unknown) => Promise<Response>)({
		locals: { user },
		params: { id: 'user-other' },
		request: { json: async () => body },
		getClientAddress: () => 'test'
	})

beforeEach(() => {
	vi.clearAllMocks()
	setUserRoles.mockResolvedValue({ id: 'user-other', roles: ['HR_ADMIN', 'VERIFIER'] })
})

describe('PATCH /api/v1/settings/users/:id/roles', () => {
	it('forwards the whole role set to setUserRoles (#283/AC-2)', async () => {
		const res = await call({ roles: ['HR_ADMIN', 'VERIFIER'] })

		expect(setUserRoles).toHaveBeenCalledWith(
			'user-other',
			'org1',
			['HR_ADMIN', 'VERIFIER'],
			expect.objectContaining({ organizationId: 'org1', actorId: 'user-ceo' })
		)
		expect(await res.json()).toEqual({
			data: { id: 'user-other', roles: ['HR_ADMIN', 'VERIFIER'] }
		})
	})

	// D4's API half. The service refuses this too; the schema refusing first is what turns a 400
	// error into a 422 with a field message, and keeps the writer unreached.
	it('rejects an empty role set without calling the service (#283/AC-4b)', async () => {
		await expect(call({ roles: [] })).rejects.toMatchObject({ status: 422 })
		expect(setUserRoles).not.toHaveBeenCalled()
	})

	it('rejects a role outside ASSIGNABLE_ROLES', async () => {
		await expect(call({ roles: ['NOT_A_ROLE'] })).rejects.toMatchObject({ status: 422 })
		expect(setUserRoles).not.toHaveBeenCalled()
	})

	it('rejects a singular { role } body — the old shape is gone (#283/Q3)', async () => {
		await expect(call({ role: 'HR_ADMIN' })).rejects.toMatchObject({ status: 422 })
		expect(setUserRoles).not.toHaveBeenCalled()
	})

	it('401s with no session', async () => {
		await expect(call({ roles: ['HR_ADMIN'] }, null)).rejects.toMatchObject({ status: 401 })
		expect(setUserRoles).not.toHaveBeenCalled()
	})

	// MANAGE_USER_ROLES is CEO-exclusive (#132). SUPER_ADMIN is the interesting negative: it holds
	// nearly everything else, so a check that resolved authority any other way would let it through.
	it('403s an actor without MANAGE_USER_ROLES, before the service (#283/AC-8)', async () => {
		await expect(
			call({ roles: ['HR_ADMIN'] }, { ...CEO, id: 'user-sa', roles: ['SUPER_ADMIN'] })
		).rejects.toMatchObject({ status: 403 })
		expect(setUserRoles).not.toHaveBeenCalled()
	})
})

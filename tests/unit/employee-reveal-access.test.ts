import { describe, it, expect, vi, beforeEach } from 'vitest'
import { error } from '@sveltejs/kit'
import type { Role } from '@prisma/client'

/**
 * #290 / #228 — pins that ?/reveal is object-level scoped, and that the check runs BEFORE the
 * payload is fetched.
 *
 * `reveal` gates on `requireAnyCapability(roles, 'MANAGE_HR')`, which holds MANAGER, and
 * `revealEmployeeSensitive` scopes by organization alone — so on that pair alone any manager
 * could read any employee's salary, government IDs and bank details. What actually stops it is
 * `scopedToEmployee` (#228), the wrapper around `export const actions` that runs
 * `assertCanTouchEmployee(event.locals.user!, event.params.id)` for every action on this route.
 * A SvelteKit form action does not run `load`, so `load`'s own check at :100 protects nothing
 * here; the wrapper is the entire defence, and nothing had been pinning it.
 *
 * #290 widens this action's payload from "the current sensitive fields" to "those plus the
 * whole historical salary trail", which is why the wrapper gets a test now.
 */

const { employeeFindFirst, assertCanTouchEmployee, revealEmployeeSensitive, getEmploymentHistory } =
	vi.hoisted(() => ({
		employeeFindFirst: vi.fn(),
		assertCanTouchEmployee: vi.fn(),
		revealEmployeeSensitive: vi.fn(),
		getEmploymentHistory: vi.fn()
	}))

vi.mock('$lib/server/db', () => ({ db: { employee: { findFirst: employeeFindFirst } } }))
vi.mock('$lib/server/services/employee-access', () => ({ assertCanTouchEmployee }))
vi.mock('$lib/server/services/employees', () => ({
	revealEmployeeSensitive,
	getEmploymentHistory,
	// The route imports these at module scope; the reveal action touches none of them.
	getEmployee: vi.fn(),
	updateEmployee: vi.fn(),
	offboardEmployee: vi.fn(),
	recordCompensationChange: vi.fn(),
	promoteEmployee: vi.fn()
}))

const { actions } = await import('../../src/routes/(app)/employees/[id]/+page.server')

const ACTOR = 'user-actor'
const ORG = 'org-1'

const revealEvent = (roles: Role[], employeeId: string) =>
	({
		locals: { user: { id: ACTOR, organizationId: ORG, roles } },
		params: { id: employeeId },
		getClientAddress: () => '::1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

beforeEach(() => {
	vi.clearAllMocks()
	// #6 made the self lookup at the top of `reveal` a `findFirst` keyed by `userId`; there is
	// no other `employee.findFirst` call on this route, so a plain resolved value covers it.
	employeeFindFirst.mockResolvedValue({ id: 'emp-self' })
	assertCanTouchEmployee.mockResolvedValue(undefined)
	revealEmployeeSensitive.mockResolvedValue({ basicMonthlySalary: 25000 })
	getEmploymentHistory.mockResolvedValue([])
})

describe('?/reveal object-level access (#290 / #228)', () => {
	it('T8 — refuses a target the actor cannot touch, before fetching any payload', async () => {
		// `error()` throws rather than returns in SvelteKit 2, so it cannot be handed to
		// mockRejectedValue — throwing it from the implementation is what rejects the call.
		assertCanTouchEmployee.mockImplementation(() => {
			error(403, 'You can only manage your own team or a branch you manage.')
		})

		await expect(actions.reveal(revealEvent(['MANAGER'], 'emp-outsider'))).rejects.toMatchObject({
			status: 403
		})
		// The guard must run BEFORE the payload is fetched — a check placed inside the handler
		// after revealEmployeeSensitive would still throw, but would already have read the data
		// (and written the VIEW audit row for a read that was refused).
		expect(revealEmployeeSensitive).not.toHaveBeenCalled()
	})

	it('T9 — returns the unmasked history alongside the revealed fields', async () => {
		getEmploymentHistory.mockResolvedValue([{ id: 'log-1', changes: [] }])

		const result = await actions.reveal(revealEvent(['HR_ADMIN'], 'emp-1'))

		expect(result).toMatchObject({
			revealed: { basicMonthlySalary: 25000 },
			history: [{ id: 'log-1' }]
		})
		// Without the third argument the history comes back masked and the reveal silently
		// releases only half of what it claims to.
		expect(getEmploymentHistory).toHaveBeenCalledWith('emp-1', ORG, { unmask: true })
	})
})

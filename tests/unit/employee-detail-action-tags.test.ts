import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * P0-7 (partial) — `employees/[id]` has 21 form actions and exactly ONE error slot, at the top of
 * the Update Profile card. An ungated `{#if form?.error}` there painted a failed addLoan, a failed
 * document delete and a failed statutory toggle into a form the operator never submitted.
 *
 * The fix is the disambiguation pattern: every action names itself in its return, and the shared
 * block only renders for `update`. That makes the block CORRECT but not COMPLETE — an untagged
 * action would now report nowhere at all, which is why the first test below pins the full action
 * list: adding a 22nd action without a tag has to fail loudly here rather than go silently mute.
 *
 * The three representative actions drive their CHEAP failure path (a bad form body, no service
 * call) and assert `data.action` is the action's own name — a copy-pasted wrong string is the
 * exact defect this section can introduce.
 *
 * What this does NOT prove: that the 18 other tags are spelled the way the template reads them.
 * Only the browser probe covers that.
 */

const { assertCanTouchEmployeeMock } = vi.hoisted(() => ({
	assertCanTouchEmployeeMock: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('$lib/server/services/employee-access', () => ({
	assertCanTouchEmployee: assertCanTouchEmployeeMock,
	listVisibleEmployeeIds: vi.fn()
}))
vi.mock('$lib/server/db', () => ({ db: { employee: { findFirst: vi.fn(), findMany: vi.fn() } } }))

const { actions } = await import('../../src/routes/(app)/employees/[id]/+page.server')

/**
 * The full action surface, in source order. This list is the tripwire: a new action added to the
 * route without an `action:` tag on its returns lands here as a failure instead of as a form that
 * silently reports nothing.
 */
const EXPECTED_ACTIONS = [
	'setSupervisors',
	'update',
	'assignTemplate',
	'changeCompensation',
	'promote',
	'reveal',
	'offboard',
	'addLoan',
	'addCashAdvance',
	'addEarning',
	'endEarning',
	'addDeduction',
	'endDeduction',
	'toggleStatutoryExemption',
	'toggleEmployerShareExternal',
	'setStatutoryAllocation',
	'addEmergencyContact',
	'deleteEmergencyContact',
	'uploadDocument',
	'deleteDocument',
	'toggleOnboardingStep'
]

const ROLES: Role[] = ['HR_ADMIN']

const event = (fields: Record<string, string> = {}) => {
	const body = new FormData()
	for (const [k, v] of Object.entries(fields)) body.set(k, v)
	return {
		request: { formData: async () => body },
		params: { id: 'emp1' },
		locals: { user: { id: 'actor', organizationId: 'org1', roles: ROLES } },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

const call = (name: string, fields: Record<string, string> = {}) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(actions as any)[name](event(fields)) as Promise<any>

beforeEach(() => vi.clearAllMocks())

describe('employees/[id] action surface', () => {
	it('exposes exactly the 21 known actions', () => {
		expect(Object.keys(actions).sort()).toEqual([...EXPECTED_ACTIONS].sort())
	})
})

describe('employees/[id] returns name their own action', () => {
	it('update tags its validation failure with action: update', async () => {
		// jobTitle is `z.string().min(1).optional()`, so an empty one fails the schema and the
		// action returns before any service or db call.
		const res = await call('update', { jobTitle: '' })

		expect(res.status).toBe(400)
		expect(res.data.action).toBe('update')
	})

	it('addLoan tags its validation failure with action: addLoan, not update', async () => {
		const res = await call('addLoan', { amount: 'not-a-number' })

		expect(res.status).toBe(400)
		expect(res.data.action).toBe('addLoan')
		// The whole point of the section: this must not be attributable to the Update Profile form.
		expect(res.data.action).not.toBe('update')
	})

	it('deleteDocument tags its missing-id failure with action: deleteDocument', async () => {
		const res = await call('deleteDocument')

		expect(res.status).toBe(400)
		expect(res.data.action).toBe('deleteDocument')
	})
})

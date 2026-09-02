import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #6 — the four review actions when the actor has no employee row in the ACTIVE org.
 *
 * `myEmployeeId` used to return `''` for a missing profile and hand that empty string to four
 * write actions as an employee id. That was first read as a defeated guard; it is not — the
 * service layer rejects `''` with a 409 at every one of the four entry points. It was a bad error
 * message, and it is now `null` plus an explicit 400.
 *
 * What makes it worth pinning is #6 rather than the message: the self lookup is now org-scoped, so
 * `null` is reachable for a real multi-org actor who simply has no record in this tenant, where
 * before it only happened to accounts with no employee record anywhere.
 */

const { dbMock, services } = vi.hoisted(() => ({
	dbMock: { employee: { findFirst: vi.fn() } },
	services: {
		saveSelfAssessment: vi.fn(),
		saveEmployeeComments: vi.fn(),
		acknowledgeReview: vi.fn(),
		submitScores: vi.fn(),
		getReview: vi.fn(),
		redactForSubject: vi.fn(),
		attestSignoff: vi.fn(),
		releaseReview: vi.fn(),
		resolveSlotHolders: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/performance', () => services)
vi.mock('$lib/server/services/employee-access', () => ({ assertCanTouchEmployee: vi.fn() }))

const { actions } = await import('../../src/routes/(app)/performance/reviews/[id]/+page.server')

const ORG = 'org-active'
let selfRow: { id: string } | null = null

const event = (fields: Record<string, string> = {}) => {
	const body = new FormData()
	for (const [k, v] of Object.entries(fields)) body.set(k, v)
	return {
		request: { formData: async () => body },
		locals: { user: { id: 'user-1', roles: ['EMPLOYEE'], organizationId: ORG } },
		params: { id: 'review-1' },
		getClientAddress: () => '127.0.0.1'
	} as never
}

/** Each action, with a payload that clears every guard sitting BEFORE the profile check. */
const CASES = [
	{ name: 'saveSelf', fields: { selfAssessment: 'my write-up' } },
	{ name: 'submitScores', fields: { answers: '{}' } },
	{ name: 'saveEmployeeComments', fields: { employeeComments: 'my comments' } },
	{ name: 'acknowledge', fields: {} }
] as const

beforeEach(() => {
	vi.clearAllMocks()
	selfRow = null
	dbMock.employee.findFirst.mockImplementation(() => Promise.resolve(selfRow))
})

describe('review actions with no employee row in the active org (#6)', () => {
	it('scopes the self lookup to the active organization', async () => {
		await actions.acknowledge(event())
		expect(dbMock.employee.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { userId: 'user-1', organizationId: ORG } })
		)
	})

	it.each(CASES)('$name fails 400 rather than passing a falsy id on', async ({ name, fields }) => {
		const result = (await actions[name](event(fields))) as {
			status: number
			data: { error: string }
		}
		expect(result.status).toBe(400)
		// The message, not just the status: 409 and 422 also live on these paths, and a
		// status-only assertion passes when the wrong guard fires.
		expect(result.data.error).toBe('No employee profile found.')
	})

	it('reaches no service with an empty-string employee id', async () => {
		for (const { name, fields } of CASES) await actions[name](event(fields))
		for (const fn of [
			services.saveSelfAssessment,
			services.saveEmployeeComments,
			services.acknowledgeReview,
			services.submitScores
		]) {
			expect(fn).not.toHaveBeenCalled()
		}
	})

	// The positive control. Without it, an action hard-coded to fail(400) passes every row above.
	it('lets the same actor through once the row IS in the active org', async () => {
		selfRow = { id: 'emp-self' }
		services.acknowledgeReview.mockResolvedValue(undefined)
		const result = (await actions.acknowledge(event())) as { success?: boolean }
		expect(result.success).toBe(true)
		expect(services.acknowledgeReview).toHaveBeenCalledWith(
			'review-1',
			'emp-self',
			expect.anything()
		)
	})
})

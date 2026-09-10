import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * P0-5 — approving or rejecting a request, and reviewing a timesheet, both succeeded silently.
 * Each action ran its service and then returned `undefined`, so the page's existing
 * `{#if form?.saved}` banner was live but never populated: a successful decision looked exactly
 * like a click that did nothing.
 *
 * These tests pin the SHAPE of the success payload only — that each action returns a non-empty
 * `saved` string, and that the three request decisions produce three DIFFERENT strings (a single
 * generic "Done." would pass a weaker assertion while leaving the operator unable to tell an
 * approve from a reject). They do NOT prove the page renders it; that is the browser probe.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: { employee: { findFirst: vi.fn() } }
}))
const { decideMock } = vi.hoisted(() => ({ decideMock: vi.fn() }))
const { reviewTimesheetMock } = vi.hoisted(() => ({ reviewTimesheetMock: vi.fn() }))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/approvals', () => ({
	decide: decideMock,
	listPendingRequestsForApprover: vi.fn(),
	canActOnStage: vi.fn(),
	liveChain: vi.fn(),
	timesheetSoD: vi.fn()
}))
vi.mock('$lib/server/services/timesheets', () => ({
	reviewTimesheet: reviewTimesheetMock,
	listTimesheetsForReview: vi.fn()
}))

const approvals = await import('../../src/routes/(app)/requests/approvals/+page.server')
const timesheets = await import('../../src/routes/(app)/requests/timesheets/+page.server')

const APPROVER_ROLES: Role[] = ['HR_ADMIN']

const event = (fields: Record<string, string>, roles: Role[] = APPROVER_ROLES) => {
	const body = new FormData()
	for (const [k, v] of Object.entries(fields)) body.set(k, v)
	return {
		request: { formData: async () => body },
		locals: { user: { id: 'actor', organizationId: 'org1', roles } },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

// `?/review` reads the event object itself, so the same shape serves both routes.
const decideRequest = (decision: string, note = 'because') =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	approvals.actions.decideRequest(event({ id: 'req1', decision, note })) as Promise<any>

const review = (approved: boolean) =>
	timesheets.actions.review(
		event({ id: 'ts1', approved: String(approved), rejectionReason: 'incomplete' })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	) as Promise<any>

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue({ id: 'emp-self' })
	decideMock.mockResolvedValue(undefined)
	reviewTimesheetMock.mockResolvedValue(undefined)
})

describe('requests/approvals ?/decideRequest success feedback', () => {
	it('returns a non-empty saved string for each of the three decisions', async () => {
		for (const decision of ['APPROVED', 'REJECTED', 'RETURNED']) {
			const res = await decideRequest(decision)
			expect(res?.saved, `${decision} returned no saved string`).toBeTruthy()
			expect(typeof res.saved).toBe('string')
			expect(res.saved.trim().length).toBeGreaterThan(0)
		}
	})

	it('names the decision — approve, reject and return read differently', async () => {
		const approved = (await decideRequest('APPROVED')).saved
		const rejected = (await decideRequest('REJECTED')).saved
		const returned = (await decideRequest('RETURNED')).saved

		expect(new Set([approved, rejected, returned]).size).toBe(3)
	})

	it('rethrows an unexpected service error rather than printing its raw text', async () => {
		// The raw-message fallback was removed in phase 04: an untyped throw is a bug, not a
		// message, so it goes to handleError and comes back as a reference the user can quote.
		decideMock.mockRejectedValueOnce(new Error('not at your stage'))
		await expect(decideRequest('APPROVED')).rejects.toThrow('not at your stage')
	})
})

describe('requests/timesheets ?/review success feedback', () => {
	it('returns a distinct non-empty saved string for approve and reject', async () => {
		const approved = await review(true)
		const rejected = await review(false)

		expect(approved?.saved).toBeTruthy()
		expect(rejected?.saved).toBeTruthy()
		expect(approved.saved).not.toBe(rejected.saved)
	})

	it('rethrows an unexpected service error rather than printing its raw text', async () => {
		reviewTimesheetMock.mockRejectedValueOnce(new Error('already reviewed'))
		await expect(review(true)).rejects.toThrow('already reviewed')
	})
})

describe('requests/timesheets bulk feedback payloads', () => {
	/**
	 * `?/approveMany` and `?/rejectMany` had no test at any layer. Phase 04 puts both on
	 * `submitFeedback`, which reads the action's own `saved` / `error` string, so these pin the
	 * payload SHAPE the toast depends on: five paths, five non-empty strings, the two successes
	 * distinct. They do NOT prove the string reaches the screen — that is the e2e and the probe.
	 * The `skipped` counter's semantics are now ruled: a batch where nothing succeeded returns
	 * `fail(400, { error })`, and any batch with at least one success keeps the green `saved`
	 * string, skipped count and all.
	 */
	const bulk = (
		action: 'approveMany' | 'rejectMany',
		fields: Record<string, string>,
		roles?: Role[]
	) =>
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		timesheets.actions[action](event(fields, roles)) as Promise<any>

	it('returns a distinct non-empty saved string for approve and reject', async () => {
		const approved = await bulk('approveMany', { ids: 'a,b' })
		const rejected = await bulk('rejectMany', { ids: 'a,b', rejectionReason: 'fix it' })

		expect(typeof approved?.saved).toBe('string')
		expect(approved.saved.trim().length).toBeGreaterThan(0)
		expect(typeof rejected?.saved).toBe('string')
		expect(rejected.saved.trim().length).toBeGreaterThan(0)
		expect(approved.saved).not.toBe(rejected.saved)
	})

	it('returns a non-empty error string on each of the three refusal paths', async () => {
		const noIds = await bulk('approveMany', { ids: '' })
		const noReason = await bulk('rejectMany', { ids: 'a', rejectionReason: '  ' })
		const forbidden = await bulk('approveMany', { ids: 'a' }, ['EMPLOYEE'])

		expect(noIds?.data?.error).toBe('No timesheets selected')
		expect(noReason?.data?.error).toBe('A reason is required to reject.')
		expect(forbidden?.data?.error).toBe('Insufficient permissions')
		expect(forbidden?.status).toBe(403)
	})

	it('returns fail(400) when every row of an approve batch failed', async () => {
		reviewTimesheetMock.mockRejectedValue(new Error('x'))
		const res = await bulk('approveMany', { ids: 'a,b,c' })

		expect(res?.status).toBe(400)
		expect(typeof res?.data?.error).toBe('string')
		expect(res.data.error.trim().length).toBeGreaterThan(0)
	})

	it('keeps the green saved string with its skipped count on a partial approve batch', async () => {
		reviewTimesheetMock.mockRejectedValueOnce(new Error('x'))
		const res = await bulk('approveMany', { ids: 'a,b,c' })

		expect(res?.status).toBeUndefined()
		expect(res?.saved).toMatch(/, 1 skipped\.$/)
	})

	it('returns fail(400) when every row of a reject batch failed', async () => {
		reviewTimesheetMock.mockRejectedValue(new Error('x'))
		const res = await bulk('rejectMany', { ids: 'a,b,c', rejectionReason: 'fix it' })

		expect(res?.status).toBe(400)
		expect(typeof res?.data?.error).toBe('string')
		expect(res.data.error.trim().length).toBeGreaterThan(0)
	})

	it('keeps the green saved string with its skipped count on a partial reject batch', async () => {
		reviewTimesheetMock.mockRejectedValueOnce(new Error('x'))
		const res = await bulk('rejectMany', { ids: 'a,b,c', rejectionReason: 'fix it' })

		expect(res?.status).toBeUndefined()
		expect(res?.saved).toMatch(/, 1 skipped\.$/)
	})
})

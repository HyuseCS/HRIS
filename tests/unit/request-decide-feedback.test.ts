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

	it('still reports the failure contract when the service throws', async () => {
		decideMock.mockRejectedValueOnce(new Error('not at your stage'))
		const res = await decideRequest('APPROVED')

		expect(res.status).toBe(400)
		expect(res.data.error).toBe('not at your stage')
		expect(res.data.saved).toBeUndefined()
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

	it('still reports the failure contract when the service throws', async () => {
		reviewTimesheetMock.mockRejectedValueOnce(new Error('already reviewed'))
		const res = await review(true)

		expect(res.status).toBe(400)
		expect(res.data.error).toBe('already reviewed')
		expect(res.data.saved).toBeUndefined()
	})
})

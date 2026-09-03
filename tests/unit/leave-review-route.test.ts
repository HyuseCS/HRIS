import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * `PATCH /api/v1/leave/[id]` — the route's own gate, with the service mocked out.
 *
 * Only the two actions the route accepts. The third, `override-approve`, was deleted in #295:
 * it collapsed into the same `approved` boolean and took the identical path through
 * `reviewLeaveRequest` → `decide`, so it overrode nothing — it was a stricter 403 in front of
 * the ordinary approve. #282 tightened that gate on the written premise that it "bypasses the
 * approval chain outright"; the code never did.
 *
 * Who may act on a given *stage* is `decide`'s question, not this route's — that is covered
 * against the real chain in `approval-api-role-context.test.ts`.
 */

const { reviewLeaveRequest } = vi.hoisted(() => ({ reviewLeaveRequest: vi.fn() }))
vi.mock('$lib/server/services/leave', () => ({ reviewLeaveRequest }))

const { PATCH } = await import('../../src/routes/api/v1/leave/[id]/+server')

const event = (roles: Role[], body: Record<string, unknown>) =>
	({
		locals: { user: { id: 'user-actor', organizationId: 'org1', roles } },
		params: { id: 'req1' },
		request: { json: async () => body },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

beforeEach(() => {
	vi.clearAllMocks()
	reviewLeaveRequest.mockResolvedValue({ id: 'req1', status: 'APPROVED' })
})

describe('PATCH /api/v1/leave/[id] — route gate', () => {
	it('403s a role without VIEW_TEAM, and decides nothing', async () => {
		const res = await PATCH(event(['EMPLOYEE'], { action: 'approve' }))
		expect(res.status).toBe(403)
		expect(reviewLeaveRequest).not.toHaveBeenCalled()
	})

	// The decision arguments, not just the status: a flipped `approved` boolean still answers 200.
	it('admits a MANAGER to approve and reject', async () => {
		expect((await PATCH(event(['MANAGER'], { action: 'approve' }))).status).toBe(200)
		expect(reviewLeaveRequest).toHaveBeenLastCalledWith(
			'req1',
			'org1',
			true,
			undefined,
			expect.anything()
		)

		const rejected = await PATCH(event(['MANAGER'], { action: 'reject', rejectionReason: 'no' }))
		expect(rejected.status).toBe(200)
		expect(reviewLeaveRequest).toHaveBeenLastCalledWith(
			'req1',
			'org1',
			false,
			'no',
			expect.anything()
		)
	})

	// #295: the action is gone, not silently aliased to `approve`.
	it('400s on override-approve', async () => {
		const res = await PATCH(event(['HR_ADMIN'], { action: 'override-approve' }))
		expect(res.status).toBe(400)
		expect(reviewLeaveRequest).not.toHaveBeenCalled()
	})
})

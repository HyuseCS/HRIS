import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #177 — the Discord punch endpoint carries NO location, and that is asserted on the ROUTE, not
 * on the service.
 *
 * Why this file exists: `punch-location-capture` C2 proves that `recordPunch` writes no location
 * columns when its caller passes none. It does NOT prove the Discord route is such a caller —
 * adding `location: {…}` to `POST /api/v1/timesheets/log` leaves the entire unit suite green,
 * because nothing else looks at what that route passes. This is the missing half of the twin
 * door: the service half is C2, the route half is here.
 *
 * `verifyHmac` is stubbed valid on purpose — the signature path is `tests/unit/hmac.test.ts`'s
 * job. What is under test here is the ARGUMENTS the route builds once a request is admitted.
 */

const { recordPunch, verifyHmac } = vi.hoisted(() => ({
	recordPunch: vi.fn(),
	verifyHmac: vi.fn().mockReturnValue({ valid: true })
}))

vi.mock('$lib/server/services/timelog', () => ({ recordPunch }))
vi.mock('$lib/server/hmac', () => ({ verifyHmac }))
vi.mock('$env/dynamic/private', () => ({ env: { TIMELOG_API_SECRET: 'test-secret' } }))

const { POST } = await import('../../src/routes/api/v1/timesheets/log/+server')

const AT = '2026-08-17T01:00:00.000Z'

const event = (body: Record<string, unknown>) =>
	({
		request: {
			text: async () => JSON.stringify(body),
			headers: { get: () => 'stub' }
		},
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

beforeEach(() => {
	vi.clearAllMocks()
	verifyHmac.mockReturnValue({ valid: true })
	recordPunch.mockResolvedValue({
		timeLog: { id: 'tl1', timestamp: new Date(AT) },
		employee: { id: 'e1', firstName: 'Benjie', lastName: 'Fryer' },
		punchType: 'IN',
		previousType: null
	})
})

describe('the Discord endpoint never sends a location', () => {
	it('passes no `location` key at all, and resolves by discordId', async () => {
		await POST(event({ discordId: 'd1', punchType: 'IN', timestamp: AT }))

		expect(recordPunch).toHaveBeenCalledTimes(1)
		const input = recordPunch.mock.calls[0][0]
		expect(input).not.toHaveProperty('location')
		expect(input.discordId).toBe('d1')
		expect(input.source).toBe('DISCORD')
		// Its idempotency key is still the Discord message id — the web punch's `dedupKey` is a
		// separate seam and this route must not have grown one.
		expect(input).not.toHaveProperty('dedupKey')
		expect(input).not.toHaveProperty('employeeId')
	})

	it('sends exactly the five fields it has always sent', async () => {
		await POST(event({ discordId: 'd1', punchType: 'OUT', timestamp: AT, messageId: 'm1' }))
		expect(Object.keys(recordPunch.mock.calls[0][0]).sort()).toEqual([
			'discordId',
			'discordMessageId',
			'punchType',
			'source',
			'timestamp'
		])
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `requestListWhere` builds one `employeeId` constraint from two optional params. They used to be
 * two spreads onto the same key, so a caller supplying both had its single-id filter silently
 * replaced by the allow-list — widening, the fail-open direction (#275).
 *
 * No caller passes both today. This pins the direction so the next one to try cannot open a hole.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: { request: { count: vi.fn(), findMany: vi.fn() } }
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { countRequests } = await import('../../src/lib/server/services/requests')

const ORG = 'org1'
/** The where-clause the service actually built. */
const where = () => dbMock.request.count.mock.calls[0][0].where

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.request.count.mockResolvedValue(0)
})

describe('requestListWhere', () => {
	it('applies a single employeeId on its own', async () => {
		await countRequests({ organizationId: ORG, employeeId: 'e1' })
		expect(where().employeeId).toEqual({ equals: 'e1' })
	})

	it('applies an allow-list on its own', async () => {
		await countRequests({ organizationId: ORG, employeeIds: ['e1', 'e2'] })
		expect(where().employeeId).toEqual({ in: ['e1', 'e2'] })
	})

	// The regression guard: both constraints must survive, so the narrower one still binds.
	it('combines both instead of letting the allow-list overwrite the single id', async () => {
		await countRequests({ organizationId: ORG, employeeId: 'e1', employeeIds: ['e1', 'e2'] })
		expect(where().employeeId).toEqual({ equals: 'e1', in: ['e1', 'e2'] })
	})

	it('applies no employee filter when neither is given', async () => {
		await countRequests({ organizationId: ORG })
		expect(where().employeeId).toBeUndefined()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

/**
 * #177 — `recordPunch` is now the single writer for BOTH punch surfaces: the HMAC Discord
 * endpoint (resolves by `discordId`) and the session-authenticated /punch page (resolves by
 * `employeeId`). These specs pin the two things that widening it could quietly break:
 *
 *  1. a WEB punch persists its location, and
 *  2. a DISCORD punch is byte-identical to what it was before — including carrying NO location
 *     keys at all, rather than four explicit nulls.
 *
 * The `employee.findUnique` mock branches on the `where` SHAPE, never on call order. A flat
 * `mockResolvedValue` would return the same employee for `{ id }` and `{ discordId }` alike, so
 * C4 — the whole point of which is that the two resolutions are different queries — could not
 * fail. See `tests/unit/punch-access.test.ts` for the same where-shape discipline.
 */

const { dbMock, writeAuditLog } = vi.hoisted(() => ({
	writeAuditLog: vi.fn(),
	dbMock: {
		employee: { findUnique: vi.fn() },
		timeLog: { findFirst: vi.fn() },
		$transaction: vi.fn()
	}
}))

// #324: the punch insert and its audit row now share a transaction, so the create lands on the
// transaction client. `dbMock.timeLog` deliberately carries NO `create` — a revert to the
// untransacted `db.timeLog.create` fails here rather than passing on a stale mock. The dedup
// pre-check read stays on `dbMock`, outside the transaction, where the service still does it.
const tx = { timeLog: { create: vi.fn() } }

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { recordPunch } = await import('../../src/lib/server/services/timelog')

const EMP_ID = 'emp-benjie'
const DISCORD_ID = 'discord-benjie'

const EMPLOYEE = {
	id: EMP_ID,
	organizationId: 'org_jojo',
	firstName: 'Benjie',
	lastName: 'Fryer',
	employmentStatus: 'ACTIVE',
	user: { id: 'user-benjie', roles: ['EMPLOYEE'], isActive: true }
}

const AT = new Date('2026-08-17T01:00:00.000Z')

beforeEach(() => {
	vi.clearAllMocks()
	// Resolve ONLY for the right key — a lookup by the wrong field finds nobody.
	dbMock.employee.findUnique.mockImplementation(({ where }) =>
		Promise.resolve(where.id === EMP_ID || where.discordId === DISCORD_ID ? EMPLOYEE : null)
	)
	dbMock.timeLog.findFirst.mockResolvedValue(null)
	tx.timeLog.create.mockResolvedValue({ id: 'tl1', timestamp: AT })
	// Mirrors Prisma's interactive transaction: the callback's rejection propagates out unchanged,
	// which is what keeps the P2002 -> 409 mapping in C6 working from outside the transaction.
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

/** The `data` object the last `timeLog.create` was called with. */
const createdData = () => tx.timeLog.create.mock.calls.at(-1)![0].data

describe('C1 — a WEB punch persists its location', () => {
	it('writes source, coordinates, accuracy and a capture timestamp', async () => {
		const before = Date.now()
		await recordPunch({
			employeeId: EMP_ID,
			punchType: 'IN',
			timestamp: AT,
			source: 'WEB',
			location: { latitude: 8.4772, longitude: 124.6459, accuracyM: 12 }
		})

		const data = createdData()
		expect(data.source).toBe('WEB')
		expect(data.latitude).toBe(8.4772)
		expect(data.longitude).toBe(124.6459)
		expect(data.locationAccuracyM).toBe(12)
		expect(data.locationCapturedAt).toBeInstanceOf(Date)
		expect(data.locationCapturedAt.getTime()).toBeGreaterThanOrEqual(before)
	})

	it('keeps the COORDINATES out of the audit row, recording only that one exists (#242)', async () => {
		await recordPunch({
			employeeId: EMP_ID,
			punchType: 'IN',
			timestamp: AT,
			source: 'WEB',
			location: { latitude: 8.4772, longitude: 124.6459, accuracyM: 12 }
		})

		const newValue = writeAuditLog.mock.calls.at(-1)![1].newValue
		expect(newValue.hasLocation).toBe(true)
		// The audit log has a different read gate than the punches API. Assert the ABSENCE of
		// every coordinate key, not just latitude — a partial leak is still a leak.
		expect(newValue).not.toHaveProperty('latitude')
		expect(newValue).not.toHaveProperty('longitude')
		expect(newValue).not.toHaveProperty('locationAccuracyM')
		expect(JSON.stringify(newValue)).not.toContain('124.64')
		// #324: the audit write shares the transaction that inserted the punch.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('records an accuracy-less reading as null rather than dropping the reading', async () => {
		await recordPunch({
			employeeId: EMP_ID,
			punchType: 'IN',
			timestamp: AT,
			source: 'WEB',
			location: { latitude: 8.4772, longitude: 124.6459 }
		})
		const data = createdData()
		expect(data.latitude).toBe(8.4772)
		expect(data.locationAccuracyM).toBeNull()
	})
})

describe('C2 — a Discord punch carries no location at all', () => {
	it('writes NO location keys and leaves the audit payload unchanged', async () => {
		await recordPunch({
			discordId: DISCORD_ID,
			punchType: 'IN',
			timestamp: AT,
			source: 'DISCORD'
		})

		const data = createdData()
		expect(data.source).toBe('DISCORD')
		// Absent, not null: an explicit `latitude: null` in the payload would mean this write is
		// the thing asserting the punch has no location, which is a behaviour change in a flow
		// whose route file has a zero-line diff.
		expect(data).not.toHaveProperty('latitude')
		expect(data).not.toHaveProperty('longitude')
		expect(data).not.toHaveProperty('locationAccuracyM')
		expect(data).not.toHaveProperty('locationCapturedAt')

		// The Discord audit row must be exactly the two keys it has always carried — P6.
		const newValue = writeAuditLog.mock.calls.at(-1)![1].newValue
		expect(Object.keys(newValue).sort()).toEqual(['punchType', 'timestamp'])
	})
})

describe('C3 — location: null is a supported punch, not an error', () => {
	it('records the punch with no location keys and does not throw', async () => {
		await expect(
			recordPunch({
				employeeId: EMP_ID,
				punchType: 'OUT',
				timestamp: AT,
				source: 'WEB',
				location: null
			})
		).resolves.toBeTruthy()

		const data = createdData()
		expect(data.source).toBe('WEB')
		expect(data).not.toHaveProperty('latitude')
		expect(writeAuditLog.mock.calls.at(-1)![1].newValue).not.toHaveProperty('hasLocation')
	})
})

describe('C4 — employee resolution branches on which key was given', () => {
	it('resolves by { id } for a web punch', async () => {
		await recordPunch({ employeeId: EMP_ID, punchType: 'IN', timestamp: AT, source: 'WEB' })
		expect(dbMock.employee.findUnique.mock.calls[0][0].where).toEqual({ id: EMP_ID })
	})

	it('resolves by { discordId } for a Discord punch', async () => {
		await recordPunch({ discordId: DISCORD_ID, punchType: 'IN', timestamp: AT })
		expect(dbMock.employee.findUnique.mock.calls[0][0].where).toEqual({ discordId: DISCORD_ID })
	})

	it('404s when the id belongs to nobody — the mock does not resolve on the wrong key', async () => {
		await expect(
			recordPunch({ employeeId: 'not-an-employee', punchType: 'IN', timestamp: AT })
		).rejects.toMatchObject({ status: 404 })
		expect(tx.timeLog.create).not.toHaveBeenCalled()
	})
})

describe('C5 — dedupKey debounces a repeated web punch', () => {
	it('409s on the second identical key and writes exactly one row', async () => {
		const key = `web:${EMP_ID}:IN:2026-08-17T01:00`
		const args = {
			employeeId: EMP_ID,
			punchType: 'IN' as const,
			timestamp: AT,
			source: 'WEB' as const,
			dedupKey: key
		}

		// The pre-check reads by (employeeId, dedupKey) — key the mock on that shape, so a check
		// that queried the wrong field would find nothing and this spec would fail.
		const written: string[] = []
		dbMock.timeLog.findFirst.mockImplementation(({ where }) =>
			Promise.resolve(written.includes(where.dedupKey) ? { id: 'tl1' } : null)
		)
		tx.timeLog.create.mockImplementation(({ data }) => {
			written.push(data.dedupKey)
			return Promise.resolve({ id: 'tl1', timestamp: AT })
		})

		await recordPunch(args)
		await expect(recordPunch(args)).rejects.toMatchObject({ status: 409 })
		expect(tx.timeLog.create).toHaveBeenCalledTimes(1)
	})

	it('checks the dedupKey against the punching employee, not globally', async () => {
		await recordPunch({
			employeeId: EMP_ID,
			punchType: 'IN',
			timestamp: AT,
			source: 'WEB',
			dedupKey: 'web:k'
		})
		// `recordPunch` calls findFirst TWICE — first for the previous punch (to report the new
		// state back), then for the dedup pre-check. Assert the dedup query by its shape rather
		// than by call index, so a reordering does not silently assert the wrong query.
		expect(dbMock.timeLog.findFirst).toHaveBeenCalledWith({
			where: { employeeId: EMP_ID, dedupKey: 'web:k' },
			select: { id: true }
		})
	})
})

describe('C6 — a P2002 race is a 409, never a 500', () => {
	// #324: the create moved inside a transaction and the try/catch stayed outside it. Prisma
	// rethrows the original error object after rolling back, so the P2002 test still matches —
	// this is the test that proves a duplicate punch is still a 409 and not a 500.
	it('maps the unique violation the pre-check raced past', async () => {
		tx.timeLog.create.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' })
		)
		await expect(
			recordPunch({
				employeeId: EMP_ID,
				punchType: 'IN',
				timestamp: AT,
				source: 'WEB',
				dedupKey: 'web:k'
			})
		).rejects.toMatchObject({ status: 409 })
	})
})

describe('P5 — exactly one of discordId / employeeId', () => {
	it('refuses with a clean 400 when NEITHER is given, without reaching Prisma', async () => {
		// Without this guard the call reaches `findUnique({ where: { discordId: undefined } })`,
		// which Prisma rejects as a validation error — a 500 the caller cannot act on.
		await expect(recordPunch({ punchType: 'IN', timestamp: AT })).rejects.toMatchObject({
			status: 400
		})
		expect(dbMock.employee.findUnique).not.toHaveBeenCalled()
	})

	it('refuses with a 400 when BOTH are given rather than silently picking one', async () => {
		await expect(
			recordPunch({ discordId: DISCORD_ID, employeeId: EMP_ID, punchType: 'IN', timestamp: AT })
		).rejects.toMatchObject({ status: 400 })
		expect(dbMock.employee.findUnique).not.toHaveBeenCalled()
	})
})

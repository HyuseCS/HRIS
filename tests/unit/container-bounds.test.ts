import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * UI/UX overhaul phase 10 (`container-bounds`) — the service-cap gates.
 *
 * WHY THIS FILE HAS ITS OWN MOCK. `tests/unit/dashboard-org-scoping.test.ts:110-130` mocks
 * `findMany` as `({ where }) => FIXTURES.filter(...)` — it applies the `where` clause and
 * destructures `orderBy` and `take` away without reading them. Every cap assertion written on
 * that harness would pass whether or not the service capped anything, which is exactly the
 * vacuous-green shape these gates exist to prevent. The client below applies
 * where → orderBy → take → project, in that order, so a service that forgets its `orderBy`
 * returns the wrong rows and the test goes red.
 *
 * WHAT THESE GATES DO NOT PROVE. They run against a mock, not Postgres. They prove the
 * service's own logic given a client that honours where/orderBy/take. They do NOT prove that
 * Postgres returns rows in that order, that an index exists, or that a `take` is pushed into
 * SQL. Fixtures are declared deliberately OUT of their expected output order throughout.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn() },
		publicHoliday: { findMany: vi.fn() },
		payrollPeriod: { findMany: vi.fn() },
		request: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { listUpcomingEvents } = await import('../../src/lib/server/services/dashboard')

const ORG = 'org1'

// ── the where → orderBy → take → project client ──────────────────────────────

type Row = Record<string, unknown>
type Args = {
	where?: Row
	orderBy?: Record<string, 'asc' | 'desc'>
	take?: number
	select?: Row
}

const matches = (row: Row, where: Row): boolean =>
	Object.entries(where).every(([key, cond]) => {
		if (cond && typeof cond === 'object') {
			const c = cond as Record<string, unknown>
			if ('in' in c) return (c.in as unknown[]).includes(row[key])
			const value = row[key]
			if (value instanceof Date) {
				if ('gte' in c && value < (c.gte as Date)) return false
				if ('lte' in c && value > (c.lte as Date)) return false
				return true
			}
			return true
		}
		return row[key] === cond
	})

const project = (row: Row, select?: Row): Row => {
	if (!select) return { ...row }
	const out: Row = {}
	for (const [key, spec] of Object.entries(select)) {
		if (spec === true) out[key] = row[key]
		else if (spec && typeof spec === 'object') out[key] = project(row[key] as Row, spec as Row)
	}
	return out
}

/** Order matters: filter, then sort, then cut, then narrow — the order Postgres applies them. */
const query = (rows: Row[], args: Args = {}) => {
	let out = args.where ? rows.filter((r) => matches(r, args.where!)) : [...rows]
	if (args.orderBy) {
		const [[key, direction]] = Object.entries(args.orderBy)
		out = [...out].sort((a, b) => {
			const av = a[key] as never
			const bv = b[key] as never
			const cmp = av < bv ? -1 : av > bv ? 1 : 0
			return direction === 'desc' ? -cmp : cmp
		})
	}
	if (typeof args.take === 'number') out = out.slice(0, args.take)
	return out.map((r) => project(r, args.select))
}

// ── G2 — listUpcomingEvents caps the MERGED output, not any single query ─────

const ASOF = new Date('2026-06-01T00:00:00.000Z')
const VIEWER = { userId: 'u1', canSeeSensitive: true }

/**
 * Twelve employees with birthdays on 2 – 13 June, declared in REVERSE date order: the two
 * earliest birthdays belong to the two employees declared LAST. Their `startDate` is in January
 * so no service anniversary lands in the window, and they are REGULAR so no regularization or
 * contract-end event fires — birthdays only, one per person.
 */
const EVENT_EMPLOYEES = Array.from({ length: 12 }, (_, i) => {
	const day = 13 - i
	return {
		id: `e${day}`,
		organizationId: ORG,
		employmentStatus: 'ACTIVE',
		employmentType: 'REGULAR',
		firstName: 'Birthday',
		lastName: String(day).padStart(2, '0'),
		dateOfBirth: new Date(`1990-06-${String(day).padStart(2, '0')}T00:00:00.000Z`),
		startDate: new Date('2020-01-15T00:00:00.000Z'),
		endDate: null
	}
})

/** Twelve holidays, all AFTER every birthday, so a correct merge puts them out of the top ten. */
const HOLIDAYS = Array.from({ length: 12 }, (_, i) => ({
	organizationId: ORG,
	date: new Date('2026-06-14T00:00:00.000Z'),
	name: `Holiday ${String(i).padStart(2, '0')}`,
	type: 'SPECIAL'
}))

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue(null)
	dbMock.employee.findMany.mockImplementation(async (args: Args) => query(EVENT_EMPLOYEES, args))
	dbMock.publicHoliday.findMany.mockImplementation(async (args: Args) => query(HOLIDAYS, args))
	dbMock.payrollPeriod.findMany.mockResolvedValue([])
	dbMock.request.findMany.mockResolvedValue([])
})

describe('listUpcomingEvents caps the merged sorted output (G2)', () => {
	it('returns every kind when uncapped', async () => {
		const events = await listUpcomingEvents(ORG, VIEWER, ASOF)

		expect(events).toHaveLength(24)
		expect(events.some((e) => e.kind === 'birthday')).toBe(true)
		expect(events.some((e) => e.kind === 'holiday')).toBe(true)
	})

	/**
	 * The identity assertion, not a count. A cap pushed down onto the roster `findMany` would
	 * still return ten events — the holidays would simply fill the space the dropped people left —
	 * so counting proves nothing. These two rows exist only if the whole roster was read and the
	 * cut happened after the merge.
	 */
	it('keeps the earliest rows even though their people are declared last', async () => {
		const events = await listUpcomingEvents(ORG, VIEWER, ASOF, 10)

		expect(events).toHaveLength(10)
		expect(events.map((e) => e.date)).toEqual([
			'2026-06-02',
			'2026-06-03',
			'2026-06-04',
			'2026-06-05',
			'2026-06-06',
			'2026-06-07',
			'2026-06-08',
			'2026-06-09',
			'2026-06-10',
			'2026-06-11'
		])
	})
})

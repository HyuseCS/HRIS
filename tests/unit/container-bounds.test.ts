import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn() },
		publicHoliday: { findMany: vi.fn() },
		payrollPeriod: { findMany: vi.fn() },
		request: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { listUpcomingEvents, listUpcomingRegularizations } =
	await import('../../src/lib/server/services/dashboard')

const ORG = 'org1'

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
		else if (spec && typeof spec === 'object') {
			const nested = (spec as Row).select ?? spec
			out[key] = project(row[key] as Row, nested as Row)
		}
	}
	return out
}

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

const ASOF = new Date('2026-06-01T00:00:00.000Z')
const VIEWER = { userId: 'u1', canSeeSensitive: true }

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

const probationary = (id: string, startDate: string) => ({
	id,
	organizationId: ORG,
	employmentType: 'PROBATIONARY',
	employmentStatus: 'ACTIVE',
	firstName: 'Prob',
	lastName: id,
	jobTitle: 'Crew',
	startDate: new Date(`${startDate}T00:00:00.000Z`),
	department: { name: 'Ops' }
})

const REG_EMPLOYEES = Array.from({ length: 25 }, (_, i) =>
	probationary(`p${String(25 - i).padStart(2, '0')}`, `2025-09-${String(25 - i).padStart(2, '0')}`)
)
const REG_ASOF = new Date('2026-03-05T00:00:00.000Z')

const useRegularizationFixtures = (rows: ReturnType<typeof probationary>[]) => {
	dbMock.employee.findMany.mockImplementation(async (args: Args) => query(rows, args))
}

describe('regularizations come back in days-until order (G3)', () => {
	it('returns the full list lowest daysUntil first though declared in reverse', async () => {
		useRegularizationFixtures(REG_EMPLOYEES)

		const rows = await listUpcomingRegularizations(ORG, REG_ASOF)

		expect(rows.map((r) => r.id)).toEqual(
			Array.from({ length: 25 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)
		)
		expect(rows.slice(0, 10).map((r) => r.daysUntil)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4, 5])
	})
})

describe('the month-end straddle is ordered by days-until, not start date (G3b)', () => {
	const STRADDLE = [
		probationary('aug30', '2025-08-30'),
		probationary('aug31', '2025-08-31'),
		probationary('sep01', '2025-09-01')
	]
	const STRADDLE_ASOF = new Date('2026-02-20T00:00:00.000Z')

	it('puts the 2025-09-01 start first, above 2025-08-30 and 2025-08-31', async () => {
		useRegularizationFixtures(STRADDLE)

		const rows = await listUpcomingRegularizations(ORG, STRADDLE_ASOF)

		expect(rows.map((r) => [r.id, r.regularizationDate.toISOString().slice(0, 10)])).toEqual([
			['sep01', '2026-03-01'],
			['aug30', '2026-03-02'],
			['aug31', '2026-03-03']
		])
	})
})

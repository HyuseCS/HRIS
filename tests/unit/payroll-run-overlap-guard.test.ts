import { describe, it, expect, vi, beforeEach } from 'vitest'
import { periodOf } from '../../src/lib/utils/pay-periods'

/**
 * #163 — the payroll-run overlap guard. Two runs covering the same day would pay the same days
 * twice, so an intersecting range is a 409.
 *
 * The guard fires ONLY when at least one side is a custom range: a WHOLE_MONTH adjustment run
 * alongside the two halves is a documented, supported workflow and must keep working.
 *
 * `payrollRun.findMany` is mocked with a real predicate over an in-memory row set, applying the
 * exact `where` the guard builds — including the one-day widening the Manila-calendar comparison
 * needs. That is what makes the adjacency, VOIDED and PHT-boundary cases meaningful; a mock that
 * returned a canned array would prove nothing about the query.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: { payrollRun: { findMany: vi.fn() } }
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { assertNoOverlappingRun } = await import('$lib/server/services/payroll/index')

const ORG = 'org1'
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

type Row = {
	id: string
	organizationId: string
	status: string
	periodStart: Date
	periodEnd: Date
}
type Where = {
	organizationId: string
	status: { not: string }
	periodStart: { lt: Date }
	periodEnd: { gte: Date }
}

let rows: Row[] = []

const row = (id: string, start: string, end: string, status = 'COMPUTED'): Row => ({
	id,
	organizationId: ORG,
	status,
	periodStart: d(start),
	periodEnd: d(end)
})

beforeEach(() => {
	vi.clearAllMocks()
	rows = []
	dbMock.payrollRun.findMany.mockImplementation(async ({ where }: { where: Where }) =>
		rows.filter(
			(r) =>
				r.organizationId === where.organizationId &&
				r.status !== where.status.not &&
				r.periodStart < where.periodStart.lt &&
				r.periodEnd >= where.periodEnd.gte
		)
	)
})

const guard = (start: string, end: string) => assertNoOverlappingRun(ORG, d(start), d(end))

/**
 * The predicate above reads the `where` the guard builds, which makes every case below meaningful
 * — but only while that `where` keeps its shape. If the guard stopped excluding VOIDED rows, or
 * narrowed the one-day widening the Manila comparison depends on, the predicate would quietly
 * filter on something else and the cases would pass for the wrong reason. Pin the shape here.
 */
describe('the query the guard issues', () => {
	it('scopes to the org, excludes VOIDED, and widens the window by a day on each side', async () => {
		await guard('2026-05-10', '2026-05-20')

		expect(dbMock.payrollRun.findMany).toHaveBeenCalledTimes(1)
		const { where } = dbMock.payrollRun.findMany.mock.calls[0][0]
		expect(where.organizationId).toBe(ORG)
		// A voided run must not block a new one — the duplicate check ahead of the guard owns that case.
		expect(where.status).toEqual({ not: 'VOIDED' })
		// One day before the start, two after the end (exclusive `lt`), so a row stored on a PHT
		// boundary is still a candidate for the Manila-day comparison that makes the real decision.
		expect(where.periodEnd.gte).toEqual(d('2026-05-09'))
		expect(where.periodStart.lt).toEqual(d('2026-05-22'))
	})
})

describe('assertNoOverlappingRun — a custom range may not intersect an existing run', () => {
	it('refuses a partial overlap', async () => {
		rows = [row('r1', '2026-05-10', '2026-05-31')]
		await expect(guard('2026-05-01', '2026-05-20')).rejects.toMatchObject({ status: 409 })
	})

	it('refuses a contained range', async () => {
		rows = [row('r1', '2026-05-01', '2026-05-20')]
		await expect(guard('2026-05-05', '2026-05-10')).rejects.toMatchObject({ status: 409 })
	})

	it('refuses an identical custom range', async () => {
		rows = [row('r1', '2026-05-03', '2026-05-09')]
		await expect(guard('2026-05-03', '2026-05-09')).rejects.toMatchObject({ status: 409 })
	})

	it('names both dates of the conflicting range, and how to proceed', async () => {
		rows = [row('r1', '2026-05-03', '2026-05-09')]
		await expect(guard('2026-05-05', '2026-05-20')).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining('May 3') }
		})
		await expect(guard('2026-05-05', '2026-05-20')).rejects.toMatchObject({
			body: { message: expect.stringContaining('May 9') }
		})
		await expect(guard('2026-05-05', '2026-05-20')).rejects.toMatchObject({
			body: { message: expect.stringContaining('Void the conflicting run to proceed.') }
		})
	})

	it('allows adjacent ranges — May 1–10 then May 11–20 share no day', async () => {
		rows = [row('r1', '2026-05-01', '2026-05-10')]
		await expect(guard('2026-05-11', '2026-05-20')).resolves.toBeUndefined()
	})

	it('allows a range that intersects only a VOIDED run', async () => {
		rows = [row('r1', '2026-05-01', '2026-05-20', 'VOIDED')]
		await expect(guard('2026-05-05', '2026-05-10')).resolves.toBeUndefined()
	})
})

describe('assertNoOverlappingRun — standard shapes keep coexisting', () => {
	it('lets 1–15, 16–31 and 1–31 all through for the same month', async () => {
		const may = (kind: 'FIRST_HALF' | 'SECOND_HALF' | 'WHOLE_MONTH') => periodOf(kind, 2026, 4)
		for (const kind of ['FIRST_HALF', 'SECOND_HALF', 'WHOLE_MONTH'] as const) {
			const p = may(kind)
			await expect(assertNoOverlappingRun(ORG, p.periodStart, p.periodEnd)).resolves.toBeUndefined()
			rows.push({
				id: kind,
				organizationId: ORG,
				status: 'COMPUTED',
				periodStart: p.periodStart,
				periodEnd: p.periodEnd
			})
		}
		expect(rows).toHaveLength(3)
	})

	// S2: deciding "every conflict is standard" needs EVERY candidate row. A `findFirst` could
	// return the standard 1–31 row and wave this through.
	it('refuses a standard range when ONE of several conflicts is custom', async () => {
		rows = [row('whole', '2026-05-01', '2026-05-31'), row('custom', '2026-05-03', '2026-05-09')]
		const p = periodOf('FIRST_HALF', 2026, 4)
		await expect(assertNoOverlappingRun(ORG, p.periodStart, p.periodEnd)).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining('May 3') }
		})
	})

	// S7, on the record: this is a real workflow change. An off-cycle custom run blocks the
	// month's regular cutoff run until it is voided.
	it('refuses the month’s standard 1–15 run once a custom run exists in it', async () => {
		rows = [row('custom', '2026-05-03', '2026-05-09')]
		const p = periodOf('FIRST_HALF', 2026, 4)
		await expect(assertNoOverlappingRun(ORG, p.periodStart, p.periodEnd)).rejects.toMatchObject({
			status: 409
		})
	})
})

describe('assertNoOverlappingRun — legacy rows sit on PHT day boundaries', () => {
	// The one real timesheet-shaped row in the dev DB. In Manila this range is Aug 10 – Aug 16;
	// UTC-truncating it to Aug 9 would invent a shared day with any range ending Aug 9 and refuse
	// a legitimate save. The decision is made on Manila day keys, so it does not.
	const legacy = {
		id: 'intraday',
		organizationId: ORG,
		status: 'COMPUTED',
		periodStart: new Date('2026-08-09T16:00:00.000Z'),
		periodEnd: new Date('2026-08-16T15:59:59.999Z')
	}

	it('allows a range ending Aug 9 — the legacy row starts Aug 10 in Manila', async () => {
		rows = [legacy]
		await expect(guard('2026-08-05', '2026-08-09')).resolves.toBeUndefined()
	})

	it('still refuses a range that genuinely shares Aug 10', async () => {
		rows = [legacy]
		await expect(guard('2026-08-05', '2026-08-10')).rejects.toMatchObject({ status: 409 })
	})

	it('still allows a range that ends the day before such a row starts', async () => {
		rows = [legacy]
		await expect(guard('2026-08-03', '2026-08-08')).resolves.toBeUndefined()
	})

	it('allows a range starting the day after such a row ends', async () => {
		rows = [legacy]
		await expect(guard('2026-08-17', '2026-08-20')).resolves.toBeUndefined()
	})
})

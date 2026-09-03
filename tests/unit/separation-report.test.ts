import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

/**
 * #305 — `generateSeparationReport`, the CSV/report row mapper.
 *
 * It is a pure read-and-map: no guards, no writes. What is worth pinning is the row SHAPE,
 * because two consumers depend on it literally — the reports table renders `row[column]` and
 * the CSV export uses the object keys as its headers. A renamed key is a silently broken
 * export, not a type error.
 *
 * NOTE on `Department`: this is the RELATIONAL `Employee.department.name`. It is not the
 * clearance `area` enum (#306) and has nothing to do with it.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: { separationRecord: { findMany: vi.fn() } }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { generateSeparationReport } = await import('$lib/server/services/separation')

const RANGE = { startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') }

/**
 * Both fixture dates sit on a day boundary in UTC: one late (20:00Z), one early (02:00Z).
 * That is deliberate — the mapper uses `toISOString()`, so in ANY timezone with a non-zero
 * offset at least one of these two rows renders a DIFFERENT day than the local calendar
 * date would. A switch to a local-date formatter turns this file red instead of green.
 * (Runner TZ here is Asia/Manila, UTC+8, where the first row is the one that catches it.)
 */
function records() {
	return [
		{
			type: 'RESIGNATION',
			status: 'FINALIZED',
			effectiveDate: new Date('2026-08-01T20:00:00Z'), // local Manila date: 2026-08-02
			finalPayAmount: 1234.5,
			employee: {
				firstName: 'Elena',
				lastName: 'Employee',
				employeeNumber: 'EMP-004',
				department: { name: 'Operations' }
			},
			clearanceItems: [{ status: 'CLEARED' }, { status: 'PENDING' }]
		},
		{
			type: 'TERMINATION',
			status: 'OPEN',
			effectiveDate: new Date('2026-08-02T02:00:00Z'), // local date in any UTC-n zone: 2026-08-01
			finalPayAmount: null,
			employee: {
				firstName: 'Marco',
				lastName: 'Manager',
				employeeNumber: 'EMP-002',
				department: { name: 'Finance' }
			},
			clearanceItems: []
		}
	]
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.separationRecord.findMany.mockResolvedValue(records())
})

describe('generateSeparationReport (#305)', () => {
	it('emits one TitleCase row per separation', async () => {
		const rows = await generateSeparationReport('org1', RANGE)

		expect(rows).toHaveLength(2)

		// The exact key set, in order. The CSV export writes these as its headers.
		expect(Object.keys(rows[0])).toEqual([
			'EmployeeNumber',
			'Employee',
			'Department',
			'Type',
			'EffectiveDate',
			'Status',
			'Clearance',
			'FinalPay'
		])

		expect(rows[0]).toEqual({
			EmployeeNumber: 'EMP-004',
			Employee: 'Employee, Elena', // "Last, First"
			Department: 'Operations', // relational Employee.department.name
			Type: 'RESIGNATION',
			EffectiveDate: '2026-08-01', // UTC, not the local 2026-08-02
			Status: 'FINALIZED',
			Clearance: '1/2', // cleared/total
			FinalPay: '1234.50' // always 2 decimals
		})

		// The other UTC edge, plus the null-final-pay blank.
		expect(rows[1].EffectiveDate).toBe('2026-08-02')
		expect(rows[1].FinalPay).toBe('')
		// No clearance items at all still renders a ratio, not an empty string.
		expect(rows[1].Clearance).toBe('0/0')

		// Scoped to the caller's org and the requested window.
		expect(dbMock.separationRecord.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					organizationId: 'org1',
					effectiveDate: { gte: RANGE.startDate, lte: RANGE.endDate }
				}
			})
		)
	})

	// `FinalPay` is written as `r.finalPayAmount ? … : ''`, which READS like a bug: a falsy check
	// that would swallow a genuine zero. It is not one. Prisma hands back `Decimal`, an OBJECT,
	// and every object is truthy — so only a real null renders blank. This test exists so that
	// anyone "fixing" the falsy check to `!= null` finds out here that there was nothing to fix.
	it('renders a final pay of exactly zero as 0.00, not blank', async () => {
		const [row] = records()
		row.finalPayAmount = new Prisma.Decimal(0) as unknown as number
		dbMock.separationRecord.findMany.mockResolvedValue([row])

		const rows = await generateSeparationReport('org1', RANGE)

		expect(rows[0].FinalPay).toBe('0.00')
		// And the null case still blanks, so the two are distinguishable in the CSV.
		expect(records()[1].finalPayAmount).toBeNull()
	})

	it('leaves the department blank when the employee has none', async () => {
		const [row] = records()
		row.employee.department = null as unknown as { name: string }
		dbMock.separationRecord.findMany.mockResolvedValue([row])

		const rows = await generateSeparationReport('org1', RANGE)

		expect(rows[0].Department).toBe('')
		// The blank is the ONLY difference — a missing department must not drop the row or
		// disturb its neighbours.
		expect(rows[0].Employee).toBe('Employee, Elena')
	})
})

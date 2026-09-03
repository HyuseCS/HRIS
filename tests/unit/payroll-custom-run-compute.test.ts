import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { periodOf } from '../../src/lib/utils/pay-periods'

/**
 * #163 — the two things `computePayroll` itself wires for a CUSTOM run, asserted on the
 * PayrollEntry it writes rather than on the pure engine:
 *
 *  1. `amortShare` — the flat monthly loan installment is scaled to the range before it reaches
 *     the engine. A standard period still passes the whole installment.
 *  2. Timesheet sourcing by INTERSECTION. A standard 1–15 sheet IS visible to a May 3–9 run, and
 *     only the entries dated inside the run are summed — the employee is paid the days they
 *     actually worked in range, not full scheduled hours.
 *  3. S8 — the schedule-fallback signal, which now fires only when no APPROVED entry falls in the
 *     range at all. That estimate is flagged on the entry, not shipped silently.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
		payrollEntry: { deleteMany: vi.fn(), create: vi.fn() },
		employee: { findMany: vi.fn() },
		earningType: { findMany: vi.fn() },
		loan: { findMany: vi.fn() },
		cashAdvance: { findMany: vi.fn() },
		benefitEnrollment: { findMany: vi.fn() },
		payRateRule: { findUnique: vi.fn() },
		statutoryRateConfig: { findUnique: vi.fn() },
		employeeEarning: { findMany: vi.fn() },
		employeeDeduction: { findMany: vi.fn() },
		employeeStatutoryConfig: { findMany: vi.fn() },
		employeeCompensation: { findMany: vi.fn() },
		publicHoliday: { findMany: vi.fn() },
		timesheet: { findMany: vi.fn() },
		attendanceDay: { findMany: vi.fn() },
		approvalStep: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
		$transaction: vi.fn()
	}
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

const { computePayroll } = await import('$lib/server/services/payroll/index')

const ORG = 'org1'
const ctx = { organizationId: ORG, actorId: 'u1', actorRoles: ['SUPER_ADMIN'] as Role[] }
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

type EntryData = {
	data: {
		hoursWorked: number
		sssEe: number
		isFlagged: boolean
		flagReason: string | null
		deductions: { create: Deduction[] }
	}
}
type Deduction = { code: string; amount: number }

const entryWritten = () => (dbMock.payrollEntry.create.mock.calls[0][0] as EntryData).data

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findMany.mockResolvedValue([
		{ id: 'emp1', basicMonthlySalary: 30000, rateType: 'MONTHLY' }
	])
	dbMock.loan.findMany.mockResolvedValue([
		{ id: 'L1', employeeId: 'emp1', type: 'Loan', installment: 1000, balance: 30000 }
	])
	for (const model of [
		'earningType',
		'cashAdvance',
		'benefitEnrollment',
		'employeeEarning',
		'employeeDeduction',
		'employeeStatutoryConfig',
		'employeeCompensation',
		'publicHoliday',
		'timesheet',
		'attendanceDay',
		'approvalStep'
	] as const) {
		dbMock[model].findMany.mockResolvedValue([])
	}
	dbMock.payRateRule.findUnique.mockResolvedValue(null)
	dbMock.statutoryRateConfig.findUnique.mockResolvedValue(null)
	dbMock.payrollEntry.create.mockResolvedValue({ id: 'e1' })
	dbMock.payrollRun.findUnique.mockResolvedValue({ id: 'run1' })
	dbMock.payrollRun.findMany.mockResolvedValue([])
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
})

const computeFor = (start: Date, end: Date) => {
	dbMock.payrollRun.findFirst.mockResolvedValue({
		id: 'run1',
		organizationId: ORG,
		status: 'DRAFT',
		periodStart: start,
		periodEnd: end
	})
	return computePayroll('run1', ORG, ctx)
}

describe('computePayroll on a custom range', () => {
	it('scales the flat monthly loan installment to the range', async () => {
		await computeFor(d('2026-05-03'), d('2026-05-09')) // 7 of 31 days
		const loan = entryWritten().deductions.create.find((c) => c.code === 'LOAN')
		expect(loan?.amount).toBe(225.81) // 1000 × 7/31, quantized once
	})

	it('flags an employee whose hours were estimated from the schedule', async () => {
		await computeFor(d('2026-05-03'), d('2026-05-09'))
		const entry = entryWritten()
		expect(entry.isFlagged).toBe(true)
		expect(entry.flagReason).toBe(
			'Hours estimated from schedule — no timesheet covers this custom period'
		)
	})
})

describe('computePayroll sources timesheet hours by intersection', () => {
	// A standard May 1–15 sheet. Only May 5 and May 6 fall inside a May 3–9 run.
	type Entry = { date: Date; hoursWorked: number }
	type Sheet = { id: string; periodStart: Date; periodEnd: Date; entries: Entry[] }
	type TsWhere = {
		employeeId: string
		status: string
		periodStart: { lt: Date }
		periodEnd: { gte: Date }
	}
	type TsInclude = { entries: { where: { date: { gte: Date; lt: Date } } } }

	const sheet: Sheet = {
		id: 'ts1',
		periodStart: d('2026-05-01'),
		periodEnd: d('2026-05-15'),
		entries: [
			{ date: d('2026-05-01'), hoursWorked: 8 },
			{ date: d('2026-05-05'), hoursWorked: 8 },
			{ date: d('2026-05-06'), hoursWorked: 4 },
			{ date: d('2026-05-12'), hoursWorked: 8 }
		]
	}

	beforeEach(() => {
		// The real `where` and `include` the query builds are applied to an in-memory sheet — a
		// canned array would prove nothing about either level of the filter.
		dbMock.timesheet.findMany.mockImplementation(
			async ({ where, include }: { where: TsWhere; include: TsInclude }) =>
				[sheet]
					.filter(
						(t) =>
							where.status === 'APPROVED' &&
							t.periodStart < where.periodStart.lt &&
							t.periodEnd >= where.periodEnd.gte
					)
					.map((t) => ({
						...t,
						entries: t.entries.filter(
							(e) =>
								e.date >= include.entries.where.date.gte && e.date < include.entries.where.date.lt
						)
					}))
		)
	})

	it('sums only the entries dated inside the run, not the whole sheet', async () => {
		await computeFor(d('2026-05-03'), d('2026-05-09'))
		// May 5 (8h) + May 6 (4h). Not the sheet's 28h, and not the 40h schedule fallback.
		expect(entryWritten().hoursWorked).toBe(12)
	})

	it('does not fall back to scheduled hours when the sheet only partially overlaps', async () => {
		await computeFor(d('2026-05-03'), d('2026-05-09'))
		const entry = entryWritten()
		expect(entry.flagReason).not.toBe(
			'Hours estimated from schedule — no timesheet covers this custom period'
		)
	})

	it('still flags a range the sheet overlaps but has no entry in', async () => {
		// May 3–4 is inside the sheet's span, yet it carries no entry for either day.
		await computeFor(d('2026-05-03'), d('2026-05-04'))
		expect(entryWritten().flagReason).toBe(
			'Hours estimated from schedule — no timesheet covers this custom period'
		)
	})
})

/**
 * #163 (review round 2) — the same intersection, decided on MANILA calendar days.
 *
 * The query is a coarse filter widened by a day on each side; a UTC-derived bound counts an entry
 * stored as 2026-05-09T16:00Z — which is May 10 in Manila — inside a May 3–9 run, paying a day the
 * run does not cover, and can include or exclude a whole sheet stored on a PHT boundary.
 */
describe('computePayroll buckets timesheet days on the Manila calendar', () => {
	type Entry = { date: Date; hoursWorked: number }
	type Sheet = { id: string; periodStart: Date; periodEnd: Date; entries: Entry[] }
	type TsWhere = {
		employeeId: string
		status: string
		periodStart: { lt: Date }
		periodEnd: { gte: Date }
	}
	type TsInclude = { entries: { where: { date: { gte: Date; lt: Date } } } }

	const mockSheets = (sheets: Sheet[]) =>
		dbMock.timesheet.findMany.mockImplementation(
			async ({ where, include }: { where: TsWhere; include: TsInclude }) =>
				sheets
					.filter(
						(t) =>
							where.status === 'APPROVED' &&
							t.periodStart < where.periodStart.lt &&
							t.periodEnd >= where.periodEnd.gte
					)
					.map((t) => ({
						...t,
						entries: t.entries.filter(
							(e) =>
								e.date >= include.entries.where.date.gte && e.date < include.entries.where.date.lt
						)
					}))
		)

	// A sheet stored on PHT day boundaries: May 1 00:00 PHT = Apr 30 16:00Z, May 15 ends at
	// May 15 15:59:59.999Z + ... — stored here as the PHT day start of May 15.
	const phtSheet: Sheet = {
		id: 'ts-pht',
		periodStart: new Date('2026-04-30T16:00:00.000Z'), // May 1 in Manila
		periodEnd: new Date('2026-05-14T16:00:00.000Z'), // May 15 in Manila
		entries: [
			{ date: new Date('2026-05-09T16:00:00.000Z'), hoursWorked: 8 }, // May 10 in Manila
			{ date: new Date('2026-05-11T16:00:00.000Z'), hoursWorked: 5 } // May 12 in Manila
		]
	}

	it('does NOT count a May 10 (PHT) entry in a May 3–9 run', async () => {
		mockSheets([phtSheet])
		await computeFor(d('2026-05-03'), d('2026-05-09'))
		// No in-range entry at all → the schedule fallback, not 8h from a day outside the run.
		expect(entryWritten().flagReason).toBe(
			'Hours estimated from schedule — no timesheet covers this custom period'
		)
	})

	it('DOES count that same entry in a May 10–20 run', async () => {
		mockSheets([phtSheet])
		await computeFor(d('2026-05-10'), d('2026-05-20'))
		// May 10 (8h) + May 12 (5h). The sheet ends May 15 in Manila, so both are in range.
		expect(entryWritten().hoursWorked).toBe(13)
	})

	// The sheet-level decision: its stored periodStart is April in UTC, so a UTC comparison would
	// still admit it here — the point is that its Manila span (May 1–15) is what decides.
	it('keeps a PHT-boundary sheet that contributes its in-window days', async () => {
		mockSheets([phtSheet])
		await computeFor(d('2026-05-12'), d('2026-05-15'))
		expect(entryWritten().hoursWorked).toBe(5) // May 12 only
	})

	// The widening earns its keep here: this sheet's UTC bounds end BEFORE the run starts, so an
	// un-widened query drops it outright — yet in Manila it covers the run's first day.
	it('keeps a sheet whose UTC end falls outside the run but whose Manila end does not', async () => {
		mockSheets([
			{
				id: 'ts-edge',
				periodStart: new Date('2026-04-30T16:00:00.000Z'), // May 1 PHT
				periodEnd: new Date('2026-05-10T16:00:00.000Z'), // May 11 PHT
				entries: [{ date: new Date('2026-05-10T16:00:00.000Z'), hoursWorked: 6 }] // May 11 PHT
			}
		])
		await computeFor(d('2026-05-11'), d('2026-05-15'))
		expect(entryWritten().hoursWorked).toBe(6)
	})

	// The negative control for the same shape: one Manila day earlier, the sheet is merely
	// adjacent and must contribute nothing.
	it('drops the same sheet when its Manila span ends the day before the run', async () => {
		mockSheets([
			{
				id: 'ts-adjacent',
				periodStart: new Date('2026-04-30T16:00:00.000Z'), // May 1 PHT
				periodEnd: new Date('2026-05-09T16:00:00.000Z'), // May 10 PHT
				entries: [{ date: new Date('2026-05-09T16:00:00.000Z'), hoursWorked: 8 }] // May 10 PHT
			}
		])
		await computeFor(d('2026-05-11'), d('2026-05-15'))
		expect(entryWritten().flagReason).toBe(
			'Hours estimated from schedule — no timesheet covers this custom period'
		)
	})
})

describe('computePayroll on a standard period is unchanged', () => {
	const may = periodOf('FIRST_HALF', 2026, 4)

	it('still takes the whole installment', async () => {
		await computeFor(may.periodStart, may.periodEnd)
		const loan = entryWritten().deductions.create.find((c) => c.code === 'LOAN')
		expect(loan?.amount).toBe(1000)
	})

	it('does not raise the schedule-fallback flag', async () => {
		await computeFor(may.periodStart, may.periodEnd)
		const entry = entryWritten()
		expect(entry.flagReason).not.toBe(
			'Hours estimated from schedule — no timesheet covers this custom period'
		)
	})
})

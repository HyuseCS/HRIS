import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import type { Role } from '@prisma/client'
import {
	MARKER,
	createOrgFixture,
	cleanupFixtures,
	disconnectAll,
	verifyDb
} from './audit-tx-harness'

// Same module substitution as audit-transaction.test.ts: a REAL PrismaClient against real
// Postgres. Failure injection is left OFF for this file — the whole point here is that the
// generated SQL executes for real, so nothing in the write path may be faked.
vi.mock('$lib/server/db', () => import('./audit-tx-harness').then((m) => m.makeInjectedDb()))

const { deriveRange } = await import('$lib/server/services/attendance')

/**
 * `deriveRange`'s update path is one runtime-built `UPDATE ... FROM jsonb_to_recordset(...)`.
 * The column list comes from `Object.keys()` of the derived payload and each column's Postgres
 * type from the `DERIVED_COLUMN_TYPES` map. `tests/unit/attendance-bulk-derive.test.ts` mocks
 * `$executeRaw`, so it asserts the call SHAPE and never executes the statement: a wrong type in
 * that map, a misspelled column, or a value that will not cast is green in all 2113 unit tests
 * and a 500 at runtime. This tier is the only place that can catch it.
 *
 * One assertion per column TYPE FAMILY is the point — the enum, the numeric(5,2) hours, the
 * integer minutes and the timestamp(3) punches are what the type map can get wrong.
 */

// 2020-01-06 is a Monday and 2020-01-07 a Tuesday, both inside the Mon–Fri
// FALLBACK_WEEKDAY_SHIFT (08:00–17:00, 60 min break) that applies when neither the employee nor
// the org has a schedule. Nothing is seeded for either day, so the fixture owns them outright.
const MON = '2020-01-06'
const TUE = '2020-01-07'
const RANGE = { from: new Date(`${MON}T00:00:00+08:00`), to: new Date(`${TUE}T00:00:00+08:00`) }

async function createEmployee(organizationId: string, departmentId: string, n: number) {
	const user = await verifyDb.user.create({
		data: {
			organizationId,
			email: `${MARKER}-emp${n}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`,
			passwordHash: 'x',
			roles: ['EMPLOYEE' as Role]
		},
		select: { id: true }
	})
	return verifyDb.employee.create({
		data: {
			userId: user.id,
			organizationId,
			departmentId,
			employeeNumber: `${MARKER}-${n}-${Date.now()}`,
			firstName: 'Bulk',
			lastName: `Update${n}`,
			jobTitle: 'Tester',
			employmentType: 'REGULAR',
			employmentStatus: 'ACTIVE',
			startDate: new Date('2019-01-01T00:00:00Z'),
			basicMonthlySalary: 20000
		},
		select: { id: true }
	})
}

/** Replace the employee's punches for one PHT day with a single IN/OUT pair (PHT wall clock). */
async function setPunches(employeeId: string, day: string, inAt: string, outAt: string) {
	await verifyDb.timeLog.deleteMany({ where: { employeeId } })
	await verifyDb.timeLog.createMany({
		data: [
			{ employeeId, punchType: 'IN', timestamp: new Date(`${day}T${inAt}+08:00`) },
			{ employeeId, punchType: 'OUT', timestamp: new Date(`${day}T${outAt}+08:00`) }
		]
	})
}

function readDay(employeeId: string, day: string) {
	return verifyDb.attendanceDay.findFirst({
		where: { employeeId, date: new Date(`${day}T00:00:00Z`) }
	})
}

describe('deriveRange bulk UPDATE executes against real Postgres', () => {
	let fixture: Awaited<ReturnType<typeof createOrgFixture>>
	let employeeId: string

	beforeEach(async () => {
		fixture = await createOrgFixture()
		const dept = await verifyDb.department.create({
			data: { organizationId: fixture.organizationId, name: `${MARKER} dept` },
			select: { id: true }
		})
		employeeId = (await createEmployee(fixture.organizationId, dept.id, 1)).id
	})

	afterEach(cleanupFixtures)
	afterAll(disconnectAll)

	it('writes the changed values, one per column type family, and moves updatedAt', async () => {
		// INSERT pass (createMany): a full 08:00–17:00 day, one hour of it the unpaid meal break.
		await setPunches(employeeId, MON, '08:00:00', '17:00:00')
		const first = await deriveRange(fixture.organizationId, RANGE, fixture.ctx)
		expect(first.derived).toBe(2)

		const before = await readDay(employeeId, MON)
		expect(before).not.toBeNull()
		expect(before!.status).toBe('PRESENT')
		expect(Number(before!.workedHours)).toBe(8)
		expect(before!.lateMinutes).toBe(0)

		// UPDATE pass: in late, out early, so every asserted column has to move.
		await setPunches(employeeId, MON, '09:30:00', '16:00:00')
		await deriveRange(fixture.organizationId, RANGE, fixture.ctx)

		const after = await readDay(employeeId, MON)
		expect(after).not.toBeNull()
		// enum "AttendanceStatus"
		expect(after!.status).toBe('LATE')
		// numeric(5,2) — reads back as Decimal, never a number
		expect(Number(after!.workedHours)).toBe(5.5)
		expect(Number(after!.workedHours)).not.toBe(Number(before!.workedHours))
		// integer
		expect(after!.lateMinutes).toBe(90)
		expect(after!.undertimeMinutes).toBe(60)
		// timestamp(3) — 09:30 PHT is 01:30Z
		expect(after!.timeIn?.toISOString()).toBe(`${MON}T01:30:00.000Z`)
		expect(after!.timeIn?.getTime()).not.toBe(before!.timeIn?.getTime())

		// `updatedAt` has no database default and Prisma's @updatedAt is client-side only, so the
		// raw statement must set it explicitly. If `"updatedAt" = now()` ever leaves the SET list
		// this is the assertion that goes red.
		expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime())

		// the derive is recorded
		const audits = await verifyDb.auditLog.findMany({
			where: { organizationId: fixture.organizationId, entityType: 'AttendanceDay' },
			select: { action: true }
		})
		expect(audits).toHaveLength(2)
		expect(audits[0].action).toBe('CREATE')
	})

	it('leaves a locked day alone while its unlocked sibling is rewritten', async () => {
		await setPunches(employeeId, MON, '08:00:00', '17:00:00')
		await verifyDb.timeLog.createMany({
			data: [
				{ employeeId, punchType: 'IN', timestamp: new Date(`${TUE}T08:00:00+08:00`) },
				{ employeeId, punchType: 'OUT', timestamp: new Date(`${TUE}T17:00:00+08:00`) }
			]
		})
		await deriveRange(fixture.organizationId, RANGE, fixture.ctx)

		const derivedTue = await readDay(employeeId, TUE)
		// snapshot AFTER the lock write — that write bumps @updatedAt itself
		const lockedBefore = await verifyDb.attendanceDay.update({
			where: { id: derivedTue!.id },
			data: { isLocked: true }
		})

		// Both days now derive to something different; only the unlocked one may change.
		await verifyDb.timeLog.deleteMany({ where: { employeeId } })
		await verifyDb.timeLog.createMany({
			data: [
				{ employeeId, punchType: 'IN', timestamp: new Date(`${MON}T09:30:00+08:00`) },
				{ employeeId, punchType: 'OUT', timestamp: new Date(`${MON}T16:00:00+08:00`) },
				{ employeeId, punchType: 'IN', timestamp: new Date(`${TUE}T09:30:00+08:00`) },
				{ employeeId, punchType: 'OUT', timestamp: new Date(`${TUE}T16:00:00+08:00`) }
			]
		})
		await deriveRange(fixture.organizationId, RANGE, fixture.ctx)

		// positive control: the unlocked sibling really did move, so "locked is unchanged" below
		// is not satisfied by a derive that wrote nothing at all.
		const unlocked = await readDay(employeeId, MON)
		expect(unlocked!.status).toBe('LATE')

		const locked = await readDay(employeeId, TUE)
		expect(locked!.status).toBe('PRESENT')
		expect(Number(locked!.workedHours)).toBe(8)
		expect(locked!.lateMinutes).toBe(0)
		expect(locked!.updatedAt.getTime()).toBe(lockedBefore!.updatedAt.getTime())
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * When HR sets the times on an attendance day, correctDay must re-derive status, hours, and
 * night differential from those times (not store stale hand values) — while still letting an
 * explicitly changed status override the derived one. DB + audit are mocked so this stays a
 * fast unit test; the derivation itself is the real deriveAttendanceDay.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		attendanceDay: { findFirst: vi.fn(), update: vi.fn() },
		request: { findMany: vi.fn() },
		workSchedule: { findFirst: vi.fn() },
		organization: { findUnique: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
const writeAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('$lib/server/audit', () => ({
	writeAuditLog: (...args: unknown[]) => writeAuditLog(...args)
}))

// #324: the write and the audit share one transaction, so the correction lands on `tx`, not on
// the bare client. A distinct object makes a regression to `db.` visible instead of silent.
const tx = { attendanceDay: { findUniqueOrThrow: vi.fn(), update: vi.fn() } }

const { correctDay } = await import('$lib/server/services/attendance')

const CTX: AuditContext = { organizationId: 'org1', actorId: 'u1', actorRoles: ['HR_ADMIN'] }

// Midnight-UTC key of a PHT day (that's how AttendanceDay.date is stored).
const DATE = new Date('2026-07-20')
const WEEKDAY = DATE.getUTCDay()
// Mon–Fri 08:00–17:00 with a 1h break, keyed for whatever weekday DATE lands on.
const SCHED_DAYS = [{ weekday: WEEKDAY, startMinutes: 480, endMinutes: 1020, breakMinutes: 60 }]

function mockDay(overrides: Record<string, unknown> = {}) {
	dbMock.attendanceDay.findFirst.mockResolvedValue({
		id: 'ad1',
		status: 'ABSENT',
		isLocked: false,
		dayType: 'REGULAR',
		date: DATE,
		employeeId: 'emp1',
		regularHours: 0,
		overtimeHours: 0,
		employee: { workSchedule: { days: SCHED_DAYS, trackTardiness: true } },
		...overrides
	})
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.request.findMany.mockResolvedValue([]) // no approved OT
	dbMock.organization.findUnique.mockResolvedValue({ trackTardiness: true }) // #190 master on
	tx.attendanceDay.update.mockImplementation(async (args: { data: unknown }) => args.data)
	// The audit's before-image is re-read inside the transaction, not carried from the outer read.
	tx.attendanceDay.findUniqueOrThrow.mockResolvedValue({
		regularHours: 0,
		overtimeHours: 0,
		status: 'ABSENT'
	})
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

const at = (hhmm: string) => new Date(`2026-07-20T${hhmm}:00+08:00`)

describe('correctDay re-derives from entered times (#attendance)', () => {
	it('derives PRESENT + 8 regular hours from an 08:00–18:00 day (was ABSENT)', async () => {
		mockDay()
		await correctDay('ad1', 'org1', { timeIn: at('08:00'), timeOut: at('18:00') }, CTX)

		const data = tx.attendanceDay.update.mock.calls[0][0].data
		expect(data.status).toBe('PRESENT') // not the stale 'ABSENT'
		expect(data.regularHours).toBe(8) // 10h gross − 1h break = 9h net, capped at 8h threshold
		expect(data.overtimeHours).toBe(0) // 1h raw OT, but no approved OT → gated to 0
		expect(data.nightDiffHours).toBe(0) // ends 18:00, before the 22:00 window
		expect(data.manuallyEdited).toBe(true)
		// #324: the audit write shares the transaction.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('computes night differential for hours inside the 22:00–06:00 window', async () => {
		mockDay({ dayType: 'REST_DAY' }) // rest day → no schedule, no "late", clean night check
		await correctDay('ad1', 'org1', { timeIn: at('20:00'), timeOut: at('23:00') }, CTX)

		const data = tx.attendanceDay.update.mock.calls[0][0].data
		expect(data.nightDiffHours).toBe(1) // only 22:00–23:00 falls in the window
		expect(data.restDayHours).toBeGreaterThan(0)
	})

	it('lets an explicitly changed status override the derived one', async () => {
		mockDay() // stored status ABSENT
		await correctDay(
			'ad1',
			'org1',
			{ timeIn: at('08:00'), timeOut: at('18:00'), status: 'ON_LEAVE' },
			CTX
		)

		const data = tx.attendanceDay.update.mock.calls[0][0].data
		expect(data.status).toBe('ON_LEAVE') // HR's explicit pick wins over derived PRESENT
	})

	it('keeps the derived status when the submitted status matches the stored one', async () => {
		mockDay({ status: 'PRESENT' })
		await correctDay(
			'ad1',
			'org1',
			{ timeIn: at('09:30'), timeOut: at('18:00'), status: 'PRESENT' },
			CTX
		)

		const data = tx.attendanceDay.update.mock.calls[0][0].data
		expect(data.status).toBe('LATE') // 09:30 start is past the 08:00 schedule → derived LATE wins
		expect(data.lateMinutes).toBe(90)
	})
})

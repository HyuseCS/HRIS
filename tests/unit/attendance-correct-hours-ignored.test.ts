import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * F10 / D4 — the `?/correct` route must not be able to forward a hand-typed Reg/OT figure to
 * `correctDay`. The service's non-time branch honours whatever hours it is handed, bypassing the
 * `approvedOtHours` cap (`services/attendance/index.ts:606-623`), so the control is the absence of
 * the two keys from `correctSchema`, not the UI.
 *
 * The assertion is on the DATA ARGUMENT passed to the mocked `correctDay`, and one case posts NO
 * `date`: with a `date` present the derive branch overwrites the hours anyway, so an
 * outcome-level assertion would stay green even with the schema keys restored.
 */

const correctDay = vi.hoisted(() => vi.fn())

vi.mock('$lib/server/db', () => ({ db: {} }))
vi.mock('$lib/server/services/attendance', () => ({
	countAttendanceDays: vi.fn(),
	listAttendanceDays: vi.fn(),
	listTeamDay: vi.fn(),
	deriveRange: vi.fn(),
	autoDeriveFromPunches: vi.fn(),
	correctDay,
	lockRange: vi.fn(),
	unlockRange: vi.fn(),
	resetDayToDerived: vi.fn(),
	createTimesheetFromAttendance: vi.fn()
}))
vi.mock('$lib/server/services/attendance/import', () => ({
	importBacklogCsv: vi.fn(),
	MAX_IMPORT_BYTES: 1,
	MAX_IMPORT_ROWS: 1
}))

const attendance = await import('../../src/routes/(app)/attendance/+page.server')

const SUPER: Role[] = ['SUPER_ADMIN']

const run = (fields: Record<string, string>) => {
	const body = new FormData()
	for (const [k, v] of Object.entries(fields)) body.set(k, v)
	return attendance.actions.correct({
		request: { formData: async () => body },
		locals: { user: { id: 'actor', organizationId: 'org1', roles: SUPER } },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<any>
}

const dataArg = () => correctDay.mock.calls[0][2] as Record<string, unknown>

beforeEach(() => {
	vi.clearAllMocks()
	// correctDay really returns the saved row, and the route reads its date for the toast.
	// Resolving undefined here would be a mock that cannot fail the way production would.
	correctDay.mockResolvedValue({ id: 'day1', date: new Date('2026-09-10T00:00:00+08:00') })
})

describe('?/correct cannot forward hand-typed hours (#F10)', () => {
	it('drops regularHours/overtimeHours when no date is posted (the uncapped branch)', async () => {
		const res = await run({ id: 'day1', regularHours: '7.25', overtimeHours: '3' })

		expect(res).toMatchObject({ action: 'correct' })
		expect(correctDay).toHaveBeenCalledOnce()
		const data = dataArg()
		expect(data).not.toHaveProperty('regularHours')
		expect(data).not.toHaveProperty('overtimeHours')
		// No date means correctDay never sees a time either, so nothing reaches the derive path
		// that would have overwritten the hours — the strip is the only thing protecting the cap.
		expect(data).not.toHaveProperty('timeIn')
		expect(data).not.toHaveProperty('timeOut')
	})

	it('drops them on the times branch too', async () => {
		await run({
			id: 'day1',
			date: '2026-09-03',
			timeIn: '09:00',
			timeOut: '17:00',
			regularHours: '7.25',
			overtimeHours: '3'
		})

		const data = dataArg()
		expect(data).not.toHaveProperty('regularHours')
		expect(data).not.toHaveProperty('overtimeHours')
		expect(data.timeIn).toEqual(new Date('2026-09-03T09:00:00+08:00'))
	})

	it('still forwards the fields the route does own', async () => {
		await run({ id: 'day1', status: 'PRESENT', note: 'fixed by hand' })

		expect(dataArg()).toEqual({ status: 'PRESENT', note: 'fixed by hand' })
	})
})

/**
 * F10b — the row can only show what was stored if the action hands the stored row back. Without
 * `day` in the payload the client has nothing to patch from and the cells stay stale until a
 * reload, which is the second half of the F10 defect.
 */
describe('?/correct returns the row it saved (#F10b)', () => {
	it('carries the service return as `day`', async () => {
		correctDay.mockResolvedValue({
			id: 'day1',
			date: new Date('2026-09-03T00:00:00+08:00'),
			regularHours: 7,
			manuallyEdited: true
		})

		const res = await run({ id: 'day1', date: '2026-09-03', timeIn: '09:00', timeOut: '17:00' })

		expect(res).toMatchObject({
			action: 'correct',
			saved: 'Thu, Sep 3 saved.',
			day: { id: 'day1', regularHours: 7, manuallyEdited: true }
		})
	})
})

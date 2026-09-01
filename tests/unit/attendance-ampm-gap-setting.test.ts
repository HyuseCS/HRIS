import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import {
	isValidAmPmMinGap,
	AM_PM_MIN_GAP_FLOOR,
	AM_PM_MIN_GAP_CEILING,
	DEFAULT_AM_PM_MIN_GAP_MINUTES
} from '$lib/server/services/attendance/derive'

/**
 * #162 Amendment 1 — the per-organization AM/PM threshold: its bounds, its writer, and the gates
 * on the form action that sets it.
 *
 * MOCKING CONSTRAINT (contract instruction A-E5): mock ONLY `$lib/server/db` and
 * `$lib/server/audit`. `attendance/schedules` must stay REAL, or the service's own bounds check
 * (the second layer, and the one that protects any future non-form caller) would never run and
 * A21 would be vacuous. Every assertion below therefore lands on `organization.update` — on the
 * transaction client since #324 — which is
 * the one call that cannot happen unless the whole chain ran.
 *
 * The `organization.findUnique` mock branches on the `where`/`select` shape rather than returning
 * a flat row — see `tests/unit/punch-access.test.ts:57-65`. It protects the `load` spec, where a
 * flat mock would hand Veent JoJo's stored threshold. (A19 is NOT proved by that mock: the action
 * never reads the org row. A19 is proved by the `where.id` on the update.)
 */

const { dbMock, writeAuditLog } = vi.hoisted(() => ({
	writeAuditLog: vi.fn().mockResolvedValue(undefined),
	dbMock: {
		organization: { findUnique: vi.fn(), update: vi.fn() },
		workSchedule: { findMany: vi.fn() },
		$transaction: vi.fn()
	}
}))

// #324: the threshold write and its audit row now share a transaction, so the update lands on the
// transaction client. Asserting on `tx.organization.update` rather than `tx.organization.update`
// is what makes a revert to the untransacted shape fail here.
const tx = { organization: { update: vi.fn() } }

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { actions, load } = await import('../../src/routes/(app)/settings/schedules/+page.server')
const { setOrgAmPmMinGap } = await import('$lib/server/services/attendance/schedules')

/** The three amendment fields the load must expose; `load`'s declared return is a wide union. */
type AmPmPageData = {
	showAmPmGap: boolean
	amPmMinGapMinutes: number | null
	amPmMinGapDefault: number
}

const JOJO = 'org_jojo' // food-service
const SWEETLEAF = 'org_sweetleaf' // food-service
const VEENT = 'org_veent' // not food-service

/** Stored threshold per org, so a cross-tenant read is visible rather than absorbed by the mock. */
const storedGap: Record<string, number | null> = { [JOJO]: 15, [SWEETLEAF]: null, [VEENT]: null }

const event = (org: string, form: Record<string, string>, roles: Role[] = ['HR_ADMIN']) =>
	({
		request: {
			formData: async () => {
				const fd = new FormData()
				for (const [k, v] of Object.entries(form)) fd.set(k, v)
				return fd
			}
		},
		locals: { user: { id: 'user1', organizationId: org, roles } },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

const CTX = {
	organizationId: JOJO,
	actorId: 'user1',
	actorRoles: ['HR_ADMIN'] as Role[],
	ipAddress: 'test'
}

beforeEach(() => {
	vi.clearAllMocks()
	tx.organization.update.mockResolvedValue({})
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<void>) => fn(tx))
	dbMock.workSchedule.findMany.mockResolvedValue([])
	dbMock.organization.findUnique.mockImplementation(
		({ where, select }: { where: { id: string }; select: Record<string, boolean> }) =>
			Promise.resolve(
				where.id in storedGap
					? {
							...(select.trackTardiness ? { trackTardiness: true } : {}),
							...(select.amPmMinGapMinutes ? { amPmMinGapMinutes: storedGap[where.id] } : {})
						}
					: null
			)
	)
})

describe('A14 — isValidAmPmMinGap bounds table', () => {
	it('accepts only whole minutes inside 5–240', () => {
		const table: [number, boolean][] = [
			[4, false],
			[5, true],
			[240, true],
			[241, false],
			[0, false],
			[-5, false],
			[12.5, false],
			[NaN, false],
			[Infinity, false]
		]
		for (const [input, expected] of table) expect(isValidAmPmMinGap(input)).toBe(expected)
		expect(AM_PM_MIN_GAP_FLOOR).toBe(5)
		expect(AM_PM_MIN_GAP_CEILING).toBe(240)
	})
})

describe('#162 Amendment 1 — the setAmPmMinGap action (A15–A19)', () => {
	it('A15 an empty field clears the column back to NULL (the built-in default)', async () => {
		const res = await actions.setAmPmMinGap!(event(JOJO, { minutes: '' }))
		expect(tx.organization.update).toHaveBeenCalledWith({
			where: { id: JOJO },
			data: { amPmMinGapMinutes: null }
		})
		expect(res).toEqual({ success: true, saved: 'Cleared — using the default.' })
	})

	it('A15b a whitespace-only field clears too — the value is trimmed before it is parsed', async () => {
		await actions.setAmPmMinGap!(event(JOJO, { minutes: '   ' }))
		expect(tx.organization.update).toHaveBeenCalledWith({
			where: { id: JOJO },
			data: { amPmMinGapMinutes: null }
		})
	})

	it('A16a a value that is not a plain whole number is rejected with the whole-number message', async () => {
		// Deliberately includes '1e2', '0x1E' and '+45' — the ONLY inputs the strict parse rejects
		// that would otherwise coerce to a valid in-range integer (100, 30, 45). Delete the regex
		// and these three are silently accepted, which is what makes this assertion able to fail.
		// '-30' lands here too, not in the bounds group: the parse rejects the sign before any
		// bound is consulted.
		for (const raw of ['12.5', 'abc', '1e3', '1e2', '0x1E', '+45', '-30', '30.0']) {
			const res = (await actions.setAmPmMinGap!(event(JOJO, { minutes: raw }))) as {
				status: number
				data: { field: string; error: string }
			}
			expect(res.status, raw).toBe(400)
			expect(res.data.error, raw).toBe('Enter a whole number of minutes.')
			// The message is tagged with the control it belongs to, so the page can attach it to
			// the input instead of dropping it in the shared page-top banner (#142 convention).
			expect(res.data.field, raw).toBe('minutes')
		}
		expect(tx.organization.update).not.toHaveBeenCalled()
	})

	it('A16b a whole number outside 5–240 is rejected with the bounds message', async () => {
		for (const raw of ['4', '0', '241', '100000']) {
			const res = (await actions.setAmPmMinGap!(event(JOJO, { minutes: raw }))) as {
				status: number
				data: { field: string; error: string }
			}
			expect(res.status, raw).toBe(400)
			expect(res.data.error, raw).toBe('The AM/PM gap must be between 5 and 240 minutes.')
			expect(res.data.field, raw).toBe('minutes')
		}
		expect(tx.organization.update).not.toHaveBeenCalled()
	})

	it('A17 a valid value is written to the session org', async () => {
		const res = await actions.setAmPmMinGap!(event(JOJO, { minutes: '45' }))
		expect(tx.organization.update).toHaveBeenCalledWith({
			where: { id: JOJO },
			data: { amPmMinGapMinutes: 45 }
		})
		expect(res).toEqual({ success: true, saved: 'Saved — 45 minutes.' })
	})

	it('A18 a non-food-service org gets a 404 and never reaches the setter (twin door)', async () => {
		await expect(actions.setAmPmMinGap!(event(VEENT, { minutes: '45' }))).rejects.toMatchObject({
			status: 404
		})
		expect(tx.organization.update).not.toHaveBeenCalled()
	})

	it('A18b a user without MANAGE_HR gets a 403 and never reaches the setter', async () => {
		await expect(
			actions.setAmPmMinGap!(event(JOJO, { minutes: '45' }, ['EMPLOYEE']))
		).rejects.toMatchObject({ status: 403 })
		expect(tx.organization.update).not.toHaveBeenCalled()
	})

	it('A19 a form-supplied organizationId is ignored — one tenant cannot move another’s', async () => {
		await actions.setAmPmMinGap!(
			event(JOJO, { minutes: '45', organizationId: SWEETLEAF, id: SWEETLEAF })
		)
		expect(tx.organization.update).toHaveBeenCalledWith({
			where: { id: JOJO },
			data: { amPmMinGapMinutes: 45 }
		})
	})

	it('A20 the write is audited', async () => {
		await actions.setAmPmMinGap!(event(JOJO, { minutes: '45' }))
		expect(writeAuditLog).toHaveBeenCalledTimes(1)
		expect(writeAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: JOJO }),
			expect.objectContaining({
				action: 'UPDATE',
				entityType: 'Organization',
				entityId: JOJO,
				newValue: { amPmMinGapMinutes: 45 }
			}),
			// #324: the audit write shares the transaction that made the change.
			tx
		)
	})
})

describe('A21 — the service enforces the bounds itself (second layer)', () => {
	it('rejects an out-of-range value from a direct call and never writes', async () => {
		await expect(setOrgAmPmMinGap(JOJO, 241, CTX)).rejects.toMatchObject({ status: 400 })
		await expect(setOrgAmPmMinGap(JOJO, 4, CTX)).rejects.toMatchObject({ status: 400 })
		await expect(setOrgAmPmMinGap(JOJO, 12.5, CTX)).rejects.toMatchObject({ status: 400 })
		expect(tx.organization.update).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('accepts null (clear) and an in-range value from a direct call', async () => {
		await setOrgAmPmMinGap(JOJO, null, CTX)
		await setOrgAmPmMinGap(JOJO, 5, CTX)
		await setOrgAmPmMinGap(JOJO, 240, CTX)
		expect(tx.organization.update).toHaveBeenCalledTimes(3)
	})
})

describe('the settings load exposes the control to food-service tenants only (A-E7)', () => {
	it('returns the stored threshold and the default for a food-service org', async () => {
		const data = (await load!(event(JOJO, {}))) as AmPmPageData
		expect(data.showAmPmGap).toBe(true)
		expect(data.amPmMinGapMinutes).toBe(15)
		expect(data.amPmMinGapDefault).toBe(DEFAULT_AM_PM_MIN_GAP_MINUTES)
	})

	it('hides the control for a non-food-service org and leaks no other tenant’s value', async () => {
		const data = (await load!(event(VEENT, {}))) as AmPmPageData
		expect(data.showAmPmGap).toBe(false)
		expect(data.amPmMinGapMinutes).toBeNull()
	})
})

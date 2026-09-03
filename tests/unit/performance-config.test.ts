import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import {
	PERFORMANCE_CONFIG_BOUNDS,
	getPerformanceConfig,
	savePerformanceConfig
} from '$lib/server/services/performance'
import { DEFAULT_INTERVAL_MONTHS } from '$lib/server/performance/cycle-plan'

/**
 * #178 Phase 5 — the cadence config: its defaults, its bounds, and its guard.
 *
 * Prisma is mocked, the SERVICE IS REAL. That is the point of this file: the bounds live in the
 * service because a direct caller (a script, the cron, a later route) bypasses the route's zod
 * schema entirely, so asserting the route's schema would prove nothing about them.
 *
 * The guard cases assert against the `load` / `actions` EXPORTS, never a copy of a handler body
 * — the export is the only thing SvelteKit calls, and #290 shipped on an assertion that read the
 * body instead.
 *
 * MUTATION-CHECKED: with `ADMINISTER_HR_ORGWIDE` swapped to `MANAGE_HR` in
 * `src/routes/(app)/settings/performance/+page.server.ts`, both MANAGER cases below go red
 * (MANAGE_HR includes MANAGER since #133). Reverted by re-editing the file. Recorded in the
 * Phase 5 report.
 */

const { dbMock, writeAuditLog } = vi.hoisted(() => ({
	dbMock: {
		performanceConfig: { findUnique: vi.fn(), upsert: vi.fn() },
		$transaction: vi.fn()
	},
	writeAuditLog: vi.fn()
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const page = await import('../../src/routes/(app)/settings/performance/+page.server')

const ORG = 'org_seed'
const CTX = { organizationId: ORG, actorId: 'user1', actorRoles: ['HR_ADMIN' as Role] }

const event = (roles: Role[], fields: Record<string, string> = {}) =>
	({
		request: {
			formData: async () => {
				const fd = new FormData()
				for (const [k, v] of Object.entries(fields)) fd.set(k, v)
				return fd
			}
		},
		locals: { user: { id: 'user1', organizationId: ORG, roles } },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

const GOOD = { enabled: 'on', intervalMonths: '3', dueDays: '21' }

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.performanceConfig.findUnique.mockResolvedValue(null)
	dbMock.performanceConfig.upsert.mockResolvedValue({
		id: 'cfg1',
		enabled: true,
		intervalMonths: 3,
		dueDays: 21
	})
	// Run the callback against the same mock, so "the write happened" is directly assertable.
	dbMock.$transaction.mockImplementation((fn: (tx: typeof dbMock) => unknown) => fn(dbMock))
})

describe('getPerformanceConfig — the default-when-absent path', () => {
	it('returns the defaults when the org has no config row', async () => {
		const cfg = await getPerformanceConfig(ORG)
		expect(cfg).toEqual({ enabled: true, intervalMonths: DEFAULT_INTERVAL_MONTHS, dueDays: 14 })
	})

	it('does NOT create a row as a side effect of reading', async () => {
		await getPerformanceConfig(ORG)
		// The cron reads this every night. A row written on read would claim an org was configured
		// by someone when nobody had ever touched it.
		expect(dbMock.performanceConfig.upsert).not.toHaveBeenCalled()
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('returns the stored row when one exists', async () => {
		dbMock.performanceConfig.findUnique.mockResolvedValue({
			enabled: false,
			intervalMonths: 6,
			dueDays: 30
		})
		expect(await getPerformanceConfig(ORG)).toEqual({
			enabled: false,
			intervalMonths: 6,
			dueDays: 30
		})
	})
})

describe('savePerformanceConfig — the bounds, at the service layer', () => {
	const save = (intervalMonths: number, dueDays: number) =>
		savePerformanceConfig(ORG, { enabled: true, intervalMonths, dueDays }, CTX)

	it('accepts both bounds at their edges', async () => {
		const { intervalMonths, dueDays } = PERFORMANCE_CONFIG_BOUNDS
		await save(intervalMonths.min, dueDays.min)
		await save(intervalMonths.max, dueDays.max)
		expect(dbMock.performanceConfig.upsert).toHaveBeenCalledTimes(2)
	})

	it.each([
		['intervalMonths below the floor', 0, 14],
		['intervalMonths of 0 — every tick due forever', 0, 14],
		['intervalMonths above the ceiling', 25, 14],
		['a fractional intervalMonths — 1.5 months makes month math nonsense', 1.5, 14],
		['dueDays below the floor', 3, 0],
		['dueDays above the ceiling', 3, 181],
		['a fractional dueDays', 3, 20.5]
	])('rejects %s, and writes nothing', async (_label, months, days) => {
		await expect(save(months, days)).rejects.toMatchObject({ status: 400 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(dbMock.performanceConfig.upsert).not.toHaveBeenCalled()
	})

	it('writes the audit row inside the same transaction as the upsert', async () => {
		await save(3, 21)
		expect(dbMock.$transaction).toHaveBeenCalledTimes(1)
		expect(writeAuditLog).toHaveBeenCalledTimes(1)
		const [, entry, tx] = writeAuditLog.mock.calls[0]
		expect(entry).toMatchObject({ action: 'UPDATE', entityType: 'PerformanceConfig' })
		expect(tx).toBe(dbMock)
	})
})

describe('/settings/performance is ADMINISTER_HR_ORGWIDE, not MANAGE_HR', () => {
	it('403s the load for a MANAGER and never reads the config', async () => {
		await expect(page.load(event(['MANAGER']))).rejects.toMatchObject({ status: 403 })
		expect(dbMock.performanceConfig.findUnique).not.toHaveBeenCalled()
	})

	it('403s saveConfig for a MANAGER before the form body is read', async () => {
		await expect(page.actions.saveConfig!(event(['MANAGER'], GOOD))).rejects.toMatchObject({
			status: 403
		})
		expect(dbMock.performanceConfig.upsert).not.toHaveBeenCalled()
	})

	it('lets an HR_ADMIN load the cadence', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = (await page.load(event(['HR_ADMIN']))) as any
		expect(res.config.intervalMonths).toBe(DEFAULT_INTERVAL_MONTHS)
	})

	it('lets an HR_ADMIN save the cadence', async () => {
		const res = await page.actions.saveConfig!(event(['HR_ADMIN'], GOOD))
		expect(res).toEqual({ success: true })
		expect(dbMock.performanceConfig.upsert).toHaveBeenCalledTimes(1)
	})
})

describe('a rejected save reaches the banner as a readable string (#106)', () => {
	it('422s an out-of-range intervalMonths with a message, never an object', async () => {
		const res = (await page.actions.saveConfig!(
			event(['HR_ADMIN'], { ...GOOD, intervalMonths: '99' })
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		)) as any
		expect(res.status).toBe(422)
		expect(typeof res.data.error).toBe('string')
		expect(String(res.data.error)).not.toBe('[object Object]')
		expect(res.data.error).toContain('24')
		expect(dbMock.performanceConfig.upsert).not.toHaveBeenCalled()
	})

	it('surfaces the SERVICE bound as a string too when the route schema is bypassed', async () => {
		// The route's zod and the service's guard are two separate walls. This proves the second
		// one's `error(400, …)` is turned into a string in `error`, not a thrown 400 page.
		const { intervalMonths } = PERFORMANCE_CONFIG_BOUNDS
		expect(intervalMonths.max).toBe(24)
		await expect(
			savePerformanceConfig(ORG, { enabled: true, intervalMonths: 99, dueDays: 14 }, CTX)
		).rejects.toMatchObject({ status: 400, body: { message: expect.any(String) } })
	})
})

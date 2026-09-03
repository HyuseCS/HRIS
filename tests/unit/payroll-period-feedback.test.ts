import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * P0-8 — voiding or releasing a payroll period is irreversible money work that reported nothing.
 * Both actions ran the service and returned `undefined`: the row's status pill changed on the
 * reload and that was the entire signal. `ConfirmButton` cannot help here either — it closes its
 * dialog before the request resolves — so the page banner IS the completion signal.
 *
 * The second assertion in each block is the one that matters: adding a success payload must not
 * swallow the existing `{ error }` failure contract, because `toFail` is the only thing standing
 * between a 409 from the service and a silent no-op.
 *
 * Mocked services: this proves the action's return SHAPE, not that anything reached Postgres.
 *
 * Note: `error()` THROWS in SvelteKit 2, so it cannot be used to build a rejection value here —
 * the services reject with the HttpError SHAPE, which is what `toFail` reads.
 */

const { periodsMock } = vi.hoisted(() => ({
	periodsMock: {
		listPeriods: vi.fn(),
		openPeriod: vi.fn(),
		importAttendance: vi.fn(),
		generate: vi.fn(),
		lock: vi.fn(),
		release: vi.fn(),
		voidPeriod: vi.fn()
	}
}))

vi.mock('$lib/server/services/payroll/periods', () => periodsMock)

const { actions } = await import('../../src/routes/(app)/payroll/periods/+page.server')

const httpError = (status: number, message: string) => ({ status, body: { message } })

const ROLES: Role[] = ['SUPER_ADMIN']

const event = (id = 'p1', roles: Role[] = ROLES) => {
	const body = new FormData()
	body.set('id', id)
	return {
		request: { formData: async () => body },
		locals: { user: { id: 'actor', organizationId: 'org1', roles } },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (name: 'void' | 'release') => actions[name](event()) as Promise<any>

beforeEach(() => {
	vi.clearAllMocks()
	periodsMock.release.mockResolvedValue(undefined)
	periodsMock.voidPeriod.mockResolvedValue(undefined)
})

describe('payroll/periods ?/release feedback', () => {
	it('returns a non-empty saved string on success', async () => {
		const res = await run('release')

		expect(res?.saved).toBeTruthy()
		expect(typeof res.saved).toBe('string')
		expect(res.saved.trim().length).toBeGreaterThan(0)
	})

	it('still returns { error } and no saved when the service rejects with a 409', async () => {
		periodsMock.release.mockRejectedValueOnce(httpError(409, 'Period is not LOCKED'))
		const res = await run('release')

		expect(res.status).toBe(409)
		expect(res.data.error).toBe('Period is not LOCKED')
		expect(res.data.saved).toBeUndefined()
	})
})

describe('payroll/periods ?/void feedback', () => {
	it('returns a non-empty saved string on success', async () => {
		const res = await run('void')

		expect(res?.saved).toBeTruthy()
		expect(typeof res.saved).toBe('string')
		expect(res.saved.trim().length).toBeGreaterThan(0)
	})

	it('still returns { error } and no saved when the service rejects with a 409', async () => {
		periodsMock.voidPeriod.mockRejectedValueOnce(httpError(409, 'Period already VOIDED'))
		const res = await run('void')

		expect(res.status).toBe(409)
		expect(res.data.error).toBe('Period already VOIDED')
		expect(res.data.saved).toBeUndefined()
	})

	it('release and void report different things', async () => {
		const released = await run('release')
		const voided = await run('void')

		expect(released.saved).not.toBe(voided.saved)
	})
})

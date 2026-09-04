import { describe, it, expect, vi, beforeEach } from 'vitest'
import { error } from '@sveltejs/kit'
import type { Role } from '@prisma/client'

/**
 * #305 — the three separation route surfaces, with the service mocked out.
 *
 * These assert against the `actions` / `load` / `GET` EXPORTS, not copies of the handler
 * bodies: the export is the only thing SvelteKit calls, so it is the only thing worth
 * asserting on (the #290 lesson). What the service then DOES is the other
 * `separation-*.test.ts` files' job; this file pins only the routes' own zod, error mapping
 * and branch selection.
 *
 * The actor is HR_ADMIN throughout, because all three surfaces gate on
 * `requireAnyCapability(roles, 'MANAGE_HR')` — a wrong role would 403 every test for a
 * reason that has nothing to do with what it claims to pin. The gate ITSELF is checked
 * live by tests/e2e/separations.spec.ts (E1/E2), not here.
 */

const svc = vi.hoisted(() => ({
	createSeparation: vi.fn(),
	listSeparations: vi.fn(),
	getSeparation: vi.fn(),
	computeFinalPay: vi.fn(),
	setClearanceItem: vi.fn(),
	finalizeSeparation: vi.fn(),
	finalizeBarFor: vi.fn(),
	undoSeparation: vi.fn(),
	aggregateWriteOff: vi.fn(),
	generateSeparationReport: vi.fn()
}))
const { dbMock } = vi.hoisted(() => ({
	dbMock: { employee: { findMany: vi.fn() } }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/separation', () => svc)

const { actions: listActions } = await import('../../src/routes/(app)/separations/+page.server')
const { load: detailLoad, actions: detailActions } =
	await import('../../src/routes/(app)/separations/[id]/+page.server')
const { GET } = await import('../../src/routes/api/v1/reports/[type]/+server')

const USER = { id: 'user-hr', organizationId: 'org1', roles: ['HR_ADMIN'] as Role[] }

const formEvent = (fields: Record<string, string>) =>
	({
		request: {
			formData: async () => {
				const fd = new FormData()
				for (const [k, v] of Object.entries(fields)) fd.set(k, v)
				return fd
			}
		},
		params: { id: 'sep1' },
		locals: { user: USER },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/**
 * `PageServerLoad`'s declared return is `void | PageData`, so the result must be widened
 * before its keys are read — same shape as `settings-cards.test.ts`.
 */
const runDetailLoad = async () =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(await (detailLoad as any)({ params: { id: 'sep1' }, locals: { user: USER } })) as {
		finalPay: unknown
		separation: Record<string, unknown>
		partiallyRestored: boolean
		writeOff: number | null
	}

const reportEvent = (start: string, end: string) =>
	({
		params: { type: 'separation' },
		locals: { user: USER },
		url: new URL(`http://localhost/api/v1/reports/separation?start=${start}&end=${end}`)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** `error()` throws in SvelteKit 2, so this is the only way to hand one to `mockRejectedValue`. */
function httpError(status: number, message: string) {
	try {
		error(status, message)
	} catch (e) {
		return e
	}
}

const separationRow = (overrides: Record<string, unknown> = {}) => ({
	id: 'sep1',
	organizationId: 'org1',
	status: 'FINALIZED',
	finalPayBreakdown: null,
	...overrides
})

beforeEach(() => {
	vi.clearAllMocks()
	svc.createSeparation.mockResolvedValue({ id: 'sep-new' })
	svc.getSeparation.mockResolvedValue(separationRow())
	svc.computeFinalPay.mockResolvedValue({ total: 999, lines: [] })
	svc.finalizeBarFor.mockResolvedValue(null)
	svc.setClearanceItem.mockResolvedValue(undefined)
	svc.undoSeparation.mockResolvedValue({ partial: false, status: 'CLEARED', writeOff: null })
	svc.aggregateWriteOff.mockReturnValue(10000)
})

describe('/separations/[id] — undo action (#304)', () => {
	it('maps a service 403 to fail(403)', async () => {
		// The break-glass capability is enforced in the SERVICE, so the route's only job is to
		// carry its status through unflattened.
		svc.undoSeparation.mockRejectedValueOnce(httpError(403, 'Insufficient permissions'))

		await expect(
			detailActions.undo!(formEvent({ reopenClearance: 'false' }))
		).resolves.toMatchObject({ status: 403, data: { error: 'Insufficient permissions' } })
	})

	it('forwards reopenClearance=true, and only for the literal string', async () => {
		const res = await detailActions.undo!(formEvent({ reopenClearance: 'true' }))
		// The `{ undone: true, ...result }` spread IS the contract the Svelte banner reads — a
		// bare `return result` would type-check and silently kill the banner.
		expect(res).toEqual({ undone: true, partial: false, status: 'CLEARED', writeOff: null })
		expect(svc.undoSeparation).toHaveBeenLastCalledWith(
			'sep1',
			'org1',
			true,
			expect.objectContaining({ actorId: 'user-hr' })
		)

		// An unchecked checkbox submits nothing at all, which must read as false — not as
		// "truthy because the key is missing".
		await detailActions.undo!(formEvent({}))
		expect(svc.undoSeparation).toHaveBeenLastCalledWith('sep1', 'org1', false, expect.anything())
	})
})

describe('/separations/[id] — load, #304 snapshot handling', () => {
	it('strips preFinalizeState before the payload reaches the client', async () => {
		// The mock deliberately HAS the key: a fixture without it would pass on a deleted strip.
		svc.getSeparation.mockResolvedValue(
			separationRow({ preFinalizeState: { loans: [{ id: 'l1', balance: '3000' }] } })
		)

		const res = await runDetailLoad()

		// AC-10. Key absence — it holds loan ids and balances (#111, #290).
		expect('preFinalizeState' in res.separation).toBe(false)
	})

	it('does NOT flag partiallyRestored for a fully restored record', async () => {
		// B-1 / AC-4. The undo no longer nulls preFinalizeState, so a perfectly restored record
		// keeps it — and must NOT claim its money "could not be restored automatically".
		svc.getSeparation.mockResolvedValue(
			separationRow({
				status: 'CLEARED',
				preFinalizeState: { loans: [] },
				finalPayBreakdown: { total: -10000, lines: [] }
			})
		)

		expect((await runDetailLoad()).partiallyRestored).toBe(false)
	})

	it('DOES flag partiallyRestored for a pre-#304 record', async () => {
		// The positive control. Without it the case above passes on a hardcoded false.
		svc.getSeparation.mockResolvedValue(
			separationRow({
				status: 'CLEARED',
				preFinalizeState: null,
				finalPayBreakdown: { total: -10000, lines: [] }
			})
		)

		const res = await runDetailLoad()
		expect(res.partiallyRestored).toBe(true)
		expect(res.writeOff).toBe(10000)
		// The mock returns 10000 for ANY input, so assert the ARGUMENT too — otherwise a load that
		// passed the wrong field (or nothing) would still show a correct-looking figure.
		expect(svc.aggregateWriteOff).toHaveBeenCalledWith({ total: -10000, lines: [] })
	})

	it('flags partiallyRestored for a RE-OPENED pre-#304 record', async () => {
		// B-4 interaction: a re-opened case is OPEN, not CLEARED, so a `=== 'CLEARED'`
		// derivation would silently drop the banner here.
		svc.getSeparation.mockResolvedValue(
			separationRow({
				status: 'OPEN',
				preFinalizeState: null,
				finalPayBreakdown: { total: -10000, lines: [] }
			})
		)

		expect((await runDetailLoad()).partiallyRestored).toBe(true)
	})

	it('does not flag a still-FINALIZED record', async () => {
		// The third term. A pre-#304 record that has NOT been undone is not "partially restored".
		svc.getSeparation.mockResolvedValue(
			separationRow({
				status: 'FINALIZED',
				preFinalizeState: null,
				finalPayBreakdown: { total: -10000, lines: [] }
			})
		)

		expect((await runDetailLoad()).partiallyRestored).toBe(false)
	})
})

describe('/separations — create action (#305)', () => {
	it('rejects a malformed create form with field errors', async () => {
		// Empty employeeId, an unknown type, an unparseable date: all three schema branches.
		const res = await listActions.create!(
			formEvent({ employeeId: '', type: 'FIRED', effectiveDate: 'not-a-date' })
		)

		expect(res).toMatchObject({
			status: 422,
			data: { error: 'Please fix the highlighted fields.' }
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const fieldErrors = (res as any).data.fieldErrors
		expect(Object.keys(fieldErrors).sort()).toEqual(['effectiveDate', 'employeeId', 'type'])
		// A refusal never reaches the service.
		expect(svc.createSeparation).not.toHaveBeenCalled()
	})

	it('maps a service HttpError to the same status', async () => {
		const valid = {
			employeeId: 'emp1',
			type: 'RESIGNATION',
			effectiveDate: '2026-08-01',
			reason: 'moving on'
		}

		svc.createSeparation.mockRejectedValueOnce(
			httpError(409, 'An open separation case already exists for this employee')
		)
		await expect(listActions.create!(formEvent(valid))).resolves.toMatchObject({
			status: 409,
			data: { error: 'An open separation case already exists for this employee' }
		})

		// A plain Error carries no status, so it is unexpected: the route rethrows it rather than
		// printing its raw text to the user. handleError turns it into "Something went wrong. (Ref: …)".
		svc.createSeparation.mockRejectedValueOnce(new Error('something else broke'))
		await expect(listActions.create!(formEvent(valid))).rejects.toThrow('something else broke')
	})
})

describe('/separations/[id] — toggleClearance action (#305)', () => {
	it('rejects a clearance toggle with no item id', async () => {
		const res = await detailActions.toggleClearance!(formEvent({ cleared: 'true' }))

		expect(res).toMatchObject({ status: 400, data: { error: 'Missing clearance item.' } })
		expect(svc.setClearanceItem).not.toHaveBeenCalled()
	})
})

describe('/separations/[id] — load, final pay branch (#305)', () => {
	it('recomputes final pay when a finalized case has no stored breakdown', async () => {
		svc.getSeparation.mockResolvedValue(
			separationRow({ status: 'FINALIZED', finalPayBreakdown: null })
		)

		const res = await runDetailLoad()

		// CHARACTERIZATION — this pins CURRENT, arguably WRONG behaviour ON PURPOSE, and it must
		// NOT be "fixed" to make the code match a nicer story. A FINALIZED case whose breakdown
		// was never persisted shows a figure recomputed from TODAY's data, which can differ from
		// what was actually paid. Whether the right answer is a recomputed estimate or a hard
		// error is a PRODUCT decision, unfiled and undecided (see the plan's §Known Gaps). When
		// someone makes that decision, this test goes red on purpose — that is its whole job.
		expect(svc.computeFinalPay).toHaveBeenCalledWith('sep1', 'org1')
		expect(res.finalPay).toEqual({ total: 999, lines: [] })
	})

	it('uses the stored breakdown when a finalized case has one', async () => {
		const snapshot = { total: 5000, lines: [{ label: 'Leave conversion', amount: 5000 }] }
		svc.getSeparation.mockResolvedValue(
			separationRow({ status: 'FINALIZED', finalPayBreakdown: snapshot })
		)

		const res = await runDetailLoad()

		expect(res.finalPay).toBe(snapshot)
		expect(svc.computeFinalPay).not.toHaveBeenCalled()
	})
})

describe('GET /api/v1/reports/separation — date range (#305)', () => {
	it('rejects an inverted or over-long report date range', async () => {
		// These guards `throw error(400)`; they do not return a `fail`.
		await expect(GET(reportEvent('2026-08-31', '2026-08-01'))).rejects.toMatchObject({
			status: 400,
			body: { message: 'End date must be on or after start date' }
		})

		// 366 days is the cap, so 2025-01-01 → 2026-08-01 (577 days) is over it.
		await expect(GET(reportEvent('2025-01-01', '2026-08-01'))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Date range must be 366 days or fewer' }
		})

		expect(svc.generateSeparationReport).not.toHaveBeenCalled()
	})
})

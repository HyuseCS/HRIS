import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Role } from '@prisma/client'

/**
 * #298 D10 — voiding a RUN and voiding a PERIOD did different things. A period void reversed the
 * loan/cash-advance amortization committed at lock; a run void flipped one status column and left
 * the money deducted, against a period that still read LOCKED. Proven live before this fix existed
 * (`process/general-plans/active/phase0-evidence_18-08-26.md`): ₱250 of loan and ₱300 of cash
 * advance stayed deducted from an employee for a payroll that no longer existed.
 *
 * These pin the CALL, not the arithmetic: `reverseAmortization` is spied, so what is proven here is
 * "was the reversal reached, with which run id, on which period status". The arithmetic lives in
 * `cash-advance-ledger.test.ts` (#309) and in the live psql numbers.
 */

const { dbMock, amortizationMock } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: {
			findFirst: vi.fn(),
			updateMany: vi.fn(),
			findUniqueOrThrow: vi.fn()
		},
		$transaction: async (fn: (tx: unknown) => unknown) => fn(dbMock)
	},
	amortizationMock: { reverseAmortization: vi.fn().mockResolvedValue(undefined) }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/payroll/amortization', () => amortizationMock)

const { voidRun } = await import('$lib/server/services/payroll/runs')

const ctx = () => ({
	organizationId: 'org1',
	actorId: 'u1',
	actorRoles: ['SUPER_ADMIN'] as Role[]
})

/** A run row as `findFirst` returns it once `include: { period: true }` landed. */
const runRow = (status: string, periodStatus: string | null) => ({
	id: 'r1',
	status,
	approvedById: null,
	period: periodStatus === null ? null : { id: 'p1', status: periodStatus }
})

beforeEach(() => {
	vi.clearAllMocks()
	amortizationMock.reverseAmortization.mockResolvedValue(undefined)
	dbMock.payrollRun.updateMany.mockResolvedValue({ count: 1 })
	dbMock.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: 'r1', status: 'VOIDED' })
})

describe('voiding a run reverses the amortization (AC-7.2)', () => {
	it('void-run-reverses-amortization — a LOCKED period reverses, for that run id', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(runRow('COMPUTED', 'LOCKED'))

		await expect(voidRun('r1', 'org1', ctx())).resolves.toMatchObject({ status: 'VOIDED' })

		expect(amortizationMock.reverseAmortization).toHaveBeenCalledTimes(1)
		expect(amortizationMock.reverseAmortization).toHaveBeenCalledWith(dbMock, 'r1')
	})

	// M5: dropping RELEASED from `wasLocked` is invisible without this case — a released period has
	// already had its amortization committed at lock, so it must reverse exactly like a locked one.
	it('void-run-reverses-amortization — a RELEASED period reverses too', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(runRow('COMPUTED', 'RELEASED'))

		await voidRun('r1', 'org1', ctx())

		expect(amortizationMock.reverseAmortization).toHaveBeenCalledWith(dbMock, 'r1')
	})

	it('void-run-skips-reversal-on-unlocked-period — a GENERATED period credits nothing', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(runRow('COMPUTED', 'GENERATED'))

		await expect(voidRun('r1', 'org1', ctx())).resolves.toMatchObject({ status: 'VOIDED' })

		// Nothing was ever applied, so nothing may be credited back.
		expect(amortizationMock.reverseAmortization).not.toHaveBeenCalled()
		expect(dbMock.payrollRun.updateMany).toHaveBeenCalled()
	})

	it('void-run-no-period — a run with a NULL periodId voids, with no reversal attempted', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(runRow('COMPUTED', null))

		await expect(voidRun('r1', 'org1', ctx())).resolves.toMatchObject({ status: 'VOIDED' })

		expect(amortizationMock.reverseAmortization).not.toHaveBeenCalled()
	})
})

describe('the status precondition (AC-7.3, AC-7.4)', () => {
	it('void-run-status-precondition — an already-VOIDED run is refused with 400', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(runRow('VOIDED', 'LOCKED'))

		await expect(voidRun('r1', 'org1', ctx())).rejects.toMatchObject({
			status: 400,
			body: { message: 'Payroll run is already voided' }
		})

		// The real risk of a second void is a SECOND credit, not the duplicate status write.
		expect(amortizationMock.reverseAmortization).not.toHaveBeenCalled()
		expect(dbMock.payrollRun.updateMany).not.toHaveBeenCalled()
	})

	it('void-run-allows-draft-and-approved — a COMPUTED and an APPROVED run both still void', async () => {
		for (const status of ['COMPUTED', 'APPROVED']) {
			vi.clearAllMocks()
			dbMock.payrollRun.updateMany.mockResolvedValue({ count: 1 })
			dbMock.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: 'r1', status: 'VOIDED' })
			dbMock.payrollRun.findFirst.mockResolvedValue(runRow(status, 'GENERATED'))

			await expect(voidRun('r1', 'org1', ctx())).resolves.toMatchObject({ status: 'VOIDED' })
			expect(dbMock.payrollRun.updateMany).toHaveBeenCalled()
		}
	})

	it('void-run-allows-draft-and-approved — a DRAFT run still voids', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(runRow('DRAFT', 'GENERATED'))

		await expect(voidRun('r1', 'org1', ctx())).resolves.toMatchObject({ status: 'VOIDED' })
	})

	// The precondition above is a READ. Two concurrent voids both pass it, and without the
	// compare-and-set both would call `reverseAmortization` — crediting the instalment back TWICE,
	// which is the exact harm the refusal exists to prevent. `count: 0` is the loser of that race.
	it('void-run-claim-is-atomic — losing the claim refuses and reverses nothing', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue(runRow('COMPUTED', 'LOCKED'))
		dbMock.payrollRun.updateMany.mockResolvedValue({ count: 0 })

		await expect(voidRun('r1', 'org1', ctx())).rejects.toMatchObject({
			status: 400,
			body: { message: 'Payroll run is already voided' }
		})

		expect(amortizationMock.reverseAmortization).not.toHaveBeenCalled()
	})
})

describe('a run void leaves the period untouched (AC-7.5)', () => {
	// The extraction's one fatal way to go wrong is to sweep the two status flips at the bottom of
	// voidPeriod's transaction into the shared function — which would make every run void also void
	// the period, the opposite of this design. A grep is the cheapest thing that catches it.
	it('run-void-leaves-period-untouched — amortization.ts writes no run or period status', () => {
		const src = readFileSync('src/lib/server/services/payroll/amortization.ts', 'utf8')

		expect(src).not.toMatch(/payrollPeriod\.update/)
		expect(src).not.toMatch(/payrollRun\.update/)
	})
})

describe('the semantics are documented (AC-7.5)', () => {
	it('void-semantics-documented — the doc names the precondition, what reverses, and the reach', () => {
		const doc = readFileSync('docs/payroll-void-semantics.md', 'utf8')

		expect(doc).toMatch(/already `?VOIDED/i)
		expect(doc).toMatch(/reverse/i)
		expect(doc).toMatch(/LOCKED/)
		expect(doc).toMatch(/action=void/)
		expect(doc).toMatch(/OVERRIDE_FINALIZED/)
		expect(doc).toMatch(/cash.advance/i)
	})
})

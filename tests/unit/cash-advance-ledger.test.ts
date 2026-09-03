import { describe, it, expect, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { reverseAmortization } from '$lib/server/services/payroll/amortization'

/**
 * #309 — voiding a payroll over-credited cash advances. Lock takes `min(installment, balance)`;
 * the reversal credited back the raw FROZEN deduction line. Measured live: ₱100 borrowed, repaid
 * in full, void left ₱300 owed. The fix is the `cash_advance_payments` ledger — the reversal reads
 * what was really taken.
 *
 * This pins the arithmetic, which the mocked `void-run-semantics` suite deliberately does not.
 */

/** A tx double: one entry, one capped CASH_ADVANCE line, `payments` as the recorded ledger. */
const txFor = (opts: {
	frozen: string
	payments: string[]
	balance: string
	status?: string
	updateCount?: number
}) => ({
	payrollEntry: {
		findMany: vi.fn().mockResolvedValue([
			{
				id: 'e1',
				deductions: [{ code: 'CASH_ADVANCE', refId: 'ca1', amount: opts.frozen }]
			}
		])
	},
	cashAdvancePayment: {
		findMany: vi.fn().mockResolvedValue(opts.payments.map((amount) => ({ amount }))),
		deleteMany: vi.fn().mockResolvedValue({ count: opts.payments.length })
	},
	cashAdvance: {
		findUnique: vi
			.fn()
			.mockResolvedValue({ id: 'ca1', balance: opts.balance, status: opts.status ?? 'PAID' }),
		updateMany: vi.fn().mockResolvedValue({ count: opts.updateCount ?? 1 })
	}
})

const run = (tx: ReturnType<typeof txFor>) =>
	reverseAmortization(tx as unknown as Prisma.TransactionClient, 'r1')

describe('#309 — a void credits back what lock actually took', () => {
	it('ca-void-reverses-capped-payment — ₱300 frozen, ₱100 taken, ₱100 credited back', async () => {
		const tx = txFor({ frozen: '300.00', payments: ['100.00'], balance: '0.00' })

		await run(tx)

		expect(tx.cashAdvance.updateMany).toHaveBeenCalledWith({
			where: { id: 'ca1', balance: '0.00' },
			data: { balance: expect.objectContaining({}), status: 'ACTIVE' }
		})
		// The pre-fix figure was 300 — the whole bug in one number.
		const { data } = tx.cashAdvance.updateMany.mock.calls[0][0]
		expect(data.balance.toFixed(2)).toBe('100.00')
		expect(tx.cashAdvancePayment.deleteMany).toHaveBeenCalled()
	})

	it('ca-void-uncapped-is-unchanged — a full-installment payment still reverses in full', async () => {
		const tx = txFor({ frozen: '100.00', payments: ['100.00'], balance: '400.00' })

		await run(tx)

		expect(tx.cashAdvance.updateMany.mock.calls[0][0].data.balance.toFixed(2)).toBe('500.00')
	})

	it('ca-void-no-ledger-rows — credits nothing rather than guessing from the frozen line', async () => {
		const tx = txFor({ frozen: '300.00', payments: [], balance: '0.00' })

		await run(tx)

		expect(tx.cashAdvance.updateMany).not.toHaveBeenCalled()
	})

	it('ca-void-concurrent-write — a changed balance refuses instead of clobbering', async () => {
		const tx = txFor({ frozen: '300.00', payments: ['100.00'], balance: '0.00', updateCount: 0 })

		await expect(run(tx)).rejects.toMatchObject({ status: 409 })
	})
})

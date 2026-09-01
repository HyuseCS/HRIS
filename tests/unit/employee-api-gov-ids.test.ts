import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #267 — a partial PATCH must not wipe the government IDs. `govIdSchema` was `.optional()` followed
 * by a transform, and `.optional()` does not short-circuit a downstream transform: it ran on
 * `undefined` and wrote `null` back, so all four keys survived parsing on EVERY request and a PATCH
 * that never mentioned them cleared all four. Absent, explicit `""` and a value are three different
 * things; these pin all three at the route layer. DB + audit + bcrypt are mocked so the whole
 * PATCH → updateEmployee → `employee.update` chain runs for real against the mocked client.
 */

const { dbMock, txMock } = vi.hoisted(() => {
	const txMock = {
		employeeCompensation: { create: vi.fn(), findFirst: vi.fn() },
		// #5: updateEmployee now reads its `before` snapshot and writes the row on the tx client.
		employee: { update: vi.fn(), findUniqueOrThrow: vi.fn() }
	}
	return {
		txMock,
		dbMock: {
			// getEmployee (raw + masked) reads this; updateEmployee writes here.
			employee: { findFirst: vi.fn(), update: vi.fn() },
			// getEmployee's heal-on-read (#170 Stage 1.5, #222) queries the comp + type history.
			employeeCompensation: { findMany: vi.fn() },
			employeeEmploymentType: { findMany: vi.fn() },
			payrollRun: { findFirst: vi.fn() },
			$transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))
vi.mock('$lib/server/services/action-proposals', () => ({
	createProposal: vi.fn().mockResolvedValue({ id: 'prop-1' }),
	// Imported by employees.ts for the audited reveal. Unused here, but a factory mock replaces the
	// whole module, so omitting it makes the import undefined rather than absent.
	assertMayConfirmProposal: vi.fn()
}))

const { PATCH } = await import('../../src/routes/api/v1/employees/[id]/+server')

const HR_USER = {
	id: 'u1',
	organizationId: 'org1',
	roles: ['HR_ADMIN'] as Role[]
}

const EMP = {
	id: 'emp1',
	basicMonthlySalary: 30000,
	rateType: 'MONTHLY' as const,
	employmentType: 'REGULAR' as const,
	startDate: new Date('2024-01-01'),
	// populated so the masked re-fetch has something to mask, and so a wipe would be a real loss
	sssNumber: '34-1234567-8',
	philhealthNumber: '12-345678901-2',
	pagibigNumber: '1234-5678-9012',
	tinNumber: '123-456-789',
	bankAccountNumber: '000123456789'
}

const GOV_ID_KEYS = ['sssNumber', 'philhealthNumber', 'pagibigNumber', 'tinNumber'] as const

const patch = (body: unknown, user = HR_USER) =>
	PATCH({
		locals: { user },
		params: { id: 'emp1' },
		request: { json: async () => body }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue(EMP)
	txMock.employee.findUniqueOrThrow.mockResolvedValue(EMP)
	txMock.employee.update.mockResolvedValue(EMP)
	dbMock.employeeCompensation.findMany.mockResolvedValue([]) // no history → getEmployee heal is a no-op
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
	dbMock.payrollRun.findFirst.mockResolvedValue(null) // no frozen run in the way
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
})

describe('PATCH /api/v1/employees/[id] — a partial update must not wipe government IDs (#267)', () => {
	it('a PATCH that omits the government IDs does not write them', async () => {
		const res = await patch({ firstName: 'Ana' })

		expect(res.status).toBe(200)
		expect(txMock.employee.update).toHaveBeenCalledTimes(1)
		const { data } = txMock.employee.update.mock.calls[0][0]
		expect(data).toHaveProperty('firstName', 'Ana')
		for (const key of GOV_ID_KEYS) expect(data).not.toHaveProperty(key)
	})

	it('an empty PATCH writes nothing at all', async () => {
		const res = await patch({})

		expect(res.status).toBe(200)
		expect(txMock.employee.update).not.toHaveBeenCalled()
	})

	it('an explicitly sent ID is still written, canonically', async () => {
		const res = await patch({ sssNumber: '3412345678' })

		expect(res.status).toBe(200)
		expect(txMock.employee.update).toHaveBeenCalledTimes(1)
		const { data } = txMock.employee.update.mock.calls[0][0]
		expect(data.sssNumber).toBe('34-1234567-8')
		for (const key of GOV_ID_KEYS.filter((k) => k !== 'sssNumber')) {
			expect(data).not.toHaveProperty(key)
		}
	})

	// The API's only "clear this ID" affordance: `{"sssNumber": null}` is a 400 (z.string() rejects
	// null). A fix that stripped nulls in the route instead would answer 200 and discard this write.
	it('an explicit empty string still clears the ID', async () => {
		const res = await patch({ sssNumber: '' })

		expect(res.status).toBe(200)
		expect(txMock.employee.update).toHaveBeenCalledTimes(1)
		const { data } = txMock.employee.update.mock.calls[0][0]
		expect(data.sssNumber).toBeNull()
		// Clearing one ID must not clear the other three: pre-fix, all four arrived as null.
		for (const key of GOV_ID_KEYS.filter((k) => k !== 'sssNumber')) {
			expect(data).not.toHaveProperty(key)
		}
	})

	it('a malformed ID is rejected, and nothing is written', async () => {
		const res = await patch({ sssNumber: '1234' })

		expect(res.status).toBe(400)
		expect(txMock.employee.update).not.toHaveBeenCalled()
	})
})

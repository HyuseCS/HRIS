import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * The two pay-write routes pass the full role set to `proposeIfRequired` (#247).
 *
 * `proposeIfRequired` decides between writing a pay change directly and filing it for a second
 * person to confirm, and it asks `canAny(roles, 'ADMINISTER_HR_ORGWIDE')`. Both routes built their
 * `AuditContext` from `actorRole` alone, so a [MANAGER, HR_ADMIN] user — who holds the capability
 * on their second role — was treated as a bare MANAGER and had every change they made routed into
 * the proposal queue. Fail-closed, so nobody gained authority; the change simply sat there.
 *
 * The 201 page's `ctxOf` is the issue's headline case and `PATCH /api/v1/employees/[id]` is its API
 * twin, which is why both are pinned here: the twin doors have to move together.
 *
 * The target is a REPORT of the actor. `scopedToEmployee` (and the API's own `canTouchEmployee`
 * check) admit a MANAGER only through the reporting line, and that helper reads the primary role
 * alone — so a stranger target would be refused before the routing decision under test is ever
 * reached. Keeping the report fixture also means this file passes on its own commit, before the
 * `employee-access` widening lands.
 */

const { dbMock, txMock, listReportIdsFor } = vi.hoisted(() => {
	const txMock = {
		employeeCompensation: {
			create: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn().mockResolvedValue([])
		},
		employeeEmploymentType: { create: vi.fn(), findFirst: vi.fn() },
		employee: { update: vi.fn() }
	}
	return {
		txMock,
		listReportIdsFor: vi.fn(),
		dbMock: {
			employee: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
			employeeCompensation: { findMany: vi.fn(), findFirst: vi.fn() },
			employeeEmploymentType: { findMany: vi.fn(), findFirst: vi.fn() },
			payrollRun: { findFirst: vi.fn() },
			position: { findFirst: vi.fn() },
			branch: { findMany: vi.fn() },
			$transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
		}
	}
})

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('bcrypt', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed') } }))
vi.mock('$lib/server/services/notifications', () => ({
	notify: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('$lib/server/services/supervisors', () => ({
	listReportIdsFor,
	// Replaced wholesale by a factory mock, so every export the 201 page imports must be present.
	listSupervisorsFor: vi.fn().mockResolvedValue([]),
	setSupervisors: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('$lib/server/services/action-proposals', () => ({
	createProposal: vi.fn().mockResolvedValue({ id: 'prop-1' }),
	// Imported by employees.ts for the audited reveal — unused here, but a factory mock replaces the
	// whole module, so omitting it makes the import undefined rather than absent.
	assertMayConfirmProposal: vi.fn()
}))

const { PATCH } = await import('../../src/routes/api/v1/employees/[id]/+server')
const { actions } = await import('../../src/routes/(app)/employees/[id]/+page.server')
const { createProposal } = await import('$lib/server/services/action-proposals')

const ACTOR_USER = 'user-manager'
const ACTOR_EMP = 'emp-manager'
const TARGET = 'emp1'
const ORG = 'org1'

/** The target 201 file — someone else's, and a direct report of the actor. */
const EMP = {
	id: TARGET,
	userId: 'user-target',
	basicMonthlySalary: 30000,
	rateType: 'MONTHLY' as const,
	employmentType: 'REGULAR' as const,
	employmentStatus: 'ACTIVE' as const,
	startDate: new Date('2024-01-01'),
	positionId: null,
	jobTitle: 'Crew',
	reportsToId: ACTOR_EMP,
	sssNumber: '34-1234567-8',
	bankAccountNumber: '000123456789'
}

const locals = (roles: Role[]) => ({
	user: { id: ACTOR_USER, organizationId: ORG, roles }
})

const patch = (roles: Role[]) =>
	PATCH({
		locals: locals(roles),
		params: { id: TARGET },
		request: { json: async () => ({ basicMonthlySalary: 50000 }) }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)

const changeCompensation = (roles: Role[]) => {
	const f = new FormData()
	f.set('basicMonthlySalary', '50000')
	f.set('effectiveDate', '2026-03-01')
	return actions.changeCompensation!({
		locals: locals(roles),
		params: { id: TARGET },
		request: { formData: async () => f },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue(EMP)
	dbMock.employee.update.mockResolvedValue(EMP)
	// `canTouchEmployee`: the actor's own record, and a reporting line that contains the target.
	dbMock.employee.findUnique.mockResolvedValue({ id: ACTOR_EMP })
	listReportIdsFor.mockResolvedValue([TARGET])
	dbMock.branch.findMany.mockResolvedValue([])
	// getEmployee's heal-on-read has no history to reconcile.
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
	dbMock.employeeCompensation.findFirst.mockResolvedValue(null)
	dbMock.employeeEmploymentType.findFirst.mockResolvedValue(null)
	dbMock.payrollRun.findFirst.mockResolvedValue(null)
	txMock.employeeCompensation.findFirst.mockResolvedValue({
		basicMonthlySalary: 50000,
		rateType: 'MONTHLY'
	})
	txMock.employeeEmploymentType.findFirst.mockResolvedValue(null)
})

describe('(app)/employees/[id] ?/changeCompensation', () => {
	it('files a proposal for a bare [MANAGER]', async () => {
		await changeCompensation(['MANAGER'])
		expect(createProposal).toHaveBeenCalled()
		expect(txMock.employeeCompensation.create).not.toHaveBeenCalled()
	})

	it('writes directly for a [MANAGER, HR_ADMIN] user', async () => {
		await changeCompensation(['MANAGER', 'HR_ADMIN'])
		expect(createProposal).not.toHaveBeenCalled()
		expect(txMock.employeeCompensation.create).toHaveBeenCalled()
	})
})

describe('PATCH /api/v1/employees/[id]', () => {
	it('files a proposal for a bare [MANAGER] — 202, not applied', async () => {
		const res = await patch(['MANAGER'])
		expect(res.status).toBe(202)
		expect(await res.json()).toMatchObject({ proposalId: 'prop-1' })
		expect(txMock.employeeCompensation.create).not.toHaveBeenCalled()
	})

	it('writes directly for a [MANAGER, HR_ADMIN] user — 200', async () => {
		const res = await patch(['MANAGER', 'HR_ADMIN'])
		expect(res.status).toBe(200)
		expect(await res.json()).not.toHaveProperty('proposalId')
		expect(txMock.employeeCompensation.create).toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: { count: vi.fn(), findMany: vi.fn() },
		payrollPeriod: { count: vi.fn(), findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn() }))

const { load: runsLoad } = await import('../../src/routes/(app)/payroll/+page.server')
const { load: periodsLoad } = await import('../../src/routes/(app)/payroll/periods/+page.server')
const { listPayrollRuns } = await import('../../src/lib/server/services/payroll/index')
const { listPeriods } = await import('../../src/lib/server/services/payroll/periods')

const event = (path: string, roles: Role[]) =>
	({
		locals: { user: { id: 'u1', organizationId: 'org1', roles } },
		cookies: { get: () => undefined },
		url: new URL(`http://localhost${path}`)
	}) as never

const runsArgs = (where: object) => ({
	where,
	orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
	include: { organization: { select: { name: true } } }
})

const periodsArgs = {
	where: { organizationId: 'org1' },
	include: { runs: { select: { id: true, status: true, totalNet: true } } },
	orderBy: [{ startDate: 'desc' }, { id: 'desc' }]
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.payrollRun.count.mockResolvedValue(25)
	dbMock.payrollRun.findMany.mockResolvedValue([])
	dbMock.payrollPeriod.count.mockResolvedValue(25)
	dbMock.payrollPeriod.findMany.mockResolvedValue([])
})

describe('/payroll load', () => {
	it('pages an org-scoped actor, counting on the same where it lists on', async () => {
		const res = (await runsLoad(event('/payroll?page=2', ['PAYROLL_OFFICER']))) as unknown as {
			runs: Promise<unknown>
			pagination: { page: number; total: number }
		}
		await res.runs

		expect(dbMock.payrollRun.count).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
		expect(dbMock.payrollRun.findMany).toHaveBeenCalledWith({
			...runsArgs({ organizationId: 'org1' }),
			skip: 10,
			take: 10
		})
		expect(res.pagination).toMatchObject({ page: 2, total: 25 })
	})

	it('pages a finance approver across tenants, counting on the same wide where', async () => {
		const res = (await runsLoad(event('/payroll?page=3', ['SUPER_ADMIN']))) as unknown as {
			runs: Promise<unknown>
		}
		await res.runs

		expect(dbMock.payrollRun.count).toHaveBeenCalledWith({ where: {} })
		expect(dbMock.payrollRun.findMany).toHaveBeenCalledWith({
			...runsArgs({}),
			skip: 20,
			take: 10
		})
	})

	it('leaves the unpaged API caller unpaged', async () => {
		await listPayrollRuns('org1')
		expect(dbMock.payrollRun.findMany).toHaveBeenCalledWith(runsArgs({ organizationId: 'org1' }))
	})
})

describe('/payroll/periods load', () => {
	it('pages the periods, counting on the same where it lists on', async () => {
		const res = (await periodsLoad(
			event('/payroll/periods?page=2', ['PAYROLL_OFFICER'])
		)) as unknown as { pagination: { page: number; total: number } }

		expect(dbMock.payrollPeriod.count).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
		expect(dbMock.payrollPeriod.findMany).toHaveBeenCalledWith({
			...periodsArgs,
			skip: 10,
			take: 10
		})
		expect(res.pagination).toMatchObject({ page: 2, total: 25 })
	})

	it('leaves the unpaged API caller unpaged', async () => {
		await listPeriods('org1')
		expect(dbMock.payrollPeriod.findMany).toHaveBeenCalledWith(periodsArgs)
	})
})

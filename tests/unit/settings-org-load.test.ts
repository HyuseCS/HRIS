import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * N6 — /settings/org rendered every assignable employee in one page load, filtered on the
 * client. The `load` now reads `?empSearch=`/`?empUnassigned=` from the address, filters, and
 * slices to a page under its own `empPage` param.
 *
 * These pin the load's arithmetic only: which rows survive the filter, how many reach the page,
 * which param the page is read from, and that the Positions catalog is returned unpaged. They
 * do NOT prove the page renders a GET filter form or a <Pagination> — no component harness
 * exists in this repo.
 */

const { listAssignableEmployeesMock, listPositionsMock } = vi.hoisted(() => ({
	listAssignableEmployeesMock: vi.fn(),
	listPositionsMock: vi.fn()
}))

vi.mock('$lib/server/services/settings/org', () => ({
	listPositions: listPositionsMock,
	createPosition: vi.fn(),
	updatePosition: vi.fn(),
	getOrgChart: vi.fn().mockResolvedValue([]),
	listAssignableEmployees: listAssignableEmployeesMock,
	assignEmployeePosition: vi.fn()
}))

vi.mock('$lib/server/services/settings/master', () => ({
	listSalaryGrades: vi.fn().mockResolvedValue([])
}))

const org = await import('../../src/routes/(app)/settings/org/+page.server')

const SUPER: Role[] = ['SUPER_ADMIN']

const employee = (n: number, over: Partial<{ name: string; jobTitle: string }> = {}) => ({
	id: `e${n}`,
	name: `Person ${n}`,
	jobTitle: 'Staff',
	employmentStatus: 'ACTIVE',
	positionId: `p${n}`,
	positionTitle: 'Staff',
	departmentName: null,
	...over
})

const load = (query: string) =>
	org.load({
		locals: { user: { id: 'actor', organizationId: 'org1', roles: SUPER } },
		url: new URL(`http://localhost/settings/org${query}`)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<{
		positions: { id: string }[]
		employees: { positionId: string | null }[]
		employeeTotal: number
		employeePagination: { page: number; total: number; totalPages: number; param: string }
	}>

beforeEach(() => {
	vi.clearAllMocks()
	listPositionsMock.mockResolvedValue([])
	listAssignableEmployeesMock.mockResolvedValue([])
})

describe('/settings/org load', () => {
	it('pages at 20 and uses its own param', async () => {
		listAssignableEmployeesMock.mockResolvedValue(Array.from({ length: 45 }, (_, i) => employee(i)))

		const res = await load('')

		expect(res.employees).toHaveLength(20)
		expect(res.employeePagination.param).toBe('empPage')
		expect(res.employeePagination.totalPages).toBe(3)
	})

	it('does not read the generic page param', async () => {
		listAssignableEmployeesMock.mockResolvedValue(Array.from({ length: 45 }, (_, i) => employee(i)))

		const res = await load('?page=3')

		expect(res.employeePagination.param).not.toBe('page')
		expect(res.employeePagination.page).toBe(1)
		expect(res.employees[0].positionId).toBe('p0')
	})

	it('filters before it pages', async () => {
		listAssignableEmployeesMock.mockResolvedValue([
			...Array.from({ length: 25 }, (_, i) => ({ ...employee(i), positionId: null })),
			...Array.from({ length: 20 }, (_, i) => employee(100 + i))
		])

		const res = await load('?empUnassigned=1&empPage=2')

		expect(res.employeePagination.total).toBe(25)
		expect(res.employeeTotal).toBe(45)
		expect(res.employees).toHaveLength(5)
		for (const e of res.employees) expect(e.positionId).toBeFalsy()
	})

	it('searches name or job title', async () => {
		listAssignableEmployeesMock.mockResolvedValue([
			employee(1, { name: 'Welder, Ana' }),
			employee(2, { jobTitle: 'Senior Welder' }),
			employee(3)
		])

		const res = await load('?empSearch=%20WELDER%20')

		expect(res.employeePagination.total).toBe(2)
		expect(res.employees.map((e) => (e as unknown as { id: string }).id)).toEqual(['e1', 'e2'])
	})

	it('reports the filtered count as N and the full count as M', async () => {
		listAssignableEmployeesMock.mockResolvedValue(Array.from({ length: 30 }, (_, i) => employee(i)))

		const res = await load('')

		expect(res.employeePagination.total).toBe(res.employeeTotal)
		expect(res.employeeTotal).toBe(30)
	})

	it('starts a filter with no page param at page 1', async () => {
		listAssignableEmployeesMock.mockResolvedValue(
			Array.from({ length: 45 }, (_, i) => employee(i, { jobTitle: 'Welder' }))
		)

		const res = await load('?empSearch=welder')

		expect(res.employeePagination.page).toBe(1)
		expect(res.employeePagination.total).toBe(45)
	})

	it('clamps an out-of-range or malformed page instead of serving nothing', async () => {
		listAssignableEmployeesMock.mockResolvedValue(Array.from({ length: 45 }, (_, i) => employee(i)))

		const high = await load('?empPage=99')
		expect(high.employeePagination.page).toBe(3)
		expect(high.employees).toHaveLength(5)

		for (const bad of ['?empPage=abc', '?empPage=-2', '?empPage=0', '?empPage=1.5', '?empPage=']) {
			const res = await load(bad)
			expect(res.employeePagination.page).toBe(1)
			expect(res.employees).toHaveLength(20)
		}
	})

	it('returns the positions catalog whole', async () => {
		listPositionsMock.mockResolvedValue(Array.from({ length: 37 }, (_, i) => ({ id: `p${i}` })))
		listAssignableEmployeesMock.mockResolvedValue(Array.from({ length: 45 }, (_, i) => employee(i)))

		const res = await load('?empPage=2')

		expect(res.positions).toHaveLength(37)
	})
})

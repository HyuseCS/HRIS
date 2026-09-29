import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbMock } = vi.hoisted(() => ({
	dbMock: { auditLog: { count: vi.fn(), findMany: vi.fn() } }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn() }))

const { load } = await import('../../src/routes/(app)/reports/audit-log/+page.server')

const loadAt = (query: string) =>
	load({
		locals: { user: { id: 'u1', organizationId: 'orgA', roles: ['HR_ADMIN'] } },
		url: new URL(`http://localhost/reports/audit-log${query}`)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<any>

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.auditLog.count.mockResolvedValue(0)
	dbMock.auditLog.findMany.mockResolvedValue([])
})

describe('/reports/audit-log load — filters echo back to the form', () => {
	it('returns empty filters when none are set', async () => {
		const data = await loadAt('')

		expect(data.filters).toEqual({ actor: '', entity: '', action: '', start: '', end: '' })
	})

	it('returns every applied filter', async () => {
		const data = await loadAt(
			'?actor=%20jane%20&entity=Employee&action=UPDATE&start=2026-01-01&end=2026-01-31'
		)

		expect(data.filters).toEqual({
			actor: 'jane',
			entity: 'Employee',
			action: 'UPDATE',
			start: '2026-01-01',
			end: '2026-01-31'
		})
		expect(dbMock.auditLog.findMany.mock.calls[0][0].where.createdAt).toEqual({
			gte: new Date('2026-01-01'),
			lte: new Date('2026-01-31')
		})
	})

	it.each(['garbage', '2026-13-01', '2026-02-31', '2026-1-1', '2026-01-01T00:00'])(
		'drops an invalid date %s from both the echo and the query',
		async (bad) => {
			const data = await loadAt(`?start=${encodeURIComponent(bad)}&end=${encodeURIComponent(bad)}`)

			expect(data.filters.start).toBe('')
			expect(data.filters.end).toBe('')
			expect(dbMock.auditLog.findMany.mock.calls[0][0].where).not.toHaveProperty('createdAt')
		}
	)
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dbMock, txMock } = vi.hoisted(() => ({
	dbMock: {
		jobPosting: { findFirst: vi.fn(), update: vi.fn() },
		$transaction: vi.fn()
	},
	txMock: { jobPosting: { update: vi.fn() } }
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
const { writeAuditLog } = await import('$lib/server/audit')
vi.mock('$lib/server/services/notifications', () => ({ notify: vi.fn() }))
vi.mock('$lib/server/services/job-boards', () => ({
	getPostingBoards: vi.fn(),
	liveChannels: vi.fn(),
	removeChannel: vi.fn(),
	setChannel: vi.fn()
}))

const { actions } = await import('../../src/routes/(app)/recruitment/[id]/+page.server')

const project = <T extends Record<string, unknown>>(
	row: T,
	args: { select?: Record<string, true> } | undefined
): T => {
	const fields = args?.select
	if (!fields) return row
	return Object.fromEntries(Object.keys(fields).map((k) => [k, row[k]])) as T
}

type Status = 'DRAFT' | 'PENDING_APPROVAL' | 'OPEN' | 'CLOSED'

const makeRow = (status: Status, postedAt: Date | null = null) => ({
	id: 'jp1',
	organizationId: 'org1',
	status,
	postedAt,
	closedAt: null,
	approvedById: null,
	submittedById: 'user-hr'
})

let row: ReturnType<typeof makeRow> | null = makeRow('DRAFT')

type Result = { status?: number; data?: { error?: string }; saved?: string }

const post = async (status: string) => {
	const fd = new FormData()
	fd.set('status', status)
	const event = {
		request: Object.assign(new Request('http://localhost/recruitment/jp1?/updateStatus'), {
			formData: async () => fd
		}),
		locals: { user: { id: 'user-hr', organizationId: 'org1', roles: ['HR_ADMIN'] } },
		params: { id: 'jp1' },
		getClientAddress: () => '127.0.0.1'
	}
	return (await actions.updateStatus(event as never)) as Result
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.jobPosting.findFirst.mockImplementation(async (args) => (row ? project(row, args) : null))
	dbMock.$transaction.mockImplementation((fn: (client: typeof txMock) => Promise<unknown>) =>
		fn(txMock)
	)
	txMock.jobPosting.update.mockImplementation(async ({ data }) => ({ ...row, ...data }))
})

const expectNothingWritten = () => {
	expect(dbMock.jobPosting.update).not.toHaveBeenCalled()
	expect(txMock.jobPosting.update).not.toHaveBeenCalled()
	expect(writeAuditLog).not.toHaveBeenCalled()
}

describe('updateStatus on a PENDING_APPROVAL posting (#21 T1)', () => {
	it.each(['OPEN', 'CLOSED', 'DRAFT'])('refuses → %s and writes nothing', async (to) => {
		row = makeRow('PENDING_APPROVAL')
		const result = await post(to)
		expect(result.status).toBe(400)
		expect(result.data?.error).toBe(
			'This posting is awaiting approval. Use the approval decision instead.'
		)
		expectNothingWritten()
	})
})

describe('updateStatus allowed transitions (#21 T2, T3)', () => {
	const expectAudited = (from: Status, to: Status) => {
		expect(txMock.jobPosting.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'jp1' },
				data: expect.objectContaining({ status: to })
			})
		)
		expect(writeAuditLog).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: 'UPDATE',
				entityType: 'JobPosting',
				entityId: 'jp1',
				oldValue: { status: from },
				newValue: { status: to }
			}),
			txMock
		)
	}

	it('DRAFT → OPEN publishes and stamps postedAt', async () => {
		row = makeRow('DRAFT')
		const result = await post('OPEN')
		expect(result.saved).toBe('Posting published.')
		expectAudited('DRAFT', 'OPEN')
		expect(txMock.jobPosting.update.mock.calls[0][0].data.postedAt).toBeInstanceOf(Date)
	})

	it('OPEN → CLOSED closes and stamps closedAt', async () => {
		row = makeRow('OPEN', new Date('2026-01-01'))
		const result = await post('CLOSED')
		expect(result.saved).toBe('Posting closed.')
		expectAudited('OPEN', 'CLOSED')
		expect(txMock.jobPosting.update.mock.calls[0][0].data.closedAt).toBeInstanceOf(Date)
	})

	it('CLOSED → OPEN reopens and keeps the original postedAt', async () => {
		row = makeRow('CLOSED', new Date('2026-01-01'))
		const result = await post('OPEN')
		expect(result.saved).toBe('Posting reopened.')
		expectAudited('CLOSED', 'OPEN')
		expect(txMock.jobPosting.update.mock.calls[0][0].data).not.toHaveProperty('postedAt')
	})

	it('OPEN → DRAFT moves back to draft and is audited', async () => {
		row = makeRow('OPEN', new Date('2026-01-01'))
		const result = await post('DRAFT')
		expect(result.saved).toBe('Posting moved back to draft.')
		expectAudited('OPEN', 'DRAFT')
	})
})

describe('updateStatus same-status and scope (#21 T4, T5)', () => {
	it('refuses OPEN → OPEN and writes nothing', async () => {
		row = makeRow('OPEN', new Date('2026-01-01'))
		const result = await post('OPEN')
		expect(result.status).toBe(400)
		expect(result.data?.error).toBe('The posting is already in that status.')
		expectNothingWritten()
	})

	it('scopes the lookup to the organization and 404s when missing', async () => {
		row = null
		const result = await post('OPEN')
		expect(dbMock.jobPosting.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'jp1', organizationId: 'org1' } })
		)
		expect(result.status).toBe(404)
		expect(result.data?.error).toBe('Job posting not found')
		expectNothingWritten()
	})
})

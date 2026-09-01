import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #5 / G2 — positive paths for `setChannel` in `job-boards.ts`.
 *
 * The channel write and its audit row were moved into one `$transaction` with no test that ever
 * reached the succeeding path. `tests/unit/job-boards.test.ts` covers only the pure `liveChannels`
 * helper, so nothing observed that `writeAuditLog` receives the transaction client.
 *
 * `tx` is a SEPARATE object from `dbMock`. With the `(fn) => fn(dbMock)` shape used by 26 other
 * files here, `tx === db` and the third-argument assertion is a tautology.
 *
 * `@prisma/client` is NOT mocked: `job-boards.ts` imports `Prisma` as a VALUE for its
 * `instanceof Prisma.PrismaClientKnownRequestError` checks, and a mock would break them.
 */

const { dbMock, tx } = vi.hoisted(() => ({
	tx: { jobPostingChannel: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() } },
	dbMock: {
		$transaction: vi.fn(),
		jobPosting: { findFirst: vi.fn() },
		jobBoard: { findFirst: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
const { writeAuditLog } = await import('$lib/server/audit')

const { setChannel } = await import('$lib/server/services/job-boards')

/**
 * Emulates Prisma's projection for a top-level `select`. Same helper, same reason, as
 * `recruitment-posting-sod.test.ts`: a flat `mockResolvedValue` hands back the whole fixture
 * whatever the query asked for, so a `select` that stopped fetching `status` would leave the
 * postedAt branch assertions below silently passing.
 */
const project = <T extends Record<string, unknown>>(
	row: T | null,
	args: { select?: Record<string, true> } | undefined
): T | null => {
	if (!row) return null
	const fields = args?.select
	if (!fields) return row
	return Object.fromEntries(Object.keys(fields).map((k) => [k, row[k]])) as T
}

const ORG = 'org1'
const POSTING = 'jp1'
const BOARD = 'jb1'
const KEY = { jobPostingId_jobBoardId: { jobPostingId: POSTING, jobBoardId: BOARD } }

const ctx: AuditContext = {
	organizationId: ORG,
	actorId: 'user-actor',
	actorRoles: ['HR_ADMIN']
}

/** Set what the in-transaction existing-row read returns, honouring its `select`. */
const existing = (row: { id: string; status: string } | null) =>
	tx.jobPostingChannel.findUnique.mockImplementation(
		async (args: { select?: Record<string, true> }) => project(row, args)
	)

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.jobPosting.findFirst.mockImplementation(
		async (args: { select?: Record<string, true> }) => project({ id: POSTING }, args)
	)
	dbMock.jobBoard.findFirst.mockImplementation(
		async (args: { select?: Record<string, true> }) => project({ id: BOARD }, args)
	)
	existing(null)
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('setChannel — ticking a board', () => {
	it('upserts on the transaction client and audits on that same client', async () => {
		await setChannel(ORG, POSTING, BOARD, { posted: true, url: ' https://x.test/job ' }, ctx)

		expect(tx.jobPostingChannel.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: KEY,
				create: expect.objectContaining({
					jobPostingId: POSTING,
					jobBoardId: BOARD,
					status: 'POSTED',
					url: 'https://x.test/job',
					postedById: ctx.actorId
				})
			})
		)
		// The claim under test. `tx` is not `dbMock`, so this fails if the source passes `db`.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({
				action: 'UPDATE',
				entityType: 'JobPostingChannel',
				entityId: `${POSTING}:${BOARD}`,
				newValue: { posted: true, url: 'https://x.test/job' }
			}),
			tx
		)
	})

	it('trims a blank URL to null rather than storing whitespace', async () => {
		await setChannel(ORG, POSTING, BOARD, { posted: true, url: '   ' }, ctx)
		expect(tx.jobPostingChannel.upsert).toHaveBeenCalledWith(
			expect.objectContaining({ create: expect.objectContaining({ url: null }) })
		)
		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({ newValue: { posted: true, url: null } }),
			tx
		)
	})

	it('keeps the original posted date when the board was already live', async () => {
		existing({ id: 'ch1', status: 'POSTED' })
		await setChannel(ORG, POSTING, BOARD, { posted: true, url: 'https://x.test/v2' }, ctx)

		const { update } = tx.jobPostingChannel.upsert.mock.calls[0][0]
		expect(update).not.toHaveProperty('postedAt')
		expect(update).toMatchObject({ status: 'POSTED', url: 'https://x.test/v2', takenDownAt: null })
	})

	it('stamps a fresh posted date when reposting a taken-down board', async () => {
		existing({ id: 'ch1', status: 'TAKEN_DOWN' })
		await setChannel(ORG, POSTING, BOARD, { posted: true, url: null }, ctx)

		const { update } = tx.jobPostingChannel.upsert.mock.calls[0][0]
		expect(update.postedAt).toBeInstanceOf(Date)
	})
})

describe('setChannel — unticking a board', () => {
	it('takes the row down on the transaction client and audits on that same client', async () => {
		existing({ id: 'ch1', status: 'POSTED' })
		await setChannel(ORG, POSTING, BOARD, { posted: false, url: null }, ctx)

		expect(tx.jobPostingChannel.update).toHaveBeenCalledWith({
			where: { id: 'ch1' },
			data: { status: 'TAKEN_DOWN', takenDownAt: expect.any(Date) }
		})
		expect(tx.jobPostingChannel.upsert).not.toHaveBeenCalled()
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(writeAuditLog).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({ newValue: { posted: false, url: null } }),
			tx
		)
	})

	/**
	 * CURRENT behaviour, pinned rather than endorsed: unticking a board that was never posted
	 * returns early, so no audit row is written for the action. Out of scope for #5 — see the
	 * plan's non-goals. If that early return is ever moved, this test is the one that will fail.
	 */
	it('writes nothing at all when the board was never posted', async () => {
		existing(null)
		await setChannel(ORG, POSTING, BOARD, { posted: false, url: null }, ctx)

		expect(tx.jobPostingChannel.update).not.toHaveBeenCalled()
		expect(tx.jobPostingChannel.upsert).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})
})

describe('setChannel — org scoping', () => {
	it('is a 404 for a posting outside the org, with no transaction opened', async () => {
		dbMock.jobPosting.findFirst.mockResolvedValue(null)
		await expect(
			setChannel(ORG, POSTING, BOARD, { posted: true, url: null }, ctx)
		).rejects.toMatchObject({ status: 404, body: { message: 'Job posting not found' } })
		expect(dbMock.jobPosting.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: POSTING, organizationId: ORG } })
		)
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('is a 404 for a board outside the org, with no transaction opened', async () => {
		dbMock.jobBoard.findFirst.mockResolvedValue(null)
		await expect(
			setChannel(ORG, POSTING, BOARD, { posted: true, url: null }, ctx)
		).rejects.toMatchObject({ status: 404, body: { message: 'Job board not found' } })
		expect(dbMock.jobBoard.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: BOARD, organizationId: ORG } })
		)
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #141 announcement byline. The name lives on Employee, not on the User the announcement
 * points at, so the byline is a two-hop join with two legitimate ways to come up short:
 * an author account with no employee record (the seeded CEO has none), and an announcement
 * with no author at all (`Announcement.authorId` is nullable).
 */

const { dbMock, tx } = vi.hoisted(() => ({
	dbMock: { user: { findMany: vi.fn() }, $transaction: vi.fn() },
	// A client object distinct from `dbMock`, so "ran on the transaction" is a real assertion
	// rather than one that would also pass if the call went to the bare client.
	tx: { announcement: { create: vi.fn() } }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('$lib/server/services/notifications', () => ({ notifyMany: vi.fn() }))

const { writeAuditLog } = await import('$lib/server/audit')
const { notifyMany } = await import('$lib/server/services/notifications')
const { announcementAuthorName, createAnnouncement } =
	await import('$lib/server/services/announcements')

describe('announcementAuthorName', () => {
	it('uses the employee’s full name', () => {
		expect(
			announcementAuthorName({
				email: 'hr@veent.ph',
				employee: { firstName: 'Hannah', lastName: 'HR' }
			})
		).toBe('Hannah HR')
	})

	it('falls back to the email local-part when the account has no employee record', () => {
		expect(announcementAuthorName({ email: 'ceo@veent.ph', employee: null })).toBe('ceo')
	})

	it('returns null when the announcement has no author', () => {
		// Callers drop the line entirely rather than render a dangling em dash.
		expect(announcementAuthorName(null)).toBeNull()
	})

	it('returns null rather than an empty byline for a malformed email', () => {
		expect(announcementAuthorName({ email: '@veent.ph', employee: null })).toBeNull()
	})
})

/**
 * #324 — the announcement create, the notification fan-out and the audit row all commit or roll
 * back together. The recipient lookup is deliberately outside: it is a read, and an org-wide one.
 */
describe('createAnnouncement shares one transaction', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx))
		dbMock.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }])
		tx.announcement.create.mockResolvedValue({ id: 'ann-1', title: 'Holiday' })
	})

	it('writes the announcement, the notifications and the audit row on the transaction', async () => {
		const ctx = { organizationId: 'org1', actorId: 'user-actor', actorRoles: [], ipAddress: '::1' }

		await createAnnouncement('org1', { title: 'Holiday', body: 'Closed Monday' }, ctx)

		expect(tx.announcement.create).toHaveBeenCalled()
		expect(notifyMany).toHaveBeenCalledWith(
			['user-1', 'user-2'],
			'Holiday',
			'/dashboard',
			'ANNOUNCEMENT',
			tx
		)
		// #324: the audit write shares the transaction.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('gathers the recipient list outside the transaction', async () => {
		const ctx = { organizationId: 'org1', actorId: 'user-actor', actorRoles: [], ipAddress: '::1' }

		await createAnnouncement('org1', { title: 'Holiday', body: 'Closed Monday' }, ctx)

		// The org-wide scan is a read; holding it inside would stretch the transaction for nothing.
		expect(dbMock.user.findMany).toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #283/D11 — clearing a document's sign-off clears `verifiedAt` ONLY.
 *
 * VALIDATE found the F3 bar bypassable in one click: `actions.verifyDoc` accepts verified=false,
 * and this writer used to null `verifiedById` as well. A barred approver un-verified their own
 * sign-off, decided the request, and the selfVerifiedEvidence audit marker never fired — with
 * AC-19 passing the whole time, because the guard was live and the field it reads had been erased.
 * "The test is green" and "the guard works" are different claims.
 *
 * The premise that makes the fix safe: nothing in src/ reads `verifiedById` for "is it verified" —
 * all six consumers key on `verifiedAt`. So the column can change meaning from "who currently
 * verifies" to "who last signed off" without touching any of them.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		request: { findFirst: vi.fn() },
		requestDocument: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			create: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn()
		},
		$transaction: vi.fn()
	}
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

// #5: the sign-off, attach and tombstone writes each share a transaction with their audit entry,
// so those mutations run on `tx`. `evictTombstonedBytes` is deliberately NOT transactional and
// still runs on `dbMock` — its tests below are unchanged.
const tx = {
	requestDocument: { update: vi.fn(), updateMany: vi.fn(), create: vi.fn() }
}
const { storageMock } = vi.hoisted(() => ({
	storageMock: {
		saveFile: vi.fn(),
		deleteStoredFile: vi.fn(),
		isAllowedType: vi.fn(),
		contentMatchesType: vi.fn()
	}
}))
vi.mock('$lib/server/storage', () => ({ ...storageMock, MAX_UPLOAD_BYTES: 1 }))

const {
	setRequestDocumentVerified,
	evictTombstonedBytes,
	saveRequestDocuments,
	deleteRequestDocument
} = await import('$lib/server/services/requests/documents')
const { writeAuditLog } = await import('$lib/server/audit')

const CTX = {
	organizationId: 'org1',
	actorId: 'user-signer',
	actorRoles: ['APPROVER' as const],
	ipAddress: 'test'
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.requestDocument.findFirst.mockResolvedValue({
		id: 'doc1',
		requestId: 'req1',
		storageKey: 'k',
		request: { id: 'req1', employeeId: 'emp-owner' }
	})
	tx.requestDocument.update.mockResolvedValue({ id: 'doc1' })
	storageMock.deleteStoredFile.mockResolvedValue(undefined)
	storageMock.isAllowedType.mockReturnValue(true)
	storageMock.contentMatchesType.mockReturnValue(true)
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('setRequestDocumentVerified (#283/D11)', () => {
	it('records the signer on a verify', async () => {
		await setRequestDocumentVerified('doc1', 'org1', true, CTX)

		expect(tx.requestDocument.update).toHaveBeenCalledWith({
			where: { id: 'doc1' },
			data: { verifiedById: 'user-signer', verifiedAt: expect.any(Date) }
		})
		// #5: the audit write shares the transaction that commits the sign-off.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	// The whole of AC-28's service half. Asserting the exact `data` payload is the point: the bug
	// was one extra key in it, and any looser assertion passes with the key restored.
	it('clearing keeps verifiedById and nulls only verifiedAt (#283/AC-28)', async () => {
		await setRequestDocumentVerified('doc1', 'org1', false, CTX)

		expect(tx.requestDocument.update).toHaveBeenCalledWith({
			where: { id: 'doc1' },
			data: { verifiedAt: null }
		})
		expect(tx.requestDocument.update.mock.calls[0][0].data).not.toHaveProperty('verifiedById')
	})

	// #299/D-1 — a tombstone can be neither verified nor un-verified. Asserting that `update` never
	// ran matters as much as the status: a refusal that still wrote would be a 409 in name only.
	it('refuses to verify a removed document (#299/D-1)', async () => {
		dbMock.requestDocument.findFirst.mockResolvedValue({
			id: 'doc1',
			requestId: 'req1',
			storageKey: 'k',
			deletedAt: new Date(),
			request: { id: 'req1', employeeId: 'emp-owner' }
		})

		await expect(setRequestDocumentVerified('doc1', 'org1', true, CTX)).rejects.toMatchObject({
			status: 409,
			body: { message: 'Removed documents cannot be verified' }
		})
		expect(tx.requestDocument.update).not.toHaveBeenCalled()
	})

	// Un-verifying is refused on the same footing. The clear path writes a different payload, so it
	// is a genuinely separate branch and not a restatement of the case above.
	it('refuses to un-verify a removed document too (#299/D-1)', async () => {
		dbMock.requestDocument.findFirst.mockResolvedValue({
			id: 'doc1',
			requestId: 'req1',
			storageKey: null,
			deletedAt: new Date(),
			request: { id: 'req1', employeeId: 'emp-owner' }
		})

		await expect(setRequestDocumentVerified('doc1', 'org1', false, CTX)).rejects.toMatchObject({
			status: 409
		})
		expect(tx.requestDocument.update).not.toHaveBeenCalled()
	})
})

/**
 * #299/AC-3 — the FIFO byte eviction.
 *
 * The invariant every case here defends: rows are NEVER removed, only bytes. `verifiedById` is what
 * the #283/F3 bar reads, and losing it is the whole defect #299 exists to close — so `delete` and
 * `deleteMany` are asserted never-called rather than merely left unmentioned.
 */
describe('FIFO byte eviction (#299)', () => {
	type Row = { id: string; storageKey: string | null; deletedAt: Date | null }

	const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 0, min))

	// Emulates the helper's own where + orderBy against a fixture, so "live documents are untouched"
	// is proven by the QUERY rather than assumed. A flat mockResolvedValue would hand every row back
	// regardless of the filter and make that claim vacuous.
	const seed = (rows: Row[]) =>
		dbMock.requestDocument.findMany.mockImplementation(async (args: never) => {
			const where = (args as { where?: Record<string, { not?: unknown }> }).where ?? {}
			return rows
				.filter((r) => !('deletedAt' in where) || r.deletedAt !== null)
				.filter((r) => !('storageKey' in where) || r.storageKey !== null)
				.sort((a, b) => Number(a.deletedAt) - Number(b.deletedAt))
				.map((r) => ({ id: r.id, storageKey: r.storageKey }))
		})

	const keys = () => storageMock.deleteStoredFile.mock.calls.map((c) => c[0])

	// A,B,C,D removed in that order. `deletedAt` ASCENDING is the FIFO key — asserted on the query
	// itself, because the mock above would happily sort by anything and a switch to `uploadedAt`
	// evicts the wrong file the moment documents are removed out of upload order.
	const FOUR: Row[] = [
		{ id: 'A', storageKey: 'kA', deletedAt: at(1) },
		{ id: 'B', storageKey: 'kB', deletedAt: at(2) },
		{ id: 'C', storageKey: 'kC', deletedAt: at(3) },
		{ id: 'D', storageKey: 'kD', deletedAt: at(4) }
	]

	it('evicts only the oldest file once a 4th tombstone appears', async () => {
		seed(FOUR)

		await evictTombstonedBytes('req1', 3)

		expect(keys()).toEqual(['kA'])
		expect(dbMock.requestDocument.update).toHaveBeenCalledTimes(1)
		expect(dbMock.requestDocument.update).toHaveBeenCalledWith({
			where: { id: 'A' },
			data: { storageKey: null }
		})
		// The invariant, asserted rather than assumed.
		expect(dbMock.requestDocument.delete).not.toHaveBeenCalled()
		expect(dbMock.requestDocument.deleteMany).not.toHaveBeenCalled()
	})

	it('selects only tombstoned rows that still claim a file, oldest deletedAt first', async () => {
		seed(FOUR)

		await evictTombstonedBytes('req1', 3)

		expect(dbMock.requestDocument.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { requestId: 'req1', deletedAt: { not: null }, storageKey: { not: null } },
				orderBy: { deletedAt: 'asc' }
			})
		)
	})

	// The ordering contract as a test, not a comment. Null the key first and the pointer is gone
	// while the file remains — an orphan sweep-orphan-uploads.ts can never reclaim, because it works
	// by matching keys against disk and a nulled row claims nothing.
	it('unlinks the file BEFORE nulling its key', async () => {
		seed(FOUR)

		await evictTombstonedBytes('req1', 3)

		expect(storageMock.deleteStoredFile.mock.invocationCallOrder[0]).toBeLessThan(
			dbMock.requestDocument.update.mock.invocationCallOrder[0]
		)
	})

	it('evicts nothing while the tombstones are still within the cap', async () => {
		seed(FOUR.slice(0, 3))

		await evictTombstonedBytes('req1', 3)

		expect(storageMock.deleteStoredFile).not.toHaveBeenCalled()
		expect(dbMock.requestDocument.update).not.toHaveBeenCalled()
	})

	// D-6, the terminal mode. The request is closed, so the cap stops applying and every tombstoned
	// file goes — but the LIVE document keeps its bytes, so an auditor can still open what was
	// actually approved.
	it('evicts every tombstoned file at keepNewest 0 and leaves live documents alone', async () => {
		seed([...FOUR, { id: 'LIVE', storageKey: 'kLIVE', deletedAt: null }])

		await evictTombstonedBytes('req1', 0)

		expect(keys()).toEqual(['kA', 'kB', 'kC', 'kD'])
		expect(keys()).not.toContain('kLIVE')
		expect(dbMock.requestDocument.update).toHaveBeenCalledTimes(4)
	})

	// P-3 — a genuine unlink failure must NOT null the key. Nulling anyway strands the file
	// permanently; leaving the key means the next eviction cycle retries it. And the loop keeps
	// going: one bad file must not hold the rest of a closed request's bytes hostage.
	it('leaves the key in place when the unlink fails, and carries on', async () => {
		seed(FOUR)
		storageMock.deleteStoredFile.mockImplementation(async (key: string) => {
			if (key === 'kA') throw new Error('EACCES')
		})

		await evictTombstonedBytes('req1', 0)

		expect(keys()).toEqual(['kA', 'kB', 'kC', 'kD'])
		const updated = dbMock.requestDocument.update.mock.calls.map((c) => c[0].where.id)
		expect(updated).toEqual(['B', 'C', 'D'])
	})

	// Belt and braces: an already-evicted row claims no file, so it is never handed to the storage
	// layer a second time. (storage.ts swallows ENOENT anyway, so this is about not asking.)
	it('never re-unlinks a tombstone whose bytes are already gone', async () => {
		seed([
			{ id: 'GONE', storageKey: null, deletedAt: at(0) },
			{ id: 'A', storageKey: 'kA', deletedAt: at(1) }
		])

		await evictTombstonedBytes('req1', 0)

		expect(keys()).toEqual(['kA'])
		expect(storageMock.deleteStoredFile).not.toHaveBeenCalledWith(null)
	})
})

/**
 * #299/AC-6 + D-5 — the 5-document cap counts LIVE documents.
 *
 * `assertValidRequestUploads` is a pure function taking `existingCount`, so it cannot see a
 * tombstone; the behaviour lives entirely in the QUERY SHAPE `saveRequestDocuments` builds, which
 * is why the case is here and not in request-documents.test.ts with the other cap tests.
 *
 * Counting tombstones would ratchet the cap down instead of holding it — after two swaps a
 * requester is locked out of their own still-editable request.
 */
describe('saveRequestDocuments counts live documents only (#299/AC-6)', () => {
	it('filters the cap _count on deletedAt: null', async () => {
		dbMock.request.findFirst.mockResolvedValue({
			id: 'req1',
			status: 'PENDING',
			_count: { documents: 0 }
		})
		storageMock.saveFile.mockResolvedValue({ storageKey: 'k', size: 1 })
		tx.requestDocument.create.mockResolvedValue({ id: 'doc1' })

		await saveRequestDocuments(
			'req1',
			'emp-owner',
			'org1',
			[{ fileName: 'a.pdf', mimeType: 'application/pdf', bytes: Buffer.from('a') }],
			CTX
		)

		expect(dbMock.request.findFirst.mock.calls[0][0].select._count).toEqual({
			select: { documents: { where: { deletedAt: null } } }
		})
	})
})

/**
 * #299 — the tombstone transition is conditional.
 *
 * The `verifiedAt`/`deletedAt` guards above it run against a SEPARATE read, so an id-only update
 * lets two concurrent removals both write `deletedAt` and both write a DELETE audit entry, and
 * lets a verify landing in between tombstone a now-verified document. Re-asserting both
 * preconditions in the WHERE is what makes the transition happen exactly once.
 */
describe('deleteRequestDocument guards the transition it already checked (#299)', () => {
	beforeEach(() => {
		dbMock.request.findFirst.mockResolvedValue({ id: 'req1', status: 'PENDING' })
		dbMock.requestDocument.findMany.mockResolvedValue([])
	})

	it('re-asserts deletedAt and verifiedAt in the update WHERE', async () => {
		tx.requestDocument.updateMany.mockResolvedValue({ count: 1 })

		await deleteRequestDocument('doc1', 'emp-owner', 'org1', CTX)

		expect(tx.requestDocument.updateMany.mock.calls[0][0].where).toEqual({
			id: 'doc1',
			deletedAt: null,
			verifiedAt: null
		})
		expect(dbMock.requestDocument.delete).not.toHaveBeenCalled()
		expect(dbMock.requestDocument.deleteMany).not.toHaveBeenCalled()
	})

	it('409s and writes no audit entry when the row moved under it', async () => {
		tx.requestDocument.updateMany.mockResolvedValue({ count: 0 })

		await expect(deleteRequestDocument('doc1', 'emp-owner', 'org1', CTX)).rejects.toMatchObject({
			status: 409
		})
		expect(writeAuditLog).not.toHaveBeenCalled()
		expect(storageMock.deleteStoredFile).not.toHaveBeenCalled()
	})
})

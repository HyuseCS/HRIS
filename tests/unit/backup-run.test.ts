import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
	collectDocuments,
	copyAll,
	backupNotificationMessage,
	runBackupForOrg,
	sweepStaleRuns,
	type BackupIo,
	type PendingFile
} from '$lib/server/backup/run'

const uploadedAt = new Date('2026-02-11T03:12:44.000Z')

function pending(id: string, storageKey: string, size = 3): PendingFile {
	return {
		source: 'employeeDocument',
		id,
		storageKey,
		employeeId: 'e1',
		employeeNumber: 'EMP-015',
		employeeName: 'Dela Cruz, Juan',
		category: 'CONTRACT',
		requestId: null,
		label: 'Signed contract 2026',
		fileName: 'contract-signed.pdf',
		mimeType: 'application/pdf',
		size,
		uploadedAt
	}
}

function io(over: Partial<BackupIo> = {}): BackupIo {
	return {
		readStoredFile: async () => Buffer.from('pdf'),
		writeObject: async () => {},
		readObject: async () => null,
		listRunIds: async () => [],
		deleteRun: async () => {},
		checkFreeSpace: async () => {},
		...over
	}
}

// T-U-03 — one bad file costs one manifest entry, never the whole run (ST1).
describe('copyAll (T-U-03)', () => {
	const files = ['a', 'b', 'c', 'd', 'e'].map((k, i) => pending(`doc${i}`, `employees/e1/${k}.pdf`))

	it('records the unreadable file and copies the other four', async () => {
		const written: string[] = []
		const result = await copyAll(
			files,
			'org_a/run1',
			io({
				readStoredFile: async (key) => {
					if (key === 'employees/e1/c.pdf') throw new Error('ENOENT')
					return Buffer.from('pdf')
				},
				writeObject: async (relPath) => void written.push(relPath)
			})
		)

		expect(result.copied).toHaveLength(4)
		expect(result.failed).toHaveLength(1)
		expect(result.failed[0]).toMatchObject({ id: 'doc2', reason: 'read-error' })
		expect(written).toHaveLength(4)
		expect(written).not.toContain('org_a/run1/files/employees/e1/c.pdf')
	})

	it('records a write failure distinctly from a read failure', async () => {
		const result = await copyAll(
			files.slice(0, 1),
			'org_a/run1',
			io({
				writeObject: async () =>
					void (() => {
						throw new Error('403')
					})()
			})
		)
		expect(result.failed[0].reason).toBe('write-error')
	})

	it('hashes the bytes it actually wrote, and totals only what succeeded', async () => {
		const bytes = Buffer.from('the real contents')
		const result = await copyAll(
			files.slice(0, 1),
			'org_a/run1',
			io({ readStoredFile: async () => bytes })
		)
		expect(result.copied[0].sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
		// The manifest size is the bytes on disk, not the possibly-stale `size` column.
		expect(result.copied[0].size).toBe(bytes.byteLength)
		expect(result.totalBytes).toBe(bytes.byteLength)
	})

	it('writes each object under files/ + storageKey inside the run prefix', async () => {
		const written: string[] = []
		await copyAll(
			files.slice(0, 1),
			'org_a/run1',
			io({ writeObject: async (p) => void written.push(p) })
		)
		expect(written[0]).toBe('org_a/run1/files/employees/e1/a.pdf')
	})
})

// T-U-11 — a failure alert cannot leak document content (S8).
describe('backupNotificationMessage (T-U-11)', () => {
	it('carries counts and nothing else', () => {
		const msg = backupNotificationMessage(1, 412)
		expect(msg).toBe(
			'Nightly document backup finished with errors (1 of 412 files could not be copied). Open Settings → Document Backup.'
		)
	})

	it('names no filename, employee, path, bucket or endpoint', () => {
		const msg = backupNotificationMessage(3, 5)
		for (const secret of [
			'contract-signed.pdf',
			'Dela Cruz',
			'/home/hyuse',
			'/app/backups',
			'veent-backups',
			'sgp1.example.com',
			'employees/e1'
		]) {
			expect(msg).not.toContain(secret)
		}
	})
})

// E-08 — a directory that HAS a manifest is a COMPLETE backup whose status write was
// lost. Flipping it to FAILED and letting the prune pass delete it destroys a good backup.
describe('sweepStaleRuns (E-08)', () => {
	const old = new Date('2026-08-21T00:00:00.000Z')
	const now = new Date('2026-08-22T02:30:00.000Z')

	function fakeDb(runs: { id: string; runId: string; startedAt: Date }[]) {
		const updates: { id: string; data: Record<string, unknown> }[] = []
		return {
			updates,
			db: {
				backupRun: {
					findMany: vi.fn(async () => runs),
					update: vi.fn(
						async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
							updates.push({ id: where.id, data })
							return {}
						}
					)
				}
			}
		}
	}

	it('promotes a stale RUNNING row whose manifest is on the destination', async () => {
		const { db, updates } = fakeDb([{ id: 'r1', runId: 'run1', startedAt: old }])
		const manifest = {
			counts: { files: 4, skipped: 1, failed: 0, totalBytes: 900 }
		}
		const deleted: string[] = []
		await sweepStaleRuns(
			db as never,
			'org_a',
			io({
				readObject: async () => Buffer.from(JSON.stringify(manifest)),
				deleteRun: async (_o, id) => void deleted.push(id)
			}),
			now
		)

		expect(updates[0].data).toMatchObject({
			status: 'SUCCESS',
			fileCount: 4,
			skippedCount: 1,
			failedCount: 0
		})
		expect(deleted).toEqual([])
	})

	it('records PARTIAL when the recovered manifest reports failures', async () => {
		const { db, updates } = fakeDb([{ id: 'r1', runId: 'run1', startedAt: old }])
		await sweepStaleRuns(
			db as never,
			'org_a',
			io({
				readObject: async () =>
					Buffer.from(
						JSON.stringify({ counts: { files: 3, skipped: 0, failed: 2, totalBytes: 7 } })
					)
			}),
			now
		)
		expect(updates[0].data).toMatchObject({ status: 'PARTIAL', failedCount: 2 })
	})

	// A manifest that is truncated, or missing/garbage counts, is NOT a complete backup.
	// It must be treated as "no manifest" — an unguarded JSON.parse throws out of the sweep,
	// and because the sweep runs first inside runBackupForOrg's pre-flight try, that catch
	// records a FAILED row and returns WITHOUT resolving the RUNNING row. Every later night
	// hits the same file and wedges: the organization never backs up again.
	it.each([
		['truncated mid-write', '{"counts": {"files": 4, "skipp'],
		['no counts key at all', '{"startedAt":"2026-08-21T00:00:00.000Z"}'],
		[
			'counts present but not numbers',
			'{"counts":{"files":null,"skipped":1,"failed":0,"totalBytes":9}}'
		],
		['empty file', '']
	])('reclaims a run whose manifest is %s instead of throwing', async (_label, body) => {
		const { db, updates } = fakeDb([{ id: 'r1', runId: 'run1', startedAt: old }])
		const deleted: string[] = []
		await expect(
			sweepStaleRuns(
				db as never,
				'org_a',
				io({
					readObject: async () => Buffer.from(body),
					deleteRun: async (_o, id) => void deleted.push(id)
				}),
				now
			)
		).resolves.toBeUndefined()

		// Positive assertions: the row IS resolved and the bad directory IS removed.
		expect(updates[0].data).toMatchObject({ status: 'FAILED' })
		expect(deleted).toEqual(['run1'])
	})

	it('fails and removes a stale run with no manifest — that one really is debris', async () => {
		const { db, updates } = fakeDb([{ id: 'r1', runId: 'run1', startedAt: old }])
		const deleted: string[] = []
		await sweepStaleRuns(
			db as never,
			'org_a',
			io({ readObject: async () => null, deleteRun: async (_o, id) => void deleted.push(id) }),
			now
		)
		expect(updates[0].data).toMatchObject({ status: 'FAILED' })
		expect(deleted).toEqual(['run1'])
	})
})

// T-U-15 — D3 exactly, and the eighth-includer promise in the schema comment.
describe('collectDocuments (T-U-15)', () => {
	const employee = {
		id: 'e1',
		employeeNumber: 'EMP-015',
		lastName: 'Dela Cruz',
		firstName: 'Juan'
	}

	function fakeDb() {
		const args: { employeeDocument?: unknown; requestDocument?: unknown } = {}
		return {
			args,
			db: {
				employeeDocument: {
					findMany: vi.fn(async (a: unknown) => {
						args.employeeDocument = a
						return [
							{
								id: 'ed1',
								storageKey: 'employees/e1/a.pdf',
								category: 'CONTRACT',
								label: 'Contract',
								fileName: 'a.pdf',
								mimeType: 'application/pdf',
								size: 10,
								uploadedAt,
								employee
							},
							{
								id: 'ed2',
								storageKey: 'employees/e1/b.pdf',
								category: 'OTHER',
								label: 'Other',
								fileName: 'b.pdf',
								mimeType: 'application/pdf',
								size: 20,
								uploadedAt,
								employee
							}
						]
					})
				},
				requestDocument: {
					findMany: vi.fn(async (a: unknown) => {
						args.requestDocument = a
						return [
							{
								id: 'rd1',
								requestId: 'req1',
								storageKey: 'requests/req1/x.jpg',
								label: 'Live doc',
								fileName: 'x.jpg',
								mimeType: 'image/jpeg',
								size: 30,
								uploadedAt,
								deletedAt: null,
								request: { employee }
							},
							{
								// Tombstoned but the BYTES ARE STILL THERE — must be backed up.
								id: 'rd2',
								requestId: 'req1',
								storageKey: 'requests/req1/y.jpg',
								label: 'Removed but not evicted',
								fileName: 'y.jpg',
								mimeType: 'image/jpeg',
								size: 40,
								uploadedAt,
								deletedAt: new Date('2026-01-04T05:00:00.000Z'),
								request: { employee }
							},
							{
								// Tombstoned AND evicted — nothing to copy, but the row must be recorded.
								id: 'rd3',
								requestId: 'req1',
								storageKey: null,
								label: 'Medical certificate',
								fileName: 'med-cert.jpg',
								mimeType: 'image/jpeg',
								size: 50,
								uploadedAt,
								deletedAt: new Date('2026-01-04T05:00:00.000Z'),
								request: { employee }
							}
						]
					})
				}
			}
		}
	}

	it('backs up four files: both employee docs and both request docs that still have bytes', async () => {
		const { db } = fakeDb()
		const out = await collectDocuments(db as never, 'org_veent')
		expect(out.files.map((f) => f.id)).toEqual(['ed1', 'ed2', 'rd1', 'rd2'])
	})

	it('records the evicted row as skipped rather than dropping it', async () => {
		const { db } = fakeDb()
		const out = await collectDocuments(db as never, 'org_veent')
		expect(out.skipped).toHaveLength(1)
		expect(out.skipped[0]).toMatchObject({
			source: 'requestDocument',
			id: 'rd3',
			reason: 'bytes-evicted',
			requestId: 'req1',
			fileName: 'med-cert.jpg'
		})
	})

	it('does NOT filter request documents by deletedAt — the eighth includer (#299)', async () => {
		const { db, args } = fakeDb()
		await collectDocuments(db as never, 'org_veent')
		// The WHERE clause only. `deletedAt` is legitimately SELECTED — the manifest records
		// when an evicted row was tombstoned.
		const where = (args.requestDocument as { where: unknown }).where
		expect(JSON.stringify(where)).not.toContain('deletedAt')
	})

	it('scopes both queries to the organization through the relation (S6)', async () => {
		const { db, args } = fakeDb()
		await collectDocuments(db as never, 'org_veent')
		expect(args.employeeDocument).toMatchObject({
			where: { employee: { organizationId: 'org_veent' } }
		})
		expect(args.requestDocument).toMatchObject({
			where: { request: { employee: { organizationId: 'org_veent' } } }
		})
	})

	it('carries the employee identity a restorer needs into every entry', async () => {
		const { db } = fakeDb()
		const out = await collectDocuments(db as never, 'org_veent')
		expect(out.files[0]).toMatchObject({
			employeeNumber: 'EMP-015',
			employeeName: 'Dela Cruz, Juan',
			category: 'CONTRACT'
		})
		// requestDocument entries have no category and do carry the request id.
		expect(out.files[2]).toMatchObject({ category: null, requestId: 'req1' })
	})
})

// The E-04 mutation pass found this hole: forcing `status = 'SUCCESS'` inside
// runBackupForOrg left every test above green, because they all exercise copyAll and
// nothing asserted what the ORCHESTRATOR does with a non-empty failed[]. AC-6's claim is
// "PARTIAL, never SUCCESS" — this is the test that makes it true.
vi.mock('$lib/server/services/notifications', () => ({ notifyMany: vi.fn(async () => {}) }))

describe('runBackupForOrg status derivation (AC-6, E-04 gap)', () => {
	const now = new Date('2026-08-22T02:30:00.000Z')
	const org = { id: 'org_a', name: 'Veent' }
	const config = { retentionCount: 3, destinationKind: 'LOCAL' as const }

	function fakeDb(docCount: number) {
		const updates: Record<string, unknown>[] = []
		const employee = { id: 'e1', employeeNumber: 'EMP-015', lastName: 'A', firstName: 'B' }
		return {
			updates,
			db: {
				employeeDocument: {
					findMany: async () =>
						Array.from({ length: docCount }, (_, i) => ({
							id: `ed${i}`,
							storageKey: `employees/e1/${i}.pdf`,
							category: 'OTHER',
							label: 'L',
							fileName: 'f.pdf',
							mimeType: 'application/pdf',
							size: 3,
							uploadedAt,
							employee
						}))
				},
				requestDocument: { findMany: async () => [] },
				backupRun: {
					findMany: async () => [],
					findFirst: async () => null,
					create: async () => ({ id: 'row1' }),
					update: async ({ data }: { data: Record<string, unknown> }) => {
						updates.push(data)
						return {}
					}
				},
				user: { findMany: async () => [{ id: 'u1' }] }
			}
		}
	}

	it('is PARTIAL — never SUCCESS — when any file failed', async () => {
		const { db, updates } = fakeDb(3)
		const out = await runBackupForOrg(
			db as never,
			org,
			config,
			io({
				readStoredFile: async (key) => {
					if (key === 'employees/e1/1.pdf') throw new Error('ENOENT')
					return Buffer.from('pdf')
				}
			}),
			now
		)
		expect(out.status).toBe('PARTIAL')
		expect(updates.at(-1)).toMatchObject({ status: 'PARTIAL', fileCount: 2, failedCount: 1 })
	})

	it('is SUCCESS only when nothing failed', async () => {
		const { db } = fakeDb(3)
		const out = await runBackupForOrg(db as never, org, config, io(), now)
		expect(out.status).toBe('SUCCESS')
		expect(out.fileCount).toBe(3)
	})

	it('writes manifest.json LAST — a directory without one is incomplete (AD-008)', async () => {
		const { db } = fakeDb(2)
		const written: string[] = []
		await runBackupForOrg(
			db as never,
			org,
			config,
			io({ writeObject: async (p) => void written.push(p) }),
			now
		)
		expect(written.at(-1)).toMatch(/manifest\.json$/)
		expect(written.filter((p) => p.endsWith('manifest.json'))).toHaveLength(1)
	})

	it('records FAILED and removes the partial directory when the destination breaks', async () => {
		const { db, updates } = fakeDb(2)
		const deleted: string[] = []
		const out = await runBackupForOrg(
			db as never,
			org,
			config,
			io({
				checkFreeSpace: async () => {},
				writeObject: async () => {
					throw new Error('connect ECONNREFUSED https://sgp1.example.com')
				},
				deleteRun: async (_o, id) => void deleted.push(id)
			}),
			now
		)
		// copyAll turns per-file write errors into failed[], so the run still completes as
		// PARTIAL; the manifest write is what fails outright here.
		expect(out.status).toBe('FAILED')
		expect(deleted).toHaveLength(1)
		expect(updates.at(-1)).toMatchObject({ status: 'FAILED' })
	})

	it('sanitizes the destination out of the stored error (S4)', async () => {
		const { db, updates } = fakeDb(1)
		await runBackupForOrg(
			db as never,
			org,
			config,
			io({
				writeObject: async () => {
					throw new Error('PUT https://sgp1.example.com failed: AKIASECRET denied')
				}
			}),
			now,
			['https://sgp1.example.com', 'AKIASECRET']
		)
		const stored = String((updates.at(-1) as { error: string }).error)
		expect(stored).not.toContain('AKIASECRET')
		expect(stored).not.toContain('sgp1.example.com')
		expect(stored).toContain('[redacted]')
	})
})

// ─── Adversarial-review findings C-1, C-2 and H-1 ────────────────────────────────────
//
// The fake below HONOURS the `where` clause it is given. That is the whole point: a stub
// that returns its fixture regardless of the filter would pass against the broken code,
// because the defect IS the filter. `process/context/tests/all-tests.md` names vacuous
// mocks as this repo's #1 false-green mode, and both of these shipped past a green suite.
describe('runBackupForOrg — crash-recovery and refusal paths', () => {
	const now = new Date('2026-08-22T02:30:00.000Z')
	const org = { id: 'org_a', name: 'Veent' }
	const config = { retentionCount: 3, destinationKind: 'LOCAL' as const }
	const employee = { id: 'e1', employeeNumber: 'EMP-015', lastName: 'A', firstName: 'B' }

	type Row = { id: string; runId: string; status: string; startedAt: Date }

	function fakeDb(rows: Row[], docCount = 1) {
		const updates: { id: string; data: Record<string, unknown> }[] = []
		const created: Record<string, unknown>[] = []
		const store = [...rows]
		return {
			updates,
			created,
			db: {
				employeeDocument: {
					findMany: async () =>
						Array.from({ length: docCount }, (_, i) => ({
							id: `ed${i}`,
							storageKey: `employees/e1/${i}.pdf`,
							category: 'OTHER',
							label: 'L',
							fileName: 'f.pdf',
							mimeType: 'application/pdf',
							size: 3,
							uploadedAt,
							employee
						}))
				},
				requestDocument: { findMany: async () => [] },
				backupRun: {
					// Applies status and the startedAt < cutoff filter, exactly as Postgres would.
					findMany: async (a?: { where?: { status?: string; startedAt?: { lt: Date } } }) => {
						const w = a?.where ?? {}
						return store.filter(
							(r) =>
								(w.status === undefined || r.status === w.status) &&
								(w.startedAt?.lt === undefined || r.startedAt < w.startedAt.lt)
						)
					},
					findFirst: async () => null,
					create: async ({ data }: { data: Record<string, unknown> }) => {
						created.push(data)
						store.push({
							id: 'new-row',
							runId: String(data.runId),
							status: 'RUNNING',
							startedAt: now
						})
						return { id: 'new-row' }
					},
					update: async ({
						where,
						data
					}: {
						where: { id: string }
						data: Record<string, unknown>
					}) => {
						updates.push({ id: where.id, data })
						const r = store.find((x) => x.id === where.id)
						if (r && typeof data.status === 'string') r.status = data.status
						return {}
					}
				},
				user: { findMany: async () => [{ id: 'u1' }] }
			}
		}
	}

	// C-1 — the crash window between the manifest write and the status update.
	it('promotes a RUNNING row that HAS a manifest, however young, and never deletes it', async () => {
		// One minute old: far inside STALE_RUN_HOURS, so an age-gated sweep skips it. The
		// advisory lock is held per-org around this whole call, so a RUNNING row that exists
		// here CANNOT belong to a live run — it is a dead process, whatever its age.
		const crashed: Row = {
			id: 'crashed',
			runId: 'run-crashed',
			status: 'RUNNING',
			startedAt: new Date(now.getTime() - 60_000)
		}
		const { db, updates } = fakeDb([crashed])
		const deleted: string[] = []

		await runBackupForOrg(
			db as never,
			org,
			config,
			io({
				readObject: async (relPath) =>
					relPath === 'org_a/run-crashed/manifest.json'
						? Buffer.from(
								JSON.stringify({ counts: { files: 9, skipped: 0, failed: 0, totalBytes: 500 } })
							)
						: null,
				listRunIds: async () => ['run-crashed'],
				deleteRun: async (_o, id) => void deleted.push(id)
			}),
			now
		)

		expect(updates.find((u) => u.id === 'crashed')?.data).toMatchObject({
			status: 'SUCCESS',
			fileCount: 9
		})
		// The complete backup must survive the prune pass that follows.
		expect(deleted).not.toContain('run-crashed')
	})

	it('still FAILS and removes a young RUNNING row with no manifest only once it is stale', async () => {
		const fresh: Row = {
			id: 'fresh',
			runId: 'run-fresh',
			status: 'RUNNING',
			startedAt: new Date(now.getTime() - 60_000)
		}
		const { db, updates } = fakeDb([fresh])
		const deleted: string[] = []
		await runBackupForOrg(
			db as never,
			org,
			config,
			io({ readObject: async () => null, deleteRun: async (_o, id) => void deleted.push(id) }),
			now
		)
		// No manifest and only a minute old — it may still be a run in flight from this very
		// process's perspective, so the STALE_RUN_HOURS gate is kept on THIS branch.
		expect(updates.find((u) => u.id === 'fresh')).toBeUndefined()
	})

	// C-2 — a refused run must not be invisible.
	it('records a FAILED row and notifies when the free-space pre-flight refuses (ST5)', async () => {
		const { db, created, updates } = fakeDb([])
		const { notifyMany } = await import('$lib/server/services/notifications')
		vi.mocked(notifyMany).mockClear()

		const out = await runBackupForOrg(
			db as never,
			org,
			config,
			io({
				checkFreeSpace: async () => {
					throw new Error('insufficient free space at the backup destination')
				}
			}),
			now,
			['/srv/backups', 'veent-backups', 'AKIASECRET']
		)

		expect(out.status).toBe('FAILED')
		// G5: visible in the app, not only in a log file nobody reads.
		expect(created).toHaveLength(1)
		const stored = String((updates.at(-1)?.data.error ?? created[0].error) as string)
		expect(stored).toContain('insufficient free space')
		expect(vi.mocked(notifyMany)).toHaveBeenCalledTimes(1)
		const message = String(vi.mocked(notifyMany).mock.calls[0][1])
		for (const secret of ['/srv/backups', 'veent-backups', 'AKIASECRET']) {
			expect(message).not.toContain(secret)
		}
	})

	it('records a FAILED row when the collector itself throws', async () => {
		const { db, created } = fakeDb([])
		db.employeeDocument.findMany = async () => {
			throw new Error('connection terminated')
		}
		const out = await runBackupForOrg(db as never, org, config, io(), now)
		expect(out.status).toBe('FAILED')
		expect(created).toHaveLength(1)
	})

	// H-1 — ST7: an unreachable destination must abort, not grind through 400 files.
	it('aborts the copy after 5 consecutive write failures instead of trying every file', async () => {
		const { db, updates } = fakeDb([], 40)
		let attempts = 0
		const out = await runBackupForOrg(
			db as never,
			org,
			config,
			io({
				writeObject: async () => {
					attempts++
					throw new Error('connect ECONNREFUSED')
				}
			}),
			now
		)
		expect(out.status).toBe('FAILED')
		// 5 file attempts, then stop. Without the abort this is 40 + the manifest.
		expect(attempts).toBeLessThanOrEqual(5)
		expect(String(updates.at(-1)?.data.error)).toMatch(/destination is unreachable/)
	})

	it('does not abort when failures are scattered rather than consecutive', async () => {
		const { db } = fakeDb([], 12)
		let n = 0
		const out = await runBackupForOrg(
			db as never,
			org,
			config,
			io({
				writeObject: async () => {
					n++
					// Every third file fails: never 5 in a row, so this is a PARTIAL, not an outage.
					if (n % 3 === 0) throw new Error('transient')
				}
			}),
			now
		)
		expect(out.status).toBe('PARTIAL')
		expect(out.fileCount).toBe(8)
		expect(out.failedCount).toBe(4)
	})
})

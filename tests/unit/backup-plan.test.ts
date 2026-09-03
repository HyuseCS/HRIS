import { describe, it, expect } from 'vitest'
import { resolveWithin } from '$lib/server/storage'
import {
	isRunDue,
	runsToPrune,
	makeRunId,
	backupLockKey,
	BACKUP_LOCK_NAMESPACE,
	buildManifest,
	assertDestinationSafe,
	withSingleConnection,
	sanitizeError,
	freeSpaceNeeded
} from '$lib/server/backup/plan'

const day = 24 * 60 * 60 * 1000

// T-U-01 — the containment check the destination writer relies on (S1).
describe('resolveWithin (T-U-01)', () => {
	it('returns a path inside the root for an ordinary key', () => {
		const abs = resolveWithin('/data/uploads', 'a/b.pdf')
		expect(abs).toBe('/data/uploads/a/b.pdf')
	})
	it('refuses traversal out of the root', () => {
		expect(() => resolveWithin('/data/uploads', '../../etc/passwd')).toThrow()
		expect(() => resolveWithin('/data/uploads', 'a/../../b')).toThrow()
		expect(() => resolveWithin('/data/uploads', '/etc/passwd')).toThrow()
	})
	it('refuses a prefix sibling of the root', () => {
		// "/data/uploads-evil/x" starts with "/data/uploads" as a STRING but is outside it.
		expect(() => resolveWithin('/data/uploads', '../uploads-evil/x')).toThrow()
	})
	it('refuses the root itself (E-18) — a directory is never a valid object', () => {
		expect(() => resolveWithin('/data/uploads', '')).toThrow()
		expect(() => resolveWithin('/data/uploads', '.')).toThrow()
		expect(() => resolveWithin('/data/uploads', './')).toThrow()
	})
})

// T-U-02 — a backup can never be written inside UPLOAD_DIR, in either direction (S2).
describe('assertDestinationSafe (T-U-02)', () => {
	it('refuses a destination inside the upload dir', () => {
		expect(() => assertDestinationSafe('/data/uploads', '/data/uploads/backups')).toThrow(
			/backup destination must not be inside UPLOAD_DIR/
		)
	})
	it('refuses an upload dir inside the destination', () => {
		expect(() => assertDestinationSafe('/data/uploads', '/data')).toThrow(
			/backup destination must not be inside UPLOAD_DIR/
		)
	})
	it('refuses the two being the same directory', () => {
		expect(() => assertDestinationSafe('/data/uploads', '/data/uploads')).toThrow()
	})
	it('accepts genuinely separate trees', () => {
		expect(() => assertDestinationSafe('/data/uploads', '/data/backups')).not.toThrow()
	})
	it('resolves relative and dot-segment forms before comparing', () => {
		expect(() => assertDestinationSafe('./uploads', 'uploads/../uploads/bk')).toThrow()
		expect(() => assertDestinationSafe('./uploads', './uploads/../backups')).not.toThrow()
	})
	it('does not confuse a prefix sibling with containment', () => {
		expect(() => assertDestinationSafe('/data/uploads', '/data/uploads-backup')).not.toThrow()
	})
})

// T-U-04 — a crashed half-written run can never displace a good backup (ST2).
describe('runsToPrune (T-U-04)', () => {
	const at = (n: number) => new Date(Date.UTC(2026, 0, n))
	const runs = [
		{ id: 'r5', status: 'PARTIAL', startedAt: at(5) },
		{ id: 'r4', status: 'SUCCESS', startedAt: at(4) },
		{ id: 'r3', status: 'FAILED', startedAt: at(3) },
		{ id: 'r2', status: 'RUNNING', startedAt: at(2) },
		{ id: 'r1', status: 'SUCCESS', startedAt: at(1) }
	]

	it('keeps the K newest COMPLETED runs and prunes the rest', () => {
		const pruned = runsToPrune(runs, 2)
			.map((r) => r.id)
			.sort()
		// keeps r5 (PARTIAL) and r4 (SUCCESS); r1 is the third-newest completed run.
		expect(pruned).toEqual(['r1', 'r2', 'r3'])
	})

	it('returns incomplete runs regardless of age, so they never occupy a retention slot', () => {
		const pruned = runsToPrune(runs, 99)
			.map((r) => r.id)
			.sort()
		expect(pruned).toEqual(['r2', 'r3'])
	})

	it('does not depend on the input being pre-sorted', () => {
		const shuffled = [runs[2], runs[0], runs[4], runs[3], runs[1]]
		expect(
			runsToPrune(shuffled, 2)
				.map((r) => r.id)
				.sort()
		).toEqual(['r1', 'r2', 'r3'])
	})

	it('never prunes when retention exceeds the completed count', () => {
		const completed = runs.filter((r) => r.status === 'SUCCESS' || r.status === 'PARTIAL')
		expect(runsToPrune(completed, 5)).toEqual([])
	})
})

// T-U-05 — the #163 failure mode is structurally impossible (ST3), and E-05: the lock
// must not share the single-argument namespace payroll and timesheets use.
describe('backupLockKey (T-U-05)', () => {
	it('is a pure function of the organization id', () => {
		expect(backupLockKey('org_a')).toBe('document-backup:org_a')
		expect(backupLockKey('org_a')).toBe(backupLockKey('org_a'))
		expect(backupLockKey('org_a')).not.toBe(backupLockKey('org_b'))
	})
	it('takes exactly one argument — nothing else can differ between two runs', () => {
		expect(backupLockKey.length).toBe(1)
	})
	it('uses a dedicated two-int lock namespace (E-05)', () => {
		// pg_advisory_lock(bigint) and pg_advisory_lock(int, int) are SEPARATE namespaces.
		// timesheets.ts:185 and payroll/index.ts:110 both use the single-bigint form, and
		// they BLOCK. A collision there would make a minutes-long backup stall payroll.
		expect(BACKUP_LOCK_NAMESPACE).toBe(164)
		expect(Number.isInteger(BACKUP_LOCK_NAMESPACE)).toBe(true)
	})
})

// T-U-06 — lock and unlock land on the same Postgres session (ST4).
describe('withSingleConnection (T-U-06)', () => {
	it('adds connection_limit to a URL with no query', () => {
		const url = withSingleConnection('postgresql://u:p@h:5434/db')
		expect(new URL(url).searchParams.get('connection_limit')).toBe('1')
	})
	it('preserves every existing parameter', () => {
		const url = withSingleConnection('postgresql://u:p@h:5434/db?schema=public&sslmode=require')
		const p = new URL(url).searchParams
		expect(p.get('connection_limit')).toBe('1')
		expect(p.get('schema')).toBe('public')
		expect(p.get('sslmode')).toBe('require')
	})
	it('overrides an existing connection_limit and leaves exactly one', () => {
		const url = withSingleConnection('postgresql://u:p@h:5434/db?connection_limit=10&schema=public')
		expect(url.match(/connection_limit=/g)).toHaveLength(1)
		expect(new URL(url).searchParams.get('connection_limit')).toBe('1')
		expect(new URL(url).searchParams.get('schema')).toBe('public')
	})
})

// T-U-09 — nothing secret can reach BackupRun.error or the UI (S4).
describe('sanitizeError (T-U-09)', () => {
	it('redacts every secret it is given', () => {
		const out = sanitizeError('PUT https://k.s3.example/x failed: AKIAEXAMPLE denied', [
			'AKIAEXAMPLE',
			'https://k.s3.example'
		])
		expect(out).not.toContain('AKIAEXAMPLE')
		expect(out).not.toContain('https://k.s3.example')
		expect(out).toContain('[redacted]')
	})
	it('redacts every occurrence, not just the first', () => {
		const out = sanitizeError('AKIA then AKIA again', ['AKIA'])
		expect(out).toBe('[redacted] then [redacted] again')
	})
	it('is a no-op for an empty secret list', () => {
		expect(sanitizeError('plain message', [])).toBe('plain message')
	})
	it('ignores empty/undefined secrets rather than redacting everything', () => {
		expect(sanitizeError('plain message', ['', undefined as unknown as string])).toBe(
			'plain message'
		)
	})
	it('caps the result at the column width so the write cannot fail', () => {
		expect(sanitizeError('x'.repeat(900), []).length).toBeLessThanOrEqual(500)
	})
})

// T-U-14 — "every # days" behaves as stated (G3), and a failed night does not push the
// next attempt a full interval away (ST8).
describe('isRunDue (T-U-14)', () => {
	const now = new Date('2026-08-22T02:30:00.000Z')
	const enabled = { enabled: true, intervalDays: 3 }

	it('is false when backups are disabled, even if long overdue', () => {
		expect(isRunDue({ enabled: false, intervalDays: 1 }, null, now)).toBe(false)
		expect(isRunDue({ enabled: false, intervalDays: 1 }, new Date(0), now)).toBe(false)
	})
	it('is true when the org has never completed a run', () => {
		expect(isRunDue(enabled, null, now)).toBe(true)
	})
	it('is false before the interval has elapsed', () => {
		expect(isRunDue(enabled, new Date(now.getTime() - 2 * day), now)).toBe(false)
	})
	it('is true once the interval has elapsed', () => {
		expect(isRunDue(enabled, new Date(now.getTime() - 3 * day), now)).toBe(true)
	})
	it('fires once, not N times, after many missed nights', () => {
		expect(isRunDue(enabled, new Date(now.getTime() - 40 * day), now)).toBe(true)
	})
	it('honours intervalDays: 1 as every night', () => {
		const nightly = { enabled: true, intervalDays: 1 }
		expect(isRunDue(nightly, new Date(now.getTime() - day), now)).toBe(true)
		expect(isRunDue(nightly, new Date(now.getTime() - 3600_000), now)).toBe(false)
	})
})

// E-12 — two --force runs in the same second must not share a directory.
describe('makeRunId (E-12)', () => {
	const now = new Date('2026-08-22T02:30:00.000Z')
	it('starts with the sortable UTC timestamp', () => {
		expect(makeRunId(now)).toMatch(/^2026-08-22T023000/)
	})
	it('is unique across calls within the same second', () => {
		const ids = new Set(Array.from({ length: 200 }, () => makeRunId(now)))
		expect(ids.size).toBe(200)
	})
	it('is safe as a path segment', () => {
		expect(makeRunId(now)).toMatch(/^[A-Za-z0-9:.-]+$/)
	})
})

// E-13 — the free-space estimate must account for pruning happening AFTER the run.
describe('freeSpaceNeeded (E-13)', () => {
	it('reserves retentionCount + 1 copies on a fresh destination', () => {
		expect(freeSpaceNeeded(1000, 7, 0)).toBe(8000)
	})
	it('reserves only the incoming copy once K copies already exist', () => {
		expect(freeSpaceNeeded(1000, 7, 7)).toBe(1000)
	})
	it('never returns less than one full copy', () => {
		expect(freeSpaceNeeded(1000, 1, 99)).toBe(1000)
	})
})

// buildManifest — the durable contract with any future restorer (D2 / §6.1).
describe('buildManifest', () => {
	const base = {
		runId: '2026-08-22T023000Z-a1b2',
		generatedAt: new Date('2026-08-22T02:30:00.000Z'),
		organizationId: 'org_veent',
		organizationName: 'Veent',
		files: [
			{
				source: 'employeeDocument' as const,
				id: 'doc1',
				storageKey: 'employees/e1/aaa.pdf',
				employeeId: 'e1',
				employeeNumber: 'EMP-015',
				employeeName: 'Dela Cruz, Juan',
				category: 'CONTRACT',
				requestId: null,
				label: 'Signed contract 2026',
				fileName: 'contract-signed.pdf',
				mimeType: 'application/pdf',
				size: 184320,
				uploadedAt: new Date('2026-02-11T03:12:44.000Z'),
				sha256: '3b1f'
			}
		],
		skipped: [],
		failed: []
	}

	it('versions the shape so a 2027 restore tool can refuse what it does not know', () => {
		expect(buildManifest(base).manifestVersion).toBe(1)
	})
	it('derives path as files/ + storageKey so a restorer needs no name mapping', () => {
		expect(buildManifest(base).files[0].path).toBe('files/employees/e1/aaa.pdf')
	})
	it('always emits skipped and failed, even when empty', () => {
		const m = buildManifest(base)
		expect(m.skipped).toEqual([])
		expect(m.failed).toEqual([])
	})
	it('counts what it contains', () => {
		const m = buildManifest({
			...base,
			skipped: [
				{
					source: 'requestDocument' as const,
					id: 'rd1',
					reason: 'bytes-evicted' as const,
					requestId: 'req1',
					label: 'Medical certificate',
					fileName: 'med-cert.jpg',
					uploadedAt: new Date('2025-11-02T01:00:00.000Z'),
					deletedAt: new Date('2026-01-04T05:00:00.000Z')
				}
			],
			failed: [
				{
					source: 'employeeDocument' as const,
					id: 'doc9',
					storageKey: 'employees/e1/zzz.pdf',
					reason: 'read-error' as const
				}
			]
		})
		expect(m.counts).toEqual({ files: 1, skipped: 1, failed: 1, totalBytes: 184320 })
	})
	it('serializes dates as ISO strings and never emits a Date object', () => {
		const json = JSON.parse(JSON.stringify(buildManifest(base)))
		expect(json.generatedAt).toBe('2026-08-22T02:30:00.000Z')
		expect(json.files[0].uploadedAt).toBe('2026-02-11T03:12:44.000Z')
	})
})

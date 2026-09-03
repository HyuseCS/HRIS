import { randomBytes } from 'node:crypto'
import path from 'node:path'

// The pure core of the nightly document backup (#164). NOTHING in this file may touch the
// filesystem, the network or the database: it is the layer that can be proven exhaustively
// by unit test, and the only reason the rest of the feature can stay thin. `node:path` and
// `node:crypto` are string/byte helpers, not I/O.
//
// Time is always an argument. There is no Date.now() here, so every schedule decision is
// reproducible in a test.

/** Rows still RUNNING after this long are treated as a dead process. */
export const STALE_RUN_HOURS = 12

/**
 * First argument of `pg_try_advisory_lock(int, int)`.
 *
 * The two-int form is a DIFFERENT lock namespace from the single-bigint form used by
 * `timesheets.ts` and `payroll/index.ts` (#164/E-05). Those two BLOCK rather than `try`,
 * and `hashtext()` returns a 32-bit integer, so a hash collision in the shared namespace
 * would stall a payroll write behind a backup that copies every file in the tenant.
 * Keeping backups in their own namespace makes that collision impossible rather than
 * unlikely.
 */
export const BACKUP_LOCK_NAMESPACE = 164

/**
 * The advisory-lock key for one organization.
 *
 * It is a function of the organization id and of NOTHING else — not the run id, not the
 * clock, not the destination. #163's lock was decorative because two overlapping
 * operations derived the key from a range they described differently; a pure one-argument
 * key has no such degree of freedom.
 */
export function backupLockKey(organizationId: string): string {
	return `document-backup:${organizationId}`
}

/**
 * Is this org due for a run?
 *
 * Measured from the last COMPLETED run (SUCCESS or PARTIAL), never from the last attempt:
 * a failed night must not push the next attempt a full interval away. There is no
 * catch-up loop — ten missed nights still produce one backup, because one backup is the
 * whole point.
 */
export function isRunDue(
	cfg: { enabled: boolean; intervalDays: number },
	lastCompletedAt: Date | null,
	now: Date
): boolean {
	if (!cfg.enabled) return false
	if (!lastCompletedAt) return true
	const elapsedMs = now.getTime() - lastCompletedAt.getTime()
	return elapsedMs >= cfg.intervalDays * 24 * 60 * 60 * 1000
}

const COMPLETED = new Set(['SUCCESS', 'PARTIAL'])

/**
 * Which runs' directories may be removed.
 *
 * Only SUCCESS/PARTIAL rows occupy a retention slot, so a crash that left a half-written
 * directory can never displace a good backup (AD-008). Incomplete rows are returned for
 * removal regardless of age — they are the crash debris.
 */
export function runsToPrune<T extends { id: string; status: string; startedAt: Date }>(
	runs: T[],
	retentionCount: number
): T[] {
	const incomplete = runs.filter((r) => !COMPLETED.has(r.status))
	const completed = runs
		.filter((r) => COMPLETED.has(r.status))
		.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
	return [...incomplete, ...completed.slice(Math.max(retentionCount, 0))]
}

/**
 * The run's directory / key prefix.
 *
 * Second resolution alone is not enough (#164/E-12): `--force` run twice inside one second
 * would produce the same id, and the second run would write into the first's directory and
 * silently merge two backups. The random suffix rules that out, and the leading timestamp
 * keeps the directories sorting chronologically.
 *
 * The suffix is EIGHT bytes, not two. Two bytes is a 16-bit space, and by the birthday
 * bound 200 ids drawn in the same second collide about 26% of the time — the uniqueness
 * test caught it failing roughly every other run. That was the implementation being wrong,
 * not the test being flaky: a collision here silently merges two backups into one
 * directory. At 64 bits the same 200 draws collide with probability ~1e-15.
 */
export function makeRunId(now: Date): string {
	const stamp = now
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d+Z$/, 'Z')
	const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 11)}${stamp.slice(11)}`
	return `${iso}-${randomBytes(8).toString('hex')}`
}

/**
 * Refuse a destination that is inside UPLOAD_DIR, or that contains it (S2).
 *
 * Either direction is fatal: a backup written under UPLOAD_DIR means every night's run
 * copies the previous night's backup, and the orphan sweep sees the whole tree as garbage.
 * Called before any organization is processed, so a misconfigured box writes nothing at all.
 */
export function assertDestinationSafe(uploadDir: string, backupDir: string): void {
	const up = path.resolve(uploadDir)
	const bk = path.resolve(backupDir)
	// `+ path.sep` on both sides: a bare startsWith would call "/data/uploads-backup" a
	// child of "/data/uploads".
	if (up === bk || bk.startsWith(up + path.sep) || up.startsWith(bk + path.sep)) {
		throw new Error(
			'backup destination must not be inside UPLOAD_DIR (or contain it) — refusing to start'
		)
	}
}

/**
 * Pin a Prisma connection string to a single connection.
 *
 * A session-level advisory lock lives on ONE connection. Prisma pools, so without this the
 * lock and the unlock can land on different connections and the unlock silently no-ops.
 */
export function withSingleConnection(databaseUrl: string): string {
	const url = new URL(databaseUrl)
	url.searchParams.set('connection_limit', '1')
	return url.toString()
}

/** Max length of BackupRun.error — the column is VarChar(500) and is rendered in the UI. */
const ERROR_MAX = 500

/**
 * Strip every known secret out of a message before it is stored or printed (S4).
 *
 * The caller passes the actual values (access key, secret, endpoint, bucket, absolute
 * destination path) rather than a pattern, because a pattern that tries to recognise a
 * credential is a pattern that will miss one.
 */
export function sanitizeError(message: string, secrets: string[]): string {
	let out = message
	for (const secret of secrets) {
		if (!secret) continue
		out = out.split(secret).join('[redacted]')
	}
	return out.length > ERROR_MAX ? out.slice(0, ERROR_MAX) : out
}

/**
 * Bytes the destination must have free before a run starts (#164/E-13).
 *
 * Pruning happens AFTER the run, so at peak the destination holds `retentionCount + 1`
 * copies. Checking only the incoming copy on a fresh destination would pass every night
 * until the disk filled on night eight. The estimate is ADVISORY — it is built from the
 * `size` columns, which can disagree with what is actually on disk; the mid-copy ENOSPC
 * path is the real guard.
 */
export function freeSpaceNeeded(
	totalBytes: number,
	retentionCount: number,
	existingRunCount: number
): number {
	const roomToFill = Math.max(retentionCount + 1 - existingRunCount, 1)
	return totalBytes * roomToFill
}

// ─── manifest.json (§6.1) — the durable contract with any future restorer ────────────

export interface ManifestFile {
	source: 'employeeDocument' | 'requestDocument'
	id: string
	storageKey: string
	employeeId: string | null
	employeeNumber: string | null
	employeeName: string | null
	category: string | null
	requestId: string | null
	label: string
	fileName: string
	mimeType: string
	size: number
	uploadedAt: Date
	sha256: string
}

export interface ManifestSkipped {
	source: 'employeeDocument' | 'requestDocument'
	id: string
	reason: 'bytes-evicted'
	requestId: string | null
	label: string
	fileName: string
	uploadedAt: Date
	deletedAt: Date | null
}

export interface ManifestFailed {
	source: 'employeeDocument' | 'requestDocument'
	id: string
	storageKey: string
	reason: 'read-error' | 'write-error'
}

export interface ManifestInput {
	runId: string
	generatedAt: Date
	organizationId: string
	organizationName: string
	files: ManifestFile[]
	skipped: ManifestSkipped[]
	failed: ManifestFailed[]
}

export interface Manifest extends ManifestInput {
	manifestVersion: 1
	counts: { files: number; skipped: number; failed: number; totalBytes: number }
	files: (ManifestFile & { path: string })[]
}

export function buildManifest(input: ManifestInput): Manifest {
	return {
		manifestVersion: 1,
		...input,
		counts: {
			files: input.files.length,
			skipped: input.skipped.length,
			failed: input.failed.length,
			totalBytes: input.files.reduce((sum, f) => sum + f.size, 0)
		},
		// `files/` + storageKey, always — a restorer needs no name mapping.
		files: input.files.map((f) => ({ ...f, path: `files/${f.storageKey}` }))
	}
}

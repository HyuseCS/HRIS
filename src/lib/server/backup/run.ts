import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { CAPABILITIES } from '$lib/rbac'
import { notifyMany } from '$lib/server/services/notifications'
import {
	STALE_RUN_HOURS,
	buildManifest,
	freeSpaceNeeded,
	makeRunId,
	runsToPrune,
	sanitizeError,
	type ManifestFailed,
	type ManifestFile,
	type ManifestSkipped
} from './plan'

// Orchestration: collect → copy → manifest → status → prune → notify.
//
// This file lives in src/lib (not scripts/) because it must be importable by tests —
// `pnpm check` does not even cover scripts/**. scripts/backup-documents.ts is a thin arg
// parse and org loop over what is here.
//
// NOTHING here writes, renames or unlinks anything under UPLOAD_DIR. The only call into
// the upload store is a read.

/** Every I/O the run needs, injected so the whole orchestration is testable with fakes. */
export interface BackupIo {
	readStoredFile(storageKey: string): Promise<Buffer>
	writeObject(relPath: string, bytes: Buffer): Promise<void>
	/** null when the object is absent — used to tell a complete run from crash debris. */
	readObject(relPath: string): Promise<Buffer | null>
	listRunIds(organizationId: string): Promise<string[]>
	deleteRun(organizationId: string, runId: string): Promise<void>
	checkFreeSpace(neededBytes: number): Promise<void>
}

/**
 * Consecutive failed writes that mean "the destination is gone", not "one file is bad".
 * Five is arbitrary but safe: a real outage fails on the first file and never recovers,
 * while genuinely scattered per-file failures do not line up five deep by chance.
 */
const MAX_CONSECUTIVE_WRITE_FAILURES = 5

/** A document that is about to be copied. Everything but the bytes and their hash. */
export type PendingFile = Omit<ManifestFile, 'sha256'>

/**
 * Every document byte-file belonging to one organization.
 *
 * Request documents are read WITHOUT a `deletedAt` filter — this is the eighth includer
 * named in the RequestDocument schema comment (#299). A tombstoned row whose bytes are
 * still on disk owns a file that must be backed up; a tombstoned row whose storageKey is
 * already NULL has nothing to copy and is recorded as skipped rather than dropped, so a
 * restorer can see the row existed and why nothing was saved for it (D3).
 *
 * Both queries scope to the org through the relation, so a mis-scoped row is impossible
 * rather than merely unlikely (S6).
 */
export async function collectDocuments(
	db: PrismaClient,
	organizationId: string
): Promise<{ files: PendingFile[]; skipped: ManifestSkipped[] }> {
	const employeeSelect = {
		select: { id: true, employeeNumber: true, lastName: true, firstName: true }
	}
	const name = (e: { lastName: string; firstName: string }) => `${e.lastName}, ${e.firstName}`

	const [employeeDocs, requestDocs] = await Promise.all([
		db.employeeDocument.findMany({
			where: { employee: { organizationId } },
			select: {
				id: true,
				storageKey: true,
				category: true,
				label: true,
				fileName: true,
				mimeType: true,
				size: true,
				uploadedAt: true,
				employee: employeeSelect
			}
		}),
		db.requestDocument.findMany({
			// NO deletedAt filter, deliberately (#299 / #164 D3).
			where: { request: { employee: { organizationId } } },
			select: {
				id: true,
				requestId: true,
				storageKey: true,
				label: true,
				fileName: true,
				mimeType: true,
				size: true,
				uploadedAt: true,
				deletedAt: true,
				request: { select: { employee: employeeSelect } }
			}
		})
	])

	const files: PendingFile[] = employeeDocs.map((d) => ({
		source: 'employeeDocument',
		id: d.id,
		storageKey: d.storageKey,
		employeeId: d.employee.id,
		employeeNumber: d.employee.employeeNumber,
		employeeName: name(d.employee),
		category: d.category,
		requestId: null,
		label: d.label,
		fileName: d.fileName,
		mimeType: d.mimeType,
		size: d.size,
		uploadedAt: d.uploadedAt
	}))
	const skipped: ManifestSkipped[] = []

	for (const d of requestDocs) {
		if (!d.storageKey) {
			skipped.push({
				source: 'requestDocument',
				id: d.id,
				reason: 'bytes-evicted',
				requestId: d.requestId,
				label: d.label,
				fileName: d.fileName,
				uploadedAt: d.uploadedAt,
				deletedAt: d.deletedAt
			})
			continue
		}
		files.push({
			source: 'requestDocument',
			id: d.id,
			storageKey: d.storageKey,
			employeeId: d.request.employee.id,
			employeeNumber: d.request.employee.employeeNumber,
			employeeName: name(d.request.employee),
			category: null,
			requestId: d.requestId,
			label: d.label,
			fileName: d.fileName,
			mimeType: d.mimeType,
			size: d.size,
			uploadedAt: d.uploadedAt
		})
	}

	return { files, skipped }
}

/**
 * Copy every file, hashing what was actually written.
 *
 * A read or write error costs ONE manifest entry and the run continues: one unreadable
 * file must not cost the other 411 (ST1). The status the caller derives from a non-empty
 * `failed` list is PARTIAL, never SUCCESS.
 */
export async function copyAll(
	files: PendingFile[],
	runPrefix: string,
	io: BackupIo
): Promise<{
	copied: ManifestFile[]
	failed: ManifestFailed[]
	totalBytes: number
	aborted: boolean
}> {
	const copied: ManifestFile[] = []
	const failed: ManifestFailed[] = []
	let totalBytes = 0
	let consecutiveWriteFailures = 0

	for (const file of files) {
		let bytes: Buffer
		try {
			bytes = await io.readStoredFile(file.storageKey)
		} catch {
			failed.push({
				source: file.source,
				id: file.id,
				storageKey: file.storageKey,
				reason: 'read-error'
			})
			continue
		}
		try {
			await io.writeObject(`${runPrefix}/files/${file.storageKey}`, bytes)
			consecutiveWriteFailures = 0
		} catch {
			failed.push({
				source: file.source,
				id: file.id,
				storageKey: file.storageKey,
				reason: 'write-error'
			})
			// ST7: a destination that is simply gone (bucket unreachable, volume unmounted,
			// credentials rejected) fails on every single file. Recording 400 identical
			// write-errors and calling the result PARTIAL is both slow and a lie — the run
			// captured nothing. A consecutive-failure threshold is the honest signal without
			// pretending to classify error types, which no two S3 providers agree on.
			if (++consecutiveWriteFailures >= MAX_CONSECUTIVE_WRITE_FAILURES) {
				return { copied, failed, totalBytes, aborted: true }
			}
			continue
		}
		// Hash and size come from the buffer that was written, not from the `size` column,
		// which can disagree with what is on disk.
		copied.push({
			...file,
			size: bytes.byteLength,
			sha256: createHash('sha256').update(bytes).digest('hex')
		})
		totalBytes += bytes.byteLength
	}

	return { copied, failed, totalBytes, aborted: false }
}

/**
 * The failure alert (S8). Counts only — deliberately no filename, no employee name, no
 * path, no bucket, no endpoint. The link is capability-gated on its own.
 */
export function backupNotificationMessage(failedCount: number, totalCount: number): string {
	return `Nightly document backup finished with errors (${failedCount} of ${totalCount} files could not be copied). Open Settings → Document Backup.`
}

/** Everyone who may see /settings/backup, read from the capability table, not role literals. */
export async function notifyAdmins(
	db: PrismaClient,
	organizationId: string,
	message: string
): Promise<void> {
	// E-02: CAPABILITIES.ADMINISTER_SYSTEM, not ['SUPER_ADMIN','CEO']. Hard-coding the pair
	// duplicates src/lib/rbac.ts and silently misses any role added there later.
	const users = await db.user.findMany({
		where: {
			organizationId,
			isActive: true,
			roles: { hasSome: [...CAPABILITIES.ADMINISTER_SYSTEM] }
		},
		select: { id: true }
	})
	await notifyMany(
		users.map((u) => u.id),
		message,
		'/settings/backup'
	)
}

/**
 * Counts from a manifest, or null if the file is not a trustworthy complete one.
 *
 * writeObject is a plain writeFile for LOCAL — no tmp+rename — so the very crash this sweep
 * exists for can leave manifest.json truncated. An unguarded JSON.parse here throws out of
 * sweepStaleRuns, which runs first inside runBackupForOrg's pre-flight try; that catch
 * records a FAILED row and returns WITHOUT resolving the RUNNING row, so the next night hits
 * the same bad file and the organization never backs up again. Returning null instead routes
 * the row to the age-gated FAILED branch, which reclaims the directory.
 */
function parseManifestCounts(
	raw: Buffer
): { files: number; skipped: number; failed: number; totalBytes: number } | null {
	try {
		const counts = (
			JSON.parse(raw.toString()) as {
				counts?: { files: number; skipped: number; failed: number; totalBytes: number }
			}
		).counts
		if (!counts) return null
		const values = [counts.files, counts.skipped, counts.failed, counts.totalBytes]
		if (!values.every((n) => Number.isInteger(n) && n >= 0)) return null
		return counts
	} catch {
		return null
	}
}

/**
 * Resolve rows left RUNNING by a dead process.
 *
 * E-08: a directory that HAS manifest.json is a COMPLETE backup whose status write was
 * lost — the manifest is written last precisely so this distinction exists (AD-008).
 * Flipping it to FAILED and letting the prune pass delete it would destroy a good backup,
 * so the manifest's own counts are used to promote the row instead.
 *
 * The two branches are gated DIFFERENTLY, and that asymmetry is the fix for a defect that
 * shipped: the promotion branch has NO age gate.
 *
 * Why that is safe: the caller holds the per-organization advisory lock around this entire
 * run, so any RUNNING row this org has AT THIS MOMENT necessarily belongs to a process
 * that is no longer alive — there cannot be a live concurrent run to race. Age tells us
 * nothing the lock has not already told us.
 *
 * Why it is necessary: with an age gate on the promotion branch, a crash in the window
 * between the manifest write and the status update leaves a RUNNING row younger than
 * STALE_RUN_HOURS sitting on a COMPLETE backup. The documented `--force` retry then
 * acquires the lock freely (the dead process's session dropped it), this sweep skips the
 * row as "too young", and `pruneRuns` — which has no age concept at all — sees RUNNING,
 * calls it debris, and deletes a good backup. One code path must own that decision, and
 * it is this one: by the time `pruneRuns` runs, no manifest-bearing row is still RUNNING.
 *
 * The no-manifest branch KEEPS the age gate. That directory is incomplete either way, and
 * waiting costs nothing.
 */
export async function sweepStaleRuns(
	db: PrismaClient,
	organizationId: string,
	io: BackupIo,
	now: Date
): Promise<void> {
	const cutoff = new Date(now.getTime() - STALE_RUN_HOURS * 60 * 60 * 1000)
	// EVERY running row, at any age — see the asymmetry note above.
	const running = await db.backupRun.findMany({
		where: { organizationId, status: 'RUNNING' },
		select: { id: true, runId: true, startedAt: true }
	})

	for (const run of running) {
		const raw = await io.readObject(`${organizationId}/${run.runId}/manifest.json`)
		const counts = raw ? parseManifestCounts(raw) : null
		if (counts) {
			await db.backupRun.update({
				where: { id: run.id },
				data: {
					status: counts.failed > 0 ? 'PARTIAL' : 'SUCCESS',
					fileCount: counts.files,
					skippedCount: counts.skipped,
					failedCount: counts.failed,
					totalBytes: BigInt(counts.totalBytes),
					finishedAt: now,
					error: 'status write was lost; recovered from the manifest on the destination'
				}
			})
			continue
		}
		// No manifest: incomplete. Wait out STALE_RUN_HOURS before calling it dead — nothing
		// is at risk in the meantime, because there is no good backup here to lose.
		if (run.startedAt >= cutoff) continue
		await db.backupRun.update({
			where: { id: run.id },
			data: {
				status: 'FAILED',
				finishedAt: now,
				error: 'run did not complete (process ended)'
			}
		})
		await io.deleteRun(organizationId, run.runId)
	}
}

export interface RunOutcome {
	runId: string
	status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
	fileCount: number
	skippedCount: number
	failedCount: number
	totalBytes: number
	error?: string
}

/**
 * One organization's backup, start to finish.
 *
 * Order is load-bearing: the RUNNING row exists before the first byte, manifest.json is
 * written LAST, and pruning happens only after a completed status — so a crash can never
 * cost the newest good backup, and a full disk is never "solved" by deleting the backups
 * we still have (AD-008 / ST5).
 */
export async function runBackupForOrg(
	db: PrismaClient,
	org: { id: string; name: string },
	config: { retentionCount: number; destinationKind: 'LOCAL' | 'S3' },
	io: BackupIo,
	now: Date,
	secrets: string[] = []
): Promise<RunOutcome> {
	const runId = makeRunId(now)
	const runPrefix = `${org.id}/${runId}`

	// Everything before the RUNNING row exists still has to be VISIBLE when it fails.
	// ST5 promises a refused run is "recorded as FAILED … and admins notified", and G5
	// promises a failed run is visible without reading a log file. Letting the free-space
	// refusal (or a collector/LIST failure) propagate leaves no row and no notification at
	// all, so /settings/backup shows nothing and backups stop silently — the one failure
	// mode this whole feature exists to prevent.
	let files: PendingFile[]
	let skipped: ManifestSkipped[]
	try {
		await sweepStaleRuns(db, org.id, io, now)
		const collected = await collectDocuments(db, org.id)
		files = collected.files
		skipped = collected.skipped
		const estimate = files.reduce((sum, f) => sum + f.size, 0)
		const existingRuns = await io.listRunIds(org.id)
		await io.checkFreeSpace(freeSpaceNeeded(estimate, config.retentionCount, existingRuns.length))
	} catch (e: unknown) {
		const message = sanitizeError((e as Error)?.message ?? 'unknown error', secrets)
		await db.backupRun.create({
			data: {
				organizationId: org.id,
				runId,
				status: 'FAILED',
				destinationKind: config.destinationKind,
				finishedAt: now,
				error: message
			},
			select: { id: true }
		})
		await notifyAdmins(
			db,
			org.id,
			'Nightly document backup could not start. Open Settings → Document Backup.'
		)
		return {
			runId,
			status: 'FAILED',
			fileCount: 0,
			skippedCount: 0,
			failedCount: 0,
			totalBytes: 0,
			error: message
		}
	}

	const row = await db.backupRun.create({
		data: {
			organizationId: org.id,
			runId,
			status: 'RUNNING',
			destinationKind: config.destinationKind
		},
		select: { id: true }
	})

	try {
		const { copied, failed, totalBytes, aborted } = await copyAll(files, runPrefix, io)
		if (aborted) {
			// Deliberately BEFORE the manifest write. Writing one here would mark an empty
			// directory as a complete backup, which is exactly the lie AD-008 exists to
			// prevent. The catch below records FAILED and removes the partial directory.
			throw new Error(
				`backup destination is unreachable (${MAX_CONSECUTIVE_WRITE_FAILURES} consecutive write failures)`
			)
		}

		const manifest = buildManifest({
			runId,
			generatedAt: now,
			organizationId: org.id,
			organizationName: org.name,
			files: copied,
			skipped,
			failed
		})
		const serialized = Buffer.from(JSON.stringify(manifest, null, 2))
		// LAST. A directory without a manifest is by definition incomplete.
		await io.writeObject(`${runPrefix}/manifest.json`, serialized)

		const status = failed.length > 0 ? 'PARTIAL' : 'SUCCESS'
		await db.backupRun.update({
			where: { id: row.id },
			data: {
				status,
				finishedAt: now,
				fileCount: copied.length,
				skippedCount: skipped.length,
				failedCount: failed.length,
				totalBytes: BigInt(totalBytes),
				manifestSha256: createHash('sha256').update(serialized).digest('hex')
			}
		})

		await pruneRuns(db, org.id, config.retentionCount, io)

		if (status === 'PARTIAL') {
			await notifyAdmins(db, org.id, backupNotificationMessage(failed.length, files.length))
		}

		return {
			runId,
			status,
			fileCount: copied.length,
			skippedCount: skipped.length,
			failedCount: failed.length,
			totalBytes
		}
	} catch (e: unknown) {
		// A destination-class failure (unreachable, permission, ENOSPC mid-copy). The partial
		// directory goes; NOTHING else is pruned — a full disk must never be "solved" by
		// deleting the backups we still have (ST5).
		const message = sanitizeError((e as Error)?.message ?? 'unknown error', secrets)
		await db.backupRun.update({
			where: { id: row.id },
			data: { status: 'FAILED', finishedAt: now, error: message }
		})
		await io.deleteRun(org.id, runId).catch(() => {})
		await notifyAdmins(
			db,
			org.id,
			`Nightly document backup failed before it finished. Open Settings → Document Backup.`
		)
		return {
			runId,
			status: 'FAILED',
			fileCount: 0,
			skippedCount: 0,
			failedCount: 0,
			totalBytes: 0,
			error: message
		}
	}
}

/**
 * Keep the newest K completed runs.
 *
 * Reconciles the DESTINATION against the rows (#164/E-09): after a database reset a
 * directory with no row would otherwise never be counted toward retention and never
 * removed, so the destination would grow without bound.
 */
export async function pruneRuns(
	db: PrismaClient,
	organizationId: string,
	retentionCount: number,
	io: BackupIo
): Promise<void> {
	const runs = await db.backupRun.findMany({
		where: { organizationId },
		select: { id: true, runId: true, status: true, startedAt: true },
		orderBy: { startedAt: 'desc' }
	})
	const doomed = new Set(runsToPrune(runs, retentionCount).map((r) => r.runId))
	const known = new Set(runs.map((r) => r.runId))

	for (const runId of await io.listRunIds(organizationId)) {
		// Unknown directories are pruned too: after a DB reset they match no row, and a
		// destination that only ever grows is not a retention policy.
		if (doomed.has(runId) || !known.has(runId)) await io.deleteRun(organizationId, runId)
	}
}

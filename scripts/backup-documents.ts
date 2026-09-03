// Automatic document backup (#164). Document BYTES live only on local disk under
// UPLOAD_DIR — never in Postgres — so a pg_dump backs up every document ROW and none of
// the files. This copies every EmployeeDocument and RequestDocument to a second
// destination, writes a manifest describing each one, records the outcome as a BackupRun,
// prunes to the org's retention setting, and notifies that org's system administrators
// when a run is not clean.
//
//   pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts --dry-run
//   pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts --force
//
// Runs nightly from the droplet crontab (see scripts/README.md) — the app has no
// scheduler. Schedule and retention are per organization and edited at
// Settings → Document Backup; this entry point only OFFERS each org a chance to run.
//
// Deliberate differences from scripts/promote-probationary.ts:
//   • NO AuditLog write, and therefore NO dependency on the seeded system@veent.ph user.
//     The BackupRun row is the durable record and is richer than an audit entry would be
//     (counts, bytes, manifest checksum, sanitized reason). AuditLog.actorId is a
//     non-nullable FK, so auditing here would force a seeded actor onto a job that needs
//     none. See the plan's §16.
//   • Its own PrismaClient pinned to ONE connection. A session-level advisory lock lives
//     on a single connection; with Prisma's pool the lock and the unlock could land on
//     different ones and the unlock would silently no-op.
//
// It NEVER writes, renames or unlinks anything under UPLOAD_DIR. The only call into the
// upload store is readStoredFile.

import 'dotenv/config'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import { readStoredFile, resolveWithin } from '../src/lib/server/storage'
import {
	BACKUP_LOCK_NAMESPACE,
	STALE_RUN_HOURS,
	assertDestinationSafe,
	backupLockKey,
	isRunDue,
	sanitizeError,
	withSingleConnection
} from '../src/lib/server/backup/plan'
import {
	checkFreeSpace,
	deleteRun,
	destinationFromEnv,
	listRunIds,
	sharesFilesystem,
	writeObject,
	type Destination
} from '../src/lib/server/backup/destination'
import {
	collectDocuments,
	notifyAdmins,
	runBackupForOrg,
	type BackupIo
} from '../src/lib/server/backup/run'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')

const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? 'uploads')

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
	console.error('DATABASE_URL is not set.')
	process.exit(1)
}
const db = new PrismaClient({
	datasources: { db: { url: withSingleConnection(databaseUrl) } }
})

/** Values that must never reach BackupRun.error or a log line. */
function secretsOf(dest: Destination): string[] {
	return dest.kind === 'LOCAL'
		? [dest.root]
		: [dest.secretAccessKey, dest.accessKeyId, dest.endpoint, dest.bucket]
}

function ioFor(dest: Destination): BackupIo {
	return {
		readStoredFile,
		writeObject: (relPath, bytes) => writeObject(dest, relPath, bytes),
		// Only the stale-run sweep reads back, and only to tell a complete backup from crash
		// debris. LOCAL reads the file. An S3 destination returns null, so a stale row there
		// is treated as debris — conservative: it can only delete a directory whose row was
		// never completed, never one that was.
		readObject: async (relPath) => {
			if (dest.kind !== 'LOCAL') return null
			try {
				return await readFile(resolveWithin(dest.root, relPath))
			} catch {
				return null
			}
		},
		listRunIds: (organizationId) => listRunIds(dest, organizationId),
		deleteRun: (organizationId, runId) => deleteRun(dest, organizationId, runId),
		checkFreeSpace: (needed) => checkFreeSpace(dest, needed)
	}
}

async function main() {
	let failures = 0

	// S2 — BEFORE any organization is touched. A backup written inside UPLOAD_DIR means
	// each night copies the previous night's backup, the orphan sweep sees the whole tree
	// as garbage, and the growth is unbounded. A misconfigured box must write nothing at
	// all, not "nothing for the orgs it had not reached yet".
	if (process.env.BACKUP_DIR) {
		assertDestinationSafe(uploadDir, process.env.BACKUP_DIR)
		// E-14: containment is not the only hazard. On the droplet, uploads, backups and
		// pgdata are named volumes on ONE filesystem, so an unpruned backup tree can fill the
		// disk Postgres writes to. Warn — a single-volume box has no other option.
		if (await sharesFilesystem(uploadDir, process.env.BACKUP_DIR)) {
			console.warn('WARNING: BACKUP_DIR shares a filesystem with UPLOAD_DIR')
		}
	}

	const orgs = await db.organization.findMany({
		select: { id: true, name: true },
		orderBy: { id: 'asc' }
	})

	for (const org of orgs) {
		const config = await db.backupConfig.findUnique({
			where: { organizationId: org.id },
			select: { enabled: true, intervalDays: true, retentionCount: true, destinationKind: true }
		})
		// ST9: no row means never configured, which is NOT the same as enabled. The script
		// creates nothing — only the settings page does.
		if (!config?.enabled) {
			console.log(`  org ${org.id}: backups not enabled — skipped`)
			continue
		}

		let dest: Destination
		try {
			dest = destinationFromEnv(config.destinationKind)
		} catch (e) {
			console.error(`  org ${org.id}: ${(e as Error).message}`)
			failures++
			continue
		}

		const lockKey = backupLockKey(org.id)
		const [{ locked }] = await db.$queryRaw<{ locked: boolean }[]>`
			SELECT pg_try_advisory_lock(${BACKUP_LOCK_NAMESPACE}::int, hashtext(${lockKey})) AS locked
		`
		// E-05: the TWO-INT form. hashtext() returns a 32-bit integer and
		// pg_advisory_lock(bigint) — which timesheets.ts:185 and payroll/index.ts:110 use,
		// blocking — is a different namespace. Sharing it would let a minutes-long backup
		// stall a payroll write on a hash collision.
		if (!locked) {
			console.log(`  org ${org.id}: another backup is already running — skipped`)
			// E-06: a container killed without a FIN leaves the Postgres session (and its
			// lock) alive until TCP keepalives expire. Because acquisition is `try` and skips
			// silently, the org would then stop being backed up with no alarm — and the
			// stale-run sweep cannot fire, because it runs AFTER the lock is taken.
			const newest = await db.backupRun.findFirst({
				where: { organizationId: org.id },
				orderBy: { startedAt: 'desc' },
				select: { status: true, startedAt: true }
			})
			const cutoff = new Date(Date.now() - STALE_RUN_HOURS * 60 * 60 * 1000)
			if (newest?.status === 'RUNNING' && newest.startedAt < cutoff) {
				console.error(
					`  org ${org.id}: backup lock has been held for over ${STALE_RUN_HOURS}h — wedged`
				)
				await notifyAdmins(
					db,
					org.id,
					'Nightly document backup has been blocked for over 12 hours. Open Settings → Document Backup.'
				)
				failures++
			}
			continue
		}

		try {
			const lastCompleted = await db.backupRun.findFirst({
				where: { organizationId: org.id, status: { in: ['SUCCESS', 'PARTIAL'] } },
				orderBy: { startedAt: 'desc' },
				select: { startedAt: true }
			})
			const now = new Date()
			if (!force && !isRunDue(config, lastCompleted?.startedAt ?? null, now)) {
				const next = new Date(
					(lastCompleted?.startedAt ?? now).getTime() + config.intervalDays * 86_400_000
				)
				console.log(`  org ${org.id}: not due (next run ${next.toISOString()})`)
				continue
			}

			if (dryRun) {
				const { files, skipped } = await collectDocuments(db, org.id)
				console.log(
					`  org ${org.id}: DRY RUN — would copy ${files.length} file(s), skip ${skipped.length}`
				)
				continue
			}

			const outcome = await runBackupForOrg(
				db,
				org,
				config,
				ioFor(dest),
				new Date(),
				secretsOf(dest)
			)
			console.log(
				`  org ${org.id}: ${outcome.fileCount} file(s) copied, ${outcome.failedCount} failed` +
					(outcome.error ? ` — ${outcome.error}` : '')
			)
			if (outcome.status === 'FAILED') failures++
		} catch (e) {
			// Per-org try/catch: one org must never abort the sweep.
			console.error(`  org ${org.id}: ${sanitizeError((e as Error).message, secretsOf(dest))}`)
			failures++
		} finally {
			// E-07: unlock ONLY when the lock was actually taken. An unconditional unlock on a
			// skipped org returns false every time and turns the alarm below into noise.
			const [{ unlocked }] = await db.$queryRaw<{ unlocked: boolean }[]>`
				SELECT pg_advisory_unlock(${BACKUP_LOCK_NAMESPACE}::int, hashtext(${lockKey})) AS unlocked
			`
			if (!unlocked) {
				console.error(
					`  org ${org.id}: pg_advisory_unlock returned false — the lock and unlock did not share a connection`
				)
			}
		}
	}

	if (failures > 0) {
		console.error(`\n${failures} organization(s) failed.`)
		process.exit(1)
	}
	console.log('\nDone.')
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())

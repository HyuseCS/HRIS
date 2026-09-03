import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { runsToPrune } from '$lib/server/backup/plan'
import type { AuditContext } from '../types'
import type { BackupDestinationKind } from '@prisma/client'

// Document-backup schedule + run history (#164). The nightly script owns the RUNS; this
// module owns the CONFIG and the read model the settings page renders.

/** How many runs the history table shows. The manifest on the destination is the full record. */
const HISTORY_LIMIT = 20

/**
 * Defaults for an org that has never opened the settings page.
 *
 * Deliberately NOT written on read. A row created by merely looking at the page would tell
 * the nightly script this org was configured, and `enabled: false` is the honest state for
 * an org nobody has set up. Only `updateBackupConfig` creates the row.
 */
const DEFAULTS = {
	enabled: false,
	intervalDays: 1,
	retentionCount: 7,
	destinationKind: 'LOCAL' as BackupDestinationKind
}

export async function getBackupSettings(organizationId: string) {
	const [config, runs] = await Promise.all([
		db.backupConfig.findUnique({
			where: { organizationId },
			select: {
				enabled: true,
				intervalDays: true,
				retentionCount: true,
				destinationKind: true,
				updatedAt: true
			}
		}),
		db.backupRun.findMany({
			where: { organizationId },
			orderBy: { startedAt: 'desc' },
			take: HISTORY_LIMIT,
			select: {
				id: true,
				runId: true,
				status: true,
				destinationKind: true,
				startedAt: true,
				finishedAt: true,
				fileCount: true,
				skippedCount: true,
				failedCount: true,
				totalBytes: true,
				error: true
			}
		})
	])

	const cfg = config ?? { ...DEFAULTS, updatedAt: null }

	// #164/E-15: `totalBytes` is the schema's only BigInt. `src/hooks.ts` transports Decimal,
	// not BigInt, and any client-side size formatting that mixes a bigint with a number throws
	// "Cannot mix BigInt and other types". Convert here, at the boundary, so nothing downstream
	// has to know. Number is exact to 9 PB — a backup that large is not this system's problem.
	// Retention deletes the DIRECTORY but keeps the ROW, so the history outlives the files it
	// describes. Rendered without this flag the table showed seven green "SUCCESS — 2 copied"
	// rows while only three backups still existed on disk, which invites an admin to plan a
	// restore from something that is gone. `runsToPrune` is the same function the nightly job
	// prunes with, so the page cannot disagree with what the job actually deleted.
	const goneIds = new Set(runsToPrune(runs, cfg.retentionCount).map((r) => r.id))
	const history = runs.map((r) => ({
		...r,
		totalBytes: Number(r.totalBytes),
		filesRetained: !goneIds.has(r.id)
	}))

	// The last run that actually completed. `nextDueAt` counts from startedAt because that is
	// what `isRunDue` schedules from — the date shown must be the date the script will compute,
	// not a second interpretation of it. The "Last completed" label is a different question and
	// answers it with finishedAt: a run that began 23:00 and ended 01:00 completed at 01:00.
	const lastCompleted = runs.find((r) => r.status === 'SUCCESS' || r.status === 'PARTIAL') ?? null
	const nextDueAt =
		cfg.enabled && lastCompleted
			? new Date(lastCompleted.startedAt.getTime() + cfg.intervalDays * 24 * 60 * 60 * 1000)
			: null

	return {
		config: { ...cfg, configured: config !== null },
		history,
		nextDueAt,
		lastCompletedAt: lastCompleted?.finishedAt ?? null
	}
}

export async function updateBackupConfig(
	organizationId: string,
	input: {
		enabled: boolean
		intervalDays: number
		retentionCount: number
		destinationKind: BackupDestinationKind
	},
	ctx: AuditContext
) {
	// One transaction: a failed audit write must not leave the config change standing
	// unrecorded, and reading `before` outside it lets two concurrent saves log the same
	// oldValue.
	return await db.$transaction(async (tx) => {
		const before = await tx.backupConfig.findUnique({
			where: { organizationId },
			select: { enabled: true, intervalDays: true, retentionCount: true, destinationKind: true }
		})

		const config = await tx.backupConfig.upsert({
			where: { organizationId },
			create: { organizationId, ...input },
			update: input,
			select: {
				id: true,
				enabled: true,
				intervalDays: true,
				retentionCount: true,
				destinationKind: true
			}
		})

		// Turning backups off, or stretching the interval to 90 days, is exactly the change
		// someone needs to find later — so this is audited with the real actor, unlike the
		// nightly run, whose BackupRun row is its own durable record.
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'BackupConfig',
				entityId: config.id,
				oldValue: before ?? undefined,
				newValue: input
			},
			tx
		)

		return config
	})
}

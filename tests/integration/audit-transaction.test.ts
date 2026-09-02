import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import {
	createOrgFixture,
	cleanupFixtures,
	disconnectAll,
	injectedCallCount,
	setAuditFailure,
	verifyDb
} from './audit-tx-harness'

// Module substitution with a REAL extended Prisma client. See audit-tx-harness.ts for why
// `db.$extends()` in the test body cannot work. The dynamic import is required because
// `vi.mock` is hoisted above the imports above.
vi.mock('$lib/server/db', () => import('./audit-tx-harness').then((m) => m.makeInjectedDb()))

const { updateBackupConfig } = await import('$lib/server/services/settings/backup')

const INPUT = {
	enabled: true,
	intervalDays: 3,
	retentionCount: 5,
	destinationKind: 'LOCAL' as const
}

/**
 * `settings/backup.ts:108-143` is the reference implementation — its audit write already
 * shares the transaction with the config upsert. Pointing the harness at a site that is
 * already correct means this tier is green on landing AND goes red the moment someone
 * moves that `writeAuditLog` call back outside the `$transaction`.
 */
describe('audit row commits or rolls back with its mutation (real Postgres)', () => {
	let fixture: Awaited<ReturnType<typeof createOrgFixture>>

	beforeEach(async () => {
		setAuditFailure(false)
		fixture = await createOrgFixture()
	})

	afterEach(async () => {
		setAuditFailure(false)
		await cleanupFixtures()
	})

	afterAll(disconnectAll)

	// Positive control. Proves the fixture can write at all — without it, the failure case's
	// absence assertion is satisfiable by a broken fixture.
	it('writes both rows when the audit write succeeds', async () => {
		await updateBackupConfig(fixture.organizationId, INPUT, fixture.ctx)

		const config = await verifyDb.backupConfig.findUnique({
			where: { organizationId: fixture.organizationId },
			select: { intervalDays: true }
		})
		expect(config?.intervalDays).toBe(3)

		const audits = await verifyDb.auditLog.findMany({
			where: { organizationId: fixture.organizationId, entityType: 'BackupConfig' },
			select: { action: true }
		})
		expect(audits).toHaveLength(1)
		expect(audits[0].action).toBe('UPDATE')
	})

	// The failure case. All three assertions are required: an absence assertion on its own is
	// equally satisfied by an FK violation, a guard throwing early, or a broken mock.
	it('rolls the mutation back when the audit write fails', async () => {
		setAuditFailure(true)

		await expect(updateBackupConfig(fixture.organizationId, INPUT, fixture.ctx)).rejects.toThrow(
			'audit down'
		)

		// the injected callback really fired — the rejection is ours, not something upstream
		expect(injectedCallCount()).toBe(1)

		// and the mutation did not persist. Read back on the SEPARATE, non-extended client.
		const config = await verifyDb.backupConfig.findUnique({
			where: { organizationId: fixture.organizationId }
		})
		expect(config).toBeNull()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #298 AC-1.x — a payroll void must be findable in the audit log, and a void by the same person
 * who approved or locked the payroll must say so.
 *
 * Before #298 both void paths logged a plain `UPDATE`, indistinguishable from every other edit on
 * the same entity (the live audit log held 56 such `UPDATE`/`PayrollRun` rows, one of which was a
 * void). The control is the dedicated `PAYROLL_VOID` action, because the #242 mask blanks
 * `newValue` on the audit screen — so the same-actor key is supplementary metadata, not the gate.
 *
 * These assert on the ARGUMENT OBJECT passed to `writeAuditLog`, which is mocked. They do NOT
 * prove the row reached Postgres, that tenant scoping holds, or that the two dropdown arrays in
 * `/reports/audit-log` were updated — only the live pass does that.
 *
 * WHO may void is not re-tested here: `override-finalized-guard.test.ts` owns that and must stay
 * green with zero edits (AC-1.4).
 */

const { dbMock, notifyMock, writeAuditLog } = vi.hoisted(() => ({
	dbMock: {
		payrollRun: {
			findFirst: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			findUniqueOrThrow: vi.fn(),
			create: vi.fn(),
			findUnique: vi.fn()
		},
		payrollPeriod: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			findUniqueOrThrow: vi.fn(),
			create: vi.fn()
		},
		payrollEntry: { findMany: vi.fn() },
		$transaction: vi.fn()
	},
	notifyMock: { notifyMany: vi.fn().mockResolvedValue(undefined) },
	writeAuditLog: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))
vi.mock('$lib/server/services/notifications', () => notifyMock)
vi.mock('$lib/server/services/payroll/index', () => ({ computePayroll: vi.fn() }))

const { voidRun } = await import('$lib/server/services/payroll/runs')
const { voidPeriod, lock, release, generate } = await import('$lib/server/services/payroll/periods')

const SUPER: Role[] = ['SUPER_ADMIN']
const ctx = (actorId: string, actorRoles: Role[] = SUPER) => ({
	organizationId: 'org1',
	actorId,
	actorRoles
})

/** The last payload handed to `writeAuditLog`. */
const lastAudit = () => writeAuditLog.mock.calls.at(-1)?.[1]

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
	dbMock.payrollEntry.findMany.mockResolvedValue([])
	// The compare-and-set claims added for the void and release races. Default to "this caller
	// won"; a test that means to lose the race overrides with `{ count: 0 }`.
	dbMock.payrollPeriod.updateMany.mockResolvedValue({ count: 1 })
	dbMock.payrollPeriod.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'RELEASED' })
	dbMock.payrollRun.updateMany.mockResolvedValue({ count: 1 })
	dbMock.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: 'r1', status: 'VOIDED' })
	dbMock.payrollRun.update.mockResolvedValue({ id: 'run1', status: 'VOIDED' })
	dbMock.payrollPeriod.update.mockResolvedValue({ id: 'p1', status: 'VOIDED' })
	dbMock.payrollPeriod.updateMany.mockResolvedValue({ count: 1 })
	dbMock.payrollPeriod.findUnique.mockResolvedValue({ id: 'p1' })
})

/** A locked period whose single run was approved by `approvedById`. */
const period = (over: { approvedById?: string | null; lockedById?: string | null } = {}) => ({
	id: 'p1',
	organizationId: 'org1',
	name: 'ZZ-unit',
	status: 'LOCKED',
	lockedById: over.lockedById ?? null,
	runs: [{ id: 'run1', status: 'COMPUTED', approvedById: over.approvedById ?? null }]
})

describe('#298 — void audit action (AC-1.1)', () => {
	it('void-override-marked — voidRun logs PAYROLL_VOID on the run, not a plain UPDATE', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue({
			id: 'run1',
			organizationId: 'org1',
			status: 'APPROVED',
			approvedById: 'userA'
		})

		await voidRun('run1', 'org1', ctx('userB'))

		expect(lastAudit()).toMatchObject({
			action: 'PAYROLL_VOID',
			entityType: 'PayrollRun',
			entityId: 'run1',
			oldValue: { status: 'APPROVED' }
		})
	})

	it('void-period-override-marked — voidPeriod logs PAYROLL_VOID on the period', async () => {
		dbMock.payrollPeriod.findFirst.mockResolvedValue(period({ lockedById: 'userA' }))

		await voidPeriod('p1', 'org1', ctx('userB'))

		expect(lastAudit()).toMatchObject({
			action: 'PAYROLL_VOID',
			entityType: 'PayrollPeriod',
			entityId: 'p1'
		})
	})
})

describe('#298 — the same-actor marker (AC-1.2, AC-1.3)', () => {
	it('override-marker-absent-on-ordinary — a void by a different actor carries no key at all', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue({
			id: 'run1',
			organizationId: 'org1',
			status: 'APPROVED',
			approvedById: 'userA'
		})

		await voidRun('run1', 'org1', ctx('userB'))

		// Absent, never `false` — a search for the key must return only real same-actor voids.
		expect(lastAudit()?.newValue).not.toHaveProperty('sameActorAsApprover')
		expect(lastAudit()?.newValue).toEqual({ status: 'VOIDED' })
	})

	it('override-marker-absent-on-ordinary — a never-approved run is not marked by a null-vs-null match', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue({
			id: 'run1',
			organizationId: 'org1',
			status: 'COMPUTED',
			approvedById: null
		})

		// A missing actor id must never match a missing approver.
		await voidRun('run1', 'org1', ctx(null as unknown as string))

		expect(lastAudit()?.newValue).not.toHaveProperty('sameActorAsApprover')
	})

	it('override-marker-absent-on-ordinary — a never-locked period is not marked either', async () => {
		dbMock.payrollPeriod.findFirst.mockResolvedValue(period())

		await voidPeriod('p1', 'org1', ctx(null as unknown as string))

		expect(lastAudit()?.newValue).not.toHaveProperty('sameActorAsApprover')
	})

	it('void-same-actor-visible — the approver arm: voider === run.approvedById', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue({
			id: 'run1',
			organizationId: 'org1',
			status: 'APPROVED',
			approvedById: 'userA'
		})

		await voidRun('run1', 'org1', ctx('userA'))

		expect(lastAudit()?.newValue).toEqual({ status: 'VOIDED', sameActorAsApprover: true })
	})

	it('void-same-actor-visible — the locker arm reaches the RUN void: voider locked the period', async () => {
		// The commonest same-actor void there is, and it was silently unmarked until the period
		// was passed to the marker. Since #298 stopped `lock()` writing `approvedById`, a
		// locked-but-never-approved run has a null approver, so checking the run alone can never
		// match. Caught live: the audit row read `sameActorAsApprover = f` for exactly this case.
		dbMock.payrollRun.findFirst.mockResolvedValue({
			id: 'run1',
			organizationId: 'org1',
			status: 'COMPUTED',
			approvedById: null,
			period: { id: 'p1', status: 'GENERATED', lockedById: 'userB' }
		})

		await voidRun('run1', 'org1', ctx('userB'))

		expect(lastAudit()?.newValue).toEqual({ status: 'VOIDED', sameActorAsApprover: true })
	})

	it('override-marker-absent-on-ordinary — a RUN void by someone who did not lock is unmarked', async () => {
		dbMock.payrollRun.findFirst.mockResolvedValue({
			id: 'run1',
			organizationId: 'org1',
			status: 'COMPUTED',
			approvedById: null,
			period: { id: 'p1', status: 'GENERATED', lockedById: 'userB' }
		})

		await voidRun('run1', 'org1', ctx('userC'))

		expect(lastAudit()?.newValue).not.toHaveProperty('sameActorAsApprover')
		expect(lastAudit()?.newValue).toEqual({ status: 'VOIDED' })
	})

	it('void-same-actor-visible — the locker arm: voider === period.lockedById', async () => {
		dbMock.payrollPeriod.findFirst.mockResolvedValue(
			period({ lockedById: 'userB', approvedById: 'userA' })
		)

		await voidPeriod('p1', 'org1', ctx('userB'))

		expect(lastAudit()?.newValue).toEqual({ status: 'VOIDED', sameActorAsApprover: true })
	})

	it('void-same-actor-visible — the approver arm reaches the period void too', async () => {
		dbMock.payrollPeriod.findFirst.mockResolvedValue(
			period({ lockedById: 'userB', approvedById: 'userA' })
		)

		await voidPeriod('p1', 'org1', ctx('userA'))

		expect(lastAudit()?.newValue).toEqual({ status: 'VOIDED', sameActorAsApprover: true })
	})
})

describe('#298 — PAYROLL_VOID names only voids (AC-1.2)', () => {
	it('override-search-returns-only-real — lock, release and generate use other actions', async () => {
		dbMock.payrollPeriod.findFirst.mockResolvedValue({ ...period(), status: 'GENERATED' })
		await generate('p1', 'org1', ctx('userB'))
		await lock('p1', 'org1', ctx('userB'))

		dbMock.payrollPeriod.findFirst.mockResolvedValue({ ...period(), status: 'LOCKED' })
		dbMock.payrollPeriod.update.mockResolvedValue({ id: 'p1', status: 'RELEASED' })
		await release('p1', 'org1', ctx('userC'))

		dbMock.payrollPeriod.findFirst.mockResolvedValue(period())
		await voidPeriod('p1', 'org1', ctx('userB'))

		dbMock.payrollRun.findFirst.mockResolvedValue({
			id: 'run1',
			organizationId: 'org1',
			status: 'COMPUTED',
			approvedById: null
		})
		await voidRun('run1', 'org1', ctx('userB'))

		const voids = writeAuditLog.mock.calls.filter((c) => c[1].action === 'PAYROLL_VOID')
		expect(voids).toHaveLength(2)
		expect(voids.map((c) => c[1].entityType).sort()).toEqual(['PayrollPeriod', 'PayrollRun'])
		// …and nothing else in the period lifecycle borrowed the action.
		expect(
			writeAuditLog.mock.calls
				.filter((c) => c[1].action !== 'PAYROLL_VOID')
				.map((c) => c[1].newValue.status)
				.sort()
		).toEqual(['GENERATED', 'LOCKED', 'RELEASED'])
	})
})

describe('#298 — no external alert on void (AC-1.5)', () => {
	it('void-no-external-alert — neither void path notifies anyone', async () => {
		dbMock.payrollPeriod.findFirst.mockResolvedValue(period({ lockedById: 'userB' }))
		await voidPeriod('p1', 'org1', ctx('userB'))

		dbMock.payrollRun.findFirst.mockResolvedValue({
			id: 'run1',
			organizationId: 'org1',
			status: 'APPROVED',
			approvedById: 'userB'
		})
		await voidRun('run1', 'org1', ctx('userB'))

		// Meaningful for voidPeriod, whose module DOES import the notifier (it notifies on release).
		// VACUOUS for voidRun (G5): `runs.ts` imports no notifier, so this spy can never fire there.
		expect(notifyMock.notifyMany).not.toHaveBeenCalled()
	})
})

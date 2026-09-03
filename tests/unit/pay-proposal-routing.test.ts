import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #224 Part 2 / #243 — the two pay writers route through propose→confirm instead of writing.
 *
 * `action-proposals.test.ts` pins who may CONFIRM. This file pins the other half: which calls get
 * routed at all, and what a routed call must NOT do. Three cases, and each has a plausible-looking
 * wrong version that this file exists to catch:
 *
 *   - **self-action** — used to be a hard 403 (`assertNotSelf`). A CEO with no one above them could
 *     never record their own contractual raise, so it now files a proposal. Deleting the check
 *     instead would let them write it unilaterally, which is the whole of #224.
 *   - **on behalf of someone else, without `ADMINISTER_HR_ORGWIDE`** — a MANAGER. They clear the
 *     route's `requireMinRole('HR_ADMIN')` because `ROLE_HIERARCHY` ranks MANAGER level with
 *     HR_ADMIN, so the route gate is not the boundary; this is (#243). A rank floor written here
 *     would describe the same empty set the route does and never fire.
 *   - **everyone else** (HR_ADMIN / CEO / SUPER_ADMIN acting on another employee) — the
 *     overwhelming majority of real usage, which must still write directly and unchanged.
 *
 * Plus the confirm path: `applyProposedChange` re-enters the same writer on the claim's transaction
 * client with the propose branch bypassed — bypassed because otherwise confirming would file a new
 * proposal instead of applying, forever.
 *
 * `db` and the proposal service are mocked: what is under test is the routing decision and which
 * client the write lands on, not the proposal table's own semantics.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), update: vi.fn() },
		// getEmployee's heal-on-read (#170 Stage 1.5, #222) reads both effective-dated histories.
		employeeCompensation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
		employeeEmploymentType: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
		payrollRun: { findFirst: vi.fn() },
		position: { findFirst: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/notifications', () => ({
	notify: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('$lib/server/services/action-proposals', () => ({
	createProposal: vi.fn().mockResolvedValue({ id: 'prop-1' }),
	// Imported by employees.ts for the audited reveal. Unused here, but a factory mock replaces the
	// whole module, so omitting it makes the import undefined rather than absent.
	assertMayConfirmProposal: vi.fn()
}))

const { createProposal } = await import('$lib/server/services/action-proposals')
const {
	recordCompensationChange,
	promoteEmployee,
	applyProposedChange,
	AWAITING_CONFIRMATION,
	NO_CHANGE_MESSAGE
} = await import('$lib/server/services/employees')
const { RATE_BASIS_MISMATCH } = await import('$lib/utils/rate-basis')

const HR = 'user-hr'
const MANAGER = 'user-manager'
const TODAY = new Date()
const PAST = new Date('2025-01-01')

const ctxOf = (over: Partial<AuditContext> = {}): AuditContext => ({
	organizationId: 'org1',
	actorId: HR,
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test',
	...over
})

/** The HR user's own 201 file — the self-action case. */
const own = {
	id: 'emp-hr',
	userId: HR,
	basicMonthlySalary: 30000,
	rateType: 'MONTHLY',
	employmentType: 'REGULAR',
	employmentStatus: 'ACTIVE',
	startDate: new Date('2020-01-01'),
	positionId: null,
	jobTitle: 'HR Officer',
	reportsToId: null
}
/** Somebody else's 201 file. */
const other = { ...own, id: 'emp-other', userId: 'user-other', jobTitle: 'Crew' }

/** A transaction client standing in for the one `confirmProposal` hands to `apply`. */
const txMock = () => ({
	employee: { update: vi.fn() },
	employeeCompensation: {
		create: vi.fn(),
		findFirst: vi.fn().mockResolvedValue(null),
		findMany: vi.fn().mockResolvedValue([])
	},
	employeeEmploymentType: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) }
})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
	dbMock.employeeCompensation.findFirst.mockResolvedValue(null)
	dbMock.employeeEmploymentType.findFirst.mockResolvedValue(null)
	dbMock.payrollRun.findFirst.mockResolvedValue(null)
	dbMock.employee.findFirst.mockResolvedValue(other)
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
	vi.mocked(createProposal).mockResolvedValue({ id: 'prop-1' } as never)
})

/** Nothing was written — the only acceptable state after a call was routed to a proposal. */
function expectNoWrite() {
	expect(dbMock.employeeCompensation.create).not.toHaveBeenCalled()
	expect(dbMock.employeeEmploymentType.create).not.toHaveBeenCalled()
	expect(dbMock.employee.update).not.toHaveBeenCalled()
	expect(dbMock.$transaction).not.toHaveBeenCalled()
}

describe('a self-action is filed, not written', () => {
	beforeEach(() => dbMock.employee.findFirst.mockResolvedValue(own))

	// Asserting the returned notice, not merely "it did not throw": the caller reports success on
	// this path, so the only thing stopping an unconfirmed raise from reading as a saved one is
	// this string reaching the form/API.
	it('recordCompensationChange on your own record files a COMPENSATION proposal', async () => {
		const input = { basicMonthlySalary: 99000, effectiveDate: PAST }
		const result = await recordCompensationChange('emp-hr', 'org1', input, ctxOf())

		expect(result).toEqual({ notice: AWAITING_CONFIRMATION, proposalId: 'prop-1' })
		expect(createProposal).toHaveBeenCalledWith(
			'org1',
			{
				targetEmployeeId: 'emp-hr',
				// The target's USER id, not the employee id: `createProposal` derives self-action from
				// it, and a wrong id here would silently downgrade the confirmer from finance to HR.
				targetUserId: HR,
				domain: 'COMPENSATION',
				// Stored verbatim, so confirming re-runs the writer against the state as it stands then
				// rather than replaying values resolved when it was filed.
				payload: input
			},
			expect.objectContaining({ actorId: HR })
		)
		expectNoWrite()
	})

	it('promoteEmployee on your own record files a PROMOTION proposal', async () => {
		const input = { effectiveDate: TODAY, jobTitle: 'Head of HR' }
		const result = await promoteEmployee('emp-hr', 'org1', input, ctxOf())

		expect(result).toEqual({ notice: AWAITING_CONFIRMATION, proposalId: 'prop-1' })
		expect(createProposal).toHaveBeenCalledWith(
			'org1',
			expect.objectContaining({ domain: 'PROMOTION', targetUserId: HR, payload: input }),
			expect.anything()
		)
		expectNoWrite()
	})

	// A CEO holds APPROVE_FINANCE and ADMINISTER_HR_ORGWIDE, so a capability check alone would wave
	// their own raise straight through. Self is checked first, independently of rank or capability.
	it('applies to a CEO on their own record too', async () => {
		await recordCompensationChange(
			'emp-hr',
			'org1',
			{ basicMonthlySalary: 500000, effectiveDate: PAST },
			ctxOf({ actorRoles: ['CEO'] })
		)
		expect(createProposal).toHaveBeenCalled()
		expectNoWrite()
	})
})

describe('a manager acting for someone else is filed, not written (#243)', () => {
	const managerCtx = ctxOf({ actorId: MANAGER, actorRoles: ['MANAGER'] })

	it('recordCompensationChange for a report files a proposal', async () => {
		const result = await recordCompensationChange(
			'emp-other',
			'org1',
			{ basicMonthlySalary: 45000, effectiveDate: PAST },
			managerCtx
		)
		expect(result.proposalId).toBe('prop-1')
		expect(createProposal).toHaveBeenCalledWith(
			'org1',
			// Not a self-action: the confirmer requirement is ADMINISTER_HR_ORGWIDE, which a MANAGER
			// does not hold — so no manager can confirm another manager's filing.
			expect.objectContaining({ targetUserId: 'user-other', domain: 'COMPENSATION' }),
			expect.anything()
		)
		expectNoWrite()
	})

	it('promoteEmployee for a report files a proposal', async () => {
		const result = await promoteEmployee(
			'emp-other',
			'org1',
			{ effectiveDate: TODAY, jobTitle: 'Shift Lead' },
			managerCtx
		)
		expect(result.proposalId).toBe('prop-1')
		expectNoWrite()
	})

	// The multi-role case (#133): a [MANAGER, VERIFIER] user still holds no org-wide HR authority,
	// while a [MANAGER, HR_ADMIN] one does. Reading only `actorRole` would get the second wrong.
	it('reads the full role set, not just the primary role', async () => {
		await recordCompensationChange(
			'emp-other',
			'org1',
			{ basicMonthlySalary: 45000, effectiveDate: PAST },
			ctxOf({ actorId: MANAGER, actorRoles: ['MANAGER', 'HR_ADMIN'] })
		)
		expect(createProposal).not.toHaveBeenCalled()
		expect(dbMock.employeeCompensation.create).toHaveBeenCalled()
	})
})

describe('org-wide HR acting on someone else still writes directly', () => {
	// The path 95% of real usage takes. It must be unchanged by all of the above: one transaction,
	// the snapshot inserted, the cache re-derived, and no proposal row anywhere.
	it('recordCompensationChange writes the snapshot in its own transaction', async () => {
		dbMock.employeeCompensation.findFirst.mockResolvedValue({
			basicMonthlySalary: 45000,
			rateType: 'MONTHLY'
		})
		const result = await recordCompensationChange(
			'emp-other',
			'org1',
			{ basicMonthlySalary: 45000, effectiveDate: PAST },
			ctxOf()
		)

		expect(createProposal).not.toHaveBeenCalled()
		expect(result).toEqual({ notice: undefined })
		expect(dbMock.$transaction).toHaveBeenCalledTimes(1)
		expect(dbMock.employeeCompensation.create).toHaveBeenCalledWith({
			data: expect.objectContaining({ employeeId: 'emp-other', basicMonthlySalary: 45000 })
		})
		expect(dbMock.employee.update).toHaveBeenCalledWith({
			where: { id: 'emp-other' },
			data: { basicMonthlySalary: 45000, rateType: 'MONTHLY' }
		})
	})

	it('promoteEmployee writes directly', async () => {
		await promoteEmployee('emp-other', 'org1', { effectiveDate: TODAY, jobTitle: 'Lead' }, ctxOf())
		expect(createProposal).not.toHaveBeenCalled()
		expect(dbMock.employee.update).toHaveBeenCalledWith({
			where: { id: 'emp-other' },
			data: { jobTitle: 'Lead' }
		})
	})

	it('a CEO and a SUPER_ADMIN take the direct path too', async () => {
		for (const actorRole of ['CEO', 'SUPER_ADMIN'] as const) {
			await promoteEmployee(
				'emp-other',
				'org1',
				{ effectiveDate: TODAY, jobTitle: 'Lead' },
				ctxOf({ actorRoles: [actorRole] })
			)
		}
		expect(createProposal).not.toHaveBeenCalled()
		expect(dbMock.employee.update).toHaveBeenCalledTimes(2)
	})
})

describe('validation runs before anything is filed', () => {
	// Filing first would be the easy shortcut, and it would trade an immediate 400 for a proposal
	// that only fails when a second person has already spent their time on it. The message, not just
	// the 400: the propose branch could produce its own 400s, and a status-only assertion would not
	// tell the two apart.
	const managerCtx = ctxOf({ actorId: MANAGER, actorRoles: ['MANAGER'] })

	it('rejects a no-op change without filing', async () => {
		await expect(
			recordCompensationChange(
				'emp-other',
				'org1',
				{ basicMonthlySalary: 30000, effectiveDate: PAST },
				managerCtx
			)
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'No change to record — enter a new salary or pay type.' }
		})
		expect(createProposal).not.toHaveBeenCalled()
	})

	it('rejects an illegal rate-basis pairing without filing', async () => {
		await expect(
			promoteEmployee(
				'emp-other',
				'org1',
				{ effectiveDate: TODAY, rateType: 'HOURLY', employmentType: 'REGULAR' },
				managerCtx
			)
		).rejects.toMatchObject({ status: 400, body: { message: RATE_BASIS_MISMATCH } })
		expect(createProposal).not.toHaveBeenCalled()
	})

	it('rejects an empty promotion without filing', async () => {
		await expect(
			promoteEmployee('emp-other', 'org1', { effectiveDate: TODAY }, managerCtx)
		).rejects.toMatchObject({ status: 400, body: { message: NO_CHANGE_MESSAGE } })
		expect(createProposal).not.toHaveBeenCalled()
	})
})

describe('applying a confirmed proposal', () => {
	// `confirmProposal` runs `apply` INSIDE the transaction that claims the row, so a failed apply
	// rolls the claim back to PENDING. Prisma has no nested interactive transactions, so the writer
	// must join that client rather than open its own — if it opened its own, the claim and the write
	// would commit independently and a stale payload would burn the proposal.
	it('writes on the supplied transaction client, not a new transaction', async () => {
		const tx = txMock()
		await applyProposedChange(
			'org1',
			{
				targetEmployeeId: 'emp-other',
				domain: 'COMPENSATION',
				payload: { basicMonthlySalary: 45000, effectiveDate: '2025-01-01T00:00:00.000Z' }
			},
			tx as never,
			ctxOf()
		)

		expect(tx.employeeCompensation.create).toHaveBeenCalled()
		expect(dbMock.$transaction).not.toHaveBeenCalled()
		expect(dbMock.employeeCompensation.create).not.toHaveBeenCalled()
	})

	// The payload is a Json column read back as `unknown`, so the Date the writer stored comes back
	// an ISO string. Casting instead of parsing would hand `utcMidnight` a string.
	it('coerces the effective date back from its JSON string form', async () => {
		const tx = txMock()
		await applyProposedChange(
			'org1',
			{
				targetEmployeeId: 'emp-other',
				domain: 'COMPENSATION',
				payload: { basicMonthlySalary: 45000, effectiveDate: '2025-01-01T00:00:00.000Z' }
			},
			tx as never,
			ctxOf()
		)
		expect(tx.employeeCompensation.create).toHaveBeenCalledWith({
			data: expect.objectContaining({ effectiveDate: new Date('2025-01-01T00:00:00.000Z') })
		})
	})

	it('routes a PROMOTION payload to promoteEmployee', async () => {
		const tx = txMock()
		await applyProposedChange(
			'org1',
			{
				targetEmployeeId: 'emp-other',
				domain: 'PROMOTION',
				payload: { jobTitle: 'Lead', effectiveDate: new Date().toISOString() }
			},
			tx as never,
			ctxOf()
		)
		expect(tx.employee.update).toHaveBeenCalledWith({
			where: { id: 'emp-other' },
			data: { jobTitle: 'Lead' }
		})
	})

	// Termination: applying must never file another proposal, or confirming would loop instead of
	// landing the change. Exercised with a confirmer who would otherwise be routed, because that is
	// the only way to observe the bypass — `confirmProposal`'s own capability check means a real
	// confirmer always holds ADMINISTER_HR_ORGWIDE today, and this contract must not depend on that
	// staying true.
	it('never re-proposes on the compensation path, whatever the applying actor holds', async () => {
		const tx = txMock()
		await applyProposedChange(
			'org1',
			{
				targetEmployeeId: 'emp-other',
				domain: 'COMPENSATION',
				payload: { basicMonthlySalary: 45000, effectiveDate: '2025-01-01T00:00:00.000Z' }
			},
			tx as never,
			ctxOf({ actorId: MANAGER, actorRoles: ['MANAGER'] })
		)
		expect(createProposal).not.toHaveBeenCalled()
		expect(tx.employeeCompensation.create).toHaveBeenCalled()
	})

	// The same bypass on the other writer. Asserted separately because it is a separate branch —
	// covering only one of the two leaves the other free to loop.
	it('never re-proposes on the promotion path either', async () => {
		const tx = txMock()
		await applyProposedChange(
			'org1',
			{
				targetEmployeeId: 'emp-other',
				domain: 'PROMOTION',
				payload: { jobTitle: 'Lead', effectiveDate: new Date().toISOString() }
			},
			tx as never,
			ctxOf({ actorId: MANAGER, actorRoles: ['MANAGER'] })
		)
		expect(createProposal).not.toHaveBeenCalled()
		expect(tx.employee.update).toHaveBeenCalledWith({
			where: { id: 'emp-other' },
			data: { jobTitle: 'Lead' }
		})
	})

	// Re-validation at apply time is the trust boundary the whole design leans on: the writer's own
	// guards re-run against current state, and throwing is what makes `confirmProposal` roll the
	// claim back to PENDING rather than burn the proposal on a payload that has gone stale.
	it('propagates the writer’s rejection when the payload has gone stale', async () => {
		const tx = txMock()
		await expect(
			applyProposedChange(
				'org1',
				{
					targetEmployeeId: 'emp-other',
					domain: 'COMPENSATION',
					// The employee already sits at 30000, so by the time this is confirmed it is a no-op.
					payload: { basicMonthlySalary: 30000, effectiveDate: '2025-01-01T00:00:00.000Z' }
				},
				tx as never,
				ctxOf()
			)
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'No change to record — enter a new salary or pay type.' }
		})
		expect(tx.employeeCompensation.create).not.toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #263 — the v1 PATCH wrote two privilege-relevant columns with none of the routing its UI twin has.
 * `reportsToId` re-parents a reporting line, which decides who approves that employee's timesheets
 * and leave; it reached `updateEmployee`, which has no `proposeIfRequired` call at all, so a MANAGER
 * made the change alone while `?/promote` needed a second person. `employmentStatus` reached the
 * same writer as a bare column, with none of `offboardEmployee`'s `endDate` or
 * `User.isActive = false` — so an "offboarded" employee kept a live session. The plausible-looking
 * wrong fix for the first is a `requireMinRole('HR_ADMIN')` gate, which admits MANAGER
 * (`ROLE_HIERARCHY` ranks them level) and so describes an empty set.
 *
 * A fourth thing this file pins is what the route will not even parse. `updateSchema` was a plain
 * `z.object`, so zod stripped unknown keys and a PATCH naming a field it did not know was a 200 that
 * silently discarded it — the same silent-strip trap the two gaps above were each fixed loudly to
 * avoid (#264). Note the ordering the cases below depend on: `.strict()` is evaluated inside
 * `safeParse`, so an unknown key is refused before the handler destructures anything, and a body
 * carrying both an unknown key and `employmentStatus` gets the generic parse 400 rather than the
 * offboard pointer. That is intended — such a body used to succeed with a silent partial write.
 */

// `$transaction` hands the writer the same client, so `tx.employee.update` IS
// `dbMock.employee.update` — which is what lets a case assert on the exact `data` a routed request
// did or did not write, rather than only on which of two mocks fired.
const { dbMock, listReportIdsFor } = vi.hoisted(() => ({
	listReportIdsFor: vi.fn(),
	dbMock: {
		employee: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			findUniqueOrThrow: vi.fn(),
			update: vi.fn()
		},
		employeeCompensation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
		employeeEmploymentType: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
		payrollRun: { findFirst: vi.fn() },
		position: { findFirst: vi.fn() },
		branch: { findMany: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/notifications', () => ({
	notify: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('$lib/server/services/supervisors', () => ({
	listReportIdsFor,
	// A factory mock replaces the whole module, so every export its importers pull must be present.
	listSupervisorsFor: vi.fn().mockResolvedValue([]),
	setSupervisors: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('$lib/server/services/action-proposals', () => ({
	createProposal: vi.fn().mockResolvedValue({ id: 'prop-1' }),
	// Imported by employees.ts for the audited reveal — unused here, but a factory mock replaces the
	// whole module, so omitting it makes the import undefined rather than absent.
	assertMayConfirmProposal: vi.fn()
}))

const { PATCH } = await import('../../src/routes/api/v1/employees/[id]/+server')
const { createProposal } = await import('$lib/server/services/action-proposals')
const { AWAITING_CONFIRMATION } = await import('$lib/server/services/employees')

const ORG = 'org1'
const ACTOR_USER = 'user-actor'
const ACTOR_EMP = 'emp-actor'
const TARGET = 'emp1'
const DAY = 24 * 60 * 60 * 1000

/** The target 201 file — someone else's, and a direct report of the actor. */
const EMP = {
	id: TARGET,
	userId: 'user-target',
	basicMonthlySalary: 30000,
	rateType: 'MONTHLY' as const,
	employmentType: 'REGULAR' as const,
	employmentStatus: 'ACTIVE' as const,
	startDate: new Date('2024-01-01'),
	positionId: null,
	jobTitle: 'Crew',
	reportsToId: ACTOR_EMP,
	branchId: null
}

const patch = (body: unknown, roles: Role[] = ['HR_ADMIN'], actorUser = ACTOR_USER) =>
	PATCH({
		locals: { user: { id: actorUser, organizationId: ORG, roles } },
		params: { id: TARGET },
		request: { json: async () => body }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)

/** The data of the FIRST Employee write, or undefined when nothing was written. */
const writtenData = () => dbMock.employee.update.mock.calls[0]?.[0]?.data

/**
 * A routed request must leave the reporting line where it was until someone confirms it. Asserted
 * as "no write carried the column" rather than "no write happened", because `rest` is never empty
 * on this route: `govIdSchema` (#191) transforms an absent government ID into `null`, so
 * `parsed.data` always carries four gov-ID keys and `updateEmployee` always runs. That is
 * pre-existing and independent of #263 — what #263 changes is whether `reportsToId` is among the
 * keys it hands over.
 *
 * #5: `expect(dbMock.$transaction).not.toHaveBeenCalled()` used to be the companion assertion,
 * because only promoteEmployee's own write opened a transaction. updateEmployee now opens one for
 * every accepted edit, so an untouched `$transaction` no longer means anything here. The loop below
 * is the whole check instead, and it stays complete because the transaction client IS `dbMock` —
 * a routed write would land in `employee.update.mock.calls` either way. The one case where a write
 * really does happen alongside a routed field pins that directly, with `writtenData().contactPhone`.
 */
function expectReportingLineNotWritten() {
	for (const call of dbMock.employee.update.mock.calls) {
		expect(call[0].data).not.toHaveProperty('reportsToId')
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock))
	dbMock.employee.findFirst.mockResolvedValue(EMP)
	dbMock.employee.update.mockResolvedValue(EMP)
	// #5: updateEmployee reads its `before` snapshot inside the transaction.
	dbMock.employee.findUniqueOrThrow.mockResolvedValue(EMP)
	// `canTouchEmployee` for a bare MANAGER: their own record, and a reporting line holding the target.
	dbMock.employee.findUnique.mockResolvedValue({ id: ACTOR_EMP })
	listReportIdsFor.mockResolvedValue([TARGET])
	dbMock.branch.findMany.mockResolvedValue([])
	// getEmployee's heal-on-read has no history to reconcile.
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
	dbMock.employeeCompensation.findFirst.mockResolvedValue(null)
	dbMock.employeeEmploymentType.findFirst.mockResolvedValue(null)
	dbMock.payrollRun.findFirst.mockResolvedValue(null)
})

describe('reportsToId is proposal-routed (#263)', () => {
	it('files a proposal for a bare [MANAGER] and writes nothing', async () => {
		const res = await patch({ reportsToId: 'mgr2' }, ['MANAGER'])

		expect(res.status).toBe(202)
		expect(await res.json()).toMatchObject({
			proposalId: 'prop-1',
			notice: AWAITING_CONFIRMATION
		})
		expect(createProposal).toHaveBeenCalledWith(
			ORG,
			expect.objectContaining({
				domain: 'PROMOTION',
				// The target's USER id: `createProposal` derives isSelfAction from it, and a wrong id
				// here would silently downgrade the confirmer requirement.
				targetUserId: EMP.userId,
				payload: expect.objectContaining({ reportsToId: 'mgr2' })
			}),
			expect.anything()
		)
		expectReportingLineNotWritten()
	})

	it('writes directly for a [MANAGER, HR_ADMIN] user — 200', async () => {
		// #247's full-role-set rule, on the new field: authority comes from every role held.
		const res = await patch({ reportsToId: 'mgr2' }, ['MANAGER', 'HR_ADMIN'])

		expect(res.status).toBe(200)
		expect(createProposal).not.toHaveBeenCalled()
		expect(writtenData().reportsToId).toBe('mgr2')
	})

	it('files a self-action proposal when the actor re-points their own line', async () => {
		// An HR_ADMIN actor, so the routing is provably the SELF branch and not the
		// missing-capability one — an HR_ADMIN holds ADMINISTER_HR_ORGWIDE.
		const res = await patch({ reportsToId: 'mgr2' }, ['HR_ADMIN'], EMP.userId)

		expect(res.status).toBe(202)
		expect(createProposal).toHaveBeenCalledWith(
			ORG,
			expect.objectContaining({ targetUserId: EMP.userId, domain: 'PROMOTION' }),
			expect.anything()
		)
		expectReportingLineNotWritten()
	})

	it('does not let the field reach updateEmployee in the same request', async () => {
		// The single most important case in the file. Left in `rest`, `reportsToId` would be written
		// by updateEmployee the moment the proposal was filed — a change that reads as "awaiting
		// confirmation" (202) but has already landed.
		const res = await patch({ reportsToId: 'mgr2', contactPhone: '0917' }, ['MANAGER'])

		expect(res.status).toBe(202)
		expect(createProposal).toHaveBeenCalledTimes(1)
		// The other field DID apply — it is not routed through proposals — but the write that carried
		// it must not carry the reporting line with it.
		expect(writtenData().contactPhone).toBe('0917')
		expectReportingLineNotWritten()
	})

	it('still writes directly for an HR_ADMIN acting on someone else', async () => {
		// The 95%-of-usage path, unchanged.
		const res = await patch({ reportsToId: 'mgr2' })

		expect(res.status).toBe(200)
		expect(createProposal).not.toHaveBeenCalled()
		expect(writtenData().reportsToId).toBe('mgr2')
	})

	it('treats resending the current reporting line as a no-op, not a 400', async () => {
		// The route's NO_CHANGE swallow now covers this path too: promoteEmployee refuses an empty
		// promotion before it files anything, and the route returns the unchanged record.
		dbMock.employee.findFirst.mockResolvedValue({ ...EMP, reportsToId: 'mgr2' })

		const res = await patch({ reportsToId: 'mgr2' })

		expect(res.status).toBe(200)
		expect(createProposal).not.toHaveBeenCalled()
		expectReportingLineNotWritten()
	})
})

describe('the hire-date floor, at the door #263 opens (#266)', () => {
	const PRE_BOARDED = { ...EMP, startDate: new Date(Date.now() + 30 * DAY) }

	it('lets a pre-boarded hire’s reporting line through', async () => {
		dbMock.employee.findFirst.mockResolvedValue(PRE_BOARDED)

		const res = await patch({ reportsToId: 'mgr2' })

		expect(res.status).toBe(200)
		expect(writtenData().reportsToId).toBe('mgr2')
		expect(createProposal).not.toHaveBeenCalled()
	})

	it('still refuses a pre-boarded hire’s PAY change', async () => {
		// The floor must still bite for the case it exists to protect, and still bite BEFORE anything
		// is filed. Case A green and this one green means the gate is drawn in the right place; both
		// 400 means the floor was never gated, both 200 means it was removed instead of gated.
		dbMock.employee.findFirst.mockResolvedValue(PRE_BOARDED)

		const res = await patch({ basicMonthlySalary: 50000 })

		expect(res.status).toBe(400)
		expect(await res.json()).toMatchObject({
			error: 'Effective date cannot be before the hire date.'
		})
		expect(dbMock.employee.update).not.toHaveBeenCalled()
		expect(createProposal).not.toHaveBeenCalled()
	})
})

describe('the rest of the reporting-line contract (#263)', () => {
	it('still refuses a cross-tenant manager id, and files nothing', async () => {
		// #1 getEmployee inside promoteEmployee → #2 the org-scoped manager lookup finds nothing.
		// Status, not message: the route flattens every 404 to 'Employee not found'.
		dbMock.employee.findFirst.mockResolvedValueOnce(EMP).mockResolvedValueOnce(null)

		const res = await patch({ reportsToId: 'emp-other-org' })

		expect(res.status).toBe(404)
		expect(createProposal).not.toHaveBeenCalled()
		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})

	it('answers an empty-string reportsToId with a clean 404, not a 500', async () => {
		// Pins that the field now takes promoteEmployee's `!== undefined` path: '' is falsy, so the
		// guard updateEmployee applies would have skipped it and handed Prisma a bad FK.
		dbMock.employee.findFirst.mockResolvedValueOnce(EMP).mockResolvedValueOnce(null)

		const res = await patch({ reportsToId: '' })

		expect(res.status).toBe(404)
		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})
})

describe('employmentStatus is not editable here (#263)', () => {
	it('refuses OFFBOARDED and points at the offboard action', async () => {
		const res = await patch({ employmentStatus: 'OFFBOARDED' })

		expect(res.status).toBe(400)
		expect((await res.json()).error).toContain('?action=offboard')
		expect(dbMock.employee.update).not.toHaveBeenCalled()
		// The rejection precedes every query.
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
	})

	it('refuses ACTIVE and ON_LEAVE too', async () => {
		// Not just the destructive value: OFFBOARDED → ACTIVE is the un-offboard that leaves
		// `User.isActive` false, and ON_LEAVE has no writer anywhere in the product.
		for (const employmentStatus of ['ACTIVE', 'ON_LEAVE'] as const) {
			const res = await patch({ employmentStatus })
			expect(res.status).toBe(400)
		}
		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})

	it('refuses the whole request rather than applying the rest of it', async () => {
		// The caller resubmits without the field. Pins that we did not build a partial apply.
		const res = await patch({ employmentStatus: 'OFFBOARDED', contactPhone: '0917' })

		expect(res.status).toBe(400)
		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})

	it('leaves a PATCH that carries no employmentStatus untouched', async () => {
		const res = await patch({ contactPhone: '0917' })

		expect(res.status).toBe(200)
		expect(writtenData().contactPhone).toBe('0917')
	})
})

describe('unknown fields are refused, not stripped (#264)', () => {
	it('refuses an unrecognized key with a 400 instead of a silent 200', async () => {
		const res = await patch({ nickname: 'Bibo' })

		expect(res.status).toBe(400)
		expect(dbMock.employee.update).not.toHaveBeenCalled()
		// The parse gate precedes every query — the same property the employmentStatus rejection has.
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
	})

	it('refuses the whole body when an unknown key rides along with a known one', async () => {
		const res = await patch({ contactPhone: '0917', nickname: 'Bibo' })

		expect(res.status).toBe(400)
		// `.strict()` is not a partial apply: the known half does not land either.
		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})
})

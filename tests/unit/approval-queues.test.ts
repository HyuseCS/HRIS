import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * The queue and badge mirrors of the #283 separation-of-duties bar.
 *
 * DECISION-4's whole justification for putting the guard inside `canActOnStage` rather than inline
 * in `decide()` was that the queues and the sidebar badge would inherit it structurally. VALIDATE
 * found that mirror was untested repo-wide — nothing covered listPendingRequestsForApprover,
 * countPendingApprovals, countActionableTimesheets or countActionablePayrollRuns. The plan's
 * central architectural argument was unproven by construction. This file is what makes it true.
 *
 * Every case asserts contents or a count, never that the call resolved. A "did not throw"
 * assertion on a function returning a number proves nothing, and this repo has shipped that
 * mistake before.
 *
 * The failure mode these are really aimed at is silent: if a query forgets to select `actorId`,
 * decidedActorIds returns [] for every row and the bar stops existing — with the pure-function
 * tests in approval-self-guard.test.ts still green.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		request: { findMany: vi.fn() },
		timesheet: { findMany: vi.fn() },
		payrollRun: { findMany: vi.fn() },
		employee: { findFirst: vi.fn() },
		actionProposal: { findMany: vi.fn() }
	}
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))

const {
	listPendingRequestsForApprover,
	countActionableTimesheets,
	countActionablePayrollRuns,
	countPendingApprovals
} = await import('$lib/server/services/approvals')

/**
 * Emulates Prisma's projection for the nested `approvalSteps` select.
 *
 * A flat mockResolvedValue hands back the whole fixture row whatever the query asked for, which
 * makes "the guard reads this field" assertions VACUOUS: drop `actorId: true` from the real select
 * and every test here still passes while the bar silently stops existing in production. That is
 * the exact silent-failure mode DEC-2 is supposed to catch, and it slipped through the first
 * version of this file. Same trap as dashboard-org-scoping.test.ts and audit-log-reveal.test.ts
 * (#242) — reach for this helper whenever a test asserts what a query DOES or does not return.
 */
const project = <T extends Record<string, unknown>>(
	rows: T[],
	args: Record<string, { select?: Record<string, true> } | undefined> | undefined,
	relation: string
): T[] => {
	const fields = args?.[relation]?.select
	if (!fields) return rows
	const keys = Object.keys(fields)
	return rows.map((r) => ({
		...r,
		[relation]: (r[relation] as Record<string, unknown>[]).map((child) =>
			Object.fromEntries(keys.map((k) => [k, child[k]]))
		)
	})) as T[]
}

// `select` for the counters, `include` for the request queue — the helper is told which.
const projectSteps = <T extends Record<string, unknown>>(
	rows: T[],
	args: { select?: Record<string, { select?: Record<string, true> } | undefined> }
) => project(rows, args?.select, 'approvalSteps')

const projectDocs = <T extends Record<string, unknown>>(
	rows: T[],
	args: { include?: Record<string, { select?: Record<string, true> } | undefined> }
) => project(rows, args?.include, 'documents')

/**
 * #299 — `projectDocs` honours the include's `select` KEYS and is blind to a `where`.
 *
 * That blindness matters here specifically: `listPendingRequestsForApprover`'s documents array
 * feeds `verifiedDocActorIds`, the queue's mirror of the #283/F3 bar, and it must keep seeing a
 * TOMBSTONED signer. Add `where: { deletedAt: null }` to that include and reader 2 of 9 silently
 * stops barring the actor who signed evidence they then removed — on the reader that is watched
 * least, with every other test still green.
 *
 * A deliberate local copy of the helper in approval-self-guard.test.ts, not a shared import: two
 * callers is duplication, and this repo promotes to tests/unit/helpers/ at a third, not a second.
 */
const projectDocsHonouringWhere = <T extends Record<string, unknown>>(
	rows: T[],
	args: {
		include?: {
			documents?: { select?: Record<string, true>; where?: Record<string, unknown> }
		}
	}
) => {
	const where = args?.include?.documents?.where
	const filtered = !where
		? rows
		: rows.map((r) => ({
				...r,
				documents: (r.documents as Record<string, unknown>[]).filter((d) =>
					Object.entries(where).every(([k, v]) => d[k] === v)
				)
			}))
	return projectDocs(filtered as T[], args)
}

const VIEWER = 'user-viewer'
const TWO_HAT: Role[] = ['VERIFIER', 'APPROVER']

// A PENDING request sitting on its APPROVE stage, whose VERIFY was signed by `verifiedBy`.
const requestAt = (id: string, verifiedBy: string) => ({
	id,
	currentStage: 1,
	employeeId: `emp-${id}`,
	steps: [
		{ attempt: 1, stageIndex: 0, stage: 'VERIFY', decision: 'APPROVED', actorId: verifiedBy },
		{ attempt: 1, stageIndex: 1, stage: 'APPROVE', decision: null, actorId: null }
	],
	employee: { id: `emp-${id}`, firstName: 'A', lastName: 'B', reportsToId: null },
	documents: []
})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.employee.findFirst.mockResolvedValue({ id: 'emp-viewer' })
	dbMock.actionProposal.findMany.mockResolvedValue([])
	dbMock.timesheet.findMany.mockResolvedValue([])
	dbMock.payrollRun.findMany.mockResolvedValue([])
})

describe('listPendingRequestsForApprover (#283/AC-15)', () => {
	it('excludes a request the viewer already decided a stage of', async () => {
		const seeded = [requestAt('own', VIEWER), requestAt('other', 'user-someone-else')]
		dbMock.request.findMany.mockImplementation(async (args: never) => projectDocs(seeded, args))

		const rows = await listPendingRequestsForApprover('org1', TWO_HAT, 'emp-viewer', VIEWER)

		// The negative control is the point: a bar that excluded everything would pass a
		// "does not contain own" assertion just as well.
		expect(rows.map((r) => r.id)).toEqual(['other'])
	})

	// AC-21 — the queue mirror of F3. The silent-failure mode named in the header is live here:
	// drop `verifiedById` from the documents select and verifiedDocActorIds goes empty for every
	// row, the bar quietly stops existing, and the pure-function tests stay green.
	it('excludes a request whose document the viewer verified (#283/AC-21)', async () => {
		const withDoc = {
			...requestAt('signed', 'user-else'),
			documents: [{ id: 'd1', verifiedAt: new Date(), verifiedById: VIEWER }]
		}
		const seeded = [withDoc, requestAt('clean', 'user-else')]
		dbMock.request.findMany.mockImplementation(async (args: never) => projectDocs(seeded, args))

		const rows = await listPendingRequestsForApprover('org1', TWO_HAT, 'emp-viewer', VIEWER)
		expect(rows.map((r) => r.id)).toEqual(['clean'])
	})

	// The bar reads verifiedById, so a CLEARED sign-off (verifiedAt null, verifiedById kept — D11)
	// still excludes the row. This is the queue half of the un-verify bypass AC-28 closes.
	it('keeps excluding it after the sign-off is cleared (#283/AC-28)', async () => {
		const cleared = {
			...requestAt('signed', 'user-else'),
			documents: [{ id: 'd1', verifiedAt: null, verifiedById: VIEWER }]
		}
		dbMock.request.findMany.mockImplementation(async (args: never) => projectDocs([cleared], args))

		expect(await listPendingRequestsForApprover('org1', TWO_HAT, 'emp-viewer', VIEWER)).toEqual([])
	})

	// #299 — the queue half of AC-2. #283 made a CLEARED sign-off keep barring the actor; this makes
	// a REMOVED document keep barring them, which is the same bypass one step further along:
	// un-verify, delete, re-upload. Runs through the `where`-honouring helper above, so adding a
	// filter to the documents include at approvals.ts flips this case from exclude to include.
	it('keeps excluding it after the document was removed (#299)', async () => {
		const tombstoned = {
			...requestAt('signed', 'user-else'),
			documents: [{ id: 'd1', verifiedAt: null, verifiedById: VIEWER, deletedAt: new Date() }]
		}
		const seeded = [tombstoned, requestAt('clean', 'user-else')]
		dbMock.request.findMany.mockImplementation(async (args: never) =>
			projectDocsHonouringWhere(seeded, args)
		)

		const rows = await listPendingRequestsForApprover('org1', TWO_HAT, 'emp-viewer', VIEWER)
		expect(rows.map((r) => r.id)).toEqual(['clean'])
	})

	// #299/AC-8 — the P-5 split, both halves in ONE case on purpose. `documents` is the bar's input
	// and keeps the tombstone; `liveDocuments` is what the approvals page's document chip and
	// unverified badge count, and must not, because an approver cannot open a removed file. Asserted
	// together so a future edit cannot satisfy one half and quietly break the other.
	it('exposes liveDocuments without tombstones while documents keeps them (#299/AC-8)', async () => {
		const seeded = [
			{
				...requestAt('mixed', 'user-else'),
				documents: [
					{ id: 'd-removed', verifiedAt: null, verifiedById: null, deletedAt: new Date() },
					{ id: 'd-live', verifiedAt: null, verifiedById: null, deletedAt: null }
				]
			}
		]
		dbMock.request.findMany.mockImplementation(async (args: never) =>
			projectDocsHonouringWhere(seeded, args)
		)

		const rows = await listPendingRequestsForApprover('org1', TWO_HAT, 'emp-viewer', VIEWER)

		expect(rows[0].liveDocuments.map((d) => d.id)).toEqual(['d-live'])
		expect(rows[0].documents.map((d) => d.id)).toEqual(['d-removed', 'd-live'])
	})

	it('still returns the same request for a different approver', async () => {
		const seeded = [requestAt('own', VIEWER)]
		dbMock.request.findMany.mockImplementation(async (args: never) => projectDocs(seeded, args))

		const rows = await listPendingRequestsForApprover('org1', TWO_HAT, 'emp-x', 'user-other')
		expect(rows.map((r) => r.id)).toEqual(['own'])
	})
})

describe('countActionableTimesheets (#283/DEC-2)', () => {
	const timesheetAt = (verifiedBy: string) => ({
		employeeId: 'emp-someone',
		approvalSteps: [
			{ attempt: 1, stageIndex: 0, stage: 'VERIFY', decision: 'APPROVED', actorId: verifiedBy },
			{ attempt: 1, stageIndex: 1, stage: 'APPROVE', decision: null, actorId: null }
		]
	})

	it('excludes a timesheet the viewer already decided', async () => {
		const seeded = [timesheetAt(VIEWER), timesheetAt('user-else')]
		dbMock.timesheet.findMany.mockImplementation(async (args: never) => projectSteps(seeded, args))

		expect(await countActionableTimesheets('org1', TWO_HAT, 'emp-viewer', VIEWER)).toBe(1)
	})
})

describe('countActionablePayrollRuns (#283/AC-27 count half)', () => {
	const runAt = (verifiedBy: string, madeBy = 'user-maker') => ({
		approvalSteps: [
			{ id: 'm', attempt: 1, stageIndex: 0, stage: 'MAKE', decision: 'APPROVED', actorId: madeBy },
			{
				id: 'v',
				attempt: 1,
				stageIndex: 1,
				stage: 'VERIFY',
				decision: 'APPROVED',
				actorId: verifiedBy
			},
			{ id: 'a', attempt: 1, stageIndex: 2, stage: 'APPROVE', decision: null, actorId: null }
		]
	})

	it('excludes a run the viewer verified', async () => {
		const seeded = [runAt(VIEWER), runAt('user-else')]
		dbMock.payrollRun.findMany.mockImplementation(async (args: never) => projectSteps(seeded, args))

		expect(await countActionablePayrollRuns('org1', ['VERIFIER', 'CEO'], VIEWER)).toBe(1)
	})

	// The clause `&& makeActorId !== userId` was deleted as subsumed. This proves the subsumption
	// rather than assuming it: the maker must still be excluded, now via decidedActorIds.
	it('still excludes the run the viewer prepared, with no maker clause left', async () => {
		const seeded = [runAt('user-else', VIEWER)]
		dbMock.payrollRun.findMany.mockImplementation(async (args: never) => projectSteps(seeded, args))

		expect(await countActionablePayrollRuns('org1', ['VERIFIER', 'CEO'], VIEWER)).toBe(0)
	})
})

describe('countPendingApprovals — the sidebar badge (#283/US-8)', () => {
	// US-8: "my to-do count tells the truth." The badge must agree with the queue, or the user is
	// sent looking for work that is not there.
	it('counts only the requests the queue would show', async () => {
		const seeded = [requestAt('own', VIEWER), requestAt('other', 'user-else')]
		dbMock.request.findMany.mockImplementation(async (args: never) => projectDocs(seeded, args))

		const counts = await countPendingApprovals({
			id: VIEWER,
			roles: TWO_HAT,
			organizationId: 'org1'
		})

		expect(counts.requests).toBe(1)
		expect(counts.total).toBe(1)
	})
})

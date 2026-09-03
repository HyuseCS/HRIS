import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'
import type { Role } from '@prisma/client'

/**
 * #283/F4 — separation of duties on job postings, at the service level.
 *
 * Two rules, neither of which existed before:
 *
 *  - D8: a department's `PostingApprover` mapping BINDS. It used to be decorative — the last line
 *    of `canApprovePosting` answered "any MANAGE_HR holder?" unconditionally, so the branch above
 *    it could never change the outcome and every HR admin could decide every posting.
 *  - D9: the submitter of a posting cannot decide it, with no HR-steps-in fallback. A posting whose
 *    designated approver submitted it is undecidable until HR remaps the department, so the 403
 *    must name that route.
 *
 * The pure `canApprovePosting` cases live in posting-approval.test.ts. These are the cases that
 * need a mocked db: they run through `decideJobPosting` (which resolves the mapping itself) and
 * `listPostingsAwaitingApprover`.
 *
 * Every case asserts arguments or contents — that `jobPosting.update` was NOT called, which
 * posting ids came back — never that a call resolved.
 *
 * KEY TYPES: `submittedById` and `ctx.actorId` are USER ids; `approverId` and the actor's
 * `employeeId` are EMPLOYEE ids. The fixtures below keep them visibly distinct (`user-` vs `emp-`)
 * because a cross-family comparison would make the guard silently never fire while every
 * "refused" test still passed.
 */

const { dbMock, txMock, notifyMock } = vi.hoisted(() => ({
	dbMock: {
		jobPosting: { findFirst: vi.fn(), findMany: vi.fn() },
		postingApprover: { findUnique: vi.fn(), findMany: vi.fn() },
		employee: { findUnique: vi.fn() },
		$transaction: vi.fn()
	},
	// #5: the posting write and its audit row now share one transaction, so the update runs on
	// the tx client — asserting on txMock.jobPosting.update would silently stop observing it.
	txMock: { jobPosting: { update: vi.fn() } },
	notifyMock: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
const { writeAuditLog } = await import('$lib/server/audit')
vi.mock('$lib/server/services/notifications', () => ({ notify: notifyMock }))

const { decideJobPosting, listPostingsAwaitingApprover, submitJobPostingForApproval } =
	await import('$lib/server/services/recruitment')

/**
 * Emulates Prisma's projection for a top-level `select`.
 *
 * A flat mockResolvedValue hands back the whole fixture row whatever the query asked for, which
 * makes "the guard reads this field" assertions VACUOUS: add a `select` to the real query that
 * omits `submittedById` and every case here would still pass while the D9 bar silently stopped
 * existing. Same trap as the `project()` helper in approval-queues.test.ts.
 */
const project = <T extends Record<string, unknown>>(
	row: T,
	args: { select?: Record<string, true> } | undefined
): T => {
	const fields = args?.select
	if (!fields) return row
	return Object.fromEntries(Object.keys(fields).map((k) => [k, row[k]])) as T
}

const HR: Role[] = ['HR_ADMIN']
const EMP: Role[] = ['EMPLOYEE']

const MAPPED_DEPT = 'dept-software'
const UNMAPPED_DEPT = 'dept-ops'
const APPROVER_EMP = 'emp-approver'

const ctxOf = (actorId: string, actorRoles: Role[]): AuditContext => ({
	organizationId: 'org1',
	actorId,
	actorRoles
})

// A posting awaiting a decision. `submittedById` is a USER id.
const postingRow = (over: { departmentId?: string; submittedById?: string | null } = {}) => ({
	id: 'jp1',
	organizationId: 'org1',
	title: 'Senior Developer',
	status: 'PENDING_APPROVAL' as const,
	departmentId: MAPPED_DEPT,
	submittedById: 'user-someone-else',
	...over
})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.jobPosting.findFirst.mockImplementation(async (args) => project(postingRow(), args))
	txMock.jobPosting.update.mockResolvedValue({ id: 'jp1', status: 'OPEN' })
	dbMock.$transaction.mockImplementation((fn: (client: typeof txMock) => Promise<unknown>) =>
		fn(txMock)
	)
	// APPROVER_EMP is an EMPLOYEE id; the notification needs the USER behind it.
	dbMock.employee.findUnique.mockResolvedValue({ userId: 'user-approver' })
	// Only MAPPED_DEPT has a row; anything else resolves to null (the HR fallback).
	dbMock.postingApprover.findUnique.mockImplementation(async (args) =>
		args.where.organizationId_departmentId.departmentId === MAPPED_DEPT
			? project({ departmentId: MAPPED_DEPT, approverId: APPROVER_EMP }, args)
			: null
	)
})

describe('canApprovePosting (#283/D8, through decideJobPosting)', () => {
	// AC-23. HR_ADMIN holds MANAGE_HR, so before D8 this was allowed unconditionally.
	it('a mapped department is decidable only by its designated approver', async () => {
		await expect(
			decideJobPosting(
				'jp1',
				'org1',
				{ approve: true },
				{ employeeId: 'emp-hr', roles: HR },
				ctxOf('user-hr', HR)
			)
		).rejects.toMatchObject({
			status: 403,
			body: { message: 'You are not the approver for this posting' }
		})
		expect(txMock.jobPosting.update).not.toHaveBeenCalled()
	})

	it('lets the mapped department’s designated approver decide, without any HR role', async () => {
		await decideJobPosting(
			'jp1',
			'org1',
			{ approve: true },
			{ employeeId: APPROVER_EMP, roles: EMP },
			ctxOf('user-approver', EMP)
		)
		expect(txMock.jobPosting.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'jp1' },
				data: expect.objectContaining({ status: 'OPEN', approvedById: 'user-approver' })
			})
		)
		// #5: the audit write shares the transaction that commits the decision.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), txMock)
	})

	// AC-24. The fallback survives D8 — it is the whole point of "HR is the fallback, not an
	// override".
	it('an unmapped department still falls back to any MANAGE_HR holder', async () => {
		dbMock.jobPosting.findFirst.mockImplementation(async (args) =>
			project(postingRow({ departmentId: UNMAPPED_DEPT }), args)
		)
		await decideJobPosting(
			'jp1',
			'org1',
			{ approve: true },
			{ employeeId: 'emp-hr', roles: HR },
			ctxOf('user-hr', HR)
		)
		expect(txMock.jobPosting.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'jp1' },
				data: expect.objectContaining({ status: 'OPEN', approvedById: 'user-hr' })
			})
		)
	})
})

describe('decideJobPosting — the submitter may not decide (#283/D9)', () => {
	// AC-25. The actor here IS the department's designated approver, so they clear
	// canApprovePosting — this guard is the only thing standing between them and approving their
	// own submission. The message is asserted, not just the status: D9 gives no HR fallback, so
	// naming the remap route is the only way out of the 403.
	it('refuses the submitter and names the remap route', async () => {
		dbMock.jobPosting.findFirst.mockImplementation(async (args) =>
			project(postingRow({ submittedById: 'user-approver' }), args)
		)
		const err = await decideJobPosting(
			'jp1',
			'org1',
			{ approve: true },
			{ employeeId: APPROVER_EMP, roles: EMP },
			ctxOf('user-approver', EMP)
		).catch((e) => e)

		expect(err).toMatchObject({ status: 403 })
		expect(err.body.message).toContain('Settings → Posting approvers')
		expect(txMock.jobPosting.update).not.toHaveBeenCalled()
	})

	// The negative control for the message above. On an UNMAPPED department HR is the fallback, so
	// the posting is NOT stuck behind a remap — any OTHER MANAGE_HR holder can decide it. Sending
	// this submitter to Settings → Posting approvers would point them at a mapping that does not
	// exist, so the two branches must say different things.
	it('tells an unmapped department’s HR submitter that another HR admin decides it', async () => {
		dbMock.jobPosting.findFirst.mockImplementation(async (args) =>
			project(postingRow({ departmentId: UNMAPPED_DEPT, submittedById: 'user-hr' }), args)
		)
		const err = await decideJobPosting(
			'jp1',
			'org1',
			{ approve: true },
			{ employeeId: 'emp-hr', roles: HR },
			ctxOf('user-hr', HR)
		).catch((e) => e)

		expect(err).toMatchObject({ status: 403 })
		expect(err.body.message).not.toContain('Settings → Posting approvers')
		expect(err.body.message).toContain('Another HR admin must decide it')
		expect(txMock.jobPosting.update).not.toHaveBeenCalled()

		// ...and a DIFFERENT MANAGE_HR holder really can, which is what makes that advice true.
		await decideJobPosting(
			'jp1',
			'org1',
			{ approve: true },
			{ employeeId: 'emp-hr2', roles: HR },
			ctxOf('user-hr2', HR)
		)
		expect(txMock.jobPosting.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'jp1' },
				data: expect.objectContaining({ status: 'OPEN', approvedById: 'user-hr2' })
			})
		)
	})

	it('does not bar an approver who merely shares an id shape with the submitter', async () => {
		// APPROVER_EMP is an EMPLOYEE id and submittedById is a USER id; if the guard ever compared
		// across the two families it would either never fire or fire on the wrong person.
		dbMock.jobPosting.findFirst.mockImplementation(async (args) =>
			project(postingRow({ submittedById: APPROVER_EMP }), args)
		)
		await decideJobPosting(
			'jp1',
			'org1',
			{ approve: true },
			{ employeeId: APPROVER_EMP, roles: EMP },
			ctxOf('user-approver', EMP)
		)
		expect(txMock.jobPosting.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ status: 'OPEN' }) })
		)
	})
})

describe('submitJobPostingForApproval — who gets told (#283/D9)', () => {
	const draft = {
		id: 'jp1',
		organizationId: 'org1',
		title: 'Senior Developer',
		status: 'DRAFT' as const,
		departmentId: MAPPED_DEPT,
		submittedById: null
	}

	it('notifies the designated approver when someone else submitted', async () => {
		dbMock.jobPosting.findFirst.mockImplementation(async (args) => project(draft, args))
		await submitJobPostingForApproval('jp1', 'org1', ctxOf('user-hr', HR))
		expect(notifyMock).toHaveBeenCalledWith(
			'user-approver',
			expect.stringContaining('awaiting your approval'),
			'/dashboard',
			'RECRUITMENT'
		)
	})

	// The submitter is barred from deciding it (D9), so notifying them would invite a 403 and
	// nothing else. Their own submit confirmation is the only truthful signal here.
	it('does not notify the designated approver about their own submission', async () => {
		dbMock.jobPosting.findFirst.mockImplementation(async (args) => project(draft, args))
		await submitJobPostingForApproval('jp1', 'org1', ctxOf('user-approver', EMP))
		expect(notifyMock).not.toHaveBeenCalled()
	})
})

describe('listPostingsAwaitingApprover — the card mirrors the bar (#283)', () => {
	const cardRow = (id: string, submittedById: string) => ({
		id,
		title: `Posting ${id}`,
		departmentId: MAPPED_DEPT,
		submittedById,
		updatedAt: new Date('2026-08-11'),
		department: { name: 'Software' }
	})

	// AC-26. Both rows sit in the department this viewer approves; only the one they submitted
	// themselves is dropped, so a green result cannot come from an empty list.
	it('omits postings the viewer submitted', async () => {
		// Projected, not flat: if the real findMany ever grew a `select` that dropped
		// submittedById, the filter would compare undefined and this case must go red.
		dbMock.jobPosting.findMany.mockImplementation(async (args) =>
			[cardRow('jp-mine', 'user-approver'), cardRow('jp-theirs', 'user-someone-else')].map((r) =>
				project(r, args)
			)
		)
		dbMock.postingApprover.findMany.mockResolvedValue([
			{ departmentId: MAPPED_DEPT, approverId: APPROVER_EMP }
		])

		const rows = await listPostingsAwaitingApprover('org1', APPROVER_EMP, EMP, 'user-approver')
		expect(rows.map((r) => r.id)).toEqual(['jp-theirs'])
	})
})

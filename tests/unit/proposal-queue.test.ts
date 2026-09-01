import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma, type Role } from '@prisma/client'

/**
 * #224 Part 2 / #243 — the review surface at `/requests/proposals`.
 *
 * `action-proposals.test.ts` pins the service rules and `pay-proposal-routing.test.ts` pins which
 * writes get routed. This file pins the surface that makes both reachable, and the two ways a UI
 * layer typically breaks a service-level control:
 *
 *   - **the route re-implements authority** — so nothing here mocks the proposal service. The load
 *     and the three actions run against the real guards, and a route that "helpfully" checked a
 *     rank floor of its own would show up as a wrong message, not merely a wrong status.
 *   - **the route drops part of the context** — `ctxOf` on the 201 file used to omit `actorRoles`,
 *     leaving `assertMayDecide` to fall back to `[actorRole]` and refuse a [MANAGER, HR_ADMIN] user
 *     a confirmation they hold (#133). Fixed in #247; asserted directly so it stays fixed.
 *
 * Messages are asserted, not just statuses: three separate rules in `assertMayDecide` all answer
 * 403, and the route can produce a 400 from two different places. A status-only assertion would let
 * the wrong layer answer — the trap `action-proposals.test.ts` documents at its own 403 tests.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		actionProposal: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
			findUniqueOrThrow: vi.fn(),
			updateMany: vi.fn()
		},
		employee: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
		employeeCompensation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
		employeeEmploymentType: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
		payrollRun: { findFirst: vi.fn() },
		position: { findMany: vi.fn() },
		user: { findMany: vi.fn() },
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/notifications', () => ({
	notify: vi.fn().mockResolvedValue(undefined),
	notifyMany: vi.fn().mockResolvedValue(undefined)
}))

const { writeAuditLog } = await import('$lib/server/audit')
const { load, actions } = await import('../../src/routes/(app)/requests/proposals/+page.server')

const HR = 'user-hr'
const MANAGER = 'user-manager'
const CREW_EMP = 'emp-crew'

/** The employee a manager filed a raise for. Raw shape — internal `getEmployee` callers see this. */
const crew = {
	id: CREW_EMP,
	userId: 'user-crew',
	basicMonthlySalary: 30000,
	rateType: 'MONTHLY',
	employmentType: 'REGULAR',
	employmentStatus: 'ACTIVE',
	startDate: new Date('2020-01-01'),
	positionId: null,
	reportsToId: null,
	jobTitle: 'Crew',
	firstName: 'Juan',
	lastName: 'Dela Cruz',
	employeeNumber: 'EMP-101'
}

/** A PENDING proposal a MANAGER filed for one of their reports (#243). */
const onBehalf = {
	id: 'p1',
	organizationId: 'org1',
	initiatorId: MANAGER,
	targetEmployeeId: CREW_EMP,
	domain: 'COMPENSATION',
	payload: { basicMonthlySalary: 45000, effectiveDate: '2026-01-01T00:00:00.000Z' },
	status: 'PENDING'
}

const event = (user: { id: string; roles: Role[] }, body: Record<string, string> = {}) =>
	({
		// `roles` is the only identity Lucia hands a route (`auth.ts`), so the fixture carries it.
		locals: { user: { ...user, organizationId: 'org1' } },
		url: new URL('http://localhost/requests/proposals'),
		request: { formData: async () => new Map(Object.entries(body)) },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(dbMock))
	dbMock.actionProposal.findMany.mockResolvedValue([])
	dbMock.actionProposal.findFirst.mockResolvedValue(onBehalf)
	dbMock.actionProposal.updateMany.mockResolvedValue({ count: 1 })
	dbMock.actionProposal.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'APPLIED' })
	// `assertMayDecide` resolves the target's user id through findUnique; getEmployee uses findFirst.
	dbMock.employee.findUnique.mockResolvedValue({ userId: crew.userId })
	dbMock.employee.findFirst.mockResolvedValue(crew)
	dbMock.employee.findMany.mockResolvedValue([])
	dbMock.employeeCompensation.findMany.mockResolvedValue([])
	dbMock.employeeCompensation.findFirst.mockResolvedValue(null)
	dbMock.employeeEmploymentType.findMany.mockResolvedValue([])
	dbMock.employeeEmploymentType.findFirst.mockResolvedValue(null)
	dbMock.payrollRun.findFirst.mockResolvedValue(null)
	dbMock.position.findMany.mockResolvedValue([])
	dbMock.user.findMany.mockResolvedValue([
		{ id: MANAGER, email: 'manager@veent.ph', employee: null }
	])
})

describe('who reaches the page', () => {
	// Display gating only — the list and every action refuse a MANAGER regardless — but without it
	// the largest role in the app lands on a permanently empty queue with no explanation.
	it('redirects a MANAGER away', async () => {
		await expect(load(event({ id: MANAGER, roles: ['MANAGER'] }))).rejects.toMatchObject({
			status: 303,
			location: '/requests'
		})
	})

	it('lets an HR_ADMIN in', async () => {
		await expect(load(event({ id: HR, roles: ['HR_ADMIN'] }))).resolves.toBeDefined()
	})

	// APPROVE_FINANCE alone is enough: a CEO's self-filed raise is confirmable by a SUPER_ADMIN who,
	// in some tenant shapes, might not be reached by the HR capability.
	it('lets an APPROVE_FINANCE holder in', async () => {
		await expect(load(event({ id: 'user-sa', roles: ['SUPER_ADMIN'] }))).resolves.toBeDefined()
	})
})

describe('what the page hands to the client', () => {
	beforeEach(() => {
		dbMock.actionProposal.findMany.mockResolvedValue([
			{ ...onBehalf, createdAt: new Date(), target: crew }
		])
	})

	// `PageServerLoad` types the return as `void | data` because of the redirect branch; these cases
	// all take the non-redirect path.
	const loadPage = async (user: { id: string; roles: Role[] }) => {
		const data = await load(event(user))
		if (!data) throw new Error('load redirected unexpectedly')
		return data
	}

	/**
	 * The salary is the one field of a proposal in SENSITIVE_FIELDS (#111). It must leave the server
	 * only through the audited `?/revealAmount` action, so the SSR payload carries a boolean saying a
	 * figure exists and never the figure. Asserting on the serialized page data rather than on named
	 * keys: the payload is passed through several shapes, and any one of them re-exposing it is the
	 * same leak.
	 */
	it('never puts the proposed salary in the load payload', async () => {
		const data = await loadPage({ id: HR, roles: ['HR_ADMIN'] })
		expect(data.proposals[0].hasAmount).toBe(true)
		expect(JSON.stringify(data)).not.toContain('45000')
	})

	it('names the initiator and the shape of the row', async () => {
		const data = await loadPage({ id: HR, roles: ['HR_ADMIN'] })
		expect(data.proposals[0]).toMatchObject({
			id: 'p1',
			initiator: 'manager@veent.ph', // no employee record → email fallback
			isSelfAction: false,
			domain: 'COMPENSATION'
		})
	})

	it('prefers the initiator’s employee name when they have one', async () => {
		dbMock.user.findMany.mockResolvedValue([
			{ id: MANAGER, email: 'manager@veent.ph', employee: { firstName: 'Ana', lastName: 'Reyes' } }
		])
		const data = await loadPage({ id: HR, roles: ['HR_ADMIN'] })
		expect(data.proposals[0].initiator).toBe('Reyes, Ana')
	})

	/**
	 * A payload that no longer parses — a schema tightened under a row that was already PENDING — must
	 * still reach the page. Dropping it would strand the proposal: it cannot be confirmed (apply
	 * re-parses and throws) and nobody could see it to reject it. So the row stays, flagged, with
	 * nothing claimed about its contents.
	 */
	it('keeps a proposal whose payload no longer parses, flagged and empty', async () => {
		dbMock.actionProposal.findMany.mockResolvedValue([
			{ ...onBehalf, payload: { effectiveDate: 'not-a-date' }, createdAt: new Date(), target: crew }
		])
		const data = await loadPage({ id: HR, roles: ['HR_ADMIN'] })
		expect(data.proposals).toHaveLength(1)
		expect(data.proposals[0]).toMatchObject({ unreadable: true, hasAmount: false, changes: [] })
	})
})

describe('?/confirm', () => {
	// MANAGER holds neither confirmer capability. The message, not just the 403: two other rules in
	// `assertMayDecide` answer 403 as well, and a route-level rank floor would answer differently.
	it('refuses a MANAGER', async () => {
		const res = await actions.confirm!(
			event({ id: 'user-manager-2', roles: ['MANAGER'] }, { proposalId: 'p1' })
		)
		expect(res).toMatchObject({
			status: 403,
			data: { error: 'You are not authorized to confirm this proposal.' }
		})
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
	})

	it('refuses the person who filed it', async () => {
		const res = await actions.confirm!(
			event({ id: MANAGER, roles: ['MANAGER'] }, { proposalId: 'p1' })
		)
		expect(res).toMatchObject({
			status: 403,
			data: { error: 'You cannot confirm a change you proposed yourself.' }
		})
	})

	// The target of a proposal someone else filed, who happens to hold the confirming capability.
	it('refuses the person the change is about', async () => {
		const res = await actions.confirm!(
			event({ id: crew.userId, roles: ['HR_ADMIN'] }, { proposalId: 'p1' })
		)
		expect(res).toMatchObject({
			status: 403,
			data: { error: 'You cannot confirm a change to your own pay.' }
		})
	})

	// Stage 1's `applyProposedChange` had no production caller until this action. Asserting the
	// snapshot insert rather than "it resolved": confirming without applying would mark the proposal
	// APPLIED and move no money, which reads as success to everyone involved.
	it('applies the change through applyProposedChange', async () => {
		const res = await actions.confirm!(event({ id: HR, roles: ['HR_ADMIN'] }, { proposalId: 'p1' }))
		expect(res).toEqual({ success: 'Change confirmed and applied.' })
		expect(dbMock.employeeCompensation.create).toHaveBeenCalledWith({
			data: expect.objectContaining({ employeeId: CREW_EMP, basicMonthlySalary: 45000 })
		})
	})

	/**
	 * The 201 file's `ctxOf` used to omit `actorRoles`, leaving `assertMayDecide` to fall back to
	 * `[actorRole]` and refuse a [MANAGER, HR_ADMIN] user a confirmation they are entitled to (#133)
	 * — silently, and only for multi-role users. Fixed in #247. Both halves are asserted, since the
	 * pass alone would also pass if the route ignored roles and let everyone through.
	 */
	it('reads the full role set, not just the primary role', async () => {
		const refused = await actions.confirm!(
			event({ id: HR, roles: ['MANAGER'] }, { proposalId: 'p1' })
		)
		expect(refused).toMatchObject({ status: 403 })

		const allowed = await actions.confirm!(
			event({ id: HR, roles: ['MANAGER', 'HR_ADMIN'] }, { proposalId: 'p1' })
		)
		expect(allowed).toEqual({ success: 'Change confirmed and applied.' })
	})

	/**
	 * Re-validation at apply time is the trust boundary the whole design rests on. When it fires the
	 * claim rolls back and the row is still PENDING — so the message has to say "nothing happened,
	 * the record moved", not repeat the writer's message, which alone reads like a bug in the page.
	 */
	it('explains a stale payload rather than repeating the writer’s message', async () => {
		// Someone already moved the salary to the proposed figure, so applying is now a no-op.
		dbMock.employee.findFirst.mockResolvedValue({ ...crew, basicMonthlySalary: 45000 })
		const res = await actions.confirm!(event({ id: HR, roles: ['HR_ADMIN'] }, { proposalId: 'p1' }))
		expect(res).toMatchObject({
			status: 400,
			data: {
				error:
					"Couldn't apply — the record has changed since this was proposed: No change to record — enter a new salary or pay type."
			}
		})
		expect(dbMock.employeeCompensation.create).not.toHaveBeenCalled()
	})

	it('rejects a missing proposal id without touching the service', async () => {
		const res = await actions.confirm!(event({ id: HR, roles: ['HR_ADMIN'] }))
		expect(res).toMatchObject({ status: 400, data: { error: 'Missing proposal id.' } })
		expect(dbMock.actionProposal.findFirst).not.toHaveBeenCalled()
	})
})

describe('?/reject', () => {
	// A rejection with no reason leaves the initiator nothing to fix. The rule lives in the service
	// and fires before any lookup, so this asserts the route surfaces it rather than swallowing it —
	// and that nothing was claimed on the way.
	it('requires a reason, before any lookup', async () => {
		const res = await actions.reject!(
			event({ id: HR, roles: ['HR_ADMIN'] }, { proposalId: 'p1', note: '   ' })
		)
		expect(res).toMatchObject({
			status: 400,
			data: { error: 'A reason is required to reject a proposal.' }
		})
		expect(dbMock.actionProposal.findFirst).not.toHaveBeenCalled()
	})

	it('applies the same authority as confirming', async () => {
		const res = await actions.reject!(
			event(
				{ id: 'user-manager-2', roles: ['MANAGER'] },
				{ proposalId: 'p1', note: 'not budgeted' }
			)
		)
		expect(res).toMatchObject({
			status: 403,
			data: { error: 'You are not authorized to confirm this proposal.' }
		})
		expect(dbMock.actionProposal.updateMany).not.toHaveBeenCalled()
	})

	it('stores the reason on the row', async () => {
		const res = await actions.reject!(
			event(
				{ id: HR, roles: ['HR_ADMIN'] },
				{ proposalId: 'p1', note: 'not budgeted this quarter' }
			)
		)
		expect(res).toEqual({ success: 'Proposal rejected and the initiator notified.' })
		expect(dbMock.actionProposal.updateMany).toHaveBeenCalledWith({
			where: { id: 'p1', organizationId: 'org1', status: 'PENDING' },
			data: expect.objectContaining({
				status: 'REJECTED',
				decisionNote: 'not budgeted this quarter'
			})
		})
	})
})

describe('?/revealAmount', () => {
	/**
	 * Reaching the figure is itself an auditable event (#111), and the entry must be the one
	 * `revealEmployeeSensitive` writes — a bespoke audit line inside the proposal service would be a
	 * second masking pattern, free to drift from SENSITIVE_FIELDS.
	 */
	it('returns both figures as numbers and audits the read as a VIEW on the employee', async () => {
		// A Decimal, as Prisma actually returns it — the action serializes it to a number so the two
		// figures it renders side by side are the same type.
		dbMock.employee.findFirst.mockResolvedValue({
			id: CREW_EMP,
			basicMonthlySalary: new Prisma.Decimal(30000)
		})
		const res = await actions.revealAmount!(
			event({ id: HR, roles: ['HR_ADMIN'] }, { proposalId: 'p1' })
		)
		expect(res).toMatchObject({ revealedId: 'p1', amounts: { current: 30000, proposed: 45000 } })
		expect(typeof (res as { amounts: { current: unknown } }).amounts.current).toBe('number')
		expect(writeAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({ actorId: HR }),
			expect.objectContaining({
				action: 'VIEW',
				entityType: 'Employee',
				entityId: CREW_EMP,
				newValue: { fields: expect.arrayContaining(['basicMonthlySalary']) }
			}),
			// #5: class D — this audits a READ, so it takes `db`, never a transaction client.
			// Wrapping it would let an unrelated rollback erase the record of a PII access.
			dbMock
		)
	})

	// Refused BEFORE anything is read: a reveal that audits and then refuses has already read the
	// data, and the refusal is decoration. Asserting the employee row was never fetched is what
	// distinguishes the two.
	it('refuses a MANAGER without reading the record', async () => {
		const res = await actions.revealAmount!(
			event({ id: 'user-manager-2', roles: ['MANAGER'] }, { proposalId: 'p1' })
		)
		expect(res).toMatchObject({
			status: 403,
			data: { error: 'You are not authorized to confirm this proposal.' }
		})
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('refuses the person the change is about', async () => {
		const res = await actions.revealAmount!(
			event({ id: crew.userId, roles: ['HR_ADMIN'] }, { proposalId: 'p1' })
		)
		expect(res).toMatchObject({
			status: 403,
			data: { error: 'You cannot confirm a change to your own pay.' }
		})
		expect(dbMock.employee.findFirst).not.toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { error } from '@sveltejs/kit'
import type { Role } from '@prisma/client'

/**
 * HR complaints/inquiries (#112) — scoping guards. The complaints service is deliberately NOT
 * mocked here: these tests assert on the arguments the Prisma queries were BUILT with
 * (`mock.calls[0][0]`), which proves the filter reached the query rather than merely proving the
 * route handed an object to a function.
 *
 * The cherry-picked feature gated every surface on `MANAGE_HR` alone, which holds MANAGER — so a
 * MANAGER could open, read, reply to and resolve an inquiry about ANY employee in the org, and the
 * "open an inquiry against…" dropdown read the whole roster out to them. `rbac.ts:26-36` says in so
 * many words never to use `MANAGE_HR` to decide "may reach any employee record".
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), findMany: vi.fn() },
		hrComplaint: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
			count: vi.fn()
		},
		$transaction: vi.fn()
	}
}))
const { writeAuditLogMock } = vi.hoisted(() => ({
	writeAuditLogMock: vi.fn().mockResolvedValue(undefined)
}))
// #5: the complaint writes now run inside `db.$transaction(async (tx) => …)`, so they land on
// the transaction client, not on `db`.
const tx = {
	hrComplaint: { create: vi.fn(), update: vi.fn() },
	hrComplaintMessage: { create: vi.fn() }
}
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn().mockResolvedValue(undefined) }))
const { assertCanTouchEmployeeMock, listVisibleEmployeeIdsMock } = vi.hoisted(() => ({
	assertCanTouchEmployeeMock: vi.fn(),
	listVisibleEmployeeIdsMock: vi.fn()
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: writeAuditLogMock }))
vi.mock('$lib/server/services/notifications', () => ({ notify: notifyMock }))
vi.mock('$lib/server/services/employee-access', () => ({
	assertCanTouchEmployee: assertCanTouchEmployeeMock,
	listVisibleEmployeeIds: listVisibleEmployeeIdsMock
}))

const { listComplaintsForEmployee, listComplaintsForOrg, resolveComplaint, countWaitingInquiries } =
	await import('$lib/server/services/complaints')
const { load: listLoad, actions: listActions } =
	await import('../../src/routes/(app)/complaints/+page.server')
const { load: threadLoad, actions: threadActions } =
	await import('../../src/routes/(app)/complaints/[id]/+page.server')

const ORG = 'org1'
const ACTOR_USER = 'u-actor'
const SELF = 'emp-self'
const REPORT = 'emp-report'
const OUTSIDER = 'emp-outsider'
const VISIBLE = 'emp-a'

/** What `assertCanTouchEmployee` throws — the shared employee-scope message. */
const DENIED = 'You can only manage your own team or a branch you manage.'
/** What the subject arm of `assertCanReachComplaint` throws. */
const NO_ACCESS = 'You do not have access to this inquiry.'

/** The acting user's own employee row, or `null` for a user with no employee record. */
let selfEmployee: { id: string } | null = { id: SELF }

const complaint = (overrides: Record<string, unknown> = {}) => ({
	id: 'c1',
	organizationId: ORG,
	employeeId: OUTSIDER,
	status: 'OPEN',
	subject: 'Confirm classification',
	employee: { id: OUTSIDER, firstName: 'Vince', lastName: 'Verifier', user: { id: 'u-outsider' } },
	openedBy: { id: 'u-hr' },
	messages: [],
	...overrides
})

const openEvent = (roles: Role[], employeeId: string) => {
	const body = new FormData()
	body.set('employeeId', employeeId)
	body.set('subject', 'Confirm classification')
	body.set('category', 'OTHER')
	body.set('message', 'probe')
	return {
		locals: { user: { id: ACTOR_USER, organizationId: ORG, roles } },
		request: { formData: async () => body },
		getClientAddress: () => '::1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

/** The `EmployeeAccessActor` shape the sidebar count takes. */
const actor = (roles: Role[]) => ({ id: ACTOR_USER, roles, organizationId: ORG })

const listLoadEvent = (roles: Role[]) =>
	({
		locals: { user: { id: ACTOR_USER, organizationId: ORG, roles } },
		url: new URL('http://localhost/complaints')
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

const threadEvent = (roles: Role[], replyBody?: string) =>
	({
		locals: { user: { id: ACTOR_USER, organizationId: ORG, roles } },
		params: { id: 'c1' },
		getClientAddress: () => '::1',
		request: {
			formData: async () => {
				const f = new FormData()
				if (replyBody != null) f.set('body', replyBody)
				return f
			}
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** `PageServerLoad` widens its return to `void | …`; the cases below want the object. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const threadData = (roles: Role[]) => threadLoad(threadEvent(roles)) as Promise<any>

/** Throw the shared scope denial the way SvelteKit 2 does — `error()` throws, never returns. */
const denyScope = () =>
	assertCanTouchEmployeeMock.mockImplementation(() => {
		error(403, DENIED)
	})

beforeEach(() => {
	vi.clearAllMocks()
	selfEmployee = { id: SELF }
	// `where.userId` is the route resolving the actor's own employee row; anything else is
	// `openComplaint` resolving the target employee.
	dbMock.employee.findFirst.mockImplementation(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		async ({ where }: any) =>
			where.userId ? selfEmployee : { id: where.id, user: { id: `u-${where.id}` } }
	)
	dbMock.employee.findMany.mockResolvedValue([])
	dbMock.hrComplaint.findMany.mockResolvedValue([])
	dbMock.hrComplaint.count.mockResolvedValue(0)
	tx.hrComplaint.create.mockResolvedValue({ id: 'c1' })
	tx.hrComplaint.update.mockResolvedValue({ id: 'c1', status: 'RESOLVED' })
	dbMock.hrComplaint.findFirst.mockResolvedValue(complaint())
	tx.hrComplaintMessage.create.mockResolvedValue({})
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
	assertCanTouchEmployeeMock.mockResolvedValue(undefined)
	listVisibleEmployeeIdsMock.mockResolvedValue(null)
})

describe('complaints org scoping (#112)', () => {
	it('N1 — listComplaintsForEmployee carries an organizationId predicate', async () => {
		await listComplaintsForEmployee('emp1', 'org1')

		expect(dbMock.hrComplaint.findMany.mock.calls[0][0].where).toEqual({
			employeeId: 'emp1',
			organizationId: 'org1'
		})
	})
})

describe('complaints object-level admission (#112)', () => {
	// Positive control: an org-wide role keeps its org-wide reach.
	it('N2 — an HR_ADMIN may open an inquiry against any employee in the org', async () => {
		const result = await listActions.open(openEvent(['HR_ADMIN'], OUTSIDER))

		expect(tx.hrComplaint.create).toHaveBeenCalledTimes(1)
		// #5: the audit write shares the transaction that created the thread.
		expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(result).toMatchObject({ message: 'Inquiry opened.' })
	})

	// Positive control: the guard must not lock a MANAGER out of their own team.
	it('N3 — a MANAGER may open an inquiry against a direct report', async () => {
		await listActions.open(openEvent(['MANAGER'], REPORT))

		const created = tx.hrComplaint.create.mock.calls[0][0]
		expect(created.data.employeeId).toBe(REPORT)
		expect(created.data.status).toBe('OPEN')
	})

	it('N4 — refuses a MANAGER opening against an employee outside their scope', async () => {
		denyScope()

		const result = await listActions.open(openEvent(['MANAGER'], OUTSIDER))

		expect(result).toMatchObject({ status: 403 })
		expect(tx.hrComplaint.create).not.toHaveBeenCalled()
	})

	// A check placed after the write still throws, but the thread already exists by then.
	it('N5 — admits before writing, not after', async () => {
		await listActions.open(openEvent(['HR_ADMIN'], OUTSIDER))

		expect(assertCanTouchEmployeeMock.mock.invocationCallOrder[0]).toBeLessThan(
			tx.hrComplaint.create.mock.invocationCallOrder[0]
		)
	})

	it('N6 — refuses a MANAGER loading an out-of-scope thread by known id', async () => {
		denyScope()

		await expect(threadLoad(threadEvent(['MANAGER']))).rejects.toMatchObject({ status: 403 })
	})

	/**
	 * The single most important case here: the route used to `.catch(() => null)` around
	 * `getComplaint`, which silently downgraded a correct service 403 into a 404.
	 */
	it('N7 — refuses a MANAGER replying to an out-of-scope thread with 403, not 404', async () => {
		denyScope()

		const result = await threadActions.reply(threadEvent(['MANAGER'], 'should not land'))

		expect(result).toMatchObject({ status: 403 })
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	it('N8 — refuses a MANAGER resolving an out-of-scope thread', async () => {
		denyScope()

		const result = await threadActions.resolve(threadEvent(['MANAGER']))

		expect(result).toMatchObject({ status: 403 })
		expect(tx.hrComplaint.update).not.toHaveBeenCalled()
	})

	// Below the already-resolved early return, an out-of-scope actor gets a silent 200 that
	// confirms the thread exists.
	it('N9 — checks scope before the already-resolved early return', async () => {
		dbMock.hrComplaint.findFirst.mockResolvedValue(complaint({ status: 'RESOLVED' }))
		denyScope()

		await expect(
			resolveComplaint('c1', { organizationId: ORG, actorId: ACTOR_USER, actorRoles: ['MANAGER'] })
		).rejects.toMatchObject({ status: 403 })
	})

	it('N10 — lets the subject employee read their own thread', async () => {
		dbMock.hrComplaint.findFirst.mockResolvedValue(complaint({ employeeId: SELF }))

		const data = await threadData(['EMPLOYEE'])

		expect(data.complaint.id).toBe('c1')
		expect(data.isSubject).toBe(true)
	})

	it('N11 — refuses the subject employee a co-worker’s thread by known id', async () => {
		await expect(threadLoad(threadEvent(['EMPLOYEE']))).rejects.toMatchObject({
			status: 403,
			body: { message: NO_ACCESS }
		})
	})

	/**
	 * The widening Decision 1 guards against. `canTouchEmployee` admits an actor's reports
	 * REGARDLESS of role, so collapsing the two arms into it would hand a plain EMPLOYEE their
	 * report's inquiry. The scope helper resolves here on purpose — the `else` arm is what refuses.
	 */
	it('N12 — refuses a non-HR supervisor their own report’s thread', async () => {
		selfEmployee = { id: 'emp-boss' }
		dbMock.hrComplaint.findFirst.mockResolvedValue(complaint({ employeeId: REPORT }))

		await expect(threadLoad(threadEvent(['EMPLOYEE']))).rejects.toMatchObject({ status: 403 })
	})
})

describe('complaints list scoping (#112)', () => {
	it('N13 — threads the visible-employee allow-list into both the count and the rows', async () => {
		listVisibleEmployeeIdsMock.mockResolvedValue([VISIBLE])

		await listLoad(listLoadEvent(['MANAGER']))

		const expected = { AND: [{ employeeId: { in: [VISIBLE] } }] }
		expect(dbMock.hrComplaint.count.mock.calls[0][0].where).toMatchObject(expected)
		expect(dbMock.hrComplaint.findMany.mock.calls[0][0].where).toMatchObject(expected)
	})

	/**
	 * `[]` — a manager with no reports and no branches. It is truthy, so the filter is still
	 * emitted and matches nothing: fail-closed. A `?.length` "tidy-up" drops it and opens the org.
	 */
	it('N13-empty — keeps the allow-list present and empty when the actor sees nobody', async () => {
		listVisibleEmployeeIdsMock.mockResolvedValue([])

		await listLoad(listLoadEvent(['MANAGER']))

		const expected = { AND: [{ employeeId: { in: [] } }] }
		expect(dbMock.hrComplaint.count.mock.calls[0][0].where).toMatchObject(expected)
		expect(dbMock.hrComplaint.findMany.mock.calls[0][0].where).toMatchObject(expected)
	})

	// The roster-leak surface: an unscoped dropdown lists every ACTIVE employee in the org, so a
	// manager reads the whole roster off the form before the 403 on submit ever fires.
	it('N14 — scopes the employee dropdown, and leaves it unfiltered for org-wide roles', async () => {
		listVisibleEmployeeIdsMock.mockResolvedValue([VISIBLE])
		await listLoad(listLoadEvent(['MANAGER']))
		expect(dbMock.employee.findMany.mock.calls[0][0].where).toMatchObject({
			id: { in: [VISIBLE] }
		})

		listVisibleEmployeeIdsMock.mockResolvedValue(null)
		await listLoad(listLoadEvent(['HR_ADMIN']))
		expect(dbMock.employee.findMany.mock.calls[1][0].where).not.toHaveProperty('id')
	})

	it('N14-empty — keeps the dropdown filter present and empty when the actor sees nobody', async () => {
		listVisibleEmployeeIdsMock.mockResolvedValue([])

		await listLoad(listLoadEvent(['MANAGER']))

		expect(dbMock.employee.findMany.mock.calls[0][0].where.id).toEqual({ in: [] })
	})

	/**
	 * `employeeId` NARROWS to one employee; `employeeIds` is a CEILING. They must intersect —
	 * merging them onto one key lets the ceiling overwrite the narrower filter and the query
	 * returns MORE rows than asked for. A scoping filter must never widen.
	 */
	it('N17 — intersects the employeeId filter with the allow-list instead of widening', async () => {
		listComplaintsForOrg(ORG, { employeeId: 'emp-x', employeeIds: [VISIBLE, 'emp-x'] })

		const where = dbMock.hrComplaint.findMany.mock.calls[0][0].where
		expect(where.employeeId).toBe('emp-x')
		expect(where.AND).toEqual([{ employeeId: { in: [VISIBLE, 'emp-x'] } }])
	})
})

/**
 * `pnpm check` proves `actorRoles` is PRESENT, never that it is COMPLETE — `actorRoles:
 * [user.roles[0]]` type-checks perfectly clean. That narrowing is the #247/#272/#275 failure class,
 * and a single-role fixture would hide it, hence the two-hat actor.
 */
describe('complaints audit actorRoles carry-through (#112)', () => {
	it('N15 — carries the actor’s full role set into every audit write from the route ctx', async () => {
		const roles: Role[] = ['HR_ADMIN', 'MANAGER']

		await listActions.open(openEvent(roles, OUTSIDER))
		expect(writeAuditLogMock.mock.calls[0][0].actorRoles).toEqual(roles)

		writeAuditLogMock.mockClear()
		await threadActions.reply(threadEvent(roles, 'following up'))
		expect(writeAuditLogMock.mock.calls[0][0].actorRoles).toEqual(roles)

		writeAuditLogMock.mockClear()
		await threadActions.resolve(threadEvent(roles))
		expect(writeAuditLogMock.mock.calls[0][0].actorRoles).toEqual(roles)
	})
})

/**
 * The sidebar "Inquiries" count badge (#112, scope addition). The status already encodes whose
 * turn it is — RESPONDED is owed by HR, OPEN is owed by the subject — so the count needs no new
 * state. It must be scoped exactly like the list it links to, or the badge promises a thread the
 * page then 403s.
 */
describe('complaints sidebar waiting count (#112)', () => {
	it('N18 — the HR arm counts only RESPONDED, behind the visible-employee allow-list', async () => {
		listVisibleEmployeeIdsMock.mockResolvedValue([VISIBLE])

		await countWaitingInquiries(actor(['MANAGER']))

		expect(dbMock.hrComplaint.count.mock.calls[0][0].where).toEqual({
			organizationId: ORG,
			status: 'RESPONDED',
			employeeId: { in: [VISIBLE] }
		})
	})

	// One actor can be owed on both arms — a manager who is also the subject of a thread. The two
	// can never double-count one row, because a row holds exactly one status.
	it('N19 — the subject arm counts the actor’s own OPEN threads, and the two arms sum', async () => {
		listVisibleEmployeeIdsMock.mockResolvedValue([VISIBLE])
		dbMock.hrComplaint.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3)

		const total = await countWaitingInquiries(actor(['MANAGER']))

		expect(dbMock.hrComplaint.count.mock.calls[1][0].where).toEqual({
			organizationId: ORG,
			status: 'OPEN',
			employeeId: SELF
		})
		expect(total).toBe(5)
	})

	// `[]` is truthy, so the predicate stays present and matches nothing. `?.length &&` would drop
	// it and count the whole org.
	it('N20 — a MANAGE_HR actor who sees nobody stays fail-closed', async () => {
		listVisibleEmployeeIdsMock.mockResolvedValue([])

		await countWaitingInquiries(actor(['MANAGER']))

		expect(dbMock.hrComplaint.count.mock.calls[0][0].where.employeeId).toEqual({ in: [] })
	})

	it('N21 — a non-MANAGE_HR actor runs the subject arm only', async () => {
		await countWaitingInquiries(actor(['EMPLOYEE']))

		expect(dbMock.hrComplaint.count).toHaveBeenCalledTimes(1)
		expect(dbMock.hrComplaint.count.mock.calls[0][0].where).toEqual({
			organizationId: ORG,
			status: 'OPEN',
			employeeId: SELF
		})
		expect(listVisibleEmployeeIdsMock).not.toHaveBeenCalled()
	})

	it('N22 — an actor with no employee row counts no subject arm', async () => {
		selfEmployee = null

		const total = await countWaitingInquiries(actor(['EMPLOYEE']))

		expect(total).toBe(0)
		expect(dbMock.hrComplaint.count).not.toHaveBeenCalled()
	})
})

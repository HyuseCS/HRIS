import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * All three request-filing paths pass the full role set to `createRequest` (#247).
 *
 * There is no 403 to observe here — the observable is the SHAPE of the maker-checker chain.
 * `createRequest` decides `filerIsMaker = canAny(rolesOf(ctx), 'MANAGE_HR')`, and
 * `buildApprovalChain` turns that into either `currentStage: 0` with MAKE left open, or
 * `currentStage: 1` with MAKE already signed off by the filer. Dropping `actorRoles` scoped the
 * check to the primary role, so an [EMPLOYEE, HR_ADMIN] user filed a request that then sat waiting
 * for branch HR to complete a MAKE stage they had themselves just satisfied.
 *
 * Asserted against `request.create`'s argument — a real write reaching the mocked client — rather
 * than against a spy on `createRequest`, which would survive any mutation to the service.
 *
 * OVERTIME for the two non-leave paths so the LEAVE balance/eligibility branch needs no fixtures.
 *
 * #279 adds the deletion half. `deleteRequest` resolves privilege through the same `rolesOf(ctx)`,
 * so the leave list's bulk delete needs `actorRoles` for the identical reason — and its `ctxOf`
 * omitted it. That action swallows per-item errors into a "skipped" count, so the observable is
 * whether `request.delete` was reached at all.
 */

const { dbMock, uploadsFromForm, saveRequestDocuments, leaveHelpers } = vi.hoisted(() => ({
	uploadsFromForm: vi.fn().mockResolvedValue([]),
	saveRequestDocuments: vi.fn().mockResolvedValue(undefined),
	leaveHelpers: {
		assertLeaveEligibility: vi.fn().mockResolvedValue(undefined),
		computeLeaveTotalDays: vi.fn().mockResolvedValue(1),
		assertLeaveBalance: vi.fn().mockResolvedValue(undefined),
		meetsLeaveTenure: vi.fn().mockReturnValue(true)
	},
	dbMock: {
		employee: { findFirst: vi.fn() },
		request: { findFirst: vi.fn() },
		$transaction: vi.fn()
	}
}))

// #5: the create and the delete each share a transaction with their audit entry, so they run on
// `tx`.
const tx = { request: { create: vi.fn(), delete: vi.fn() } }

vi.mock('$lib/server/db', () => ({ db: dbMock }))
const writeAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('$lib/server/audit', () => ({
	writeAuditLog: (...args: unknown[]) => writeAuditLog(...args)
}))
vi.mock('$lib/server/services/requests/documents', () => ({
	uploadsFromForm,
	saveRequestDocuments
}))
vi.mock('$lib/server/services/requests/leave', () => leaveHelpers)

const { POST: apiRoute } = await import('../../src/routes/api/v1/requests/+server')
const { actions: requestActions } = await import('../../src/routes/(app)/requests/+page.server')
const { actions: leaveActions } = await import('../../src/routes/(app)/leave/new/+page.server')
const { actions: leaveListActions } = await import('../../src/routes/(app)/leave/+page.server')

const ACTOR_USER = 'user-actor'
const ORG = 'org1'
const SELF_EMP = 'self-emp'
const OTHER_EMP = 'other-emp'

const locals = (roles: Role[]) => ({
	user: { id: ACTOR_USER, organizationId: ORG, roles }
})

const OT_BODY = { type: 'OVERTIME', date: '2026-03-10', hours: 3, reason: 'Month-end close' }

const jsonEvent = (roles: Role[]) =>
	({
		locals: locals(roles),
		request: { json: async () => OT_BODY },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

const formEvent = (roles: Role[], fields: Record<string, string>) => {
	const f = new FormData()
	for (const [k, v] of Object.entries(fields)) f.set(k, v)
	return {
		locals: locals(roles),
		request: { formData: async () => f },
		getClientAddress: () => '127.0.0.1',
		// The action parks a success flash here before redirecting (#phase-04 feedback contract).
		cookies: { set: () => {}, get: () => undefined, delete: () => {} }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

const OT_FIELDS = { type: 'OVERTIME', date: '2026-03-10', hours: '3', reason: 'Month-end close' }
const LEAVE_FIELDS = {
	leaveTypeId: 'lt1',
	startDate: '2026-03-10',
	endDate: '2026-03-10',
	reason: 'Family matter'
}

/** The chain `request.create` was asked to write. */
const writtenChain = () => {
	const data = tx.request.create.mock.calls[0][0].data
	return { currentStage: data.currentStage, make: data.steps.create[0] }
}

/**
 * `createRequest`'s employee lookup (keyed on `id`) and `deleteRequest`'s non-privileged self
 * lookup (keyed on `userId`) both land on `employee.findFirst`. A plain `mockResolvedValue` happens
 * to work today only because both fixtures share `SELF_EMP` as their id — the two calls are never
 * discriminated by shape, so a future test giving them different ids would silently break.
 */
let targetRow = {
	id: SELF_EMP,
	reportsToId: null as string | null,
	startDate: new Date('2020-01-01')
}

beforeEach(() => {
	vi.clearAllMocks()
	targetRow = { id: SELF_EMP, reportsToId: null, startDate: new Date('2020-01-01') }
	dbMock.employee.findFirst.mockImplementation(({ where }) =>
		Promise.resolve(where.userId ? { id: SELF_EMP } : targetRow)
	)
	tx.request.create.mockResolvedValue({ id: 'req-new', steps: [] })
	// Someone else's pending leave request — deletable only by an HR-capable caller.
	dbMock.request.findFirst.mockResolvedValue({
		id: 'req-1',
		status: 'PENDING',
		type: 'LEAVE',
		employeeId: OTHER_EMP,
		documents: []
	})
	tx.request.delete.mockResolvedValue({ id: 'req-1' })
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
})

describe('POST /api/v1/requests', () => {
	it('leaves MAKE open for a plain [EMPLOYEE] filer', async () => {
		await apiRoute(jsonEvent(['EMPLOYEE']))
		const { currentStage, make } = writtenChain()
		expect(currentStage).toBe(0)
		expect(make.decision).toBeUndefined()
	})

	it('signs MAKE off for an [EMPLOYEE, HR_ADMIN] filer', async () => {
		await apiRoute(jsonEvent(['EMPLOYEE', 'HR_ADMIN']))
		const { currentStage, make } = writtenChain()
		expect(currentStage).toBe(1)
		expect(make).toMatchObject({ decision: 'APPROVED', actorId: ACTOR_USER })
	})
})

describe('(app)/requests ?/create', () => {
	it('leaves MAKE open for a plain [EMPLOYEE] filer', async () => {
		await requestActions.create!(formEvent(['EMPLOYEE'], OT_FIELDS))
		expect(writtenChain().currentStage).toBe(0)
	})

	it('signs MAKE off for an [EMPLOYEE, HR_ADMIN] filer', async () => {
		await requestActions.create!(formEvent(['EMPLOYEE', 'HR_ADMIN'], OT_FIELDS))
		const { currentStage, make } = writtenChain()
		expect(currentStage).toBe(1)
		expect(make).toMatchObject({ decision: 'APPROVED', actorId: ACTOR_USER })
	})
})

describe('(app)/leave/new ?/create', () => {
	// The action redirects on success, so the handler throws a 303 rather than returning.
	const file = async (roles: Role[]) =>
		expect(leaveActions.create!(formEvent(roles, LEAVE_FIELDS))).rejects.toMatchObject({
			status: 303
		})

	it('leaves MAKE open for a plain [EMPLOYEE] filer', async () => {
		await file(['EMPLOYEE'])
		expect(writtenChain().currentStage).toBe(0)
	})

	it('signs MAKE off for an [EMPLOYEE, HR_ADMIN] filer', async () => {
		await file(['EMPLOYEE', 'HR_ADMIN'])
		const { currentStage, make } = writtenChain()
		expect(currentStage).toBe(1)
		expect(make).toMatchObject({ decision: 'APPROVED', actorId: ACTOR_USER })
	})
})

describe('(app)/leave ?/deleteMany', () => {
	const deleteOther = (roles: Role[]) =>
		leaveListActions.deleteMany!(formEvent(roles, { ids: 'req-1' }))

	it('refuses a plain [EMPLOYEE] deleting a request they do not own', async () => {
		const res = await deleteOther(['EMPLOYEE'])
		expect(tx.request.delete).not.toHaveBeenCalled()
		expect(res).toMatchObject({ saved: expect.stringContaining('1 skipped') })
	})

	it('lets an [EMPLOYEE, HR_ADMIN] deleter through on their secondary role', async () => {
		const res = await deleteOther(['EMPLOYEE', 'HR_ADMIN'])
		expect(tx.request.delete).toHaveBeenCalledWith({ where: { id: 'req-1' } })
		// #5: the audit write shares the transaction that commits the delete.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(res).toMatchObject({ saved: expect.not.stringContaining('skipped') })
	})
})

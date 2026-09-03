import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * HR complaints/inquiries (#112): the two-way thread. Opening notifies the employee; a reply
 * flips status by author (employee → RESPONDED and pings HR, HR → OPEN and pings the employee);
 * a resolved thread rejects further replies. DB + audit + notifications are mocked so this is a
 * fast unit test of the transition logic.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn() },
		hrComplaint: { findFirst: vi.fn() },
		$transaction: vi.fn()
	}
}))
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn().mockResolvedValue(undefined) }))
// The service admits per employee now (#112), so the object-level scope check has to be mocked
// or every transition test below 403s. Scoping itself is proven in `complaints-scoping.test.ts`.
const { assertCanTouchEmployeeMock } = vi.hoisted(() => ({
	assertCanTouchEmployeeMock: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
const writeAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('$lib/server/audit', () => ({
	writeAuditLog: (...args: unknown[]) => writeAuditLog(...args)
}))
vi.mock('$lib/server/services/notifications', () => ({ notify: notifyMock }))
vi.mock('$lib/server/services/employee-access', () => ({
	assertCanTouchEmployee: assertCanTouchEmployeeMock
}))

const { openComplaint, postComplaintMessage, resolveComplaint } =
	await import('$lib/server/services/complaints')

const CTX: AuditContext = { organizationId: 'org1', actorId: 'u-hr', actorRoles: ['HR_ADMIN'] }

// #5: the writes now run inside `db.$transaction(async (tx) => …)`, so they land on the
// transaction client, not on `db`.
const tx = {
	hrComplaint: { create: vi.fn(), update: vi.fn() },
	hrComplaintMessage: { create: vi.fn() }
}

function mockComplaint(overrides: Record<string, unknown> = {}) {
	dbMock.hrComplaint.findFirst.mockResolvedValue({
		id: 'c1',
		organizationId: 'org1',
		employeeId: 'emp1',
		status: 'OPEN',
		subject: 'Confirm classification',
		employee: { id: 'emp1', firstName: 'Elena', lastName: 'Employee', user: { id: 'u-emp' } },
		openedBy: { id: 'u-hr' },
		...overrides
	})
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
	tx.hrComplaint.update.mockResolvedValue({})
	tx.hrComplaintMessage.create.mockResolvedValue({})
})

describe('complaints service (#112)', () => {
	it('openComplaint seeds the thread and notifies the employee', async () => {
		dbMock.employee.findFirst.mockResolvedValue({ id: 'emp1', user: { id: 'u-emp' } })
		tx.hrComplaint.create.mockResolvedValue({ id: 'c1' })

		await openComplaint(
			{
				employeeId: 'emp1',
				subject: 'Confirm classification',
				category: 'CLASSIFICATION',
				message: 'What is your rate type?'
			},
			CTX
		)

		const created = tx.hrComplaint.create.mock.calls[0][0]
		expect(created.data.status).toBe('OPEN')
		expect(created.data.messages.create.body).toBe('What is your rate type?')
		expect(notifyMock).toHaveBeenCalledWith(
			'u-emp',
			expect.stringContaining('HR opened'),
			'/inquiries/c1'
		)
		// #5: the audit write shares the transaction that created the thread.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
	})

	it('rejects opening an inquiry against an employee outside the org', async () => {
		dbMock.employee.findFirst.mockResolvedValue(null)
		await expect(
			openComplaint({ employeeId: 'ghost', subject: 's', category: 'OTHER', message: 'm' }, CTX)
		).rejects.toMatchObject({ status: 404 })
	})

	it('employee reply → RESPONDED and notifies the opener (HR)', async () => {
		mockComplaint()
		const res = await postComplaintMessage('c1', 'My rate is monthly.', CTX, 'emp1')

		expect(res.status).toBe('RESPONDED')
		expect(tx.hrComplaint.update.mock.calls[0][0].data.status).toBe('RESPONDED')
		// #5: the message, the status flip and the audit all share one transaction.
		expect(tx.hrComplaintMessage.create).toHaveBeenCalled()
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(notifyMock).toHaveBeenCalledWith(
			'u-hr',
			expect.stringContaining('responded'),
			'/inquiries/c1'
		)
	})

	it('HR reply → OPEN and notifies the employee', async () => {
		mockComplaint()
		const res = await postComplaintMessage('c1', 'Thanks, following up.', CTX, 'emp-hr')

		expect(res.status).toBe('OPEN')
		expect(notifyMock).toHaveBeenCalledWith(
			'u-emp',
			expect.stringContaining('HR replied'),
			'/inquiries/c1'
		)
	})

	it('a resolved inquiry rejects further replies', async () => {
		mockComplaint({ status: 'RESOLVED' })
		await expect(postComplaintMessage('c1', 'late reply', CTX, 'emp1')).rejects.toMatchObject({
			status: 400
		})
	})

	it('resolveComplaint sets RESOLVED and notifies the employee', async () => {
		mockComplaint({ status: 'RESPONDED', employee: { user: { id: 'u-emp' } } })
		tx.hrComplaint.update.mockResolvedValue({ id: 'c1', status: 'RESOLVED' })

		await resolveComplaint('c1', CTX)

		expect(tx.hrComplaint.update.mock.calls[0][0].data.status).toBe('RESOLVED')
		// #5: the audit write shares the resolve transaction.
		expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
		expect(notifyMock).toHaveBeenCalledWith(
			'u-emp',
			expect.stringContaining('resolved'),
			'/inquiries/c1'
		)
	})
})

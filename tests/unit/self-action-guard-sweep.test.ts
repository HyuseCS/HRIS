import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #308 — the two self-action holes the sweep found.
 *
 * The other twenty-odd destructive flows already had an answer (guarded, or no personal target
 * at all); these two had none. Both refusals are asserted with a matching positive control, so a
 * guard that simply refused everything would fail here rather than look like a pass.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		employee: { findFirst: vi.fn(), update: vi.fn() },
		position: { findFirst: vi.fn() },
		award: { create: vi.fn() },
		// #324: mutation + audit now share a transaction; the callback gets the same mock client
		// so the assertions below still read from `dbMock`.
		$transaction: vi.fn()
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('$lib/server/services/notifications', () => ({ notify: vi.fn() }))

const { assignEmployeePosition } = await import('$lib/server/services/settings/org')
const { grantAward } = await import('$lib/server/services/awards')

const ctx = (roles: string[]) => ({
	organizationId: 'org1',
	actorId: 'user-actor',
	actorRoles: roles as Role[],
	ipAddress: '::1'
})

beforeEach(() => {
	// `resetAllMocks`, not `clearAllMocks`: the latter clears recorded calls but LEAVES queued
	// `mockResolvedValueOnce` values, which then surface in an unrelated later test.
	vi.resetAllMocks()
	dbMock.$transaction.mockImplementation((fn: (client: typeof dbMock) => unknown) => fn(dbMock))
	dbMock.employee.update.mockResolvedValue({ id: 'emp-1' })
	dbMock.position.findFirst.mockResolvedValue({ id: 'pos-senior' })
	dbMock.award.create.mockResolvedValue({ id: 'award-1' })
})

describe('assignEmployeePosition refuses a self-promotion (#308)', () => {
	it('refuses when the target record belongs to the actor', async () => {
		// Settings -> Org was the second door onto an employment term. `updateEmployee` already
		// locked the first one; this asserts they now agree.
		dbMock.employee.findFirst.mockResolvedValue({
			id: 'emp-1',
			positionId: null,
			userId: 'user-actor'
		})

		await expect(
			assignEmployeePosition('emp-1', 'org1', 'pos-senior', ctx(['HR_ADMIN']))
		).rejects.toMatchObject({ status: 403 })

		expect(dbMock.employee.update).not.toHaveBeenCalled()
	})

	it('still assigns a position to somebody else', async () => {
		dbMock.employee.findFirst.mockResolvedValue({
			id: 'emp-2',
			positionId: null,
			userId: 'user-other'
		})

		await assignEmployeePosition('emp-2', 'org1', 'pos-senior', ctx(['HR_ADMIN']))

		expect(dbMock.employee.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { positionId: 'pos-senior' } })
		)
	})
})

describe('grantAward: nobody decorates themselves, HR does not decorate HR (#308)', () => {
	const target = (userId: string, roles: string[]) => ({
		id: 'emp-t',
		userId,
		firstName: 'Tara',
		lastName: 'Target',
		user: { roles }
	})

	it('refuses a self-award even from a CEO', async () => {
		// The actor is deliberately a CEO. A MANAGER self-awarding would be refused by the
		// executive gate below regardless, so it would pass with the self-check DELETED — proven
		// by mutation. A CEO holds ADMINISTER_SYSTEM, so that gate cannot fire and only the
		// self-check is left to catch this.
		dbMock.employee.findFirst.mockResolvedValue(target('user-actor', ['CEO']))

		await expect(
			grantAward('org1', { employeeId: 'emp-t', title: 'Employee of the Month' }, ctx(['CEO']))
		).rejects.toMatchObject({ status: 403 })

		expect(dbMock.award.create).not.toHaveBeenCalled()
	})

	it('refuses HR awarding another MANAGE_HR holder', async () => {
		dbMock.employee.findFirst.mockResolvedValue(target('user-other', ['HR_ADMIN']))

		await expect(
			grantAward('org1', { employeeId: 'emp-t', title: 'Long Service' }, ctx(['HR_ADMIN']))
		).rejects.toMatchObject({ status: 403 })

		expect(dbMock.award.create).not.toHaveBeenCalled()
	})

	it('lets an executive award a MANAGE_HR holder', async () => {
		// The half that proves the rule is about WHO awards, not a blanket ban on awarding HR.
		dbMock.employee.findFirst.mockResolvedValue(target('user-other', ['HR_ADMIN']))

		await grantAward('org1', { employeeId: 'emp-t', title: 'Long Service' }, ctx(['CEO']))

		expect(dbMock.award.create).toHaveBeenCalled()
	})

	it('lets HR award an ordinary employee', async () => {
		// Positive control for the common case — HR must not lose the feature it had.
		dbMock.employee.findFirst.mockResolvedValue(target('user-other', ['EMPLOYEE']))

		await grantAward(
			'org1',
			{ employeeId: 'emp-t', title: 'Employee of the Month' },
			ctx(['HR_ADMIN'])
		)

		expect(dbMock.award.create).toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '$lib/server/services/types'

/**
 * #47 applicant→employee conversion. DB, audit, and createEmployee are mocked so these stay in the
 * fast unit suite. Rules under test:
 * - Conversion requires an ACCEPTED offer (no offer → 400; there is no salary source otherwise).
 * - Title / salary / start date / department come from the offer (department falls back to the
 *   posting's), never hardcoded placeholders.
 * - The temp password is a cryptographically generated string, not Math.random().
 */

const { dbMock, createEmployeeMock } = vi.hoisted(() => ({
	dbMock: {
		applicant: { findFirst: vi.fn(), update: vi.fn() }
	},
	createEmployeeMock: vi.fn()
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('$lib/server/services/employees', () => ({ createEmployee: createEmployeeMock }))

const { convertApplicantToEmployee } = await import('$lib/server/services/recruitment')
const { generateTempPassword } = await import('$lib/server/password')

const CTX: AuditContext = {
	organizationId: 'org1',
	actorId: 'u1',
	actorRoles: ['HR_ADMIN'],
	ipAddress: 'test'
}
const baseApplicant = {
	id: 'app1',
	email: 'a@b.com',
	firstName: 'Ada',
	lastName: 'Lovelace',
	phone: null,
	convertedToEmployeeId: null,
	jobPosting: { title: 'Engineer', departmentId: 'dept-posting' },
	offer: null as unknown
}
const acceptedOffer = {
	status: 'ACCEPTED',
	jobTitle: 'Senior Engineer',
	monthlySalary: 65000,
	startDate: new Date('2026-08-01'),
	departmentId: 'dept-offer'
}

beforeEach(() => {
	vi.clearAllMocks()
	createEmployeeMock.mockResolvedValue({ id: 'newemp1' })
	dbMock.applicant.update.mockResolvedValue({})
})

describe('convertApplicantToEmployee — requires an accepted offer', () => {
	it('refuses when there is no offer', async () => {
		dbMock.applicant.findFirst.mockResolvedValue({ ...baseApplicant, offer: null })
		await expect(convertApplicantToEmployee('app1', 'org1', CTX)).rejects.toMatchObject({
			status: 400
		})
		expect(createEmployeeMock).not.toHaveBeenCalled()
	})

	it('refuses when the offer is not ACCEPTED', async () => {
		dbMock.applicant.findFirst.mockResolvedValue({
			...baseApplicant,
			offer: { ...acceptedOffer, status: 'SENT' }
		})
		await expect(convertApplicantToEmployee('app1', 'org1', CTX)).rejects.toMatchObject({
			status: 400
		})
		expect(createEmployeeMock).not.toHaveBeenCalled()
	})

	it('rejects an already-converted applicant', async () => {
		dbMock.applicant.findFirst.mockResolvedValue({
			...baseApplicant,
			convertedToEmployeeId: 'emp-existing',
			offer: acceptedOffer
		})
		await expect(convertApplicantToEmployee('app1', 'org1', CTX)).rejects.toMatchObject({
			status: 409
		})
		expect(createEmployeeMock).not.toHaveBeenCalled()
	})
})

describe('convertApplicantToEmployee — derives from the offer', () => {
	it('uses the offer title/salary/start/department and a secure password', async () => {
		dbMock.applicant.findFirst.mockResolvedValue({ ...baseApplicant, offer: acceptedOffer })

		await convertApplicantToEmployee('app1', 'org1', CTX)

		const arg = createEmployeeMock.mock.calls[0][1]
		expect(arg.jobTitle).toBe('Senior Engineer')
		expect(arg.basicMonthlySalary).toBe(65000)
		expect(arg.departmentId).toBe('dept-offer')
		expect(arg.startDate).toEqual(new Date('2026-08-01'))
		expect(typeof arg.password).toBe('string')
		expect(arg.password.length).toBeGreaterThanOrEqual(12)
		expect(dbMock.applicant.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { convertedToEmployeeId: 'newemp1', currentStage: 'HIRED' } })
		)
	})

	it("falls back to the posting's department when the offer has none", async () => {
		dbMock.applicant.findFirst.mockResolvedValue({
			...baseApplicant,
			offer: { ...acceptedOffer, departmentId: null }
		})

		await convertApplicantToEmployee('app1', 'org1', CTX)

		expect(createEmployeeMock.mock.calls[0][1].departmentId).toBe('dept-posting')
	})
})

describe('generateTempPassword', () => {
	it('generates a password of the requested length with no ambiguous characters', () => {
		const p = generateTempPassword(20)
		expect(p).toHaveLength(20)
		expect(p).not.toMatch(/[0O1Il]/) // documented exclusions
	})

	it('produces different values across calls', () => {
		expect(generateTempPassword()).not.toBe(generateTempPassword())
	})
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuditContext } from '../../src/lib/server/services/types'

// #111 — the security-critical gate: getEmployee is the single masking choke point and
// revealEmployeeSensitive the only cleartext path. Both hit the DB, so the db client and the
// audit sink are mocked; the fixture below is what findFirst resolves for every case.
const { findFirst, compFindMany, typeFindMany, employeeUpdate, writeAuditLog } = vi.hoisted(() => ({
	findFirst: vi.fn(),
	// getEmployee's heal-on-read (#170 Stage 1.5, #222): separate history queries + stale-only updates.
	compFindMany: vi.fn(),
	typeFindMany: vi.fn(),
	employeeUpdate: vi.fn(),
	writeAuditLog: vi.fn()
}))
vi.mock('$lib/server/db', () => ({
	db: {
		employee: { findFirst, update: employeeUpdate },
		employeeCompensation: { findMany: compFindMany },
		employeeEmploymentType: { findMany: typeFindMany }
	}
}))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

import { getEmployee, revealEmployeeSensitive } from '../../src/lib/server/services/employees'
import { MASKED_SALARY } from '../../src/lib/utils/format'

const RAW = {
	id: 'emp-1',
	reportsToId: null,
	basicMonthlySalary: 25000,
	sssNumber: '34-1234567-8',
	philhealthNumber: '12-345678901-2',
	pagibigNumber: '1234-5678-9012',
	tinNumber: '123-456-789-000',
	bankName: 'BDO',
	bankAccountName: 'Elena Cruz',
	bankAccountNumber: '00123456784321',
	gcashNumber: '09170000009999'
}

const ctx: AuditContext = { organizationId: 'org', actorId: 'actor-1', actorRoles: ['HR_ADMIN'] }

beforeEach(() => {
	findFirst.mockReset().mockResolvedValue({ ...RAW })
	compFindMany.mockReset().mockResolvedValue([]) // no history → heal is a no-op, cache unchanged
	typeFindMany.mockReset().mockResolvedValue([])
	employeeUpdate.mockReset()
	writeAuditLog.mockReset()
})

describe('getEmployee masking (#111)', () => {
	it('masks sensitive fields for HR — not null, not cleartext', async () => {
		const e = await getEmployee('emp-1', 'org', { viewerRoles: ['HR_ADMIN'] })
		expect(e.bankAccountNumber).toBe('•••• 4321')
		expect(e.gcashNumber).toBe('•••• 9999')
		expect(e.sssNumber).toBe('•••• 5678')
		expect(e.basicMonthlySalary).toBe(MASKED_SALARY)
		// Non-sensitive disbursement labels stay visible.
		expect(e.bankName).toBe('BDO')
	})

	it('masks (never nulls) for self-view, regardless of the owner being a plain employee', async () => {
		const e = await getEmployee('emp-1', 'org', { isSelf: true, viewerRoles: ['EMPLOYEE'] })
		expect(e.bankAccountNumber).toBe('•••• 4321')
		expect(e.basicMonthlySalary).toBe(MASKED_SALARY)
	})

	it('nulls sensitive fields for a below-HR viewer who is not the owner', async () => {
		const e = await getEmployee('emp-1', 'org', { viewerRoles: ['EMPLOYEE'] })
		expect(e.basicMonthlySalary).toBeNull()
		expect(e.sssNumber).toBeNull()
		expect(e.bankAccountNumber).toBeNull()
		expect(e.gcashNumber).toBeNull()
	})

	// The #279 case: judged on the primary role alone this viewer was EMPLOYEE and got nulls.
	it('clears the HR floor on a SECONDARY role', async () => {
		const e = await getEmployee('emp-1', 'org', { viewerRoles: ['EMPLOYEE', 'HR_ADMIN'] })
		expect(e.basicMonthlySalary).toBe(MASKED_SALARY)
		expect(e.sssNumber).toBe('•••• 5678')
	})

	it('masks when the role set is empty rather than falling open', async () => {
		const e = await getEmployee('emp-1', 'org', { viewerRoles: [] })
		expect(e.basicMonthlySalary).toBeNull()
	})

	it('returns the raw record for internal callers that pass no opts', async () => {
		const e = await getEmployee('emp-1', 'org')
		expect(e.bankAccountNumber).toBe('00123456784321')
		expect(e.basicMonthlySalary).toBe(25000)
	})
})

describe('revealEmployeeSensitive (#111)', () => {
	it('returns cleartext and writes exactly one VIEW audit when audited', async () => {
		const r = await revealEmployeeSensitive('emp-1', 'org', ctx, { audit: true })
		expect(r.bankAccountNumber).toBe('00123456784321')
		expect(r.gcashNumber).toBe('09170000009999')
		expect(r.basicMonthlySalary).toBe(25000)
		expect(writeAuditLog).toHaveBeenCalledTimes(1)
		expect(writeAuditLog.mock.calls[0][1]).toMatchObject({
			action: 'VIEW',
			entityType: 'Employee',
			entityId: 'emp-1'
		})
	})

	it('skips the audit for a self-reveal (audit:false) but still returns cleartext', async () => {
		const r = await revealEmployeeSensitive('emp-1', 'org', ctx, { audit: false })
		expect(r.bankAccountNumber).toBe('00123456784321')
		expect(writeAuditLog).not.toHaveBeenCalled()
	})
})

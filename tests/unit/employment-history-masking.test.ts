import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #290 — the 201 file masked today's basic monthly salary behind the audited ?/reveal (#111)
 * and printed every PAST salary in cleartext a few centimetres below, in the Employment History
 * panel. Two surfaces, two answers. These rows pin the fix: the history figures are masked by
 * default and released through the SAME reveal.
 *
 * The trap this file exists to catch (T3): the mask must be applied AFTER the diff loop's
 * `from === to` equality check, never inside `display()`. Masking inside `display()` makes both
 * sides of a salary change compare equal, so the change is dropped — and since `rateType` is
 * equal on both sides of an ordinary raise, salary is the only SURVIVING change, so the whole
 * timeline event (date, actor and all) vanishes. Tests would stay green without T3.
 */

const { auditFindMany, deptFindMany, posFindMany, schedFindMany, branchFindMany } = vi.hoisted(
	() => ({
		auditFindMany: vi.fn(),
		deptFindMany: vi.fn(),
		posFindMany: vi.fn(),
		schedFindMany: vi.fn(),
		branchFindMany: vi.fn()
	})
)

// getEmploymentHistory touches exactly these five db methods and nothing else. It writes no
// audit row, so $lib/server/audit is deliberately NOT mocked — mocking a sink it does not use
// would disguise one if it were ever added.
vi.mock('$lib/server/db', () => ({
	db: {
		auditLog: { findMany: auditFindMany },
		department: { findMany: deptFindMany },
		position: { findMany: posFindMany },
		workSchedule: { findMany: schedFindMany },
		branch: { findMany: branchFindMany }
	}
}))

import { getEmploymentHistory } from '../../src/lib/server/services/employees'
import { MASKED_SALARY } from '../../src/lib/utils/format'

const logFor = (oldValue: Record<string, unknown>, newValue: Record<string, unknown>) => ({
	id: 'log-1',
	createdAt: new Date('2026-08-01T00:00:00Z'),
	action: 'UPDATE',
	actor: { email: 'hr@veent.ph' },
	oldValue,
	newValue
})

beforeEach(() => {
	auditFindMany.mockReset().mockResolvedValue([])
	deptFindMany.mockReset().mockResolvedValue([])
	posFindMany.mockReset().mockResolvedValue([])
	schedFindMany.mockReset().mockResolvedValue([])
	branchFindMany.mockReset().mockResolvedValue([])
})

describe('getEmploymentHistory salary masking (#290)', () => {
	it('T1 — masks both sides of a salary change on a default call', async () => {
		auditFindMany.mockResolvedValue([
			logFor({ basicMonthlySalary: 25000 }, { basicMonthlySalary: 30000 })
		])

		const events = await getEmploymentHistory('emp-1', 'org-1')

		expect(events).toHaveLength(1)
		expect(events[0].changes).toHaveLength(1)
		const c = events[0].changes[0]
		expect(c.label).toBe('Basic salary')
		expect(c.from).toBe(MASKED_SALARY)
		expect(c.to).toBe(MASKED_SALARY)
		// Substring assertions, so a PARTIAL mask (last-4, magnitude, anything) cannot pass.
		expect(c.from).not.toContain('25')
		expect(c.to).not.toContain('30')
	})

	it('T2 — returns real money strings when called with { unmask: true }', async () => {
		auditFindMany.mockResolvedValue([
			logFor({ basicMonthlySalary: 25000 }, { basicMonthlySalary: 30000 })
		])

		const events = await getEmploymentHistory('emp-1', 'org-1', { unmask: true })

		expect(events[0].changes[0].from).toBe('₱25,000.00')
		expect(events[0].changes[0].to).toBe('₱30,000.00')
	})

	it('T3 — still emits the event when salary is the only surviving change (the trap)', async () => {
		// The REAL recordCompensationChange payload: two diffed fields, with rateType equal on
		// both sides so the equality check drops it, leaving salary as the only survivor.
		auditFindMany.mockResolvedValue([
			logFor(
				{ basicMonthlySalary: 25000, rateType: 'MONTHLY' },
				{ basicMonthlySalary: 30000, rateType: 'MONTHLY', effectiveDate: '2026-09-01' }
			)
		])

		const events = await getEmploymentHistory('emp-1', 'org-1')

		// Structure only — never a mask value. That is what makes T3 independent of T1, and the
		// reason it survives "delete the mask" (M1) while dying on "mask inside display()" (M2).
		expect(events).toHaveLength(1)
		expect(events[0].changes).toHaveLength(1)
		expect(events[0].changes[0].label).toBe('Basic salary')
		expect(events[0].date).toEqual(new Date('2026-08-01T00:00:00Z'))
		expect(events[0].actorEmail).toBe('hr@veent.ph')
		expect(events[0].effectiveDate).toBe('2026-09-01')
	})

	it('T4 — masks salary while leaving job title cleartext in the same log', async () => {
		auditFindMany.mockResolvedValue([
			logFor(
				{ jobTitle: 'Cashier', basicMonthlySalary: 25000 },
				{ jobTitle: 'Supervisor', basicMonthlySalary: 30000 }
			)
		])

		const events = await getEmploymentHistory('emp-1', 'org-1')

		expect(events[0].changes).toHaveLength(2)
		const byLabel = Object.fromEntries(events[0].changes.map((c) => [c.label, c]))
		expect(byLabel['Job title'].from).toBe('Cashier')
		expect(byLabel['Job title'].to).toBe('Supervisor')
		expect(byLabel['Basic salary'].from).toBe(MASKED_SALARY)
		expect(byLabel['Basic salary'].to).toBe(MASKED_SALARY)
	})

	it('T5 — leaves the em-dash placeholder unmasked on a first-ever salary', async () => {
		auditFindMany.mockResolvedValue([
			logFor({ basicMonthlySalary: null }, { basicMonthlySalary: 25000 })
		])

		const events = await getEmploymentHistory('emp-1', 'org-1')

		// '—' IS the absence of a figure. Masking it hides nothing and destroys information.
		expect(events[0].changes[0].from).toBe('—')
		expect(events[0].changes[0].to).toBe(MASKED_SALARY)
	})

	it('T6 — leaves department, employment type and rate basis cleartext', async () => {
		deptFindMany.mockResolvedValue([{ id: 'dept-1', name: 'Operations' }])
		auditFindMany.mockResolvedValue([
			logFor(
				{ departmentId: null, employmentType: 'REGULAR', rateType: 'MONTHLY' },
				{ departmentId: 'dept-1', employmentType: 'PART_TIME', rateType: 'HOURLY' }
			)
		])

		const events = await getEmploymentHistory('emp-1', 'org-1')

		const byLabel = Object.fromEntries(events[0].changes.map((c) => [c.label, c]))
		expect(byLabel['Department'].to).toBe('Operations')
		expect(byLabel['Employment type'].to).toBe('PART TIME')
		expect(byLabel['Rate basis'].to).toBe('Hourly rate')
	})

	it('T7 — produces no event for a no-op salary write', async () => {
		auditFindMany.mockResolvedValue([
			logFor({ basicMonthlySalary: 25000 }, { basicMonthlySalary: 25000 })
		])

		const events = await getEmploymentHistory('emp-1', 'org-1')

		// The equality check must survive the change — we do not "fix" the trap by deleting it.
		expect(events).toHaveLength(0)
	})
})

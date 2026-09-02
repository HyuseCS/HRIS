import { describe, it, expect, vi } from 'vitest'

/**
 * #3 — the advisory-lock keys that serialize the overlap checks. This file's premise INVERTED:
 * it was `payroll-month-lock-key.test.ts` and it pinned that two dates in different months got
 * DIFFERENT keys. They must now get the SAME key.
 *
 * The lock only works if two overlapping ranges hash to the SAME key. #163 keyed on the org (or
 * employee) plus the period's Manila month, and was careful that the month came from the REQUESTED
 * period rather than the overlap query's widened `from` bound — an Aug 1 range keying on July while
 * an overlapping Aug 2 range keyed on August was the original bug. #3 lets a range span two months,
 * which reopens that hole by a different route: `20 May → 5 Jun` and an overlapping `1 Jun → 10 Jun`
 * derive different months and serialize against nothing. So the month is gone from both keys (D3),
 * and with it the whole class of "two writers, two keys".
 *
 * Postgres locking itself is not unit-testable; the key string is, and it is the whole mechanism.
 * There is deliberately NO "two ranges either side of a boundary take the same lock" case: with no
 * date parameter left, any such assertion is `f('org1') === f('org1')` and cannot fail. The exact
 * -string assertions above are what a re-added month segment would break.
 *
 * The arity assertions are the ones that matter long-term — re-adding a date parameter is how this
 * silently regresses, and a re-added parameter that the key ignores would pass every other case
 * here. Copied from `backup-plan.test.ts`, the in-repo precedent for a one-argument lock key.
 */

vi.mock('$lib/server/db', () => ({ db: {} }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn() }))

const { payrollRunLockKey } = await import('$lib/server/services/payroll/index')
const { timesheetLockKey } = await import('$lib/server/services/timesheets')

describe('payrollRunLockKey', () => {
	it('is a pure function of the organization id', () => {
		expect(payrollRunLockKey('org1')).toBe('payroll-run:org1')
		expect(payrollRunLockKey('org1')).toBe(payrollRunLockKey('org1'))
	})

	it('gives a different org a different key', () => {
		expect(payrollRunLockKey('org1')).not.toBe(payrollRunLockKey('org2'))
	})

	it('takes exactly one argument — no date can differ between two writers', () => {
		expect(payrollRunLockKey.length).toBe(1)
	})
})

describe('timesheetLockKey', () => {
	it('is a pure function of the employee id', () => {
		expect(timesheetLockKey('emp1')).toBe('timesheet:emp1')
		expect(timesheetLockKey('emp1')).toBe(timesheetLockKey('emp1'))
	})

	it('gives a different employee a different key', () => {
		expect(timesheetLockKey('emp1')).not.toBe(timesheetLockKey('emp2'))
	})

	it('takes exactly one argument — no date can differ between two writers', () => {
		expect(timesheetLockKey.length).toBe(1)
	})
})

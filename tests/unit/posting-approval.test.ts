import { describe, it, expect } from 'vitest'
import { canApprovePosting } from '../../src/lib/server/services/recruitment'
import type { Role } from '@prisma/client'

// #195 — a posting is approved by its department's designated approver, or by HR when no
// approver is mapped (the fallback). #283/D8: HR is only ever that fallback — it never overrides
// a mapped department.
describe('canApprovePosting (#195)', () => {
	const HR: Role[] = ['HR_ADMIN']
	const EMP: Role[] = ['EMPLOYEE']

	it('lets the mapped approver act', () => {
		expect(canApprovePosting('emp_senior', 'emp_senior', EMP)).toBe(true)
	})

	it('rejects a non-approver, non-HR employee', () => {
		expect(canApprovePosting('emp_senior', 'emp_other', EMP)).toBe(false)
	})

	it('lets HR act as the fallback when no approver is mapped', () => {
		expect(canApprovePosting(null, 'emp_hr', HR)).toBe(true)
	})

	// #283/D8: the mapping BINDS. HR is the fallback for an UNMAPPED department, never an override
	// on a mapped one — which is what this function's own comment and posting-approvers.ts:6-11
	// always claimed. The old assertion here (true) pinned the unreachable-line bug.
	it('does not let HR override when another approver is mapped', () => {
		expect(canApprovePosting('emp_senior', 'emp_hr', HR)).toBe(false)
	})

	it('rejects a non-HR user when no approver is mapped', () => {
		expect(canApprovePosting(null, 'emp_x', EMP)).toBe(false)
	})
})

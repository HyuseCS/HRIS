import { describe, it, expect } from 'vitest'
import {
	canActOnStage,
	canActOnPayrollStage,
	nextState,
	livePayrollStage,
	type PayrollChainStep
} from '$lib/server/services/approvals'
import { buildApprovalChain } from '$lib/server/services/requests/routing'
import type { ApprovalDecision, ApprovalStage, Role } from '@prisma/client'

// Maker-checker stage authority (#134): MAKE = MANAGE_HR, VERIFY = VERIFIER,
// APPROVE = APPROVER. Signature: (stage, actorRoles, actorEmployeeId, ownerEmployeeId, sod).
//
// #283 made `sod` a required 5th parameter. These cases are about STAGE AUTHORITY, so they pass
// the no-bar value — an actor who has decided nothing. The bar itself is covered in
// approval-self-guard.test.ts, where the service wiring that feeds it can be exercised too.
const NO_BAR = { actorId: null, decidedActorIds: [], verifiedDocActorIds: [] }

describe('canActOnStage', () => {
	it('MAKE requires an HR-level maker', () => {
		for (const role of ['HR_ADMIN', 'MANAGER', 'SUPER_ADMIN', 'CEO'] as Role[]) {
			expect(canActOnStage('MAKE', [role], 'actor', 'owner', NO_BAR)).toBe(true)
		}
		for (const role of ['EMPLOYEE', 'VERIFIER', 'APPROVER', 'FINANCE'] as Role[]) {
			expect(canActOnStage('MAKE', [role], 'actor', 'owner', NO_BAR)).toBe(false)
		}
	})

	it('VERIFY requires the Verifier role', () => {
		expect(canActOnStage('VERIFY', ['VERIFIER'], 'actor', 'owner', NO_BAR)).toBe(true)
		for (const role of ['HR_ADMIN', 'MANAGER', 'APPROVER', 'SUPER_ADMIN'] as Role[]) {
			expect(canActOnStage('VERIFY', [role], 'actor', 'owner', NO_BAR)).toBe(false)
		}
	})

	it('APPROVE requires the Approver role', () => {
		expect(canActOnStage('APPROVE', ['APPROVER'], 'actor', 'owner', NO_BAR)).toBe(true)
		for (const role of ['HR_ADMIN', 'MANAGER', 'VERIFIER', 'SUPER_ADMIN'] as Role[]) {
			expect(canActOnStage('APPROVE', [role], 'actor', 'owner', NO_BAR)).toBe(false)
		}
	})

	// #75 — separation of duties: nobody decides their own submission, regardless of role.
	it('blocks acting on your own submission', () => {
		expect(canActOnStage('MAKE', ['HR_ADMIN'], 'self', 'self', NO_BAR)).toBe(false)
		expect(canActOnStage('VERIFY', ['VERIFIER'], 'self', 'self', NO_BAR)).toBe(false)
		expect(canActOnStage('APPROVE', ['APPROVER'], 'self', 'self', NO_BAR)).toBe(false)
	})

	// Multi-role (#133/#134): one person carrying both roles can make AND verify —
	// though never on the same request (the own-submission guard still applies).
	it('a [MANAGER, VERIFIER] user can act on both MAKE and VERIFY', () => {
		const roles: Role[] = ['MANAGER', 'VERIFIER']
		expect(canActOnStage('MAKE', roles, 'actor', 'owner', NO_BAR)).toBe(true)
		expect(canActOnStage('VERIFY', roles, 'actor', 'owner', NO_BAR)).toBe(true)
		expect(canActOnStage('APPROVE', roles, 'actor', 'owner', NO_BAR)).toBe(false)
	})
})

// #174 — payroll runs are finance sign-offs: the final APPROVE routes to the CEO / Super
// Admin, not the generic Approver. VERIFY stays the Verifier; MAKE is the payroll preparer.
describe('canActOnPayrollStage (#174)', () => {
	it('APPROVE requires a finance approver — CEO or Super Admin only', () => {
		for (const role of ['CEO', 'SUPER_ADMIN'] as Role[]) {
			expect(canActOnPayrollStage('APPROVE', [role], NO_BAR)).toBe(true)
		}
		// The generic Approver signs off HR requests but never payroll.
		for (const role of ['APPROVER', 'VERIFIER', 'HR_ADMIN', 'MANAGER', 'FINANCE'] as Role[]) {
			expect(canActOnPayrollStage('APPROVE', [role], NO_BAR)).toBe(false)
		}
	})

	it('VERIFY is still the Verifier', () => {
		expect(canActOnPayrollStage('VERIFY', ['VERIFIER'], NO_BAR)).toBe(true)
		for (const role of ['CEO', 'SUPER_ADMIN', 'APPROVER'] as Role[]) {
			expect(canActOnPayrollStage('VERIFY', [role], NO_BAR)).toBe(false)
		}
	})

	it('leaves the generic request chain untouched — Approver still signs off requests', () => {
		expect(canActOnStage('APPROVE', ['APPROVER'], 'actor', 'owner', NO_BAR)).toBe(true)
		expect(canActOnStage('APPROVE', ['CEO'], 'actor', 'owner', NO_BAR)).toBe(false)
	})
})

describe('nextState', () => {
	it('advances to the next stage on a non-final approval', () => {
		expect(nextState(0, 3, 'APPROVED')).toEqual({ status: 'PENDING', currentStage: 1 })
		expect(nextState(1, 3, 'APPROVED')).toEqual({ status: 'PENDING', currentStage: 2 })
	})

	it('marks APPROVED when the final stage approves', () => {
		expect(nextState(2, 3, 'APPROVED')).toEqual({ status: 'APPROVED', currentStage: 2 })
	})

	it('rejects terminally at any stage', () => {
		expect(nextState(1, 3, 'REJECTED')).toEqual({ status: 'REJECTED', currentStage: 1 })
	})

	it('returns to the maker without advancing', () => {
		expect(nextState(1, 3, 'RETURNED')).toEqual({ status: 'RETURNED', currentStage: 1 })
	})
})

// The chain builder (#134): three stages, MAKE auto-completed only when a maker files.
describe('buildApprovalChain', () => {
	const at = new Date('2026-07-20T00:00:00Z')

	it('leaves MAKE pending when an employee files (enters at stage 0)', () => {
		const { steps, currentStage } = buildApprovalChain({
			attempt: 1,
			makerUserId: null,
			decidedAt: at
		})
		expect(steps.map((s) => s.stage)).toEqual(['MAKE', 'VERIFY', 'APPROVE'])
		expect(steps.every((s) => s.decision == null)).toBe(true)
		expect(currentStage).toBe(0)
	})

	it('auto-completes MAKE when a maker files (enters at VERIFY)', () => {
		const { steps, currentStage } = buildApprovalChain({
			attempt: 1,
			makerUserId: 'hr-user',
			decidedAt: at
		})
		expect(steps[0]).toMatchObject({ stage: 'MAKE', decision: 'APPROVED', actorId: 'hr-user' })
		expect(steps[1].decision).toBeUndefined()
		expect(currentStage).toBe(1)
	})

	it('stamps the attempt number onto every step', () => {
		const { steps } = buildApprovalChain({ attempt: 3, makerUserId: null, decidedAt: at })
		expect(steps.every((s) => s.attempt === 3)).toBe(true)
	})
})

// Payroll runs have no `currentStage` column and PayrollRunStatus has no RETURNED state,
// so livePayrollStage derives the open stage from steps and treats a returned/rejected
// attempt as closed until a recompute opens a fresh one (#134).
describe('livePayrollStage', () => {
	let auto = 0
	const step = (
		attempt: number,
		stageIndex: number,
		stage: ApprovalStage,
		decision: ApprovalDecision | null,
		actorId: string | null = null
	): PayrollChainStep => ({ id: `s${auto++}`, attempt, stageIndex, stage, decision, actorId })

	// A freshly computed run: MAKE auto-approved by the maker, VERIFY/APPROVE pending.
	const attempt1Open = (): PayrollChainStep[] => [
		step(1, 0, 'MAKE', 'APPROVED', 'maker'),
		step(1, 1, 'VERIFY', null),
		step(1, 2, 'APPROVE', null)
	]

	it('opens at VERIFY after compute (MAKE auto-completed)', () => {
		const live = livePayrollStage(attempt1Open())
		expect(live?.currentStep?.stage).toBe('VERIFY')
		expect(live?.currentStage).toBe(1)
	})

	it('advances to APPROVE once VERIFY is signed off', () => {
		const steps = attempt1Open()
		steps[1].decision = 'APPROVED'
		const live = livePayrollStage(steps)
		expect(live?.currentStep?.stage).toBe('APPROVE')
	})

	it('reports no open stage once fully approved', () => {
		const steps = attempt1Open()
		steps[1].decision = 'APPROVED'
		steps[2].decision = 'APPROVED'
		expect(livePayrollStage(steps)?.currentStep ?? null).toBeNull()
	})

	it('halts the attempt on a return — no stage is actionable until a recompute', () => {
		const steps = attempt1Open()
		steps[1].decision = 'RETURNED' // returned at VERIFY
		const live = livePayrollStage(steps)
		// The still-null APPROVE step must NOT read as actionable.
		expect(live?.currentStep ?? null).toBeNull()
	})

	it('reopens at VERIFY on a fresh attempt after a return', () => {
		const steps = [
			step(1, 0, 'MAKE', 'APPROVED', 'maker'),
			step(1, 1, 'VERIFY', 'RETURNED'),
			step(1, 2, 'APPROVE', null),
			// Recompute opened attempt 2.
			step(2, 0, 'MAKE', 'APPROVED', 'maker'),
			step(2, 1, 'VERIFY', null),
			step(2, 2, 'APPROVE', null)
		]
		const live = livePayrollStage(steps)
		expect(live?.attempt).toBe(2)
		expect(live?.currentStep?.stage).toBe('VERIFY')
	})

	it('returns null for a run with no chain yet', () => {
		expect(livePayrollStage([])).toBeNull()
	})
})

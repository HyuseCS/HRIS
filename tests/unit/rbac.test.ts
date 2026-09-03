import { describe, it, expect } from 'vitest'
import {
	ASSIGNABLE_ROLES,
	CAPABILITIES,
	HIRE_ROLES,
	ROLE_DESCRIPTIONS,
	ROLE_GROUPS,
	can,
	canAny,
	type Capability
} from '../../src/lib/rbac'
// Value import, not type-only: the generated enum object is the drift tripwire below.
import { Role } from '@prisma/client'

const ALL_ROLES: Role[] = [
	'EMPLOYEE',
	'MANAGER',
	'HR_ADMIN',
	'SUPER_ADMIN',
	'PAYROLL_OFFICER',
	'FINANCE',
	'CEO',
	'VERIFIER',
	'APPROVER'
]

// The full matrix, written out longhand rather than derived from CAPABILITIES — a test
// that recomputes the table from the table proves nothing. Every cell here is a
// deliberate authorization decision, so widening one fails this test on purpose.
const EXPECTED: Record<string, Role[]> = {
	MANAGE_HR: ['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO'],
	// #228: HR authority over the whole roster. Excludes MANAGER, who is scoped to their own
	// branch and team — the distinction MANAGE_HR cannot express.
	ADMINISTER_HR_ORGWIDE: ['HR_ADMIN', 'SUPER_ADMIN', 'CEO'],
	// #279: the team page's org-wide view and 201-file document reads. HR back-office only.
	ADMINISTER_HR_RECORDS: ['HR_ADMIN', 'SUPER_ADMIN'],
	VIEW_TEAM: ['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO'],
	// #224: the CEO gained system administration. The irreversible half moved out to
	// OVERRIDE_FINALIZED rather than following it.
	ADMINISTER_SYSTEM: ['SUPER_ADMIN', 'CEO'],
	OVERRIDE_FINALIZED: ['SUPER_ADMIN'],
	MANAGE_USER_ROLES: ['CEO'],
	APPROVE_REQUESTS: [
		'MANAGER',
		'HR_ADMIN',
		'SUPER_ADMIN',
		'PAYROLL_OFFICER',
		'CEO',
		'VERIFIER',
		'APPROVER'
	],
	VERIFY_REQUESTS: ['VERIFIER'],
	APPROVE_SIGNOFF: ['APPROVER'],
	APPROVE_FINANCE: ['CEO', 'SUPER_ADMIN'],
	MANAGE_STATUTORY_RATES: ['CEO', 'SUPER_ADMIN'],
	PROPOSE_STATUTORY_RATES: ['HR_ADMIN'],
	MANAGE_PAYROLL: ['MANAGER', 'SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER', 'CEO'],
	VIEW_PAYROLL_REPORTS: ['MANAGER', 'SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER', 'FINANCE', 'CEO'],
	// #249: reads anyone's payslip. VIEW_PAYROLL_REPORTS minus MANAGER, who is scoped to their
	// reporting line — the same distinction ADMINISTER_HR_ORGWIDE draws for employee records.
	VIEW_PAY_ORGWIDE: ['HR_ADMIN', 'SUPER_ADMIN', 'PAYROLL_OFFICER', 'FINANCE', 'CEO']
}

// PROPOSE_STATUTORY_RATES is the MAKER leg of the statutory-rate maker-checker (#220): only
// HR_ADMIN proposes. CEO/SUPER_ADMIN hold the superior MANAGE_STATUTORY_RATES (edit directly +
// confirm) and MANAGER holds neither, so this capability is a deliberate exception to the "CEO and
// MANAGER hold every HR_ADMIN capability" invariants below.
//
// ADMINISTER_HR_ORGWIDE is the second exception (#228). MANAGER holding every HR_ADMIN capability
// is what made object-level scoping impossible to express: `requireMinRole('MANAGER')` plus
// `!can(role,'MANAGE_HR')` described an empty set, so the guards meant to keep a manager to their
// own team never ran and every MANAGER could read and edit the whole roster. This capability draws
// the line the superset invariant otherwise forbids — HR authority over the WHOLE roster, versus a
// manager's own branch and team. It is deliberately NOT held by MANAGER.
// VIEW_PAY_ORGWIDE is the third exception (#249), and for the same reason as the second: a
// payslip is employee data, so MANAGER reads their reporting line and nobody else. It exists because
// VIEW_PAYROLL_REPORTS gained MANAGER in #133 and could no longer express "a stranger's pay".
// ADMINISTER_HR_RECORDS is the fourth exception (#279). It is not a new policy: it names the set
// two sites already hardcoded as `['HR_ADMIN','SUPER_ADMIN'].includes(user.role)` — the team page's
// org-wide toggle and 201-file document reads. They were hardcoded precisely BECAUSE no capability
// could express the set: MANAGER is excluded for the same reason as the second and third exceptions
// (employee records are not a manager's to read org-wide), and CEO is excluded as it was before,
// like the first exception. Converting them to a capability without this entry would have silently
// widened both to MANAGER and CEO, so the exception is what keeps #279 a no-op change.
const HR_ADMIN_SUPERSET_EXCEPTIONS: (keyof typeof CAPABILITIES)[] = [
	'PROPOSE_STATUTORY_RATES',
	'ADMINISTER_HR_ORGWIDE',
	'VIEW_PAY_ORGWIDE',
	'ADMINISTER_HR_RECORDS'
]

describe('capability table', () => {
	it('covers every capability with no extras', () => {
		expect(Object.keys(CAPABILITIES).sort()).toEqual(Object.keys(EXPECTED).sort())
	})

	for (const [capability, holders] of Object.entries(EXPECTED)) {
		describe(capability, () => {
			for (const role of ALL_ROLES) {
				const shouldHold = holders.includes(role)
				it(`${shouldHold ? 'grants' : 'denies'} ${role}`, () => {
					expect(can(role, capability as keyof typeof CAPABILITIES)).toBe(shouldHold)
				})
			}
		})
	}

	// The bug class this table exists to prevent: EMPLOYEE picking up a privileged
	// capability, and the off-ladder specialists silently inheriting HR authority.
	it('grants EMPLOYEE nothing', () => {
		for (const capability of Object.keys(CAPABILITIES)) {
			expect(can('EMPLOYEE', capability as keyof typeof CAPABILITIES)).toBe(false)
		}
	})

	it('keeps FINANCE and PAYROLL_OFFICER off the HR ladder', () => {
		for (const role of ['FINANCE', 'PAYROLL_OFFICER'] as Role[]) {
			expect(can(role, 'MANAGE_HR')).toBe(false)
			expect(can(role, 'VIEW_TEAM')).toBe(false)
			expect(can(role, 'ADMINISTER_SYSTEM')).toBe(false)
			// ...but they must not be locked out of payroll reporting.
			expect(can(role, 'VIEW_PAYROLL_REPORTS')).toBe(true)
		}
	})

	// CEO's contract (#132, widened by #224): every capability HR_ADMIN holds, plus the
	// exclusive role-changer and system administration — but NOT the irreversible
	// overrides, which stay Super Admin.
	describe('CEO', () => {
		it('holds every capability HR_ADMIN holds', () => {
			for (const capability of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
				if (HR_ADMIN_SUPERSET_EXCEPTIONS.includes(capability)) continue
				if (can('HR_ADMIN', capability)) {
					expect(can('CEO', capability)).toBe(true)
				}
			}
		})

		it('is the only role that can manage user roles', () => {
			for (const role of ALL_ROLES) {
				expect(can(role, 'MANAGE_USER_ROLES')).toBe(role === 'CEO')
			}
		})

		// Inverted by #224. This previously asserted `can('CEO','ADMINISTER_SYSTEM') === false`.
		// That assertion was load-bearing for the wrong reason: while ADMINISTER_SYSTEM was Super
		// Admin's alone it doubled as the guard on the irreversible operations (voiding a payroll
		// run or period, reopening locked attendance days), so denying it to the CEO happened to
		// enforce separation of duties. #224 grants the CEO the routine administration it always
		// needed and splits the irreversible half into OVERRIDE_FINALIZED, which is what the
		// separation actually depends on — so that is what this now pins.
		it('administers the system but cannot override finalized records (#224)', () => {
			expect(can('CEO', 'ADMINISTER_SYSTEM')).toBe(true)
			expect(can('CEO', 'OVERRIDE_FINALIZED')).toBe(false)
			expect(can('SUPER_ADMIN', 'ADMINISTER_SYSTEM')).toBe(true)
			expect(can('SUPER_ADMIN', 'OVERRIDE_FINALIZED')).toBe(true)
		})
	})
})

// Manager is on-branch HR for JoJo/Sweetleaf (#133): every capability HR_ADMIN holds,
// but NOT the CEO/Super-Admin exclusives.
describe('MANAGER promotion', () => {
	it('holds every capability HR_ADMIN holds', () => {
		for (const capability of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
			if (HR_ADMIN_SUPERSET_EXCEPTIONS.includes(capability)) continue
			if (can('HR_ADMIN', capability)) {
				expect(can('MANAGER', capability)).toBe(true)
			}
		}
	})

	it('does not gain the exclusives', () => {
		expect(can('MANAGER', 'MANAGE_USER_ROLES')).toBe(false)
		expect(can('MANAGER', 'ADMINISTER_SYSTEM')).toBe(false)
	})
})

// VERIFIER and APPROVER are pure sign-off roles (#133): they reach the approvals
// surface and hold only their stage capability — no HR/roster/payroll authority.
describe('sign-off roles', () => {
	it('grant only sign-off + approvals-surface capabilities', () => {
		expect(can('VERIFIER', 'VERIFY_REQUESTS')).toBe(true)
		expect(can('APPROVER', 'APPROVE_SIGNOFF')).toBe(true)
		for (const role of ['VERIFIER', 'APPROVER'] as Role[]) {
			expect(can(role, 'APPROVE_REQUESTS')).toBe(true)
			expect(can(role, 'MANAGE_HR')).toBe(false)
			expect(can(role, 'VIEW_TEAM')).toBe(false)
			expect(can(role, 'MANAGE_PAYROLL')).toBe(false)
			expect(can(role, 'VIEW_PAYROLL_REPORTS')).toBe(false)
		}
	})
})

// Multi-role (#133): capability checks match ANY role the user carries.
describe('multi-role (canAny)', () => {
	it('gives a [MANAGER, VERIFIER] user HR access AND verifier sign-off', () => {
		const roles: Role[] = ['MANAGER', 'VERIFIER']
		// HR-level access from the MANAGER half...
		expect(canAny(roles, 'MANAGE_HR')).toBe(true)
		expect(canAny(roles, 'VIEW_PAYROLL_REPORTS')).toBe(true)
		// ...verifier sign-off from the VERIFIER half.
		expect(canAny(roles, 'VERIFY_REQUESTS')).toBe(true)
		// but never a capability neither role holds.
		expect(canAny(roles, 'MANAGE_USER_ROLES')).toBe(false)
		expect(canAny(roles, 'ADMINISTER_SYSTEM')).toBe(false)
	})

	it('a lone VERIFIER gets no HR access', () => {
		expect(canAny(['VERIFIER'], 'MANAGE_HR')).toBe(false)
		expect(canAny(['VERIFIER'], 'VERIFY_REQUESTS')).toBe(true)
	})

	// The no-op proof for the #256 guard sweep. Converting ~190 route guards from the singular
	// role to the full role set is only safe because every user carries exactly one role today,
	// and on a one-element array `.some()` reduces to the singular check. Exhaustive over the
	// whole domain rather than spot-checked: this is the evidence, so it has to be complete.
	it('is identical to the singular check for every one-element role set', () => {
		const capabilities = Object.keys(CAPABILITIES) as Capability[]
		for (const role of ALL_ROLES) {
			for (const capability of capabilities) {
				expect(canAny([role], capability), `canAny([${role}], ${capability})`).toBe(
					can(role, capability)
				)
			}
		}
	})
})

// #220 statutory-rate access contract, spelled out: CEO/Super-Admin edit + confirm; HR proposes;
// everyone else is locked out of both legs.
describe('statutory rate capabilities (#220)', () => {
	it('lets only CEO and Super Admin edit/confirm directly', () => {
		for (const role of ALL_ROLES) {
			expect(can(role, 'MANAGE_STATUTORY_RATES')).toBe(role === 'CEO' || role === 'SUPER_ADMIN')
		}
	})

	it('lets only HR Admin propose', () => {
		for (const role of ALL_ROLES) {
			expect(can(role, 'PROPOSE_STATUTORY_RATES')).toBe(role === 'HR_ADMIN')
		}
	})

	it('denies both legs to a plain manager and an employee', () => {
		for (const role of ['MANAGER', 'EMPLOYEE'] as Role[]) {
			expect(can(role, 'MANAGE_STATUTORY_RATES')).toBe(false)
			expect(can(role, 'PROPOSE_STATUTORY_RATES')).toBe(false)
		}
	})
})

// #248: CEO, VERIFIER and APPROVER existed in the schema but no role picker offered them, so they
// were assignable only by seeding the database. These pin both assignment lists.
describe('role assignment lists (#248)', () => {
	it('offers every role the schema defines', () => {
		expect([...ASSIGNABLE_ROLES].sort()).toEqual([...ALL_ROLES].sort())
	})

	// Tripwire. A role added to the schema lands here, forcing an explicit decision about whether it
	// may be assigned — the omission #248 fixed went unnoticed for three roles across two releases.
	// If a future role is deliberately NOT assignable, change this assertion and say why.
	it('keeps the picker in step with the Prisma enum', () => {
		expect(Object.values(Role).sort()).toEqual([...ALL_ROLES].sort())
	})

	// The hire form runs under MANAGE_HR, which MANAGER holds — so every role listed there is one a
	// MANAGER can mint outright, bypassing MANAGE_USER_ROLES (CEO-exclusive). It stays a strict
	// subset on purpose; governance, finance and sign-off roles are granted after hire.
	it('keeps privileged roles off the hire form', () => {
		const hire: string[] = [...HIRE_ROLES]
		const assignable: string[] = [...ASSIGNABLE_ROLES]
		expect(hire).toEqual(['EMPLOYEE', 'MANAGER', 'HR_ADMIN'])
		for (const r of hire) expect(assignable).toContain(r)
		for (const r of ['SUPER_ADMIN', 'CEO', 'PAYROLL_OFFICER', 'FINANCE', 'VERIFIER', 'APPROVER']) {
			expect(hire).not.toContain(r)
		}
	})

	// Sanity: every role the hire form can mint holds strictly less than the CEO exclusives.
	it('lets no hire-form role change other users’ roles', () => {
		for (const r of HIRE_ROLES) expect(can(r, 'MANAGE_USER_ROLES')).toBe(false)
	})
})

// #283: the picker renders ROLE_GROUPS, not ASSIGNABLE_ROLES. A role missing from the groups is
// therefore a role the CEO cannot grant — assignable by the server, invisible in the only UI that
// assigns it — and nothing else in the app would notice.
describe('role picker copy (#283)', () => {
	it('groups every assignable role exactly once', () => {
		const grouped = ROLE_GROUPS.flatMap((g) => [...g.roles])
		expect([...grouped].sort()).toEqual([...ASSIGNABLE_ROLES].sort())
		expect(new Set(grouped).size).toBe(grouped.length)
	})

	it('describes every assignable role', () => {
		for (const r of ASSIGNABLE_ROLES) {
			expect(ROLE_DESCRIPTIONS[r], `no description for ${r}`).toBeTruthy()
		}
	})
})

import type { Role } from '@prisma/client'

/**
 * Single source of truth for "which roles may do what".
 *
 * Shared (not `$lib/server`) because the sidebar needs the same answers the server
 * enforces — a nav item that appears for a role the server rejects is its own bug.
 * This module only answers questions; `$lib/server/rbac` wraps it in the throwing
 * `require*` guards. Deciding here and enforcing there keeps one table authoritative.
 */

/**
 * Capability → the roles that hold it.
 *
 * Keyed by capability rather than by role: a capability's holders are what call sites
 * actually ask about, and adding a role then means answering "does it get this?" once
 * per capability instead of hunting every `includes([...])` in the codebase.
 *
 * Membership is listed explicitly even where it mirrors the ladder. For an
 * authorization table, being able to read off exactly who holds a capability beats
 * deriving it — and it means a newly added Role grants nothing until someone decides
 * it should, rather than silently inheriting through a comparison or an `else` branch.
 */
export const CAPABILITIES = {
	/** Org-wide HR administration: rosters, settings, attendance, disbursement reveal. */
	MANAGE_HR: ['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO'],
	/**
	 * HR authority over the WHOLE roster, as opposed to one's own branch and team (#228).
	 *
	 * MANAGE_HR holds MANAGER (#133 made them on-branch HR), and MANAGER also ranks level with
	 * HR_ADMIN — so `requireMinRole('MANAGER')` + `if (!can(role,'MANAGE_HR'))` describes an empty
	 * set, and every object-level check written that way silently never ran. This capability is the
	 * one that actually excludes MANAGER; use it, never MANAGE_HR, to decide "may reach any
	 * employee record" — `assertCanTouchEmployee` is the enforcement point.
	 */
	ADMINISTER_HR_ORGWIDE: ['HR_ADMIN', 'SUPER_ADMIN', 'CEO'],
	/**
	 * HR back-office proper: the whole-org view on the team page, and reading any employee's
	 * 201-file documents.
	 *
	 * Named in #279 to replace two hardcoded `['HR_ADMIN','SUPER_ADMIN'].includes(user.role)` sites
	 * that had no capability to convert to. Deliberately EXCLUDES the CEO, preserving exactly what
	 * those sites allowed — ADMINISTER_HR_ORGWIDE was the near match and would have widened them.
	 * If the CEO should reach these, that is a policy change: grant it here explicitly.
	 */
	ADMINISTER_HR_RECORDS: ['HR_ADMIN', 'SUPER_ADMIN'],
	/** The manager ladder: sees a team, approves timesheets. */
	VIEW_TEAM: ['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO'],
	/**
	 * System administration: payroll config, user provisioning, role activation, the settings
	 * surface. Held by Super Admin and — since #224 — the CEO.
	 *
	 * This used to be the Super Admin's alone, which made it do double duty: it named routine
	 * administration AND stood in for "the operations nobody should be able to undo". Granting
	 * it to the CEO forced those apart; the irreversible half now lives in OVERRIDE_FINALIZED
	 * and is NOT included here.
	 */
	ADMINISTER_SYSTEM: ['SUPER_ADMIN', 'CEO'],
	/**
	 * Overriding a record the system already finalized: voiding a payroll run or period, and
	 * reopening attendance days that were locked. Super Admin only, deliberately (#224).
	 *
	 * This is a NARROWNESS control, not a separation-of-duties one. It does not achieve separation
	 * and never did: SUPER_ADMIN holds MANAGE_PAYROLL and APPROVE_FINANCE below as well as this, so
	 * one Super Admin can already run, approve AND void the same payroll. What the capability buys
	 * is that the irreversible operations were split OUT of ADMINISTER_SYSTEM, so granting the CEO
	 * routine administration in #224 did not hand them these along with it.
	 *
	 * Keep the list as small as these operations are irreversible. Real separation of duties would
	 * need a holder that holds neither MANAGE_PAYROLL nor APPROVE_FINANCE, and belongs with #133's
	 * multi-role work rather than with this list.
	 */
	OVERRIDE_FINALIZED: ['SUPER_ADMIN'],
	/** Changing a user's role — CEO exclusively (#132), across every tenant. */
	MANAGE_USER_ROLES: ['CEO'],
	/** Reaches the approvals surface — HR ladder, Payroll stage owner, and sign-off roles. */
	APPROVE_REQUESTS: [
		'MANAGER',
		'HR_ADMIN',
		'SUPER_ADMIN',
		'PAYROLL_OFFICER',
		'CEO',
		'VERIFIER',
		'APPROVER'
	],
	/** Verifier stage sign-off (#133) — the middle of the maker→verifier→approver chain. */
	VERIFY_REQUESTS: ['VERIFIER'],
	/** Approver stage sign-off (#133) — the final gate of the approval chain. */
	APPROVE_SIGNOFF: ['APPROVER'],
	/**
	 * Final sign-off on anything financial — payroll runs today, and any future
	 * money movement (disbursements, cash advances, loans). The CEO and Super Admin
	 * are the only approvers for finance (#174); the generic APPROVER handles HR
	 * requests (leave, OT) but never signs off money.
	 */
	APPROVE_FINANCE: ['CEO', 'SUPER_ADMIN'],
	/**
	 * Statutory rate tables (#220). Edit directly + confirm/reject proposals — the finance
	 * authority the CEO and Super Admin already hold over payroll money.
	 */
	MANAGE_STATUTORY_RATES: ['CEO', 'SUPER_ADMIN'],
	/** Submit a statutory rate change for CEO approval — HR maintains the tables, CEO signs off. */
	PROPOSE_STATUTORY_RATES: ['HR_ADMIN'],
	/** Runs payroll: periods, runs, loans, cash advances, calculator. */
	MANAGE_PAYROLL: ['MANAGER', 'SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER', 'CEO'],
	/** Reads payroll reports — adds read-only Finance. */
	VIEW_PAYROLL_REPORTS: ['MANAGER', 'SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER', 'FINANCE', 'CEO'],
	/**
	 * Reads ANY employee's payslip, as opposed to one's own team's (#249).
	 *
	 * VIEW_PAYROLL_REPORTS holds MANAGER (#133 made them on-branch HR), so it cannot express "may
	 * read a stranger's compensation" — the same shape ADMINISTER_HR_ORGWIDE exists to fix for
	 * employee records (#228). MANAGER is the only holder of VIEW_PAYROLL_REPORTS missing here, and
	 * is scoped to their reporting line by `canTouchEmployee`.
	 *
	 * Deliberately a SUPERSET of ADMINISTER_HR_ORGWIDE — `canReadPayslip` checks this capability
	 * before delegating, so every org-wide HR holder is admitted before `canTouchEmployee`'s
	 * single-role short-circuit is ever reached. `payslip-access.test.ts` pins that containment.
	 */
	VIEW_PAY_ORGWIDE: ['HR_ADMIN', 'SUPER_ADMIN', 'PAYROLL_OFFICER', 'FINANCE', 'CEO']
} as const satisfies Record<string, readonly Role[]>

export type Capability = keyof typeof CAPABILITIES

export function can(userRole: Role, capability: Capability): boolean {
	return (CAPABILITIES[capability] as readonly Role[]).includes(userRole)
}

/**
 * Multi-role variant (#133): true if ANY of the user's roles holds the capability.
 * Lets a [MANAGER, VERIFIER] user carry both HR authority and verifier sign-off.
 */
export function canAny(userRoles: Role[], capability: Capability): boolean {
	return userRoles.some((r) => can(r, capability))
}

// ─── Role assignment (#248) ───────────────────────────────────────────────────

/**
 * The roles Settings → Roles — and its v1 PATCH twin — may assign.
 *
 * Every value the schema defines. It was six of nine until #248: CEO, VERIFIER and APPROVER
 * existed as roles but no picker offered them, so the approval chain (#134) could not be
 * restaffed and the CEO — sole holder of MANAGE_USER_ROLES, and so the only role that can hand
 * out any role — had no in-app succession. Both were reachable only by seeding the database.
 *
 * Written out rather than derived from the Prisma enum on purpose, for the same reason
 * CAPABILITIES lists its holders longhand: a role added to the schema must be a deliberate
 * decision to hand out, not something that becomes assignable merely by existing.
 */
export const ASSIGNABLE_ROLES = [
	'EMPLOYEE',
	'MANAGER',
	'HR_ADMIN',
	'SUPER_ADMIN',
	'PAYROLL_OFFICER',
	'FINANCE',
	'CEO',
	'VERIFIER',
	'APPROVER'
] as const satisfies readonly Role[]

/**
 * The roles the hire form (/employees/new) may create — deliberately a strict subset (#248).
 *
 * That form is gated on MANAGE_HR, which MANAGER holds. Every role listed here is therefore one
 * a MANAGER can mint outright, as a brand-new account, with no CEO involved — bypassing
 * MANAGE_USER_ROLES entirely. So governance (CEO, SUPER_ADMIN), finance (PAYROLL_OFFICER,
 * FINANCE) and sign-off (VERIFIER, APPROVER) stay off it: those are granted after hire, in
 * Settings → Roles, which only the CEO can reach.
 */
/**
 * Display names for roles. `capitalize` on a lower-cased enum gets "Hr Admin" and "Ceo" wrong, and
 * every surface that shows a role needs the same answer, so the mapping lives here rather than
 * being re-derived per component.
 *
 * NOTE: `(app)/+layout.svelte:299` and `(app)/requests/approvals/+page.svelte:79` each still carry
 * their own copy, predating this one. Fold them in next time either is touched.
 */
export const ROLE_LABELS: Record<Role, string> = {
	EMPLOYEE: 'Employee',
	MANAGER: 'Manager',
	HR_ADMIN: 'HR Admin',
	SUPER_ADMIN: 'Super Admin',
	PAYROLL_OFFICER: 'Payroll Officer',
	FINANCE: 'Finance',
	CEO: 'CEO',
	VERIFIER: 'Verifier',
	APPROVER: 'Approver'
}

export const HIRE_ROLES = ['EMPLOYEE', 'MANAGER', 'HR_ADMIN'] as const satisfies readonly Role[]

/**
 * One line per role, for the role picker (#283).
 *
 * These describe what the CAPABILITIES table above ACTUALLY grants — not an aspirational job
 * description. Each line was read off that table: "the only role that can void a finalised
 * payroll run" is OVERRIDE_FINALIZED, "the only role that can assign roles" is
 * MANAGE_USER_ROLES, and MANAGER's "cannot reach a stranger's record or pay" is the
 * ADMINISTER_HR_ORGWIDE / VIEW_PAY_ORGWIDE exclusion.
 *
 * So when a role's membership in CAPABILITIES changes, revisit its line here in the SAME
 * change. Otherwise the picker keeps teaching a rule the server no longer enforces, which is
 * worse than saying nothing — the CEO picks a role on the strength of this copy.
 */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
	EMPLOYEE:
		'Self-service only — own profile, requests, timesheets and payslips. Holds no authority over anyone else.',
	MANAGER:
		"Their own team and branch: approves timesheets and requests, runs payroll, sees the team. Cannot reach a stranger's record or pay.",
	HR_ADMIN:
		"HR back office, org-wide: any employee's 201 file and pay, approvals, payroll operations, and proposing statutory rate changes for the CEO to confirm.",
	SUPER_ADMIN:
		'System administration and payroll config. The only role that can void a finalised payroll run or reopen a locked attendance day. Cannot assign roles.',
	PAYROLL_OFFICER:
		"Runs payroll and reads any employee's pay. Reaches the approvals queue but signs off nothing itself.",
	FINANCE: "Read-only on money — payroll reports and any employee's payslip. Changes nothing.",
	CEO: 'Full authority, and the only role that can assign roles. Signs off finance and confirms statutory rate changes. Cannot void a finalised payroll run.',
	VERIFIER:
		'Verifier stage sign-off — the middle of the maker → verifier → approver chain. No other authority.',
	APPROVER:
		'Approver stage sign-off — the final gate of the request chain. Signs off HR requests, never money.'
}

/**
 * How the picker groups the roles — by what a role is FOR, so choosing a set reads as five
 * short decisions instead of one list of nine.
 *
 * Lives next to ROLE_DESCRIPTIONS because the two are one editorial unit: a role added to
 * ASSIGNABLE_ROLES needs a line AND a home, and a role with neither is one the picker never
 * offers. `rbac.test.ts` pins that this covers ASSIGNABLE_ROLES exactly, once each.
 */
export const ROLE_GROUPS = [
	{ label: 'Baseline', roles: ['EMPLOYEE'] },
	{ label: 'HR & operations', roles: ['MANAGER', 'HR_ADMIN'] },
	{ label: 'Finance', roles: ['PAYROLL_OFFICER', 'FINANCE'] },
	{ label: 'Sign-off', roles: ['VERIFIER', 'APPROVER'] },
	{ label: 'Administration', roles: ['SUPER_ADMIN', 'CEO'] }
] as const satisfies readonly { label: string; roles: readonly Role[] }[]

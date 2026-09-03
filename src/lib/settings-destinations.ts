import type { Role } from '@prisma/client'
import { canAny, type Capability } from '$lib/rbac'

/**
 * Single source of truth for the settings destinations (#T6).
 *
 * Three surfaces used to hold three hand-maintained lists — the hub cards, the sidebar's
 * Settings children, and the pages' own headings — so one destination carried up to three
 * names. They all read this array now: one entry per destination, one canonical `label`,
 * and one capability rule. Adding a settings page is adding one entry here.
 *
 * `capabilities` is OR-combined. An empty list means the destination needs nothing beyond
 * the MANAGE_HR guard the /settings route and the sidebar's Settings group already apply —
 * do not read it as "visible to everyone".
 */

export type SettingsGroup =
	'Organization' | 'Time & Attendance' | 'Payroll' | 'Hiring & Separation' | 'System'

export interface SettingsDestination {
	href: string
	/** The ONE canonical name for this destination, on every surface. */
	label: string
	/** Hub card subtitle. */
	desc: string
	group: SettingsGroup
	/** OR-combined; empty = the surface's own MANAGE_HR guard suffices. */
	capabilities: Capability[]
	/** Whether the sidebar's Settings group carries this row (curated subset, OD-2). */
	inSidebar: boolean
}

export const SETTINGS_GROUP_ORDER: SettingsGroup[] = [
	'Organization',
	'Time & Attendance',
	'Payroll',
	'Hiring & Separation',
	'System'
]

export const SETTINGS_DESTINATIONS: SettingsDestination[] = [
	{
		href: '/settings/company',
		label: 'Company Information',
		desc: 'Name, address, logo',
		group: 'Organization',
		capabilities: [],
		inSidebar: true
	},
	{
		href: '/settings/org',
		label: 'Org Structure',
		desc: 'Departments & positions',
		group: 'Organization',
		capabilities: [],
		inSidebar: true
	},
	{
		href: '/settings/org-chart',
		label: 'Org Chart',
		desc: 'Reporting hierarchy',
		group: 'Organization',
		capabilities: [],
		inSidebar: false
	},
	{
		href: '/settings/roles',
		label: 'Roles & Access',
		desc: 'User role management',
		group: 'Organization',
		// The Roles page opens for the role-changer (#132) and the account-status admin, so this
		// entry evaluates that same OR rather than piggybacking on ADMINISTER_SYSTEM. A no-op while
		// MANAGE_USER_ROLES is CEO-only, but widening it can no longer leave the card behind (#237).
		//
		// #258: both legs read the full role set, matching `settings/roles`'s own `canManageActive`
		// guard — the card and the page it opens must agree or one 403s the other's callers.
		capabilities: ['MANAGE_USER_ROLES', 'ADMINISTER_SYSTEM'],
		inSidebar: true
	},
	{
		href: '/settings/schedules',
		label: 'Work Schedules',
		desc: 'Shift templates',
		group: 'Time & Attendance',
		capabilities: [],
		inSidebar: true
	},
	{
		href: '/settings/holidays',
		label: 'Holiday Calendar',
		desc: 'Regular & special holidays',
		group: 'Time & Attendance',
		capabilities: [],
		inSidebar: true
	},
	{
		href: '/settings/leave-types',
		label: 'Leave Types',
		desc: 'Paid/unpaid, allocation, carry-over',
		group: 'Time & Attendance',
		capabilities: [],
		inSidebar: false
	},
	{
		href: '/payroll/config',
		label: 'Payroll Config',
		desc: 'Cutoffs, frequency, premium multipliers',
		group: 'Payroll',
		capabilities: ['ADMINISTER_SYSTEM'],
		inSidebar: false
	},
	{
		href: '/payroll/statutory-rates',
		label: 'Statutory Rates',
		desc: 'SSS, PhilHealth, Pag-IBIG, BIR tax',
		group: 'Payroll',
		// Statutory Rates page is reachable by editors (CEO/Super Admin) and proposers (HR Admin).
		capabilities: ['MANAGE_STATUTORY_RATES', 'PROPOSE_STATUTORY_RATES'],
		inSidebar: false
	},
	{
		href: '/settings/pay-codes',
		label: 'Earnings & Deductions',
		desc: 'Payroll codes',
		group: 'Payroll',
		capabilities: [],
		inSidebar: true
	},
	{
		href: '/settings/salary-grades',
		label: 'Salary Grades',
		desc: 'Pay bands per position',
		group: 'Payroll',
		capabilities: [],
		inSidebar: true
	},
	{
		href: '/settings/onboarding',
		label: 'Onboarding Checklist',
		desc: 'Derived & manual 201-file steps',
		group: 'Hiring & Separation',
		capabilities: [],
		inSidebar: false
	},
	{
		href: '/settings/offboarding',
		label: 'Offboarding Checklist',
		desc: 'Clearance steps for separations',
		group: 'Hiring & Separation',
		capabilities: [],
		inSidebar: false
	},
	{
		href: '/settings/posting-approvers',
		label: 'Posting Approvers',
		desc: 'Who approves each department’s job postings',
		group: 'Hiring & Separation',
		capabilities: [],
		inSidebar: false
	},
	{
		href: '/settings/job-boards',
		label: 'Job Boards',
		desc: 'Where postings can be published',
		group: 'Hiring & Separation',
		capabilities: [],
		inSidebar: false
	},
	{
		href: '/settings/performance',
		label: 'Review Schedule',
		desc: 'How often reviews open, and time to complete',
		group: 'System',
		// Review Schedule is ADMINISTER_HR_ORGWIDE, strictly narrower than the MANAGE_HR guard on
		// the settings surface: MANAGE_HR includes MANAGER (#133), that capability does not. Gating
		// this on anything wider would show MANAGER a link that 403s (#178).
		capabilities: ['ADMINISTER_HR_ORGWIDE'],
		inSidebar: false
	},
	{
		href: '/settings/backup',
		label: 'Document Backup',
		desc: 'Automatic 201-file and attachment backups',
		group: 'System',
		capabilities: ['ADMINISTER_SYSTEM'],
		inSidebar: false
	}
]

/** Destinations the given roles may reach, in array order. Empty `capabilities` = always shown. */
export function visibleSettings(roles: Role[]): SettingsDestination[] {
	return SETTINGS_DESTINATIONS.filter(
		(d) => d.capabilities.length === 0 || d.capabilities.some((c) => canAny(roles, c))
	)
}

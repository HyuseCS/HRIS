import type { Role } from '@prisma/client'
import { canAny } from '$lib/rbac'

/**
 * The sidebar's information architecture, as data.
 *
 * Lives outside `(app)/+layout.svelte` so the nav/guard parity invariant — a nav item shown to
 * a role the server would reject is its own bug — is unit-testable instead of only observable
 * by logging in as nine roles. `NavContext` carries plain values only (no store, no `$page`),
 * which is what keeps this module pure.
 */

export type NavItem = {
	href: string
	label: string
	show: boolean
	icon?: string
	badge?: number
	/** Renders as an indented row under the item above it, with no icon. */
	child?: boolean
	/** Only `/requests` has these: the Approvals collapsible group renders from them. */
	children?: NavItem[]
}

export type NavSection = {
	label: string
	items: NavItem[]
}

export type NavContext = {
	roles: Role[]
	hasBranches: boolean
	pendingApprovals: {
		timesheets: number
		requests: number
		proposals: number
		payrollRuns: number
		total: number
	}
	waitingInquiries: number
}

const ICONS = {
	punch:
		'M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 013.15 0V15M6.9 7.575a1.575 1.575 0 10-3.15 0v8.175a6.75 6.75 0 006.75 6.75h2.018a5.25 5.25 0 003.712-1.538l1.732-1.732a5.25 5.25 0 001.538-3.712l.003-2.024a.668.668 0 01.198-.471 1.575 1.575 0 10-2.228-2.228 3.818 3.818 0 00-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0116.35 15',
	dashboard:
		'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
	/** The clipboard. Kept by `My Requests` alone — Approvals moved to the inbox glyph below. */
	requests:
		'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
	payslips:
		'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
	inquiries:
		'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
	profile:
		'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
	timesheets: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
	attendance: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
	leave:
		'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
	team: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
	employees:
		'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
	departments:
		'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
	recruitment:
		'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z',
	separations:
		'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
	benefits:
		'M9 12.75l2.25 2.25 4.5-4.5m3.75 2.25c0 5.592-3.824 10.29-9 11.622C6.324 22.29 2.5 17.592 2.5 12V6.75c0-.621.504-1.125 1.125-1.125A9.735 9.735 0 0012 3.286a9.735 9.735 0 008.375 2.339c.621 0 1.125.504 1.125 1.125V12z',
	payroll:
		'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
	reports:
		'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
	performance:
		'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
	stores:
		'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72M6.75 18h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .414.336.75.75.75z',
	inventory:
		'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
}

/** The Approvals group's own glyph — an inbox, so it no longer shares the clipboard. */
export const APPROVALS_ICON =
	'M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z'

function section(label: string, items: NavItem[]): NavSection {
	return { label, items: items.filter((i) => i.show) }
}

export function buildNavSections(ctx: NavContext): NavSection[] {
	const { roles, hasBranches, pendingApprovals } = ctx

	// Same capability table the server enforces with ($lib/rbac) — a nav item shown to
	// a role the server would reject is its own bug, so both read one source of truth.
	// Nav uses the full role set (#133) so a multi-role user sees every entry they hold.
	const isManager = canAny(roles, 'VIEW_TEAM')
	const isAdmin = canAny(roles, 'MANAGE_HR')
	// Payroll Officer manages payroll; Finance reads payroll reports only.
	const isPayroll = canAny(roles, 'MANAGE_PAYROLL')
	const canViewReports = canAny(roles, 'VIEW_PAYROLL_REPORTS')
	// Sign-off roles reach Payroll read-only to verify/approve runs (#134). Payroll is
	// finance, so the approver is the CEO / Super Admin, not the generic Approver (#174).
	const canSignOff = canAny(roles, 'VERIFY_REQUESTS') || canAny(roles, 'APPROVE_FINANCE')
	// Approvers (manager ladder + Payroll Officer + sign-off roles) get the dropdown.
	const canApprove = canAny(roles, 'APPROVE_REQUESTS')
	// Pay-change confirmers (#224 Part 2 / #243) — the same two capabilities the route gates on,
	// so a nav row is never shown to someone the server would redirect away.
	const canConfirmPayChanges =
		canAny(roles, 'ADMINISTER_HR_ORGWIDE') || canAny(roles, 'APPROVE_FINANCE')

	const approvalsChildren: NavItem[] = [
		{ href: '/requests', label: 'My Requests', show: true, badge: 0 },
		{
			href: '/requests/timesheets',
			label: 'Approve timesheets',
			show: isManager,
			badge: pendingApprovals.timesheets
		},
		{
			href: '/requests/approvals',
			label: 'Approve requests',
			show: canApprove,
			badge: pendingApprovals.requests
		},
		{
			// Pay changes needing a second qualified person (#224 Part 2 / #243). Capability-keyed,
			// never a rank floor — MANAGER ranks level with HR_ADMIN and must not reach this queue.
			href: '/requests/proposals',
			label: 'Pay changes',
			show: canConfirmPayChanges,
			badge: pendingApprovals.proposals
		},
		{
			// Sign-off roles reach payroll runs to verify/approve here (#134); payroll managers
			// already have the top-level Payroll row in the Pay section.
			href: '/payroll',
			label: 'Payroll runs',
			show: canSignOff,
			badge: pendingApprovals.payrollRuns
		}
	].filter((i) => i.show)

	return [
		section('My Work', [
			{
				// #177 — the web punch surface exists for the food-service tenants only. Cosmetic,
				// exactly like Stores below: `requireFoodServiceOrg` in the route's load AND its
				// action is the enforcement.
				//
				// First in the list: for crew staff punching is the ONLY page they use.
				href: '/punch',
				label: 'Punch',
				show: hasBranches,
				icon: ICONS.punch
			},
			{ href: '/dashboard', label: 'Dashboard', show: true, icon: ICONS.dashboard },
			{
				// ALWAYS present, approver or not: for an approver the layout renders this entry as
				// the Approvals collapsible group, so filtering it out would delete the group.
				href: '/requests',
				label: 'My Requests',
				show: true,
				icon: ICONS.requests,
				children: canApprove ? approvalsChildren : []
			},
			{ href: '/payslips', label: 'Payslips', show: true, icon: ICONS.payslips },
			{
				href: '/complaints',
				label: 'Inquiries',
				show: true,
				// A count, not a dot: server-scoped to the same visible-employee set as the list it
				// links to, so the number can never promise a thread the page then 403s.
				badge: ctx.waitingInquiries,
				icon: ICONS.inquiries
			},
			{ href: '/profile', label: 'Profile', show: true, icon: ICONS.profile }
		]),
		section('Time', [
			{ href: '/timesheets', label: 'Timesheets', show: true, icon: ICONS.timesheets },
			{ href: '/attendance', label: 'Attendance', show: true, icon: ICONS.attendance },
			{ href: '/leave', label: 'Leave', show: true, icon: ICONS.leave }
		]),
		section('People', [
			{
				// Food-service tenants organise staff by branch, so the roster reads "Branches"
				// there; the store registry below is relabelled "Stores" to avoid the clash (#182).
				href: '/team',
				label: hasBranches ? 'Branches' : 'Team',
				show: isManager,
				icon: ICONS.team
			},
			{ href: '/employees', label: 'Employees', show: isAdmin, icon: ICONS.employees },
			{ href: '/departments', label: 'Departments', show: isAdmin, icon: ICONS.departments },
			{ href: '/recruitment', label: 'Recruitment', show: isAdmin, icon: ICONS.recruitment },
			{ href: '/separations', label: 'Separations', show: isAdmin, icon: ICONS.separations },
			{ href: '/benefits', label: 'Benefits', show: isAdmin, icon: ICONS.benefits }
		]),
		section('Pay', [
			{
				// `isPayroll` only: a sign-off-only role reaches payroll runs through the
				// "Payroll runs" row inside Approvals, so this row would be a duplicate for them.
				href: '/payroll',
				label: 'Payroll',
				show: isPayroll,
				icon: ICONS.payroll
			},
			{ href: '/reports', label: 'Reports', show: canViewReports, icon: ICONS.reports },
			{
				// Otherwise unreachable from the UI. Same MANAGE_HR gate the route itself uses
				// (reports/audit-log/+page.server.ts) — the nav must mirror the load guard.
				href: '/reports/audit-log',
				label: 'Audit Log',
				show: isAdmin,
				child: true
			}
		]),
		section('Performance', [
			{ href: '/performance', label: 'Performance', show: true, icon: ICONS.performance },
			{
				// The evaluation-form builder (#178). Org-wide configuration, so ADMINISTER_HR_ORGWIDE
				// and not MANAGE_HR — MANAGE_HR includes MANAGER (#133), and the route's load guards on
				// the same capability, so this row is never shown to someone the server would 403.
				href: '/performance/templates',
				label: 'Eval Templates',
				show: canAny(roles, 'ADMINISTER_HR_ORGWIDE'),
				child: true
			}
		]),
		section('Organization', [
			{
				// The physical-store registry. Called "Stores" so it doesn't collide with the
				// roster tab, which reads "Branches" in these same food-service tenants (#182).
				href: '/branches',
				label: 'Stores',
				show: isAdmin && hasBranches,
				icon: ICONS.stores
			},
			{ href: '/inventory', label: 'Inventory', show: isAdmin, icon: ICONS.inventory }
		])
	].filter((s) => s.items.length > 0)
}

/**
 * Longest-prefix-wins active matching.
 *
 * Replaces the hand-maintained exception list the layout used to carry: `/performance` no longer
 * lights up on `/performance/templates`, and a new nested route needs no new exception.
 */
export function isNavItemActive(pathname: string, href: string, allHrefs: string[]): boolean {
	const matches = (h: string) => pathname === h || pathname.startsWith(h + '/')
	if (!matches(href)) return false
	return !allHrefs.some((other) => other.length > href.length && matches(other))
}

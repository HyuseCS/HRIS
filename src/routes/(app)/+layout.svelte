<script lang="ts">
	import { page } from '$app/stores'
	import { browser } from '$app/environment'
	import { invalidateAll } from '$app/navigation'
	import Toaster from '$lib/components/ui/Toaster.svelte'
	import DevLoginSwitcher from '$lib/components/dev/DevLoginSwitcher.svelte' // TEMP DEV — remove before merge
	import { addToast } from '$lib/stores/toast.svelte'
	import { canAny } from '$lib/rbac'
	import { isFoodServiceOrg } from '$lib/orgs'
	import type { LayoutData } from './$types'

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

	// Company switcher (#131) — only cross-org members see it. The active org comes
	// from data.user.organizationId, which the server resolves from the session.
	const memberOrgs = $derived(data.memberOrgs ?? [])
	const showOrgSwitcher = $derived(memberOrgs.length > 1)
	const currentOrg = $derived(memberOrgs.find((o) => o.id === data.user.organizationId))

	// App-wide branding (#139): header logo follows the active org, falling back to
	// the default asset when the tenant has no logoUrl set.
	const orgLogo = $derived(data.org?.logoUrl || '/veent-logo.png')
	const orgName = $derived(data.org?.name || 'Veent HRIS')
	// The Veent logo already carries the "Veent HRIS" wordmark; JoJo Potato and Sweetleaf
	// use brand marks without it, so show a "{name} HRIS" wordmark beside their logo.
	const showWordmark = $derived(isFoodServiceOrg(data.org?.id))
	// Branches are the food-service tenants' physical stores, so the tab only exists for
	// them. `data.org.id` is the ACTIVE org, so switching the CEO into JoJo reveals it with
	// no CEO-specific code. The server guard (requireFoodServiceOrg) is the real enforcement.
	const hasBranches = $derived(isFoodServiceOrg(data.org?.id))
	// Per-org theme (#139): override the brand CSS variables for the active tenant. The
	// value is a raw HSL triple; descendants' `bg-primary`/`ring` pick up the cascade.
	const themeStyle = $derived(
		data.org?.themePrimary
			? `--primary: ${data.org.themePrimary}; --ring: ${data.org.themePrimary}`
			: undefined
	)
	let orgMenuOpen = $state(false)
	let switchingOrg = $state(false)

	async function switchOrg(organizationId: string) {
		if (switchingOrg || organizationId === data.user.organizationId) {
			orgMenuOpen = false
			return
		}
		switchingOrg = true
		try {
			const res = await fetch('/api/v1/session/switch-org', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ organizationId })
			})
			if (!res.ok) {
				addToast('Could not switch organization.')
				return
			}
			orgMenuOpen = false
			await invalidateAll()
		} finally {
			switchingOrg = false
		}
	}

	let isDark = $state(browser ? localStorage.getItem('theme') !== 'light' : true)

	function toggleTheme() {
		isDark = !isDark
	}

	$effect(() => {
		const theme = isDark ? 'dark' : 'light'
		document.documentElement.className = theme
		localStorage.setItem('theme', theme)
	})

	// Surface unread notifications as toasts, then mark them read so they don't repeat.
	const seenNotifications = new Set<string>()
	$effect(() => {
		if (!browser) return
		const fresh = data.notifications.filter((n) => !seenNotifications.has(n.id))
		if (fresh.length === 0) return
		for (const n of fresh) {
			seenNotifications.add(n.id)
			addToast(n.message, { link: n.link })
		}
		fetch('/api/v1/notifications/read', { method: 'POST' })
	})

	// Same capability table the server enforces with ($lib/rbac) — a nav item shown to
	// a role the server would reject is its own bug, so both read one source of truth.
	// Nav uses the full role set (#133) so a multi-role user sees every entry they hold.
	const roles = $derived(data.user.roles)
	const isManager = $derived(canAny(roles, 'VIEW_TEAM'))
	const isAdmin = $derived(canAny(roles, 'MANAGE_HR'))
	const isSuperAdmin = $derived(canAny(roles, 'ADMINISTER_SYSTEM'))
	// Role assignment is CEO-only (#132); the Roles page also hosts Super Admin's
	// account-status controls, so it shows for either capability.
	const canManageUserRoles = $derived(canAny(roles, 'MANAGE_USER_ROLES'))
	// Payroll Officer manages payroll; Finance reads payroll reports only.
	const isPayroll = $derived(canAny(roles, 'MANAGE_PAYROLL'))
	const canViewReports = $derived(canAny(roles, 'VIEW_PAYROLL_REPORTS'))
	// Sign-off roles reach Payroll read-only to verify/approve runs (#134). Payroll is
	// finance, so the approver is the CEO / Super Admin, not the generic Approver (#174).
	const canSignOff = $derived(canAny(roles, 'VERIFY_REQUESTS') || canAny(roles, 'APPROVE_FINANCE'))
	// Approvers (manager ladder + Payroll Officer + sign-off roles) get the dropdown.
	const canApprove = $derived(canAny(roles, 'APPROVE_REQUESTS'))
	// Pay-change confirmers (#224 Part 2 / #243) — the same two capabilities the route gates on,
	// so a nav row is never shown to someone the server would redirect away.
	const canConfirmPayChanges = $derived(
		canAny(roles, 'ADMINISTER_HR_ORGWIDE') || canAny(roles, 'APPROVE_FINANCE')
	)

	const navItems = $derived(
		[
			{
				href: '/punch',
				// #177 — the web punch surface exists for the food-service tenants only. Cosmetic,
				// exactly like Branches below: `requireFoodServiceOrg` in the route's load AND its
				// action is the enforcement.
				//
				// First in the list, not fifth: for crew staff punching is the ONLY page they use,
				// and it was previously below three pages they have no business on. `.filter` drops
				// it entirely for a non-food-service tenant, so the reorder costs everyone else
				// nothing.
				label: 'Punch',
				show: hasBranches,
				icon: 'M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 013.15 0V15M6.9 7.575a1.575 1.575 0 10-3.15 0v8.175a6.75 6.75 0 006.75 6.75h2.018a5.25 5.25 0 003.712-1.538l1.732-1.732a5.25 5.25 0 001.538-3.712l.003-2.024a.668.668 0 01.198-.471 1.575 1.575 0 10-2.228-2.228 3.818 3.818 0 00-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0116.35 15'
			},
			{
				href: '/dashboard',
				label: 'Dashboard',
				show: true,
				icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z'
			},
			{
				href: '/timesheets',
				label: 'Timesheets',
				show: true,
				icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'
			},
			{
				href: '/attendance',
				label: 'Attendance',
				show: true,
				icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
			},
			{
				href: '/leave',
				label: 'Leave',
				show: true,
				icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5'
			},
			{
				href: '/requests',
				label: 'My Requests',
				show: true,
				icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z'
			},
			{
				href: '/payslips',
				label: 'Payslips',
				show: true,
				icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
			},
			{
				href: '/profile',
				label: 'Profile',
				show: true,
				icon: 'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z'
			},
			{
				href: '/performance',
				label: 'Performance',
				show: true,
				icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941'
			},
			{
				// The evaluation-form builder (#178). Org-wide configuration, so ADMINISTER_HR_ORGWIDE
				// and not MANAGE_HR — MANAGE_HR includes MANAGER (#133), and the route's load guards on
				// the same capability, so this row is never shown to someone the server would 403.
				href: '/performance/templates',
				label: 'Eval Templates',
				show: canAny(roles, 'ADMINISTER_HR_ORGWIDE'),
				icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z'
			},
			{
				href: '/complaints',
				label: 'Inquiries',
				show: true,
				// A count, not a dot: the dot on Requests/Approvals means "something is hidden inside
				// this collapsed group", and nothing is hidden behind a flat item. Server-scoped to
				// the same visible-employee set as the list it links to, so the number can never
				// promise a thread the page then 403s.
				badge: data.waitingInquiries,
				icon: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z'
			},
			{
				href: '/team',
				// Food-service tenants organise staff by branch, so the roster reads "Branches"
				// there; the store registry below is relabelled "Stores" to avoid the clash (#182).
				label: hasBranches ? 'Branches' : 'Team',
				show: isManager,
				icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z'
			},
			{
				href: '/employees',
				label: 'Employees',
				show: isAdmin,
				icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z'
			},
			{
				href: '/departments',
				label: 'Departments',
				show: isAdmin,
				icon: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21'
			},
			{
				href: '/branches',
				// The physical-store registry. Called "Stores" so it doesn't collide with the
				// roster tab, which reads "Branches" in these same food-service tenants (#182).
				label: 'Stores',
				show: isAdmin && hasBranches,
				icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72M6.75 18h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .414.336.75.75.75z'
			},
			{
				href: '/payroll',
				label: 'Payroll',
				show: isPayroll || canSignOff,
				icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z'
			},
			{
				href: '/separations',
				label: 'Separations',
				show: isAdmin,
				icon: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75'
			},
			{
				href: '/recruitment',
				label: 'Recruitment',
				show: isAdmin,
				icon: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z'
			},
			{
				href: '/reports',
				label: 'Reports',
				show: canViewReports,
				icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z'
			},
			{
				href: '/benefits',
				label: 'Benefits',
				show: isAdmin,
				icon: 'M9 12.75l2.25 2.25 4.5-4.5m3.75 2.25c0 5.592-3.824 10.29-9 11.622C6.324 22.29 2.5 17.592 2.5 12V6.75c0-.621.504-1.125 1.125-1.125A9.735 9.735 0 0012 3.286a9.735 9.735 0 008.375 2.339c.621 0 1.125.504 1.125 1.125V12z'
			},
			{
				href: '/inventory',
				label: 'Inventory',
				show: isAdmin,
				icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
			}
		].filter((i) => i.show)
	)

	// Settings is a collapsible group; its pages live in this dropdown, not the flat nav.
	const settingsChildren = $derived(
		[
			// The group header is a toggle, not a link, so without this the settings index
			// (which lists every card, including pages absent from this list) is unreachable.
			{ href: '/settings', label: 'All settings', show: isAdmin },
			{ href: '/settings/company', label: 'Company', show: isAdmin },
			{ href: '/settings/pay-codes', label: 'Earnings & Deductions', show: isAdmin },
			{ href: '/settings/salary-grades', label: 'Salary Grades', show: isAdmin },
			{ href: '/settings/org', label: 'Org Structure', show: isAdmin },
			{ href: '/settings/schedules', label: 'Schedules', show: isAdmin },
			{ href: '/settings/roles', label: 'Roles', show: isSuperAdmin || canManageUserRoles },
			{ href: '/settings/holidays', label: 'Holidays', show: isAdmin }
		].filter((i) => i.show)
	)

	const settingsIcon =
		'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z'

	const showSettings = $derived(isAdmin && settingsChildren.length > 0)
	const inSettings = $derived($page.url.pathname.startsWith('/settings'))
	// null = follow default (open while on a settings page); once clicked, the user's
	// explicit choice wins so the group can be collapsed even inside /settings.
	let settingsToggled = $state<boolean | null>(null)
	const settingsExpanded = $derived(settingsToggled ?? inSettings)

	// Requests/Approvals is a collapsible group for approvers (like Settings). Non-approvers
	// see a flat "My Requests" link instead (rendered in the nav loop).
	const requestsIcon =
		'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z'
	const requestsChildren = $derived(
		[
			{ href: '/requests', label: 'My Requests', show: true, badge: 0 },
			{
				href: '/requests/timesheets',
				label: 'Timesheets',
				show: isManager,
				badge: data.pendingApprovals.timesheets
			},
			{
				href: '/requests/approvals',
				label: 'Requests',
				show: canApprove,
				badge: data.pendingApprovals.requests
			},
			{
				// Pay changes needing a second qualified person (#224 Part 2 / #243). Capability-keyed,
				// never a rank floor — MANAGER ranks level with HR_ADMIN and must not reach this queue.
				href: '/requests/proposals',
				label: 'Pay changes',
				show: canConfirmPayChanges,
				badge: data.pendingApprovals.proposals
			},
			{
				// Sign-off roles reach payroll runs to verify/approve here (#134); managers
				// already have the top-level Payroll nav, so this row is sign-off-only.
				href: '/payroll',
				label: 'Payroll runs',
				show: canSignOff,
				badge: data.pendingApprovals.payrollRuns
			}
		].filter((i) => i.show)
	)
	// Reports has one child that is otherwise unreachable from the UI. Same MANAGE_HR gate the
	// route itself uses (reports/audit-log/+page.server.ts) — the nav must mirror the load guard.
	const reportsChildren = $derived(
		[{ href: '/reports/audit-log', label: 'Audit Log', show: isAdmin }].filter((i) => i.show)
	)
	const inRequests = $derived(
		$page.url.pathname === '/requests' || $page.url.pathname.startsWith('/requests/')
	)
	let requestsToggled = $state<boolean | null>(null)
	const requestsExpanded = $derived(requestsToggled ?? inRequests)

	const roleLabel: Record<string, string> = {
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

	// Mobile sidebar drawer. Close it whenever the route changes.
	let sidebarOpen = $state(false)
	$effect(() => {
		void $page.url.pathname
		sidebarOpen = false
	})
</script>

<Toaster />
<DevLoginSwitcher />

<div class="flex min-h-screen bg-background" style={themeStyle}>
	<!-- Mobile top bar (hamburger) — hidden on lg+ -->
	<header
		class="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4 lg:hidden"
	>
		<button
			type="button"
			onclick={() => (sidebarOpen = true)}
			aria-label="Open menu"
			class="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
				/>
			</svg>
		</button>
		<a href="/dashboard" class="flex items-center gap-2">
			<img src={orgLogo} alt={orgName} class="h-8 w-auto" />
			{#if showWordmark}
				<span class="text-sm font-semibold whitespace-nowrap"
					>{orgName} <span class="font-normal text-muted-foreground">HRIS</span></span
				>
			{/if}
		</a>
	</header>

	<!-- Mobile drawer backdrop -->
	{#if sidebarOpen}
		<button
			type="button"
			onclick={() => (sidebarOpen = false)}
			aria-label="Close menu"
			class="fixed inset-0 z-40 bg-black/50 lg:hidden"
		></button>
	{/if}

	<!-- Sidebar (persistent on lg+, slide-in drawer below lg) -->
	<aside
		class="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card transition-transform duration-200 lg:translate-x-0 {sidebarOpen
			? 'translate-x-0'
			: '-translate-x-full'}"
	>
		<!-- Logo -->
		<div class="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
			<a href="/dashboard" class="flex items-center gap-2">
				<img src={orgLogo} alt={orgName} class="h-9 w-auto" />
				{#if showWordmark}
					<span class="text-sm font-semibold whitespace-nowrap"
						>{orgName} <span class="font-normal text-muted-foreground">HRIS</span></span
					>
				{/if}
			</a>
			<button
				type="button"
				onclick={() => (sidebarOpen = false)}
				aria-label="Close menu"
				class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Company switcher (cross-org members only) -->
		{#if showOrgSwitcher}
			<div class="relative shrink-0 border-b border-border px-3 py-2">
				<button
					type="button"
					onclick={() => (orgMenuOpen = !orgMenuOpen)}
					aria-expanded={orgMenuOpen}
					disabled={switchingOrg}
					class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 shrink-0 text-muted-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.75"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
						/>
					</svg>
					<span class="flex-1 truncate text-left">{currentOrg?.name ?? 'Select org'}</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform {orgMenuOpen
							? 'rotate-180'
							: ''}"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</button>
				{#if orgMenuOpen}
					<div
						class="absolute inset-x-3 top-full z-10 mt-1 overflow-hidden rounded-md border border-border bg-card shadow-lg"
					>
						{#each memberOrgs as org (org.id)}
							{@const active = org.id === data.user.organizationId}
							<button
								type="button"
								onclick={() => switchOrg(org.id)}
								class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors
									{active
									? 'bg-primary/15 font-medium text-primary'
									: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
							>
								<span class="flex-1 truncate text-left">{org.name}</span>
								{#if active}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4 shrink-0"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M4.5 12.75l6 6 9-13.5"
										/>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Nav -->
		<nav class="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
			{#each navItems as item (item.href)}
				{#if item.href === '/requests' && canApprove}
					<!-- Requests/Approvals collapsible group (approvers) -->
					<div>
						<button
							type="button"
							onclick={() => (requestsToggled = !requestsExpanded)}
							aria-expanded={requestsExpanded}
							class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
								{inRequests
								? 'bg-primary/15 text-primary'
								: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 shrink-0"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.75"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d={requestsIcon} />
							</svg>
							<span class="flex-1 text-left">Requests/Approvals</span>
							{#if data.pendingApprovals.total > 0 && !requestsExpanded}
								<span
									class="h-2 w-2 shrink-0 rounded-full bg-red-500"
									title="{data.pendingApprovals.total} awaiting your decision"
								></span>
							{/if}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-3.5 w-3.5 shrink-0 transition-transform {requestsExpanded
									? 'rotate-180'
									: ''}"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19.5 8.25l-7.5 7.5-7.5-7.5"
								/>
							</svg>
						</button>
						{#if requestsExpanded}
							<div class="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-4">
								{#each requestsChildren as child (child.href)}
									{@const childActive = $page.url.pathname === child.href}
									<a
										href={child.href}
										class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors
											{childActive
											? 'bg-primary/15 font-medium text-primary'
											: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
									>
										<span class="flex-1">{child.label}</span>
										{#if child.badge > 0}
											<span
												class="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
											>
												{child.badge}
											</span>
										{/if}
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{:else if item.href === '/reports' && reportsChildren.length > 0}
					<!-- Reports keeps its plain link; MANAGE_HR holders also get the otherwise
					     unreachable Audit Log beneath it. No toggle — that IA work is phase 02. -->
					<!-- Same `active` rule as the generic arm: for '/reports' the dashboard and
					     performance exceptions are vacuously true, so only the startsWith remains. -->
					{@const active = $page.url.pathname.startsWith(item.href)}
					<a
						href={item.href}
						class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
							{active
							? 'bg-primary/15 text-primary'
							: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.75"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
						</svg>
						<span class="flex-1">{item.label}</span>
						{#if item.badge}
							<span
								class="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary-foreground"
								aria-label="{item.badge} waiting on you"
							>
								{item.badge}
							</span>
						{/if}
					</a>
					<div class="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-4">
						{#each reportsChildren as child (child.href)}
							{@const childActive = $page.url.pathname === child.href}
							<a
								href={child.href}
								class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors
									{childActive
									? 'bg-primary/15 font-medium text-primary'
									: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
							>
								<span class="flex-1">{child.label}</span>
							</a>
						{/each}
					</div>
				{:else}
					{@const active =
						$page.url.pathname.startsWith(item.href) &&
						(item.href !== '/dashboard' || $page.url.pathname === '/dashboard') &&
						(item.href !== '/performance' || $page.url.pathname === '/performance')}
					<a
						href={item.href}
						class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
							{active
							? 'bg-primary/15 text-primary'
							: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.75"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
						</svg>
						<span class="flex-1">{item.label}</span>
						{#if item.badge}
							<span
								class="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary-foreground"
								aria-label="{item.badge} waiting on you"
							>
								{item.badge}
							</span>
						{/if}
					</a>
				{/if}
			{/each}

			{#if showSettings}
				<div>
					<button
						type="button"
						onclick={() => (settingsToggled = !settingsExpanded)}
						aria-expanded={settingsExpanded}
						class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
							{inSettings
							? 'bg-primary/15 text-primary'
							: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.75"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d={settingsIcon} />
						</svg>
						<span class="flex-1 text-left">Settings</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5 shrink-0 transition-transform {settingsExpanded
								? 'rotate-180'
								: ''}"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 8.25l-7.5 7.5-7.5-7.5"
							/>
						</svg>
					</button>
					{#if settingsExpanded}
						<div class="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-4">
							{#each settingsChildren as child (child.href)}
								{@const childActive = $page.url.pathname === child.href}
								<a
									href={child.href}
									class="block rounded-md px-3 py-1.5 text-sm transition-colors
										{childActive
										? 'bg-primary/15 font-medium text-primary'
										: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
								>
									{child.label}
								</a>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</nav>

		<!-- User info at bottom -->
		<div class="shrink-0 border-t border-border p-4">
			<div class="flex items-center gap-3">
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary"
				>
					{data.user.email[0].toUpperCase()}
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-medium text-foreground">{data.user.email}</p>
					<!-- The whole set, never "the highest" — there is no role ranking (#282). -->
					<p class="text-[10px] text-muted-foreground">
						{roles.map((r) => roleLabel[r] ?? r).join(', ')}
					</p>
				</div>
				<!-- Theme toggle -->
				<button
					onclick={toggleTheme}
					title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
				>
					{#if isDark}
						<!-- Sun icon -->
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.75"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
							/>
						</svg>
					{:else}
						<!-- Moon icon -->
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.75"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
							/>
						</svg>
					{/if}
				</button>
			</div>
			<form method="POST" action="/logout" class="mt-3">
				<button
					type="submit"
					class="w-full rounded-md border border-border px-3 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
				>
					Sign out
				</button>
			</form>
		</div>
	</aside>

	<!-- Main content — offset by sidebar on lg+, cleared by the mobile top bar below lg.
	     min-w-0 lets this flex child shrink below its content so inner overflow-x-auto works. -->
	<div class="flex min-w-0 flex-1 flex-col lg:pl-60">
		<main class="flex flex-1 flex-col p-4 pt-20 lg:p-8 lg:pt-8">
			{@render children()}
		</main>
	</div>
</div>

<script lang="ts">
	import { page } from '$app/stores'
	import { browser } from '$app/environment'
	import { invalidateAll } from '$app/navigation'
	import Toaster from '$lib/components/ui/Toaster.svelte'
	// DEV ONLY — dev-gated (dev && !navigator.webdriver), never ships enabled; remove after the
	// program's owner test pass
	import DevLoginSwitcher from '$lib/components/dev/DevLoginSwitcher.svelte'
	import { addToast } from '$lib/stores/toast.svelte'
	import { canAny } from '$lib/rbac'
	import { buildNavSections, isNavItemActive, APPROVALS_ICON } from '$lib/nav'
	import { isFoodServiceOrg } from '$lib/orgs'
	import { visibleSettings } from '$lib/settings-destinations'
	import type { LayoutData } from './$types'

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

	// Company switcher (#131) — only cross-org members see it. The active org comes
	// from data.user.organizationId, which the server resolves from the session.
	const memberOrgs = $derived(data.memberOrgs ?? [])
	const showOrgSwitcher = $derived(memberOrgs.length > 1)

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
	let switchingOrg = $state(false)

	async function switchOrg(organizationId: string) {
		if (switchingOrg || organizationId === data.user.organizationId) return
		switchingOrg = true
		try {
			const res = await fetch('/api/v1/session/switch-org', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ organizationId })
			})
			if (!res.ok) {
				addToast('Could not switch organization.', { kind: 'error' })
				return
			}
			await invalidateAll()
		} catch {
			// Offline, or the request threw. Without this the switcher just silently gave up.
			addToast('Could not switch organization.', { kind: 'error' })
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
		// Exactly the ids just toasted, never "all": `listUnread` caps at 10, so a mark-all
		// consumed the overflow without it ever being shown.
		fetch('/api/v1/notifications/read', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ids: fresh.map((n) => n.id) })
		})
	})

	// A redirect-after-success parks its message in the flash cookie; the layout load reads and
	// clears it. Dedupe on the nonce exactly like the notifications above: this load's payload
	// stays cached between re-runs, so without it an invalidateAll() would re-toast a stale flash.
	const seenFlashes = new Set<string>()
	$effect(() => {
		if (!browser) return
		const flash = data.flash
		if (!flash || seenFlashes.has(flash.id)) return
		seenFlashes.add(flash.id)
		addToast(flash.message, { kind: flash.kind })
	})

	// Same capability table the server enforces with ($lib/rbac) — a nav item shown to
	// a role the server would reject is its own bug, so both read one source of truth.
	// Nav uses the full role set (#133) so a multi-role user sees every entry they hold.
	const roles = $derived(data.user.roles)
	const isAdmin = $derived(canAny(roles, 'MANAGE_HR'))
	// Approvers (manager ladder + Payroll Officer + sign-off roles) get the dropdown.
	const canApprove = $derived(canAny(roles, 'APPROVE_REQUESTS'))

	// The rest of the nav's capability derivations live in $lib/nav, where they are unit-tested
	// against each route's own guard. Only the ones this component still renders with stay here.
	const navSections = $derived(
		buildNavSections({
			roles,
			hasBranches,
			pendingApprovals: data.pendingApprovals,
			waitingInquiries: data.waitingInquiries
		})
	)
	// Section items only — group children (`/requests/*`, `/settings/*`) match exactly, never by
	// prefix, so including them here would steal the active state from their parent.
	const allNavHrefs = $derived(navSections.flatMap((s) => s.items.map((i) => i.href)))

	// Settings is a collapsible group; its pages live in this dropdown, not the flat nav.
	// Labels and capability gating come from $lib/settings-destinations — the same array the
	// settings hub and sub-nav render, so a destination cannot end up with two names again.
	// `inSidebar` keeps this group the curated shortlist it has always been; the outer isAdmin
	// (MANAGE_HR) check below still gates the whole group, which is what destinations with no
	// capabilities of their own rely on.
	const settingsChildren = $derived(
		isAdmin
			? [
					// The group header is a toggle, not a link, so without this the settings index
					// (which lists every destination, including pages absent from this list) is unreachable.
					{ href: '/settings', label: 'All settings' },
					...visibleSettings(roles)
						.filter((d) => d.inSidebar)
						.map((d) => ({ href: d.href, label: d.label }))
				]
			: []
	)

	const settingsIcon =
		'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z'

	const showSettings = $derived(isAdmin && settingsChildren.length > 0)
	const inSettings = $derived($page.url.pathname.startsWith('/settings'))
	// null = follow default (open while on a settings page); once clicked, the user's
	// explicit choice wins so the group can be collapsed even inside /settings.
	let settingsToggled = $state<boolean | null>(null)
	const settingsExpanded = $derived(settingsToggled ?? inSettings)

	// Approvals is a collapsible group for approvers (like Settings). Non-approvers see a flat
	// "My Requests" link instead. Its children come from the `/requests` nav item.
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

	// ── Mobile drawer focus trap ────────────────────────────────────────────────
	// Deliberately a local copy of the trap in `$lib/components/ui/Dialog.svelte`, not a reuse of
	// it. Dialog is a centred, max-width panel; this drawer is a full-height slide-in pinned to the
	// left edge and is the SAME <aside> that is the persistent desktop sidebar at lg:. Mounting it
	// in Dialog would mean restyling both, and Dialog's trap is inline rather than exported —
	// lifting it out is a change to `components/ui`, which phase 03 owns and this phase may not
	// touch. So: same FOCUSABLE selector, same Tab/Shift+Tab cycling, same focus restore. The
	// duplication is a recorded backlog item, not an accident.
	let drawerEl = $state<HTMLElement>()
	let hamburgerEl = $state<HTMLElement>()

	const FOCUSABLE =
		'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

	function closeDrawer() {
		sidebarOpen = false
		hamburgerEl?.focus()
	}

	// Move focus into the drawer on open. Without this the caret stays on the hamburger behind the
	// backdrop and a keyboard reader tabs through the page underneath instead of the menu.
	$effect(() => {
		if (!sidebarOpen || !drawerEl) return
		drawerEl.querySelector<HTMLElement>(FOCUSABLE)?.focus()
	})

	// The drawer only exists below lg — above it the same <aside> is the persistent sidebar. A
	// resize while it is open would otherwise leave the desktop sidebar as a focus-trapped dialog.
	$effect(() => {
		if (!browser) return
		const wide = window.matchMedia('(min-width: 1024px)')
		const sync = () => {
			if (wide.matches) sidebarOpen = false
		}
		sync()
		wide.addEventListener('change', sync)
		return () => wide.removeEventListener('change', sync)
	})

	function onDrawerKeydown(e: KeyboardEvent) {
		if (!sidebarOpen) return
		if (e.key === 'Escape') {
			closeDrawer()
			return
		}
		if (e.key !== 'Tab' || !drawerEl) return
		// Rebuilt per keypress: the nav's collapsible groups add and remove controls as they open.
		const items = [...drawerEl.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
			(el) => el.offsetParent !== null
		)
		if (items.length === 0) return
		const first = items[0]
		const last = items[items.length - 1]
		const active = document.activeElement
		if (e.shiftKey && active === first) {
			e.preventDefault()
			last.focus()
		} else if (!e.shiftKey && active === last) {
			e.preventDefault()
			first.focus()
		}
	}
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
			bind:this={hamburgerEl}
			onclick={() => (sidebarOpen = true)}
			aria-label="Open menu"
			aria-expanded={sidebarOpen}
			aria-controls="main-sidebar"
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
			onclick={closeDrawer}
			aria-label="Close menu"
			class="fixed inset-0 z-40 bg-black/50 lg:hidden"
		></button>
	{/if}

	<!-- Sidebar (persistent on lg+, slide-in drawer below lg).
	     The dialog semantics are conditional on purpose: above lg this same element is the
	     always-present page sidebar, and calling that a modal dialog would tell a screen reader the
	     rest of the page is inert when it is not. `sidebarOpen` can only be true below lg — the one
	     control that sets it is `lg:hidden`, and the resize effect clears it on the way up. -->
	<aside
		id="main-sidebar"
		bind:this={drawerEl}
		onkeydown={onDrawerKeydown}
		role={sidebarOpen ? 'dialog' : undefined}
		aria-modal={sidebarOpen ? 'true' : undefined}
		aria-label={sidebarOpen ? 'Main menu' : undefined}
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
				onclick={closeDrawer}
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

		<!-- Company switcher (cross-org members only).
		     A native <select>, not a custom popover. The old one was a button that toggled a div of
		     buttons: no Escape, no listbox semantics, no arrow-key movement and no announced selection.
		     The list is nothing but org names with a tick on the active one, which is exactly what a
		     <select> already is — so the platform control gives all of that for free and deletes the
		     open/close state with it.
		     "Active organization", not "Organization": phase 02's nav carries a section group of that
		     exact name, and two controls with one accessible name is ambiguous to a reader (and to a
		     test locator). -->
		{#if showOrgSwitcher}
			<div class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 shrink-0 text-muted-foreground"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.75"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
					/>
				</svg>
				<select
					aria-label="Active organization"
					disabled={switchingOrg}
					value={data.user.organizationId}
					onchange={(e) => switchOrg(e.currentTarget.value)}
					class="min-w-0 flex-1 truncate rounded-md bg-transparent px-1 py-1 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
				>
					{#each memberOrgs as org (org.id)}
						<option value={org.id}>{org.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		<!-- Nav -->
		<nav aria-label="Main" class="flex-1 overflow-y-auto px-3 py-4">
			{#each navSections as section (section.label)}
				{@const headerId = `nav-section-${section.label.toLowerCase().replace(/\s+/g, '-')}`}
				<div role="group" aria-labelledby={headerId} class="space-y-0.5">
					<div
						id={headerId}
						class="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
					>
						{section.label}
					</div>
					{#each section.items as item (item.href)}
						{#if item.href === '/requests' && canApprove}
							<!-- Approvals collapsible group (approvers) -->
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
										<path stroke-linecap="round" stroke-linejoin="round" d={APPROVALS_ICON} />
									</svg>
									<span class="flex-1 text-left">Approvals</span>
									{#if data.pendingApprovals.total > 0 && !requestsExpanded}
										<span
											class="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary-foreground"
											aria-label="{data.pendingApprovals.total} awaiting your decision"
										>
											{data.pendingApprovals.total}
										</span>
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
										{#each item.children ?? [] as child (child.href)}
											{@const childActive = $page.url.pathname === child.href}
											<a
												href={child.href}
												aria-current={childActive ? 'page' : undefined}
												class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors
													{childActive
													? 'bg-primary/15 font-medium text-primary'
													: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
											>
												<span class="flex-1">{child.label}</span>
												{#if child.badge}
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
						{:else if item.child}
							{@const active = isNavItemActive($page.url.pathname, item.href, allNavHrefs)}
							<!-- Indented child row (Audit Log, Eval Templates): no icon, same styling as a
							     collapsible group's children. -->
							<div class="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-4">
								<a
									href={item.href}
									aria-current={active ? 'page' : undefined}
									class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors
										{active
										? 'bg-primary/15 font-medium text-primary'
										: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
								>
									<span class="flex-1">{item.label}</span>
								</a>
							</div>
						{:else}
							{@const active = isNavItemActive($page.url.pathname, item.href, allNavHrefs)}
							<a
								href={item.href}
								aria-current={active ? 'page' : undefined}
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

					<!-- Settings closes the Organization section. `showSettings` needs MANAGE_HR, which
					     also puts Inventory in that section, so the group can never be orphaned. -->
					{#if section.label === 'Organization' && showSettings}
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
											aria-current={childActive ? 'page' : undefined}
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
				</div>
			{/each}
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

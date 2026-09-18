<script lang="ts">
	import { page } from '$app/stores'
	import CalculatorWindow from '$lib/components/payroll/CalculatorWindow.svelte'
	import { activePayrollTab, payrollTabs } from '$lib/payroll-tabs'
	import type { LayoutData } from './$types'
	import type { Snippet } from 'svelte'

	let { data, children }: { data: LayoutData; children: Snippet } = $props()

	// Floating calculator (#72), scoped to payroll pages. The layout survives
	// navigation between payroll pages, so an open window (and its inputs/result)
	// follows you from a run to periods and back.
	let calcOpen = $state(false)
	const onCalculatorPage = $derived($page.url.pathname.startsWith('/payroll/calculator'))

	// Payroll's five pages were reachable only from the sidebar and from each other's Back links,
	// so runs and periods read as unrelated areas. Each tab is filtered on its own capability —
	// see `$lib/payroll-tabs`.
	const tabs = $derived(payrollTabs(data))
	const activeHref = $derived(activePayrollTab(tabs, $page.url.pathname))
</script>

<!-- Every role that passes the layout's 403 gate holds at least the Runs tab, so this branch is a
     safety net rather than a reachable state. -->
{#if tabs.length}
	<nav aria-label="Payroll" class="mb-6 flex flex-wrap gap-1 border-b">
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				aria-current={tab.href === activeHref ? 'page' : undefined}
				class="-mb-px border-b-2 px-3 py-2 text-sm font-medium {tab.href === activeHref
					? 'border-primary text-foreground'
					: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}"
				>{tab.label}</a
			>
		{/each}
	</nav>
{/if}

{@render children()}

{#if !onCalculatorPage}
	{#if calcOpen}
		<CalculatorWindow
			employees={data.employees}
			recurringDefaults={data.recurringDefaults}
			onclose={() => (calcOpen = false)}
		/>
	{:else}
		<button
			type="button"
			onclick={() => (calcOpen = true)}
			title="Open payroll calculator"
			class="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm2.25-4.5h.008v.008H10.5v-.008zm0 2.25h.008v.008H10.5V13.5zm0 2.25h.008v.008H10.5v-.008zm2.25-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM6 7.5h12M6 7.5v-3A1.5 1.5 0 017.5 3h9A1.5 1.5 0 0118 4.5v3M6 7.5v12A1.5 1.5 0 007.5 21h9a1.5 1.5 0 001.5-1.5v-12"
				/>
			</svg>
			Calculator
		</button>
	{/if}
{/if}

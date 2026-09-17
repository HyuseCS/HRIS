<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import Banner from '$lib/components/ui/Banner.svelte'
	import Container from '$lib/components/ui/Container.svelte'
	import TimesheetModal from '$lib/components/timesheets/TimesheetModal.svelte'
	import NewTimesheetDialog from '$lib/components/timesheets/NewTimesheetDialog.svelte'
	import AggregatePanel from '$lib/components/timesheets/AggregatePanel.svelte'
	import Tabs from '$lib/components/ui/Tabs.svelte'
	import TimesheetListTab from '$lib/components/timesheets/TimesheetListTab.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showCreate = $state(false)

	// ─── Review modal ─────────────────────────────────────────────────────────
	// /timesheets is read/modify only — the modal runs in "edit" mode (no approve/reject).
	type Timesheet = Awaited<PageData['myTimesheets']>[number]
	let openTs = $state<Timesheet | null>(null)

	const tabs: { key: string; label: string; short: string; count: string; tone?: 'warning' }[] =
		$derived([
			...(data.isManager
				? [
						{
							key: 'team',
							label: 'Team Timesheets',
							short: 'Team',
							count: String(data.teamPagination.total)
						}
					]
				: []),
			...(data.myEmployeeId
				? [
						{
							key: 'mine',
							label: 'My Timesheets',
							short: 'Mine',
							count: data.mineDrafts
								? `${data.mineDrafts} draft`
								: String(data.minePagination.total),
							tone: data.mineDrafts ? ('warning' as const) : undefined
						}
					]
				: [])
		])
	// svelte-ignore state_referenced_locally
	let activeTab = $state(data.isManager ? 'team' : 'mine')
</script>

<svelte:head>
	<title>Timesheets — Veent HRIS</title>
</svelte:head>

<div class="flex min-h-[calc(100dvh-6rem)] flex-col gap-6 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
	{#snippet newTimesheet()}
		<button
			onclick={() => (showCreate = true)}
			class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
		>
			New Timesheet
		</button>
	{/snippet}
	<PageHeader title="Timesheets" back={data.canCreate ? newTimesheet : undefined} />

	<!-- 14 server `fail()` sites are reachable with the modal CLOSED, and the modal owns the only
	     other error slot on this page — so with it shut the failure rendered nowhere. Gated on
	     `openTs` so an open modal still shows the message once, in place. -->
	{#if (form?.error && !openTs) || form?.saved || data.isHrAdmin}
		<div class="flex shrink-0 flex-col gap-3">
			{#if form?.error && !openTs}
				<Banner kind="error" message={form.error} />
			{/if}

			{#if form?.saved}
				<Banner kind="success" message={form.saved} />
			{/if}

			{#if data.isHrAdmin}
				<AggregatePanel employees={data.employees} />
			{/if}
		</div>
	{/if}

	{#if tabs.length}
		<Container tone="card" flush>
			<Tabs {tabs} bind:active={activeTab} label="Timesheets" param="tab" bare>
				{#snippet panel(key)}
					{#if key === 'team'}
						<TimesheetListTab
							rows={data.teamTimesheets}
							pagination={data.teamPagination}
							kind="team"
							canModify={data.canModify}
							onopen={(ts) => (openTs = ts)}
						/>
					{:else}
						<TimesheetListTab
							rows={data.myTimesheets}
							pagination={data.minePagination}
							kind="mine"
							canModify={data.canModify}
							onopen={(ts) => (openTs = ts)}
						/>
					{/if}
				{/snippet}
			</Tabs>
		</Container>
	{/if}
	{#if !data.myEmployeeId && !data.isManager}
		<p class="text-sm text-muted-foreground">No employee profile found.</p>
	{/if}
</div>

<TimesheetModal
	bind:ts={openTs}
	mode="edit"
	isManager={data.isManager}
	isHrAdmin={data.isHrAdmin}
	canModify={data.canModify}
	myEmployeeId={data.myEmployeeId}
/>

{#if data.canCreate}
	<NewTimesheetDialog bind:open={showCreate} employees={data.employees} />
{/if}

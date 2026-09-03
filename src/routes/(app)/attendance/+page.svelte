<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { scrollToError } from '$lib/actions/scrollToError'
	import AttendanceSelfView from '$lib/components/attendance/AttendanceSelfView.svelte'
	import AttendanceHrGrid from '$lib/components/attendance/AttendanceHrGrid.svelte'
	import { createAttendanceGuards, isException } from '$lib/components/attendance/shared'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { SubmitFunction } from '@sveltejs/kit'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// Phase 07 §S5: the page is a header plus a two-way persona branch. Every piece of shared
	// state lives HERE and is threaded into the child — a submit guard re-created inside a
	// component would carry its own in-flight flag and re-open the double-submit hole (#108).
	const guards = createAttendanceGuards()

	// Per-row forms live inside {#each}, so they need a guard per row — a shared one would grey out
	// every row's button at once. Created lazily and cached by record id.
	const rowGuards = new Map<string, ReturnType<typeof submitFeedback>>()
	function rowGuard(key: string, inner?: SubmitFunction) {
		let g = rowGuards.get(key)
		if (!g) {
			g = submitFeedback({ inner })
			rowGuards.set(key, g)
		}
		return g
	}

	const exportHref = $derived(
		data.view === 'team'
			? `/attendance/export?view=team&date=${data.date}`
			: `/attendance/export?view=employee&employeeId=${data.selectedEmployeeId ?? ''}&from=${data.from}&to=${data.to}`
	)

	// "Exceptions only" — surface the rows that need HR action (failed to time in,
	// incomplete logs, tardiness) so the morning fail-check doesn't mean scrolling the
	// whole sheet. A missing team record counts as an exception (no punch = didn't time in).
	let exceptionsOnly = $state(false)
	const teamRows = $derived(
		exceptionsOnly ? data.team.filter((t) => !t.day || isException(t.day.status)) : data.team
	)
	const dayRows = $derived(
		exceptionsOnly ? data.days.filter((d) => isException(d.status)) : data.days
	)
</script>

<svelte:head>
	<title>Attendance — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Attendance"
		description={data.canManage
			? 'Daily records & corrections. For a multi-day team matrix, see Team Attendance.'
			: undefined}
	/>

	{#if form?.error}
		<!-- Addendum §F: this page runs far past the fold, so a failed grid edit would otherwise
		     render its message off-screen and read as "nothing happened". -->
		<div
			use:scrollToError
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-400"
		>
			{form.error}
		</div>
	{/if}
	{#if form?.saved}
		<Banner kind="success" message={form.saved} />
	{/if}

	{#if data.canManage}
		<AttendanceHrGrid
			{data}
			{form}
			{exportHref}
			{teamRows}
			{dayRows}
			{guards}
			{rowGuard}
			bind:exceptionsOnly
		/>
	{:else}
		<AttendanceSelfView {data} {exportHref} />
	{/if}
</div>

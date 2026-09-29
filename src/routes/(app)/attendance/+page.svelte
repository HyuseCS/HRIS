<script lang="ts">
	import AttendanceSelfView from '$lib/components/attendance/AttendanceSelfView.svelte'
	import AttendanceHrGrid from '$lib/components/attendance/AttendanceHrGrid.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const exportHref = $derived(
		data.view === 'team'
			? `/attendance/export?view=team&date=${data.date}`
			: `/attendance/export?view=employee&employeeId=${data.selectedEmployeeId ?? ''}&from=${data.from}&to=${data.to}`
	)
</script>

<svelte:head>
	<title>Attendance — Veent HRIS</title>
</svelte:head>

{#if data.canManage}
	<AttendanceHrGrid {data} {form} {exportHref} />
{:else}
	<AttendanceSelfView {data} {exportHref} />
{/if}

<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import CalculatorPanel from '$lib/components/payroll/CalculatorPanel.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()
</script>

<svelte:head>
	<title>Payroll Calculator — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Payroll Calculator" description="What-if preview — nothing is saved.">
		{#snippet back()}
			<BackButton fallback="/payroll" label="Payroll" />
		{/snippet}
	</PageHeader>

	<CalculatorPanel employees={data.employees} recurringDefaults={data.recurringDefaults} />
</div>

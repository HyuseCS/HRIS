<script lang="ts">
	import CalculatorPanel from '$lib/components/payroll/CalculatorPanel.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()
</script>

<svelte:head>
	<title>Payroll Calculator — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
			<h1 class="text-2xl font-bold tracking-tight">Payroll Calculator</h1>
			<span class="text-xs text-muted-foreground">what-if preview — nothing is saved</span>
		</div>
		<div
			class="ml-auto flex basis-full shrink-0 flex-wrap items-center justify-end gap-2 sm:basis-auto"
		>
			<BackButton fallback="/payroll" label="Payroll" />
		</div>
	</div>

	<CalculatorPanel employees={data.employees} recurringDefaults={data.recurringDefaults} />
</div>

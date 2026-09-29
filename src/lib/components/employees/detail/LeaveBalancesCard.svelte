<script lang="ts">
	import { tenureRequirement, monthsOfService } from '$lib/utils/dates'
	import type { EmployeeDetailData } from './shared'

	let { data }: { data: EmployeeDetailData } = $props()

	const employee = $derived(data.employee)
</script>

<section class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2">
	<h2 class="font-semibold">
		Leave Balances
		<span class="text-xs font-normal text-muted-foreground">({new Date().getFullYear()}, days)</span
		>
	</h2>

	{#if data.leaveBalances.length}
		<div class="card-scroll flex flex-wrap gap-3">
			{#each data.leaveBalances as bal (bal.id)}
				{@const gated =
					bal.minMonthsOfService > 0 &&
					monthsOfService(new Date(employee.startDate)) < bal.minMonthsOfService}
				<div class="min-w-[150px] rounded-lg border bg-card p-4">
					<p class="text-xs font-medium text-muted-foreground">{bal.name}</p>
					{#if gated}
						<p class="mt-1 text-2xl font-bold text-muted-foreground">Locked</p>
						<p class="text-xs text-muted-foreground">
							after {tenureRequirement(bal.minMonthsOfService)} of service
						</p>
					{:else}
						<p class="mt-1 text-2xl font-bold">{bal.remaining.toFixed(1)}</p>
						<p class="text-xs text-muted-foreground">
							of {bal.allocated.toFixed(0)} allocated
						</p>
						<p class="text-xs text-muted-foreground">{bal.used.toFixed(1)} used</p>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">
			No leave allocated for {new Date().getFullYear()}. Balances are created at onboarding from the
			org's
			<a href="/settings/leave-types" class="text-primary hover:underline">leave types</a>.
		</p>
	{/if}
</section>

<script lang="ts">
	let {
		balances
	}: {
		balances: {
			id: string
			leaveType: { name: string; isPaid: boolean }
			allocated: number | string
			used: number | string
		}[]
	} = $props()
</script>

<div class="flex flex-wrap gap-2">
	{#each balances as balance (balance.id)}
		<div class="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm">
			<span class="font-medium text-foreground">{balance.leaveType.name}</span>
			<span class="font-semibold tabular-nums text-foreground">
				{Number(balance.used)}/{Number(balance.allocated)}
			</span>
			<!-- Paid is the norm; only the exception is worth a badge. -->
			{#if !balance.leaveType.isPaid}
				<span class="badge-gray">Unpaid</span>
			{/if}
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">No leave balances found.</p>
	{/each}
</div>

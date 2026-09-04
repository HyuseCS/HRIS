<script lang="ts">
	let {
		balances
	}: {
		balances: {
			id: string
			leaveType: { name: string; isPaid: boolean }
			allocated: number | string
			used: number | string
			remaining: number | string
		}[]
	} = $props()
</script>

<div class="flex flex-wrap gap-3">
	{#each balances as balance (balance.id)}
		<div class="rounded-lg border bg-card p-4 min-w-[160px]">
			<div class="flex items-center gap-2 mb-1">
				<span class="text-sm font-medium text-foreground">{balance.leaveType.name}</span>
				{#if balance.leaveType.isPaid}
					<span class="badge-green">Paid</span>
				{:else}
					<span class="badge-gray">Unpaid</span>
				{/if}
			</div>
			<div class="text-3xl font-bold text-foreground">{Number(balance.remaining)}</div>
			<div class="text-xs text-muted-foreground mt-0.5">
				of {Number(balance.allocated)} days allocated
			</div>
			<div class="text-xs text-muted-foreground">
				{Number(balance.used)} used
			</div>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">No leave balances found.</p>
	{/each}
</div>

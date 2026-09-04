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

<div class="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
	{#each balances as balance (balance.id)}
		{@const used = Number(balance.used)}
		{@const allocated = Number(balance.allocated)}
		<div class="rounded-lg border bg-card px-3 py-2">
			<div class="flex items-center gap-1.5">
				<span class="truncate text-xs text-muted-foreground" title={balance.leaveType.name}>
					{balance.leaveType.name}
				</span>
				<!-- Paid is the norm; only the exception is worth a badge. -->
				{#if !balance.leaveType.isPaid}
					<span class="badge-gray">Unpaid</span>
				{/if}
			</div>
			<div class="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
				{used}<span class="text-sm font-normal text-muted-foreground">/{allocated}</span>
			</div>
			<!-- Usage at a glance, so the fraction does not have to be read to spot a nearly-spent type. -->
			<div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full bg-primary"
					style="width: {allocated > 0 ? Math.min(100, (used / allocated) * 100) : 0}%"
				></div>
			</div>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">No leave balances found.</p>
	{/each}
</div>

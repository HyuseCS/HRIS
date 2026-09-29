<script lang="ts">
	import type { Snippet } from 'svelte'
	import { formatShortDate } from '$lib/utils/format'
	import { LIST_RENDER_CAP, type History } from './shared'

	let { history, truncated }: { history: History; truncated: Snippet<[number]> } = $props()
</script>

<section class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2">
	<h2 class="font-semibold">
		Employment History
		<span class="text-xs font-normal text-muted-foreground"
			>(promotions, salary, transfers, status — from the audit trail)</span
		>
	</h2>

	{#if history.length}
		<div class="card-scroll pl-1">
			<ol class="relative space-y-5 border-l pl-6">
				{#each history.slice(0, LIST_RENDER_CAP) as ev (ev.id)}
					<li class="relative">
						<span
							class="absolute -left-[27px] mt-1 h-3 w-3 rounded-full border-2 border-background {ev.type ===
							'HIRED'
								? 'bg-green-500'
								: 'bg-primary'}"
						></span>
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<span class="text-sm font-medium">
								{ev.type === 'HIRED' ? 'Hired / record created' : 'Profile updated'}
							</span>
							<span class="text-xs text-muted-foreground">
								{formatShortDate(ev.date)}
								<!-- #170: a comp change carries its own effective date (may be backdated). -->
								{#if ev.effectiveDate}
									· effective {formatShortDate(ev.effectiveDate)}
								{/if}
							</span>
						</div>
						{#if ev.changes.length}
							<ul class="mt-1 space-y-0.5 text-sm text-muted-foreground">
								{#each ev.changes as c (c.label)}
									<li>
										<span class="font-medium text-foreground">{c.label}:</span>
										{c.from} <span aria-hidden="true">→</span>
										<span class="text-foreground">{c.to}</span>
									</li>
								{/each}
							</ul>
						{/if}
						{#if ev.actorEmail}
							<p class="mt-1 text-xs text-muted-foreground/70">by {ev.actorEmail}</p>
						{/if}
					</li>
				{/each}
			</ol>
		</div>
		{@render truncated(history.length)}
	{:else}
		<p class="text-xs text-muted-foreground">No recorded changes yet.</p>
	{/if}
</section>

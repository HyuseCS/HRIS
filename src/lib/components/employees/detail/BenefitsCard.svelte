<script lang="ts">
	import { formatCurrency } from '$lib/utils/format'
	import Badge from '$lib/components/ui/Badge.svelte'
	import Container from '$lib/components/ui/Container.svelte'
	import { labelFor, BENEFIT_PLAN_TYPE_LABELS } from '$lib/labels'
	import type { EmployeeDetailData } from './shared'

	let { data }: { data: EmployeeDetailData } = $props()
</script>

<section class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2">
	<h2 class="font-semibold">Benefits</h2>
	{#if data.benefits.length}
		<Container tone="card" fill={false} flush bodyClass="card-scroll">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Plan</th>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Coverage</th>
						<th class="px-3 py-2 text-right font-medium text-muted-foreground">EE Cost</th>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.benefits as b (b.id)}
						<tr class="hover:bg-muted/30 {b.status === 'ACTIVE' ? '' : 'opacity-60'}">
							<td class="px-3 py-2 font-medium">{b.plan.name}</td>
							<td class="px-3 py-2 text-muted-foreground"
								>{labelFor(BENEFIT_PLAN_TYPE_LABELS, b.plan.type)}</td
							>
							<td class="px-3 py-2 text-muted-foreground">{b.coverageLevel ?? '—'}</td>
							<td class="px-3 py-2 text-right">
								{b.plan.employeeCost != null ? formatCurrency(b.plan.employeeCost) : '—'}
							</td>
							<td class="px-3 py-2">
								<Badge status={b.status} domain="benefitEnrollment" />
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</Container>
	{:else}
		<p class="text-xs text-muted-foreground">
			No benefit enrollments. HR manages enrollments under Benefits.
		</p>
	{/if}
</section>

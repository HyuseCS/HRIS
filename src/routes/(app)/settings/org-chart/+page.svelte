<script lang="ts">
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	type Node = PageData['nodes'][number]

	// Group employees by their manager id.
	const byManager = $derived.by(() => {
		const map = new Map<string, Node[]>()
		for (const n of data.nodes) {
			const key = n.reportsToId ?? '__root__'
			if (!map.has(key)) map.set(key, [])
			map.get(key)!.push(n)
		}
		return map
	})

	const ids = $derived(new Set(data.nodes.map((n) => n.id)))

	// Roots: no manager, or a manager who isn't in this org's node set (dangling ref).
	const roots = $derived(data.nodes.filter((n) => !n.reportsToId || !ids.has(n.reportsToId)))

	// Collapsed subtree ids (expanded by default).
	let collapsed = $state<Record<string, boolean>>({})
	const toggle = (id: string) => (collapsed[id] = !collapsed[id])

	const childrenOf = (id: string) => byManager.get(id) ?? []

	let query = $state('')
	const matches = $derived(
		query.trim()
			? data.nodes.filter((n) =>
					`${n.name} ${n.jobTitle} ${n.positionTitle ?? ''} ${n.departmentName ?? ''}`
						.toLowerCase()
						.includes(query.trim().toLowerCase())
				)
			: []
	)
</script>

<svelte:head>
	<title>Org Chart — Veent HRIS</title>
</svelte:head>

{#snippet nodeRow(n: Node, ancestors: string[])}
	{@const kids = childrenOf(n.id)}
	{@const cycle = ancestors.includes(n.id)}
	<li>
		<div class="flex items-center gap-2 py-1">
			{#if kids.length && !cycle}
				<button
					onclick={() => toggle(n.id)}
					class="flex h-5 w-5 items-center justify-center rounded border text-xs text-muted-foreground hover:bg-accent"
					aria-label={collapsed[n.id] ? 'Expand' : 'Collapse'}
				>
					{collapsed[n.id] ? '+' : '−'}
				</button>
			{:else}
				<span class="inline-block h-5 w-5"></span>
			{/if}
			<div class="rounded-md border bg-card px-3 py-2">
				<p class="text-sm font-medium">
					{n.name}
					{#if n.employmentStatus !== 'ACTIVE'}
						<span
							class="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
							>{n.employmentStatus}</span
						>
					{/if}
				</p>
				<p class="text-xs text-muted-foreground">
					{n.positionTitle ?? n.jobTitle}{#if n.departmentName}
						· {n.departmentName}{/if}
				</p>
			</div>
			{#if kids.length}
				<span class="text-xs text-muted-foreground"
					>{kids.length} report{kids.length === 1 ? '' : 's'}</span
				>
			{/if}
		</div>
		{#if kids.length && !cycle && !collapsed[n.id]}
			<ul class="ml-4 border-l pl-4">
				{#each kids as child (child.id)}
					{@render nodeRow(child, [...ancestors, n.id])}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<div class="space-y-6">
	<PageHeader
		title="Org Chart"
		description="Reporting hierarchy built from each employee's manager."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	<section class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">Employees</h2>
			<div
				class="ml-auto flex basis-full shrink-0 flex-wrap items-center justify-end gap-2 sm:basis-auto"
			>
				<a
					href="/settings/org"
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
					>Manage Positions</a
				>
			</div>
		</div>
		<input
			bind:value={query}
			placeholder="Search people…"
			class="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		/>

		{#if query.trim()}
			<div class="rounded-lg border">
				<ul class="divide-y">
					{#each matches as m (m.id)}
						<li class="px-4 py-2">
							<p class="text-sm font-medium">{m.name}</p>
							<p class="text-xs text-muted-foreground">
								{m.positionTitle ?? m.jobTitle}{#if m.departmentName}
									· {m.departmentName}{/if}
							</p>
						</li>
					{:else}
						<li class="px-4 py-8 text-center text-sm text-muted-foreground">No matches</li>
					{/each}
				</ul>
			</div>
		{:else if roots.length}
			<div class="rounded-lg border p-4">
				<ul class="space-y-1">
					{#each roots as root (root.id)}
						{@render nodeRow(root, [])}
					{/each}
				</ul>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No employees to chart yet.</p>
		{/if}
	</section>
</div>

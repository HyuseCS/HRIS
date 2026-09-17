<script lang="ts" generics="Row">
	import type { Snippet } from 'svelte'
	import EmptyState from './EmptyState.svelte'
	import type { Column } from './table'

	// The app had 49 hand-rolled tables across 31 pages and no primitive, so each one carried its
	// own padding, width strategy, empty row and action-column handling — and five of them had no
	// horizontal-scroll wrapper at all, breaking the page layout on a phone.
	//
	// One `cell` snippet renders a given row/column pair, which is what lets the same definition
	// drive two layouts: a real table on desktop, and stacked label/value cards below `sm`, where
	// a six-column table can only be scrolled sideways or squinted at.
	let {
		columns,
		rows,
		cell,
		getKey,
		onRowClick,
		emptyTitle = 'Nothing here yet',
		emptyDescription,
		emptyVariant = 'empty',
		emptyAction,
		caption,
		bare = false
	}: {
		columns: Column[]
		rows: Row[]
		/** Renders one cell. Branch on `column.key`. */
		cell: Snippet<[Row, Column]>
		getKey: (_row: Row, _index: number) => string
		/** Makes rows activatable. Keyboard support comes with it. */
		onRowClick?: (_row: Row) => void
		emptyTitle?: string
		emptyDescription?: string
		emptyVariant?: 'empty' | 'no-results'
		emptyAction?: Snippet
		caption?: string
		bare?: boolean
	} = $props()

	const alignClass = (c: Column) =>
		c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
	// w-[1%] collapses a column to its content under `table-auto`. Paired with whitespace-nowrap
	// so the content it is sized to cannot wrap and defeat the point.
	const widthClass = (c: Column) => (c.width === 'min' ? 'w-[1%] whitespace-nowrap' : '')
	const mobileColumns = $derived(columns.filter((c) => !c.hideOnMobile))
</script>

{#if rows.length === 0}
	<div class={bare ? undefined : 'rounded-lg border bg-card'}>
		<EmptyState
			variant={emptyVariant}
			title={emptyTitle}
			description={emptyDescription}
			action={emptyAction}
		/>
	</div>
{:else}
	<!-- Desktop: a real table. Hidden rather than reflowed below sm so the two layouts can each
	     be laid out properly instead of compromising on one. -->
	<div
		class={bare
			? 'hidden overflow-x-auto sm:block'
			: 'hidden overflow-x-auto rounded-lg border bg-card sm:block'}
	>
		<table class="w-full text-sm">
			{#if caption}
				<caption class="sr-only">{caption}</caption>
			{/if}
			<thead class="border-b border-border/60 bg-muted/40">
				<tr>
					{#each columns as column (column.key)}
						<th
							scope="col"
							class="px-4 py-2.5 text-xs font-medium text-muted-foreground {alignClass(
								column
							)} {widthClass(column)}"
						>
							{column.label}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody class="divide-y divide-border/40">
				{#each rows as row, i (getKey(row, i))}
					<tr
						class="h-12 transition-colors hover:bg-accent/40 {onRowClick
							? 'cursor-pointer focus-visible:bg-accent/50 focus-visible:outline-none'
							: ''}"
						onclick={onRowClick ? () => onRowClick(row) : undefined}
						onkeydown={onRowClick
							? (e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(row)
							: undefined}
						role={onRowClick ? 'button' : undefined}
						tabindex={onRowClick ? 0 : undefined}
					>
						{#each columns as column (column.key)}
							<td class="px-4 py-2 {alignClass(column)} {widthClass(column)}">
								{@render cell(row, column)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Mobile: one card per row, label beside value. Sideways scrolling a six-column table on a
	     390px screen is technically readable and practically useless. -->
	<ul class={bare ? 'space-y-2 p-3 sm:hidden' : 'space-y-2 sm:hidden'}>
		{#each rows as row, i (getKey(row, i))}
			<!-- Deliberately not clickable, unlike the desktop row: a card-shaped button whose
			     label is its whole contents is poor for screen readers, and every table that uses
			     row-click also carries an action cell, which the card renders like any other. -->
			<li class="rounded-lg border bg-card p-3">
				<dl class="space-y-1.5">
					{#each mobileColumns as column (column.key)}
						<div class="flex items-start justify-between gap-3">
							<dt class="shrink-0 text-xs text-muted-foreground">{column.label}</dt>
							<dd class="min-w-0 text-right text-sm">{@render cell(row, column)}</dd>
						</div>
					{/each}
				</dl>
			</li>
		{/each}
	</ul>
{/if}

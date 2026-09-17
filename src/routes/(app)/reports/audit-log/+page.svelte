<script lang="ts">
	import PanelPage from '$lib/components/ui/PanelPage.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import DatePicker from '$lib/components/ui/DatePicker.svelte'
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let endPicker: ReturnType<typeof DatePicker> | undefined = $state()

	// `fail()` contributes its own shape to the ActionData union, so narrow before reading.
	// Without this the 400 from a reveal with no id renders as silence.
	const failure = $derived(form && 'error' in form ? form.error : null)

	/**
	 * The reveal is a full-page POST, so focus resets to the top of the document and the payload
	 * is rendered in the same pass as the rest of the page — the weakest case for a live region
	 * announcing. Move focus to it instead, so it is both announced and reachable.
	 */
	const focusOnMount = (node: HTMLElement) => {
		node.focus()
	}

	// Hand-maintained — extend it whenever `AuditAction` gains a value, or the new action cannot
	// be filtered for at all. `PAYROLL_VOID` was added in #298.
	const ACTIONS = [
		'CREATE',
		'UPDATE',
		'DELETE',
		'VIEW',
		'LOGIN',
		'LOGIN_FAILED',
		'PAYROLL_OVERRIDE',
		'LEAVE_OVERRIDE',
		'PAYROLL_VOID'
	]
</script>

<svelte:head>
	<title>Audit Log — Veent HRIS</title>
</svelte:head>

{#snippet failureNotice()}
	<div role="alert" class="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
		{failure}
	</div>
{/snippet}

{#snippet filters()}
	<!-- Filter form -->
	<form method="GET" class="flex flex-wrap items-end gap-3">
		<!-- Actor -->
		<div class="flex flex-col gap-1">
			<label for="actor" class="text-xs font-medium text-muted-foreground">Actor</label>
			<input
				id="actor"
				name="actor"
				type="search"
				maxlength="100"
				placeholder="Search actor name or email…"
				class="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>

		<!-- Entity type -->
		<div class="flex flex-col gap-1">
			<label for="entity" class="text-xs font-medium text-muted-foreground">Entity Type</label>
			<select
				id="entity"
				name="entity"
				class="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="">All Types</option>
				{#each data.entityTypes as et (et)}
					<option value={et}>{et}</option>
				{/each}
			</select>
		</div>

		<!-- Action -->
		<div class="flex flex-col gap-1">
			<label for="action" class="text-xs font-medium text-muted-foreground">Action</label>
			<select
				id="action"
				name="action"
				class="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="">All Actions</option>
				{#each ACTIONS as a (a)}
					<option value={a}>{a}</option>
				{/each}
			</select>
		</div>

		<!-- Date range -->
		<div class="flex flex-col gap-1">
			<label for="start" class="text-xs font-medium text-muted-foreground">From</label>
			<DatePicker
				id="start"
				name="start"
				value=""
				onchange={(v) => {
					if (v) endPicker?.focusAndOpen()
				}}
				class="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div class="flex flex-col gap-1">
			<label for="end" class="text-xs font-medium text-muted-foreground">To</label>
			<DatePicker
				bind:this={endPicker}
				id="end"
				name="end"
				value=""
				class="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>

		<button
			type="submit"
			class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
		>
			Filter
		</button>
	</form>
{/snippet}

<PanelPage
	title="Audit Log"
	tone="card"
	flush
	notice={failure ? failureNotice : undefined}
	toolbar={filters}
	empty={data.logs.length === 0}
>
	<!-- Table -->
	<div class="overflow-x-auto">
		<table class="w-full min-w-[70rem] table-fixed text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="w-52 px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
						>Timestamp</th
					>
					<th class="w-56 px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
						>Actor</th
					>
					<th class="w-44 px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
						>Action</th
					>
					<th class="w-52 px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
						>Entity Type</th
					>
					<th class="w-36 px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
						>Entity ID</th
					>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Changes</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.logs as log (log.id)}
					<!-- At most one entry is revealed at a time — whichever ?/reveal just returned. -->
					{@const revealed = form?.revealed}
					<tr class="hover:bg-muted/30">
						<td class="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
							{new Date(log.createdAt).toLocaleString('en-PH', {
								year: 'numeric',
								month: 'short',
								day: 'numeric',
								hour: '2-digit',
								minute: '2-digit',
								second: '2-digit'
							})}
						</td>
						<td class="break-words px-4 py-3">
							<span class="font-medium">{log.actor.email}</span>
							<span class="ml-1 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground"
								>{log.actorRoles.join(', ')}</span
							>
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<span
								class="rounded px-2 py-0.5 text-xs font-medium {log.action === 'CREATE'
									? 'bg-green-500/15 text-green-800 dark:text-green-400'
									: log.action === 'DELETE'
										? 'bg-red-500/15 text-red-700 dark:text-red-400'
										: log.action === 'UPDATE'
											? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
											: log.action === 'LOGIN_FAILED'
												? 'bg-amber-500/15 text-amber-800 dark:text-amber-400'
												: 'bg-muted text-muted-foreground'}"
							>
								{log.action}
							</span>
						</td>
						<td class="px-4 py-3 whitespace-nowrap">{log.entityType}</td>
						<td class="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
							{log.entityId.slice(0, 12)}…
						</td>
						<!--
								#242: the payload never arrives with the list. One entry at a time, through the
								audited ?/reveal action — reaching it is itself a recorded event.
							-->
						<td class="px-4 py-3">
							{#if !log.hasChanges}
								<span class="text-xs text-muted-foreground">—</span>
							{:else if revealed && revealed.id === log.id}
								<div
									class="space-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-live="polite"
									tabindex="-1"
									use:focusOnMount
								>
									{#if revealed.oldValue !== null}
										<div>
											<span class="text-xs font-medium text-red-600">Before:</span>
											<pre
												class="mt-0.5 max-w-xs overflow-x-auto rounded bg-muted p-1 text-xs">{JSON.stringify(
													revealed.oldValue,
													null,
													2
												)}</pre>
										</div>
									{/if}
									{#if revealed.newValue !== null}
										<div>
											<span class="text-xs font-medium text-green-600">After:</span>
											<pre
												class="mt-0.5 max-w-xs overflow-x-auto rounded bg-muted p-1 text-xs">{JSON.stringify(
													revealed.newValue,
													null,
													2
												)}</pre>
										</div>
									{/if}
								</div>
							{:else if data.canReveal}
								<form method="POST" action="?/reveal">
									<input type="hidden" name="id" value={log.id} />
									<button
										type="submit"
										class="rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										aria-label="Reveal the recorded changes for {log.action} on {log.entityType} {log.entityId} — this reveal is logged"
									>
										Reveal changes
									</button>
								</form>
							{:else}
								<span class="text-xs text-muted-foreground">Hidden</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#snippet emptyState()}
		<div class="text-muted-foreground">No audit log entries match the selected filters.</div>
	{/snippet}

	{#snippet footer()}
		<Pagination meta={data.pagination} />
	{/snippet}
</PanelPage>

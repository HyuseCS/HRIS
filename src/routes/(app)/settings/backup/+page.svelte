<script lang="ts">
	import Banner from '$lib/components/ui/Banner.svelte'
	import { enhance } from '$app/forms'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import Table from '$lib/components/ui/Table.svelte'
	import type { Column } from '$lib/components/ui/table'
	import { addToast } from '$lib/stores/toast.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	// No `form` prop: the save result is handled in the submit callback below, so nothing on
	// this page reads `ActionData`.
	let { data }: { data: PageData } = $props()

	// #108: a double-click would fire two redundant writes of the config row.
	//
	// The result is announced from the submit callback, NOT from an `$effect` watching `form`.
	// `addToast` pushes onto a `$state` array, and `Array.prototype.push` reads the array as
	// well as writing it — inside an effect that is a read-write cycle, and Svelte 5 aborts the
	// page with `effect_update_depth_exceeded`. Written that way the save succeeded (HTTP 200,
	// row committed) while the toast never rendered and the console filled with errors.
	const save = createSubmitGuard(() => async ({ update, result }) => {
		await update()
		if (result.type === 'success') addToast('Backup schedule saved.', { kind: 'success' })
		else if (result.type === 'failure') {
			const d = result.data as { error?: string } | undefined
			addToast(d?.error ?? 'That schedule could not be saved.', { kind: 'error' })
		}
	})

	// svelte-ignore state_referenced_locally
	let enabled = $state(data.config.enabled)
	// svelte-ignore state_referenced_locally
	let intervalDays = $state(data.config.intervalDays)
	// svelte-ignore state_referenced_locally
	let retentionCount = $state(data.config.retentionCount)
	// svelte-ignore state_referenced_locally
	let destinationKind = $state(data.config.destinationKind)

	// Re-sync after a save so the controls show what was actually written, not what was typed.
	$effect(() => {
		enabled = data.config.enabled
		intervalDays = data.config.intervalDays
		retentionCount = data.config.retentionCount
		destinationKind = data.config.destinationKind
	})

	const dateTime = new Intl.DateTimeFormat('en-PH', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Asia/Manila'
	})
	const fmt = (d: Date | string | null) => (d ? dateTime.format(new Date(d)) : '—')

	// Binary prefixes, because this counts bytes on a disk.
	function fmtBytes(n: number): string {
		if (n < 1024) return `${n} B`
		const units = ['KB', 'MB', 'GB', 'TB']
		let v = n / 1024
		let i = 0
		while (v >= 1024 && i < units.length - 1) {
			v /= 1024
			i++
		}
		return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
	}

	const columns: Column[] = [
		{ key: 'startedAt', label: 'Started', width: 'min' },
		{ key: 'status', label: 'Status', width: 'min' },
		// `min` so the counts stay on one line; Detail is the only column that should absorb slack.
		{ key: 'files', label: 'Files', width: 'min' },
		{ key: 'size', label: 'Size', align: 'right', width: 'min' },
		{ key: 'destinationKind', label: 'Destination', width: 'min', hideOnMobile: true },
		{ key: 'error', label: 'Detail' }
	]

	// Backups only ever run from the droplet's crontab — the app has no scheduler. So "on, but
	// nothing has ever run" is the one state that looks configured and silently is not, and it
	// is worth saying out loud rather than leaving an admin to infer it from an empty table.
	const neverRan = $derived(data.config.enabled && data.lastCompletedAt === null)
</script>

<svelte:head>
	<title>Document Backup — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<PageHeader
		title="Document Backup"
		description="Copies every employee 201 file and request attachment to a second location on a schedule."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	<div class="card">
		<dl class="grid gap-4 sm:grid-cols-3">
			<div class="space-y-1">
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</dt>
				<dd>
					<Badge
						status={data.config.enabled ? 'On' : 'Off'}
						tone={data.config.enabled ? 'green' : 'gray'}
					/>
				</dd>
			</div>
			<div class="space-y-1">
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Last completed
				</dt>
				<dd class="text-sm">{fmt(data.lastCompletedAt)}</dd>
			</div>
			<div class="space-y-1">
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next due</dt>
				<dd class="text-sm">
					{#if !data.config.enabled}
						<span class="text-muted-foreground">Backups are off</span>
					{:else if data.lastCompletedAt === null}
						On the next nightly run
					{:else}
						{fmt(data.nextDueAt)}
					{/if}
				</dd>
			</div>
		</dl>

		{#if neverRan}
			<Banner kind="warning" class="mt-4">
				Backups are switched on but none has run yet. They are started by a nightly job on the
				server, not by this app — if nothing appears after tonight, ask your administrator to
				confirm the <code class="font-mono text-xs">backup-documents</code> schedule is installed.
			</Banner>
		{/if}
	</div>

	<form method="POST" action="?/save" use:enhance={save.enhance} class="card space-y-5">
		<label class="flex items-start gap-3">
			<input
				type="checkbox"
				name="enabled"
				bind:checked={enabled}
				class="mt-0.5 h-4 w-4 rounded border-input accent-primary"
			/>
			<span>
				<span class="block text-sm font-medium">Back up documents automatically</span>
				<span class="block text-sm text-muted-foreground">
					When off, nothing is copied and no history is recorded.
				</span>
			</span>
		</label>

		<div class="grid gap-4 sm:grid-cols-3">
			<div class="grid gap-1.5">
				<label for="intervalDays" class="text-sm font-medium">Run every</label>
				<div class="flex items-center gap-2">
					<input
						id="intervalDays"
						name="intervalDays"
						type="number"
						min="1"
						max="90"
						required
						bind:value={intervalDays}
						class="input w-24"
					/>
					<span class="text-sm text-muted-foreground">day(s)</span>
				</div>
				<p class="text-xs text-muted-foreground">Counted from the last completed backup.</p>
			</div>

			<div class="grid gap-1.5">
				<label for="retentionCount" class="text-sm font-medium">Keep the last</label>
				<div class="flex items-center gap-2">
					<input
						id="retentionCount"
						name="retentionCount"
						type="number"
						min="1"
						max="30"
						required
						bind:value={retentionCount}
						class="input w-24"
					/>
					<span class="text-sm text-muted-foreground">backup(s)</span>
				</div>
				<p class="text-xs text-muted-foreground">Older backups are deleted after a run succeeds.</p>
			</div>

			<div class="grid gap-1.5">
				<label for="destinationKind" class="text-sm font-medium">Destination</label>
				<select
					id="destinationKind"
					name="destinationKind"
					bind:value={destinationKind}
					class="input"
				>
					<option value="LOCAL">Server disk</option>
					<option value="S3">S3-compatible storage</option>
				</select>
				<p class="text-xs text-muted-foreground">Where it writes is set on the server, not here.</p>
			</div>
		</div>

		<div class="flex justify-end">
			<button type="submit" class="btn-primary" disabled={save.busy}>
				{save.busy ? 'Saving…' : 'Save schedule'}
			</button>
		</div>
	</form>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold tracking-tight">Recent backups</h2>
		<Table
			{columns}
			rows={data.history}
			getKey={(r) => r.id}
			emptyTitle="No backups yet"
			emptyDescription="Once backups are switched on, each nightly run is listed here with what it copied."
		>
			{#snippet cell(row, column)}
				{#if column.key === 'startedAt'}
					{fmt(row.startedAt)}
				{:else if column.key === 'status'}
					<Badge status={row.status} domain="backupRun" />
				{:else if column.key === 'files'}
					<span class="text-sm">
						{row.fileCount} copied
						{#if row.skippedCount > 0}
							<span class="text-muted-foreground">· {row.skippedCount} skipped</span>
						{/if}
						{#if row.failedCount > 0}
							<span class="text-red-500 dark:text-red-400">· {row.failedCount} failed</span>
						{/if}
					</span>
				{:else if column.key === 'size'}
					<span class="tabular-nums">{fmtBytes(row.totalBytes)}</span>
				{:else if column.key === 'destinationKind'}
					<span class="text-sm text-muted-foreground">
						{row.destinationKind === 'LOCAL' ? 'Server disk' : 'S3'}
					</span>
				{:else if column.key === 'error'}
					{#if row.error}
						<span class="text-sm text-muted-foreground">{row.error}</span>
					{:else if !row.filesRetained}
						<span class="text-sm text-muted-foreground">Files removed by retention</span>
					{:else}
						<span class="text-muted-foreground">—</span>
					{/if}
				{/if}
			{/snippet}
		</Table>
	</section>
</div>

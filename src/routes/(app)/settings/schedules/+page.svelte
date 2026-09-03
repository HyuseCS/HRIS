<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import { enhance } from '$app/forms'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showCreate = $state(false)

	// #108: a double-click would create a duplicate work schedule.
	const createSchedule = createSubmitGuard()
	// #162: same guard on the threshold form — a double submit writes (and audits) it twice.
	const saveAmPmGap = createSubmitGuard()

	const DOW = [
		{ v: 1, l: 'Mon' },
		{ v: 2, l: 'Tue' },
		{ v: 3, l: 'Wed' },
		{ v: 4, l: 'Thu' },
		{ v: 5, l: 'Fri' },
		{ v: 6, l: 'Sat' },
		{ v: 0, l: 'Sun' }
	]
	const label = (w: number) => DOW.find((d) => d.v === w)?.l ?? String(w)
	const toHHMM = (m: number) =>
		`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
</script>

<svelte:head>
	<title>Work Schedules — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Work Schedules">
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	<!-- A message tagged with a `field` belongs to that control and is rendered beside it, not
	     here — a page-top banner cannot say which card it came from. -->
	{#if form?.error && !form?.field}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-400"
		>
			{form.error}
		</div>
	{/if}

	<!-- #190: org-wide master switch. ANDs with each schedule's own flag in the table below. -->
	<div class="flex items-center justify-between gap-4 rounded-lg border p-4">
		<div>
			<p class="text-sm font-medium">Track tardiness organization-wide</p>
			<p class="text-xs text-muted-foreground">
				When off, no employee is marked <span class="font-medium">Late</span> anywhere, regardless of
				the per-schedule settings below.
			</p>
		</div>
		<form method="POST" action="?/toggleOrgTardiness" use:enhance>
			<input type="hidden" name="enabled" value={(!data.orgTracksTardiness).toString()} />
			<button
				type="submit"
				class="rounded-full px-3 py-1 text-xs font-medium {data.orgTracksTardiness
					? 'bg-green-500/15 text-green-700 dark:text-green-400'
					: 'bg-muted text-muted-foreground'}">{data.orgTracksTardiness ? 'On' : 'Off'}</button
			>
		</form>
	</div>

	{#if data.showAmPmGap}
		<!-- #162: per-tenant AM/PM boundary. Food-service tenants only. The min/max/step attributes
		     below are a convenience, NOT the validation — the action re-checks the bounds server-side
		     and must keep doing so even though the input appears to limit them. -->
		{@const gapError = form?.field === 'minutes' ? form.error : undefined}
		<div class="space-y-3 rounded-lg border p-4">
			<div>
				<p class="text-sm font-medium">AM / PM break length</p>
				<!-- The columns this controls are labelled PM In / PM Out, so the copy says
				     afternoon, never evening — one name per thing. -->
				<p id="amPmMinGap-desc" class="text-xs text-muted-foreground">
					A break at least this long splits the day into a morning (AM) and an afternoon (PM) block
					on Attendance. Shorter breaks are ignored. Leave blank for the default, {data.amPmMinGapDefault}
					minutes. Allowed: 5 to 240. Changes apply to days derived from now on — press Refresh on Attendance
					to re-split older days.
				</p>
			</div>
			<form
				method="POST"
				action="?/setAmPmMinGap"
				use:enhance={saveAmPmGap.enhance}
				class="flex flex-wrap items-end gap-3"
			>
				<div class="grid gap-1.5">
					<label for="amPmMinGap" class="text-sm font-medium">Minutes</label>
					<input
						id="amPmMinGap"
						name="minutes"
						type="number"
						min="5"
						max="240"
						step="1"
						placeholder={String(data.amPmMinGapDefault)}
						value={data.amPmMinGapMinutes ?? ''}
						aria-invalid={gapError ? true : undefined}
						aria-describedby={gapError ? 'amPmMinGap-desc amPmMinGap-error' : 'amPmMinGap-desc'}
						class="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm"
					/>
				</div>
				<button type="submit" disabled={saveAmPmGap.busy} class="btn-primary"
					>{saveAmPmGap.busy ? 'Saving…' : 'Save'}</button
				>
			</form>
			<!-- Outside the form row, not inside the field's grid: growing the row would drag the
			     bottom-aligned Save button down with it. `aria-describedby` carries the association. -->
			{#if gapError}
				<p id="amPmMinGap-error" class="text-xs text-red-600 dark:text-red-400">{gapError}</p>
			{/if}
			{#if form?.saved}
				<p role="status" class="text-xs text-green-600 dark:text-green-400">{form.saved}</p>
			{/if}
		</div>
	{/if}

	{#if showCreate}
		<form
			method="POST"
			action="?/create"
			use:enhance={createSchedule.enhance}
			class="rounded-lg border p-4 space-y-4"
		>
			<h2 class="font-semibold">New Work Schedule</h2>
			<div class="grid gap-3 sm:grid-cols-4">
				<div class="sm:col-span-2">
					<label for="name" class="text-sm font-medium">Name</label>
					<input
						id="name"
						name="name"
						required
						placeholder="Regular (Mon–Fri 8–5)"
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
					/>
				</div>
				<div>
					<label for="start" class="text-sm font-medium">Start</label>
					<input
						id="start"
						name="start"
						type="time"
						value="08:00"
						required
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
					/>
				</div>
				<div>
					<label for="end" class="text-sm font-medium">End</label>
					<input
						id="end"
						name="end"
						type="time"
						value="17:00"
						required
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
					/>
				</div>
				<div>
					<label for="breakMinutes" class="text-sm font-medium">Break (min)</label>
					<input
						id="breakMinutes"
						name="breakMinutes"
						type="number"
						step="5"
						min="0"
						value="60"
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
					/>
				</div>
			</div>
			<div>
				<span class="text-sm font-medium">Working days</span>
				<div class="mt-1 flex flex-wrap gap-3">
					{#each DOW as d (d.v)}
						<label class="flex items-center gap-1.5 text-sm">
							<input type="checkbox" name="weekday" value={d.v} checked={d.v >= 1 && d.v <= 5} />
							{d.l}
						</label>
					{/each}
				</div>
			</div>
			<label class="flex items-center gap-2 text-sm"
				><input type="checkbox" name="isDefault" /> Set as the organization default</label
			>
			<label class="flex items-center gap-2 text-sm"
				><input type="checkbox" name="trackTardiness" checked /> Track tardiness for this schedule</label
			>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (showCreate = false)}
					class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button
				>
				<button
					type="submit"
					disabled={createSchedule.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{createSchedule.busy ? 'Creating…' : 'Create'}</button
				>
			</div>
		</form>
	{/if}

	<section class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">Schedules</h2>
			<div
				class="ml-auto flex basis-full shrink-0 flex-wrap items-center justify-end gap-2 sm:basis-auto"
			>
				<button
					onclick={() => (showCreate = !showCreate)}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>New Schedule</button
				>
			</div>
		</div>
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Days</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Shift</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Tardiness</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Employees</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.schedules as s (s.id)}
						{@const shift = s.days[0]}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3 font-medium"
								>{s.name}
								{#if s.isDefault}<span
										class="ml-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-700 dark:text-green-400"
										>default</span
									>{/if}</td
							>
							<td class="px-4 py-3 text-muted-foreground"
								>{s.days.map((d) => label(d.weekday)).join(', ') || '—'}</td
							>
							<td class="px-4 py-3 text-muted-foreground"
								>{shift
									? `${toHHMM(shift.startMinutes)}–${toHHMM(shift.endMinutes)} · ${shift.breakMinutes}m break`
									: '—'}</td
							>
							<td class="px-4 py-3">
								<form method="POST" action="?/toggleTardiness" use:enhance>
									<input type="hidden" name="id" value={s.id} />
									<input type="hidden" name="enabled" value={(!s.trackTardiness).toString()} />
									<button
										type="submit"
										disabled={!data.orgTracksTardiness}
										title={data.orgTracksTardiness
											? 'Toggle tardiness tracking for this schedule'
											: 'Turn on the org-wide setting in Company Info first'}
										class="rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50 {s.trackTardiness
											? 'bg-green-500/15 text-green-700 dark:text-green-400'
											: 'bg-muted text-muted-foreground'}">{s.trackTardiness ? 'On' : 'Off'}</button
									>
								</form>
							</td>
							<td class="px-4 py-3 text-right">{s._count.employees}</td>
						</tr>
					{:else}
						<tr
							><td colspan="5" class="p-0"
								><EmptyState
									title="No schedules yet"
									description="Until one is marked the organization default, unassigned employees fall back to Mon–Fri 8:00–17:00."
								/></td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

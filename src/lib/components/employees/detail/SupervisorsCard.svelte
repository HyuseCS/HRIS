<script lang="ts">
	import type { Snippet } from 'svelte'
	import { enhance } from '$app/forms'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { EmployeeDetailData } from './shared'

	let { data, actionError }: { data: EmployeeDetailData; actionError: Snippet<[string[]]> } =
		$props()

	const employee = $derived(data.employee)
	const setSupervisors = submitFeedback({ error: null })
</script>

<div class="rounded-lg border bg-card p-6 space-y-4">
	<h2 class="font-semibold">Supervisors</h2>
	{@render actionError(['setSupervisors'])}
	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
		<dt class="text-muted-foreground">Primary</dt>
		<dd>
			<!-- R3: Last, First in a definition list, matching the roster and the picker
			     eight lines below. Only prose keeps First Last. -->
			{employee.reportsTo ? `${employee.reportsTo.lastName}, ${employee.reportsTo.firstName}` : '—'}
		</dd>
		<dt class="text-muted-foreground">Also reports to</dt>
		<dd>
			{#if data.additionalSupervisors.length}
				{data.additionalSupervisors.map((s) => s.name).join(', ')}
			{:else}
				<span class="text-muted-foreground">—</span>
			{/if}
		</dd>
	</dl>
	{#if data.canManage}
		<form
			method="POST"
			action="?/setSupervisors"
			use:enhance={setSupervisors.enhance}
			class="space-y-2 border-t pt-3"
		>
			<!--
				Checkboxes, not a multi-select: a `<select multiple>` needs Ctrl/Cmd-click to
				pick a second name and silently drops the first without it. Same field name,
				same action — `getAll('supervisorIds')` reads both shapes identically.
			-->
			<fieldset class="space-y-2">
				<legend class="text-xs font-medium text-muted-foreground"> Additional supervisors </legend>
				{#if data.supervisorOptions.length}
					<div class="max-h-48 space-y-1 overflow-y-auto rounded-md border border-input p-2">
						{#each data.supervisorOptions as opt (opt.id)}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="supervisorIds"
									value={opt.id}
									checked={data.additionalSupervisors.some((s) => s.id === opt.id)}
									class="h-4 w-4 rounded border-input"
								/>
								{opt.lastName}, {opt.firstName}
							</label>
						{/each}
					</div>
				{:else}
					<p class="text-xs text-muted-foreground">No other employees to pick from.</p>
				{/if}
			</fieldset>
			<button
				type="submit"
				disabled={setSupervisors.busy}
				class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
				>{setSupervisors.busy ? 'Saving…' : 'Save supervisors'}</button
			>
		</form>
	{/if}
</div>

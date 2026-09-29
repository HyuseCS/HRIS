<script lang="ts">
	import { enhance } from '$app/forms'
	import { isValidGovId, govIdError, type GovIdField } from '$lib/utils/gov-ids'
	import MaskedField from '$lib/components/ui/MaskedField.svelte'
	import type { EmployeeDetailData, FeedbackGuard, Revealed } from './shared'

	let {
		data,
		revealed,
		reveal
	}: { data: EmployeeDetailData; revealed: Revealed; reveal: FeedbackGuard } = $props()

	// Label + field pairs for the Government IDs card, so the display and its format warning
	// stay in step with the validator's field names.
	const GOV_ID_ROWS: { field: GovIdField; label: string }[] = [
		{ field: 'sssNumber', label: 'SSS Number' },
		{ field: 'philhealthNumber', label: 'PhilHealth No.' },
		{ field: 'pagibigNumber', label: 'Pag-IBIG No.' },
		{ field: 'tinNumber', label: 'TIN' }
	]
	const employee = $derived(data.employee)
</script>

<div class="rounded-lg border bg-card p-6 space-y-4">
	<div class="flex items-center justify-between gap-3">
		<h2 class="font-semibold">Government IDs</h2>
		{#if data.canReveal && !revealed}
			<form method="POST" action="?/reveal" use:enhance={reveal.enhance}>
				<button
					type="submit"
					disabled={reveal.busy}
					class="text-xs text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
					title="Revealing sensitive fields is recorded in the audit log"
					>{reveal.busy ? 'Revealing…' : 'Reveal IDs'}</button
				>
			</form>
		{/if}
	</div>
	<dl class="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
		{#each GOV_ID_ROWS as row (row.field)}
			<MaskedField
				label={row.label}
				masked={employee[row.field]}
				value={revealed?.[row.field]}
				mono
			>
				<!-- #191 validates on entry, but values stored before it can be malformed. The
			     client only holds the masked value, so the flag is shown once revealed —
			     it is surfaced, never blocking (an unchanged bad ID never stops a save). -->
				{#if revealed && !isValidGovId(row.field, revealed[row.field])}
					<span
						class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-400"
						title={govIdError(row.field)}>check format</span
					>
				{/if}
			</MaskedField>
		{/each}
	</dl>
</div>

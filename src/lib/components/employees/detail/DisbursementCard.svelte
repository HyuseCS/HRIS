<script lang="ts">
	import { enhance } from '$app/forms'
	import MaskedField from '$lib/components/ui/MaskedField.svelte'
	import type { EmployeeDetailData, FeedbackGuard, Revealed } from './shared'

	let {
		data,
		revealed,
		reveal
	}: { data: EmployeeDetailData; revealed: Revealed; reveal: FeedbackGuard } = $props()

	const employee = $derived(data.employee)
</script>

<div class="rounded-lg border bg-card p-6 space-y-4">
	<div class="flex items-center justify-between gap-3">
		<h2 class="font-semibold">
			Disbursement
			<span class="text-xs font-normal text-muted-foreground">(bank / GCash — sensitive)</span>
		</h2>
		{#if data.canReveal && !revealed}
			<form method="POST" action="?/reveal" use:enhance={reveal.enhance}>
				<button
					type="submit"
					disabled={reveal.busy}
					class="text-xs text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
					title="Revealing full numbers is recorded in the audit log"
					>{reveal.busy ? 'Revealing…' : 'Reveal full numbers'}</button
				>
			</form>
		{/if}
	</div>
	<dl class="grid grid-cols-2 gap-3 text-sm">
		<dt class="text-muted-foreground">Bank</dt>
		<dd>{employee.bankName ?? '—'}</dd>
		<dt class="text-muted-foreground">Account Name</dt>
		<dd>{employee.bankAccountName ?? '—'}</dd>
		<MaskedField
			label="Account No."
			masked={employee.bankAccountNumber}
			value={revealed?.bankAccountNumber}
			mono
		/>
		<MaskedField
			label="GCash No."
			masked={employee.gcashNumber}
			value={revealed?.gcashNumber}
			mono
		/>
	</dl>
</div>

<script lang="ts">
	import { tick } from 'svelte'
	import { newId } from '$lib/performance/ids'
	import type { SignatoryRole, SignatorySlot } from '$lib/server/performance/types'
	import RowControls from './RowControls.svelte'
	import { smallInputClass, type ErrorAt } from './rows'

	/**
	 * The signing order. ORDER IS THE DATA: index 0 signs first, and this list is the sequential
	 * sign-off rule's only source of truth — so moving a row here changes who signs when.
	 *
	 * The four roles are spelled out rather than imported: `SIGNATORY_ROLES` is a runtime value in
	 * `$lib/server/**`, which SvelteKit refuses to bundle into the client. `signatorySlotSchema`
	 * validates the posted value against that server-side list, so a drift here fails on Save
	 * rather than reaching the database.
	 */
	let {
		slots,
		error
	}: {
		slots: SignatorySlot[]
		error: ErrorAt
	} = $props()

	const roleOptions: { value: SignatoryRole; label: string }[] = [
		{ value: 'IMMEDIATE_SUPERVISOR', label: 'Immediate Supervisor' },
		{ value: 'HR_REPRESENTATIVE', label: 'HR Representative' },
		{ value: 'DEPARTMENT_HEAD', label: 'Department Head' },
		{ value: 'EMPLOYEE', label: 'Employee' }
	]

	async function add() {
		const row: SignatorySlot = { id: newId('sig'), role: 'IMMEDIATE_SUPERVISOR', label: '' }
		slots.push(row)
		await tick()
		document.getElementById(`sig-${row.id}`)?.focus()
	}
</script>

<div class="space-y-2">
	<p class="text-xs text-muted-foreground">Signed top to bottom — the first row signs first.</p>
	<ul class="space-y-2">
		{#each slots as slot, i (slot.id)}
			{@const rowError = error(`signatoryOrder.${i}`)}
			<li class="flex items-start gap-2">
				<span class="mt-2 w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
				<div class="w-52 shrink-0">
					<select
						bind:value={slot.role}
						aria-label="Role for signatory {i + 1}"
						class={smallInputClass}
					>
						{#each roleOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>
				<div class="flex-1">
					<input
						id="sig-{slot.id}"
						bind:value={slot.label}
						placeholder="Printed label, e.g. Immediate Supervisor"
						aria-label="Printed label for signatory {i + 1}"
						class="{smallInputClass} {rowError ? 'border-destructive' : ''}"
					/>
					{#if rowError}
						<p class="template-row-error mt-1 text-xs text-destructive">{rowError}</p>
					{/if}
				</div>
				<RowControls
					rows={slots}
					index={i}
					label={slot.label.trim() || `signatory ${i + 1}`}
					canRemove={slots.length > 1}
					remove={() => slots.splice(i, 1)}
				/>
			</li>
		{/each}
	</ul>
	{#if error('signatoryOrder')}
		<p class="template-row-error text-xs text-destructive">{error('signatoryOrder')}</p>
	{/if}
	<button
		type="button"
		onclick={add}
		class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
	>
		Add signatory
	</button>
</div>

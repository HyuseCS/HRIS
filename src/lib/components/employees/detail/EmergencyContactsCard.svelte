<script lang="ts">
	import type { Snippet } from 'svelte'
	import { enhance } from '$app/forms'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { EmployeeDetailData } from './shared'

	let { data, actionError }: { data: EmployeeDetailData; actionError: Snippet<[string[]]> } =
		$props()

	const employee = $derived(data.employee)
	const canManage = $derived(data.canManage)

	// The 201 file used to carry ONE emergency contact in three columns on the employee row; the
	// `emergencyContacts` relation replaced it. Records created before the relation still hold
	// those columns, so they are shown read-only rather than lost — but only when all three are
	// filled and no real contact already covers that person. Display only: no migration, no write.
	const legacyEmergencyContact = $derived.by(() => {
		const name = employee.emergencyContactName?.trim()
		const relationship = employee.emergencyContactRelation?.trim()
		const phone = employee.emergencyContactPhone?.trim()
		if (!name || !relationship || !phone) return null
		const covered = employee.emergencyContacts.some(
			(c) => c.name.trim().toLowerCase() === name.toLowerCase()
		)
		return covered ? null : { name, relationship, phone }
	})
	const deleteEmergencyContact = submitFeedback({ error: null })
	const addEmergencyContact = submitFeedback({ error: null })
</script>

<section class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2">
	<h2 class="font-semibold">
		Emergency Contacts
		<span class="text-xs font-normal text-muted-foreground">(name, relationship, phone)</span>
	</h2>
	{@render actionError(['addEmergencyContact', 'deleteEmergencyContact'])}

	{#if employee.emergencyContacts.length || legacyEmergencyContact}
		<div class="card-scroll rounded-md border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Relationship</th>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
						{#if canManage}<th class="px-3 py-2"></th>{/if}
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each employee.emergencyContacts as c (c.id)}
						<tr class="hover:bg-muted/30">
							<td class="px-3 py-2 font-medium">{c.name}</td>
							<td class="px-3 py-2">{c.relationship}</td>
							<td class="px-3 py-2 font-mono">{c.phone}</td>
							{#if canManage}
								<td class="px-3 py-2 text-right">
									<form
										method="POST"
										action="?/deleteEmergencyContact"
										use:enhance={deleteEmergencyContact.enhance}
									>
										<input type="hidden" name="contactId" value={c.id} />
										<button
											type="submit"
											disabled={deleteEmergencyContact.busy}
											class="rounded-md border border-red-500/20 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-50"
											>{deleteEmergencyContact.busy ? 'Removing…' : 'Remove'}</button
										>
									</form>
								</td>
							{/if}
						</tr>
					{/each}
					{#if legacyEmergencyContact}
						<tr class="bg-muted/20">
							<td class="px-3 py-2 font-medium">
								{legacyEmergencyContact.name}
								<span class="block text-xs font-normal text-muted-foreground">
									Legacy record — On file from the old single-contact field. Add it as a contact
									above to make it editable.
								</span>
							</td>
							<td class="px-3 py-2">{legacyEmergencyContact.relationship}</td>
							<td class="px-3 py-2 font-mono">{legacyEmergencyContact.phone}</td>
							{#if canManage}<td class="px-3 py-2"></td>{/if}
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="text-xs text-muted-foreground">No emergency contacts on record.</p>
	{/if}

	{#if canManage}
		<form
			method="POST"
			action="?/addEmergencyContact"
			use:enhance={addEmergencyContact.enhance}
			class="flex flex-wrap items-end gap-2 border-t pt-3"
		>
			<div class="grid gap-1">
				<label for="ec-name" class="text-xs font-medium text-muted-foreground">Name</label>
				<input
					id="ec-name"
					name="name"
					type="text"
					required
					placeholder="Full name"
					class="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs"
				/>
			</div>
			<div class="grid gap-1">
				<label for="ec-rel" class="text-xs font-medium text-muted-foreground">Relationship</label>
				<input
					id="ec-rel"
					name="relationship"
					type="text"
					required
					placeholder="e.g. Spouse"
					class="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs"
				/>
			</div>
			<div class="grid gap-1">
				<label for="ec-phone" class="text-xs font-medium text-muted-foreground">Phone</label>
				<input
					id="ec-phone"
					name="phone"
					type="tel"
					required
					placeholder="e.g. 0917xxxxxxx"
					class="h-8 w-40 rounded-md border border-input bg-background px-2 text-xs"
				/>
			</div>
			<button
				disabled={addEmergencyContact.busy}
				class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>{addEmergencyContact.busy ? 'Adding…' : 'Add Contact'}</button
			>
		</form>
	{/if}
</section>

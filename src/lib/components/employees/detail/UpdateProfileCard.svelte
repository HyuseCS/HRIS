<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { EmployeeDetailData, EmployeeDetailForm, Revealed } from './shared'

	let {
		data,
		form,
		revealed
	}: { data: EmployeeDetailData; form: EmployeeDetailForm; revealed: Revealed } = $props()

	const employee = $derived(data.employee)
	// The schedule an unassigned employee actually falls back to, named from the org's data.
	const orgDefaultSchedule = $derived(data.schedules?.find((s) => s.isDefault) ?? null)
	const update = submitFeedback({ error: null })
</script>

<form
	id="update-profile"
	method="POST"
	action="?/update"
	use:enhance={update.enhance}
	class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2"
>
	<h2 class="font-semibold">Update Profile</h2>
	<!--
		Three forms on this page can look like the right one for a pay change, and picking
		the wrong one silently skips the audited career event. Each says what it is for and
		links the other two.
	-->
	<p class="text-sm text-muted-foreground">
		Corrects personal and contact details. Does not change pay or position — use
		<a href="?tab=compensation#change-salary" class="text-primary hover:underline">Change Salary</a>
		or
		<a href="?tab=compensation#promote" class="text-primary hover:underline">Promote</a>
		for those.
	</p>
	<!--
	Gated on form.action: this is the ONLY error slot on a page with 21 actions, so
	an ungated block painted a failed addLoan (or document delete) into this form.
	Phase 07 gives every form its own slot; until then an untagged action reports
	nowhere, which is the lesser harm.
-->
	{#if form?.action === 'update' && form?.success}
		<Banner kind="success" message="Saved." />
	{:else if form?.action === 'update' && form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-red-400"
		>
			{form.error}
		</div>
	{/if}
	<div class="grid gap-3 sm:grid-cols-3">
		<div>
			<label for="jobTitle" class="text-sm font-medium">Job Title</label>
			<input
				id="jobTitle"
				name="jobTitle"
				value={employee.jobTitle}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div>
			<label for="departmentId" class="text-sm font-medium">Department</label>
			<select
				id="departmentId"
				name="departmentId"
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{#each data.departments as dept (dept.id)}
					<option value={dept.id} selected={dept.id === employee.departmentId}>{dept.name}</option>
				{/each}
			</select>
		</div>
		{#if data.showBranches}
			<div>
				<label for="branchId" class="text-sm font-medium">Branch</label>
				<select
					id="branchId"
					name="branchId"
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="">— No branch —</option>
					{#each data.branches as br (br.id)}
						<option value={br.id} selected={br.id === employee.branchId}
							>{br.name}{br.status === 'CLOSED' ? ' (closed)' : ''}</option
						>
					{/each}
				</select>
				<p class="mt-1 text-xs text-muted-foreground">Which store this employee works out of.</p>
			</div>
		{/if}
		<div class="sm:col-span-3">
			<label for="companyEmail" class="text-sm font-medium">Company Email</label>
			<input
				id="companyEmail"
				name="companyEmail"
				type="email"
				value={employee.companyEmail ?? ''}
				placeholder="e.g. first.last@company.ph"
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			<p class="mt-1 text-xs text-muted-foreground">
				Seeded with the hire's working email at onboarding — update it once the real company address
				is provisioned.
			</p>
		</div>
		<div class="sm:col-span-3">
			<label for="discordId" class="text-sm font-medium">Discord ID</label>
			<input
				id="discordId"
				name="discordId"
				value={employee.discordId ?? ''}
				placeholder="e.g. 123456789012345678 — for the time-tracking bot"
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			<p class="mt-1 text-xs text-muted-foreground">
				In Discord: enable Developer Mode → right-click the user → Copy User ID. Leave blank to
				unlink.
			</p>
		</div>
		<div>
			<label for="workScheduleId" class="text-sm font-medium">Work Schedule</label>
			<select
				id="workScheduleId"
				name="workScheduleId"
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<!-- Names the org's actual default rather than a hardcoded shift, so the label
			     cannot drift from what the attendance engine really applies. -->
				<option value=""
					>{orgDefaultSchedule
						? `Not assigned — follows ${orgDefaultSchedule.name}`
						: 'Not assigned — no organization default set'}</option
				>
				{#each data.schedules as s (s.id)}
					<option value={s.id} selected={s.id === employee.workScheduleId}>{s.name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="positionId" class="text-sm font-medium">Position</label>
			<select
				id="positionId"
				name="positionId"
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="">— No position —</option>
				{#each data.positions as p (p.id)}
					<option value={p.id} selected={p.id === employee.positionId}>{p.title}</option>
				{/each}
			</select>
			<p class="mt-1 text-xs text-muted-foreground">
				Sets the pay band used for the salary check above.
			</p>
		</div>
		<div class="sm:col-span-3 border-t pt-3">
			<h3 class="text-sm font-semibold text-muted-foreground">
				Government IDs <span class="font-normal">(payroll registration)</span>
			</h3>
			<p class="mt-1 text-xs text-muted-foreground">
				Stored IDs stay masked; reveal above to edit, or leave a field blank to keep the current
				value.
			</p>
		</div>
		<div>
			<label for="sssNumber" class="text-sm font-medium">SSS Number</label>
			<input
				id="sssNumber"
				name="sssNumber"
				value={revealed?.sssNumber ?? ''}
				placeholder={employee.sssNumber ?? ''}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div>
			<label for="philhealthNumber" class="text-sm font-medium">PhilHealth No.</label>
			<input
				id="philhealthNumber"
				name="philhealthNumber"
				value={revealed?.philhealthNumber ?? ''}
				placeholder={employee.philhealthNumber ?? ''}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div>
			<label for="pagibigNumber" class="text-sm font-medium">Pag-IBIG No.</label>
			<input
				id="pagibigNumber"
				name="pagibigNumber"
				value={revealed?.pagibigNumber ?? ''}
				placeholder={employee.pagibigNumber ?? ''}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div>
			<label for="tinNumber" class="text-sm font-medium">TIN</label>
			<input
				id="tinNumber"
				name="tinNumber"
				value={revealed?.tinNumber ?? ''}
				placeholder={employee.tinNumber ?? ''}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<!--
			Emergency contacts are edited in their own section (the `emergencyContacts`
			relation), not here — three surfaces for one thing is what the audit flagged.
			`?/update` still accepts the legacy singular fields; this form just stops
			sending them.
		-->
		<div class="sm:col-span-3 border-t pt-3">
			<h3 class="text-sm font-semibold text-muted-foreground">
				Disbursement <span class="font-normal">(bank / GCash — sensitive)</span>
			</h3>
			<p class="mt-1 text-xs text-muted-foreground">
				Stored numbers stay masked; leave a field blank to keep the current value.
			</p>
		</div>
		<div>
			<label for="bankName" class="text-sm font-medium">Bank Name</label>
			<input
				id="bankName"
				name="bankName"
				value={employee.bankName ?? ''}
				placeholder="e.g. BDO"
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div>
			<label for="bankAccountName" class="text-sm font-medium">Account Name</label>
			<input
				id="bankAccountName"
				name="bankAccountName"
				value={employee.bankAccountName ?? ''}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div>
			<label for="bankAccountNumber" class="text-sm font-medium">Bank Account No.</label>
			<input
				id="bankAccountNumber"
				name="bankAccountNumber"
				value={revealed?.bankAccountNumber ?? ''}
				placeholder={employee.bankAccountNumber ?? 'Account number'}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div>
			<label for="gcashNumber" class="text-sm font-medium">GCash No.</label>
			<input
				id="gcashNumber"
				name="gcashNumber"
				value={revealed?.gcashNumber ?? ''}
				placeholder={employee.gcashNumber ?? 'e.g. 0917xxxxxxx'}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
	</div>
	<div class="flex justify-end">
		<button
			type="submit"
			disabled={update.busy}
			class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>{update.busy ? 'Saving…' : 'Save Changes'}</button
		>
	</div>
</form>

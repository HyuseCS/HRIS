<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import {
		rateBasisOptionsFor,
		rateBasisCopy,
		isRateBasisAllowed,
		type RateBasis
	} from '$lib/utils/rate-basis'
	import { EMPLOYMENT_TYPE_OPTIONS } from '$lib/utils/employment-type'
	// Placeholders come from the same table the server validates against, so the example HR
	// sees can never disagree with what is accepted (#191).
	import { GOV_ID_FORMATS } from '$lib/utils/gov-ids'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: a double-click here would create a duplicate employee + user + welcome email.
	const create = createSubmitGuard()

	// PROBATIONARY first so it is the browser's default selection (#136). Shared with the promote
	// form (#222) so the labels cannot drift apart.
	const EMPLOYMENT_TYPES = EMPLOYMENT_TYPE_OPTIONS

	// #120: the amount field means different things per basis, so its label follows the selection.
	// Re-seeded from `form` so a failed submit redisplays the basis HR actually chose.
	let rateType = $state<RateBasis>('MONTHLY')
	$effect(() => {
		rateType = (form?.values?.rateType as RateBasis) ?? 'MONTHLY'
	})
	const rate = $derived(rateBasisCopy(rateType))

	// Red-border the specific field(s) the server rejected (#142).
	const invalid = (name: string) =>
		(form as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors?.[name]
			? true
			: undefined

	// #188: new hires start on probation.
	let employmentType = $state('PROBATIONARY')
	$effect(() => {
		employmentType = (form?.values?.employmentType as string) ?? 'PROBATIONARY'
	})

	// #189: hourly applies only to part-time and on-call, so the list follows the employment
	// type. The server refuses the pairing too — this only keeps HR from picking a combination
	// that would bounce back.
	const rateOptions = $derived(rateBasisOptionsFor(employmentType))
	// Switching to a type that cannot be hourly must not leave a now-invalid basis selected.
	$effect(() => {
		if (!isRateBasisAllowed(rateType, employmentType)) rateType = 'MONTHLY'
	})
</script>

<svelte:head>
	<title>New Employee — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<PageHeader title="Onboard New Employee">
		{#snippet back()}
			<a href="/employees" class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</a>
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<div
			class="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{typeof form.error === 'string' ? form.error : 'Please fix the errors below.'}
		</div>
	{/if}

	<!-- Remount the whole form when the active org changes (org switcher). Otherwise the
	     org-scoped selects reload for the new tenant while the typed fields linger, silently
	     blanking the required Department field and wedging submit (#ceo-switch). -->
	{#key data.organizationId}
		<form method="POST" action="?/create" use:enhance={create.enhance} class="space-y-8">
			<!-- Personal Information -->
			<fieldset class="rounded-md border p-4 space-y-4">
				<legend class="px-1 text-sm font-semibold">Personal Information</legend>
				<div class="grid gap-4 sm:grid-cols-3">
					<div>
						<label for="firstName" class="text-sm font-medium"
							>First Name <span class="text-destructive">*</span></label
						>
						<input
							id="firstName"
							name="firstName"
							aria-invalid={invalid('firstName')}
							required
							value={form?.values?.firstName ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.firstName}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.firstName[0]}</p>
						{/if}
					</div>
					<div>
						<label for="lastName" class="text-sm font-medium"
							>Last Name <span class="text-destructive">*</span></label
						>
						<input
							id="lastName"
							name="lastName"
							aria-invalid={invalid('lastName')}
							required
							value={form?.values?.lastName ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.lastName}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.lastName[0]}</p>
						{/if}
					</div>
					<div>
						<label for="middleName" class="text-sm font-medium">Middle Name</label>
						<input
							id="middleName"
							name="middleName"
							value={form?.values?.middleName ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				</div>
			</fieldset>

			<!-- Contact Information -->
			<fieldset class="rounded-md border p-4 space-y-4">
				<legend class="px-1 text-sm font-semibold">Contact Information</legend>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="contactPhone" class="text-sm font-medium">Phone</label>
						<input
							id="contactPhone"
							name="contactPhone"
							type="tel"
							value={form?.values?.contactPhone ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div>
						<label for="contactAddress" class="text-sm font-medium">Address</label>
						<input
							id="contactAddress"
							name="contactAddress"
							value={form?.values?.contactAddress ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				</div>
			</fieldset>

			<!-- Account -->
			<fieldset class="rounded-md border p-4 space-y-4">
				<legend class="px-1 text-sm font-semibold">Account</legend>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="email" class="text-sm font-medium"
							>Email <span class="text-destructive">*</span></label
						>
						<input
							id="email"
							name="email"
							aria-invalid={invalid('email')}
							type="email"
							required
							value={form?.values?.email ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.email}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.email[0]}</p>
						{/if}
					</div>
					<div>
						<label for="password" class="text-sm font-medium">Password</label>
						<input
							id="password"
							name="password"
							type="password"
							placeholder="Leave blank to auto-generate"
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						<p class="mt-1 text-xs text-muted-foreground">
							If left blank, a temporary password will be generated and emailed.
						</p>
					</div>
					<div>
						<label for="role" class="text-sm font-medium"
							>Role <span class="text-destructive">*</span></label
						>
						<select
							id="role"
							name="role"
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<!-- Mirrors HIRE_ROLES in $lib/rbac — the server rejects anything else (#248). -->
							<option value="EMPLOYEE">Employee</option>
							<option value="MANAGER">Manager</option>
							<option value="HR_ADMIN">HR Admin</option>
						</select>
					</div>
					<div>
						<label for="discordId" class="text-sm font-medium">Discord ID</label>
						<input
							id="discordId"
							name="discordId"
							aria-invalid={invalid('discordId')}
							value={form?.values?.discordId ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						<p class="mt-1 text-xs text-muted-foreground">
							Links this employee to the Discord time-tracking bot. In Discord: Developer Mode →
							right-click the user → Copy User ID. Optional — can be set later.
						</p>
						{#if form?.fieldErrors?.discordId}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.discordId[0]}</p>
						{/if}
					</div>
				</div>
			</fieldset>

			<!-- Employment -->
			<fieldset class="rounded-md border p-4 space-y-4">
				<legend class="px-1 text-sm font-semibold">Employment Details</legend>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="departmentId" class="text-sm font-medium"
							>Department <span class="text-destructive">*</span></label
						>
						<select
							id="departmentId"
							name="departmentId"
							aria-invalid={invalid('departmentId')}
							required
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="">Select department…</option>
							{#each data.departments as dept (dept.id)}
								<option value={dept.id}>{dept.name}</option>
							{/each}
						</select>
						{#if form?.fieldErrors?.departmentId}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.departmentId[0]}</p>
						{/if}
					</div>
					<div>
						<label for="jobTitle" class="text-sm font-medium"
							>Job Title <span class="text-destructive">*</span></label
						>
						<input
							id="jobTitle"
							name="jobTitle"
							aria-invalid={invalid('jobTitle')}
							required
							value={form?.values?.jobTitle ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.jobTitle}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.jobTitle[0]}</p>
						{/if}
					</div>
					<div>
						<label for="employmentType" class="text-sm font-medium"
							>Employment Type <span class="text-destructive">*</span></label
						>
						<select
							id="employmentType"
							name="employmentType"
							bind:value={employmentType}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<!-- New hires start probationary (#136); regularization is automatic at 6 months.
						     `selected` also repopulates the choice after a failed submit, which the bare
						     options did not do. -->
							{#each EMPLOYMENT_TYPES as [val, label] (val)}
								<option
									value={val}
									selected={(form?.values?.employmentType ?? 'PROBATIONARY') === val}
									>{label}</option
								>
							{/each}
						</select>
					</div>
					<div>
						<label for="startDate" class="text-sm font-medium"
							>Start Date <span class="text-destructive">*</span></label
						>
						<input
							id="startDate"
							name="startDate"
							aria-invalid={invalid('startDate')}
							type="date"
							required
							value={form?.values?.startDate ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.startDate}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.startDate[0]}</p>
						{/if}
					</div>
					<div>
						<label for="rateType" class="text-sm font-medium"
							>Rate Basis <span class="text-destructive">*</span></label
						>
						<select
							id="rateType"
							name="rateType"
							bind:value={rateType}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{#each rateOptions as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
						{#if form?.fieldErrors?.rateType}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.rateType[0]}</p>
						{/if}
					</div>
					<div>
						<label for="basicMonthlySalary" class="text-sm font-medium"
							>{rate.label} <span class="text-destructive">*</span></label
						>
						<input
							id="basicMonthlySalary"
							name="basicMonthlySalary"
							type="number"
							min="0"
							step={rate.step}
							required
							value={form?.values?.basicMonthlySalary ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						<p class="mt-1 text-xs text-muted-foreground">{rate.hint}</p>
						{#if form?.fieldErrors?.basicMonthlySalary}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.basicMonthlySalary[0]}</p>
						{/if}
					</div>
					<div>
						<label for="reportsToId" class="text-sm font-medium">Reports To</label>
						<select
							id="reportsToId"
							name="reportsToId"
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="">None</option>
							{#each data.employees as emp (emp.id)}
								<option value={emp.id}>{emp.lastName}, {emp.firstName}</option>
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
							<option value="">None</option>
							{#each data.positions as pos (pos.id)}
								<option value={pos.id} selected={form?.values?.positionId === pos.id}
									>{pos.title}</option
								>
							{/each}
						</select>
					</div>
					<div>
						<label for="workScheduleId" class="text-sm font-medium">Work Schedule</label>
						<select
							id="workScheduleId"
							name="workScheduleId"
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="">None</option>
							{#each data.workSchedules as ws (ws.id)}
								<option
									value={ws.id}
									selected={form?.values?.workScheduleId
										? form.values.workScheduleId === ws.id
										: ws.isDefault}>{ws.name}</option
								>
							{/each}
						</select>
						<p class="mt-1 text-xs text-muted-foreground">
							Attendance derivation uses this schedule — set it now or the new hire's days won't
							compute until it's assigned.
						</p>
					</div>
				</div>
			</fieldset>

			<!-- Government IDs -->
			<fieldset class="rounded-md border p-4 space-y-4">
				<legend class="px-1 text-sm font-semibold">Government IDs</legend>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="sssNumber" class="text-sm font-medium">SSS Number</label>
						<input
							id="sssNumber"
							name="sssNumber"
							aria-invalid={invalid('sssNumber')}
							value={form?.values?.sssNumber ?? ''}
							placeholder={GOV_ID_FORMATS.sssNumber.example}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.sssNumber}
							<p class="mt-1 text-xs text-red-400">{form.fieldErrors.sssNumber[0]}</p>
						{/if}
					</div>
					<div>
						<label for="philhealthNumber" class="text-sm font-medium">PhilHealth Number</label>
						<input
							id="philhealthNumber"
							name="philhealthNumber"
							aria-invalid={invalid('philhealthNumber')}
							value={form?.values?.philhealthNumber ?? ''}
							placeholder={GOV_ID_FORMATS.philhealthNumber.example}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.philhealthNumber}
							<p class="mt-1 text-xs text-red-400">{form.fieldErrors.philhealthNumber[0]}</p>
						{/if}
					</div>
					<div>
						<label for="pagibigNumber" class="text-sm font-medium">Pag-IBIG Number</label>
						<input
							id="pagibigNumber"
							name="pagibigNumber"
							aria-invalid={invalid('pagibigNumber')}
							value={form?.values?.pagibigNumber ?? ''}
							placeholder={GOV_ID_FORMATS.pagibigNumber.example}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.pagibigNumber}
							<p class="mt-1 text-xs text-red-400">{form.fieldErrors.pagibigNumber[0]}</p>
						{/if}
					</div>
					<div>
						<label for="tinNumber" class="text-sm font-medium">TIN Number</label>
						<input
							id="tinNumber"
							name="tinNumber"
							aria-invalid={invalid('tinNumber')}
							value={form?.values?.tinNumber ?? ''}
							placeholder={GOV_ID_FORMATS.tinNumber.example}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.tinNumber}
							<p class="mt-1 text-xs text-red-400">{form.fieldErrors.tinNumber[0]}</p>
						{/if}
					</div>
				</div>
			</fieldset>

			<!-- Emergency Contact -->
			<fieldset class="rounded-md border p-4 space-y-4">
				<legend class="px-1 text-sm font-semibold">Emergency Contact</legend>
				<div class="grid gap-4 sm:grid-cols-3">
					<div>
						<label for="emergencyContactName" class="text-sm font-medium">Contact Name</label>
						<input
							id="emergencyContactName"
							name="emergencyContactName"
							value={form?.values?.emergencyContactName ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div>
						<label for="emergencyContactRelation" class="text-sm font-medium">Relationship</label>
						<input
							id="emergencyContactRelation"
							name="emergencyContactRelation"
							value={form?.values?.emergencyContactRelation ?? ''}
							placeholder="e.g. Spouse, Parent"
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div>
						<label for="emergencyContactPhone" class="text-sm font-medium">Contact Phone</label>
						<input
							id="emergencyContactPhone"
							name="emergencyContactPhone"
							value={form?.values?.emergencyContactPhone ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				</div>
			</fieldset>

			<!-- Bank / GCash Details -->
			<fieldset class="rounded-md border p-4 space-y-4">
				<legend class="px-1 text-sm font-semibold">Bank / GCash Details</legend>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="bankName" class="text-sm font-medium">Bank</label>
						<input
							id="bankName"
							name="bankName"
							value={form?.values?.bankName ?? ''}
							placeholder="e.g. BDO, BPI"
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div>
						<label for="bankAccountName" class="text-sm font-medium">Account Name</label>
						<input
							id="bankAccountName"
							name="bankAccountName"
							value={form?.values?.bankAccountName ?? ''}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div>
						<label for="bankAccountNumber" class="text-sm font-medium">Account Number</label>
						<input
							id="bankAccountNumber"
							name="bankAccountNumber"
							aria-invalid={invalid('bankAccountNumber')}
							value={form?.values?.bankAccountNumber ?? ''}
							placeholder={GOV_ID_FORMATS.bankAccountNumber.example}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.bankAccountNumber}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.bankAccountNumber[0]}</p>
						{/if}
					</div>
					<div>
						<label for="gcashNumber" class="text-sm font-medium">GCash Number</label>
						<input
							id="gcashNumber"
							name="gcashNumber"
							aria-invalid={invalid('gcashNumber')}
							value={form?.values?.gcashNumber ?? ''}
							placeholder={GOV_ID_FORMATS.gcashNumber.example}
							class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						{#if form?.fieldErrors?.gcashNumber}
							<p class="mt-1 text-xs text-destructive">{form.fieldErrors.gcashNumber[0]}</p>
						{/if}
					</div>
				</div>
			</fieldset>

			<div class="flex justify-end gap-3">
				<a href="/employees" class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</a>
				<button
					type="submit"
					disabled={create.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{create.busy ? 'Creating…' : 'Create Employee'}
				</button>
			</div>
		</form>
	{/key}
</div>

<script module lang="ts">
	export const TYPES = [
		{ value: 'LEAVE', label: 'Leave' },
		{ value: 'OVERTIME', label: 'Overtime' },
		{ value: 'UNDERTIME', label: 'Undertime' },
		{ value: 'OFFICIAL_BUSINESS', label: 'Official Business' },
		{ value: 'REST_DAY_WORK', label: 'Work on Rest Day' },
		{ value: 'HOLIDAY_WORK', label: 'Holiday Work' },
		{ value: 'INFO_UPDATE', label: 'Info Update' }
	]
</script>

<script lang="ts">
	import { enhance } from '$app/forms'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import BalanceSummary from '$lib/components/leave/BalanceSummary.svelte'
	import DatePicker from '$lib/components/ui/DatePicker.svelte'
	import FileInput from '$lib/components/ui/FileInput.svelte'
	import { formatDateISO, manilaDayKey, tenureRequirement } from '$lib/utils/dates'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'

	type LeaveTypeOption = {
		id: string
		name: string
		minMonthsOfService: number
		eligible: boolean
	}
	type LeaveBalance = {
		id: string
		leaveType: { name: string; isPaid: boolean }
		allocated: number
		used: number
	}
	type CreateResult = {
		error?: string
		fieldErrors?: Record<string, string[]>
		values?: Record<string, string>
	} | null

	let {
		open = $bindable(),
		leaveTypes,
		balancesByYear,
		form
	}: {
		open: boolean
		leaveTypes: LeaveTypeOption[]
		balancesByYear: Record<number, LeaveBalance[]>
		form: CreateResult
	} = $props()

	// Pre-select the first type the filer can actually use — defaulting to leaveTypes[0]
	// would land on a disabled option when that type is tenure-gated (#137).
	const defaultLeaveTypeId = $derived(leaveTypes.find((lt) => lt.eligible)?.id ?? '')

	// Submitted values echoed back by a failed create action — re-populates the form
	// on a non-enhanced (no-JS) rerender; with enhance the browser keeps the inputs,
	// so capturing only the initial value of `form` here is intentional.
	// svelte-ignore state_referenced_locally
	const submitted = form?.values

	let selectedType = $state(submitted?.type ?? 'LEAVE')

	// Per-field validation errors returned by the create action (zod fieldErrors).
	const fieldErrors = $derived(form?.fieldErrors)
	const fe = (name: string) => fieldErrors?.[name]?.[0]
	const invalid = (name: string) => (fe(name) ? true : undefined)
	const describedBy = (name: string) => (fe(name) ? `${name}-error` : undefined)

	// Date guards: start can't be before today; end can't be before start.
	const today = formatDateISO(new Date())
	let startDate = $state(submitted?.startDate ?? '')
	const balances = $derived(
		balancesByYear[Number((startDate || manilaDayKey(new Date())).slice(0, 4))] ?? []
	)
	let endPicker: ReturnType<typeof DatePicker> | undefined = $state()

	const isDayHours = (t: string) =>
		['OVERTIME', 'UNDERTIME', 'REST_DAY_WORK', 'HOLIDAY_WORK'].includes(t)

	// #108: a double-click would file the same request twice (and re-upload its attachments).
	// The existing close-on-success handler is wrapped so it still runs.
	const create = submitFeedback({
		inner:
			() =>
			async ({ update, result }) => {
				await update()
				if (result.type === 'success') open = false
			}
	})
</script>

{#snippet req()}<span class="text-red-500" aria-hidden="true">*</span>{/snippet}
{#snippet fieldError(name: string)}
	{#if fe(name)}<p id="{name}-error" class="text-xs text-red-600">{fe(name)}</p>{/if}
{/snippet}

<Dialog bind:open title="New Request" size="wide" scroll>
	<form
		method="POST"
		action="?/create"
		enctype="multipart/form-data"
		use:enhance={create.enhance}
		class="flex min-h-0 flex-1 flex-col gap-4"
	>
		<h2 class="font-semibold">New Request</h2>

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if selectedType === 'LEAVE' && balances.length > 0}
				<div class="mb-4">
					<BalanceSummary {balances} />
				</div>
			{/if}

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="space-y-4">
					<div class="grid gap-1.5">
						<label for="type" class="text-sm font-medium">Type</label>
						<select
							id="type"
							name="type"
							bind:value={selectedType}
							class="h-9 rounded-md border border-input bg-background px-3 text-sm"
						>
							{#each TYPES as t (t.value)}
								<option value={t.value}>{t.label}</option>
							{/each}
						</select>
					</div>

					{#if selectedType === 'LEAVE'}
						<div class="grid gap-1.5">
							<label for="leaveTypeId" class="text-sm font-medium">Leave type {@render req()}</label
							>
							<select
								id="leaveTypeId"
								name="leaveTypeId"
								required
								value={submitted?.leaveTypeId ?? defaultLeaveTypeId}
								aria-invalid={invalid('leaveTypeId')}
								aria-describedby={describedBy('leaveTypeId')}
								class="h-9 rounded-md border border-input bg-background px-3 text-sm"
							>
								{#each leaveTypes as lt (lt.id)}
									<option value={lt.id} disabled={!lt.eligible}>
										{lt.name}{lt.eligible
											? ''
											: ` — available after ${tenureRequirement(lt.minMonthsOfService)}`}
									</option>
								{/each}
							</select>
							{@render fieldError('leaveTypeId')}
						</div>
					{:else if selectedType === 'OFFICIAL_BUSINESS'}
						<div class="grid gap-1.5">
							<label for="location" class="text-sm font-medium">Location {@render req()}</label>
							<input
								id="location"
								name="location"
								type="text"
								required
								value={submitted?.location ?? ''}
								aria-invalid={invalid('location')}
								aria-describedby={describedBy('location')}
								class="h-9 rounded-md border border-input bg-background px-3 text-sm"
							/>
							{@render fieldError('location')}
						</div>
						<div class="grid gap-1.5">
							<label for="purpose" class="text-sm font-medium">Purpose {@render req()}</label>
							<input
								id="purpose"
								name="purpose"
								type="text"
								required
								value={submitted?.purpose ?? ''}
								aria-invalid={invalid('purpose')}
								aria-describedby={describedBy('purpose')}
								class="h-9 rounded-md border border-input bg-background px-3 text-sm"
							/>
							{@render fieldError('purpose')}
						</div>
					{:else if selectedType === 'INFO_UPDATE'}
						<div class="grid gap-1.5">
							<label for="field" class="text-sm font-medium">Field {@render req()}</label>
							<input
								id="field"
								name="field"
								type="text"
								required
								placeholder="e.g. contactAddress"
								value={submitted?.field ?? ''}
								aria-invalid={invalid('field')}
								aria-describedby={describedBy('field')}
								class="h-9 rounded-md border border-input bg-background px-3 text-sm"
							/>
							{@render fieldError('field')}
						</div>
						<div class="grid gap-1.5">
							<label for="requestedValue" class="text-sm font-medium"
								>New value {@render req()}</label
							>
							<input
								id="requestedValue"
								name="requestedValue"
								type="text"
								required
								value={submitted?.requestedValue ?? ''}
								aria-invalid={invalid('requestedValue')}
								aria-describedby={describedBy('requestedValue')}
								class="h-9 rounded-md border border-input bg-background px-3 text-sm"
							/>
							{@render fieldError('requestedValue')}
						</div>
					{/if}

					{#if selectedType !== 'OFFICIAL_BUSINESS'}
						<div class="grid gap-1.5">
							<label for="reason" class="text-sm font-medium"
								>Reason <span class="text-muted-foreground">(optional)</span></label
							>
							<textarea
								id="reason"
								name="reason"
								rows="2"
								value={submitted?.reason ?? ''}
								class="rounded-md border border-input bg-background px-3 py-2 text-sm"
							></textarea>
						</div>
					{/if}
				</div>

				<div class="flex flex-col gap-4">
					{#if selectedType === 'LEAVE' || selectedType === 'OFFICIAL_BUSINESS'}
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div class="grid gap-1.5">
								<label for="startDate" class="text-sm font-medium">Start {@render req()}</label>
								<DatePicker
									id="startDate"
									name="startDate"
									required
									min={today}
									bind:value={startDate}
									onchange={(v) => {
										if (v) endPicker?.focusAndOpen()
									}}
									aria-invalid={invalid('startDate')}
									aria-describedby={describedBy('startDate')}
									class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
								/>
								{@render fieldError('startDate')}
							</div>
							<div class="grid gap-1.5">
								<label for="endDate" class="text-sm font-medium">End {@render req()}</label>
								<DatePicker
									bind:this={endPicker}
									id="endDate"
									name="endDate"
									required
									min={startDate || today}
									value={submitted?.endDate ?? ''}
									aria-invalid={invalid('endDate')}
									aria-describedby={describedBy('endDate')}
									class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
								/>
								{@render fieldError('endDate')}
							</div>
						</div>
					{:else if isDayHours(selectedType)}
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div class="grid gap-1.5">
								<label for="date" class="text-sm font-medium">Date {@render req()}</label>
								<DatePicker
									id="date"
									name="date"
									required
									value={submitted?.date ?? ''}
									aria-invalid={invalid('date')}
									aria-describedby={describedBy('date')}
									class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
								/>
								{@render fieldError('date')}
							</div>
							<div class="grid gap-1.5">
								<label for="hours" class="text-sm font-medium">Hours {@render req()}</label>
								<input
									id="hours"
									name="hours"
									type="number"
									step="0.25"
									min="0.25"
									max="24"
									required
									value={submitted?.hours ?? ''}
									aria-invalid={invalid('hours')}
									aria-describedby={describedBy('hours')}
									class="h-9 rounded-md border border-input bg-background px-3 text-sm"
								/>
								{@render fieldError('hours')}
							</div>
						</div>
					{/if}

					<div class="flex flex-1 flex-col gap-1.5">
						<label for="documents" class="text-sm font-medium"
							>Supporting documents <span class="text-muted-foreground">(optional)</span></label
						>
						<FileInput
							id="documents"
							name="documents"
							multiple
							accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
							maxFiles={5}
							maxBytes={10 * 1024 * 1024}
							hint="Up to 5 files — PDF, PNG, JPEG or WEBP, max 10 MB each."
						/>
					</div>
				</div>
			</div>
		</div>

		<div class="flex justify-end">
			<button
				type="submit"
				disabled={create.busy}
				class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>
				{create.busy ? 'Submitting…' : 'Submit request'}
			</button>
		</div>
	</form>
</Dialog>

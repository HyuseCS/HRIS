<script lang="ts">
	import {
		periodOf,
		periodShareOf,
		customRangeError,
		formatPeriodPreview,
		toPeriodInputValue,
		type PeriodKind
	} from '$lib/utils/pay-periods'

	// Standard pay-period picker (#129): a month + year select and a segmented
	// First-half / Second-half / Whole-month control that together resolve to one of the
	// three standard shapes. It emits the resolved bounds as hidden inputs (default names
	// periodStart/periodEnd, overridable for forms that post start/end), so the surrounding
	// <form> submits exactly the same field names it did with the old date inputs — the
	// service layer still validates, this just constrains what a user can pick.
	//
	// #163 adds a fourth segment, `Custom range`, which reveals two native date inputs. #3 lets
	// that range cross a month boundary, capped at one month of pay. It feeds the SAME two hidden
	// inputs, so no consumer changes shape, and it is never pre-selected — the 15-day cutoff stays
	// the path of least resistance.
	//
	// `compact` is for narrow containers (the New Timesheet dialog): Period becomes a select on
	// its own line instead of a four-button segmented control, which needs ~545px and cannot fit
	// beside Month and Year inside a modal.
	let {
		startName = 'periodStart',
		endName = 'periodEnd',
		year = $bindable(),
		month0 = $bindable(),
		kind = $bindable('FIRST_HALF'),
		compact = false
	}: {
		startName?: string
		endName?: string
		year?: number
		month0?: number
		kind?: PeriodKind | 'CUSTOM'
		compact?: boolean
	} = $props()

	// Default to the current PHT month when the parent didn't seed a value.
	const now = new Date()
	if (year === undefined) year = now.getFullYear()
	if (month0 === undefined) month0 = now.getMonth()

	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	]
	// A small window around the current year covers routine runs and back-dated corrections.
	const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

	const KIND_OPTIONS: { value: PeriodKind | 'CUSTOM'; label: string }[] = [
		{ value: 'FIRST_HALF', label: 'First half (1–15)' },
		{ value: 'SECOND_HALF', label: 'Second half (16–EOM)' },
		{ value: 'WHOLE_MONTH', label: 'Whole month' },
		{ value: 'CUSTOM', label: 'Custom range' }
	]

	// YYYY-MM-DD, the `<input type="date">` convention — `new Date(v)` parses it to the same
	// UTC midnight the rest of pay-periods.ts works in.
	let customStart = $state('')
	let customEnd = $state('')

	const isCustom = $derived(kind === 'CUSTOM')

	/** The two custom dates once BOTH are filled in and parseable; otherwise null. */
	const customRange = $derived.by(() => {
		if (!isCustom || !customStart || !customEnd) return null
		const s = new Date(customStart)
		const e = new Date(customEnd)
		if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
		return { s, e }
	})

	// Literally the same function the three service gates refuse with, so the inline message and
	// the 400 the service would return can never disagree.
	const customError = $derived(customRange ? customRangeError(customRange.s, customRange.e) : null)

	const validCustom = $derived(customRange && !customError ? customRange : null)

	// #3: the size cap expressed as native `min`/`max` on the date inputs, so the browser's own
	// calendar greys out the unreachable days instead of letting a user pick one and only then
	// reading an error. The inline message and the server gate both stay — this is the cheap first
	// line, not the guard.
	//
	// ponytail: linear probe, ceiling ~40 iterations per keystroke. The cap is one month of pay,
	// so no acceptable range can be longer than 31 days and the loop always breaks early. Upgrade
	// path if it ever gets hot: a closed-form bound from daysInMonth, which would be a second
	// expression of the cap rule and is exactly what D-B says not to write until it is needed.
	function capBound(anchor: string, step: 1 | -1): string | undefined {
		if (!anchor) return undefined
		const a = new Date(anchor)
		if (Number.isNaN(a.getTime())) return undefined
		let best = a
		for (let i = 1; i <= 40; i++) {
			const candidate = new Date(
				Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate() + step * i)
			)
			const start = step === 1 ? a : candidate
			const end = step === 1 ? candidate : a
			if (customRangeError(start, end) !== null) break
			best = candidate
		}
		return toPeriodInputValue(best)
	}

	/** Latest end date the cap allows for the chosen start, and the earliest start for an end. */
	const capBoundEnd = $derived(capBound(customStart, 1))
	const capBoundStart = $derived(capBound(customEnd, -1))

	const period = $derived(periodOf(kind as PeriodKind, year as number, month0 as number))

	// An incomplete or invalid custom range emits empty strings, so the server never receives
	// half a range — the actions' `z.coerce.date()` refuses '' and returns a clean 400.
	const startValue = $derived(
		isCustom ? (validCustom ? customStart : '') : toPeriodInputValue(period.periodStart)
	)
	const endValue = $derived(
		isCustom ? (validCustom ? customEnd : '') : toPeriodInputValue(period.periodEnd)
	)

	const preview = $derived.by(() => {
		if (!isCustom) return formatPeriodPreview(period.periodStart, period.periodEnd)
		if (!validCustom) return 'Pick a start and end date'
		const share = Math.round(periodShareOf(validCustom.s, validCustom.e) * 100)
		return `${formatPeriodPreview(validCustom.s, validCustom.e)} · statutory and loans prorated to ${share}% of a month`
	})

	const selectClass =
		'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
</script>

<!-- Resolved bounds travel with the form; the controls below are UI only. -->
<input type="hidden" name={startName} value={startValue} />
<input type="hidden" name={endName} value={endValue} />

<div class="space-y-3">
	<!-- Month, Year and Period share one line. The selects are sized to their content rather than
	     stretched to a third of the panel each. The full-width variant's Period is a four-button
	     segmented control needing ~545px, so it declares that and drops to its own line when the
	     container cannot give it (buttons wrap again below that). The `compact` variant is a single
	     select, so all three fit one line even in the 448px the `max-w-lg` New Timesheet dialog
	     leaves — Month and Year give up the width Period needs for `Second half (16–EOM)`. Below
	     that, at 390px the dialog leaves 294px and the select would be squeezed to ~60px, so it
	     declares the 200px it needs and wraps to its own line instead. -->
	<div class="flex flex-wrap items-start gap-3">
		<div class="{compact ? 'w-32' : 'w-40'} space-y-1.5">
			<label for="pp-month" class="block text-sm font-medium">Month</label>
			<select id="pp-month" bind:value={month0} class={selectClass}>
				{#each MONTHS as name, i (name)}
					<option value={i}>{name}</option>
				{/each}
			</select>
		</div>
		<div class="{compact ? 'w-20' : 'w-24'} space-y-1.5">
			<label for="pp-year" class="block text-sm font-medium">Year</label>
			<select id="pp-year" bind:value={year} class={selectClass}>
				{#each YEARS as y (y)}
					<option value={y}>{y}</option>
				{/each}
			</select>
		</div>

		<div class="{compact ? 'min-w-[200px]' : 'min-w-0 basis-[545px]'} flex-1 space-y-1.5">
			{#if compact}
				<label for="pp-kind" class="block text-sm font-medium">Period</label>
				<select id="pp-kind" bind:value={kind} class={selectClass}>
					{#each KIND_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			{:else}
				<span class="block text-sm font-medium">Period</span>
				<div
					class="flex min-h-9 flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1"
					role="group"
				>
					{#each KIND_OPTIONS as opt (opt.value)}
						<button
							type="button"
							onclick={() => (kind = opt.value)}
							aria-pressed={kind === opt.value}
							class="flex h-7 items-center rounded px-3 text-sm font-medium transition-colors {kind ===
							opt.value
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-accent'}"
						>
							{opt.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Revealed below the buttons, so the block only ever grows downward. -->
	{#if isCustom}
		<div class="space-y-1.5">
			<!-- Sized like Month rather than stretched across the panel, so the revealed row
			     lines up with the controls above it. -->
			<div class="flex flex-wrap gap-3">
				<div class="w-40 space-y-1.5">
					<label for="pp-custom-start" class="block text-sm font-medium">Start date</label>
					<input
						id="pp-custom-start"
						type="date"
						bind:value={customStart}
						min={capBoundStart}
						max={customEnd || undefined}
						class={selectClass}
						aria-invalid={customError ? 'true' : undefined}
						aria-describedby={customError ? 'pp-custom-error' : undefined}
					/>
				</div>
				<div class="w-40 space-y-1.5">
					<label for="pp-custom-end" class="block text-sm font-medium">End date</label>
					<input
						id="pp-custom-end"
						type="date"
						bind:value={customEnd}
						min={customStart || undefined}
						max={capBoundEnd}
						class={selectClass}
						aria-invalid={customError ? 'true' : undefined}
						aria-describedby={customError ? 'pp-custom-error' : undefined}
					/>
				</div>
			</div>
			{#if customError}
				<p id="pp-custom-error" class="text-sm text-destructive">{customError}</p>
			{/if}
		</div>
	{/if}

	<p class="text-sm text-muted-foreground" aria-live="polite">{preview}</p>
</div>

<script lang="ts">
	import { enhance } from '$app/forms'
	import type { SubmitFunction } from '@sveltejs/kit'
	import type { Snippet } from 'svelte'
	import ConfirmDialog from './ConfirmDialog.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'

	interface Props {
		/** Form action to POST on confirm, e.g. "?/deleteDocument". */
		action: string
		title?: string
		message?: string
		confirmText?: string
		/** Trigger button label + styling. */
		triggerLabel?: string
		triggerClass?: string
		disabled?: boolean
		/** Optional enhance handler (e.g. to clear a selection / close a modal on success). */
		submit?: SubmitFunction
		/** Hidden inputs to include in the form (ids, etc.). */
		children?: Snippet
		/** Toast text on success. Null (the default) keeps an existing call site silent. */
		successMessage?: string | null
		/** `title` attribute for the TRIGGER button — `title` above is the dialog heading. */
		triggerTitle?: string
	}

	let {
		action,
		title = 'Delete?',
		message = 'This action cannot be undone.',
		confirmText = 'Delete',
		triggerLabel = 'Delete',
		triggerClass = 'text-sm font-medium text-destructive hover:underline',
		disabled = false,
		submit,
		children,
		successMessage = null,
		triggerTitle
	}: Props = $props()

	let open = $state(false)
	let formEl = $state<HTMLFormElement>()

	// Both are read through a closure so a call site that swaps them per row still works —
	// reading them here directly would snapshot whatever they were on first render.
	const fb = submitFeedback({
		// An explicit prop wins; otherwise the action's own `saved` string is the message, so a
		// call site whose server already says what happened needs no prop at all.
		success: (data) => successMessage ?? (typeof data?.saved === 'string' ? data.saved : null),
		inner: (input) => submit?.(input)
	})

	// ConfirmDialog closes itself before calling `onconfirm`, which used to make a destructive
	// action look done the instant it was confirmed — the row was still there a second later.
	// `open` is $bindable, so re-opening it here in the same tick undoes that close without
	// touching the dialog, and the dialog then holds until the result resolves below.
	function confirmed() {
		open = true
		formEl?.requestSubmit()
	}

	// Close on the busy true -> false edge, so every result type (success, failure, redirect and
	// error) releases the dialog. `wasBusy` is a plain local: it tracks the edge, it is not state
	// anything renders.
	let wasBusy = false
	$effect(() => {
		if (fb.busy) wasBusy = true
		else if (wasBusy) {
			wasBusy = false
			open = false
		}
	})
</script>

<form method="POST" {action} use:enhance={fb.enhance} bind:this={formEl} class="contents">
	{@render children?.()}
	<button
		type="button"
		disabled={disabled || fb.busy}
		title={triggerTitle}
		onclick={() => (open = true)}
		class={triggerClass}>{triggerLabel}</button
	>
</form>

<ConfirmDialog
	bind:open
	{title}
	{message}
	confirmText={fb.busy ? 'Working…' : confirmText}
	onconfirm={confirmed}
/>

<script lang="ts">
	import Dialog from './Dialog.svelte'

	// Popup for decision notes (reject/return reasons). Replaces the inline
	// textareas on approval cards/bars so the layout stays put — the box here is
	// fixed-size and non-resizable. The reason is required; Confirm stays
	// disabled until something is typed.

	interface Props {
		open: boolean
		title?: string
		message?: string
		placeholder?: string
		confirmText?: string
		cancelText?: string
		/** Confirm button classes — defaults to the destructive red. */
		confirmClass?: string
		onconfirm?: (_reason: string) => void
	}

	let {
		open = $bindable(),
		title = 'Add a reason',
		message = '',
		placeholder = 'Explain the decision…',
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		confirmClass = 'bg-red-600 text-white hover:bg-red-700',
		onconfirm
	}: Props = $props()

	let reason = $state('')
	let boxEl = $state<HTMLTextAreaElement>()

	// Fresh note each time the dialog opens, and the box takes focus so typing can start
	// immediately. Dialog is told `initialFocus="none"` because both are $effects keyed on
	// `open` — left to its default the panel would win and the caret would land nowhere useful.
	$effect(() => {
		if (open) {
			reason = ''
			boxEl?.focus()
		}
	})

	function cancel() {
		open = false
	}
	function confirm() {
		const r = reason.trim()
		if (!r) return
		open = false
		onconfirm?.(r)
	}
</script>

<Dialog bind:open {title} size="md" zIndex={70} initialFocus="none">
	<h2 class="text-lg font-semibold">{title}</h2>
	{#if message}
		<p class="mt-1 text-sm text-muted-foreground">{message}</p>
	{/if}
	<textarea
		bind:this={boxEl}
		bind:value={reason}
		rows="4"
		{placeholder}
		class="mt-4 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	></textarea>
	<div class="mt-4 flex justify-end gap-2">
		<button
			type="button"
			onclick={cancel}
			class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">{cancelText}</button
		>
		<button
			type="button"
			onclick={confirm}
			disabled={reason.trim() === ''}
			class="rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 {confirmClass}"
			>{confirmText}</button
		>
	</div>
</Dialog>

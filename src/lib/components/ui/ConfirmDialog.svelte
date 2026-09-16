<script lang="ts">
	import Dialog from './Dialog.svelte'

	interface Props {
		open: boolean
		title?: string
		message?: string
		confirmText?: string
		cancelText?: string
		/** Colour of the confirm button. `primary` for routine saves that cannot be undone. */
		tone?: 'destructive' | 'primary'
		onconfirm?: () => void
	}

	let {
		open = $bindable(),
		title = 'Are you sure?',
		message = '',
		confirmText = 'Delete',
		cancelText = 'Cancel',
		tone = 'destructive',
		onconfirm
	}: Props = $props()

	function cancel() {
		open = false
	}
	function confirm() {
		open = false
		onconfirm?.()
	}
</script>

<Dialog bind:open {title} role="alertdialog" size="sm" zIndex={60}>
	<h2 class="text-lg font-semibold">{title}</h2>
	{#if message}
		<p class="mt-2 whitespace-pre-line text-sm text-muted-foreground">{message}</p>
	{/if}
	<div class="mt-6 flex justify-end gap-2">
		<button
			type="button"
			onclick={cancel}
			class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">{cancelText}</button
		>
		<button
			type="button"
			onclick={confirm}
			class="rounded-md px-4 py-2 text-sm font-medium {tone === 'primary'
				? 'bg-primary text-primary-foreground hover:bg-primary/90'
				: 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}"
			>{confirmText}</button
		>
	</div>
</Dialog>

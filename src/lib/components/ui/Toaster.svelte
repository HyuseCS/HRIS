<script lang="ts">
	import { getToasts, dismissToast } from '$lib/stores/toast.svelte'

	const toasts = $derived(getToasts())

	const kindClass = (k: string) =>
		k === 'success'
			? 'border-green-500/30 bg-green-500/10 text-green-300'
			: k === 'error'
				? 'border-red-500/30 bg-red-500/10 text-red-300'
				: 'border-border bg-card text-foreground'
</script>

<!--
	role="status" (not alert) — the container is persistent, so an assertive container would
	re-announce on every mutation. aria-atomic="false" is required: role="status" implies
	aria-atomic="true", which would read the WHOLE stack out again each time one toast arrives.
-->
<div
	role="status"
	aria-live="polite"
	aria-atomic="false"
	class="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
>
	{#each toasts as t (t.id)}
		<div
			aria-live={t.kind === 'error' ? 'assertive' : undefined}
			class="pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur {kindClass(
				t.kind
			)}"
		>
			<div class="min-w-0 flex-1">
				{#if t.link}
					<a
						href={t.link}
						onclick={() => dismissToast(t.id)}
						class="block break-words hover:underline">{t.message}</a
					>
				{:else}
					<span class="block break-words">{t.message}</span>
				{/if}
			</div>
			<button
				type="button"
				onclick={() => dismissToast(t.id)}
				aria-label="Dismiss"
				class="shrink-0 text-muted-foreground hover:text-foreground">✕</button
			>
		</div>
	{/each}
</div>

<script lang="ts">
	import type { Snippet } from 'svelte'

	// One form-feedback banner for the whole app. The recipe is lifted from
	// `separations/[id]/+page.svelte`, which already had it right; ~80 hand-rolled copies of it
	// had drifted into four paddings, three text sizes and a dozen colour pairs, and a third of
	// them were dark-only (`text-green-400` on a white card).
	//
	// The class strings below are COMPLETE and STATIC on purpose. Tailwind's JIT scans literal
	// strings in the source; an interpolated `bg-{kind}-500/10` compiles to no CSS at all, and
	// this project has no `safelist` in `tailwind.config` to rescue it. Never build one of these
	// out of fragments.
	const TONE = {
		// Light-mode steps measured over the composited tint on a card: `text-red-600` gave 4.24:1
		// and `text-green-600` only 3.03:1, both under the 4.5 floor. These are the same steps the
		// `.badge-*` tokens landed on for the same reason. Dark was already clear at 5.59 and 8.32.
		error:
			'rounded-md border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-400',
		success:
			'rounded-md border border-green-500/20 bg-green-500/10 px-4 py-2 text-sm text-green-800 dark:text-green-400',
		warning:
			'rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400',
		info: 'rounded-md border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-600 dark:text-blue-400'
	} as const

	let {
		kind,
		message,
		class: className,
		children
	}: {
		kind: 'error' | 'success' | 'warning' | 'info'
		/** The banner text. Use the `children` snippet instead when the copy needs markup. */
		message?: string
		/** Outer spacing/placement only — never colour. A few call sites need `mt-4` or a grid span. */
		class?: string
		children?: Snippet
	} = $props()

	// A failure and a caution interrupt a screen reader; a confirmation should not. This is the
	// split the punch page already got right.
	const role = $derived(kind === 'error' || kind === 'warning' ? 'alert' : 'status')
</script>

<div class="{TONE[kind]}{className ? ` ${className}` : ''}" {role}>
	{#if children}
		{@render children()}
	{:else}
		{message}
	{/if}
</div>

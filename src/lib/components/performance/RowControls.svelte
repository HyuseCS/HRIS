<script lang="ts" generics="T">
	import { moveRow } from './rows'

	/**
	 * Move-up / move-down / remove for one row of a repeatable list (#178).
	 *
	 * Buttons, not drag-and-drop — the same choice `settings/onboarding` made: drag needs a
	 * keyboard fallback, a touch story and a live-region announcement to reach the same place.
	 *
	 * `label` names the ROW, not the control: a 12-category × 15-criteria template puts ~180 of
	 * these on one page, and "Move up" repeated 180 times tells a screen-reader user nothing.
	 */
	let {
		rows,
		index,
		label,
		remove,
		canRemove = true
	}: {
		rows: T[]
		index: number
		/** What this row is, e.g. "Sales Performance" or "criterion 3". */
		label: string
		remove: () => void
		/** False when removing the last row would leave an invalid template. */
		canRemove?: boolean
	} = $props()

	const btn =
		'inline-flex h-8 w-8 items-center justify-center rounded border text-xs leading-none hover:bg-accent disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
</script>

<div class="flex shrink-0 items-center gap-1">
	<button
		type="button"
		class={btn}
		disabled={index === 0}
		aria-label="Move {label} up"
		onclick={() => moveRow(rows, index, -1)}>↑</button
	>
	<button
		type="button"
		class={btn}
		disabled={index === rows.length - 1}
		aria-label="Move {label} down"
		onclick={() => moveRow(rows, index, 1)}>↓</button
	>
	<button
		type="button"
		disabled={!canRemove}
		aria-label="Remove {label}"
		onclick={remove}
		class="inline-flex h-8 w-8 items-center justify-center rounded border border-destructive/30 text-xs leading-none text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>✕</button
	>
</div>

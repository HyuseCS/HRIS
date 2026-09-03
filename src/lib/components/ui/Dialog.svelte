<script lang="ts">
	/**
	 * The one modal. Backdrop, panel, focus trap, Escape, backdrop-click and focus restore.
	 *
	 * The audit's finding was "five modal implementations, one correct" — the correct one was the
	 * roles editor (`settings/roles/+page.svelte`), and this is its trap lifted verbatim: the
	 * FOCUSABLE selector, the Tab/Shift+Tab cycling, focusing the panel on open, and capturing
	 * `document.activeElement` on open to restore it on close. Everything else is a thin consumer.
	 *
	 * `title` renders NOTHING. It is the accessible name only — every consumer keeps its own <h2>,
	 * because 13 e2e assertions match dialogs by that name.
	 */
	import type { Snippet } from 'svelte'
	import { fade, scale } from 'svelte/transition'

	interface Props {
		open: boolean
		/** Accessible name. Ignored when `labelledBy` is given. Never rendered. */
		title?: string
		/** id of the consumer's own heading, used as `aria-labelledby` instead of `title`. */
		labelledBy?: string
		size?: 'sm' | 'md' | 'lg' | 'wide' | 'full'
		padding?: 'none' | 'sm' | 'md' | 'lg'
		/** Column layout with a capped height, for a panel with its own scrolling body. */
		scroll?: boolean
		/**
		 * Stacking order. Every consumer passes its own measured value — the nav drawer is z-40
		 * and the toaster is z-100, and a dialog opened from inside another must sit above it.
		 */
		zIndex?: number
		role?: 'dialog' | 'alertdialog'
		/** `'none'` for a consumer that focuses its own control (a textarea) — the two race. */
		initialFocus?: 'panel' | 'none'
		onclose?: () => void
		children: Snippet
	}

	let {
		open = $bindable(),
		title,
		labelledBy,
		size = 'md',
		padding = 'md',
		scroll = false,
		zIndex = 60,
		role = 'dialog',
		initialFocus = 'panel',
		onclose,
		children
	}: Props = $props()

	const SIZES = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		wide: 'max-w-lg sm:max-w-2xl lg:max-w-4xl',
		full: 'max-w-6xl'
	} as const
	const PADDINGS = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' } as const

	let panelEl = $state<HTMLElement>()

	// A consumer whose open state is derived (`ts != null`) cannot bind, so it passes `onclose`
	// and owns the close itself. A consumer that binds `open` needs no callback.
	function close() {
		if (onclose) onclose()
		else open = false
	}

	// Focus the panel on open; hand focus back to whatever opened it on close. Without the
	// restore the caret lands on <body> and a keyboard reader restarts from the top of the page.
	$effect(() => {
		if (!open) return
		const trigger = document.activeElement as HTMLElement | null
		if (initialFocus === 'panel') panelEl?.focus()
		return () => trigger?.focus()
	})

	// `aria-modal` tells a screen reader the rest of the page is inert; it does NOT stop Tab from
	// walking out of the dialog into the page behind it. This does.
	const FOCUSABLE =
		'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			// Must stop here: a nested dialog's Escape would otherwise close its parent too.
			e.stopPropagation()
			close()
			return
		}
		if (e.key !== 'Tab' || !panelEl) return
		// Rebuilt per keypress rather than cached: a consumer may add controls after mount
		// (Leaflet's attribution links), so a list taken on open would miss them.
		const items = [...panelEl.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
			(el) => el.offsetParent !== null
		)
		if (items.length === 0) {
			e.preventDefault()
			panelEl.focus()
			return
		}
		const first = items[0]
		const last = items[items.length - 1]
		const active = document.activeElement
		// The panel itself holds focus on open, so Shift+Tab from there wraps to the end.
		if (e.shiftKey && (active === first || active === panelEl)) {
			e.preventDefault()
			last.focus()
		} else if (!e.shiftKey && active === last) {
			e.preventDefault()
			first.focus()
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		style="z-index: {zIndex}"
		onclick={close}
		role="presentation"
		transition:fade={{ duration: 100 }}
	>
		<div
			bind:this={panelEl}
			class="relative w-full rounded-xl border bg-card shadow-2xl focus:outline-none {SIZES[size]} {PADDINGS[
				padding
			]} {scroll ? 'flex max-h-[90vh] flex-col overflow-hidden' : ''}"
			onclick={(e) => e.stopPropagation()}
			onkeydown={onKeydown}
			{role}
			aria-modal="true"
			aria-label={labelledBy ? undefined : title}
			aria-labelledby={labelledBy}
			tabindex="-1"
			transition:scale={{ duration: 120, start: 0.96 }}
		>
			{@render children()}
		</div>
	</div>
{/if}

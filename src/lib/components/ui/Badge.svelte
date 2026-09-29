<script lang="ts">
	/**
	 * The one status pill. Maps a status (+ optional domain) to one `.badge-*` class and one label.
	 *
	 * It invents no colours and holds no logic — see `badge.ts` for both, which is also where the
	 * unit tests reach. Twelve files each carried their own copy of this lookup before it existed,
	 * so the same status rendered in four different colours depending on the page.
	 */
	import { badgeFor, type BadgeDomain, type BadgeTone } from './badge'

	let {
		status,
		domain,
		label,
		tone
	}: {
		status: string
		domain?: BadgeDomain
		/** Overrides the label map — for a value no Prisma enum covers. */
		label?: string
		/** Overrides the tone lookup — so an unmapped status is never blocked on a code change. */
		tone?: BadgeTone
	} = $props()

	// COMPLETE and STATIC class strings, the same rule `Banner.svelte` states for its tones:
	// Tailwind scans literal strings in the source, so `badge-{tone}` compiled to nothing for
	// every tone no other file happened to spell out. Only green and gray survived — red, yellow
	// and blue were purged, and those statuses rendered as unstyled text. Never interpolate here.
	const TONE_CLASS: Record<BadgeTone, string> = {
		green: 'badge-green',
		red: 'badge-red',
		yellow: 'badge-yellow',
		blue: 'badge-blue',
		gray: 'badge-gray'
	}

	const resolved = $derived(badgeFor(status, { domain, tone, label }))
</script>

<span class={TONE_CLASS[resolved.tone]}>{resolved.label}</span>

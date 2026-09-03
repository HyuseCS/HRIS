<script lang="ts">
	/**
	 * The one status pill. Maps a status (+ optional domain) to one `.badge-*` class and one label.
	 *
	 * It invents no colours and holds no logic — see `badge.ts` for both, which is also where the
	 * unit tests reach. Twelve files each had their own `statusClass` copy before this existed, so
	 * the same status rendered in four different colours depending on the page.
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

	const resolved = $derived(badgeFor(status, { domain, tone, label }))
</script>

<span class="badge-{resolved.tone}">{resolved.label}</span>

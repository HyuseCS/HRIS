<script lang="ts">
	// The inline-SVG icon the attendance page used as a local {#snippet}, lifted so both persona
	// views render the identical markup. Heroicons outline, 24×24.
	let { d, class: cls = 'h-4 w-4 shrink-0' }: { d: string; class?: string } = $props()
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	class={cls}
	fill="none"
	viewBox="0 0 24 24"
	stroke="currentColor"
	stroke-width="1.75"
	aria-hidden="true"
>
	<path stroke-linecap="round" stroke-linejoin="round" {d} />
</svg>

<script lang="ts">
	import Search from 'lucide-svelte/icons/search'
	import type { HTMLInputAttributes } from 'svelte/elements'
	import { cn } from '$lib/utils/cn'

	let { value = $bindable(), class: klass, ...rest }: HTMLInputAttributes = $props()
</script>

<span class="relative inline-flex [&:has(>input.w-full)]:flex">
	<!-- ponytail: icon box assumes the h-9 input height every search site uses; a top margin on the input would otherwise pull a top-1/2 icon off centre -->
	<span class="pointer-events-none absolute bottom-0 left-0 flex h-9 items-center pl-3">
		<Search class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
	</span>
	<input type="search" {...rest} bind:value class={cn(klass, 'min-w-0 flex-1 pl-9')} />
</span>

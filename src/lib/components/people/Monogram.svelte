<script lang="ts">
	import { initials } from './people'

	let {
		firstName,
		lastName,
		size = 'md'
	}: { firstName: string; lastName: string; size?: 'sm' | 'md' } = $props()
</script>

<span
	aria-hidden="true"
	class="flex shrink-0 select-none items-center justify-center rounded-full bg-muted font-medium text-muted-foreground {size ===
	'sm'
		? 'h-7 w-7 text-[11px]'
		: 'h-10 w-10 text-sm'}">{initials(firstName, lastName)}</span
>

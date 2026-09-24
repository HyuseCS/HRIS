<script lang="ts">
	import type { Snippet } from 'svelte'
	import { cn } from '$lib/utils/cn'

	let {
		label,
		id,
		hint,
		error,
		required = false,
		size = 'default',
		suffix,
		class: klass,
		children
	}: {
		label: string
		id?: string
		hint?: string
		error?: string
		required?: boolean
		size?: 'default' | 'compact'
		suffix?: Snippet
		class?: string
		children: Snippet<
			[{ id: string; 'aria-invalid': true | undefined; 'aria-describedby': string | undefined }]
		>
	} = $props()

	const genId = $props.id()
	const fid = $derived(id ?? genId)
	const describedBy = $derived(
		[hint && `${fid}-hint`, error && `${fid}-error`].filter(Boolean).join(' ') || undefined
	)
</script>

<div class={cn(size === 'compact' ? 'grid gap-1' : '', klass)}>
	<label
		for={fid}
		class={size === 'compact' ? 'text-xs font-medium text-muted-foreground' : 'text-sm font-medium'}
		>{label}{#if required}{' '}<span class="text-destructive">*</span
			>{/if}{#if suffix}{' '}{@render suffix()}{/if}</label
	>
	{@render children({
		id: fid,
		'aria-invalid': error ? true : undefined,
		'aria-describedby': describedBy
	})}
	{#if hint}
		<p id="{fid}-hint" class="mt-1 text-xs text-muted-foreground">{hint}</p>
	{/if}
	{#if error}
		<p id="{fid}-error" class="mt-1 text-xs text-destructive">{error}</p>
	{/if}
</div>

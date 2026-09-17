<script lang="ts">
	import Banner from './Banner.svelte'

	let {
		form,
		action,
		class: className
	}: {
		form: { action?: string; saved?: string; notice?: string; error?: string } | null
		action: string | string[]
		class?: string
	} = $props()

	const mine = $derived(
		form?.action && (Array.isArray(action) ? action : [action]).includes(form.action) ? form : null
	)
</script>

{#if mine?.notice}
	<Banner kind="warning" message={mine.notice} class={className} />
{:else if mine?.saved}
	<Banner kind="success" message={mine.saved} class={className} />
{:else if mine?.error}
	<Banner kind="error" message={mine.error} class={className} />
{/if}

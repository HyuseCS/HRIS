<script lang="ts">
	import Toaster from '$lib/components/ui/Toaster.svelte'

	let { children }: { children: import('svelte').Snippet } = $props()
</script>

<!-- The (app) layout mounts its own Toaster; without this one the login page has no way to
     say anything, so a failed sign-in could only ever be a page-local banner. -->
<Toaster />

{@render children()}

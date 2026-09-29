<script lang="ts">
	import FileText from 'lucide-svelte/icons/file-text'
	import Plus from 'lucide-svelte/icons/plus'
	import X from 'lucide-svelte/icons/x'

	interface Props {
		id: string
		name: string
		/** Same value the native input takes — extensions and/or MIME types. */
		accept?: string
		multiple?: boolean
		/** Limits shown inside the box, e.g. file count, formats and max size. */
		hint?: string
		/** Mirrors MAX_REQUEST_DOCS. A drop bypasses `accept`, so this is enforced here too. */
		maxFiles?: number
		/** Mirrors MAX_UPLOAD_BYTES. */
		maxBytes?: number
	}

	let {
		id,
		name,
		accept,
		multiple = false,
		hint,
		maxFiles = 5,
		maxBytes = 10 * 1024 * 1024
	}: Props = $props()

	// ponytail: MIME list and the two limits duplicate src/lib/server/storage.ts and
	// src/lib/server/services/requests/documents.ts. Importing them would pull server
	// code into the client bundle. The server re-checks and sniffs magic bytes (#74).
	const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

	let inputEl = $state<HTMLInputElement>()
	let picked = $state<{ file: File; url: string | null }[]>([])
	let rejected = $state<string[]>([])
	let dragging = $state(false)

	const formatSize = (bytes: number) =>
		bytes < 1024
			? `${bytes} B`
			: bytes < 1024 * 1024
				? `${Math.round(bytes / 1024)} KB`
				: `${(bytes / (1024 * 1024)).toFixed(1)} MB`

	function clear() {
		for (const p of picked) if (p.url) URL.revokeObjectURL(p.url)
		picked = []
	}

	function sync() {
		clear()
		picked = [...(inputEl?.files ?? [])].map((file) => ({
			file,
			url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
		}))
	}

	function ingest(incoming: File[]) {
		if (!inputEl) return
		const kept = picked.map((p) => p.file)
		const errors: string[] = []
		for (const file of incoming) {
			if (!file.size) errors.push(`"${file.name}" is empty`)
			else if (file.size > maxBytes)
				errors.push(`"${file.name}" is too large — ${formatSize(maxBytes)} max`)
			else if (!ALLOWED_MIME.includes(file.type))
				errors.push(`"${file.name}" has an unsupported type — PDF, PNG, JPEG or WEBP only`)
			else if (kept.length >= maxFiles)
				errors.push(`"${file.name}" is over the ${maxFiles} file limit`)
			else kept.push(file)
		}
		const dt = new DataTransfer()
		for (const file of kept) dt.items.add(file)
		inputEl.files = dt.files
		rejected = errors
		sync()
	}

	function remove(index: number) {
		if (!inputEl) return
		const dt = new DataTransfer()
		picked.forEach((p, i) => {
			if (i !== index) dt.items.add(p.file)
		})
		inputEl.files = dt.files
		sync()
	}

	function onDrop(event: DragEvent) {
		event.preventDefault()
		dragging = false
		ingest([...(event.dataTransfer?.files ?? [])])
	}

	$effect(() => {
		const form = inputEl?.form
		if (!form) return
		const onReset = () =>
			queueMicrotask(() => {
				clear()
				rejected = []
			})
		form.addEventListener('reset', onReset)
		return () => form.removeEventListener('reset', onReset)
	})

	$effect(() => clear)
</script>

<div
	role="presentation"
	ondragover={(e) => {
		e.preventDefault()
		dragging = true
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
	class="relative flex min-h-[7rem] flex-1 flex-col justify-center gap-3 rounded-md border border-dashed p-4 transition-colors {dragging
		? 'border-primary bg-primary/5'
		: 'border-input bg-background'}"
>
	<input
		{id}
		{name}
		{accept}
		{multiple}
		type="file"
		bind:this={inputEl}
		onchange={() => ingest([...(inputEl?.files ?? [])])}
		class="peer sr-only"
	/>
	<label
		for={id}
		class="absolute inset-0 cursor-pointer rounded-md hover:bg-muted/30 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
	>
		<span class="sr-only">Add files</span>
	</label>

	{#if picked.length === 0}
		<div
			class="pointer-events-none relative flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground"
		>
			<Plus class="h-6 w-6" aria-hidden="true" />
			<span class="text-xs font-medium">Add files</span>
		</div>
	{/if}

	{#if picked.length}
		<div class="pointer-events-none relative flex flex-wrap items-start gap-3">
			{#each picked as p, i (p.file.name + p.file.size + i)}
				<div
					class="pointer-events-auto relative flex h-20 w-20 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-input bg-background p-1"
				>
					{#if p.url}
						<img src={p.url} alt="" class="h-9 w-full rounded-sm object-cover" />
					{:else}
						<FileText class="h-8 w-8 text-muted-foreground" aria-hidden="true" />
					{/if}
					<span class="w-full truncate text-center text-[10px] leading-tight">{p.file.name}</span>
					<span class="text-[10px] text-muted-foreground">{formatSize(p.file.size)}</span>
					<button
						type="button"
						onclick={() => remove(i)}
						aria-label={`Remove ${p.file.name}`}
						class="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:text-red-600"
					>
						<X class="h-3.5 w-3.5" aria-hidden="true" />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<div
		class="pointer-events-none relative mt-auto flex flex-col space-y-1 {picked.length === 0
			? 'items-center text-center'
			: 'items-start'}"
	>
		{#if rejected.length}
			<ul class="space-y-0.5 text-xs text-red-600" role="alert">
				{#each rejected as message (message)}
					<li>{message}</li>
				{/each}
			</ul>
		{/if}
		{#if hint}
			<p class="text-xs text-muted-foreground">{hint}</p>
		{/if}
	</div>
</div>

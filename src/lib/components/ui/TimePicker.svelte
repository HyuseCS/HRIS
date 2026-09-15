<script lang="ts">
	import { untrack } from 'svelte'
	import Clock from 'lucide-svelte/icons/clock'
	import { cn } from '$lib/utils/cn'
	import {
		parseTime,
		formatTime,
		normalizeTime,
		angleToMinute,
		angleToHour,
		handAngle
	} from '$lib/utils/time-of-day'

	interface Props {
		value: string
		name?: string
		form?: string
		id?: string
		required?: boolean
		disabled?: boolean
		class?: string
		placeholder?: string
		'aria-label'?: string
		oninput?: (_v: string) => void
		onkeydown?: (_e: KeyboardEvent) => void
		'data-r'?: string | number
		'data-c'?: string | number
	}

	let {
		value = $bindable(''),
		name,
		form,
		id,
		required,
		disabled,
		class: klass,
		placeholder = '--:--',
		'aria-label': ariaLabel,
		oninput,
		onkeydown,
		'data-r': dataR,
		'data-c': dataC
	}: Props = $props()

	const W = 240
	const H = 300
	const NUMERAL_POS = Array.from({ length: 12 }, (_, i) => {
		const r = (i * Math.PI) / 6
		return { x: 100 + 72 * Math.sin(r), y: 100 - 72 * Math.cos(r) }
	})
	const HOUR_LABELS = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
	const MINUTE_LABELS = NUMERAL_POS.map((_, i) => String(i * 5).padStart(2, '0'))

	let wrapper: HTMLSpanElement
	let input: HTMLInputElement
	let text = $state(untrack(() => value))
	let seen = untrack(() => value)
	let open = $state(false)
	let mode = $state<'h' | 'm'>('h')
	let pos = $state({ top: 0, left: 0 })
	let dragging = false

	const cur = $derived(parseTime(value) ?? 0)
	const hours = $derived(Math.floor(cur / 60))
	const minutes = $derived(cur % 60)
	const pm = $derived(hours >= 12)
	const h12 = $derived(hours % 12 || 12)
	const labels = $derived(mode === 'h' ? HOUR_LABELS : MINUTE_LABELS)

	$effect(() => {
		const v = value
		if (v === seen) return
		seen = v
		untrack(() => {
			if (normalizeTime(text) !== v) text = v
		})
	})

	$effect(() => {
		const f = input.form
		if (!f) return
		const onReset = () => {
			setTimeout(() => {
				text = value
			}, 0)
		}
		const onFormData = (e: FormDataEvent) => {
			if (name) e.formData.set(name, value)
		}
		f.addEventListener('reset', onReset)
		f.addEventListener('formdata', onFormData)
		return () => {
			f.removeEventListener('reset', onReset)
			f.removeEventListener('formdata', onFormData)
		}
	})

	$effect(() => {
		if (!open) return
		const close = () => {
			open = false
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			e.stopPropagation()
			done()
		}
		const onDown = (e: PointerEvent) => {
			if (!wrapper.contains(e.target as Node)) close()
		}
		window.addEventListener('keydown', onKey, true)
		window.addEventListener('pointerdown', onDown)
		window.addEventListener('scroll', close, true)
		window.addEventListener('resize', close)
		return () => {
			window.removeEventListener('keydown', onKey, true)
			window.removeEventListener('pointerdown', onDown)
			window.removeEventListener('scroll', close, true)
			window.removeEventListener('resize', close)
		}
	})

	function write(v: string | null) {
		if (v === null || v === value) return
		value = v
		oninput?.(v)
	}

	function pick(min: number) {
		text = formatTime(min)
		write(text)
	}

	function done() {
		open = false
		input.focus()
	}

	function toggle() {
		if (open) {
			open = false
			return
		}
		const r = wrapper.getBoundingClientRect()
		let top = r.bottom + 4
		if (top + H > innerHeight) top = Math.max(8, r.top - 4 - H)
		let left = r.left
		if (left + W > innerWidth - 8) left = Math.max(8, r.right - W)
		pos = { top, left }
		mode = 'h'
		open = true
	}

	function apply(e: PointerEvent) {
		const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
		const dx = ((e.clientX - r.left) * 200) / r.width - 100
		const dy = ((e.clientY - r.top) * 200) / r.height - 100
		if (mode === 'h') pick(((pm ? 12 : 0) + angleToHour(dx, dy)) * 60 + minutes)
		else pick(hours * 60 + angleToMinute(dx, dy))
	}

	function onPointerDown(e: PointerEvent) {
		;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
		dragging = true
		apply(e)
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging) return
		;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
		dragging = false
		if (mode === 'h') mode = 'm'
		else done()
	}

	function popKey(e: KeyboardEvent, unit: number) {
		if (e.key === 'Enter') {
			e.preventDefault()
			done()
			return
		}
		const step = { ArrowUp: unit, ArrowDown: -unit, PageUp: 5, PageDown: -5 }[e.key]
		if (!unit || !step) return
		e.preventDefault()
		pick(cur + step)
	}
</script>

<span bind:this={wrapper} class="relative inline-flex">
	<input
		bind:this={input}
		type="text"
		inputmode="numeric"
		autocomplete="off"
		{name}
		{form}
		{id}
		{required}
		{disabled}
		{placeholder}
		aria-label={ariaLabel}
		data-r={dataR}
		data-c={dataC}
		bind:value={text}
		oninput={() => write(normalizeTime(text))}
		onblur={() => (text = normalizeTime(text) ?? value)}
		onkeydown={(e) => onkeydown?.(e)}
		class={cn('pr-7', klass)}
	/>
	<button
		type="button"
		class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
		aria-label="Open clock"
		aria-haspopup="dialog"
		aria-expanded={open}
		{disabled}
		onclick={toggle}
	>
		<Clock class="h-4 w-4" />
	</button>
	{#if open}
		<div
			role="dialog"
			aria-label="Choose time"
			class="fixed z-[70] w-[240px] rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
			style="top: {pos.top}px; left: {pos.left}px"
		>
			<div class="flex items-center justify-center gap-1 text-2xl font-semibold tabular-nums">
				<button
					type="button"
					class={cn('rounded px-1', mode === 'h' && 'text-primary')}
					onclick={() => (mode = 'h')}
					onkeydown={(e) => popKey(e, 60)}>{value ? String(h12).padStart(2, '0') : '--'}</button
				>
				<span>:</span>
				<button
					type="button"
					class={cn('rounded px-1', mode === 'm' && 'text-primary')}
					onclick={() => (mode = 'm')}
					onkeydown={(e) => popKey(e, 1)}>{value ? String(minutes).padStart(2, '0') : '--'}</button
				>
			</div>
			<span class="sr-only" aria-live="polite"
				>{value ? `${h12}:${String(minutes).padStart(2, '0')} ${pm ? 'PM' : 'AM'}` : ''}</span
			>
			<div role="group" aria-label="Clock face" class="mx-auto h-56 w-56">
				<svg
					viewBox="0 0 200 200"
					class="h-full w-full touch-none select-none"
					aria-hidden="true"
					onpointerdown={onPointerDown}
					onpointermove={(e) => dragging && apply(e)}
					onpointerup={onPointerUp}
					onpointercancel={onPointerUp}
				>
					<circle cx="100" cy="100" r="92" class="fill-muted stroke-border" />
					{#each { length: 60 } as _, i (i)}
						<line
							x1="100"
							y1={i % 5 ? 12 : 16}
							x2="100"
							y2="8"
							transform="rotate({i * 6} 100 100)"
							class="stroke-muted-foreground"
							stroke-width={i % 5 ? 1 : 2}
						/>
					{/each}
					{#each labels as label, i (i)}
						<text
							x={NUMERAL_POS[i].x}
							y={NUMERAL_POS[i].y}
							text-anchor="middle"
							dominant-baseline="central"
							class="fill-foreground text-[13px]">{label}</text
						>
					{/each}
					<line
						x1="100"
						y1="100"
						x2="100"
						y2="52"
						stroke-width="5"
						stroke-linecap="round"
						class="stroke-foreground"
						transform="rotate({handAngle(hours % 12, 12)} 100 100)"
					/>
					<line
						x1="100"
						y1="100"
						x2="100"
						y2="22"
						stroke-width="3"
						stroke-linecap="round"
						class="stroke-primary"
						transform="rotate({handAngle(minutes, 60)} 100 100)"
					/>
					<circle cx="100" cy="100" r="4" class="fill-primary" />
				</svg>
			</div>
			<div class="mt-2 flex items-center justify-between gap-1 text-sm">
				<div class="flex gap-1">
					{#each [false, true] as half (half)}
						<button
							type="button"
							class={cn(
								'rounded-md border px-2 py-0.5',
								value && pm === half && 'bg-primary text-primary-foreground'
							)}
							aria-pressed={!!value && pm === half}
							onclick={() => pick((cur % 720) + (half ? 720 : 0))}
							onkeydown={(e) => popKey(e, 0)}>{half ? 'PM' : 'AM'}</button
						>
					{/each}
				</div>
				<button
					type="button"
					class="rounded-md px-2 py-0.5 font-medium hover:bg-accent"
					onclick={done}>Done</button
				>
			</div>
		</div>
	{/if}
</span>

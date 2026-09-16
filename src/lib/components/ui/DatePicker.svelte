<script lang="ts">
	import { untrack } from 'svelte'
	import Calendar from 'lucide-svelte/icons/calendar'
	import ChevronDown from 'lucide-svelte/icons/chevron-down'
	import { cn } from '$lib/utils/cn'
	import {
		parseDay,
		formatDay,
		normalizeDate,
		daysInMonth,
		addDays,
		addMonths,
		weekday,
		todayParts
	} from '$lib/utils/calendar-day'

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
		min?: string
		max?: string
		onchange?: (_v: string) => void
		'data-r'?: string | number
		'data-c'?: string | number
		'aria-invalid'?: boolean | 'true' | 'false' | null
		'aria-describedby'?: string | null
	}

	let {
		value = $bindable(''),
		name,
		form,
		id,
		required,
		disabled,
		class: klass,
		placeholder = 'YYYY-MM-DD',
		'aria-label': ariaLabel,
		oninput,
		onkeydown,
		min,
		max,
		onchange,
		'data-r': dataR,
		'data-c': dataC,
		'aria-invalid': ariaInvalid,
		'aria-describedby': ariaDescribedby
	}: Props = $props()

	const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	]
	const CURRENT_YEAR = new Date().getFullYear()
	const DECADE_LOW = Math.floor((CURRENT_YEAR - 80) / 10) * 10
	const DECADE_HIGH = Math.ceil((CURRENT_YEAR + 10) / 10) * 10 - 1
	const YEARS = Array.from({ length: DECADE_HIGH - DECADE_LOW + 1 }, (_, i) => DECADE_LOW + i)
	const DECADES = Array.from({ length: YEARS.length / 10 }, (_, i) =>
		YEARS.slice(i * 10, i * 10 + 10)
	)
	function decadeStartOf(y: number): number {
		return Math.floor((y - DECADE_LOW) / 10) * 10 + DECADE_LOW
	}
	const selectClass =
		'h-7 rounded-md border border-input bg-background px-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
	const LONGEST_MONTH = Math.max(...MONTHS.map((m) => m.length))
	const monthWidth = `calc(${LONGEST_MONTH}ch + 1.75rem)`
	const YEAR_ROWS_VISIBLE = 10
	// border-box: an explicit max-height caps the padded box, so `p-1` must be added back on top
	// of the row math or the last row clips.
	const LIST_PADDING = 8
	const W = 280
	const H = 320

	const FOCUSABLE =
		'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
	function focusableIn(el: Element): HTMLElement[] {
		return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.offsetParent !== null)
	}
	let wrapper: HTMLSpanElement
	let input: HTMLInputElement
	let toggleBtn: HTMLButtonElement
	let grid: HTMLDivElement
	let popup: HTMLDivElement
	let yearTrigger: HTMLButtonElement
	let yearList: HTMLDivElement
	let monthTrigger: HTMLButtonElement
	let monthList: HTMLDivElement
	let text = $state(untrack(() => value))
	let seen = untrack(() => value)
	let open = $state(false)
	let pos = $state({ top: 0, left: 0 })
	let yearOpen = $state(false)
	let yearActive = $state(CURRENT_YEAR)
	let yearRowHeight = $state(0)
	let yearPos = $state({ top: 0, left: 0, width: 0, maxHeight: 0 })
	let monthOpen = $state(false)
	let monthActive = $state(0)
	let monthRowHeight = $state(0)
	let monthPos = $state({ top: 0, left: 0, width: 0 })
	let typeBuffer = ''
	let typeTimer: ReturnType<typeof setTimeout> | undefined

	const sel = $derived(parseDay(value))
	const invalid = $derived(text.trim() !== '' && normalizeDate(text) === null)
	let touched = $state(false)
	let view = $state(untrack(() => sel) ?? todayParts())
	let focused = $state(untrack(() => sel) ?? todayParts())
	let committed = untrack(() => value)

	const minDay = $derived(min ? normalizeDate(min) : null)
	const maxDay = $derived(max ? normalizeDate(max) : null)

	function outOfRange(s: string): boolean {
		if (s === '') return false
		return (!!minDay && s < minDay) || (!!maxDay && s > maxDay)
	}

	function monthBlocked(y: number, m: number): boolean {
		return outOfRange(formatDay(y, m, 1)) && outOfRange(formatDay(y, m, daysInMonth(y, m)))
	}

	function yearBlocked(y: number): boolean {
		return outOfRange(formatDay(y, 1, 1)) && outOfRange(formatDay(y, 12, 31))
	}

	function nearestEnabled(values: number[], target: number): number | null {
		if (values.length === 0) return null
		return values.reduce(
			(best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best),
			values[0]
		)
	}

	const rangeMsg = $derived.by(() => {
		const n = normalizeDate(text)
		if (n === null || n === '' || !outOfRange(n)) return ''
		if (minDay && n < minDay) return `Choose a date on or after ${minDay}.`
		return `Choose a date on or before ${maxDay}.`
	})
	const validityMsg = $derived(invalid ? 'Enter a date as YYYY-MM-DD.' : rangeMsg)
	const externalInvalid = $derived(ariaInvalid === true || ariaInvalid === 'true')
	const internalInvalid = $derived((invalid || rangeMsg !== '') && (touched || text.length === 10))

	function commit() {
		const n = normalizeDate(text)
		if (n === null) return
		if (n === committed) return
		committed = n
		onchange?.(n)
	}

	export function focusAndOpen() {
		input.focus()
		if (!open) toggle()
	}

	$effect(() => {
		const v = value
		if (v === seen) return
		seen = v
		untrack(() => {
			if (normalizeDate(text) !== v) {
				text = v
				committed = v
			}
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
		input.setCustomValidity(validityMsg)
	})

	$effect(() => {
		if (!open) return
		const close = () => {
			open = false
		}
		// One capture listener, branching on which list is open: a capture listener added later
		// never wins against one added earlier on the same target.
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation()
				if (monthOpen) {
					monthOpen = false
					monthTrigger.focus()
					return
				}
				if (yearOpen) {
					yearOpen = false
					yearTrigger.focus()
					return
				}
				done()
				return
			}
			if (e.key === 'Tab' && (monthOpen || yearOpen)) {
				e.preventDefault()
				if (monthOpen) {
					monthOpen = false
					monthTrigger.focus()
				} else {
					yearOpen = false
					yearTrigger.focus()
				}
				return
			}
			if (e.key !== 'Tab' || !popup) return
			const items = focusableIn(popup)
			if (items.length === 0) return
			const first = items[0]
			const last = items[items.length - 1]
			const active = document.activeElement
			if (!e.shiftKey && active === toggleBtn) {
				e.preventDefault()
				first.focus()
			} else if (e.shiftKey && active === first) {
				e.preventDefault()
				close()
				toggleBtn.focus()
			} else if (!e.shiftKey && active === last) {
				e.preventDefault()
				const all = focusableIn(document.body)
				const next = all[all.indexOf(toggleBtn) + 1]
				close()
				commit()
				next?.focus()
			}
		}
		const onDown = (e: PointerEvent) => {
			const t = e.target as Node
			// Each trigger is excluded from its own dismiss check: pointerdown fires before click,
			// so closing here would let the trigger's onclick reopen it on the same press.
			if (monthOpen && !monthList?.contains(t) && !monthTrigger?.contains(t)) monthOpen = false
			if (yearOpen && !yearList?.contains(t) && !yearTrigger?.contains(t)) yearOpen = false
			if (
				!wrapper.contains(t) &&
				!popup?.contains(t) &&
				!monthList?.contains(t) &&
				!yearList?.contains(t)
			) {
				close()
				commit()
			}
		}
		// Capture-phase sees any scroll, including the lists' own internal scrolling — ignore
		// targets inside the popup or either list.
		const onScroll = (e: Event) => {
			const t = e.target as Node
			if (popup?.contains(t) || monthList?.contains(t) || yearList?.contains(t)) return
			close()
		}
		window.addEventListener('keydown', onKey, true)
		window.addEventListener('pointerdown', onDown)
		window.addEventListener('scroll', onScroll, true)
		window.addEventListener('resize', close)
		return () => {
			window.removeEventListener('keydown', onKey, true)
			window.removeEventListener('pointerdown', onDown)
			window.removeEventListener('scroll', onScroll, true)
			window.removeEventListener('resize', close)
		}
	})

	function maskDate(raw: string): string {
		const digits = raw.replace(/\D/g, '').slice(0, 8)
		if (digits.length <= 4) return digits
		if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
		return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
	}

	function onType(e: Event & { currentTarget: HTMLInputElement }) {
		touched = false
		const el = e.currentTarget
		const caret = el.selectionStart ?? el.value.length
		const digitsBefore = el.value.slice(0, caret).replace(/\D/g, '').length
		const masked = maskDate(el.value)
		text = masked
		el.value = masked
		let pos = 0
		let seenDigits = 0
		while (pos < masked.length && seenDigits < digitsBefore) {
			if (masked[pos] >= '0' && masked[pos] <= '9') seenDigits++
			pos++
		}
		el.setSelectionRange(pos, pos)
		write(normalizeDate(masked))
	}

	function write(v: string | null) {
		if (v === null || v === value) return
		value = v
		oninput?.(v)
	}

	function pick(y: number, m: number, d: number) {
		text = formatDay(y, m, d)
		write(text)
		focused = { y, m, d }
		view = { y, m }
		done()
		commit()
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
		const left = Math.min(Math.max(r.right - W, 8), innerWidth - 8 - W)
		pos = { top, left }
		const start = sel ?? focused
		const startIso = formatDay(start.y, start.m, start.d)
		const bound = minDay && startIso < minDay ? minDay : maxDay
		const clamped = (outOfRange(startIso) && bound ? parseDay(bound) : start) ?? start
		view = { y: clamped.y, m: clamped.m }
		focused = clamped
		open = true
	}

	function cellsForView(): { y: number; m: number; d: number; inMonth: boolean }[] {
		const first = weekday(view.y, view.m, 1)
		const total = daysInMonth(view.y, view.m)
		const cells: { y: number; m: number; d: number; inMonth: boolean }[] = []
		for (let i = 0; i < first; i++) {
			const { y, m, d } = addDays(view.y, view.m, 1, i - first)
			cells.push({ y, m, d, inMonth: false })
		}
		for (let d = 1; d <= total; d++) cells.push({ y: view.y, m: view.m, d, inMonth: true })
		while (cells.length % 7 !== 0 || cells.length < 42) {
			const last = cells[cells.length - 1]
			const { y, m, d } = addDays(last.y, last.m, last.d, 1)
			cells.push({ y, m, d, inMonth: false })
		}
		return cells
	}
	const cells = $derived(cellsForView())

	function moveFocus(delta: number) {
		const next = addDays(focused.y, focused.m, focused.d, delta)
		focused = next
		view = { y: next.y, m: next.m }
	}

	function moveMonth(delta: number) {
		const { y, m } = addMonths(focused.y, focused.m, delta)
		const clampedD = Math.min(focused.d, daysInMonth(y, m))
		focused = { y, m, d: clampedD }
		view = { y, m }
	}

	function setViewMonth(m0: number) {
		const m = m0 + 1
		const clampedD = Math.min(focused.d, daysInMonth(view.y, m))
		view = { y: view.y, m }
		focused = { y: view.y, m, d: clampedD }
	}

	function setViewYear(y: number) {
		const clampedD = Math.min(focused.d, daysInMonth(y, view.m))
		view = { y, m: view.m }
		focused = { y, m: view.m, d: clampedD }
	}

	function flipPosition(trigger: HTMLElement, popupWidth: number, popupHeight: number) {
		const r = trigger.getBoundingClientRect()
		let top = r.bottom + 4
		if (top + popupHeight > innerHeight) top = Math.max(8, r.top - 4 - popupHeight)
		const left = Math.max(8, Math.min(r.left, innerWidth - 8 - popupWidth))
		return { top, left }
	}
	function focusOption(container: HTMLElement | undefined, attr: string, v: number) {
		const el = container?.querySelector<HTMLElement>(`[${attr}="${v}"]`)
		el?.scrollIntoView({ block: 'nearest' })
		el?.focus({ preventScroll: true })
	}
	function clampedStep(values: number[], active: number, delta: number): number {
		if (values.length === 0) return active
		let idx = values.indexOf(active)
		if (idx === -1) idx = values.indexOf(nearestEnabled(values, active) as number)
		return values[Math.min(values.length - 1, Math.max(0, idx + delta))]
	}

	const enabledYears = $derived(YEARS.filter((y) => !yearBlocked(y)))

	function focusYear(y: number) {
		yearActive = y
		focusOption(yearList, 'data-year', y)
	}

	function moveYearActive(delta: number) {
		focusYear(clampedStep(enabledYears, yearActive, delta))
	}

	function toggleYearList() {
		monthOpen = false
		if (yearOpen) {
			yearOpen = false
			return
		}
		yearActive = nearestEnabled(enabledYears, view.y) ?? view.y
		typeBuffer = ''
		clearTimeout(typeTimer)
		yearOpen = true
	}

	function selectYear(y: number) {
		setViewYear(y)
		yearOpen = false
		yearTrigger.focus()
	}

	function yearTypeahead(digit: string) {
		typeBuffer += digit
		clearTimeout(typeTimer)
		typeTimer = setTimeout(() => {
			typeBuffer = ''
		}, 600)
		const match = enabledYears.find((y) => String(y).startsWith(typeBuffer))
		if (match !== undefined) focusYear(match)
	}

	function yearKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			moveYearActive(1)
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			moveYearActive(-1)
		} else if (e.key === 'PageDown') {
			e.preventDefault()
			moveYearActive(10)
		} else if (e.key === 'PageUp') {
			e.preventDefault()
			moveYearActive(-10)
		} else if (e.key === 'Home') {
			e.preventDefault()
			focusYear(enabledYears[0])
		} else if (e.key === 'End') {
			e.preventDefault()
			focusYear(enabledYears[enabledYears.length - 1])
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			selectYear(yearActive)
		} else if (/^[0-9]$/.test(e.key)) {
			e.preventDefault()
			yearTypeahead(e.key)
		}
	}

	const MONTH_VALUES = MONTHS.map((_, i) => i)
	const enabledMonths = $derived(MONTH_VALUES.filter((i) => !monthBlocked(view.y, i + 1)))

	function focusMonth(m0: number) {
		monthActive = m0
		monthList?.querySelector<HTMLElement>(`[data-month="${m0}"]`)?.focus({ preventScroll: true })
	}

	function moveMonthActive(delta: number) {
		focusMonth(clampedStep(enabledMonths, monthActive, delta))
	}

	function toggleMonthList() {
		yearOpen = false
		if (monthOpen) {
			monthOpen = false
			return
		}
		monthActive = nearestEnabled(enabledMonths, view.m - 1) ?? view.m - 1
		monthOpen = true
	}

	function selectMonth(m0: number) {
		setViewMonth(m0)
		monthOpen = false
		monthTrigger.focus()
	}

	function monthKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			moveMonthActive(1)
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			moveMonthActive(-1)
		} else if (e.key === 'Home') {
			e.preventDefault()
			focusMonth(enabledMonths[0])
		} else if (e.key === 'End') {
			e.preventDefault()
			focusMonth(enabledMonths[enabledMonths.length - 1])
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			selectMonth(monthActive)
		}
	}

	function gridKey(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowLeft':
				e.preventDefault()
				moveFocus(-1)
				return
			case 'ArrowRight':
				e.preventDefault()
				moveFocus(1)
				return
			case 'ArrowUp':
				e.preventDefault()
				moveFocus(-7)
				return
			case 'ArrowDown':
				e.preventDefault()
				moveFocus(7)
				return
			case 'PageUp':
				e.preventDefault()
				moveMonth(-1)
				return
			case 'PageDown':
				e.preventDefault()
				moveMonth(1)
				return
			case 'Home':
				e.preventDefault()
				moveFocus(-weekday(focused.y, focused.m, focused.d))
				return
			case 'End':
				e.preventDefault()
				moveFocus(6 - weekday(focused.y, focused.m, focused.d))
				return
			case 'Enter':
			case ' ':
				e.preventDefault()
				if (outOfRange(formatDay(focused.y, focused.m, focused.d))) return
				pick(focused.y, focused.m, focused.d)
				return
			case 'Escape':
				e.preventDefault()
				done()
				return
		}
	}

	function portal(node: HTMLElement) {
		document.body.appendChild(node)
		return {
			destroy() {
				node.remove()
			}
		}
	}

	const prevBlocked = $derived.by(() => {
		if (!minDay) return false
		const { y, m } = addMonths(view.y, view.m, -1)
		return formatDay(y, m, daysInMonth(y, m)) < minDay
	})
	const nextBlocked = $derived.by(() => {
		if (!maxDay) return false
		const { y, m } = addMonths(view.y, view.m, 1)
		return formatDay(y, m, 1) > maxDay
	})

	const monthLabel = $derived(
		new Date(view.y, view.m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
	)

	$effect(() => {
		if (!open) return
		focused
		untrack(() => {
			grid?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus()
		})
	})

	$effect(() => {
		if (!yearOpen) return
		untrack(() => {
			const firstOpt = yearList?.querySelector<HTMLElement>('[role="option"]')
			if (firstOpt) yearRowHeight = firstOpt.getBoundingClientRect().height
			const maxHeight = (yearRowHeight || 28) * YEAR_ROWS_VISIBLE
			const r = yearTrigger.getBoundingClientRect()
			const { top, left } = flipPosition(yearTrigger, r.width, maxHeight)
			yearPos = { top, left, width: r.width, maxHeight }
			// scrollTop, not scrollIntoView: two back-to-back smooth scrolls race and settle
			// mid-decade. max-height is set imperatively because `yearPos` only lands next render.
			if (yearList) yearList.style.maxHeight = `${maxHeight}px`
			const groupIndex = DECADES.findIndex((d) => d[0] === decadeStartOf(view.y))
			if (yearList && groupIndex >= 0) yearList.scrollTop = groupIndex * maxHeight
			focusYear(nearestEnabled(enabledYears, view.y) ?? view.y)
		})
	})

	$effect(() => {
		if (!monthOpen) return
		untrack(() => {
			const firstOpt = monthList?.querySelector<HTMLElement>('[role="option"]')
			if (firstOpt) monthRowHeight = firstOpt.getBoundingClientRect().height
			const rowH = monthRowHeight || 28
			const r = monthTrigger.getBoundingClientRect()
			const height = rowH * MONTH_VALUES.length + LIST_PADDING
			const { top, left } = flipPosition(monthTrigger, r.width, height)
			monthPos = { top, left, width: r.width }
			focusMonth(nearestEnabled(enabledMonths, view.m - 1) ?? view.m - 1)
		})
	})
</script>

<span bind:this={wrapper} class="relative inline-flex [&:has(>input.w-full)]:flex">
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
		aria-invalid={internalInvalid || externalInvalid ? 'true' : undefined}
		aria-describedby={ariaDescribedby}
		data-r={dataR}
		data-c={dataC}
		bind:value={text}
		oninput={onType}
		onblur={(e) => {
			touched = true
			const normalized = normalizeDate(text)
			if (normalized !== null) text = normalized
			if (e.relatedTarget === toggleBtn) return
			commit()
		}}
		onkeydown={(e) => onkeydown?.(e)}
		class={cn(klass, 'pr-7')}
	/>
	<button
		bind:this={toggleBtn}
		type="button"
		class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
		aria-label="Open calendar"
		aria-haspopup="dialog"
		aria-expanded={open}
		{disabled}
		onclick={toggle}
		onblur={(e) => {
			if (e.relatedTarget !== input && !popup?.contains(e.relatedTarget as Node)) commit()
		}}
	>
		<Calendar class="h-4 w-4" />
	</button>
	{#if open}
		<div
			use:portal
			bind:this={popup}
			role="dialog"
			aria-label="Choose date"
			class="fixed z-[70] w-[280px] rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
			style="top: {pos.top}px; left: {pos.left}px"
		>
			<div class="flex items-center justify-between gap-1 px-1 py-1">
				<button
					type="button"
					class="shrink-0 rounded p-1 hover:bg-accent disabled:opacity-40"
					aria-label="Previous month"
					disabled={prevBlocked}
					onclick={() => moveMonth(-1)}
				>
					‹
				</button>
				<div class="flex items-center gap-1">
					<label class="sr-only" for="dp-month">Month</label>
					<button
						bind:this={monthTrigger}
						id="dp-month"
						type="button"
						class={cn(selectClass, 'shrink-0 disabled:opacity-40')}
						style="width: {monthWidth}"
						aria-haspopup="listbox"
						aria-expanded={monthOpen}
						disabled={enabledMonths.length === 0}
						onclick={toggleMonthList}
					>
						<span class="flex items-center justify-between gap-1">
							<span>{MONTHS[view.m - 1]}</span>
							<ChevronDown
								class={cn(
									'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
									monthOpen && 'rotate-180'
								)}
								aria-hidden="true"
								tabindex="-1"
							/>
						</span>
					</button>
					<label class="sr-only" for="dp-year">Year</label>
					<button
						bind:this={yearTrigger}
						id="dp-year"
						type="button"
						class={cn(selectClass, 'w-[4.5rem] shrink-0 text-left disabled:opacity-40')}
						aria-haspopup="listbox"
						aria-expanded={yearOpen}
						disabled={enabledYears.length === 0}
						onclick={toggleYearList}
					>
						<span class="flex items-center justify-between gap-1">
							<span>{view.y}</span>
							<ChevronDown
								class={cn(
									'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
									yearOpen && 'rotate-180'
								)}
								aria-hidden="true"
								tabindex="-1"
							/>
						</span>
					</button>
				</div>
				<button
					type="button"
					class="shrink-0 rounded p-1 hover:bg-accent disabled:opacity-40"
					aria-label="Next month"
					disabled={nextBlocked}
					onclick={() => moveMonth(1)}
				>
					›
				</button>
			</div>
			{#if yearOpen}
				<div
					use:portal
					bind:this={yearList}
					role="listbox"
					aria-label="Choose year"
					tabindex="-1"
					class="fixed z-[80] scroll-smooth overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md motion-reduce:scroll-auto snap-y snap-mandatory"
					style="top: {yearPos.top}px; left: {yearPos.left}px; width: {yearPos.width}px; max-height: {yearPos.maxHeight}px"
					onkeydown={yearKey}
				>
					{#each DECADES as decade (decade[0])}
						<div
							role="group"
							aria-label="{decade[0]}–{decade[decade.length - 1]}"
							data-decade={decade[0]}
							class="snap-start"
						>
							{#each decade as y (y)}
								{@const blocked = yearBlocked(y)}
								<button
									type="button"
									role="option"
									data-year={y}
									aria-selected={y === view.y}
									aria-disabled={blocked ? 'true' : undefined}
									disabled={blocked}
									tabindex={y === yearActive ? 0 : -1}
									class={cn(
										'flex h-7 w-full shrink-0 items-center rounded px-2 text-sm',
										y === view.y && 'bg-primary text-primary-foreground',
										y === yearActive && y !== view.y && 'ring-1 ring-inset ring-ring',
										blocked && 'opacity-40'
									)}
									onclick={() => selectYear(y)}
								>
									{y}
								</button>
							{/each}
						</div>
					{/each}
				</div>
			{/if}
			{#if monthOpen}
				<div
					use:portal
					bind:this={monthList}
					role="listbox"
					aria-label="Choose month"
					tabindex="-1"
					class="fixed z-[80] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
					style="top: {monthPos.top}px; left: {monthPos.left}px; width: {monthPos.width}px"
					onkeydown={monthKey}
				>
					{#each MONTHS as m, i (m)}
						{@const blocked = monthBlocked(view.y, i + 1)}
						<button
							type="button"
							role="option"
							data-month={i}
							aria-selected={i === view.m - 1}
							aria-disabled={blocked ? 'true' : undefined}
							disabled={blocked}
							tabindex={i === monthActive ? 0 : -1}
							class={cn(
								'flex h-7 w-full shrink-0 items-center rounded px-2 text-sm',
								i === view.m - 1 && 'bg-primary text-primary-foreground',
								i === monthActive && i !== view.m - 1 && 'ring-1 ring-inset ring-ring',
								blocked && 'opacity-40'
							)}
							onclick={() => selectMonth(i)}
						>
							{m}
						</button>
					{/each}
				</div>
			{/if}
			<div
				bind:this={grid}
				role="grid"
				aria-label={monthLabel}
				tabindex="-1"
				class="mt-1 outline-none"
				onkeydown={gridKey}
			>
				<div role="row" class="grid grid-cols-7 text-center text-xs text-muted-foreground">
					{#each WEEKDAY_LABELS as label (label)}
						<span role="columnheader" class="py-1">{label}</span>
					{/each}
				</div>
				{#each { length: 6 } as _, row (row)}
					<div role="row" class="grid grid-cols-7">
						{#each cells.slice(row * 7, row * 7 + 7) as cell (cell.y + '-' + cell.m + '-' + cell.d + '-' + cell.inMonth)}
							{@const isSel = !!sel && sel.y === cell.y && sel.m === cell.m && sel.d === cell.d}
							{@const isFocused =
								focused.y === cell.y && focused.m === cell.m && focused.d === cell.d}
							{@const blocked = outOfRange(formatDay(cell.y, cell.m, cell.d))}
							<div role="gridcell" aria-selected={isSel} class="p-0.5">
								<button
									type="button"
									tabindex={isFocused ? 0 : -1}
									disabled={blocked}
									class={cn(
										'flex h-8 w-8 items-center justify-center rounded-md text-sm',
										!cell.inMonth && 'text-muted-foreground/50',
										isFocused && !isSel && 'ring-1 ring-inset ring-ring',
										isSel && 'bg-primary text-primary-foreground',
										blocked && 'text-muted-foreground/30 line-through'
									)}
									onclick={() => pick(cell.y, cell.m, cell.d)}
								>
									{cell.d}
								</button>
							</div>
						{/each}
					</div>
				{/each}
			</div>
			<span class="sr-only" aria-live="polite">
				{formatDay(focused.y, focused.m, focused.d)}
			</span>
			<div class="mt-1 flex justify-end">
				<button
					type="button"
					class="rounded-md px-2 py-0.5 text-sm font-medium hover:bg-accent"
					onclick={done}
				>
					Done
				</button>
			</div>
		</div>
	{/if}
</span>

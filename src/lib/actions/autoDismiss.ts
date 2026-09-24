import { DEFAULT_TIMEOUT } from '$lib/stores/toast.svelte'

export function autoDismiss(node: HTMLElement, enabled: boolean = true) {
	if (!enabled) return {}

	let remaining = DEFAULT_TIMEOUT
	let startedAt = 0
	let handle: ReturnType<typeof setTimeout> | null = null
	let hovered = false
	let focused = false

	function start() {
		if (handle || hovered || focused || node.hidden) return
		startedAt = Date.now()
		handle = setTimeout(close, remaining)
	}

	function stop() {
		if (!handle) return
		clearTimeout(handle)
		handle = null
		remaining = Math.max(0, remaining - (Date.now() - startedAt))
	}

	function close() {
		handle = null
		const hadFocus = node.contains(document.activeElement)
		node.hidden = true
		node.style.display = 'none'
		if (hadFocus)
			node.parentElement?.closest<HTMLElement>('[tabindex]')?.focus({ preventScroll: true })
	}

	const onEnter = () => {
		hovered = true
		stop()
	}
	const onLeave = () => {
		hovered = false
		start()
	}
	const onFocusIn = (e: FocusEvent) => {
		if (e.target === node) return
		focused = true
		stop()
	}
	const onFocusOut = (e: FocusEvent) => {
		const related = e.relatedTarget as Node | null
		if (related !== node && node.contains(related)) return
		focused = false
		start()
	}

	node.addEventListener('mouseenter', onEnter)
	node.addEventListener('mouseleave', onLeave)
	node.addEventListener('focusin', onFocusIn)
	node.addEventListener('focusout', onFocusOut)
	start()

	return {
		destroy() {
			if (handle) clearTimeout(handle)
			node.removeEventListener('mouseenter', onEnter)
			node.removeEventListener('mouseleave', onLeave)
			node.removeEventListener('focusin', onFocusIn)
			node.removeEventListener('focusout', onFocusOut)
		}
	}
}

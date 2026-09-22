/**
 * Take the page to a failed submit's error message.
 *
 * Audit addendum §F: on a long page a `fail()` renders its message at the top and leaves the person
 * looking at an unchanged screen far below the fold — the save appears to have done nothing. The
 * mechanism is lifted from `performance/templates/[id]/+page.svelte`, which already did this by
 * hand for its row errors.
 *
 * An action rather than a `$effect` + `querySelector` in each page: the error element mounting IS
 * the event, so the node arrives for free and there is nothing to look up, nothing to `tick()` for
 * and nothing to tear down. Put it on the element that renders the error.
 *
 * Focus moves to the node as well as the viewport. A page-level banner has no field inside it to
 * focus, and moving the caret there is what makes a screen reader announce it and what stops the
 * next Tab from restarting at the top of the document — the same reasoning as the reveal panel in
 * `reports/audit-log`. The node therefore needs to be focusable, so this sets `tabindex="-1"` for
 * the consumer rather than making every call site remember it.
 */
export function scrollToError(node: HTMLElement) {
	// Programmatic focus only — a -1 stop never enters the Tab order.
	if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1')

	// Smooth scrolling is motion. Anyone who has asked the OS for less of it gets the jump instead.
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
	node.focus({ preventScroll: true })
}

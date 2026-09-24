import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { autoDismiss } from '../../src/lib/actions/autoDismiss'
import { DEFAULT_TIMEOUT } from '../../src/lib/stores/toast.svelte'

type FakeNode = EventTarget & {
	hidden: boolean
	style: { display: string }
	parentElement: { closest: (s: string) => unknown } | null
	contains: (n: unknown) => boolean
}

const inner = new EventTarget()

function fakeNode(): FakeNode {
	const node: FakeNode = Object.assign(new EventTarget(), {
		hidden: false,
		style: { display: '' },
		parentElement: null,
		contains: (n: unknown) => n === node || n === inner
	})
	return node
}

const mount = (node: FakeNode, enabled?: boolean) =>
	autoDismiss(node as unknown as HTMLElement, enabled)

const shown = (node: FakeNode) => !node.hidden && node.style.display !== 'none'

function focusEvent(type: 'focusin' | 'focusout', target: unknown, relatedTarget: unknown = null) {
	const ev = Object.assign(new Event(type), { relatedTarget })
	Object.defineProperty(ev, 'target', { value: target })
	return ev
}

describe('autoDismiss action', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.stubGlobal('document', { activeElement: null })
	})
	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it('a: hides the node at DEFAULT_TIMEOUT and not before', () => {
		const node = fakeNode()
		mount(node)
		vi.advanceTimersByTime(DEFAULT_TIMEOUT - 1)
		expect(shown(node)).toBe(true)
		vi.advanceTimersByTime(1)
		expect(node.style.display).toBe('none')
		expect(node.hidden).toBe(true)
	})

	it('b: hover pauses and resume keeps the remaining time', () => {
		const node = fakeNode()
		mount(node)
		vi.advanceTimersByTime(2000)
		node.dispatchEvent(new Event('mouseenter'))
		vi.advanceTimersByTime(60_000)
		expect(shown(node)).toBe(true)
		node.dispatchEvent(new Event('mouseleave'))
		vi.advanceTimersByTime(3999)
		expect(shown(node)).toBe(true)
		vi.advanceTimersByTime(1)
		expect(shown(node)).toBe(false)
	})

	it('c: descendant focus pauses until focus leaves the node', () => {
		const node = fakeNode()
		mount(node)
		vi.advanceTimersByTime(1000)
		node.dispatchEvent(focusEvent('focusin', inner))
		vi.advanceTimersByTime(60_000)
		expect(shown(node)).toBe(true)
		node.dispatchEvent(focusEvent('focusout', inner, inner))
		vi.advanceTimersByTime(60_000)
		expect(shown(node)).toBe(true)
		node.dispatchEvent(focusEvent('focusout', inner, null))
		vi.advanceTimersByTime(DEFAULT_TIMEOUT - 1000 - 1)
		expect(shown(node)).toBe(true)
		vi.advanceTimersByTime(1)
		expect(shown(node)).toBe(false)
	})

	it('c1: focus on the node itself does not pause', () => {
		const node = fakeNode()
		mount(node)
		node.dispatchEvent(focusEvent('focusin', node))
		vi.advanceTimersByTime(DEFAULT_TIMEOUT)
		expect(shown(node)).toBe(false)
	})

	it('c2: focus on a descendant pauses', () => {
		const node = fakeNode()
		mount(node)
		node.dispatchEvent(focusEvent('focusin', inner))
		vi.advanceTimersByTime(DEFAULT_TIMEOUT * 10)
		expect(shown(node)).toBe(true)
	})

	it('i: hands focus to the nearest tabindex ancestor on close and leaves no timer', () => {
		const node = fakeNode()
		const panel = {
			focus: vi.fn(() => {
				node.dispatchEvent(focusEvent('focusout', node, panel))
			})
		}
		const closest = vi.fn(() => panel)
		node.parentElement = { closest }
		vi.stubGlobal('document', { activeElement: node })
		mount(node)
		node.dispatchEvent(focusEvent('focusin', node))
		vi.advanceTimersByTime(DEFAULT_TIMEOUT)
		expect(closest).toHaveBeenCalledWith('[tabindex]')
		expect(panel.focus).toHaveBeenCalledWith({ preventScroll: true })
		expect(node.hidden).toBe(true)
		expect(node.style.display).toBe('none')
		expect(vi.getTimerCount()).toBe(0)
	})

	it('d: needs both hover and focus released to resume', () => {
		const node = fakeNode()
		mount(node)
		node.dispatchEvent(focusEvent('focusin', inner))
		node.dispatchEvent(new Event('mouseenter'))
		node.dispatchEvent(new Event('mouseleave'))
		vi.advanceTimersByTime(60_000)
		expect(shown(node)).toBe(true)
	})

	it('e: a disabled node never closes', () => {
		const node = fakeNode()
		mount(node, false)
		vi.advanceTimersByTime(60_000)
		expect(shown(node)).toBe(true)
	})

	it('f: a node mounted after the first closes gets a full DEFAULT_TIMEOUT', () => {
		const first = fakeNode()
		mount(first)
		vi.advanceTimersByTime(DEFAULT_TIMEOUT)
		expect(shown(first)).toBe(false)
		const second = fakeNode()
		mount(second)
		vi.advanceTimersByTime(DEFAULT_TIMEOUT - 1)
		expect(shown(second)).toBe(true)
		vi.advanceTimersByTime(1)
		expect(shown(second)).toBe(false)
	})

	it('g: destroy before the timeout leaves the node shown', () => {
		const node = fakeNode()
		const handle = mount(node)
		handle.destroy?.()
		vi.advanceTimersByTime(60_000)
		expect(node.style.display).toBe('')
		expect(node.hidden).toBe(false)
	})

	it('h: uses the toast DEFAULT_TIMEOUT of 6000', () => {
		expect(DEFAULT_TIMEOUT).toBe(6000)
	})
})

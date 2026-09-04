import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
	addToast,
	getToasts,
	dismissToast,
	dismissAllToasts,
	pauseToasts,
	resumeToasts
} from '../../src/lib/stores/toast.svelte'

// Phase 04 S5. Two invariants the Toaster depends on and a probe cannot cheaply prove:
// the stacking cap, and the pausable timer that stops a link-toast vanishing mid-click.

describe('toast store', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		dismissAllToasts()
		// Release BOTH pause sources — a leaked `focused` would silently hold the next test.
		resumeToasts('hover')
		resumeToasts('focus')
	})

	afterEach(() => {
		dismissAllToasts()
		vi.useRealTimers()
	})

	it('expires a toast when its timeout elapses', () => {
		addToast('gone in six')
		expect(getToasts()).toHaveLength(1)
		vi.advanceTimersByTime(6000)
		expect(getToasts()).toHaveLength(0)
	})

	it('caps the stack at 5 and drops the OLDEST', () => {
		for (let i = 1; i <= 7; i++) addToast(`toast ${i}`)
		const messages = getToasts().map((t) => t.message)
		expect(messages).toHaveLength(5)
		expect(messages).toEqual(['toast 3', 'toast 4', 'toast 5', 'toast 6', 'toast 7'])
	})

	it('holds a paused toast open past its timeout', () => {
		addToast('hover me')
		vi.advanceTimersByTime(2000)
		pauseToasts()
		vi.advanceTimersByTime(60_000)
		expect(getToasts()).toHaveLength(1)
	})

	it('resumes with the time that was LEFT, not a fresh timeout', () => {
		addToast('hover me')
		vi.advanceTimersByTime(5000)
		pauseToasts()
		vi.advanceTimersByTime(60_000)
		resumeToasts()
		// 1000ms was left. A naive resume would restart the full 6s and survive this.
		vi.advanceTimersByTime(1000)
		expect(getToasts()).toHaveLength(0)
	})

	it('does not start the timer for a toast added while paused', () => {
		pauseToasts()
		addToast('arrived mid-hover')
		vi.advanceTimersByTime(60_000)
		expect(getToasts()).toHaveLength(1)
		resumeToasts()
		vi.advanceTimersByTime(6000)
		expect(getToasts()).toHaveLength(0)
	})

	// Hover and focus are separate holds. Releasing one while the other is still on must NOT
	// resume — either order used to kill a toast the user was reading or tabbing through.
	it('stays paused when the mouse leaves but focus is still inside', () => {
		addToast('kbd')
		pauseToasts('focus')
		pauseToasts('hover')
		resumeToasts('hover')
		vi.advanceTimersByTime(60_000)
		expect(getToasts()).toHaveLength(1)
	})

	it('stays paused when focus leaves but the mouse is still over', () => {
		addToast('mouse')
		pauseToasts('hover')
		pauseToasts('focus')
		resumeToasts('focus')
		vi.advanceTimersByTime(60_000)
		expect(getToasts()).toHaveLength(1)
	})

	it('holds the remaining toast when one is dismissed while paused', () => {
		const first = addToast('one')
		addToast('two')
		pauseToasts()
		dismissToast(first)
		vi.advanceTimersByTime(60_000)
		expect(getToasts()).toHaveLength(1)
		resumeToasts()
		vi.advanceTimersByTime(6000)
		expect(getToasts()).toHaveLength(0)
	})

	it('dismisses one by id and all at once', () => {
		const first = addToast('one')
		addToast('two')
		dismissToast(first)
		expect(getToasts().map((t) => t.message)).toEqual(['two'])
		dismissAllToasts()
		expect(getToasts()).toHaveLength(0)
	})

	it('never fires a dismissed toast’s timer at a recycled id', () => {
		const id = addToast('one')
		dismissToast(id)
		addToast('two')
		vi.advanceTimersByTime(6000)
		// If the first timer had survived it would have run against a live stack.
		expect(getToasts()).toHaveLength(0)
	})
})

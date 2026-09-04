import { describe, it, expect, vi, beforeEach } from 'vitest'

const goto = vi.fn()
vi.mock('$app/navigation', () => ({ goto: (...args: unknown[]) => goto(...args) }))

import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
import { getToasts, dismissToast } from '$lib/stores/toast.svelte'

/**
 * Phase 04 — the one feedback contract. `submitFeedback` is the single place that decides what a
 * user is told after a mutating form submits, so all four `use:enhance` result types are pinned
 * here, along with the `busy`-always-released invariant it inherits from `createSubmitGuard`.
 *
 * The toast store is deliberately NOT mocked: `addToast` is the behaviour under test, so the
 * assertions read the real store.
 */

/** Drive one full submit cycle, mirroring the driver in `submit-guard.test.ts`. */
async function submit(
	fb: ReturnType<typeof submitFeedback>,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	result: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	update: any = vi.fn()
) {
	// Captured before `enhance` runs: the guard REPLACES `input.cancel` with its own wrapper, so
	// reading it back off the input afterwards no longer sees this spy.
	const cancel = vi.fn()
	const input = {
		cancel,
		formData: new FormData(),
		action: new URL('http://x/?/a'),
		submitter: null
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const after = await fb.enhance(input as any)
	const busyInFlight = fb.busy
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const settle = () => (after as (o: any) => Promise<void>)({ result, update, formElement: null })
	return { busyInFlight, settle, update, cancel, after }
}

const texts = () => getToasts().map((t) => t.message)

describe('submitFeedback', () => {
	beforeEach(() => {
		goto.mockReset()
		for (const t of [...getToasts()]) dismissToast(t.id)
	})

	it('fires a success toast and calls update() on a success result', async () => {
		const fb = submitFeedback({ success: 'Saved.' })
		const s = await submit(fb, { type: 'success', data: {} })
		expect(s.busyInFlight).toBe(true)
		await s.settle()

		expect(texts()).toEqual(['Saved.'])
		expect(getToasts()[0].kind).toBe('success')
		expect(s.update).toHaveBeenCalledOnce()
		expect(fb.busy).toBe(false)
	})

	// E3: the success contract is `saved: true | string`, and a string IS the message. Reading it
	// here is what lets an adopting page pass no options at all.
	it('toasts the action’s own `saved` string when no success option is given', async () => {
		const fb = submitFeedback()
		const s = await submit(fb, { type: 'success', data: { action: 'void', saved: 'Run voided.' } })
		await s.settle()

		expect(texts()).toEqual(['Run voided.'])
		expect(getToasts()[0].kind).toBe('success')
	})

	it('stays silent for `saved: true`, which carries no message', async () => {
		const fb = submitFeedback()
		const s = await submit(fb, { type: 'success', data: { action: 'void', saved: true } })
		await s.settle()

		expect(texts()).toEqual([])
	})

	it('lets an explicit success option win over the action’s `saved` string', async () => {
		const fb = submitFeedback({ success: null })
		const s = await submit(fb, { type: 'success', data: { saved: 'Run voided.' } })
		await s.settle()

		expect(texts()).toEqual([])
	})

	it('takes the failure toast text from data.error and still calls update()', async () => {
		const fb = submitFeedback()
		// update() must still run or the page-local banner never renders — the util is additive
		// to a page's own feedback, it never replaces it.
		const s = await submit(fb, { type: 'failure', data: { error: 'Employee is offboarded.' } })
		await s.settle()

		expect(texts()).toEqual(['Employee is offboarded.'])
		expect(getToasts()[0].kind).toBe('error')
		expect(s.update).toHaveBeenCalledOnce()
		expect(fb.busy).toBe(false)
	})

	it('fires no toast on a redirect and navigates with invalidateAll', async () => {
		const fb = submitFeedback({ success: 'Saved.' })
		// The destination renders the flash cookie — a toast here would double up.
		const s = await submit(fb, { type: 'redirect', location: '/employees/e1' })
		await s.settle()

		expect(texts()).toEqual([])
		expect(goto).toHaveBeenCalledWith('/employees/e1', { invalidateAll: true })
		expect(fb.busy).toBe(false)
	})

	it('renders a fixed friendly string on an error result, never the raw text', async () => {
		const fb = submitFeedback()
		const s = await submit(fb, {
			type: 'error',
			error: { message: 'Invalid `db.user.findMany()` invocation' }
		})
		await s.settle()

		expect(texts()).toEqual(['Something went wrong. Please try again.'])
		expect(getToasts()[0].kind).toBe('error')
		expect(texts().join()).not.toContain('invocation')
		expect(fb.busy).toBe(false)
	})

	it('releases busy on every result type', async () => {
		for (const result of [
			{ type: 'success', data: {} },
			{ type: 'failure', data: { error: 'nope' } },
			{ type: 'redirect', location: '/x' },
			{ type: 'error', error: new Error('boom') }
		]) {
			const fb = submitFeedback()
			const s = await submit(fb, result)
			await s.settle()
			expect(fb.busy, `busy latched on ${result.type}`).toBe(false)
		}
	})

	it('releases busy when onSuccess throws', async () => {
		// A latched guard wedges the form for the life of the page — worse than the error itself.
		const fb = submitFeedback({
			onSuccess: () => {
				throw new Error('panel close blew up')
			}
		})
		const s = await submit(fb, { type: 'success', data: {} })
		await expect(s.settle()).rejects.toThrow('panel close blew up')
		expect(fb.busy).toBe(false)
	})

	it('resolves the success message from a function and skips the toast when it returns null', async () => {
		const fb = submitFeedback({ success: (data) => (data?.saved ? 'Done.' : null) })
		await (await submit(fb, { type: 'success', data: { saved: true } })).settle()
		expect(texts()).toEqual(['Done.'])

		await (await submit(fb, { type: 'success', data: { saved: false } })).settle()
		expect(texts()).toEqual(['Done.'])
	})

	it('runs onSuccess before the toast', async () => {
		const onSuccess = vi.fn()
		const fb = submitFeedback({ success: 'Saved.', onSuccess })
		await (await submit(fb, { type: 'success', data: { id: 'e1' } })).settle()
		expect(onSuccess).toHaveBeenCalledWith({ id: 'e1' })
	})

	it('lets an inner handler own update() while the toast still fires', async () => {
		const ownCallback = vi.fn()
		const fb = submitFeedback({ success: 'Saved.', inner: () => ownCallback })
		const s = await submit(fb, { type: 'success', data: {} })
		await s.settle()

		expect(ownCallback).toHaveBeenCalledOnce()
		expect(s.update).not.toHaveBeenCalled()
		expect(texts()).toEqual(['Saved.'])
	})

	it('inherits the guard: a second submit in flight is cancelled and busy is released', async () => {
		const fb = submitFeedback()
		const first = await submit(fb, { type: 'success', data: {} })
		expect(fb.busy).toBe(true)

		// The overlap is the whole point: the second submit must arrive BEFORE the first settles,
		// or the guard's `cancel()` branch is never reached and a missing guard reads as green.
		const second = await submit(fb, { type: 'success', data: {} })
		expect(second.cancel).toHaveBeenCalledOnce()
		expect(second.after).toBeUndefined()

		await first.settle()
		expect(fb.busy).toBe(false)
		expect(second.update).not.toHaveBeenCalled()
	})

	// The `busy`-always-released invariant, one test per path that could latch the lock. A latched
	// `busy` permanently disables the button — the user cannot retry without a page reload.
	it('releases busy when goto() rejects on a redirect', async () => {
		goto.mockRejectedValueOnce(new Error('navigation aborted'))
		const fb = submitFeedback()
		const s = await submit(fb, { type: 'redirect', location: '/x' })
		await expect(s.settle()).rejects.toThrow('navigation aborted')
		expect(fb.busy).toBe(false)
	})

	it('releases busy when the redirect navigation is cancelled (goto resolves early)', async () => {
		goto.mockResolvedValueOnce(undefined)
		const fb = submitFeedback()
		const s = await submit(fb, { type: 'redirect', location: '/x' })
		await s.settle()
		expect(fb.busy).toBe(false)
	})

	it('releases busy when opts.inner throws before the request goes out', async () => {
		const fb = submitFeedback({
			inner: () => {
				throw new Error('inner blew up')
			}
		})
		await expect(submit(fb, { type: 'success', data: {} })).rejects.toThrow('inner blew up')
		expect(fb.busy).toBe(false)
	})

	it('releases busy when the inner handler’s own callback throws', async () => {
		const fb = submitFeedback({
			inner: () => async () => {
				throw new Error('callback blew up')
			}
		})
		const s = await submit(fb, { type: 'success', data: {} })
		await expect(s.settle()).rejects.toThrow('callback blew up')
		expect(fb.busy).toBe(false)
	})

	it('falls back to a friendly string when a failure carries no error text', async () => {
		const fb = submitFeedback()
		await (await submit(fb, { type: 'failure', data: {} })).settle()
		expect(texts()).toEqual(['Something went wrong. Please try again.'])
	})
})

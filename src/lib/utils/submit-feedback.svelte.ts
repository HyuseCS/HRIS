import type { SubmitFunction } from '@sveltejs/kit'
import { goto } from '$app/navigation'
import { addToast } from '$lib/stores/toast.svelte'
import { createSubmitGuard } from './submit-guard.svelte'

/**
 * The one feedback contract (phase 04).
 *
 * Every mutating `use:enhance` form routes its outcome through here, so a user is told what
 * happened in one consistent way. It layers on `createSubmitGuard`, inheriting the double-submit
 * lock and — critically — the `busy`-always-released invariant that guard already pins.
 *
 * It is ADDITIVE: on a failure it still calls `update()`, so a page's own scoped banner keeps
 * rendering. The toast never replaces page-local feedback.
 *
 * ```svelte
 * const save = submitFeedback({ success: 'Request approved.' })
 * <form method="POST" action="?/decide" use:enhance={save.enhance}>
 *   <button disabled={save.busy}>Approve</button>
 * </form>
 * ```
 */

/** Whatever a form action returned — `success` and `failure` both carry an arbitrary payload. */
export type FeedbackData = Record<string, unknown> | undefined

/** A fixed string, or one derived from the action's payload. `null` means "say nothing". */
export type FeedbackMessage = string | null | ((data: FeedbackData) => string | null)

/** Shown for an unexpected `error` result. The raw message is a Prisma dump — never show it. */
const FRIENDLY_ERROR = 'Something went wrong. Please try again.'

function resolve(msg: FeedbackMessage | undefined, data: FeedbackData): string | null {
	if (msg === undefined || msg === null) return null
	return typeof msg === 'function' ? msg(data) : msg
}

/** The `saved: true | string` success contract: only a string carries a message. */
function savedMessage(data: FeedbackData): string | null {
	return typeof data?.saved === 'string' ? data.saved : null
}

export interface SubmitFeedbackOptions {
	/** Toast text on success. Omit to use the action's own `saved` string; `null` for no toast. */
	success?: FeedbackMessage
	/** Overrides the failure toast. Omit to read `data.error`. */
	error?: FeedbackMessage
	/** Runs before the success toast — e.g. close a panel. */
	onSuccess?: (data: FeedbackData) => void | Promise<void>
	/** Composes with an existing handler, exactly like `createSubmitGuard`. */
	inner?: SubmitFunction
}

export function submitFeedback(opts: SubmitFeedbackOptions = {}) {
	const guard = createSubmitGuard(async (input) => {
		const after = await opts.inner?.(input)

		return async (o) => {
			const { result } = o

			if (result.type === 'redirect') {
				// The destination renders the flash cookie, so no toast fires here.
				if (after) await after(o)
				await goto(result.location, { invalidateAll: true })
				return
			}

			// When the wrapped handler returns its own callback it owns the response — including
			// whether to call `update()`. Same seam `createSubmitGuard` documents.
			if (after) await after(o)

			if (result.type === 'success') {
				await opts.onSuccess?.(result.data)
				// The success contract is `saved: true | string` — a string IS the message. With no
				// explicit `success` option a site gets its server's own words for free, which is
				// why an adopting page needs no bespoke wiring.
				const msg =
					opts.success === undefined
						? savedMessage(result.data)
						: resolve(opts.success, result.data)
				if (msg) addToast(msg, { kind: 'success' })
				if (!after) await o.update()
			} else if (result.type === 'failure') {
				const override = resolve(opts.error, result.data)
				const fromData = typeof result.data?.error === 'string' ? result.data.error : null
				const msg = opts.error !== undefined ? override : (fromData ?? FRIENDLY_ERROR)
				if (msg) addToast(msg, { kind: 'error' })
				// Always update, even when the toast is suppressed: the page's own banner reads
				// `form?.error` and would otherwise never render.
				if (!after) await o.update()
			} else {
				addToast(FRIENDLY_ERROR, { kind: 'error' })
			}
		}
	})

	return {
		get busy() {
			return guard.busy
		},
		enhance: guard.enhance
	}
}

// Shared toast store (Svelte 5 runes). Import the functions anywhere; render with
// <Toaster/> once in the app layout.

export type ToastKind = 'info' | 'success' | 'error'
export interface Toast {
	id: string
	message: string
	link?: string | null
	kind: ToastKind
}

/** Most toasts on screen at once. A burst of notifications must not bury the page. */
const MAX_VISIBLE = 5
const DEFAULT_TIMEOUT = 6000

let toasts = $state<Toast[]>([])

// One timer per toast, kept OUTSIDE the state so pausing never re-renders. `remaining` is the
// life a toast has left; it only shrinks while the timer is actually running, which is what
// makes hover-to-pause work — a link-toast used to vanish mid-click on the 6s hard timer.
interface Timer {
	handle: ReturnType<typeof setTimeout> | null
	remaining: number
	startedAt: number
}
const timers = new Map<string, Timer>()
let paused = false

function startTimer(id: string): void {
	const timer = timers.get(id)
	if (!timer || timer.handle) return
	timer.startedAt = Date.now()
	timer.handle = setTimeout(() => dismissToast(id), timer.remaining)
}

export function getToasts(): Toast[] {
	return toasts
}

export function addToast(
	message: string,
	opts: { link?: string | null; kind?: ToastKind; timeout?: number } = {}
): string {
	const id = crypto.randomUUID()
	toasts.push({ id, message, link: opts.link ?? null, kind: opts.kind ?? 'info' })
	// Drop from the oldest end, so the newest — the one that describes what the user just did —
	// always survives the cap.
	while (toasts.length > MAX_VISIBLE) dismissToast(toasts[0].id)
	const timeout = opts.timeout ?? DEFAULT_TIMEOUT
	if (timeout > 0) {
		timers.set(id, { handle: null, remaining: timeout, startedAt: 0 })
		if (!paused) startTimer(id)
	}
	return id
}

export function dismissToast(id: string): void {
	const timer = timers.get(id)
	if (timer?.handle) clearTimeout(timer.handle)
	timers.delete(id)
	toasts = toasts.filter((t) => t.id !== id)
}

export function dismissAllToasts(): void {
	for (const t of [...toasts]) dismissToast(t.id)
}

/** Hold every toast open — the Toaster calls this on hover and on focus-within. */
export function pauseToasts(): void {
	paused = true
	for (const timer of timers.values()) {
		if (!timer.handle) continue
		clearTimeout(timer.handle)
		timer.handle = null
		timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt))
	}
}

export function resumeToasts(): void {
	paused = false
	for (const id of timers.keys()) startTimer(id)
}

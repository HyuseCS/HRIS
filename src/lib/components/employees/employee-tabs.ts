// The 201 file (`employees/[id]`) is ~1,800 lines of sections in one scroll. Phase 07 gives it
// five URL-backed tabs instead of sub-routes, so the 940-line load and all 21 actions stay put.
// These two functions are pure so they can be unit-tested without rendering the page.

export type TabId = 'overview' | 'compensation' | 'documents' | 'history' | 'actions'

export const TABS: { id: TabId; label: string }[] = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'compensation', label: 'Compensation & Payroll' },
	{ id: 'documents', label: 'Documents' },
	{ id: 'history', label: 'History' },
	{ id: 'actions', label: 'Actions' }
]

/** Absent, empty or unknown `?tab=` resolves to Overview — a bad deep link never errors. */
export function resolveTab(raw: string | null): TabId {
	return TABS.some((t) => t.id === raw) ? (raw as TabId) : 'overview'
}

/**
 * The href for a tab, mutating ONLY the `tab` param on a copy of the current URL — the same
 * recipe `Pagination.svelte` uses, and what keeps `?from=` (read by BackButton) alive across a
 * tab change.
 */
export function hrefFor(url: URL, tab: TabId): string {
	const params = new URLSearchParams(url.searchParams)
	params.set('tab', tab)
	return `${url.pathname}?${params.toString()}`
}

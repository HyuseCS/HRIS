/**
 * Stable ids for the rows inside `PerformanceTemplate.structure` (#178).
 *
 * Lives OUTSIDE `$lib/server` on purpose: the template builder generates an id on the client the
 * moment HR adds a row (plan §8.3), and SvelteKit refuses a client import of `$lib/server/**`.
 * `$lib/server/performance/schemas` re-exports it so the seed and the server schemas use the very
 * same generator.
 *
 * ID STABILITY RULE — an id is generated ONCE, when the row is first added, and carried through
 * every later edit. Regenerating an id on edit would orphan every answer keyed to it in every
 * already-open review that snapshotted the old id.
 */
export function newId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

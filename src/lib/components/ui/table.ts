/**
 * Column definition for `Table.svelte`.
 *
 * Kept in a plain module rather than the component: a Svelte instance script cannot export
 * types, and consumers need this to annotate their `columns` array and `cell` snippet.
 */
export interface Column {
	/** Identifies the column in the `cell` snippet. */
	key: string
	label: string
	align?: 'left' | 'right' | 'center'
	/**
	 * `min` sizes the column to its content and stops it absorbing the table's slack — use it
	 * for money, dates, status and the action column, so the descriptive column takes the space.
	 */
	width?: 'auto' | 'min' | `w-[${string}]`
	/** Drop the column from the stacked mobile layout, where space is scarce. */
	hideOnMobile?: boolean
}

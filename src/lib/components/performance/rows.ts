/**
 * The two things all nine template-builder editors share (#178, plan §8.1).
 *
 * Deliberately NOT a generic `<RepeatableRows>` component: the nine row shapes differ enough that
 * a generic version needs a slot per field type, which is more code than nine concrete editors.
 * What they genuinely share is one input class string and one array move — both below.
 */

export const inputClass =
	'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export const smallInputClass =
	'h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Move one row up (`-1`) or down (`1`), in place. Order IS the data for sections, criteria and
 * — load-bearingly — `signatoryOrder`, where index 0 signs first.
 *
 * Ids are untouched: a reorder must never change which answer belongs to which criterion.
 */
export function moveRow<T>(rows: T[], index: number, direction: -1 | 1): void {
	const target = index + direction
	if (target < 0 || target >= rows.length) return
	const [row] = rows.splice(index, 1)
	rows.splice(target, 0, row)
}

/** Looks up the validation issue the server put on one row, by its dotted zod path. */
export type ErrorAt = (_path: string) => string | undefined

/**
 * Asks before removing a row, or removes it straight away when `message` is null (an empty row —
 * confirming its deletion is friction for nothing).
 */
export type ConfirmRemove = (_message: string | null, _remove: () => void) => void

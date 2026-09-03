/** True when the actor undoing a finalized separation is the same person who finalized it. #304/D-3
 *  is detect-don't-block, exactly like #298's payroll marker (`payroll/audit-markers.ts`): Super
 *  Admin stays break-glass, so nothing is refused — the fact is stamped onto the undo's audit entry
 *  instead. The caller MUST conditional-spread it
 *  (`...(undidOwnFinalize(...) && { sameActorAsFinalizer: true })`) so the key is ABSENT on an
 *  ordinary undo, never present-and-false, and a search for it returns only real self-undos.
 *
 *  A null-vs-null match never counts: a record with a null `finalizedById` must never match, or the
 *  search floods with false hits. */
export function undidOwnFinalize(
	actorId: string,
	record: { finalizedById: string | null } | null | undefined
): boolean {
	if (!actorId) return false
	return actorId === record?.finalizedById
}

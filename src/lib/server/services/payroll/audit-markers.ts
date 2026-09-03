/** True when the actor voiding a payroll run or period is the same person who approved that run
 *  or locked that period. #298 is detect-don't-block: Super Admin stays break-glass, so nothing is
 *  refused — this marker is stamped onto the void's audit entry instead. The caller MUST
 *  conditional-spread it (`...(voidedOwnApproval(...) && { sameActorAsApprover: true })`) so the
 *  key is ABSENT on an ordinary void, never present-and-false, and a search for it returns only
 *  real same-actor voids.
 *
 *  A null-vs-null match never counts: an unapproved run and an unlocked period leave both sides
 *  null, and marking that as same-actor would flood the search with false hits. */
export function voidedOwnApproval(
	actorId: string,
	run: { approvedById: string | null } | null | undefined,
	period?: { lockedById: string | null } | null
): boolean {
	if (!actorId) return false
	return actorId === run?.approvedById || actorId === period?.lockedById
}

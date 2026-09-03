import type { SignatorySlot } from './types'

// The pure core of sequential sign-off (#178, plan item 138). NOTHING in this file may touch
// the database, the filesystem or the network, and there is no clock: no `Date.now()`, no
// argless `new Date()`. It is set-and-order logic over data the caller already fetched, which
// is what lets the same answer be unit-tested and reused on both sides of the wire.
//
// THE ONE FUNCTION THAT ANSWERS "WHOSE TURN IS IT". Both the UI's "you may sign now"
// affordance and the server's out-of-turn REJECTION call `nextSignatorySlot`, so the two
// cannot disagree. A UI that computed the turn its own way would eventually show an Attest
// button the service refuses, or hide one it would have accepted.
//
// THERE IS NO STORED CURRENT-SIGNATORY POINTER, DELIBERATELY. A pointer is a second source of
// truth that drifts the first time a signoff row is written by any path that forgets to
// advance it. Whose turn it is is DERIVED from the declared order plus the rows that exist.
// Do not add a pointer, a `currentSlotIndex` column, or a cached "next" value.
//
// ORDER IS THE DATA: the answer comes from `signatoryOrder`'s positions, never from the order
// the `existingSignoffs` rows happen to arrive in. Rows come back from Prisma in whatever
// order the query gave, and one person may legitimately hold several slots.
//
// THE RULE THIS FILE EXISTS UNDER (plan §0): the app performs NO arithmetic on evaluation
// scores. This module orders signatures. It must never compute, sum or average a score.

/**
 * The slot whose turn it is, or `null` when every slot in the order has been signed.
 *
 * The first slot in `signatoryOrder` with no matching signoff row. Signoff rows for slot ids
 * that are not in the order are ignored — impossible against an immutable snapshot, but this
 * must not throw if it ever happens. Duplicate rows for the same slot id collapse to one, so a
 * doubled row (which `@@unique([reviewId, slotId])` should prevent) cannot make this
 * mis-advance either.
 *
 * The caller turns "the returned slot is not the one the actor wants" into the out-of-turn
 * rejection SPEC AC11 requires.
 */
export function nextSignatorySlot(
	signatoryOrder: SignatorySlot[],
	existingSignoffs: { slotId: string }[]
): SignatorySlot | null {
	const signed = new Set(existingSignoffs.map((s) => s.slotId))
	return signatoryOrder.find((slot) => !signed.has(slot.id)) ?? null
}

/**
 * Has every slot in the order been signed?
 *
 * Derived from `nextSignatorySlot` rather than by counting rows, so the two answers cannot
 * disagree: a length comparison would call a review complete on four rows even if one of them
 * belonged to a slot outside the order.
 *
 * An EMPTY `signatoryOrder` is fully signed by this definition. A template with no signatories
 * is rejected upstream by `templateStructureSchema`'s `.min(1)` on `signatoryOrder`, so this
 * case is unreachable in practice; returning `true` keeps the function total.
 */
export function isFullySigned(
	signatoryOrder: SignatorySlot[],
	existingSignoffs: { slotId: string }[]
): boolean {
	return nextSignatorySlot(signatoryOrder, existingSignoffs) === null
}

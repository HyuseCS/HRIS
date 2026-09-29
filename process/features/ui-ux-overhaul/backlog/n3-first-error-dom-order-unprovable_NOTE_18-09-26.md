# N3-AC6 — the "first error in page order" clause is not proven by any test

**Status:** open, deliberately uncovered. Recorded so a green suite is not mistaken for coverage.

## The clause

N3-AC6 says the error jump on `/employees/new` lands on the **first** rejected field
**in page order**, not in whatever order the server wrote its keys. The code does this:
`FIELD_ORDER` is derived from the DOM, and `firstErrorField` indexes the server's error
keys through it.

## What the test actually proves

`tests/e2e/employees-new-layout.spec.ts` › N3-T6 proves the jump control renders, that it
moves focus rather than only scrolling, and that it lands on a genuinely `aria-invalid`
field. It does **not** prove the ordering, because no reachable field pair inverts server
order against DOM order.

## Why no such pair is reachable

Two real schema-vs-DOM inversions exist in the form:

1. `basicMonthlySalary` / `rateType` — the schema puts salary first, the DOM puts
   `rateType` first.
2. `reportsToId` / `workScheduleId` / `positionId`.

Neither is usable:

- `rateType` is only zod-invalid through the pairing refine, and the client `$effect` in
  `employees/new/+page.svelte` makes that state unreachable from the UI.
- The three id selects can never be zod-invalid at all — every option they offer is valid.

The only other field that is natively valid but zod-invalid early in the DOM is `email`
(`a@b` passes the browser's own check and fails zod's TLD rule), and nothing earlier in the
DOM can be zod-invalid alongside it.

## What would close it

Any one of:

- a component test that renders the form with a hand-built `form.errors` whose key order is
  inverted against `FIELD_ORDER`, and asserts which field receives focus;
- a unit test over the `firstErrorField` derivation alone, given an out-of-order error map;
- a future field pair that is natively submittable and zod-invalid in inverted order, which
  would make the e2e route viable.

The unit-level option is the cheap one and does not need a browser.

## Related

- [[a-finding-that-is-only-a-count]] — the failure mode this note exists to avoid.
- `owner-click-pass-design-lane_PLAN_18-09-26.md` § N3, Step 10 and the N3-T6 discussion.

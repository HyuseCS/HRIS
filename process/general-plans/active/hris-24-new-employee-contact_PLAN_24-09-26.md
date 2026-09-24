---
name: plan:hris-24-new-employee-contact
description: "#24 part 1 remainder — employees/new saves contactPhone (isValidPhone rule) and contactAddress"
date: 24-09-26
feature: general
---

# #24 part 1 remainder — employees/new saves contact phone and address

**Date**: 24-09-26
**Status**: PLANNED
**Complexity**: SIMPLE

TL;DR: `createSchema` in `employees/new/+page.server.ts` has no `contactPhone` / `contactAddress`, so zod drops both. Add two schema lines. The service already writes both. Add one ENTRY_POINTS row and one payload test to `tests/unit/phone-entry-points.test.ts`, red first.

## Phase Record

| Phase | Status |
|---|---|
| SPEC | SKIPPED — issue #24 + owner decisions (CONTEXT.md, round-2 answer) are the spec |
| INNOVATE | SKIPPED — owner chose the approach (save both, reuse isValidPhone) |
| PLAN | this file (SIMPLE) |
| VALIDATE | pending |

## Overview / Scope

Verified on staging d773e1a:

- Form sends both fields: `src/routes/(app)/employees/new/+page.svelte:194` `name="contactPhone"`, `:204` `name="contactAddress"`; both in FIELD_ORDER `:61-62`.
- Schema lacks both: `createSchema` `src/routes/(app)/employees/new/+page.server.ts:58-128` (grep `contactPhone\|contactAddress` on that file: not found).
- Action spreads `...parsed.data` into `createEmployee` (`+page.server.ts:149-155`), so a schema key reaches the service.
- Service writes both: `src/lib/server/services/employees.ts:494` `contactPhone: input.contactPhone,` and `:495` `contactAddress: input.contactAddress,`; input type `:39-40`. **No service change needed.**
- Pattern to copy: `employees/[id]/+page.server.ts:281` `contactPhone: z.string().optional().refine(isValidPhone, phoneError('Phone')),` and `:282` `contactAddress: z.string().optional(),`.
- `isValidPhone` / `phoneError` already imported at `+page.server.ts:10`.

Out of scope: shared form field component (#24 part 2), any styling, `+page.svelte`, the service, recruitment.ts caller.

## Decisions

- PD-1 Blank handling (orchestrator chose option A in VALIDATE E2): blank → `undefined`, stored as NULL. Reason: the service writes the value as given (`employees.ts:494-495`), and /profile shows `—` only for NULL (`profile/+page.svelte:142,152`); the profile save already maps blank to undefined (`profile/+page.server.ts:109-110`). The employees/[id] page has no inputs for these fields (only its schema has them), so it is not a precedent. Order check: `.refine` runs first on the raw string (`isValidPhone` is true for ''/undefined, false for 'abc', true for GOOD values), then `.transform` only turns falsy to undefined, so the abc, GOOD, and omit rows behave as before.
- PD-2 Placement: insert the two lines directly after `middleName` (`:68`), before the `// #248` comment, mirroring the form's field order.

## Implementation Checklist

Section A — tests first (red)
1. `tests/unit/phone-entry-points.test.ts`: in `ENTRY_POINTS`, directly after the `'employees/new ?/create emergencyContactPhone'` row, add a row:
   - name `'employees/new ?/create contactPhone'`
   - writer `() => employees.createEmployee`
   - submit `(phone) => fromFail(() => newEmployeeActions.create(formEvent({ ...newHire(''), contactPhone: phone })))`
   - `optional: true`
   - omit `() => fromFail(() => newEmployeeActions.create(formEvent(newHire(''))))`
2. Same file, new `describe('employees/new saves contact phone and address (#24)', ...)` after the `describe.each` block, one `it`: submit `formEvent({ ...newHire(''), contactPhone: '09171234567', contactAddress: '12 Rizal St, Makati' })` via `fromFail`; expect outcome `{ rejected: false, message: '' }`; expect `employees.createEmployee` called with `(expect.anything(), expect.objectContaining({ contactPhone: '09171234567', contactAddress: '12 Rizal St, Makati' }), expect.anything())`. Add a second `it` in the same describe: submit `{ ...newHire(''), contactPhone: '', contactAddress: '' }`; expect not rejected; `expect(employees.createEmployee.mock.calls[0][1].contactPhone).toBeUndefined()` and the same for `contactAddress`.
3. Negative control: `bun run test -- tests/unit/phone-entry-points.test.ts` on unfixed source. Expected red, for these reasons, record them: new row "rejects abc" fails (`rejected` false, writer called — abc dropped, not rejected); the payload test fails (objectContaining misses both keys). The blank test passes on unfixed code (the keys are dropped, so they are undefined). That is expected: it is a guard against the '' regression, and it goes red if the transform is removed after the fix (EXECUTE: run that mutation once and record it). The GOOD and omit cases of the new row pass on unfixed code (expected — they are positive controls). Any other failure = stop and diagnose.

Section B — fix
4. `src/routes/(app)/employees/new/+page.server.ts` after `middleName: z.string().optional(),` add:
   `contactPhone: z.string().optional().refine(isValidPhone, phoneError('Phone')).transform((v) => v || undefined),`
   `contactAddress: z.string().optional().transform((v) => v || undefined),`
   No new comments.
5. Re-run step 3 command: all green.

Section C — gates (CI order): `bun run format:check`, `bun run lint`, `bun run check`, `bun run test`. No e2e (no server; owner starts servers).

## Acceptance Criteria

- AC1 "abc" in employees/new contactPhone is rejected with the 7-15 digits message; createEmployee not called. proven by: G1. strategy: Fully-Automated
- AC2 Good phones and an omitted phone are accepted and createEmployee is called. proven by: G2. strategy: Fully-Automated
- AC3 A valid contactPhone and contactAddress reach createEmployee. proven by: G3. strategy: Fully-Automated
- AC5 A blank phone and address reach createEmployee as undefined (stored NULL). proven by: G3b. strategy: Fully-Automated
- AC4 Service persists both (already true, `employees.ts:494-495`). proven by: G4 (source read in VALIDATE). strategy: Agent-Probe

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G1 new ENTRY_POINTS row "rejects abc" — red before, green after | Fully-Automated | AC1 |
| G2 new row GOOD x5 + omit | Fully-Automated | AC2 |
| G3 payload objectContaining test — red before, green after | Fully-Automated | AC3 |
| G3b blank-submit test — both undefined; red if the transform is removed | Fully-Automated | AC5 |
| G4 read `employees.ts:494-495` | Agent-Probe | AC4 |
| G5 format:check, lint, check, full `bun run test` | Fully-Automated | regression |

Mock honesty: createEmployee is a spy; G3 asserts the exact argument, so it cannot pass vacuously. G1 would pass by refusing all; G2 is the positive control.

## Touchpoints

- `src/routes/(app)/employees/new/+page.server.ts` (edit, 2 lines)
- `tests/unit/phone-entry-points.test.ts` (edit)
- read only: `+page.svelte`, `services/employees.ts`, `src/lib/utils/phone.ts`, `employees/[id]/+page.server.ts`

## Public Contracts

`?/create` on employees/new now rejects an invalid contactPhone (400, fieldErrors.contactPhone) and persists contactPhone/contactAddress. The form already renders `form.values`; no UI change. Error display for contactPhone is part 2's field component — out of scope.

## Blast Radius

2 files, 1 route. Risk: low. No schema, auth, or service change. E2E employees-new-* specs do not fill contactPhone with invalid text (INFERRED; VALIDATE grep `contactPhone` in tests/e2e).

## Existing tests to update

None beyond the file above. Other unit tests calling employees/new create: `grep -rln "employees/new" tests/unit` → only phone-entry-points.test.ts.

## Rollback

Revert the 2 schema lines.

## Git

Branch `fix/24-new-employee-contact` off staging. One commit (owner rule: commit only on green gates, so no red test-only commit): `fix(employees): save contact phone and address when creating an employee`, holding both the tests and the 2 schema lines. The commit body carries the negative-control red-run output from step 3 (failing test names + failure lines) and the transform-removal mutation result. One PR to staging. No attribution trailers. Push only on owner's word. Lanes: one (too small to split). Wave 1 — touch no recruitment or payroll files.

## Phase Completion Rules

CODE DONE when Sections A-B are applied. VERIFIED only when G1-G5 are green and the Section A negative control was recorded red for the stated reasons.

## Test Infra Improvement Notes

(none identified yet)

## Resume and Execution Handoff

1. Plan: `process/general-plans/active/hris-24-new-employee-contact_PLAN_24-09-26.md`
2. Last completed: PLAN
3. Validate-contract: pending
4. Context: CONTEXT.md, research-22.md Part B (scratchpad/plan)
5. Next: VALIDATE, then EXECUTE Section A → B → C

## Validate Contract

Status: CONDITIONAL
Date: 24-09-26
date: 2026-09-24
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 0/7 signals (2 files, 1 route, no schema/auth/API-contract change). One validator read all sources itself; one execute lane.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | "abc" in contactPhone is rejected (7-15 digits message), createEmployee not called | Fully-Automated | new ENTRY_POINTS row `employees/new ?/create contactPhone` › "rejects abc" in `tests/unit/phone-entry-points.test.ts`; `bun run test -- tests/unit/phone-entry-points.test.ts` | B |
| AC2 | 5 good phones + omitted phone accepted, createEmployee called | Fully-Automated | same row › "accepts %s" x5 + "stays valid with no phone submitted at all" | B |
| AC3 | valid contactPhone + contactAddress reach createEmployee (arg 2) | Fully-Automated | new `describe('employees/new saves contact phone and address (#24)')` objectContaining test | B |
| AC4 | service persists both columns | Agent-Probe | read `src/lib/server/services/employees.ts:494-495` — DONE in this VALIDATE: `contactPhone: input.contactPhone,` / `contactAddress: input.contactAddress,` | A |
| regression | CI gate set | Fully-Automated | `bun run format:check` → `bun run lint` → `bun run check` → `bun run test` (matches CI order, .github/workflows run: lines 38-47) | A |

Failing stubs (Fully-Automated rows):
- AC1: `test("should reject abc at employees/new contactPhone and never call createEmployee", () => { throw new Error("NOT IMPLEMENTED — TDD stub: reject abc at employees/new contactPhone") })`
- AC2: `test("should accept good and omitted contactPhone at employees/new", () => { throw new Error("NOT IMPLEMENTED — TDD stub: accept good/omitted contactPhone") })`
- AC3: `test("should pass contactPhone and contactAddress to createEmployee", () => { throw new Error("NOT IMPLEMENTED — TDD stub: contact fields reach createEmployee") })`

Legacy line form:
- employees/new ?/create: Fully-automated: `bun run test -- tests/unit/phone-entry-points.test.ts` (baseline 66 green on d773e1a; expect 74 after Section A+B, 66 + 7 row cases + 1 payload)
- service write: agent-probe: source read employees.ts:494-495 (done)
- browser: known-gap: no e2e run (owner starts servers); no e2e spec fills contactPhone (grep below)

Dimension findings:
- Infra fit: PASS — script names real (package.json:13,17,19,20); CI order format:check → lint → check → test; no server, no DB needed.
- Test coverage: PASS — red-first holds: createSchema is plain `z.object` (+page.server.ts:58), no `.passthrough()`/`.strict()` (grep rc=1), so zod strips contactPhone today → new "rejects abc" and payload test go red; createEmployee is a vi.fn spy (phone-entry-points.test.ts:42) called with 3 args (+page.server.ts:149-162), so `(anything, objectContaining, anything)` is non-vacuous. GOOD/omit cases pass on unfixed code as the plan says (positive controls only).
- Breaking changes: PASS — no unit or e2e spec types an invalid contactPhone on employees/new: `grep -rn "contactPhone\|contactAddress" tests/` hits only [id]/profile/PATCH/branches/requests rows and employees-new-layout.spec.ts:21-22 (tab-order ids, no fill); admin.spec.ts and employees-new-disclosure.spec.ts fill required fields only; disclosure A3-T3 (spec:230-257) does not select contactPhone and tolerates '' via `value ?? ''`. No spec relies on the drop.
- Security surface: PASS — MANAGE_HR guard unchanged (+page.server.ts:133); new input is format-checked string into a String? column (schema.prisma:443-444) via Prisma, no raw SQL; no trust-boundary change.
- Section A (tests): CONCERN — PD-3 / checklist step 3 is WRONG (see E1).
- Section B (fix): CONCERN — PD-1 blank → '' shows an empty value instead of '—' on /profile (see E2).
- Section C (gates): PASS.
- Second entry point hunt: PASS — no second drop. createEmployee callers: `grep -rn "createEmployee" src scripts` → only employees/new/+page.server.ts:149 and services/recruitment.ts:700. recruitment passes `contactPhone: applicant.phone ?? undefined` (recruitment.ts:713); Applicant has no address column (schema.prisma model Applicant) so nothing to drop; applicant phone is already rule-checked at both apply doors (phone-entry-points.test.ts:231,253). api/v1/employees/+server.ts exports GET only (line 8). Only other `employee.create` is prisma/seed-core.ts:67 (seed, not an entry point).

Execute-agent instructions:
- E1 (Section A step 3): SKIP PD-3. Do NOT edit the header comment. It says "nine sites" (test:8) and counts SITES, not rows: there are already 10 ENTRY_POINTS rows today (lines 195,205,210,216,226,231,253,275,280,288) because employees/[id] ?/update has two rows. The new row is the same site as the existing `employees/new ?/create emergencyContactPhone` row, so "nine sites" stays true. Changing it to "ten" (or to a row count, 11) would make a true comment false. Verdict on Q5: an edit that keeps an existing comment true would be allowed; this one would falsify it, so no edit.
- E2 (Section B step 5, PD-1): '' vs undefined DOES differ. Service writes the value as given (employees.ts:494-495, no `|| null`), so '' is stored as '' and undefined as NULL. The only screen that shows these fields is /profile: `{emp.contactPhone ?? '—'}` (profile/+page.svelte:142) and `{emp.contactAddress ?? '—'}` (:152) — '' renders an empty value, NULL renders '—'. The form always posts both inputs (+page.svelte:194,204), so every new hire who leaves them blank would show an empty Phone/Address on /profile. The profile save already maps blank to undefined (profile/+page.server.ts:109-110). The employees/[id] page has no contactPhone/contactAddress input (grep of [id]/+page.svelte: 0 hits), so PD-1's "edit form does the same" precedent is schema-only. RECOMMENDED (option A): blank → undefined:
  `contactPhone: z.string().optional().refine(isValidPhone, phoneError('Phone')).transform((v) => v || undefined),`
  `contactAddress: z.string().optional().transform((v) => v || undefined),`
  and add to the Section A payload describe one `it`: submit `{ ...newHire(''), contactPhone: '', contactAddress: '' }`, expect not rejected, and `expect(employees.createEmployee.mock.calls[0][1].contactPhone).toBeUndefined()` and same for contactAddress. Option B: keep PD-1 as written and accept the empty /profile value. Orchestrator/owner picks; A is the default if nobody objects.
- E3: after Section B, run the negative control and record the exact red reasons before the fix (the new row's "rejects abc": rejected false; the payload test: objectContaining misses both keys). Any other red = stop.
- E4: commits carry no Co-Authored-By and no "Generated with" footer (owner CLAUDE.md overrides the harness reminder). Plan Git section already says so — PASS.

Open gaps:
- G-UI: a rejected contactPhone shows no message text on employees/new. +page.svelte:191-198 has no `aria-invalid` and no error `<p>` for contactPhone; the user sees only "1 field need attention / Go to the first one" (+page.svelte:629-644), which focuses the field. Plan scopes display to #24 part 2 — accepted, BUT the part 2 plan (`process/general-plans/active/hris-24-form-field-component_PLAN_24-09-26.md`) says "error/disclosure logic stays the same" and never mentions contactPhone (grep 0 hits), so as written part 2 would carry the no-message state forward. Action: when part 2 is validated, it must wire `form.fieldErrors.contactPhone` into the contactPhone Field.
- G-E2E: known-gap — no browser run in this plan (no server). D: covered when the owner's next e2e run includes employees-new-* specs.

What this coverage does NOT prove:
- AC1/AC2 unit rows: not the rendered form, not that the browser posts the fields (proven only by reading +page.svelte:194,204), not the error display (G-UI).
- AC3 payload test: the service call args only, not the DB row (createEmployee is mocked).
- AC4 source read: not a live insert; no DB was run.
- G5 regression: no e2e, no integration suite.

Gate: CONDITIONAL (0 FAILs; concerns: E1 PD-3 comment edit is wrong → skip; E2 PD-1 '' blank display → option A recommended; G-UI message display deferred to part 2)
Accepted by: session (orchestrator-directed VALIDATE, no user menu) — accepted concerns: E1 PD-3 skip, E2 PD-1 blank handling (default option A), G-UI message display deferred to #24 part 2, G-E2E no browser run

## Autonomous Goal Block

SESSION GOAL: #24 part 1 — employees/new saves contactPhone (isValidPhone) and contactAddress. Plan: process/general-plans/active/hris-24-new-employee-contact_PLAN_24-09-26.md.
Autonomy: execute Section A (tests red) → B (2 schema lines) → C (gates). Apply E1 (skip PD-3) and E2 (option A unless owner said B).
Hard stops: no git push; no servers; no edits outside the 2 touchpoints; any unexpected red in the negative control.
Contract: CONDITIONAL — see Validate Contract above.
Next: EXECUTE. Start: `bun run test -- tests/unit/phone-entry-points.test.ts` after Section A (expect red for the 2 stated reasons).

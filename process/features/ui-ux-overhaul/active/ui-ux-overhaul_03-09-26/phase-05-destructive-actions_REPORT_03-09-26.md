---
name: report:ui-ux-overhaul-phase-05-destructive-actions
description: "Execute report for phase 5 of the Veent HRIS UI/UX overhaul — sixteen §T3 destructive-action sites routed through the kit confirm, the last three native confirm() calls removed, and a three-gate source-scan test with all three mutation checks run red."
date: 03-09-26
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "05"
---

# Phase 5 — `destructive-actions` — EXECUTE report

**Status:** `CODE DONE` — **not** `✅ VERIFIED`.
**Plan:** `phase-05-destructive-actions_PLAN_03-09-26.md`
**Branch:** `feat/uiux-phase-5` (not pushed, no PR).
**Date:** 03-09-26

**TL;DR** — All sixteen §T3 sites are done. Fourteen now open a kit dialog that names the
consequence; two were verify-only and are unchanged. Zero native `confirm()` calls are left in
`src/`. The new `tests/unit/destructive-confirms.test.ts` adds 30 assertions across three gates, and
all three were proven non-vacuous by a mutation run. The full CI gate set is green in CI order. What
is **not** done is every behavioural check: no dialog was ever opened in a browser during this phase.
The P1 matrix (16 rows), P2-P6, R1-R3 and A1 are all still owed, and the plan's rule is explicit —
a green gate set with an unrecorded P1 matrix is `CODE DONE`, never `✅ VERIFIED`.

---

## What Was Done

Sections 0-3 were executed by a prior agent (commits `9062f11`, `715f965`, `ab01634`). This report
covers **Sections 4-7** and records the whole phase for the owner pass.

### Commits

| Commit | Section | Subject |
|---|---|---|
| `9062f11` | S1 | `feat(ui): confirm payroll period void and release (phase 05 s1)` |
| `715f965` | S2 | `feat(ui): confirm a net-pay override and show its delta (phase 05 s2)` |
| `ab01634` | S3 | `feat(ui): confirm DOLE multiplier saves with a was-now summary (phase 05 s3)` |
| `3c7c08e` | — | `fix(ui): preserve newlines in ConfirmDialog messages (phase 03 amendment)` |
| `5c3cfc3` | S4 | `feat(ui): confirm statutory rate applies, rejects and saves; guard unsaved edits (phase 05 s4)` |
| `8fd0e61` | S5 | `feat(ui): confirm offboarding, review release and login deactivation (phase 05 s5)` |
| `0114184` | S6 | `feat(ui): replace the last native confirms with the kit dialog (phase 05 s6)` |
| `9296163` | S7 | `test(ui): scan for confirm wiring, native confirms and consequence copy (phase 05 s7)` |

No `Co-Authored-By` trailer on any commit. Every commit staged explicit paths.

### Per-site outcome

| # | Site | Shape | Outcome |
|---|---|---|---|
| 1 | Offboard employee | B | **DONE** (S5). Form keeps `use:enhance={offboard.enhance}` and its busy gating; submit button is `type="button"`; message interpolates `{employee.firstName} {employee.lastName}`. |
| 2 | Payroll period void | A | **DONE** (S1, prior agent). |
| 3 | Payroll period release | A | **DONE** (S1, prior agent). |
| 4 | Payroll **run** void | — | **VERIFY ONLY — unchanged.** Props still match the phase-04 `ConfirmButton` API; compiles; the model message is intact and is now pinned by G3. |
| 5 | Net-pay override | B | **DONE** (S2, prior agent). `min="0"`, baseline `$state` snapshot, delta readout, dialog fires only when `delta !== 0`. |
| 6 | DOLE multiplier save | B | **DONE** (S3, prior agent). `baselineRates` snapshot + was→now rows; submits straight through when nothing changed; sibling `?/update` untouched. |
| 7 | Statutory proposal Confirm | A | **DONE** (S4). `ConfirmButton` + hidden `proposalId`; `p.changes` interpolated into the message; `// #108` comment added. |
| 8 | Statutory proposal Reject | A | **DONE** (S4). Same, with the site-8 copy and its own `// #108` comment. |
| 9 | Statutory save / submit-for-approval | B | **DONE** (S4). One dialog, two label sets via `$derived` (`confirmTitle` / `confirmMessage` / `confirmLabel`); `Submit for CEO approval` converted to `type="button"`; `touchedServices` interpolated on both paths; the old message is **replaced**, not extended. |
| 10 | Statutory unsaved-changes guard | — | **DONE** (S4). `beforeNavigate` + `beforeunload` ported verbatim in shape from `performance/templates/[id]:92-116`; `isDirty` derives from `touchedServices`, so there is one dirty mechanism, not two; the baseline is re-seeded on a successful save inside `saveGuard`. |
| 11 | Release review to employee | A | **DONE** (S5). `ConfirmButton` with no children; the old `release` `createSubmitGuard` is removed and its `#108` comment rewritten; the success toast is preserved through `successMessage`. |
| 12 | Deactivate a login | A | **DONE** (S5). Branches on `u.isActive`: `ConfirmButton` on deactivate only; the activate branch keeps its plain form and `setActiveGuard`. The `:25-27` `#108` comment is untouched. |
| 13 | Separation finalize | A | **DONE** (S6). Native `confirm()` gone; wording carried across verbatim (C8 exemption). |
| 14 | Separation undo | **B** (per C9) | **DONE** (S6). Form and `reopenClearance` checkbox kept; button is `type="button"`; the message is `$derived` and reads the checkbox's live value, so the RE-OPENED clause appears only when it is ticked. |
| 15 | Attendance reset | A | **DONE** (S6). **Both** render sites converted (C1). `keepValues` (`update({ reset: false })`) rides through `ConfirmButton`'s `submit` prop at both; the trigger tooltip survives through `triggerTitle`; the `rowGuard` for reset is retired and the `#108` reasoning rewritten at both sites. |
| 16 | Bulk reject notes flow | — | **VERIFY ONLY — unchanged.** `git diff b3334f0..HEAD -- 'src/routes/(app)/requests/approvals/+page.svelte' 'src/lib/components/ui/ReasonDialog.svelte'` returns **zero lines**. No dialog added. |

### C4 — all `ConfirmButton` call sites compile

Re-derived at execution time with `grep -rln "ConfirmButton" src/`. **17 `.svelte` call sites** (the
11 the contract listed, plus the 6 this phase added: `payroll/periods`, `payroll/statutory-rates`,
`performance/reviews/[id]`, `settings/roles`, `separations/[id]`, `attendance`). The 18th grep hit,
`src/lib/utils/submit-guard.svelte.ts`, is a comment, not a call site. `pnpm check` reports
**0 errors across 1113 files**, so every call site compiles against the phase-04 API.

Full list: `lib/components/timesheets/TimesheetModal`, `attendance`, `branches`, `employees/[id]`,
`inventory`, `leave`, `payroll`, `payroll/periods`, `payroll/statutory-rates`,
`performance/reviews/[id]`, `performance/templates`, `separations/[id]`, `settings/holidays`,
`settings/offboarding`, `settings/onboarding`, `settings/roles`, `timesheets`.

---

## Test Gate Outcomes

### CI gate set (G4) — run in CI order, all green

| Command | Result |
|---|---|
| `pnpm format:check` | **PASS** — "All matched files use Prettier code style!" |
| `pnpm lint` | **PASS** — 0 errors, 1 warning (`CalculatorWindow.svelte:82`, pre-existing, untouched by this phase) |
| `pnpm check` | **PASS** — 1113 files, **0 errors**, 1 warning (the same pre-existing one) |
| `pnpm test` | **PASS** — 206 files, **2347 tests** (was 205 / 2317 — this phase adds 30) |

`pnpm test:e2e` (G5) was **not run here** — it is the orchestrator's to run. It remains an open gate.

### G1 / G2 / G3 — `tests/unit/destructive-confirms.test.ts`

- **G1** — 9 per-file wiring assertions (each changed file imports `ConfirmButton` or
  `ConfirmDialog` and still carries its named action strings) plus one explicit assertion that
  `?/confirmProposal` and `?/rejectProposal` are literally `<ConfirmButton action=…>`-wrapped
  (the AC8 #108 gap).
- **G2** — comment-stripped scan of every `.ts`/`.svelte` under `src/`, excluding `function
  confirm()` declarations and `beforeunload`. **Zero offenders.** Comment stripping is required
  by C2: `submit-guard.svelte.ts:34` says the word `confirm()` in prose. A non-vacuity assertion
  pins that the file walk reaches >100 files, so a broken glob cannot pass this gate silently.
- **G3** — 17 substring assertions, one per drafted message, plus a count assertion that the table
  holds exactly 17 rows. Both source and needle are whitespace-normalised, because Prettier wraps
  long attributes at arbitrary spaces.

### C3 — the 17 chosen non-interpolated substrings

| # | Site | File | Substring asserted |
|---|---|---|---|
| 1 | 1 offboard | `employees/[id]` | `they stop appearing in active-employee lists and payroll runs` |
| 2 | 2 period void | `payroll/periods` | `amortization it collected is credited back to the employees` |
| 3 | 3 period release | `payroll/periods` | `the only way back is to void the period` |
| 4 | 4 run void (model) | `payroll` | `the same exact period cannot be created again` |
| 5 | 5 net-pay override | `payroll/[id]` | `the computed amount is replaced, not adjusted` |
| 6 | 6 DOLE multipliers | `payroll/config` | `These multipliers set overtime, night differential, rest-day and holiday pay for every payroll run from now on` |
| 7 | 7 statutory confirm | `payroll/statutory-rates` | `These rates become the live tax and contribution tables for the whole organization` |
| 8 | 8 statutory reject | `payroll/statutory-rates` | `there is no draft to return to` |
| 9 | 9a statutory save (manage) | `payroll/statutory-rates` | `These become the live tax and contribution tables for the whole organization` |
| 10 | 9b statutory submit (approval) | `payroll/statutory-rates` | `Nothing changes for payroll until it is approved` |
| 11 | 10 dirty guard | `payroll/statutory-rates` | `Leaving now discards them` |
| 12 | 11 release review | `performance/reviews/[id]` | `once they can see it, they have seen it` |
| 13 | 12 deactivate login | `settings/roles` | `Their employee record, payroll history and documents are untouched` |
| 14 | 13 separation finalize | `separations/[id]` | `This snapshots final pay, offboards the employee, and disables their login` |
| 15 | 14 undo (base) | `separations/[id]` | `puts the employee back to their previous employment status, and RE-ENABLES their login` |
| 16 | 14 undo (re-open clause) | `separations/[id]` | `the case returns to OPEN and every item goes back to pending` |
| 17 | 15 attendance reset | `attendance` | `thrown away and re-derived from the raw punches` |

Note rows 7 and 9: sites 7 and 9a differ by exactly one word (`These rates become` vs `These
become`), which is what makes them separable substrings. If a later edit unifies that copy, G3 rows
7 and 9 must be re-chosen.

### MUTATION CHECKS — all three run, all three went RED

Each mutation was applied to a working file, the test re-run, the RED output captured, and the file
restored from a scratchpad copy (never `git checkout` — that would silently revert live work).

**(a) G1 — removed one confirm wrapper** (deleted the `ConfirmButton` import from
`settings/roles/+page.svelte`):

```
× G1 — every §T3 destructive action is routed through the kit confirm > routes/(app)/settings/roles/+page.svelte imports the kit confirm and carries ?/setActive
```

**(b) G2 — added a native `confirm()`** (inserted `if (!confirm('really?')) return` at
`attendance/+page.svelte:98`):

```
→ native confirm() is banned in src/ — use ConfirmButton/ConfirmDialog:
routes/(app)/attendance/+page.svelte:98: if (!confirm('really?')) return: expected [ Array(1) ] to deeply equal []
```

**(c) G3 — softened one message** (site 13's copy replaced with `This changes some things.`):

```
× G3 — every confirm message still names its consequence > site 13 separation finalize still says "This snapshots final pay, offboards the employee, and disables their login"
→ routes/(app)/separations/[id]/+page.svelte lost the consequence-naming copy for site 13 separation finalize.
```

After all three restorations, `git status --porcelain` listed only the new untracked test file, and
`pnpm format:check` was clean — the mutations left nothing behind.

### AC12 — no server behaviour changed

`git diff --stat b3334f0..HEAD -- src/` = **10 files**: 9 route `.svelte` files + the one-line
`ConfirmDialog.svelte` amendment (see Deviations), plus the new test file outside `src/`. Zero
`+page.server.ts`, zero `prisma/`, zero `src/lib/server/**`, zero `src/lib/rbac.ts`, zero
`src/app.css`.

---

## Plan Deviations

**D1 — `ConfirmDialog` gained `whitespace-pre-line` (AUTHORIZED phase-03 amendment).**
`ConfirmDialog` renders `{message}` in a plain `<p>`, so HTML collapsed the `\n\n` in the site 6, 7,
9 and 14 messages into single spaces — the "Changing:" / "Applying:" lists rendered as one run-on
line. The orchestrator authorised a one-line amendment: `class="mt-2 whitespace-pre-line text-sm
text-muted-foreground"` at `ConfirmDialog.svelte:34`. Committed **first and alone** as `3c7c08e`.
Nothing else in `src/lib/components/ui/**` was touched. Site 6's already-shipped message was
re-read (not edited) and now renders its line breaks.
*Impact:* one presentational class on a phase-03-owned primitive. Phase 03's report should record
it so the ownership trail is unbroken.

**D2 — site 1 gates the dialog on `reportValidity()`.** The plan says the offboard button becomes
`type="button"` with `onclick={() => (offboardConfirm = true)}`. Taken literally, a user with an
empty **required** Last Day field would confirm the dialog and only then meet the browser's
validation bubble — a confirm for an action that cannot run. The button calls
`openOffboardConfirm()`, which opens the dialog only if `offboardFormEl?.reportValidity()` passes.
*Impact:* within blast radius, same file, no server change. It preserves the existing
required-field behaviour rather than changing it.

**D3 — site 13 lost `aria-describedby`, gained `triggerTitle`.** The finalize button carried
`aria-describedby={finalizeBar ? 'finalize-bar' : undefined}` (#297's refusal reason).
`ConfirmButton` forwards no `aria-*` attributes and extending it is out of bounds (phase 03 owns the
primitive). The refusal reason is instead passed as `triggerTitle={finalizeBar ?? undefined}`.
*Impact assessment:* small. When `finalizeBar` is set the button is **`disabled`**, so it is not
focusable and the `aria-describedby` was already close to unreachable; the refusal text still renders
visibly in `<p id="finalize-bar">` directly above the button. **Recorded for phase 03/04**: if
`ConfirmButton` ever gains a `triggerAttrs` pass-through, restore the `aria-describedby` here.

**D4 — site 11's `release` guard removed rather than kept.** The plan said "remove it if it becomes
unused". It did: `ConfirmButton`'s busy state is the single-submit guard and `successMessage`
reproduces the old toast text exactly. The `#108` comment was **rewritten, not deleted**.

**D5 — the prior agent's recorded drifts (carried forward, not re-derived).**
- Sites 2 and 3 were **already** `ConfirmButton`-wrapped by phase 01 (commit `8b7bd8c`). Section 1
  was therefore a **copy upgrade**, not new wiring. The plan's Research-Refresh claim that "phase 01
  fixed **only the message after**" was **wrong** for sites 2/3. Site 1 (offboard) matched the plan:
  phase 01 added only the success message, and this phase added the confirm.
- The three native `confirm()` calls had drifted ~5 lines down from the plan's line numbers
  (`attendance:24`, `separations:32,44` at execution time, not `:19`/`:29`/`:41`).
- `ConfirmButton`'s on-disk API is frozen at: `action, title, message, confirmText, triggerLabel,
  triggerClass, triggerTitle, disabled, submit, successMessage, children`. `triggerTitle` **exists**
  — phase 04 shipped the amendment the validate-contract routed to it, so site 15 does **not** lose
  its tooltip. The REJECTED-ROUTED finding is resolved.

**No hard-stop-class deviation occurred.** No auth, billing, schema, public-API, container or
external-integration change.

## C8 — copy-standard exemptions kept (deliberate, not misses)

1. **"amortization"** at sites 2 and 4. Copy Standard 4 bans jargon, but this word is carried from
   the already-shipped run-void model message. Consistency with the shipped message beats a re-word.
2. **"snapshots final pay"** and the all-caps **`RE-ENABLES`** / **`RE-OPENED`** at sites 13 and 14.
   Audit §G names this pair as the repo's model destructive flow and the plan says do not rewrite it.
   Carried verbatim; only the delivery mechanism changed.

Every other message passes: none uses "irreversible", "commit" or "persist", and every `confirmText`
is a verb phrase (`Void period`, `Release`, `Apply rates`, `Reject proposal`, `Deactivate`,
`Finalize`, `Undo finalization`, `Discard and re-derive`, `Offboard`, `Leave without saving`).

## What Was Skipped or Deferred

Nothing in the checklist was skipped. Items 39 (P1 matrix) and 40 (impeccable audit) are **owner-pass
work** and are listed below rather than done, exactly as the orchestrator scoped this session.

## Test Infra Gaps Found

- **Confirmed at execution time:** `@testing-library/svelte@^5.2.0` is in `devDependencies` with zero
  call sites in `tests/`. No automated tier can prove "clicking the trigger opens the dialog", so
  AC1, AC5, AC6, AC7, AC9, AC10, AC11 and AC13 rest on agent-probe/owner evidence. Backlog stub
  `component-interaction-test-harness_NOTE_{date}.md` in
  `process/features/ui-ux-overhaul/backlog/` still to be written at UPDATE-PROCESS.
- `process/context/tests/all-tests.md` still terminates at the router ("No deeper test docs yet") —
  the Playwright + `_dev/login-as` + `psql` harness is prose-only, not routable. Flag at
  UPDATE-PROCESS.
- **New:** G1 proves co-occurrence, not containment. A file that imports `ConfirmButton` and leaves
  one form bare still passes. A Svelte-AST assertion would close this; it is not worth a
  parser dependency today, but say so rather than over-reading a green G1.

## Deferred to the owner pass (this phase is CODE DONE, not ✅ VERIFIED)

**P1 live spot-check matrix — all 16 rows owed**, each with both a cancel and a confirm column:

| # | Site | Role | Cancel → expect | Confirm → expect |
|---|---|---|---|---|
| 1 | Offboard | HR_ADMIN | employee still ACTIVE | OFFBOARDED + success reported |
| 2 | Period void | payroll mgr w/ `canVoid` | status unchanged | VOIDED + success reported |
| 3 | Period release | payroll mgr | still LOCKED | RELEASED + success reported |
| 4 | Run void | payroll mgr | unchanged (verify-only) | VOIDED (unchanged behaviour) |
| 5 | Net-pay override | payroll mgr | netPay unchanged | netPay = typed value + success |
| 6 | DOLE multipliers | payroll mgr | rates unchanged | saved + was→now shown |
| 7 | Statutory Confirm | CEO | proposal still pending | applied + success |
| 8 | Statutory Reject | CEO | proposal still pending | rejected + success |
| 9 | Statutory save | HR_ADMIN (`canManage`) **and** a non-manage role | rates unchanged | saved/submitted; touched services named |
| 10 | Statutory dirty guard | HR_ADMIN | stays on page, edits intact | navigates away, edits discarded |
| 11 | Release review | reviewer w/ `canRelease` | not released | released + success |
| 12 | Deactivate login | Super Admin | user still ACTIVE | INACTIVE + success |
| 12b | **Activate** login | Super Admin | — | ACTIVE — **assert no dialog appears** |
| 13 | Separation finalize | HR_ADMIN | not finalized | FINALIZED + banner |
| 14 | Separation undo | Super Admin | still finalized | undone + banner; re-open clause shown only when ticked |
| 15 | Attendance reset | HR_ADMIN | manual edit intact | re-derived; other cells kept |
| 16 | Bulk reject | approver | — (verify-only) | ReasonDialog still requires a note |

Also owed:

- **P2** — cancel-writes-nothing `psql` negative control on period void, offboard, deactivate.
- **P3** — keyboard-only walk. **Re-labelled per C5:** the statutory case is a dialog inside a
  `role="tabpanel"` (`:284`) and the net-pay case is a dialog inside a scrolling table row — neither
  is a dialog-in-dialog, so parent-modal Escape scoping does not apply to them; focus trap and focus
  restore still do. **The one true dialog-in-dialog in the repo is
  `src/lib/components/timesheets/TimesheetModal.svelte:541`** (a `ConfirmButton` inside the
  `fixed inset-0` overlay at `:286`). It is not a phase-05 site but it is the real nested-modal
  regression surface for phase 03's Dialog base — walk it.
- **P4** — statutory dirty guard: edit SSS, switch to Pag-IBIG, navigate away → the dialog must name
  **SSS**; then save and navigate → the guard must **not** fire.
- **P5** — net-pay override: negative refused client-side; unchanged value → no dialog; changed value
  → both peso figures and the delta named.
- **P6** — attendance reset keep-values: correct two cells, reset a third day, confirm → the two
  corrected cells still hold their typed values. This is the site-15 silent-regression risk.
- **R1** — masked-reveal walk on `employees/[id]` (this phase edits that file).
- **R2** — the already-correct low-stakes confirms still open and submit, widened per C4 to all 17
  on-disk call sites.
- **R3** — nav resolves for HR_ADMIN / MANAGER / employee.
- **A1** — impeccable audit pass on the 9 changed files.
- **G5** — `pnpm test:e2e` vs the pre-phase baseline, with `tests/e2e/separations.spec.ts` **read**
  (not blindly re-run) if red. Sites 13/14 changed that page's interaction.

## Closeout Packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-destructive-actions_PLAN_03-09-26.md`
- **Finished:** checklist items 18-41 (Sections 4-7), on top of the prior agent's 1-17.
- **Verified:** the four CI gates, G1/G2/G3 with all three mutation checks red, AC3, AC12, C4.
- **Unverified:** every behavioural criterion — AC1, AC4, AC5, AC6, AC7, AC9, AC10, AC11, AC13 — plus
  G5. Nothing was opened in a browser during this phase.
- **Next valid state:** **Keep in active/testing.** The plan stays active until the owner runs the
  P1 matrix and confirms. Do not archive on a green gate set alone.

## Forward Preview (phase 06 — `surface-consolidation`)

**Test infra found.** `tests/unit/destructive-confirms.test.ts` now pins three things phase 06 can
break silently: the confirm wiring on 9 files, the zero-native-`confirm()` rule across all of `src/`,
and 17 exact message substrings. If phase 06 moves or re-words any of those sites, update the test's
`WIRING` and `COPY` tables **in the same commit** — a red G3 means copy was softened, which is the
regression the gate exists to catch. No component-interaction harness exists yet; do not read a green
`pnpm test` as proof any dialog opens.

**Blast-radius changes phase 06 must know.**
- `src/routes/(app)/separations/[id]/+page.svelte` — phase 06 touches this file. Its `?/finalize`
  is now a `ConfirmButton` (no `<form>` of its own in the page source), and `?/undo` is a normal form
  whose submit is driven by `undoFormEl?.requestSubmit()` from a `ConfirmDialog`. Moving either
  control means carrying its dialog with it.
- `src/routes/(app)/payroll/config/+page.svelte` — phase 06 touches this file. The `?/updateRates`
  submit is dialog-gated and depends on `baselineRates` / `changedRates`; the sibling `?/update` form
  is untouched and still submits directly. Keep them apart.
- `src/routes/(app)/payroll/statutory-rates/+page.svelte` is now the phase's heaviest file: two
  `ConfirmButton`s, two `ConfirmDialog`s, a `beforeNavigate` guard and a `svelte:window
  onbeforeunload`. A navigation change anywhere in the program must not bypass that guard.
- **Phase 07** splits `employees/[id]` and `attendance`. Both now carry confirm wrappers — the
  offboard `ConfirmDialog` sits at the very bottom of `employees/[id]`, outside the card it belongs
  to, and the attendance reset is a `ConfirmButton` at **two** render sites. Carry the wrapper, not
  just the form.
- `src/lib/components/ui/ConfirmDialog.svelte` now has `whitespace-pre-line`. Any message containing
  `\n` renders those breaks. Phase 08 (copy) should assume that.

**Commands to stay green:** `pnpm format:check && pnpm lint && pnpm check && pnpm test` — in that
order. CI runs format first and skips the rest, so a green `pnpm check` alone proves nothing about CI.

**Dependency changes:** none. No package was added, removed or upgraded.

## CONTEXT_PARTIAL items

- `CONTEXT_PARTIAL: tests` — `process/context/tests/all-tests.md` routes to nothing deeper; the
  live-probe harness (Playwright + `_dev/login-as` + `psql`) that this phase's P1-P6 depend on is
  documented in prose only.

## Follow-up plan stubs created

None created in this session (writing to `process/features/ui-ux-overhaul/backlog/` is
UPDATE-PROCESS work). One is **owed**: `component-interaction-test-harness_NOTE_{date}.md`.

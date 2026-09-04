---
name: plan:coderabbit-pr12-remediation
description: "Remediation of the CodeRabbit findings on PR #12 — two code fixes (Dialog accessible-name type, New Timesheet name mismatch), eight documentation corrections across two phase-03 reports and two backlog notes, plus the rejection record and a regression guard for the false F1 finding"
date: 04-09-26
feature: ui-ux-overhaul
phase: "03"
metadata:
  node_type: memory
  type: plan
---

# CodeRabbit PR #12 Remediation

**TL;DR.** CodeRabbit raised 12 findings on PR #12. Ten are real, **two are false** (F1 and F12),
and one extra defect of the same family (X1) was found outside the list. F1 claimed the `.badge`
leading dot is dead CSS; it is not — the dot ships and renders on every status pill today, proven by
a grep of the built stylesheet. F1 therefore becomes **no source change**: it is recorded as
rejected (A1) and guarded by a test so it cannot be "fixed" a fourth time (A2). This plan lands
**four commits**: C1 code (2 findings, 4 files), C2 report corrections (4 findings, 2 files),
C3 note and plan corrections (5 findings, 3 files), C4 the rejection record plus the guard test
(2 files). No behaviour changes, no visual changes, no refactors.

---

## What changed in this amendment and why

This plan was written on 04-09-26, committed as `c030e7f`, then VALIDATE returned **BLOCKED**
(see §Validate Contract, left in place unedited as the record of that verdict). This section exists
so a future reader never re-derives the false premise from the old text.

| # | What the plan said before | What it says now | Why |
|---|---|---|---|
| 1 | **F1**: `.badge::before` has never rendered; delete it as dead code (3 checklist steps in C1) | **F1 is a FALSE FINDING.** No source change. Replaced by A1 (record the rejection) and A2 (add a guard test) | The dot **does** ship. `@apply badge` carries the `::before` rule, and `.badge` is not purged. Proven on a clean build — command and output in §Binding Decisions D1 |
| 2 | D1 "owner decided: delete the dead CSS" | **D1 is VOID.** Superseded by D1′ | The decision rested on a premise that is false. The owner has been told and the decision is withdrawn |
| 3 | Comment at `src/app.css:163` described as wrong and to be rewritten | The comment is **correct**. Do not touch it | It says `badge` carries "the pill layout and the leading dot" — both are true |
| 4 | `src/lib/components/attendance/PunchMapDialog.svelte:122` | `src/lib/components/timesheets/PunchMapDialog.svelte:122` | The `attendance/` path does not exist (VALIDATE CONCERN-1) |
| 5 | F4 anchor `:33`, F7 anchor `:277`, F10 anchor `:37` | `:31`, `:279`, `:35` | Anchor drift; all three re-verified against HEAD in this amendment |
| 6 | X1: "135 occurrences across 36 files, **0** carry a `dark:` pair" → replace with "7 paired, 128 unpaired" | Re-derived from scratch: **137 occurrences across 37 files, 21 `dark:`-paired, 116 bare** | Both the old figures and the proposed replacement were unverified (VALIDATE CONCERN-2). Commands are now in the plan |
| 7 | F11 note said "16 of the 24" with no basis stated | The note must name its basis (the S5-commit basis its own table uses) | "24" is S5-basis; at HEAD the same six files total 23 (VALIDATE CONCERN-3). The 16-pill claim holds on either basis |
| 8 | AC-15 "Proven by: **Read**" | AC-15 carries an exact re-derivation command | A read cannot verify a count |
| 9 | Three commits (C1 = F1+F2+F3) | Four commits (C1 = F2+F3; C4 = A1+A2) | F1 stopped being a code change, and A1/A2 are a different kind of proof from C1's CI gate |

**The reason A2 exists.** Three independent passes — CodeRabbit, the RESEARCH agent, and the
orchestrator — all read `src/app.css` and reached the same wrong conclusion, because the mechanism
is invisible in the source and only appears in the built CSS. A fourth reader would do the same.
A2 makes that deletion fail a test instead of silently stripping the dot from every status pill.

---

## Overview

**Date**: 04-09-26 (amended same day, post-VALIDATE)
**Status**: ACTIVE — amended, not started
**Complexity**: SIMPLE (single-session, 16 atomic steps, 4 commits)
**Feature**: ui-ux-overhaul
**Branch**: `feat/uiux-phase-3` (clean, 8 commits ahead of `origin`, **not pushed**)
**Upstream input**: `code-review-pr-12.md` at the repo root, the RESEARCH re-verification pass, and
the VALIDATE BLOCKED verdict recorded in §Validate Contract

The review was written before the last 8 commits landed, so parts of it are stale. Everything
recorded in this plan has been re-checked against HEAD and is stated as verified fact. EXECUTE must
still open each named file before editing it — line numbers move.

## Goal

Close every **real** CodeRabbit finding on PR #12 with the smallest correct change, record the two
false findings with the evidence that refutes them, and leave no documentation claim in the
phase-03 record that contradicts the source it describes.

Success is observable: `Dialog` cannot be constructed without an accessible name; the
`New Timesheet` accessible name matches its heading; every corrected number in the five documents is
reproducible by a command written into this plan; F1 is recorded as rejected in
`code-review-pr-12.md`; and deleting `.badge::before` from `src/app.css` now turns a test red.

## Scope

### In scope

| # | Finding | File(s) | Kind |
|---|---|---|---|
| F2 | `Dialog` accessible name becomes required | `src/lib/components/ui/Dialog.svelte` | Code |
| F3 | `title="New timesheet"` → `"New Timesheet"` + 2 e2e locators | `NewTimesheetDialog.svelte`, 2 specs | Code |
| F4 | "Files changed (36…)" → 46 | `…s1-s5_REPORT_03-09-26.md` | Docs |
| F5 | `RETURNED` "was two different colours" — restate the real defect | `…s1-s5_REPORT_03-09-26.md` | Docs |
| F6 | S16 "22 files" heading → 23 | `…s13-s17_REPORT_03-09-26.md` | Docs |
| F7 | PageHeader adoption row: "59 files (every page, plus nested users)" | `…s13-s17_REPORT_03-09-26.md` | Docs |
| F8 | `name: plan:` → `name: note:` on a NOTE file | `phase-03-responsive-sweep_NOTE_03-09-26.md` | Docs |
| F9 | 10-vs-3 `ml-auto` pattern merge | `phase-03-responsive-sweep_NOTE_03-09-26.md` | Docs |
| F10 | Reconciliation that does not close at 31 | `phase-03-residual-dark-only-colours_NOTE_03-09-26.md` | Docs |
| F11 | "None is a status pill" vs "most are decorative" | `phase-03-residual-dark-only-colours_NOTE_03-09-26.md` | Docs |
| X1 | Plan's "135 occurrences across 36 files … **0** carry a `dark:` pair" — all three figures wrong | `phase-03-design-system_PLAN_03-09-26.md` | Docs |
| **A1** | Move **F1** from `## Warning`/VERIFIED to `## Rejected`, with the refuting evidence; fix the header count, the severity map, and the suggested order | `code-review-pr-12.md` | Docs |
| **A2** | Add a guard so `.badge::before` cannot be deleted silently | `tests/unit/badge-class-literals.test.ts` | Test |

### Explicitly out of scope

| Item | Why |
|---|---|
| **F1 as a source change** | **The finding is false.** The dot ships and renders. No change to `src/app.css`, `Badge.svelte`, or any selector. See D1′. |
| F12 (CodeRabbit's twelfth finding) | Correctly rejected by the RESEARCH pass. Recorded in `code-review-pr-12.md` already; A1 only adds F1 beside it. |
| Changing anything about how the dot renders (adding one, removing one, widening a selector) | Not requested by anyone. The current rendering is correct. |
| The stale commit hashes in the S13-S17 report's section table (`73c4f8f`, `d9087c5`, …) | The branch was rebased after the report was written. Not a CodeRabbit finding; not in scope. |
| Re-measuring or changing the `24` / `31` counts themselves | Both are verified correct. Only the *reconciliation prose* is wrong. |
| Fixing any of the 24 residual dark-only colours | That is the backlog note's own future work. |
| Any adjacent CSS, component, or copy cleanup | Surgical rule: every changed line traces to a finding above. |

## Binding Decisions (owner, settled — do not re-open)

**D1 — VOID.** The original D1 read: *"F1: delete, do not wire up. The dot has never rendered once
since `df20c34`."* It was taken on a premise that is **false**, and the owner has withdrawn it.
Do not act on it. It is preserved here only so a reader who saw the old plan knows it was retracted,
not quietly edited.

**D1′ — F1 is a FALSE FINDING. No source change. Record and guard instead.**

The `.badge::before` dot **is in the shipped stylesheet and renders on every status pill today.**
Verified on a clean `rm -rf build && pnpm build` of the current tree, 04-09-26:

```bash
grep -o '\.badge[a-zA-Z-]*:before{' build/client/_app/immutable/assets/0.DSsKqNN7.css
```

```
.badge:before{
.badge-green:before{
.badge-red:before{
.badge-yellow:before{
.badge-blue:before{
.badge-gray:before{
```

Both causes the old plan gave are false:

1. *"`@apply` does not copy the pseudo-element."* **It does.** All five tone rules emit a `:before`
   in the built CSS, above.
2. *"`.badge` is purged because no literal `badge` exists in `src/`."* **It is not purged.**
   `src/routes/(app)/team/+page.svelte:143` contains `{@const badge = STATUS[…] ?? NO_DATA}`.
   Tailwind's content scanner is a naive text scan, so the bare token `badge` counts as a literal
   and keeps `.badge` — and its `::before` — alive.

Consequence: the comment at `src/app.css:163` — "`badge` stays FIRST in each rule: it carries the
pill layout and the leading dot" — **is accurate.** Leave it alone. Leave the whole
`@layer components` badge block alone.

**D2 — F3: match the heading, change the dialog.** The `<h2>` reads `New Timesheet`; the `title`
prop reads `New timesheet`. Change the **prop**, not the heading, and follow through to the two e2e
locators so the record is consistent.

**D3 — A2 asserts against source, not against a build.** The guard test reads `src/app.css`. It
does **not** run `pnpm build`. Rationale in Step 14.

## Touchpoints

**Code (read + write):**
- `src/lib/components/ui/Dialog.svelte` — `interface Props` (~:15-34), the panel `aria-*` bindings (~:133-134)
- `src/lib/components/timesheets/NewTimesheetDialog.svelte` — `:37`

**Code (read only — must NOT change):**
- `src/app.css` — the whole `@layer components` badge block (`:145-175`). F1 is false; nothing here changes.
- `src/routes/(app)/team/+page.svelte:143` — the `{@const badge}` that keeps `.badge` unpurged. Do not rename that variable.

**Code (read only, to prove F2 does not break them — the 7 `Dialog` consumers):**
- `src/lib/components/recruitment/ApplicantKanban.svelte:176`
- `src/lib/components/timesheets/NewTimesheetDialog.svelte:37`
- `src/lib/components/timesheets/PunchMapDialog.svelte:122` — corrected path; there is no `attendance/PunchMapDialog.svelte`
- `src/lib/components/ui/ConfirmDialog.svelte:31`
- `src/lib/components/ui/ReasonDialog.svelte:56`
- `src/lib/components/timesheets/TimesheetModal.svelte:280`
- `src/routes/(app)/settings/roles/+page.svelte:261`

**Tests (write):**
- `tests/e2e/timesheet-create-for-employee.spec.ts:74`
- `tests/e2e/manager-org-wide-timesheets.spec.ts:79`
- `tests/unit/badge-class-literals.test.ts` — A2: header comment, the `:27-28` inline comment, and one new `describe` block

**Documentation (write):** the four files named in §Scope, plus
`phase-03-design-system_PLAN_03-09-26.md:596` and `code-review-pr-12.md` (repo root).

## Public Contracts

| Contract | Change | Compatibility |
|---|---|---|
| `.badge` CSS class | **Unchanged.** It is reached by `@apply` from all five `.badge-*` rules AND kept alive in the bundle by the literal token at `team/+page.svelte:143`. | No change |
| `.badge::before` | **Unchanged — and it ships.** All five tone classes emit `:before` with `content:""` in the built CSS. Every status pill renders a 6px leading dot today and will continue to. | No change |
| `.badge-green` / `-red` / `-yellow` / `-blue` / `-gray` | Unchanged | No change |
| `Dialog` `Props` type | `title` and `labelledBy` become mutually-exclusive-but-required: at least one must be supplied. Runtime rendering is byte-identical. | **Compile-time only.** All 7 current consumers already pass one. A consumer needing a change means the type is wrong — fix the type, not the consumer. |
| `Dialog` rendered DOM | Unchanged — `aria-label={labelledBy ? undefined : title}` / `aria-labelledby={labelledBy}` stay exactly as they are | No change |
| `NewTimesheetDialog` accessible name | `"New timesheet"` → `"New Timesheet"` | Playwright's `getByRole(..., { name })` is case-insensitive and whitespace-normalised unless `exact: true` is set; neither locator sets it. Both specs therefore match **before and after**. The locator edit is a consistency fix, not a break-fix. |
| `tests/unit/badge-class-literals.test.ts` | Gains a second contract: the `.badge::before` rule and the five `@apply badge` references must exist in `src/app.css`. | Additive. The three existing `it` blocks are unchanged. |

## Blast Radius

| Dimension | Value |
|---|---|
| Code files changed | 2 (`Dialog.svelte`, `NewTimesheetDialog.svelte`) |
| Test files changed | 3 (2 e2e specs, 1 unit test) |
| Documentation files changed | 6 (2 reports, 2 backlog notes, 1 phase plan, `code-review-pr-12.md`) |
| **Total** | **11 files, 4 commits** |
| Files explicitly NOT changed | `src/app.css`, `Badge.svelte`, `team/+page.svelte` |
| Server / schema / API surface | **Zero.** No `+page.server.ts`, no Prisma, no route handler, no auth path. |
| Rendered-output surface | **Zero.** F2 is a type; F3 changes one `aria-label` string's capitalisation. No CSS changes at all. |
| Risk class | **Low.** No high-risk class present (no auth, billing, schema/migration, public API, container, or secrets). Highest residual risk is F2's type change failing to compile against a consumer. |

## Implementation Checklist

Four commits. The split is by *kind of proof*: C1 is proven by the CI gate set, C2 by re-deriving
each report number with a command, C3 by re-deriving each note claim from source, C4 by a new red
test plus a read of the rejection record. Mixing them would make a red gate ambiguous about which
finding caused it.

---

### C1 — Code fixes (F2, F3)

Commit subject: `fix(ui): close the two code findings from the PR #12 review`

**Step 1 — F2: make the `Dialog` accessible name required.** In
`src/lib/components/ui/Dialog.svelte`, `title?: string` and `labelledBy?: string` are both optional,
so a consumer can build a dialog with no accessible name. This is **latent, not live** — all 7
consumers pass one.

Change the `Props` type so at least one of the two is required. Svelte 5 + TypeScript: the usual
shape is a discriminated union — a base type holding the seven other props (`open`, `size`,
`padding`, `scroll`, `zIndex`, `role`, `initialFocus`, `onclose`, `children`) intersected with a
union of `{ title: string; labelledBy?: never }` and `{ labelledBy: string; title?: never }`.

Constraints on this step:
- The **rendered markup does not change.** Leave `aria-label={labelledBy ? undefined : title}` and
  `aria-labelledby={labelledBy}` exactly as they are.
- Keep the existing doc comments on both props (`Accessible name. Ignored when labelledBy is given.
  Never rendered.` / `id of the consumer's own heading …`).
- The `let { … } = $props()` destructure keeps the same names and defaults.
- If `svelte-check` cannot express this cleanly as a union, an equivalent that still makes
  "neither supplied" a compile error is acceptable — but "neither supplied" **must** be a compile
  error.

**Step 2 — F2: prove all 7 consumers still compile untouched.** Run `pnpm check`. Zero new errors
against the report's recorded baseline (1099 files, 0 errors, 1 pre-existing `CalculatorWindow.svelte`
a11y warning). If any of the 7 consumers now errors: **the type is wrong, not the consumer.** Fix
the type and re-run. Do not edit a consumer to satisfy the type. Note the corrected consumer path:
`src/lib/components/timesheets/PunchMapDialog.svelte:122`.

**Step 3 — F3: fix the dialog accessible name.** In
`src/lib/components/timesheets/NewTimesheetDialog.svelte:37`, change:

`<Dialog bind:open title="New timesheet" …>` → `<Dialog bind:open title="New Timesheet" …>`

Leave the `<h2>New Timesheet</h2>` at `:72` alone. Leave the `:9` code comment alone (it already
reads `New Timesheet`).

**Step 4 — F3: update the two e2e dialog locators.** Change `'New timesheet'` → `'New Timesheet'` at:
- `tests/e2e/timesheet-create-for-employee.spec.ts:74`
- `tests/e2e/manager-org-wide-timesheets.spec.ts:79`

**Do NOT touch** the button locators at `:76` and `:81` in those same files — they read
`getByRole('button', { name: 'New Timesheet' })`, they are a different node, and they are already
correct. After the edit, `grep -rn "New timesheet" tests/ src/` must return **nothing**.

**Gate for C1:** §V.1 (full CI gate set) + §V.2 (the F2 negative control) + §V.5 (F3 static gates).
Commit only on green.

---

### C2 — Report corrections (F4, F5, F6, F7)

Commit subject: `docs(ui-ux): correct four counts and claims in the phase 03 execute reports`

**Step 5 — F4: fix the S1-S5 files-changed count.** In
`phase-03-design-system-s1-s5_REPORT_03-09-26.md:31` (re-verified at HEAD — the old plan said `:33`)
the heading reads `### Files changed (36, all presentation-layer)`. The sum of its own list is **46**:

| Group | Count |
|---|---|
| Created (`labels.ts`, `badge.ts`, `Badge.svelte`, `labels.test.ts`, `badge-tone.test.ts`, the AC-7 backlog note) | 6 |
| `src/app.css` | 1 |
| S4 files | 10 |
| S5 files | 20 |
| e2e specs | 9 |
| **Total** | **46** |

Change `36` → `46`. Change nothing else on that line or in the list below it.

**Step 6 — F5: restate the `RETURNED` defect.** Same file, `:100-101`. It currently reads:

> **`RETURNED` was two different colours** for the same `RequestStatus` — orange on `/leave`,
> orange on `/requests`, and the detail page's own copy. All now one tone.

Verified at the pre-phase baseline `7742e59`: **all three sites were identical** —
`bg-orange-500/15 text-orange-400` at `leave/+page.svelte:45`, `requests/+page.svelte:78`, and
`requests/[id]/+page.svelte:55`. `git grep -n "RETURNED'" 7742e59 -- 'src/**/*.svelte'` returns
those three and nothing else. There was **no second colour** — the "two different colours" claim is
simply false.

Restate it as the defect it actually was. Required substance: `RETURNED` carried **three separate
hand-rolled copies** of the same mapping (`/leave`, `/requests`, `/requests/[id]`), all
`bg-orange-500/15 text-orange-400` — one status, three places to change, which is the duplication
S4/S5 exist to remove. There is no `.badge-orange` and S1 forbids new class names, so all three now
resolve to **yellow** via the shared tone map. Cross-reference: this is the same fold already
recorded under "Plan Deviations" item 1 in the same file.

Do **not** invent a second colour. Keep the numbering of the surrounding list intact.

**Step 7 — F6: fix the S16 heading count.** In
`phase-03-design-system-s13-s17_REPORT_03-09-26.md:111` (re-verified at HEAD) the heading reads
`### S16 — EmptyState across 22 files`. The table at `:33` in the same file says **23**, and **23 is
correct**: the S16 commit contains 23 paths (the report cites it as `d9087c5`; after the branch was
rebased it is `15ffdd1` — `git show --name-only --pretty=format: 15ffdd1 | grep -c .` returns `23`).

Change `22` → `23` on line 111. **Leave the table at `:33` alone** — it is already right.

**Step 8 — F7: fix the PageHeader adoption row.** Same file, `:279` (re-verified at HEAD — the old
plan said `:277`), currently:

`| PageHeader | 20 of 61 (app) pages | **59 files** (every page, plus nested users) |`

Verified at HEAD: `find "src/routes/(app)" -name '+page.svelte' | wc -l` = **61**;
`grep -rl "PageHeader" "src/routes/(app)" --include=+page.svelte | wc -l` = **59**. All 59 are route
pages — there are **no** non-route consumers, so "plus nested users" is wrong too. The two holdouts
are `src/routes/(app)/approvals/+page.svelte` and `src/routes/(app)/payslips/[id]/+page.svelte`.

Restate as two separate numbers and name the holdouts. Required substance: **59 of 61** `(app)`
route pages, up from 20 of 61; all 59 are route pages, no non-route consumers; the two holdouts are
`approvals` and `payslips/[id]`. If the table cell is too narrow for the holdout names, put the
numbers in the cell and the two holdout paths in a one-line footnote directly under the table.
Leave the `EmptyState` and `Banner` rows alone.

**Gate for C2:** §V.1 + §V.3 (re-derive each corrected number with its command). Commit only on green.

---

### C3 — Backlog-note and plan corrections (F8, F9, F10, F11, X1)

Commit subject: `docs(ui-ux): correct the phase 03 backlog notes and the plan's dark-pair figures`

**Step 9 — F8: fix the NOTE frontmatter prefix.** In
`process/features/ui-ux-overhaul/backlog/phase-03-responsive-sweep_NOTE_03-09-26.md:2`:

`name: plan:phase-03-responsive-sweep` → `name: note:phase-03-responsive-sweep`

It is the only one of the 15 backlog notes using the `plan:` prefix; the other 14 use `note:`.
Change line 2 only — `description`, `date`, `feature`, and `phase` stay as they are.

**Step 10 — F9: split the merged `ml-auto` patterns.** Same file, `:27-30` (re-verified at HEAD).
It currently reads:

> **S14/S15 action relocations** — 29 pages moved an action cluster off the title row. Ten of those
> landed at the right-hand end of an existing filter toolbar via `ml-auto` (`employees`, `team`,
> `attendance`). …

That merges two different patterns. The S13-S17 report at `:80-88` has the true split:

| Pattern | Count | Pages |
|---|---|---|
| 1 — `ml-auto` onto an **existing** filter/view-toggle toolbar | **3** | `employees`, `team`, `attendance` |
| 3 — a **new bare right-aligned row** above the thing it acts on | **10** | `timesheets`, `benefits`, `departments`, `requests`, `complaints`, `separations`, `recruitment`, `payroll`, `payroll/[id]`, `leave` |

Rewrite the bullet so it names both patterns with the right counts, and — this is the point of the
correction — state that the **wrapped-`ml-auto` risk this note warns about applies only to the 3**,
because only those three sit on a toolbar that wraps below `sm`. The 10 bare rows are a separate,
lower-risk shape and should be described as their own item. Keep the "29 pages moved an action
cluster" total, and keep the note's Unmeasured framing — this note drives the 390px pass, so the
reader must know which three pages to look at first.

**Step 11 — F10: make the reconciliation close at 31.** In
`process/features/ui-ux-overhaul/backlog/phase-03-residual-dark-only-colours_NOTE_03-09-26.md`,
the "Correction to the plan's figure" section — heading at **`:35`**, body at `:37-41`
(re-verified at HEAD; the old plan said the heading was at `:37`).

**The finding names a real problem but both CodeRabbit and the note get the cause wrong.**
Re-measured against the pre-phase baseline `7742e59` across the plan's 11 named files: total
dark-only occurrences = **31**; **unpaired** = **24**. Re-derived independently in this amendment
(§V.4) — the subset yields 31 matching lines, of which 24 are bare and 7 are `dark:`-paired. So:

- The plan's **31 was exactly right** (it counted total occurrences).
- The note's **24 was exactly right** (it counted unpaired ones).
- The reconciliation fails only because the note records `ApplicantKanban.svelte` as
  "**0** dark-only" without saying it carries **3 already-paired** occurrences.

The arithmetic that closes:

```
24 unpaired
+ 4 already-paired, one each in payroll/config, payroll/statutory-rates, reports, settings/company
+ 3 already-paired in lib/components/recruitment/ApplicantKanban.svelte
= 31
```

Rewrite that section so it closes at 31 and names ApplicantKanban's **3**. Required substance: the
plan and the note measured two different things (total vs unpaired), both correctly; the section's
job is to state the difference and show the sum, not to correct either number.

**Do NOT write that the plan's 31 was wrong.** That is what the note currently implies, and it is
false. Retitle the section accordingly (it is a reconciliation, not a correction). Do not touch the
per-file table at `:25-33` or its `24` total.

**Step 12 — F11: resolve the pill contradiction, and state the basis.** Same file. Two statements
disagree:
- `:13` (TL;DR): "None of them is a status pill."
- `:59` (Fixing it later): "Most of these are decorative or muted-icon uses rather than status pills."

Checked against source. **Most of them ARE status pills.** The pill shape
(`bg-{tone}-500/15 text-{tone}-400` on a rounded pill) appears at:

| File | Pill occurrences | What it tones |
|---|---|---|
| `dashboard/+page.svelte` | 3 | a status pill triple |
| `benefits/+page.svelte` | 5 | plan-active and enrolment status |
| `recruitment/[id]/+page.svelte` | 3 | job `OPEN` / `CLOSED` / other |
| `settings/holidays/+page.svelte` | 2 | holiday type |
| `requests/approvals/+page.svelte` | 2 | `rounded-full` count pills |
| `settings/onboarding/+page.svelte` | 1 | step state |

The genuinely decorative remainder is all in `dashboard/+page.svelte`: large metric numbers, an icon
tile, a section eyebrow, and an outline button.

**Basis rule (VALIDATE CONCERN-3).** The denominator the note must use is **the S5-commit basis —
the same basis as its own per-file table, which totals 24.** Write the sentence as
"16 of the 24 (measured at the S5 commit, the same basis as the table above)". Do **not** silently
introduce a HEAD number: at HEAD the same six files total **23**, because S13's banner sweep touched
`dashboard`. KG-2 already records why the basis stays at S5. The 16-pill count is correct on either
basis, so only the basis label needs stating.

Write **one** answer in both places: the majority are status pills; only the `dashboard` remainder
is decorative. Then fix the consequence at `:59` — because these are pills, a `<Badge>` conversion
**is** the right tool for them, not merely pairing the colours. Rewrite the fixing advice to say:
convert the pill occurrences to `<Badge>` (which already carries theme-paired tones, **including the
leading dot** — see D1′), and pair the colours by hand only for the decorative `dashboard`
remainder. Keep the existing warning about measuring the composited ratio (the `green-700` at 4.40:1
finding) — it still applies to the hand-paired remainder.

**Do not change any count in this note.** The `24` and the per-file table were measured at the S5
commit and are correct; this step changes only the *characterisation*, the *basis label*, and the
*advice*.

**Step 13 — X1: fix the plan's dark-pair figures.** In
`process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system_PLAN_03-09-26.md:596`
the AC-7 scope note reads:

> There are 135 `text-{green,yellow,gray,blue}-400` occurrences across 36 files, and **0** of them
> currently carry a `dark:` pair. 104 sit in the 30 files S4/S5/S13 name; **31 sit in 11 files no
> section of this phase touches**…

**All three leading figures are wrong, and the sentence mixes two units.** Re-derived in this
amendment at the pre-phase baseline `7742e59` over `src/**/*.svelte` (commands in §V.4):

| Figure | Plan says | Measured | Basis |
|---|---|---|---|
| Total `text-{green,yellow,gray,blue}-400` matches | 135 | **137** | occurrences |
| Files carrying at least one | 36 | **37** | files |
| Already `dark:`-paired | **0** | **21** | occurrences |
| Bare (unpaired) | — | **116** | occurrences = 92 in the touched files + 24 in the 11 residual files |
| The residual subset | 31 | **31** — correct, but it is a **line** count over the 11 files (24 bare lines + 7 paired lines) | lines |

Rewrite the scope note so it states one unit per number and does not contradict the backlog note.
Required substance:
- **137** occurrences across **37** files at `7742e59`; **21** of them are the `dark:` half of a
  pair, so **116** are bare.
- Of the bare 116, **92** sit in the files S4/S5/S13 name and **24** sit in the 11 files no section
  of this phase touches. `92 + 24 = 116` — the addition now closes.
- The **31** stays, labelled as what it is: the number of *matching lines* in those 11 files
  (24 bare + 7 already paired). This is the number the backlog note reconciles.
- Keep the 11 named files exactly as they are.
- Add a pointer that the 31/24 difference is reconciled in
  `phase-03-residual-dark-only-colours_NOTE_03-09-26.md`.

EXECUTE must **re-run the §V.4 X1 commands and write what they return**, not copy the table above.
If a number differs, the command wins and EXECUTE records the discrepancy in the phase report.

**Gate for C3:** §V.1 + §V.4 (re-derive each note and plan claim from source). Commit only on green.

---

### C4 — Record the F1 rejection and guard it (A1, A2)

Commit subject: `docs+test: reject the false badge-dot finding and guard the rule that proves it`

**Step 14 — A2: extend the badge unit test to guard the `::before` rule.**

File: `tests/unit/badge-class-literals.test.ts`. **Extend it — do not create a new file.** It already
owns "the badge CSS contract that `pnpm check` cannot see", and its header comment says so.

**Decision (D3): assert against `src/app.css`, not against a built bundle.** Why:
- The source-level assertion is cheap, deterministic, needs no `pnpm build`, and runs in the
  existing `vitest` unit tier alongside the three checks already in this file.
- A build-level assertion would prove what actually ships, but it would drag a full `pnpm build`
  (and a hashed asset filename that changes every build) into the unit tier. That is too slow and
  too fragile for a guard whose whole job is to be cheap enough that nobody deletes it.
- **The test must not imply a stronger guarantee than it gives.** Its comment must say, in plain
  words, that it guards the **source rule** in `src/app.css`, and that the build-level behaviour —
  that `@apply badge` really does carry `::before` into the shipped CSS — was verified **once by
  hand on 2026-09-04** with the command in D1′. If someone later changes the Tailwind version or the
  `@apply` mechanism, this test will still pass while the dot disappears. Say so.

Add one new `describe` block with these assertions, all reading `src/app.css` as text:

1. **The rule exists.** `src/app.css` contains a `.badge::before` rule whose body includes
   `content:` — match on the selector plus its block, not on a bare substring, so a stray mention in
   a comment cannot satisfy it.
2. **Every tone still routes through it.** For every `.badge-*` rule found in `src/app.css` (reuse
   the existing `/\.badge-(\w+)\s*\{/g` tone discovery so the two blocks cannot drift), that rule's
   declaration block contains `@apply badge`. This half matters on its own: deleting `@apply badge`
   from one tone rule would strip the dot from **that tone only**, which no whole-file grep catches.

Also update the file's prose:
- **Header comment** — it currently describes only the purging contract. It now guards **two**
  things: (a) every `.badge-*` tone name appears as a literal in `src/` so Tailwind keeps it, and
  (b) the `.badge::before` dot rule exists and every tone rule still `@apply badge`. Both are
  invisible to `pnpm check`.
- **The `:27-28` inline comment** — it reads: *"The base `.badge` is only ever reached through
  `@apply`, which Tailwind inlines at build time, so it does not need a literal."* **That is now
  known to be inaccurate** and must be corrected: `.badge` is *also* kept alive by a literal token —
  `{@const badge = …}` at `src/routes/(app)/team/+page.svelte:143` — because Tailwind's scanner is a
  naive text scan. Rewrite it to say the tone classes need literals and are asserted here, while
  `.badge` itself survives both via `@apply` inlining and via that incidental literal. Do not change
  what the three existing `it` blocks assert.

**Step 15 — A2: run the negative control. This one must be real.**

VALIDATE correctly called the old F1 control theatre, because it asserted something already true.
This control mutates the thing the test guards and must turn the test **RED**.

1. Confirm green first: `pnpm test tests/unit/badge-class-literals.test.ts` passes.
2. **Mutation A — delete the rule.** In `src/app.css`, delete the whole `.badge::before { … }` rule
   (currently `:155-158`). Re-run. **The new assertion 1 must FAIL.**
3. Restore `src/app.css`. Re-run — green again.
4. **Mutation B — break one tone.** Remove `badge ` from the `@apply` line of `.badge-green`
   (leaving `@apply bg-green-500/15 text-green-800 dark:text-green-400;`). Re-run. **Assertion 2
   must FAIL, naming `badge-green`.**
5. Restore `src/app.css`. Re-run — green again.

Record all four transitions (green → red → green → red → green) in the phase report. A control that
passes either way is not a control.

**Restore rule:** review with `git diff src/app.css` and undo the mutation by hand, or
`git restore --source=HEAD src/app.css` **only if that file has no other uncommitted work**.
**Never** `git checkout src/app.css` on a dirty tree — this repo has a recorded case of that
silently reverting a live agent's uncommitted work. `src/app.css` has no in-scope edits in this
plan, so it should be clean apart from the mutation.

**Step 16 — A1: record the F1 rejection in `code-review-pr-12.md`** (repo root).

Four edits to that file:

1. **Move F1 out of `## Warning` and into `## Rejected`,** beside F12. Delete the now-empty
   `## Warning` heading. Place F1 above or below F12 — either order, but keep F12's text untouched.
   Rewrite the F1 entry so it states plainly that **the finding is false**, and carries:
   - the reproducing command and its output:
     ```bash
     rm -rf build && pnpm build
     grep -o '\.badge[a-zA-Z-]*:before{' build/client/_app/immutable/assets/0.DSsKqNN7.css
     ```
     ```
     .badge:before{
     .badge-green:before{
     .badge-red:before{
     .badge-yellow:before{
     .badge-blue:before{
     .badge-gray:before{
     ```
     (note that the asset hash changes on every build — a reader must glob, not copy the filename)
   - **both false causes, named**: (a) "`@apply` does not copy the pseudo-element" — it does, all
     five tone rules emit `:before`; (b) "`.badge` is purged, no literal `badge` in `src/`" — it is
     not, `src/routes/(app)/team/+page.svelte:143` has `{@const badge = …}` and Tailwind's scanner
     is a naive text scan.
   - that the `src/app.css:163` comment the finding disputes — "`badge` stays FIRST in each rule: it
     carries the pill layout and the leading dot" — **is accurate**, and needs no change.
   - a pointer to the guard: `tests/unit/badge-class-literals.test.ts` now fails if the rule is
     deleted.

2. **Be honest about how it got through.** In the F1 entry, state that **three independent passes —
   CodeRabbit, a research agent, and the orchestrator — all reached the same wrong conclusion**,
   because the mechanism is invisible in the source and only appears in the built CSS. Name that as
   the reason the guard test (A2) was added. Do not soften it and do not omit it: it is the whole
   justification for A2.

3. **Fix the header count line** near the top. It currently reads *"**12 unique findings** — 1
   major, 11 minor … One is rejected with evidence."* Now: **two** are rejected with evidence, and
   there is **no Warning-severity finding left**. Restate both halves.

4. **Fix the severity map line** (`:13`), currently *"Severity map: **Critical** none. **Warning** =
   F1. **Info** = F2-F11 (F12 rejected)."* → no Critical, no Warning; Info = F2-F11; F1 and F12
   rejected.

5. **Fix `## Suggested order`,** whose item 1 is *"F1 — the only user-visible defect."* There is no
   user-visible defect. Renumber so F3 and F2 lead, drop the F1 item, and add a line pointing at the
   Rejected section. Leave the `## Notes on the run` section alone.

**Gate for C4:** §V.1 + §V.6 (the A2 negative control's four transitions) + an Agent-Probe read of
the rewritten F1 entry against D1′. Commit only on green.

---

## Phase Completion Rules

- A **commit group** (C1/C2/C3/C4) is complete when its diff is committed AND its named gate passed
  on that commit. Code or docs written but ungated is not a completed group.
- This remediation is `CODE DONE` when all four commits are in and the full CI gate set is green.
- It is `VERIFIED` only when, in addition: A2's negative control (§V.6) is recorded with all four
  green→red→green transitions, AC-4's negative control (a nameless `Dialog` reddens `pnpm check`) is
  recorded, and the Agent-Probe read of the five rewritten documentation passages is recorded. A
  green `pnpm test` alone never promotes this to VERIFIED — this repo has recorded cases of a green
  suite coexisting with a live defect.
- A group whose gate goes red is **not** carried forward. Fix it in place if the fix is inside this
  plan's blast radius; if the fix would need a behavioural or server-side change, stop and write a
  backlog stub in this task folder.
- KG-1 (`pnpm test:e2e`) keeps its gate **CONDITIONAL** and does not block `VERIFIED`, because AC-6
  is proven statically. It is a named residual, never a proving strategy.
- Honest status only: `CODE DONE` is not `VERIFIED`.

**Context loaded for this plan:** `process/context/all-context.md` (router) and its testing branch
`process/context/tests/all-tests.md` were read to route the test tiers in §Verification Evidence and
to confirm the four CI gates and the e2e precondition. Post-work testing expectation: the full CI
gate set re-run once on the final commit, plus KG-1's deferred `pnpm test:e2e` if the owner runs it.

## Verification — per-section gate

### V.1 Full CI gate set (run at every commit boundary, in CI's order)

CI runs **Format Check first and skips the rest if it fails**, so a green `pnpm check` alone proves
nothing about CI. Run all four, in this order, and stop at the first red:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test
```

Run them **once on the untouched tree before Step 1** and record the result. A pre-existing red must
be known before it is blamed on this work. Expected baseline from the S1-S5 report: `pnpm check` =
1099 files, 0 errors, 1 warning (`CalculatorWindow.svelte` a11y, pre-existing).

C2 and C3 change only Markdown, so `format:check` is the gate that actually bites there — Prettier
formats `.md`. Do not skip it on a docs-only commit. C4 changes Markdown **and** a `.ts` test, so all
four bite.

### V.2 F2 — the `Dialog` type actually bites

```bash
pnpm check     # green, all 7 consumers unedited
```

Then the negative control, which is real and can fail: on a scratch edit, add
`<Dialog bind:open>{#snippet children()}x{/snippet}</Dialog>` — no `title`, no `labelledBy` — to any
one component, run `pnpm check`, confirm it goes **RED** on that line, then revert the scratch edit
by hand after reviewing `git diff`. Never `git checkout <file>` on a dirty tree.

### V.3 Report-number re-derivation (C2)

Each corrected number must be reproducible by a command recorded in the phase report:

```bash
# F6 — S16 touched 23 files (the rebased S16 commit; the report cites the pre-rebase hash d9087c5)
git show --name-only --pretty=format: 15ffdd1 | grep -c .          # expect 23

# F7 — PageHeader adoption
find "src/routes/(app)" -name '+page.svelte' | wc -l                                # expect 61
grep -rl "PageHeader" "src/routes/(app)" --include=+page.svelte | wc -l             # expect 59
for f in $(find "src/routes/(app)" -name '+page.svelte'); do \
  grep -q "PageHeader" "$f" || echo "$f"; done                                      # expect the 2 holdouts

# F5 — every baseline RETURNED mapping (expect exactly 3, all the same orange)
git grep -n "RETURNED'" 7742e59 -- 'src/**/*.svelte' | grep -iE "bg-|text-"

# F4 / F7 / F6 anchors — confirm before editing, they have drifted once already
R5=process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system-s1-s5_REPORT_03-09-26.md
R17=process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system-s13-s17_REPORT_03-09-26.md
grep -n "Files changed (36" "$R5"        # expect line 31  (the old plan said 33)
grep -n "EmptyState across 22" "$R17"    # expect line 111
grep -n "plus nested users" "$R17"       # expect line 279 (the old plan said 277)
```

F4's 46 is arithmetic on the report's own list, not a command — restate the addition in the phase
report so it is checkable by eye.

### V.4 Note-claim and plan-figure re-derivation (C3)

```bash
# F8 — the note: prefix is now the only shape in backlog/
grep -h "^name:" process/features/ui-ux-overhaul/backlog/*_NOTE_*.md | sort | uniq -c
# expect: 15 lines, all "name: note:…", zero "name: plan:…"

# F9 — the 3-vs-10 split is what the S13-S17 report records
sed -n '78,90p' process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system-s13-s17_REPORT_03-09-26.md

# F10 anchor — the section heading has drifted once already
grep -n "Correction to the plan" process/features/ui-ux-overhaul/backlog/phase-03-residual-dark-only-colours_NOTE_03-09-26.md   # expect 35

# X1 — the four figures, at the pre-phase baseline, over src/**/*.svelte
git grep -ohE "text-(green|yellow|gray|blue)-400" 7742e59 -- 'src/**/*.svelte' | wc -l          # total occurrences   — measured 137
git grep -lE  "text-(green|yellow|gray|blue)-400" 7742e59 -- 'src/**/*.svelte' | wc -l          # files               — measured 37
git grep -ohE "dark:text-(green|yellow|gray|blue)-400" 7742e59 -- 'src/**/*.svelte' | wc -l     # already dark:-paired — measured 21
git grep -ohE "(dark:)?text-(green|yellow|gray|blue)-400" 7742e59 -- 'src/**/*.svelte' \
  | grep -vc "dark:"                                                                             # bare (unpaired)     — measured 116

# X1 / F10 — the 11-file residual subset, split by pair state.
# ELEVEN is the file list already named in the AC-7 scope note. Write it to a temp file first,
# because a git pathspec treats `[id]` as a glob and silently matches nothing.
ELEVEN=$(mktemp)
printf '%s\n' \
  "src/routes/(app)/benefits/+page.svelte" "src/routes/(app)/dashboard/+page.svelte" \
  "src/routes/(app)/payroll/config/+page.svelte" "src/routes/(app)/payroll/statutory-rates/+page.svelte" \
  "src/routes/(app)/recruitment/[id]/+page.svelte" "src/routes/(app)/reports/+page.svelte" \
  "src/routes/(app)/requests/approvals/+page.svelte" "src/routes/(app)/settings/company/+page.svelte" \
  "src/routes/(app)/settings/holidays/+page.svelte" "src/routes/(app)/settings/onboarding/+page.svelte" \
  "src/lib/components/recruitment/ApplicantKanban.svelte" > "$ELEVEN"
ALL=$(git grep -nE "(dark:)?text-(green|yellow|gray|blue)-400" 7742e59 -- 'src/**/*.svelte' | sed 's/^7742e59://')
echo "$ALL" | grep -F -f  "$ELEVEN" | wc -l                                                      # subset LINES        — measured 31
echo "$ALL" | grep -F -f  "$ELEVEN" | grep -oE "(dark:)?text-(green|yellow|gray|blue)-400" | grep -vc "dark:"   # bare   — measured 24
echo "$ALL" | grep -F -f  "$ELEVEN" | grep -oE "dark:text-(green|yellow|gray|blue)-400" | wc -l  # paired              — measured 7
echo "$ALL" | grep -F -vf "$ELEVEN" | grep -oE "(dark:)?text-(green|yellow|gray|blue)-400" | grep -vc "dark:"   # complement bare — measured 92
# closure check: 92 + 24 = 116 bare; 24 + 7 = 31 lines

# F11 — the pill shape in the 6 residual files (basis: state S5 when writing, per Step 12)
for f in "src/routes/(app)/dashboard/+page.svelte" "src/routes/(app)/benefits/+page.svelte" \
         "src/routes/(app)/recruitment/[id]/+page.svelte" "src/routes/(app)/settings/holidays/+page.svelte" \
         "src/routes/(app)/requests/approvals/+page.svelte" "src/routes/(app)/settings/onboarding/+page.svelte"; do \
  echo "== $f"; grep -nE "text-(green|yellow|gray|blue)-400" "$f" | grep -v "dark:"; done
```

The "measured" values above were derived during this amendment on 04-09-26. EXECUTE **re-runs them
and writes what they return.** If any differs, the command wins.

### V.5 F3 and the e2e suite

The two specs are **e2e** — they need a production build plus a running app and database, which the
**owner** starts. Ask; never launch `./start.sh`, vite, or the `veent-db-5434` container directly.

**Decision: `pnpm test:e2e` is DEFERRED. It is a named Known-Gap (KG-1 below), not a silent skip.**

Why deferring is acceptable here, and this is the load-bearing reason: Playwright's
`getByRole(role, { name })` matches **case-insensitively and with whitespace normalised** unless
`exact: true` is passed. Neither locator passes `exact: true`. So `'New timesheet'` already matched
`"New Timesheet"` before Step 3, and `'New Timesheet'` matches it after. **Both specs pass before
and after the change.** The Step 4 edit is a consistency fix so the source and the test read the
same, not a break-fix.

Static substitute gates that DO run (both mandatory, both in C1):

```bash
grep -rn "New timesheet" tests/ src/                      # expect: nothing
grep -rn "New Timesheet" src/lib/components/timesheets/NewTimesheetDialog.svelte
# expect: the :9 comment, the :37 title prop, the :72 <h2> — three sites, all identical casing
grep -n "getByRole('button', { name: 'New Timesheet' })" \
  tests/e2e/timesheet-create-for-employee.spec.ts tests/e2e/manager-org-wide-timesheets.spec.ts
# expect: both still present and unchanged
```

**If the owner does choose to run e2e**, the precondition is non-negotiable and must run first,
because `scripts/seed-uiux-demo.ts` currently has demo data seeded:

```bash
pnpm tsx scripts/seed-uiux-demo.ts --clear     # MUST run before any e2e
pnpm test:e2e
```

The bar is the umbrella's: **no worse than the recorded baseline** (#287 flakiness is known). Run
the baseline e2e first so a pre-existing red is never blamed on this work.

### V.6 A2 — the guard test's negative control (C4)

Four recorded transitions, per Step 15. This is the load-bearing gate for C4.

```bash
pnpm test tests/unit/badge-class-literals.test.ts        # 1. GREEN — baseline
# mutate: delete the .badge::before rule from src/app.css
pnpm test tests/unit/badge-class-literals.test.ts        # 2. RED   — assertion 1 fails
# restore src/app.css (git diff review, or git restore --source=HEAD if that file is otherwise clean)
pnpm test tests/unit/badge-class-literals.test.ts        # 3. GREEN
# mutate: remove `badge ` from .badge-green's @apply line in src/app.css
pnpm test tests/unit/badge-class-literals.test.ts        # 4. RED   — assertion 2 fails, naming badge-green
# restore src/app.css
pnpm test tests/unit/badge-class-literals.test.ts        # 5. GREEN — final state
git diff --exit-code src/app.css                         # MUST be empty: no mutation survived
```

The last command is not optional. It is the proof that the control was reverted.

**What V.6 does not prove:** that the dot renders in a browser. It proves the *source rule* exists
and every tone routes through it. The build-level behaviour was verified once by hand on 04-09-26
(D1′) and is not re-checked here. KG-4 records the missing screenshot tier.

## Acceptance Criteria

| # | Criterion | Proven by | Strategy |
|---|---|---|---|
| AC-1 | `src/app.css` is **unchanged** by this plan — `.badge`, `.badge::before`, all five tone rules, and both block comments are byte-identical to `c030e7f` | `git diff c030e7f -- src/app.css` is empty at the final commit | Fully-Automated |
| AC-2 | `tests/unit/badge-class-literals.test.ts` asserts that `.badge::before` exists with a `content:` declaration, and that every `.badge-*` rule contains `@apply badge` | The new `describe` block exists and is green: `pnpm test tests/unit/badge-class-literals.test.ts` | Fully-Automated |
| AC-3 | Both new assertions can fail: deleting `.badge::before` reddens assertion 1, and removing `badge` from `.badge-green`'s `@apply` reddens assertion 2 | §V.6 — all five transitions recorded, plus `git diff --exit-code src/app.css` empty afterwards | Fully-Automated |
| AC-4 | The test's header comment says it guards **two** contracts, and the new block's comment states it guards the **source rule only**, naming the 04-09-26 hand verification of the build | Agent reads the file and judges whether the comment over-claims | Agent-Probe |
| AC-5 | The `:27-28` comment no longer says `.badge` "does not need a literal" — it names the `team/+page.svelte:143` `{@const badge}` token as the second reason `.badge` survives | `grep -n "does not need a literal" tests/unit/badge-class-literals.test.ts` returns nothing; read the replacement | Fully-Automated + Agent-Probe |
| AC-6 | A `Dialog` with neither `title` nor `labelledBy` is a **compile error**; all 7 existing consumers compile unchanged | §V.2 — `pnpm check` green, then the scratch nameless-`Dialog` control goes RED, then revert | Fully-Automated |
| AC-7 | `Dialog`'s rendered markup is unchanged (`aria-label` / `aria-labelledby` bindings identical) | `git diff src/lib/components/ui/Dialog.svelte` touches only the `Props` type block | Fully-Automated |
| AC-8 | `grep -rn "New timesheet" tests/ src/` returns nothing; the two `button` locators are untouched | §V.5 static gates | Fully-Automated |
| AC-9 | The S1-S5 report's files-changed heading reads 46 and matches the sum of its own list | Arithmetic restated in the phase report; anchor confirmed at `:31` by the §V.3 grep | Fully-Automated |
| AC-10 | The `RETURNED` entry describes three duplicated identical orange copies folding to yellow, and names no second colour | §V.3 baseline grep + Agent-Probe read | Agent-Probe |
| AC-11 | The S13-S17 report's S16 heading reads 23 and the `:33` table is unchanged | `git show --name-only … \| grep -c .` = 23; `git diff` shows one line changed near `:111` | Fully-Automated |
| AC-12 | The PageHeader row gives two separate numbers (59 of 61), drops "plus nested users", and names both holdouts | §V.3 three commands; anchor confirmed at `:279` | Fully-Automated |
| AC-13 | All 15 backlog notes carry `name: note:…`; zero carry `name: plan:…` | §V.4 first command | Fully-Automated |
| AC-14 | The responsive note splits pattern 1 (3 pages) from pattern 3 (10 pages) and scopes the wrapped-`ml-auto` risk to the 3 | §V.4 `sed -n '78,90p'` + Agent-Probe read against the report `:80-88` | Agent-Probe |
| AC-15 | The dark-only note's reconciliation closes at 31, names ApplicantKanban's 3 already-paired, and does **not** claim the plan's 31 was wrong | §V.4 subset commands return 31 lines = 24 bare + 7 paired; read the rewritten section | Fully-Automated + Agent-Probe |
| AC-16 | The dark-only note states one answer about status pills in both `:13` and `:59`, **names its basis as the S5 commit**, and its fixing advice follows from that answer | §V.4 pill grep + Agent-Probe read of both lines; the word "S5" must appear in the sentence carrying the 24 | Fully-Automated + Agent-Probe |
| AC-17 | `phase-03-design-system_PLAN_03-09-26.md:596` states 137 occurrences / 37 files / 21 already paired / 116 bare (92 + 24), keeps the 31 labelled as a line count, and keeps the 11 named files | The four §V.4 X1 commands re-run and their outputs match the numbers written; `92 + 24 = 116` and `24 + 7 = 31` both close | Fully-Automated |
| AC-18 | `code-review-pr-12.md` has no `## Warning` section, F1 sits under `## Rejected` with the build command, its output, both false causes, and the note that `src/app.css:163` is accurate | `grep -c "^## Warning" code-review-pr-12.md` = 0; `grep -n "^### F1" code-review-pr-12.md` falls after the `## Rejected` line; read the entry | Fully-Automated + Agent-Probe |
| AC-19 | The header count line says **two** rejected and no Warning-severity finding; the severity map matches; `## Suggested order` no longer leads with F1 | `grep -n "rejected with evidence\|Severity map\|^1\. F" code-review-pr-12.md`; read all three lines | Fully-Automated + Agent-Probe |
| AC-20 | The F1 rejection entry states that three independent passes reached the same wrong conclusion, and names that as the reason for the A2 guard | Agent reads the entry; the claim must be present, not softened | Agent-Probe |
| AC-21 | The full CI gate set is green at all four commit boundaries, relative to the recorded pre-change baseline | `pnpm format:check && pnpm lint && pnpm check && pnpm test` per commit, plus the §V.1 baseline record | Fully-Automated |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check && pnpm lint && pnpm check && pnpm test` green at each of the 4 commit boundaries, against the §V.1 pre-change baseline | Fully-Automated | AC-21 |
| `git diff c030e7f -- src/app.css` is empty at the final commit | Fully-Automated | AC-1 |
| `pnpm test tests/unit/badge-class-literals.test.ts` green with the new `describe` block present | Fully-Automated | AC-2 |
| Negative control A: delete `.badge::before` from `src/app.css`, re-run — the suite goes RED on assertion 1; restore, green again | Fully-Automated | AC-3 |
| Negative control B: remove `badge ` from `.badge-green`'s `@apply`, re-run — the suite goes RED on assertion 2 naming `badge-green`; restore, green again | Fully-Automated | AC-3 |
| `git diff --exit-code src/app.css` empty after §V.6 — proves both mutations were reverted | Fully-Automated | AC-1, AC-3 |
| Agent reads the test's header comment and the new block's comment and judges whether they over-claim (source-rule guard vs build-level guarantee) | Agent-Probe — no assertion can judge whether prose over-promises | AC-4 |
| `grep -n "does not need a literal" tests/unit/badge-class-literals.test.ts` returns nothing; agent reads the replacement for accuracy | Fully-Automated + Agent-Probe | AC-5 |
| `pnpm check` green with all 7 `Dialog` consumers unedited | Fully-Automated | AC-6 (positive half) |
| Negative control: a scratch `<Dialog bind:open>` with neither `title` nor `labelledBy` makes `pnpm check` go RED; revert the scratch edit | Fully-Automated | AC-6 (the type actually bites) |
| `git diff src/lib/components/ui/Dialog.svelte` touches only the `Props` type block — the `aria-*` bindings are untouched | Fully-Automated | AC-7 |
| `grep -rn "New timesheet" tests/ src/` returns nothing; the two `getByRole('button', { name: 'New Timesheet' })` locators are still present | Fully-Automated | AC-8 |
| §V.3 re-derivation commands reproduce 46 / 23 / 61 / 59 / the 2 holdouts / the 3 identical orange baseline sites, and confirm the anchors 31 / 111 / 279 | Fully-Automated | AC-9, AC-11, AC-12 + evidence for AC-10 |
| §V.4 first command: 15 notes, all `name: note:` | Fully-Automated | AC-13 |
| §V.4 X1 commands: 137 / 37 / 21 / 116, and the subset split 31 = 24 + 7 with complement 92; both additions close | Fully-Automated | AC-17, AC-15 (numeric half) |
| §V.4 pill grep reproduces the pill shape across the 6 residual files; the written sentence names the S5 basis | Fully-Automated | evidence for AC-16 |
| `grep -c "^## Warning" code-review-pr-12.md` = 0 and `### F1` appears after `## Rejected` | Fully-Automated | AC-18 (structural half) |
| Agent reads the five rewritten documentation passages (S1-S5 `RETURNED`, responsive note, dark-only reconciliation, dark-only pill answer, the F1 rejection entry) against the source they describe and judges whether each claim is now true and non-contradictory | Agent-Probe — agent judges prose-vs-source truth, which no grep can assert | AC-10, AC-14, AC-15, AC-16, AC-18, AC-19, AC-20 |
| `pnpm test:e2e` on the two edited specs | Known-Gap → **KG-1**; gate stays **CONDITIONAL** | (residual — not a proving strategy; AC-8 is proven statically instead) |
| A browser render confirming the dot is on screen | Known-Gap → **KG-4**; gate stays **CONDITIONAL** | (residual — no screenshot tier exists; the one-off build grep in D1′ is the standing evidence) |

**Known-gap note.** Per the vacuous-green ban, KG-1 and KG-4 are recorded as named residuals, their
gates stay CONDITIONAL, and neither counts as proof. Neither blocks the commits: the static gates in
§V.5 prove AC-8, and nothing in this plan changes rendered CSS, so KG-4 guards a surface this work
does not touch.

## Test Infra Improvement Notes

| # | Gap in the test infrastructure | Why it matters here | Suggested resolution |
|---|---|---|---|
| TI-1 | Nothing in the unit tier can see the **built** stylesheet. `pnpm check` cannot read CSS, and `pnpm test` never runs a build. | This is exactly why F1 got through three passes. A2 guards the source rule only; a source rule can stay intact while a Tailwind upgrade changes what `@apply` emits. | A cheap post-build assertion job — `pnpm build`, then grep the emitted `build/client/_app/immutable/assets/*.css` for the five `.badge-*:before` rules. Belongs in CI as its own step, not in the unit tier. Not in this plan's scope. |
| TI-2 | No screenshot-diff tier exists (also recorded as KG-4). | "The dot renders" cannot be asserted by any tier this repo has. | Separate infra item; out of scope. |

## Known Gaps

| # | Gap | Why deferred | Resolution if picked up |
|---|---|---|---|
| KG-1 | `pnpm test:e2e` is not run for the two edited specs | e2e needs a production build, a running app, and a seeded DB the **owner** starts. The change is provably inert for Playwright name-matching (case-insensitive, `exact: true` not set), so the cost is not justified for a capitalisation edit. Gate stays **CONDITIONAL**. | Owner starts the DB + app, then `pnpm tsx scripts/seed-uiux-demo.ts --clear` followed by `pnpm test:e2e`, compared against a baseline e2e run on the pre-change tree. |
| KG-2 | The `24` count and the per-file table in the dark-only note are not re-measured at HEAD | They were measured at the S5 commit and are correct **for that basis**. Later sections (S13's banner sweep) touched `dashboard`, so a HEAD re-count gives 23 across the six pill files and would break F10's `24 + 4 + 3 = 31` arithmetic. Changing the basis is a bigger job than this remediation. Step 12 therefore requires the basis to be **stated**, not changed. | A future dark-only fixing pass re-measures at its own HEAD and restates the basis explicitly in the note. |
| KG-3 | The S13-S17 report's section table still cites pre-rebase commit hashes (`73c4f8f`, `d9087c5`, `1bb272f`, `b2d22c5`) that no longer resolve | Not a CodeRabbit finding, and rewriting the hashes risks a second rebase making them stale again. Out of scope by the surgical rule. | If the branch stops being rebased, refresh the table's hashes in one pass and note the rebase in the report. |
| KG-4 | No visual regression suite exists for the badge block | The repo has no screenshot-diff tier. Nothing in this plan changes rendered CSS (AC-1 asserts `src/app.css` is untouched), so there is nothing to regress. The 04-09-26 build grep in D1′ is the standing evidence that the dot ships. | A screenshot tier is a separate infra item — see TI-2. |
| KG-5 | A2 cannot catch a Tailwind upgrade that stops `@apply` carrying `::before` | The guard reads source, not the bundle, by deliberate design (D3). A build-level guard is TI-1. | TI-1 — add a post-build CSS grep as its own CI step. |

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | F2's discriminated union does not compile cleanly under `svelte-check`, tempting an edit to one of the 7 consumers | Step 2 forbids it explicitly: a consumer error means the type is wrong. AC-6's negative control proves the type still bites after any reshaping. |
| R2 | **A future reader re-derives the F1 premise and deletes `.badge::before` a fourth time** — the exact failure this amendment exists to stop | Three layers: A2's test goes red on the deletion (AC-3, proven by a real control); A1 records the rejection with the reproducing command in the review file; D1′ states both false causes by name. |
| R3 | EXECUTE reads the retracted D1 instead of D1′ and deletes the CSS anyway | D1 is marked **VOID** in place, §What changed lists the reversal first, and AC-1 asserts `git diff c030e7f -- src/app.css` is empty — the plan fails if the CSS moves at all. |
| R4 | The §V.6 mutations are left in the tree, shipping a broken `src/app.css` | §V.6 ends with `git diff --exit-code src/app.css`, and Step 15 forbids `git checkout <file>` on a dirty tree. |
| R5 | Step 4 accidentally rewrites the `button` locators at `:76` / `:81` | Both steps name the button locators as must-not-touch, and AC-8 asserts they are still present with the exact original string. |
| R6 | A docs-only commit skips `format:check` and reddens CI, since CI runs format first | §V.1 states Prettier formats `.md` and forbids skipping format on C2/C3/C4. |
| R7 | Correcting F10 accidentally rewrites the note's `24` or the per-file table, creating a new contradiction | Step 11 forbids touching both, and KG-2 records why the basis stays at the S5 commit. |
| R8 | The F11 rewrite changes the pill/decorative characterisation but leaves the old "pair the colours, do not force the component" advice, producing a fresh internal contradiction | Step 12 requires the advice at `:59` to be rewritten **as a consequence** of the answer, and AC-16 asserts advice-follows-answer. |
| R9 | X1 replaces one unverified number with another unverified number — the exact defect VALIDATE flagged as CONCERN-2 | Step 13 forbids copying the plan's table: EXECUTE re-runs the §V.4 commands and writes their output. AC-17 requires both additions (`92 + 24 = 116`, `24 + 7 = 31`) to close. |
| R10 | A2's new assertion matches a mention of `.badge::before` inside a comment rather than the real rule, so it cannot fail | Step 14 assertion 1 requires the selector **plus its declaration block containing `content:`**, and §V.6 mutation A proves it reddens on a real deletion. |

## Dependencies

**Upstream:** none. The branch is clean and 8 commits ahead of `origin`. No other plan is mid-flight
on these files.

**Downstream:**
- Phase 04 consumes the `Dialog` primitive. F2 tightens its type only; the runtime API is unchanged,
  so phase 04's plan needs no revision. If phase 04 adds a new `Dialog` consumer after this lands,
  it must pass `title` or `labelledBy` — which it already would.
- Phase 04 also consumes `<Badge>`. Because F1 is rejected, `<Badge>` keeps its leading dot — no
  phase-04 assumption changes.
- The corrected `phase-03-residual-dark-only-colours_NOTE` drives a future dark-only fixing pass;
  F11's answer changes what that pass is told to do (convert pills to `<Badge>`, hand-pair only the
  decorative remainder).
- The corrected `phase-03-responsive-sweep_NOTE` drives the 390px pass; F9's split tells that pass
  which three pages carry the real wrapped-`ml-auto` risk.
- `code-review-pr-12.md` is the record PR #12's review triage is read from. A1 makes it accurate
  before anyone acts on it again.

**Blocking:** none for C1-C4. KG-1 needs the owner to start the DB container and the dev/preview
app — **ask, never launch them.**

## Rollback

Four commits on an **unpushed** branch. Nothing is on a remote, so no history rewrite is involved
and no force-push question arises.

| Situation | Action |
|---|---|
| One commit is wrong, the others are fine | `git revert <sha>` for that commit. Keeps history honest and is safe even if the branch is later pushed. |
| C4 alone must come out (the guard test is wrong) | `git revert <C4-sha>`. C1-C3 do not depend on it. The F1 rejection record and the guard land together, so reverting removes both — re-land them as one commit. |
| A §V.6 mutation survived into a commit | `git diff c030e7f -- src/app.css` finds it. Revert the commit, restore `src/app.css`, re-run §V.6 from transition 1. |
| Everything after a known-good point is wrong | `git reset --hard <sha-before-C1>` — safe **only** while the branch is unpushed and the tree is clean. Confirm `git status` is clean and no agent is running first. |
| A single file's edit must be undone mid-work | `git diff <file>` first, then apply the inverse by hand, or `git restore --source=HEAD <file>` **only** if that file has no other uncommitted work. **Never** `git checkout <file>` on a dirty tree — this repo has a recorded case of that silently reverting a live agent's uncommitted work. |
| The whole remediation is abandoned | `git reset --hard <sha-before-C1>` and delete the plan file. Nothing else in the repo depends on these four commits. |

Blast-radius note for rollback: no schema change, no migration, no server code, and **no CSS change
at all**, so a revert has **no data or runtime consequences** — the tree simply returns to its prior
state.

## Resume and Execution Handoff

1. **Selected plan file (primary execute anchor):**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/coderabbit-pr12-remediation_PLAN_04-09-26.md`
2. **Last completed phase/step:** none — plan written 04-09-26, VALIDATE returned BLOCKED, plan
   amended 04-09-26. EXECUTE not started.
3. **Validate-contract status:** **written, verdict BLOCKED** (§Validate Contract, left unedited).
   This amendment answers both FAILs and all four CONCERNs. **Re-run VALIDATE before EXECUTE** — the
   plan changed materially, and an amended plan is not a validated plan.
4. **Supporting context loaded:** `code-review-pr-12.md` (repo root),
   `process/development-protocols/plan-lifecycle.md`,
   `process/development-protocols/implementation-standards.md`,
   `phase-03-design-system_PLAN_03-09-26.md`,
   `phase-03-design-system-s1-s5_REPORT_03-09-26.md`,
   `phase-03-design-system-s13-s17_REPORT_03-09-26.md`,
   `process/features/ui-ux-overhaul/backlog/phase-03-responsive-sweep_NOTE_03-09-26.md`,
   `process/features/ui-ux-overhaul/backlog/phase-03-residual-dark-only-colours_NOTE_03-09-26.md`,
   `src/app.css`, `src/routes/(app)/team/+page.svelte`, `src/lib/components/ui/Dialog.svelte`,
   `src/lib/components/timesheets/NewTimesheetDialog.svelte`,
   `tests/unit/badge-class-literals.test.ts`, the two named e2e specs.
5. **Next step for a fresh agent:**
   - **Read §What changed in this amendment and why first.** If you conclude the badge dot is dead
     code, you have re-derived the false premise — stop and re-read D1′.
   - Run §V.1 on the untouched tree and record the baseline.
   - Then start Step 1. There is no longer a pre-change build requirement: the old §V.2 before/after
     build pair is gone with F1.
   - To find the resume point mid-work, read `git log --oneline` — each commit subject names its
     group (`fix(ui):` = C1, `docs(ui-ux):` = C2/C3, `docs+test:` = C4).

**Branch:** stay on `feat/uiux-phase-3`. Do not branch, do not push, do not open a PR unless the
owner asks. This work belongs on PR #12.

**Commit style:** subject + optional body. **No `Co-Authored-By`, no AI attribution footer of any
kind.** Four commits, one PR — many commits per PR is correct here.

**Do not touch:** `.env`, `.env.dev`, any `+page.server.ts`, Prisma schema, `src/app.css`
(except the temporary §V.6 mutations, which must be reverted), or any file not named in §Touchpoints.

**Primary execute anchor:** this file. No supporting phase files. Sibling phase plans (phases 01-08
of the ui-ux-overhaul program) are **not** inputs to this work.

## Validate Contract

Status: BLOCKED
Date: 04-09-26
date: 2026-09-04
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1/7 signals (S7 only — 10 files in blast radius). No multi-package scope, no
schema/API/auth surface, no 3+ directions, not a phase program, no high-risk class. Score 1 = LOW,
and the auto-skip rule for presentation-only edits reinforces it. Verification was run inline by one
agent; a fan-out would have cost more than it proved.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Deleting `.badge::before` changes the shipped stylesheet | Fully-Automated | `grep -o "\.badge[a-zA-Z-]*\(:[a-z]*\)\?{[^}]*}" build/client/_app/immutable/assets/*.css` before and after `pnpm build` | B — gate REDESIGN required; see FAIL-1. The current "byte-identical" wording asserts a false expectation |
| AC-1 (control) | The bundle grep is capable of failing | Fully-Automated | Delete `.badge::before`, rebuild, confirm the five `.badge-*:before` rules disappear | B — replaces the current `class="badge"` control, which cannot fail (FAIL-2) |
| AC-2 | No `app.css` badge comment mentions a dot except the tombstone | Fully-Automated | `grep -in "dot" src/app.css` | A |
| AC-3 | `tests/unit/badge-class-literals.test.ts` unchanged and green | Fully-Automated | `git diff --exit-code tests/unit/badge-class-literals.test.ts` + `pnpm test` | A |
| AC-4 | A nameless `<Dialog>` is a compile error; all 7 consumers compile untouched | Fully-Automated | `pnpm check` green, then scratch `<Dialog bind:open>` turns it RED, then revert | A — the negative control is real and can fail |
| AC-5 | `Dialog` rendered markup unchanged | Fully-Automated | `git diff src/lib/components/ui/Dialog.svelte` touches only the `Props` block | A |
| AC-6 | `New timesheet` casing gone; button locators untouched | Fully-Automated | `grep -rn "New timesheet" tests/ src/` returns nothing; `grep -n "getByRole('button', { name: 'New Timesheet' })"` on both specs | A |
| AC-7 | S1-S5 files-changed heading reads 46 | Fully-Automated | arithmetic on the report's own list, restated in the phase report | A — anchor is line 31, not 33 |
| AC-8 | `RETURNED` entry names three identical orange copies, no second colour | Agent-Probe | `git grep -n "RETURNED'" 7742e59 -- 'src/**/*.svelte'` returns exactly 3, all `bg-orange-500/15 text-orange-400` — VERIFIED at V2 | A |
| AC-9 | S13-S17 S16 heading reads 23; the `:33` table untouched | Fully-Automated | `git show --name-only --pretty=format: 15ffdd1 \| grep -c .` = 23 — VERIFIED at V2 | A |
| AC-10 | PageHeader row gives 59 of 61 and names both holdouts | Fully-Automated | `find "src/routes/(app)" -name '+page.svelte' \| wc -l` = 61; `grep -rl PageHeader … \| wc -l` = 59; holdouts `approvals`, `payslips/[id]` — ALL VERIFIED at V2 | A — anchor is line 279, not 277 |
| AC-11 | All 15 backlog notes carry `name: note:` | Fully-Automated | `grep -h "^name:" process/features/ui-ux-overhaul/backlog/*_NOTE_*.md \| cut -d: -f2 \| sort \| uniq -c` — today: 14 note, 1 plan | A |
| AC-12 | Responsive note splits pattern 1 (3) from pattern 3 (10) | Agent-Probe | `sed -n '78,90p'` on the S13-S17 report — the 3/10 split is VERIFIED at V2 | A |
| AC-13 | Dark-only reconciliation closes at 31 and names ApplicantKanban's 3 | Agent-Probe | read; the sum `24 + 4 + 3 = 31` present and correct | A |
| AC-14 | Note states one answer on status pills in both `:13` and `:59` | Agent-Probe | per-file pill grep — 16 pills VERIFIED at V2 (3/5/3/2/2/1) | A |
| AC-15 | Phase plan `:596` states the true already-paired count | Fully-Automated | **NO COMMAND EXISTS.** "Proven by: Read" cannot verify a count. See CONCERN-2 | B — a re-derivation command must be added before EXECUTE writes a number |
| AC-16 | Full CI gate set green at all 3 commit boundaries | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test` — order VERIFIED against `.github/workflows/ci.yml:36,39,42,45` | A |

Legacy line form:
- `src/app.css` badge block: [hybrid: `pnpm build` + bundle grep, precondition: clean build tree — gate must be redesigned per FAIL-1]
- `src/lib/components/ui/Dialog.svelte`: [Fully-automated: `pnpm check` + scratch nameless-Dialog negative control]
- `NewTimesheetDialog` + 2 e2e specs: [Fully-automated: `grep -rn "New timesheet" tests/ src/`]
- Documentation (5 files): [Fully-automated: the §V.3/§V.4 re-derivation commands] + [agent-probe: prose-vs-source read]
- `pnpm test:e2e` for the two edited specs: [known-gap: KG-1, documented — CI job 2 runs it on push regardless]

gap-resolution legend: A — proven now. B — fixed in this plan. C — deferred to a named later phase. D — backlog stub.

### Dimension findings

- Infra fit: PASS — every one of the 11 named files exists at HEAD; the four CI scripts exist with
  the exact names the plan uses; `.github/workflows/ci.yml` runs them in the plan's stated order as
  four sequential steps of one job, so a red `format:check` does skip the rest exactly as §V.1 says.
- Test coverage: CONCERN — F2's negative control is a real check that can fail. F1's negative
  control (add `class="badge"`, confirm `.badge` now appears) **cannot fail**: `.badge` is already in
  the shipped bundle unconditionally, so the control is a no-op. AC-15 has no command at all.
- Breaking changes: CONCERN — `Dialog` has exactly 7 consumers and **zero** in `tests/`
  (`grep -rn "ui/Dialog" src/ tests/ scripts/` → 5 import sites, 7 usage sites, none under `tests/`).
  One consumer path in §Touchpoints is wrong: `src/lib/components/attendance/PunchMapDialog.svelte`
  does not exist; the file is `src/lib/components/timesheets/PunchMapDialog.svelte:122`. Both
  forwarding consumers (`ConfirmDialog`, `ReasonDialog`) default `title` to a string literal, so the
  forwarded `{title}` stays `string` and the discriminated union should compile untouched.
- Security surface: PASS — no auth, billing, schema, migration, public API, container, or secret
  path is touched. No evidence pack required.
- Section C1 feasibility (F1, F2, F3): **FAIL** — see FAIL-1. Anchors for Steps 1-3 are exact
  (`.badge` `:152-154`, `.badge::before` `:155-158`, block comment `:146-151`, trailing comment
  `:163`). Steps 7/8 anchors exact (`NewTimesheetDialog.svelte:37`, `:72`, `:9`; specs `:74` and
  `:79`; button locators `:76` and `:81`). Highest-risk edit: Step 1, because it is the one the plan
  is factually wrong about.
- Section C2 feasibility (F4-F7): CONCERN — substance all re-derived and correct (46, 23, 61/59, the
  two holdouts, the three identical baseline orange sites). Two anchors drifted: F4 is at line **31**
  not 33; F7 is at line **279** not 277. Highest-risk edit: F7, because the plan asks for a
  restructure of a table cell plus a footnote.
- Section C3 feasibility (F8-F11, X1): CONCERN — F8, F9, F10 all verified correct against source.
  F11's core claim is correct. X1's replacement number is unverified. Anchor drift: F10's section
  heading is at line **35**, not 37. Highest-risk edit: X1, because it replaces one unverified number
  with another unverified number.

### Open gaps

- FAIL-1 (F1 / D1's stated premise): the badge dot **is** rendering today. Both causes given in D1
  are false. `@apply badge` DOES carry the `.badge::before` rule, and `.badge` is NOT purged.
  Evidence, two independent lines:
  1. The shipped bundle contains it —
     `grep -o "\.badge[a-zA-Z-]*\(:[a-z]*\)\?{[^}]*}" build/client/_app/immutable/assets/0.DJzqpuKf.css`
     returns `.badge:before{…content:""}` **and** `.badge-green:before`, `.badge-red:before`,
     `.badge-yellow:before`, `.badge-blue:before`, `.badge-gray:before`, all with `content:""`.
  2. Isolated repro with this repo's own Tailwind — a 3-rule input where `.badge-green` does
     `@apply badge` compiles to `.badge-green:before{…content:""}`. `@apply` carries the
     pseudo-element rule.
  Cause of the purge claim being wrong: the literal token `badge` DOES appear in `src` —
  `src/routes/(app)/team/+page.svelte:143-150` (`{@const badge = …}` / `{badge.class}`) — so
  Tailwind's scanner keeps `.badge` alive.
  Consequence: `Badge.svelte` renders `.badge-{tone}` on 16 literal call sites, so deleting
  `.badge::before` **removes a visible 6px leading dot from every status pill in the app**. The plan's
  "no visual change" is false, its Public Contracts row for `.badge::before` is false, and AC-1's
  byte-identical gate would go RED by construction. The owner's *decision* to delete may still stand,
  but it must be re-taken as "delete a dot that currently ships", not "delete dead CSS".
- FAIL-2 (AC-1 negative control is theatre): §V.2 step 3 adds `class="badge"` and expects `.badge` to
  "NOW appear". It already appears with or without the scratch edit, so the control passes either way
  and proves nothing. Replace it with a control that can fail: delete the rule, rebuild, and confirm
  the five `.badge-*:before` rules disappear from the bundle.
- CONCERN-1: §Touchpoints lists `src/lib/components/attendance/PunchMapDialog.svelte:122`. That path
  does not exist. Real path: `src/lib/components/timesheets/PunchMapDialog.svelte:122`.
- CONCERN-2 (X1 / AC-15): the replacement figure "7 already carry a `dark:` pair, so 128 of 135" is
  not reproducible and has no command. Measured at the baseline `7742e59`:
  `git grep -ohE "text-(green|yellow|gray|blue)-400" 7742e59 -- 'src/**/*.svelte' | wc -l` = **137**
  across **37** files, of which `git grep -ohE "dark:text-(green|yellow|gray|blue)-400" …| wc -l` =
  **21** are the `dark:` half of a pair. The "7" is the already-paired count inside the 31-occurrence
  subset only; it is not the already-paired count across all 135. AC-15's "Proven by: Read" cannot
  catch this. X1 must either carry an exact command that yields the number it writes, or scope its
  sentence to the 31-subset it actually measured.
- CONCERN-3 (F11 basis mix): "16 of the 24" mixes two bases. The **16 pills are exactly right** —
  re-derived per file at HEAD as dashboard 3, benefits 5, recruitment/[id] 3, holidays 2,
  requests/approvals 2, settings/onboarding 1. But at HEAD the total across those 6 files is **23**,
  not 24 (dashboard has 10 dark-only occurrences at HEAD; the note's table records 11 on the S5
  basis, which KG-2 already explains). The qualitative claim — the majority ARE status pills, and the
  decorative remainder is entirely in `dashboard` — is CORRECT and survives either basis. State the
  basis when writing the sentence.
- CONCERN-4 (anchor drift, 3 of 17 steps): F4 line 33 → **31**; F7 line 277 → **279**; F10 section
  heading line 37 → **35**. Every other anchor in all 17 steps was checked against HEAD and is exact.
- Not a gap, an unrecorded safety net: `.github/workflows/ci.yml:105-106` runs `pnpm test:e2e` as a
  separate CI job. KG-1 defers e2e **locally**; the two edited specs still get run on push.

### What this coverage does NOT prove

- `pnpm build` + bundle grep proves what the CSS **file** contains. It does not prove what a browser
  paints — no screenshot tier exists (KG-4). After the F1 gate is redesigned, "the dot is gone" will
  need one human or agent look at a badge-heavy page.
- `pnpm check` proves the `Dialog` type compiles. It does not prove the rendered `aria-label` /
  `aria-labelledby` output is unchanged at runtime — only `git diff` scope (AC-5) covers that, and a
  diff is not a render.
- `grep -rn "New timesheet"` proves the string is gone from `src/` and `tests/`. It does not prove the
  dialog is still reachable by its accessible name in a real browser — that is KG-1, mitigated by the
  Playwright case-insensitivity fact (VERIFIED: `playwright-core@1.61.1` `types/types.d.ts:3009` —
  "By default, matching is case-insensitive and searches for a substring, use `exact` to control this
  behavior"; neither dialog locator sets `exact`) and by CI's own e2e job.
- The §V.3 / §V.4 re-derivation commands prove the **numbers**. They do not prove the surrounding
  prose is non-contradictory — that is the Agent-Probe on AC-8, AC-12, AC-13, AC-14, and an agent
  read is judgment, not a gate.
- `pnpm test` (vitest) does not execute any CSS. It cannot see the F1 regression at all.

Gate: BLOCKED (2 unresolved FAILs — F1's stated premise is factually false and reverses the visual
impact of Step 1; AC-1's negative control cannot fail)
Accepted by: — (BLOCKED; no concerns accepted)

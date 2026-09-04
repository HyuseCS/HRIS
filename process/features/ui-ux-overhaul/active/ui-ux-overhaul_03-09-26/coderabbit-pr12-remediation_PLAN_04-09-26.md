---
name: plan:coderabbit-pr12-remediation
description: "Remediation of the 11 real CodeRabbit findings on PR #12 — three code fixes (dead badge dot CSS, Dialog accessible-name type, New Timesheet name mismatch) and eight documentation corrections across two phase-03 reports and two backlog notes"
date: 04-09-26
feature: ui-ux-overhaul
phase: "03"
metadata:
  node_type: memory
  type: plan
---

# CodeRabbit PR #12 Remediation

**TL;DR.** CodeRabbit raised 12 findings on PR #12. A RESEARCH pass re-verified every one against
HEAD. Eleven are real, one (F12) is correctly rejected, and one extra defect of the same family was
found outside the list. This plan fixes all twelve real items in **three commits**: one code commit
(3 findings, 5 files), one report-correction commit (4 findings, 2 files), one note-correction
commit (5 findings, 3 files). No behaviour changes, no visual changes, no refactors.

---

## Overview

**Date**: 04-09-26
**Status**: ACTIVE — planned, not started
**Complexity**: SIMPLE (single-session, 12 atomic steps, 3 commits)
**Feature**: ui-ux-overhaul
**Branch**: `feat/uiux-phase-3` (clean, 8 commits ahead of `origin`, **not pushed**)
**Upstream input**: `code-review-pr-12.md` at the repo root, plus the RESEARCH re-verification pass

The review was written before the last 8 commits landed, so parts of it are stale. Everything
recorded in this plan has been re-checked against HEAD and is stated as verified fact. EXECUTE must
still open each named file before editing it — line numbers move.

## Goal

Close every real CodeRabbit finding on PR #12 with the smallest correct change, and leave no
documentation claim in the phase-03 record that contradicts the source it describes.

Success is observable: the dead `::before` rule and its two stale comments are gone; `Dialog` cannot
be constructed without an accessible name; the `New Timesheet` accessible name matches its heading;
and every corrected number in the four documents is reproducible by a command written into this plan.

## Scope

### In scope

| # | Finding | File(s) | Kind |
|---|---|---|---|
| F1 | Delete dead `.badge::before` + fix its two stale comments | `src/app.css` | Code |
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
| X1 | Plan's "**0** of them currently carry a `dark:` pair" — seven do | `phase-03-design-system_PLAN_03-09-26.md` | Docs |

### Explicitly out of scope

| Item | Why |
|---|---|
| F12 (CodeRabbit's twelfth finding) | Correctly rejected by the RESEARCH pass. No action. |
| Wiring the badge dot up (a `<span>` dot, or a literal `badge` class) | **Owner decision, settled**: delete the dead CSS, no visual change. |
| The stale commit hashes in the S13-S17 report's section table (`73c4f8f`, `d9087c5`, …) | The branch was rebased after the report was written. Not a CodeRabbit finding; not in scope. |
| Re-measuring or changing the `24` / `31` counts themselves | Both are verified correct. Only the *reconciliation prose* is wrong. |
| Fixing any of the 24 residual dark-only colours | That is the backlog note's own future work. |
| Any adjacent CSS, component, or copy cleanup | Surgical rule: every changed line traces to a finding above. |

## Binding Decisions (owner, settled — do not re-open)

**D1 — F1: delete, do not wire up.** The dot has never rendered once since `df20c34` (2026-07-27).
Two independent causes, both verified:
(a) `@apply badge` inside `.badge-green` etc. copies `.badge`'s own declarations only — a separate
`.badge::before` rule is not carried by `@apply`;
(b) the literal string `badge` appears nowhere in `src/` as a class name (only `badge-green`,
`badge-red`, … and prose), so Tailwind's content scanner purges `.badge` and `.badge::before` out of
the built stylesheet entirely.
The owner chose **no visual change**. Delete the rule. Do **not** add a dot back in any form.

**D2 — F3: match the heading, change the dialog.** The `<h2>` reads `New Timesheet`; the `title`
prop reads `New timesheet`. Change the **prop**, not the heading, and follow through to the two e2e
locators so the record is consistent.

## Touchpoints

**Code (read + write):**
- `src/app.css` — lines ~146-163 (the `@layer components` badge block)
- `src/lib/components/ui/Dialog.svelte` — `interface Props` (~:15-34), the panel `aria-*` bindings (~:133-134)
- `src/lib/components/timesheets/NewTimesheetDialog.svelte` — `:37`

**Code (read only, to prove F2 does not break them — the 7 `Dialog` consumers):**
- `src/lib/components/recruitment/ApplicantKanban.svelte:176`
- `src/lib/components/timesheets/NewTimesheetDialog.svelte:37`
- `src/lib/components/attendance/PunchMapDialog.svelte:122`
- `src/lib/components/ui/ConfirmDialog.svelte:31`
- `src/lib/components/ui/ReasonDialog.svelte:56`
- `src/lib/components/timesheets/TimesheetModal.svelte:280`
- `src/routes/(app)/settings/roles/+page.svelte:261`

**Tests (write):**
- `tests/e2e/timesheet-create-for-employee.spec.ts:74`
- `tests/e2e/manager-org-wide-timesheets.spec.ts:79`

**Tests (read only, confirm unchanged):**
- `tests/unit/badge-class-literals.test.ts:27-28`

**Documentation (write):** the four files named in §Scope, plus `phase-03-design-system_PLAN_03-09-26.md:596`.

## Public Contracts

| Contract | Change | Compatibility |
|---|---|---|
| `.badge` CSS class | Unchanged. It is still reached by `@apply` from all five `.badge-*` rules, which Tailwind inlines at build time regardless of purging. **Do not delete `.badge`.** | No change |
| `.badge::before` | Deleted. Never present in the built stylesheet, so no rendered output changes. | No change |
| `.badge-green` / `-red` / `-yellow` / `-blue` / `-gray` | Unchanged | No change |
| `Dialog` `Props` type | `title` and `labelledBy` become mutually-exclusive-but-required: at least one must be supplied. Runtime rendering is byte-identical. | **Compile-time only.** All 7 current consumers already pass one. A consumer needing a change means the type is wrong — fix the type, not the consumer. |
| `Dialog` rendered DOM | Unchanged — `aria-label={labelledBy ? undefined : title}` / `aria-labelledby={labelledBy}` stay exactly as they are | No change |
| `NewTimesheetDialog` accessible name | `"New timesheet"` → `"New Timesheet"` | Playwright's `getByRole(..., { name })` is case-insensitive and whitespace-normalised unless `exact: true` is set; neither locator sets it. Both specs therefore match **before and after**. The locator edit is a consistency fix, not a break-fix. |

## Blast Radius

| Dimension | Value |
|---|---|
| Code files changed | 3 (`app.css`, `Dialog.svelte`, `NewTimesheetDialog.svelte`) |
| Test files changed | 2 e2e specs |
| Documentation files changed | 5 (2 reports, 2 backlog notes, 1 phase plan) |
| **Total** | **10 files, 3 commits** |
| Server / schema / API surface | **Zero.** No `+page.server.ts`, no Prisma, no route handler, no auth path. |
| Rendered-output surface | **Zero.** F1 deletes CSS that never shipped; F2 is a type; F3 changes one `aria-label` string's capitalisation. |
| Risk class | **Low.** No high-risk class present (no auth, billing, schema/migration, public API, container, or secrets). Highest residual risk is F2's type change failing to compile against a consumer. |

## Implementation Checklist

Three commits. The split is by *kind of proof*: commit 1 is proven by the CI gate set, commit 2 by
re-deriving each report number with a command, commit 3 by re-deriving each note claim from source.
Mixing them would make a red gate ambiguous about which finding caused it.

---

### C1 — Code fixes (F1, F2, F3)

Commit subject: `fix(ui): close the three code findings from the PR #12 review`

**Step 1 — F1: delete the dead `::before` rule.** In `src/app.css`, delete the whole rule
(currently `:155-158`):

```
.badge::before {
	@apply h-1.5 w-1.5 shrink-0 rounded-full bg-current;
	content: '';
}
```

Delete nothing else. `.badge` itself (currently `:152-154`) **stays** — all five `.badge-*` rules
do `@apply badge`, and `@apply` inlines at build time regardless of Tailwind purging.

**Step 2 — F1: fix the trailing comment.** In the block comment above `.badge-green` (currently
ending at `:163`) the last sentence reads:

> `` `badge` stays FIRST in each rule: it carries the pill layout and the leading dot. ``

Replace the trailing clause so it names only what is true. Required substance: `badge` stays first
in each rule because it carries the pill layout (`inline-flex`, radius, padding, type scale) and the
variant rule then layers colour on top. **Remove every mention of a dot.**

**Step 3 — F1: rewrite the block comment above `.badge`.** The comment currently at `:146-151`
documents the dot design ("per the BordUp reference … the dot is what the eye catches …"). With the
rule gone it describes something that does not exist. Rewrite it to carry three things, and only
these three:

1. What a badge *is* now — a small pill: tinted background plus a theme-paired text colour, one
   class per tone.
2. That the five tone rules all start with `@apply badge`, so a new tone only sets its two colour
   classes.
3. One sentence of tombstone, so nobody re-adds the dot from the old prose: *the leading dot was
   designed in `df20c34` (27-07-26) but never rendered once — `@apply` does not carry a separate
   `::before` rule, and no literal `badge` class exists in `src/` for Tailwind to keep the rule
   alive — so it was removed deliberately on 04-09-26.*

**Step 4 — F1: confirm the unit-test comment still holds.** Open
`tests/unit/badge-class-literals.test.ts:27-28`. It asserts:

> The base `.badge` is only ever reached through `@apply`, which Tailwind inlines at build time, so
> it does not need a literal.

That statement is **still true** after steps 1-3. **Confirm it. Do not change it.** Do not change
anything else in that file.

**Step 5 — F2: make the `Dialog` accessible name required.** In
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

**Step 6 — F2: prove all 7 consumers still compile untouched.** Run `pnpm check`. Zero new errors
against the report's recorded baseline (1099 files, 0 errors, 1 pre-existing `CalculatorWindow.svelte`
a11y warning). If any of the 7 consumers now errors: **the type is wrong, not the consumer.** Fix
the type and re-run. Do not edit a consumer to satisfy the type.

**Step 7 — F3: fix the dialog accessible name.** In
`src/lib/components/timesheets/NewTimesheetDialog.svelte:37`, change:

`<Dialog bind:open title="New timesheet" …>` → `<Dialog bind:open title="New Timesheet" …>`

Leave the `<h2>New Timesheet</h2>` at `:72` alone. Leave the `:9` code comment alone (it already
reads `New Timesheet`).

**Step 8 — F3: update the two e2e dialog locators.** Change `'New timesheet'` → `'New Timesheet'` at:
- `tests/e2e/timesheet-create-for-employee.spec.ts:74`
- `tests/e2e/manager-org-wide-timesheets.spec.ts:79`

**Do NOT touch** the button locators at `:76` and `:81` in those same files — they read
`getByRole('button', { name: 'New Timesheet' })`, they are a different node, and they are already
correct. After the edit, `grep -rn "New timesheet" tests/ src/` must return **nothing**.

**Gate for C1:** §V.1 (full CI gate set) + §V.2 (the F1 deletion proof). Commit only on green.

---

### C2 — Report corrections (F4, F5, F6, F7)

Commit subject: `docs(ui-ux): correct four counts and claims in the phase 03 execute reports`

**Step 9 — F4: fix the S1-S5 files-changed count.** In
`phase-03-design-system-s1-s5_REPORT_03-09-26.md:33` the heading reads
`### Files changed (36, all presentation-layer)`. The sum of its own list is **46**:

| Group | Count |
|---|---|
| Created (`labels.ts`, `badge.ts`, `Badge.svelte`, `labels.test.ts`, `badge-tone.test.ts`, the AC-7 backlog note) | 6 |
| `src/app.css` | 1 |
| S4 files | 10 |
| S5 files | 20 |
| e2e specs | 9 |
| **Total** | **46** |

Change `36` → `46`. Change nothing else on that line or in the list below it.

**Step 10 — F5: restate the `RETURNED` defect.** Same file, `:100-101`. It currently reads:

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

**Step 11 — F6: fix the S16 heading count.** In
`phase-03-design-system-s13-s17_REPORT_03-09-26.md:111` the heading reads
`### S16 — EmptyState across 22 files`. The table at `:33` in the same file says **23**, and **23 is
correct**: the S16 commit contains 23 paths (the report cites it as `d9087c5`; after the branch was
rebased it is `15ffdd1` — `git show --name-only --pretty=format: 15ffdd1 | grep -c .` returns `23`).

Change `22` → `23` on line 111. **Leave the table at `:33` alone** — it is already right.

**Step 12 — F7: fix the PageHeader adoption row.** Same file, `:277`, currently:

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

Commit subject: `docs(ui-ux): correct the phase 03 backlog notes and the plan's dark-pair figure`

**Step 13 — F8: fix the NOTE frontmatter prefix.** In
`process/features/ui-ux-overhaul/backlog/phase-03-responsive-sweep_NOTE_03-09-26.md:2`:

`name: plan:phase-03-responsive-sweep` → `name: note:phase-03-responsive-sweep`

It is the only one of the 15 backlog notes using the `plan:` prefix; the other 14 use `note:`.
Change line 2 only — `description`, `date`, `feature`, and `phase` stay as they are.

**Step 14 — F9: split the merged `ml-auto` patterns.** Same file, `:27-30`. It currently reads:

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

**Step 15 — F10: make the reconciliation close at 31.** In
`process/features/ui-ux-overhaul/backlog/phase-03-residual-dark-only-colours_NOTE_03-09-26.md:37-41`
(the "Correction to the plan's figure" section).

**The finding names a real problem but both CodeRabbit and the note get the cause wrong.**
Re-measured against the pre-phase baseline `7742e59` across the plan's 11 named files: total
dark-only occurrences = **31**; **unpaired** = **24**. So:

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
per-file table at `:26-34` or its `24` total.

**Step 16 — F11: resolve the pill contradiction.** Same file. Two statements disagree:
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

Write **one** answer in both places: the majority are status pills; only the `dashboard` remainder
is decorative. Then fix the consequence at `:59` — because these are pills, a `<Badge>` conversion
**is** the right tool for them, not merely pairing the colours. Rewrite the fixing advice to say:
convert the pill occurrences to `<Badge>` (which already carries theme-paired tones), and pair the
colours by hand only for the decorative `dashboard` remainder. Keep the existing warning about
measuring the composited ratio (the `green-700` at 4.40:1 finding) — it still applies to the
hand-paired remainder.

**Do not change any count in this note.** The `24` and the per-file table were measured at the S5
commit and are correct; this step changes only the *characterisation* and the *advice*.

**Step 17 — X1: fix the plan's dark-pair figure.** In
`process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system_PLAN_03-09-26.md:596`
the AC-7 scope note reads:

> There are 135 `text-{green,yellow,gray,blue}-400` occurrences across 36 files, and **0** of them
> currently carry a `dark:` pair.

**Seven of the 31 do** — 4 single occurrences (`payroll/config`, `payroll/statutory-rates`,
`reports`, `settings/company`) plus 3 in `ApplicantKanban.svelte`. Same family of error as F10, and
cheaper to fix now than to leave it contradicting the note it feeds.

Change `**0** of them` to state that **7 already carry a `dark:` pair**, so 128 of the 135 are
unpaired. Keep the 135, the 36 files, the 104 / 31 split, and the 11 named files exactly as they
are — only the paired-count claim changes. Add a short pointer that the 31/24 difference is
reconciled in `phase-03-residual-dark-only-colours_NOTE_03-09-26.md`.

**Gate for C3:** §V.1 + §V.4 (re-derive each note claim from source). Commit only on green.

---

## Phase Completion Rules

- A **commit group** (C1/C2/C3) is complete when its diff is committed AND its named gate passed on
  that commit. Code or docs written but ungated is not a completed group.
- This remediation is `CODE DONE` when all three commits are in and the full CI gate set is green.
- It is `VERIFIED` only when, in addition: §V.2's before/after build pair and its negative control
  are recorded, AC-4's negative control (a nameless `Dialog` reddens `pnpm check`) is recorded, and
  the Agent-Probe read of the four rewritten documentation passages is recorded. A green `pnpm test`
  alone never promotes this to VERIFIED — this repo has recorded cases of a green suite coexisting
  with a live defect.
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
formats `.md`. Do not skip it on a docs-only commit.

### V.2 The F1 deletion proof (`pnpm check` cannot see deleted CSS)

A grep alone is not enough. **Three things must be true**, and EXECUTE must record all three:

1. **No rule references the removed pseudo-element.**
   `grep -n "::before" src/app.css` returns **nothing**, and `grep -rn "badge::before" src/ tests/`
   returns nothing. This proves no orphan reference survives the deletion.

2. **The rule was absent from the built stylesheet BEFORE the change** — this is the real proof, and
   it must be a **before/after pair**, not an after-only check.
   - Build the app on the **pre-change tree**: `pnpm build`.
   - Grep the emitted CSS bundle(s) under `.svelte-kit/output/client/_app/immutable/assets/` for
     `badge` and for `content:''` / `content:""` adjacent to a `.badge` selector.
   - Expected: **no `.badge` rule and no `.badge::before` rule in the bundle at all** — only the
     five `.badge-*` rules with their `@apply`-inlined declarations.
   - Repeat the identical build+grep on the **post-change tree**.
   - **The gate is that the two greps are identical.** If the built CSS is byte-identical for the
     badge block across the two builds, the deletion provably changed nothing that ships.

3. **Negative control — prove the check can fail.** On a scratch copy, temporarily add a literal
   `class="badge"` to any one `.svelte` file, rebuild, and confirm `.badge` (and, on the pre-change
   tree, `.badge::before`) now DOES appear in the bundle. This proves the grep in step 2 is capable
   of finding the rule and its absence is a real signal, not a broken search.
   **Revert the scratch edit with `git diff` review — never with `git checkout <file>`.**

4. **Visual confirmation.** Because the built CSS for badges is unchanged, no visual pass is
   strictly required. If EXECUTE wants belt-and-braces, load one badge-heavy page (`/timesheets` or
   `/requests`) in both themes and confirm the pills render as before — but the byte-identical CSS
   in step 2 is the load-bearing evidence.

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
```

F4's 46 is arithmetic on the report's own list, not a command — restate the addition in the phase
report so it is checkable by eye.

### V.4 Note-claim re-derivation (C3)

```bash
# F8 — the note: prefix is now the only shape in backlog/
grep -h "^name:" process/features/ui-ux-overhaul/backlog/*_NOTE_*.md | sort | uniq -c
# expect: 15 lines, all "name: note:…", zero "name: plan:…"

# F9 — the 3-vs-10 split is what the S13-S17 report records
sed -n '78,90p' process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system-s13-s17_REPORT_03-09-26.md

# F10 — 24 unpaired + 4 + 3 = 31 across the plan's 11 named files, at the baseline
#        (re-run the note's own pattern against 7742e59 for the 11 files)

# F11 — the pill shape in the 6 residual files
for f in "src/routes/(app)/dashboard/+page.svelte" "src/routes/(app)/benefits/+page.svelte" \
         "src/routes/(app)/recruitment/[id]/+page.svelte" "src/routes/(app)/settings/holidays/+page.svelte" \
         "src/routes/(app)/requests/approvals/+page.svelte" "src/routes/(app)/settings/onboarding/+page.svelte"; do \
  echo "== $f"; grep -nE "text-(green|yellow|gray|blue)-400" "$f" | grep -v "dark:"; done
```

### V.5 F3 and the e2e suite

The two specs are **e2e** — they need a production build plus a running app and database, which the
**owner** starts. Ask; never launch `./start.sh`, vite, or the `veent-db-5434` container directly.

**Decision: `pnpm test:e2e` is DEFERRED. It is a named Known-Gap (KG-1 below), not a silent skip.**

Why deferring is acceptable here, and this is the load-bearing reason: Playwright's
`getByRole(role, { name })` matches **case-insensitively and with whitespace normalised** unless
`exact: true` is passed. Neither locator passes `exact: true`. So `'New timesheet'` already matched
`"New Timesheet"` before Step 7, and `'New Timesheet'` matches it after. **Both specs pass before
and after the change.** The Step 8 edit is a consistency fix so the source and the test read the
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

## Acceptance Criteria

| # | Criterion | Proven by | Strategy |
|---|---|---|---|
| AC-1 | `.badge::before` no longer exists in `src/app.css`, `.badge` still exists, and the built CSS badge block is byte-identical before and after | §V.2 steps 1-3 (build+grep pair with a negative control) | Hybrid |
| AC-2 | Neither remaining `app.css` badge comment mentions a dot, and one sentence records that the dot was designed in `df20c34`, never rendered, and was removed deliberately | `grep -in "dot" src/app.css` returns only the tombstone sentence; read the block | Fully-Automated + Agent-Probe |
| AC-3 | `tests/unit/badge-class-literals.test.ts:27-28` is unchanged and its claim is still true | `git diff` shows no change to that file; `pnpm test` green | Fully-Automated |
| AC-4 | A `Dialog` with neither `title` nor `labelledBy` is a **compile error**; all 7 existing consumers compile unchanged | `pnpm check` green on the 7 consumers; plus a scratch negative control — add a `<Dialog bind:open>` with no name, confirm `pnpm check` goes RED, then revert | Fully-Automated |
| AC-5 | `Dialog`'s rendered markup is unchanged (`aria-label` / `aria-labelledby` bindings identical) | `git diff src/lib/components/ui/Dialog.svelte` touches only the `Props` type block | Fully-Automated |
| AC-6 | `grep -rn "New timesheet" tests/ src/` returns nothing; the two `button` locators are untouched | §V.5 static gates | Fully-Automated |
| AC-7 | The S1-S5 report's files-changed heading reads 46 and matches the sum of its own list | Arithmetic restated in the phase report | Fully-Automated |
| AC-8 | The `RETURNED` entry describes three duplicated identical orange copies folding to yellow, and names no second colour | §V.3 baseline grep + read | Agent-Probe |
| AC-9 | The S13-S17 report's S16 heading reads 23 and the `:33` table is unchanged | `git show --name-only … \| grep -c .` = 23; `git diff` shows one line changed near `:111` | Fully-Automated |
| AC-10 | The PageHeader row gives two separate numbers (59 of 61), drops "plus nested users", and names both holdouts | §V.3 three commands | Fully-Automated |
| AC-11 | All 15 backlog notes carry `name: note:…`; zero carry `name: plan:…` | §V.4 first command | Fully-Automated |
| AC-12 | The responsive note splits pattern 1 (3 pages) from pattern 3 (10 pages) and scopes the wrapped-`ml-auto` risk to the 3 | §V.4 second command + read against the report `:80-88` | Agent-Probe |
| AC-13 | The dark-only note's reconciliation closes at 31, names ApplicantKanban's 3 already-paired, and does **not** claim the plan's 31 was wrong | Read; the sum `24 + 4 + 3 = 31` is present and correct | Agent-Probe |
| AC-14 | The dark-only note states one answer about status pills in both `:13` and `:59`, and its fixing advice follows from that answer | §V.4 fourth command + read both lines | Agent-Probe |
| AC-15 | `phase-03-design-system_PLAN_03-09-26.md:596` says 7 already carry a `dark:` pair (128 of 135 unpaired) and keeps the 135 / 36 / 104 / 31 figures | Read | Fully-Automated |
| AC-16 | The full CI gate set is green at all three commit boundaries, relative to the recorded pre-change baseline | `pnpm format:check && pnpm lint && pnpm check && pnpm test` per commit, plus the §V.1 baseline record | Fully-Automated |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check && pnpm lint && pnpm check && pnpm test` green at each of the 3 commit boundaries, against the §V.1 pre-change baseline | Fully-Automated | AC-16 |
| `grep -n "::before" src/app.css` and `grep -rn "badge::before" src/ tests/` both return nothing | Fully-Automated | AC-1 (no orphan reference) |
| `pnpm build` + grep the emitted CSS bundle for the badge block, run on the pre-change and post-change trees, results identical | Hybrid — precondition: a clean `pnpm build` on both trees; no dev server or DB needed | AC-1 (the deletion changed nothing that ships) |
| Negative control: add a literal `class="badge"` to one `.svelte` file, rebuild, confirm `.badge` NOW appears in the bundle; revert | Hybrid — same precondition | AC-1 (the grep is capable of failing) |
| `grep -in "dot" src/app.css` returns only the tombstone sentence; agent reads both rewritten comments for accuracy | Agent-Probe — agent judges whether the prose describes what the CSS now does | AC-2 |
| `git diff tests/unit/badge-class-literals.test.ts` is empty and `pnpm test` is green | Fully-Automated | AC-3 |
| `pnpm check` green with all 7 `Dialog` consumers unedited | Fully-Automated | AC-4 (positive half) |
| Negative control: a scratch `<Dialog bind:open>` with neither `title` nor `labelledBy` makes `pnpm check` go RED; revert the scratch edit | Fully-Automated | AC-4 (the type actually bites) |
| `git diff src/lib/components/ui/Dialog.svelte` touches only the `Props` type block — the `aria-*` bindings are untouched | Fully-Automated | AC-5 |
| `grep -rn "New timesheet" tests/ src/` returns nothing; the two `getByRole('button', { name: 'New Timesheet' })` locators are still present | Fully-Automated | AC-6 |
| §V.3 re-derivation commands reproduce 46 / 23 / 61 / 59 / the 2 holdouts / the 3 identical orange baseline sites | Fully-Automated | AC-7, AC-9, AC-10 + evidence for AC-8 |
| §V.4 first command: 15 notes, all `name: note:` | Fully-Automated | AC-11 |
| §V.4 fourth command reproduces the pill shape across the 6 residual files | Fully-Automated | evidence for AC-14 |
| Agent reads the four rewritten documentation passages against the source they describe and judges whether each claim is now true and non-contradictory | Agent-Probe — agent judges prose-vs-source truth, which no grep can assert | AC-8, AC-12, AC-13, AC-14 |
| `pnpm test:e2e` on the two edited specs | Known-Gap → **KG-1**; gate stays **CONDITIONAL** | (residual — not a proving strategy; AC-6 is proven statically instead) |

**Known-gap note.** Per the vacuous-green ban, KG-1 is recorded as a named residual, its gate stays
CONDITIONAL, and it does not count as proof. It does not block the commits, because the static gates
in §V.5 prove AC-6 and the Playwright case-insensitivity fact proves the specs match both before and
after.

## Test Infra Improvement Notes

(none identified yet)

## Known Gaps

| # | Gap | Why deferred | Resolution if picked up |
|---|---|---|---|
| KG-1 | `pnpm test:e2e` is not run for the two edited specs | e2e needs a production build, a running app, and a seeded DB the **owner** starts. The change is provably inert for Playwright name-matching (case-insensitive, `exact: true` not set), so the cost is not justified for a capitalisation edit. Gate stays **CONDITIONAL**. | Owner starts the DB + app, then `pnpm tsx scripts/seed-uiux-demo.ts --clear` followed by `pnpm test:e2e`, compared against a baseline e2e run on the pre-change tree. |
| KG-2 | The `24` count and the per-file table in the dark-only note are not re-measured at HEAD | They were measured at the S5 commit and are correct **for that basis**. Later sections (S13's banner sweep) touched `dashboard`, so a HEAD re-count would differ and would break F10's `24 + 4 + 3 = 31` arithmetic. Changing the basis is a bigger job than this remediation. | A future dark-only fixing pass re-measures at its own HEAD and restates the basis explicitly in the note. |
| KG-3 | The S13-S17 report's section table still cites pre-rebase commit hashes (`73c4f8f`, `d9087c5`, `1bb272f`, `b2d22c5`) that no longer resolve | Not a CodeRabbit finding, and rewriting the hashes risks a second rebase making them stale again. Out of scope by the surgical rule. | If the branch stops being rebased, refresh the table's hashes in one pass and note the rebase in the report. |
| KG-4 | No visual regression suite exists for the badge block | The repo has no screenshot-diff tier. §V.2's byte-identical-CSS proof is the substitute and is stronger for this specific change. | Out of scope for this plan; a screenshot tier is a separate infra item. |

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | F2's discriminated union does not compile cleanly under `svelte-check`, tempting an edit to one of the 7 consumers | Step 6 forbids it explicitly: a consumer error means the type is wrong. AC-4's negative control proves the type still bites after any reshaping. |
| R2 | The F1 "nothing changed visually" claim is asserted rather than proven, exactly the failure mode this repo has recorded five times | §V.2 requires a **before/after build pair** plus a **negative control**, not a grep. A grep alone is explicitly rejected as insufficient. |
| R3 | Step 8 accidentally rewrites the `button` locators at `:76` / `:81` | Both steps name the button locators as must-not-touch, and AC-6 asserts they are still present with the exact original string. |
| R4 | A docs-only commit skips `format:check` and reddens CI, since CI runs format first | §V.1 states Prettier formats `.md` and forbids skipping format on C2/C3. |
| R5 | Correcting F10 accidentally rewrites the note's `24` or the per-file table, creating a new contradiction | Step 15 forbids touching both, and KG-2 records why the basis stays at the S5 commit. |
| R6 | The F11 rewrite changes the pill/decorative characterisation but leaves the old "pair the colours, do not force the component" advice, producing a fresh internal contradiction | Step 16 requires the advice at `:59` to be rewritten **as a consequence** of the answer, and AC-14 asserts advice-follows-answer. |
| R7 | Rewriting the `app.css` comment reintroduces the dot idea for a future reader | Step 3 mandates an explicit tombstone sentence naming `df20c34`, "never rendered", and "removed deliberately". |

## Dependencies

**Upstream:** none. The branch is clean and 8 commits ahead of `origin`. No other plan is mid-flight
on these files.

**Downstream:**
- Phase 04 consumes the `Dialog` primitive. F2 tightens its type only; the runtime API is unchanged,
  so phase 04's plan needs no revision. If phase 04 adds a new `Dialog` consumer after this lands,
  it must pass `title` or `labelledBy` — which it already would.
- The corrected `phase-03-residual-dark-only-colours_NOTE` drives a future dark-only fixing pass;
  F11's answer changes what that pass is told to do (convert pills to `<Badge>`, hand-pair only the
  decorative remainder).
- The corrected `phase-03-responsive-sweep_NOTE` drives the 390px pass; F9's split tells that pass
  which three pages carry the real wrapped-`ml-auto` risk.

**Blocking:** none for C1-C3. KG-1 needs the owner to start the DB container and the dev/preview
app — **ask, never launch them.**

## Rollback

Three commits on an **unpushed** branch. Nothing is on a remote, so no history rewrite is involved
and no force-push question arises.

| Situation | Action |
|---|---|
| One commit is wrong, the others are fine | `git revert <sha>` for that commit. Keeps history honest and is safe even if the branch is later pushed. |
| Everything after a known-good point is wrong | `git reset --hard <sha-before-C1>` — safe **only** while the branch is unpushed and the tree is clean. Confirm `git status` is clean and no agent is running first. |
| A single file's edit must be undone mid-work | `git diff <file>` first, then apply the inverse by hand, or `git restore --source=HEAD <file>` **only** if that file has no other uncommitted work. **Never** `git checkout <file>` on a dirty tree — this repo has a recorded case of that silently reverting a live agent's uncommitted work. |
| The whole remediation is abandoned | `git reset --hard <sha-before-C1>` and delete the plan file. Nothing else in the repo depends on these three commits. |

Blast-radius note for rollback: no schema change, no migration, no server code, and no shipped-CSS
change, so a revert has **no data or runtime consequences** — the tree simply returns to its prior
state.

## Resume and Execution Handoff

1. **Selected plan file (primary execute anchor):**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/coderabbit-pr12-remediation_PLAN_04-09-26.md`
2. **Last completed phase/step:** none — plan written, EXECUTE not started.
3. **Validate-contract status:** pending (placeholder at §Validate Contract).
4. **Supporting context loaded:** `code-review-pr-12.md` (repo root),
   `process/development-protocols/plan-lifecycle.md`,
   `process/development-protocols/implementation-standards.md`,
   `phase-03-design-system_PLAN_03-09-26.md`,
   `phase-03-design-system-s1-s5_REPORT_03-09-26.md`,
   `phase-03-design-system-s13-s17_REPORT_03-09-26.md`,
   `process/features/ui-ux-overhaul/backlog/phase-03-responsive-sweep_NOTE_03-09-26.md`,
   `process/features/ui-ux-overhaul/backlog/phase-03-residual-dark-only-colours_NOTE_03-09-26.md`,
   `src/app.css`, `src/lib/components/ui/Dialog.svelte`,
   `src/lib/components/timesheets/NewTimesheetDialog.svelte`, the two named e2e specs.
5. **Next step for a fresh agent:** run §V.1 on the untouched tree and record the baseline, then run
   §V.2 step 2's **pre-change** `pnpm build` + bundle grep (this must happen BEFORE Step 1 — it
   cannot be reconstructed afterwards), then start Step 1. To find the resume point mid-work, read
   `git log --oneline` — each commit subject names its group (`fix(ui):` = C1, `docs(ui-ux):` = C2/C3.)

**Branch:** stay on `feat/uiux-phase-3`. Do not branch, do not push, do not open a PR unless the
owner asks. This work belongs on PR #12.

**Commit style:** subject + optional body. **No `Co-Authored-By`, no AI attribution footer of any
kind.** Three commits, one PR — many commits per PR is correct here.

**Do not touch:** `.env`, `.env.dev`, any `+page.server.ts`, Prisma schema, or any file not named in
§Touchpoints.

**Primary execute anchor:** this file. No supporting phase files. Sibling phase plans (phases 01-08
of the ui-ux-overhaul program) are **not** inputs to this work.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

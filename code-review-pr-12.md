# CodeRabbit review — PR #12 (UI/UX overhaul phase 03)

- PR: https://github.com/HyuseCS/HRIS/pull/12 — `feat/uiux-phase-3`
- Diff reviewed: `feat/uiux-phase-1-2...feat/uiux-phase-3` (86 files, +3094 / -1962)
- Tool: CodeRabbit CLI 0.7.5, `coderabbit review --agent -t committed --base feat/uiux-phase-1-2`
- Run in a detached git worktree, so the main checkout stayed on `feat/uiux-phase-1-2`
- Date: 2026-09-04

Two passes ran over the same diff and produced overlapping sets. Merged and de-duplicated:
**12 unique findings** — 1 major, 11 minor. Every finding below was checked against source
before being written down. One is rejected with evidence.

Severity map: **Critical** none. **Warning** = F1. **Info** = F2-F11 (F12 rejected).

---

## Warning

### F1 — Badge variants lose the leading dot (`src/app.css:152-177`)

CodeRabbit: `@apply badge` copies the declarations of `.badge`; it does not make
`.badge-green::before` match `.badge::before`. `Badge.svelte` renders only
`class="badge-{resolved.tone}"`, so the dot pseudo-element never applies.

**VERIFIED.** `src/lib/components/ui/Badge.svelte:27` renders
`<span class="badge-{resolved.tone}">`. `.badge::before` is a separate rule and is not
copied by `@apply`. The in-file comment at `src/app.css:163` claims the opposite:
"`badge` stays FIRST in each rule: it carries the pill layout and the leading dot."
The layout declarations do carry over; the dot does not.

Fix, either one:
- render `class="badge badge-{resolved.tone}"` in `Badge.svelte`, or
- widen the selector: `.badge::before, .badge-green::before, …`.

The comment at `src/app.css:163` needs correcting whichever way you go.

---

## Info

### F2 — Dialog can be built with no accessible name (`src/lib/components/ui/Dialog.svelte:18-21`, `133-134`)

`title` and `labelledBy` are both optional in `Props`. A consumer that passes neither gets a
dialog with no `aria-label` and no `aria-labelledby`.

**LATENT, not live.** All 7 current call sites supply one:
`settings/roles/+page.svelte:258` (`labelledBy`), `TimesheetModal.svelte:277`,
`NewTimesheetDialog.svelte:37`, `PunchMapDialog`, `ConfirmDialog.svelte:31` and
`ReasonDialog.svelte:56` (both default `title`). The gap is that nothing stops the 8th.
Fix by making `Props` require one of the two.

### F3 — Dialog name casing does not match the visible heading (`src/lib/components/timesheets/NewTimesheetDialog.svelte:37`, `50`)

`title="New timesheet"` against `<h2>New Timesheet</h2>`. A voice-control user speaking the
visible heading does not hit the accessible name.

**VERIFIED, but do not change it blindly.** Two e2e specs match the lowercase form:
`tests/e2e/timesheet-create-for-employee.spec.ts:74` and
`tests/e2e/manager-org-wide-timesheets.spec.ts:79` both use
`getByRole('dialog', { name: 'New timesheet' })`. Change the title and those two specs
must change with it.

### F4 — S1-S5 report: file count does not match its own list (`…/phase-03-design-system-s1-s5_REPORT_03-09-26.md:31-37`)

Heading says 36 files. The list is 6 created + `src/app.css` + 10 S4 files + 20 S5 files
+ 9 e2e specs = **46**. **VERIFIED.**

### F5 — S1-S5 report: defect 3 contradicts itself (`…s1-s5_REPORT…:100-101`)

The heading says `RETURNED` "was two different colours", then the evidence names
"orange on `/leave`, orange on `/requests`". **VERIFIED** — both read orange.
Name the real second colour.

### F6 — S13-S17 report: S16 file count conflicts (`…s13-s17_REPORT…:33` vs `:111`)

Summary table row says **23** files, section heading says **22**. **VERIFIED.**

### F7 — S13-S17 report: PageHeader "every page" claim (`…s13-s17_REPORT…:279`)

"Before" column counts 61 `(app)` pages, "Now" reports 59 files, prose says "every page".
61 pages with 59 files means not every page adopted it. Report pages-converted and
files-importing as two separate numbers.

### F8 — Backlog note uses the `plan:` prefix (`…/backlog/phase-03-responsive-sweep_NOTE_03-09-26.md:2`)

`name: plan:phase-03-responsive-sweep` on a file named `_NOTE_` whose own description calls
it a backlog stub. **VERIFIED** — the sibling note
`phase-03-residual-dark-only-colours_NOTE_03-09-26.md:2` uses `name: note:…`.

Fix: `name: note:phase-03-responsive-sweep`

### F9 — Responsive-sweep note merges two relocation patterns (`…responsive-sweep_NOTE…:27-30`)

The bullet says ten pages landed on an existing filter toolbar via `ml-auto`, then names
three (`employees`, `team`, `attendance`). **VERIFIED.** The S13-S17 report separates them:
pattern 1 is those three; pattern 3 is a new right-aligned row on ten. The wrapped-`ml-auto`
risk applies only to the three, so the 390px pass needs the split stated correctly.

### F10 — Dark-only-colours note: the reconciliation does not add up (`…residual-dark-only-colours_NOTE…:37-41`)

Plan counted 31 occurrences. The note finds 24 unpaired, then accounts for 5 already-paired
plus 0 in `ApplicantKanban.svelte` = **29**, not 31. **VERIFIED.** Two occurrences are
unexplained — name them, or say the plan's 31 was wrong.

### F11 — Dark-only-colours note contradicts itself on status pills (`…residual-dark-only-colours_NOTE…:13` vs `:59`)

Line 13: "None of them is a status pill." Line 59: "Most of these are decorative or
muted-icon uses rather than status pills" — which allows some to be pills. **VERIFIED.**
The fixing advice depends on the answer.

---

## Rejected

### F12 — "The e2e casing commit hash disagrees with the S1-S5 report" — FALSE

CodeRabbit flagged `…s6-s12_REPORT…:86` crediting `3143112` against
`…s1-s5_REPORT…:26` recording `099c734`, and inferred one is wrong.

**Both commits exist and are different commits:**

- `099c734` — "S5 test(e2e): match status text case-insensitively after the Badge sweep"
- `3143112` — "test(e2e): match the Returned status label case-insensitively"

The reports are consistent. No change needed.

---

## Suggested order

1. F1 — the only user-visible defect. Fix the render or the selector, and fix the comment.
2. F3 — one-line change plus two e2e locators, or leave it and drop the finding.
3. F2 — a `Props` type change, no runtime effect today.
4. F4-F11 — documentation accuracy. These reports drive your deferred owner test pass, so
   the wrong counts and the contradictory statements cost time later.

## Notes on the run

- CodeRabbit caches by diff. A repeat review of an unchanged diff returns `findings: 0`; that
  is a cache hit, not a clean bill. Stored findings replay with `coderabbit review findings`
  run from inside the reviewed directory.
- Free CLI allowance was used — `HyuseCS/AVIPA` is not connected to a CodeRabbit org.

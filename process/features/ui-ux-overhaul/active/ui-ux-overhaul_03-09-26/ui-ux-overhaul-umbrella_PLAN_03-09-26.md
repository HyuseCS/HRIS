---
name: plan:ui-ux-overhaul-umbrella
description: "Umbrella orchestration plan for the 8-phase Veent HRIS UI/UX overhaul — reorganization and convergence of nav, kit, confirms, feedback, surfaces, page structure, copy and a11y. Not a visual redesign."
date: 03-09-26
feature: ui-ux-overhaul
phase: umbrella
---

# Veent HRIS UI/UX Overhaul — Umbrella Orchestration Plan

**Date**: 03-09-26
**Status**: PLANNED
**Complexity**: COMPLEX (phase program, 8 phases)
**Feature**: ui-ux-overhaul

**TL;DR** — The audit scored the system 19/40. The fix is reorganization and convergence, not a
redesign. Eight phases, each independently shippable, in a fixed order. Phase 3 builds the shared
primitives that phases 4 and 5 consume. Phase 8 is last. Brand, tokens, and the 10 strengths in
audit §5 are untouchable.

---

## Program Goal Charter

```text
# Veent HRIS UI/UX Overhaul — Program Goal Charter

North star:
- Make the 63-page HRIS read as one app instead of a different app on every click, by
  reorganizing navigation and converging every page onto shared primitives — with zero
  change to the brand, the HSL token system, or any authorization behavior.

Definition of done:
- The sidebar is sectioned, labels are canonical, and MANAGER no longer sees the admin nav.
- Every status pill, banner, dialog, empty state, page header and table on the system comes
  from src/lib/components/ui/ — no per-page statusClass copies, no hand-rolled modals.
- Every irreversible or money/person-affecting action passes through a confirm with a
  consequence-naming message; no native confirm() remains.
- Every mutating action returns { action, error?, saved? }; every form renders its own scoped
  error with role="alert"; every success reports.
- Duplicate surfaces are resolved to one canonical door; the three monster pages have internal
  navigation; no raw enum reaches a user.

What "verified" means (program level):
- Per phase: the full CI gate set green on the branch — pnpm format:check && pnpm lint &&
  pnpm check && pnpm test — plus an impeccable audit pass for any phase touching UI, plus a
  live spot-check in the running app for any phase with visible change.
- A phase without its phase report and validate-contract recorded is NOT verified, even if the
  gates are green. Code-only completion is CODE DONE.

Scope tiers -> phase mapping:
- Tier 1 showstoppers      -> Phase 1
- Tier 2 structure         -> Phases 2, 3
- Tier 3 feedback + safety -> Phases 4, 5
- Tier 4 convergence       -> Phases 6, 7, 8
- This program retires Tiers 1-4.

Explicitly out of scope (deferred):
- Any visual redesign: new palette, new type scale, new spacing system, new logo.
- New product features, new pages, new capabilities, new roles.
- Schema or Prisma changes; service-layer business logic changes.
- Fixing the e2e suite's known flakiness (#287) beyond keeping it no worse.
- New npm dependencies of any kind without explicit owner approval.

Hard safety constraints (non-negotiable, per phase):
- Never change what a role can DO. Nav visibility and server guards must keep reading the same
  src/lib/rbac.ts capability table. Narrowing nav visibility is allowed; widening reach is not.
- MANAGER must never gain org-wide reach. Every nav gate change is verified against the route's
  own server guard before it ships.
- Masked-field and audited-reveal flows (#111, #290) keep their exact behavior. Presentation may
  converge; the mask, the reveal, and the audit row may not move.
- Never touch prisma/schema.prisma, never run db push, never mutate the droplet.
- No new npm dependency without owner approval.
- Keep process/plan commits separate from execution commits; commit each phase before the next.
```

---

## Stable Program Goal

Copy-pasteable `/goal` block for a long-running session on this program.

```text
TARGET: Veent HRIS UI/UX overhaul — 8 phases, reorganization and convergence only, NOT a
visual redesign. Umbrella: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/
ui-ux-overhaul-umbrella_PLAN_03-09-26.md. Research artifact: docs/ui-ux-audit-2026-09-03.md
(commit 2f89ba9, score 19/40). Order: 01 p0-fixes, 02 nav-ia, 03 design-system,
04 feedback-contract, 05 destructive-actions, 06 surface-consolidation, 07 page-splits,
08 copy-a11y.

PER-PHASE LOOP (7 steps, SKIPS SPEC — the umbrella governs every phase):
1 RESEARCH (staleness-check the audit's file paths and line numbers against current code)
2 INNOVATE 3 PLAN-SUPPLEMENT 4 PVL 5 EXECUTE 6 EVL 7 UPDATE-PROCESS.
PVL is never skipped. A placeholder validate-contract counts as BLOCKED, not as a contract.
Every subagent's FIRST ACTION: vc-context-discovery + vc-plan-discovery.
At every phase END: invoke vc-agent-strategy-compare for the next phase.
Test tiers are named: automated / hybrid / agent-probe.

HARD STOPS (ask the owner, do not proceed):
- Any change to src/lib/rbac.ts, prisma/schema.prisma, or src/lib/server/services/**.
- Any new npm dependency.
- Starting ./start.sh, the vite dev server, or the veent-db-5434 container — the owner starts
  servers. Driving an already-running app is fine.
- git push, or any history rewrite on a pushed branch.
- Scope that grows past the phase plan's Touchpoints.

SAFETY:
- Never widen what a role can do. Nav visibility and server guards keep reading the same
  capability table. MANAGER must never gain org-wide reach.
- Masked-field and audited-reveal flows are behavior-frozen.
- Brand, the HSL tokens, and per-tenant theming stay. The only new color values are
  light/dark pairs fixing broken ones.
- The audit §5 do-not-break list survives every phase.
- Minimal diffs: every changed line traces to a named audit finding.
- Commit each phase before the next. Process/plan commits stay separate from execution
  commits. Never add a Co-Authored-By trailer.

TEST GATES (per phase, in this order — CI runs format first and skips the rest on failure):
- pnpm format:check
- pnpm lint
- pnpm check
- pnpm test
- npx playwright test (e2e must be no worse than baseline; #287 flakiness is known)
Plan artifacts:
- node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs <plan>
- node .claude/skills/vc-generate-phase-program/scripts/validate-umbrella-artifact.mjs <umbrella>
Plus: impeccable audit pass (every phase touches UI) and a live spot-check in the running app
for every phase with visible change.

VALIDATE CONTRACT: written per phase by vc-validate-agent into that phase's plan file before
EXECUTE. No phase reaches VERIFIED without its contract, its gates, and its report.

START: Phase 1 (p0-fixes), loop step 1 RESEARCH, against
phase-01-p0-fixes_PLAN_03-09-26.md. All eight phase plans already exist — do not re-create them.
Outer PVL across the eight plans comes first.
```

Character count of the block above: under the 4000-char `/goal` ceiling.

---

## Durable Report Destinations

Everything lives FLAT in `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/`.
No per-phase subfolders. The whole folder moves to `completed/` as a unit.

| Artifact | Path |
|---|---|
| Umbrella plan | `ui-ux-overhaul-umbrella_PLAN_03-09-26.md` (this file) |
| Phase plans | `phase-0N-{slug}_PLAN_03-09-26.md` |
| Phase reports | `phase-0N-{slug}_REPORT_{date}.md` |
| Blast-radius registry | `phase-blast-radius-registry.md` |
| References | `{slug}_REF_{date}.md` |

The audit itself stays at `docs/ui-ux-audit-2026-09-03.md` — it is committed source, not a
program artifact, and must not be moved or edited by any phase.

---

## Overview / Program Context

- **RESEARCH artifact:** `docs/ui-ux-audit-2026-09-03.md`, committed as `2f89ba9`. It is the
  single upstream source for every phase. Phases consume named sections of it; they do not
  re-derive findings.
- **Method caveat carried forward:** the audit was source-only — no browser was available. Purely
  visual claims (rendered contrast, spacing, responsive breakage) are inferred. Every phase with
  visible change owes a live spot-check.
- **Score:** 19/40 (revised down from 20/40 by the addendum, which dropped heuristic 9 to 2).
  Weakest heuristic is #4 Consistency at 1/10 — that is what this program is aimed at.
- **Goal:** reorganization and convergence. **Not** a visual redesign. Brand, the 43 HSL tokens in
  `src/app.css`, per-tenant accent theming, and the pre-paint bootstrap all stay as they are.
- **The exception:** the one place new color values are written is fixing light-mode pairs
  (`text-green-700 dark:text-green-400`) and `.badge-gray`. That is correcting a broken token
  application, not a new palette.

---

## Do-Not-Break List (audit §5, verbatim)

Every phase re-reads this list before it starts. A change that damages any item is a phase failure,
not a tradeoff.

1. **Nav visibility and server authorization read the same capability table** (`$lib/rbac`), with per-item comments citing the issue that shaped each rule. The "shown but 403s" bug class is structurally prevented. Any nav regroup must keep this.
2. **Double-submit discipline is systemic** — per-row memoised guards with in-flight labels on every mutating form, with comments naming the duplicate they prevent.
3. **The masked-reveal flow** — server-side masking, single audited reveal, "recorded in the audit log" on the button, post-reveal format-check chips, salary-band badge only on real figures.
4. **One renderer, two modes** for evaluations — the builder preview and the evaluator's real form are the same component, so the preview cannot lie; code-level defense of the no-arithmetic rule.
5. **The blocked-approver pattern** (`payroll/[id]:427-448`) — visible, `aria-disabled`, always-visible reason, with a comment explaining why native `disabled` fails. Best-in-class; should become the kit standard.
6. **The punch page** — honest geolocation copy, split `role="status"`/`role="alert"`, location-failure-never-loses-the-punch carried through UI, copy, and no-JS fallback.
7. **Decision-ready detail pages** — request detail's attempt-grouped timeline, leave-balance ledger, removed-documents audit panel; approver cards with waiting-time, coverage shortfall, and unverified-doc chips.
8. **Honest dead-end copy** — "Used by N reviews — deactivate instead of deleting"; the redacted-subject explanation; offboarding/posting-approver setting descriptions.
9. **The token system** — full HSL set in both themes, pre-paint bootstrap, per-tenant theming, documented micro-decisions (44px coarse-pointer floor).
10. **Team attendance matrix and the "Exceptions only" filter** — task-shaped density done right.

---

## Global Constraints (bind every phase)

**Modular**
- Shared primitives live in `src/lib/components/ui/`. Shared logic (label maps, `statusClass`,
  submit-guard factory, `waitingFor`/`isStale`) lives in `$lib`.
- No page reinvents a primitive that exists. If a page needs a variant, extend the primitive.
- Phase 3 owns primitive creation. Phases 4-8 consume; they do not fork.

**Secure**
- Nav visibility and server guards keep reading the same `src/lib/rbac.ts` capability table.
- MANAGER must never gain org-wide reach. Any nav gate moved from `MANAGE_HR` to
  `ADMINISTER_HR_ORGWIDE` is checked against the target route's own guard first.
- Masked-field and audited-reveal flows are behavior-frozen.
- No change to `requireAnyCapability` call sites, audit stamping, or the HMAC/rate-limit surfaces.

**Clean**
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`, `$bindable`).
- HSL design tokens from `src/app.css`. No hardcoded colors. Every color class ships with its
  light/dark pair.
- `pnpm`, never `npm`. **No new npm dependency without owner approval.**
- `{@const}` only as an immediate child of a block tag.

**Minimal diffs**
- Every changed line traces to a named audit finding. No adjacent "improvements", no opportunistic
  refactors, no reformatting of untouched code.
- Orphaned imports created by a change are removed; pre-existing dead code is reported, not deleted.

---

## Phase Ordering

```
  P1 p0-fixes
     |
  P2 nav-ia
     |
  P3 design-system  (shared primitives)
     |
  P4 feedback-contract   (rebuilds ConfirmButton, adds the flash + submit-feedback utils)
     |
  P5 destructive-actions (consumes the ConfirmButton rebuild + Dialog base)
     |
  P6 surface-consolidation  (depends on 04; rebases on 02's layout)
     |
  P7 page-splits            (depends on 02 + 03)
     |
  P8 copy-a11y              (last)
```

Phase 4 comes before phase 5: the destructive-action sweep consumes phase 4's rebuilt
`ConfirmButton` and the Dialog base, so routing actions into a still-silent primitive would mean
touching the same call sites twice.

## Phased Delivery Plan — The 8 Phases

Every phase plan is written as `phase-0N-{slug}_PLAN_03-09-26.md` in this same folder.
Every phase report lands as `phase-0N-{slug}_REPORT_{date}.md`, FLAT, in this same folder.

**Exit criteria are identical for every phase** unless the phase adds one:
CI gate set green — `pnpm format:check` && `pnpm lint` && `pnpm check` && `pnpm test` — plus an
impeccable audit pass (all eight phases touch UI), plus a live spot-check in the running app for
every phase with visible change (all except where noted). Phase report written. Commit checkpoint
taken.

---

### Phase 1 — `p0-fixes`

**Plan:** `phase-01-p0-fixes_PLAN_03-09-26.md`

Clear the eight showstoppers before anything moves under them. Three from the main audit: the
legacy `/approvals` route 308-redirects to `/requests` (My Requests) instead of the approval inbox
at `/requests/approvals`; the audit-log page is an orphan with zero inbound links anywhere; and the
template-builder preview can throw and blank because new rating rows mint at `value: scale.min`
while the preview keys its each-block by `row.value`. Five from the addendum: the Toaster ships
with no `aria-live`/`role="status"` so screen-reader users get zero notifications app-wide;
approve/reject, offboard, and the payroll period void/release are all silent on success; and
`employees/[id]` routes 19 of 24 action errors into a card that is hidden for offboarded employees.
Tiny diffs, disproportionate payoff, and they de-risk everything downstream.

- **Consumes:** §2 (P0-1..P0-3), addendum §B (P0-4..P0-8).
- **Entry:** none — first phase.
- **Exit:** standard gate set. Live spot-check: the `/approvals` redirect lands on the inbox; the
  audit-log card is reachable; a toast is announced; approve/offboard/void report success.

---

### Phase 2 — `nav-ia`

**Plan:** `phase-02-nav-ia_PLAN_03-09-26.md`

Restructure the sidebar and the settings/payroll information architecture. HR_ADMIN currently sees
~20 ungrouped top-level items (22 on food-service tenants) with self-service and admin interleaved
at random. Group into 4-5 labeled sections matching the HR mental model (My Work / People / Time /
Pay / Performance / Organization+Settings) — a pure array resort, the section mechanism already
exists. Fix the label collisions ("My Requests" vs "Requests", "Timesheets" twice) and the
label/route contradictions (Inquiries→`/complaints`, the Stores/Branches inversion). Give payroll
the tab sub-nav its idle `+layout.svelte` is already positioned to host. Group the 17-card settings
hub and reconcile it with the 8-item sidebar sub-nav so all 17 destinations are reachable under one
name each. Narrow the admin nav gate from `MANAGE_HR` to `ADMINISTER_HR_ORGWIDE` so a branch lead
stops seeing a 19-item HR-department sidebar — **verifying each route's own server guard first, and
never widening anyone's reach.**

- **Consumes:** §T1. Cross-check against §5 item 1.
- **Entry:** Phase 1 complete (the `/approvals` redirect and audit-log link change what nav must
  point at).
- **Exit:** standard gate set. Live spot-check as HR_ADMIN, MANAGER, and an employee: every nav
  item still resolves, nothing 403s, MANAGER's item count drops and reaches nothing new.

---

### Phase 3 — `design-system`

**Plan:** `phase-03-design-system_PLAN_03-09-26.md`

Build the shared primitives and sweep the kit onto the pages that ignore it. Two audit themes
merge here. T2: light mode is broken wherever status is shown — `text-green-400`/`yellow-400`/
`gray-400` on 15% tints across 18+ files, and `.badge-gray` is `bg-white/10 text-white/50`,
literally invisible on white. Build one Badge/StatusPill and one banner recipe with correct
light/dark pairs, then delete every inline `statusClass` copy. T4: `PageHeader`, `EmptyState`,
`Table`, and `Toaster` exist and are barely adopted — sweep them across the hand-rolled `<h1>`s,
the bare `colspan` empty cells, and the money tables missing `tabular-nums`. Lift the focus trap
into one shared Dialog primitive so the five modal implementations collapse to one correct one, and
promote the blocked-approver pattern (§5 item 5) to the kit standard. Extract the repeated per-page
logic — `statusClass`, `typeLabels`, `waitingFor`/`isStale`, the submit-guard factory implemented
three ways, the ~150-char input class string — into `$lib`. **This phase is the foundation for
phases 4-8; nothing downstream may fork a primitive it defines.**

- **Consumes:** §T2, §T4. Cross-check against §5 items 2, 5, 9.
- **Entry:** Phase 2 complete (nav settles which pages exist under which shell).
- **Exit:** standard gate set. Live spot-check in **both** light and dark mode: every status pill
  and banner readable, no invisible gray badge, all five former modals trap focus and honor Escape.

---

### Phase 4 — `feedback-contract`

**Plan:** `phase-04-feedback-contract_PLAN_03-09-26.md`

Apply the addendum's single feedback contract everywhere. Of ~165 mutating actions across 53 server
files, only ~29% give a correctly-placed success signal, toast adoption is ~4%, `fail()` is called
305 times in 5 payload shapes, and ARIA on feedback is about 1 in 6. The contract, from §H: every
action returns `{ action, error?, saved? }`; every form renders its own scoped error with
`role="alert"`, scrolled into view on long pages; every success fires a toast (Toaster gains
pause-on-hover and a used error variant); `ConfirmButton` is rebuilt to wait for
the result and report it — fixing that one primitive is what makes Phase 5's confirm sweep a one-touch
change; redirects carry a flash message the destination renders; and the raw `e.message` fallback (13 sites, 8 files — it
catches Prisma errors and can dump internals into a banner) plus the `markAllRead` overreach (which
silently burns unread notifications past the tenth) are deleted. Add the missing `handleError` hook
so an unexpected failure returns a reference ID. Wire the four silent-failure surfaces, the 14+ dead
success flags, and add `{:catch}` to all four `{#await}` blocks. Copy the in-repo standards named in
§G rather than inventing new ones.

- **Consumes:** addendum §B through §H, plus §T7. (§B's P0s already landed in Phase 1 — this phase
  generalizes the fix.) Concretely: the `submitFeedback` util on `createSubmitGuard`, the cookie
  flash util, the `ConfirmButton` result-waiting rebuild, the `handleError` hook, the `e.message`
  leak fix, and the toast-adoption sweep. Cross-check against §5 item 6 (the punch page is the model, do not disturb it).
- **Entry:** Phase 3 complete (Toaster/banner primitives, Dialog base).
- **Exit:** standard gate set. Live spot-check: a success and a failure on approve, offboard, period
  void, and a long-page form — each announced, scoped, and scrolled into view.

---

### Phase 5 — `destructive-actions`

**Plan:** `phase-05-destructive-actions_PLAN_03-09-26.md`

Apply one confirm rule to the inverted-protection table in §T3: anything irreversible or
money/person-affecting goes through `ConfirmButton`/`ConfirmDialog` with a consequence-naming
message. Today low-stakes deletes get the kit confirm while offboarding a person, voiding a period,
overriding net pay, saving DOLE multipliers, confirming org-wide statutory rates, releasing a review
to an employee, and deactivating a login all fire on one bare click. The statutory-rates Confirm
additionally lacks the double-submit guard that is universal everywhere else (§5 item 2) — add it.
Replace both remaining native `confirm()` calls (separation finalize/undo, attendance reset) with
the kit dialog. This phase consumes Phase 4's rebuilt `ConfirmButton` and Phase 3's Dialog base,
so every action routed here reports its own result the moment it is routed — one touch per call site, not two.

- **Consumes:** §T3 (the full table). Cross-check against §5 items 2, 5.
- **Entry:** Phases 3 and 4 complete (needs the Dialog base with the focus trap, and the
  `ConfirmButton` that waits for and reports its result).
- **Exit:** standard gate set. Live spot-check: each row of the §T3 table shows a dialog naming the
  consequence; zero native `confirm()` remain in `src/`.

---

### Phase 6 — `surface-consolidation`

**Plan:** `phase-06-surface-consolidation_PLAN_03-09-26.md`

Per duplicate pair, pick one canonical surface and redirect or link the other. An approver has four
separate inboxes (`/requests/approvals`, `/requests/timesheets`, `/requests/proposals`, `/payroll`)
with no combined "awaiting me" view and no summed badge. There are two live leave-filing forms of
unequal quality, three punch→timesheet doors each speaking a different period vocabulary, two
parallel payroll lifecycles (runs vs periods) with nothing explaining how they relate while a period
row's "Detail" silently jumps into a run, emergency-contact data in three places on the employee
page, and three overlapping edit forms touching title/position/rate where picking the wrong one
silently bypasses the audited career event. That last one is the highest-risk item in the phase —
consolidating it must not weaken the audited path.

- **Consumes:** §T5. Cross-check against §5 items 3, 7.
- **Entry:** Phase 4 complete (consolidated surfaces must land on the feedback contract, not be
  built and then re-swept). Rebases on Phase 2's layout.
- **Exit:** standard gate set. Live spot-check: each retired door redirects or links to the canonical
  one; the combined approvals count matches the sum of the four inboxes; the audited career event
  still fires on a salary change.

---

### Phase 7 — `page-splits`

**Plan:** `phase-07-page-splits_PLAN_03-09-26.md`

Give the monster pages internal navigation. `employees/[id]` is 1,813 lines with ~16 stacked
sections and ~20 POST forms, no tabs and no anchor nav — HR's most-used page, where finding
"Documents" means scrolling past loans, deductions and two salary forms every time; split into
Overview / Compensation & Payroll / Documents / History / Actions with the danger zone isolated,
highest traffic so it goes first. `attendance` is 904 lines serving three personas at once — split
the employee self-view from the HR correction grid, group read actions away from destructive ones,
and put the import behind a disclosure. `settings/org` is two apps on one page: a positions catalog
plus a per-employee assignment table with no search or pagination, which is a wall of dropdowns at
100+ employees. `employees/new` shows 26 fields with only 9 required and nothing saying what is safe
to skip — split into "Required to hire" and a collapsed "Complete later". This phase also owns the
`<select multiple size=4>` supervisor picker on `employees/[id]:400-417` (audit §T8) — unusable on
touch, and one wrong click clears the selection; rework it to a checkbox list. It lands here rather
than in Phase 8 because it sits inside the section split this phase is already rewriting. Add
Pagination to the
unbounded lists (separations, inventory, employee-side complaints).

- **Consumes:** §T6, plus the supervisor-picker item from §T8. Cross-check against §5 item 10 (the attendance matrix and Exceptions-only
  filter survive the persona split intact).
- **Entry:** Phases 2 and 3 complete (the split pages must land on the final nav shell and the
  shared primitives).
- **Exit:** standard gate set. Live spot-check: every one of the ~20 employee-page forms still
  submits from its new tab and reports its own result; no section became unreachable.

---

### Phase 8 — `copy-a11y`

**Plan:** `phase-08-copy-a11y_PLAN_03-09-26.md`

Last phase, because copy and semantics should be applied to the final structure, not re-applied
after every move. Two themes. T9: raw enums reach users as copy (`TERMINATION` next to a person's
name, `SELF_ASSESSMENT`, `PENDING_APPROVAL`) — build label maps for requests and separations,
following the ones recruitment and complaints already have. The login page is branded "Avipa" —
logo, title, footer — while the app is Veent HRIS everywhere, and login step 1 enumerates every
tenant org to anonymous visitors, which is a customer-list disclosure. Stop asking employees to type
`contactAddress`. Fix the applicant-voice copy on an HR-only form, the "Last, First"/"First Last"
flip on one page, and the Review/Detail verb split. Remove the `DevLoginSwitcher` that is on staging
carrying a "TEMP DEV — remove before merge" comment. T8: replace `role="link"` on `<tr>` (which
destroys row semantics) with the pattern the leave page already uses, add focus trap/restore and
Escape to the mobile drawer and the org-switcher popover, give the color-only signals text
equivalents, and add `aria-current` and an `aria-label` to the nav. The `<select multiple size=4>`
Ctrl-click supervisor picker is **not** this phase's — it is owned by Phase 7, which restructures
the page it sits on (`employees/[id]`).

- **Consumes:** §T8, §T9, §6 (the three persona red-flag lists). Cross-check against §5 items 6, 8.
- **Entry:** Phases 2 and 7 complete (nav labels and page structure must be final before canonical
  copy is written onto them).
- **Exit:** standard gate set. Live spot-check with keyboard only: tab through the drawer, the
  org switcher, and a data table; the login page reads Veent HRIS and lists no tenant orgs.

---

## Per-Phase Loop

Every phase runs this loop. No phase skips a step.

1. **Research-refresh** — re-read the phase plan, the audit sections it consumes, and the
   do-not-break list. Run a staleness check: do the cited file paths and line ranges in the audit
   still match the current code? The audit is dated 03-09-26 and earlier phases will have moved
   lines. Record every drift in the phase plan before touching code.
2. **EXECUTE approval by owner** — present what changed since planning, the risks, and the exact
   gates. Wait for the owner's go-ahead. This gate is not standing-granted for this program.
3. **`vc-execute-agent`** — implement only this phase's scope. Run the phase's test gates per
   checklist section, not batched at the end. Stop if the work stops matching the approved plan.
4. **`vc-tester` + impeccable audit** — full CI gate set (`pnpm format:check`, `pnpm lint`,
   `pnpm check`, `pnpm test`, in that order — CI runs format first and skips the rest, so a green
   `pnpm check` proves nothing about CI), then the impeccable audit pass, then the live spot-check
   in the running app. Never start the dev server or the DB container — ask the owner.
5. **Report** — write `phase-0N-{slug}_REPORT_{date}.md` FLAT in this folder: commands run,
   outcomes, deviations, regressions checked, known gaps, and a Forward Preview for the next phase.
6. **Commit checkpoint** — commit the execution changes via `vc-git-manager` before the next phase
   starts. Process/plan commits stay separate from execution commits. No `Co-Authored-By` trailer.

Regression rule: from Phase 2 onward, every phase re-checks the shared surfaces it overlaps —
minimally, that nav still resolves for HR_ADMIN / MANAGER / employee, and that the masked-reveal
flow still masks, reveals once, and writes its audit row.

---

## Blast Radius Registry

One registry for the whole program: `phase-blast-radius-registry.md`, FLAT in this folder. It does
**not** exist yet — it is created at first execution, by the first agent that needs to claim an
area, as an append-only file with one `## Phase N` section per phase. Every later phase appends its
claim; nobody overwrites. Overlap is expected here (phases 3-8 all touch
`src/lib/components/ui/` and `src/routes/(app)/employees/[id]/`), so the registry's job is to make
the overlap visible and sequenced, not to prevent it.

---

## Program Status Table

| Phase | Slug | Plan status | Validation status |
|---|---|---|---|
| 1 | p0-fixes | PLANNED | contract written — **CONDITIONAL** |
| 2 | nav-ia | PLANNED | contract written — **CONDITIONAL** |
| 3 | design-system | PLANNED | contract written — **CONDITIONAL** |
| 4 | feedback-contract | PLANNED | contract written — **CONDITIONAL** |
| 5 | destructive-actions | PLANNED | contract written — **CONDITIONAL** |
| 6 | surface-consolidation | PLANNED | contract written — **BLOCKED → supplement in progress** |
| 7 | page-splits | PLANNED | contract written — **CONDITIONAL** |
| 8 | copy-a11y | PLANNED | contract written — **CONDITIONAL** |

All eight phase plan files exist in this folder (`phase-01-p0-fixes_PLAN_03-09-26.md` through
`phase-08-copy-a11y_PLAN_03-09-26.md`), and **all eight now carry a written validate-contract**.
Seven gates are CONDITIONAL; phase 06 came back BLOCKED and is in a supplement cycle. Nothing has
been executed. The blast-radius registry does not exist yet — it is created at first execution.

---

## Current Execution State

- **Position:** all nine plan artifacts written (umbrella + 8 phase plans). Nothing validated,
  nothing executed, no code changed.
- **Validation:** outer PVL has run. All eight validate-contracts are written — 7 CONDITIONAL,
  phase 06 BLOCKED and in a supplement cycle.
- **Next step:** close phase 06's supplement cycle, then start phase 01 EXECUTE.
- **Next execution:** Phase 1, `p0-fixes`
  (`phase-01-p0-fixes_PLAN_03-09-26.md`). It has no entry dependency.
- **Branch:** `staging`, clean at `5e5cdfe`.

## Phase Loop Progress

| Phase | R | I | P | PVL | E | EVL | UP |
|---|---|---|---|---|---|---|---|
| 1-8 | — | — | — | — | — | — | — |

## Pre-PVL Conflict Resolution

Filled by the orchestrator 03-09-26, before outer PVL. Every cross-plan conflict found while the
eight phase plans were written is resolved below. No conflict is left open.

### Resolved conflicts

| # | Conflict | Classification | Resolution |
|---|---|---|---|
| 1 | Supervisor picker (`<select multiple size=4>`, `employees/[id]:400-417`) claimed by both 07 and 08 | reassign | **Phase 07 owns it.** Phase 08 and this umbrella updated 03-09-26 to disown it. |
| 2 | Phase 04/05 dependency inversion carried over from INNOVATE | reassign | **Phases swapped.** 04 = feedback-contract, 05 = destructive-actions. Reflected in the ordering diagram, entry criteria, status table, touchpoints, and the `/goal` block. |
| 3 | `leave/new` claimed by both 04 and 06 (04 fixes it, 06 deletes the route) | parallel-safe in order | **Phase 04 keeps its `e.message` fix at `leave/new:81`** and re-points its no-JS flash gate at **separations create** — `requests ?/create` returns instead of redirecting, so it cannot carry a flash; `/requests` serves as the no-JS non-flash control. **Phase 06 S2 deletes the route afterward.** Dated 03-09-26. |

### Shared-file ordering (parallel-safe only in the stated order)

**`src/routes/(app)/+layout.svelte`** — four phases touch it. Required order: **01 → 02 → 06 → 07**.

- **Phase 01** edits it first: it adds `reportsChildren` plus an `{:else if}` arm inside the same
  nav loop (the audit-log link, P0-2).
- **Phase 02 owns the restructure** and must **carry phase 01's arm forward** into the sectioned
  shape — phase 02's plan now carries that carry-forward rule explicitly.
- **Phase 06** edits it after 02, for the summed approvals badge.
- **Phase 07** edits it after 02, for the settings children sourced from
  `$lib/settings-destinations.ts`.
- 06 and 07 both rebase on the shape 02 lands. Because execution is strictly sequential, the phase
  order enforces all of this — no additional coordination is needed.

### Shared-primitive contract

**`src/lib/components/ui/ConfirmButton.svelte`** — one owner, one rebuild:

- **Phase 03 deliberately does NOT edit it.** It is left untouched as a compile canary — if the
  Dialog-base work in 03 breaks `ConfirmButton`, `pnpm check` says so immediately.
- **Phase 04 owns the rebuild**, and freezes its public API on the way out.
- **Phase 05 consumes it** against that frozen API.
- Phase 04's `ConfirmButton` spec includes a **`triggerTitle` prop**, consumed by phase 05.
- Any validate finding that proposes editing `ConfirmButton` inside phase 03 or phase 05 is a
  **contract violation**, not a gap. Reject it and route the concern to phase 04.

**`src/lib/components/ui/ConfirmDialog.svelte`** — a different owner from `ConfirmButton`:

- **Phase 03 owns it** (its S7 rewrite).
- **Phase 04 does NOT edit it.** Phase 04 uses the `$bindable` re-open workaround instead —
  binding instruction **E1** in its validate-contract.

### Stale-audit corrections accepted program-wide

Surfaced by the phase plans while re-reading the audit against current code. These correct the
audit; the audit file itself is not edited.

| Correction | Raised by |
|---|---|
| The net-pay override server-side `min` already exists — the audit's "negative values allowed" claim is stale | 05 |
| The statutory-rates editor already has a `ConfirmDialog`; the real gap is the submit-for-approval path | 05 |
| `DevLoginSwitcher` does not render on staging — the audit's "already on staging" claim is stale | 08 |
| The MANAGER nav-gate flip is a **server-guard** change, not a nav-only one — routed to backlog as an OWNER-DECISION rather than executed inside 02 | 02 |

### Open owner-decisions registry (consolidated post-validation)

Every open decision surfaced by the eight validate-contracts. "Blocking" means execution cannot
complete without the owner's answer; everything else has a default the validator already applied.

| Decision | From | Blocking? | Default / fallback |
|---|---|---|---|
| MANAGER / `ADMINISTER_HR_ORGWIDE` guard alignment across **14 routes** (raised by 02, echoed by 01's audit-log MANAGER-exposure OD) | 02, 01 | **No** — but it **needs its own SPEC** | Phase 01 ships with a MANAGER probe arm; the guard flip is not executed inside this program |
| Stores/Branches noun ruling | 02 → 08 | **Yes — blocks phase 08 item 14 only** | Phase 02 keeps the tenant split. Fallback: ship phase 08 S2 without item 14 |
| Login tenant enumeration (customer-list disclosure) | 08 | No | Unbuilt by design; default option is **email-first** |
| `DevLoginSwitcher` removal timing | 08 | No | Default: **remove after the live gate** |
| Phase 03 OD defaults (applied by the validator) | 03 | No | `green-800` contrast steps with **no token change**; AC-7 scoped with **31 residuals backlogged**; all **39 `h1` conversions in-phase** under a STOP rule |
| Reveal-survives-save posture | 07 | No | **Accept**, with the B5a per-employee-key hard gate + G13 |
| Sidebar settings subset | 07 | No | **Curated subset via an `inSidebar` field** |
| Complaints page size | 07 | No | **10** |
| Dead `employees`-list offboard action | 04 | No | **Delete it** |

### Blast-radius registry

Still uncreated, by convention — the first EXECUTE creates it. Phases 04 and 07 carry inline
blast-radius claims in their plan files; those must be transcribed into
`phase-blast-radius-registry.md` at that point.

### Format and CI facts (carry into every phase)

- **`docs/ui-ux-audit-2026-09-03.md` was reformatted at `cb7d830`**, so `pnpm format:check` is green
  on the current tree. Do not re-baseline against the pre-`cb7d830` state.
- **A dev server may be live during EXECUTE, and `pnpm check` kills it.** Baseline the gates
  accordingly — this is binding instruction **E1** in phase 01's validate-contract. The owner
  starts servers; never relaunch one to "fix" this.

### Backlog artifacts on disk

Written by the validators, in `process/features/ui-ux-overhaul/backlog/`:

| Artifact | Path |
|---|---|
| Raw-enum sweep — remaining enums | `raw-enum-sweep-remaining-enums_NOTE_03-09-26.md` |
| A11y component-test harness | `a11y-component-test-harness_NOTE_03-09-26.md` |
| Component-test DOM environment | `component-test-dom-environment_NOTE_03-09-26.md` |
| Dashboard pending-approvals wrong target | `dashboard-pending-approvals-wrong-target_NOTE_03-09-26.md` |

---

## Touchpoints

- `src/routes/(app)/+layout.svelte` — the nav (phases 2, 5, 8)
- `src/lib/components/ui/**` — the kit (phases 3, 4, 5)
- `src/app.css` — badge classes and the scrollbar hardcode (phase 3 only; tokens untouched)
- `src/routes/(app)/**/+page.svelte` and `+page.server.ts` — 63 pages (phases 1, 3, 4, 5, 6, 7, 8)
- `src/hooks.server.ts` — the missing `handleError` hook (phase 4)
- `src/lib/rbac.ts` — **read-only across the whole program.** No phase edits it.
- `prisma/schema.prisma`, `src/lib/server/services/**` — **out of bounds.**

## Public Contracts

- **Form action return shape** — phase 4 standardizes on `{ action, error?, saved? }` across ~165
  actions. This is the program's one real contract change; every consuming template must move with
  it, per action, not in bulk.
- **UI kit component props** — phase 3 defines Badge/StatusPill, the banner, and the Dialog
  base; phase 4 rebuilds `ConfirmButton` on top of it. Phases 4-8 are consumers and must not change these props without amending phase 3.
- **URL surface** — phases 1, 2 and 6 change redirects and canonical routes. Every retired route
  keeps a redirect; none is deleted.
- **Capability table** — unchanged. Nav gates may narrow to an existing capability; no capability
  is added, removed, or re-scoped.

## Blast Radius

Program-wide: ~105 `.svelte` files, 63 pages, 3 layouts, 53 server files, one CSS file. Risk class:
**high by aggregate, low per change** — no schema, no service logic, no capability changes, but the
nav gating (phase 2) and the action-return contract (phase 5) each touch authorization-adjacent and
every-page surfaces respectively. Phases 2 and 4 are the two that can break things invisibly.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check && pnpm lint && pnpm check && pnpm test` green, in that order | Fully-Automated | Every phase exit criterion: the CI gate set passes |
| Existing Playwright e2e suite no worse than baseline | Fully-Automated | Nav and route changes (phases 1, 2, 6) did not break a working flow |
| Live spot-check in the running app, light and dark mode, per phase | Agent-Probe | Visual and interaction claims the source-only audit could not verify |
| Keyboard-only walk: drawer, org switcher, modals, data tables | Agent-Probe | Phase 3 focus traps and phase 8 a11y criteria |
| Role walk as HR_ADMIN / MANAGER / employee after phase 2 | Hybrid (needs running app + seeded roles) | MANAGER gained no reach; nothing 403s that is shown |
| Masked-reveal walk: mask holds, reveal once, audit row written | Hybrid (needs running app + DB) | Do-not-break item 3 survived every phase |
| impeccable audit pass per UI phase | Agent-Probe | Design-quality bar the CI gates cannot express |

Per-phase tier assignments are **not** finalized here. Each phase plan runs `vc-test-coverage-plan`
against `process/context/tests/all-tests.md` and its routing chain, and carries its own gate matrix.
This umbrella's table is the program-level floor, not a substitute.

## Test Infra Improvement Notes

(none identified yet)

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md`
2. **Last completed step:** umbrella plan and all eight phase plans written. No code changed.
3. **Validate-contract status:** all eight phase contracts written (7 CONDITIONAL, 06 BLOCKED
   → supplement in progress). The umbrella's own `## Validate Contract` stays a placeholder.
4. **Context files loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/development-protocols/phase-programs.md`, `.claude/skills/vc-generate-phase-program/references/program-goal-charter-template.md`, `docs/ui-ux-audit-2026-09-03.md`.
5. **Next step for a fresh agent:** plans and contracts both exist — do not re-create either.
   Read `## Pre-PVL Conflict Resolution` above first; it carries the ownership rules that override
   any single phase plan. Close phase 06's supplement cycle, then start Phase 1 EXECUTE against
   `phase-01-p0-fixes_PLAN_03-09-26.md` and its contract.

---

Plan complete. Review carefully. Say **'ENTER VALIDATE MODE'** when ready to proceed to plan
validation (required before implementation).

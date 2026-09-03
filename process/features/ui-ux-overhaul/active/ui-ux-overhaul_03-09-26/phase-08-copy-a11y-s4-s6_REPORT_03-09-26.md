---
name: report:phase-08-copy-a11y-s4-s6
description: "Phase 8 sections S4-S6 (items 22-40) — row semantics, the mobile drawer focus trap, the org switcher, and the remaining accessibility and per-area items. Code done, full CI gate set green. Also closes the ui-ux-overhaul programme's execution."
date: 03-09-26
phase: "08"
status: COMPLETE
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-08-copy-a11y_PLAN_03-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "08"
---

# Phase 8 — sections S4-S6 (items 22-40)

**Branch:** `feat/uiux-phase-8` — three commits, one per section. Nothing pushed, no PR.

| Commit | Section | Subject |
|---|---|---|
| `9533da0` | S4 | `fix(a11y): give table rows a real link and stop space-key navigation bugs` |
| `0c47b8c` | S5 | `fix(a11y): trap focus in the mobile drawer and the org switcher` |
| `3639694` | S6 | `fix(a11y): add text equivalents, aria-current and error scroll-into-view` |

**TL;DR** — All 19 items resolved: 15 built, 4 verified-already-satisfied. Two items were *not* in
the state the handoff said they were, and one of those (item 34) was a real unbuilt defect that a
prior phase's registry had recorded as done. Full CI gate set green in CI order; 42/42 e2e across 14
specs, against a 31/31 pre-phase baseline on the ten S4 specs. Two mutation checks confirm the new
gates can fail. Every Agent-Probe row — the keyboard walk, the 10-item screen-reader list, the live
brand check, the `impeccable` audit — is unrun and is the owner's.

---

## Research-Refresh Drift Log

Every `file:line` in the plan was pinned against `5e5cdfe`, seven phases ago. What actually differed:

| # | What the plan or handoff said | What was true at `aeae6fa` | Action |
|---|---|---|---|
| 22 | five `role="link"` rows at named lines | Still exactly five, lines drifted by 3-6 | Re-pinned, built |
| 28 | nav landmark may need `aria-label="Main"` | Phase 02 added it | **Skipped**, gate added to keep it |
| 33 | approvals indicator is a colour-only dot | Phase 02 made it a number with `aria-label="{n} awaiting your decision"` | **Skipped**, gate added to keep it |
| 34 | handoff: "ALREADY SATISFIED by phase 07 — SKIP" | **False.** Still a 16px (`h-4 w-4`) `aria-pressed` glyph button. Phase 07's registry entry claims S4 "replaced the 16px glyph with a real `<button>` carrying `aria-label="Mark {step} complete"`" — no such string exists in the file; the live label is `"{step.done ? 'Uncheck' : 'Check'} {step.label}"` | **Built** (fallback path — see deviations) |
| 36 | zero `aria-current` in `src/`; add broadly | Phases 02/06/07 added 7 (`+layout` ×4, `payroll/+layout`, `settings/+layout` ×2). EmployeeTabs already uses `role=tab`/`aria-selected` | Only the templates pane switch remained. Built |
| 37 | handoff: attendance "is now split", thread minimally | Split into `AttendanceHrGrid`/`AttendanceSelfView`, **but the error markup stayed in the parent `+page.svelte:60`** — no threading needed. Phase 04 did **not** adopt `scrollIntoView` anywhere | Built on all five parents |
| 40 | phase 04 may have fixed the login error box | Not fixed — still bare `text-red-400`, no `role="alert"` | Built |
| 30 | punch page `role="status"`/`role="alert"` split | Intact at `:272`/`:280` | Verified untouched (`git diff` on `punch/` = 0 lines) |

---

## What Was Done

### S4 — row accessibility (items 22-26)

**R1 applied to all five rows.** Each row's primary cell now holds a real `<a href>`; `role="link"`
and `tabindex="0"` are gone from every `<tr>`; the whole-row click survives as a mouse convenience,
guarded with `closest('a, button, input, label, form')` — the leave page's guard, widened so the new
anchor cannot be double-fired.

| Row | Link cell | href |
|---|---|---|
| `employees/+page.svelte` | name | `/employees/{emp.id}` |
| `requests/+page.svelte` | type | `/requests/{req.id}` |
| `leave/balances/+page.svelte` | name | `/employees/{row.id}` |
| `leave/+page.svelte` | leave type | `/requests/{req.id}` |
| `recruitment/+page.svelte` | title | `/recruitment/{jp.id}` |

**Item 25** — the leave row's `aria-label={`Open ${leaveName(req.payload)} request`}` moved onto the
anchor, the only row that carried one. **Item 26** — the team attendance matrix and its "Exceptions
only" filter were read and left alone; they are not row links.

**Timesheets carve-out (item 22).** No URL — the row opens a review modal — so the period cell gets a
real `<button type="button">` calling `openReview`, with an `aria-label` naming the period. The
period cell, not the employee cell, because the employee column is conditional on `showEmployee`
and the period is always rendered.

**Items 23 and 24, fixed at the root.** Both bugs were the same shape: a `keydown` handler on a
`<tr>` that a child control's Space keypress bubbled into. Once the row is not focusable, that
handler is dead code whose only remaining effect is the bug, so it was removed rather than patched:

- **23** (timesheets): the handler had no `preventDefault()`, so Space opened the modal *and*
  scrolled the page.
- **24** (recruitment): the checkbox cell stopped `click` propagation but not `keydown`, so Space on
  a DRAFT-row checkbox toggled the box and then navigated away, losing the selection.

No e2e spec presses Enter or Space on a row (checked all 10 S4 specs); three click rows, and the
retained row `onclick` keeps those working.

### S5 — dialogs and focus (items 27-30)

**Item 27 — mobile drawer.** Focus moves into the drawer on open, Tab cycles inside it, Escape
closes it, and focus returns to the hamburger on *every* close path (Escape, backdrop, the in-drawer
X). `aria-expanded`/`aria-controls` on the hamburger; `role="dialog"` + `aria-modal="true"` +
`aria-label="Main menu"` on the `<aside>`, **conditional on `sidebarOpen`** — the same element is the
persistent desktop sidebar at `lg:`, and a permanent `aria-modal` would tell a screen reader the rest
of the page is inert when it is not.

**Implementation choice (recorded per the handoff).** The trap is a **deliberate local copy** of
`Dialog.svelte`'s, not a reuse. Three reasons, in order:

1. Dialog's trap is **inline**, not exported. Lifting it out is an edit to `src/lib/components/ui/**`,
   which phase 03 owns and this phase's Touchpoints list as read-only.
2. Mounting the drawer *in* Dialog does not fit: Dialog renders a centred, `max-w-*` panel inside a
   flex-centred backdrop. The drawer is a full-height slide-in pinned to the left edge that is also
   the desktop sidebar. Making it fit means restyling both.
3. The copied surface is small and stable: the `FOCUSABLE` selector string, the Tab/Shift+Tab
   cycling, and `trigger?.focus()` on close.

**Backlog line raised:** `drawer-focus-trap-duplicates-dialog_NOTE_03-09-26.md` — extract the trap
from `Dialog.svelte` into a shared utility once `components/ui` is in scope, and have both consume it.

**Extra safety not in the plan.** A `matchMedia('(min-width: 1024px)')` effect closes the drawer when
the viewport crosses up to `lg`. Without it, opening the drawer on a narrow window and then widening
leaves the *desktop sidebar* as a focus-trapped dialog — the whole app becomes unusable by keyboard.
Five lines, and it removes the entire class of bug.

**Item 28 — nav landmark.** Already `<nav aria-label="Main">` from phase 02. Skipped; a gate now
keeps it.

**Item 29 — org switcher: option (a), the native `<select>`.** Recorded as the plan asks. The markup
qualified for (a) exactly as the plan's test describes: the popover's content was nothing but org
names with a tick on the active one, which is what a `<select>` already is. It carried no per-row
affordance a `<select>` cannot hold. Taking (a) deletes the `orgMenuOpen` state entirely and gets
Escape, arrow-key movement, announced selection and the native listbox role for free.

Named **"Active organization"**, not "Organization": phase 02's nav has a section group of that exact
name, and two controls sharing one accessible name is ambiguous to a reader — it was also a hard
strict-mode failure for the e2e locator, which is how it was caught.

**Item 30 — punch page.** Verified untouched.

### S6 — remaining accessibility and per-area items (items 31-40)

- **31 Override asterisk.** `<span class="sr-only">, has a manual override</span>` plus a `title` on
  the asterisk. Phase 03 had already made the colour a light/dark pair, but colour+glyph is still no
  signal to a screen reader. `sr-only` is not declared in `src/app.css`; it is Tailwind v3's built-in,
  as the plan anticipated.
- **32 Schedules On/Off pills.** Both (`:66` org-wide, `:267` per-schedule) get `role="switch"`,
  `aria-checked`, and an `aria-label` naming what is switched ("Track tardiness for {s.name}").
- **33 Approvals dot.** Already a number with an `aria-label`. **Skipped**, gate added.
- **34 Onboarding checkbox.** Built, on the plan's **fallback path** — see deviations.
- **35 Emoji paperclip.** Replaced with an inline `aria-hidden="true"` `<svg>` in the repo's existing
  stroke style. The gate is a repo-wide zero-match on `\p{Emoji_Presentation}` across `src/routes/`.
- **36 `aria-current` follow-ups.** Only the Editor/Preview pane switch was left uncovered; it gets
  `role="tablist"`/`role="tab"`/`aria-selected` per the plan (it switches a pane, it does not
  navigate, so `aria-current` would be wrong).
- **37 Error scroll-into-view.** New `src/lib/actions/scrollToError.ts`, adopted on all five long
  pages. Honours `prefers-reduced-motion` with `behavior: 'auto'`.
- **38 Audit-log filter state.** All five controls (actor, entity, action, start, end) now read back
  from `$page.url.searchParams`. The query is untouched.
- **39 Audit-log entity IDs.** `title={log.entityId}` plus `select-all`. No clipboard dependency —
  the repo has no copy affordance to copy and this phase adds no package.
- **40 Login error box.** `role="alert"` and the phase 03 pair `text-red-600 dark:text-red-400`.

---

## OWNER-DECISION status

| Item | Status |
|---|---|
| **OWNER-DECISION-1** (login tenant enumeration) | **OPEN — comment-only, as planned.** The query, `loginSchema` and the two-step flow are byte-untouched (AC5). Backlog note exists: `login-email-first-tenant-privacy_NOTE_03-09-26.md`. The owner still owes a pick from A/B/C/D; the plan's default recommendation is C. |
| **OWNER-DECISION-2** (`DevLoginSwitcher`) | **OPEN — option A applied as the interim, as planned.** Both mounts are in place and unmodified. **Both comments verified reworded:** `(app)/+layout.svelte:6` and `(auth)/login/+page.svelte:3` and `:141` all now read `DEV ONLY — dev-gated (dev && !navigator.webdriver), never ships enabled; remove after the program's owner test pass`. The old `TEMP DEV — remove before merge` string is gone from `src/` entirely. The owner still owes a pick between B and C. |

Neither was silently built. AC20 holds.

---

## Plan Deviations

| # | Deviation | Why | Class |
|---|---|---|---|
| 1 | Items 23/24: the row `keydown` handlers were **removed**, not given `preventDefault()` and a guard | Once the `<tr>` loses `tabindex`, the handler is unreachable from the keyboard; the only keydown still reaching it bubbles from a child control, which is precisely the bug. Removal is the root-cause fix and a smaller diff. The plan's stated goal (Space does not scroll; Space on a checkbox does not navigate) is fully met. | within-blast-radius |
| 2 | Item 34 took the plan's **fallback path** (button raised to `h-6 w-6`), not a real `<input type="checkbox">` | The plan authorises this explicitly if a checkbox "breaks the progressive-enhancement submit". It does: a checkbox can only submit via `onchange` + `requestSubmit()`, so the control would stop working entirely with JavaScript off. The submit `<button>` works without JS today. `aria-pressed` already carries the toggle state. | within-blast-radius (plan-sanctioned) |
| 3 | Item 37 is a Svelte **action**, not a copy of the templates `$effect` | Same semantic operation, smaller diff. The error element mounting *is* the event, so there is no `querySelector`, no `tick()` and no teardown. It also focuses the error node itself rather than "the field inside it" — a page-level banner has no field inside it, and moving the caret there is what makes a reader announce it (the same pattern `reports/audit-log`'s reveal panel already uses). | within-blast-radius |
| 4 | Two pages carry the action on a **wrapper `<div>`** | `requests/approvals` and `employees/[id]` render errors through `<Banner>`, a `components/ui` component this phase may not edit. A wrapper is the only way to attach a `use:` directive without touching it. | within-blast-radius |
| 5 | The **derived-step dot** in the onboarding list was also resized to `h-6 w-6` | Not in item 34. Leaving it at 16px next to the resized manual one turns the list into a ragged column of two different dots. Presentational, in the same block, one line. | within-blast-radius |
| 6 | `tests/e2e/tenancy-switch.spec.ts` rewritten | It drove the org switcher with `getByRole('button', {name:'Veent'})` then `getByRole('button', {name:'JoJo Potato'})` — both gone with the popover. Now `getByRole('combobox', {name:'Active organization'}).selectOption(...)`. The assertion that proves the switch (JoJo's roster appears) is unchanged. | within-blast-radius |
| 7 | Item 29's control is named "**Active** organization" | A bare "Organization" collides with phase 02's nav section group of the same name — a real ambiguity for a screen reader, and a hard strict-mode e2e failure. | within-blast-radius |
| 8 | Orphan cleanup in `(app)/+layout.svelte` | `orgMenuOpen` (state + 2 assignments) and `currentOrg` became dead when the popover went. Cleanup of my own mess; no other reader. | within-blast-radius |

**No hard-stop deviations.** No schema, service-layer, `rbac.ts`, `components/ui/**`, `package.json`,
`app.css` token or `static/*` change. Verified: `git diff --name-only aeae6fa..HEAD` touches only
`src/routes/**`, `src/lib/actions/scrollToError.ts` and `tests/**`.

---

## Test Gate Outcomes

### S4 section gate

**Pre-phase baseline recorded before any S4 code was written** (the plan requires this; #287
flakiness makes this a baseline diff, not an absolute pass):

| | Result |
|---|---|
| Baseline (at `aeae6fa`), ten specs by file path | **31 passed, 0 failed (27.1s)** |
| After S4 (at `9533da0`), same ten specs | **31 passed, 0 failed (26.5s)** |

Zero regression. Specs selected **by file path** throughout — `-g` filters test titles and would
have selected zero for `back-navigation` and `pagination`.

### Full CI gate set, in CI order (S6 / final gate)

| Gate | Result |
|---|---|
| `pnpm format:check` | pass |
| `pnpm lint` | pass — 0 errors, 1 pre-existing warning (`CalculatorWindow.svelte:82`, untouched) |
| `pnpm check` | 1137 files, **0 errors**, same 1 pre-existing warning |
| `pnpm test` | **213 files / 2453 tests passed** (was 212/2428 after S1-S3: +1 file, +25 tests, all mine) |

### Final e2e regression sweep (14 specs, by file path)

The ten S4 specs plus `auth`, `form-errors`, `settings-roles` and `audit-log-reveal` — the surfaces
S5 and S6 touched. **42 passed, 0 failed (28.8s).**

### New gate on disk

`tests/unit/a11y-invariants.test.ts` — 25 tests, sibling to `copy-invariants.test.ts` and the same
source-scan shape. Covers the `role="link"` repo-wide zero-match (with a self-check that the scan can
still see one), the five converted links, the timesheets button, the drawer/switcher wiring, the
colour-only equivalents, the emoji zero-match, the tab semantics, the five `use:scrollToError`
adoptions, the reduced-motion branch, the audit-log filter and id affordances, the login alert, and
an **R5 negative control** asserting `'Invalid email or password'` still survives.

The file's header docblock states plainly what it does *not* prove.

### Mutation checks (both confirmed RED, both restored)

**(a) Row semantics.** Re-added `role="link"` to the employees `<tr>`:

```
× table rows are rows, not fake links (S4 items 22-25) > no source file anywhere carries role="link"
  Tests  7 failed | 9 passed (16)
```

Restored → green. (7 failed rather than 1 because the six not-yet-built S6 stubs were still red at
that point — the S4 gate itself is the one that flipped.)

**(b) Colour-only signal.** Stripped `aria-checked` from the org-wide schedules pill:

```
× colour is never the only signal (S6 items 31-33) > the schedules On/Off pills are switches with a checked state and a name
  Tests  1 failed | 24 passed (25)
```

Restored → 25 passed.

One gate was **red on first run** and caught a real defect in the gate, not the code: the emoji
zero-match still failed after the paperclip was replaced, because my own explanatory comment quoted
the emoji. The comment was reworded so the gate stays a clean repo-wide zero rather than being
loosened.

---

## What Was Skipped or Deferred

**Verified already satisfied — skipped, with a gate added so they stay satisfied:**

- Item 28 (nav landmark) — phase 02.
- Item 33 (approvals count) — phase 02.
- Item 36, partially — phases 02/06/07 covered the sidebar, payroll tabs, settings sub-nav and the
  employee tabs. Only the templates pane switch was left.

**Item 34 was NOT skipped** despite the handoff saying so — see the drift log.

**Every Agent-Probe row is unrun.** No screen reader, no keyboard walk, no live browser was driven
in this session. They are the owner's, listed below.

---

## Test Infra Gaps Found

- **Still no component-render tier.** `vitest.config.ts` is `environment: 'node'` over
  `tests/unit/**`. Every one of S4-S6's ~25 markup changes is provable only by source scan, by
  Playwright, or by eyes. This is the phase's largest residual and the reason AC8-AC11 and AC13-AC16
  stay Agent-Probe. Backlog notes `a11y-component-test-harness_NOTE_03-09-26.md` and
  `component-test-dom-environment_NOTE_03-09-26.md` already carry it — **both already exist on disk**,
  so no new stub was needed.
- **No axe/contrast tooling.** AC11's "no status by colour alone" is proved structurally (the text
  equivalent exists) but never measured.
- **A stale registry claim went unchallenged for a phase.** Phase 07's blast-radius registry told
  phase 08 that item 34 was already compliant, quoting an `aria-label` string that does not exist in
  the file. Nothing checks a registry claim against source. Cheap fix: registry "already done"
  claims should cite a grep-able string, and the consuming phase should grep it.
- The org switcher's offline/error path is still unproven — `org-switcher-offline-path-unproven_NOTE_03-09-26.md`
  predates this phase and still applies; the `<select>` swap did not change `switchOrg`'s error
  handling.

---

## Known Gaps (residual — none is a terminal PASS)

| Gap | Status |
|---|---|
| Screen-reader announcement correctness for every S4-S6 change | Agent-Probe. Owner's 10-item list below. Backlog stub exists. |
| Rendered contrast of the fixed colour-only signals, both themes | No tooling. Owner live check. |
| The drawer focus trap duplicates `Dialog.svelte`'s | New backlog note `drawer-focus-trap-duplicates-dialog_NOTE_03-09-26.md`. Not a defect — a consolidation owed once `components/ui` is in scope. |
| `attendance/+page.svelte:62` and `settings/schedules:46` still use bare `text-red-400` on their error boxes | Same defect class as item 40, but those two are not named by any item in this phase and sit in phase 03/04's contract. Recorded, not swept — widening here would be scope creep. **Worth one commit.** |
| No e2e spec covers `/inquiries` at all (carried from S1-S3) | Nothing proves the page renders or the 308 fires. |
| `static/veent-logo.png` is 934 KB vs `avipa-logo.png`'s 43 KB, on the unauthenticated login page | Owner report item; `static/*` out of bounds. |
| Whether `favicon.png` / `apple-touch-icon.png` still carry Avipa artwork | Owner spot-check; binary, unverifiable from source. |

---

## Closeout Packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-08-copy-a11y_PLAN_03-09-26.md`
- **Finished:** items 22-40 (S4, S5, S6), three commits — `9533da0`, `0c47b8c`, `3639694`.
- **Verified:** the full CI gate set in CI order; the ten S4 specs against a recorded pre-phase
  baseline; a 14-spec final regression sweep; two mutation checks proving the new gates can fail.
- **Unverified:** every Agent-Probe row — the keyboard walk, the 10-item screen-reader list, the live
  login/brand/logo check in both themes, the `impeccable` audit, and the two Hybrid regression rows
  (masked-reveal, per-role nav).
- **Best next state:** `Keep in active/testing`. **CODE DONE for phase 8 and for the whole
  programme.** Phase 8's own completion rules require the owner's confirmation before `VERIFIED`, and
  an agent may not self-award it.

---

## Forward Preview

**Test infra found.** Source-scan tests in `tests/unit/` are the established way to pin markup
invariants here (`destructive-confirms`, `copy-invariants`, now `a11y-invariants`). Copy that shape.
E2E specs must be selected **by file path** — `-g` filters test titles and silently selects zero.
Prettier does not expand `src/routes/(app)/**` as a glob (it reads the parens as a group), so pass
explicit file paths.

**Blast radius changes.** No `<tr>` in `src/` may carry `role="link"` — a gate enforces it. The org
switcher is a native `<select>` labelled "Active organization"; `orgMenuOpen` no longer exists. New
public helper `src/lib/actions/scrollToError.ts` — put it on the element that renders an error, and
note it sets `tabindex="-1"` on the node for you. `(app)/+layout.svelte` gained a drawer focus trap
and a `matchMedia` effect.

**Commands to stay green.** `pnpm format:check && pnpm lint && pnpm check && pnpm test`, in that
order, because CI runs format first and skips the rest on failure.

**Dependency changes.** None. No new package, no schema change, no service-logic change.

---
---

# PROGRAM CLOSE — `ui-ux-overhaul`

**All 9 phases are CODE DONE.** No phase is `VERIFIED`. Phase 09 (`login-email-first`) was added on
04-09-26 by owner ruling and closes OWNER-DECISION-1.

## Phase status

| Phase | Status | Reports |
|---|---|---|
| 01 `p0-fixes` | CODE DONE | `phase-01-p0-fixes_REPORT_03-09-26.md` |
| 02 `nav-ia` | CODE DONE | `phase-02-nav-ia_REPORT_03-09-26.md` |
| 03 `design-system` | CODE DONE | `…-s1-s5`, `…-s6-s12`, `…-s13-s17_REPORT_03-09-26.md` |
| 04 `feedback-contract` | CODE DONE | `…-s1-s4`, `…-s5-s6_REPORT_03-09-26.md` |
| 05 `destructive-actions` | CODE DONE | `phase-05-destructive-actions_REPORT_03-09-26.md` |
| 06 `surface-consolidation` | CODE DONE | `phase-06-surface-consolidation_REPORT_03-09-26.md` |
| 07 `page-splits` | CODE DONE | `…-s1-s4`, `…-s5`, `…-s6-s7_REPORT_03-09-26.md` |
| 08 `copy-a11y` | CODE DONE | `…-s1-s3`, `…-s4-s6_REPORT_03-09-26.md` (this file) |
| 09 `login-email-first` | CODE DONE | `phase-09-login-email-first_REPORT_03-09-26.md` |

## Consolidated owner test pass

The single gate left. Each phase report's deferred list, gathered:

**Phase 01** — deferred by explicit operator instruction; no server, browser or database was started
for any of its live checks.

**Phase 03** — §8.3 light/dark computed-style spot-check *with its negative control*; §8.5 WCAG AA
contrast measurement; §8.4 modal before/after focus-trap checks in a live browser. None run.

**Phase 05** — item 39 (the P1 destructive-action matrix walk) and item 40 (`impeccable` audit).

**Phase 07** — live gates G5, G6, G7, G8, G10, G11, G12, G13, G14 and the five-role settings walk.
All unrun across all seven sections.

**Phase 08 (S1-S3)** — the keyboard walk, the screen-reader spot-check list, the live login
spot-check, the `impeccable` audit.

**Phase 08 (S4-S6), this session** — all of the following:

1. **Keyboard-only walk, file a leave request.** `/dashboard` → Leave → open the file-leave form →
   complete and submit → open the filed request from the list. Tab/Shift-Tab/Enter/Space/Escape only,
   mouse untouched. Assert: focus is always visible; the mobile drawer traps Tab and closes on Escape
   restoring focus to "Open menu"; Space on a leave-row checkbox toggles it and does **not** navigate;
   Enter on a row's name link opens the request; the org switcher opens with the keyboard and closes
   on Escape.
2. **The 10-item screen-reader spot-check list** in the plan's Verification Evidence section, item by
   item, recording verbatim what is announced. Items 1, 4, 5, 6, 7, 8, 9 land squarely on S4-S6 work.
3. **Live brand check, light AND dark:** the login page reads Veent HRIS with the Veent logo, and the
   tenant list is **unchanged** (OWNER-DECISION-1 was not granted). Check the logo at `h-16 w-auto`.
4. **`impeccable` audit** on the changed surfaces (standing rule for UI work).
5. **Two Hybrid regression rows:** masked-reveal on `employees/[id]` still masks, reveals once and
   writes its audit row; nav resolves for HR_ADMIN, MANAGER and an employee with nothing 403ing that
   is shown.
6. **Spot-checks for the S6 items no gate can prove:** the audit-log filters visibly keep their
   selection after submit; a failed submit on each of the five long pages scrolls the error into view;
   the onboarding tick target is comfortable at 24px; the schedules pills read as switches.

**Phase 09 (`login-email-first`, added 04-09-26)** — four browser checks, plus the whole e2e tier
and the `impeccable` pass, all unrun. The manual four, verbatim from the phase 09 plan:

| # | Check | Expect |
|---|---|---|
| **M-1** | **Multi-org login as the CEO.** Open `/login`, type `ceo@veent.ph`, press Continue. | Three companies listed as radio choices — Veent, JoJo Potato, Sweetleaf — and nothing else. Pick JoJo Potato, sign in. The app opens **in JoJo Potato**, not Veent |
| **M-2** | **No-JavaScript login.** Turn JavaScript off in the browser, open `/login`, sign in as `admin@veent.ph`. | Both steps work as normal page loads. You reach the dashboard |
| **M-3** | **Bookmarked `/login`.** Bookmark `/login`, close the tab, open the bookmark. Then sign in, and open the bookmark again while signed in. | Fresh visit shows step 1 (email) with no company list. While signed in it redirects to `/dashboard` |
| **M-4** | **Unknown email look-and-feel.** Type an email that belongs to nobody (e.g. `nobody@example.com`) and press Continue. | It asks for a password exactly like a real email does — no "no such account", no different wording, no different timing you can see. Then any password gives `Invalid email or password` |

In M-1 the pre-selected company is **JoJo Potato**, not Veent — the list is name-sorted on purpose
and sorting the primary org first would disclose which org is primary. Pick before signing in.

Phase 09 also owes the full `pnpm test:e2e` run (no pre-phase baseline was captured), the R2
rate-limit lockout check on a running app, and the `impeccable` audit.

## Open owner decisions

| # | Decision | State |
|---|---|---|
| OWNER-DECISION-1 | Login step 1 enumerates every tenant | **CLOSED.** Owner ruled option C (email-first) on 2026-09-03; built as phase 09, PR #18. See `phase-09-login-email-first_REPORT_03-09-26.md`. |
| OWNER-DECISION-2 | `DevLoginSwitcher` removal | **OPEN.** Option **A applied as the interim** (comments reworded). Owner picks B (remove now) or C (remove after the live gate). Recommended **C**. |

## Open backlog notes

All in `process/features/ui-ux-overhaul/backlog/`:

`a11y-component-test-harness` · `api-v1-raw-error-message-leak` ·
`component-test-dom-environment` · `dashboard-pending-approvals-wrong-target` ·
`drawer-focus-trap-duplicates-dialog` *(new, this session)* ·
`e2e-flakiness-blocks-feedback-regression` · `feedback-contract-remaining-adoption` ·
`login-email-first-tenant-privacy` *(BUILT as phase 09)* · `login-timing-parity` *(new, phase 09)* · `manager-admin-nav-gate-alignment` ·
`org-switcher-offline-path-unproven` · `phase-03-residual-dark-only-colours` ·
`phase-03-responsive-sweep` · `query-level-pagination-unbounded-lists` ·
`raw-enum-sweep-remaining-enums`

Plus two residuals recorded in this report with no note file yet, both one-commit follow-ups:

- ~40 machine-voiced `fail(400)` strings outside phase 08's ten named files (from S1-S3).
- `attendance` and `settings/schedules` error boxes still use bare `text-red-400`.

**The programme's execution is closed. The owner's test pass is the only thing between CODE DONE and
VERIFIED.**

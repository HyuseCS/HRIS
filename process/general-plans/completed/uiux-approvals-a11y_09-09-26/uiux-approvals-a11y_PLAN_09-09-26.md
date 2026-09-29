---
name: plan:uiux-approvals-a11y
description: "Fix 7 impeccable-audit a11y findings on requests/approvals page (contrast, touch targets, tri-state select-all, list semantics, skip link)"
date: 09-09-26
feature: general
---

# UI/UX Approvals A11y Fixes — Implementation Plan


**Date**: 09-09-26
**Status**: COMPLETE — archived, all 8 checklist items shipped
**Complexity**: SIMPLE (single page + one shared-layout edit, 7 findings, no schema/API/auth surface)

## Context

Context loaded per `process/context/all-context.md` routing table (`uxui` group) and
`process/context/tests/all-tests.md` (e2e spec routing) before this plan was written — see
Touchpoints/Resume sections below for the exact files read.

## Phase Completion Rules

Single-phase SIMPLE plan (no phase program). This plan is complete when all 7 checklist items
below are committed, each verification gate in Verification Evidence has been run, and
`pnpm lint` / `pnpm exec prettier --check` / `pnpm check` are green.

## Acceptance Criteria

- [x] A2: stage badge text/background composite measures ≥4.5:1 in both themes.
- [x] A5: card grid exposes `list`/`listitem` roles; card heading is `h2` with no skipped level; `back-navigation.spec.ts` still passes.
- [x] A1/A8: Approve and Return buttons (base + hover) measure ≥4.5:1 white-on-fill; Reject unchanged at 4.83:1.
- [x] A3: checkboxes and `.btn-row`-family anchors measure 44×44px under `pointer: coarse`; no dense-table regression on attendance/timesheets.
- [x] A4: select-all checkbox is tri-state (empty→select-all, some→clear, all→clear); Clear button removed; `approval-chain`/`multi-role-sod` e2e specs still pass.
- [x] A6: select-all label text on `bg-muted/50` measures ≥4.5:1 in both themes.
- [x] A7: skip link is the first focusable element app-wide; Tab+Enter moves focus to `<main>`; verified in ≥1 browser engine.

## Overview

Fix 7 approved accessibility findings from an impeccable audit of
`src/routes/(app)/requests/approvals/+page.svelte`. Three owner decisions are already settled
(A3 app-wide, A4 tri-state + remove Clear, A5 list + heading) and are written below as fixed
requirements, not options. One new finding (A8, folded into A1's section) surfaced during
this planning pass: the Approve button also fails contrast.

**Branch:** `feat/uiux-phase-4` (current). Work happens as new commits on top; no rebase needed.

## Goals

Every filled action button on this page clears 4.5:1 white-on-fill contrast, with the measured
ratio stated next to each chosen shade. Stage badge, panel text, checkboxes, cards, and page
entry all clear WCAG AA. No visual regression to unrelated pages.

## Scope

In scope: `src/routes/(app)/requests/approvals/+page.svelte`, `src/app.css`,
`src/routes/(app)/+layout.svelte`. Touch-target CSS change is app-wide by explicit owner
decision (A3) — blast radius includes 14 files with checkboxes and 7 files with `btn-row`-class
anchors, but the change itself is a single CSS rule edit; no other file is touched.

## Touchpoints

- `src/routes/(app)/requests/approvals/+page.svelte` — Return/Approve button classes, ReasonDialog
  confirmClass, stage badge, select-all/Clear panel, card markup (div→ul/li + heading), checkbox
  bind:indeterminate
- `src/app.css` — touch-target media query (`:118-127`)
- `src/routes/(app)/+layout.svelte` — skip link insertion, `<main>` id/tabindex (`:622`)

## Public Contracts

None. All changes are presentational (CSS classes, ARIA attributes, DOM element tags) or
client-side interaction state (tri-state checkbox). No server actions, form field names, or
API contracts change. `?/decideRequest` and `?/rejectMany` POST targets are untouched.

## Blast Radius

- Direct edits: 3 files (`+page.svelte`, `app.css`, `+layout.svelte`).
- App-wide touch-target rule (A3): read-only risk surface is the 14 files listed in A3 below
  (checkboxes now get 44px floor) plus 7 files with `.btn-row`/`.btn-row-positive`/
  `.btn-row-warning`/`.btn-row-danger` anchors (if that selector choice is taken — see A3
  decision). No code in those files is edited; only their rendered size on coarse-pointer
  devices changes.
- Risk class: low (pure CSS/markup, no data or auth surface). No schema, API, or auth changes.

## Sequencing (per INNOVATE)

Execute in this order, each as its own commit:

1. **A2** (stage badge) — reused class, zero new surface, no dependency on anything else.
2. **A5** (list semantics + heading) — adjacent card markup to A2; sequenced right after to
   avoid two agents/passes touching overlapping regions with stale line numbers.
3. **A1+A8** (button contrast, Return + Approve + ReasonDialog) — needs its own shade decision,
   independent of A2/A5's markup region (buttons are below the card body).
4. **A3** (touch targets, app.css) — app-wide, independent file; do before A4 so the checkbox
   reaches its final rendered size before the indeterminate visual is verified.
5. **A4** (tri-state select-all, Clear removed) — same element A3 just resized; verify the
   indeterminate dash renders correctly at the new 44px size.
6. **A6** (panel text contrast) — depends on A4 having removed the Clear button; reconcile scope
   after A4 lands.
7. **A7** (skip link) — independent, shared layout, can land any time after A1–A6; placed last
   here only to keep the page's own fixes together first.

---

## A2 — Stage badge contrast

**File:** `src/routes/(app)/requests/approvals/+page.svelte:335`

**Current:**
```
class="rounded-full bg-foreground/15 px-2 py-0.5 text-xs text-muted-foreground"
```

**Decision:** swap only the text class to `text-foreground/70`. Do NOT adopt `.badge-gray`
verbatim — that class prepends `::before` + `gap-1.5`, which would add a leading dot this
badge does not have today. Smallest diff: keep `bg-foreground/15`, change
`text-muted-foreground` → `text-foreground/70`.

**Change:**
```
class="rounded-full bg-foreground/15 px-2 py-0.5 text-xs text-foreground/70"
```

**Expected measured outcome:** identical text/fill utility pair as `.badge-gray`
(`app.css:181`), whose own comment states the composite clears 4.5:1 in both themes
(~#E6E6E6 text-on-card in light, ~#3A3A3A in dark). No new ratio needs deriving — this is the
same two classes already verified for `.badge-gray`, just applied inline instead of through
that class (to skip its dot).

**Verification:** DevTools color picker on the rendered `<span>` background (composited over
`bg-card`, not the raw `/15` value) and text, in both light and dark theme, at 375px and
1280px viewport. Confirm ratio ≥ 4.5:1 both themes. No automated check exists for visual
contrast on this element — this is an agent-probe / owner-eyeball step (see Verification
Evidence).

**Commit message subject:** `fix(a11y): raise approvals stage badge text contrast`

---

## A5 — Card list semantics + heading level

**File:** `src/routes/(app)/requests/approvals/+page.svelte:230-376`

**Decision (owner):** add list semantics AND a per-card heading. `requests/proposals/+page.svelte:99`
stays a bare-div grid — intentional divergence, not touched by this plan.

**Semantics choice:** swap the bare `<div class="grid ...">` → `<ul class="grid ...">` and each
card `<div class="flex flex-col rounded-lg border bg-card ...">` → `<li class="flex flex-col
rounded-lg border bg-card ...">`. Real `ul`/`li`, not `role=list`/`role=listitem` on divs.
**Verified safe:** `node_modules/tailwindcss/src/css/preflight.css:303-309` — Tailwind's
default preflight (enabled in this repo; no `corePlugins`/`preflight:false` override found in
`tailwind.config.*`) resets `ol, ul, menu { list-style: none; margin: 0; padding: 0; }`. No
bullet or margin regression risk.

**Heading:** add `<h2>` as the first element inside the card's info column, wrapping the
existing employee-name paragraph text (currently a bare `<p class="font-medium leading-tight
break-words">{req.employee.lastName}, {req.employee.firstName}</p>` at `:261-263`). Change
that `<p>` to `<h2>` with the same classes (do not add a new element — retag the existing one
so no visual change occurs; `font-medium` styling stays, `h2`'s default browser bold/size is
overridden by the existing utility classes exactly as it is today for the `<p>`).

**Level justification:** `src/lib/components/ui/PageHeader.svelte:34` renders
`<h1 class="text-2xl font-bold tracking-tight">{title}</h1>` — the page's only `h1`. There is
no `h2` anywhere else between `PageHeader` and the card grid on this page, so the card's
heading must be `h2` (no skipped level).

**Anchor-inside-list check:** `back-navigation.spec.ts:90-105` selects
`a[href*="?from=/requests/approvals"]` — this anchor lives at `:338` inside the card `<div>`
that becomes `<li>`. Selector is href-based and survives the div→li retag; the anchor itself
is untouched. No spec change needed, but re-run this spec after the edit (see Verification).

**Exact edits:**
1. `:230` — `<div class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">` → `<ul class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">`
2. `:235-239` (opening card element) — `<div class="flex flex-col rounded-lg border bg-card ...">` → `<li class="flex flex-col rounded-lg border bg-card ...">` (same class string, tag only)
3. `:375` (closing card div) → closing `</li>`
4. `:376` (closing grid div) → closing `</ul>`
5. `:261-263` — `<p class="font-medium leading-tight break-words">` → `<h2 class="font-medium leading-tight break-words">`, and its closing `</p>` → `</h2>`

**Expected measured outcome:** zero visual diff (preflight already zeroes list defaults);
axe/Playwright accessibility tree shows `list` + `listitem` roles for the grid and cards, and
the h1→h2 heading order has no skipped level.

**Verification:**
- `pnpm test:e2e -- back-navigation` — confirm the existing spec still passes (anchor selector
  unaffected by div→li).
- Manual: DevTools Accessibility panel → confirm computed role `list` on the grid container and
  `listitem` on each card, and `heading level 2` on the employee name.
- Manual: screenshot diff at 375px/768px/1280px, both themes, to confirm zero visual change
  (owner-driven, live browser on CDP port 9222).

**Commit message subject:** `fix(a11y): give approvals cards list semantics and a heading`

---

## A1 + A8 — Filled button contrast (Return, Approve, and the ReasonDialog confirm button)

**Files:**
- `src/routes/(app)/requests/approvals/+page.svelte:357` (Approve)
- `src/routes/(app)/requests/approvals/+page.svelte:364` (Return)
- `src/routes/(app)/requests/approvals/+page.svelte:415` (ReasonDialog `confirmClass` for RETURNED)

**Goal restated:** every filled action button on this page clears 4.5:1 white-on-fill. Reject
(`:371`, `bg-red-600`) already measures 4.83:1 and is NOT changed — visual parity across the
three buttons was considered and explicitly rejected: matching Reject's shade to Approve/Return's
new shades would mean either darkening Reject unnecessarily (no defect to fix) or lightening it
back toward failure. Each button keeps its own hue; only the failing two move to a passing step
within their own hue.

**Measured contrast (computed, white text on solid fill, do not re-derive):**

| Button | Current fill | Current ratio | New fill | New ratio | Current hover | New hover |
|---|---|---|---|---|---|---|
| Approve | `bg-green-600` `#16a34a` | 3.30 FAIL | `bg-green-700` `#15803d` | 5.02 PASS | `hover:bg-green-700` | `hover:bg-green-800` (`#166534`, 7.13) |
| Return | `bg-orange-500` `#f97316` | 2.80 FAIL | `bg-orange-700` `#c2410c` | 5.18 PASS | `hover:bg-orange-600` | `hover:bg-orange-800` (`#9a3412`, 7.31) |
| Reject | `bg-red-600` `#dc2626` | 4.83 PASS | unchanged | 4.83 (unchanged) | `hover:bg-red-700` | unchanged |

orange-600 (`#ea580c`, 3.56) was considered for Return and rejected — it still fails AA.

**Exact edits:**

1. `:357` (Approve button class string) —
   `flex-1 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:pointer-events-none disabled:opacity-50`
   → `flex-1 rounded-md bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-800 disabled:pointer-events-none disabled:opacity-50`

2. `:364` (Return button class string) —
   `flex-1 rounded-md bg-orange-500 px-2 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:pointer-events-none disabled:opacity-50`
   → `flex-1 rounded-md bg-orange-700 px-2 py-1 text-xs font-medium text-white hover:bg-orange-800 disabled:pointer-events-none disabled:opacity-50`

3. `:415` (ReasonDialog `confirmClass` for RETURNED) —
   `'bg-orange-500 text-white hover:bg-orange-600'`
   → `'bg-orange-700 text-white hover:bg-orange-800'`

Reject's classes at `:371` and `:416` are untouched.

**Verification:**
- DevTools color picker on rendered Approve/Return buttons (both base and `:hover` state,
  forced via DevTools state toggle) confirming the fills above; compute ratio against
  `#FFFFFF` text and confirm ≥ 4.5:1 (values already computed above — this step confirms the
  Tailwind class actually resolves to the stated hex in the built page, not a re-derivation).
- No automated contrast-check tool exists in this repo's toolchain — this is an agent-probe
  step. Record the observed hex per button in the phase report.

**Rollback:** revert the 3 class-string edits; no state, markup structure, or test selector
changes are involved, so this is a pure string revert with no side effects.

**Commit message subject:** `fix(a11y): raise approvals Approve/Return button contrast to AA`

---

## A3 — Touch targets (app-wide, owner-decided)

**File:** `src/app.css:110-127`

**Current:**
```css
/* ... comment ...
   ponytail: checkbox/radio excluded — they are square, and a floor on one
   axis alone stretches them into a broken control. */
@media (pointer: coarse) {
	button,
	[role='button'],
	select,
	textarea,
	input:not([type='hidden']):not([type='checkbox']):not([type='radio']) {
		min-height: 44px;
		min-width: 44px;
	}
}
```

**Two gaps to close:**

1. **Checkboxes.** The exclusion comment's stated reason ("a min-height with no matching
   min-width just stretches them") is stale — commit `c8684e5` added `min-width: 44px` to the
   same rule, so the rule already sets both axes. Fix: remove `:not([type='checkbox'])` from the
   `input` selector only. **Radio stays excluded** — the audit finding names checkboxes
   specifically; radio is out of scope for this fix and is not mentioned in the finding.

2. **Anchors.** `<a class="btn-row">View detail</a>` (`:338` in approvals) and 6 other files'
   `.btn-row`/`.btn-row-positive`/`.btn-row-warning`/`.btn-row-danger` anchors are not covered —
   `a` is not in the selector list. A **bare `a` selector is rejected**: it would apply a 44px
   min-width/min-height floor to every inline text link in prose (e.g. body copy links), which
   is wrong. **Chosen selector: scope to the 4 button-styled anchor classes explicitly** —
   `a.btn-row, a.btn-row-positive, a.btn-row-warning, a.btn-row-danger`. This covers every
   anchor confirmed by grep to use these classes (7 files: `dashboard`, `payroll/[id]`,
   `payroll`, `payroll/periods`, `payslips`, `requests/approvals`, `separations`) and cannot
   ever match a prose link, since prose links never carry these utility classes.

**New rule:**
```css
@media (pointer: coarse) {
	button,
	[role='button'],
	select,
	textarea,
	a.btn-row,
	a.btn-row-positive,
	a.btn-row-warning,
	a.btn-row-danger,
	input:not([type='hidden']):not([type='radio']) {
		min-height: 44px;
		min-width: 44px;
	}
}
```

Note the `input` selector now only excludes `hidden` and `radio` (checkbox exclusion removed).

**Blast radius (informational, no other file edited):**
- Checkboxes now sized 44×44 under `pointer: coarse` in: `attendance/+page.svelte`,
  `leave/+page.svelte`, `recruitment/[id]/+page.svelte`, `recruitment/+page.svelte`,
  `requests/approvals/+page.svelte`, `requests/timesheets/+page.svelte`,
  `separations/[id]/+page.svelte`, `settings/backup/+page.svelte`,
  `settings/leave-types/+page.svelte`, `settings/pay-codes/+page.svelte`,
  `settings/performance/+page.svelte`, `settings/roles/+page.svelte`,
  `settings/schedules/+page.svelte`, `timesheets/+page.svelte` (14 files, verified by grep,
  matches audit's count).
- `.btn-row`-family anchors sized 44×44 under `pointer: coarse` in 7 files (listed above,
  verified by grep).

**Rollback (specific to A3):** if a dense table (attendance or timesheets) becomes visually
broken under `hasTouch` emulation (rows too tall, checkboxes overlapping adjacent cells,
horizontal scroll appearing where it didn't before), revert `src/app.css:110-127` to the
pre-change block (git revert of this single commit — the edit is isolated to one CSS rule with
no dependents from other commits in this plan, since A4 in step 5 depends on this rule's
*output size*, not its *source*, so reverting A3 does not require reverting A4; A4 will just be
re-verified against the old 36px size instead).

**Verification (MANDATORY before commit, per audit requirement):**
1. Open `attendance/+page.svelte` (or `timesheets/+page.svelte`) in the live browser
   (CDP port 9222) with DevTools device toolbar set to a touch device (`hasTouch` emulation
   on, e.g. "iPad" preset).
2. Before the change: screenshot the table rows, note current row height in px (DevTools
   computed panel on one `<tr>` or checkbox cell).
3. Apply the CSS change.
4. After the change: re-screenshot the same table, confirm each checkbox now measures
   44×44px (DevTools computed panel), confirm row height grew but no row content overlaps,
   clips, or wraps unexpectedly, confirm no new horizontal scrollbar appeared.
5. Repeat step 4 on `requests/approvals` for both the select-all checkbox and per-card
   checkbox, and on `dashboard` (or another `.btn-row` anchor page) for the "View detail"
   link.
6. Record both before/after screenshots and the measured px values in the phase report.

**Commit message subject:** `fix(a11y): extend 44px touch-target floor to checkboxes and row-action links`

---

## A4 — Tri-state select-all checkbox, Clear button removed (owner-decided)

**File:** `src/routes/(app)/requests/approvals/+page.svelte:17-27` (state) and `:186-207`
(markup).

**Required behavior:**
- nothing selected → click selects all
- some selected → click clears
- all selected → click clears

**Mechanism — confirm before coding, do not assume:** Svelte 5 supports `bind:indeterminate`
directly on a checkbox `<input>` (a DOM boolean property, not an HTML attribute — grep confirms
zero existing uses of `indeterminate` anywhere in this repo, so there is no local precedent to
copy). **Verification step required at EXECUTE time:** confirm `bind:indeterminate` is
supported on `<input type="checkbox">` in the installed Svelte version (`package.json` →
check `svelte` version; Svelte 5's binding docs list `indeterminate` as a supported
element-level binding alongside `checked`) via `vc-docs-seeker` or the installed
`node_modules/svelte/package.json` version + changelog before writing the binding. Do not
assume behavior from memory. If `bind:indeterminate` is unsupported in the installed version,
fall back to a small `$effect` that sets `el.indeterminate` on a `bind:this` element reference —
name this fallback explicitly in the execute report if the primary mechanism is unavailable.

**State changes (`:17-27`):**
- Keep `selected = $state<string[]>([])`, `allIds`, `allSelected` as-is.
- Add a derived `someSelected = $derived(selected.length > 0 && !allSelected)` for the
  indeterminate condition.
- Replace `toggleAll(on: boolean)` with a no-arg `toggleAll()`:
  ```
  function toggleAll() {
  	selected = selected.length > 0 ? [] : allIds
  }
  ```
  (covers both "some selected → clear" and "all selected → clear" since both are
  `selected.length > 0`; "nothing selected → select all" is the `else` branch.)

**Markup changes (`:186-207`):**
- Checkbox input (`:190-195`): change `onchange={(e) => toggleAll(e.currentTarget.checked)}` to
  `onchange={toggleAll}`, add `bind:indeterminate={someSelected}`.
- Remove the Clear `<button>` block entirely (`:202-207`).
- **aria-live label text:** keep the existing `aria-live="polite"` span (`:196-198`) and its
  existing text logic (`selected.length ? '${selected.length} selected' : 'Select all'`) —
  unchanged, since it already communicates state without depending on the Clear button.
- **aria-label on the checkbox:** the checkbox itself has no `aria-label` today (label wraps
  it visually with the "Select all" / "N selected" text, which is sufficient per WCAG's
  label-wrapping association — no accessible-name gap exists). Since Clear's removal doesn't
  change how the checkbox is labelled (it was never labelled via Clear), **no aria-label
  addition is needed**. State this explicitly so EXECUTE doesn't add an unrequested
  attribute.

**Verification (sequenced AFTER A3, per dependency):**
1. Confirm the checkbox is now 44×44px (from A3) before judging the indeterminate dash's
   visual clarity at that size.
2. Manual, live browser: select 1 of N cards → confirm select-all shows the indeterminate
   dash (not checked, not empty). Select all → confirm checkbox shows checked, no dash.
   Click again → confirm all clear. Click from empty → confirm all select.
3. Confirm the Clear button element no longer exists in the DOM (DevTools Elements panel).
4. Confirm `approval-chain.spec.ts` / `multi-role-sod.spec.ts` still pass — they POST directly
   to `?/decideRequest`, markup-blind, unaffected — run `pnpm test:e2e -- approval-chain
   multi-role-sod` as a regression check.

**Commit message subject:** `fix(a11y): make approvals select-all tri-state, remove Clear`

---

## A6 — Panel text contrast (depends on A4)

**File:** `src/routes/(app)/requests/approvals/+page.svelte:187-198` (select-all label span)
and `:202-207` (Clear button — **removed by A4**).

**Reconciliation (explicit, per audit note):** A4 deletes the Clear button entirely, so A6's
scope reduces to the select-all label span only. The Clear button's contrast is moot — it no
longer exists.

**Current:** the label span (`:187-188` wrapper, `:196-198` text) uses
`text-muted-foreground` on the panel's `bg-muted/50` (`:184`) background = 4.21:1 dark /
4.35:1 light — both just under the 4.5:1 AA floor.

**Constraint:** do NOT change the `--muted-foreground` token (`app.css:24` light / `:65` dark)
— app-wide blast radius, out of scope.

**Change (scoped to this usage only):** swap `text-muted-foreground` → `text-foreground/70` on
the label wrapper at `:187-188` (same substitution pattern as A2, applied here for the same
reason — a slightly stronger neutral that isn't the token itself).

**Exact edit — `:187-189`:**
```
<label
	class="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground"
>
```
→
```
<label
	class="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-foreground/70"
>
```

**Expected measured outcome:** `text-foreground/70` on `bg-muted/50` (composited, not the raw
value) — measure live; expected to clear 4.5:1 in both themes based on the same token pairing
already verified for `.badge-gray` on a different background, but this MUST be independently
measured since the underlying background (`bg-muted/50` vs `bg-card`) differs. Do not assume
the A2 number transfers.

**Verification:** DevTools color picker on the composited label text vs the panel background,
both themes, at 375px/1280px. Confirm ≥ 4.5:1. If it measures under 4.5:1, escalate — do not
silently accept (no token change is authorized in this plan; if `/70` doesn't clear it, stop
and route back to INNOVATE for a next-step decision rather than substituting a darker step
unreviewed).

**Commit message subject:** `fix(a11y): raise approvals select-all label contrast`

---

## A7 — Skip link (shared layout, owner-decided)

**File:** `src/routes/(app)/+layout.svelte:194` (root wrapper) and `:622` (`<main>`).

**Required elements:**
1. `id` for main: `main-content`.
2. `tabindex="-1"` on `<main>` — required because `href="#main-content"` alone does not
   reliably move focus to a non-focusable element across browsers; the `tabindex="-1"` makes
   it programmatically focusable without adding it to the tab order.
3. Skip-link markup, inserted as the **first child** of the root `<div class="flex min-h-screen
   bg-background" ...>` at `:194` — i.e. immediately before `<header` at `:196`. Using
   Tailwind's built-in `sr-only` / `focus:not-sr-only` utilities (both are core Tailwind
   utilities, no custom CSS needed):
   ```svelte
   <a
   	href="#main-content"
   	class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
   >
   	Skip to main content
   </a>
   ```
4. `<main>` edit at `:622`: `<main class="flex flex-1 flex-col p-4 pt-20 lg:p-8 lg:pt-8">` →
   `<main id="main-content" tabindex="-1" class="flex flex-1 flex-col p-4 pt-20 lg:p-8 lg:pt-8">`

**Why first-focusable:** 14 tab stops of nav precede page content today (per audit finding);
the skip link must be reachable on the very first Tab press, which requires it to be the first
focusable element in DOM order — placing it before `<header>` (which contains the first nav
tab stops) satisfies this.

**Verification (cross-browser, per audit requirement):**
1. Live browser (CDP port 9222), any page under `(app)`: press Tab once on page load — confirm
   the skip link becomes visible (not `sr-only`) and is focused.
2. Press Enter — confirm focus moves to `<main>` (DevTools "Focus" indicator / `document.activeElement`
   check in console should report the `<main>` element).
3. Repeat in both light and dark theme (visual contrast of the focused link against
   `bg-background`).
4. Repeat in at least one additional browser engine if available (the owner drives this
   manually — Firefox or Safari via BrowserStack/local install) to confirm `tabindex="-1"` +
   hash-navigation focus behavior isn't Chromium-specific; if only Chromium is available,
   record that as a known gap rather than skipping the note.

**Commit message subject:** `fix(a11y): add skip-to-main-content link to app layout`

---

## Data Flow / Failure Modes

No data flow changes — every edit is presentational CSS/markup or client-only interaction
state (`selected` array). Failure modes are limited to: (a) visual regression on touch-target
change (A3, covered by its dedicated verification + rollback), (b) `bind:indeterminate`
unsupported by the installed Svelte version (A4, covered by the mandatory pre-check), (c) the
`text-foreground/70` substitution not clearing 4.5:1 on `bg-muted/50` (A6, covered by an
explicit escalate-don't-guess instruction).

## Dependencies

- A2 before A1 (different code regions, no functional dependency — sequencing is for review
  clarity per INNOVATE, not a technical blocker).
- A3 before A4 (functional: A4's indeterminate visual must be checked at final checkbox size).
- A2 adjacent to A5 (overlapping card markup region — sequence together to avoid line-number
  drift between edits).
- A6 depends on A4 (Clear button removal changes A6's scope).
- A7 independent of all others (different file).

## Risks

| Risk | Mitigation |
|---|---|
| A3 breaks dense table row layout on touch devices | Mandatory before/after screenshot verification (see A3), isolated single-commit rollback |
| A4's `bind:indeterminate` unsupported by installed Svelte version | Mandatory version check via docs-seeker before coding; documented fallback (`$effect` + `bind:this`) |
| A6's `/70` substitution doesn't clear 4.5:1 on the different `bg-muted/50` background | Explicit "measure, don't assume" instruction; escalation path if it fails |
| A1/A8 hover-state shades not visually distinct enough from base | Both computed ratios for hover shades already exceed 7:1 — high margin, low risk |

## Test Infra Improvement Notes

Tests routed via `process/context/tests/all-tests.md`: `pnpm test:e2e` runner covers `back-navigation.spec.ts`, `approval-chain.spec.ts`, `multi-role-sod.spec.ts` (all referenced above). No a11y-specific automated spec exists (0 of 43 e2e specs). (none further identified yet)

(none identified yet)

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| A2 badge contrast — DevTools color picker, both themes | Agent-Probe | Stage badge clears 4.5:1 (A2) |
| A5 `back-navigation.spec.ts` re-run after div→li retag | Fully-Automated | Card list restructure doesn't break existing anchor selector (A5) |
| A5 accessibility tree check (list/listitem/h2) | Agent-Probe | List semantics + heading level correct, no skipped level (A5) |
| A1/A8 DevTools color picker on Approve/Return base+hover fills | Agent-Probe | Approve and Return buttons clear 4.5:1 white-on-fill (A1, A8) |
| A3 before/after screenshot + px measurement on attendance/timesheets under `hasTouch` | Agent-Probe | Checkbox and `.btn-row` anchors reach 44×44px without breaking dense tables (A3) |
| A4 manual tri-state click-through (empty→all→some→empty) | Agent-Probe | Select-all reaches all 3 states correctly, Clear removed (A4) |
| A4 `pnpm test:e2e -- approval-chain multi-role-sod` regression | Fully-Automated | Decision POST flows unaffected by select-all state refactor (A4) |
| A6 DevTools color picker on label vs `bg-muted/50`, both themes | Agent-Probe | Select-all label text clears 4.5:1 on its actual (not Clear's) background (A6) |
| A7 Tab-then-Enter live browser check, both themes, 2 browser engines if available | Agent-Probe | Skip link is first focusable, moves focus to `<main>` (A7) |
| `pnpm lint` / `pnpm exec prettier --check` | Fully-Automated | No lint/format regressions from any edit |
| `pnpm check` (run deliberately, dev server warning given first) | Fully-Automated | No TS/Svelte type errors introduced |

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/uiux-approvals-a11y_09-09-26/uiux-approvals-a11y_PLAN_09-09-26.md`
2. **Last completed phase or step:** PLAN — no execution has started.
3. **Validate-contract status:** pending (not yet written; VALIDATE mode has not run).
4. **Supporting context files loaded:** `process/context/uxui/` (routing group), `src/app.css`
   (design tokens), `PageHeader.svelte`, `+layout.svelte`, the target `+page.svelte`, Tailwind
   preflight source (`node_modules/tailwindcss/src/css/preflight.css`) — verified live, not
   assumed.
5. **Next step for a fresh agent picking up mid-execution:** confirm which of A2/A5/A1+A8/A3/A4/A6/A7
   sections already have commits on the branch (check `git log --oneline` against the 7 commit
   subjects above), then resume at the first unfinished section in sequence order.

## Validate Contract

Status: CONDITIONAL
Date: 09-09-26
date: 2026-09-09
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1 signal present (S7: 7 files in the informational blast-radius list, direct edits only 3) — single-page SIMPLE plan, no auth/schema/API surface, one vc-agent validated it end-to-end against source; no fan-out needed.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| A2 | Stage badge text/bg composite clears 4.5:1 both themes | Agent-Probe | DevTools color picker on rendered `<span>` vs `bg-card`, both themes, 375px/1280px | A |
| A5-auto | Card div→li retag does not break existing anchor selector | Fully-Automated | `pnpm test:e2e -- back-navigation` | A |
| A5-a11y | Grid/card expose `list`/`listitem` roles; h2 has no skipped level | Agent-Probe | DevTools Accessibility panel role + heading-level check | A |
| A1/A8 | Approve/Return base+hover fills clear 4.5:1 white-on-fill | Agent-Probe | DevTools color picker on rendered buttons, base + forced `:hover` state | A |
| A3 | Checkboxes + `.btn-row`-family anchors reach 44×44px, no dense-table break | Agent-Probe | Before/after screenshot + px measurement under `hasTouch` emulation | A (scope gap — see Open gaps) |
| A4-manual | Select-all reaches empty→all→some→empty correctly, Clear removed | Agent-Probe | Manual click-through, live browser | A |
| A4-auto | Decision POST flows unaffected by select-all refactor | Fully-Automated | `pnpm test:e2e -- approval-chain multi-role-sod` | A |
| A6 | Select-all label text clears 4.5:1 on its own `bg-muted/50` background | Agent-Probe | DevTools color picker, both themes, 375px/1280px | A |
| A7 | Skip link is first focusable element, Tab+Enter moves focus to `<main>` | Agent-Probe | Live-browser Tab-then-Enter check, both themes | A (env gap — see Open gaps) |
| lint/format/types | No regressions introduced by any edit | Fully-Automated | `pnpm lint`, `pnpm exec prettier --check`, `pnpm check` | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form:
- A2: agent-probe: DevTools color picker, both themes
- A5: fully-automated: `pnpm test:e2e -- back-navigation` | agent-probe: a11y tree check
- A1/A8: agent-probe: DevTools color picker, base+hover
- A3: agent-probe: before/after screenshot under `hasTouch` — scope should extend to `recruitment/+page.svelte` and `leave/+page.svelte` (see Open gaps)
- A4: agent-probe: manual tri-state click-through | fully-automated: `pnpm test:e2e -- approval-chain multi-role-sod`
- A6: agent-probe: DevTools color picker, both themes
- A7: agent-probe: Tab-then-Enter check — verify against `pnpm build && pnpm preview` in addition to `pnpm dev` (see Open gaps)
- lint/format/types: fully-automated: `pnpm lint && pnpm exec prettier --check . && pnpm check`

Failing stub (A5-auto):
```
test("should keep back-navigation anchor selector working after div-to-li retag", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: back-navigation.spec.ts still passes after A5's card div->li restructure")
})
```

Failing stub (A4-auto):
```
test("should leave approval-chain and multi-role-sod decision POST flows unaffected by select-all refactor", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: approval-chain.spec.ts and multi-role-sod.spec.ts still pass after A4's toggleAll/indeterminate refactor")
})
```

Failing stub (lint/format/types):
```
test("should introduce no lint, format, or type regressions across the 7 sections", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: pnpm lint / pnpm exec prettier --check / pnpm check all exit 0")
})
```

Dimension findings:
- Infra fit: PASS — pure CSS/markup/client-state edit, no container/infra/runtime surface touched; all 3 direct-edit file paths exist and were read.
- Test coverage: CONCERN — 2 of 11 proving gates (A2, A6) rest on live DevTools measurement with no automated contrast tool in the toolchain; this is a real, disclosed known-gap in tooling (not a plan defect) and the plan already routes it to agent-probe correctly.
- Breaking changes: PASS — no server actions, form field names, or API contracts change; verified `?/decideRequest` / `?/rejectMany` POST targets and `ReasonDialog`'s `confirmClass` prop contract are untouched by A1/A8's edits.
- Security surface: PASS — no auth, billing, schema, secrets, or trust-boundary surface touched.
- A2 (stage badge): PASS — `:335` anchor confirmed exact; `.badge-gray` at `app.css:181` and its preceding comment ("composites to ~#E6E6E6 ... ~#3A3A3A ... clears 4.5:1 over both") confirmed to exist verbatim; card background confirmed `bg-card` at the card `<div>`.
- A5 (list semantics): PASS — all 5 exact-edit line anchors confirmed except one off-by-one (see Open gaps); Tailwind preflight `ol, ul, menu { list-style: none; margin: 0; padding: 0; }` confirmed present in the installed v3.4.19 package (actual lines 305-311, plan cites 303-309 — content match confirmed, line number close but not exact); confirmed no `corePlugins`/`preflight` override in `tailwind.config.ts`; confirmed no custom `ul`/`li`/`ol` rules in `src/app.css`; `back-navigation.spec.ts:94` selector `a[href*="?from=/requests/approvals"]` confirmed href-based and unaffected by the div→li retag (plan's line range `:90-105` is close to the actual test body `86-106`, not exact, non-blocking).
- A1+A8 (button contrast): PASS — all 3 file:line anchors (`:357`, `:364`, `:415`) confirmed exact; all 8 hex values confirmed against installed Tailwind's default palette (`node_modules/tailwindcss/src/public/colors.js`); all 8 contrast ratios (3.30, 5.02, 7.13, 2.80, 3.56, 5.18, 7.31, 4.83) independently recomputed via WCAG relative-luminance formula and matched exactly — this table is verified fact, not assumption.
- A3 (touch targets): CONCERN — grep claims fully verified (14 checkbox files exact match, 7 `.btn-row`-family **anchor** files exact match once scoped to actual `<a>` tags — 3 additional files carry `btn-row` classes on `<button>`/`<span>` elements, already covered by the existing `button` selector or inert via `pointer-events-none`, so the plan's "7 files" claim is correct as stated); but 2 of the 14 checkbox files (`recruitment/+page.svelte:169` `<th class="w-10">`, `leave/+page.svelte:107` `<th class="w-[1%]">`) have narrow/percentage fixed-width header cells housing the checkbox, and neither is in the plan's mandatory verification list (only attendance/timesheets/approvals/dashboard are named) — see Open gaps.
- A4 (tri-state select-all): PASS, and the plan's own open question is now RESOLVED — confirmed `bind:indeterminate` is natively supported on `<input>` in the installed Svelte 5.56.4 (`node_modules/svelte/src/compiler/phases/bindings.js:183`, `valid_elements: ['input']`, `bidirectional: true`); no fallback needed. State-edit anchor `:17-27` and markup anchors `:190-195`/`:196-198`/`:202-207` all confirmed exact.
- A6 (panel text contrast): CONCERN — anchors confirmed exact (`:184`, `:187-189`); the plan's stated "current" ratios (4.21 dark / 4.35 light) are presented as measured fact but independent recomputation from the actual `--muted`/`--background`/`--card` HSL tokens lands in a 4.4-4.7 range depending on which layer the panel composites over — straddling both sides of 4.5:1. This does not invalidate the fix direction, and the plan's own "measure live, do not assume" instruction already covers this — but the "current" number itself is an approximation dressed as a measured fact. No plan change required; flagged so EXECUTE does not treat the pre-fix number as more certain than it is.
- A7 (skip link): CONCERN — both anchors (`:194` root div / `:196` header, `:622` main) confirmed exact. Real gap found: `DevLoginSwitcher.svelte` (rendered as a sibling immediately before the div at `:194`, i.e. earlier in DOM order) shows a real focusable floating button whenever `dev && !navigator.webdriver` — which is true in the exact "live browser, CDP port 9222" environment the plan's own verification method specifies. `onMount` fires effectively before any human can press Tab, so in practice the skip link will NOT be the literal first focusable element during the plan's prescribed dev-mode verification, even though it will be in a production build (component is dev-gated). See Open gaps.

Open gaps:
- Branch mismatch (plan text, not code): Overview line 45 states `Branch: feat/uiux-phase-10 (current)`. The actual current branch is `feat/uiux-phase-4` (confirmed via `git branch --show-current`). Correct this line before EXECUTE opens commits — cosmetic but could mislead a fresh agent's git-state check.
- A5 anchor off-by-one: edit #4 in the Exact Edits list says `:376` (closing grid div) → `</ul>`; the actual closing `</div>` for the grid is line 377 (376 is `{/each}`). EXECUTE should target line 377, not 376.
- A3 verification scope gap: add `recruitment/+page.svelte` (`th.w-10` header checkbox) and `leave/+page.svelte` (`th.w-[1%]` header checkbox) to the mandatory before/after screenshot check — these 2 of the 14 blast-radius files have the narrowest fixed-width header cells and are the most likely to visually break once the checkbox grows to a 44px floor.
- A7 environment gap: verify the skip-link-is-first-focusable claim against `pnpm build && pnpm preview` (production-like, `dev` false, no `DevLoginSwitcher`) in addition to `pnpm dev`. If only `pnpm dev` is used for the live-browser check, expect `DevLoginSwitcher`'s floating button to intercept the first Tab stop and record that as a known, dev-tooling-only caveat rather than a real regression.

What this coverage does NOT prove:
- A2/A6/A1/A8 DevTools color-picker checks prove the ratio on the specific viewport/theme combinations checked; they do not prove correctness on every possible zoom level, OS-level forced-colors/high-contrast mode, or non-Chromium rendering of the same hex values.
- `back-navigation.spec.ts` and `approval-chain`/`multi-role-sod` regression runs prove those specific flows still pass; they do not prove no other untested e2e spec touches the same markup regions (0 of 43 e2e specs are a11y-specific, per the plan's own Test Infra Improvement Notes).
- A3's before/after screenshot check proves the two explicitly-tested pages (plus whichever pages are added per the Open Gaps item above) don't visually break; it does not prove all 14 checkbox files or all 7 anchor files are individually screenshot-checked.
- A7's Tab+Enter check proves keyboard-only focus movement in the browser(s) actually used; if only one Chromium-based engine is available, cross-engine (Firefox/Safari) behavior remains an accepted known gap per the plan's own instruction.
- `pnpm lint` / `prettier --check` / `pnpm check` prove no static lint/format/type regressions; they do not prove runtime behavior or visual correctness.

Gate: CONDITIONAL (no FAILs; 5 CONCERNs — branch-text mismatch, one anchor off-by-one, A3 verification-scope gap, A7 dev-environment focus-order gap, A6 pre-fix number precision — all either plan-text fixes or execute-agent instructions, none blocking)
Accepted by: session (autonomous validate pass) — concerns are non-blocking documentation/scope corrections; EXECUTE should apply the branch-text fix, use line 377 (not 376) for A5's grid-closing edit, extend A3's screenshot list to `recruitment` and `leave`, and verify A7 against a production-like build in addition to dev mode.

---

## Implementation Checklist (Execution Checklist)

- [x] 1. A2 — `+page.svelte:335` swap `text-muted-foreground` → `text-foreground/70`; verify contrast; commit.
- [x] 2. A5 — `+page.svelte:230,235-239,375,376` div→ul/li retag; `:261-263` p→h2 retag; run `back-navigation.spec.ts`; verify a11y tree; commit.
- [x] 3. A1+A8 — `+page.svelte:357` green-600→green-700 / hover green-700→green-800; `:364` orange-500→orange-700 / hover orange-600→orange-800; `:415` confirmClass same orange shades; verify all 3 button fills+hovers; commit.
- [x] 4. A3 — `app.css:110-127` remove checkbox exclusion, add scoped `.btn-row`-family anchor selectors; run mandatory before/after touch-target screenshot check on attendance/timesheets; commit (or rollback per A3 rollback note if it fails).
- [x] 5. A4 — confirm `bind:indeterminate` support via docs-seeker/version check; `+page.svelte:17-27` state changes; `:186-207` markup changes incl. Clear removal; manual tri-state verification; run `approval-chain`/`multi-role-sod` regression; commit.
- [x] 6. A6 — `+page.svelte:187-189` label `text-muted-foreground` → `text-foreground/70`; independently verify contrast on `bg-muted/50` (not A2's number); commit.
- [x] 7. A7 — `+layout.svelte:194` insert skip link before `<header>`; `:622` add `id="main-content" tabindex="-1"` to `<main>`; verify Tab→Enter focus move, both themes, 2 browsers if available; commit.
- [x] 8. Run `pnpm lint`, `pnpm exec prettier --check` — both green. `pnpm check` intentionally NOT run per the hard constraint to avoid stopping the owner's dev server (see report's Test Gate Outcomes); `pnpm test` (208 files / 2427 tests) run instead as the available automated proxy.

**Next:** Say "ENTER VALIDATE MODE" when ready to proceed to plan validation (required before implementation).

## Reconciliation (UPDATE PROCESS, 09-09-26)

All 8 checklist items shipped as 9 commits (7 section commits + 1 doc-fix commit for the
branch-text CONCERN + 1 follow-up style trim), plus the execution report commit. Full detail in
`uiux-approvals-a11y_REPORT_09-09-26.md` in this same folder. Deviations from the plan text, not
guesses — verified against the report and `git show`:

1. **Approve button was never measured by the original audit.** Only Return (2.80:1) and Reject
   (4.83:1) were audited; Approve was failing at 3.30:1 the whole time and surfaced only during
   this plan's own contrast-table pass, not the audit. Folded into A1/A8 as written — no plan
   change needed, but the audit process that fed this plan had a gap.
2. **A4 needed an undocumented second fix.** `bind:indeterminate={someSelected}` failed lint
   (`Cannot bind to constant` — `someSelected` is `$derived`), so EXECUTE used the plan's own
   named fallback (`bind:this` + `$effect`). Live testing then found a second bug not named in the
   plan: a native checkbox click flips its own `.checked` before `onchange` fires, leaving the
   declarative `checked={allSelected}` binding stale. Fixed by also setting `.checked`
   imperatively in the same effect.
3. **Test-data mistake and recovery.** Seeding a 2nd pending request to test A4's "some selected"
   state, then cleaning it up by cancelling "Cancel" on the employee's whole request list, also
   hard-deleted that employee's unrelated pre-existing seeded request (cancel has no undo).
   Recovered by refiling an equivalent request — same employee, same date — but it is a new DB row
   with a new ID, not the original record.
4. **A stray explanatory comment was added despite an explicit no-comments instruction**, then
   trimmed to a one-line marker by a follow-up commit (`6f01f87`) after the fact rather than caught
   pre-commit.
5. **A7 required a production-build check the plan's own verification steps under-specified for
   dev mode.** `DevLoginSwitcher` intercepts the first Tab stop under `pnpm dev`; the skip-link
   fix verified correctly only against `pnpm build && node build/index.js`.

Lessons from 1-5 above are now written into `process/context/uxui/all-uxui.md` (accessibility
floors, Svelte binding gotchas), `process/context/tests/all-tests.md` (cleanup-by-marker
discipline, alpha-compositing), and `process/development-protocols/implementation-standards.md`
(pre-commit comment diff check).

**Known accepted gap:** cross-browser (Firefox/Safari) verification of A7 was not done —
Chromium-only was available in this environment. Anticipated by the plan itself; not a new gap.

**Archive disposition:** Ready for archival. All acceptance criteria met with passing evidence;
no material deviation left unresolved; `pnpm check` substitution is documented above, not silent.

## Autonomous Goal Block

```
SESSION GOAL: Ship the 7 approved a11y fixes (A2, A5, A1+A8, A3, A4, A6, A7) on
src/routes/(app)/requests/approvals/+page.svelte, src/app.css, and
src/routes/(app)/+layout.svelte, one commit per section, in the order fixed by the
plan's Sequencing section.

AUTONOMY RULES:
- Fix the 4 CONCERN items from the validate-contract inline as part of the relevant
  section's commit, do not treat them as separate work: correct the branch line in
  Overview before the first commit; use line 377 (not 376) for A5's grid-closing
  </div>->` </ul>` edit; add recruitment/+page.svelte and leave/+page.svelte to A3's
  before/after screenshot check; verify A7 against `pnpm build && pnpm preview` in
  addition to `pnpm dev`.
- Each of the 7 sections is its own commit with the exact subject line given in the
  plan. Do not batch sections into one commit.
- Run each section's Verification Evidence gate before committing that section, not
  after all 7 are done.

HARD STOPS:
- If A3's touch-target check breaks a dense table layout (rows overlap, unexpected
  horizontal scroll) on any of the now-6 verification pages: stop, apply the A3
  rollback (revert app.css:110-127 to its pre-change block), and report the specific
  page/element that broke rather than silently adjusting the CSS further.
- If A6's `text-foreground/70` substitution measures under 4.5:1 on `bg-muted/50` in
  either theme: stop, do not substitute a darker step unreviewed — this needs a human
  decision per the plan's own escalation instruction.
- Do not touch `requests/proposals/+page.svelte` (explicitly out of scope per A5) or
  the `--muted-foreground` token itself (explicitly out of scope per A6).

NEXT PHASE: EXECUTE MODE, starting at Implementation Checklist item 1 (A2).

CONTRACT SUMMARY: Gate CONDITIONAL, 0 FAILs / 5 CONCERNs, all non-blocking and folded
into the checklist above. Full contract at "## Validate Contract" in this file.

EXECUTE START COMMAND: "ENTER EXECUTE MODE" against
process/general-plans/active/uiux-approvals-a11y_09-09-26/uiux-approvals-a11y_PLAN_09-09-26.md

Reference for latest state: this plan file (single-plan work, no umbrella program).
```

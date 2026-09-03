---
name: report:phase-08-copy-a11y-s1-s3
description: "Phase 8 sections S1-S3 (items 1-21) — enum labels, the inquiries route rename, the login rebrand, the #182 noun ruling, and the R4 error-copy rewrite. Code done, gates green. S4-S6 run in parallel under a second agent."
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

# Phase 8 — sections S1-S3 (items 1-21)

**Branch:** `feat/uiux-phase-8` — three commits, one per section. Nothing pushed, no PR.

| Commit | Section | Subject |
|---|---|---|
| `f8fa640` | S1 | `feat(ui): render request, separation and review states through $lib/labels` |
| `c70f89c` | S2 | `refactor(ui): rename complaints to inquiries and rebrand login to Veent` |
| `0c5abd1` | S3 | `fix(ui): rewrite machine-voiced error and field copy in the user's words` |

## What Was Done

### S1 — enum labels (items 1-9)

Phase 03 had already done most of this section. `src/lib/labels.ts` exists with **all 25** enum maps
(not just the six S1 names), `labelFor` has the fallback the plan wanted, `Badge` renders through the
maps by `domain`, and `tests/unit/labels.test.ts` already asserted exhaustiveness against
`@prisma/client`. So S1 landed as a copy correction plus the sites `Badge` does not cover.

- **Items 2-6 (strings).** Applied the plan's S1 wording over phase 03's shorter labels, per the
  owner's "plan strings win" ruling. Ten strings changed across four maps. Each new label names who
  has to act next, which the enum word did not: `RETURNED` "Returned" → "Returned for changes";
  `SeparationStatus` OPEN/CLEARED → "Clearance in progress"/"Ready to finalize"; every `ReviewStatus`
  member ("Not started", "Employee self-assessment", "Scored by evaluator", "Awaiting signatures",
  "Acknowledged by employee"); plus `REST_DAY_WORK` → "Rest-day work" and `INFO_UPDATE` →
  "Information update".
- **Item 7 (adoption).** Only three genuinely raw sites remained in the eight named files:
  `separations/+page.svelte` `{s.type}`, `separations/[id]` `{s.type}`, and the undo banner's
  `{form.status}`. All three now go through `labelFor`. Every other site in those files was already
  a `Badge` prop.
- **Item 8.** New `REPORT_COLUMN_LABELS` map (48 keys) and `reports/[type]` renders headers through
  it. `TotalGross` reads "Total gross pay". `CURRENCY_COLS`, the row-object keys and the CSV header
  are untouched — those are data keys.
- **Item 9.** Recruitment's and complaints' maps were already relocated into `$lib/labels` by phase
  03. Nothing touched.

### S2 — naming and routes (items 10-17)

- **Items 10-11.** `complaints/` → `inquiries/` (4 files moved). Four redirect stubs created at
  `complaints/` and `complaints/[id]` — server + page component each, copying the `/approvals` shape,
  because SvelteKit will not build a `+page.server.ts`-only route. Referrers updated:
  `src/lib/nav.ts`, the two in-page `href`s, and the four notification link targets in
  `src/lib/server/services/complaints/index.ts` (the literals VALIDATE authorized). The module path,
  the Prisma models, the audit entity names and the test file names still say *complaint*.
- **Item 12.** Login title, logo (`/veent-logo.png`), footer and comments read Veent HRIS.
- **Item 13.** Comment reword on the tenant query only. The query, `loginSchema` and the flow are
  byte-untouched (AC5). Backlog note written:
  `process/features/ui-ux-overhaul/backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md`.
- **Item 14 (owner's #182 ruling, unblocked).** A physical location is a **Store** on every surface;
  `/team` is **Team** for every tenant. Applied to `nav.ts` (the tenant-conditional label is gone),
  `branches/+page.svelte` (all visible copy), `team/+page.svelte` (title and heading), and the
  employees branch filter (`aria-label`, "All stores", the `Store` column header, the empty state).
  `attendance` and `timesheets` carry no branch/store filter — verified, nothing to change.
- **Item 15.** `separations/[id]` and `inquiries/[id]` titles no longer carry a person's name or the
  inquiry subject. All other route titles verified to end `— Veent HRIS`.
- **Item 16.** The Supervisors card "Primary" value reads `Last, First`.
- **Item 17.** The separations row action was "Open" — both the wrong verb for a decision surface and
  a word that names a separation status. Now "Review".

### S3 — copy quality (items 18-21)

- **Item 18.** The INFO_UPDATE field is a two-option `<select>` (Home address → `contactAddress`,
  Mobile number → `contactPhone`), exactly the keys `resolveInfoUpdateColumn` accepts. Presentation
  only — the action and the Zod schema are unchanged.
- **Item 19.** "Link to your resume" → "Link to the applicant's resume". It was the only
  second-person string on that HR-facing form.
- **Item 20.** Phase 04 did **not** differentiate this one — both actions returned a bare
  `{ success: true }` into one banner, so a multipliers save reported "Payroll configuration saved".
  Each action now returns its own name and the banner picks the sentence, with the old generic string
  as the fallback. This was a real build, not verify-only.
- **Item 21.** All 10 strings rewritten. `'Invalid email or password'` untouched (R5).

## Plan Deviations

| # | Deviation | Why |
|---|---|---|
| 1 | Item 21 is **23** call sites, not the plan's 16 | The plan's own table lists 23 line numbers; the "16 call sites" prose undercounts. `'Invalid range'` has 4, `'Invalid date'` 3, departments' fallback 2, holidays 2. All 23 rewritten. |
| 2 | One `Avipa` string deliberately left in `src/` | It is a comment **inside `loginSchema`**. AC5 requires that block byte-identical so "the auth flow was not silently changed" stays a plain empty diff. Rewording it would weaken the stronger check. The gate pins it as a single documented exception and asserts it is a comment, not rendered copy. Goes with the email-first plan. |
| 3 | Four **test** files edited that the plan does not list | Each pinned something my change moved, so they had to move in the same commit: `complaints-scoping` imported the moved route path; `complaints.test.ts` and `nav-sections.test.ts` pinned the `/complaints` link target; `nav-sections.test.ts` also pinned the roster label as `'Branches'` — i.e. it pinned the inversion the owner just killed. It now pins the ruling in both directions. `tests/e2e/branches.spec.ts` pinned "Add a branch"/"Add branch". |
| 4 | `(app)/team/+page.server.ts` lost its `isFoodService` field and one import | My change made them dead. Orphan cleanup of my own mess; no other reader exists. |
| 5 | Item 16's "Also reports to" list **not** flipped | Those names are built as `First Last` inside `src/lib/server/services/supervisors.ts:33`. Services are out of bounds for this phase, and the page only receives `s.name`. Named as a residual below. |
| 6 | The `DevLoginSwitcher` comment in `(app)/+layout.svelte` **not** reworded | That file belongs to the parallel S4-S6 agent and a concurrent edit would collide. The login-page mount was reworded. **Handed to the S4-S6 agent** — see Notes below. |
| 7 | Item 20 built rather than verified | See above — phase 04 left one banner for two actions. |

No hard-stop deviations. No schema, service logic, rbac, `components/ui` or `static/*` change.
Neither OWNER-DECISION item was silently built.

## Test Gate Outcomes

Full CI set in CI order, after each section. Final state, all green:

| Gate | Result |
|---|---|
| `pnpm format:check` | pass |
| `pnpm lint` | pass — 0 errors, 1 pre-existing warning (`CalculatorWindow.svelte:82`, untouched) |
| `pnpm check` | 1135 files, **0 errors**, same 1 pre-existing warning |
| `pnpm test` | **212 files / 2428 tests passed** (was 211/2385 at branch point) |
| `pnpm test:e2e tests/e2e/auth.spec.ts` (S2, by path) | **5 passed** |
| `pnpm test:e2e tests/e2e/form-errors.spec.ts` (S3, by path) | **3 passed** |

Full e2e not run — the orchestrator owns it.

New gates on disk (source scans, re-runnable, not shell one-liners in a report):

- `tests/unit/labels.test.ts` — extended: the scoped raw-enum adoption scan over the eight item-7
  files, a self-check that the regex can still see a raw enum, and `REPORT_COLUMN_LABELS` coverage
  against the keys `reports/[type]/+page.server.ts` declares.
- `tests/unit/copy-invariants.test.ts` — new, 43 tests: the `/complaints` URL scan (with a
  `(?<!services)` guard so the module path is not a false positive), the four stubs exist and 308,
  the Avipa/brand scan, the R2 title policy, the #182 noun ruling on both pages, and the R4 error
  table per file per string with the R5 negative control.

### Mutation checks (both confirmed RED, both restored)

**(a) Exhaustiveness.** Deleted `SIGNING: 'Awaiting signatures'` from `REVIEW_STATUS_LABELS`:

```
× ReviewStatus: every member has a non-blank label
  → ReviewStatus.SIGNING has no label: expected undefined to be truthy
× ReviewStatus: the map adds no key the enum does not have
  Tests  2 failed | 62 passed (64)
```

Restored → 64 passed.

**(b) Error strings.** Put `'Invalid dates'` back in `payroll/+page.server.ts`:

```
× routes/(app)/payroll/+page.server.ts: 'Invalid dates' is gone
× routes/(app)/payroll/+page.server.ts: says "Choose a period start date and end date."
  Tests  2 failed | 41 passed (43)
```

Restored → 43 passed.

Three of my own gates were **red on first run** and caught real defects in the gate design, not in
the code: `includes('/complaints')` matched the `services/complaints` import path; the Avipa scan
found the `loginSchema` comment; and the title check flagged two SVG chart tooltips (`<title>` inside
an `<svg>` is not a document title). All three fixed and documented in the test file.

## What Was Skipped or Deferred

- Sections **S4-S6** (items 22-40) — the parallel agent's scope.
- The `(app)/+layout.svelte` `DevLoginSwitcher` comment — handed over, see Notes.
- The keyboard walk, the screen-reader spot-check list, the live login spot-check and the
  `impeccable` audit — all Agent-Probe rows, none run here.

## Test Infra Gaps Found

- Still no component-render tier. Every markup change in S1-S3 is provable only by source scan,
  Playwright, or eyes. Backlog notes `a11y-component-test-harness_NOTE_03-09-26.md` and
  `component-test-dom-environment_NOTE_03-09-26.md` already carry this.
- No e2e spec covers `/inquiries` at all. The scan proves no `/complaints` string survives; nothing
  proves the page renders, the 308 fires, or an old bookmark lands. Worth one spec.
- The plan proposed `scripts/check-ui-invariants.mjs`. Not built — `tests/unit/copy-invariants.test.ts`
  does the same job inside the runner CI already executes, so a separate script would be a second
  place to forget.

## Known Gaps (residual — none is a terminal PASS)

| Gap | Status |
|---|---|
| ~40 other machine-voiced `fail(400)` strings outside the ten named files, incl. two more `'Invalid input'` (`employees/[id]:524`, `recruitment/[id]:79`) | Recorded here per the plan's own instruction. No note file yet — a follow-up sweep. |
| "Also reports to" renders `First Last` (R3) | `services/supervisors.ts:33` builds the string; services are out of bounds. One-line fix in a plan that may touch services. |
| Remaining raw enum renders | **Drift correction:** not "~13". A repo-wide scan now finds **four** (`benefits`, `dashboard`, `payslips`, `recruitment/[id]`), and all four already have finished maps in `$lib/labels`. Appended to `raw-enum-sweep-remaining-enums_NOTE_03-09-26.md`; it is now a small single-commit follow-up, not a second plan. |
| `static/veent-logo.png` is 934 KB vs `avipa-logo.png`'s 43 KB | Owner report item. `static/*` out of bounds. The logo now ships on the unauthenticated login page. |
| Whether the logo renders correctly at `h-16 w-auto`, and whether `favicon.png` still carries Avipa artwork | Owner live spot-check. |

## Closeout Packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-08-copy-a11y_PLAN_03-09-26.md`
- **Finished:** items 1-21 (S1, S2, S3), three commits.
- **Verified:** the full CI gate set in CI order, both named e2e specs by path, and two mutation
  checks proving the new gates can actually fail.
- **Unverified:** every Agent-Probe row — the keyboard walk, the screen-reader list, the live login
  and logo check, the `impeccable` audit. Plus: no gate proves `/inquiries` renders or that the 308
  fires.
- **Best next state:** `Keep in active/testing`. S4-S6 are still running, and phase 8's own
  completion rules require the owner's confirmation before `VERIFIED`. **CODE DONE for S1-S3.**

## Forward Preview

**Test infra found.** `vitest.config.ts` is `environment: 'node'` over `tests/unit/**`. Source-scan
tests (`destructive-confirms.test.ts`, now `copy-invariants.test.ts`) are the established pattern for
proving markup invariants — copy that shape rather than inventing another. E2E specs must be selected
**by file path**; `-g` filters test titles and silently selects zero.

**Blast radius changes.** `complaints/` no longer exists as a page — it is four redirect stubs, and
`inquiries/` is the real route. Anything referencing the old path must use `/inquiries`.
`src/lib/labels.ts` gained `REPORT_COLUMN_LABELS`. `team/+page.server.ts` no longer returns
`isFoodService`. `payroll/config`'s two actions now return `action: 'update' | 'updateRates'`.

**Commands to stay green.** `pnpm format:check && pnpm lint && pnpm check && pnpm test` — in that
order, because CI runs format first and skips the rest on failure. Prettier does not expand
`src/routes/(app)/**` as a glob (it reads the parens as a group), so pass explicit file paths.

**Dependency changes.** None. No new package, no schema change, no service-logic change.

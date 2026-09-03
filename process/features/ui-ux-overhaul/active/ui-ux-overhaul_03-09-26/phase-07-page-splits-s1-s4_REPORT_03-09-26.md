---
name: report:ui-ux-overhaul-phase-07-s1-s4
description: "Phase 07 sections S1–S4 — employees/[id] restructured into five URL-backed tabs, one emergency-contact surface, checkbox supervisors, per-employee reveal cache, edit-form signposting, Offboard danger zone."
date: 03-09-26
phase: phase-07
status: COMPLETE
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-07-page-splits_PLAN_03-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: phase-07
---

# Phase 07 — Sections S1–S4 execute report

**Scope executed:** S1 (A1–A6), S2 (B1–B6), S3 (C1–C5), S4 (D1–D5). S5–S7 (attendance,
settings IA, org/new/pagination) belong to other agents and were not touched.

**Branch:** `feat/uiux-phase-7`. Not pushed, no PR.

## Commits

| Section | Hash | Subject |
|---|---|---|
| S1 | `96a05ab` | feat(employees): put the 201 file behind five URL-backed tabs |
| S2 | `a763df7` | feat(employees): one emergency-contact surface, checkbox supervisors, reveal that survives a save |
| S3 | `6adf133` | docs(employees): say what each of the three edit forms is for |
| S4 | `f30c22b` | feat(employees): give Offboard its own danger zone on the Actions tab |

## Staleness / drift log

| Check | Finding |
|---|---|
| `action:` keys on the 21 actions (B1, SC-1) | **VERIFY-ONLY — no edit made.** All 21 actions already set `const action = '<name>'` and return it on both the success and every `fail()` path. `+page.server.ts` was NOT modified in this phase. Action count confirmed at **21**, matching the VALIDATE correction. |
| Scoped feedback (B2, C4, D1) | **VERIFY-ONLY — no edit made.** Phase 04 shipped the contract: `errorFor()` + the `actionError` snippet gate every error banner on `form.action`, and `submitFeedback()` raises success as a toast (`src/lib/utils/submit-feedback.svelte.ts`). Every one of the 21 actions already reports into its own card, including for an OFFBOARDED employee (the Documents / contacts / loans slots sit outside the `employmentStatus === 'ACTIVE'` Update Profile card). Errors carry `role="alert"` and successes `role="status"` via `Banner`'s own derive — nothing to add. |
| Phase 03 tab primitive (A1) | **None exists.** `src/lib/components/ui/` has no tabs component, so `EmployeeTabs.svelte` + `employee-tabs.ts` were created as the plan's fallback. |
| Phase 06 consolidation of the three edit forms (C3) | **Did NOT happen.** `?/update`, `?/changeCompensation` and `?/promote` are all still separate, so C1–C2 signposting ran as planned. |
| Phase 05 Offboard confirm (D2) | Present and preserved byte-for-byte: `offboardFormEl` + `openOffboardConfirm()` + `reportValidity()` + the kit `ConfirmDialog`. Only a wrapper `<section>`, an `<h2>Danger zone</h2>` and a consequence line were added around it; the inner `<h2>Offboard Employee</h2>` became an `<h3>` so the heading order stays legal. |
| D4 onboarding checkbox | **VERIFY-ONLY — already satisfied.** The manual step is already a real `<button type="submit">` with `aria-pressed` and `aria-label="{Check\|Uncheck} {step.label}"`. `app.css`'s coarse-pointer rule (`min-height/min-width: 44px` on `button`) already applies and beats the `h-4 w-4` sizing. **Phase 08 must SKIP its item 34 for this control.** |
| Line drift | Heavy, as predicted. The page was 1,822 lines at HEAD (not the audit's 1,812) and every line range in the plan's A4 note was stale. All edits were anchored on markers, never line numbers. |

## What was done

**S1 — tab shell.** `src/lib/components/employees/employee-tabs.ts` exports `TabId`, `TABS`,
`resolveTab()` and `hrefFor(url, tab)`. `hrefFor` clones the current URL's params and sets only
`tab`, so `?from=` survives (the `Pagination.svelte` recipe). `EmployeeTabs.svelte` renders
`role="tablist"` with one `<a role="tab" href>` per tab, `aria-selected`, `aria-controls`, roving
`tabindex`, and Arrow/Home/End keys; the click handler `preventDefault()`s a plain left-click and
calls `pushState`, so no `load` re-run — but the href alone still deep-links before hydration and
with JS off. Modified clicks and middle-click fall through to the browser. The strip is sticky
under the page header; `BackButton` and `PageHeader` stay outside every panel.

Five panels are always rendered and hidden with **both** `hidden={…}` and `class:hidden={…}`; the
panel wrapper carries no display utility of its own (the `grid` sits on an inner div), so a
Tailwind display class cannot beat `[hidden]`. Section assignment follows the plan's A4 table.

**S2.** Emergency contacts collapsed from three surfaces to one: the read-only singular card and
the three legacy inputs inside Update Profile are gone; the plural section is canonical. When all
three legacy columns are non-empty **and** no relation row matches that name, one extra read-only
`Legacy record` row renders with the plan's exact copy. No schema change, no data write, and
`?/update` still accepts the legacy fields server-side.

Supervisors moved from `<select multiple size=4>` to a checkbox fieldset (`max-h-48
overflow-y-auto`), same `name="supervisorIds"`, same action, same guard; the Ctrl/Cmd hint is
deleted. The server reads `formData().getAll('supervisorIds')`, which is shape-identical.

Reveal cache (B5 + B5a, OD-1) — see the next section.

**S3.** The three purpose statements were added verbatim under each heading, with cross-links
(`?tab=compensation#change-salary`, `?tab=compensation#promote`) and matching container ids
(`update-profile`, `change-salary`, `promote`). No action, field, name or guard changed.

**S4.** Danger zone as above; the Employment History panel moved into the History tab byte-for-byte
and still un-masks from the same `?/reveal` payload (now via the cache).

## B5a — reveal cache shape chosen

Client-only. **SC-2 was NOT taken** — `+page.server.ts` was not modified at all. The plan's stated
fallback trigger (a redirecting action) cannot occur: no action on this page redirects.

```
type FormResult = NonNullable<ActionData>
let revealCache = $state<{ id: string; revealed: FormResult['revealed']; history: PageData['history'] } | null>(null)
$effect(() => {
  const f = form as FormResult | null
  if (f?.action === 'reveal' && f.revealed)
    revealCache = { id: data.employee.id, revealed: f.revealed, history: f.history ?? data.history }
})
const revealed = $derived(revealCache && revealCache.id === data.employee.id ? revealCache.revealed : null)
const history  = $derived(revealCache && revealCache.id === data.employee.id ? revealCache.history  : data.history)
```

Invariants held: the cache is written **only** under `f.action === 'reveal'`, so no other action's
payload can populate it; every read is gated on `revealCache.id === data.employee.id`, so an
A→B client-side navigation renders B masked; it is never written to `sessionStorage`,
`localStorage` or `$page.state`; there is no second `revealEmployeeSensitive` call and no second
audit row; a full reload remounts the component and re-masks. The `#111` posture comment at the
top of the page was rewritten to describe the new behavior and to state **why** the key exists
(the write-A-onto-B path).

## Test gate outcomes

| Gate | Command | Result |
|---|---|---|
| G2 (AC-2) | `npx vitest run tests/unit/employee-tab-resolve.test.ts` | GREEN — 6 tests. Written red first (module absent), then implemented. |
| G1 `check` | `pnpm check` | GREEN — 0 errors, 1 warning (pre-existing `CalculatorWindow.svelte`, untouched by this phase). |
| G1 `test` | `pnpm test` | GREEN — 210 files, 2371 tests. |
| B6 targeted | `npx vitest run tests/unit/employee` (13 files) + `audit-log-reveal.test.ts` | GREEN — 104 + 19 tests. |
| G1 `format:check` | `pnpm format:check` | GREEN. |
| G1 `lint` | `pnpm lint` | GREEN — 0 errors, the same 1 pre-existing warning. |
| AC-21 | `git diff --stat` over `src/lib/rbac.ts`, `prisma/schema.prisma`, `src/lib/server/services/**`, `src/lib/components/ui/**` | Empty — none touched. `employees/[id]/+page.server.ts` also untouched. |

TDD mode used: Mode A (red-first hard gate) for `employee-tab-resolve.test.ts`. Everything else in
S1–S4 is markup with Agent-Probe / Hybrid gates (G5, G6, G7, G13, G14), which are Mode B and remain
**unrun** — they need a running app and DB, which only the owner starts.

## Plan deviations

1. **Pure functions live in `employee-tabs.ts`, not in `EmployeeTabs.svelte`'s module block.** The
   plan named the component; a `<script module>` export would need the Svelte plugin inside vitest
   to be unit-testable. Same directory, same exports, component consumes them. Within blast radius.
2. **The tablist is a `<div role="tablist">`, not a `<nav>`.** svelte-check rejects an interactive
   role on a `<nav>` (`a11y_no_noninteractive_element_to_interactive_role`), and putting the
   keydown handler on the container demanded a container `tabindex`. The handler sits on each tab
   anchor instead — same roving pattern, zero warnings.
3. **Leave Balances → Overview.** The plan's A4 table never assigns this section. It is read-only
   personal record data, so it went to Overview. Flagged for the S5–S7 / phase-08 agents in case
   the owner wants it under Compensation & Payroll.
4. **DOM moves.** A4 says "wrap without editing contents". Two sections had to *move* (contents
   unchanged) because panels must be contiguous: **Benefits** now leads Compensation & Payroll, and
   **Documents** now sits after Promote in DOM order. Every other section is wrapped in place.
5. **Empty-fieldset line added to Supervisors** (`No other employees to pick from.`) — the old
   `<select>` degraded to an empty box; an empty bordered fieldset reads as broken. One line.
6. **No reveal error slot.** B2 implies one; `?/reveal` cannot return `fail()` — it either succeeds
   or throws (`requireAnyCapability`, or a service throw), so there is no `form.error` to render.
   See Known gaps.
7. The whole file was re-run through Prettier after the wrap, so the S1 diff is large by line
   count (re-indentation) but small by content.

## Known gaps found (not silently dropped)

- **G5's "force a failure in a reveal" is not reachable through the form-result path.** A failing
  `?/reveal` throws and lands on SvelteKit's error page rather than in a scoped banner. Closing that
  would mean changing the server action's contract (out of this phase's server allow-list — SC-1
  and SC-2 only). The rest of G5 (a forced document-upload failure on an OFFBOARDED employee) is
  fully reachable and unaffected. Recommend the probe runner substitute the upload failure and
  record the reveal arm as N/A.
- Gates **G5, G6, G7, G11, G13, G14** are all unrun — they need the app and `veent-db-5434`, which
  the owner starts. S1–S4 are therefore **CODE DONE, not VERIFIED**.

## Forward preview

**Test infra found.** No component-test harness in this repo (confirmed — `settings-cards.test.ts`
states the precedent). Unit tests reach pure modules only; `npx vitest run <path>` filters,
`pnpm test -- <name>` does not.

**Blast radius changes.** `src/lib/components/employees/` gained two files. `employees/[id]/+page.svelte`
is now panel-structured — any later edit must land the section inside the right panel or it is
invisible. `employees/[id]/+page.server.ts` was NOT touched, so it is free for another agent.

**Commands to stay green.** `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

**Dependency changes.** None. No new npm package.

**For the S5–S7 agents.** `settings-destinations.ts`, `settings/+layout.svelte`, the attendance
components and the three paginated lists are untouched by this work; there is no file overlap with
S1–S4 apart from the shared plan file. OD-2 and OD-3 are still open for S6/S7.

**For phase 08.** (a) Skip item 34 — the onboarding manual-step control is already a real button
with an accessible name under the 44px floor. (b) Copy work on this page must respect the tab
structure; the three purpose statements and the Danger zone copy are settled here. (c) The
`Legacy record` row's copy says "Add it as a contact above" while the add form renders *below* the
table — kept verbatim per the plan, but it is a candidate for phase 08's copy pass.

## Closeout packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-07-page-splits_PLAN_03-09-26.md`
- **Finished:** S1, S2, S3, S4 — four commits, each gated before commit.
- **Verified:** all fully-automated gates (format, lint, check, unit). **Unverified:** every
  Agent-Probe / Hybrid gate (G5, G6, G7, G11, G13, G14) — app + DB required.
- **Remaining:** S5–S7 (other agents), the live probes, the phase-wide report, and the
  blast-radius registry status line (left unset on purpose — phase 07 is not complete until S7).
- **Best next state:** keep the plan ACTIVE. S1–S4 are CODE DONE, not VERIFIED.

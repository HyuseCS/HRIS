---
name: plan:phase-08-copy-a11y
description: "Phase 8 of the Veent HRIS UI/UX overhaul — copy, naming and accessibility applied to the final structure. Consumes audit T8, T9, per-area P2/P3 and addendum F. Last phase."
date: 03-09-26
feature: ui-ux-overhaul
phase: "08"
---

# Phase 8 — Copy + Accessibility

**Date**: 03-09-26
**Status**: PLANNED
**Complexity**: COMPLEX (phase 8 of 8 in the `ui-ux-overhaul` phase program)
**Feature:** ui-ux-overhaul
**Umbrella:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md`

**TL;DR** — Last phase. Two jobs: stop showing raw database words to people, and make every
repeating interaction pattern usable with a keyboard and a screen reader. Six commits, grouped by
concern. Nothing new is invented — every label map, focus trap and error-scroll mechanism already
exists somewhere in this repo and is copied. Two items are **not** decided here and wait on the
owner: the login tenant list and the dev login switcher.

---

**Primary execute anchor:** this file is the single execute-anchor plan for phase 8. There are no
supporting phase files for this phase — every checklist item lives here. EXECUTE receives this exact
path and nothing else; the umbrella plan is context, not an execution target.

## Overview / Context

Phase 8 runs last on purpose. Copy is written onto the final nav labels (phase 2) and the final page
structure (phase 7); semantics are applied to the final markup. Re-applying either after a
structural move would be wasted work.

**Upstream sources (read, do not re-derive):**

- `docs/ui-ux-audit-2026-09-03.md` §T8 (accessibility debt in repeating patterns)
- `docs/ui-ux-audit-2026-09-03.md` §T9 (copy, naming, brand drift)
- `docs/ui-ux-audit-2026-09-03.md` §4 — the per-area P2/P3 items this phase owns (audit-log filter
  state, audit-log entity IDs, reports raw column headers, onboarding checkbox target, the emoji
  paperclip, the separations/complaints title leak, the payroll override asterisk, the schedules
  On/Off pill)
- `docs/ui-ux-audit-2026-09-03.md` addendum §F (long-page error placement — the two-file
  `scrollIntoView` mechanism to copy)
- `docs/ui-ux-audit-2026-09-03.md` §5 items 6 and 8 — do-not-break cross-check
- `docs/ui-ux-audit-2026-09-03.md` §6 — Sam (screen reader/keyboard) and Jordan (first-time
  employee) red-flag lists are this phase's acceptance narrative

**Context loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`,
`process/context/uxui/all-uxui.md`, `process/context/tests/all-tests.md`.

**Entry dependencies:**

| Depends on | What phase 8 needs from it | If missing at research-refresh |
|---|---|---|
| Phase 3 (`design-system`) | `$lib/labels` (or the equivalent `$lib` module holding `typeLabels`/`statusClass`) exists and is the single home for label maps | Phase 8 creates `src/lib/labels.ts` following phase 3's `$lib` conventions and records the deviation in the phase report — phase 8 is the largest consumer, so it may not block on the module's absence |
| Phase 3 (`design-system`) | The shared Dialog primitive with the focus trap + Escape + focus-restore | **Hard blocker** for section S5. Do not hand-roll a second trap. Escalate to the orchestrator. |
| Phase 7 (`page-splits`) | Final tab names on `employees/[id]` and `attendance`; final settings destination names | **Hard blocker** for section S2's title/naming sweep on those pages only. Other S2 items proceed. |
| Phase 2 (`nav-ia`) | The Stores/Branches noun ruling per tenant, recorded in the phase-02 report | **Hard blocker** for the S2 noun sweep. See "Naming Ruling Dependency" below. Phase 8 does not invent the noun. |
| Phase 4 (`feedback-contract`) | The `{ action, error?, saved? }` return shape and the `role="alert"` scoped-error convention | Phase 8's error-message rewrites are string-only and land inside whatever shape phase 4 settled. Phase 8 does not change return shapes. |

### Naming Ruling Dependency (read before starting S2)

Today the food-service tenants carry an inverted pair: the sidebar label **"Branches"** points at
`/team` (the people roster) and the label **"Stores"** points at `/branches` (the physical-location
registry) — a deliberate #182 collision-avoidance choice, commented in
`src/routes/(app)/+layout.svelte:199-222`.

**Phase 2 owns the ruling. Phase 8 owns applying it to non-nav surfaces** — page `<title>`s, `<h1>`s,
button text, filter labels, empty states, and table column headers.

If the phase-02 report contains no explicit noun table, section S2's noun sweep is `BLOCKED-ON-PHASE-02`
and the research-refresh step raises it to the orchestrator. **Phase 8 must not pick the noun itself**
— doing so would silently re-decide a #182 decision that a different phase owns.

*Advisory only, for the orchestrator's convenience, not a phase-8 decision:* the minimum-diff
resolution is to keep the route nouns as the source of truth (`/branches` = "Branches" = physical
locations; `/team` = "Team" = the roster) and let phase 2 rule on whether the tenant-facing word for
a physical location is "Branch" or "Store".

### Method caveat carried forward

The audit was source-only. Every accessibility claim in this plan is a code-level claim. The keyboard
walk and the screen-reader spot check in the exit gate are the first time any of it is observed live.

---

## Goals

1. No raw database enum reaches a user's eye anywhere in the app.
2. One noun per concept per tenant, on every surface, not just the sidebar.
3. Every error message names what the person should do next, in words they used.
4. Every repeating interaction pattern (row link, drawer, popover, toggle, checkbox) is operable with
   a keyboard alone and announced correctly by a screen reader.
5. No status is signalled by colour alone.
6. Browser tab titles stop leaking who a sensitive record is about.

## Scope

### In scope

Everything in sections S1–S6 below.

### Out of scope (owned by phases 01–07 — do not touch)

| Not this phase | Owner |
|---|---|
| The `/approvals` redirect, the audit-log inbound link, the rating-row key, the Toaster `aria-live`, the four silent success surfaces | Phase 1 |
| Sidebar grouping, sidebar labels, the payroll tab sub-nav, the settings hub grouping, the MANAGER nav gate narrowing, the **noun ruling itself** | Phase 2 |
| Creating Badge/StatusPill, the banner recipe, the light/dark colour pairs, `PageHeader`/`EmptyState`/`Table` adoption, the shared Dialog primitive and its focus trap, the `$lib` extraction of `statusClass`/`typeLabels` | Phase 3 |
| The `{ action, error?, saved? }` return contract, the toast-on-success sweep, `ConfirmButton`'s result-waiting rebuild, the `handleError` hook, the `e.message` leak, `markAllRead` | Phase 4 |
| Adding confirms to destructive actions; removing native `confirm()` | Phase 5 |
| Choosing which duplicate surface is canonical; the four-inbox merge; the runs↔periods explanation | Phase 6 |
| Splitting `employees/[id]`, `attendance`, `settings/org`, `employees/new` into tabs/sections; Pagination on unbounded lists | Phase 7 |
| Reworking the `<select multiple size=4>` "Ctrl/Cmd-click" supervisor picker at `employees/[id]/+page.svelte:398-417` into a checkbox list or equivalent | **Phase 7** — orchestrator scope reconciliation 03-09-26. The umbrella's phase-8 prose lists this T8 item, but it is a form rework inside the `employees/[id]` tab restructure that phase 7 owns. Phase 8 does **not** touch this control. Phase 8 only reads the same file for the name-order flip (item 16) and the onboarding checkbox (item 34), neither of which is this `<select>`. |

Also out of scope program-wide: `prisma/schema.prisma`, `src/lib/rbac.ts` (read-only), any
service-layer logic, any new npm dependency, any new colour token.

---

## Design Rulings Locked Here

These are decided now so EXECUTE makes no creative calls.

**R1 — Row links.** The audit says "replace `role="link"` on `<tr>` with the pattern the leave page
already uses". That wording is ambiguous: `leave/+page.svelte:150` still carries `role="link"` on its
`<tr>`. What the leave page actually does right is *guard* the click and keydown handlers so an
interactive child (checkbox/label) is not hijacked. **The ruling:** put a real `<a>` in the row's
primary/name cell (that is the accessible, copyable, middle-clickable link), keep the whole-row click
as a mouse convenience, drop `role="link"` and `tabindex="0"` from the `<tr>`, and keep the leave
page's `closest('input, label')` guard on the row handler. Screen-reader users get a table with a
link in it; mouse users lose nothing.

**R2 — Title policy.** `<title>` = `{record type} — {section} — Veent HRIS`. A person's name or a free-text
subject may appear **only** where the record *is* that person and the page carries no adverse
inference: `employees/[id]` and `recruitment/applicant/[applicantId]` keep their names.
`separations/[id]` and `complaints/[id]` lose theirs — a separation or an inquiry is itself the
sensitive fact. Every title ends `— Veent HRIS`; `separations/[id]` currently does not.

**R3 — Name order.** `Last, First` everywhere a person appears in a list, a table cell, a `<select>`
option, or a definition list. Free-flowing prose keeps `First Last`. The roster and the existing
supervisor `<option>` list already use `Last, First`; the Supervisors card's "Primary" value does not
— that is the flip the audit names.

**R4 — Error message shape.** `{what went wrong or is missing} + {what to do}`, in the person's
vocabulary, one sentence, ending in a period. Never a field name, never an id, never a type name.

**R5 — Login credential message stays.** `'Invalid email or password'` is deliberate
non-enumeration (`(auth)/login/+page.server.ts:37,56` and its comment). R4 does **not** apply to it.
Do not "improve" it.

---

## Implementation Checklist

Six sections. One commit per section. Test gates run at the end of each section, not batched.

### S1 — Enum labels (concern: *enum labels*)

Adopt `$lib/labels` so no raw enum renders.

1. Confirm `$lib/labels` exists with the export shape phase 3 settled. If absent, create
   `src/lib/labels.ts` and record the deviation.
2. Add `requestTypeLabel` for `RequestType` (`prisma/schema.prisma:92-100`): LEAVE → "Leave",
   OVERTIME → "Overtime", UNDERTIME → "Undertime", OFFICIAL_BUSINESS → "Official business",
   REST_DAY_WORK → "Rest-day work", HOLIDAY_WORK → "Holiday work", INFO_UPDATE → "Information update".
3. Add `requestStatusLabel` for `RequestStatus` (`:102-108`): PENDING → "Pending", APPROVED →
   "Approved", REJECTED → "Rejected", RETURNED → "Returned for changes", CANCELLED → "Cancelled".
4. Add `separationTypeLabel` (`:1069-1072`): RESIGNATION → "Resignation", TERMINATION → "Termination".
5. Add `separationStatusLabel` (`:1074-1078`): OPEN → "Clearance in progress", CLEARED → "Ready to
   finalize", FINALIZED → "Finalized".
6. Add `reviewStatusLabel` for `ReviewStatus` (`:254-261`): PENDING → "Not started",
   SELF_ASSESSMENT → "Employee self-assessment", SCORED → "Scored by evaluator", SIGNING →
   "Awaiting signatures", COMPLETED → "Completed", ACKNOWLEDGED → "Acknowledged by employee".
7. Adopt at every raw-enum render site **for the six enums mapped in items 2-6**:
   `performance/+page.svelte:163` and `:207` (`{review.status}`), the `separations/` list
   (`:159`, `:166`) and `separations/[id]` (`:116`, `:125`), `requests/+page.svelte:423`,
   `requests/[id]:135`, `requests/approvals`, `leave/+page.svelte:191`. Sweep, do not guess.

   **VALIDATE scope correction — read before writing the gate.** A repo-wide grep at `5e5cdfe` finds
   **28** raw `{x.status}` / `{x.type}` interpolations in `src/routes/**/*.svelte`. Only about eight
   belong to the six enums this phase maps. The rest are *other* enums with no map in this plan:
   `payroll/+page.svelte:170`, `payroll/[id]:92`, `payslips/+page.svelte:56`, `payroll/periods:130`
   (payroll run/period status); `benefits/+page.svelte:276`, `profile/+page.svelte:351`,
   `employees/[id]:829` (enrollment status); `attendance/+page.svelte:622,780` (day status);
   `dashboard/+page.svelte:207` (last-run status); `recruitment/[id]/+page.svelte:65` (posting
   status); `settings/backup/+page.svelte:236` (backup status). `branches/+page.svelte:211` is a
   hidden input `value`, not a render.

   **Ruling:** the S1 gate is **scoped to the eight files above**, not a repo-wide zero-match. The
   other ~13 sites are a recorded known gap (`raw-enum-sweep-remaining-enums_NOTE_03-09-26.md` in
   `process/features/ui-ux-overhaul/backlog/`) — mapping six more enums is a second S1-sized commit
   and would push this phase past its stated blast radius. Do **not** silently widen the sweep, and do
   **not** write a repo-wide gate that cannot pass.
8. `reports/[type]/+page.svelte:236-241` — the table header renders the raw column key
   (`TotalGross`). Add a `reportColumnLabel` map in `$lib/labels` and render through it; leave the
   `CURRENCY_COLS` alignment set alone (phase 8 does not restructure the report).
9. Do **not** touch recruitment's or complaints' existing label maps beyond relocating them into
   `$lib/labels` if phase 3 has not already; they are the pattern being copied, not fixed.

**Section gate:** `pnpm test` (new `tests/unit/labels.test.ts`), plus the raw-enum grep gate
**scoped to the eight files named in item 7** — not repo-wide (see the ruling there).

### S2 — Naming and routes (concern: *naming*)

10. **Inquiries route alias.** Rename `src/routes/(app)/complaints/` → `src/routes/(app)/inquiries/`
    (both `+page.svelte`/`+page.server.ts` and the `[id]/` pair). Add
    `src/routes/(app)/complaints/+page.server.ts` and `src/routes/(app)/complaints/[id]/+page.server.ts`
    whose `load` does `redirect(308, '/inquiries')` and `redirect(308, \`/inquiries/${params.id}\`)`.
    **Each stub route also needs a `+page.svelte`** — SvelteKit will not build a route that has a
    `+page.server.ts` and no page component. Copy the shape of the existing precedent:
    `src/routes/(app)/approvals/` carries **both** a 245-byte `+page.server.ts` and a 91-byte
    `+page.svelte`. So four files, not two: `complaints/+page.server.ts`, `complaints/+page.svelte`,
    `complaints/[id]/+page.server.ts`, `complaints/[id]/+page.svelte`.
    This is the SvelteKit-conventional smallest diff: a `load`-only redirect stub, matching the
    `/approvals` redirect phase 1 already fixed. **Alternative rejected:** a `reroute` hook in
    `src/hooks.ts` — it rewrites the URL silently, so the address bar would keep saying
    `/complaints`, which is the exact defect being fixed.
11. **Keep the data keys.** `src/lib/server/services/complaints/`, the Prisma models, the audit-log
    entity names, and `tests/unit/complaints*.test.ts` keep the word *complaint*. Only the route,
    the visible copy, and the internal `href`s change. Update the non-route referrers. Verified
    inventory at `5e5cdfe`: `src/routes/(app)/+layout.svelte:187` (`href: '/complaints'`),
    `src/routes/(app)/complaints/+page.svelte:236` and `complaints/[id]/+page.svelte:49` (both move
    with the rename), and — **added by VALIDATE** —
    `src/lib/server/services/complaints/index.ts:124,176,182,226`, which build the *notification link
    target* stored on the notification row as `/complaints/{id}`. Those are user-facing navigation
    targets, not data keys, so they become `/inquiries/...`; the module path, the Prisma models and
    the audit entity names still keep the word *complaint*. The S2 grep gate must therefore match
    template-literal forms too, not only `href="/complaints`.
    `src/routes/(app)/+layout.server.ts` imports `countWaitingInquiries` only — no URL, no change.
12. **Login rebrand.** `src/routes/(auth)/login/+page.svelte`: `<title>Sign In — Avipa</title>` →
    `Sign In — Veent HRIS` (`:15`); `<img src="/avipa-logo.png" alt="Avipa">` →
    `src="/veent-logo.png" alt="Veent"` (`:21`); footer `Avipa · {year}` → `Veent HRIS · {year}`
    (`:127`); the `<!-- Avipa brand -->` comment and the `Two-step Avipa login (#135)` comment
    (`:9`) reworded. **Asset note: no owner action needed — `static/veent-logo.png` already exists.**
    Verify its rendered size at `h-16 w-auto` during the live spot-check; if it is visually wrong,
    that is a report item, not a licence to edit the asset.
13. `src/routes/(auth)/login/+page.server.ts:24` — reword the "every org is a login target under the
    Avipa brand" comment. **Do not change the query or the flow** — see OWNER-DECISION-1.
14. **Noun sweep.** Gated on the phase-02 ruling (see Naming Ruling Dependency). Apply the ruled
    noun to: `branches/+page.svelte:25` `<title>Stores`, `team/+page.svelte:28`
    `{data.isFoodService ? 'Branches' : 'Team'}`, and every `<h1>`, button, filter label and empty
    state on those two pages plus any branch/store filter on `employees`, `attendance` and
    `timesheets`.
15. **Title policy sweep (R2).** `separations/[id]/+page.svelte:59` →
    `<title>Separation — Veent HRIS</title>`. `complaints/[id]` (now `inquiries/[id]`)`:44` →
    `<title>Inquiry — Inquiries — Veent HRIS</title>`. Confirm the other 60 titles already conform;
    the full inventory is in the phase report's appendix. `employees/[id]:133` and
    `recruitment/applicant/[applicantId]:78` keep their names per R2.
16. **Name order (R3).** `employees/[id]/+page.svelte:380-382` — the Supervisors card "Primary"
    value renders `` `${firstName} ${lastName}` `` while the `<option>` list eight lines below
    renders `{lastName}, {firstName}`. Flip the Primary value to `Last, First`. Grep the same file
    and its siblings for other `firstName} ${` list renders and flip them; prose is exempt.
17. **Verb split.** One destination, one verb. Where a link opens a record for reading, the verb is
    "View"; where it opens a record for a decision, "Review". The periods→run mislabel
    ("Detail" opening a *run*) is **phase 6's** call on which surface is canonical — phase 8 only
    relabels once phase 6 has ruled. If phase 6's report has not ruled, skip and note it.

**Section gate:** `pnpm test` + `pnpm test:e2e tests/e2e/auth.spec.ts` (login) + a route-redirect
grep gate. **VALIDATE correction:** Playwright's `-g` filters on the *test title*, not the file name.
`-g "auth"` matches only `unauthenticated user is redirected to the login page` and misses
`valid credentials sign in and reach the dashboard` — the one test AC4 depends on. Select e2e specs
**by file path** everywhere in this plan.

### S3 — Copy quality (concern: *naming*, split for reviewable commit size)

18. **INFO_UPDATE field picker.** `requests/+page.svelte:305-320` — replace the free-text
    `name="field"` input (placeholder `e.g. contactAddress`) with a `<select name="field">` of the
    updatable fields, human-labelled. The option `value` stays the existing internal key so **the
    server action and its Zod schema are unchanged** — this is a presentation swap only.

    **VALIDATE pinned the key list — do not extend it.** `src/lib/server/services/requests/apply.ts:7-15`
    accepts exactly four keys onto two columns (`contactPhone` from `contactPhone`/`phone`;
    `contactAddress` from `contactAddress`/`address`). Every other value hits `if (!column) return null`
    at `apply.ts:55`, so the request **approves and writes nothing**. The select therefore carries
    exactly **two** options:

    | Label | `value` |
    |---|---|
    | Home address | `contactAddress` |
    | Mobile number | `contactPhone` |

    Personal email, emergency contact, bank account, civil status and surname are **deliberately not
    self-service** (`apply.ts:4-6` — they land with T164 and stay HR-only). Adding them would be a
    service change, which is out of bounds for this phase. If the owner wants more self-service
    fields, that is a new plan.
19. **Apply-page voice.** `recruitment/[id]/apply/+page.svelte:101-103` — "Link to your resume
    (Google Drive, Dropbox, etc.)" → "Link to the applicant's resume (Google Drive, Dropbox, etc.)".
    Sweep the rest of that form for second-person copy; it is an HR-only form.
20. **Config success banner.** `payroll/config/+page.svelte:34-40` says "Payroll configuration saved
    successfully." after any action, including a multipliers save. Make the message per-action by
    reading the action name phase 4 standardised into the form result: "Payroll frequency and cutoffs
    saved." / "DOLE multipliers saved." Fall back to the current generic string when the action name
    is absent.
21. **Message-quality pass (R4).** Rewrite the named bad strings. Exact sites and replacements:

| File:line | Current | Replacement |
|---|---|---|
| `payroll/calculator/+page.server.ts:31` | `Invalid input` | `Enter a basic rate and a period before calculating.` |
| `recruitment/+page.server.ts:50` | `Invalid input` | `Fill in the posting title, department and status.` |
| `departments/+page.server.ts:72,91` | `Invalid input` (fallback) | `Enter a department name.` |
| `departments/+page.server.ts:136` | `Invalid input` | `Choose a department and an employee.` |
| `attendance/+page.server.ts:222` | `Missing day id` | `That attendance row is no longer on screen. Reload the page and try again.` |
| `attendance/+page.server.ts:186,233,251,284` | `Invalid range` | `Choose a start date and an end date.` |
| `attendance/+page.server.ts:203` | `Invalid correction` | `Enter a valid time in and time out for this correction.` |
| `attendance/+page.server.ts:268,307,350` | `Invalid date` | `Choose a date.` |
| `payroll/+page.server.ts:46` | `Invalid dates` | `Choose a period start date and end date.` |
| `payroll/+page.server.ts:71` | `Missing run id` | `That payroll run is no longer on screen. Reload the page and try again.` |
| `payroll/[id]/+page.server.ts:171` | `Invalid decision` | `Choose Approve or Reject.` |
| `dashboard/+page.server.ts:180` | `Missing posting id` | `That job posting is no longer on screen. Reload the page and try again.` |
| `benefits/+page.server.ts:111` | `Invalid status change` | `That status change is not allowed from the plan's current status.` |
| `settings/posting-approvers/+page.server.ts:39` | `Missing department` | `Choose a department.` |
| `settings/holidays/+page.server.ts:59,99` | `Holiday ID is required` | `That holiday is no longer on screen. Reload the page and try again.` |
| `requests/approvals/+page.server.ts:115` | `Missing request id or invalid decision` | `Choose Approve, Return or Reject.` |

    That is 16 call sites across 10 distinct strings. `(auth)/login/+page.server.ts` is **excluded**
    by R5. After the rewrite, re-run the `fail(400` grep and list any remaining machine-voiced string
    in the phase report as a known gap rather than expanding scope.

**Section gate:** `pnpm test` + `pnpm test:e2e tests/e2e/form-errors.spec.ts` (by path — no test
title in that file contains the string `form-errors`, so `-g "form-errors"` selects zero tests).

### S4 — Row accessibility (concern: *row-a11y*)

22. Apply R1 to the **five** rows that carry `role="link"` at `5e5cdfe`:
    `employees/+page.svelte:109`, `requests/+page.svelte:395`, `leave/balances/+page.svelte:79`,
    `leave/+page.svelte:150`, `recruitment/+page.svelte:186`.

    **VALIDATE carve-out — `timesheets/+page.svelte:157-161` is NOT an R1 target.** That row has no
    `role="link"` and no URL: it calls `openReview(ts)`, which opens a modal. There is nothing to put
    in an `<a href>`. Give its name cell a real `<button type="button">` that calls `openReview`, drop
    the `tabindex="0"` from the `<tr>`, and keep the whole-row click as the mouse convenience — the
    same shape as R1, with a button instead of an anchor. Item 23's `preventDefault()` fix still
    applies to the row handler that remains.
23. **Timesheets Space-scroll bug.** `timesheets/+page.svelte:159` —
    `onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openReview(ts)}` has no
    `preventDefault()`, so Space both opens the modal and scrolls the page. Add it, matching
    `leave/+page.svelte:159-165`.
24. **Recruitment checkbox-navigation bug.** `recruitment/+page.svelte:186-196` — the checkbox cell
    stops `click` propagation but not `keydown`, so pressing Space on a row checkbox bubbles to the
    row handler and navigates away, losing the selection. Add the leave page's
    `closest('input, label')` guard to the row `onkeydown` (and `onclick`).
25. Each converted row keeps its existing `aria-label` intent on the new `<a>` (e.g.
    `aria-label={`Open ${leaveName(req.payload)} request`}` moves onto the anchor).
26. Cross-check §5 item 10: the team attendance matrix and its "Exceptions only" filter are not row
    links and must be left alone.

**Section gate:** `pnpm test:e2e tests/e2e/back-navigation.spec.ts tests/e2e/pagination.spec.ts
tests/e2e/employee.spec.ts tests/e2e/employee-view-only.spec.ts tests/e2e/leave-balances.spec.ts
tests/e2e/recruitment.spec.ts tests/e2e/posting-approver-sod.spec.ts
tests/e2e/timesheet-approval.spec.ts tests/e2e/onboarding-checklist.spec.ts
tests/e2e/tenancy-switch.spec.ts` + the `role="link"` grep gate + the keyboard probe on one converted
table. **VALIDATE correction (two parts):** (a) select by file path — `-g` filters test titles, and
neither `back-navigation` nor `pagination` appears in any title; (b) the plan's "six specs"
undercounts — at least ten specs drive `/employees`, `/leave`, `/timesheets` or `/recruitment` lists
at `5e5cdfe`.

### S5 — Dialogs and focus (concern: *dialogs-focus*)

27. **Mobile drawer.** `src/routes/(app)/+layout.svelte:346-350, 393-399` — the drawer opens with no
    focus move, no Tab trap, no Escape, and no focus restore to the hamburger. Consume phase 3's
    Dialog trap utility; do not write a second trap. On open: move focus to the drawer's first
    focusable element. On Escape or backdrop click: close and restore focus to the
    `aria-label="Open menu"` button. Add `aria-expanded` / `aria-controls` on the hamburger and
    `role="dialog"` + `aria-modal="true"` + `aria-label="Main menu"` on the drawer at the mobile
    breakpoint only — the same `<aside>` is the persistent desktop sidebar at `lg:` and must **not**
    become a dialog there.
28. **Nav landmark.** Add `aria-label="Main"` to the sidebar `<nav>`. If phase 2 already added it,
    skip and note.
29. **Org switcher.** The popover has no Escape and no listbox semantics. Two options, pick by what
    the markup actually is at research-refresh: (a) if it is a short static list of orgs, replace it
    with a native `<select>` + `onchange` navigation — smallest diff, free keyboard semantics; (b) if
    it carries per-row affordances a `<select>` cannot hold, give it `role="listbox"` /
    `role="option"` + `aria-selected`, roving `tabindex`, Escape-to-close and focus restore, via the
    phase 3 utility. **Preferred: (a).** Record which was chosen and why in the phase report.
30. Cross-check §5 item 6: the punch page's split `role="status"`/`role="alert"` regions are the
    model and are **not** to be touched.

**Section gate:** `pnpm check` + the keyboard probe on the drawer and the switcher.

### S6 — Remaining accessibility and per-area items (concern: *misc*)

31. **Override asterisk.** `payroll/+page.svelte:171` — `<span class="ml-1 text-yellow-500">*</span>`
    is colour-and-glyph only. Add `<span class="sr-only">, has a manual override</span>` inside the
    badge and a `title` on the asterisk. Confirm `sr-only` exists in `src/app.css`; if not, use the
    Tailwind default utility.
32. **Schedules On/Off pill.** `settings/schedules/+page.svelte:66` and `:267` — both are `<button>`s
    rendering `On`/`Off`. Add `role="switch"` + `aria-checked={...}` and an `aria-label` naming what
    is switched ("Track tardiness for {schedule name}").
33. **Approvals red dot.** Give the approvals-count indicator a text equivalent (`sr-only` count or
    a visible number). Colour alone is not a signal.
34. **Onboarding manual-step checkbox.** `employees/[id]/+page.svelte:190-203` — a 16px `✓` glyph
    button, below the 24px minimum and semantically a toggle button rather than a checkbox. Convert
    to a real `<input type="checkbox">` inside the existing form (submitted by an `onchange`
    `requestSubmit()`), keeping the `aria-pressed`→`checked` intent and the existing
    `aria-label`. If a real checkbox breaks the progressive-enhancement submit, fall back to keeping
    the button and raising the box to `h-6 w-6` (24px) — record which path was taken. Note: the
    `src/app.css` coarse-pointer 44px floor deliberately excludes checkboxes, so this is a
    desktop-size fix, not a floor change.
35. **Emoji paperclip.** `requests/approvals/+page.svelte:331` — replace the bare `📎` with an inline
    `aria-hidden="true"` paperclip `<svg>` matching the 24 existing inline icons' stroke style.
36. **`aria-current` follow-ups.** Phase 2 restructures the sidebar and is expected to add
    `aria-current="page"` to active nav links. There are currently **zero** `aria-current` attributes
    in `src/`. At research-refresh, grep again; add it to whatever active-state links phase 2 left
    uncovered — the payroll sub-nav tabs, the settings sub-nav, the phase-7 page tabs, and the
    Editor/Preview pane switch at `performance/templates/[id]:275-282` (which the audit flags as
    having no selected-state semantics — use `aria-selected` + `role="tab"` there, not
    `aria-current`).
37. **Error scroll-into-view adoption.** Copy the mechanism from
    `performance/templates/[id]/+page.svelte:80-90` — a `$effect` that, when an error exists,
    `tick()`s then `scrollIntoView({ behavior: 'smooth', block: 'center' })` on the first error node
    and focuses the field inside it. Adopt on the five long pages addendum §F names: `attendance`,
    `payroll/statutory-rates`, `requests/approvals`, `settings/roles`, `employees/[id]`. Respect
    `prefers-reduced-motion` by using `behavior: 'auto'` when it is set. This lands on top of phase
    4's scoped-error markup — **if phase 4 has already adopted the mechanism on these pages, skip and
    note.**
38. **Audit-log filter state.** `reports/audit-log/+page.svelte:54-115` — the filter selects never
    reflect the URL params, so after submit the active filters are invisible. Set each control's
    `value`/`selected` from `$page.url.searchParams` (or the `data` the load already returns). No
    change to the query itself.
39. **Audit-log entity IDs.** `reports/audit-log/+page.svelte:199` — truncated with no affordance.
    Add `title={fullId}` and a copy button using the same pattern as any existing copy affordance in
    the repo; if none exists, `title` alone plus `select-all` styling is acceptable — do **not** add a
    clipboard dependency.
40. **Login error box.** `(auth)/login/+page.svelte:72` — add `role="alert"` and fix `text-red-400`
    to a light/dark pair using phase 3's banner recipe. *Overlap note:* this is T8's item but sits
    inside phase 4's error-contract surface. Check phase 4's report first; if phase 4 already fixed
    it, skip and note.

**Section gate:** `pnpm format:check && pnpm lint && pnpm check && pnpm test` (full set — this is the
last section) + the colour-only grep gate + the screen-reader spot-check list.

---

## OWNER-DECISION (blocked — do not decide in EXECUTE)

Exactly two items. Both are planned but **not** built until the owner answers.

### OWNER-DECISION-1 — Login step 1 enumerates every tenant

**What it is.** `(auth)/login/+page.server.ts:22-28` loads *every* `Organization` row and
`+page.svelte:35-53` renders them as buttons to any anonymous visitor. That is a customer list on a
public page.

**What is proposed (built only on a "go").** Email-first login: step 1 asks for the email address;
the server resolves which org(s) that email belongs to and either proceeds straight to the password
step (one org) or shows only that person's orgs (more than one). The generic
`'Invalid email or password'` response is preserved for a non-existent email so the change does not
create a *new* enumeration oracle at the account level.

**Why it is blocked.** This changes an authentication flow, not a presentation. It touches
`loginSchema` (which currently *requires* `selectedOrg`), the rate-limit key shape
(`${ip}:${email}`), the audit rows written on login, and the #135 two-step design the owner
specified. It also has a real usability cost: a person who does not remember which workspace their
email is registered under currently recovers by looking at the list.

**Alternatives the owner can pick instead, in ascending effort:**

| Option | Effort | Effect |
|---|---|---|
| A. Do nothing | none | List stays public |
| B. Per-tenant login URLs (`/login?org=slug`) with no list rendered when the param is absent | small | Removes the list; needs the owner to distribute URLs |
| C. Email-first (the proposal above) | medium | Removes the list; no URL distribution needed |
| D. Email-first **and** rate-limit the org-resolution step | medium+ | C, plus closes the account-enumeration timing channel |

**Recommendation if the owner wants a default: C.** It removes the disclosure without changing what
anyone has to remember.

**Until answered:** phase 8 changes only the *comment wording* on that query (checklist item 13).
The query, the schema and the flow are untouched.

### OWNER-DECISION-2 — `DevLoginSwitcher` removal

**What it is.** `src/lib/components/dev/DevLoginSwitcher.svelte`, mounted in
`src/routes/(app)/+layout.svelte:6,354` and `(auth)/login/+page.svelte:3,130`, both with
`// TEMP DEV — remove before merge`. It is a floating pill that logs you in as any seeded user with
one click.

**Correction to the audit's framing — read this before deciding.** The audit says it is "already on
staging", which reads as a live exposure. It is not. The component gates itself twice: `import { dev }
from '$app/environment'` plus `if (dev && !navigator.webdriver)` inside `onMount`. Staging runs a
production build, so `dev` is `false` and the switcher never renders. The backing endpoint
`/api/v1/_dev/login-as` is separately dev-gated. **This is code hygiene and a "TEMP" comment that has
outlived its merge, not a live security hole.** No test references the component (grep of `tests/`
returns nothing).

**What is proposed (built only on a "go"):** remove both mounts and delete the component; leave
`/api/v1/_dev/login-as` in place, because the repo's strongest verification artifacts are ad-hoc
Playwright scripts that POST to it directly (see `process/context/tests/all-tests.md`).

**Why it is blocked.** It is the owner's own day-to-day role-switching tool for the live GUI walks
this program depends on — including this phase's exit gate. Deleting it mid-programme costs the owner
speed on every remaining live check.

**Options:**

| Option | Effect |
|---|---|
| A. Keep it, reword the comment to `DEV ONLY — dev-gated, never ships enabled` | Zero risk, removes the misleading "remove before merge" |
| B. Remove it now | Loses the owner's role-switch convenience for the rest of the programme |
| C. Remove it in a follow-up after phase 8's live gate passes | Keeps the tool through the last walk, then cleans up |

**Recommendation if the owner wants a default: C**, with A applied now as the interim.

**Until answered:** phase 8 leaves both mounts in place and changes nothing.

---

## Touchpoints

**Created**

- `src/lib/labels.ts` — only if phase 3 did not create `$lib/labels` (see entry dependencies)
- `src/routes/(app)/inquiries/` — the renamed `complaints/` route tree (4 files moved)
- `src/routes/(app)/complaints/+page.server.ts` + `+page.svelte`, and
  `src/routes/(app)/complaints/[id]/+page.server.ts` + `+page.svelte` — 308 redirect stubs (four
  files; the `+page.svelte` half is mandatory, see item 10)
- `tests/unit/labels.test.ts`

**Changed — copy/naming**

- `src/routes/(auth)/login/+page.svelte`, `src/routes/(auth)/login/+page.server.ts` (comment only)
- `src/routes/(app)/branches/+page.svelte`, `src/routes/(app)/team/+page.svelte`
- `src/routes/(app)/separations/+page.svelte`, `src/routes/(app)/separations/[id]/+page.svelte`
- `src/routes/(app)/performance/+page.svelte`
- `src/routes/(app)/requests/+page.svelte`, `requests/[id]`, `requests/approvals`
- `src/routes/(app)/leave/+page.svelte`
- `src/routes/(app)/employees/[id]/+page.svelte`
- `src/routes/(app)/recruitment/[id]/apply/+page.svelte`
- `src/routes/(app)/payroll/config/+page.svelte`
- `src/routes/(app)/reports/[type]/+page.svelte`
- 16 `fail(400, …)` call sites across 10 `+page.server.ts` files (S3 table)

**Changed — accessibility**

- `src/routes/(app)/+layout.svelte` (drawer, org switcher, nav landmark)
- `src/routes/(app)/employees/+page.svelte`, `leave/+page.svelte`, `leave/balances/+page.svelte`,
  `requests/+page.svelte`, `recruitment/+page.svelte`, `timesheets/+page.svelte` (rows)
- `src/routes/(app)/payroll/+page.svelte` (override asterisk)
- `src/routes/(app)/settings/schedules/+page.svelte` (switch semantics)
- `src/routes/(app)/reports/audit-log/+page.svelte` (filter state, entity ids)
- `src/routes/(app)/performance/templates/[id]/+page.svelte` (pane switch semantics)
- `src/routes/(app)/attendance/+page.svelte`, `payroll/statutory-rates`, `requests/approvals`,
  `settings/roles`, `employees/[id]` (error scroll-into-view)

**Read only**

- `docs/ui-ux-audit-2026-09-03.md`, `prisma/schema.prisma`, `src/lib/rbac.ts`,
  `src/lib/components/ui/**` (consumed, not modified — phase 3 owns it),
  `src/lib/server/services/complaints/**` (data keys unchanged)

**Out of bounds**

- `prisma/schema.prisma`, `src/lib/server/services/**`, `src/lib/rbac.ts`, `package.json`,
  `src/app.css` tokens, `static/*` assets

## Public Contracts

| Contract | Change | Consumer impact |
|---|---|---|
| `$lib/labels` exports | Phase 8 **adds** `requestTypeLabel`, `requestStatusLabel`, `separationTypeLabel`, `separationStatusLabel`, `reviewStatusLabel`, `reportColumnLabel`. It does not rename or remove anything phase 3 defined. | Additive only. No downstream phase remains. |
| URL surface | `/complaints` and `/complaints/[id]` become 308 redirects to `/inquiries` and `/inquiries/[id]`. Neither is deleted. | Bookmarks and any stored link keep working. |
| Form action names and payload keys | **Unchanged.** The INFO_UPDATE `<select>` posts the same `field` values the text input did; the error-string rewrites change message text only. | Zero server-contract movement. |
| Auth flow | **Unchanged.** `loginSchema` still requires `selectedOrg`. See OWNER-DECISION-1. | Nothing changes until the owner rules. |
| Capability table | **Unchanged, read-only.** | — |
| DB / Prisma | **Unchanged.** The word *complaint* stays in the schema, services and audit entity names. | — |

## Blast Radius

- **Files:** ~40 changed, 4 moved, 3 created, 1 test file created.
- **Packages/surfaces:** one SvelteKit app. Routes, page components, one `$lib` module, one root
  layout. No server services, no schema, no auth logic, no dependencies.
- **Risk class:** **medium-low.** No high-risk class from `vc-test-coverage-plan` is entered:
  no auth/identity change (OWNER-DECISION-1 is deliberately *not* built), no billing/credit logic,
  no migration, no public API contract, no deploy/container change, no permission or secret logic.
- **The two riskiest items and why:**
  1. **The route rename (item 10).** A missed `href` produces a redirect chain or a dead link. Mitigation:
     the redirect stubs mean no URL can 404, plus a grep gate proving zero `href="/complaints` remains.
  2. **The row-link conversion (item 22).** Five `role="link"` tables plus the timesheets button
     carve-out; **at least ten** existing e2e specs drive those lists (not six — VALIDATE recount).
     Mitigation: run the ten specs named in the S4 section gate, by file path, inside section S4
     rather than at the end.
- **What could break invisibly:** a label map that silently falls through on an enum value the map
  does not cover, rendering `undefined`. Mitigation: `tests/unit/labels.test.ts` asserts every map is
  **exhaustive against the Prisma enum member list**, not just that known keys resolve.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check && pnpm lint && pnpm check && pnpm test` green **in that order** (CI runs format first and skips the rest) | Fully-Automated | Phase exit criterion: the full CI gate set passes |
| `tests/unit/labels.test.ts` — every label map is exhaustive against its Prisma enum member list and returns no `undefined` | Fully-Automated | Goal 1 (no raw enum reaches a user) — proves the maps are total |
| Grep gate: zero raw `{x.status}` / `{x.type}` interpolations **in the eight files named in S1 item 7** (scoped, not repo-wide — 28 such sites exist and only ~8 belong to this phase's six enums) | Fully-Automated | Goal 1 — proves the maps are *adopted*, which the unit test cannot show |
| Grep gate: zero `role="link"` on a `<tr>` in `src/` | Fully-Automated | Goal 4 (row semantics) |
| Grep gate: zero `/complaints` in `src/` **in any string form** — `href="/complaints`, `'/complaints`, and the backtick template literals in `src/lib/server/services/complaints/index.ts` — excluding the four redirect-stub files themselves; zero `src="/avipa-logo`; all four redirect-stub files exist | Fully-Automated | Goal 2 (one noun per concept) + login rebrand |
| Grep gate: zero occurrences of the 10 replaced error strings in `src/routes/**/*.server.ts`, and `'Invalid email or password'` still present in `(auth)/login/+page.server.ts` (negative control for R5) | Fully-Automated | Goal 3 (actionable errors) — the negative control proves the sweep did not overreach into the auth message |
| Grep gate: no `<title>` in `src/routes/(app)/separations/` or `inquiries/` interpolates `firstName`/`lastName`/`subject` | Fully-Automated | Goal 6 (titles stop leaking) |
| `pnpm test:e2e tests/e2e/auth.spec.ts` green (by path — `-g "auth"` misses the sign-in test) | Fully-Automated | Login rebrand did not break sign-in |
| The ten specs named in the S4 section gate, selected **by file path**, no worse than the pre-phase baseline (record the baseline before section S4) | Hybrid — precondition: seeded DB + built app, and #287 flakiness means a baseline diff, not an absolute pass | Row conversions and the route rename did not break a working flow |
| **Keyboard-only walk of one full flow: file a leave request.** `/dashboard` → nav to Leave → open the file-leave form → complete and submit → open the filed request from the list. Tab/Shift-Tab/Enter/Space/Escape only, mouse untouched. Assert: focus is always visible; the mobile drawer traps Tab and closes on Escape restoring focus to the hamburger; Space on a row checkbox toggles it and does **not** navigate; Enter on a row's name link opens the request; the org switcher opens, moves with arrows or is a native select, and closes on Escape. | Agent-Probe | Goal 4 (keyboard operability) end-to-end, on the persona (§6 Sam) the phase is aimed at |
| **Screen-reader spot-check list** (see below) | Agent-Probe | Goals 1, 4, 5 — announcement correctness, which no grep can show |
| Live spot-check, light **and** dark mode: login page reads Veent HRIS with the Veent logo and lists no tenant orgs *only if OWNER-DECISION-1 was granted* — otherwise assert the list is unchanged and the brand is Veent | Agent-Probe | Login rebrand landed; the owner-decision boundary was respected |
| `impeccable` audit pass on the changed surfaces | Agent-Probe | Design-quality bar the CI gates cannot express |
| Regression: masked-reveal on `employees/[id]` still masks, reveals once, and writes its audit row | Hybrid — precondition: running app + DB | Do-not-break item 3 survived the phase |
| Regression: nav resolves for HR_ADMIN, MANAGER and an employee; nothing 403s that is shown | Hybrid — precondition: running app + seeded roles | Do-not-break item 1; the layout edits did not move a gate |

**Screen-reader spot-check list** (VoiceOver or NVDA; one pass, record verbatim what is announced):

1. `/employees` table — a row is announced as a table row with a link in the name cell, not as a link
   containing cells.
2. `/performance` — a review status announces "Employee self-assessment", never "SELF_ASSESSMENT".
3. `/separations` — a type announces "Termination" and the browser tab title announces
   "Separation — Veent HRIS" with no person's name.
4. `/payroll` — a run with an override announces ", has a manual override".
5. `/settings/schedules` — the On/Off control announces as a switch with its checked state and names
   what it switches.
6. Mobile drawer — opening announces the menu, Tab stays inside, Escape closes and focus returns to
   "Open menu".
7. Org switcher — announces as a listbox (or a native select) with the current org selected.
8. `/requests/approvals` — the document count announces as "3 documents", with no emoji read aloud.
9. `/attendance` — a failed grid edit moves focus/viewport to the error and the error is announced.
10. `/requests` — the INFO_UPDATE field control announces as a combo box listing human field names,
    never "contactAddress".

**TDD stubs (fully-automated rows only — for the validate-contract, not written to disk at PLAN time):**

```
Failing stub:
test("every request/separation/review label map is exhaustive against its Prisma enum", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: label maps are total, no undefined")
})

Failing stub:
test("no raw SCREAMING_SNAKE enum is interpolated in any app .svelte file", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: enum-label adoption sweep is complete")
})

Failing stub:
test("no <tr> in src/ carries role=\"link\"", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: row semantics replaced by a real link")
})

Failing stub:
test("no href=\"/complaints points anywhere in src/, and both redirect stubs exist", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: /inquiries alias with /complaints redirect")
})

Failing stub:
test("the 10 machine-voiced error strings are gone, and the login credential message survives", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: R4 message rewrite with the R5 negative control")
})

Failing stub:
test("no separations or inquiries <title> interpolates a person name or a subject", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: R2 title policy")
})
```

**Known gaps (residual — recorded, never a terminal PASS):**

| Gap | Why it cannot be proved in this phase | Resolution |
|---|---|---|
| Screen-reader announcement correctness | `vitest.config.ts` runs `environment: 'node'` over `tests/unit/**` only; there is no jsdom, no component-render harness and no axe integration. Adding one is a test-infrastructure project, not a copy phase. | Covered by the Agent-Probe spot-check list above **and** a backlog stub: `a11y-component-test-harness_NOTE_03-09-26.md` in `process/features/ui-ux-overhaul/backlog/`. This behaviour's gate stays **CONDITIONAL** — it is not declared PASS on the grep gates alone. |
| Rendered contrast of the fixed colour-only signals | No automated contrast tool in the repo; the audit was source-only | Live spot-check in both themes, plus the same backlog stub |
| Whether the Veent logo renders correctly at `h-16 w-auto` | Asset dimensions unknown from source | Live spot-check item; a bad render is a report item for the owner, not an asset edit. **VALIDATE note:** `static/veent-logo.png` is **934 KB** against `avipa-logo.png`'s 43 KB — a 22x payload increase on the unauthenticated login page. Not a blocker and not fixable here (`static/*` is out of bounds); record it for the owner. |
| The ~13 raw-enum render sites belonging to enums this phase does not map (payroll run/period, benefit enrollment, attendance day, posting, backup status) | Mapping six more enums is a second S1-sized commit, outside this phase's stated blast radius | Backlog stub `raw-enum-sweep-remaining-enums_NOTE_03-09-26.md` in `process/features/ui-ux-overhaul/backlog/`. AC1 is scoped to the six mapped enums. |
| Whether `favicon.png` / `apple-touch-icon.png` still carry Avipa artwork | Binary assets; source-only inspection cannot tell, and `static/*` is out of bounds for this phase | Owner spot-check item; a follow-up asset swap if it is Avipa artwork |

## Test Infra Improvement Notes

- There is **no component-render test tier**. `vitest.config.ts` is `environment: 'node'` scoped to
  `tests/unit/**`, so every one of this phase's ~25 markup-level changes is provable only by grep,
  by Playwright, or by an agent's eyes. A jsdom + `@testing-library/svelte` + `axe-core` tier would
  turn most of this phase's Agent-Probe rows into Fully-Automated rows. It needs new dev
  dependencies, so it is owner-gated and out of this phase's scope.
- Grep gates are doing real proving work here. They should be captured as a script
  (`scripts/check-ui-invariants.mjs`) rather than living as shell one-liners in a phase report, so
  later work cannot silently reintroduce a `role="link"` row or a raw enum. Proposed at EVL, not built here.
- The e2e suite's known flakiness (#287) means the S4 regression row is a **baseline diff**, not an
  absolute pass. Record the baseline before section S4 starts, or the row proves nothing.

## Phase Completion Rules

- Code written, gates unrun → `CODE DONE`. Never `VERIFIED`.
- `✅ VERIFIED` requires **all** of: the full CI gate set green in CI order; every section gate green;
  the keyboard walk done and written up; the screen-reader spot-check list answered item by item; the
  impeccable audit passed; the two regression rows green; the phase report written; and the owner
  saying it is confirmed working. User confirmation is required — an agent may not self-award VERIFIED.
- A section is not complete until its own gate is green. Gates are not batched to the end.
- Any Known-Gap row above keeps its behaviour's gate **CONDITIONAL** and requires its backlog stub to
  exist on disk. A phase 8 that is green only because its proving gates are known-gaps is a failed
  phase, not a passed one.
- Either OWNER-DECISION left unanswered does **not** block the phase. It is reported as OPEN in the
  phase report and carried to the programme's closeout.

## Acceptance Criteria

| # | Criterion | proven by | strategy |
|---|---|---|---|
| AC1 | No raw database enum renders **for the six enums mapped in S1 items 2-6**, across the eight files named in item 7 (the ~13 other-enum sites are the recorded known gap) | scoped raw-enum grep gate + `tests/unit/labels.test.ts` exhaustiveness | Fully-Automated |
| AC2 | Every label map covers every member of its Prisma enum | `tests/unit/labels.test.ts` | Fully-Automated |
| AC3 | `/inquiries` serves the page; `/complaints` and `/complaints/[id]` 308-redirect; no internal `href` points at `/complaints`; the Prisma/service/audit word *complaint* is unchanged | route-redirect grep gate + `pnpm test` (complaints unit tests still pass unchanged) | Fully-Automated |
| AC4 | The login page reads Veent HRIS in title, logo and footer; sign-in still works | login-brand grep gate + `pnpm test:e2e tests/e2e/auth.spec.ts` | Fully-Automated |
| AC5 | The tenant-enumeration flow is **unchanged** unless OWNER-DECISION-1 was granted | `loginSchema` diff is empty; `(auth)/login/+page.server.ts` load is unchanged | Fully-Automated |
| AC6 | All 10 machine-voiced error strings are replaced per the S3 table; `'Invalid email or password'` survives | error-string grep gate incl. the R5 negative control | Fully-Automated |
| AC7 | No `<tr>` carries `role="link"`; every converted table has a real link in its name cell (timesheets: a real button — item 22 carve-out) | row-semantics grep gate + the ten S4 specs by file path | Fully-Automated |
| AC8 | Space on a timesheets row does not scroll the page; Space on a recruitment row checkbox toggles it without navigating | keyboard walk, steps 4 and 5 | Agent-Probe |
| AC9 | The mobile drawer traps Tab, closes on Escape, and restores focus to the hamburger | keyboard walk, drawer step + screen-reader item 6 | Agent-Probe |
| AC10 | The org switcher is keyboard-operable and announced as a listbox or a native select | keyboard walk + screen-reader item 7 | Agent-Probe |
| AC11 | No status is signalled by colour alone: the override asterisk, the approvals dot and the schedules pill all carry text or state semantics | colour-only grep gate + screen-reader items 4 and 5 | Hybrid — precondition: running app + screen reader |
| AC12 | `separations/[id]` and `inquiries/[id]` titles carry no person name or subject; every title ends `— Veent HRIS` | title-policy grep gate | Fully-Automated |
| AC13 | Person names render `Last, First` in every list, cell, option and definition list | keyboard/live walk of `employees/[id]` + `impeccable` audit | Agent-Probe |
| AC14 | A failed submit on each of the five long pages scrolls the error into view and focuses the field | keyboard walk (leave-request flow covers one) + live spot-check on the other four | Agent-Probe |
| AC15 | The onboarding manual-step control is a real checkbox or a ≥24px target | live spot-check + `impeccable` audit | Agent-Probe |
| AC16 | The audit-log filter controls reflect the active URL params after submit; entity IDs have a title/copy affordance | live spot-check | Agent-Probe |
| AC17 | Report table headers read as human column names | live spot-check + `tests/unit/labels.test.ts` covers `reportColumnLabel` | Hybrid |
| AC18 | The full CI gate set is green in CI order | `pnpm format:check && pnpm lint && pnpm check && pnpm test` | Fully-Automated |
| AC19 | Do-not-break items 1, 3, 6 and 8 are intact | the two regression rows + a read of `punch/+page.svelte` proving its `role="status"`/`role="alert"` split is untouched | Hybrid — precondition: running app + DB |
| AC20 | Both OWNER-DECISION items are reported with a status, and neither was silently built | phase report review + `git diff` on `(auth)/login/+page.server.ts` and `DevLoginSwitcher.svelte` | Fully-Automated |

## Commit Plan

One commit per section. Six commits, mapping to the five named concerns.

| Commit | Section | Concern | Subject |
|---|---|---|---|
| 1 | S1 | enum labels | `feat(ui): render request, separation and review states through $lib/labels` |
| 2 | S2 | naming | `refactor(ui): rename complaints to inquiries and rebrand login to Veent` |
| 3 | S3 | naming (copy split) | `fix(ui): rewrite machine-voiced error and field copy in the user's words` |
| 4 | S4 | row-a11y | `fix(a11y): give table rows a real link and stop space-key navigation bugs` |
| 5 | S5 | dialogs-focus | `fix(a11y): trap focus in the mobile drawer and the org switcher` |
| 6 | S6 | misc | `fix(a11y): add text equivalents, aria-current and error scroll-into-view` |

No `Co-Authored-By` trailer. Process/plan commits stay separate from these six.

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| The phase-02 noun ruling never lands, so S2's noun sweep has nothing to apply | Medium | Ship S2 without item 14; report the gap; the noun sweep is a one-commit follow-up |
| Phase 7's tab names shift after S2's title sweep | Medium | Do S2's title work **after** reading phase 7's report at research-refresh; the sweep is string-only and cheap to redo |
| A converted row link breaks an existing e2e spec's row click | Medium | Keep the whole-row click as a mouse convenience — specs that click the row keep working; run the six affected specs inside section S4 |
| The INFO_UPDATE key list is guessed and a value no longer validates server-side | Low, high impact | Item 18 requires reading the server handler first; the option `value` must be an existing key verbatim |
| A label map falls through and renders `undefined` in front of a user | Low, high impact | Exhaustiveness test against the Prisma enum member list, not a hand-written key list |
| The `scrollIntoView` adoption double-applies on top of phase 4's | Medium | Item 37 checks phase 4's report first and skips-and-notes |
| An agent decides one of the OWNER-DECISION items "is obviously fine" and builds it | Low, high impact | AC20 makes the *absence* of those diffs an automated acceptance check |
| Scope creep into phase 3's kit or phase 4's contract while editing the same files | Medium | The out-of-scope table above; every changed line must trace to a numbered checklist item |

## Rollback

Each of the six commits is independently revertable. The route rename (commit 2) is the only one with
a URL-visible effect, and it is reversible by reverting the move plus the two stubs — no data, no
schema and no stored link is affected, because `/complaints` keeps resolving either way.

## Validate Contract

Status: CONDITIONAL
Date: 03-09-26
date: 2026-09-03
generated-by: outer-pvl

Parallel strategy: parallel-subagents (read-only fan-out), executed in-session
Rationale: 5/7 signals (S2 route+form surface, S3 six independent sections, S4 phase program, S6
medium-low but auth-adjacent login file, S7 ~40 files). Read-only validation of one finished plan
needs no inter-agent talk, so independent dimension/section probes were the right shape.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | the six mapped enums render human labels in the eight named files | Fully-Automated | scoped raw-enum grep over the eight files in S1 item 7 | B |
| AC2 | every label map is total against its Prisma enum | Fully-Automated | `pnpm test` — `tests/unit/labels.test.ts` | B |
| AC3 | `/inquiries` serves; `/complaints` 308-redirects; no `/complaints` string survives in `src/` | Fully-Automated | route-redirect grep (all string forms, incl. the service template literals) + `pnpm test` | B |
| AC4 | login reads Veent HRIS and sign-in still works | Fully-Automated | login-brand grep + `pnpm test:e2e tests/e2e/auth.spec.ts` | B |
| AC5 | the tenant-enumeration flow is untouched | Fully-Automated | `git diff` on `(auth)/login/+page.server.ts` is comment-only; `loginSchema` diff empty | A |
| AC6 | the 10 machine-voiced strings are gone and `'Invalid email or password'` survives | Fully-Automated | error-string grep with the R5 negative control | B |
| AC7 | no `<tr>` carries `role="link"`; converted rows have a real link (timesheets: a real button) | Fully-Automated | row-semantics grep + the ten S4 specs by file path | B |
| AC8 | Space on a timesheets row does not scroll; Space on a recruitment row checkbox does not navigate | Agent-Probe | keyboard walk steps 4 and 5 | D |
| AC9 | the mobile drawer traps Tab, closes on Escape, restores focus | Agent-Probe | keyboard walk drawer step + screen-reader item 6 | D |
| AC10 | the org switcher is keyboard-operable and correctly announced | Agent-Probe | keyboard walk + screen-reader item 7 | D |
| AC11 | no status is signalled by colour alone | Hybrid | colour-only grep + screen-reader items 4 and 5 — precondition: running app + screen reader | D |
| AC12 | separations/inquiries titles leak no person name or subject | Fully-Automated | title-policy grep | B |
| AC13 | person names render `Last, First` in lists, cells, options and definition lists | Agent-Probe | live walk of `employees/[id]` + `impeccable` audit | D |
| AC14 | a failed submit on the five long pages scrolls the error into view and focuses the field | Agent-Probe | keyboard walk + live spot-check on the other four | D |
| AC15 | the onboarding control is a real checkbox or a >=24px target | Agent-Probe | live spot-check + `impeccable` audit | D |
| AC16 | audit-log filters reflect the URL params; entity IDs have an affordance | Agent-Probe | live spot-check | D |
| AC17 | report headers read as human column names | Hybrid | live spot-check + `tests/unit/labels.test.ts` covers `reportColumnLabel` | B |
| AC18 | the full CI gate set is green in CI order | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test` | A |
| AC19 | do-not-break items 1, 3, 6, 8 are intact | Hybrid | the two regression rows + a read of `punch/+page.svelte` — precondition: running app + seeded DB | B |
| AC20 | both OWNER-DECISION items are reported and neither was silently built | Fully-Automated | phase report review + `git diff` on `(auth)/login/+page.server.ts` and `DevLoginSwitcher.svelte` | A |

gap-resolution legend: A = proven now; B = gate added by this plan's checklist; C = deferred to a
named later phase; D = backlog test-building stub (named residual, keep-active).

Legacy line form:
- enum labels: [Fully-automated: `pnpm test` + scoped raw-enum grep over the eight S1 files]
- route alias: [Fully-automated: route-redirect grep, all string forms + `pnpm test`]
- login rebrand: [Fully-automated: `pnpm test:e2e tests/e2e/auth.spec.ts` + brand grep]
- error copy: [Fully-automated: error-string grep with the R5 negative control]
- row a11y: [Fully-automated: `role="link"` grep + the ten S4 specs by file path]
- dialogs/focus, announcement correctness, contrast: [agent-probe: keyboard walk + 10-item screen-reader spot-check]
- component-level a11y assertions: [known-gap: documented — `a11y-component-test-harness_NOTE_03-09-26.md`]
- unmapped enums (~13 sites): [known-gap: documented as NEW PLAN REQUIRED — `raw-enum-sweep-remaining-enums_NOTE_03-09-26.md`]

Dimension findings:
- Infra fit: CONCERN — one SvelteKit app, no container/port/deploy surface. The one real infra
  defect was mechanical: the `/complaints` redirect stubs needed a `+page.svelte` each (SvelteKit
  will not build a `+page.server.ts`-only route; the repo's own `/approvals` precedent carries both).
  Fixed in plan (P1).
- Test coverage: CONCERN — every e2e section gate selected specs with `pnpm test:e2e -g "<filename>"`,
  but Playwright's `-g` filters on the **test title**. `-g "auth"` misses `valid credentials sign in
  and reach the dashboard` (the test AC4 leans on); `-g "form-errors"`, `-g "back-navigation"` and
  `-g "pagination"` match no title at all. All e2e gates rewritten to file-path selection, and the
  S4 spec list recounted from six to ten (P5). No component-render tier exists — residual gap D.
- Breaking changes: CONCERN — `src/lib/server/services/complaints/index.ts:124,176,182,226` build the
  notification link target `/complaints/{id}`. The plan's referrer list missed them and the planned
  grep gate (`href="/complaints`) was blind to template literals. They still resolve via the 308, but
  every inquiry notification would take a redirect hop forever. Added to the checklist and the gate
  widened (P2). Form-action names, payload keys, Zod schemas, `loginSchema` and Prisma: unchanged.
- Security surface: PASS — no auth, permission, secret or trust-boundary logic changes. OWNER-DECISION-1
  is deliberately not built and AC5/AC20 make its absence an automated check. The `DevLoginSwitcher`
  double dev-gate (`import { dev }` plus `if (dev && !navigator.webdriver)`) was verified in source —
  the plan's correction of the audit's "already on staging" claim is right. The redirect stubs sit
  inside the `(app)` group so they inherit the existing session guard.
- Section S1 (enum labels): FAIL -> fixed in plan. Item 7's gate ("zero remaining raw-enum
  interpolations in `.svelte` files") could not pass with the six maps items 2-6 define: 28 such
  sites exist repo-wide and ~13 belong to enums this phase never maps. Gate scoped to the eight named
  files; the rest are a named residual with a backlog note (P4).
- Section S2 (naming/routes): FAIL -> fixed in plan (P1 stub files, P2 service links). The
  `/complaints` -> `/inquiries` mechanism itself is correct — a `load`-only 308 stub, not a `reroute`
  hook — and the rejection rationale is right (a `reroute` keeps the old URL in the address bar).
  `static/veent-logo.png` exists; `avipa-logo.png` is referenced only at `login/+page.svelte:21`;
  `src/app.html` names only `favicon.png` and `apple-touch-icon.png`. Item 14's noun sweep stays
  BLOCKED-ON-PHASE-02 (see Open gaps).
- Section S3 (copy quality): FAIL -> fixed in plan (P3). All 10 error-string sites spot-checked at
  their exact `file:line` — 10/10 verbatim matches at `5e5cdfe`. No test in `tests/` or `tests/e2e/`
  asserts any of the old strings, so the rewrite breaks nothing. The real defect was item 18: the
  proposed 8-option INFO_UPDATE picker versus a server map (`apply.ts:7-15`) that accepts four keys
  onto two columns. Six of the eight options would have produced requests that approve and write
  nothing (`apply.ts:55` returns null), and those fields are excluded on purpose (T164, HR-only).
  Option list pinned to two.
- Section S4 (row a11y): CONCERN -> fixed in plan (P6). Only five `<tr>`s carry `role="link"`, not
  six; `timesheets/+page.svelte:157-161` opens a modal and has no URL, so R1's "real `<a>`" is
  inapplicable there — carved out to a real `<button>`. No existing e2e locator depends on the
  `role="link"` role (checked every spec); removing it only widens `getByRole('row')` matches, which
  is additive. The R1 ruling itself is sound against the three live row patterns.
- Section S5 (dialogs/focus): PASS — pins verified (`sidebarOpen` at `+layout.svelte:345-350`,
  backdrop at `:392-401`, company switcher at `:437-490`). Hard dependency on phase 03's Dialog trap
  is correctly declared. Item 29's (a)/(b) choice is legitimately deferred to research-refresh.
- Section S6 (misc): PASS — `aria-current` count is 0 as claimed; the `scrollIntoView` source at
  `performance/templates/[id]:80-90` exists in the shape described; `payroll/+page.svelte:171`,
  `settings/schedules:66/:267` and `reports/[type]:236-241` all verified. `sr-only` is not declared
  in `src/app.css`, so the Tailwind v3 built-in utility is the path — the plan already anticipates it.

Open gaps:
- Stores/Branches noun ruling: OWNER-DECISION gate. Phase 02's plan does **not** rule the noun — it
  states the label "stays tenant-conditional" and "stays 'Stores' (#182 clash rule preserved)", i.e.
  it preserves the inversion rather than resolving it. The umbrella registry lists this as an open
  owner decision that "blocks phase 08 section S2". Checklist item 14 is therefore
  BLOCKED-ON-PHASE-02 at EXECUTE time; the plan's stated fallback (ship S2 without item 14, report
  the gap, one-commit follow-up) is the accepted resolution.
- Login tenant enumeration (OWNER-DECISION-1): unbuilt by design. Isolated — only item 13
  (comment wording) touches that file, and AC5 asserts the flow diff is empty.
- `DevLoginSwitcher` removal (OWNER-DECISION-2): unbuilt by design. Isolated, with one adjacency to
  watch — the mount at `(app)/+layout.svelte:6,354` sits in a file section S5 edits. EXECUTE must not
  disturb it while reworking the drawer; AC20 catches it if it does.
- Item 17's verb split waits on phase 06's canonical-surface ruling — plan already says skip and note.
- Component-level a11y assertions: known-gap documented as NEW PLAN REQUIRED — see
  `process/features/ui-ux-overhaul/backlog/a11y-component-test-harness_NOTE_03-09-26.md`.
- The ~13 unmapped raw-enum render sites: known-gap documented as NEW PLAN REQUIRED — see
  `process/features/ui-ux-overhaul/backlog/raw-enum-sweep-remaining-enums_NOTE_03-09-26.md`.
- `static/veent-logo.png` is 934 KB against `avipa-logo.png`'s 43 KB — a 22x payload increase on the
  unauthenticated login page. `static/*` is out of bounds for this phase; owner report item.
- `favicon.png` / `apple-touch-icon.png` may still carry Avipa artwork — binary, unverifiable from
  source, and out of bounds. Owner spot-check.

What this coverage does NOT prove:
- The scoped raw-enum grep does not prove the app is free of raw enums — 13 sites in other enum
  families remain by design.
- `tests/unit/labels.test.ts` proves the maps are total; it cannot prove they are *adopted* at any
  render site, and it cannot prove a label reads well to a person.
- The route-redirect grep proves no `/complaints` string survives; it does not prove `/inquiries`
  actually renders, that the 308 fires, or that an old bookmark lands correctly — no e2e spec covers
  the inquiries route at all.
- `tests/e2e/auth.spec.ts` proves sign-in still works; it does not look at the logo, the title or the
  footer, and it does not prove the tenant list is unchanged.
- The `role="link"` grep proves the attribute is gone; it does not prove a real link took its place,
  that the link is reachable by keyboard, or that a screen reader announces the row correctly.
- The error-string grep proves the old strings are gone; it does not prove the new sentences are the
  ones a person needs, and it does not prove any of them ever renders.
- The ten S4 specs are a baseline diff, not an absolute pass (#287 flakiness) — an unrecorded
  baseline makes that row prove nothing.
- No gate proves the mobile drawer traps focus, the switcher is announced as a listbox, contrast is
  adequate in either theme, or that the onboarding checkbox meets the 24px target. Those are
  Agent-Probe judgement plus the two backlog residuals.
- Nothing here proves the phase-02 noun ruling arrived, so nothing proves goal 2 ("one noun per
  concept per tenant") end to end.

Gate: CONDITIONAL (four FAIL-grade findings fixed in the plan by this PVL pass; the remaining
concerns are recorded residuals with backlog stubs on disk, and one owner-owned blocker — the
phase-02 noun ruling — with an accepted fallback)
Accepted by: session (autonomous, /goal execution) — accepted concerns: (1) component-level a11y
assertions stay Agent-Probe with a backlog stub; (2) ~13 unmapped raw-enum sites deferred to a new
plan; (3) item 14's noun sweep may ship omitted if phase 02 never rules; (4) the Veent logo payload
and the possibly-Avipa favicon are owner report items, not phase-08 edits.

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-08-copy-a11y_PLAN_03-09-26.md`
2. **Last completed phase or step:** plan written. No code changed. Phases 1–7 not yet executed —
   phase 8 must not start before phase 7 closes.
3. **Validate-contract status:** pending — VALIDATE has not run on this phase plan.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/planning/all-planning.md`, `process/context/uxui/all-uxui.md`,
   `process/context/tests/all-tests.md`,
   `docs/ui-ux-audit-2026-09-03.md` (§T8, §T9, §4, §5, §6, addendum §F),
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md`.
5. **Next step for a fresh agent:** run the phase's research-refresh — re-read this plan, re-read the
   audit sections it consumes, re-read the do-not-break list, then check the five entry dependencies
   in order (does `$lib/labels` exist? does the Dialog trap exist? did phase 2 rule on the noun? did
   phase 7 settle the tab names? did phase 4 already adopt `scrollIntoView` or fix the login error
   box?). Every cited `file:line` in this plan is against the tree at `5e5cdfe` and **will have
   drifted** — re-pin each one and record the drift in the plan before touching code. Then present
   the two OWNER-DECISION items and the section-1 gate to the owner for the EXECUTE approval
   checkpoint. This programme's approval gate is **not** standing-granted.

---

**Next Step:** Plan complete. Review carefully. Say **'ENTER VALIDATE MODE'** when ready to proceed to
plan validation (required before implementation). Do not say 'ENTER EXECUTE MODE' until phase 7 is
closed and VALIDATE has written the contract above.

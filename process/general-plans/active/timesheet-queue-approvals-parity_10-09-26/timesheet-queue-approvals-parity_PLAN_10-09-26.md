---
name: plan:timesheet-queue-approvals-parity
description: "PLAN — bring /requests/timesheets (page B) to /requests/approvals (page A) parity: server pagination + stage label, container chrome with an always-present bulk bar, full card parity with an inline action footer, and the e2e repair that follows."
date: 10-09-26
branch: feat/uiux-phase-4
complexity: SIMPLE
status: VALIDATED — CONDITIONAL, ready for EXECUTE
---

# PLAN — `/requests/timesheets` parity with `/requests/approvals`

**Date**: 10-09-26 · **Branch**: `feat/uiux-phase-4` @ `222d976` (tree clean) · **Complexity**: SIMPLE
**Status**: VALIDATED — gate CONDITIONAL. See `## Validate Contract`; E1–E10 are binding on EXECUTE.

**TL;DR.** Four sections, strictly sequential, on two source files plus three test files. Page B is
**already a card grid** — this is not a rebuild. S1 adds pagination and restores the live approval
step's `stageKind`/`role` to the `load` payload (no new query). S2 rebuilds the page chrome to A's
one-container shape with an always-present bulk bar. S3 rebuilds the card to A's shape and adds an
inline Approve/Reject footer. S4 repairs the three e2e call sites that S1–S3 break. The load-bearing
risk is **pagination hiding a seeded e2e card on page 2** — the queue is ordered `submittedAt asc`,
so every freshly seeded fixture lands on the LAST page. S4's shared page-walk helper is the fix and
is not optional.

---

## Overview

`/requests/timesheets` (page B) is the timesheet review queue. `/requests/approvals` (page A) is the
request approval queue, reworked in an earlier phase of the UI/UX overhaul; `/requests/proposals` was
already brought to the same shape. B is the last of the three still on the old chrome. This plan
brings B to A's shape without merging any surface and without touching the service layer.

Four things are wrong with B today, and each maps to one section:

1. **The `load` is unbounded.** It runs a `findMany` over every SUBMITTED timesheet in the
   organization and returns the whole array, with no `pagination` key — the same defect class as the
   `/settings/roles` table shipped earlier today. It also strips the approval-step rows off the
   payload, so the card cannot render a text stage badge. → **Section 1**.
2. **The chrome is loose.** The select-all sits bare outside any container, the bulk bar slides in
   and out on selection, and there is no count pill and no pagination. → **Section 2**.
3. **The card is thin.** No avatar, no wait age, no stage badge, name in a `<p>` instead of an
   `<h2>`, a fake `Review` affordance, and no way to approve or reject without opening the modal.
   → **Section 3**.
4. **Three e2e specs depend on all of the above**, one of them on a premise section 2 deletes.
   → **Section 4**.

B is **already a card grid** (`+page.svelte:123`). This is not a rebuild; the deltas are chrome,
card content, and pagination.

---

## Phase decisions (RIPER-5)

| Phase | Decision | Reason |
|---|---|---|
| RESEARCH | **RUN — done** | Every fact below is agent-verified with file:line and re-checked by the orchestrator. Do not re-derive. |
| SPEC | **SKIP** | The owner settled every open design question directly in conversation. Those rulings are recorded verbatim as **D1–D8** below and are the spec. No product question is left open. |
| INNOVATE | **SKIP** | Same reason. There is no approach space: D1 fixes the detail surface, D2 the action footer, D3 the bulk verb set, D4/D5 the parity target, D6 the select-all, D7 the pagination, D8 the feedback contract. Nothing is left to compare. |
| PLAN | **RUN — this document** | — |
| VALIDATE | **RUN** | S4 is the risk. An unrepaired spec is a red gate, and one of the three (`form-errors.spec.ts`) has its premise invalidated by D5. |
| EXECUTE | **RUN — sequential** | S2 and S3 edit the same file; S4 depends on the final markup. See `## Execution strategy`. |
| UPDATE PROCESS | **RUN, light** | Archive this plan, update memory with the parity outcome. |

Context loaded: `process/context/all-context.md` (router), `process/context/tests/all-tests.md`
(gate order + the scoped-spec trap), `process/context/uxui/all-uxui.md` (runes, tokens, a11y floors).

---

## Owner rulings — LOCKED (do not re-open)

| # | Ruling |
|---|---|
| **D1** | Card click **KEEPS** opening `TimesheetModal` — it is the only detail surface. `/requests/[id]` loads a `Request` via `getRequest` and has no timesheet branch; **no timesheet detail route exists and none will be built.** |
| **D2** | The card **also** gains an inline action footer with Approve and Reject, pinned to the card bottom like A's (`approvals/+page.svelte:347-376`). Reject opens the existing `ReasonDialog`. A **View detail** button opens the same modal. |
| **D3** | Bulk **Approve STAYS.** A is reject-only; B deliberately differs, because approving a batch of timesheets is the real workflow. |
| **D4** | Full card parity: avatar with initials, wait age with the overdue marker, stage badge, period and hours chips. |
| **D5** | Chrome parity: one `rounded-lg border bg-muted/50` container holding bulk bar + grid + pagination, with the bar as a `border-b` header (A: `:193`, `:195`). The bar is **ALWAYS present when the queue has rows** — no `{#if selected.length}`, no slide transition. Buttons **disable** when nothing is selected (A: `:216`). |
| **D6** | Tri-state select-all with the live `N selected` / `Select all` label and `aria-live="polite"` (A: `:30-36`, `:200`, `:205-207`). The separate **Clear** button is **REMOVED** — A removed its own in `3759bf6`. |
| **D7** | Pagination is added. B today runs an unbounded `findMany` over every SUBMITTED timesheet in the org (`+page.server.ts:33-49`, no `take`), returns the whole array, and has no `pagination` key. Same defect class as the roles table just shipped. |
| **D8** | Toasts are already correct on both pages via `submitFeedback` — **no change** to the feedback contract. |

---

## House rules for EXECUTE

- **NO explanatory comments added to source.** The why goes in the commit message. An existing
  comment may be **updated** when the change makes it untrue (S2 kills the comment at
  `+page.svelte:73`, "Bulk bar: appears when cards are selected" — that one must be deleted with
  the code it describes, not rewritten into a new narration).
- **No `Co-Authored-By`, no AI attribution** in any commit message. Absolute repo rule.
- `src/lib/server/services/**` is **out of bounds program-wide.** No service signature changes, no
  new query. S1's stage label comes from data the existing `include` already fetches.
- Do **not** touch `/requests/proposals`. It is the second reference implementation, read-only.

---

## Touchpoints

| File | Section | Change |
|---|---|---|
| `src/routes/(app)/requests/timesheets/+page.server.ts` | S1 | `load` gains `url`; `paginate` + in-memory slice; live step's `stageKind`/`role` added to the mapped payload |
| `tests/unit/timesheets-queue-load.test.ts` | S1 | **new** — three tests |
| `src/routes/(app)/requests/timesheets/+page.svelte` | S2 | chrome: container, always-present bar, tri-state select-all, Clear removed, `<Pagination>` rendered, count pill |
| `src/routes/(app)/requests/timesheets/+page.svelte` | S3 | card: `<ul>`/`<li>`, avatar, wait age, stage badge, chips, View detail, inline action footer, per-card guards, single-reject dialog target |
| `tests/e2e/helpers.ts` | S4 | new `findTimesheetCard()` page-walk helper; `verifyAndApproveTimesheet` uses it |
| `tests/e2e/form-errors.spec.ts` | S4 | premise rewrite (bar is always present) + page-walk |
| `tests/e2e/timesheet-approval.spec.ts` | S4 | verified-no-change, but **must be run** (see §4c) |
| `tests/e2e/timesheet-punch.spec.ts` | S4 | verified-no-change, but **must be run** — calls the changed helper at `:121` (C2/E3) |
| new page-walk gate (new spec, or a `describe` block in `form-errors.spec.ts`) | S4 | **new** — the seeded 11-row proof that `findTimesheetCard` walks (E2) |

**Read-only, not modified:** `src/lib/server/pagination.ts`, `src/lib/components/Pagination.svelte`,
`src/lib/server/services/approvals.ts`, `src/lib/server/services/timesheets.ts`,
`src/lib/components/timesheets/TimesheetModal.svelte`, `src/lib/components/ui/ReasonDialog.svelte`,
`src/lib/utils/submit-feedback.svelte.ts`, `src/routes/(app)/requests/approvals/+page.svelte`,
`src/routes/(app)/requests/proposals/+page.svelte`.

**Verified third consumer, does NOT break:** `tests/unit/request-decide-feedback.test.ts:36` imports
the B route module and calls only `actions.review` / `actions.approveMany` / `actions.rejectMany`
(`:56-60`, `:119-124`) — never `load`. `$lib/server/db` is already mocked at `:22` and
`$lib/server/services/approvals` at `:23-29`. S1's new `paginate` import pulls in
`src/lib/server/pagination.ts`, which imports nothing at all, so no unmocked module is added.

---

## Public Contracts

- **S1**: the `/requests/timesheets` `load` return gains a `pagination` key; `pendingTimesheets`
  becomes a page slice instead of the whole filtered array. One new **optional** query param,
  `?page=`. Verified safe: `load` destructures `{ locals }` only today
  (`+page.server.ts:19`) and reads no query params, so `page` cannot collide.
- **S1**: each row gains `currentStageKind: ApprovalStageKind | null` and
  `currentStageRole: Role | null`. Purely additive — `currentStage` and every scalar column keep
  their current shape, so `TimesheetModal`'s `ts` prop still satisfies its type.
- **S2/S3**: no server contract change. The card's Approve/Reject footer posts to the **existing**
  `?/review` action (`+page.server.ts:84-112`) with its existing field names
  (`id`, `approved`, `rejectionReason`). No new action, no new `fail()` shape, no new toast kind.
- **D8 holds**: `submitFeedback` usage is unchanged in kind. New per-card guard instances are added
  (S3), which is the A pattern (`approvals/+page.svelte:160-168`), not a contract change.

---

## Blast Radius

**5 files, 1 package, 1 route surface, no schema, no service layer, no API, no auth change.**

Risk class: **low product risk, HIGH test risk.** Nothing here is auth, billing, schema, or a public
API — the RBAC gate at `+page.server.ts:22` and the per-stage filter at `:51-63` are untouched, so
who sees which timesheet does not move. The whole risk is e2e: three specs locate the card by
`[role="button"]` + text, one of them asserts a premise D5 deletes, and pagination can push a seeded
fixture off page 1. Section S4 exists for exactly this and cannot be skipped.

---

## Non-goals

Named explicitly so EXECUTE does not widen:

- **The `Approve selected` green fill.** The open T2 ruling that its hand-rolled green is off the
  design system is **GitHub issue #27**. Keep whatever fill exists today, do not restyle it, do not
  open an issue, do not add a `--warning`/semantic token.
- `src/lib/server/services/**` — out of bounds program-wide.
- `/requests/proposals` — already in the target shape, read-only reference only.
- `/timesheets` — a different page. `tests/e2e/employee-view-only.spec.ts:92-93` asserts against it
  and is **not** in this blast radius. Do not touch either.
- `TimesheetModal` internals beyond what D2 requires — and D2 requires **nothing** inside it: the
  View detail button and the card click both set the same `openTs` state that exists today.
- Any new toast kind, any change to `ToastKind` or `tailwind.config.ts`.
- Merging the four approval inboxes. **Binding decision D3 of phase 06**
  (`process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-06-surface-consolidation_PLAN_03-09-26.md:59-60`):
  the four inboxes stay separate pages. This work merges nothing.
- Query-level pagination (`skip`/`take` at the Prisma layer) — already a backlog item
  (`query-level-pagination-unbounded-lists`), and it would require a service change (out of bounds).

---

## Verified facts — page A, the target (`src/routes/(app)/requests/approvals/+page.svelte`)

| Fact | Evidence |
|---|---|
| Count pill in a `{#snippet back()}`: `{data.pagination.total} awaiting you`, class `rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary`, rendered only when `total > 0` | `:183-191` |
| One container `rounded-lg border bg-muted/50` | `:193` |
| Bar `flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2`, gated on rows existing (NOT on selection) | `:194-195` |
| Tri-state select-all; `indeterminate`/`checked` set imperatively in an `$effect` because `bind:` cannot target a `$derived` | `:30-36`, `:196-204` |
| Live label in an `aria-live="polite"` span: `N selected` / `Select all` | `:205-207` |
| Bulk button `disabled={busy \|\| !selected.length}` | `:216` |
| Inner `p-4` wrapper; empty state inside it | `:226-228` |
| Semantic `<ul class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">` + `<li class="flex flex-col rounded-lg border bg-card transition-colors">`, selected `border-primary ring-1 ring-primary` — added deliberately in `89ab1a5` for a11y finding **A5** | `:233-241` |
| Card body `flex min-h-0 flex-1 flex-col gap-3 p-4` | `:243` |
| Checkbox + `h-9 w-9` rounded-full initials avatar (`aria-hidden="true"`) + `<h2 class="font-medium leading-tight break-words">` name + `Waiting {waitingFor(createdAt)}` with `· overdue` in `text-amber-500` after 3 days | `:245-274`, `:79-86` |
| Footer row `mt-auto flex items-center justify-between gap-2 pt-1`: stage badge `rounded-full bg-foreground/15 px-2 py-0.5 text-xs text-foreground/70` + `View detail` with `class="btn-row"` | `:336-343` |
| Action footer is a `<form>` sibling of the body div: `flex shrink-0 gap-2 border-t bg-muted/20 p-3`, buttons `px-2 py-1 text-xs` | `:347-376` |
| Per-card busy guard, lazily created and cached per id — a shared one would disable every row | `:157-168` |
| `<Pagination meta={data.pagination} />` INSIDE the container, after the `</ul>` | `:381` |
| Stage label resolved from the live step: `stageKind === 'SUPERVISOR' ? 'Supervisor' : roleLabel(role ?? 'APPROVER')` | `:106-113` |
| Server paginates in memory: `paginate(url, actionable.length)` then `.slice(skip, skip + take)`; default param `page`, default `pageSize` 10 | `approvals/+page.server.ts:41-42` |

## Verified facts — page B, what changes (`src/routes/(app)/requests/timesheets/+page.svelte`)

| Fact | Evidence |
|---|---|
| Wrapper `space-y-6` — already matches A | `:65` |
| `PageHeader` has title/description only — **no count pill** | `:66` |
| Empty state in its own `rounded-md border bg-muted/50` box (A uses `rounded-lg`) | `:68-71` |
| Bare select-all `<label>` OUTSIDE any container; plain two-state checkbox; static "Select all" text | `:74-82` |
| Bulk bar conditional on `selected.length`, with `transition:slide` | `:84-87` |
| `N selected` text; `Clear` button; `Approve selected` (green); `Reject selected` → `ReasonDialog` | `:89`, `:91-94`, `:95-102`, `:103-118` |
| Grid is a plain `<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">` — **B is already a card grid** | `:123` |
| Card is `<div role="button" tabindex="0">`; the WHOLE CARD is the click target and opens the modal | `:125-135`, `:128-129` |
| Name in a `<p>`, not an `<h2>` | `:136-144` |
| Checkbox top-right with `stopPropagation`, `aria-label="Select timesheet"` | `:145-152` |
| Stat block `{Number(ts.totalHours).toFixed(1)} hrs · {ts.entries.length} entries` | `:154-156` |
| Fake affordance `<span class="btn-row pointer-events-none">Review</span>` | `:157-159` |
| `TimesheetModal bind:ts={openTs} mode="review" isManager={true}` | `:166` |
| Server returns `{ pendingTimesheets }` only — no `pagination` key, no `take` on the query | `+page.server.ts:33-49`, `:69` |
| Each row carries `employee: { id, firstName, lastName }`, `entries[]` (date asc), `currentStage`, and every scalar column incl. `periodStart`, `periodEnd`, `totalHours`, `submittedAt` | `+page.server.ts:44-45`, `:64-67` |
| `.map` strips `approvalSteps` and keeps only `currentStage`, so the stage LABEL is not derivable client-side today | `+page.server.ts:64-67` |
| `liveChain(steps).currentStep` is the **full `ApprovalStep` row**, so `stageKind` and `role` are already in memory — **no new query is needed** | `services/approvals.ts:40-53`; `prisma/schema.prisma:868`, `:870` |
| `currentStage` today is `currentStep.stage` — the `ApprovalStage` enum (`MAKE`/`VERIFY`/`APPROVE`), **not** a numeric index | `+page.server.ts:66` |
| The single-review action already exists and takes `id` / `approved` / `rejectionReason` | `+page.server.ts:84-112` |
| Ordering is `submittedAt: 'asc'` — oldest first, so a freshly seeded fixture is always LAST | `+page.server.ts:48` |
| `<Pagination>` renders nothing when `total <= pageSize`; `href()` copies the existing `URLSearchParams` and sets only `meta.param`; the next control is a link labelled `Next →` (an inert `<span>` on the last page) | `src/lib/components/Pagination.svelte:28`, `:21-25`, `:47-56` |
| `paginate` clamps an out-of-range page to `totalPages` | `src/lib/server/pagination.ts:41-45` |

---

## Design decisions

**DD-1 — the card keeps a `role="button"` element on the BODY, and EVERY `<button>` lives outside it.**
*(Rewritten per validate finding F1 / instruction E1. The earlier wording claimed the card had no
nested interactive content; that was false against this plan's own markup and is corrected here,
not softened.)*

D1 requires the card click to open the modal; D2 puts real `<button>`s in a footer. Any `<button>`
inside an element carrying `role="button"` is nested interactive content (axe `nested-interactive`),
so the rule is mechanical: **`role="button"` goes on the body div, and nothing with a button role may
be a descendant of it.**

Page A is not a precedent for a roled container — A's body div carries **no** role
(`approvals/+page.svelte:243`) and A's View detail is an `<a href>` (`:341`). B needs the roled body
because D1 keeps the whole-card click, and B's View detail must be a `<button>` because there is no
detail route (D1). The `<li>` therefore holds **three** siblings, not two:

1. the body div — `role="button" tabindex="0"`, click/Enter/Space open the modal; name, wait age
   and chips live here;
2. the bottom row — stage badge + **View detail** button, **outside** the body div (E1);
3. the action footer `<form>` — Approve + Reject.

The pre-existing checkbox stays inside the body with its `stopPropagation` — same violation class,
already shipped at `+page.svelte:145-152`, and moving it is out of scope. This is stated, not hidden.

**Proof, not assertion.** The DOM check in AC3.4 asserts the element carrying `role="button"` has
**zero** `<button>` descendants. A grep count cannot prove this — see AC3.4.

**DD-2 — because of DD-1, `helpers.ts:71` `page.locator('[role="button"]', …)` SURVIVES.**
Stated explicitly as the briefing requires. The body div still carries `role="button"` and still
contains both the name text and the hours text, so the `hasText` + `.filter({hasText: hoursLabel})`
chain still resolves to exactly one element. It survives on **markup** grounds. It does **not**
survive on **pagination** grounds — see DD-6. The helper changes for that reason and that reason only.

**DD-3 — the hours string is frozen.** The chip keeps `{Number(ts.totalHours).toFixed(1)} hrs`
verbatim, inside the body div. `timesheet-approval.spec.ts:24` (`HOURS_CARD = '3.0 hrs'`) and
`form-errors.spec.ts:101` (`SEED_CARD = '6.5 hrs'`) both depend on it. Reformatting it is forbidden
by this plan.

**DD-4 — pageSize is the `paginate` default, 10, passed with no options object.** The repo
convention is the default (9 of 11 paginated routes), A itself uses it, and the grid is 3-up, so 10
fills three full rows and a short one. Do not invent a `tpage` param — this page has one list, so
the default `page` is correct.

**DD-5 — the stage label is restored, not recomputed.** S1 adds two additive fields from the live
step already in memory: `currentStageKind` (`ApprovalStageKind | null`) and `currentStageRole`
(`Role | null`). The client label function is A's, copied locally with A's `roleLabels` map:
`stageKind === 'SUPERVISOR' ? 'Supervisor' : roleLabel(role ?? 'APPROVER')`. `currentStage` is
**kept unchanged** — it is consumed downstream and is a different value (the `ApprovalStage` enum,
not the numeric index A uses). Extracting the shared label helper into `$lib` is **out of scope**;
duplicate the small map, as A and proposals already do.

**DD-6 — the page-walk helper is FUTURE-PROOFING, not a present fix, and it needs its own gate.**
*(Reworded per validate finding C1 / instruction E2. The earlier wording claimed pagination would
hide fixtures today. It will not — the measured queue is ~3 rows.)*

What is true: the queue orders `submittedAt asc` (`+page.server.ts:48`), so a freshly seeded fixture
is genuinely the newest row and lands on the **last** page. If the queue ever exceeds `pageSize`,
three specs go red on seed drift rather than on a real defect.

What is **not** true today: the dev/e2e database holds **1 timesheet, 0 SUBMITTED**;
`prisma/seed*.ts` creates zero SUBMITTED rows; only `form-errors.spec.ts:110-160` creates one
directly, and `timesheet-approval.spec.ts` / `timesheet-punch.spec.ts` each submit one through the
UI. Peak actionable queue is ~3 rows, cut further per-user by `canActOnStage`
(`+page.server.ts:51-63`). At `total <= pageSize`, `Pagination.svelte:28` renders **nothing** — so no
`Next →` link ever exists and the helper's walk branch **never executes**.

So S4 still adds the shared helper (start at page 1, click `Next →` until the card appears or no
`Next →` remains), but it must ship **exercised**: E2's seeded 11-row gate is what proves the loop
body works. A `grep` for the string `Next →` proves only that it was typed. Without E2 the helper is
unexercised code that rots silently — see AC4.3.

**DD-7 — the bar's `Approve selected` and `Reject selected` both get `disabled={busy || !selected.length}`.**
D5 requires it and A pins the pattern at `:216`. This is what replaces the removed
`{#if selected.length}` gate as the "nothing selected" signal.

**DD-8 — per-card Reject reuses the existing `ReasonDialog` through a discriminated target.**
`ReasonDialog` is already mounted once at `+page.svelte:168-175` for the bulk path. S3 widens the
target state to `{ kind: 'bulk' } | { kind: 'single'; id: string }`, adds one hidden single-review
`<form action="?/review">` at page level (A's `decideForm` pattern, `approvals:388-390`), and routes
`onconfirm` by target kind. No second dialog instance, no new component.

**DD-9 — per-card busy guards, not a shared one.** Copy A's lazily-created `Map<string, guard>`
(`approvals:157-168`). A single shared `busy` would grey out every card's Approve while one row is
in flight — the exact defect #108 fixed on A.

**DD-10 — the empty-state box changes `rounded-md` to `rounded-lg` and moves INSIDE the container.**
D5 says one container. A renders the empty state inside the inner `p-4` wrapper (`:226-228`), with
the bulk bar suppressed above it. B does the same, so an empty queue shows a bordered container with
the empty state and no bar.

---

## Execution strategy

**Strictly sequential: S1 → S2 → S3 → S4. No parallel lane is offered.**

- **S2 and S3 edit the same file** (`+page.svelte`). They cannot run in parallel at all.
- **S2/S3 depend on S1** — the chrome renders `data.pagination` and the card renders
  `data.currentStageKind`; neither exists before S1.
- **S4 depends on S2 and S3** — the specs are repaired against the final markup, not a guess.
- S1 and S4 are the only file-disjoint pair, but S4 is behaviourally downstream of the markup, so
  running them together would mean writing spec fixes against markup that does not exist yet.

One EXECUTE agent, four commits, in order.

---

# SECTION 1 — server: pagination + the stage label restored

**File**: `src/routes/(app)/requests/timesheets/+page.server.ts` (plus one new unit test).

## Implementation checklist — S1

1. Add `import { paginate } from '$lib/server/pagination'` to the import block at `:1-7`.
2. Change the `load` signature at `:19` from `async ({ locals })` to `async ({ locals, url })`.
3. Leave the RBAC gate (`:22`), the self-employee lookup (`:26-29`) and the `findMany` (`:33-49`)
   **byte-identical**. No `take`, no `skip`, no `orderBy` change, no `include` change.
4. In the `.map` at `:64-67`, compute the live chain once and spread three fields instead of one:
   resolve `liveChain(approvalSteps)` into a local, then return `{ ...ts, currentStage: <live step's
   stage ?? null>, currentStageKind: <live step's stageKind ?? null>, currentStageRole: <live step's
   role ?? null> }`. `currentStage` must keep its current value and meaning (DD-5).
5. After the `.filter(...).map(...)` chain, add
   `const pagination = paginate(url, pendingTimesheets.length)` — no options object, so `param` is
   `page` and `pageSize` is 10 (DD-4).
6. Change the return at `:69` to
   `{ pendingTimesheets: pendingTimesheets.slice(pagination.skip, pagination.skip + pagination.take), pagination }`.
   Rename the pre-slice local if that reads better; the returned key name **must** stay
   `pendingTimesheets`.
7. Add no comments (house rule). The existing comments at `:31-32`, `:36-39`, `:54` stay untouched —
   none of them becomes untrue.
8. Write `tests/unit/timesheets-queue-load.test.ts` (see the S1 test plan).
9. Commit S1 alone.

## Test plan — S1

Verified gap: this `load` has **zero** coverage today.

Mock shape is proven by `tests/unit/request-decide-feedback.test.ts:16-36` — copy it: `vi.hoisted`
for the mocks, `vi.mock('$lib/server/db')`, `vi.mock('$lib/server/services/approvals')`,
`vi.mock('$lib/server/services/timesheets')`, then a dynamic `await import` of the route module.
`canAny` from `$lib/server/rbac` is pure — do not mock it; pass `roles: ['HR_ADMIN']`.
`db.timesheet.findMany` must be added to `dbMock` alongside `employee.findFirst`.
`liveChain` is mocked to return `{ currentStep: { stage: 'VERIFY', stageKind: 'ROLE', role: 'VERIFIER' } }`
and `canActOnStage` to return `true`, so every row survives the filter.

- **T1.1 — first page is a slice.** `findMany` resolves 25 rows; call `load` with a bare URL.
  Assert `pendingTimesheets.length === 10`, `pagination.page === 1`, `pagination.total === 25`,
  `pagination.totalPages === 3`.
- **T1.2 — `?page=3` returns the tail, not page 1.** Same 25 rows, URL `?page=3`. Assert
  `pagination.page === 3` and that the returned ids are rows 21-25 (`length === 5`), proving the
  slice offset and not just that a `pagination` object exists.
- **T1.3 — the stage label fields survive the map.** One row whose live step is
  `{ stage: 'VERIFY', stageKind: 'ROLE', role: 'VERIFIER' }`. Assert the returned row has
  `currentStageKind === 'ROLE'`, `currentStageRole === 'VERIFIER'`, `currentStage === 'VERIFY'`
  (all three — the third pins DD-5's "unchanged" promise) and that `approvalSteps` is **absent**
  from the returned row.

T1.2 is the one that cannot pass vacuously: with 25 rows and `pageSize` 10, `paginate`'s clamp
(`pagination.ts:45`) leaves `page === 3` reachable, so a missing or wrong `.slice` goes red.

## Acceptance criteria — S1

| # | Criterion | Check |
|---|---|---|
| AC1.1 | The queue load returns at most `pageSize` rows plus a `pagination` object | T1.1 green in `pnpm test` |
| AC1.2 | `?page=N` returns the Nth slice, not page 1 | T1.2 green in `pnpm test` |
| AC1.3 | The live step's `stageKind` and `role` reach the client; `currentStage` is unchanged | T1.3 green in `pnpm test` |
| AC1.4 | No service-layer file is touched | `git diff --stat 222d976 -- src/lib/server/services/` prints nothing |
| AC1.5 | No new Prisma query and no `take`/`skip` on the existing one | `git diff 222d976 -- "src/routes/(app)/requests/timesheets/+page.server.ts" \| grep -E '^\+.*(db\.|take:|skip:)'` returns nothing |
| AC1.6 | No new source comments | `git diff 222d976 -- "src/routes/(app)/requests/timesheets/" \| grep '^+' \| grep -E '^\+\s*(//\|/\*\|<!--)'` returns nothing — **scoped to this plan's own paths** so a concurrent lane cannot colour it, and `<!--` added so the rule is enforced in the `.svelte` file (E5) |

**a11y**: none — S1 renders nothing.

**Commit subject (S1):**

```
feat(timesheets): paginate the review queue and carry the live stage
```

---

# SECTION 2 — chrome: one container, an always-present bulk bar, pagination

**File**: `src/routes/(app)/requests/timesheets/+page.svelte` (chrome only; the card is S3).

## Implementation checklist — S2

1. Add `import Pagination from '$lib/components/Pagination.svelte'`.
2. Remove `import { slide } from 'svelte/transition'` (D5 kills the only use at `:87`). Leaving an
   unused import is a lint error.
3. Add `someSelected`: `$derived(selected.length > 0 && !allSelected)`, mirroring `approvals:22`.
4. Add the imperative tri-state effect, copied from `approvals:30-36`: a
   `let selectAllCheckbox = $state<HTMLInputElement>()` and an `$effect` setting `.indeterminate =
   someSelected` and `.checked = allSelected`. **Do NOT copy A's `// ponytail:` comment**
   (`approvals/+page.svelte:29`) or any other comment with it — the no-comments house rule wins, and
   copying it would turn this plan's own AC1.6/AC3.15 gate red (E6, resolving validate finding C5).
5. Replace `toggleAll(ids, on)` (`:27-29`) with A's zero-argument form
   (`selected = selected.length > 0 ? [] : allIds`, `approvals:26-28`) and drop the `onchange`
   argument list at the call site. The old signature is unreachable once the checkbox is imperative.
6. `PageHeader` at `:66` — add A's `{#snippet back()}` count pill: rendered only when
   `data.pagination.total > 0`, text `{data.pagination.total} awaiting you`, class
   `rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary` (`approvals:184-190`).
7. Replace the whole `{#if data.pendingTimesheets.length === 0} … {:else} … {/if}` structure
   (`:68-163`) with A's single-container shape (`approvals:193-226`):
   - outer `<div class="rounded-lg border bg-muted/50">`
   - `{#if data.pendingTimesheets.length > 0}` → the bar
     `<div class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">`
   - then an inner `<div class="p-4">` holding either `<EmptyState title="No pending timesheets to review" />`
     (title text unchanged) or the grid.
8. Bar left side: the select-all `<label class="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-foreground/70">`
   with `bind:this={selectAllCheckbox}`, `onchange={toggleAll}`, and the live label
   `<span aria-live="polite">{selected.length ? `${selected.length} selected` : 'Select all'}</span>`
   (`approvals:196-208`).
9. Bar right side `<div class="flex items-center gap-2">` holding **both** existing forms in their
   current order — `?/approveMany` then `?/rejectMany` (D3: Approve stays). Keep both forms' hidden
   inputs, the `bind:this={rejectForm}` binding, and both `use:enhance={bulkFb.enhance}` bindings
   exactly as they are today (`:95-118`).
10. Change both bulk buttons' guards from `disabled={busy}` to
    `disabled={busy || !selected.length}` (DD-7, `approvals:216`).
11. **Delete** the `Clear` button at `:91-94` and the standalone `{selected.length} selected` span at
    `:89` — the aria-live label from step 8 replaces the latter (D6).
12. **Delete** the bare select-all `<label>` at `:74-82` (moved into the bar) and the comment at
    `:73` ("Bulk bar: appears when cards are selected") — it describes behaviour D5 removes.
13. Render `<Pagination meta={data.pagination} />` immediately after the grid, **inside** the inner
    `p-4` wrapper (`approvals:381`).
14. Keep the `{#each}` grid block from `:123-162` untouched in this section — S3 rewrites it.
15. Add no comments. Commit S2 alone.

## a11y — S2

- The tri-state checkbox must set `indeterminate` **and** `checked` imperatively; `bind:checked`
  against a `$derived` silently does nothing (the reason A wrote `:29-36` that way).
- The `aria-live="polite"` span is required, not optional — it is the only announcement a
  screen-reader user gets when a selection count changes (D6).
- The label wrapper keeps `cursor-pointer` on both the label and the input so the whole text is a
  click target, matching A.
- Do not drop the `for`/wrapping-label association: the checkbox stays **inside** the `<label>`.

## Acceptance criteria — S2

| # | Criterion | Check |
|---|---|---|
| AC2.1 | One container wraps bar + grid + pagination | `grep -n 'rounded-lg border bg-muted/50' "src/routes/(app)/requests/timesheets/+page.svelte"` returns exactly 1 hit |
| AC2.2 | The bulk bar is present with zero selection | Rewritten `form-errors.spec.ts` asserts `form[action*="approveMany"]` is visible **before** any checkbox is checked (S4) |
| AC2.3 | Both bulk buttons are disabled with zero selection | Same spec asserts `Approve selected` has `toBeDisabled()` before checking, `toBeEnabled()` after |
| AC2.4 | The Clear button is gone | `grep -c '>Clear<' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 0 |
| AC2.5 | No slide transition remains | `grep -c "svelte/transition" "src/routes/(app)/requests/timesheets/+page.svelte"` returns 0 |
| AC2.6 | The select-all label is live | `grep -c 'aria-live="polite"' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC2.7 | Pagination renders | `grep -c 'Pagination meta={data.pagination}' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC2.8 | The count pill matches A | `grep -c 'awaiting you' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC2.9 | Tri-state is wired | `grep -c 'indeterminate' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC2.10 | Types and lint hold | `pnpm exec svelte-check --tsconfig ./tsconfig.json` and `pnpm lint` green |
| AC2.11 | Selection announcement is heard by a screen reader | **Agent-Probe** — one browser pass: tick one card, confirm the label text flips to `1 selected` inside the `aria-live` span |

**Commit subject (S2):**

```
feat(timesheets): match the approvals queue chrome and paginate it
```

---

# SECTION 3 — card: full parity plus an inline action footer

**File**: `src/routes/(app)/requests/timesheets/+page.svelte` (the `{#each}` block only, plus the
script additions the card needs).

## Implementation checklist — S3

1. Script — add `initials(first, last)` copied from `approvals:74-75`, and `waitingFor(date)` +
   `isStale(date)` copied from `approvals:79-86`. Both take `submittedAt` on this page, not
   `createdAt`.
2. Script — add the `roleLabels` map and `roleLabel()` from `approvals:90-104`, and a
   `stageLabel(kind, role)` implementing DD-5 (`kind === 'SUPERVISOR' ? 'Supervisor' : roleLabel(role ?? 'APPROVER')`);
   it must return `''` when `kind` is `null`, so a legacy step-less timesheet renders no badge
   rather than a badge reading `Stage:` with nothing after it.
3. Script — add per-card review guards: the lazily-created `Map<string, ReturnType<typeof submitFeedback>>`
   from `approvals:160-168`, keyed by timesheet id (DD-9).
4. Script — widen the reject-dialog target to
   `let rejectTarget = $state<{ kind: 'bulk' } | { kind: 'single'; id: string } | null>(null)`,
   add `let singleForm = $state<HTMLFormElement>()`, `let singleId = $state('')`,
   `let singleReason = $state('')`, and route `submitBulkReject`'s body by `rejectTarget.kind`
   (DD-8). The existing bulk path — `bulkReason = reason`, `await tick()`, the
   `forceInput`-style belt-and-braces write at `:55-56`, then `requestSubmit()` — must be preserved
   verbatim for the bulk branch; the single branch does the same three steps against `singleForm`.
5. Template — replace the grid `<div>` at `:123` with
   `<ul class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">` and close with
   `</ul>` (a11y finding A5, `approvals:233`). Note the breakpoints change from `sm:`/`lg:` to
   `md:`/`xl:` — that is intended parity, not a typo.
6. Template — each row becomes
   `<li class="flex flex-col rounded-lg border bg-card transition-colors {picked ? 'border-primary ring-1 ring-primary' : 'hover:border-muted-foreground/30'}">`
   with `{@const picked = selected.includes(ts.id)}` and `{@const g = reviewGuard(ts.id)}` as
   **immediate children of the `{#each}`** — `{@const}` must be an immediate child of a block tag,
   never inside a plain element (repo rule).
7. Template — the card **body** is the `role="button"` element (DD-1):
   `<div role="button" tabindex="0" onclick={() => (openTs = ts)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (openTs = ts)} class="flex min-h-0 flex-1 cursor-pointer flex-col gap-3 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">`.
8. Body, person row (`approvals:245-274`): the existing checkbox first — keep
   `aria-label="Select timesheet"`, `onchange={() => toggle(ts.id)}` and
   `onclick={(e) => e.stopPropagation()}` (the stopPropagation is now load-bearing, since the
   checkbox sits inside the `role="button"` body) — then a
   `<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/70" aria-hidden="true">`
   holding `initials(...)`, then a `min-w-0 flex-1` block with
   `<h2 class="font-medium leading-tight break-words">{ts.employee.lastName}, {ts.employee.firstName}</h2>`
   (a `<h2>`, not the current `<p>`) and the wait line
   `Waiting {waitingFor(ts.submittedAt)}` with `<span class="ml-1 font-medium text-amber-500">· overdue</span>`
   when `isStale(ts.submittedAt)`.
   **Avatar colour**: A tints by request type (`typeAccent`); B has no type, so use the neutral
   `bg-muted text-foreground/70` above. Do not invent a per-employee colour scheme.
9. Body, chip row `<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">`
   (`approvals:276-292`): the period `{formatShortDate(ts.periodStart)} – {formatShortDate(ts.periodEnd)}`,
   then `<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{Number(ts.totalHours).toFixed(1)} hrs</span>`
   (**frozen string**, DD-3), then the same chip shape for `{ts.entries.length} entries`.
   The old stat block at `:154-156` is deleted; its two numbers move here.
10. **Bottom row — a SIBLING of the body div, not inside it (E1).** It holds a `<button>`, and the
    body carries `role="button"`, so nesting it would be nested interactive content (DD-1). Render it
    inside the `<li>`, directly above the action footer, e.g.
    `<div class="mt-auto flex items-center justify-between gap-2 px-4 pb-3 pt-1">` — drop `mt-auto`
    only if the body keeps `flex-1`. Contents (shape copied from `approvals:336-343`):
    the stage badge `<span class="rounded-full bg-foreground/15 px-2 py-0.5 text-xs text-foreground/70">Stage: {stageLabel(ts.currentStageKind, ts.currentStageRole)}</span>`
    rendered only when `ts.currentStageKind` is non-null, and a **View detail** `<button type="button" class="btn-row" onclick={() => (openTs = ts)}>View detail</button>`.
    It is a `<button>`, not an `<a>` — there is no detail route (D1). Delete the fake
    `<span class="btn-row pointer-events-none">Review</span>` at `:157-159`.
11. Template — the action footer, a **sibling** of the body div inside the `<li>`
    (`approvals:347-376`):
    `<form method="POST" action="?/review" use:enhance={g.enhance} class="flex shrink-0 gap-2 border-t bg-muted/20 p-3">`
    with `<input type="hidden" name="id" value={ts.id} />`, a
    `<button type="submit" name="approved" value="true" disabled={g.busy} class="flex-1 rounded-md bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-800 disabled:pointer-events-none disabled:opacity-50">{g.busy ? 'Approving…' : 'Approve'}</button>`,
    and a `<button type="button" disabled={singleReject.busy} onclick={() => askReason({ kind: 'single', id: ts.id })} class="flex-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50">Reject</button>`.
    Two buttons, not three — B has no Return decision.
    **Reject is guarded by `singleReject.busy`, not `g.busy` (E7, validate finding C7).** The reject
    posts through the page-level hidden form in step 12, which carries a different guard, so `g.busy`
    could never go true for a reject and the disabled state would be dead. A does the same —
    `approvals/+page.svelte:358` uses `approve.busy` on Approve and `:366` uses `decide.busy` on the
    popup-driven buttons. The per-card `g` stays on the Approve submit button (DD-9 stands).
12. Template — add the page-level hidden single-review form after the grid, next to the existing
    `ReasonDialog` (A's `decideForm` pattern, `approvals:388-390`):
    add a dedicated page-level `const singleReject = submitFeedback()` in the script (A's `decide`
    pattern, `approvals/+page.svelte:172`) and write the form as
    `<form bind:this={singleForm} method="POST" action="?/review" use:enhance={singleReject.enhance}>`.
    **Never `reviewGuard(singleId)`** — `singleId` is `''` at mount, so the guard would be keyed on an
    empty id (E7, validate finding C6). Emit **no** placeholder comment in its place.
    with hidden `id` (`value={singleId}`), hidden `approved` (`value="false"`) and hidden
    `rejectionReason` (`value={singleReason}`).
13. Template — `ReasonDialog`'s `title`/`message` must now vary by target (`approvals:400-420`):
    the bulk copy stays exactly as today; the single copy names one timesheet
    (`Reject this timesheet` / `The reason is recorded on the timesheet and sent back to the filer.`).
    `confirmText="Reject"` for both.
14. `TimesheetModal bind:ts={openTs} mode="review" isManager={true}` at `:166` is **unchanged**.
15. Add no comments. Commit S3 alone.

## a11y — S3

- `<ul>`/`<li>` semantics are **required**, not cosmetic — added deliberately in `89ab1a5` for audit
  finding **A5**. A `<div>` grid is a regression.
- The name is an `<h2>`, matching A (`:264`); the current `<p>` at `:138` is the regression being
  fixed.
- The avatar is `aria-hidden="true"` — initials duplicate the adjacent name and would otherwise be
  read twice.
- Footer buttons use A's `px-2 py-1 text-xs` sizing, which lands on the **24px touch floor the owner
  chose in the approvals a11y run**. Do not shrink below it, and do not "improve" it upward.
- **Nested-interactive rule (E1, validate finding F1).** Only the body div is `role="button"`, and
  **no element with a button role may be a descendant of it** — that is why step 10 moves the bottom
  row (which holds the View detail `<button>`) OUT of the body, alongside the action footer. Do not
  put View detail back inside the body for layout convenience. The pre-existing checkbox stays
  inside with its `stopPropagation`: same violation class, already shipped at `+page.svelte:145-152`,
  out of scope here — recorded, not hidden. Prove the rule with the AC3.4 DOM check, not by eye.
- The body keeps `focus-visible:ring-2 focus-visible:ring-ring` and both `Enter` and `Space` key
  handlers; a keyboard user must still reach the modal.

## Test plan — S2 + S3

**There is no component-test DOM environment in this repo**
(`component-test-dom-environment_NOTE_03-09-26.md`, still open), so card-markup assertions are e2e
or nothing. Tiering honestly:

| Scenario | Tier | Why |
|---|---|---|
| Bar is present and its buttons are disabled at zero selection | Fully-Automated (e2e, S4) | `form-errors.spec.ts` already lives on this page and already drives the bulk form |
| The card body still opens the modal | Fully-Automated (e2e, S4) | `helpers.ts` `verifyAndApproveTimesheet` does exactly this on every run |
| Pagination slice + stage fields | Fully-Automated (unit, S1) | T1.1-T1.3 |
| Inline per-card **Approve** posts `?/review` and clears the card | **Known-Gap → backlog stub required** | No spec exercises the card footer; adding one needs a second seeded fixture that survives the approval chain. See the gap ruling below. |
| Inline per-card **Reject** opens `ReasonDialog` and posts `?/review` | **Known-Gap → backlog stub required** | Same. |
| Visual parity with A (avatar, wait age, stage badge, chips, footer alignment) | Agent-Probe | Judgment; not mechanically assertable |
| `<ul>`/`<li>`, `<h2>`, `aria-live`, 24px footer buttons | Fully-Automated (grep, AC3.x) | Structural, greppable |

**Known-gap ruling (vacuous-green ban).** The two inline-action scenarios are the only NEW behaviour
this plan introduces (D2) and they are **not** proven by any gate above. They therefore may **not**
be declared PASS on a known gap. Per the vacuous-green rule this plan:

1. **requires a backlog stub** — EXECUTE writes
   `process/features/ui-ux-overhaul/backlog/timesheet-card-inline-actions-e2e_NOTE_10-09-26.md`
   naming the missing coverage, the fixture it needs (a seeded SUBMITTED timesheet whose chain can
   be spent once per run, the `timesheet-approval.spec.ts:37-45` reset pattern), and why it was
   deferred (a second self-resetting fixture in the shared queue, not a two-line assertion); and
2. **keeps S3's gate CONDITIONAL** — S3 cannot reach `✅ VERIFIED` on the automated gates alone. It
   needs the owner's manual pass on the card footer (see `## Phase Completion Rules`).

The `?/review` action itself is not new and **is** already covered at the action boundary by
`tests/unit/request-decide-feedback.test.ts:56-60`; what is unproven is the card wiring, which is a
DOM claim this repo cannot assert outside e2e.

## Acceptance criteria — S3

| # | Criterion | Check |
|---|---|---|
| AC3.1 | The grid is a semantic list | `grep -c '<ul class="grid grid-cols-1 items-stretch' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC3.2 | The name is a heading | `grep -c '<h2 class="font-medium leading-tight break-words">' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC3.3 | The hours string is unchanged | `grep -c "Number(ts.totalHours).toFixed(1)} hrs" "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC3.4 | Exactly one `role="button"` per card, on the body, **with no `<button>` inside it** | **Two parts, both required (E4).** (a) `grep -c 'role="button"' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 — necessary, **not sufficient**: the count is 1 before and after the change, so it cannot fail on wrong markup. (b) **Agent-Probe DOM check**: on the E9 seeded queue, evaluate that the element carrying `role="button"` has **zero** `<button>` descendants. Report both. The old tiebreak ("the line above it is the `<li`") is withdrawn — it is wrong after Prettier reflows the `<li>` class attribute |
| AC3.5 | The fake Review affordance is gone | `grep -c 'pointer-events-none">Review' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 0 |
| AC3.6 | The card has an inline action footer posting `?/review` | `grep -c 'class="flex shrink-0 gap-2 border-t bg-muted/20 p-3"' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC3.7 | Per-card guards, not one shared flag | `grep -c 'reviewGuard(' "src/routes/(app)/requests/timesheets/+page.svelte"` returns ≥ 2 (definition + call site) |
| AC3.8 | The wait age and overdue marker render | `grep -c 'overdue' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC3.9 | The stage badge renders a text label, not a number | `grep -c "Stage: {stageLabel(" "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 |
| AC3.10 | Card click still opens the modal | e2e `verifyAndApproveTimesheet` green (S4) |
| AC3.11 | `TimesheetModal` is untouched | `git diff --stat 222d976 -- src/lib/components/timesheets/` prints nothing |
| AC3.12 | Types and lint hold | `pnpm exec svelte-check --tsconfig ./tsconfig.json` and `pnpm lint` green |
| AC3.13 | Inline Approve and inline Reject each act on exactly one card and leave the rest alone | **Agent-Probe — required for VERIFIED.** One browser pass on a queue with ≥ 2 cards: click Approve on card 1, confirm a green toast, that card leaves the queue, and card 2's buttons never greyed out during the post |
| AC3.14 | The inline-actions coverage gap is recorded, not dropped | The backlog note named in the S3 test plan exists on disk |
| AC3.15 | No new source comments | `git diff 222d976 -- "src/routes/(app)/requests/timesheets/" \| grep '^+' \| grep -E '^\+\s*(//\|/\*\|<!--)'` returns nothing — **scoped to this plan's own paths** so a concurrent lane cannot colour it, and `<!--` added so the rule is enforced in the `.svelte` file (E5) |

**Commit subject (S3):**

```
feat(timesheets): give review cards the approvals card shape and inline actions
```

---

# SECTION 4 — e2e repair

**Four** specs touch this page (corrected per validate finding C2 / instruction E3 — the plan
originally said three and omitted `timesheet-punch.spec.ts`). Each is handled explicitly below.

## 4a — `tests/e2e/helpers.ts` (highest blast radius; other specs call it)

**Current**: `verifyAndApproveTimesheet` (`:64-83`) goes to `/requests/timesheets`, locates
`page.locator('[role="button"]', { hasText: 'Employee, Elena' }).filter({ hasText: hoursLabel })`,
clicks the card to open `getByRole('dialog', { name: 'Timesheet review' })`, clicks Approve, and
asserts the card count is 0.

**Verdict, stated explicitly: the LOCATOR survives; the NAVIGATION does not.**

- The `[role="button"]` selector still resolves, because DD-1 keeps `role="button"` on the card
  **body** and both the name and the hours text stay inside that body.
- `.filter({ hasText: hoursLabel })` still works, because DD-3 freezes the hours string.
- `getByRole('dialog', …)` and the Approve click inside the dialog are untouched — D1 keeps the
  modal, and `TimesheetModal` is out of scope.
- `await expect(card).toHaveCount(0)` still holds after the approval.
- **What breaks is page 1.** The queue is `submittedAt asc` (`+page.server.ts:48`) and the fixture is
  the newest row, so once the shared queue holds more than 10 SUBMITTED rows Elena's card is not on
  page 1 and the first `expect(card).toBeVisible()` times out (DD-6).

**Change**: add one exported helper and route both call sites through it.

1. Add `export async function findTimesheetCard(page, hoursLabel)`: `goto('/requests/timesheets', { waitUntil: 'domcontentloaded' })`,
   then loop — build the card locator, `if (await card.count()) return card`, else find
   `page.getByRole('link', { name: 'Next →' })`; if it has zero count, throw a named error
   (`` `no timesheet card matching ${hoursLabel} on any page` ``); otherwise click it, wait for the
   URL to settle, and repeat. Cap the loop (e.g. 20 pages) so a bug cannot hang the suite.
   The employee-name text stays a parameter default of `'Employee, Elena'` so both call sites keep
   their current subject.
2. `verifyAndApproveTimesheet` (`:64-83`) — replace its `goto` + locator (`:69-72`) with
   `const card = await findTimesheetCard(page, hoursLabel)`. Everything from `:73` down is
   **unchanged**, including the `toPass` retry wrapper and the `toHaveCount(0)` assertion.
3. Update the docblock at `:59-63` only if the change makes it untrue — it does not name page 1, so
   leave it, unless step 1's default parameter changes its wording.

## 4b — `tests/e2e/form-errors.spec.ts:184-213`

**This is the spec whose PREMISE D5 deletes.** Line 195's comment — "Selecting the card is what
renders the bulk bar" — and the `toPass` block at `:197-200` that checks the checkbox in order to
make `form[action*="approveMany"]` appear are both wrong after S2: the bar is always present.

Exact rewrite:

1. Replace the `goto` + card locator at `:188-192` with `const card = await findTimesheetCard(page, SEED_CARD)`
   (4a). Keep `await expect(card).toHaveCount(1)` at `:193`.
2. **New assertion, before any selection** — this is what proves AC2.2 and AC2.3, and it is the
   positive-control replacement for the deleted premise:
   `const bulkForm = page.locator('form[action*="approveMany"]')`,
   `await expect(bulkForm).toBeVisible()`,
   `await expect(bulkForm.getByRole('button', { name: 'Approve selected' })).toBeDisabled()`.
3. Replace the `toPass` block at `:197-200` with a hydration-safe check-then-enable:
   `await expect(async () => { await card.getByRole('checkbox', { name: 'Select timesheet' }).check(); await expect(bulkForm.getByRole('button', { name: 'Approve selected' })).toBeEnabled({ timeout: 1000 }) }).toPass({ timeout: 15000 })`.
   The retry is still needed — hydration timing is why `:197` had one — but the thing being waited
   for changes from *appears* to *enables*.
4. **Update the comment at `:195`** to state the new premise ("the bar is always present; selecting
   is what enables it"). This is a comment made untrue by the change — the one comment edit this
   plan permits. Do not add any other comment.
5. Steps `:202-212` are **unchanged**: blanking `input[name="ids"]`, clicking `Approve selected`,
   asserting the toast reads `/No timesheets selected/`, `toHaveCount(1)`, and
   `getByRole('alert')` count 0. D8 holds, so the toast contract is untouched — but note the
   blank-ids trick now needs step 3 to have run first, because the button is disabled until
   something is selected. Order matters: check the box, *then* blank the ids, *then* click.
6. `SEED_CARD = '6.5 hrs'` at `:101` is unchanged (DD-3).

## 4c — `tests/e2e/timesheet-approval.spec.ts` **and `tests/e2e/timesheet-punch.spec.ts`**

**No edit needed. Verified, not assumed:**

- `HOURS_CARD = '3.0 hrs'` (`:24`) — DD-3 freezes the string it matches.
- `HOURS_TABLE = '3.00 hrs'` (`:23`) is a `/timesheets` table cell, a different page, out of scope.
- `:135` calls `verifyAndApproveTimesheet(browser, HOURS_CARD)`, which 4a fixes centrally.
- `:120-131` drives `/timesheets`, not this page.

**`tests/e2e/timesheet-punch.spec.ts` — the fourth consumer, added per validate finding C2 / E3.**
It calls `verifyAndApproveTimesheet(browser, '7.0 hrs')` at `:121`. No edit needed — 4a fixes the
helper centrally, and `'7.0 hrs'` is frozen by DD-3 like every other hours label.

EXECUTE must **run both** specs (they are the two consumers of 4a) and must report if either goes
red. AC4.1 names the exact scoped command.

## 4d — not affected, do not touch

- `tests/e2e/employee-view-only.spec.ts:92-93` — those assertions are on `/timesheets`, a different
  page.
- `tests/unit/request-decide-feedback.test.ts` — server payloads only; it never calls `load`
  (see Touchpoints).

## Acceptance criteria — S4

| # | Criterion | Check |
|---|---|---|
| AC4.1 | **Both** helper consumers pass | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/timesheet-approval.spec.ts tests/e2e/timesheet-punch.spec.ts` exits 0. Never `pnpm test:e2e -- <specs>` — it silently ignores the filter |
| AC4.2 | The form-errors spec passes with the new premise | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/form-errors.spec.ts` exits 0 |
| AC4.3 | `findTimesheetCard` actually walks past page 1 | **The seeded gate from E2, not a grep.** Run the new page-walk spec: it seeds 11 step-less SUBMITTED timesheets for `employee@veent.ph` with ascending `submittedAt` (`approvalStep.deleteMany` per row — the trick at `form-errors.spec.ts:168-171` that makes them visible to `USERS.admin`), gives the newest a distinctive hours label, logs in as admin, calls the helper, and asserts it resolves **and** `page.url()` ends in `page=2`. Model: `tests/e2e/pagination.spec.ts:14-81`. Teardown deletes all 11 in `afterAll`. **The old `grep -c 'Next →'` check is withdrawn — it asserts a string was typed and cannot fail on a broken walk.** If E2 is refused, AC4.3 must be re-labelled `known-gap` with a backlog note; it may not be reported as a passing gate |
| AC4.4 | The page-walk is shared, not duplicated | `grep -c 'findTimesheetCard' tests/e2e/*.ts` shows the definition plus ≥ 2 call sites |
| AC4.5 | The deleted premise is not left asserted anywhere | `grep -n 'Selecting the card is what renders' tests/e2e/form-errors.spec.ts` returns nothing |
| AC4.6 | Nothing outside this plan's own test files changed | `git diff --stat 222d976 -- tests/e2e/helpers.ts tests/e2e/form-errors.spec.ts tests/e2e/timesheet-approval.spec.ts` plus whatever file E2 adds — **path-scoped, not a whole-`tests/` scan** (E5). A whole-tree diff is cross-lane contaminated and this plan does not own it |
| AC4.7 | The full suite holds | `CI=1 pnpm test:e2e` — only the pre-existing `attendance-save-timesheet-custom-range` failure |

**a11y — S4**: none directly, but AC3.1/AC3.2 mean any spec that locates a card by
`page.locator('div')` would now be wrong. None does; verified above.

**Commit subject (S4):**

```
test(e2e): follow the paginated timesheet queue and its always-on bulk bar
```

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm test` — T1.1 first page is a slice | Fully-Automated | AC1.1 (D7) |
| `pnpm test` — T1.2 `?page=3` returns the tail | Fully-Automated | AC1.2 (D7) |
| `pnpm test` — T1.3 stage fields survive the map, `currentStage` unchanged | Fully-Automated | AC1.3 (D4 stage badge) |
| `git diff --stat 222d976 -- src/lib/server/services/` empty | Fully-Automated | AC1.4 (constraint: services out of bounds) |
| `git diff 222d976 -- …+page.server.ts \| grep -E '^\+.*(db\.\|take:\|skip:)'` empty | Fully-Automated | AC1.5 (no new query) |
| `grep` structural checks on `+page.svelte` (container, no Clear, no slide, aria-live, Pagination, count pill, indeterminate) | Fully-Automated | AC2.1, AC2.4–AC2.9 (D5, D6, D7) |
| `CI=1 … playwright test tests/e2e/form-errors.spec.ts` — bar visible + button disabled at zero selection | Fully-Automated | AC2.2, AC2.3 (D5) |
| `grep` structural checks on `+page.svelte` (ul/li, h2, hours string, single role=button, footer form, guards, overdue, stage label) | Fully-Automated | AC3.1–AC3.9 (D1, D2, D4) |
| `CI=1 … playwright test tests/e2e/timesheet-approval.spec.ts tests/e2e/timesheet-punch.spec.ts` — card click still opens the modal and approves, for both helper consumers | Fully-Automated | AC3.10 (D1), AC4.1 |
| Seeded 11-row page-walk spec — helper resolves a card and lands on `page=2` (E2) | Fully-Automated | AC4.3 |
| DOM check: the `role="button"` element has zero `<button>` descendants (E1/E4) | Agent-Probe | AC3.4 (F1 residual) |
| `git diff --stat 222d976 -- src/lib/components/timesheets/` empty | Fully-Automated | AC3.11 (non-goal: modal internals) |
| `pnpm exec svelte-check --tsconfig ./tsconfig.json` + `pnpm lint` | Fully-Automated | AC2.10, AC3.12 |
| Path-scoped no-comments diff grep incl. `<!--` (E5) | Fully-Automated | AC1.6, AC3.15 (house rule) |
| `CI=1 pnpm test:e2e` full suite | Fully-Automated | AC4.7 |
| Selection announcement flips inside the `aria-live` span | Agent-Probe | AC2.11 (D6) |
| Inline Approve/Reject act on one card only; siblings never grey out | Agent-Probe | **AC3.13 (D2) — required for VERIFIED** |
| Inline card-footer Approve/Reject end-to-end in a spec | Known-Gap → **backlog stub + S3 stays CONDITIONAL** | D2 — see the known-gap ruling in the S3 test plan. Never a terminal PASS. |
| Backlog note for the above exists on disk | Fully-Automated | AC3.14 |

---

## Post-Phase Testing — full gate set

Run after all four commits, from the repo root:

```
pnpm format:check
pnpm lint
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm test
CI=1 pnpm test:e2e
```

Traps, all three verified on this branch:

- Use `pnpm exec svelte-check --tsconfig ./tsconfig.json`, **not** `pnpm check` — `pnpm check`
  kills the owner's dev server.
- **`pnpm test:e2e -- <specs>` SILENTLY IGNORES the filter** and runs all 143 specs, which then hits
  the known pre-existing failure and gets mis-attributed. The working scoped form is
  `CI=1 pnpm exec dotenv -e .env.dev -- playwright test <specs>`.
- `attendance-save-timesheet-custom-range` is a **pre-existing** e2e failure on this branch. It is
  not ours; do not chase it and do not count it against these gates.

Test routing reference: `process/context/tests/all-tests.md`.

---

## Test Infra Improvement Notes

(none identified yet)

---

## Phase Completion Rules

- A section is `CODE DONE` when its checklist is complete and its own gates are green.
- A section is `✅ VERIFIED` only after the full gate set above runs green (minus the pre-existing
  attendance failure) **and the user confirmed it working**. Code-only completion is `CODE DONE`,
  never `VERIFIED`.
- **S3 is CONDITIONAL until AC3.13 (agent-probe) and AC3.14 (backlog stub) are both satisfied.**
  The inline action footer is new behaviour whose only automated coverage is a known gap, so it may
  not be declared PASS on automated gates alone.
- S1, S2 and S4 may reach `VERIFIED` on the automated gates plus the owner's confirmation.

---

## Resume and Execution Handoff

1. **Selected plan file**: `process/general-plans/active/timesheet-queue-approvals-parity_10-09-26/timesheet-queue-approvals-parity_PLAN_10-09-26.md`
2. **Last completed step**: PLAN written. No source touched. Branch `feat/uiux-phase-4` @ `222d976`,
   tree clean.
3. **Validate-contract status**: **written — gate CONDITIONAL.** See `## Validate Contract`.
   P1–P6 have been applied to this plan body. **E1–E10 are binding on EXECUTE and are not
   optional** — read the `### Binding execute instructions` table before writing any source.
4. **Supporting context loaded**: `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `process/context/uxui/all-uxui.md`;
   references `src/routes/(app)/requests/approvals/+page.svelte` (target),
   `src/routes/(app)/requests/proposals/+page.svelte` (second reference, read-only),
   `process/general-plans/completed/roles-pagination-and-bulk-allfail_10-09-26/` (the pagination
   precedent this repeats).
5. **Next step for a fresh agent**: run VALIDATE against this plan. After the contract is written,
   EXECUTE sections **in order S1 → S2 → S3 → S4**, one commit each, and do not start S4 until the
   markup from S2 and S3 is on disk. If picking up mid-execution, `git log --oneline 222d976..HEAD`
   tells you which sections landed — the four commit subjects are quoted at the end of each section.

---

## Validate Contract

Status: CONDITIONAL
Date: 10-09-26
date: 2026-09-10
generated-by: outer-pvl

Scope: scoped VALIDATE per owner briefing (H1–H6). D1–D8 design rulings NOT re-argued.
Repo `feat/uiux-phase-4` @ `222d976`. Structural validator: 0 failures, 0 warnings.

Parallel strategy: sequential (single validate agent, read-only source sweep)
Rationale: 2/7 signals (S7 five files in blast radius; S3 six named hunt directions). No
schema/auth/API/billing surface, one package, one route. Fan-out would cost more than it buys.

### Net gate derivation

| Layer 1 dimension | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | CONCERN |
| Breaking changes | PASS |
| Security surface | PASS |

| Layer 2 section | Status |
|---|---|
| S1 — server pagination + stage label | PASS |
| S2 — chrome | CONCERN |
| S3 — card + inline footer | CONCERN (one downgraded FAIL) |
| S4 — e2e repair | CONCERN |

**Totals: 0 unresolved FAILs / 12 CONCERNs / 8 PASSes → Net Gate: CONDITIONAL**

### Severity corrections — recorded in both directions

**Downgraded FAIL → CONCERN (1).** F1 (nested interactive content, H5). Graded FAIL on first
pass: DD-1's central a11y rationale is provably false against the plan's own specified markup.
Downgraded to CONCERN because (a) the violation is the same class as one already shipped on this
page (`+page.svelte:145-152`, the checkbox inside the `role="button"` card), so this is not a new
defect class; and (b) E1 resolves it without touching any owner ruling — D1 and D2 both survive.
It is NOT downgraded on the merits of the a11y claim, which stands falsified.

**Upgraded PASS → CONCERN (2).** AC4.3 and AC3.13 were written as gates. Both were re-graded as
non-gates: AC4.3 asserts a string was typed, AC3.13 names a precondition the environment cannot
produce. See C1 and C9.

**Confirmed PASS, not softened (7).** H1(a) ordering, H2 sweep (one miss only), H4 badge safety on
all three chain shapes, H4 no-new-query, H5 24px floor, H5 list/heading/aria-live restoration,
H6 sequencing. Stated plainly below — no manufactured concerns.

### Findings

| # | Finding | Severity | Evidence | Resolution |
|---|---|---|---|---|
| F1 | DD-1's claim "the footer sits outside the card body so there is no nesting break" is only half true. The footer IS a sibling — correct. But S3 step 10 puts a **new** `<button class="btn-row">View detail</button>` INSIDE the `role="button"` body div (S3 step 7). That is nested interactive content: a `<button>` inside a widget-role element (axe `nested-interactive`). Page A has no such problem — A's body div carries **no** role (`approvals/+page.svelte:243`) and A's View detail is an `<a href>` (`:341`). B is copying A's markup into a container A does not have. | CONCERN (downgraded FAIL) | `approvals/+page.svelte:243`, `:341-343`; plan S3 steps 7 + 10; pre-existing twin at `timesheets/+page.svelte:145-152` | E1 |
| C1 | **DD-6's premise is false for the current environment, and the helper it prescribes has a dead loop body.** Measured, not reasoned: the whole dev/e2e database holds **1 timesheet, 0 SUBMITTED**. `prisma/seed*.ts` creates **zero** SUBMITTED timesheets. Only `form-errors.spec.ts:110-160` creates one directly; `timesheet-approval.spec.ts` and `timesheet-punch.spec.ts` each submit one through the UI. Peak actionable queue is ~3 rows, and the per-user `canActOnStage` filter (`+page.server.ts:51-63`) cuts it further. With `pageSize` 10, `Pagination.svelte:28` (`{#if meta.total > meta.pageSize}`) renders **nothing**, so no `Next →` link ever exists and `findTimesheetCard`'s walk branch **never executes**. AC4.3 (`grep -c 'Next →' tests/e2e/helpers.ts` ≥ 1) asserts only that the string was typed — it cannot fail on a broken walk. The helper is correct future-proofing, but as written it ships unexercised and will rot silently. | CONCERN | `+page.server.ts:48`; `Pagination.svelte:28`; live DB count via `docker exec -i veent-db-5434 psql -p 5434` → `all_timesheets 1`, `APPROVED 1`; `grep -rln "status: 'SUBMITTED'" tests/e2e/` → `form-errors.spec.ts` only | E2 |
| C2 | **H2 — the plan missed a fourth consumer.** `tests/e2e/timesheet-punch.spec.ts:121` calls `verifyAndApproveTimesheet(browser, '7.0 hrs')`. The plan says "Three specs touch this page" (line 608) and §4d lists what is unaffected without naming it. It needs no edit — 4a fixes the helper centrally — but it is a direct consumer of changed code and the S4 scoped gate list (AC4.1, AC4.2) omits it. Only AC4.7 (full suite) covers it. The rest of the sweep is **CLEAN**: `nav-sections.test.ts:197` asserts an href with no query param; `approval-api-role-context.test.ts:12` mentions the route only in a comment and imports `api/v1` routes; `leave-balances.spec.ts:105` is a comment; `employee-view-only.spec.ts:92-93` is on `/timesheets` as the plan says; `request-decide-feedback.test.ts` is correctly analysed. No `src/` module imports this route's `PageData`. | CONCERN | `tests/e2e/timesheet-punch.spec.ts:3`, `:121`; sweep of all 45 e2e specs + `tests/unit/` + `src/` | E3 |
| C3 | **AC3.4's second clause is wrong and unmechanical.** `grep -c 'role="button"'` returns **1 both before and after** the change (`+page.svelte:126` today), so the count alone proves nothing. The stated tiebreak — "the line above it is the `<li`, not the `<form`" — contradicts the plan's own markup: per S3 steps 6-7 the `role="button"` sits on the body `<div>`, whose preceding line is the `<li>`'s multi-line class attribute after Prettier, not `<li`. The criterion as written can pass on wrong markup and fail on right markup. | CONCERN | plan AC3.4 vs plan S3 steps 6-7; `+page.svelte:125-135` | E4 |
| C4 | **Three gates scan the whole tree and are cross-lane contaminated.** AC1.6 and AC3.15 run `git diff 222d976 -- src/`, and AC4.6 runs `git diff --stat 222d976 -- tests/`. Any concurrent edit anywhere under `src/` or `tests/` lands inside these gates and turns them red (or green) for reasons this plan does not own. Separately, the comment regex `^\+\s*(//\|/\*)` misses Svelte template comments `<!-- -->` entirely, so the no-comments house rule is unenforced in exactly the file where most of the work happens. The `git diff` gates ARE correctly pinned to `222d976` — that part is fine. | CONCERN | plan AC1.6, AC3.15, AC4.6 | E5 |
| C5 | **Plan self-contradiction that guarantees a red gate.** S2 step 4 permits copying A's `// ponytail: indeterminate and checked set imperatively` comment verbatim (`approvals/+page.svelte:29`). AC1.6 and AC3.15 fail on any added line matching `^\+\s*//`. Following step 4 makes the plan's own gate red. | CONCERN | plan S2 step 4 vs AC1.6/AC3.15; `approvals/+page.svelte:29` | E6 |
| C6 | **S3 step 12 leaves the hidden single-reject form's guard unspecified** — the plan literally writes `use:enhance={/* the single-reject guard */}`. Two problems: the guard is undecided, and the placeholder is a comment the house rule forbids. `reviewGuard(singleId)` would be wrong — `singleId` is `''` when the page mounts, so the guard would be created against an empty key. A's pattern is a dedicated page-level `const decide = submitFeedback()` (`approvals/+page.svelte:172`). | CONCERN | plan S3 step 12; `approvals/+page.svelte:172`, `:388-390`; `submit-feedback.svelte.ts:98-101` | E7 |
| C7 | **The per-card Reject button's disabled state is dead.** S3 step 11 gives Reject `disabled={g.busy}`, but the reject actually posts through the page-level hidden form (S3 step 12), which carries a different guard. `g.busy` therefore never goes true for a reject, so Reject stays enabled during its own in-flight post. A avoids this by using the shared popup guard on Return/Reject (`approvals/+page.svelte:358`, `:366` use `decide.busy`, not `approve.busy`). | CONCERN | plan S3 steps 11-12; `approvals/+page.svelte:352-374` | E7 |
| C8 | **`toHaveCount(0)` weakens under pagination.** `helpers.ts:80` asserts the approved card is gone. The plan says it "still holds" (line 624) — true today, but once the helper can walk to page N the assertion proves only "not on the page I am standing on", not "left the queue". Approving a row also re-paginates (11 rows → 10 makes page 2 vanish and `paginate` clamps to page 1, `pagination.ts:45`), so the card can be absent for the wrong reason. | CONCERN | `tests/e2e/helpers.ts:80`; `src/lib/server/pagination.ts:41-45`; plan line 624 | E8 |
| C9 | **AC3.13 is a well-written probe with an unbuildable precondition.** The judgement it asks for is specific and falsifiable — click Approve on card 1, green toast, that card leaves, card 2 never greys — so it is NOT "look at it". But it opens with "a queue with ≥ 2 cards" and the environment has **zero** SUBMITTED timesheets (C1). No seeding recipe is given, so the probe is skippable by accident. "Card 2's buttons never greyed out during the post" also needs a stated observation method — an in-flight state is not reliably catchable by eye. | CONCERN | plan AC3.13; live DB count (C1) | E9 |
| C10 | **The S1-only commit ships a page that silently hides rows.** After S1 and before S2, `load` returns a 10-row slice and the page renders no `<Pagination>`, so rows 11+ are unreachable. It renders and does not crash — no non-rendering intermediate — but it is a real (brief) regression window. Impact is currently zero because the queue never exceeds ~3 rows (C1). | CONCERN (low) | plan S1 step 6 vs S2 step 13 | E10 |
| C11 | **A dead branch is copied from A.** DD-5's `stageKind === 'SUPERVISOR' ? 'Supervisor' : …` can never fire on this page: every timesheet chain is built by `buildApprovalChain`, which hardcodes `stageKind: 'ROLE'` for all three steps (`routing.ts:37`). Harmless, but it is unreachable code arriving on day one. | CONCERN (low) | `services/requests/routing.ts:8-11`, `:36-40`; `services/timesheets.ts:27-34` | E10 |
| C12 | **Both optional chains must survive the S1 rewrite.** S1 step 4's prose (`<live step's stage ?? null>`) is loose. `liveChain` returns `null` outright for a step-less row (`approvals.ts:41`) and `currentStep` is `null` when the live attempt is fully decided (`approvals.ts:48-52`). Dropping either `?.` while "computing the live chain once" turns a legacy row into a TypeError in `load`. | CONCERN (low) | `services/approvals.ts:40-53`; `+page.server.ts:66` | E10 |
| H1(a) ordering | Verified: `orderBy: { submittedAt: 'asc' }`. The plan's claim is exactly right, and a freshly seeded fixture is genuinely the last row. | PASS | `+page.server.ts:48` | — |
| H2 sweep | Clean apart from C2. No `src/` importer of this route's `PageData`; no other spec, helper, fixture or global-setup breaks on pagination, the removed `Clear`, the always-present bar, or the card markup. | PASS | full sweep of `tests/` + `src/` | — |
| H4 badge safety | The badge cannot render `Stage: undefined` and cannot crash. Three shapes checked: (1) three-stage MAKE→VERIFY→APPROVE — `currentStep` is the live row, `stageKind: 'ROLE'`, `role` always set (`HR_ADMIN`/`VERIFIER`/`APPROVER`), badge reads `Stage: HR` / `Verifier` / `Approver`; (2) legacy step-less row (the `form-errors.spec.ts:170` fixture) — `liveChain` returns `null` → `currentStageKind` null → S3 step 10 renders **no badge**; (3) current stage already decided — `currentStep` is `null` → same null path, no badge. The plan's `stageLabel` returning `''` on a null kind is belt-and-braces on top of that. | PASS | `approvals.ts:41`, `:48-52`; `routing.ts:8-11`, `:36-40`; `form-errors.spec.ts:168-171`; plan S3 steps 2 + 10 | — |
| H4 no-new-query | Verified. `include.approvalSteps: true` already fetches the rows, `liveChain().currentStep` is the full `ApprovalStep`, and `stageKind` / `role` are columns on it. The two new fields are pure in-memory reads — the plan's claim holds exactly. | PASS | `+page.server.ts:43-47`; `approvals.ts:48-52`; `prisma/schema.prisma:868`, `:870` | — |
| H5 24px floor | Not regressed. `app.css:114-126` floors `button` and `[role='button']` to 24×24 under `@media (pointer: coarse)`, which covers both the new footer buttons and the `button.btn-row` View detail (A uses `a.btn-row`; the bare `button` selector catches B's variant). Intrinsically, `px-2 py-1 text-xs` = 16px line-height + 8px padding = exactly 24px. | PASS | `src/app.css:108-127`, `:219-221` | — |
| H5 list/heading/live-region | The `<ul>`/`<li>`, `<h2>` and `aria-live="polite"` from the `89ab1a5` A5 audit are all restored by S2 step 8 and S3 steps 5-6, 8. No prior a11y win is dropped. | PASS | plan S2 step 8, S3 steps 5-8; `approvals/+page.svelte:196-208`, `:233-241`, `:264` | — |
| H6 sequencing | No intermediate commit ships a non-rendering page. S2 keeps the old `{#each}` grid untouched (step 14) and S3 depends on nothing S2 removed — S2 deletes `Clear`, the bare select-all label, the `slide` import and the two-arg `toggleAll`, none of which S3 touches. S3 consumes `data.currentStageKind` from S1 and the container from S2, both already on disk. Sequential S1→S2→S3→S4 is correct. | PASS | plan S2 steps 5, 11, 12, 14; S3 steps 5-13 | — |
| Public contracts | Additive only, verified. `TimesheetModal` types its prop structurally as `TimesheetLike` (`TimesheetModal.svelte:25-33`), so two extra fields cannot break it. `load` destructures `{ locals }` only today, so `?page=` cannot collide. | PASS | `TimesheetModal.svelte:12-33`; `+page.server.ts:19` | — |
| Security surface (#290 rule — `actions` export audited, not just handler bodies) | No new surface. The `actions` export (`+page.server.ts:82-183`) gains nothing; the inline footer posts to the **existing** `review` action, whose gate `canReviewTimesheets(roles)` runs at `:87` before any form read, and there is no wrapper, decorator or hook in between. `load`'s RBAC gate (`:22`), the org scope (`:41`), the self-exclusion (`:40`) and the per-stage `canActOnStage` filter (`:51-63`) are all byte-identical under S1. Pagination is applied **after** the filter, so `pagination.total` is the actor's own actionable count and leaks no cross-actor cardinality. No auth, billing, schema, migration or public-API class is touched — no `vc-risk-evidence-pack` required. | PASS | `+page.server.ts:19-69`, `:82-112` | — |

### Test gates (C3 5-column)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1.1 | queue load returns a page slice + `pagination` | Fully-Automated | `pnpm test` — T1.1 | B |
| AC1.2 | `?page=3` returns the tail, not page 1 | Fully-Automated | `pnpm test` — T1.2 | B |
| AC1.3 | live step's `stageKind`/`role` reach the client, `currentStage` unchanged | Fully-Automated | `pnpm test` — T1.3 | B |
| AC1.4 / AC3.11 | service layer and modal untouched | Fully-Automated | `git diff --stat 222d976 -- src/lib/server/services/ src/lib/components/timesheets/` empty | A |
| AC1.5 | no new Prisma query, no `take`/`skip` | Fully-Automated | pinned `git diff` grep on `+page.server.ts` | A |
| AC1.6 / AC3.15 | no new source comments | Fully-Automated | pinned `git diff` grep, **scoped per E5** | A |
| AC2.1, AC2.4–AC2.9 | chrome structure (container, no Clear, no slide, aria-live, Pagination, count pill, tri-state) | Fully-Automated | `grep -c` on `+page.svelte`; all seven distinguish pre- from post-change | A |
| AC2.2, AC2.3 | bar visible and buttons disabled at **zero** selection | Fully-Automated | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/form-errors.spec.ts` | B |
| AC3.1–AC3.3, AC3.5–AC3.9 | card structure (list, `<h2>`, frozen hours, footer form, per-card guards, overdue, stage label) | Fully-Automated | `grep -c` on `+page.svelte` | A |
| AC3.4 | exactly one `role="button"` per card, on the body | Agent-Probe | **re-specified per E4** — count is identical pre/post, so grep alone cannot prove it | B |
| AC3.10 | card click still opens the modal and approves | Fully-Automated | `CI=1 … playwright test tests/e2e/timesheet-approval.spec.ts` | A |
| AC3.13 | inline Approve/Reject act on one card only; siblings never grey out | Agent-Probe | **seeded probe per E9** | B |
| AC3.14 | inline-actions coverage gap recorded | Fully-Automated | `test -f process/features/ui-ux-overhaul/backlog/timesheet-card-inline-actions-e2e_NOTE_10-09-26.md` | A |
| AC2.10 / AC3.12 | types and lint hold | Fully-Automated | `pnpm exec svelte-check --tsconfig ./tsconfig.json` + `pnpm lint` | A |
| AC4.1, AC4.2, **+ timesheet-punch per E3** | all three helper consumers pass | Fully-Automated | scoped `playwright test` per spec | B |
| AC4.4, AC4.5 | page-walk shared; deleted premise not left asserted | Fully-Automated | `grep` on `tests/e2e/` | A |
| AC4.7 | full suite holds | Fully-Automated | `CI=1 pnpm test:e2e` (minus the pre-existing `attendance-save-timesheet-custom-range` failure) | A |
| **NEW per E2** | `findTimesheetCard` actually reaches a card on page 2 | Fully-Automated | seeded 11-row page-walk e2e (see E2) | B |
| F1 residual | no nested interactive content in the card | Agent-Probe | axe/DOM check per E1 | B |

gap-resolution legend: A — proven now · B — fixed by this plan's checklist · C — deferred to a named phase · D — backlog stub.

Legacy line form:
- S1 server: `Fully-automated: pnpm test` (T1.1–T1.3, new file `tests/unit/timesheets-queue-load.test.ts`)
- S2/S3 structure: `Fully-automated: grep -c on +page.svelte` (AC2.1, AC2.4–AC2.9, AC3.1–AC3.3, AC3.5–AC3.9)
- S2 behaviour: `Fully-automated: CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/form-errors.spec.ts`
- S4 behaviour: `Fully-automated: CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/timesheet-approval.spec.ts tests/e2e/timesheet-punch.spec.ts` — precondition: `pnpm db:seed:e2e` applied
- Page-walk: `Fully-automated: seeded 11-row e2e per E2`
- Card nesting + inline actions + selection announcement: `agent-probe: E1, E9, AC2.11`
- Inline card-footer Approve/Reject in a spec: `known-gap: documented as NEW PLAN REQUIRED` — backlog stub per AC3.14, never a terminal PASS (plan's own vacuous-green ruling upheld)

Failing stub — new page-walk gate (E2):
```
test("findTimesheetCard walks past page 1 to reach a card on page 2", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: findTimesheetCard walks past page 1 to reach a card on page 2")
})
```

### Dimension findings

- Infra fit: PASS — one package, one route, no container/port/worker surface; `paginate` and `Pagination` are the established repo pair and the default `pageSize` 10 matches 9 of 11 paginated routes.
- Test coverage: CONCERN — the S1 unit tests are real and T1.2 cannot pass vacuously, but the page-walk helper ships with an unexercised loop body (C1), one helper consumer is missing from the scoped gate list (C2), two structural ACs cannot fail meaningfully (C3, C4) and the key agent-probe has an unbuildable precondition (C9).
- Breaking changes: PASS — both new payload fields are additive; `TimesheetModal`'s prop type is structural; `load` reads no query params today so `?page=` cannot collide; the only behavioural break is inside `tests/`, and S4 owns it.
- Security surface: PASS — `actions` export and its gate audited per the #290 rule, not just handler bodies. No auth, billing, schema, migration or public-API class touched. Pagination applied after the per-actor filter, so the count pill leaks nothing.
- S1 feasibility: PASS — every edit target at `+page.server.ts:1-7`, `:19`, `:64-67`, `:69` is present and uniquely matchable; highest-risk edit is the `.map` rewrite (C12).
- S2 feasibility: CONCERN — targets matchable; C5 is a self-contradiction between step 4 and the plan's own gate.
- S3 feasibility: CONCERN — targets matchable; F1 falsifies DD-1's a11y rationale; C6 leaves the hidden form's guard unspecified; C7 makes a disabled state dead.
- S4 feasibility: CONCERN — C1 (dead loop body), C2 (missed consumer), C8 (weakened assertion).

### Binding execute instructions

| # | Instruction | Trigger |
|---|---|---|
| **E1** | Move the card's bottom row (stage badge + **View detail**) **out of** the `role="button"` body div and render it as a sibling inside the `<li>`, directly above the action footer — e.g. `<div class="mt-auto flex items-center justify-between gap-2 border-t-0 px-4 pb-3 pt-1">`. Drop `mt-auto` from it only if the body keeps `flex-1`. D1 and D2 both survive: the body still opens the modal on click/Enter/Space, and View detail is still a real `<button>`. The pre-existing checkbox stays where it is (out of scope, as the plan says). Then verify with a DOM check, not by eye: on a seeded queue, assert that the element carrying `role="button"` contains **zero** `<button>` descendants. Record the result in the phase report. | S3 entry — before writing the card template |
| **E2** | Add one fully-automated page-walk gate; do **not** ship `findTimesheetCard` with an unexercised loop. New spec (or a `describe` block in `form-errors.spec.ts`) modelled on `tests/e2e/pagination.spec.ts:14-81`: in `beforeAll`, seed **11** SUBMITTED timesheets for `employee@veent.ph` with ascending `submittedAt` and `approvalStep.deleteMany` per row (the legacy VIEW_TEAM trick already used at `form-errors.spec.ts:168-171`, which is what makes them visible to `USERS.admin`); make the **newest** one carry a distinctive hours label; log in as admin, call `findTimesheetCard`, and assert both that it resolves **and** that `page.url()` ends in `page=2`. Teardown deletes all 11, best-effort, in `afterAll`. This is the only gate that can catch a broken walk — AC4.3's grep cannot. If E2 is refused, AC4.3 must be re-labelled `known-gap` in the phase report and a backlog note written; it may not be reported as a passing gate. | S4 entry |
| **E3** | Add `tests/e2e/timesheet-punch.spec.ts` to the S4 scoped gate list. It calls the changed helper at `:121` and the plan never named it. Run `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/timesheet-approval.spec.ts tests/e2e/timesheet-punch.spec.ts tests/e2e/form-errors.spec.ts` — never `pnpm test:e2e -- <specs>`, which silently ignores the filter. Also correct the plan's "Three specs touch this page" (line 608) to four in the phase report. | S4 gates |
| **E4** | Replace AC3.4. The grep count is 1 both before and after, so it proves nothing, and the "line above it is the `<li`" tiebreak is wrong after Prettier. Use instead: (a) `grep -c 'role="button"' "src/routes/(app)/requests/timesheets/+page.svelte"` returns 1 — necessary, not sufficient; **and** (b) the E1 DOM check (role="button" element has zero `<button>` descendants). Report both. | S3 gates |
| **E5** | Scope the whole-tree diff gates to this plan's own paths so a concurrent lane cannot colour them. AC1.6 / AC3.15 become `git diff 222d976 -- "src/routes/(app)/requests/timesheets/" \| grep '^+' \| grep -E '^\+\s*(//\|/\*\|<!--)'` — note the added `<!--` alternative, without which the no-comments rule is unenforced in the `.svelte` file. AC4.6 becomes `git diff --stat 222d976 -- tests/e2e/helpers.ts tests/e2e/form-errors.spec.ts tests/e2e/timesheet-approval.spec.ts` plus whatever E2 adds. | before running any diff gate |
| **E6** | Do **not** copy A's `// ponytail:` comment (S2 step 4). The no-comments gate wins; write the `$effect` without it. This resolves the plan's internal contradiction in favour of the house rule. | S2 step 4 |
| **E7** | Specify the hidden single-reject form's guard: add a dedicated page-level `const singleReject = submitFeedback()` (A's `decide` pattern, `approvals/+page.svelte:172`) and bind `use:enhance={singleReject.enhance}` — never `reviewGuard(singleId)`, which would key a guard on the empty mount-time id. Emit **no** placeholder comment in its place. Then change the per-card Reject button's guard from `disabled={g.busy}` to `disabled={singleReject.busy}`, mirroring A (`approvals/+page.svelte:358`, `:366`); as the plan writes it the Reject disabled state can never fire for its own post. Keep the per-card `g` on the Approve submit button (DD-9 stands). | S3 steps 11-12 |
| **E8** | Strengthen `helpers.ts:80`. Keep `await expect(card).toHaveCount(0)` but pair it with a positive control that survives pagination — assert the count pill total decreased, or assert `findTimesheetCard` now throws its named "no timesheet card matching …" error. A bare page-local `toHaveCount(0)` no longer means "left the queue" once the list paginates. | S4 step 4a |
| **E9** | Make AC3.13 runnable. Name the seeding recipe inline: reuse E2's fixture (or seed exactly 2 SUBMITTED, step-less timesheets for `employee@veent.ph` with distinct hours labels) and log in as `admin@veent.ph`. Name the observation method for "card 2 never greys out": watch card 1's button flip to `Approving…` and, while that text is on screen, assert card 2's Approve is still enabled — do not judge it from a static screenshot after the post settles. Capture a screenshot of the mid-post state and file it with the phase report. Delete the fixtures afterwards. AC3.13 is not satisfied by a narrative. | S3 exit, before claiming VERIFIED |
| **E10** | Three small corrections, all in S1/S3: (a) keep **both** optional chains in the S1 `.map` — `live?.currentStep?.stage ?? null` and the same for `stageKind` / `role`; `liveChain` returns null for step-less rows (`approvals.ts:41`) and `currentStep` is null on a fully decided attempt (`:48-52`), so dropping either turns a legacy row into a TypeError in `load`. (b) Note in the phase report that DD-5's `stageKind === 'SUPERVISOR'` branch is unreachable for timesheets (`routing.ts:37` hardcodes `'ROLE'`) — keep it for parity with A, but do not claim it is covered. (c) The S1-only commit hides rows 11+ until S2 lands; state that in the S1 commit body and do not leave the branch parked between S1 and S2. | S1 entry, S1 commit |

### Proposed plan updates

| # | What changes | Where | Why |
|---|---|---|---|
| P1 | DD-1's last sentence — "The footer sits outside it" is right, but the paragraph must stop claiming the card has no nested interactive content while step 10 puts a `<button>` inside the body | Design decisions → DD-1; S3 a11y bullet 5 | F1 |
| P2 | DD-6 reworded: the queue holds ~3 rows today, so the page-walk is future-proofing, not a present fix — and it needs its own gate | Design decisions → DD-6 | C1 |
| P3 | "Three specs touch this page" → four; add `timesheet-punch.spec.ts` to Touchpoints and to §4c/AC4.1 | Overview line 608, Touchpoints, S4 | C2 |
| P4 | AC3.4, AC4.3, AC1.6, AC3.15, AC4.6 rewritten per E4, E2, E5 | AC tables | C1, C3, C4 |
| P5 | S2 step 4 loses the "copy A's ponytail comment" permission | S2 checklist | C5 |
| P6 | S3 step 12's `/* the single-reject guard */` placeholder replaced with the named guard; S3 step 11's Reject guard corrected | S3 checklist | C6, C7 |

### Backlog artifacts

| Artifact | Location | Tracks |
|---|---|---|
| `timesheet-card-inline-actions-e2e_NOTE_10-09-26.md` | `process/features/ui-ux-overhaul/backlog/` | The inline card-footer Approve/Reject e2e gap the plan already rules must be recorded (AC3.14) — unchanged by this validate |

Open gaps:
- Inline card-footer Approve/Reject have no automated spec: `known-gap: documented as NEW PLAN REQUIRED` — backlog note per AC3.14. The plan's own vacuous-green ruling (S3 test plan) is upheld: S3 may not reach VERIFIED on automated gates alone.
- If E2 is refused, the page-walk helper's loop body stays unexercised: `known-gap: documented as NEW PLAN REQUIRED`.

What this coverage does NOT prove:
- `pnpm test` (T1.1–T1.3) proves the slice arithmetic and the field pass-through against **mocks**. It does not prove Prisma returns rows in `submittedAt asc` order, does not prove the `canActOnStage` filter runs before `paginate`, and does not touch a database.
- The `grep -c` structural ACs prove strings exist in a file. They do not prove the markup nests correctly, that Svelte compiles it, that it renders, or that any of it is reachable by keyboard or screen reader.
- `form-errors.spec.ts` proves the bulk bar is visible and its Approve button is disabled at zero selection **on page 1 of a one-page queue**. It does not exercise pagination, the count pill, the tri-state indeterminate state, the card footer, or the single-reject dialog.
- `timesheet-approval.spec.ts` + `timesheet-punch.spec.ts` prove the card body still opens the modal and the modal still approves, for the verifier and approver roles, on a queue of one to three rows. They do not prove the page-walk, the inline footer, or any multi-page behaviour.
- `CI=1 pnpm test:e2e` proves no other spec regressed. It does not cover the pre-existing `attendance-save-timesheet-custom-range` failure, which stays red for unrelated reasons.
- No gate at any tier proves the inline Approve or inline Reject posts `?/review` from the card, nor that a per-card guard isolates one row from another. That is the named residual (AC3.13 probe + backlog stub).
- No gate proves the stage badge renders correctly for a legacy step-less row in a browser — the null path is proven by source reading only.

Gate: CONDITIONAL — 0 unresolved FAILs, 12 CONCERNs. 1 FAIL downgraded with recorded rationale (F1). 6 fixed by plan update (P1–P6), 10 carried as binding execute instructions (E1–E10), 2 as known-gaps on record. Proceed to EXECUTE with E1–E10 in scope.
Accepted by: session (scoped VALIDATE, owner-directed H1–H6 hunt) — accepted concerns: F1 nested-interactive (E1), C1 dead page-walk loop (E2), C2 missed helper consumer (E3), C3 unfalsifiable AC3.4 (E4), C4 cross-lane diff gates (E5), C5 ponytail-comment contradiction (E6), C6 unspecified single-reject guard (E7), C7 dead Reject disabled state (E7), C8 weakened toHaveCount(0) (E8), C9 unbuildable probe precondition (E9), C10/C11/C12 minor S1 corrections (E10). Owner confirmation required before EXECUTE starts.

---

## Autonomous Goal Block

```
SESSION GOAL
Bring /requests/timesheets to /requests/approvals parity in four sequential commits
(S1 server pagination + stage label, S2 chrome, S3 card + inline footer, S4 e2e repair)
on branch feat/uiux-phase-4, starting from 222d976.

PLAN
process/general-plans/active/timesheet-queue-approvals-parity_10-09-26/timesheet-queue-approvals-parity_PLAN_10-09-26.md

CONTRACT SUMMARY
Gate CONDITIONAL. 0 unresolved FAILs, 12 CONCERNs. One FAIL downgraded on record (F1,
nested interactive content in the card body). E1-E10 in the Validate Contract are binding
on EXECUTE and are not optional. P1-P6 are plan-text corrections to apply first.

AUTONOMY RULES
- Apply P1-P6 to the plan file before writing any source.
- Execute S1 -> S2 -> S3 -> S4 in order, one commit each, commit subjects quoted in the plan.
- Never touch src/lib/server/services/** or /requests/proposals.
- No explanatory comments in source. No Co-Authored-By, no AI attribution in commit messages.
- Do not restyle the Approve selected green fill (GitHub issue #27).
- Run scoped e2e as: CI=1 pnpm exec dotenv -e .env.dev -- playwright test <specs>
  NEVER `pnpm test:e2e -- <specs>` (the filter is silently ignored).
- Use `pnpm exec svelte-check --tsconfig ./tsconfig.json`, never `pnpm check`.
- attendance-save-timesheet-custom-range is a pre-existing e2e failure; do not chase it.

HARD STOPS
- Do not push, do not open a PR, do not merge. Ask first.
- Do not start S4 before the S2 and S3 markup is on disk.
- Do not declare S3 VERIFIED without AC3.13 (probe per E9) and AC3.14 (backlog note).
- If E1's DOM check still finds a <button> inside the role="button" element, stop and report.
- Do not edit .env or any env file. Do not start or stop the dev server or the database.

NEXT PHASE
EXECUTE, sequential, one agent, four commits.

EXECUTE START
ENTER EXECUTE MODE with the plan path above; E1-E10 and P1-P6 from the Validate Contract are in scope.
```

---
name: plan:roles-pagination-and-bulk-allfail
description: "PLAN — two independent fixes: /settings/roles pagination + email filter (B1), and bulk timesheet all-fail returning fail() instead of a green success toast (O1)."
date: 10-09-26
branch: feat/uiux-phase-4
complexity: SIMPLE
status: SHIPPED — both sections CODE DONE, full gate set green (attendance e2e pre-existing failure excepted). Commits d26066d (B1), bb7eb28 (O1), cacdb09 (plan). Owner VERIFIED confirmation still pending.
---

# PLAN — `/settings/roles` pagination (B1) + bulk timesheet all-fail (O1)

**Date**: 10-09-26 · **Branch**: `feat/uiux-phase-4` @ `c3bf6cf` (tree clean) · **Complexity**: SIMPLE
**Status**: SHIPPED — both sections CODE DONE. See `## Execution Outcome`. `✅ VERIFIED` is still
open pending the owner's manual confirmation (see `## Phase Completion Rules`).

**TL;DR.** Two small, unrelated fixes. Section 1 paginates and filters the roles table in the
route `load` (212 users are in the DOM today). Section 2 makes an all-failed bulk timesheet
batch return `fail(400)` so the toast is red, not green. The two sections share **zero files**
and get **one commit each**. The load-bearing risk is Section 1's e2e breakage: two specs find
rows by email and two of those emails sit on the **last** page after pagination.

---

## Overview

Two independent, non-overlapping defect fixes on `feat/uiux-phase-4`, both already specified by
committed backlog notes:

- **Section 1 (B1)** — `/settings/roles` renders every login in the organisation (212 users, 196
  `setActive` forms measured). Add pagination plus an email/name filter, both applied in the route
  `load`, and repair the two e2e specs that locate rows by email.
- **Section 2 (O1)** — bulk timesheet `approveMany` / `rejectMany` return a green success toast
  even when every row failed. Return `fail(400)` when nothing succeeded; leave partial batches green.

They share no files and get one commit each. EXECUTE runs them in parallel.

---

## Phase decisions (RIPER-5)

| Phase | Decision | Reason |
|---|---|---|
| RESEARCH | **RUN — done** | Every fact in this plan is agent-verified with file:line. Do not re-derive. |
| SPEC | **SKIP** | Two committed backlog notes already are the spec: `process/features/ui-ux-overhaul/backlog/settings-roles-unbounded-table_NOTE_10-09-26.md` and `.../bulk-timesheet-skipped-counter_NOTE_10-09-26.md`. Each states the defect, the measurement, and the fix shape. |
| INNOVATE | **SKIP** | The owner chose between the approaches directly (pagination **plus** a filter box for B1; `fail(400)` on `done === 0` only for O1). No approach space is left open. |
| PLAN | **RUN — this document** | — |
| VALIDATE | **RUN** | The e2e edits in Section 1 are the risk; an unchanged spec fails. |
| EXECUTE | **RUN — parallel** | Two agents, one per section, strictly non-overlapping files. |
| UPDATE PROCESS | **RUN, light** | Retire the two backlog notes, update memory. |

Context loaded: `process/context/all-context.md` (router) and `process/context/tests/all-tests.md`
for the test tiering below.

---

## Owner rulings — LOCKED (do not re-open)

| # | Ruling |
|---|---|
| **D1** | B1 is **pagination + a simple filter box**, both applied in the route `load`. |
| **D2** | `src/lib/server/services/**` is **out of bounds program-wide**. `listOrgUsers` does not change signature and gains no `skip`/`take`. The route filters the returned array in JS, then paginates the filtered length — the `requests/approvals` idiom. |
| **D3** | O1: `done === 0` with at least one row attempted → `return fail(400, { error })`. Any `done > 0` → the existing success string, unchanged, including the partial case with its skipped count. Green stays green for a partial. |
| **D4** | O1: **no new toast kind**. `ToastKind` has no warning member and `--warning` is not mapped into `tailwind.config.ts` — that is GitHub issue **#27**, explicitly not this change. |
| **D5** | O1: **no per-row detail** in the message. |
| **D6** | The identical pattern at `src/routes/(app)/leave/+page.server.ts:107-118` is **out of scope**. Do not touch it, do not file an issue for it. |
| **D7** | **Do not open a GitHub issue** for anything in this plan. |

---

## House rules for EXECUTE

- **NO explanatory comments added to source.** The why goes in the commit message. An existing
  comment may be **updated** when the change makes it untrue (the test docblock in Section 2 is
  exactly this case); a new comment narrating a change may never be added.
- **No `Co-Authored-By`, no AI attribution** in any commit message. Absolute repo rule.
- Sections 1 and 2 share no files. Do not let one agent touch the other's list.

---

## Touchpoints

**Section 1 (B1)**

| File | Change |
|---|---|
| `src/routes/(app)/settings/roles/+page.server.ts` | filter + paginate in `load` |
| `src/routes/(app)/settings/roles/+page.svelte` | filter form, `<Pagination>`, filtered empty state |
| `tests/e2e/settings-roles.spec.ts` | `?q=` on every `goto` |
| `tests/e2e/posting-approver-sod.spec.ts` | `?q=` on every `goto` |
| `tests/unit/settings-roles-load.test.ts` | **new** |

Read-only, not modified: `src/lib/server/pagination.ts`, `src/lib/components/Pagination.svelte`,
`src/lib/server/services/settings/org.ts`.

**Section 2 (O1)**

| File | Change |
|---|---|
| `src/routes/(app)/requests/timesheets/+page.server.ts` | `fail(400)` on all-fail in `approveMany` / `rejectMany` |
| `tests/unit/request-decide-feedback.test.ts` | two new tests + docblock correction |

Read-only, not modified: `src/routes/(app)/requests/timesheets/+page.svelte`,
`src/lib/utils/submit-feedback.svelte.ts`, `src/lib/server/services/timesheets.ts`.

## Public Contracts

- **B1**: the `/settings/roles` `load` return gains a `pagination` key and its `users` array
  becomes a page slice. Two new **optional** query params, `?page=` and `?q=`. Verified at
  `src/routes/(app)/settings/roles/+page.server.ts:9-21`: `load` destructures `{ locals }` only
  and reads no query params today, so neither name can collide.
- **B1**: `listOrgUsers` (`src/lib/server/services/settings/org.ts:162-184`) is **unchanged** —
  same signature, same `orderBy: { email: 'asc' }`, same row shape. Its other caller,
  `src/routes/api/v1/settings/users/+server.ts:9`, is untouched and stays unpaginated.
- **O1**: `approveMany` / `rejectMany` gain a `fail(400, { error: string })` return path. The
  `error` key and the 400 status match this route's existing `fail()` payloads. Success returns
  are byte-identical to today.

## Blast Radius

7 files, 1 package, 2 route surfaces, no schema, no service layer, no API.
Risk class: **low product risk, medium test risk.** Nothing here is auth, billing, schema, or a
public API. The only way this lands red is the e2e row-lookup breakage in Section 1 — which is
why Section 1's checklist names every call site by line.

---

## Non-goals

- The leave-page twin, `src/routes/(app)/leave/+page.server.ts:107-118`
  (`Deleted 0 leave requests, N skipped.`) — identical defect, deliberately untouched (D6).
- Query-level pagination for `listOrgUsers` (`skip`/`take` at the Prisma layer) — already filed
  as the backlog item `query-level-pagination-unbounded-lists`.
- The unpaginated second caller `src/routes/api/v1/settings/users/+server.ts:9`.
- Semantic colour tokens / `--warning` in `tailwind.config.ts` — GitHub issue **#27**.
- Any new `ToastKind` member.
- Sorting, column filters, or a client-side search on the roles table.

---

# SECTION 1 — `/settings/roles` pagination + email filter (B1)

Backlog note: `process/features/ui-ux-overhaul/backlog/settings-roles-unbounded-table_NOTE_10-09-26.md`
Defect: 196 `setActive` forms in one page load; every org login is in the DOM. The dev DB holds
**212** users for `org_seed`.

## Verified facts (do not re-derive)

| Fact | Evidence |
|---|---|
| `load` reads no query params; returns `{ users, canManageRoles, canManageActive }` | `src/routes/(app)/settings/roles/+page.server.ts:9-21` |
| `listOrgUsers(organizationId)` → `{ id, email, roles, isActive, employeeName }[]`, `orderBy email asc`, no count sibling | `src/lib/server/services/settings/org.ts:162-184` |
| `paginate(url, total, { param = 'page', pageSize = 10 })` → `{ page, pageSize, total, totalPages, skip, take, start, end, param, label }`; clamps out-of-range pages | `src/lib/server/pagination.ts:36-62` |
| `<Pagination meta>` renders nothing when `meta.total <= meta.pageSize`; its `href()` copies existing `URLSearchParams` and sets only `meta.param`, so `?q=` survives page links | `src/lib/components/Pagination.svelte` |
| Slice-in-route precedent to copy verbatim | `src/routes/(app)/requests/approvals/+page.server.ts:41-42`; same at `requests/proposals/+page.server.ts:58` |
| Render-site precedent | `src/routes/(app)/employees/+page.svelte:170` |
| 9 of 11 paginated routes use the **default** `page` param; only two-table pages pass an explicit `param` | repo-wide |
| Row loop and empty state | `+page.svelte:168`, `:235-238` |
| Second `data.users` consumer: the edit dialog resolves its row out of the list | `+page.svelte:111` |
| Row gate uses `data.user` from the **layout** load, not this route's load | `+page.svelte:170` |

## Design decisions

**S1-D1 — param names.** `?page=` (the `paginate` default) and `?q=`. `/settings/roles` has one
table, so the default `page` is correct — do **not** invent `upage`, despite the wording in the
backlog note. That note predates the param-convention count.

**S1-D2 — pageSize = 10 (the `paginate` default, passed no options object).** Justification: 9 of
11 routes use the default; this table has two forms per row, so 10 rows is 20 forms — a 90%+ DOM
cut from 196. The audit log's 50 is a read-only dense table with no forms; this one is not.

**S1-D3 — filter semantics.** One param `q`. Case-insensitive substring match against `email`
**and** `employeeName` (`employeeName` may be null — guard with `?? ''`). Applied **before**
`paginate`, so `pagination.total` is the filtered length and the page count follows the filter.

**S1-D4 — the filter is a plain GET `<form>`.** No client reactivity, no debounce, no store, no
`$effect`. `<form method="GET">` with a single `name="q"` input and a submit button. Because the
form carries **no hidden `page` input**, submitting a new search produces a query string with
`q` only — `page` is dropped, so `paginate` falls back to page 1. That is the whole reset-to-page-1
mechanism; nothing else is needed. (Belt and braces: `paginate` also clamps an out-of-range page,
so even a hand-typed `?q=zzz&page=9` lands on the last valid page rather than an empty table.)

**S1-D5 — form actions preserve the view.** SvelteKit posts a form action to the **current URL**,
query string included, so `setRole` / `setActive` return to the same `?q=…&page=…` view.

**S1-D6 — the edit dialog when its row leaves the page.** `editing` at `+page.svelte:111` is
`data.users.find(...) ?? null`. After an invalidation the list is replaced wholesale (the existing
comment at `:108-109` says so). If the edited row is no longer in the page slice, `editing`
becomes `null` and the `{#if editing}` dialog closes silently. This is **accepted, not fixed** —
in practice the row cannot leave: the action posts back to the same `?q=&page=` and the sort key
(`email`) is immutable in this UI, so the row is still in the same slice. No guard is added.

**S1-D7 — empty states are distinguished.** The existing empty state at `:235-238` stays for the
no-users case. Add a second branch for `q` non-empty and zero results: a "No users match
&lsquo;{q}&rsquo;." message with a link back to the unfiltered `/settings/roles`. Reusing one
message for both is **not** acceptable — a filtered miss looks like an empty org otherwise.

**S1-D8 — accessibility.** The filter input gets a real `<label for>` (visible text
"Filter by email or name"), not a placeholder-only field and not `aria-label`. Match the label
markup already used by the page's form controls.

## Implementation checklist — Section 1

1. `src/routes/(app)/settings/roles/+page.server.ts` — change the `load` signature to
   `async ({ locals, url })`.
2. Same file — after `listOrgUsers(...)` returns, read `const q = (url.searchParams.get('q') ?? '').trim()`.
3. Same file — build `const filtered = q ? all.filter(u => u.email.toLowerCase().includes(q.toLowerCase()) || (u.employeeName ?? '').toLowerCase().includes(q.toLowerCase())) : all`.
4. Same file — `const pagination = paginate(url, filtered.length)` (no options object; default
   `param: 'page'`, default `pageSize: 10`), importing `paginate` from `$lib/server/pagination`.
5. Same file — return `{ users: filtered.slice(pagination.skip, pagination.skip + pagination.take), pagination, q, canManageRoles, canManageActive }`.
6. `src/routes/(app)/settings/roles/+page.svelte` — add the GET filter form directly **above** the
   table: `<form method="GET">`, `<label for="roles-q">Filter by email or name</label>`,
   `<input id="roles-q" name="q" value={data.q}>`, submit button. No hidden `page` input (S1-D4).
7. Same file — import `Pagination` from `$lib/components/Pagination.svelte` and render
   `<Pagination meta={data.pagination} />` directly **below** the table, matching
   `src/routes/(app)/employees/+page.svelte:170`.
8. Same file — split the empty state at `:235-238` into two branches per S1-D7.
9. `tests/e2e/settings-roles.spec.ts` — change every `goto('/settings/roles')` to
   `goto('/settings/roles?q=<the email that test looks for>')`. Call sites: `:29-35`, `:74`,
   `:84-91`. Each row lookup in those blocks must be preceded by a `goto` whose `q` is that exact
   email.
10. `tests/e2e/posting-approver-sod.spec.ts` — same edit at `:111`, `:114-116`, `:188`, `:194-196`,
    `:199`. This spec is the one that breaks hardest: in `org_seed` ordered by email asc,
    `verifier.approver@veent.ph` is **211/212** and `verifier@veent.ph` is **212/212** — both on
    the last page. `admin@veent.ph` (1), `approver@veent.ph` (2) and `ceo@veent.ph` (3) happen to
    survive on page 1, but change them too so the specs stop depending on org size.
11. `tests/unit/settings-roles-load.test.ts` — **new file**, two tests (see below).
12. Commit Section 1 alone.

## Test plan — Section 1

Verified gaps: `load` has **zero** coverage today; `listOrgUsers` and `src/lib/server/pagination.ts`
have no unit tests.

**Decision: unit test of `load`, not an e2e.** `load` has no `actions` dependency, the route already
has e2e coverage for the row behaviour, and a unit test mocking `listOrgUsers` proves the filter and
the slice deterministically in milliseconds. An e2e that asserts "user X is not on page 1" would be
brittle against seed ordering — the exact fragility item 10 removes.

Keep it minimal, two tests only:

- **T1.1** filtered load — mock `listOrgUsers` to return a known array; call `load` with a URL
  carrying `?q=<substring>`; assert every returned `users` entry matches the substring and
  `pagination.total` equals the filtered count.
- **T1.2** unfiltered load — mock 30 users, call `load` with a bare URL; assert
  `users.length === 10`, `pagination.page === 1`, `pagination.total === 30`.

**Test infra note:** mock `$lib/server/services/settings/org` with `vi.mock` + a hoisted
`listOrgUsersMock`, mirroring the hoisting pattern already used in
`tests/unit/request-decide-feedback.test.ts:20,31,66`.

## Acceptance criteria — Section 1

| # | Criterion | Check |
|---|---|---|
| AC1.1 | The roles page renders at most 10 rows | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/settings-roles.spec.ts` passes; DOM `form[action*="setActive"]` count ≤ 10 on page 1 |
| AC1.2 | A filtered load returns only matching users | T1.1 green in `pnpm test` |
| AC1.3 | An unfiltered load returns ≤ pageSize users plus a `pagination` object | T1.2 green in `pnpm test` |
| AC1.4 | `?q=` survives page links | `Pagination.svelte` `href()` copies existing params — assert in T1.1 by loading `?q=x&page=2` and getting `pagination.page === 2` with the filter still applied |
| AC1.5 | Both e2e specs pass unchanged in behaviour | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/settings-roles.spec.ts tests/e2e/posting-approver-sod.spec.ts` exits 0 |
| AC1.6 | `listOrgUsers` is untouched | `git diff --stat` names no file under `src/lib/server/services/` |
| AC1.7 | The filter input has a real label | `grep -n 'for="roles-q"' src/routes/(app)/settings/roles/+page.svelte` returns a hit |

**Commit subject (Section 1):**

```
feat(settings): paginate and filter the roles table
```

---

# SECTION 2 — bulk timesheet all-fail returns a failure (O1)

Backlog note: `process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md`
Defect: `approveMany` (`src/routes/(app)/requests/timesheets/+page.server.ts:115-140`) and
`rejectMany` (`:144-172`) swallow every per-row throw into `skipped` and **always** return `saved`,
so an all-fail batch renders `Approved 0 timesheets, 5 skipped.` as a **green success** toast.

## Verified facts (do not re-derive)

| Fact | Evidence |
|---|---|
| `export const actions` is a plain object literal, three keys, no wrapper, no composition — the return value reaches SvelteKit untransformed (the #290 rule audited) | `+page.server.ts:82-173` |
| This route's existing `fail()` payload key is `error`, statuses 400/403 | `+page.server.ts` |
| One shared `submitFeedback` instance, no `success`/`error` options, used by **both** forms | `+page.svelte:42`, `:95`, `:103-110` |
| The page destructures only `{ data }` — no `form` prop, no banner. The toast is the only voice | `+page.svelte:14` |
| `submitFeedback` failure branch reads `result.data.error` when it is a string, dispatches `kind: 'error'`; absent → `FRIENDLY_ERROR`. Never silent | `src/lib/utils/submit-feedback.svelte.ts:83-90` |
| Selection already survives a failure: `selected`/`bulkReason` clear only on `result.type === 'success'`, and `update()` does not touch that `$state` | `+page.svelte:34`, `:35-38` |
| Realistic all-fail causes | `services/timesheets.ts:443` 400 stale queue (the common one), `:500` 403 wrong stage, `:454` 403 own timesheet, `:442` 404 not found |
| The `catch` at `:133` / `:165` binds nothing and discards the error | `+page.server.ts` |
| The sibling `review` action already uses `isHttpError(e)` / `e.body.message` if the caught reason were wanted | `+page.server.ts:106` |

## Design decisions

**S2-D1 — the gate.** After the loop, `if (done === 0 && attempted > 0) return fail(400, { error: <string> })`.
`attempted` is the selected-id count. An empty selection must not produce a failure toast — it
keeps whatever behaviour it has today.

**S2-D2 — the exact strings.**

- `approveMany`: **"No timesheets were approved. They may already have been reviewed, or they are not yours to act on."**
- `rejectMany`: **"No timesheets were rejected. They may already have been reviewed, or they are not yours to act on."**

Justification, one line each: the approve string names the outcome truthfully (zero succeeded) and
offers the two dominant real causes — the stale queue (`services/timesheets.ts:443`) and the stage /
ownership guards (`:500`, `:454`) — without claiming which one fired; the reject string is the same
sentence with the verb swapped so the two bulk paths read identically and neither invents a cause.

**S2-D3 — the caught error stays discarded.** Per D5 no per-row detail is surfaced, so the
`isHttpError` pattern at `:106` is deliberately **not** adopted here. The `catch` blocks keep their
current shape.

**S2-D4 — selection persistence is intended behaviour, not a new requirement.** After the change the
result type is `failure`, so `+page.svelte:35-38` does not clear `selected`/`bulkReason`: the
checkboxes stay ticked and the bulk bar stays open, letting the user retry or refresh. This falls
out of existing code — do not add anything to make it happen, and do not remove it.

**S2-D5 — partial batches are untouched.** Any `done > 0` returns the current `saved` string
verbatim, skipped count and all, and stays green (D3).

## Implementation checklist — Section 2

1. `src/routes/(app)/requests/timesheets/+page.server.ts` — in `approveMany` (`:115-140`), capture
   the attempted count before the loop and add the `done === 0 && attempted > 0` guard returning
   `fail(400, { error: '<S2-D2 approve string>' })` immediately before the existing success return.
2. Same file — the identical guard in `rejectMany` (`:144-172`) with the reject string.
3. Same file — confirm `fail` is already imported from `@sveltejs/kit` (the route already uses it);
   add to the import only if absent.
4. Add **no** comments to either action (house rule).
5. `tests/unit/request-decide-feedback.test.ts` — add the four tests below using the existing
   `bulk()` helper (`:119-124`) and the hoisted `reviewTimesheetMock` (`:20`, `:31`, `:66`).
6. Same file — **update** the docblock at `:110-117`, which currently states the `skipped` semantics
   are unruled. Rewrite it to state the ruling: all-fail → `fail(400)`, any success → the existing
   green `saved` string including the skipped count. This is an update to a now-untrue comment, the
   one comment edit this plan permits.
7. Commit Section 2 alone.

## Test plan — Section 2

Verified: **no existing test breaks**; the `catch` branch has never executed under test.

- **T2.1** `approveMany` all-fail — `reviewTimesheetMock.mockRejectedValue(new Error('x'))`, bulk
  over 3 ids; assert the result is a `fail` with `status === 400` and a non-empty string
  `data.error`.
- **T2.2** `approveMany` partial — `mockRejectedValueOnce` once then resolve the rest; assert the
  result is **not** a failure and the returned `saved` string names the skipped count (`, 1 skipped`).
- **T2.3** `rejectMany` all-fail — same shape as T2.1.
- **T2.4** `rejectMany` partial — same shape as T2.2.

All four are cheap (the mock and the `bulk()` helper already exist), so both actions are covered.

**E2E: KNOWN GAP, deliberate.** `tests/e2e/form-errors.spec.ts:183-214` has the fixture, but forcing
every row to fail needs a seeded batch of non-reviewable timesheets (stale or wrong-stage) that does
not exist today. Building that seed to prove a two-line guard would be a fragile, seed-coupled test
for a branch the four unit tests already cover deterministically at the action boundary — the same
boundary the toast reads. Recorded as a known gap with this reason; **no backlog note, no issue**
(D7). Revisit only if the strings or the gate condition change.

## Acceptance criteria — Section 2

| # | Criterion | Check |
|---|---|---|
| AC2.1 | An all-failed approve batch returns `fail(400)` with a non-empty `error` string | T2.1 green in `pnpm test` |
| AC2.2 | An all-failed reject batch returns `fail(400)` with a non-empty `error` string | T2.3 green |
| AC2.3 | A partial batch still returns the green `saved` string with its skipped count | T2.2 + T2.4 green |
| AC2.4 | No new toast kind | `git diff` touches neither `ToastKind` nor `tailwind.config.ts` |
| AC2.5 | The leave twin is untouched | `git diff --stat` does not name `src/routes/(app)/leave/+page.server.ts` |
| AC2.6 | No new source comments | `git diff src/ \| grep '^+' \| grep -E '^\+\s*(//\|/\*)'` returns nothing |
| AC2.7 | The stale docblock is corrected | `grep -n 'skipped' tests/unit/request-decide-feedback.test.ts` shows no "unruled"/"not ruled" wording |

**Commit subject (Section 2):**

```
fix(timesheets): report a failed bulk review as a failure
```

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm test` — T1.1 filtered load | Fully-Automated | AC1.2, AC1.4 |
| `pnpm test` — T1.2 unfiltered load returns ≤ pageSize + `pagination` | Fully-Automated | AC1.3 |
| `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/settings-roles.spec.ts` | Fully-Automated | AC1.1, AC1.5 |
| `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/posting-approver-sod.spec.ts` | Fully-Automated | AC1.5 |
| `grep -n 'for="roles-q"' src/routes/(app)/settings/roles/+page.svelte` | Fully-Automated | AC1.7 |
| `git diff --stat` names no `src/lib/server/services/` file | Fully-Automated | AC1.6 |
| `pnpm test` — T2.1 / T2.3 all-fail returns `fail(400)` | Fully-Automated | AC2.1, AC2.2 |
| `pnpm test` — T2.2 / T2.4 partial stays green with skipped count | Fully-Automated | AC2.3 |
| `git diff` touches neither `ToastKind` nor `tailwind.config.ts` nor the leave route | Fully-Automated | AC2.4, AC2.5 |
| `git diff src/` adds no `//` or `/*` line | Fully-Automated | AC2.6 |
| Bulk all-fail toast is RED and the selection stays ticked | Agent-Probe | AC2.1 rendering side (S2-D4) — one browser pass, not required for merge |
| Bulk all-fail e2e with a stale seed | Known-Gap | AC2.1 — **CONDITIONAL**, see the deliberate known-gap rationale in the Section 2 test plan; the four unit tests carry the proof |

## Post-Phase Testing — full gate set

Run after both commits, from the repo root:

```
pnpm format:check
pnpm lint
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm test
CI=1 pnpm test:e2e
```

- Use `pnpm exec svelte-check --tsconfig ./tsconfig.json`, **not** `pnpm check` — `pnpm check`
  kills the owner's dev server.
- **`pnpm test:e2e -- <specs>` SILENTLY IGNORES the filter** and runs all 143 specs. The working
  scoped form is `CI=1 pnpm exec dotenv -e .env.dev -- playwright test <specs>`.
- `attendance-save-timesheet-custom-range` is a **pre-existing** e2e failure on this branch. It is
  not ours; do not chase it and do not count it against these gates.

Test routing reference: `process/context/tests/all-tests.md`.

## Test Infra Improvement Notes

(none identified yet)

## Phase Completion Rules

- A section is `CODE DONE` when its checklist is complete and its own unit tests are green.
- A section is `✅ VERIFIED` only after the **full** gate set above runs green (minus the
  pre-existing attendance failure) **and the user confirmed it working**. Code-only completion is
  `CODE DONE`, never `VERIFIED`.
- The Section 2 e2e known gap does not block `VERIFIED`; it is recorded, not silently dropped.

## Execution Outcome

Both sections shipped `CODE DONE`. Full gate set run at `cacdb09`:

| Gate | Result |
|---|---|
| `pnpm format:check` | GREEN |
| `pnpm lint` | GREEN (0 errors, 1 pre-existing `CalculatorWindow` warning) |
| `pnpm exec svelte-check --tsconfig ./tsconfig.json` | GREEN (1118 files, 0 errors) |
| `pnpm test` | GREEN (2435 tests / 209 files) |
| `CI=1 pnpm test:e2e` | 142 passed / 1 failed — failure is the pre-existing `attendance-save-timesheet-custom-range` spec, not ours |

Commits:

| Commit | Section |
|---|---|
| `d26066d` | Section 1 — `feat(settings): paginate and filter the roles table` (B1) |
| `bb7eb28` | Section 2 — `fix(timesheets): report a failed bulk review as a failure` (O1) |
| `cacdb09` | `docs(plan): record the roles pagination and bulk all-fail plan` |

Status: `CODE DONE` for both sections. `✅ VERIFIED` per `## Phase Completion Rules` still
requires the owner's manual confirmation — not yet given as of archival.

## Execution strategy

Two parallel EXECUTE agents, one per section, strictly non-overlapping file lists (see
**Touchpoints**). No shared file, so no merge conflict is possible. The orchestrator holds git and
makes **two** commits, one per section, in either order.

## Validate Contract

Status: CONDITIONAL
Date: 10-09-26
date: 2026-09-10
generated-by: outer-pvl

Scope: SCOPED validate — coverage gaps only. Design, page size, message wording and the
`done === 0` rule were NOT re-argued (owner rulings D1–D7 respected).

Parallel strategy: sequential
Rationale: 2/7 signals (S7 borderline — 7 files, 1 package). Scoped hunt over 2 spec files,
2 route files and 2 unit-test files; a fan-out would cost more than it finds.

### Net gate derivation

| Layer 1 dimension | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | FAIL |
| Breaking changes | PASS |
| Security surface | PASS |

| Layer 2 section | Status |
|---|---|
| Section 1 — roles pagination + filter (B1) | FAIL |
| Section 2 — bulk all-fail (O1) | FAIL |

**Totals: 3 FAILs / 5 CONCERNs / 6 PASSes → strict net gate is BLOCKED.**

Recorded as **CONDITIONAL** because all three FAILs are plan-TEXT defects, each has an exact
drop-in correction recorded as a mandatory execute-agent instruction (E1–E3) below, none
reopens a locked owner ruling, and no source has been written yet. EXECUTE may proceed ONLY
with E1, E2 and E3 applied verbatim. Refusing any one of the three returns this gate to
BLOCKED.

### FAIL-grade findings

**V-F1 (FAIL) — `settings-roles.spec.ts:74` cannot be fixed by the checklist as written.**
Checklist item 9 says "change every `goto('/settings/roles')` to `goto('/settings/roles?q=<the
email that test looks for>')`". There is no `goto` at `:74`. `:74` is a row lookup
(`ceoPage.locator('tr', { hasText: USERS.ceo.email })`) on the page navigated once at `:29`,
and `:29` must carry `?q=verifier.approver@veent.ph` for `:31`. One page cannot be filtered to
two different emails. With `q=verifier.approver@veent.ph` the CEO row is absent, so `:75`
`await expect(ownRow.getByText('CEO', { exact: true })).toBeVisible()` fails and the spec goes
red. Fix in E1.

**V-F2 (FAIL) — `attempted > 0` in S2-D1 is a dead condition.** Confirmed against source.
`approveMany` returns `fail(400, { error: 'No timesheets selected' })` at
`src/routes/(app)/requests/timesheets/+page.server.ts:124` and `rejectMany` at `:155`, both
BEFORE their loops (`:130`, `:162`). Every path that reaches the post-loop return therefore has
`ids.length >= 1`, so `attempted > 0` is unreachable-false and `done === 0 && attempted > 0`
is identical to `done === 0`. The repo's minimalism rule forbids shipping a condition that
cannot be false. Also: S2-D1's justifying sentence ("An empty selection must not produce a
failure toast — it keeps whatever behaviour it has today") is factually wrong about today —
an empty selection ALREADY returns `fail(400, 'No timesheets selected')`, pinned by the
existing test at `tests/unit/request-decide-feedback.test.ts:139,143`. Fix in E2.

**V-F3 (FAIL) — AC1.4 / T1.1 cannot pass as specified.** `paginate` clamps with
`page = Math.min(requested, totalPages)` at `src/lib/server/pagination.ts:44-45`. With the
default `pageSize: 10`, loading `?q=x&page=2` returns `pagination.page === 2` only when the
FILTERED array has 11 or more entries. T1.1 specifies "a known array" with no size, so the
assertion named in AC1.4 goes red (not vacuous — red). Minimum fixture stated in E3.

### CONCERN-grade findings

| # | Finding | Severity | Evidence | Resolution |
|---|---|---|---|---|
| V-C1 | Third consumer missing from Touchpoints: `tests/unit/high-stakes-action-feedback.test.ts:83` imports the roles route module. It does **NOT** break — it calls only `roles.actions.setActive` (`:142-143`), never `load`; `$lib/server/services/settings/org` is already mocked at `:59-63`; and the new `paginate` import adds no unmocked module because `src/lib/server/pagination.ts` imports nothing at all. | CONCERN (plan completeness only) | as cited | Add as a read-only/verified row in Touchpoints. No code change. |
| V-C2 | AC1.1 is a check that cannot fail. The criterion is "renders at most 10 rows"; the check is `playwright test tests/e2e/settings-roles.spec.ts`. That file contains no row-count and no `form[action*="setActive"]` assertion — its only counting assertions (`:35`, `:44`, `:67`, `:70`, `:76`, `:87`) are row- or dialog-scoped. The command exits 0 whether the page renders 10 rows or 212. | CONCERN | as cited | Re-point AC1.1's check at T1.2 (`users.length === 10`), or add `await expect(ceoPage.locator('tbody tr')).toHaveCount(1)` after the filtered goto at `:29`. |
| V-C3 | AC1.6 / AC2.4 / AC2.5 / AC2.6 use a bare `git diff` (working tree vs index). The plan commits each section separately (S1 item 12, S2 item 7), so every one of these returns EMPTY after its own commit and passes vacuously. | CONCERN | plan `:259`, `:364`, `:365`, `:366` | Pin the ref: `git diff --stat c3bf6cf -- src/` and `git diff c3bf6cf -- src/ \| grep …`. |
| V-C4 | AC1.4's check does not prove AC1.4's criterion. The criterion is "`?q=` survives page links" (a `Pagination.svelte` `href()` behaviour); the check exercises the route `load`. `href()` at `src/lib/components/Pagination.svelte:21-25` does copy `$pageStore.url.searchParams` and set only `meta.param`, so the behaviour holds — but it is read-verified, not gate-proven. | CONCERN | as cited | Split AC1.4 into (a) load honours `?q=&page=2` — T1.1, Fully-Automated; (b) page links carry `q` — Known-Gap, read-verified at `Pagination.svelte:21-25`. |
| V-C5 | The plan's risk ranking is inverted. `:220-224` calls `posting-approver-sod.spec.ts` "the one that breaks hardest" on the strength of `verifier.approver@veent.ph` being 211/212 and `verifier@veent.ph` 212/212. But that spec never looks up either email on the roles page — it uses `USERS.approver.email` (`approver@veent.ph`, rank 2, page 1) at `:116` and `:196`; `USERS.twoHat` appears only as a `mapApprover` label on `/settings/posting-approvers` (`:169`) and a dashboard login (`:172`). The spec that actually breaks hardest is `settings-roles.spec.ts`, whose `TWO_HAT` lookups at `:31` and `:86` ARE 211/212 — and which also carries V-F1. | CONCERN | as cited | Correct the emphasis so EXECUTE reads `settings-roles.spec.ts` as the load-bearing file. |

### Findings the plan called risky that are NOT risky (severity corrected DOWN)

- **No "no X anywhere" assertion exists in either spec.** Every `toHaveCount(0)` is row- or
  dialog-scoped and every one has a positive control in the same block that goes red if the row
  is missing: `:35`/`:70` (twoHatRow, controlled by `:33-34`), `:76` (ownRow, controlled by
  `:75`), `:87` (twoHatReadOnly, controlled by `:90-91`). Filtering to a single row makes none
  of them vacuous. This classic failure mode is **absent here** — do not treat it as a risk.
- **H3 substring ambiguity is already handled.** `?q=approver@veent.ph` does return two rows
  (`approver@veent.ph` and `verifier.approver@veent.ph`), but `posting-approver-sod.spec.ts:114-116`
  and `:194-196` use `.filter({ has: getByText(email, { exact: true }) })` — an exact full-text
  cell match, and `verifier.approver@veent.ph` is not equal to `approver@veent.ph`, so exactly
  one row resolves. The spec's own comment at `:112-113` already documents this. PASS.
  `settings-roles.spec.ts:31`/`:86` use a substring `hasText`, but `q=verifier.approver@veent.ph`
  returns exactly one row and no seeded email is a proper superstring of it. PASS.
- **The Section 1 unit-test infra note is correct as written.** Only
  `vi.mock('$lib/server/services/settings/org', …)` is needed. The route's remaining import chain
  is db-free: `$lib/server/rbac` pulls `@sveltejs/kit` + `@prisma/client` (type-only) + `$lib/rbac`
  + `$lib/orgs`; `$lib/server/form-fail` pulls `@sveltejs/kit` only; `$lib/server/pagination`
  pulls nothing. No `vi.mock('$lib/server/db')` is required, unlike
  `high-stakes-action-feedback.test.ts:30`. `vitest.config.ts:7` includes `tests/unit/**`, so the
  new file is picked up.
- **T2.2's mock composition is sound.** `beforeEach` (`request-decide-feedback.test.ts:62-67`)
  runs before the test body; `vi.clearAllMocks()` clears call records, not implementations; a
  `mockRejectedValueOnce` set inside the body prepends to the once-queue, which vitest consumes
  BEFORE the persistent `mockResolvedValue`. The identical pattern already passes at `:106-107`.
  Not a risk.
- **`bulk()` returns a readable `fail()`.** The existing test at `:138-147` already reads
  `?.data?.error` and `?.status` off `fail()` returns, so T2.1/T2.3 are writable verbatim.

### H1 sweep result — CLEAN, the plan's two-spec claim HOLDS (with V-C1 noted)

Repo-wide hunt for a third consumer that breaks when `/settings/roles` ships 10 of 212 rows or
its `load` shape changes. Every hit and its verdict:

| Hit | Breaks? |
|---|---|
| `tests/e2e/settings-roles.spec.ts:29,84` | YES — the two named gotos, plus V-F1 at `:74` |
| `tests/e2e/posting-approver-sod.spec.ts:111,188` | YES — the two named gotos |
| `tests/unit/high-stakes-action-feedback.test.ts:83` | NO — imports the module, calls `actions.setActive` only (V-C1) |
| `src/routes/(app)/+layout.svelte:148` | NO — static nav `href`, no query, no table |
| `src/routes/(app)/settings/+page.server.ts:15` | NO — card capability gate, never reads `data.users` |
| `tests/e2e/settings-visibility.spec.ts:49,59` | NO — asserts the `Roles & Access` LINK on `/settings`; its gotos (`:24`, `:47`, `:55`) never reach the roles page |
| `tests/e2e/pagination.spec.ts:87,105` | NO — `/employees` only |
| `tests/unit/settings-cards.test.ts:12` | NO — docblock prose |
| `tests/unit/api-v1-user-roles.test.ts:20` | NO — `/api/v1/settings/users/[id]/roles`, a different route |
| `src/lib/components/ui/Dialog.svelte:6` | NO — docblock prose |
| `tests/e2e/global-setup.ts` | NO — zero roles references |
| `posting-approver-sod.spec.ts:200-204` (role restore) | NO — restores through `PATCH /api/v1/settings/users/:id/roles`, not the page's `load`; the `input[name="userId"]` it reads is inside the filtered row it already located |
| `TESTING.md:97` (manual step 11.3) | NO — the step acts on `admin@veent.ph`'s own row, which the plan's own verified ordering puts at rank 1 of 212, i.e. still on page 1. Advisory only. |

No snapshot, no fixture builder, no link builder and no e2e helper reaches this page's table.
There is no third BREAKING consumer. The plan's two-spec list is correct.

### Exact `?q=` value per call site (H2 deliverable)

| Call site | Required `q` | Note |
|---|---|---|
| `settings-roles.spec.ts:29` (existing goto) | `verifier.approver@veent.ph` (`USERS.twoHat.email`) | serves `:31-70` |
| `settings-roles.spec.ts:73` (**NEW** goto — does not exist today) | `ceo@veent.ph` (`USERS.ceo.email`) | serves `:74-76`; this is V-F1 |
| `settings-roles.spec.ts:84` (existing goto) | `verifier.approver@veent.ph` | serves `:86-91` |
| `posting-approver-sod.spec.ts:111` (existing goto) | `approver@veent.ph` (`USERS.approver.email`) | serves `:114-135`; the form-action POST at `:132` returns to this same URL, so `?q=` survives and `apRow` at `:135` still resolves |
| `posting-approver-sod.spec.ts:188` (existing goto) | `approver@veent.ph` | serves `:194-204` |

Checklist item 10 lists `:114-116`, `:194-196` and `:199` as call sites. They are not gotos —
they are locators on the pages navigated at `:111` and `:188`. Two goto edits cover that whole
file. That part of item 10 is fine as written.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1.2 | a filtered `load` returns only matching users | Fully-Automated | T1.1 in `pnpm test` (fixture per E3) | A |
| AC1.3 | an unfiltered `load` returns <= pageSize users plus a `pagination` object | Fully-Automated | T1.2 in `pnpm test` | A |
| AC1.1 | the roles page renders at most 10 rows | Fully-Automated | T1.2 `users.length === 10` — **not** the e2e command (V-C2) | B |
| AC1.4a | `load` honours `?q=x&page=2` | Fully-Automated | T1.1 with a >=11-match fixture (E3) | B |
| AC1.4b | page links carry `q` forward | Agent-Probe | click Next on a filtered roles page, assert the URL keeps `q` | C |
| AC1.5 | both e2e specs pass unchanged in behaviour | Fully-Automated | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/settings-roles.spec.ts tests/e2e/posting-approver-sod.spec.ts` exits 0 | A |
| AC1.6 | `listOrgUsers` untouched | Fully-Automated | `git diff --stat c3bf6cf -- src/lib/server/services/` is empty (V-C3) | B |
| AC1.7 | the filter input has a real label | Fully-Automated | `grep -n 'for="roles-q"' 'src/routes/(app)/settings/roles/+page.svelte'` | A |
| AC2.1 | an all-failed approve batch returns `fail(400)` with a non-empty `error` | Fully-Automated | T2.1 in `pnpm test` | A |
| AC2.2 | an all-failed reject batch returns `fail(400)` with a non-empty `error` | Fully-Automated | T2.3 in `pnpm test` | A |
| AC2.3 | a partial batch still returns the green `saved` string with its skipped count | Fully-Automated | T2.2 + T2.4 in `pnpm test` | A |
| AC2.4 | no new toast kind | Fully-Automated | `git diff --stat c3bf6cf` names neither `ToastKind` nor `tailwind.config.ts` (V-C3) | B |
| AC2.5 | the leave twin is untouched | Fully-Automated | `git diff --stat c3bf6cf` does not name `src/routes/(app)/leave/+page.server.ts` (V-C3) | B |
| AC2.6 | no new source comments | Fully-Automated | `git diff c3bf6cf -- src/ \| grep '^+' \| grep -E '^\+\s*(//\|/\*)'` returns nothing (V-C3, V-C6) | B |
| AC2.7 | the stale docblock is corrected | Fully-Automated | `grep -n 'skipped' tests/unit/request-decide-feedback.test.ts` shows no "unruled"/"not ruled" wording | A |
| S2-D4 | the all-fail toast is RED and the selection stays ticked | Agent-Probe | one browser pass; not required for merge | C |
| AC2.1 (e2e) | an all-fail bulk batch through the real UI | Known-Gap | — needs a seeded batch of non-reviewable timesheets that does not exist; four unit tests carry the proof at the action boundary | D |

Legacy line form (for existing validate-contract consumers):
- Section 1 load/filter/pagination: [Fully-automated: `pnpm test`]
- Section 1 e2e specs: [Fully-automated: `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/settings-roles.spec.ts tests/e2e/posting-approver-sod.spec.ts`]
- Section 1 page-link `q` survival: [agent-probe: click Next on a filtered page, assert the URL keeps `q`]
- Section 2 bulk action payloads: [Fully-automated: `pnpm test`]
- Section 2 bulk all-fail through the UI: [known-gap: documented — no seed for a non-reviewable batch]

**V-C6 (CONCERN, minor) — AC2.6's shell form.** The pipeline itself was run live in this repo's
fish shell and works: `git diff src/ | grep '^+' | grep -E '^\+\s*(//|/\*)'` exits 1 with no
output. The `\|` in the plan's markdown table is table escaping only — copy-pasting the cell
verbatim passes `\|` to `git diff` as a pathspec and errors. Use the de-escaped one-liner above.
Note also that the regex only catches a comment that STARTS a line; a trailing `// …` appended
to a code line is not caught. Acceptable for the house rule (added comments are line comments),
but it is not an airtight gate.

### Execute-agent instructions (MANDATORY — E1/E2/E3 resolve the three FAILs)

| # | Instruction | Trigger |
|---|---|---|
| E1 | In `tests/e2e/settings-roles.spec.ts`, INSERT a new navigation immediately before `:74`: `await ceoPage.goto('/settings/roles?q=' + USERS.ceo.email, { waitUntil: 'domcontentloaded' })`. Do not merely edit the existing gotos — `:74` has none. Then set `:29` and `:84` to `?q=' + TWO_HAT`. Recommended (not required): change `:74`'s `locator('tr', { hasText: … })` to the exact-cell form used at `posting-approver-sod.spec.ts:114-116`, so a superstring email in `org_seed` cannot resolve two rows and trip Playwright strict mode. | Section 1, checklist item 9 |
| E2 | Ship the gate as `if (done === 0) return fail(400, { error: '<S2-D2 string>' })`. Do NOT introduce an `attempted` variable and do NOT write `attempted > 0` — the `!ids.length` guards at `+page.server.ts:124` and `:155` already make it unreachable-false. Ignore S2-D1's second sentence; it misstates today's empty-selection behaviour. | Section 2, checklist items 1-2 |
| E3 | T1.1's mocked fixture must contain **at least 11 users matching `q`, plus at least 1 non-matching** (12 minimum). Use 12 matching + 3 non-matching (15 total): 12 matching forces `totalPages === 2` so `?q=x&page=2` really returns `pagination.page === 2`, the 3 non-matching make the filter assertion non-vacuous, and `pagination.total === 12` is a distinctive number. With 10 or fewer matches `paginate` clamps to page 1 and AC1.4 goes red. | Section 1, checklist item 11 |
| E4 | T1.1/T1.2 must pass a capability-bearing actor. `load` calls `error(403)` at `+page.server.ts:16` unless `canManageRoles || canManageActive`; use `locals.user = { id: 'actor', organizationId: 'org1', roles: ['SUPER_ADMIN'] }`. The plan does not say this. | Section 1, checklist item 11 |
| E5 | T2.2/T2.4 must assert POSITIVELY: check `res.saved` matches `/, 1 skipped\.$/` AND that `res.status` is `undefined`. `expect(res).not.toBe…` on a shape-only check would pass on an unexpected payload. | Section 2, checklist item 5 |
| E6 | Pin every `git diff` gate to `c3bf6cf` (V-C3). A bare `git diff` after the section's own commit returns empty and passes vacuously. | Post-commit gates |
| E7 | Read `settings-roles.spec.ts` as the load-bearing file, not `posting-approver-sod.spec.ts` (V-C5). Its two `TWO_HAT` lookups (`:31`, `:86`) are the 211/212 rows; `posting-approver-sod` only ever needs `approver@veent.ph`, rank 2. | Section 1 entry |

### Plan updates proposed (apply on acceptance)

| # | What changes | Where | Why |
|---|---|---|---|
| P1 | Add `tests/unit/high-stakes-action-feedback.test.ts` as a read-only/verified row | Touchpoints, Section 1 | V-C1 — third consumer, does not break |
| P2 | Rewrite checklist item 9 to say INSERT a goto before `:74` | Section 1 checklist | V-F1 |
| P3 | Strike `&& attempted > 0` from S2-D1 and drop its second sentence | Section 2 design decisions | V-F2 |
| P4 | State T1.1's minimum fixture size | Section 1 test plan | V-F3 |
| P5 | Re-point AC1.1's check at T1.2; split AC1.4 into 1.4a/1.4b | Section 1 acceptance criteria | V-C2, V-C4 |
| P6 | Pin all `git diff` gates to `c3bf6cf` | Both acceptance-criteria tables | V-C3 |
| P7 | Correct the risk emphasis at `:220-224` | Section 1 checklist item 10 | V-C5 |

### Dimension findings

- Infra fit: PASS — `paginate` and `<Pagination>` are the exact idiom used by 9 of 11 paginated routes; `src/lib/server/pagination.ts` has zero imports; the GET filter form sits as a sibling of the table `div` at `+page.svelte:156`, never nested inside the per-row `<form method="POST">` at `:181`, so no invalid-HTML nesting; `vitest.config.ts:7` picks up the new test file.
- Test coverage: FAIL — V-F3 (T1.1 cannot pass at the stated fixture size), V-C2 (AC1.1's check cannot fail), V-C4 (AC1.4's check does not prove its criterion), V-C3 (four `git diff` gates pass vacuously after commit).
- Breaking changes: PASS — the `load` return gains `pagination` + `q`; its only consumers are the route's own `+page.svelte` (`:111`, `:168`). `listOrgUsers` is unchanged, so `src/routes/api/v1/settings/users/+server.ts:9` is untouched. `data.user.id` at `+page.svelte:170` comes from the layout load, not this one. `?page=`/`?q=` cannot collide — `load` reads no query params today (`+page.server.ts:9`).
- Security surface: PASS — no auth, billing, schema, secret or trust-boundary surface. The filter narrows an array already org-scoped by `listOrgUsers(user.organizationId)` (`+page.server.ts:18`); it can only ever return a subset, never widen scope. `q` is rendered through Svelte's escaped `value={}`. No evidence pack required.
- Section 1 feasibility: FAIL — every edit target is present and uniquely matchable (`load` at `:9-21`, the `{#each}`/`{:else}` empty state at `+page.svelte:168`/`:235-239`, the table container at `:156`), but V-F1 makes the named spec go red as instructed, and V-F3 makes T1.1 go red. Highest-risk edit: `settings-roles.spec.ts:74`.
- Section 2 feasibility: FAIL — the guard's insertion points are exact and `fail` is already imported (`+page.server.ts:1` chain, used at `:85`, `:124`, `:155`), and the `actions` export at `:82-173` is a plain object literal with no wrapper or composition, so the `fail()` return reaches SvelteKit untransformed (the #290 rule re-audited and CONFIRMED). But V-F2 has the plan shipping a condition that cannot be false. Highest-risk edit: none — this section is two lines once E2 is applied.

Open gaps: none deferred to backlog. The Section 2 e2e remains a deliberate known gap per the
plan's own rationale (D7 — no note, no issue).

What this coverage does NOT prove:
- `pnpm test` (T1.1/T1.2) proves the `load` function's filter and slice arithmetic. It does NOT prove the page renders a filter form, renders `<Pagination>`, or that the DOM form count actually drops — no component test harness exists in this repo.
- The two playwright commands prove the specs still find their rows under a filtered view. They do NOT prove the unfiltered page is bounded at 10 rows — neither spec ever visits the page unfiltered after this change, and neither counts rows (V-C2).
- The playwright commands do NOT prove page-link behaviour: no test clicks Next on the roles table, so `?q=` survival across a page link is read-verified only (`Pagination.svelte:21-25`), never executed.
- T2.1-T2.4 prove the action returns `fail(400, { error })` on an all-fail batch. They do NOT prove the toast renders red, that `submitFeedback` dispatches `kind: 'error'` for this payload, or that the selection stays ticked — all three are the browser probe.
- No gate covers the case where every id fails for a DIFFERENT reason than the mocked one; the mock throws a bare `Error`, while real causes are `error(400|403|404)` from `services/timesheets.ts:442-500`. The `catch` swallows both identically, so this is a real but low-value gap.
- No gate covers the edit-dialog-closes-silently case (S1-D6), which the plan accepts rather than fixes.

Gate: CONDITIONAL — 3 FAIL-grade defects, all resolved by E1/E2/E3 as mandatory execute-agent
instructions; strict protocol net would be BLOCKED.
Accepted by: session (VALIDATE) — pending owner confirmation. Accepted concerns: V-C1
(Touchpoints omission, non-breaking), V-C2 (AC1.1 check cannot fail), V-C3 (unpinned `git diff`
refs), V-C4 (AC1.4 check/criterion mismatch), V-C5 (inverted risk emphasis), V-C6 (AC2.6 shell
escaping). The three FAILs (V-F1, V-F2, V-F3) are NOT accepted as gaps — they are converted to
binding instructions E1, E2, E3 and must be applied before or during EXECUTE.

## Autonomous Goal Block

```
SESSION GOAL
Execute process/general-plans/active/roles-pagination-and-bulk-allfail_10-09-26/roles-pagination-and-bulk-allfail_PLAN_10-09-26.md
on branch feat/uiux-phase-4 (base c3bf6cf). Two independent fixes, one commit each:
Section 1 — paginate and filter /settings/roles in the route load, repair the two e2e specs.
Section 2 — return fail(400) from approveMany/rejectMany when nothing succeeded.

CONTRACT SUMMARY
Validate gate: CONDITIONAL. Execute-agent instructions E1-E7 in the Validate Contract are
BINDING. The three that resolve FAILs:
  E1 - INSERT a new goto('/settings/roles?q=' + USERS.ceo.email) before settings-roles.spec.ts:74.
       There is no goto there today; editing the existing ones is not enough.
  E2 - Ship `if (done === 0)`. Do NOT add an `attempted` variable; `attempted > 0` is dead
       because +page.server.ts:124 and :155 already reject an empty selection.
  E3 - T1.1's mocked fixture needs >=11 users matching q (use 12 matching + 3 non-matching),
       or paginate clamps to page 1 and AC1.4 goes red.

AUTONOMY RULES
- Two parallel execute agents, one per section, strictly non-overlapping files.
- No explanatory comments added to source. The one permitted comment edit is the stale docblock
  at tests/unit/request-decide-feedback.test.ts:110-117.
- No Co-Authored-By, no AI attribution in any commit message.
- Do not touch src/lib/server/services/** (D2). Do not touch the leave twin (D6).
- Do not open a GitHub issue for anything in this plan (D7).
- Do not re-argue pagination vs filter, the page size, the message wording or the done === 0 rule.

HARD STOPS
- Any git push. The owner pushes.
- Any edit to .env / .env.dev. The owner owns env and starts the servers.
- Any change to src/lib/server/services/**.
- Marking a section VERIFIED without the full gate set green AND owner confirmation.

NEXT PHASE
EXECUTE, then the full gate set:
  pnpm format:check
  pnpm lint
  pnpm exec svelte-check --tsconfig ./tsconfig.json
  pnpm test
  CI=1 pnpm test:e2e
Scoped e2e form (the -- filter is silently ignored):
  CI=1 pnpm exec dotenv -e .env.dev -- playwright test <specs>
attendance-save-timesheet-custom-range is a pre-existing failure on this branch; not ours.
Pin every git diff gate to c3bf6cf.

EXECUTE START
ENTER EXECUTE MODE with the plan path above and the Validate Contract's E1-E7 in scope.
```

## Resume and Execution Handoff

1. **Selected plan file**: `process/general-plans/active/roles-pagination-and-bulk-allfail_10-09-26/roles-pagination-and-bulk-allfail_PLAN_10-09-26.md`
2. **Last completed step**: PLAN written. No source edited, no git run.
3. **Validate-contract status**: pending — VALIDATE has not run.
4. **Supporting context loaded**: `process/context/all-context.md`,
   `process/context/tests/all-tests.md`,
   `process/features/ui-ux-overhaul/backlog/settings-roles-unbounded-table_NOTE_10-09-26.md`,
   `process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md`.
5. **Next step for a fresh agent**: run VALIDATE against this plan, focusing on the Section 1 e2e
   call-site list (items 9 and 10) — an unchanged spec fails. Then EXECUTE the two sections in
   parallel on branch `feat/uiux-phase-4` @ `c3bf6cf`.

---

**Next Step**: review this plan, then say **ENTER VALIDATE MODE**. Do not enter EXECUTE directly.

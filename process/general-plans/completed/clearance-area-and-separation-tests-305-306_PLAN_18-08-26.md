---
name: plan:clearance-area-and-separation-tests-305-306
description: "#306 replace ClearanceItem.department free text with a ClearanceArea enum + optional departmentId column; #305 pin separation.ts and its 3 routes with tests. One PR."
date: 18-08-26
feature: general
---

# Clearance area enum (#306) + separation test coverage (#305)

**TL;DR** — One PR on `fix/clearance-department-separation-tests-305-306`. First change the schema
(free-text `department` → required `ClearanceArea` enum + optional plain `departmentId` column), migrate the
local DB with a raw-SQL script BEFORE `db push`, fix the 15 call sites and the one existing test
that asserts on the old field. Then add ~26 unit tests and 1 Playwright spec that pin the real
behaviour of `separation.ts` and its 3 routes. 18 steps. No behaviour is changed in `separation.ts`
except the `orderBy` field name.

---

## Metadata

**Date**: 18-08-26

**Status**: PLANNED

**Complexity**: COMPLEX

- **Branch:** `fix/clearance-department-separation-tests-305-306`
- **Issues:** #305, #306 (one PR, owner-approved bundling)
- **Context loaded:** `process/context/all-context.md` routing table + `process/context/tests/all-tests.md` (test routing / runner split) and the repo's existing `tests/unit` + `tests/e2e` conventions. Post-phase testing runs `pnpm test` then `pnpm test:e2e`.

## Overview

Two GitHub issues, bundled into one PR by owner decision:

- **#306** — `ClearanceItem.department` is free text. Typos make clearance items unroutable and
  "Immediate Supervisor" is not a department at all. Replace it with a closed vocabulary.
- **#305** — `src/lib/server/services/separation.ts` (412 lines, 9 exports) and its 3 routes have
  only the #297/#298 separation-of-duties tests. Whole branches — HOURLY/DAILY rate basis, the
  compensation-history integration, the CSV report, every route gate — are pinned nowhere.

They are bundled because #305's tests must reference the new `area` field. Writing them against
`department` first and rewriting them after is wasted work.

### The 5 locked decisions (restated, do not re-litigate)

| # | Decision |
|---|---|
| **D1** | Hybrid model. New Prisma enum `ClearanceArea` with values `IT`, `HR`, `ADMIN`, `FINANCE`, `IMMEDIATE_SUPERVISOR`, as a **required** `area` field. **Plus** an optional nullable `departmentId` pointing at the real `Department` model. Shape of that pointer is decided in §Shape of departmentId — **plain column, no Prisma relation**. |
| **D2** | "Immediate Supervisor" is the enum value `IMMEDIATE_SUPERVISOR` and nothing more. No supervisor resolution, no routing, no per-department sign-off. `departmentId` stays null for it. |
| **D3** | Backfill everything. There is no production environment — the local dev DB and its seed data are the whole population. Existing rows are rewritten. No legacy column is kept. |
| **D4** | #305's test scope = all 9 exports of `separation.ts` + the 3 separation routes. `offboarding.ts` is **not** in #305's test scope but **is** in #306's change scope (it holds the template + defaults). A minimal Playwright spec for the capability gate is in scope, because #305's body says "who may act needs a live check". |
| **D5** | Explicitly out of scope: prorated 13th month / tax refund terms; pinning `WORKING_DAYS_PER_MONTH = 22` as its own test (it must stay swappable for #110); the "MANAGER reaches every separation case" authorization question (that is #308); per-department clearance sign-off routing. |

### Shape of `departmentId` — DECIDED: plain column, no Prisma relation

`departmentId String?` is added as a **plain nullable column with no `@relation`**, matching the
repo's own prior art `PostingApprover` (`prisma/schema.prisma:1175`), whose `departmentId` and
`approverId` are deliberately kept off the relation graph and resolved in queries.

**Tradeoff, stated once and closed:** a real relation would buy referential integrity, but it costs
back-relation arrays on `Department` — a model already referenced by `employees`, `jobPostings`,
`positions`, and `offers` — for a field nothing currently reads. Ponytail rung 1 (does it need to
exist?) plus "reuse existing patterns over new ones" wins over the integrity we would not yet use.
**Dangling id on read:** if a department is deleted, the stored id simply resolves to nothing and
renders as blank. That is acceptable because nothing routes, filters, or authorizes on it (D2/D5).

**Nothing currently consumes `departmentId`.** The single consumer this PR adds is the minimal
writer in the Settings → Offboarding editor: a `<select name="departmentId">` listing the org's
departments with a blank `— none —` option, so the column is not dead on arrival. No routing, no
filtering, no per-department authorization, no display anywhere else.

### Design constraint

PONYTAIL applies to code **and** to this test plan. 26 unit tests + 1 e2e spec, one test per
behaviour. No per-function ceremony suites, no shared abstraction unless it shortens the diff.

---

## Touchpoints

**Schema / migration**
- `prisma/schema.prisma` — `ClearanceArea` enum (new), `ClearanceItem`, `OffboardingChecklistItem`. `Department` is **not** touched (§Shape of departmentId).
- `scripts/migrate-clearance-area.ts` (new)

**Server**
- `src/lib/server/services/offboarding.ts` — defaults, seed, add, update, template select
- `src/lib/server/services/separation.ts` — line 111 `orderBy` only
- `src/lib/server/notifications.ts` — payload type + email body line

**Routes / UI**
- `src/routes/(app)/settings/offboarding/+page.server.ts` — zod + fail messages
- `src/routes/(app)/settings/offboarding/+page.svelte` — add form + inline edit
- `src/routes/(app)/separations/[id]/+page.svelte` — line 106 render

**Tests**
- `tests/unit/offboarding-notice.test.ts` — updated (asserts on the old field)
- 6 new `tests/unit/separation-*.test.ts` files
- `tests/e2e/separations.spec.ts` (new)

**Read-only / untouched**
- `src/routes/(app)/separations/[id]/+page.svelte:73` uses `s.employee.department?.name` — that is
  the **relational** `Department`, a different thing. Do not touch.
- `separation.ts:108`, `:385`, `:399` — same relational `Department`. Do not touch.

---

## Public Contracts

| Contract | Before | After |
|---|---|---|
| `ClearanceItem` row shape | `department: string` | `area: ClearanceArea` (required), `departmentId: string \| null` (plain column, no relation — §Shape of departmentId) |
| `OffboardingChecklistItem` row shape | `department: string` | same as above |
| `clearanceTemplateForOrg()` return | `{ label, department }[]` | `{ label, area, departmentId }[]` |
| `buildOffboardingNotice()` payload | `checklist: { label, department }[]` | `checklist: { label, area }[]` |
| Settings offboarding form field | free-text `department` input | `<select name="area">` over the 5 enum values + `<select name="departmentId">` over the org's departments with a `— none —` blank |
| Separation CSV report | unchanged | unchanged (its `Department` column is the relational one) |

No public HTTP API shape changes. `/api/v1/reports/separation` output is byte-identical.

---

## Blast Radius

- **Files changed**: 8 source + 1 new script + 1 schema + 8 test files (1 updated, 7 new) = 18
- **Packages**: single SvelteKit app, no workspace fan-out
- **Risk class**: **schema/data migration** (destructive column drop + enum creation). High-risk per
  `vc-test-coverage-plan` — requires at least a hybrid gate. Gate = the live migration run + a
  zero-drift `db push`.
- Secondary risk class: none. No auth, billing, or secrets surface is touched. `MANAGE_HR` gating
  is only *read* by the new e2e spec, never modified.

---

## Implementation Checklist

Ordering is load-bearing. The reason is stated for every step.

### Part A — #306 schema first (steps 1–10)

**1. Write `scripts/migrate-clearance-area.ts`.**
*Why first:* `prisma db push` **drops and recreates an enum type** when values change, and it cannot
express a column rename. The DB must already be in the target shape before push, or push offers to
drop data. This is the trap that bit #172.
Follow the shape of `scripts/migrate-employment-type-regular.ts` — idempotent, guard-first, raw SQL,
`PrismaClient` + `$executeRawUnsafe`, `main().then(disconnect).catch(exit 1)`.
Operate on **both** `clearance_items` and `offboarding_checklist_items`. Exact order:

```
1. CREATE TYPE "ClearanceArea" AS ENUM ('IT','HR','ADMIN','FINANCE','IMMEDIATE_SUPERVISOR')   -- if not exists
   for each of the two tables:
2. SELECT DISTINCT department  -> log every value, and log LOUDLY every value not in the map
3. ALTER TABLE x ADD COLUMN "area" "ClearanceArea" NOT NULL DEFAULT 'ADMIN'   -- temp default so the add succeeds on populated rows
4. UPDATE x SET "area" = <mapped>::"ClearanceArea"  (one UPDATE per map entry, matched case-insensitively on trim(department))
5. ALTER TABLE x ALTER COLUMN "area" DROP DEFAULT
6. ALTER TABLE x ADD COLUMN "departmentId" TEXT      -- nullable, plain column; no FK constraint at all (§Shape of departmentId)
7. ALTER TABLE x DROP COLUMN "department"
```

Map: `IT`→`IT`, `HR`→`HR`, `Admin`→`ADMIN`, `Finance`→`FINANCE`,
`Immediate Supervisor`→`IMMEDIATE_SUPERVISOR`. **Catch-all: anything else → `ADMIN`**, and every
unmapped source value must be printed to stdout with its row count so the operator sees what was
swallowed.
Idempotence guards: if the column `area` already exists on a table, skip that table and log
`already migrated`. If `clearance_items` does not exist at all (fresh DB, never pushed), log and
return — `db push` will create it correctly.
*Verified by:* step 3 (dry read) and step 4 (run + psql inspection).

**2. Edit `prisma/schema.prisma`.**
*Why after the script, before running it:* the script is raw SQL and does not need the client, but
the schema edit must exist before `db push` in step 5. Doing both edits now keeps one mental model.
- Add near the other separation enums (~line 958):
  ```
  enum ClearanceArea { IT HR ADMIN FINANCE IMMEDIATE_SUPERVISOR }
  ```
- `ClearanceItem`: replace `department String` with `area ClearanceArea` and `departmentId String?`.
  **No `@relation`** — see §Shape of departmentId.
- `OffboardingChecklistItem`: the same two fields.
- `Department` (line 365): **unchanged.** Because there is no relation, Prisma needs no
  back-relation arrays and `Department` is not touched at all.
*Verified by:* `pnpm prisma validate` exits 0.

**3. Dry-read the current data.**
`docker exec veent-db-5434 psql -U veent -p 5434 -d veent_hris -c 'select department, count(*) from clearance_items group by 1; select department, count(*) from offboarding_checklist_items group by 1;'`
*Why:* proves the map covers reality before anything is destructive. Tables are snake_case, columns
are camelCase-and-quoted. Port 5434 inside the container too.
*Verified by:* the printed value list contains no surprise beyond the 6 known template values.

**4. Run the migration script.**
`pnpm dotenv -e .env.dev -- tsx scripts/migrate-clearance-area.ts`
*Why before push:* see step 1.
*Verified by:* script exits 0; re-running it prints `already migrated` for both tables (idempotence
proof); `psql \d clearance_items` shows `area` NOT NULL, `departmentId` text nullable, and no
`department` column.

**5. `pnpm db:push`.**
*Why after the script:* push now sees zero pending changes on those two tables — the raw SQL already
produced the target shape, and there is no FK constraint to add (§Shape of departmentId).
*Verified by:* push reports the database is already in sync; a second push reports **no drift at all**. Drift here means step 1's SQL diverged from step 2's schema — fix
the SQL, not the schema.

**6. `src/lib/server/services/offboarding.ts` — the write path.**
- `DEFAULT_OFFBOARDING_ITEMS` (:13–20): type becomes `{ label: string; area: ClearanceArea }[]`;
  the 6 pairs become `IT, IT, FINANCE, ADMIN, IMMEDIATE_SUPERVISOR, HR`. `departmentId` is not set —
  the defaults are org-agnostic and cannot know a real department id.
- `ensureSeeded` createMany (:56) — pass `area`.
- `addItem` (:74, :76, :84) — replace the `.trim()` + `error(400, 'Department is required')` with a
  membership check against the enum: `error(400, 'A valid clearance area is required')`. Pass
  `area` and `departmentId ?? null` to `create`.
- `updateItem` (:112, :114, :118) — the same three edits.
- Add one exported label map next to the defaults (needed by both the email and the UI — one
  definition, two consumers, so it earns its existence):
  ```
  export const CLEARANCE_AREA_LABELS: Record<ClearanceArea, string> = {
    IT: 'IT', HR: 'HR', ADMIN: 'Admin', FINANCE: 'Finance',
    IMMEDIATE_SUPERVISOR: 'Immediate Supervisor'
  }
  ```
*Verified by:* `pnpm check` clean for this file.

**7. `src/lib/server/services/offboarding.ts` — the read path.**
`clearanceTemplateForOrg` (:34) return type and `select` (:36, :40) — `department` → `area`, plus
`departmentId`.
*Verified by:* `pnpm check`.

**8. `src/lib/server/services/separation.ts:111` — `orderBy: { department: 'asc' }` → `{ area: 'asc' }`.**
*Why this is the only separation.ts edit:* nothing else in that file reads the field.
**Behaviour note to accept, not fix:** enum ordering in Postgres is *declaration order*, not
alphabetical. Items will now sort `IT, HR, ADMIN, FINANCE, IMMEDIATE_SUPERVISOR` instead of
alphabetically. That is a deliberate, arguably better ordering (IT first). Do not add a client-side
re-sort.
*Verified by:* unit test T8.

**9. `src/lib/server/notifications.ts`.**
`:127–128` payload type `{ label, department }` → `{ label, area }`. `:138` body line becomes
`` • ${c.label} (${CLEARANCE_AREA_LABELS[c.area]}) `` so the email still reads
"Immediate Supervisor", not "IMMEDIATE_SUPERVISOR".
*Verified by:* the updated `offboarding-notice.test.ts` (step 12).

**10. Routes + UI for #306.**
- `settings/offboarding/+page.server.ts:24` — zod `department: z.string().min(1).max(80)` becomes
  `area: z.nativeEnum(ClearanceArea)`, plus
  `departmentId: z.string().optional().transform((v) => v || null)`. `:50` and `:62` fail messages become
  `'A label and clearance area are required.'`
- `settings/offboarding/+page.svelte:66,70,71` and `:127,139,140` — the free-text `<input>` becomes
  a `<select name="area">` iterating `CLEARANCE_AREA_LABELS` (value = enum key, text = label).
  Keep the existing label/`for`/`id` wiring — **accessibility is not a ponytail cut**.
  Add, in the same two forms, a `<select name="departmentId">` over the org's departments with a
  blank `— none —` first option (value `''`, coerced to `null` server-side). This is the only
  consumer of `departmentId` and stays minimal by design (§Shape of departmentId).
  `load` must therefore also return the org's departments (`db.department.findMany({ where: { organizationId }, orderBy: { name: 'asc' }, select: { id: true, name: true } })`).
- `separations/[id]/+page.svelte:106` — `{item.department}` → `{CLEARANCE_AREA_LABELS[item.area]}`.
*Verified by:* `pnpm check` clean repo-wide; live check in step 18.

### Part B — #305 tests (steps 11–17)

**11. Fix the drift the schema change caused.**
*Why here:* the suite must be green before new tests are added, or a new failure cannot be told from
an old one.
See §7 for the exact list. Short version: **only `tests/unit/offboarding-notice.test.ts` breaks.**
The 3 existing separation test files do **not** reference the field at all (see §10 — the research
brief was wrong on this point).

**12. Update `tests/unit/offboarding-notice.test.ts`.**
`:12–13` fixture `department: 'IT' / 'Finance'` → `area: 'IT' / 'FINANCE'`. `:24` test name
"…with its department" → "…with its clearance area". The two `toContain` assertions at `:25–26`
stay literally `'(IT)'` and `'(Finance)'` — they now prove the label map, which is the point.
*Verified by:* `pnpm test` green.

**13. `tests/unit/separation-create-read.test.ts` (new) — T1–T8.**
Covers `createSeparation` (3 guards, template seeding, audit), `listSeparations`, `getSeparation`
(404 + cross-org, orderBy).

**14. `tests/unit/separation-final-pay.test.ts` (new) — T9–T16.**
Covers `computeFinalPay`. This is where the real value is: the HOURLY (`*8`) and DAILY branches
have **never executed** in any test, and `employeeCompensation.findMany` is mocked `[]` in all 3
existing files so `currentCompensation` has never integrated.

**15. `tests/unit/separation-clearance-item.test.ts` (new) — T17–T19.**
Covers `setClearanceItem`'s untested branches (404, finalized-parent 409, roll-back to OPEN).

**16. `tests/unit/separation-finalize-effects.test.ts` (new) — T20–T21.**
Covers the concurrent-finalize 409 and the full cascade of writes inside the transaction.

**17. `tests/unit/separation-report.test.ts` (T22–T23) + `tests/unit/separation-routes.test.ts`
(T24–T29) + `tests/e2e/separations.spec.ts` (E1–E2).**
The route file pins the zod/error mapping and, critically, **characterizes** Route B's
live-recompute-on-falsy-breakdown branch (T27) without fixing it.

### Part C — live check (step 18)

**18. Hand off to the user for a live check.**
Never run `pnpm dev` or `./start.sh` — the user starts servers. Post this script and wait:

1. Start the app. Log in as an HR admin.
2. Go to **Settings → Offboarding**. The department column is now a dropdown with exactly
   IT / HR / Admin / Finance / Immediate Supervisor. Add an item with area **Finance**, label
   `PLAN-305 marker item`. It saves and appears in the list.
3. Edit that item inline, change the area to **IT**, save. The list shows IT.
4. Open a **new separation** for any active employee (`/separations`, Create). Open the new case.
   The clearance list contains `PLAN-305 marker item` with area **IT**, and the built-in items
   render `Immediate Supervisor` (spaced words, not `IMMEDIATE_SUPERVISOR`).
5. Delete the marker item from Settings.

Report back pass/fail per step. Steps 2 and 4 are the ones that would catch a broken enum round-trip.

---

## Test Inventory

Runner conventions are copied exactly from the existing files: `vi.hoisted` dbMock →
`vi.mock('$lib/server/db' | '$lib/server/audit' | '$lib/server/notifications')` → **dynamic**
`await import(...)` at top level → `beforeEach` with `vi.clearAllMocks()` and
`dbMock.$transaction.mockImplementation(async (fn) => fn(dbMock))`. Assertions use
`expect.objectContaining` on `.mock.calls[0][0]` and
`rejects.toMatchObject({ status, body: { message } })`.

**House rule applied:** the new files `import { CLEARER_BAR } from '$lib/server/services/separation'`
rather than re-declaring the literal. The 3 existing files duplicate their literals — leave them
alone (out of scope), but no new file may add to that drift.

**Shared fixture:** skipped. Each new file mocks only the 3–6 models it actually touches, which is
shorter than importing and re-configuring a 12-model shared block. Ponytail.

| # | Test name | File | The ONE behaviour it pins | Tier |
|---|---|---|---|---|
| T1 | rejects an unknown employee | separation-create-read | `createSeparation` 404 'Employee not found' | unit-mocked |
| T2 | refuses an already-offboarded employee | separation-create-read | 409 'Employee is already offboarded' | unit-mocked |
| T3 | refuses a second open case | separation-create-read | 409 'An open separation case already exists for this employee' | unit-mocked |
| T4 | seeds clearance items from the org template | separation-create-read | template rows reach `clearanceItems.create` with their `area` | unit-mocked |
| T5 | writes an audit log for the new case | separation-create-read | `writeAuditLog` called with the new id | unit-mocked |
| T6 | lists only the caller's org | separation-create-read | `listSeparations` org filter | unit-mocked |
| T7 | hides another org's case | separation-create-read | `getSeparation` 404 'Separation record not found' on cross-org | unit-mocked |
| T8 | orders clearance items by area | separation-create-read | `findFirst` arg `clearanceItems.orderBy = { area: 'asc' }` | unit-mocked |
| T9 | a MONTHLY salary converts leave at salary/22 | separation-final-pay | the `/ WORKING_DAYS_PER_MONTH` branch | unit-mocked |
| T10 | a DAILY rate is used as the daily rate | separation-final-pay | the DAILY branch (never executed before) | unit-mocked |
| T11 | an HOURLY rate is multiplied by 8 | separation-final-pay | the HOURLY branch — the #189 rate-basis surface | unit-mocked |
| T12 | a raise effective before the separation date reaches final pay | separation-final-pay | `currentCompensation(history, effectiveDate, fallback)` integration — the #170 behaviour, asserted nowhere today | unit-mocked |
| T13 | counts only leave balances for the effective date's year | separation-final-pay | the `year: effectiveDate.getFullYear()` filter | unit-mocked |
| T14 | returns a negative total when deductions exceed leave | separation-final-pay | no clamping at zero | unit-mocked |
| T15 | rounds every money figure to 2 decimals | separation-final-pay | `round2` on a fractional-cent input | unit-mocked |
| T16 | emits leave positive, loan and cash advance negative | separation-final-pay | the 3-line shape and signs | unit-mocked |
| T17 | rejects an unknown clearance item | separation-clearance-item | `setClearanceItem` 404 | unit-mocked |
| T18 | refuses to touch an item on a finalized case | separation-clearance-item | 409 finalized-parent | unit-mocked |
| T19 | rolls the parent back to OPEN while items remain pending | separation-clearance-item | the `remaining > 0` → OPEN path, with the `status: { not: 'FINALIZED' }` floor asserted in the same `updateMany` arg | unit-mocked |
| T20 | refuses a finalize that lost the race | separation-finalize-effects | `updateMany` `count === 0` → 409 | unit-mocked |
| T21 | zeroes loans and advances, offboards the employee, deactivates the user | separation-finalize-effects | the full in-transaction cascade | unit-mocked |
| T22 | emits one TitleCase row per separation | separation-report | key set, `"Last, First"`, `Clearance` as `cleared/total`, `FinalPay` `toFixed(2)`, blank when null, `EffectiveDate` UTC-sliced | unit-mocked |
| T23 | leaves the department blank when the employee has none | separation-report | the `?? ''` fallback | unit-mocked |
| T24 | rejects a malformed create form with field errors | separation-routes | `fail(422, { error, fieldErrors })` from `createSchema` | unit-mocked |
| T25 | maps a service HttpError to the same status | separation-routes | `isHttpError` → `fail(status)`, plain `Error` → `fail(400)` | unit-mocked |
| T26 | rejects a clearance toggle with no item id | separation-routes | `fail(400, 'Missing clearance item.')` | unit-mocked |
| T27 | recomputes final pay when a finalized case has no stored breakdown | separation-routes | **characterization of a known bug** — pinned, not fixed (see §9) | unit-mocked |
| T28 | uses the stored breakdown when a finalized case has one | separation-routes | the snapshot path; `computeFinalPay` not called | unit-mocked |
| T29 | rejects an inverted or over-long report date range | separation-routes | the API's 400s (`end < start`, `> 366` days) | unit-mocked |
| E1 | an HR admin reaches the separations list | tests/e2e/separations.spec.ts | `MANAGE_HR` grants access live | e2e |
| E2 | a plain employee is refused | tests/e2e/separations.spec.ts | the capability gate actually denies — #305's "who may act needs a live check" | e2e |
| — | migration correctness | — | step 4 psql inspection + step 5 zero-drift push | live-probe |
| — | the enum round-trip through the real UI | — | step 18 hand-off script | live-probe |

**Totals: 29 unit tests across 6 new files + 1 updated file, 2 e2e checks in 1 new spec, 2 live probes.**

Not written, deliberately (see §9): a test that the offboarding email is awaited; a test that a
failed transaction rolls back; a test pinning `WORKING_DAYS_PER_MONTH = 22` as a constant (D5).

---

## Wrong-Reason Failures

| File | Does it break? | Why / what to do |
|---|---|---|
| `tests/unit/offboarding-notice.test.ts` | **YES** | `:12–13` build a fixture with `department:`; the payload type now demands `area:`. `pnpm check` goes red on the type, and the `:25–26` body assertions would go red at runtime once `notifications.ts:138` reads `c.area`. **Fix:** step 12 — swap the fixture keys to `area: 'IT' / 'FINANCE'`, rename the test, keep the `'(IT)'` / `'(Finance)'` assertions so they now prove `CLEARANCE_AREA_LABELS`. |
| `tests/unit/separation-characterization.test.ts` | **NO** | Grepped: zero occurrences of `department`. Its clearance fixtures are `{ id, status, clearedById }` only (`:48`, `:63`, `:122`). Untouched. |
| `tests/unit/separation-finalize-sod.test.ts` | **NO** | Zero occurrences. Fixtures at `:52`, `:65`, `:218` carry no area/department. Untouched. **But** it contains a `readFileSync` source assertion against `employees.ts` — if that string ever moves, this file goes red for a reason unrelated to this PR. Do not touch it; just know the failure mode. |
| `tests/unit/separation-clearance-reclear.test.ts` | **NO** | Zero occurrences. `:142` builds `clearanceItems` without the field. Untouched. |
| Any new test asserting on `getSeparation`'s `orderBy` | risk | Must assert `{ area: 'asc' }`. If written before step 8 lands it goes red for the wrong reason — hence #306 is sequenced first. |
| Any new test that re-declares `'Only the person who cleared this item may change it.'` | risk | Import `CLEARER_BAR` from the module instead. A literal makes a future message edit silently green. |
| E2E specs generally | risk | `pnpm db:seed:e2e` must run after the migration, or seeded clearance rows carry the dropped column. Re-seed before `pnpm test:e2e`. |

---

## Acceptance Criteria

1. `prisma/schema.prisma` declares `enum ClearanceArea { IT HR ADMIN FINANCE IMMEDIATE_SUPERVISOR }`, and both `ClearanceItem` and `OffboardingChecklistItem` carry `area ClearanceArea` (required) + `departmentId String?`. Neither carries `department String`. `Department` is unmodified.
2. `pnpm prisma validate` exits 0 and a second `pnpm db:push` reports **no drift**.
3. `scripts/migrate-clearance-area.ts` is idempotent: a second run prints `already migrated` for both tables and changes nothing.
4. Every unmapped legacy `department` value is logged with its row count before being mapped to the `ADMIN` catch-all.
5. `pnpm check` exits 0 — no source file still reads `department` on a clearance/checklist row.
6. `pnpm test` is green, including the updated `offboarding-notice.test.ts` and all 29 new unit tests (T1–T29).
7. The offboarding email renders `Immediate Supervisor`, not `IMMEDIATE_SUPERVISOR`.
8. `pnpm test:e2e tests/e2e/separations.spec.ts` is green (E1, E2).
9. The Settings → Offboarding editor offers exactly the 5 areas as a `<select>` plus a departments `<select>` with a `— none —` blank, and the user's step-18 live check passes.
10. `src/lib/server/services/separation.ts` differs from `staging` by exactly one line: the `orderBy` field name.

## Phase Completion Rules

This is a single-phase plan. It is `CODE DONE` when acceptance criteria 1–6 hold. It is only
`VERIFIED` when 7–10 also hold, which requires the user-run live check in step 18 and a seeded
e2e run — code-only completion is never `VERIFIED`. The transaction-rollback known gap (§Known
Gaps) keeps its gate **CONDITIONAL**: it is a recorded residual with a backlog stub, not a pass.

## Rollback

The change is one branch, one PR, no deploy target (there is no production environment).

- **Code:** `git checkout staging` / delete the branch. Nothing is merged until the PR is.
  **Never** `git checkout <file>` to undo a temp edit — copy to scratchpad instead.
- **Database:** this is the only irreversible part. The `department` column is dropped. Recovery is
  `pnpm db:push --force-reset && pnpm db:seed:e2e` (acceptable: the local DB and its seed data are
  the whole population, D3). If the operator has real hand-entered local data they care about, take
  `docker exec veent-db-5434 pg_dump -U veent -p 5434 veent_hris > scratchpad/pre-305.sql` before
  step 4. That dump is the rollback.
- **Partial failure inside step 4:** the script is a sequence of DDL statements, not one
  transaction. If it dies mid-way, re-running it is safe for the tables it already finished
  (the `area`-exists guard skips them) but the half-done table needs manual inspection: check
  which of the 7 statements landed via `\d <table>` and resume from there.

---

## Known Gaps, Deliberately Not Closed

| Gap | Why it stays open |
|---|---|
| `createSeparation` calls `sendOffboardingNoticeEmail` inside a try/catch but **does not await it** — a rejected promise escapes the catch and becomes an unhandled rejection. | Out of scope for both issues. Fixing it changes runtime behaviour in a file this PR is only supposed to test. File it separately. Noted here so the next reader does not think it was missed. |
| `finalizeSeparation` writes its audit log **outside** the transaction. A crash between commit and audit leaves a finalized case with no audit trail. | Same reason — a behaviour change in a file under characterization. |
| The mocked `$transaction` (`async (fn) => fn(dbMock)`) **cannot prove rollback**. T21 proves the writes are *issued*, not that they are atomic. | Proving atomicity needs a real DB. That is a live-probe/e2e job and is not worth the setup cost for this PR. Recorded as a known gap, not silently absorbed. |
| **Route B's live-recompute bug.** `separations/[id]/+page.server.ts` uses the persisted `finalPayBreakdown` only when the case is FINALIZED **and** the breakdown is non-null; otherwise it calls `computeFinalPay` live. A finalized case with a null breakdown therefore shows a *recomputed* figure, which can differ from what was actually paid. | **PINNED by T27, not fixed.** This is an unfiled bug and fixing it is a product decision (show a recomputed estimate, or show an error?). T27 makes the current behaviour explicit so a future fix turns a test red on purpose. |
| Enum sort order is declaration order, not alphabetical (step 8). | Accepted. Arguably better. |
| No test pins `WORKING_DAYS_PER_MONTH = 22`. | D5 — it must stay swappable for #110. T9 proves the *division*, not the constant. |
| `departmentId` has no referential integrity — a deleted department leaves a dangling id. | §Shape of departmentId. It renders as blank and nothing routes, filters, or authorizes on it (D2/D5). Adding the relation later is a schema-only change. |
| `departmentId` is written by the Settings editor but read by nothing else. | D2/D5 — per-department routing and sign-off are explicitly out of scope. The picker exists only so the locked-in column is not dead on arrival. |

---

## Where The Research Brief Was WRONG

**One correction, and it matters for step 11.**

> The brief says: "the 3 existing test files and `offboarding-notice.test.ts` all assert on
> `department` and WILL break when the column is renamed."

**This is wrong for the 3 separation test files.** Verified by grep:

```
$ grep -rn "department" tests/unit/separation-*.test.ts tests/unit/offboarding-notice.test.ts
tests/unit/offboarding-notice.test.ts:12: { label: 'Return company equipment', department: 'IT' },
tests/unit/offboarding-notice.test.ts:13: { label: 'Settle outstanding loans', department: 'Finance' }
tests/unit/offboarding-notice.test.ts:24: it('lists every clearance item with its department', ...
```

Zero hits in `separation-characterization.test.ts`, `separation-finalize-sod.test.ts`, and
`separation-clearance-reclear.test.ts`. Their clearance fixtures only ever carry
`{ id, status, clearedById }`. **Only `offboarding-notice.test.ts` needs updating.** Step 11/12 is
much smaller than the brief implied — do not go looking for edits that are not there.

**One shape question the brief left implicit, now closed in §Shape of departmentId:** "FK" was read literally at first,
which would need back-relation arrays on `Department` (`prisma/schema.prisma:365`) or
`prisma validate` fails. That shape was **rejected** in favour of a plain `departmentId String?`
column with no relation, matching `PostingApprover` (`:1175`). `Department` is therefore untouched.
See §Shape of departmentId for the tradeoff and the dangling-id answer.

Everything else in the brief checked out: the `offboarding.ts` defaults at `:13–20` are exactly the
6 pairs listed, `separation.ts:111` is the `orderBy`, `notifications.ts:127-128/:138` are as
described, `ClearanceItem` at `schema.prisma:987` matches field-for-field, and
`scripts/migrate-employment-type-regular.ts` is the right template to copy.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm prisma validate` exits 0 | Fully-Automated | #306 — the hybrid enum + optional `departmentId` is a valid schema (D1, §Shape of departmentId) |
| `tsx scripts/migrate-clearance-area.ts` exits 0; second run prints `already migrated` | Hybrid (precondition: `veent-db-5434` running) | #306 — every existing row is backfilled, idempotently (D3) |
| `psql \d clearance_items` shows `area` NOT NULL, `departmentId` nullable, no `department` | Hybrid (precondition: DB running) | #306 — no legacy column is kept (D3) |
| `pnpm db:push` reports **no drift** on a second run | Hybrid (precondition: DB running) | #306 — the raw SQL and the Prisma schema agree |
| `pnpm check` exits 0 | Fully-Automated | #306 — all 15 call sites updated; nothing still reads `department` |
| `pnpm test` — T1–T8 green | Fully-Automated | #305 — `createSeparation` / `listSeparations` / `getSeparation` guards and org scoping are pinned |
| `pnpm test` — T9–T16 green | Fully-Automated | #305 — the HOURLY/DAILY/MONTHLY rate basis and the compensation-history integration are pinned (the #189 and #170 surfaces) |
| `pnpm test` — T17–T21 green | Fully-Automated | #305 — `setClearanceItem`'s untested branches and the finalize cascade are pinned |
| `pnpm test` — T22–T29 green | Fully-Automated | #305 — the CSV report shape and all 3 routes' gates, zod, and error mapping are pinned; Route B's bug is characterized |
| `pnpm test:e2e tests/e2e/separations.spec.ts` — E1, E2 green | Hybrid (precondition: app + seeded DB running, `pnpm db:seed:e2e`) | #305 — "who may act" is checked live, not only mocked (D4) |
| Step 18 hand-off script, steps 2, 3 and 4 pass | Agent-Probe (user-executed; agent judges the report) | #306 — the enum round-trips through the real Settings form into a real separation, and renders as "Immediate Supervisor" not `IMMEDIATE_SUPERVISOR` |
| Transaction rollback under failure | Known-Gap → backlog stub | not proven; the mocked `$transaction` cannot prove atomicity (§9). Gate stays CONDITIONAL. |

---

## Test Infra Improvement Notes

- The 3 existing separation test files each re-declare a ~12-model `dbMock` block and re-declare
  guard message literals instead of importing `CLEARER_BAR`. This plan does **not** rewrite them
  (out of scope), but the drift is real: a message edit in `separation.ts` will not turn them red.
  Candidate for a follow-up cleanup once this PR lands.
- No shared separation test fixture exists and this plan deliberately does not create one — each
  new file mocks only what it touches. If a 7th separation test file ever appears, revisit.
- There is no e2e coverage of separations at all today; `tests/e2e/separations.spec.ts` is the first.
  It should be the anchor for any future separation e2e work rather than a second new spec file.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/clearance-area-and-separation-tests-305-306_PLAN_18-08-26.md`
2. **Last completed phase/step:** PLAN written. No implementation started. Branch
   `fix/clearance-department-separation-tests-305-306` exists off `staging`, clean.
3. **Validate-contract status:** pending — §14 is a placeholder for vc-validate-agent.
4. **Supporting context loaded:** `prisma/schema.prisma` (Department :365, ClearanceItem :987),
   `src/lib/server/services/offboarding.ts`, `src/lib/server/services/separation.ts`,
   `src/lib/server/notifications.ts`, `scripts/migrate-employment-type-regular.ts` (migration
   template), `tests/unit/offboarding-notice.test.ts`, the 3 existing `tests/unit/separation-*.test.ts`.
5. **Next step for a fresh agent:** run VALIDATE on this plan, then start at §5 step 1 (write
   `scripts/migrate-clearance-area.ts`). Do **not** start with the tests — the schema must land
   first or every new test referencing `area` is written twice. Never run `pnpm dev` or `./start.sh`;
   ask the user to start the DB and the app and to report step 18's results.

---

## Validate Contract

Status: CONDITIONAL
Date: 18-08-26
date: 2026-08-18
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 3/7 signals (S2 schema surface, S6 high-risk schema/migration class, S7 18 files). Single
SvelteKit package, one branch, strictly ordered checklist — a fan-out has nothing independent to split.
The VALIDATE fan-out itself ran as direct file reads (9 owner-named checks, all in one repo, no
cross-agent talk needed).

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1, AC2 | schema declares the enum + both models carry `area` / `departmentId`; SQL and schema agree | Fully-Automated | `pnpm prisma validate` exits 0 | A |
| AC2 | the raw SQL produced exactly the Prisma target shape (zero drift) | Hybrid | `pnpm db:push` twice — precondition: `veent-db-5434` up; second run reports no drift | A |
| AC3, AC4 | backfill is idempotent and every unmapped legacy value is logged with its row count | Hybrid | `pnpm dotenv -e .env.dev -- tsx scripts/migrate-clearance-area.ts` twice — precondition: DB up; second run prints `already migrated` for both tables | A |
| AC1 (DB side) | `area` NOT NULL, `departmentId` text nullable, no `department` column | Hybrid | `docker exec veent-db-5434 psql -U veent -p 5434 -d veent_hris -c '\d clearance_items'` — precondition: DB up | A |
| AC5 | no source file still reads `department` on a clearance/checklist row, and no `.svelte` imports `$lib/server/*` | Fully-Automated | `pnpm check` exits 0 | B (E1 must land first — see below) |
| AC6 | T1–T8 create/read guards and org scoping | Fully-Automated | `pnpm test tests/unit/separation-create-read.test.ts` | B |
| AC6 | T9–T16 MONTHLY / DAILY / HOURLY rate basis + compensation-history integration | Fully-Automated | `pnpm test tests/unit/separation-final-pay.test.ts` | B |
| AC6 | T17–T21 clearance-item branches + finalize cascade | Fully-Automated | `pnpm test tests/unit/separation-clearance-item.test.ts tests/unit/separation-finalize-effects.test.ts` | B |
| AC6 | T22–T29 CSV report shape + all 3 route surfaces, Route B bug characterized | Fully-Automated | `pnpm test tests/unit/separation-report.test.ts tests/unit/separation-routes.test.ts` | B |
| AC6, AC7 | the notice email renders `Immediate Supervisor`, not `IMMEDIATE_SUPERVISOR` | Fully-Automated | `pnpm test tests/unit/offboarding-notice.test.ts` | B |
| AC8 | `MANAGE_HR` grants and a plain `EMPLOYEE` is refused, live | Hybrid | `pnpm test:e2e tests/e2e/separations.spec.ts` — preconditions: DB up, `pnpm db:seed:e2e` re-run AFTER the migration, dev server on `E2E_PORT` (playwright `webServer` has `reuseExistingServer: true` — start it yourself, see E5) | B |
| AC9 | the enum round-trips through the real Settings form into a real separation case | Agent-Probe | step 18 hand-off script, user-executed; agent judges the pass/fail report | C — deferred to the user's live check |
| AC10 | `separation.ts` differs from `staging` by exactly one line | Fully-Automated | `git diff staging -- src/lib/server/services/separation.ts` shows one changed line (`orderBy`) | A |
| — | `$transaction` rollback atomicity | — | not proven; the mocked `$transaction` (`async (fn) => fn(dbMock)`) cannot prove atomicity | D — named residual, backlog stub |

Failing stub (AC6 / T11 — the HOURLY branch that has never executed):
test("an HOURLY rate is multiplied by 8", () => { throw new Error("NOT IMPLEMENTED — TDD stub: an HOURLY rate is multiplied by 8") })

Failing stub (AC6 / T12 — the compensation-history integration asserted nowhere today):
test("a raise effective before the separation date reaches final pay", () => { throw new Error("NOT IMPLEMENTED — TDD stub: a raise effective before the separation date reaches final pay") })

Failing stub (AC6 / T27 — characterization, pinned not fixed):
test("recomputes final pay when a finalized case has no stored breakdown", () => { throw new Error("NOT IMPLEMENTED — TDD stub: recomputes final pay when a finalized case has no stored breakdown") })

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred; D — backlog stub.

Legacy line form (retained for existing consumers):
- schema/migration: [hybrid: `pnpm dotenv -e .env.dev -- tsx scripts/migrate-clearance-area.ts` then `pnpm db:push` twice + `\d clearance_items` — precondition: `veent-db-5434` running]
- types/call sites: [Fully-automated: `pnpm check`]
- unit behaviour: [Fully-automated: `pnpm test`]
- live capability gate: [hybrid: `pnpm test:e2e tests/e2e/separations.spec.ts` — precondition: `pnpm db:seed:e2e` re-run after the migration]
- UI enum round-trip: [agent-probe: step 18 hand-off script, user-executed]
- transaction rollback: [known-gap: documented — backlog stub]

### Dimension findings

- Infra fit: CONCERN — `pnpm db:push` is confirmed as `dotenv -e .env.dev -- prisma db push` (already wraps the env file, so no extra `dotenv` prefix) and `pnpm dotenv -e .env.dev -- tsx …` was confirmed to resolve the local `dotenv-cli` binary. Two real gaps: (a) Postgres has **no `CREATE TYPE IF NOT EXISTS`** — step 1's line 1 must be a `DO $$ … $$` block or a `pg_type` pre-check, or the second (idempotence) run dies before the per-table guard is reached; (b) `playwright.config.ts` starts its own dev server via `webServer.command: pnpm dev` — with `reuseExistingServer: true` locally, the user must have the dev server up before `pnpm test:e2e`, or Playwright starts one itself, which the "user starts dev servers" rule forbids the agent from doing indirectly.
- Test coverage: CONCERN — the plan's 29 unit tests are all writable with the repo's hoisted-`dbMock` pattern; the route tests T24–T29 have direct precedent (`tests/unit/attendance-backlog-rbac.test.ts:35` imports `{ actions }` from a `+page.server`, `tests/unit/settings-cards.test.ts:3` imports `load`, `tests/unit/leave-review-route.test.ts:22` imports `{ PATCH }` from an API `+server`). Two notes: T29 targets the **shared** `src/routes/api/v1/reports/[type]/+server.ts` (there is no separation-specific endpoint) and its guards `throw error(400, …)` rather than returning `fail`, so assert with `rejects.toMatchObject`; and D4 says "all 9 exports" but no new test covers `finalizeBarFor` — it is already covered by the existing `separation-finalize-sod.test.ts`, so state that rather than leaving AC-vs-inventory drift.
- Breaking changes: PASS — `separation.ts` carries `department` at :108, :111, :385 and :399; only :111 is the clearance `orderBy`, the other three are the **relational** `Employee.department`. Acceptance criterion 10 (exactly one changed line) holds. No seed or script writes `department` on a clearance/checklist row: `prisma/seed.ts`, `prisma/seed-e2e.ts` and `prisma/seed-core.ts` have zero hits (seed-core touches `onboardingChecklistItem`, a different model with no `department` field), and `scripts/*.ts` hits are all the relational `Department`. The plan's touchpoint list has no hole here.
- Security surface: PASS — no auth, billing, secret or trust-boundary logic is modified. `requireAnyCapability(user.roles, 'MANAGE_HR')` at `src/routes/(app)/separations/+page.server.ts:10` and `:37` is read by the new e2e spec and never changed. No evidence pack is required: the high-risk class here is schema/data migration on a local-only DB with no production environment, and the rollback (`pg_dump` before step 4, `db:push --force-reset` after) is written.
- Section A (#306 schema, steps 1–10) feasibility: FAIL (accepted as CONDITIONAL, see E1) — steps 1–9 are mechanically sound; **step 10 as written does not build**. It has `settings/offboarding/+page.svelte` and `separations/[id]/+page.svelte` iterate `CLEARANCE_AREA_LABELS`, which step 6 defines in `src/lib/server/services/offboarding.ts`. SvelteKit refuses any `$lib/server/*` import from client-side code; zero `.svelte` files in this repo import `$lib/server` today, and `src/lib/components/Pagination.svelte:4` carries a comment saying exactly that. Highest-risk edit in the section: the destructive `DROP COLUMN "department"` in step 1 — mitigation is already planned (step 3 dry-read, then the `pg_dump` in §Rollback before step 4).
- Section B (#305 tests, steps 11–17) feasibility: PASS — the E2 e2e check is writable exactly as specced: `tests/e2e/helpers.ts` exports both `login()` and `USERS.employee`, `prisma/seed-core.ts:773–779` seeds `employee@veent.ph` with `roles: ['EMPLOYEE']` (no `MANAGE_HR`), and `tests/e2e/leave-balances.spec.ts:40` is the precedent for asserting `expect(res?.status()).toBe(403)` on a `page.goto`. No downgrade needed. Highest-risk edit: writing any new test before step 8 lands — it would assert `{ area: 'asc' }` against the old field and go red for the wrong reason. The plan already sequences around this.

### Execute-agent instructions

- **E1 (blocking, do before step 10).** Do NOT put `CLEARANCE_AREA_LABELS` in `src/lib/server/services/offboarding.ts`. Create `src/lib/utils/clearance-area.ts` — the client-safe twin of the existing `src/lib/utils/employment-type.ts` — and export the label map (and a bare value list for zod) from there. `offboarding.ts`, `notifications.ts`, `+page.server.ts` and both `.svelte` files then import from `$lib/utils/clearance-area`. Type-only `import type { ClearanceArea } from '@prisma/client'` is fine in that module. Everything else in steps 6, 9 and 10 is unchanged. This is a file-location correction, not a design change — D1–D5 and the plain-column decision are untouched.
- **E2 (step 1).** Postgres has no `CREATE TYPE IF NOT EXISTS`. Guard it: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClearanceArea') THEN CREATE TYPE "ClearanceArea" AS ENUM ('IT','HR','ADMIN','FINANCE','IMMEDIATE_SUPERVISOR'); END IF; END $$;`. Also note the template `scripts/migrate-employment-type-regular.ts` reads its guard with `$queryRawUnsafe` and writes with `$executeRawUnsafe` — the plan names only the latter; use both.
- **E3 (step 10, zod).** `z.nativeEnum(ClearanceArea)` is valid on the installed zod (3.25.76 — `nativeEnum` is present in `node_modules/zod/v3/types.d.ts` and is not deprecated in the v3 classic API). But this repo has **zero** `nativeEnum` call sites; all 20+ enum fields use `z.enum([...])`. Prefer the house form, fed from the new util so a new enum member cannot leave the validator behind: `area: z.enum(CLEARANCE_AREAS)` where `CLEARANCE_AREAS` mirrors `EMPLOYMENT_TYPES` in `src/lib/utils/employment-type.ts:26`. Either form passes `pnpm check`; `nativeEnum` is the one that would need rewriting on a future zod 4 bump.
- **E4 (step 17, T29).** Point T29 at `src/routes/api/v1/reports/[type]/+server.ts` with `type: 'separation'` (there is no separation-specific report endpoint). Its guards are `error(400, 'End date must be on or after start date')` at `:88` and `` error(400, `Date range must be ${MAX_RANGE_DAYS} days or fewer`) `` at `:91` — assert with `rejects.toMatchObject({ status: 400, … })`, not on a returned `fail`.
- **E5 (AC8).** Do not run `pnpm test:e2e` while no dev server is up — `playwright.config.ts` would start `pnpm dev` itself. Ask the user to start the dev server (and to re-run `pnpm db:seed:e2e` AFTER the migration, per §Wrong-Reason Failures), then run the spec.
- **E6 (AC / D4 wording).** `finalizeBarFor` gets no new test; it is already pinned by `tests/unit/separation-finalize-sod.test.ts`. Say so in the phase report so "all 9 exports" is not read as a miss.

Open gaps:
- Transaction rollback atomicity: known-gap: documented — the mocked `$transaction` cannot prove it; T21 proves the writes are *issued*, not atomic. Backlog stub required at completion.
- `createSeparation` does not await `sendOffboardingNoticeEmail`: known-gap — out of scope for both issues, file separately.
- `finalizeSeparation` writes its audit log outside the transaction: known-gap — behaviour change in a file under characterization.
- Route B's live-recompute-on-null-breakdown bug: characterized by T27, not fixed — a product decision.
- `departmentId` has no referential integrity and no reader: accepted by §Shape of departmentId (D2/D5).
- `pnpm db:push` zero-drift after the raw-SQL backfill is PLAUSIBLE, not proven — it cannot be checked without a running DB. Step 5 IS the gate; if it drifts, fix the SQL, not the schema.

What this coverage does NOT prove:
- `pnpm prisma validate` proves the schema parses. It does NOT prove the live DB matches it — only the second `db:push` does.
- `pnpm db:push` reporting no drift proves shape agreement. It does NOT prove the row data was mapped correctly — only the step 3 dry-read plus the step 4 stdout row counts do, and only for values the operator actually reads.
- The migration script's `already migrated` on a second run proves table-level idempotence. It does NOT prove partial-failure recovery: the 7 DDL statements are not one transaction, so a crash mid-table leaves a shape the guard will happily skip.
- `pnpm check` proves no type still reads `department`. It does NOT cover `prisma/**` or `scripts/**` (known repo gap) — here that is harmless, because those directories were grepped and hold zero clearance/checklist `department` writes.
- T1–T29 run against a mocked `db`. They prove the arguments the service sends. They do NOT prove Postgres accepts them, that the enum column round-trips, that the transaction is atomic, or that the new `orderBy: { area: 'asc' }` produces any particular order (Postgres sorts enums by declaration order — nothing asserts the resulting sequence).
- E1/E2 prove the `MANAGE_HR` gate on `/separations` grants and denies. They do NOT prove the Settings→Offboarding enum form works, that `departmentId` persists, or that any clearance item renders — only step 18's hand-off script touches that.
- Step 18 is user-executed judgment. It proves nothing on its own if the user's report is thin — require an explicit pass/fail per numbered step.

Gate: CONDITIONAL (concerns noted, accepted; E1 is a mandatory pre-step-10 correction, not an optional one)
Accepted by: user / session — accepted concerns: (1) server-module import into `.svelte` [Section A FAIL, resolved by E1]; (2) no `CREATE TYPE IF NOT EXISTS` in Postgres [E2]; (3) `nativeEnum` is off-convention for this repo [E3]; (4) T29 route target correction [E4]; (5) `pnpm test:e2e` self-starts a dev server [E5]; (6) `finalizeBarFor` has no new test [E6]; (7) transaction-rollback atomicity [known-gap, backlog stub]; (8) zero-drift push unproven without a running DB [live gate at step 5].

---

## Autonomous Goal Block

SESSION GOAL
Ship #306 + #305 as one PR on branch fix/clearance-department-separation-tests-305-306: replace
ClearanceItem/OffboardingChecklistItem free-text `department` with a required ClearanceArea enum plus
an optional plain `departmentId` column, then pin src/lib/server/services/separation.ts and its 3
route surfaces with 29 unit tests and 1 Playwright spec. Plan file:
process/general-plans/active/clearance-area-and-separation-tests-305-306_PLAN_18-08-26.md

AUTONOMY RULES
- Follow the plan's 18 steps in order. The ordering is load-bearing: schema and migration before any
  new test.
- Decisions D1-D5 and the plain-column shape of departmentId are OWNER-LOCKED. Do not re-open them.
- Apply execute-agent instructions E1-E6 from the Validate Contract. E1 is blocking: the clearance
  label map goes in src/lib/utils/clearance-area.ts, never in a $lib/server module.
- Touch only the files in §Touchpoints. Do not fix the four known gaps; they are recorded, not missed.
- Take the pg_dump named in §Rollback before running step 4.

HARD STOPS
- Never run `pnpm dev`, `./start.sh`, or `pnpm test:e2e` (it starts a dev server). Ask the user to
  start the DB and the app, and to report step 18's results.
- Stop before any destructive DDL if step 3's dry-read shows values outside the 6 known template
  values without the operator seeing the log.
- Do not push or open the PR without being asked.

NEXT PHASE
EXECUTE — start at step 1 (write scripts/migrate-clearance-area.ts), with E2's DO-block guard.

CONTRACT SUMMARY
Gate CONDITIONAL. 0 unresolved FAILs (the one Section A FAIL is resolved by E1). 8 accepted concerns,
1 named residual (transaction-rollback atomicity, backlog stub owed at completion). Test gates:
prisma validate + pnpm check + pnpm test fully automated; migration/push/psql and the e2e spec hybrid
(DB up, db:seed:e2e re-run AFTER the migration); step 18 agent-probe.

EXECUTE START COMMAND
ENTER EXECUTE MODE with plan
process/general-plans/active/clearance-area-and-separation-tests-305-306_PLAN_18-08-26.md

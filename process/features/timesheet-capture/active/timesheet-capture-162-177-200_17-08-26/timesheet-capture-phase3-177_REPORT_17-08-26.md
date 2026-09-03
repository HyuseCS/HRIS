---
name: report:timesheet-capture-phase3-177
description: "EXECUTE report — Phase 3 (#177 web punch with location): four CI gates green, 3 e2e green, 15 mutations RED, three real defects found (one by a green mutation, two only a browser could catch)"
phase: phase-3-177-web-punch-location
date: 17-08-26
status: COMPLETE
feature: timesheet-capture
plan: process/features/timesheet-capture/active/timesheet-capture-162-177-200_17-08-26/timesheet-capture-162-177-200_PLAN_17-08-26.md
metadata:
  node_type: memory
  type: report
  feature: timesheet-capture
  phase: phase-3-177
---

# Phase 3 (#177) — web punch with location

Status: **CODE DONE + VERIFIED** against §3.9 (four CI gates, e2e, both pre-merge assertions,
the full mutation table, and live DB/audit inspection). **Not committed** — the user commits
after reviewing the gates.

**Amendment 1 (§1.11) is Phase 1 only** and is skipped here, by its own §1.11.9 ("Phase 2,
Phase 3: No — explicitly out of this amendment's scope"). Every A-E/A-P item names a Phase-1
file (`derive.ts`, `attendance/index.ts`, `attendance/schedules.ts`, `settings/schedules`), so
`### Amendment 1 Validation` has nothing to apply to a Phase-3 file.

## Files changed

| File | Change | Lines |
|---|---|---|
| `src/lib/server/services/timelog.ts` | `recordPunch`: exactly-one-of guard, branched employee resolution, `dedupKey` in the dedup pre-check and the `create`, conditional location block, scoped audit key | +79 −19 |
| `prisma/schema.prisma` | `TimeLog.latitude` / `longitude` / `locationAccuracyM` (`Float?`) + `locationCapturedAt` (`DateTime?`) | +15 |
| `src/routes/(app)/punch/+page.server.ts` | **new** — org-scoped `load` + `punch` action, both gated | +151 |
| `src/routes/(app)/punch/+page.svelte` | **new** — four named geolocation states, `aria-live` status, keyboard-operable | +239 |
| `src/routes/(app)/+layout.svelte` | food-service-gated `Punch` nav link | +9 |
| `tests/unit/punch-location-capture.test.ts` | **new** — C1–C6 + the P5 guard | +253 |
| `tests/unit/punch-location-route.test.ts` | **new** — C7–C12 + the E3 cross-tenant assertions | +272 |
| `tests/unit/punch-discord-no-location.test.ts` | **new** — closes the gap M1b exposed | +76 |
| `tests/e2e/timesheet-punch-location.spec.ts` | **new** — 3 cases | +107 |
| the plan file | E9's §3.5 row and §3.9 gate correction | +16 −5 |

`src/routes/api/v1/timesheets/log/+server.ts` has a **zero-line diff** (asserted, see below).
No pre-existing test file was edited.

## Contract items — in scope for Phase 3

| Item | Verdict |
|---|---|
| **E3** punch route not org-scoped | **APPLIED.** One `findSelfEmployee()` helper does `findFirst({ where: { userId, organizationId } })` and is used by BOTH `load` and the action. The reason is copied from `profile/+page.server.ts:26-28` and extended: `/profile` only READS, `/punch` WRITES, so an unscoped resolve would file a punch into the wrong tenant. Three assertions cover it: the JoJo row is chosen for a two-org user, the same user in Sweetleaf (no employee row) is refused rather than silently filed into JoJo, and `findUnique` is asserted **never called**. Mutation M8 turns 18 specs red. |
| **E9** `/profile` is a THIRD `listPunches` caller | **APPLIED, and the contract's own numbers corrected.** E9 says grep returns "4 lines today and 6 after"; it is **5 and 7** (the definition line plus two import lines plus two call lines). Replaced §3.9's line-counting gate with a CALL-site gate expecting 3, which passes. §3.5 gains the `/profile` row: it is self-scoped on `userId` + `organizationId` and its `.map()` at `:48-56` projects six fields (`id`,`type`,`label`,`source`,`dayKey`,`at`), so **verified — no leak**, but by projection, not by a gate. The table now says so explicitly. |
| **P5** exactly-one-of `discordId`/`employeeId` | **APPLIED.** `if (!input.discordId === !input.employeeId) error(400, …)` at the top of `recordPunch`, before any Prisma call. Two specs: neither given, and both given. Mutation M7 red. |
| **P6** `hasLocation` on every audit row | **DECIDED AND STATED: the audit row may NOT change for a punch with no location.** The key is emitted only when a reading exists (`...(input.location ? { hasLocation: true } : {})`). Rationale in the code: an absent key and `false` carry the same meaning, and absent is the one that leaves the Discord audit payload byte-identical — a behaviour change inside a flow whose route file has a zero-line diff is exactly the drift nobody notices. C2 asserts the Discord audit `newValue` is exactly `['punchType','timestamp']`; mutation M12 (emit it unconditionally) turns that red. **Confirmed live in Postgres** — see below. |
| **E5 row 6** (mutation: call `recordPunch` with neither key → clean 400, not a Prisma 500) | **APPLIED** as mutation M7. |
| **E1, E2, E6, E7, P1, P7** | **NOT APPLICABLE** — Phase 1. |
| **E4, E8, P2, P3, P4, P8** | **NOT APPLICABLE** — Phase 2. |
| **E5 rows 1–5, 7–8** | **NOT APPLICABLE** — rows 1–5 are Phase 2 (CSV caps, NUL, BOM, `.csv`, `toFail`); rows 7–8 are Phase 1 (accuracy-qualifier *render* belongs to M8 manual, `amPmCols` is the export helper). Row 7's server half is covered here by C9 and the `(accuracy unknown)` branch, proved live by e2e. |
| **A-E1…A-E7, A-P1…A-P5** | **ALL NOT APPLICABLE** — Amendment 1 is Phase 1 only. |

## The four CI gates, in CI order

| Gate | Result |
|---|---|
| `pnpm format:check` | **PASS** — needed one `pnpm format` write pass mid-phase (the new `.svelte` file) |
| `pnpm lint` | **PASS** — 0 errors, 1 warning (the pre-existing `CalculatorWindow.svelte:82`, untouched) |
| `pnpm check` | **PASS** — 926 files, **0 errors**, 1 warning (the same pre-existing one) |
| `pnpm test` | **PASS** — **119 files / 1428 tests**, 0 failed |

Baseline was 116 files / 1391 tests → **+3 files, +37 tests**. No pre-existing suite was edited;
`punch-access.test.ts` and `timelog-aggregate.test.ts` are green untouched.

**Schema step:** `pnpm db:push` succeeded **without** `--accept-data-loss`. Phase 2 needed that
flag because it added a unique INDEX; Phase 3 adds four nullable columns with no default and no
index, which Prisma performs with no data-loss warning. Ran `pnpm prisma generate` after.
`\d time_logs` confirms all four columns as `double precision` / `timestamp(3)`.

### Pre-merge assertions (§3.9, E9-corrected)

```text
listPunches CALL sites                                              3  ✓
git diff --stat src/routes/api/v1/timesheets/log/+server.ts     empty  ✓
```

### E2E — hybrid gate

`pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/timesheet-punch-location.spec.ts`
→ **3 passed**. Plus `branches.spec.ts`, `tenancy-switch.spec.ts` and `timesheet-punch.spec.ts`
re-run green (6 passed) — the last of those is the Discord HMAC punch flow, which is live proof
that the widened `recordPunch` is backward-compatible end to end, not just in a mock.

## Mutation table — every guard broken, tested, restored

15 mutations applied by hand with an asserted single-occurrence anchor, the named test re-run,
RED confirmed, then restored from a scratchpad copy (never `git checkout`). Post-restore: all
three mutated files byte-identical to their pre-mutation state, full suite GREEN.

| # | Guard | Mutation | Test | Result |
|---|---|---|---|---|
| M1 | Location only when the caller passes one | default `input.location` to a literal fix in the service | C1/C2/C3 | **RED** (7) |
| M1b | **Discord ROUTE sends no location** | add `location: {…}` to `log/+server.ts`'s call | — | **GREEN → real gap, fixed** (see below) |
| M2 | Location never blocks the punch | `return fail(400)` when `loc.success === false` | C7, C8 | **RED** (11) |
| M3 | Self-scoping | read `employeeId` from the form | C10 | **RED** (1) |
| M4 | Org gate on the **action** | delete `requireFoodServiceOrg` from the action only | C11 | **RED** (1) |
| M5 | Web dedup | drop `dedupKey` from the action | C9 | **RED** (1) |
| M6 | Coordinates stay out of the audit | put `latitude` into the audit `newValue` | C1 audit | **RED** (1) |
| M7 | Exactly-one-of (P5, E5-6) | delete the guard | P5 | **RED** (2) |
| M8 | Org scoping (E3) | `findUnique({ where: { userId } })` | E3 ×3, C10 | **RED** (18) |
| M9 | Blank-to-undefined | drop the preprocess, coerce directly | C8 "empty strings" | **RED** (1) |
| M10 | Dedup pre-check covers `dedupKey` | revert to `if (input.discordMessageId)` | C5 | **RED** (2) |
| M11 | Location keys ABSENT, not null | write four explicit `?? null`s | C2, C3 | **RED** (2) |
| M12 | Audit key scoped (P6) | emit `hasLocation` unconditionally | C2 | **RED** (2) |
| M13 | Page projects, not spreads | `...p` the raw `TimeLog` row | projection spec | **RED** (1) |
| M14 | `hadLocation` reports the truth | hardcode `true` | C7, C8 ×5 | **RED** (6) |

No mutation was sized off the constant it mutates — the Phase 1/2 trap does not apply here (no
numeric threshold is under test), and every anchor was asserted to occur exactly once before
replacement, so a silently-skipped mutation could not masquerade as red.

## Three real defects found. All three fixed.

1. **M1b stayed GREEN — nothing pinned the Discord route's own arguments.** The plan's mutation
   table says C2 catches "add `location` to the Discord route's `recordPunch` call". It does
   not: C2 tests the SERVICE, and adding a location to the ROUTE left all 1426 tests green. This
   is the twin-door failure in miniature — the service half was proved and the route half was
   assumed. Fixed with `tests/unit/punch-discord-no-location.test.ts`, which asserts the route
   passes no `location`, no `dedupKey`, no `employeeId`, and exactly the five keys it always
   sent. The mutation is now RED.

2. **`z.coerce.number()` turned an empty form field into 0 — Null Island.** Found by C8's
   "empty strings" case failing on the first run. `Number('') === 0`, and an empty string is
   precisely what the page sends whenever location is denied, times out, or is unsupported — so
   **every failed-location punch would have been recorded at 0°N 0°E**, a real point in the Gulf
   of Guinea, indistinguishable from a genuine fix. Fixed with a `blankToUndefined` preprocess
   on all three numeric fields. Mutation M9 pins it.

3. **Two browser-only bugs the unit tests could never see** (both found by the e2e, both fixed):
   - **Pre-hydration clicks punched with no location and no explanation.** A click landing
     before hydration submits the form natively — correct (the punch is never lost) but silent.
     The form now carries `data-ready`, set in `onMount`, so the difference is observable and
     the spec waits for it.
   - **`requestSubmit()` serialised stale hidden inputs.** Svelte 5 flushes `bind:value` on the
     NEXT tick, so submitting in the same tick as the capture sent the still-empty fields: the
     status line said "Location captured (±0 m)" while the server recorded no location at all.
     A captured reading was being thrown away with nothing to indicate it. Fixed with
     `await tick()` before `requestSubmit()`. **No unit test could have caught either** — both
     live entirely in the browser's render/submit timing.

## The six geolocation states

Separate, named branches; each reached by exactly one code path; all copy in one `locationCopy`
table so a later UX pass edits that table and nothing else.

| State | Reached by | Punch still recorded? |
|---|---|---|
| `idle` | initial render — nothing requested yet | n/a, no punch attempted |
| `requesting` | set at the TAP, before `getCurrentPosition` returns | pending |
| `granted` | `getCurrentPosition` success callback | Yes, with coordinates |
| `denied` | error callback, `err.code === PERMISSION_DENIED` | Yes, without |
| `nofix` | error callback (timeout / position unavailable) **or** the 9 s watchdog | Yes, without |
| `unsupported` | `!('geolocation' in navigator)` — insecure origin or old browser | Yes, without |

`requesting` was added by the UI/UX fix pass and is the state the user spends the most time in.
Without it `punch.busy` stayed false until submit — up to nine seconds — so both buttons stayed
live and the page still read "Location has not been requested yet". That was not only silent: a
second tap re-entered the handler and reassigned `punchType`, so tapping In then Out recorded an
**OUT**. The lock now goes up at the tap.

The watchdog (9 s) is deliberately longer than the API timeout (8 s) so the normal path is the
API's own callback. `settled` makes the submit happen exactly once regardless of which branch
arrives first.

Announcements are split by urgency: the location line lives in a `role="status"` region
(`aria-live="polite"`), and the punch outcome in its own `role="alert"`, so a failed punch is not
announced as routinely as a status change. A failure is prefixed "Not punched." so the meaning
survives greyscale and sunlight rather than resting on colour.

The history list does **not** print a raw coordinate pair. It renders a "View on map (±N m)" link
carrying the coordinates in its `href`, so the accuracy qualifier is always attached and the most
sensitive string on the page is not the thing the eye lands on.

## Security — built in full

- **Session-authenticated, not HMAC.** `TIMELOG_API_SECRET` is not read anywhere in this route.
- **The employee comes from `locals.user`, never the form.** No `employeeId` field exists in the
  form and the action never reads one. Proved twice: C10 asserts a form-supplied `employeeId` is
  ignored and the lookup keys on the session user id; a second spec asserts `findUnique` is never
  called at all, so the non-org-scoped form cannot creep back in. M3 and M8 both red.
- **Org-scoped resolution (E3)** — the write-side twin of `/profile`'s read-side comment.
- **Twin doors** — `requireFoodServiceOrg` in BOTH `load` and the action; C11 asserts each
  independently, and M4 (delete it from the action only) is red.
- **Coordinates stay out of the audit log (#242).** Confirmed live:
  `select count(*) from audit_logs where "newValue"::text like '%latitude%' or … '%124.6%'` → **0**.
  A located punch's row is `{"punchType":"IN","timestamp":…,"hasLocation":true}`; an unlocated
  one is `{"punchType":"OUT","timestamp":…}` — unchanged from before #177.
- **Location reaches only pre-gated surfaces.** The punches API (`canTouchEmployee`, unchanged),
  and the employee's own `/punch` page. The page **projects** eight named fields rather than
  shipping raw rows, so a future `TimeLog` column cannot leak by simply existing (M13 red).
  `/profile` projects six fields and never touches the coordinates (E9, verified by reading).
  Attendance page and CSV export read `AttendanceDay`, which has no location column.
- **Non-WEB punches carry no location.** Confirmed live:
  `select count(*) from time_logs where source <> 'WEB' and (latitude is not null …)` → **0**.
- **`Float?`, never `Decimal`** — the transport hook in `src/hooks.ts` is untouched, and the e2e
  rendering `8.47720, 124.64590` in the browser proves a `Float` column transports correctly.
  These are the schema's first `Float` columns, so that was previously unproven.

## Accessibility

- Both controls are real `<button type="submit">` elements with accessible names, found by the
  e2e via `getByRole('button', { name: … })`.
- One `role="status" aria-live="polite"` region carries both the location state and the punch
  outcome, so a screen reader hears the sequence in the order it happens.
- The e2e drives a whole punch with `focus()` + `Enter` and never uses the pointer.
- Coordinates are never rendered bare: always `lat, lng (±N m)` or `lat, lng (accuracy unknown)`.
- No JavaScript: the buttons submit natively (their own `name`/`value` carries the punch type)
  and the punch is recorded without a location.

## Proved live, and what could not be

**Proved** on `veent-db-5434` (columns are camelCase and double-quoted — the plan's snippets
were wrong about this and Phase 1 already recorded it):

- A granted punch persists `latitude=8.4772`, `longitude=124.6459`, `locationAccuracyM=0`,
  `locationCapturedAt` non-null. A denied punch persists all four NULL **and still exists**.
- Postgres accepts `double precision` for the coordinates, and the values survive the transport
  hook into the browser.
- The audit log contains no coordinate anywhere; the P6 scoping holds in real rows.
- The unique `(dedupKey, employeeId)` index tolerates the per-minute web keys alongside the
  NULL-keyed Discord rows.

**Still unproved:**

- **Real-device GPS.** Playwright's `setGeolocation` supplies a synthetic fix whose accuracy is
  literally `0`, so "±0 m" is what the UI showed. Real accuracy variance, poor-signal timeouts,
  and the 9-second watchdog actually firing are all untested. Already a named known-gap
  (`web-punch-real-device-accuracy`).
- **Insecure-origin behaviour.** The `unsupported` branch is unreachable on `localhost` (a secure
  context) and cannot be exercised locally. It is a browser guarantee, not our behaviour — the
  contract already accepts this.
- **Populated-table `db push`** for the four columns. Local `time_logs` had few rows. Additive
  nullable columns with no default are a catalog-only change, so this is far weaker than Phase
  2's index concern — but it is still not staging.
- **Manual script M1–M11** was not run: M1–M7 are Phase 1/2 steps, and M8–M11 are covered by the
  e2e and the live DB/audit queries above, which assert the same things with positive evidence.

## Plan claims wrong against live code

1. **§3.9's `listPunches` gate could never pass**, and E9's replacement numbers are also wrong:
   grep returns **5** lines today and **7** after Phase 3, not 4 and 6. Fixed in the plan as a
   CALL-site count of 3.
2. **The plan's §3.6 mutation "add `location` to the Discord route's call → C2 red" is false.**
   C2 cannot see the route. Recorded as M1b; new test added.
3. **`pnpm test:e2e` does not run locally as written.** The script is bare `playwright test` with
   no dotenv, and this repo has `.env.dev` and no `.env`, so `global-setup.ts` dies on
   `Environment variable not found: DATABASE_URL`. The working command is
   `pnpm exec dotenv -e .env.dev -- playwright test`. Pre-existing, not caused by this phase.
4. **`pnpm db:seed:e2e` is not idempotent on an already-seeded DB** — `ensureEmployeeProfile`
   (`seed-core.ts:60-67`) looks up by `userId`, misses, then creates a colliding
   `(organizationId, employeeNumber)` and dies with P2002. Pre-existing and out of scope; the e2e
   ran against the DB's existing seed.
5. **§3.2 step 5's `hasLocation: Boolean(input.location)` is not what shipped** — see P6.
6. `pnpm db:push` needed **no** `--accept-data-loss` here, unlike Phase 2.

## Deviations from the plan

| Deviation | Why |
|---|---|
| The audit `newValue` gains `hasLocation` only when a location exists, not on every punch | P6, decided and stated. Keeps the Discord audit payload byte-identical. |
| The `/punch` load PROJECTS eight named punch fields instead of returning `listPunches`' raw rows | The plan returns `recent` raw. Sensitive-data surface: a future `TimeLog` column would reach the client for free. M13 pins the projection. |
| `nofix` covers timeout AND position-unavailable as one named state | The plan's copy treats them identically ("punching without it"); two states with one behaviour and one message would be a distinction the UI cannot express. |
| The form carries `data-ready` (set in `onMount`) | Needed to make the pre-hydration difference observable; see defect 3. |
| The keyboard-only assertion rides on the denied-permission e2e case rather than being its own test | The action debounces to one punch per employee per TYPE per PHT minute and there are exactly two types; a third punch in the same minute asserts the debounce instead of the thing under test. |
| Red-first (Mode A) was **not** observed | The plan's checklist orders implementation (27–34) before tests (35–37) and I followed the checklist. The substitute proof is the mutation table plus the three defects the tests actually caught after the fact — two of which no red-first unit test could have caught either. Recorded honestly rather than claimed. |

## Follow-ups created

None as separate plan stubs. Three items belong in the PR description / staging runbook:
the `pnpm test:e2e` dotenv requirement, the non-idempotent `db:seed:e2e`, and the real-device
GPS known-gap.

## Housekeeping

The e2e left a handful of `source = 'WEB'` rows for `benjie@jojo.ph` in the local DB. Harmless
test data; the plan's own rollback statement clears them:
`DELETE FROM time_logs WHERE source = 'WEB';`

## Closeout

- Selected plan: `timesheet-capture-162-177-200_PLAN_17-08-26.md`
- Finished: Phase 3 checklist items 27–38, in full, plus E3, E9, P5, P6.
- Verified: four CI gates; 37 new specs; 3 e2e; 15 mutations RED-then-restored; live DB and
  audit-log inspection; both §3.9 pre-merge assertions.
- Unverified: real-device GPS, insecure-origin branch, populated-table push, manual M1–M11.
- **Not committed** — the user commits after reviewing the gates.
- Classification: **Keep in active/testing.** All three phases are code-complete and green; the
  cluster is one PR and the user has not yet committed Phase 3.

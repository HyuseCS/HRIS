---
name: plan:timesheet-capture-162-177-200
description: "AM/PM attendance split (#162), CSV backlog import (#200), and a session-authenticated web punch with location (#177) — one PR, three sequentially-gated phases, food-service orgs only"
date: 17-08-26
feature: timesheet-capture
---

# PLAN — Timesheet Capture Cluster (#162 / #177 / #200)

**TL;DR** — One PR on `feat/timesheet-capture-162-177-200`. Three phases, each with its own
green gate before the next starts. Phase 1 adds four nullable AM/PM columns to `AttendanceDay`
and one boolean parameter to the pure derive function; nothing that reads attendance today
changes. Phase 2 adds a CSV backlog importer that writes `TimeLog` rows and re-uses the same
derive path. Phase 3 adds the first web punch page and four nullable location columns on
`TimeLog`. No Prisma enum is renamed anywhere, so **no `scripts/migrate-*.ts` is needed**.

**Date**: 17-08-26
**Status**: ACTIVE — planned, not started
**Complexity**: COMPLEX (multi-phase, schema + payroll-adjacent, new production dependency, new public surface)
**Branch**: `feat/timesheet-capture-162-177-200`
**SPEC**: `timesheet-capture-162-177-200_SPEC_17-08-26.md` (same task folder)
**RESEARCH**: `research-findings_REF_17-08-26.md` (same task folder)
**Context routing**: `process/context/all-context.md` holds only `.gitkeep` on this repo — the
routing table does not exist yet (RESEARCH §preamble). Test context therefore comes from the
live suites in `tests/unit/` and `tests/e2e/`, enumerated in RESEARCH §11; post-phase testing is
specified per phase below and re-stated in `## Phase Completion Rules`.

---

## Overview

| Phase | Issue | Adds | Gate before next phase |
|---|---|---|---|
| 1 | #162 | 4 nullable `AttendanceDay` columns + `splitAmPm` param on `deriveAttendanceDay` + AM/PM columns on the attendance page and CSV export | 4 CI gates green + 5 new unit specs green + mutation checks red-on-mutate |
| 2 | #200 | `papaparse` dependency, `dedupKey` on `TimeLog`, `attendance/import.ts` service, upload form action | 4 CI gates green + 7 new unit specs green + mutation checks |
| 3 | #177 | 4 nullable `TimeLog` location columns, `recordPunch` refactor, `/punch` page + action | 4 CI gates green + 6 new unit specs green + 1 e2e + manual script |

### Goals

1. A food-service employee's day carries a distinct AM pair and PM pair, without changing the
   one-row-per-date shape or the meaning of `timeIn` / `timeOut`.
2. HR can upload a CSV backlog of punches that is idempotent, lock-respecting, and audited.
3. An employee can punch from a browser page that optionally attaches a location reading.

### Non-goals (locked, do not reopen)

- No change to `@@unique([employeeId, date])` on `AttendanceDay`.
- No photo / EXIF / TimeMark import.
- No new `Organization` column; `isFoodServiceOrg()` is the gate.
- No geofencing, no location purge tooling, no break punches.
- No second AM/PM engine in `timelog.ts` or `TimesheetModal.svelte`.

---

## Locked Design Decisions (from INNOVATE — adopted verbatim, with the exact mechanics)

**D1 — AM/PM boundary = longest mid-day gap between work segments.**
`derive.ts:162-188` already builds `workSegs: Array<[number, number]>` by pairing IN/OUT.
The split is a *post-pass* over that array. No new pairing logic, no fixed noon cut, no
`WorkScheduleDay` read (it stores break *duration*, not position — see the comment at
`derive.ts:233-238`), no break punches.

**D2 — AM/PM is display-only.** The four values never feed `workedHours`, `regularHours`,
`overtimeHours`, `lateMinutes`, `undertimeMinutes`, or any payroll bucket. This is the single
most important safety property in the cluster: a wrong boundary produces a wrong *label*, never
a wrong *peso*. See `## Risks` R1.

**D3 — Org gating is a boolean parameter on the pure function**, exactly like `enforceTardiness`
(`derive.ts:56-61`). `derive.ts` stays DB-free and unit-testable. Call sites pass
`isFoodServiceOrg(organizationId)`.

**D4 — CSV = one new production dependency, `papaparse`.** Parsed in memory, file discarded.
`storage.ts` is not touched: `ALLOWED_MIME` (`storage.ts:12-17`) and `sniffMime` (`:27`) stay
exactly as they are. The durable record is the resulting `TimeLog` rows plus the audit entry.

**D5 — Import idempotency via a deterministic synthetic key on `TimeLog`**, checked in one bulk
query, backed by a DB unique constraint — the same two-layer shape as the Discord replay defence
(`timelog.ts:52-84` + `schema.prisma` `@@unique([discordMessageId, employeeId])`).

**D6 — Web punch refactors `recordPunch()`**; no parallel `recordWebPunch()`. Only employee
resolution and the dedup key vary.

---

## Prisma / Migration Contract (read before Phase 1)

**Does anything here need an enum change? Explicitly: no.**

| Enum | Needed value | Status |
|---|---|---|
| `PunchSource` (`schema.prisma:214`) | `WEB` | **Already exists.** Phase 3 is its first writer. |
| `PunchSource` | `MANUAL` | **Already exists.** Phase 2 writes it. |
| `PunchType` (`schema.prisma:207`) | `IN` / `OUT` | Already exist. No `BREAK_*` writer added. |
| `AuditAction` (`schema.prisma:194-203`) | none | Phase 2 and 3 use existing `CREATE` / `UPDATE` with a descriptive `newValue`, matching the two shapes already in use (`attendance/index.ts:298-303` summary, `timelog.ts:87-99` per-record). |

Therefore **no `ALTER TYPE … RENAME VALUE` and no `scripts/migrate-*.ts` is required by any
phase of this cluster.** Every schema change is an ADD of a nullable column or an ADD of a
unique index over nullable columns — all of which `prisma db push` performs without data loss.

**Exact command sequence after editing `prisma/schema.prisma`, every phase:**

```bash
./start.sh                 # only if the DB container is not already up
pnpm db:push               # dotenv -e .env.dev -- prisma db push
pnpm prisma generate       # MANDATORY — see below
pnpm check                 # confirms the regenerated client types resolve
```

`pnpm prisma generate` is **not optional**. A stale `@prisma/client` has produced phantom
`pnpm check` errors on this repo three times: `svelte-check` reads the generated types from
`node_modules/.prisma/client`, so a new column that exists in Postgres but not in the generated
client surfaces as "Object literal may only specify known properties" on a perfectly correct
write. If `pnpm check` reports an unknown field on a column you just added, run
`pnpm prisma generate` before debugging anything else. (`postinstall` runs it, but `db push`
alone does not always.)

---

## Verification Gate Protocol (applies to every phase)

The four CI gates run in **this order** and CI **stops at the first failure**:

```bash
pnpm format:check      # prettier --check .
pnpm lint              # eslint .            — does NOT run format:check
pnpm check             # svelte-kit sync && svelte-check
pnpm test              # vitest run  (tests/unit/**)
```

`pnpm lint` does not run `format:check`. A phase is not green until all four have been run in
order and all four exit 0. Run `pnpm format` (write mode) before `pnpm format:check` if the
first gate fails on whitespace — do not hand-edit formatting.

E2E (`pnpm test:e2e`, Playwright) is a **hybrid** gate: it needs the seeded DB from `./start.sh`
+ `pnpm db:seed:e2e`. It is required at the end of Phase 3 only.

---

# PHASE 1 — #162 AM/PM split

**Scope:** additive columns, one pure-function parameter, two display surfaces.
**Not in scope:** `timelog.ts` engine B, `TimesheetModal.svelte` engine C, `TimesheetEntry`.

## 1.1 `prisma/schema.prisma` — `AttendanceDay`

Current (`schema.prisma`, `model AttendanceDay`):

```prisma
model AttendanceDay {
  id         String           @id @default(cuid())
  employeeId String
  date       DateTime         @db.Date
  status     AttendanceStatus
  dayType    DayType          @default(REGULAR)
  timeIn     DateTime?
  timeOut    DateTime?
```

**Change:** insert four nullable columns immediately after `timeOut`, with a comment recording
the invariant. Do not touch `@@unique([employeeId, date])` or any other line.

```prisma
  timeIn     DateTime?
  timeOut    DateTime?

  // #162 — food-service tenants only (isFoodServiceOrg). The AM/PM pair is a DISPLAY split of
  // the same punches `timeIn`/`timeOut` already bracket: amTimeIn === timeIn and
  // pmTimeOut === timeOut whenever a PM block exists. Never read by payroll, reports, or the
  // payslip — those keep reading timeIn/timeOut (first punch / last punch of the day). Null on
  // every non-food-service row and on any day with no second work block.
  amTimeIn   DateTime?
  amTimeOut  DateTime?
  pmTimeIn   DateTime?
  pmTimeOut  DateTime?
```

Then run the Prisma command sequence above.

## 1.2 `src/lib/server/services/attendance/derive.ts` — the only engine taught AM/PM

### 1.2a Extend `DeriveInput`

Current (`derive.ts:47-63`):

```ts
export interface DeriveInput {
	punches: PunchLite[]
	schedule: ScheduleDay | null
	dayType: DayType
	approvedOtHours?: number
	onLeave?: boolean
	enforceTardiness?: boolean
	config?: DeriveConfig
}
```

**Change:** add one optional boolean, documented in the same voice as `enforceTardiness`
(`derive.ts:56-61`):

```ts
	/**
	 * Whether to compute the AM/PM display split (#162). Defaults to false; the caller passes
	 * `isFoodServiceOrg(organizationId)`. When false, all four am*/pm* results stay null and this
	 * function behaves exactly as it did before #162. The split is DISPLAY ONLY — it never
	 * changes workedHours, the hour buckets, lateMinutes, or undertimeMinutes.
	 */
	splitAmPm?: boolean
```

### 1.2b Extend `AttendanceDayResult`

Current (`derive.ts:65-83`) starts:

```ts
export interface AttendanceDayResult {
	status: AttendanceStatus
	timeIn: Date | null
	timeOut: Date | null
```

**Change:** add four fields after `timeOut`:

```ts
	amTimeIn: Date | null
	amTimeOut: Date | null
	pmTimeIn: Date | null
	pmTimeOut: Date | null
```

And add all four as `null` to `emptyResult()` (`derive.ts:130-150`), right after `timeOut: null`.
This is load-bearing: it guarantees an ABSENT / ON_LEAVE / REST_DAY row always *clears* stale
AM/PM values rather than leaving them behind.

### 1.2c The boundary constant + the split function

Add near `MEAL_BREAK_OWED_AFTER_MS` (`derive.ts:19-21`):

```ts
// #162 — the smallest gap between two work blocks that counts as the AM/PM boundary. Below
// this, two adjacent segments are the same block interrupted by a quick re-punch (a phone
// double-tap, a corrected mis-punch), not a morning and an evening shift. 30 minutes is the
// shortest real between-shift break at these tenants; a shorter threshold would split a single
// block and label half a morning "PM".
const MIN_AM_PM_GAP_MS = 30 * 60_000
```

> **Amended by Amendment 1 (§1.11).** This constant is now the DEFAULT, not the rule. The
> threshold arrives as an argument; the constant applies only when no per-organization value is
> configured. Read §1.11 before implementing §1.2c or §1.2d.

Add the pure post-pass, placed directly above `deriveAttendanceDay`:

```ts
/**
 * Split already-paired work segments into an AM block and a PM block at the LONGEST mid-day
 * gap (#162). `segs` must be ascending, which is what the pairing loop produces from sorted
 * punches. `openWork` is a dangling IN with no OUT yet — a half-finished PM block.
 *
 * Ties go to the EARLIEST qualifying gap, so the result is deterministic for a day whose two
 * gaps are exactly equal. Returns all-null when there is no qualifying gap; a single-block day
 * is deliberately NOT reported as "AM only", because a lone evening shift is not a morning.
 */
function splitAmPmBlocks(
	segs: Array<[number, number]>,
	openWork: number | null
): { amIn: Date | null; amOut: Date | null; pmIn: Date | null; pmOut: Date | null }
```

Behaviour, exactly:

1. If `segs.length === 0` → all null. (A day with only a dangling IN has no AM block to anchor
   the split against.)
2. Build `gaps[i] = segs[i + 1][0] - segs[i][1]` for `i` in `0 .. segs.length - 2`. Pick the
   index `k` with the maximum gap, scanning left-to-right and using strict `>` so the earliest
   maximum wins.
3. If such a `k` exists and `gaps[k] >= MIN_AM_PM_GAP_MS`:
   `amIn = segs[0][0]`, `amOut = segs[k][1]`, `pmIn = segs[k + 1][0]`,
   `pmOut = segs[segs.length - 1][1]`.
4. Else if `openWork !== null` and `openWork - segs[segs.length - 1][1] >= MIN_AM_PM_GAP_MS`:
   the day is AM-complete with a PM block still running.
   `amIn = segs[0][0]`, `amOut = segs[segs.length - 1][1]`, `pmIn = openWork`, `pmOut = null`.
5. Else → all null (one continuous block; `timeIn`/`timeOut` already describe it).

Return `Date` objects, not epoch millis, to match the rest of the result type.

### 1.2d Wire it into `deriveAttendanceDay`

`derive.ts:189` currently reads `const incomplete = openWork !== null`. `openWork` is in scope
there. After `result.timeOut = lastOut` (`derive.ts:262`), insert:

```ts
	if (input.splitAmPm) {
		const { amIn, amOut, pmIn, pmOut } = splitAmPmBlocks(workSegs, openWork)
		result.amTimeIn = amIn
		result.amTimeOut = amOut
		result.pmTimeIn = pmIn
		result.pmTimeOut = pmOut
	}
```

Note the early returns at `derive.ts:191-197` (`workSegs.length === 0`) go through
`emptyResult()`, which now returns all-null AM/PM — correct by construction, no extra branch.

**Do not** change `firstIn` / `lastOut`, `lateMinutes` (`:245`), `undertimeMinutes` (`:246`), the
`threshold` (`:250-253`), or any hour bucket. If a diff line touches those, it is out of scope.

## 1.3 `src/lib/server/services/attendance/index.ts` — call sites

### 1.3a Import the gate

Add to the imports at the top (`index.ts:1-9`):

```ts
import { isFoodServiceOrg } from '$lib/orgs'
```

### 1.3b `deriveRange` — pass the flag and persist the columns

Current (`index.ts:258-291`):

```ts
			const r = deriveAttendanceDay({
				punches: byDay.get(dayKey) ?? [],
				schedule: dayType === 'REGULAR' ? schedDay : null,
				dayType,
				approvedOtHours: approvedOtByDay.get(dayKey) ?? 0,
				onLeave,
				enforceTardiness
			})

			const data = {
				status: r.status,
				dayType,
				timeIn: r.timeIn,
				timeOut: r.timeOut,
				workedHours: r.workedHours,
```

**Change 1** — add `splitAmPm` to the call. Hoist the boolean once above the employee loop
(near `orgTracksTardiness`, `index.ts:175`) so it is computed once per run:

```ts
	// #162 — AM/PM display split is food-service only (Decision 4 / isFoodServiceOrg).
	const splitAmPm = isFoodServiceOrg(organizationId)
```

> **Amended by Amendment 1 (§1.11).** A second hoisted value, `amPmMinGapMs`, is read from the
> org row this function ALREADY fetches at `index.ts:171-174`. No new query.

then `splitAmPm` joins the `deriveAttendanceDay({ … })` argument object.

**Change 2** — add the four fields to `data`, immediately after `timeOut: r.timeOut,`:

```ts
				amTimeIn: r.amTimeIn,
				amTimeOut: r.amTimeOut,
				pmTimeIn: r.pmTimeIn,
				pmTimeOut: r.pmTimeOut,
```

Because `data` is used for both the `create` and the `update` branch of the upsert
(`index.ts:287-291`), this covers both. Because `emptyResult` returns nulls, a non-food-service
org writes four nulls — and a food-service day that loses its PM block on re-derive is *cleared*,
not left stale.

### 1.3c `correctDay` — the twin door

`correctDay` is the *other* writer of `timeIn`/`timeOut` (`index.ts:396-515`). It must be taught
the same flag or it silently writes a day whose AM/PM columns contradict its `timeIn`/`timeOut`.

Current (`index.ts:464-495`):

```ts
			const r = deriveAttendanceDay({
				punches,
				schedule: day.dayType === 'REGULAR' ? schedDay : null,
				dayType: day.dayType as DayType,
				approvedOtHours,
				enforceTardiness
			})
			…
			write = {
				status: statusOverride ?? r.status,
				timeIn: r.timeIn,
				timeOut: r.timeOut,
```

**Change:** add `splitAmPm: isFoodServiceOrg(organizationId)` to the call, and add the four
fields to `write` after `timeOut: r.timeOut,` — same four lines as 1.3b.

**Documented consequence (intended, not a bug):** the `correct` form action can only express one
`timeIn`/`timeOut` pair (`attendance/+page.server.ts:149-162`, `:189-192`), so `punches` here is
at most one IN and one OUT (`index.ts:460-462`). `splitAmPmBlocks` therefore returns all-null,
and an HR correction **collapses the day to a single block and clears AM/PM**. That is the
honest reading: HR has declared the day is one pair. Add this comment above the `write` block:

```ts
			// #162: the correction form expresses exactly ONE pair, so the AM/PM split resolves to
			// null here and the columns are cleared. That is deliberate — a hand-correction is a
			// declaration that the day is one block. `resetDay` re-derives from punches and brings
			// the split back.
```

The recovery path already exists and needs no change: `resetDayToDerived` (`index.ts:521-552`)
clears `manuallyEdited` and delegates to `deriveRange`, which now writes the split.

**Correction P1 — `correctDay` has a second branch, and it deliberately does nothing here.**
`index.ts:425` computes `editingTimes = 'timeIn' in data || 'timeOut' in data`; when FALSE,
`write = { ...data }` and the four AM/PM columns are left untouched while `manuallyEdited: true`
is still written. `correctSchema` permits editing `status`/`regularHours`/`overtimeHours`/`note`
with no date, so the branch is reachable. **Resolution taken in EXECUTE: leave the split alone in
that branch, and say so in the code comment.** A correction that never touches the times leaves
`timeIn`/`timeOut` alone too, so the stored split still describes the punches it came from;
clearing it would make a note edit silently erase a correct split. R11 (a threshold change not
re-splitting stored days) is the same defect reached a third way and has the same recovery — the
Refresh/reset path — so all three fold into this one resolution.

**Correction P7 — two seed scripts also write `AttendanceDay`,** and neither writes AM/PM:
`scripts/seed-attendance-demo.ts:101` (`upsert`) and `scripts/seed-payslip-demo.ts:58`
(`createMany`). Harmless because the columns are nullable, but the `upsert` leaves stale values on
a re-seed, and `pnpm check` covers neither `scripts/**` nor `prisma/**` (#282), so nothing would
catch it. Not changed by this phase; recorded so the writer set is complete.

**Every other `AttendanceDay` writer is verified untouched:** `lockRange` (`:562-569`) and
`unlockRange` (`:591-598`) write only `isLocked`; `autoDeriveFromPunches` (`:334`) delegates to
`deriveRange`. That is the complete writer set from the RESEARCH map §3.

## 1.4 `src/routes/(app)/attendance/+page.server.ts` — expose the flag

In `load` (`+page.server.ts:34-119`), add the import `import { isFoodServiceOrg } from '$lib/orgs'`
and one line to the returned object (`:105-118`):

```ts
		showAmPm: isFoodServiceOrg(user.organizationId),
```

No action changes in this file.

## 1.5 `src/routes/(app)/attendance/+page.svelte` — two extra column pairs

Both tables. Team table header currently (`+page.svelte:470-477`):

```svelte
					<th class="px-3 py-3 text-left font-medium text-muted-foreground">Status</th>
					<th class="px-3 py-3 text-left font-medium text-muted-foreground">In</th>
					<th class="px-3 py-3 text-left font-medium text-muted-foreground">Out</th>
```

**Change:** after the `Out` header, in **both** `<thead>` blocks (team at `:470-477`,
per-employee at `:608-616`), add:

```svelte
					{#if data.showAmPm}
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">AM In</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">AM Out</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">PM In</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">PM Out</th>
					{/if}
```

And in both `<tbody>` row blocks, after the existing `timeOut` `<td>` (team at `:526-532`,
per-employee at `:657-666`), add four **read-only** cells using the file's existing `fmtTime`:

```svelte
					{#if data.showAmPm}
						<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.amTimeIn ?? null)}</td>
						<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.amTimeOut ?? null)}</td>
						<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.pmTimeIn ?? null)}</td>
						<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.pmTimeOut ?? null)}</td>
					{/if}
```

Read-only is deliberate: an editable AM/PM input would be a second correction door with no
service-side writer, and would immediately contradict 1.3c. The `recalcHours` handler
(`+page.svelte:119`) is **not** wired to these cells and is not modified.

Also bump any hardcoded `colspan` on the "no rows" placeholder rows in both tables by 4 when
`data.showAmPm` — grep `colspan` in this file and fix each occurrence in the two affected tables.

## 1.6 `src/routes/(app)/attendance/export/+server.ts` — CSV columns

Current, team branch (`export/+server.ts:38-52`):

```ts
		rows = team.map((t) => ({
			Employee: t.name,
			…
			'Time In': fmtTime(t.day?.timeIn ?? null),
			'Time Out': fmtTime(t.day?.timeOut ?? null),
			'Regular Hrs': t.day ? num(t.day.regularHours) : '',
```

and the per-employee branch (`:75-86`):

```ts
		rows = days.map((d) => ({
			Date: manilaDayKey(d.date),
			Status: d.status,
			'Time In': fmtTime(d.timeIn),
			'Time Out': fmtTime(d.timeOut),
```

**Change:** add `import { isFoodServiceOrg } from '$lib/orgs'` and, above the branch,

```ts
	const showAmPm = isFoodServiceOrg(user.organizationId)
	// Spread into EVERY row: exportToCSV takes its header list from rows[0] only
	// (reports.ts:626), so a key present on some rows and absent on others silently drops
	// columns for the rest of the file.
	const amPmCols = (d: { amTimeIn: Date | null; amTimeOut: Date | null; pmTimeIn: Date | null; pmTimeOut: Date | null } | null | undefined) =>
		showAmPm
			? {
					'AM In': fmtTime(d?.amTimeIn ?? null),
					'AM Out': fmtTime(d?.amTimeOut ?? null),
					'PM In': fmtTime(d?.pmTimeIn ?? null),
					'PM Out': fmtTime(d?.pmTimeOut ?? null)
				}
			: {}
```

then `...amPmCols(t.day)` after `'Time Out'` in the team branch and `...amPmCols(d)` in the
per-employee branch. The helper must be called for **every** row including null days, so the key
set is uniform — this is the exact trap `exportToCSV` sets (`reports.ts:626`,
`const headers = Object.keys(rows[0])`).

`exportToCSV` itself is **not modified**; `FORMULA_PREFIX` (`reports.ts:622`) already neutralises
the write side, and `fmtTime` emits `HH:MM` or `''`, neither of which trips it.

## 1.7 Phase 1 tests

New file `tests/unit/attendance-am-pm-split.test.ts`, following the pure-function style of
`tests/unit/attendance-derive.test.ts:1-33` (the `T`/`p`/`derive` helpers, imported types, no
mocks needed — `derive.ts` is DB-free).

| # | Spec | Asserts |
|---|---|---|
| A1 | 08:00–11:00 + 13:00–17:00, `splitAmPm: true` | `amTimeIn` 08:00, `amTimeOut` 11:00, `pmTimeIn` 13:00, `pmTimeOut` 17:00; `timeIn` 08:00 and `timeOut` 17:00 **unchanged**; `workedHours` identical to the same call with `splitAmPm: false` |
| A2 | Same punches, `splitAmPm: false` (the Veent negative control, criterion 2 + 20) | all four AM/PM are `null`; the whole result object deep-equals the pre-change baseline |
| A3 | Three blocks 08:00–10:00, 10:20–12:00, 14:00–17:00 | picks the **14:00 gap (2h)**, not the 10:00 gap (20 min): `amTimeOut` 12:00, `pmTimeIn` 14:00 |
| A4 | Two blocks 08:00–12:00, 12:10–17:00 (10-min gap, below threshold) | all four `null`; `timeIn`/`timeOut` still 08:00/17:00 |
| A5 | AM complete + dangling PM IN: 08:00–11:00, IN 13:00, no OUT | `amTimeIn/Out` = 08:00/11:00, `pmTimeIn` 13:00, `pmTimeOut` `null`, `status` `INCOMPLETE` |
| A6 | Single punch IN only (criterion 5, partial day) | no throw; `status` `INCOMPLETE`; all four AM/PM `null` |
| A7 | Equal gaps 08:00–09:00, 10:00–11:00, 12:00–13:00 (both gaps 1h) | earliest wins: `amTimeOut` 09:00, `pmTimeIn` 10:00 — determinism |
| A8 | Invariant, over A1/A3/A5 | when `pmTimeOut` is non-null, `amTimeIn!.getTime() === timeIn!.getTime()` and `pmTimeOut!.getTime() === timeOut!.getTime()` |

New file `tests/unit/payroll-am-pm-days-of-work.test.ts` (criterion 3): feed the A1 punch set
through `deriveAttendanceDay` with `splitAmPm: true` and `false`, then through
`buildAttendanceInput`'s accumulator shape, asserting **one** day counted and identical
`regularHours` + `overtimeHours` for both flag values. Cross-check the totals against the
existing expectations in `tests/unit/payroll-attendance-split.test.ts`.

New file `tests/unit/hours-engine-parity-am-pm.test.ts` (criterion 4): feed the A1 punch set to
both `deriveAttendanceDay` (engine A) and `pairPunchesToDailyHours` (engine B, `timelog.ts:186`)
and assert the **documented** relationship rather than naive equality — B applies a fixed
12:00–13:00 lunch and an 08:00–17:00 OT window and ignores `WorkSchedule` (`timelog.ts:146-150`),
so with a punch set whose gap *is* 12:00–13:00 and a schedule of 08:00–17:00/60 min break, the
two **do not agree** — and the plan's "within 0.01 h" claim is wrong against live code.
**Measured in EXECUTE:** engine B pays **8.00 h** (its fixed 12:00–13:00 lunch overlaps no worked
time, because the employee is punched OUT across it); engine A pays **7.00 h** (an unpunched
inter-block gap is already outside the work segments, and `derive.ts` then deducts the schedule's
60-minute break a second time, because a schedule stores a duration and never a position). The
test therefore pins **A = B − scheduleBreak** and states the reason. This divergence predates
#162 — it applies to any day with two work segments — and is recorded, not fixed: changing either
engine moves real pesos and is outside this phase. Add a comment stating that this test pins the AM/PM case only
and that full engine unification is out of scope per the SPEC.

### Mutation checks — Phase 1

Every guard below must be manually mutated once, the test re-run, and the RED confirmed. Record
the result in the phase report.

| Guard | Mutation that must turn it RED | Test that must go red |
|---|---|---|
| Org gating | In `index.ts`, replace `isFoodServiceOrg(organizationId)` with `true` | A2 |
| Longest-gap rule | In `splitAmPmBlocks`, pick `gaps[0]` instead of the max | A3 |
| Minimum-gap threshold | Set `MIN_AM_PM_GAP_MS = 0` | A4 |
| Tie determinism | Change the scan comparison from `>` to `>=` | A7 |
| Display-only invariant | Subtract the AM/PM gap from `netWorkedMs` in `derive.ts` | A1 (`workedHours` equality) and `payroll-am-pm-days-of-work` |
| `emptyResult` clearing | Remove the four `null`s from `emptyResult()` | A6 |
| `timeIn`/`timeOut` meaning | Set `result.timeIn = amIn` | A8 |

**Vacuous-mock warning.** `derive.ts` needs no mocks, so Phase 1's unit tests are naturally
mutation-honest. Phase 2 and 3 do use `vi.mock('$lib/server/db')` — see the warning under §2.7.

## 1.8 Phase 1 blast radius — every reader of `AttendanceDay`, from the RESEARCH map §4

| Reader | Affected? | Why not |
|---|---|---|
| `attendance/input.ts` `accumulateDay():13`, `buildAttendanceInput():27`, segmented `:57` | No | Selects hour buckets and `date`; never `timeIn`/`timeOut`; new columns are additive and nullable |
| `payroll/calculator.ts:161, 165, 233-234, 242, 250-252, 332, 407` | No | Consumes the `buildAttendanceInput` output shape, not the row |
| `reports.ts:380 generateTardiness`, `:425 generateOvertime`, `:157 generateAttendance` | No | Read `lateMinutes` / `overtimeHours` / `status`; unchanged fields |
| `attendance/export/+server.ts:44-45`, `:78-79` | **YES** | Gains 4 conditional columns — §1.6 |
| `attendance/+page.svelte:516-532`, `:650-666` | **YES** | Gains 4 read-only cells — §1.5 |
| `dashboard.ts:158, 217, 239, 279, 359` | No | Counts and hour sums only |
| `api/v1/timesheets/[id]/punches/+server.ts:42` | No | Reads `TimeLog`, not `AttendanceDay` |
| `payroll/payslip-pdf.ts` | No | Reads the calculator output; "Days of Work" is a row count, and the row count is unchanged (D1) |
| `attendanceEntriesForRange` (`index.ts:344-362`) → `createTimesheetFromAttendance` | No | Maps `timeIn`/`timeOut`/hours to `TimesheetEntry`; AM/PM is deliberately **not** carried to `TimesheetEntry` (locked decision) |
| Prisma migration | **YES** | 4 nullable columns, no enum change |

Risk class: **schema change + payroll-adjacent**. Files changed: 6 (schema, derive.ts, index.ts,
+page.server.ts, +page.svelte, export/+server.ts) + 3 new test files.

## 1.9 Phase 1 gate

```bash
pnpm db:push && pnpm prisma generate
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: all four exit 0. `pnpm test` runs the 3 new files plus the existing
`attendance-derive`, `attendance-autoderive`, `attendance-correct-derive`,
`attendance-schedule-fallback`, `payroll-attendance-split`, `payroll-calculator`,
`payroll-mid-period` suites **unchanged and green** — that regression set is the real proof of
criterion 2. If any pre-existing attendance or payroll spec needs editing to pass, **stop**: the
change is not additive and Decision 1 has been violated.

## 1.10 Phase 1 rollback

Code: `git revert` the phase-1 commit(s) — the change is confined to 6 files and is purely
additive.
Schema: the four columns are nullable with no default and no reader outside §1.5/§1.6, so they
may be **left in place** after a code revert with zero effect. If they must go:
`ALTER TABLE attendance_days DROP COLUMN "amTimeIn", DROP COLUMN "amTimeOut", DROP COLUMN "pmTimeIn", DROP COLUMN "pmTimeOut";`
then revert the schema file and `pnpm prisma generate`. No data loss: nothing else writes them.

## 1.11 Amendment 1 — per-organization AM/PM gap threshold

**Added 17-08-26, AFTER the VALIDATE pass below, by direct user instruction.** Scope is Phase 1
only. Phases 2 and 3 are untouched.

### 1.11.0 What this reverses, and what it does not

SPEC Decision 4 said "reuse `isFoodServiceOrg()` as-is; no new `Organization` column." That
decision is **half superseded by direct user instruction dated 2026-08-17**:

| Concern | Before | After this amendment |
|---|---|---|
| Which orgs get the AM/PM split at all (**gating**) | `isFoodServiceOrg()` allowlist | **Unchanged** — still `isFoodServiceOrg()` |
| Where the boundary falls (**threshold**) | Hardcoded `MIN_AM_PM_GAP_MS = 30 min` | **New nullable `Organization` column**, NULL = use the built-in default |

The gate and the tuning knob are now two different mechanisms, deliberately. Adding a column
here does **not** re-open the `Organization.usesBranches` upgrade that `orgs.ts:16-18`
anticipates for gating — that seam stays closed. SPEC §Out Of Scope's line "A new `Organization`
column/flag for food-service gating is out of scope (Decision 4)" remains true as written,
because this column does no gating.

### 1.11.1 `prisma/schema.prisma` — `Organization`

Current (`schema.prisma:296-298`, verified):

```prisma
  // Master switch for schedule-based tardiness (#190). Off → no employee is ever marked LATE,
  // company-wide; ANDs with each WorkSchedule.trackTardiness. Default keeps current behavior.
  trackTardiness       Boolean  @default(true)
```

**Change:** add one nullable Int immediately after it, in the same voice.

```prisma
  trackTardiness       Boolean  @default(true)
  // Smallest gap between two work blocks that counts as the AM/PM boundary, in minutes (#162).
  // NULL → use the built-in default (DEFAULT_AM_PM_MIN_GAP_MINUTES in attendance/derive.ts).
  // Only read when the org is food-service (isFoodServiceOrg) — it is a tuning knob, never a
  // gate. Bounded 5–240 at every writer; a value outside that range cannot be stored.
  amPmMinGapMinutes    Int?
```

Additive, nullable, no default, no index, **no enum change** — so the plan's standing claim holds
and still no `scripts/migrate-*.ts` is required. Run the §Prisma Contract command sequence.

### 1.11.2 `derive.ts` — the constant becomes the default, the threshold becomes an argument

Three edits, all inside the amended §1.2:

**(a)** Rename and re-comment the constant. It is now a fallback, not a rule:

```ts
// #162 — DEFAULT smallest gap between two work blocks that counts as the AM/PM boundary.
// Overridable per organization via `Organization.amPmMinGapMinutes`; this value applies when
// that column is NULL. 30 minutes is the shortest real between-shift break at the food-service
// tenants. Below the threshold two adjacent segments are treated as one block interrupted by a
// quick re-punch (a phone double-tap, a corrected mis-punch), not a morning and an evening shift.
export const DEFAULT_AM_PM_MIN_GAP_MINUTES = 30
const DEFAULT_AM_PM_MIN_GAP_MS = DEFAULT_AM_PM_MIN_GAP_MINUTES * 60_000
```

`DEFAULT_AM_PM_MIN_GAP_MINUTES` is **exported** so the settings page can show the operator the
number that applies when the field is blank, without hardcoding `30` a second time.

**(b)** Add one optional field to `DeriveInput`, next to `splitAmPm`, in the `enforceTardiness`
voice (`derive.ts:56-61`):

```ts
	/**
	 * Per-organization AM/PM boundary threshold in milliseconds (#162). Undefined → the built-in
	 * DEFAULT_AM_PM_MIN_GAP_MS. The caller passes `Organization.amPmMinGapMinutes * 60_000`.
	 * A non-finite or non-positive value is treated as undefined: a bad number must fall back to
	 * a known-good default, never silently move every boundary in the tenant.
	 */
	amPmMinGapMs?: number
```

**(c)** `splitAmPmBlocks` takes the threshold as a **parameter**; it no longer closes over a
module constant. New signature:

```ts
function splitAmPmBlocks(
	segs: Array<[number, number]>,
	openWork: number | null,
	minGapMs: number
): { amIn: Date | null; amOut: Date | null; pmIn: Date | null; pmOut: Date | null }
```

Steps 3 and 4 of the §1.2c algorithm compare against `minGapMs` instead of `MIN_AM_PM_GAP_MS`.
Nothing else in the algorithm changes — the longest-gap rule, the earliest-tie rule, the
dangling-IN rule and the all-null fallback are all unchanged.

The call site in §1.2d becomes:

```ts
	if (input.splitAmPm) {
		// Defence in depth. Validation at the writer (§1.11.5) is the real gate, but a NaN or a
		// negative arriving here would silently re-split every day in the tenant, and the
		// resulting numbers look plausible. Fall back rather than propagate.
		const minGapMs =
			typeof input.amPmMinGapMs === 'number' &&
			Number.isFinite(input.amPmMinGapMs) &&
			input.amPmMinGapMs > 0
				? input.amPmMinGapMs
				: DEFAULT_AM_PM_MIN_GAP_MS
		const { amIn, amOut, pmIn, pmOut } = splitAmPmBlocks(workSegs, openWork, minGapMs)
		result.amTimeIn = amIn
		result.amTimeOut = amOut
		result.pmTimeIn = pmIn
		result.pmTimeOut = pmOut
	}
```

`derive.ts` still imports nothing, touches no DB, and knows nothing about organizations —
exactly the property §1.2 exists to preserve.

### 1.11.3 `attendance/index.ts` — two existing `select`s widened, zero new queries

**Both** call sites already fetch the org row for `trackTardiness`. Verified live:

`deriveRange`, current (`index.ts:170-175`):

```ts
	// Org master tardiness switch (#190). ANDs with the employee's effective schedule flag below.
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { trackTardiness: true }
	})
	const orgTracksTardiness = org?.trackTardiness ?? true
```

`correctDay`, current (`index.ts:436-442`):

```ts
			const org = await db.organization.findUnique({
				where: { id: organizationId },
				select: { trackTardiness: true }
			})
			const enforceTardiness =
				(org?.trackTardiness ?? true) &&
				(assigned ? assigned.trackTardiness : (defaultSchedule?.trackTardiness ?? true))
```

**Change, identical in both places:** add one key to the existing `select` and derive one more
local, in the exact shape of the `orgTracksTardiness` line beside it:

```ts
		select: { trackTardiness: true, amPmMinGapMinutes: true }
```

```ts
	// #162/Amendment 1: NULL → derive.ts's built-in default. Never a new query — this rides the
	// org row the tardiness switch already fetches.
	const amPmMinGapMs =
		org?.amPmMinGapMinutes != null ? org.amPmMinGapMinutes * 60_000 : undefined
```

`!= null` (loose) is deliberate and load-bearing: it catches both `null` and `undefined` while
letting a legitimate `0` through to the pure function's own guard, which then rejects it. `??`
would behave the same here but `!= null` states the intent at the read site.

Then `amPmMinGapMs` joins the `deriveAttendanceDay({ … })` argument object in `deriveRange`
(beside `splitAmPm`, §1.3b) and in `correctDay` (§1.3c).

In `deriveRange` the local is hoisted once per run, next to `orgTracksTardiness` at `:175` —
inside the employee loop it would be recomputed per employee for no reason.

### 1.11.4 `attendance/schedules.ts` — the writer

Add immediately after `setOrgTardiness` (`schedules.ts:76-85`), copying its shape exactly.

**Capability gate — stated after reading, not assumed:** `setOrgTardiness` carries **no**
capability check inside the service. The gate lives at the form action:
`settings/schedules/+page.server.ts:67` calls
`requireAnyCapability(locals.user!.roles, 'MANAGE_HR')`, and so do `load` (`:13`), `create`
(`:30`) and `toggleTardiness` (`:79`). Every entry point on that page is `MANAGE_HR`. The new
setter matches: **no in-service capability check, `MANAGE_HR` at the action.** It does not
invent a new capability, per SPEC §Out Of Scope.

```ts
/**
 * Set (or clear, with null) the org's AM/PM boundary threshold in minutes (#162/Amendment 1).
 * Null restores the built-in default. Bounds are enforced here as well as at the action, because
 * this is the only writer and a bad value silently re-splits every day in the tenant.
 */
export async function setOrgAmPmMinGap(
	organizationId: string,
	minutes: number | null,
	ctx: AuditContext
) {
	if (minutes !== null && !isValidAmPmMinGap(minutes))
		error(400, `The AM/PM gap must be a whole number of minutes between ${AM_PM_MIN_GAP_FLOOR} and ${AM_PM_MIN_GAP_CEILING}.`)

	await db.organization.update({
		where: { id: organizationId },
		data: { amPmMinGapMinutes: minutes }
	})
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'Organization',
		entityId: organizationId,
		newValue: { amPmMinGapMinutes: minutes }
	})
}
```

`organizationId` is always the session's own org (the action passes
`locals.user!.organizationId`), so `db.organization.update({ where: { id: organizationId } })`
is org-scoped by construction — the same argument that makes `setOrgTardiness` safe. The setter
must **never** accept an organization id from a form.

### 1.11.5 Validation — a trust boundary, not a formality

The value arrives from a form as a string. A `NaN`, a negative, a `0`, or `12.5` reaching
`splitAmPmBlocks` would silently change where **every** day in that tenant splits, and the
result looks plausible. There is no downstream check. So validation is the gate.

Put the shared rule in `derive.ts` next to the default, so the pure module owns the whole
concept and the action, the service and the tests all import one definition:

```ts
// Bounds for a per-organization AM/PM threshold (#162/Amendment 1).
export const AM_PM_MIN_GAP_FLOOR = 5
export const AM_PM_MIN_GAP_CEILING = 240

export function isValidAmPmMinGap(minutes: number): boolean {
	return (
		Number.isInteger(minutes) &&
		minutes >= AM_PM_MIN_GAP_FLOOR &&
		minutes <= AM_PM_MIN_GAP_CEILING
	)
}
```

**Why 5 and 240:**

- **Floor 5.** Below five minutes the threshold stops doing its job. A re-punch after a
  mis-punch, or a phone double-tap that lands two seconds apart, produces a sub-minute gap; a
  threshold of 1 would make that the "longest gap" on a quiet day and split a single morning
  block into a fake AM and a fake PM. Five minutes is the smallest value at which the constant
  still separates a real break from an input error. Zero and negatives are excluded by the same
  bound, which is what stops the silent-re-split failure.
- **Ceiling 240 (4 hours).** A gap longer than four hours inside one working day is not a
  between-shift break; it is two different days, or a forgotten clock-out — cases the existing
  `groupPunchesByDay` (`index.ts:70-84`) and `MAX_SHIFT_HOURS` (`timelog.ts:155`) already
  handle. Allowing 600 would mean an operator could set a threshold no real gap ever reaches,
  turning the AM/PM feature silently off with no error and no UI signal. Four hours is
  comfortably above the longest genuine split-shift break at these tenants and comfortably below
  "this can never fire". **Softened per A-P4:** 240 stops an operator setting 600; it does NOT
  eliminate the "silently off" mode. A tenant whose genuine split-shift break is three hours can
  set 240 and get no split, no error and no UI signal. Accepted residual, not a solved problem.
- Both bounds sit far inside a Postgres `Int`, so no overflow path exists.

**What an empty submission means: it clears the value back to NULL (the built-in default).**
Chosen over rejecting an empty field because the column is nullable and NULL is a *meaningful*
value here, not a missing one — "use the built-in default" is a state the operator must be able
to return to. If empty were rejected, the only way back to the default would be to type the
default's number, which means knowing it; the operator would be guessing, and a guess that is
off by one silently becomes a permanent override. The form therefore ships with the field
labelled "Leave blank to use the default (30 minutes)", rendered from the exported
`DEFAULT_AM_PM_MIN_GAP_MINUTES` rather than a literal.

**Action-level parse (`settings/schedules/+page.server.ts`)** — matches the manual-parse-plus-
`fail(400)` style of the file's existing actions rather than introducing zod into it:

```ts
	setAmPmMinGap: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		// Twin-door rule: the control is only RENDERED for food-service orgs, but a rendering
		// condition is not a gate — a direct POST bypasses it. 404, same as every other
		// food-service-only surface.
		requireFoodServiceOrg(locals.user!.organizationId)

		const raw = String((await request.formData()).get('minutes') ?? '').trim()
		// Empty clears back to NULL = the built-in default. See §1.11.5.
		let minutes: number | null = null
		if (raw !== '') {
			// Number('') is 0 and Number('12abc') is NaN — parse strictly, do not trust coercion.
			if (!/^\d+$/.test(raw)) return fail(400, { error: 'Enter a whole number of minutes.' })
			minutes = Number(raw)
			if (!isValidAmPmMinGap(minutes))
				return fail(400, {
					error: `The AM/PM gap must be between ${AM_PM_MIN_GAP_FLOOR} and ${AM_PM_MIN_GAP_CEILING} minutes.`
				})
		}
		try {
			await setOrgAmPmMinGap(locals.user!.organizationId, minutes, { /* ctx, as its siblings */ })
		} catch (e: unknown) {
			const err = e as { status?: number; body?: { message?: string } }
			if (err?.status) return fail(err.status, { error: err.body?.message ?? 'Update failed' })
			throw e
		}
		return { success: true }
	}
```

**Corrected per A-E2 — the earlier justification was overstated.** `isValidAmPmMinGap`'s
`Number.isInteger` plus the bounds check, not the regex, is what stands between a bad value and
the database: with the regex deleted, `12.5` is still rejected as non-integer, `1e3` and `abc`
are still rejected, and `-30` is still rejected. The regex's genuinely UNIQUE rejections are
`'1e2'`, `'0x1E'` and `'+45'` — each of which coerces to a valid IN-RANGE integer (100, 30, 45)
and would otherwise be silently accepted. **EXECUTE kept the regex and pinned exactly those three
in spec A16a**, so the guard has a mutation that can go red. Note ` ` (whitespace) is NOT one of
its cases: `.trim()` runs first, so a whitespace-only field takes the empty branch and clears the
column, which is correct.

### 1.11.6 UI — `/settings/schedules`

`load` currently (`settings/schedules/+page.server.ts:14-20`, verified):

```ts
	const [schedules, org] = await Promise.all([
		listSchedules(organizationId),
		db.organization.findUnique({ where: { id: organizationId }, select: { trackTardiness: true } })
	])
	// #190: the org master switch greys out the per-schedule toggles when it's off.
	return { schedules, orgTracksTardiness: org?.trackTardiness ?? true }
```

**Change:** widen the existing `select` (again, no new query) and return two more values:

```ts
		db.organization.findUnique({
			where: { id: organizationId },
			select: { trackTardiness: true, amPmMinGapMinutes: true }
		})
```

```ts
	return {
		schedules,
		orgTracksTardiness: org?.trackTardiness ?? true,
		// #162/Amendment 1 — the control renders only for food-service tenants. Cosmetic; the
		// action's requireFoodServiceOrg is the enforcement.
		showAmPmGap: isFoodServiceOrg(organizationId),
		amPmMinGapMinutes: org?.amPmMinGapMinutes ?? null,
		amPmMinGapDefault: DEFAULT_AM_PM_MIN_GAP_MINUTES
	}
```

`+page.svelte` — a new card **immediately below** the existing org-wide tardiness card
(`settings/schedules/+page.svelte:52-70`), matching its markup exactly: the same
`flex items-center justify-between gap-4 rounded-lg border p-4` wrapper, the same
`text-sm font-medium` title over `text-xs text-muted-foreground` explanation, the same
`<form method="POST" action="?/…" use:enhance>`. It takes a number input and a Save button
instead of a toggle, since the value is not boolean:

```svelte
{#if data.showAmPmGap}
	<!-- #162/Amendment 1: per-tenant AM/PM boundary. Food-service tenants only. -->
	<div class="flex items-center justify-between gap-4 rounded-lg border p-4">
		<div>
			<p class="text-sm font-medium">AM/PM split threshold</p>
			<p class="text-xs text-muted-foreground">
				The shortest break that separates a morning block from an evening block. Leave blank to
				use the default ({data.amPmMinGapDefault} minutes). Between 5 and 240.
			</p>
		</div>
		<form method="POST" action="?/setAmPmMinGap" use:enhance class="flex items-center gap-2">
			<input
				name="minutes"
				type="number"
				min="5"
				max="240"
				step="1"
				placeholder={String(data.amPmMinGapDefault)}
				value={data.amPmMinGapMinutes ?? ''}
				class="w-20 rounded-md border bg-background px-2 py-1 text-sm"
			/>
			<button type="submit" class="rounded-full px-3 py-1 text-xs font-medium bg-muted">Save</button>
		</form>
	</div>
{/if}
```

The `min`/`max`/`step` attributes are a convenience, **not** the validation — §1.11.5 is. State
that in a comment so nobody later deletes the server check because "the input already limits it."

### 1.11.7 Amendment tests

Add to `tests/unit/attendance-am-pm-split.test.ts` (pure, no mocks):

| # | Spec | Asserts |
|---|---|---|
| A9 | Two blocks with a 20-minute gap, `amPmMinGapMs: undefined` | all four AM/PM `null` — NULL falls back to the 30-minute default |
| A10 | Same punches, `amPmMinGapMs: 15 * 60_000` | **splits**: `amTimeOut` at the first block's end, `pmTimeIn` at the second's start |
| A11 | Same punches, `amPmMinGapMs: 30 * 60_000` | does **not** split — all four `null`. A10+A11 together are the whole point of the amendment: the same punches, two thresholds, two different answers |
| A12 | `amPmMinGapMs` of `NaN`, `-1`, `0`, `Infinity` | each falls back to the default and produces A9's answer — a bad number never reaches the comparison |
| A13 | Org scoping at the pure layer: same punch array, called twice with `15 min` and `30 min` | the two results differ, and neither call mutates the other's input — proves the threshold is per-call state, not module state |

New file `tests/unit/attendance-ampm-gap-setting.test.ts` — mocks `$lib/server/db` and
`$lib/server/audit`, tests `setOrgAmPmMinGap` and the `setAmPmMinGap` **action export**:

| # | Spec | Asserts |
|---|---|---|
| A14 | `isValidAmPmMinGap` unit table: `4, 5, 240, 241, 0, -5, 12.5, NaN, Infinity` | `false, true, true, false, false, false, false, false, false` |
| A15 | Action with `minutes: ''` | `setOrgAmPmMinGap` called with `null`; no `fail` — empty clears to the default |
| A16 | Action with `minutes: '4'`, `'241'`, `'-30'`, `'12.5'`, `'1e3'`, `'abc'` | each returns `fail(400)` with the bounds message and `organization.update` is **never** called |
| A17 | Action with `minutes: '45'` | `setOrgAmPmMinGap` called with `45`; `organization.update` receives `{ where: { id: <session org> }, data: { amPmMinGapMinutes: 45 } }` |
| A18 | Action for a user in `org_veent` | throws 404; `setOrgAmPmMinGap` never called (the twin-door gate) |
| A19 | Action with a form carrying `organizationId: 'org_sweetleaf'` while the session is `org_jojo` | the form field is ignored; the `update` `where.id` is `org_jojo` — one tenant cannot move another tenant's threshold |
| A20 | Audit | one `writeAuditLog`, `entityType: 'Organization'`, `newValue: { amPmMinGapMinutes: 45 }` |

**Mock discipline (mandatory).** The org-row mock must be a `mockImplementation` keyed on the
`where`/`select` shape, never a flat `mockResolvedValue`:

```ts
dbMock.organization.findUnique.mockImplementation(({ where, select }) =>
	Promise.resolve(
		where.id === 'org_jojo'
			? { ...(select.trackTardiness && { trackTardiness: true }),
			    ...(select.amPmMinGapMinutes && { amPmMinGapMinutes: 15 }) }
			: null
	)
)
```

**Rationale corrected per finding A-10.** The where/select-keyed mock is the right pattern, but it
does NOT protect A19: the `setAmPmMinGap` action never calls `findUnique`. A19 is honestly proved
by its `organization.update` `where.id` assertion. The place the keyed mock genuinely matters is
the `load` spec (A-E7), where a flat mock would hand Veent JoJo's stored threshold. Keep the rule,
for that reason. Reference `tests/unit/punch-access.test.ts:57-65` in a comment in the new file.

Also extend `tests/unit/attendance-autoderive.test.ts`-style coverage of `deriveRange` only if
that file already mocks the org `findUnique`; if it does not, do **not** add a mocked
`deriveRange` test — A9–A13 prove the rule and A14–A20 prove the plumbing, and a third mocked
layer would prove neither.

#### Mutation checks — Amendment 1

Each must be applied by hand, confirmed RED, and reverted.

| Guard | Mutation that must turn it RED | Test that must go red |
|---|---|---|
| NULL falls back to the default | In `index.ts`, replace `org?.amPmMinGapMinutes != null ? … : undefined` with `org?.amPmMinGapMinutes! * 60_000` (so NULL yields `NaN`) | A9 (via A12's fallback assertion) |
| The threshold is actually used | In `splitAmPmBlocks`, ignore the `minGapMs` parameter and compare against `DEFAULT_AM_PM_MIN_GAP_MS` | A10 |
| The threshold is not used *too* eagerly | Compare against `minGapMs / 2` | A11 |
| Non-finite fallback in `derive.ts` | Delete the `Number.isFinite` / `> 0` guard and pass `input.amPmMinGapMs` straight through | A12 |
| Per-call, not module, state | Cache the first `minGapMs` in a module-level `let` and reuse it | A13 |
| Bounds floor | Change `AM_PM_MIN_GAP_FLOOR` to `0` | A14, A16 |
| Bounds ceiling | Change `AM_PM_MIN_GAP_CEILING` to `100000` | A14, A16 |
| Integer-only parse | Delete the `/^\d+$/` test and rely on `Number(raw)` | A16 (`'12.5'` and `'1e3'` cases) |
| Empty means default | Make the empty branch `return fail(400, …)` instead of `minutes = null` | A15 |
| Service-layer bounds (second layer) | Delete the `isValidAmPmMinGap` check inside `setOrgAmPmMinGap` and call the service directly with `241` | A14's service case |
| Food-service twin door | Delete `requireFoodServiceOrg` from the **action** (leave the `{#if data.showAmPmGap}` render condition intact) | A18 |
| Org scoping | Read `organizationId` from the form instead of `locals.user!.organizationId` | A19 |

### 1.11.8 Twin doors — Amendment 1

| Guard | Its twin | Covered? |
|---|---|---|
| Food-service gate on the threshold control | The **render condition** (`{#if data.showAmPmGap}`) vs the **action** (`requireFoodServiceOrg`) | **Both.** The render condition is cosmetic; A18 pins the action. This is the same rule §2.6 applies to the import action — a load-only or render-only gate is bypassed by a direct POST. |
| Threshold is read by `deriveRange` | **`correctDay`** — the other `deriveAttendanceDay` caller | **Wired in both (§1.11.3), but NOT a covered twin (A-P1).** `correctDay` builds `punches` from at most one `timeIn` + one `timeOut` (`index.ts:460-462`), so `workSegs.length <= 1` and `openWork === null`, and `splitAmPmBlocks` returns all-null for EVERY threshold value. The wiring can never change an output. It is kept for symmetry — a future multi-pair correction form would need it — and is recorded as behaviourally dead rather than counted as proved. |
| Bounds validation at the action | **The service** (`setOrgAmPmMinGap`) | **Both, §1.11.4/§1.11.5.** The service is the only writer, so its check is what protects any future caller (a script, a seed, a second UI). |
| Bounds validation at the server | The `min`/`max`/`step` **HTML attributes** | Attributes are convenience only, explicitly commented as such. The server check is the gate. |
| Every writer of `Organization.amPmMinGapMinutes` | — | **Exactly one:** `setOrgAmPmMinGap`. Confirmed by construction — the column is new, so no pre-existing writer can exist. `prisma/seed.ts` and `scripts/seed-*.ts` do not set it; they will leave NULL, which is the correct default. |

### 1.11.9 Blast-radius delta (beyond the §1.8 Phase 1 list)

| Surface | New in this amendment? | Why |
|---|---|---|
| `prisma/schema.prisma` `Organization` | **YES** | 1 nullable `Int`. `organizations` is a **populated** table (3 tenants) — but this is a catalog-only `ADD COLUMN` with no default and no index, so it takes a brief lock and rewrites nothing. It does **not** worsen contract finding P8, which is about the unique **index** on `time_logs` in Phase 2. |
| `derive.ts` | Widened | Was already in scope; now also exports `DEFAULT_AM_PM_MIN_GAP_MINUTES`, `AM_PM_MIN_GAP_FLOOR`, `AM_PM_MIN_GAP_CEILING`, `isValidAmPmMinGap` |
| `attendance/index.ts` | Widened | Two existing `select`s + two locals. **Zero new queries** — verified at `:171-174` and `:436-439`. |
| `attendance/schedules.ts` | **YES — new file in the blast radius** | 1 new exported setter |
| `settings/schedules/+page.server.ts` | **YES — new file in the blast radius** | `load` select + 3 returned values + 1 action |
| `settings/schedules/+page.svelte` | **YES — new file in the blast radius** | 1 new card |
| `tests/unit/attendance-am-pm-split.test.ts` | Widened | A9–A13 |
| `tests/unit/attendance-ampm-gap-setting.test.ts` | **YES — new** | A14–A20 |
| Attendance page / CSV export / payroll / reports / dashboard | **No** | The threshold changes *where* the split lands, never *whether* AM/PM reaches payroll. The display-only property (D2) is untouched. |
| Phase 2, Phase 3 | **No** | Explicitly out of this amendment's scope |

**Delta: +3 source files, +1 test file, +1 nullable column.** Phase 1 goes from 6 modified
source files to **9**, and from 3 new test files to **4**.

### 1.11.10 Amendment rollback

Independent of the rest of Phase 1, and cheaper:

1. Code: revert the amendment commit. `derive.ts` falls back to the module constant; the two
   `select`s narrow; the setter, action and card disappear.
2. Data: **nothing to migrate.** Every row is NULL unless an operator typed a value, and NULL
   already means "use the default" — so a code-only revert restores the pre-amendment behaviour
   for every tenant regardless of column contents.
3. Schema (optional, and safe to skip): `ALTER TABLE organizations DROP COLUMN "amPmMinGapMinutes";`
   then revert the schema file and `pnpm prisma generate`.
4. To disable **just** the feature without a code change: `UPDATE organizations SET "amPmMinGapMinutes" = NULL;` — every org returns to the 30-minute default immediately, no deploy.

### 1.11.11 Manual test — M1b (run straight after M1)

M1 already planted four punches for `JJ-0001` on 2026-08-10 at PHT 08:00 / 11:00 / 13:00 / 17:00.
That day's gap is 2 hours, far above any threshold in range, so it cannot demonstrate the knob.
Plant a **second** marker day whose gap straddles the bounds:

```bash
# NOTE (EXECUTE, verified live): only TABLE names are @@map'd in this schema — the COLUMNS are
# camelCase and must be double-quoted in psql. The snake_case spellings this script originally
# carried (`employee_number`, `am_time_in`, `am_pm_min_gap_minutes`) do not exist.
EMP=$(docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -tAc \
  "select id from employees where \"employeeNumber\"='JJ-0001'")
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"insert into time_logs (id,\"employeeId\",\"punchType\",source,timestamp,\"createdAt\") values
 ('mtest-gap-1','$EMP','IN','MANUAL','2026-08-18 00:00:00+00',now()),
 ('mtest-gap-2','$EMP','OUT','MANUAL','2026-08-18 03:00:00+00',now()),
 ('mtest-gap-3','$EMP','IN','MANUAL','2026-08-18 03:20:00+00',now()),
 ('mtest-gap-4','$EMP','OUT','MANUAL','2026-08-18 09:00:00+00',now());"
```

UTC times = PHT 08:00, 11:00, **11:20**, 17:00 — a **20-minute** gap, deliberately between the
5-minute floor and the 30-minute default.

1. As JoJo HR, open `/attendance`, select `JJ-0001`, cover 2026-08-18, click **Refresh**.
2. **Assert positively:** the 2026-08-18 row shows **In 08:00** and **Out 17:00**, and all four
   AM/PM cells render the empty-time placeholder — the 20-minute gap is below the 30-minute
   default, so there is deliberately no split. Confirm on disk:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select \"timeIn\", \"timeOut\", \"amTimeIn\", \"pmTimeIn\" from attendance_days
 where \"employeeId\"='$EMP' and date='2026-08-18';"
```

Expect `time_in` and `time_out` non-null, `am_time_in` and `pm_time_in` **NULL**.

3. Open `/settings/schedules`. **Assert positively:** a card titled **"AM/PM split threshold"**
   is present, its number input is **empty**, and its placeholder reads **30**.
4. Type **15** into that input and click its **Save** button.
5. **Assert positively:** the page reloads and the input now shows **15** (not the placeholder).
   Confirm the write and the audit row:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select \"amPmMinGapMinutes\" from organizations where id='org_jojo';"
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select action, \"entityType\", \"newValue\" from audit_logs
 where \"entityType\"='Organization' and \"entityId\"='org_jojo'
 order by \"createdAt\" desc limit 1;"
```

Expect `15`, and an `UPDATE` / `Organization` row whose `new_value` is
`{"amPmMinGapMinutes": 15}`.

6. Back on `/attendance`, click **Refresh** for the same range.
7. **Assert positively — this is the whole amendment:** the **same** 2026-08-18 row now shows
   **AM In 08:00, AM Out 11:00, PM In 11:20, PM Out 17:00**, while **In** still reads 08:00 and
   **Out** still reads 17:00. The split moved because the setting moved, and nothing else did.

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select \"amTimeIn\", \"amTimeOut\", \"pmTimeIn\", \"pmTimeOut\", \"workedHours\" from attendance_days
 where \"employeeId\"='$EMP' and date='2026-08-18';"
```

Expect four non-null timestamps — and `worked_hours` **identical to the value recorded at step
2**. If worked hours moved, D2 (display-only) has been broken: stop and escalate.

8. **Bounds, positively asserted.** Type **4** into the field and click **Save**.
   **Assert positively:** an error message appears reading
   *"The AM/PM gap must be between 5 and 240 minutes."* and the stored value is still 15:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select \"amPmMinGapMinutes\" from organizations where id='org_jojo';"
```

Expect **15**, unchanged. Repeat with **241** and **-5**; same assertion each time.

9. **Empty clears to the default.** Clear the field and click **Save**.
   **Assert positively:** the input shows the **30** placeholder again, the DB column is
   **NULL**, and a Refresh returns the 2026-08-18 row to no-split (all four AM/PM NULL) —
   the step-2 state exactly.
10. **Cross-tenant negative control.** As **Sweetleaf** HR, open `/settings/schedules`.
    **Assert positively:** the "AM/PM split threshold" card is present with an **empty** input
    and a **30** placeholder — JoJo's setting did not follow. Then as **Veent** HR, open the same
    page and **assert positively** that the page renders its Work Schedules heading and the
    org-wide tardiness card, and that the string "AM/PM split threshold" is **absent**. Confirm
    the door is really shut, not just hidden:

```bash
curl -s -b /tmp/jar2.txt -o /dev/null -w '%{http_code}\n' \
  -X POST 'http://localhost:5173/settings/schedules?/setAmPmMinGap' \
  -F 'minutes=45'
```

Expect **404** for the Veent jar.

Cleanup: add `or id like 'mtest-gap-%'` to the M-script cleanup delete, and
`UPDATE organizations SET "amPmMinGapMinutes" = NULL WHERE id = 'org_jojo';`.


---

# PHASE 2 — #200 CSV backlog import

**Depends on Phase 1** being green: imported punches materialise through `deriveRange`, so the
AM/PM columns must already exist for a backlog row's PM block to be visible.

## 2.1 Dependency

```bash
pnpm add papaparse
pnpm add -D @types/papaparse
```

Justification for the record (SPEC "no new production dependency without justification"):
`papaparse` is ~45 kB, zero runtime sub-dependencies, and correctly handles quoted fields,
embedded newlines inside quotes, CRLF, and a UTF-8 BOM — all four of which a hand-rolled split
gets wrong and all four of which appear in real HR exports. The repo's own CSV *writer*
(`reports.ts:624-648`) emits quoted fields and `\r\n`, so a re-imported export would break a
naive parser immediately.

## 2.2 `prisma/schema.prisma` — `TimeLog.dedupKey`

Current:

```prisma
model TimeLog {
  id               String      @id @default(cuid())
  employeeId       String
  punchType        PunchType
  source           PunchSource @default(DISCORD)
  timestamp        DateTime    @db.Timestamptz(3)
  discordMessageId String?
  note             String?
  timesheetId      String?
  createdAt        DateTime    @default(now())
  …
  @@unique([discordMessageId, employeeId])
  @@index([employeeId, timestamp])
```

**Change:** add one nullable column after `discordMessageId` and one unique index.

```prisma
  discordMessageId String?
  // #200/#177 — deterministic idempotency key for punches that have no Discord message to key
  // on. `backlog:<employeeNumber>:<YYYY-MM-DD>:<slot>` for a CSV import row, and
  // `web:<employeeId>:<YYYY-MM-DDTHH:mm>` for a web punch (#177). Null for every Discord punch,
  // which keeps using discordMessageId. Same two-layer defence as #99: an app-level bulk
  // pre-check for a clean message, plus this constraint to close the concurrent race.
  dedupKey         String?
```

and, beside the existing unique:

```prisma
  @@unique([dedupKey, employeeId])
```

`db push` adds a nullable column and a unique index over it. Postgres treats `NULL` as distinct,
so the millions of existing Discord rows with `dedupKey = NULL` do not collide — identical to how
`@@unique([discordMessageId, employeeId])` already tolerates null message ids. Run the Prisma
command sequence.

## 2.3 New file — `src/lib/server/services/attendance/import.ts`

### 2.3a CSV contract

Header row required, case-insensitive, exactly these six columns in any order:

```
employeeNumber,date,amIn,amOut,pmIn,pmOut
```

- `employeeNumber` — matches `Employee.employeeNumber` within the uploader's org.
- `date` — `YYYY-MM-DD`, interpreted as a PHT day.
- `amIn`/`amOut`/`pmIn`/`pmOut` — `HH:MM` 24-hour, PHT, each optional but `amIn` required.
  Each non-empty cell becomes one `TimeLog` row: `amIn`/`pmIn` → `IN`, `amOut`/`pmOut` → `OUT`,
  timestamp `new Date(\`${date}T${hhmm}:00+08:00\`)` — the identical construction the existing
  `correct` action uses (`attendance/+page.server.ts:190-191`).

### 2.3b Caps (all enforced before any DB read)

```ts
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 // 2 MB — ~40k rows of this shape
export const MAX_IMPORT_ROWS = 2000             // one HR batch; keeps the bulk queries bounded
```

`MAX_IMPORT_BYTES` deliberately does **not** reuse `MAX_UPLOAD_BYTES` (10 MB, `storage.ts:11`) —
that ceiling is sized for PDFs and images that hit disk. This file never hits disk.

### 2.3c Read-side formula-injection defence

`reports.ts:622`'s `FORMULA_PREFIX` protects what this app *writes*. Nothing protects what it
*reads*. Add the mirror:

```ts
// Mirror of reports.ts:622's write-side defence, on the read side. A cell arriving as
// `=cmd|'/c calc'!A1` or `\t=HYPERLINK(...)` (the neutralised form our own exporter emits) is
// rejected rather than coerced: none of our six columns can legitimately start with one of
// these characters, so a match means the file is either hostile or a round-tripped export whose
// tab we must strip before parsing.
const FORMULA_PREFIX = /^[=+\-@]/

function sanitizeCell(raw: string): { value: string } | { reject: string } {
	const value = raw.replace(/^\t+/, '').trim()   // strip our own exporter's neutraliser
	if (FORMULA_PREFIX.test(value)) return { reject: 'cell looks like a spreadsheet formula' }
	return { value }
}
```

Also strip a leading UTF-8 BOM (`﻿`) from the decoded text before parsing, and reject the
whole file if the decoded text contains a NUL byte (`\u0000`) — that is the cheap, dependency-free
signal that an XLSX or other binary was renamed to `.csv`.

### 2.3d Exported functions

```ts
/** Pure: text → validated rows + per-row rejections. No DB. Exported for unit testing. */
export function parseBacklogCsv(text: string): {
	rows: BacklogRow[]
	rejected: { line: number; reason: string }[]
}

/** The write path. MANAGE_HR + food-service gating is the CALLER's job (form action). */
export async function importBacklog(
	organizationId: string,
	file: { name: string; size: number; text: string },
	ctx: AuditContext
): Promise<ImportResult>
```

`ImportResult` = `{ applied: number; skippedDuplicate: number; rejected: { line: number; employeeNumber: string; date: string; reason: string }[]; punchesWritten: number }`.

### 2.3e `importBacklog` order of operations — bulk, never per-row round trips

1. `if (file.size > MAX_IMPORT_BYTES) error(413, 'Backlog file exceeds the 2 MB limit')`.
2. `if (!file.name.toLowerCase().endsWith('.csv')) error(415, 'Only .csv files are accepted')`.
3. `parseBacklogCsv(file.text)` → `rows`, `rejected`. If `rows.length + rejected.length > MAX_IMPORT_ROWS`
   → `error(400, …)`. If `rows.length === 0` → `error(400, 'No usable rows in this file')`.
4. **One** employee query:
   `db.employee.findMany({ where: { employeeNumber: { in: [...uniqueNumbers] }, user: { organizationId }, employmentStatus: 'ACTIVE' }, select: { id: true, employeeNumber: true } })`.
   Note the scoping goes through the `user` relation, matching every other org-scoped employee
   read in `attendance/index.ts` (`:114`, `:149`). Unresolved numbers → rejected with
   `employee number not found in your organization`.
5. **One** attendance query for the lock guard:
   `db.attendanceDay.findMany({ where: { employeeId: { in: employeeIds }, date: { in: dates } }, select: { employeeId: true, date: true, isLocked: true, manuallyEdited: true } })`.
   Any row with `isLocked` → reject `this day is locked`; `manuallyEdited` → reject
   `this day was hand-corrected by HR`. **Reject before writing any `TimeLog`** — see the
   twin-door note in §2.6.
6. Build the punch list: for each surviving row, up to 4 `{ employeeId, punchType, timestamp, dedupKey, source: 'MANUAL', note }` records. `dedupKey = \`backlog:${employeeNumber}:${date}:${slot}\``.
7. **One** duplicate query:
   `db.timeLog.findMany({ where: { dedupKey: { in: allKeys } }, select: { dedupKey: true } })` →
   a `Set`. Punches whose key is present are dropped; a row all of whose punches are dropped
   counts as `skippedDuplicate`.
8. `db.$transaction` containing `tx.timeLog.createMany({ data: punches, skipDuplicates: true })`
   and the audit write with the tx client (`writeAuditLog(ctx, payload, tx)` — the third
   parameter exists exactly for this, `audit.ts:20-26`). `skipDuplicates: true` is the second
   layer: it absorbs a concurrent double-submit that raced past step 7, the same role `P2002`
   plays at `timelog.ts:81`.
9. **After** the transaction, call `deriveRange(organizationId, { from: minDate, to: maxDate }, ctx)`
   so the days materialise through the one authoritative engine. `deriveRange` independently
   skips locked (`index.ts:249`) and hand-edited (`:251`) days — the guard is now doubled.
   Guard the span: if `maxDate - minDate > 62 days`, reject the file up front with the same
   2-month message the page actions use (`+page.server.ts:146-148`), so one upload cannot
   trigger an unbounded derive.
10. Return `ImportResult`.

Audit payload (one summary row, matching the range-operation shape at `index.ts:298-303`):

```ts
{
	action: 'CREATE',
	entityType: 'AttendanceDay',
	entityId: organizationId,
	newValue: {
		source: 'backlog_csv',
		fileName: file.name,
		rowsParsed, applied, skippedDuplicate,
		rejected: rejected.length,
		// bounded so one bad file cannot write a megabyte of JSON into the audit row
		rejectedSample: rejected.slice(0, 20)
	}
}
```

## 2.4 Form action — `src/routes/(app)/attendance/+page.server.ts`

Add to the existing `actions` object (which ends at `+page.server.ts:314`), styled like its
siblings:

```ts
	// #200 — CSV backlog upload. Same actor boundary as every other attendance write
	// (MANAGE_HR), plus the food-service gate: for Veent this route genuinely does not exist.
	importBacklog: async (event) => {
		requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')
		requireFoodServiceOrg(event.locals.user!.organizationId)
		const form = await event.request.formData()
		const file = form.get('backlog')
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { error: 'Choose a CSV file to upload.' })
		try {
			const res = await importBacklogCsv(
				event.locals.user!.organizationId,
				{ name: file.name, size: file.size, text: await file.text() },
				ctxOf(event)
			)
			return { imported: res }
		} catch (e) {
			return toFail(e)
		}
	}
```

`requireFoodServiceOrg` is imported from `$lib/server/rbac` (it exists at `rbac.ts:19-21` and
already throws 404 — reuse, do not re-implement). `toFail` (`+page.server.ts:131-136`) currently
maps 400/404/409; **extend its allow-list to include 413 and 415** so the size and type errors
surface as a form message instead of a 500:

```ts
	if (err?.status && [400, 404, 409, 413, 415].includes(err.status))
```

UI: a small `<form method="POST" action="?/importBacklog" enctype="multipart/form-data">` with
`<input type="file" name="backlog" accept=".csv,text/csv">` and a submit button labelled
**"Import backlog CSV"**, rendered only `{#if data.canManage && data.showAmPm}`, placed beside
the existing Refresh/Lock controls. Render `form.imported` as a summary line: `"Applied N rows,
skipped M duplicates, rejected K rows"` plus a `<details>` list of the rejection reasons.

## 2.5 Phase 2 tests

New `tests/unit/attendance-backlog-parse.test.ts` — pure, no mocks (`parseBacklogCsv` only):

| # | Spec | Asserts |
|---|---|---|
| B1 | Well-formed 3-row file with quoted fields, CRLF, and a BOM | 3 rows parsed, 0 rejected, times correct in PHT |
| B2 | Row with `=HYPERLINK("http://x")` in `employeeNumber` | rejected, reason `cell looks like a spreadsheet formula`, **nothing else in the file is dropped** |
| B3 | Row with `\t=cmd` (our own exporter's neutralised form) | rejected — the tab is stripped before the prefix test |
| B4 | Missing `amIn`, bad date, bad `HH:MM`, unknown extra column | each rejected with its own reason and line number |
| B5 | Text containing `` | whole file rejected |

New `tests/unit/attendance-backlog-import.test.ts` — mocks `$lib/server/db`, `$lib/server/audit`,
and `./index` (for `deriveRange`), following the `vi.hoisted` + per-model-method mock shape of
`tests/unit/punch-access.test.ts:17-27`:

| # | Spec | Asserts (criterion) |
|---|---|---|
| B6 | Happy path, 2 rows × 4 punches | `timeLog.createMany` called **once** with 8 records, each `source: 'MANUAL'` and a `backlog:` `dedupKey`; `deriveRange` called once (13) |
| B7 | One `employeeNumber` not in the org | that row rejected with `not found in your organization`; the **other** row still applied; the rejected employee's id never appears in `createMany` (14) |
| B8 | Target day has `isLocked: true` | row rejected; `createMany` receives **zero** records for that employee/date (15) |
| B9 | Target day has `manuallyEdited: true` | same as B8 with the hand-corrected reason (15) |
| B10 | Re-upload: `timeLog.findMany` returns all 8 keys | `createMany` called with `[]` or not called; `skippedDuplicate` = 2; **no** duplicate write (16) |
| B11 | Audit | exactly one `writeAuditLog` call, `entityType: 'AttendanceDay'`, `newValue.source === 'backlog_csv'`, counts correct, `rejectedSample` length ≤ 20 (17) |
| B12 | Bulk-query discipline | across a 50-row file, `employee.findMany` called **once**, `attendanceDay.findMany` **once**, `timeLog.findMany` **once** (performance guard) |

New `tests/unit/attendance-backlog-rbac.test.ts` — imports the `actions` **export** from
`+page.server.ts` (not the handler body — the repo has been burned by asserting on the wrong
thing here; see the #290 note in the project memory) and asserts:

| # | Spec | Asserts (criterion) |
|---|---|---|
| B13 | Role without `MANAGE_HR` (e.g. `EMPLOYEE`) | throws 403; `importBacklogCsv` never called (18) |
| B14 | `HR_ADMIN` in a **non**-food-service org (`org_veent`) | throws 404; `importBacklogCsv` never called (18, 20 — the negative control) |
| B15 | `HR_ADMIN` in `org_jojo` | reaches `importBacklogCsv` (18) |
| B16 | Oversize file / non-`.csv` name | `fail` with 413 / 415 message, no DB write (19) |

### Mutation checks — Phase 2

| Guard | Mutation that must turn it RED | Test |
|---|---|---|
| Lock refusal | Delete the `isLocked` branch in step 5 | B8 |
| Manual-edit refusal | Delete the `manuallyEdited` branch | B9 |
| Duplicate collapse | Skip step 7's `Set` filter | B10 |
| DB-level dedup backstop | Remove `skipDuplicates: true` **and** the unique index | (integration; assert the `P2002` path in B10's variant) |
| Org gating | Delete `requireFoodServiceOrg` from the action | B14 |
| Capability gating | Delete `requireAnyCapability` from the action | B13 |
| Employee org scoping | Drop `user: { organizationId }` from the step-4 `where` | B7 |
| Formula rejection | Delete `sanitizeCell`'s prefix test | B2 |
| Row/size caps | Raise `MAX_IMPORT_BYTES` / `MAX_IMPORT_ROWS` past the fixture | B16 |

**Vacuous-mock warning — read before writing B7/B8/B12.** A flat
`dbMock.employee.findMany.mockResolvedValue([{ id: 'e1', employeeNumber: 'JJ-001' }])` returns
that row **for every query shape**, which makes "the stranger was not resolved" pass even when
the `organizationId` scoping has been deleted. Use `mockImplementation(({ where }) => …)` and
branch on the `where` shape — exactly the technique `punch-access.test.ts:57-65` documents in its
own comment ("Discriminate on the where-shape, not call order"). The same applies to
`attendanceDay.findMany` in B8: return the locked row only when the queried `date` matches.

## 2.6 Twin-door analysis — Phase 2

This repo has six recorded cases of a guard added to one door while its twin stayed open. Named
explicitly:

| Guard | Its twin | Is the twin covered? |
|---|---|---|
| Import refuses locked days | **The `correct` form action** (`+page.server.ts:182`) → `correctDay` refuses locked at `index.ts:417` | **Yes, pre-existing.** |
| Import refuses locked days | **`deriveRange`** (`index.ts:249`) | **Yes, pre-existing** — and step 9 runs through it, so the guard is doubled. |
| Import refuses locked days | **The web punch (Phase 3)** | **Deliberately different, documented.** A live web punch on a locked day *does* write a `TimeLog` — `TimeLog` is an append-only event log and a locked `AttendanceDay` is what is protected. `deriveRange` then ignores the day. This is already true of every Discord punch today, so Phase 3 introduces no new asymmetry. The import is stricter *on purpose*: a backlog row that wrote punches into a locked day would silently resurrect on the next unlock, which is exactly the "quietly undo real work" failure the SPEC forbids. Assert this asymmetry in B8's comment so a future reader does not "fix" it. |
| Import refuses `manuallyEdited` days | `deriveRange:251`, `resetDayToDerived` clears the flag | **Yes.** |
| Food-service org gate | `load` vs the **form action** | **Both must gate.** A `load`-only gate is bypassed by a direct POST. §2.4 gates the action; the UI visibility (`data.showAmPm`) is cosmetic only. |
| Food-service org gate | The **CSV export** and the **attendance page** (Phase 1 §1.5/§1.6) | Those are read surfaces showing null columns to a non-food-service org — no gate needed, but they are flagged off anyway. |
| `MANAGE_HR` boundary | Every sibling attendance action (`derive`, `correct`, `lock`, `deriveTeam`, `lockTeam` — all `MANAGE_HR`) | **Consistent.** Import is a write of the same class, so `MANAGE_HR` is the right door, not `OVERRIDE_FINALIZED`. |

**Every writer of the state each guard reads:** `isLocked` is written only by `lockRange`
(`index.ts:568`) and `unlockRange` (`:597`). `manuallyEdited` is written only by `correctDay`
(`:501`, sets true) and `resetDayToDerived` (`:538`, sets false). `TimeLog` is written by
`recordPunch` (`timelog.ts:69`), `aggregateTimeLogsToTimesheet` (`:294`, stamps `timesheetId`
only), `scripts/seed-punches-demo.ts:161`, and — new — `importBacklog`. That is the complete set
from the RESEARCH map §3; no fourth writer exists.

## 2.7 Phase 2 blast radius

| Surface | Affected? | Why |
|---|---|---|
| `prisma/schema.prisma` `TimeLog` | **YES** | 1 nullable column + 1 unique index |
| `package.json` / lockfile | **YES** | `papaparse` + `@types/papaparse` |
| `attendance/+page.server.ts` | **YES** | 1 new action, `toFail` allow-list widened |
| `attendance/+page.svelte` | **YES** | 1 upload form + result summary |
| new `attendance/import.ts` | **YES** | new file |
| `recordPunch` (`timelog.ts:26`) | No | Import writes via `createMany`, not `recordPunch` — deliberately, because the Discord path's `previous`-punch read and per-punch audit are wrong for a 2000-row batch |
| `@@unique([discordMessageId, employeeId])` | No | Untouched; `dedupKey` is a separate index |
| `pairPunchesToDailyHours` / `previewTimeLogAggregation` / `aggregateTimeLogsToTimesheet` | **Indirectly** | They read `TimeLog` rows and will now see `MANUAL`-sourced backlog punches. This is **correct and intended** — a backlog punch is a real punch. No code change; note it in the phase report. |
| `api/v1/timesheets/[id]/punches` | **Indirectly** | Will list backlog punches. Already gated by `canTouchEmployee`. No change. |
| `storage.ts`, `sniffMime`, `ALLOWED_MIME` | **No — explicitly** | The CSV never hits disk |
| `reports.ts` `exportToCSV` | No | Write side unchanged |

Risk class: **schema change + new dependency + new write path**. Files changed: 4 + 1 new
service + 3 new test files.

## 2.8 Phase 2 gate

```bash
pnpm db:push && pnpm prisma generate
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

All four exit 0, and `tests/unit/timelog-aggregate.test.ts` must still be green untouched.

## 2.9 Phase 2 rollback

Code: revert the phase-2 commits; `pnpm remove papaparse @types/papaparse`.
Data: backlog punches are identifiable and reversible —
`DELETE FROM time_logs WHERE dedup_key LIKE 'backlog:%';` then re-run Refresh on the affected
range to re-derive. The audit summary row is retained deliberately.
Schema: `ALTER TABLE time_logs DROP COLUMN dedup_key;` (drops the unique index with it). Do this
**only** after Phase 3 is also reverted — Phase 3 shares the column.

---

# PHASE 3 — #177 web punch with location

**Depends on Phase 2** for `TimeLog.dedupKey`, which the web punch reuses as its debounce key.

## 3.1 `prisma/schema.prisma` — `TimeLog` location columns

**Change:** add four nullable columns after `dedupKey`.

```prisma
  // #177 — captured from navigator.geolocation at the moment of a WEB punch, and only there.
  // Null for every DISCORD and MANUAL punch by construction. Sensitive personal data: it is
  // readable ONLY through GET /api/v1/timesheets/:employeeId/punches, which is already gated by
  // `canTouchEmployee` (owner, their manager, branch manager, org HR). Retention follows the
  // TimeLog row itself — no separate purge window (Decision 5).
  latitude          Float?
  longitude         Float?
  locationAccuracyM Float?
  locationCapturedAt DateTime?
```

`Float?` (Postgres `double precision`) rather than `Decimal`: these are never money and never
summed, so the `Decimal`-serialization hook in `src/hooks.ts` does not need to know about them.
Run the Prisma command sequence.

## 3.2 `src/lib/server/services/timelog.ts` — refactor `recordPunch`

Current signature (`timelog.ts:26-44`):

```ts
export async function recordPunch(
	input: {
		discordId: string
		punchType: 'IN' | 'OUT'
		timestamp: Date
		discordMessageId?: string
		source?: PunchSource
	},
	meta?: { ipAddress?: string }
) {
	const employee = await db.employee.findUnique({
		where: { discordId: input.discordId },
		include: { user: { select: { id: true, roles: true, isActive: true } } }
	})

	if (!employee || !employee.user.isActive || employee.employmentStatus !== 'ACTIVE') {
		error(404, 'No active employee is linked to this Discord account')
	}
```

**Change — only employee resolution and the dedup key vary.** Widen the input to a discriminated
resolution and add the two new optional groups:

```ts
export async function recordPunch(
	input: {
		/** Exactly one of these two. Discord resolves by discordId; the web punch resolves by the
		 *  session's own employee id, which the caller has already derived from locals.user. */
		discordId?: string
		employeeId?: string
		punchType: 'IN' | 'OUT'
		timestamp: Date
		discordMessageId?: string
		/** #200/#177 idempotency key for punches with no Discord message. See TimeLog.dedupKey. */
		dedupKey?: string
		source?: PunchSource
		location?: { latitude: number; longitude: number; accuracyM?: number } | null
	},
	meta?: { ipAddress?: string }
)
```

Body changes, in order:

1. Replace the `findUnique` with a branch:

```ts
	const employee = input.employeeId
		? await db.employee.findUnique({
				where: { id: input.employeeId },
				include: { user: { select: { id: true, roles: true, isActive: true } } }
			})
		: await db.employee.findUnique({
				where: { discordId: input.discordId! },
				include: { user: { select: { id: true, roles: true, isActive: true } } }
			})

	if (!employee || !employee.user.isActive || employee.employmentStatus !== 'ACTIVE') {
		error(404, input.employeeId
			? 'No active employee record is linked to this account'
			: 'No active employee is linked to this Discord account')
	}
```

2. Generalise the pre-check at `timelog.ts:59-65`. It currently keys only on
   `discordMessageId`; extend it to also cover `dedupKey`, preserving the existing comment:

```ts
	if (input.discordMessageId || input.dedupKey) {
		const duplicate = await db.timeLog.findFirst({
			where: {
				employeeId: employee.id,
				...(input.discordMessageId
					? { discordMessageId: input.discordMessageId }
					: { dedupKey: input.dedupKey })
			},
			select: { id: true }
		})
		if (duplicate) error(409, 'This punch has already been recorded')
	}
```

3. Extend the `create` (`timelog.ts:69-77`):

```ts
			data: {
				employeeId: employee.id,
				punchType: resolvedType,
				source: input.source ?? 'DISCORD',
				timestamp: input.timestamp,
				discordMessageId: input.discordMessageId,
				dedupKey: input.dedupKey,
				...(input.location
					? {
							latitude: input.location.latitude,
							longitude: input.location.longitude,
							locationAccuracyM: input.location.accuracyM ?? null,
							locationCapturedAt: new Date()
						}
					: {})
			}
```

4. The `P2002` catch (`:81-83`) already covers **both** unique constraints — no change, but add
   `(discordMessageId | dedupKey)` to its comment.
5. The audit call (`:87-100`) gains one field in `newValue`:
   `hasLocation: Boolean(input.location)`. **Do not put the coordinates in the audit row** — the
   audit log has a different read gate than the punch API, and #242 already recorded a case where
   the audit log bypassed a masking rule on this repo. `hasLocation` is enough to investigate.

The Discord route (`api/v1/timesheets/log/+server.ts:47-56`) passes `discordId` and no
`dedupKey`/`location`, so it is **unchanged** and Discord punches keep carrying no location.
Verify this by diff: that file should have **zero** lines changed in Phase 3.

## 3.3 New route — `src/routes/(app)/punch/+page.server.ts`

```ts
export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!                       // (app) layout already requires a session
	requireFoodServiceOrg(user.organizationId)      // 404 for Veent — the page does not exist
	const me = await db.employee.findUnique({
		where: { userId: user.id },
		select: { id: true, firstName: true, lastName: true }
	})
	if (!me) error(404, 'No employee record is linked to your account')
	const recent = await listPunches(me.id, { from: new Date(Date.now() - 7 * 86_400_000) })
	return { employeeName: `${me.firstName} ${me.lastName}`, recent }
}
```

**The exact guard, stated for the record.** This route is **session-authenticated, not HMAC**.
Three layers, all server-side:

1. `locals.user` must exist — enforced by the `(app)` group hook, the same gate every other
   authenticated page uses. There is no HMAC signature and `TIMELOG_API_SECRET` is not read here.
2. `requireFoodServiceOrg(user.organizationId)` → 404 for a non-food-service tenant, in **both**
   `load` and the action (a `load`-only gate is bypassed by a direct POST).
3. **The employee id is resolved from `locals.user.id`, never from the form.** There is no
   `employeeId` field in the punch form and the action must never read one. This is what makes
   the route safe without a new capability: an authenticated user can only ever punch as
   themselves, so no `MANAGE_HR` / `VIEW_TEAM` check is needed or wanted. If a future change
   adds punch-on-behalf-of, it needs `assertCanModifyTimesheet`-style scoping
   (`timesheets.ts:117-126`) — say so in a comment.

Action:

```ts
const punchSchema = z.object({
	punchType: z.enum(['IN', 'OUT']),
	latitude: z.coerce.number().min(-90).max(90).optional(),
	longitude: z.coerce.number().min(-180).max(180).optional(),
	accuracyM: z.coerce.number().min(0).optional()
})

export const actions: Actions = {
	punch: async (event) => {
		const user = event.locals.user!
		requireFoodServiceOrg(user.organizationId)
		const me = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true } })
		if (!me) return fail(404, { error: 'No employee record is linked to your account' })

		const raw = Object.fromEntries(await event.request.formData())
		// The punchType is the only REQUIRED field. Location is parsed separately and a failure
		// there is discarded, never surfaced — criterion 7: a location problem must never cost
		// the employee their punch.
		const type = z.enum(['IN', 'OUT']).safeParse(raw.punchType)
		if (!type.success) return fail(400, { error: 'Invalid punch type' })
		const loc = punchSchema.safeParse(raw)
		const location =
			loc.success && loc.data.latitude !== undefined && loc.data.longitude !== undefined
				? { latitude: loc.data.latitude, longitude: loc.data.longitude, accuracyM: loc.data.accuracyM }
				: null

		// Debounce key: one punch per employee per punchType per PHT minute. A double-tap or a
		// double-submit collapses to one row via the same 409 the Discord replay defence uses.
		const now = new Date()
		const dedupKey = `web:${me.id}:${type.data}:${now.toISOString().slice(0, 16)}`

		try {
			await recordPunch(
				{ employeeId: me.id, punchType: type.data, timestamp: now, dedupKey, source: 'WEB', location },
				{ ipAddress: event.getClientAddress() }
			)
		} catch (e) {
			return toFail(e)
		}
		return { punched: type.data, hadLocation: Boolean(location) }
	}
}
```

Note `source: 'WEB'` — the first writer of that enum value, which has existed unused since the
schema was written (`schema.prisma:214`).

## 3.4 New page — `src/routes/(app)/punch/+page.svelte`

Minimal. Two buttons (`Punch In` / `Punch Out`), a status line, and the last 7 days of the
employee's own punches with their location where present.

Client behaviour, exact:

```svelte
<script lang="ts">
	let lat = $state('')
	let lng = $state('')
	let acc = $state('')
	let locStatus = $state('Location not requested')

	// Fill the three hidden fields, then submit — with a hard watchdog. `navigator.geolocation`
	// does not exist on an insecure origin, so the non-HTTPS case takes the same branch as a
	// denied permission: submit with empty fields. The punch is NEVER blocked (criterion 7-10).
	function withLocation(form: HTMLFormElement) {
		if (!('geolocation' in navigator)) {
			locStatus = 'Location unavailable — punching without it'
			form.requestSubmit()
			return
		}
		let done = false
		const go = (msg: string) => {
			if (done) return
			done = true
			locStatus = msg
			form.requestSubmit()
		}
		setTimeout(() => go('Location timed out — punching without it'), 9000)
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				lat = String(pos.coords.latitude)
				lng = String(pos.coords.longitude)
				acc = String(Math.round(pos.coords.accuracy))
				go(`Location captured (±${acc} m)`)
			},
			() => go('Location unavailable — punching without it'),
			{ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
		)
	}
</script>
```

The watchdog (9 s) is deliberately longer than the API timeout (8 s) so the normal path is the
API's own error callback and the watchdog only catches a browser that never calls back at all.

Display rule for accuracy (criterion 9): render
`{lat}, {lng} (±{locationAccuracyM} m)` when accuracy is present, and
`{lat}, {lng} (accuracy unknown)` when it is not. Never render bare coordinates without an
accuracy qualifier — that is the "silently presented as precise" failure the SPEC forbids.

Nav: add a `Punch` link to `(app)/+layout.svelte` guarded by `isFoodServiceOrg`, alongside the
existing food-service-only entries at `+layout.svelte:26` and `:30`. Cosmetic only — §3.3 layer 2
is the enforcement.

## 3.5 Location visibility — every surface, confirmed

| Surface | Shows location? | Gate |
|---|---|---|
| `GET /api/v1/timesheets/[id]/punches` (`+server.ts:43`, returns raw `TimeLog` rows) | **Yes** | `canTouchEmployee(user, employeeId)` at `:33` → owner, their manager, branch manager, org HR. Already correct after #282; **no change needed**. |
| `/punch` page own history | **Yes — the employee's own** | `listPunches(me.id, …)` where `me` came from `locals.user.id`. This is the explicit self-visibility Decision 5 requires. |
| Attendance page + attendance CSV export | **No** | They read `AttendanceDay`, which has no location column. Deliberate — a CSV that leaves the building is the wrong place for coordinates. |
| Audit log | **No** | Only `hasLocation: boolean` (§3.2 step 5). #242 recorded the audit log bypassing a masking rule on this repo; do not repeat it. |
| `/profile` own punch history (`profile/+page.server.ts:44`) | **No** | **Added in EXECUTE per E9 — the plan omitted this caller.** It is self-scoped the same way `/punch` is (`findFirst` on `userId` + `organizationId`, `:29-31`), so it can only ever read the caller's own punches. Its `.map()` at `:48-56` projects exactly six fields — `id`, `type`, `label`, `source`, `dayKey`, `at` — so `latitude`/`longitude`/`locationAccuracyM` never reach the client. **This is a projection, not a gate:** if a future change makes `/profile` return raw `TimeLog` rows, this row becomes a live location leak with nothing to stop it. |
| Timesheets / payroll / payslip / dashboard / reports | **No** | None of them read `TimeLog` columns beyond `punchType`/`timestamp`/`timesheetId` |

`listPunches` has **three** callers after Phase 3 — the punches API, `/profile`, and (new) the
punch page — all three listed above. **Corrected in EXECUTE per E9:** the plan said two and the
§3.9 gate counted raw grep lines, which never had the claimed value. See §3.9 for the working
gate. If a FOURTH caller appears, it must be gated (or proved projection-safe) before merge.

## 3.6 Phase 3 tests

New `tests/unit/punch-location-capture.test.ts` (mocks `$lib/server/db` + `$lib/server/audit`,
tests `recordPunch` directly):

| # | Spec | Asserts (criterion) |
|---|---|---|
| C1 | `recordPunch` with `employeeId` + location | `timeLog.create` `data` has `source: 'WEB'`, `latitude`, `longitude`, `locationAccuracyM`, `locationCapturedAt` (6, 12) |
| C2 | `recordPunch` with `discordId`, no location | `data.latitude` is `undefined`; `source: 'DISCORD'`; **`data` has no location keys at all** (12) |
| C3 | `recordPunch` with `employeeId`, `location: null` | punch created, no location keys, no throw (7) |
| C4 | Employee resolution | with `employeeId` the `where` is `{ id }`; with `discordId` the `where` is `{ discordId }` — asserted via `mockImplementation` branching on the where shape, not a flat mock |
| C5 | Same `dedupKey` twice | second call throws 409; `create` called once (idempotency) |
| C6 | `P2002` thrown by `create` | mapped to 409, not a 500 |

New `tests/unit/punch-location-route.test.ts` (imports the `actions` **export** from
`punch/+page.server.ts`):

| # | Spec | Asserts (criterion) |
|---|---|---|
| C7 | No `latitude`/`longitude` in the form | `recordPunch` called with `location: null`, action returns success, **not** a `fail` (7, 10) |
| C8 | `latitude: '999'` (out of range) / `latitude: 'abc'` | `location: null`, punch still succeeds — a bad location never becomes a 400 (7, 9) |
| C9 | Valid location, no `accuracyM` | `accuracyM: undefined` passed through, punch succeeds (9) |
| C10 | Form containing `employeeId: 'someone-else'` | the action ignores it; `recordPunch` receives the id resolved from `locals.user.id` (the self-scoping guard) |
| C11 | User in `org_veent` | throws 404; `recordPunch` never called (12, 20 — negative control) |
| C12 | User in `org_jojo` with no `Employee` row | `fail(404)`, no throw, `recordPunch` never called |

New `tests/e2e/timesheet-punch-location.spec.ts` (hybrid; extends the existing
`tests/e2e/timesheet-punch.spec.ts` pattern): log in as a seeded JoJo employee, grant geolocation
via Playwright's `context.grantPermissions(['geolocation'])` + `setGeolocation`, click
**Punch In**, and assert the recorded punch row on the page shows a coordinate with an accuracy
qualifier. A second case revokes the permission and asserts the punch still succeeds.

### Mutation checks — Phase 3

| Guard | Mutation that must turn it RED | Test |
|---|---|---|
| Discord carries no location | Add `location` to the Discord route's `recordPunch` call | C2 |
| Location never blocks the punch | Change the action to `return fail(400)` when `loc.success === false` | C7, C8 |
| Self-scoping | Read `employeeId` from the form instead of `locals.user.id` | C10 |
| Org gating on the action | Delete `requireFoodServiceOrg` from the **action** (leave it in `load`) | C11 |
| Web dedup | Drop `dedupKey` from the action | C5 |
| Coordinates stay out of the audit | Put `latitude` into the audit `newValue` | add an explicit assertion in C1: `writeAuditLog`'s `newValue` has no `latitude` key |

Same vacuous-mock warning as §2.7: C4 and C10 are exactly the assertions a flat
`mockResolvedValue` makes meaningless. Branch on `where`.

## 3.7 Twin-door analysis — Phase 3

| Guard | Its twin | Covered? |
|---|---|---|
| `requireFoodServiceOrg` in `load` | `requireFoodServiceOrg` in the **action** | **Yes — both, §3.3.** C11 asserts the action. |
| Self-scoping on the punch action | The punches **read** API | **Yes, pre-existing** — `canTouchEmployee` (`punches/+server.ts:33`). |
| Location only on WEB punches | The Discord route | **Yes** — that file has zero changed lines; C2 pins it. |
| Location only on WEB punches | The **backlog import** (Phase 2) | **Yes** — `importBacklog` builds its records literally and never sets a location field. Add an assertion to B6: no record in `createMany` has a `latitude` key. |
| Web punch respects locked days | See §2.6 row 3 — **deliberately does not**, matching Discord | Documented, not a gap. |

## 3.8 Phase 3 blast radius

| Surface | Affected? | Why |
|---|---|---|
| `prisma/schema.prisma` `TimeLog` | **YES** | 4 nullable columns |
| `timelog.ts` `recordPunch` | **YES** | Signature widened; **behaviour for the existing Discord caller is unchanged** — C2 is the proof |
| `api/v1/timesheets/log/+server.ts` | **No — zero lines** | Verify by diff |
| new `(app)/punch/*` | **YES** | New route, 2 files |
| `(app)/+layout.svelte` | **YES** | 1 nav link |
| `api/v1/timesheets/[id]/punches` | **Indirectly** | Returns 4 more (usually null) fields; already gated |
| `pairPunchesToDailyHours`, `deriveAttendanceDay`, `deriveRange` | No | Read `punchType`/`timestamp` only — a WEB punch is just a punch, and it flows into AM/PM derivation for free |
| `src/hooks.ts` `Decimal` transport hook | No | `Float`, not `Decimal` |
| `storage.ts` | No | No files |

Risk class: **schema change + new public surface + sensitive personal data**. Files changed:
4 + 2 new route files + 3 new test files.

## 3.9 Phase 3 gate

```bash
pnpm db:push && pnpm prisma generate
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e                    # hybrid: needs ./start.sh + pnpm db:seed:e2e

# Corrected in EXECUTE per E9. The original gate — `grep -rn "listPunches" src/` "must return
# exactly 2 call sites" — could never pass: raw grep counts LINES, and the definition plus each
# caller's import line are lines too (5 before Phase 3, 7 after). Count CALL sites instead, and
# expect 3: the punches API, /profile, and the new punch page. See the §3.5 table.
test "$(grep -rn 'listPunches(' src/ | grep -vc 'export async function listPunches')" = 3

git diff --stat src/routes/api/v1/timesheets/log/+server.ts   # must be empty
```

## 3.10 Phase 3 rollback

Code: revert the phase-3 commits. The `recordPunch` signature widening is backward-compatible, so
a partial revert (page only, service kept) is also safe.
Data: `DELETE FROM time_logs WHERE source = 'WEB';` removes every web punch and its location in
one statement — the `source` column is the clean seam.
Schema: `ALTER TABLE time_logs DROP COLUMN latitude, DROP COLUMN longitude, DROP COLUMN location_accuracy_m, DROP COLUMN location_captured_at;`

---

## Manual Test Script

Run **after** all three phases are green. Every step names the exact control, plants a findable
marker, and asserts something **positive**. "The card is absent" proves nothing.

### Harness

```bash
./start.sh                      # Postgres on 5434
pnpm db:seed                    # or db:seed:e2e
pnpm dev                        # http://localhost:5173
```

Cookie jar login (dev-only route, `src/routes/api/v1/_dev/login-as/+server.ts` — 404s outside
`dev`):

```bash
J=/tmp/jar.txt; rm -f $J
curl -s -c $J -X POST http://localhost:5173/api/v1/_dev/login-as \
  -H 'content-type: application/json' \
  -d '{"email":"hr@jojopotato.test"}'          # substitute the seeded JoJo HR email
```

psql — **the container runs Postgres on 5434 inside the container too**, so the port flag is
required on both sides:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c "…"
```

Table names are **snake_case**: `attendance_days`, `time_logs`, `audit_logs`, `employees`,
`organizations`.

### M1 — AM/PM split appears for JoJo (criterion 1)

1. Plant the marker — four punches on one date for a known JoJo employee:

```bash
EMP=$(docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -tAc \
  "select id from employees where employee_number='JJ-0001'")
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"insert into time_logs (id,employee_id,punch_type,source,timestamp,created_at) values
 ('mtest-ampm-1','$EMP','IN','MANUAL','2026-08-10 00:00:00+00',now()),
 ('mtest-ampm-2','$EMP','OUT','MANUAL','2026-08-10 03:00:00+00',now()),
 ('mtest-ampm-3','$EMP','IN','MANUAL','2026-08-10 05:00:00+00',now()),
 ('mtest-ampm-4','$EMP','OUT','MANUAL','2026-08-10 09:00:00+00',now());"
```

(UTC times = PHT 08:00, 11:00, 13:00, 17:00.)

2. Open `/attendance`, select employee `JJ-0001`, set the range to cover 2026-08-10, click the
   **Refresh** button (the `derive` action).
3. **Assert positively:** the row for 2026-08-10 shows **AM In 08:00, AM Out 11:00, PM In 13:00,
   PM Out 17:00**, and the existing **In** column reads **08:00** and **Out** reads **17:00**.
4. Confirm on disk:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select time_in, time_out, am_time_in, am_time_out, pm_time_in, pm_time_out
 from attendance_days where employee_id='$EMP' and date='2026-08-10';"
```

Expect six non-null timestamps, with `time_in = am_time_in` and `time_out = pm_time_out`.

### M2 — Veent is untouched (criteria 2, 20)

1. `curl -c /tmp/jar2.txt … -d '{"email":"hr@veent.test"}'`, open `/attendance`.
2. **Assert positively (corrected per contract instruction E6):** a Veent **HR** user sees
   **9** `<th>`s, not 8 — `+page.svelte`'s per-employee `<thead>` ends with
   `{#if data.canManage}<th …></th>{/if}`, an actions column. Count the headers (**9**) AND name
   the four that must be absent: `AM In`, `AM Out`, `PM In`, `PM Out`. A non-HR Veent user sees 8.
3. Click **Export CSV**. **Assert positively:** the first line of the downloaded file is
   `Date,Status,Time In,Time Out,Regular Hrs,OT Hrs,Night Diff Hrs,Late Min,Undertime Min,Locked`
   — 10 fields, no `AM In`.
4. As JoJo HR, click **Export CSV**. **Assert positively:** the header line contains
   `Time Out,AM In,AM Out,PM In,PM Out,Regular Hrs` in that order — 14 fields.

### M3 — Backlog import applies rows (criterion 13)

Prepare `/tmp/backlog.csv`:

```
employeeNumber,date,amIn,amOut,pmIn,pmOut
JJ-0002,2026-08-11,08:05,11:30,13:15,17:20
JJ-0002,2026-08-12,08:00,12:00,,
```

1. As JoJo HR on `/attendance`, click **Import backlog CSV**, choose the file, submit.
2. **Assert positively:** the page shows **"Applied 2 rows, skipped 0 duplicates, rejected 0
   rows"**.
3. Confirm the punches and the derived day:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select punch_type, timestamp, source, dedup_key from time_logs
 where dedup_key like 'backlog:JJ-0002:2026-08-11%' order by timestamp;"
```

Expect **4 rows**, all `source = MANUAL`, keys ending `:amIn`, `:amOut`, `:pmIn`, `:pmOut`.

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select am_time_in, pm_time_out, worked_hours from attendance_days
 where date='2026-08-11' and employee_id=(select id from employees where employee_number='JJ-0002');"
```

Expect `am_time_in` 08:05 PHT and a non-zero `worked_hours`.

### M4 — Re-upload is a no-op (criterion 16)

1. Upload **the same** `/tmp/backlog.csv` again.
2. **Assert positively:** the summary reads **"Applied 0 rows, skipped 2 duplicates, rejected 0
   rows"**.
3. Confirm no duplicates were written:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select count(*) from time_logs where dedup_key like 'backlog:JJ-0002:%';"
```

Expect exactly **6** (4 + 2), the same number as after M3.

### M5 — Locked day is refused, loudly (criterion 15)

1. On `/attendance` for `JJ-0002`, set the range to 2026-08-13 → 2026-08-13 and click **Lock**.
2. Prepare `/tmp/backlog-locked.csv` with one row: `JJ-0002,2026-08-13,08:00,12:00,13:00,17:00`.
3. Upload it.
4. **Assert positively:** the summary reads **"Applied 0 rows, skipped 0 duplicates, rejected 1
   row"** and the expandable reason list contains the literal text **"this day is locked"** with
   line number 2.
5. Confirm nothing was written:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select count(*) from time_logs where dedup_key like 'backlog:JJ-0002:2026-08-13%';"
```

Expect **0**.

### M6 — Hand-corrected day is refused (criterion 15, the twin)

Repeat M5 for 2026-08-14 but instead of Lock, edit the **Time In** cell for that row to `09:00`
and submit the **Save** button on that row (the `correct` action). Then upload a backlog row for
2026-08-14. **Assert positively:** rejected with **"this day was hand-corrected by HR"**, and
`select manually_edited from attendance_days where date='2026-08-14' …` returns `t`.

### M7 — Import is refused for Veent and for a non-HR user (criterion 18, 20)

1. As Veent HR, `/attendance` — **assert positively:** the **Import backlog CSV** control is not
   rendered, **and** the direct POST is refused:

```bash
curl -s -b /tmp/jar2.txt -o /dev/null -w '%{http_code}\n' \
  -X POST 'http://localhost:5173/attendance?/importBacklog' \
  -F 'backlog=@/tmp/backlog.csv'
```

Expect **404**.

2. As a JoJo rank-and-file employee (`login-as` a seeded EMPLOYEE), run the same curl.
   Expect **403**.

### M8 — Web punch records location (criteria 6, 11)

1. As a JoJo employee, open `http://localhost:5173/punch`.
   *(Geolocation needs a secure context; `localhost` counts as secure in Chrome and Firefox, so
   no TLS setup is needed for this step.)*
2. Click **Punch In**. Grant the browser's location prompt.
3. **Assert positively:** the status line reads **"Location captured (±N m)"** and the punch
   appears in the "Recent punches" list with a coordinate pair followed by **"(±N m)"**.
4. Confirm on disk:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select punch_type, source, latitude, longitude, location_accuracy_m, dedup_key
 from time_logs where source='WEB' order by created_at desc limit 1;"
```

Expect `source = WEB`, non-null latitude/longitude, and a `dedup_key` starting `web:`.

### M9 — Denying location still punches (criteria 7, 8)

1. In the browser site settings, **Block** location for `localhost`. Reload `/punch`.
2. Click **Punch Out**.
3. **Assert positively:** the page shows **"Punched OUT"** and the status line reads **"Location
   unavailable — punching without it"**. There is **no** error banner and **no** retry prompt.
4. Confirm the row exists with nulls:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select punch_type, source, latitude from time_logs where source='WEB' order by created_at desc limit 1;"
```

Expect one row, `punch_type = OUT`, `latitude` null.

### M10 — Discord punches still carry no location (criterion 12)

Send a signed punch through the existing HMAC endpoint (reuse the harness in
`tests/e2e/timelog-replay.spec.ts`), then:

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"select count(*) from time_logs where source='DISCORD' and latitude is not null;"
```

**Assert positively:** the count is **0**.

### M11 — Location is not visible to a stranger (criterion 11)

As a JoJo MANAGER who does **not** manage the employee from M8:

```bash
curl -s -b /tmp/jar3.txt -o /dev/null -w '%{http_code}\n' \
  "http://localhost:5173/api/v1/timesheets/$EMP/punches"
```

Expect **403**. Then as that employee themselves, expect **200** and a body whose first punch
object contains a `latitude` key with a number — the explicit self-visibility Decision 5 requires.

### Cleanup

```bash
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
"delete from time_logs where id like 'mtest-%' or dedup_key like 'backlog:JJ-000%' or source='WEB';"
```

---

## Risks — what goes wrong and is expensive to unwind

**R1 — A silently wrong AM/PM boundary (highest).** A plausible-but-wrong split produces a number
nobody questions. It could ship for weeks and only surface as a payslip dispute.

- *Mitigation 1 (structural, and the reason this risk is survivable):* AM/PM is **display-only**
  by construction (D2). It is written to four columns nothing reads. `workedHours` and every
  hour bucket are computed from `netIntervals` exactly as before, and test A1 asserts
  `workedHours` is **identical** with the flag on and off. A wrong boundary can therefore never
  reach a payslip. If a future change makes payroll read `amTimeIn`, this mitigation evaporates —
  say so in the schema comment (§1.1 does).
- *Mitigation 2:* `MIN_AM_PM_GAP_MS` prevents the most likely wrong answer (splitting one block
  at a re-punch). Test A4 pins it.
- *Mitigation 3:* the invariant test A8 — `amTimeIn === timeIn` and `pmTimeOut === timeOut` —
  catches any boundary logic that has drifted away from the punches it claims to describe.
- *Mitigation 4:* M1 is a positive manual assertion of four specific clock times, not "the
  columns look populated."

**R2 — `correctDay` silently clearing a split.** An HR user editing one number on a row wipes its
AM/PM. Handled by making it explicit and recoverable (§1.3c: read-only AM/PM cells, a comment in
the service, and `resetDay` as the documented recovery). Verified by M6.

**R3 — A backlog row writing punches into a day that is later unlocked.** If the import wrote
`TimeLog` rows for a locked day, unlocking would resurrect them silently at the next derive.
Prevented by rejecting **before** the write (§2.3e step 5), not after. Verified by M5's count of 0.

**R4 — Column-set drift in the CSV export.** `exportToCSV` reads headers from `rows[0]` only
(`reports.ts:626`). A conditional key added to some rows but not others silently drops columns
for the rest of the file. Prevented by the `amPmCols(...)` spread being applied to every row
including nulls (§1.6). Verified by M2 step 4 counting fields.

**R5 — Location leaking to a surface that is not attendance-gated.** Mitigated by keeping
location off `AttendanceDay` entirely (so it cannot reach the CSV export, the payslip, or
reports), keeping coordinates out of the audit row, and the pre-gate `grep -rn "listPunches"`
check (§3.9). #242 on this repo is the precedent for the audit-log bypass specifically.

**R6 — A stale Prisma client faking a broken build.** Three prior occurrences. Mitigated by the
mandatory `pnpm prisma generate` step and the explicit note in §Prisma Contract.

**R7 — `papaparse` supply chain.** One new production dependency. Mitigated by pinning the exact
version in the lockfile, by the fact that the parser never touches disk or `eval`, and by
`sanitizeCell` treating every parsed cell as hostile.

**R10 — A misconfigured threshold silently re-splits a whole tenant (new, Amendment 1).** This is
the amendment's real cost and it partly reverses a VALIDATE finding. Before the amendment the
failure was **asymmetric**: a too-large hardcoded constant produced *no* split rather than a wrong
one (contract row "`MIN_AM_PM_GAP_MS` = 30 min is safe as specified" — verdict SAFE, on exactly
that reasoning). With an operator-settable value the failure becomes **symmetric**: a threshold of
5 makes a mis-punch re-punch the "longest gap" and manufactures a fake AM/PM boundary that looks
entirely plausible.
- *Mitigation 1, and the reason this is still survivable:* **D2 is untouched.** AM/PM remains
  display-only, so the worst case is still a wrong label, never a wrong peso. Manual step M1b
  step 7 asserts `worked_hours` is byte-identical across a threshold change, which is the
  mechanical proof.
- *Mitigation 2:* the 5-minute floor (§1.11.5) is set precisely to keep the threshold above
  input-error noise, and no route can store a value below it (A16, plus the service-layer
  second check).
- *Mitigation 3:* the finite/positive fallback in `derive.ts` (§1.11.2c) means a `NaN` or a
  negative that somehow reaches the engine restores the default instead of propagating. A12
  pins it; its mutation is in the §1.11.7 table.
- *Bound the risk assessment missed (A-P2), and the strongest safety argument the amendment has:*
  the boundary always lands on the **longest** gap, so changing the threshold can only turn a
  split **on or off** — it can never MOVE an existing boundary. The single exception is the
  dangling-IN case (§1.2c step 4), where lowering the threshold can flip an open PM block into a
  closed one. R10's blast radius is therefore "a day gains or loses its split", not "every
  boundary moves".
- *New surface R10 missed (A-P3):* §1.6 puts AM/PM into the **CSV export**, which leaves the
  application. A fake split cannot reach `payroll/calculator.ts` — D2 holds — but it can reach a
  payroll processor's spreadsheet. D2 bounds the *system*, not the *paper*.
- *Residual, recorded honestly:* nothing proves the number an operator picks is the right one
  for their tenant. That was already true of the hardcoded 30 (contract §"What this coverage does
  NOT prove"); the amendment moves the choice to the operator without proving it.

**R11 — Changing the threshold does not retroactively re-split stored days (new, Amendment 1).**
The four AM/PM columns are materialised at derive time. After an operator saves a new threshold,
every existing `attendance_days` row keeps the split computed under the OLD value until someone
clicks **Refresh** for that range — and days that are `isLocked` or `manuallyEdited` will never
pick it up at all, because `deriveRange` skips them (`index.ts:249`, `:251`). So a tenant can sit
with two different boundary rules across one report. **The two skip reasons are not equal
(A-P5):** a `manuallyEdited` day IS recoverable — `resetDay`
(`attendance/+page.server.ts:201-206`) clears the flag and re-derives. A **locked** day is the
real dead end: `resetDayToDerived` refuses it with 409 and no UI path exists, so the operator must
unlock the range first. Mitigations: M1b step 6 makes the Refresh
requirement explicit in the operator's own workflow; the settings card's helper text should be
read as describing future derives. This interacts with contract correction **P1** — a
non-`editingTimes` correction already leaves AM/PM stale, and a threshold change is a second way
to get a stale split. Fold both into P1's resolution rather than treating them separately. Not
worth building a re-derive-on-save trigger: it would silently rewrite historical rows the operator
did not ask to touch, which is the failure `manuallyEdited` exists to prevent.

**R8 — Phase coupling.** Phase 2 and 3 share `TimeLog.dedupKey`. Rolling back Phase 2's schema
while Phase 3 is live breaks the web punch. Recorded in §2.9.

---

## Acceptance Criteria

The 20 testable criteria are owned by
`timesheet-capture-162-177-200_SPEC_17-08-26.md` §Acceptance Criteria and are not restated here.
Every one of them is mapped to a named gate in `## Verification Evidence` below; that table is
the criterion-to-gate index. This plan is complete only when all 20 rows in that table are green
or carry an explicit, backlogged known-gap entry.

Plan-level acceptance, in addition to the SPEC's 20:

1. No Prisma enum value is added or renamed; no `scripts/migrate-*.ts` is created.
2. `git diff --stat src/routes/api/v1/timesheets/log/+server.ts` is empty after Phase 3.
3. No pre-existing test file under `tests/unit/` or `tests/e2e/` is edited to make a new change
   pass. If one must change, Decision 1 has been violated — stop and escalate.
4. `grep -rn "listPunches" src/` returns exactly 2 call sites after Phase 3.
5. Each of the three phases is a separate commit, so a phase can be reverted independently.
6. (Amendment 1) The AM/PM threshold is per-organization: the same punch set splits differently
   under two different `Organization.amPmMinGapMinutes` values, a NULL column behaves exactly as
   the pre-amendment hardcoded 30 minutes did, and no value outside 5–240 can be stored by any
   route. Org **gating** is still `isFoodServiceOrg()` — the column tunes, it never gates.

## Phase Completion Rules

A phase is **CODE DONE** when its file-by-file steps are implemented. A phase is **VERIFIED**
only when all of the following hold, in order:

1. `pnpm db:push && pnpm prisma generate` ran without error (phases that change the schema).
2. `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test` each exit 0, run in that
   order. CI stops at the first failure; so does this gate. `pnpm lint` does **not** run
   `format:check`.
3. Every new unit spec in the phase's test table is green.
4. Every pre-existing suite in the phase's blast radius is green **without edits**.
5. Every mutation check in the phase's mutation table has been applied by hand, confirmed RED,
   and reverted. An unconfirmed mutation check means the guard is unproven.
6. Phase 3 additionally requires `pnpm test:e2e` green and the manual script M1–M11 executed with
   its positive assertions recorded.

**Code-only completion is `CODE DONE`, never `VERIFIED`.** Do not start the next phase from a
`CODE DONE` predecessor — the phases are sequentially gated because Phase 2 writes punches that
Phase 1's derive path must already handle, and Phase 3 reuses a column Phase 2 adds.

## Implementation Checklist

Phase 1 — #162:

1. `prisma/schema.prisma` — add `amTimeIn`, `amTimeOut`, `pmTimeIn`, `pmTimeOut` (all
   `DateTime?`) to `model AttendanceDay` after `timeOut`, with the invariant comment (§1.1).
2. Run `pnpm db:push && pnpm prisma generate`.
3. `derive.ts` — add `splitAmPm?: boolean` to `DeriveInput` (§1.2a).
4. `derive.ts` — add the four `Date | null` fields to `AttendanceDayResult` and to
   `emptyResult()` (§1.2b).
5. `derive.ts` — add `MIN_AM_PM_GAP_MS` and the `splitAmPmBlocks()` post-pass (§1.2c).
6. `derive.ts` — call `splitAmPmBlocks` under `if (input.splitAmPm)` after
   `result.timeOut = lastOut` (§1.2d).
7. `attendance/index.ts` — import `isFoodServiceOrg`; hoist `splitAmPm` in `deriveRange`; pass it
   to `deriveAttendanceDay`; add the four fields to `data` (§1.3b).
8. `attendance/index.ts` — pass `splitAmPm` in `correctDay`; add the four fields to `write`; add
   the collapse comment (§1.3c).
9. `attendance/+page.server.ts` — return `showAmPm` from `load` (§1.4).
10. `attendance/+page.svelte` — add 4 headers and 4 read-only cells to **both** tables; fix every
    affected `colspan` (§1.5).
11. `attendance/export/+server.ts` — add the `amPmCols()` helper and spread it into **every** row
    in both branches (§1.6).
12. Write `tests/unit/attendance-am-pm-split.test.ts` (A1–A8).
13. Write `tests/unit/payroll-am-pm-days-of-work.test.ts`.
14. Write `tests/unit/hours-engine-parity-am-pm.test.ts`.
15. Run the §1.9 gate; run the §1.7 mutation checks; commit.

**Amendment 1 steps (§1.11) — Phase 1, interleaved.** These are deliberately *suffixed*, not
renumbered: the `## Validate Contract` binds E1→item 13, E2→item 11, E5→item 15 and E7→item 12,
and renumbering would silently break those anchors.

- **1a.** `prisma/schema.prisma` — add `amPmMinGapMinutes Int?` to `model Organization` after
  `trackTardiness`, with the comment in §1.11.1. Run with step 2's push/generate.
- **3a.** `derive.ts` — rename the constant to `DEFAULT_AM_PM_MIN_GAP_MINUTES` (exported) +
  `DEFAULT_AM_PM_MIN_GAP_MS`; add `AM_PM_MIN_GAP_FLOOR`, `AM_PM_MIN_GAP_CEILING`,
  `isValidAmPmMinGap` (§1.11.2a, §1.11.5).
- **3b.** `derive.ts` — add `amPmMinGapMs?: number` to `DeriveInput` (§1.11.2b).
- **5a.** `derive.ts` — `splitAmPmBlocks` takes `minGapMs` as a third parameter; compare against
  it in steps 3 and 4 (§1.11.2c).
- **6a.** `derive.ts` — the §1.2d call site computes `minGapMs` with the finite/positive fallback
  and passes it (§1.11.2c).
- **7a.** `attendance/index.ts` — widen `deriveRange`'s org `select` to
  `{ trackTardiness: true, amPmMinGapMinutes: true }`; hoist `amPmMinGapMs` beside
  `orgTracksTardiness` at `:175`; pass it to `deriveAttendanceDay` (§1.11.3).
- **8a.** `attendance/index.ts` — the same two changes in `correctDay` at `:436-442` (§1.11.3).
- **8b.** `attendance/schedules.ts` — add `setOrgAmPmMinGap` after `setOrgTardiness` (§1.11.4).
- **9a.** `settings/schedules/+page.server.ts` — widen the `load` select; return `showAmPmGap`,
  `amPmMinGapMinutes`, `amPmMinGapDefault`; add the `setAmPmMinGap` action with
  `requireAnyCapability('MANAGE_HR')` + `requireFoodServiceOrg` + the strict parse (§1.11.5–6).
- **10a.** `settings/schedules/+page.svelte` — add the threshold card below the org-wide
  tardiness card at `:52-70` (§1.11.6).
- **12a.** Extend `tests/unit/attendance-am-pm-split.test.ts` with A9–A13 (§1.11.7).
- **14a.** Write `tests/unit/attendance-ampm-gap-setting.test.ts` (A14–A20), using
  `mockImplementation` keyed on the `where`/`select` shape (§1.11.7).
- **15a.** Run the §1.11.7 mutation table (12 rows) in addition to §1.7's, and manual step M1b
  (§1.11.11), before committing.

Phase 2 — #200:

16. `pnpm add papaparse && pnpm add -D @types/papaparse`.
17. `prisma/schema.prisma` — add `dedupKey String?` and `@@unique([dedupKey, employeeId])` to
    `model TimeLog` (§2.2); run `pnpm db:push && pnpm prisma generate`.
18. Create `src/lib/server/services/attendance/import.ts` with `MAX_IMPORT_BYTES`,
    `MAX_IMPORT_ROWS`, `sanitizeCell`, `parseBacklogCsv` (§2.3a–§2.3d).
19. Implement `importBacklog` following the exact 10-step order in §2.3e, with the three bulk
    queries and the single `$transaction`.
20. `attendance/+page.server.ts` — add the `importBacklog` action; widen `toFail` to
    `[400, 404, 409, 413, 415]` (§2.4).
21. `attendance/+page.svelte` — add the upload form and the result summary (§2.4).
22. Create `tests/fixtures/backlog/` with the four fixture CSVs.
23. Write `tests/unit/attendance-backlog-parse.test.ts` (B1–B5).
24. Write `tests/unit/attendance-backlog-import.test.ts` (B6–B12) using where-shape mocks.
25. Write `tests/unit/attendance-backlog-rbac.test.ts` (B13–B16) against the `actions` export.
26. Run the §2.8 gate; run the §2.5 mutation checks; commit.

Phase 3 — #177:

27. `prisma/schema.prisma` — add `latitude`, `longitude`, `locationAccuracyM` (`Float?`) and
    `locationCapturedAt` (`DateTime?`) to `model TimeLog` (§3.1); run
    `pnpm db:push && pnpm prisma generate`.
28. `timelog.ts` — widen the `recordPunch` input; branch employee resolution on
    `employeeId` vs `discordId`; enforce "exactly one of" (§3.2 step 1).
29. `timelog.ts` — generalise the duplicate pre-check to cover `dedupKey` (§3.2 step 2).
30. `timelog.ts` — write `dedupKey` and the conditional location block in `create` (§3.2 step 3).
31. `timelog.ts` — add `hasLocation` to the audit `newValue`; **no coordinates** (§3.2 step 5).
32. Create `src/routes/(app)/punch/+page.server.ts` — `load` + `punch` action, both gated
    (§3.3).
33. Create `src/routes/(app)/punch/+page.svelte` — buttons, `withLocation()` watchdog, recent
    punches with the accuracy qualifier (§3.4).
34. `(app)/+layout.svelte` — add the food-service-gated `Punch` nav link.
35. Write `tests/unit/punch-location-capture.test.ts` (C1–C6).
36. Write `tests/unit/punch-location-route.test.ts` (C7–C12).
37. Write `tests/e2e/timesheet-punch-location.spec.ts`.
38. Run the §3.9 gate (including the two `grep`/`git diff` assertions); run the §3.6 mutation
    checks; run the manual script M1–M11; commit.

---

## Touchpoints

| Path | Phase | Change |
|---|---|---|
| `prisma/schema.prisma` | 1, 2, 3 | 4 + 1 + 4 nullable columns, 1 unique index |
| `src/lib/server/services/attendance/derive.ts` | 1 | `splitAmPm` input, 4 result fields, `splitAmPmBlocks`, `MIN_AM_PM_GAP_MS` |
| `src/lib/server/services/attendance/index.ts` | 1 | `isFoodServiceOrg` import; `deriveRange` + `correctDay` pass the flag and persist 4 fields |
| `src/routes/(app)/attendance/+page.server.ts` | 1, 2 | `showAmPm` in `load`; `importBacklog` action; `toFail` allow-list |
| `src/routes/(app)/attendance/+page.svelte` | 1, 2 | 4 read-only columns × 2 tables; upload form + result summary |
| `src/routes/(app)/attendance/export/+server.ts` | 1 | 4 conditional CSV columns |
| `src/lib/server/services/attendance/import.ts` | 2 | **new** |
| `package.json` | 2 | `papaparse`, `@types/papaparse` |
| `src/lib/server/services/attendance/schedules.ts` | 1 (Amendment 1) | `setOrgAmPmMinGap` setter beside `setOrgTardiness` |
| `src/routes/(app)/settings/schedules/+page.server.ts` | 1 (Amendment 1) | `load` select widened; 3 returned values; `setAmPmMinGap` action |
| `src/routes/(app)/settings/schedules/+page.svelte` | 1 (Amendment 1) | 1 threshold card below the tardiness card |
| `src/lib/server/services/timelog.ts` | 3 | `recordPunch` employee resolution, `dedupKey`, location |
| `src/routes/(app)/punch/+page.server.ts` | 3 | **new** |
| `src/routes/(app)/punch/+page.svelte` | 3 | **new** |
| `src/routes/(app)/+layout.svelte` | 3 | 1 nav link |
| `tests/unit/*` (9 new files) | 1, 2, 3 | see per-phase test tables |
| `tests/e2e/timesheet-punch-location.spec.ts` | 3 | **new** |

**Read but not changed** (verify with `git diff --stat`): `src/lib/orgs.ts`, `src/lib/rbac.ts`,
`src/lib/server/rbac.ts`, `src/lib/server/audit.ts`, `src/lib/server/storage.ts`,
`src/lib/server/services/reports.ts`, `src/lib/server/services/attendance/input.ts`,
`src/lib/server/services/payroll/*`, `src/routes/api/v1/timesheets/log/+server.ts`,
`src/routes/api/v1/timesheets/[id]/punches/+server.ts`,
`src/lib/components/timesheets/TimesheetModal.svelte`.

## Public Contracts

| Contract | Change | Compatibility |
|---|---|---|
| `deriveAttendanceDay(input)` | `splitAmPm?: boolean` added (optional, defaults false); result gains 4 nullable `Date` fields | **Backward compatible.** Every existing caller and test compiles and behaves identically. |
| `recordPunch(input, meta)` | `discordId` becomes optional; `employeeId`, `dedupKey`, `location` added | **Backward compatible** for the one existing caller (the Discord route), which passes `discordId`. Enforce "exactly one of `discordId`/`employeeId`" at runtime with a clear throw. |
| `AttendanceDay` row shape (Prisma + API) | 4 nullable columns | Additive; every reader selects explicit fields or the whole row |
| `TimeLog` row shape | 5 nullable columns | Additive. **`GET /api/v1/timesheets/:id/punches` returns whole rows**, so its response gains 5 usually-null fields — the only externally visible response change in the cluster. |
| Attendance CSV export | 4 extra columns **for food-service orgs only** | Any downstream consumer parsing by column *index* for JoJo/Sweetleaf breaks; parsing by header name is safe. Flag in the PR description. |
| New form action `?/importBacklog` | New | `MANAGE_HR` + food-service |
| New route `/punch` | New | Session-auth + food-service + self-only |

## Blast Radius

- **Files changed:** 15 modified + 3 new source files + 11 new test files (Amendment 1 adds
  3 modified source files and 1 new test file — see §1.11.9 for the delta).
- **Packages:** single package (this is not a monorepo).
- **Schema:** 10 new nullable columns across 3 tables (Amendment 1 adds `Organization.amPmMinGapMinutes`), 1 new unique index, **0 enum changes**,
  **0 renames**, **0 data migrations**.
- **Risk classes present:** schema/migration; payroll-adjacent; new public surface; sensitive
  personal data (location); new production dependency; file upload.
- **Risk classes absent:** auth/identity (no RBAC table change), billing, container/proxy,
  secrets.
- **Runtime surfaces:** the attendance page, the attendance CSV export, the punches API response
  shape, and one new page.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `attendance-am-pm-split` A1, A3, A5, A7, A8 | Fully-Automated | 1 |
| `attendance-am-pm-split` A2 (negative control) + the untouched `attendance-derive` / `attendance-autoderive` / `attendance-correct-derive` suites re-run green | Fully-Automated | 2, 20 |
| `payroll-am-pm-days-of-work` | Fully-Automated | 3 |
| `hours-engine-parity-am-pm` | Fully-Automated | 4 |
| `attendance-am-pm-split` A6 (single punch) | Fully-Automated | 5 |
| `punch-location-capture` C1 + e2e `timesheet-punch-location` | Hybrid (e2e needs the seeded DB + a browser) | 6 |
| `punch-location-route` C7, C8 | Fully-Automated | 7 |
| e2e `timesheet-punch-location` permission-denied case | Hybrid | 8 |
| `punch-location-route` C8, C9 + the accuracy-qualifier display rule | Fully-Automated | 9 |
| `punch-location-route` C7 (no reading present → graceful) | Fully-Automated | 10 |
| Existing `punch-access` suite (unchanged, re-run) + M11 self-visibility | Fully-Automated + Agent-Probe (M11) | 11 |
| `punch-location-capture` C2 + `punch-location-route` C11 | Fully-Automated | 12 |
| `attendance-backlog-import` B6 | Fully-Automated | 13 |
| `attendance-backlog-import` B7 | Fully-Automated | 14 |
| `attendance-backlog-import` B8, B9 | Fully-Automated | 15 |
| `attendance-backlog-import` B10 | Fully-Automated | 16 |
| `attendance-backlog-import` B11 | Fully-Automated | 17 |
| `attendance-backlog-rbac` B13, B14, B15 | Fully-Automated | 18 |
| `attendance-backlog-parse` B2–B5 + `attendance-backlog-rbac` B16 | Fully-Automated | 19 |
| A2 + C11 + B14 (three negative controls, one per issue) + M2/M7 | Fully-Automated + Agent-Probe | 20 |
| Mutation checks §1.7, §2.5, §3.6 — each guard mutated once and confirmed RED | Agent-Probe (the mutation is applied and reverted by hand) | all guard criteria (2, 7, 12, 15, 16, 18) |
| `pnpm format:check && pnpm lint && pnpm check && pnpm test`, in order, per phase | Fully-Automated | all |
| Manual script M1–M11 | Agent-Probe | 1, 2, 6, 8, 11, 12, 13, 15, 16, 18, 20 |

Amendment 1 rows:

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `attendance-am-pm-split` A9 (NULL → default), A11 (30 min → no split) | Fully-Automated | 1 (threshold half; supersedes the hardcoded-constant assumption) |
| `attendance-am-pm-split` A10 + A13 (same punches, two thresholds, two answers; per-call state) | Fully-Automated | 1 |
| `attendance-am-pm-split` A12 (NaN / negative / 0 / Infinity fall back) | Fully-Automated | 1 (trust boundary, defence in depth) |
| `attendance-ampm-gap-setting` A14, A16 (bounds 5–240 rejected at both layers) | Fully-Automated | 1, 18 (writer boundary) |
| `attendance-ampm-gap-setting` A15 (empty clears to NULL = default) | Fully-Automated | 1 |
| `attendance-ampm-gap-setting` A17, A20 (write shape + audit row) | Fully-Automated | 17-equivalent for the setting |
| `attendance-ampm-gap-setting` A18 (Veent → 404 on the action, not just a hidden control) | Fully-Automated | 2, 20 |
| `attendance-ampm-gap-setting` A19 (form-supplied `organizationId` ignored) | Fully-Automated | 20 (cross-tenant) |
| Manual M1b steps 2, 5, 7, 8, 9, 10 — split moves, worked hours do not, bounds reject, empty restores, Sweetleaf and Veent unaffected | Agent-Probe | 1, 2, 3 (display-only holds across a threshold change), 20 |
| §1.11.7 mutation table (12 rows) confirmed RED and reverted | Agent-Probe | all Amendment 1 guards |

**Known gaps** (recorded, not silently accepted):

| Gap | Why | Resolution |
|---|---|---|
| Real-device GPS accuracy behaviour | Cannot be automated; Playwright's `setGeolocation` supplies a synthetic fix with no accuracy variance | Agent-Probe M8 covers the happy path on a real browser. Backlog stub: `web-punch-real-device-accuracy_NOTE_17-08-26.md` — verify on an actual phone before the food-service rollout. Gate stays **CONDITIONAL** for criterion 6. |
| `TimesheetModal.svelte` `recalcRow` (engine C) has no test at all | Pre-existing, and this cluster deliberately does not teach it AM/PM | Out of scope per SPEC. Backlog stub: `timesheet-modal-engine-c-coverage_NOTE_17-08-26.md`. |
| Non-HTTPS behaviour of `navigator.geolocation` | Cannot be exercised on `localhost` (a secure context by browser rule) | Criterion 10 is proven at the *write path* by C7 — the server treats "no reading" identically however it arose. The browser half is a browser guarantee, not our code. Accepted. |

## Test Infra Improvement Notes

- The repo has no shared fixture directory for upload test inputs. Phase 2 should create
  `tests/fixtures/backlog/` with `valid.csv`, `formula-injection.csv`, `malformed.csv`, and
  `binary.csv`, and note it here for reuse.
- `tests/unit/punch-access.test.ts:57-65` is the canonical example of where-shape mock
  discrimination. Reference it from the two new mocked suites so the pattern spreads rather than
  being rediscovered.
- No unit test currently imports a `+page.server.ts` `actions` export directly. B13–B16 and
  C7–C12 will establish that pattern; if it proves awkward, record the friction here.

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/timesheet-capture/active/timesheet-capture-162-177-200_17-08-26/timesheet-capture-162-177-200_PLAN_17-08-26.md`
2. **Last completed phase or step:** none — PLAN written, no code changes on
   `feat/timesheet-capture-162-177-200` (branch is clean, 2 doc commits).
3. **Validate-contract status:** written (CONDITIONAL, 17-08-26; E1–E9 and P1–P8 binding).
   **Amended after validation** — see `### Amendment 1` at the top of `## Validate Contract`
   and §1.11. The next VALIDATE pass must re-check exactly one row: the "`MIN_AM_PM_GAP_MS` =
   30 min is safe as specified" verified claim.
4. **Supporting context files loaded:** `research-findings_REF_17-08-26.md` and
   `timesheet-capture-162-177-200_SPEC_17-08-26.md` in this task folder; `CLAUDE.md`;
   the twelve source files quoted above.
5. **Next step for a fresh agent:** re-run VALIDATE against §1.11 only (the rest of the plan is
   already contracted). Then execute **Phase 1 only**, including the suffixed Amendment 1 steps,
   stopping at the §1.9 gate. Do not begin Phase 2 until all four CI gates are green and the
   §1.7 mutation checks have each been confirmed RED and reverted. Commit each phase separately
   (three commits, one PR) so a phase can be reverted independently.

## Validate Contract

Status: CONDITIONAL
Date: 17-08-26
date: 2026-08-17
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 5/7 signals present (S2 schema/API surface, S4 phase program, S5 depth requested,
S6 high-risk classes, S7 5+ files) would normally select parallel subagents for the read-only
two-layer fan-out. The Agent/Task tool was DISABLED in the validating session, so the Layer 1
dimension checks and the three Layer 2 phase-feasibility checks were executed sequentially
in-thread against live source. No coverage was dropped; only wall-clock time was spent.

### Amendment 1 — plan changed AFTER this contract was written

**Date:** 17-08-26 (same day, after the VALIDATE pass below). **Author:** PLAN, on direct user
instruction. **Nothing in this contract has been deleted or rewritten** — this entry records what
moved underneath it so the next VALIDATE pass knows exactly what to re-check.

**What changed:** the AM/PM gap threshold became per-organization. Full detail in **§1.11**.
- New nullable `Organization.amPmMinGapMinutes Int?` (NULL = built-in default). Populated table,
  but a catalog-only `ADD COLUMN` — no index, no default, no rewrite.
- `derive.ts`: `MIN_AM_PM_GAP_MS` → exported `DEFAULT_AM_PM_MIN_GAP_MINUTES`; `splitAmPmBlocks`
  takes the threshold as a parameter; new `amPmMinGapMs?: number` on `DeriveInput`; new
  `AM_PM_MIN_GAP_FLOOR`/`CEILING`/`isValidAmPmMinGap`.
- `attendance/index.ts`: two **existing** org `select`s widened (`:173`, `:438`). **Zero new
  queries.**
- New writer `setOrgAmPmMinGap` in `attendance/schedules.ts`; new `setAmPmMinGap` action and
  threshold card on `/settings/schedules`.
- New specs A9–A13 and a new file `tests/unit/attendance-ampm-gap-setting.test.ts` (A14–A20),
  plus a 12-row mutation table (§1.11.7) and manual step M1b (§1.11.11).
- New risks **R10** (a misconfigured threshold re-splits a tenant) and **R11** (a threshold change
  does not retroactively re-split stored days).
- Checklist steps are **suffixed** (1a, 3a, 3b, 5a, 6a, 7a, 8a, 8b, 9a, 10a, 12a, 14a, 15a), never
  renumbered, precisely so this contract's E1→item 13, E2→item 11, E5→item 15 and E7→item 12
  anchors still resolve.

**SPEC status:** Decision 4 is **half superseded by direct user instruction dated 2026-08-17**.
Org *gating* remains `isFoodServiceOrg()` exactly as Decision 4 requires. Only the *threshold*
moves to a column. SPEC §Out Of Scope's "no new `Organization` column/flag for food-service
gating" is still literally true — this column does no gating.

**Effect on this contract's findings — re-check list for the next VALIDATE:**

| Finding | Status after Amendment 1 |
|---|---|
| E1–E9 | **All still valid, none invalidated.** E7's A2 rewrite is unaffected: adding `amPmMinGapMs` to `DeriveInput` adds no key to `AttendanceDayResult`, so "deep-equal after deleting the four AM/PM keys" still describes an implementable test. |
| P1 (`correctDay` non-`editingTimes` branch leaves AM/PM stale) | **Still valid, and now broader.** R11 is a second route to a stale split. Fold both into one resolution. |
| P2, P3, P4, P5, P6 | Unaffected (Phase 2 / Phase 3). |
| P7 (seed scripts write `AttendanceDay`) | Still valid, and reinforced — those scripts also bypass the threshold. Harmless: the columns stay nullable. |
| P8 (populated-table push; `BODY_SIZE_LIMIT`) | Still valid, **not worsened**. `organizations` is populated (3 rows) but `ADD COLUMN` with no default/index is not the `time_logs` unique-index case P8 is about. |
| Verified claim "`MIN_AM_PM_GAP_MS` = 30 min is safe as specified" — verdict SAFE | **PARTLY SUPERSEDED — the one real invalidation.** Its *conclusion* survives: worst case is still a display error, because D2 (display-only) is untouched. Its *reasoning* does not: "the failure is asymmetric — you get no split rather than a wrong one" was true only for a fixed 30. An operator-set 5 can now manufacture a wrong split. Re-check this row. See R10. |
| "What this coverage does NOT prove" — "nor that 30 minutes is the right threshold for any actual tenant" | Still true, now by design: the amendment moves the choice to the operator without proving the operator's choice. |
| Every other Verified Claim | Unaffected. |

### Test Gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| 1 | AM/PM boundary = longest qualifying mid-day gap | Fully-Automated | `pnpm test` — `tests/unit/attendance-am-pm-split.test.ts` A1, A3, A5, A7, A8 | A |
| 2 | `splitAmPm: false` leaves the pre-#162 result untouched | Fully-Automated | `pnpm test` — A2 **rewritten** per E7, plus `attendance-derive` / `attendance-autoderive` / `attendance-correct-derive` / `attendance-schedule-fallback` re-run green with zero edits | B |
| 3 | "Days of Work" and every payroll bucket are identical with the flag on and off | Fully-Automated | `pnpm test` — `tests/unit/payroll-am-pm-days-of-work.test.ts`, **extended per E1** to assert the `buildAttendanceInput` seam directly | B |
| 4 | Engine A / engine B parity on the AM/PM punch set | Fully-Automated | `pnpm test` — `tests/unit/hours-engine-parity-am-pm.test.ts` | A |
| 5 | Single-punch partial day does not throw | Fully-Automated | `pnpm test` — A6 | A |
| 6 | A WEB punch persists latitude/longitude/accuracy/capturedAt | Hybrid | `pnpm test` — `punch-location-capture` C1; then `pnpm test:e2e -g "timesheet-punch-location"` — precondition: `./start.sh` + `pnpm db:seed:e2e` + a Playwright browser | A |
| 7 | A location failure never costs the employee their punch | Fully-Automated | `pnpm test` — `punch-location-route` C7, C8 | A |
| 8 | Denied permission still records the punch | Hybrid | `pnpm test:e2e -g "timesheet-punch-location"` permission-denied case — precondition: seeded DB + browser | A |
| 9 | Accuracy is never rendered as bare coordinates (server half) | Fully-Automated | `pnpm test` — `punch-location-route` C8, C9 | A |
| 9 | Accuracy qualifier is actually **rendered** (display half) | Agent-Probe | Manual script M8 step 3 — read the status line and the Recent-punches row | D |
| 10 | No reading present → graceful server-side handling | Fully-Automated | `pnpm test` — `punch-location-route` C7 | A |
| 11 | Location is not visible to a stranger | Fully-Automated | `pnpm test` — existing `tests/unit/punch-access.test.ts`, re-run unchanged | A |
| 11 | Self-visibility of one's own location | Agent-Probe | Manual script M11 | C |
| 12 | Discord and MANUAL punches carry no location | Fully-Automated | `pnpm test` — `punch-location-capture` C2, `punch-location-route` C11, plus the B6 assertion that no `createMany` record has a `latitude` key | A |
| 13 | A backlog CSV applies rows and materialises days | Fully-Automated | `pnpm test` — `attendance-backlog-import` B6, **extended per E8** to assert the `+08:00` timestamp values | B |
| 14 | An out-of-org employee number is rejected and never written | Fully-Automated | `pnpm test` — `attendance-backlog-import` B7 (where-shape mock, mandatory) | A |
| 15 | Locked and hand-corrected days are refused before any write | Fully-Automated | `pnpm test` — `attendance-backlog-import` B8, B9 (where-shape mocks, mandatory) | A |
| 16 | Re-upload is idempotent (app layer) | Fully-Automated | `pnpm test` — `attendance-backlog-import` B10, **converted to a where-shape mock per E8** | B |
| 16 | Re-upload is idempotent (DB constraint layer) | Known residual | — the unique index cannot be exercised by a mocked-`db` unit test | D |
| 17 | One bounded audit summary row per import | Fully-Automated | `pnpm test` — `attendance-backlog-import` B11, **fixture extended past 20 rejections per E8** | B |
| 18 | `MANAGE_HR` + food-service gate on the import action | Fully-Automated | `pnpm test` — `attendance-backlog-rbac` B13, B14, B15, asserted against the `actions` **export** | A |
| 19 | Malformed / hostile / oversize files are rejected with reasons | Fully-Automated | `pnpm test` — `attendance-backlog-parse` B2–B5 + `attendance-backlog-rbac` B16 | A |
| 20 | Veent is untouched by all three issues | Fully-Automated | `pnpm test` — A2 + B14 + C11, the three negative controls | A |
| 20 | Veent is untouched, observed end-to-end | Agent-Probe | Manual script M2, M7 — **M2 step 2 corrected per E6** | B |
| all | Four CI gates, in order, per phase | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test` — each exits 0, CI stops at the first failure | A |
| all guards | Every guard is proved by a mutation confirmed RED and reverted | Agent-Probe | §1.7, §2.5, §3.6 mutation tables **plus the eight additions in E5** | B |
| — | CSV export gains 4 columns for food-service orgs only, uniform key set on every row | Fully-Automated | **NEW test required per E2** in `tests/unit/reports-csv.test.ts` | B |
| — | Cross-tenant punch cannot be written by a cross-org account | Fully-Automated | **NEW assertion required per E3** in `punch-location-route` | B |
| — | Size and row caps bound the work before it happens | Fully-Automated | **NEW assertions required per E4** in `attendance-backlog-rbac` B16 | B |
| — | `db push` adding a unique index to a POPULATED `time_logs` | Known residual | — local `time_logs` has 0 rows; cannot be proven on this machine | D |
| — | Production `BODY_SIZE_LIMIT` admits a 2 MB multipart body | Known residual | — `vite dev` does not apply the adapter-node limit | D |
| 6 | Real-device GPS accuracy variance | Known residual | — Playwright `setGeolocation` supplies a synthetic fix with no accuracy variance | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist / by an execute-agent instruction below)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- Attendance derive engine (`derive.ts`): Fully-automated: `pnpm test` — `attendance-am-pm-split` A1–A8
- Payroll seam (`attendance/input.ts` → `payroll/calculator.ts`): Fully-automated: `pnpm test` — `payroll-am-pm-days-of-work`
- Attendance page + CSV export: Fully-automated: `pnpm test` — new `reports-csv` case (E2) | Agent-probe: M1, M2
- CSV backlog import service: Fully-automated: `pnpm test` — `attendance-backlog-parse` + `attendance-backlog-import`
- Import RBAC + org gate: Fully-automated: `pnpm test` — `attendance-backlog-rbac`
- Web punch service + route: Fully-automated: `pnpm test` — `punch-location-capture` + `punch-location-route`
- Web punch browser behaviour: Hybrid: `pnpm test:e2e` — precondition: `./start.sh` + `pnpm db:seed:e2e`
- Prisma schema push: Hybrid: `pnpm db:push && pnpm prisma generate && pnpm check` — precondition: `veent-db-5434` up
- Populated-table push + prod body-size limit + real-device GPS: known-gap: documented

Dimension findings:
- Infra fit: CONCERN — every referenced path resolves and all four CI gate scripts exist verbatim in `package.json`; but `svelte.config.js` sets only `{ out: 'build' }`, so `@sveltejs/adapter-node`'s 512 KB default `BODY_SIZE_LIMIT` may reject the 2 MB CSV in production while `vite dev` accepts it (F3b), and local `time_logs` has 0 rows so the populated-table `db push` is unproven (F10).
- Test coverage: CONCERN — the pure-function coverage is genuinely mutation-honest, but the CSV export change has NO automated gate (F5), 8 guards have no named mutation (F7), 5 mocked assertions beyond the 5 the plan pre-flagged cannot fail (F8), and A2 is unimplementable as written (F8).
- Breaking changes: CONCERN — "the Discord route shows zero changed lines" is CONFIRMED, and the punch behaviour for the existing caller is byte-identical; but §3.2 step 5 adds `hasLocation` to the audit `newValue` for EVERY punch, so Discord audit rows change shape in a file with a zero-line diff (F-claim2). `papaparse` is confirmed absent from the tree with zero runtime dependencies, though its stated size is wrong by ~6× (F12).
- Security surface: CONCERN — self-scoping is CONFIRMED safe (no `employeeId` in the form, employee resolved from `locals.user.id`, `(app)/+layout.server.ts` enforces the session); but the resolution is NOT org-scoped and `profile/+page.server.ts:29-31` carries an explicit comment saying that is wrong for cross-org accounts (F2), and both import caps are enforced AFTER the work they exist to bound (F3).
- Section 1 feasibility (Phase 1 — #162): CONCERN — mechanically feasible, every quoted line reference verified findable (`derive.ts:19-21`, `:47-63`, `:65-83`, `:130-150`, `:162-188`, `:262`; `index.ts:258`, `:287`; `+page.svelte` team `<thead>` 468 / `<tbody>` 480 / colspan 592, per-employee `<thead>` 606 / `<tbody>` 619 / colspan 748 — both colspans present and both attributions correct). Gaps: `correctDay`'s non-`editingTimes` branch leaves AM/PM stale (F4); no automated export test (F5); M2 step 2 asserts 8 `<th>`s where an HR user gets 9 (F6). Highest-risk edit: adding the four fields to `data` in `deriveRange` — mitigated because one object feeds both the `create` and `update` arms of the upsert (verified at `index.ts:268-291`).
- Section 2 feasibility (Phase 2 — #200): CONCERN — feasible; `toFail`'s allow-list is exactly `[400, 404, 409]` as stated, `requireFoodServiceOrg`/`requireAnyCapability` exist and throw 404/403 as described, `exportToCSV`'s `Object.keys(rows[0])` trap is real. Gaps: cap ordering (F3), the read-side formula regex is not the mirror it claims to be and duplicates a module-private constant (F9), `importBacklog` vs `importBacklogCsv` naming inconsistency (F13), the 62-day span guard has no test and no mutation (F7). Highest-risk edit: step 5's lock/manual-edit pre-check — must reject BEFORE any `TimeLog` write, which R3 depends on.
- Section 3 feasibility (Phase 3 — #177): CONCERN — feasible; `Employee.userId` is `@unique` so `findUnique` compiles, `PunchSource` already carries `WEB` and `MANUAL`, `canTouchEmployee` gates the punches API at `+server.ts:33`, and `tests/e2e/timesheet-punch.spec.ts` and `timelog-replay.spec.ts` both exist as the cited patterns. Gaps: the unlisted `/profile` `listPunches` caller breaks the §3.9 gate (F1), missing org scoping (F2), "exactly one of `discordId`/`employeeId`" is required by Public Contracts and checklist item 28 but never implemented in §3.2 step 1 (F7). Highest-risk edit: widening `recordPunch` — mitigated because the Discord call site passes only `discordId` and every new field is optional.

Open gaps:
- CSV export column-set drift (R4): no automated gate as planned — resolved by execute-agent instruction E2 in this cycle.
- Accuracy-qualifier rendering (criterion 9, display half): Agent-Probe only via M8 — accepted; the server half is fully automated by C9.
- DB-level dedup backstop (criterion 16, constraint layer): known-gap — a mocked-`db` unit test cannot exercise a Postgres unique index. Covered indirectly by manual step M4.
- `db push` adding a unique index to a POPULATED `time_logs`: known-gap — local `time_logs` has 0 rows, so a green local push proves nothing about staging/prod. `prisma db push` builds the index without `CONCURRENTLY` (ACCESS EXCLUSIVE lock). Precedent: #236.
- Production `BODY_SIZE_LIMIT`: known-gap — `vite dev` does not apply the adapter-node limit, so no local test can detect the divergence.
- Real-device GPS accuracy behaviour: known-gap, already recorded by the plan — backlog stub `web-punch-real-device-accuracy_NOTE_17-08-26.md`.
- `TimesheetModal.svelte` engine C has no test at all: known-gap, pre-existing and explicitly out of scope — backlog stub `timesheet-modal-engine-c-coverage_NOTE_17-08-26.md`.
- Non-HTTPS `navigator.geolocation`: accepted as a browser guarantee, not this code's behaviour.

What this coverage does NOT prove:
- `pnpm test` (vitest, `environment: node`, no typecheck step) does NOT typecheck. A mutation that breaks types still runs, and `svelte-check` covers neither `scripts/**` nor `prisma/**` (precedent: #282). Two seed scripts write `AttendanceDay` and would not be caught.
- `attendance-am-pm-split` proves the boundary rule on synthetic punch arrays. It does NOT prove that real tenant punch data produces sensible AM/PM blocks, nor that 30 minutes is the right threshold for any actual tenant.
- `payroll-am-pm-days-of-work` proves the payroll seam ignores AM/PM **today**. It does NOT prevent a future `select`-less reader from being added upstream of `payroll/calculator.ts`. The display-only property is a convention held by the schema comment, not an enforced constraint.
- `attendance-backlog-import` mocks `$lib/server/db`. It proves the service's call shapes and branch logic. It does NOT prove any Prisma query is valid SQL, that `@@unique([dedupKey, employeeId])` behaves as expected, that `createMany({ skipDuplicates: true })` absorbs a real race, or that `$transaction` rolls back correctly.
- `attendance-backlog-rbac` and `punch-location-route` import the `actions` export. They prove the guard runs before the service call. They do NOT prove SvelteKit routes the form POST to that action, that `enctype="multipart/form-data"` is set, or that the file reaches the handler at all.
- `punch-location-capture` proves `recordPunch` writes the right `data`. It does NOT prove Postgres accepts `Float` for the coordinates, nor that `src/hooks.ts` transports them correctly to the client — no test exercises the transport hook with a `Float` field (these would be the first `Float` columns in the schema).
- The e2e location test uses Playwright `setGeolocation` — a synthetic fix. It does NOT prove real-device GPS behaviour, accuracy variance, timeout behaviour under poor signal, or the 9-second watchdog firing.
- No gate proves the CSV export's uniform-key rule until E2 is implemented; until then a conditional key dropping columns for later rows would ship green.
- No gate proves the two `colspan` fixes. A wrong colspan renders a misaligned "no rows" placeholder and no test sees it.
- `grep -rn "listPunches" src/` as written in §3.9 is not a valid gate — it returns 4 lines today (see E9).
- Manual steps M1–M11 are Agent-Probe: they prove one operator saw one outcome once, on seeded data, on `localhost`.

Gate: CONDITIONAL (13 concerns, 0 FAILs; user accepted with the nine execute-agent instructions below recorded as binding)
Accepted by: user (VALIDATE invocation, 17-08-26: "Present the validate-menu, then write the contract section into the plan file"). Accepted concerns, by name: F1 `/profile` third `listPunches` caller; F2 punch route not org-scoped; F3 cap ordering + prod body-size limit; F4 `correctDay` non-`editingTimes` branch; F5 no automated CSV export gate; F6 M2 step 2 assertion wrong; F7 eight guards with no named mutation; F8 five unflagged vacuous mocks + A2 unimplementable; F9 formula regex is not a true mirror; F10 populated-table push unproven; F11 seed scripts write `AttendanceDay` unlisted; F12 papaparse size misstated; F13 `importBacklog`/`importBacklogCsv` naming.

### Execute-Agent Instructions (binding — each must be applied and reported in the phase report)

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Extend `tests/unit/payroll-am-pm-days-of-work.test.ts` to assert the payroll **seam**, not just the derive engine: build two `AttendanceDay`-shaped rows differing ONLY in the four AM/PM columns, run both through `accumulateDay` / `buildAttendanceInput`'s accumulator shape, and assert the resulting `AttendanceInput` objects are deep-equal. This is the only mechanical proof that display-only holds; the schema comment is not a gate. | Phase 1, checklist item 13 |
| E2 | Add a case to `tests/unit/reports-csv.test.ts` proving the export's uniform-key rule: build a row set where at least one day is `null`, run it through the `amPmCols()` spread + `exportToCSV`, and assert (a) the header line contains `AM In,AM Out,PM In,PM Out` when `showAmPm`, (b) EVERY line has the same field count, (c) the header is absent when `showAmPm` is false. Risk R4 currently has no automated gate at all. | Phase 1, checklist item 11 |
| E3 | In `src/routes/(app)/punch/+page.server.ts`, resolve the employee with the **org-scoped** form used by `profile/+page.server.ts:29-31` — `db.employee.findFirst({ where: { userId: user.id, organizationId: user.organizationId }, select: { id: true } })` — NOT `findUnique({ where: { userId } })`. Apply in BOTH `load` and the `punch` action. A cross-org account (the CEO, #224) would otherwise punch into their home tenant while the active org is a different one. Add an assertion to `punch-location-route` C12 covering the cross-org case, and copy the profile page's comment so the reason survives. | Phase 3, checklist items 32 and 36 |
| E4 | Move both import caps ahead of the work they bound. In the `importBacklog` **action** (`attendance/+page.server.ts`), check `file.size > MAX_IMPORT_BYTES` → 413 and the `.csv` extension → 415 BEFORE `await file.text()`. In `parseBacklogCsv`, pass papaparse `{ preview: MAX_IMPORT_ROWS + 1 }` so the row cap bounds the parse instead of being checked after it. Keep the in-service `file.size` check as a second layer for any future caller. Extend B16 to assert `file.text()` is never called on an oversize upload. | Phase 2, checklist items 18–20 and 25 |
| E5 | Add these eight mutation rows and run each one RED-then-revert: (1) 62-day span guard — raise the limit past the fixture; (2) NUL-byte rejection — delete the check; (3) BOM strip — delete it; (4) `.csv` extension check — delete it; (5) `toFail` 413/415 widening — revert to `[400,404,409]` and assert a 500 does NOT reach the user; (6) "exactly one of `discordId`/`employeeId`" — call `recordPunch` with neither and assert a clean 400, not a Prisma 500; (7) accuracy-qualifier rendering — remove the "(accuracy unknown)" branch; (8) `amPmCols` uniform spread — apply it only to non-null days and assert E2's field-count check goes red. | Each phase's mutation-check step (items 15, 26, 38) |
| E6 | Correct manual step M2 step 2 before running it. `+page.svelte:616` is `{#if data.canManage}<th …></th>{/if}`, so a Veent **HR** user sees **9** `<th>`s, not 8. Assert 9 headers and that none of them reads `AM In`/`AM Out`/`PM In`/`PM Out`. Assert something positive — count the headers AND name the four that must be absent. | Manual script, before M2 |
| E7 | Rewrite spec A2. "The whole result object deep-equals the pre-change baseline" is unimplementable once `AttendanceDayResult` gains four keys. Implement it as: call `deriveAttendanceDay` twice on the same input, once with `splitAmPm: true` and once with `false`, and assert the two results are deep-equal **after deleting the four AM/PM keys from both**. That proves the flag changes nothing else, which is what criterion 2 actually needs. | Phase 1, checklist item 12 |
| E8 | Harden four mocked specs that cannot currently fail. **B10**: replace the flat `timeLog.findMany.mockResolvedValue` with a `mockImplementation(({ where }) => …)` that returns keys only when `where.dedupKey.in` actually contains them. **B6**: add an assertion on the literal `timestamp` values written, proving the `` new Date(`${date}T${hhmm}:00+08:00`) `` construction — nothing else covers PHT conversion, and it is the most likely thing to be wrong. **B11**: use a fixture with more than 20 rejections so `rejectedSample.length <= 20` is a real bound rather than a trivially-true assertion on an empty array. **B12**: branch on the `where` shape, not call count. Reference `tests/unit/punch-access.test.ts:57-65` in a comment in each file. | Phase 2, checklist items 24–25 |
| E9 | Fix §3.9's broken pre-merge gate and §3.5's incomplete table. `src/routes/(app)/profile/+page.server.ts:44` is a THIRD `listPunches` caller the plan does not list — `grep -rn "listPunches" src/` returns 4 lines today and 6 after Phase 3, so the "exactly 2 call sites" gate fails against correct code. Replace it with a gate that counts CALL sites and expects 3, and add a row to §3.5 recording that `/profile` is self-scoped (`userId` + `organizationId`) and that its `.map()` at :48-56 projects only `id/type/label/source/dayKey/at`, so latitude and longitude never reach the client. If a future change makes `/profile` return raw rows, that row becomes a leak — say so in the table. | Phase 3, before the §3.9 gate |

### Plan Corrections (apply during EXECUTE; each is a documented plan defect, not a discovery)

| # | Correction | Where |
|---|---|---|
| P1 | `correctDay` has a second branch. `index.ts:425` computes `editingTimes = 'timeIn' in data \|\| 'timeOut' in data`; when FALSE, `write = { ...data }` and the AM/PM columns are left untouched while `manuallyEdited: true` is still written. `correctSchema` permits editing `status`/`regularHours`/`overtimeHours`/`note` with no date, so this branch is reachable. Either clear the four columns in that branch too, or extend §1.3c's comment to state that a non-time correction deliberately preserves the existing split (consistent with how it already preserves `timeIn`/`timeOut`). Do not leave it unstated. | §1.3c |
| P2 | Stop calling the read-side regex a "mirror of `reports.ts:622`". The real constant is `/^[=+\-@\t\r]/`; the plan's copy is `/^[=+\-@]/`. The defence still works because `.trim()` strips `\t` and `\r` first, but `FORMULA_PREFIX` is module-private in `reports.ts`, so this creates a second copy that can drift. Either export the constant from `reports.ts` and import it, or state plainly that this is an independent read-side check with its own character class. | §2.3c |
| P3 | `papaparse` is **259 KiB unpacked** (registry `dist.unpackedSize = 265221`, v5.6.0), not "~45 kB". Zero runtime sub-dependencies is CONFIRMED. Correct the number — the justification is on the record per the SPEC. | §2.1 |
| P4 | Name collision: §2.3d exports `importBacklog`, §2.4 calls `importBacklogCsv`, and the form action is also named `importBacklog`. Pick one service-function name and use it consistently, and keep the action name distinct from it. | §2.3d / §2.4 |
| P5 | §3.2 step 1 does not implement the "exactly one of `discordId`/`employeeId`" runtime throw that Public Contracts and checklist item 28 both require. With both absent, `findUnique({ where: { discordId: undefined } })` raises a Prisma validation error (500), not a clean 400. Add the explicit guard at the top of `recordPunch`. | §3.2 step 1 |
| P6 | §3.2 step 5 adds `hasLocation: Boolean(input.location)` to the audit `newValue` for EVERY punch, so Discord audit rows gain `hasLocation: false` even though `log/+server.ts` has a zero-line diff. Either scope it (`...(input.location ? { hasLocation: true } : {})`) or state in the plan that the Discord audit shape changes. No existing test asserts that payload, so nothing goes red either way — which is exactly why it must be written down. | §3.2 step 5 |
| P7 | Add `scripts/seed-attendance-demo.ts:101` (upsert) and `scripts/seed-payslip-demo.ts:58` (createMany) to the `AttendanceDay` writer set in §1.3c. Both write without AM/PM — harmless because the columns are nullable, but the upsert leaves stale values on re-seed, and `pnpm check` covers neither `scripts/**` nor `prisma/**` (#282). | §1.3c |
| P8 | Record in §2.2 and §Risks that local `time_logs` has **0 rows**, so a green local `pnpm db:push` proves nothing about the populated staging/prod table, and that `prisma db push` creates the unique index WITHOUT `CONCURRENTLY` (ACCESS EXCLUSIVE lock). Note also that `svelte.config.js` passes only `{ out: 'build' }` to `@sveltejs/adapter-node`, whose `BODY_SIZE_LIMIT` defaults to 512 KB — verify the deployment sets it before trusting `MAX_IMPORT_BYTES = 2 MB`. `storage.ts` already permits 10 MB uploads, so it is probably already set; confirm rather than assume. | §2.2, §Risks (new R9) |

### Verified Claims — evidence on record

| Claim | Verdict | Evidence |
|---|---|---|
| AM/PM is display-only; a wrong boundary can never produce a wrong peso | **CONFIRMED** | Complete reader enumeration: `input.ts:35`/`:62` return whole rows but `accumulateDay:13-25` enumerates 11 named fields; `payroll/payslip-fetch.ts:134` uses a 6-field `select`; `reports.ts:384`/`:429` use narrow `select`s; `dashboard/+page.server.ts:62` is a `groupBy status`; `team/+page.server.ts:63` selects 3 fields; `attendanceEntriesForRange` (`index.ts:347`) reads whole rows but its `.map()` projects 6 named fields, so AM/PM never reaches `TimesheetEntry`; `payroll/calculator.ts` consumes `AttendanceInput`, never a row. Only `listAttendanceDays` (`:99`) and `listTeamDay` (`:113`) pass whole rows on, and both terminate at the page and the CSV export. **No path exists.** Residual: this is a convention, not a constraint — see E1. |
| The Discord route shows zero changed lines | **CONFIRMED** | `log/+server.ts:48-57` passes `discordId`, `punchType`, `timestamp`, `discordMessageId`, `source`. Under the widened signature every one is still valid and `discordId?: string` still accepts it. No argument moves. |
| Behaviour for the existing Discord caller is unchanged | **CONFIRMED for the punch; REFUTED for the audit row** | Body walk: the `findUnique` branch takes the `discordId` arm when `employeeId` is undefined — identical query. The generalised pre-check `if (input.discordMessageId \|\| input.dedupKey)` is false/false when `messageId` is absent (it is `.optional()` at `log/+server.ts:23`) and otherwise takes the `discordMessageId` arm, producing the identical `where` — identical. `dedupKey: undefined` in `create` is a Prisma no-op. **But** the audit `newValue` gains `hasLocation` for every punch — see P6. |
| Postgres treats NULLs as distinct in a composite unique index | **CONFIRMED empirically** | Live scratch test on `veent-db-5434`: `create unique index on _vc_scratch(a,b)` then three rows with `a = NULL, b = 'e1'` — `INSERT 0 3`, all accepted. A non-NULL duplicate `('k','e1')` was correctly rejected with `duplicate key value violates unique constraint`. Scratch table dropped. The live precedent `time_logs_discordMessageId_employeeId_key` confirms the same shape already ships. |
| `db push` adding this to a POPULATED table succeeds | **PLAUSIBLE, not confirmed** | `select count(*) from time_logs` returns **0** locally. Cannot be proven on this machine. See P8 and the Open Gaps entry. |
| Twin doors: lock/manual-edit refusal wired at both `deriveRange` and `correctDay` | **CONFIRMED, with a seventh case found on the READ side** | Live enumeration. `AttendanceDay` writers in `src/`: exactly five — `deriveRange` upsert (`index.ts:287`, covered §1.3b), `correctDay` update (`:499`, covered §1.3c but see P1), `resetDayToDerived` (`:538`, writes `manuallyEdited` only), `lockRange` (`:562`) and `unlockRange` (`:591`), both writing `isLocked` only. `TimeLog` writers in `src/`: `recordPunch` create (`timelog.ts:69`), `aggregateTimeLogsToTimesheet` updateMany (`:294`, `timesheetId` only), plus new `importBacklog`; also `scripts/seed-punches-demo.ts:161`. Guard-state writers check out: `isLocked` only from `lockRange`/`unlockRange`; `manuallyEdited` only from `correctDay` (true) and `resetDayToDerived` (false). **No open door on the write side.** The seventh case is `/profile` calling `listPunches` — see E9. |
| Proposed unit tests contain no vacuous mocks | **REFUTED** | Beyond the five the plan pre-flags (B7, B8, B12, C4, C10): B10, B6, B11 and C5 cannot fail as specified, and A2 is unimplementable. See E7 and E8. |
| Every guard names a mutation that turns a test red | **REFUTED** | Eight guards have no named mutation. See E5. |
| `papaparse` is not already in the tree, has no runtime sub-dependencies, and needs no `storage.ts` change | **CONFIRMED** (size misstated) | Absent from `package.json`, `pnpm-lock.yaml` and `node_modules`. Registry: v5.6.0 has NO `dependencies` field → zero runtime sub-dependencies. `@types/papaparse@5.5.2` depends only on `@types/node`, already a devDependency. `storage.ts` is an explicitly-called library, not a global upload hook — `ALLOWED_MIME:12-17`, `sniffMime:27`, `MAX_UPLOAD_BYTES:11` all verified where the plan says, and nothing routes form uploads through them automatically. Size is 259 KiB, not 45 kB — see P3. |
| No enum renamed; every new column nullable and additive; `prisma generate` mandated | **CONFIRMED** | `PunchSource` already contains `DISCORD`, `WEB`, `MANUAL`; `PunchType` contains `IN`, `OUT`, `BREAK_START`, `BREAK_END`. No `ALTER TYPE` needed, so no `scripts/migrate-*.ts`. All nine new columns are `?`. `package.json` confirms `db:push` = `dotenv -e .env.dev -- prisma db push`, `postinstall` = `prisma generate`, and the four CI gates exist verbatim with `lint` = `eslint .` (it does NOT run `format:check`). |
| `Float?` stays clear of the `Decimal` hook; no new `Decimal` field | **CONFIRMED** | `src/hooks.ts` `isDecimal()` duck-types on the presence of `d`, `e`, `s` AND a `toNumber` function — a plain JS number matches none of them, so `Float` bypasses the transport entirely. No `Decimal` field is introduced anywhere in the plan. Note these would be the schema's FIRST `Float` columns; no existing test exercises the hook with one. |
| `MIN_AM_PM_GAP_MS` = 30 min is safe as specified | **SAFE** | The failure is asymmetric. A sub-threshold gap makes `splitAmPmBlocks` return all-null (step 5), so a 20-minute-changeover tenant sees NO split rather than a wrong one. Combined with display-only, the worst case is a missing label corrected by a `Refresh` after the constant changes. Record the failure direction in the constant's comment; the upgrade seam is the `Organization` flag `orgs.ts` already documents. |
| `correctDay` collapsing AM/PM is safe, recoverable via `resetDay` | **SAFE** | Recovery verified: `resetDayToDerived` (`index.ts:521-551`) clears `manuallyEdited` then calls `deriveRange(organizationId, { from: day.date, to: day.date, employeeId })`, which under §1.3b writes the split back. Two caveats to record: it refuses on a locked day and on a non-ACTIVE employee (both 409), so recovery is not universal, and it restores only what the punches support. Read-only AM/PM cells (§1.5) are the correct call — an editable cell would be a writer with no service-side handler. |
| The web punch prevents punching as another employee | **CONFIRMED** | `(app)/+layout.server.ts:8-10` redirects to `/login` when `locals.user` is absent. `Employee.userId` is `@unique`. The form carries no `employeeId` and the action never reads one; the id comes from `locals.user.id`. C10 pins it. **Separate gap:** the resolution is not org-scoped — see E3. |
| Read-side formula-injection rejection | **CONFIRMED it works; REFUTED that it is a "mirror"** | `reports.ts:622` is `/^[=+\-@\t\r]/`; the plan's copy is `/^[=+\-@]/`. Because `sanitizeCell` strips leading tabs then `.trim()`s (which removes `\t`, `\r`, `\n` and ` `), payloads like `\r=cmd` and `\t=HYPERLINK(...)` are still caught. No legitimate value in the six columns starts with `=`, `+`, `-` or `@`, so false positives are near-zero. Honest assessment: the defence is close to theatre — parsed cells become timestamps and employee-number lookups, never re-exported strings. Keep it as cheap garbage rejection; do not credit it as a load-bearing control. See P2. |
| Row-count and upload-size caps are enforced before any parsing work | **REFUTED** | §2.4 does `await file.text()` before `importBacklog` runs, so §2.3e step 1's `file.size` check happens after the whole body is decoded into memory. §2.3e step 3 checks `MAX_IMPORT_ROWS` after `parseBacklogCsv` has parsed the entire string. Both caps exist and both precede any DB read (the plan's literal claim), but neither bounds the work it exists to bound. See E4. |

### Amendment 1 Validation — targeted re-validation

Status: CONDITIONAL
Date: 17-08-26
date: 2026-08-17
generated-by: outer-pvl
supersedes: — (append-only; the 17-08-26 outer-pvl contract above is PRESERVED VERBATIM, E1–E9 and
P1–P8 unchanged. This block adds a scoped verdict on §1.11 only.)

**Scope:** `### Amendment 1` / §1.11 and its suffixed checklist steps (1a, 3a, 3b, 5a, 6a, 7a, 8a,
8b, 9a, 10a, 12a, 14a, 15a). Nothing else in the plan was re-validated.

**Net gate for the amendment: CONDITIONAL.** 0 FAILs, 10 CONCERNs. The amendment is mechanically
feasible, its two headline structural claims (zero new queries; `derive.ts` stays pure) are
CONFIRMED against live source, and its safety argument (D2 display-only) survives. What does not
survive is the mutation table: 3 of its 12 rows cannot turn any test red, and 1 more is only
half-covered — the same defect class the contract above recorded as REFUTED ("Every guard names a
mutation that turns a test red").

#### Item-by-item verdicts (ranked by severity)

| # | Claim under test | Verdict | Evidence |
|---|---|---|---|
| A-1 | Mutation row 1 (NULL falls back to the default) turns A9/A12 red | **REFUTED, twice** | A9–A13 live in `attendance-am-pm-split.test.ts`, which imports `deriveAttendanceDay` directly and never executes `index.ts` — mutating `index.ts` cannot make a pure spec red. Worse, the mutation itself is a no-op: Prisma returns `null` for a NULL Int, and `null * 60_000` is **0**, not `NaN`; derive.ts's own `> 0` guard already rejects 0 and falls back to the default. §1.11.7 explicitly forbids a mocked `deriveRange` spec, so this guard has **zero** automated coverage by construction. |
| A-2 | Mutation row 8 (delete `/^\d+$/`) turns A16 red on `'12.5'` and `'1e3'` | **REFUTED** | With the regex deleted: `'12.5'` → `Number.isInteger(12.5)` false → `fail(400)`; `'1e3'` → 1000 → out of bounds → `fail(400)`; `'abc'` → NaN → `fail(400)`; `'-30'` → `fail(400)`. **A16 stays green.** The regex's only *distinctive* rejections are `'1e2'`, `'0x1E'`, `'+45'` — every one of which otherwise coerces to a correct in-range integer. `isValidAmPmMinGap`'s `Number.isInteger`, not the regex, is what stands between a decimal and the database. §1.11.5's "the `/^\d+$/` test is doing real work" is overstated. |
| A-3 | A16 asserts `fail(400)` "with the bounds message" for all six inputs | **REFUTED — over-specified against correct code** | Against the §1.11.5 parse, `'12.5'`, `'1e3'` and `'abc'` return `'Enter a whole number of minutes.'`, NOT the bounds message. A16 as tabled goes red against a correct implementation. |
| A-4 | A12 proves the finite/positive fallback | **PARTIAL** | `NaN` and `Infinity` produce all-null through the comparison **even with the guard deleted** (`gap >= NaN` is false; `gap >= Infinity` is false). Only the `-1` and `0` cases are load-bearing, and both are caught by the `> 0` clause alone. **`Number.isFinite` is untested by any spec.** |
| A-5 | §1.11.8 twin door: `correctDay` reads the threshold too | **CONFIRMED structurally, VACUOUS behaviourally** | `correctDay` builds `punches` from at most one `timeIn` + one `timeOut` (`index.ts:460-462`), so `workSegs.length <= 1` and `openWork === null` — `splitAmPmBlocks` returns all-null **for every threshold value**. The `amPmMinGapMs` wiring in `correctDay` can never change any output. Harmless and defensible for symmetry (a future multi-pair correction form would need it), but it is unprovable and no test or manual step covers it. Say so rather than counting it as a covered twin. |
| A-6 | A15 / A17 are implementable as tabled | **CONCERN — internally inconsistent** | A15 asserts "`setOrgAmPmMinGap` called with `null`" (a spy on the service) while A17 asserts "`organization.update` receives `{ where: { id: … }, data: … }`" (the real service running). Both hold only if the service module is **not** mocked. §1.11.7 says the file mocks `$lib/server/db` and `$lib/server/audit` — which is correct — but never states that `attendance/schedules` must stay real. If EXECUTE mocks it, mutation row 10 (delete the in-service bounds check) also goes uncaught. |
| A-7 | Mutation row 10 turns "A14's service case" red | **REFUTED — no such spec** | A14 as tabled is the pure `isValidAmPmMinGap` table only; it has no service case. |
| A-8 | Bounds 5–240 are defensible, and a value INSIDE the range cannot do real damage | **PLAUSIBLE — PLAN's concession is correct and the damage ceiling holds** | At floor 5, a 6-minute re-punch gap becomes the longest gap and manufactures a fake AM/PM boundary — PLAN concedes this at R10 and the concession is accurate. **D2 survives, confirmed structurally, not by assertion:** `splitAmPmBlocks` is a post-pass inserted after `result.timeOut = lastOut` and assigns only the four AM/PM fields; it cannot touch `workedHours` or any hour bucket. Combined with the contract's complete reader enumeration above, worst case is still a wrong label, never a wrong peso. M1b step 7's `worked_hours` byte-identical assertion is the mechanical proof and is correctly placed. **Strengthening PLAN missed:** the longest-gap rule means the threshold can only turn a split ON or OFF — it can never *move* an existing boundary, except in the step-4 dangling-IN case. That materially bounds R10 and should be recorded. **New surface PLAN missed:** §1.6 puts AM/PM into the CSV export, which leaves the app; a fake split can therefore reach a payroll processor's desk even though it can never reach `payroll/calculator.ts`. |
| A-9 | Ceiling 240 stops an operator turning the feature "silently off" | **REFUTED as stated** | It stops 600, not 240. A tenant whose genuine split-shift break is 3 hours, set to 240, gets no split, no error and no UI signal — exactly the failure the ceiling is argued to prevent, just at a smaller number. Accepted risk, but the argument as written claims more than it delivers. |
| A-10 | The §1.11.7 mock-discipline rationale | **CONCERN — misapplied** | The `organization.findUnique` where/select `mockImplementation` is the right pattern, but the `setAmPmMinGap` action never calls `findUnique` — only `load` does, and no spec covers `load`. A19 is honestly proved by its `organization.update` `where.id` assertion, not by the findUnique mock. Keep the rule; fix the reason. |

#### Claims CONFIRMED against live source (no action needed)

| Claim | Verdict | Evidence |
|---|---|---|
| Zero new queries; both call sites already fetch the org row | **CONFIRMED** | `index.ts:171-174` (`deriveRange`, hoisted above the employee loop) and `index.ts:436-439` (`correctDay`) are both pre-existing `db.organization.findUnique` calls with `select: { trackTardiness: true }`. `correctDay`'s sits INSIDE `if (editingTimes)` (`:427`) and so does its `deriveAttendanceDay` call (`:464`) — the new local is in scope with no restructuring. Widening either `select` adds no round trip. Plan's cited `:173`/`:438` are the `select` lines of those same calls. |
| `derive.ts` stays pure | **CONFIRMED** | The threshold arrives as `DeriveInput.amPmMinGapMs` and as `splitAmPmBlocks`'s third parameter; no module constant is closed over except the fallback default. `derive.ts` imports nothing and touches no DB today (`AttendanceDayResult`, `:65-83`), and the amendment adds no import. Callable with no DB and no org context, exactly like `enforceTardiness`. |
| Capability gate matches its neighbour | **CONFIRMED** | `setOrgTardiness` (`schedules.ts:70-84`) carries **no** in-service capability check. Every entry point on the page does: `load` `:13`, `create` `:31`, `toggleOrgTardiness` `:67`, `toggleTardiness` `:79` — all `requireAnyCapability(locals.user!.roles, 'MANAGE_HR')`. The new setter matches. (Plan cites `create` at `:30`; actual `:31`. Cosmetic.) The new setter's extra in-service `isValidAmPmMinGap` check is *validation*, not capability, and is correct. |
| The twin door is needed, not redundant | **CONFIRMED** | `/settings/schedules` `load` is `MANAGE_HR` only — there is **no** food-service gate anywhere on that route. `requireFoodServiceOrg` (`rbac.ts:19-20` → `error(404)`) on the new action is therefore genuinely load-bearing: a direct POST from a Veent HR account without it would write the column. The plan correctly places it OUTSIDE the try/catch, so the 404 propagates instead of becoming a `fail()`. |
| Input validation rejects the hostile set | **CONFIRMED** (see A-2 for the regex's real weight) | Empty → `null` before the regex (intended clear-to-default). `'abc'`/`'-30'`/`'12.5'`/`'1e3'`/`'+45'`/`' 4 5'` → rejected. `'  45  '` → trimmed to 45. JS `$` does not match before a trailing newline (no `m` flag), and `\d` without `u` is ASCII-only, so no Unicode-digit or newline bypass. `'99999999999999999999'` → in-range check rejects. Bounds sit far inside a PG `Int`. |
| `NaN`/negative cannot reach `splitAmPmBlocks`, and the derive.ts fallback is a genuine second layer | **CONFIRMED, three layers deep** | Layer 1 = the action parse; layer 2 = `isValidAmPmMinGap` inside `setOrgAmPmMinGap` (the only writer); layer 3 = the finite/positive fallback at the `splitAmPmBlocks` call site. `index.ts`'s `!= null` mapping cannot manufacture a `NaN` from a Prisma Int. Note layer 3 checks finite-and-positive only, **not** the 5–240 bounds — a value planted by raw SQL (as §1.11.10 step 4 itself does) is not re-bounded. Correct as defence in depth; do not credit it as bounds enforcement. |
| Prisma: nullable, additive, no default, no index, no enum change, `generate` mandated | **CONFIRMED** | `trackTardiness Boolean @default(true)` verified at `schema.prisma:297`; the new column lands after it. `Organization` gains one `Int?` — no `@@index`, no `@default`. No `ALTER TYPE` anywhere in the amendment, so the plan's standing "no `scripts/migrate-*.ts`" claim holds. §Prisma Contract's four-command sequence (`./start.sh` → `pnpm db:push` → `pnpm prisma generate` → `pnpm check`) is mandatory and checklist step 1a routes through step 2's push/generate. |
| P8's populated-table concern does not apply here | **CONFIRMED — genuinely does not apply** | `select count(*) from organizations` returns **3** live. But P8 is about (a) `prisma db push` building a **unique index** on populated `time_logs` without `CONCURRENTLY`, and (b) adapter-node `BODY_SIZE_LIMIT`. A nullable `ADD COLUMN` with no default is catalog-only on PG 11+: metadata write, brief `ACCESS EXCLUSIVE` lock, zero table rewrite on 3 rows. §1.11.9's assessment is right. |
| E1–E9 and P1–P8 all survive | **CONFIRMED** | Spot-checked the three specific claims: **(a) E7** — `AttendanceDayResult` (`derive.ts:65-83`) gains only the four AM/PM keys from §1.2b; `amPmMinGapMs` lands on `DeriveInput` (`:47-63`), an *input* type. E7's "deep-equal after deleting the four AM/PM keys from both" is unaffected. **CONFIRMED.** (b) **P1 and R11 are the same defect reached two ways** — both leave a stored `AttendanceDay` carrying an AM/PM split computed under superseded inputs. Folding them into one resolution is correct. **CONFIRMED.** (c) Checklist suffixing verified: items 11, 12, 13 and 15 are untouched, so E2→11, E7→12, E1→13, E5→15 still resolve. |
| R11's stale-value path is acknowledged and the recovery is reachable | **CONFIRMED, with one residual PLAN understates and one it overstates** | `deriveRange` skips `if (existing?.isLocked) continue` (`index.ts:249`) and `if (existing?.manuallyEdited) continue` (`:251`) — R11's citations are exact. Recovery IS reachable for a normal HR user: two **Refresh** buttons (`attendance/+page.svelte:358`, `:411`) hit a `MANAGE_HR` action that calls `deriveRange` (`+page.server.ts:166-172`). **Overstated:** a `manuallyEdited` day is recoverable — `resetDay` (`+page.server.ts:201-206`) clears the flag and re-derives. **Understated:** a **locked** day is the true dead end — `resetDayToDerived` refuses it with 409 (per the contract's own verified claim above), so a locked day keeps its old-threshold split permanently with no UI path back. R11 should name locking specifically. |

#### Amendment execute-agent instructions (binding, additive to E1–E9)

| # | Instruction | Trigger |
|---|---|---|
| A-E1 | Replace §1.11.7 mutation row 1. The stated mutation is a no-op (`null * 60_000` is `0`, and derive.ts's `> 0` guard already absorbs it) and targets `index.ts`, which no pure spec executes. Use instead: **in `index.ts`, delete the `amPmMinGapMs` key from the `deriveAttendanceDay({ … })` argument object in `deriveRange`** — and accept that **no automated test turns red**. Record it as a named residual proved only by manual step M1b step 7. Do not claim A9/A12 cover it. | Step 15a |
| A-E2 | Replace §1.11.7 mutation row 8. `/^\d+$/` has no reachable harmful bypass — every input it uniquely rejects (`'1e2'`, `'0x1E'`, `'+45'`) coerces to a correct in-range integer, and every harmful input is caught by `isValidAmPmMinGap`. Either **(a)** keep the regex, delete the mutation row, and change §1.11.5's justification to "cosmetic strictness; `Number.isInteger` in `isValidAmPmMinGap` is the actual gate", or **(b)** drop the regex entirely and rely on `isValidAmPmMinGap` plus a distinct message. Do not ship a mutation row that cannot go red. | Steps 9a, 15a |
| A-E3 | Correct A16. Split it into two assertions: `'12.5'`, `'1e3'`, `'abc'` → `fail(400)` with **`'Enter a whole number of minutes.'`**; `'4'`, `'241'`, `'-30'` → `fail(400)` with the **bounds** message. As tabled, A16 asserts the bounds message for all six and goes red against correct code. In both groups also assert `organization.update` was never called. | Step 14a |
| A-E4 | Strengthen A12. `NaN` and `Infinity` pass through the comparison to all-null with the guard deleted, so they cannot fail. Add a case that **can**: `amPmMinGapMs: -1` and `amPmMinGapMs: 0` against a punch set with a **10-minute** gap — with the guard the answer is no-split (default 30), without it a negative or zero threshold splits. State in a comment that `Number.isFinite` is unprovable through this surface and is retained as belt-and-braces. | Step 12a |
| A-E5 | In `tests/unit/attendance-ampm-gap-setting.test.ts`, mock **only** `$lib/server/db` and `$lib/server/audit`. Import the real `attendance/schedules` module so A15/A17 and mutation row 10 are all satisfiable through `organization.update` call assertions. Write this constraint as a comment at the top of the file. Rewrite A15's assertion as `organization.update` called with `data: { amPmMinGapMinutes: null }` rather than "`setOrgAmPmMinGap` called with `null`". | Step 14a |
| A-E6 | Add a mutation row for the service-layer bounds check that actually resolves: **delete `isValidAmPmMinGap` from `setOrgAmPmMinGap` and call the service directly with `241`** → a new spec A21 asserting the service throws 400 and `organization.update` is never reached. §1.11.7 row 10 currently points at "A14's service case", which A14 does not contain. | Steps 14a, 15a |
| A-E7 | Add the missing `load` coverage or name it a residual. Nothing in A9–A20 exercises the widened `settings/schedules` `load` (`showAmPmGap`, `amPmMinGapMinutes`, `amPmMinGapDefault`). Cheapest honest option: one spec asserting `load` returns `showAmPmGap: false` for `org_veent` and `true` for `org_jojo`, using the where/select-keyed `findUnique` mock §1.11.7 already specifies — that is the one place that mock pattern is actually needed. If skipped, record it under Open Gaps as display-only. | Step 14a |

#### Amendment plan corrections (additive to P1–P8)

| # | Correction | Where |
|---|---|---|
| A-P1 | State that `correctDay`'s `amPmMinGapMs` wiring **can never change an output**. The correction form expresses one pair (`index.ts:460-462`), so `workSegs.length <= 1`, `openWork === null`, and `splitAmPmBlocks` returns all-null for every threshold. Keep the wiring for symmetry, but stop counting it as a *covered* twin door — it is unprovable. | §1.11.8, row 2 |
| A-P2 | Record the bound R10 misses: because the split lands on the **longest** gap regardless of threshold, changing the threshold can only turn a boundary ON or OFF — it can never move an existing one. The single exception is the step-4 dangling-IN case, where lowering the threshold can flip a step-4 split to a step-3 split. This materially shrinks R10 and is the strongest safety argument the amendment has. | §Risks, R10 |
| A-P3 | Record the new surface R10 misses: §1.6 puts AM/PM into the **CSV export**, which leaves the application. A fake split cannot reach `payroll/calculator.ts` (D2 holds) but it can reach a payroll processor's spreadsheet. D2 bounds the *system*, not the *paper*. | §Risks, R10 |
| A-P4 | Soften §1.11.5's ceiling argument. 240 stops an operator setting 600; it does **not** stop the "silently off" mode — a tenant whose real split-shift break is 3 hours, set to 240, gets no split, no error and no UI signal. State this as an accepted residual instead of claiming the ceiling eliminates it. | §1.11.5, "Ceiling 240" |
| A-P5 | R11: name **locking** as the real dead end. A `manuallyEdited` day IS recoverable via `resetDay` (`attendance/+page.server.ts:201-206`); a **locked** day is not, because `resetDayToDerived` refuses it with 409. R11 currently treats both the same. Also correct §1.11.5's justification per A-E2 and §1.11.7's mock-discipline rationale per finding A-10 (the where/select `findUnique` mock protects `load`, not A19; A19 is proved by its `organization.update` `where.id` assertion). | §Risks R11; §1.11.5; §1.11.7 |

#### Amendment test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| 6 (Amendment) | The same punches split differently under two thresholds | Fully-Automated | `pnpm test` — `attendance-am-pm-split` A10 + A11 | A |
| 6 (Amendment) | NULL falls back to the built-in 30-minute default | Fully-Automated | `pnpm test` — `attendance-am-pm-split` A9 | A |
| 6 (Amendment) | A non-positive threshold cannot reach the comparison | Fully-Automated | `pnpm test` — `attendance-am-pm-split` A12, **corrected per A-E4** | B |
| 6 (Amendment) | The threshold is per-call state, not module state | Fully-Automated | `pnpm test` — `attendance-am-pm-split` A13 | A |
| 6 (Amendment) | Bounds 5–240 are enforced at the action and at the service | Fully-Automated | `pnpm test` — `attendance-ampm-gap-setting` A14, A16 (**corrected per A-E3**), A21 (**new per A-E6**) | B |
| 6 (Amendment) | Empty clears to NULL, a valid value writes | Fully-Automated | `pnpm test` — `attendance-ampm-gap-setting` A15 (**rewritten per A-E5**), A17 | B |
| 6 (Amendment) | Food-service twin door on the action, not just the render | Fully-Automated | `pnpm test` — `attendance-ampm-gap-setting` A18 | A |
| 6 (Amendment) | One tenant cannot move another tenant's threshold | Fully-Automated | `pnpm test` — `attendance-ampm-gap-setting` A19 | A |
| 6 (Amendment) | The write is audited | Fully-Automated | `pnpm test` — `attendance-ampm-gap-setting` A20 | A |
| 6 (Amendment) | `showAmPmGap` is false for a non-food-service org | Fully-Automated | `pnpm test` — new `load` spec **per A-E7** | B |
| 6 (Amendment) | Changing the setting changes a real derive, and `worked_hours` does not move | Agent-Probe | Manual step M1b, steps 6–7 | A |
| 6 (Amendment) | `deriveRange`/`correctDay` actually read and pass the column | Known residual | — no automated spec; §1.11.7 forbids a mocked `deriveRange` test. `deriveRange` is proved only by M1b; `correctDay`'s wiring is unprovable (see A-P1) | D |
| 6 (Amendment) | `Number.isFinite` in the derive.ts fallback | Known residual | — unreachable through this surface; `NaN`/`Infinity` are absorbed by the comparison regardless | D |
| 6 (Amendment) | The operator's chosen number is right for their tenant | Known residual | — the amendment moves the choice to the operator without proving it (R10 residual, already on record) | D |

Failing stub (A10/A11, the amendment's core behavior):
```
test("should split the same punches at 15 minutes and not at 30", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: same punch set, two thresholds, two answers")
})
```

Failing stub (A16, corrected):
```
test("should reject a non-integer with the whole-number message and out-of-bounds with the bounds message", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: two distinct 400 messages, update never called")
})
```

Failing stub (A18, the twin door):
```
test("should 404 a direct POST from a non-food-service org and never call the setter", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: requireFoodServiceOrg on the action, not the render")
})
```

#### Dimension findings — Amendment 1 only

- Infra fit: **PASS** — every path and line reference in §1.11 resolves. `index.ts:171-174` / `:436-439`, `schedules.ts:70-84`, `settings/schedules/+page.server.ts:12-21` / `:29-97`, `schema.prisma:297`, `rbac.ts:19-20`, `orgs.ts:20-24`, `index.ts:249` / `:251` all verified verbatim. `organizations` has 3 rows; the nullable `ADD COLUMN` is catalog-only. Four CI gates unchanged.
- Test coverage: **CONCERN** — 3 of 12 mutation rows cannot turn any test red (rows 1, 8, 10), 1 is half-covered (row 4 / `Number.isFinite`), A16 is over-specified against correct code, A15/A17 are mutually inconsistent on mocking, and the widened `load` has no spec. See A-E1 through A-E7.
- Breaking changes: **PASS** — the column is nullable and additive with no default; NULL preserves pre-amendment behaviour for all three tenants; `DeriveInput.amPmMinGapMs` is optional so every existing `deriveAttendanceDay` caller and every existing derive spec compiles and behaves unchanged; `splitAmPmBlocks` is module-private so its third parameter is not a public contract change. No enum renamed.
- Security surface: **PASS with one note** — `MANAGE_HR` matches every neighbour on the route; `requireFoodServiceOrg` is genuinely load-bearing (the route has no other org gate) and is correctly placed outside the try/catch; `organizationId` comes from `locals.user`, never the form; validation is three layers deep. Note: layer 3 (`derive.ts`) enforces finite-and-positive only, **not** the 5–240 bounds, so a value planted by raw SQL is not re-bounded — correct as defence in depth, not as enforcement.
- §1.11 feasibility: **CONCERN** — mechanically feasible with zero restructuring; both org `select`s widen in place and `correctDay`'s new local lands inside the same `if (editingTimes)` block as its `deriveAttendanceDay` call. Highest-risk edit: **step 6a**, the `minGapMs` fallback at the `splitAmPmBlocks` call site — it is the last line of defence, it is placed correctly, and A12 as tabled only half-proves it (see A-E4).

#### Open gaps — Amendment 1

- `deriveRange`'s read of `amPmMinGapMinutes`: known-gap — no automated spec by the plan's own deliberate choice; proved only by Agent-Probe M1b.
- `correctDay`'s threshold wiring: known-gap — structurally unprovable, since the correction form can only produce one segment (see A-P1).
- `Number.isFinite` in the derive.ts fallback: known-gap — unreachable through the public surface.
- A locked `AttendanceDay` never picks up a new threshold: known-gap — `deriveRange` skips it (`index.ts:249`) and `resetDayToDerived` refuses it with 409. No UI path exists. Accepted; the operator must unlock first.
- Whether the operator's chosen threshold is right for their tenant: known-gap, already on record from R10.

#### What this Amendment 1 coverage does NOT prove

- `attendance-am-pm-split` A9–A13 prove the **rule** on synthetic arrays. They do **not** prove that any org's stored `amPmMinGapMinutes` ever reaches `deriveAttendanceDay` — nothing automated crosses `index.ts`.
- `attendance-ampm-gap-setting` A14–A20 prove the **writer and its gates** via the `actions` export. They do **not** prove SvelteKit routes the POST to `setAmPmMinGap`, that Postgres accepts the `Int?` write, or that the settings card renders at all.
- M1b proves one operator saw one threshold change move one day's split on seeded `localhost` data. It does not prove the behaviour on any real tenant's punch history.
- No gate proves the 5-minute floor is high enough for any real tenant's re-punch noise, nor that 240 is above any real tenant's longest genuine break. Both bounds are argued, not measured.
- No gate detects the "silently off" mode: a threshold no real gap reaches produces no split, no error and no UI signal (see A-P4).
- Nothing prevents a raw-SQL write of an out-of-bounds value; layer 3 only rejects non-finite and non-positive.

Gate: **CONDITIONAL** (10 concerns, 0 FAILs) — the amendment may proceed to EXECUTE with A-E1 through A-E7 and A-P1 through A-P5 recorded as binding, alongside the unchanged E1–E9 and P1–P8 above.
Accepted by: pending user acceptance at this VALIDATE invocation (17-08-26, targeted Amendment 1 re-validation). Accepted concerns, by name: A-1 mutation row 1 doubly broken; A-2 `/^\d+$/` mutation cannot go red; A-3 A16 over-specified; A-4 `Number.isFinite` untested; A-5 `correctDay` wiring behaviourally vacuous; A-6 A15/A17 mocking inconsistency; A-7 mutation row 10 references a non-existent spec; A-8 in-range wrong split (conceded, damage ceiling holds); A-9 ceiling does not stop "silently off"; A-10 mock-discipline rationale misapplied.


## Autonomous Goal Block

```
SESSION GOAL
Implement the timesheet capture cluster (#162 AM/PM split, #200 CSV backlog import, #177 web
punch with location) on branch feat/timesheet-capture-162-177-200, as three sequentially-gated
phases in one PR, following:
process/features/timesheet-capture/active/timesheet-capture-162-177-200_17-08-26/timesheet-capture-162-177-200_PLAN_17-08-26.md

Reference for latest state: the plan file above. Its ## Validate Contract is binding.

CONTRACT SUMMARY
Gate: CONDITIONAL (13 concerns, 0 FAILs). Nine execute-agent instructions (E1-E9) and eight
plan corrections (P1-P8) in the ## Validate Contract are BINDING, not advisory. Each must be
applied and each must be reported in the phase report. Verified safe: AM/PM is display-only
with no path to payroll; the Discord route keeps a zero-line diff; Postgres NULL-distinct is
empirically confirmed; no enum is renamed; Float bypasses the Decimal hook; nobody can punch
as another employee. Verified wrong: import caps do not bound their work (E4); the punch route
is not org-scoped (E3); /profile is an unlisted third listPunches caller that breaks the
plan's own pre-merge gate (E9); the CSV export has no automated test (E2); eight guards have
no mutation (E5); five mocked specs cannot fail and one is unimplementable (E7, E8).

AUTONOMY RULES
- Execute Phase 1 only, then STOP at the §1.9 gate. Do not start Phase 2 from a CODE DONE
  predecessor. A phase is VERIFIED only per ## Phase Completion Rules, all six conditions.
- Run the four CI gates in order every phase: pnpm format:check, pnpm lint, pnpm check,
  pnpm test. Stop at the first failure. pnpm lint does NOT run format:check.
- After every prisma/schema.prisma edit: pnpm db:push then pnpm prisma generate, always both.
  A stale client has produced phantom pnpm check errors three times on this repo.
- Apply every mutation check by hand, confirm RED, revert, and record it. An unconfirmed
  mutation means the guard is unproven.
- Do not edit any pre-existing test to make a new change pass. If one must change, Decision 1
  has been violated: STOP and escalate.
- Three separate commits, one per phase, so a phase can be reverted independently.
- Never add a Co-Authored-By or Co-Author trailer to any commit.

HARD STOPS
- Any pre-existing attendance or payroll spec needs editing to pass.
- pnpm db:push reports data loss or a non-additive change.
- Any new reader of AttendanceDay would put amTimeIn/amTimeOut/pmTimeIn/pmTimeOut on a path
  to payroll/calculator.ts or attendance/input.ts. The display-only property is the whole
  safety argument; if it breaks, stop and re-validate.
- Pushing to a remote, opening a PR, or running anything against staging or production.
- Running prisma db push against any database other than local veent-db-5434.

NEXT PHASE
Phase 1 (#162): schema columns, derive.ts splitAmPm + splitAmPmBlocks, index.ts deriveRange
and correctDay wiring, showAmPm on the attendance page and CSV export, three new unit test
files, plus E1, E2, E5 (rows 7-8), E6, E7 and corrections P1 and P7.

EXECUTE START COMMAND
ENTER EXECUTE MODE — plan: process/features/timesheet-capture/active/timesheet-capture-162-177-200_17-08-26/timesheet-capture-162-177-200_PLAN_17-08-26.md — Phase 1 only, stop at the §1.9 gate.
```

---

## Next Instruction

Plan complete. Review carefully. Say **"ENTER VALIDATE MODE"** when ready to proceed to plan
validation (required before implementation).

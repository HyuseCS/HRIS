---
name: ref:timesheet-capture-research
description: "RESEARCH output for issues #162 / #177 / #200 — the punch pipeline, storage/location surface, and bulk-import precedent as they exist on staging d78ccab."
date: 17-08-26
metadata:
  node_type: reference
  type: research
---

# RESEARCH — timesheet capture cluster (#162 / #177 / #200)

Baseline: `staging` @ `d78ccab`. Branch `feat/timesheet-capture-162-177-200`, no commits yet.
Produced by three parallel `vc-research-agent` runs. Every claim below is a citation, not a proposal.

> Harness gap: `process/context/` holds only `.gitkeep` — `all-context.md` and its routing tables
> do not exist on this repo, so the mandated context-routing step could not run. Not a blocker for
> this cluster; noted so a later `vc-setup` decision is informed.

## 1. The data path today

```text
Discord /in, /out
  → POST /api/v1/timesheets/log      (HMAC, ±5 min window, NOT session-auth)
  → recordPunch()                     src/lib/server/services/timelog.ts:26
  → TimeLog                           prisma/schema.prisma:1405-1423   (one row per punch event)
        ├→ deriveAttendanceDay()      src/lib/server/services/attendance/derive.ts:152
        │    → AttendanceDay          prisma/schema.prisma:1895-1931   (ONE row per date)
        │    → buildAttendanceInput() src/lib/server/services/attendance/input.ts:27
        │    → payroll calculator     src/lib/server/services/payroll/calculator.ts:161
        └→ pairPunchesToDailyHours()  src/lib/server/services/timelog.ts:186
             → TimesheetEntry         prisma/schema.prisma:634-650     (no unique key on date)
```

### `TimeLog` (`prisma/schema.prisma:1405-1423`)
`id, employeeId, punchType, source, timestamp @db.Timestamptz(3), discordMessageId, note,
timesheetId, createdAt`. `@@unique([discordMessageId, employeeId])`, `@@index([employeeId, timestamp])`.

- `enum PunchType { IN OUT BREAK_START BREAK_END }` (`:207`). `BREAK_*` are **read** by
  `derive.ts:180-187` but **never written** — the bot has no `/break` command
  (`scripts/discord-bot.ts:10-11`, commands registered `:144-145`).
- `enum PunchSource { DISCORD WEB MANUAL }` (`:214`). **`WEB` has zero writers** anywhere in
  `src/` or `scripts/`. Only `DISCORD` (`timelog.ts:73`) and `MANUAL`
  (`scripts/seed-punches-demo.ts:161`) are ever produced.
- No location, no photo, no document relation on `TimeLog`.

### `AttendanceDay` (`prisma/schema.prisma:1895-1931`)
`date @db.Date`, a **single** `timeIn?` / `timeOut?` pair, eleven `Decimal(5,2)` hour buckets,
`lateMinutes` / `undertimeMinutes` / `breakMinutes`, `isLocked`, `manuallyEdited`, `note`.
`@@unique([employeeId, date])` at `:1928`.

**That unique constraint is load-bearing and defended in code.** `derive.ts:8-13` states one row
per date is deliberate and that splitting a shift would break it *and* the payslip's
"Days of Work" count. Any AM/PM change intersects this directly.

### `TimesheetEntry` (`prisma/schema.prisma:634-650`)
`date, timeIn?, timeOut?, hoursWorked Decimal(4,2), otHours Decimal(4,2), notes`.
**No unique constraint, no index** beyond `id` — nothing prevents two entries for one date.
Entries are replaced wholesale, never upserted (`timesheets.ts:175`, `timelog.ts:292`).

## 2. THREE independent implementations of "hours for a day"

This is the single most important finding for #162. Nothing pins them to each other.

| # | Function | Location | Rule |
|---|---|---|---|
| A | `deriveAttendanceDay()` | `attendance/derive.ts:152-290` | Schedule-driven. Authoritative; feeds payroll. |
| B | `pairPunchesToDailyHours()` | `timelog.ts:186-223` | Hardcoded 08:00–17:00 window, 12:00–13:00 lunch (`:147-150`). Ignores `WorkSchedule` entirely. |
| C | `recalcRow()` | `src/lib/components/timesheets/TimesheetModal.svelte:176-194` | A third copy of B's rule, in the browser, on `HH:MM` strings. **No test at all.** |

Detail on A: pairs punches into `workSegs`/`breakSegs` (`:169-188`); an `IN` silently overwrites an
open `IN` (`:171-173`). Unpaid break is `max(punchedBreakMs, scheduledBreakMs)` and the scheduled
break only applies on a `REGULAR` day with a schedule when net worked exceeds 5h (`:210-218`).
Late/undertime are measured against **`firstIn` and `lastOut` only** (`:244-247`) — a mid-day gap is
invisible to it today.

Detail on B: it is the **only** engine that already sums more than one IN/OUT pair per day
(`:215-216`). Skips pairs > 24h (`MAX_SHIFT_HOURS`, `:155`) partly to protect `Decimal(4,2)`.

`groupPunchesByDay()` (`attendance/index.ts:70-84`) decides the PHT day: a new `IN` opens a day, an
`OUT` closes it, punches between belong to the open day.

## 3. Every write path

**`TimeLog` writers (three):** `recordPunch()` `timelog.ts:26-108` (create `:69`);
`aggregateTimeLogsToTimesheet()` `timelog.ts:294-301` (stamps `timesheetId`);
`scripts/seed-punches-demo.ts:161`.
**There is no UI or form action that creates a punch.** Every live punch arrives via Discord.

**`AttendanceDay` writers:** `deriveRange()` `attendance/index.ts:138-305` (upsert `:287-291`);
`autoDeriveFromPunches()` `:314-336`; `correctDay()` `:396-515`; `resetDayToDerived()` `:521-552`;
`lockRange()` `:555-577`; `unlockRange()` `:580-606`.

The `correct` form action parses `timeIn`/`timeOut` as bare `HH:MM` and reattaches them to the row's
date in PHT (`attendance/+page.server.ts:154-155`, `:190-191`) — **exactly one pair per day is
expressible in the current form**.

**`Timesheet`/`TimesheetEntry` writers:** `createTimesheet()` `timesheets.ts:128`;
`updateTimesheetEntries()` `:175` (deleteMany `:191`); `submitTimesheet()` `:215`;
`submitDraftByHr()` `:279`; `reviewTimesheet()` `:315`; `deleteTimesheet()` `:245`;
`aggregateTimeLogsToTimesheet()` `timelog.ts:260-319`; `createTimesheetFromAttendance()`
`attendance/index.ts:370-393`.

## 4. Every reader (why the day shape is expensive to change)

- Payroll bridge: `attendance/input.ts` `accumulateDay():13`, `buildAttendanceInput():27`
  (findMany `:35`), segmented variant `:57`. Returns `null` when no rows so payroll falls back to
  approved timesheets (`input.ts:7-8`).
- Payroll calculator: `payroll/calculator.ts:161, 165, 233-234, 242, 250-252, 332, 407`.
- Reports: `reports.ts:380 generateTardiness` (`:384`), `reports.ts:425 generateOvertime` (`:429`),
  `reports.ts:157 generateAttendance` (`:161`, map `:187`).
- CSV export: `src/routes/(app)/attendance/export/+server.ts:44-45` (team) and `:78-79`
  (per-employee) — both emit exactly **one** `Time In` / `Time Out` column pair.
- UI: `attendance/+page.svelte:516-532` (team rows) and `:650-666` (per-employee) — one `timeIn`
  input and one `timeOut` input per row.
- Dashboard: `dashboard.ts:158, 217, 239, 279, 359`.
- Punch list API: `src/routes/api/v1/timesheets/[id]/punches/+server.ts:42`.

## 5. Per-organization behaviour — a hardcoded allowlist, not a settings table

There is **no** per-org settings or feature-flag table. Two mechanisms exist:

**(a) Boolean columns on `Organization`** (`prisma/schema.prisma:281-332`): `employeeNumberPrefix`
(comment at `:292-295` names the tenants — *"JoJo Potato uses JJ, Sweetleaf SL"*), and
`trackTardiness @default(true)` (`:296-298`) — the closest precedent for a behaviour flag. It ANDs
with `WorkSchedule.trackTardiness` (`:1868-1870`), is read at `attendance/index.ts:171-175` and
`:436-442`, and reaches `derive.ts` as `enforceTardiness` (`derive.ts:56-61`, `:245`).

**(b) `src/lib/orgs.ts`** — `FOOD_SERVICE_ORG_IDS = ['org_jojo', 'org_sweetleaf']` +
`isFoodServiceOrg()`. Its own comment (`orgs.ts:16-18`) says: *"A hardcoded allowlist is right for
now… When a fourth tenant appears, the upgrade is an `Organization.usesBranches` flag — and this
function is the single seam where that swap happens."* It sits outside `$lib/server` so client and
server share one table (`:4-8`).

Call sites: `src/lib/server/rbac.ts:20` (404 guard), `(app)/+layout.svelte:26` and `:30`,
`employees/+page.server.ts:25`, `employees/[id]/+page.server.ts:151` and `:457`,
`team/+page.server.ts:93`.

**No org-scoped conditional exists anywhere in `attendance/`, `timelog.ts`, `timesheets.ts`, or
`payroll/` today.** The punch pipeline is currently identical for all three tenants.

Also relevant: `Employee.branchId` (`schema.prisma:438`, "only the food-service tenants use
branches") → `model Branch` (`:1351-1372`) with a free-text `address` (`:1356`).

## 6. Location and photo surface (#177)

- **No geo data anywhere.** Grep for `latitude|longitude|geo|coordinates|accuracy` across
  `prisma/schema.prisma` returns zero. `Branch.address` is unstructured text with no lat/lng and no
  geofence radius. The only address-ish fields are `Organization.address:288`,
  `Employee.contactAddress:419`, `Interview.location:1268`, `InventoryItem.location:1318`.
- **No browser geolocation.** Zero hits for `navigator.geolocation`, `getCurrentPosition`,
  `watchPosition` in `src/`. No PWA manifest, no service worker.
- **No image processing.** `package.json` has no `sharp`, `exifr`, `exif-parser`, `jimp`,
  `image-size`. Nothing parses EXIF. Images are stored byte-for-byte. `pdfkit@^0.19.1` is the only
  document dependency.
- **No `TimeMark` code counterpart** — grep across `src/`, `prisma/`, `scripts/` returns zero. The
  issue's "TimeMark" is a proposal (it is a third-party geotagging camera app), not existing code.
- **There is no browser time-in control.** No "Time In" / "Clock In" button exists in any
  `.svelte` file. The attendance page only *derives* days from punches already in the table
  (`attendance/+page.server.ts:74`, `:80`).

### The storage stack that does exist — `src/lib/server/storage.ts`
Local disk only, no S3, no cloud SDK. One env var, `UPLOAD_DIR`, resolved at `:7-9`, defaulting to
`cwd()/uploads`; files live **outside** the web root so they are reachable only through an
authenticated download route (`:5-6`).

Exports: `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` (`:11`); `ALLOWED_MIME` (`:12-17`) = exactly
`application/pdf`, `image/png`, `image/jpeg`, `image/webp`; `isAllowedType()` (`:19`);
`sniffMime()` (`:27`, magic-byte detection from #74, reads ≤12 bytes, returns `null` for anything
else); `contentMatchesType()` (`:57`); `saveFile(bytes, mime, subdir)` (`:76`, writes
`<subdir>/<uuid><ext>`); `readStoredFile()` (`:85`); `deleteStoredFile()` (`:89`, swallows ENOENT);
`listStoredKeys()` (`:127`). Private `resolveKey()` (`:62-68`) refuses any key escaping `UPLOAD_DIR`.
Tested at `tests/unit/storage.test.ts` (four formats only).

Row pointer shape: `fileName, mimeType, size, storageKey` (`schema.prisma:877-880` for
`RequestDocument`, `:918-921` for `EmployeeDocument`). Orphan reaper:
`scripts/sweep-orphan-uploads.ts`.

### The upload precedent — `src/lib/server/services/requests/documents.ts`
Per-parent count cap `MAX_REQUEST_DOCS = 5` (`:24`, checked `:38-40`, counts live docs only
`:95-99`); empty → 400 (`:42`); >10 MB → **413** (`:43`); bad MIME → **415** (`:44-47`).
`uploadsFromForm()` (`:63-77`) validates count/size/type from `File` metadata **before** buffering
bytes. `saveRequestDocuments()` (`:81`) re-checks parent state (`:102-104`), re-runs caps (`:105`),
then verifies magic bytes match the declared MIME for **every** file before touching disk
(`:106-111`). Storage subdir is one per parent: `saveFile(bytes, mime, \`requests/${requestId}\`)`
(`:117`). Audit `CREATE` per file (`:130-136`). Mid-batch failure rolls back rows **and** unlinks
already-written bytes (`:137-147`).

Form action: `(app)/requests/[id]/+page.server.ts:117-142`. Download route:
`api/v1/requests/[id]/documents/[docId]/+server.ts:10-38` — session-auth, capability-or-owner,
`Content-Disposition: attachment`, `Cache-Control: private, no-store`, `X-Content-Type-Options:
nosniff`.

Employee-document twin: `employees/[id]/+page.server.ts:790-815` (gated `MANAGE_HR`) →
`src/lib/server/services/documents.ts:55` (413), `:56` (MIME), `:63` (`saveFile`).

## 7. Bulk import / spreadsheets (#200)

**The repo writes CSV and never reads one.** No `xlsx`, `exceljs`, `papaparse`, `csv-parse`,
`csv-stringify` in `package.json`. The only CSV code is a ~25-line hand-written serializer:
`exportToCSV()` `reports.ts:624`, with `FORMULA_PREFIX = /^[=+\-@\t\r]/` (`:622`, injection defence
from #98), quoting at `:637`, `\r\n` endings at `:646`. Tested at `tests/unit/reports-csv.test.ts`.
Consumers: `attendance/export/+server.ts:90-93`, `api/v1/reports/[type]/+server.ts:135-140`.

**No import flow of any kind exists.** What looks like bulk is bulk *action* over stored rows:
`requests/timesheets/+page.server.ts:106` (approve) and `:134` (reject);
`leave/+page.server.ts:86` (delete, re-checks authorization per item);
`attendance/+page.server.ts:286/301/247` (`deriveTeam`/`lockTeam`/`unlockTeam` — the UI warns at
`attendance/+page.svelte:28` that these rewrite whole ranges, #108). Seed scripts hardcode data in
TypeScript and dedup by `upsert` on a natural key.

**A spreadsheet parser would be a new production dependency.** Nothing reads binary office formats.
XLSX is a ZIP (`PK\x03\x04`) and CSV has no magic bytes — `sniffMime` (`storage.ts:27`) recognises
neither, and `ALLOWED_MIME` has no spreadsheet entry.

**Downloadable file generation** exists two ways: `pdfkit` (`payroll/payslip-pdf.ts:13`, `:512`,
tested at `tests/unit/payslip-pdf.test.ts`) and the CSV writer above.

## 8. Audit

Single module `src/lib/server/audit.ts`. Signature (`:22-26`):
`writeAuditLog(ctx: AuditContext, payload: AuditPayload, client: Prisma.TransactionClient = db)`.
`AuditContext` (`:4-10`): `organizationId, actorId, actorRoles, ipAddress?, userAgent?`.
`AuditPayload` (`:12-18`): `action, entityType, entityId, oldValue?, newValue?`.
The `client` param exists so a caller inside `$transaction` makes the audit row commit or roll back
with the mutation (`:20-21`).

**`AuditAction` is a closed Prisma enum with 8 members** (`schema.prisma:194-203`): `CREATE`,
`UPDATE`, `DELETE`, `VIEW`, `LOGIN`, `LOGIN_FAILED`, `PAYROLL_OVERRIDE`, `LEAVE_OVERRIDE`.
There is no bulk/import/backfill value. (Adding an enum value is cheap; *renaming* one is what
needs a `scripts/migrate-*.ts` per CLAUDE.md.)

Two recording shapes already in use:
- **Summary row for a range operation** — `attendance/index.ts:296-302`: one `CREATE` /
  `AttendanceDay` row whose `entityId` falls back to the org id when org-wide, with counts in
  `newValue: { from, to, derived, flagged }`.
- **Per-record** — `timelog.ts:87-99`: one `CREATE` / `TimeLog` per punch with
  `newValue: { punchType, timestamp }` and `ipAddress`.

## 9. RBAC

Capability table in `src/lib/rbac.ts`, re-exported for enforcement by `src/lib/server/rbac.ts:9`.
Guard: `requireAnyCapability(userRoles, capability)` throws 403 (`server/rbac.ts:24-26`); `canAny()`
is the boolean form for UI flags. Multi-role semantics from #133: passes if ANY held role has it.

- `MANAGE_HR: ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']` (`rbac.ts:26`). The comment at `:30-33`
  warns it **includes MANAGER** (branch HR since #133) — it is *not* the capability that excludes
  managers.
- `VIEW_TEAM: ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']` (`rbac.ts:48`).
- `OVERRIDE_FINALIZED` — the privileged unlock capability.

Attendance action gates (`attendance/+page.server.ts`, actions from `:164`): `derive` `:165`,
`correct` `:182`, `resetDay` `:201`, `lock` `:212`, `saveTimesheet` `:263`, `deriveTeam` `:286`,
`lockTeam` `:301` — all `MANAGE_HR`; `unlock` `:230` and `unlockTeam` `:247` — `OVERRIDE_FINALIZED`.
CSV export mirrors this (`attendance/export/+server.ts:28`).

**Acting on someone else's behalf** already has an answer —
`assertCanModifyTimesheet()` `timesheets.ts:117-126`: owner passes, else `VIEW_TEAM` passes, else
403. The comment at `:96-116` records that MANAGER's old "direct reports only" narrowing was
deliberately dropped and tenancy is enforced earlier by `getTimesheet` scoping on `organizationId`.
`/timesheets` is view-only for the Employee role since #165 (`timesheets.ts:15-20`); HR submits on a
rank-and-file employee's behalf via `submitDraftByHr()` (`:279`), which sets `makerUserId` so MAKE
auto-completes and VERIFY/APPROVE stay the oversight gates.

The punch ingress bypasses session RBAC entirely: HMAC only (`timelog.ts:21-25`).

## 10. Idempotency precedent

The closest analogue to a re-uploaded backlog is the Discord replay defence (#99), which uses **two
layers**: the DB constraint `@@unique([discordMessageId, employeeId])` (`schema.prisma:1419`) plus an
application pre-check that gives a clean 409 (`timelog.ts:52-84`), with the `P2002` catch at `:76-81`
mapping the concurrent race to the same 409. Tested at `tests/unit/timelog-aggregate.test.ts` and
`tests/e2e/timelog-replay.spec.ts`.

Unique keys a backlog write would collide with: `AttendanceDay @@unique([employeeId, date])`
(`:1928`); `Timesheet @@unique([employeeId, periodStart])` (`:630`); `TimesheetEntry` — **none**.

Overwrite guards a backfill must respect:
- `isLocked` (`:1917`) — `correctDay` rejects 409 *"This attendance day is locked and cannot be
  edited"* (`attendance/index.ts:415`).
- `manuallyEdited` (`:1918-1919`) — schema comment: *"Set when HR hand-corrects a day; keeps
  re-derive (Refresh) from overwriting the override."* Enforced at `attendance/index.ts:251` and
  `:257`.
- The idempotent write itself: `attendance/index.ts:287-291`, upsert on `employeeId_date`.

## 11. Existing tests in the blast radius

**Unit:** `attendance-derive`, `attendance-autoderive`, `attendance-correct-derive`,
`attendance-schedule-fallback`, `timelog-aggregate`, `punch-access`, `timesheet-selfservice`,
`reports-csv`, `storage`, `payslip-pdf`, `payroll-attendance-split`, `payroll-calculator`,
`payroll-mid-period`.
**E2E:** `timesheet-punch`, `timelog-replay`, `timesheet-approval`,
`timesheet-create-for-employee` (queries the JoJo Potato org at `:168`),
`manager-org-wide-timesheets`, `branches`.

### Gaps that matter to this cluster
- **No test asserts engines A and B agree on the same punch set.** They use different rules and
  nothing pins the divergence.
- `TimesheetModal.svelte` `recalcRow()` — engine C — has **no test at all**.
- `src/lib/server/services/timesheets.ts` has no dedicated unit test file.
- `attendance/input.ts` — the sole `AttendanceDay` → payroll bridge — has no dedicated test.
- `attendance/export/+server.ts` CSV column shape is untested.
- No test asserts an *imported* range refuses to clobber a locked or hand-edited day.
- No bulk-level idempotency test (the replay test covers a single Discord punch).
- `storage.ts` tests assert the four current formats only; no spreadsheet branch, no fixture dir for
  binary uploads.
- `PunchSource.WEB` has no writer and no test.
- `scripts/discord-bot.ts` command→payload mapping (`:77-90`) is untested and has no seam.

## 12. Open questions RESEARCH could not answer from the repo

1. **#162's output shape is not recorded anywhere.** Two IN/OUT pairs per day? A per-half-day hours
   split? A display-only column split? The answer decides whether
   `AttendanceDay @@unique([employeeId, date])` — defended at `derive.ts:8-13` as load-bearing for
   the payslip's "Days of Work" — has to change.
2. Whether the split applies to `AttendanceDay` only, `TimesheetEntry` too, or both. They are
   written by different engines with different rules.
3. Whether "for JoJo Potato and Sweetleaf" means the existing `isFoodServiceOrg` allowlist is the
   gate, or whether this is the trigger for the `Organization` column flag `orgs.ts:16-18`
   anticipates.
4. Punches enter only via Discord `/in` / `/out`. If AM/PM is punch-driven, the bot's command set is
   in scope; if derivation-driven, it is not.
5. #177 wants location on time-in, but **there is no browser time-in**. Either the Discord bot
   carries location (it cannot — no geolocation in a Discord slash command) or #177 implies building
   a web punch surface first, which would be the first-ever writer of `PunchSource.WEB`.
6. "TimeMark" has no code counterpart and its intended role (photo attached to a punch? EXIF source
   of truth? a new model?) is undetermined.
7. Whether a new `AuditAction` value is wanted for an import, or `CREATE` with a descriptive
   `newValue` is enough.
8. No `Content-Type` or aggregate size ceiling exists for a bulk photo batch — only 10 MB per file.

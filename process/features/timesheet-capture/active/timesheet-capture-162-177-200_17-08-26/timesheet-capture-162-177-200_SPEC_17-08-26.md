---
name: spec:timesheet-capture-162-177-200
description: "Split AM/PM punches, capture time-in location, and accept offline attendance backlogs — scoped to JoJo Potato and Sweetleaf only (#162, #177, #200)"
date: 17-08-26
feature: timesheet-capture
---

# SPEC — Timesheet Capture Cluster (#162 / #177 / #200)

## Summary

JoJo Potato and Sweetleaf run food-service shifts split into a morning block and an evening
block, and their staff often punch in from places with weak or no signal. Today the system
only understands one time-in and one time-out per person per day, has no idea where a punch
happened, and has no way to accept attendance data that was recorded somewhere else and
brought in later. This work teaches the system three new things, for JoJo Potato and Sweetleaf
staff only — Veent's own staff keep working exactly as they do today:

1. Record a separate AM and PM time-in/time-out instead of forcing one pair to cover the
   whole day.
2. Know roughly where an employee was when they punched in.
3. Accept a backlog of punches uploaded later (by spreadsheet) for people whose punches never
   made it to the system in real time.

All five product decisions RESEARCH surfaced as needing user judgment are now resolved — see
`## Decisions Resolved`. This SPEC still does **not** decide the technical shape of the
solution (data types, endpoint names, exact validation code) — that is INNOVATE/PLAN's job —
but the shape-defining product questions (one row or two, build a web surface or not, how far
the backlog importer goes, which org gate to reuse, how location data is retained) are locked.

## User Stories / Jobs To Be Done

**#162 — AM/PM split**
- As a JoJo Potato/Sweetleaf shift employee, I want to punch in and out separately for my
  morning block and my evening block, so that my attendance record reflects two real work
  periods instead of one pair that hides the gap between them.
- As an HR admin at a food-service tenant, I want to see AM and PM punches distinguished on
  the attendance page and in exports, so that I can spot a missed PM punch without guessing.
- As a Veent (non-food-service) HR admin, I want nothing about my attendance screen or
  payroll flow to change, so that #162 does not introduce risk to a working process.
- As a Payroll user, I want the day to still count as exactly one day worked and the existing
  `timeIn`/`timeOut` fields to keep meaning "first punch of the day" / "last punch of the
  day," so that every payslip, report, and CSV export that already reads those two fields
  keeps working without modification (Decision 1).

**#177 — Location on time-in**
- As a JoJo Potato/Sweetleaf shift employee, I want to punch in from a web page that records
  roughly where I am, so that HR can confirm I punched in from a legitimate work location.
- As that same employee, I want punching in to still work even if I say no to the location
  permission prompt, my phone can't get a GPS fix, or I'm not on a secure connection, so that
  a location hiccup never costs me a punch.
- As an HR admin, I want to see the recorded location next to a punch, so that I can review
  attendance without asking the employee where they were.
- As a JoJo Potato/Sweetleaf employee, I want to see my own location data and know who else
  can see it, so that I'm not surprised by how it's used.
- As a Discord-punching employee (any tenant), I want my `/in` and `/out` commands to keep
  working exactly as they do today, so that the new web surface is additive, not a
  replacement I'm forced onto (Decision 2).

**#200 — Offline / low-signal capture**
- As a JoJo Potato/Sweetleaf shift employee who works somewhere with no signal, I want my
  time in/out to still get recorded (on paper, in an app, wherever) and later show up
  correctly in the system, so that a bad signal day doesn't cost me pay or attendance credit.
- As an HR admin, I want to upload a spreadsheet of backlog punches at once, so that I don't
  have to hand-enter each one.
- As an HR admin, I want the uploader to correctly match each spreadsheet row to the right
  employee record, so that a backlog import never posts someone's hours to the wrong person.
- As an HR admin, I want the system to refuse to silently overwrite a day HR has already
  locked or hand-corrected, so that a backlog upload can't quietly undo real work.
- As an HR admin, I want to re-upload the same file without creating duplicate hours if I'm
  not sure whether the first upload went through, so that retrying is always safe.
- As HR/Payroll, I want every backlog-imported punch traceable to who uploaded it and when,
  so that a disputed day can be investigated.

## What The User Wants (Behavioral Outcomes)

- Only JoJo Potato and Sweetleaf are affected, gated by the existing `isFoodServiceOrg()`
  allowlist (Decision 4). A Veent employee's attendance page, punch flow, exports, and
  payroll inputs look and behave exactly as they do today.
- A JoJo Potato/Sweetleaf employee can produce four punch events in a day — AM in, AM out,
  PM in, PM out — and the system keeps them distinguishable as AM vs. PM, not merged into one
  blurred pair. This is stored as additive AM/PM fields on the *same* one-row-per-date
  attendance record; the existing `timeIn`/`timeOut` fields keep their current meaning (first
  punch / last punch of the day), so no existing payroll, report, CSV, or payslip reader needs
  to change to keep working (Decision 1).
- Existing single-block employees (if any exist at these two tenants) are not forced into a
  broken state — a day with only one in/out pair still resolves normally.
- A JoJo Potato/Sweetleaf employee can punch in from a new, session-authenticated web page
  that reads the browser's location at the moment of punch-in (the first-ever writer of
  `PunchSource.WEB`). Discord `/in` and `/out` keep working unchanged, for every tenant, and
  never carry location (Decision 2).
- The web punch never fails or blocks because of location: permission denied, no GPS fix, a
  low-accuracy reading, or a non-HTTPS context (which the browser's Geolocation API itself
  refuses to run under) all resolve to "punch recorded, no location attached" — never an
  error the employee has to fight through.
- HR can see, per web punch, an approximate location good enough to sanity-check "was this
  employee actually near the workplace." The employee can see that same location on their own
  punch record. Nobody outside the roles already entitled to see that employee's attendance
  data can see it — location is not exposed on any surface that isn't already gated for
  attendance (Decision 5).
- An HR staff member with a backlog of punches (paper log, a phone note, whatever was used
  while offline) can bring that backlog into the system as one spreadsheet upload, instead of
  typing each day in one at a time through the existing single-pair correction form. Each row
  is resolved to the correct employee record before anything is written.
- A backlog upload never overwrites a day HR has locked or hand-corrected. It fails loudly on
  those days and tells the uploader which days were skipped and why.
- Re-uploading the same backlog file (accidentally or to be safe) does not create duplicate
  attendance data or duplicate hours.
- Bulk photo import (TimeMark or otherwise) is not part of this delivery — spreadsheet upload
  is the only backlog path being built (Decision 3).
- Every backlog-imported record and every web punch is attributable (who/what created it,
  when) the same way every other write in this system already is.
- Payroll's "Days of Work" count and hours calculations keep working correctly for JoJo
  Potato/Sweetleaf staff after AM/PM split and backlog import — a day is still a day, hours
  still add up to what was actually worked.

## Flow / State Diagram

**AM/PM punch flow (#162), food-service tenants only:**

```text
Employee (JoJo Potato / Sweetleaf)
        |
        v
   AM shift starts --[punch IN]--> AM IN recorded
        |
        v
   AM shift ends --[punch OUT]--> AM OUT recorded
        |
        v
   (gap: lunch / between shifts)
        |
        v
   PM shift starts --[punch IN]--> PM IN recorded
        |
        v
   PM shift ends --[punch OUT]--> PM OUT recorded
        |
        v
   Day resolves to ONE AttendanceDay record for that date
   (@@unique([employeeId, date]) unchanged). AM/PM fields
   are additive columns on that same row. Existing
   timeIn/timeOut = first punch / last punch of the day,
   unchanged meaning. ONE "day worked" feeds payroll.

Veent (non-food-service) employee: unaffected — still IN -> OUT, one pair, one record.
```

**Web punch + location capture flow (#177):**

```text
Employee opens the web punch page (JoJo Potato / Sweetleaf, session-authenticated)
        |
        v
   Employee taps "Punch In"
        |
        v
   [Is the page served over HTTPS?]
        |
   yes--+                                    +--no (Geolocation API unavailable
        v                                          by browser rule)
   Browser prompts for location permission          |
        |                                           v
   [employee response / device capability]    Punch proceeds with NO location
        |                                           (not an error)
   +----+----------------+---------------+
   |                      |                |
 granted,               denied           timeout /
 good fix                                no fix / low accuracy
   |                      |                |
   v                      v                v
 Location attached   Punch proceeds    Punch proceeds with NO
 to the punch         with NO location  location (or a flagged
                       (not an error)    low-accuracy reading,
                                         never treated as precise)
        |                      |                |
        +----------+-----------+----------------+
                   v
        Punch is recorded (PunchSource.WEB) regardless of
        which branch above was taken — location is
        supplementary, never a gate on the punch itself.
                   |
                   v
        HR/Manager view the punch; if location is present,
        it's visible to them and to the employee themselves.
        Discord /in and /out: unaffected, still carry no
        location, still work for every tenant.
```

**Offline backlog import flow (#200, spreadsheet only):**

```text
Employee works offline, keeps their own record (paper / app / notes)
        |
        v
HR receives the backlog and prepares a spreadsheet
        |
        v
HR uploads spreadsheet  --> [validate: file type, size, row shape]
        |
        v (rows validated)
For each row (one employee identifier, one date, punch times):
        |
        +--> employee identifier does not resolve to a real
        |    employee in this org --> ROW REJECTED, reason recorded
        |
        +--> day is LOCKED or manually-edited? --yes--> ROW REJECTED, reason recorded
        |
        +--> row already applied (duplicate/re-upload)? --yes--> ROW SKIPPED, no duplicate write
        |
        +--> no conflict --> row APPLIED, attendance day created/updated
        |
        v
HR sees a result summary: rows applied, rows skipped/rejected (+why),
and an audit trail entry for the whole batch and/or each row.

Bulk photo import (TimeMark or otherwise): NOT part of this flow — out of scope, see below.
```

## Acceptance Criteria (Testable Outcomes)

Each criterion below is annotated with `proven by:` (the test scenario that verifies it —
existing file where noted, otherwise a new scenario named in the same convention as the
existing suite, to be authored during PLAN/EXECUTE since this is new behavior) and
`strategy:` (Fully-Automated / Hybrid / Agent-Probe).

### #162 — AM/PM split

1. A JoJo Potato or Sweetleaf employee's day can hold a distinct AM in/out pair and a
   distinct PM in/out pair, and both are visible as separate values (not merged into a
   single pair) on the attendance page, the CSV export, and the timesheet.
   `proven by:` new scenario `attendance-am-pm-split` (unit) + `timesheet-punch-ampm` (e2e),
   extending the existing `attendance-derive` / `timesheet-punch` coverage.
   `strategy:` Fully-Automated

2. A Veent (non-food-service) employee's attendance day, punch flow, and exports are
   byte-for-byte unchanged in shape (still one in/out pair) before and after this change.
   `proven by:` existing `attendance-derive` and `timesheet-punch` suites re-run as a
   regression gate; add an explicit non-food-service assertion to `attendance-am-pm-split`.
   `strategy:` Fully-Automated

3. Payroll's "Days of Work" count and total hours for a JoJo Potato/Sweetleaf employee with
   both AM and PM punches on the same date equal one day worked (the row stays one
   `AttendanceDay` per `Decision 1`) and the correct sum of AM + PM hours — not two days, not
   double-counted hours.
   `proven by:` new scenario `payroll-am-pm-days-of-work` (unit), cross-checked against
   existing `payroll-attendance-split` and `payroll-calculator`.
   `strategy:` Fully-Automated

4. All three existing "hours for a day" engines (`derive.ts`, `timelog.ts`,
   `TimesheetModal.svelte`) produce the same total hours for the same AM+PM punch set for a
   food-service employee. (RESEARCH found these three already disagree with no test pinning
   them — this criterion closes that gap for the AM/PM case specifically.)
   `proven by:` new scenario `hours-engine-parity-am-pm` (unit).
   `strategy:` Fully-Automated

5. A food-service employee who only punches once in a day (misses AM or PM) still produces a
   valid, reviewable attendance record — the system does not error out or silently drop the
   day.
   `proven by:` new scenario `attendance-am-pm-partial-day` (unit).
   `strategy:` Fully-Automated

### #177 — Location on time-in

6. A JoJo Potato/Sweetleaf employee's web time-in punch can carry a location reading, and
   that reading is visible to HR/Manager roles on the punch record.
   `proven by:` new scenario `punch-location-capture` (unit) + e2e scenario
   `timesheet-punch-location`.
   `strategy:` Hybrid (automated write/read path; the actual browser geolocation accuracy
   behavior needs an Agent-Probe to confirm real-device behavior once PLAN specifies the
   capture code).

7. A web punch is never blocked or failed because location is unavailable for any reason
   (device has no GPS, browser errors, network issue) — the punch still records with no
   location attached.
   `proven by:` new scenario `punch-location-optional` (unit).
   `strategy:` Fully-Automated

8. When the employee denies the browser's location permission prompt, the punch still
   completes successfully with no location attached, and the employee is not blocked, nor
   forced through a retry loop, in order to punch in.
   `proven by:` new scenario `punch-location-permission-denied` (unit/e2e).
   `strategy:` Hybrid (the permission-denial simulation needs an Agent-Probe against a real
   or emulated browser Geolocation API; the resulting punch write path is Fully-Automated).

9. When geolocation times out, returns no fix, or returns a low-accuracy reading, the punch
   still records; a low-accuracy reading is either attached together with its accuracy value
   or treated as unavailable — it is never silently presented as a precise location.
   `proven by:` new scenario `punch-location-low-accuracy` (unit).
   `strategy:` Fully-Automated

10. HTTPS is required for the **browser Geolocation API**, not for punching. The API refuses to
    operate on an insecure origin, so on plain HTTP the page reaches the `unsupported` state and
    the punch is recorded **without** location. The punch route itself is unaffected by the
    scheme and succeeds either way — no HTTPS means no coordinates, never no punch.
    `proven by:` new scenario `punch-location-https-required` (unit, asserting the punch
    write path's graceful-degradation behavior when no geolocation reading is present).
    `strategy:` Fully-Automated

11. Location data on a punch is visible only to roles that already hold `VIEW_TEAM` /
    `MANAGE_HR` for that employee's org, and to the employee viewing their own punch record —
    the same visibility boundary already enforced for attendance data
    (`assertCanModifyTimesheet`, `VIEW_TEAM`/`MANAGE_HR` gates), plus explicit
    self-visibility.
    `proven by:` new scenario `punch-location-rbac` (unit), pattern-matched to existing
    `punch-access` suite; includes an explicit "employee views own punch location" case.
    `strategy:` Fully-Automated

12. Location is captured only for JoJo Potato and Sweetleaf punches, and only through the new
    web punch surface. A Veent employee's punch, and any Discord-sourced punch for any
    tenant, never has a location field populated or requested.
    `proven by:` `punch-location-capture` (org-scoping + source-scoping assertion), same gate
    as criterion 6.
    `strategy:` Fully-Automated

### #200 — Offline / low-signal backlog capture (spreadsheet only)

13. HR can upload a spreadsheet containing employee, date, and punch times for a backlog of
    days, and the system creates/updates attendance records from valid rows.
    `proven by:` new scenario `attendance-backlog-import` (unit) + e2e
    `attendance-backlog-upload` (mirrors the existing `requests/documents.ts` upload-precedent
    validation shape: count/size/type checks before persist).
    `strategy:` Fully-Automated

14. Each spreadsheet row is resolved to a specific, real employee record within the
    uploading HR user's own organization before anything is written; a row whose employee
    identifier does not resolve is rejected with a clear reason, not silently skipped or
    misassigned to the wrong person.
    `proven by:` new scenario `attendance-backlog-employee-resolution` (unit).
    `strategy:` Fully-Automated

15. A backlog row targeting a day that is `isLocked` or `manuallyEdited` is rejected, not
    applied, and the rejection reason is visible to the uploader.
    `proven by:` new scenario `attendance-backlog-respects-lock` (unit), directly extending
    the existing lock/manual-edit guard tests around `correctDay`.
    `strategy:` Fully-Automated

16. Uploading the same backlog file (or the same row) twice does not create duplicate
    attendance data or duplicate hours — a second identical upload is a no-op or a clean
    rejection, not silent duplication.
    `proven by:` new scenario `attendance-backlog-idempotent` (unit), pattern-matched to the
    existing Discord replay defence (`timelog-aggregate`, `timelog-replay`).
    `strategy:` Fully-Automated

17. Every backlog import produces an audit trail entry identifying who uploaded it, when, and
    a summary of rows applied/rejected — sufficient to investigate a disputed day later.
    `proven by:` new scenario `attendance-backlog-audit` (unit), pattern-matched to the
    existing `attendance/index.ts` range-operation summary-audit shape.
    `strategy:` Fully-Automated

18. Backlog import is restricted to JoJo Potato and Sweetleaf employees and to users holding
    `MANAGE_HR` for that org — the same actor boundary as every other attendance-write action
    today (`derive`, `correct`, `lock`).
    `proven by:` new scenario `attendance-backlog-rbac` (unit).
    `strategy:` Fully-Automated

19. An invalid upload (wrong file type, oversized file, malformed rows, or a spreadsheet
    containing photo/image attachments) is rejected with a clear reason before anything is
    written to the database — no partial, silent writes, and no code path that accepts a
    photo as backlog input.
    `proven by:` new scenario `attendance-backlog-validation` (unit), pattern-matched to the
    existing `storage.ts` / `documents.ts` MIME + size validation gates.
    `strategy:` Fully-Automated

### Cross-cutting

20. Every acceptance criterion above that is scoped "JoJo Potato and Sweetleaf only" has an
    explicit automated assertion that a third (Veent) org is unaffected — scoping is proven,
    not assumed.
    `proven by:` `attendance-am-pm-split`, `punch-location-capture`,
    `attendance-backlog-rbac` all carry a same-test negative-control assertion for a
    non-food-service org.
    `strategy:` Fully-Automated

## Out Of Scope

- Veent (non-food-service) staff are not affected by any part of this cluster. No behavior
  change, no new fields exposed, no new upload surface for Veent's org.
- **Bulk TimeMark photo import is explicitly out of scope for this delivery (Decision 3).**
  This SPEC does not build, integrate with, or call the third-party "TimeMark" app, does not
  add EXIF or image-metadata extraction to the codebase, and does not accept photo batches as
  a backlog input of any kind. If photo-based backlog import is wanted later, it is a new,
  separate issue/SPEC — not a fast-follow implicitly bundled into this one.
- Break punches (`BREAK_START`/`BREAK_END`) are out of scope. They already exist as an enum
  value with no writer; this cluster does not add one.
  The 08:00–17:00 hardcoded lunch-window logic in `timelog.ts`'s secondary hours engine is not
  touched by this SPEC beyond what's needed to keep AM/PM parity (criterion 4) — a full
  rewrite/unification of that engine is not requested here.
- Geofencing (rejecting a punch made too far from a workplace) is out of scope. This cluster
  records location; it does not enforce it.
- Retroactive correction UI redesign is out of scope — the existing single-pair `correct`
  form action is not being replaced, only supplemented by the new backlog-import path.
- This SPEC does not change RBAC roles or capabilities — it applies existing `MANAGE_HR` /
  `VIEW_TEAM` gates to new surfaces, it does not invent new ones.
- A new `Organization` column/flag for food-service gating is out of scope (Decision 4) — the
  existing `isFoodServiceOrg()` allowlist is reused as-is.
- A separate, shorter retention/purge window for location data is out of scope (Decision 5) —
  location follows the attendance record's existing lifecycle; no new purge tooling is built.
- Mobile app punching is out of scope — the new web punch surface is a browser page, not a
  native app.

## Constraints

- **Org scoping (resolved).** JoJo Potato and Sweetleaf are gated via the existing
  `isFoodServiceOrg()` / `FOOD_SERVICE_ORG_IDS` allowlist in `src/lib/orgs.ts` — reused as-is
  for AM/PM split, location capture, and backlog import. No new `Organization` column.
- **Payroll must not regress (resolved).** `AttendanceDay` stays one row per
  `(employeeId, date)` — `@@unique([employeeId, date])` is unchanged. AM/PM fields are
  additive columns on that same row; `timeIn`/`timeOut` keep their current meaning (first
  punch / last punch of the day). Criterion 3 proves Days of Work and hour totals remain
  correct under this shape.
- **Backlog import must respect existing locks.** `isLocked` and `manuallyEdited` on
  `AttendanceDay` exist specifically to protect HR's hand corrections and finalized periods
  from being silently overwritten by re-derivation. A backlog import is a re-derivation risk
  and must honor the same guard (criterion 15).
- **Location/PII handling (resolved).** Location data is sensitive personal data about where
  an employee physically was. It must be visible only to roles already entitled to see that
  employee's attendance (criterion 11), plus the employee themselves; must never block a
  punch from being recorded if unavailable (criteria 7–10); and its retention follows the
  same lifecycle as the attendance/punch record it hangs off — no separate purge window.
- **No new production dependency without justification.** The repo currently has zero
  spreadsheet-parsing, EXIF-parsing, or image-processing libraries. Any new dependency
  INNOVATE proposes to satisfy the spreadsheet backlog importer (#200) should be named and
  justified there — this SPEC does not pre-select one. No image-processing dependency is
  needed at all, since bulk photo import is out of scope (Decision 3).
- **Audit trail.** Every new write path this cluster introduces (AM/PM punches, web punch +
  location capture, backlog import) must produce an audit entry via the existing
  `writeAuditLog`/`AuditContext` mechanism, matching the two existing recording shapes
  (per-record and per-range-summary) already used elsewhere in this codebase.
- **Discord remains a live punch source, unchanged (resolved).** The new web punch surface
  (first-ever writer of `PunchSource.WEB`) is additive. Discord `/in`/`/out` continue to work
  for every tenant and never carry location — the location requirement in #177 applies only to
  the new web surface (Decision 2).

## Decisions Resolved

All decisions below were resolved by the user on **2026-08-17**. Each is now binding on
INNOVATE/PLAN — the options are recorded here for traceability, but only the chosen
consequence is in force going forward.

**Decision 1 — What does the AM/PM split change on disk?**
**Chosen: Option A — extend the existing record.**
Consequence (binding): AM/PM-specific fields are added to the existing one-row-per-date
`AttendanceDay` record. `@@unique([employeeId, date])` is unchanged. `timeIn`/`timeOut` keep
their current meaning — first punch of the day / last punch of the day — so every existing
payroll, report, CSV export, and payslip reader that already reads those two fields is
unaffected and needs no modification. The AM/PM fields are purely additive.

**Decision 2 — Does #177 require a new web punch surface?**
**Chosen: Option A — build a minimal web punch surface with live browser geolocation.**
Consequence (binding): a new, session-authenticated web page/route is built where an employee
can punch in and the browser's `navigator.geolocation` is read at that moment. This is the
first-ever writer of `PunchSource.WEB`. Discord `/in`/`/out` are untouched — they keep working
exactly as today, for every tenant, and never carry location. Because this is a real browser
API, the SPEC's acceptance criteria (8–10) explicitly cover the permission-denied path, the
no-fix/low-accuracy path, and the HTTPS requirement, and require that none of those cases ever
block or fail the punch itself (criterion 7).

**Decision 3 — How far does #200 go?**
**Chosen: Option A — spreadsheet/CSV backlog upload only.**
Consequence (binding): the only backlog-capture mechanism built in this delivery is a
spreadsheet upload, validated and imported respecting locks (criteria 15–19). Bulk TimeMark
photo import is explicitly out of scope (see `## Out Of Scope`) and, if wanted, is a separate
future issue — not an implicit fast-follow of this one. No image-processing/EXIF dependency is
introduced by this work.

**Decision 4 — Which org gate?**
**Chosen: Option A — reuse `isFoodServiceOrg()` as-is.**
Consequence (binding): no new `Organization` column or feature-flag table is introduced by
this cluster. All three features (#162/#177/#200) gate on the existing
`FOOD_SERVICE_ORG_IDS` allowlist in `src/lib/orgs.ts`, consistent with every other
food-service-only behavior already in the codebase (`trackTardiness`, branches).

**Decision 5 — Location data retention and visibility.**
**Chosen: Option A — same lifecycle as the attendance/punch record.**
Consequence (binding): no separate retention window or purge tooling is built for location
data; it is deleted/retained exactly when the underlying attendance/punch record is. Because
location is sensitive personal data, it must not appear on any surface that is not already
gated for attendance data (criterion 11), and — as an explicit requirement carried forward
from this decision — it must be visible to the employee themselves on their own punch record,
not just to HR/Manager roles.

## Open Questions

None. All five decisions RESEARCH surfaced are resolved above. PLAN/INNOVATE may proceed.

## Background / Research Findings

Full detail lives in `research-findings_REF_17-08-26.md` in this task folder. Key facts that
shaped this SPEC:

- **Three independent "hours for a day" engines exist** (`derive.ts` authoritative/payroll-
  feeding, `timelog.ts`'s `pairPunchesToDailyHours` which already sums multiple pairs per day
  but ignores `WorkSchedule`, and `TimesheetModal.svelte`'s browser-side `recalcRow` which has
  no test at all). Nothing pins them to agree — hence criterion 4.
- **`AttendanceDay.@@unique([employeeId, date])` is explicitly defended in code** as necessary
  for the payslip's "Days of Work" count (`derive.ts:8-13`). This drove Decision 1 — the
  chosen option (additive fields on the same row) leaves this constraint untouched.
- **No location data exists anywhere in the schema.** Zero hits for
  `latitude|longitude|geo|coordinates|accuracy`. `Branch.address` is free text with no
  lat/lng. No browser geolocation API usage exists in `src/`.
- **Every live punch today arrives via Discord slash command, HMAC-authenticated, not
  session-auth.** There is no browser "time in" button anywhere. `PunchSource.WEB` has zero
  writers. This is why #177 as literally written ("record where the employee punched in")
  could not be satisfied by the current punch path without a new web surface — Discord
  commands cannot carry a geolocation reading. Decision 2 resolves this by building that
  surface.
- **"TimeMark" has no code counterpart.** It is a third-party geotagging camera app named in
  the issue as a possibility, not existing infrastructure. Decision 3 keeps it out of scope.
- **No spreadsheet-reading capability exists.** The repo only ever *writes* CSV
  (`exportToCSV()`, `reports.ts:624`); nothing parses `xlsx`, `csv`, or any office format in.
  A backlog importer is a new capability, though the codebase has a solid precedent to follow:
  `requests/documents.ts`'s upload validation pipeline (count/size/MIME checks before
  persisting, magic-byte verification, transactional rollback on partial failure, per-file
  audit entries).
- **Per-org behavior precedent is a hardcoded allowlist**, not a settings table:
  `FOOD_SERVICE_ORG_IDS` in `src/lib/orgs.ts`, whose own comment anticipates an
  `Organization` column flag as a *future* upgrade path once a fourth tenant needs
  org-specific behavior. Decision 4 keeps the allowlist for now.
- **Idempotency precedent exists** for the Discord replay case: a DB unique constraint plus an
  app-level pre-check giving a clean 409. This is the direct model for backlog-import
  idempotency (criterion 16).
- **Lock/manual-edit guards already exist and are enforced** (`isLocked`,
  `manuallyEdited` on `AttendanceDay`), specifically to keep automated re-derivation from
  silently overwriting HR's hand corrections or finalized periods. A backlog import is exactly
  this kind of re-derivation risk (criterion 15).
- **No test today asserts the three hours engines agree**, no test covers
  `TimesheetModal.svelte`'s engine at all, and no test asserts an import respects a locked day
  — these are the specific test gaps this SPEC's acceptance criteria are designed to close.
- User's brainstorm framing (from the three GitHub issues, verbatim): AM/PM split is
  explicitly scoped to JoJo Potato and Sweetleaf ("Not applicable for Veent"); location
  capture is explicitly scoped the same way and floated TimeMark photo upload as one possible
  mechanism, not a requirement; offline capture floated both Excel upload and TimeMark
  photo-batch as possible solutions and explicitly invited "other offline options" — the user
  resolved this by choosing the lowest-risk option (Excel/CSV-only) rather than building both.

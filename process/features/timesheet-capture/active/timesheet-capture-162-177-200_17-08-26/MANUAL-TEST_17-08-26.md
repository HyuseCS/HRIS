# Manual GUI walkthrough — #162 / #177 / #200

Branch `feat/timesheet-capture-162-177-200` @ `fc39207`.
Written against the **shipped code**, not the plan — the UI/UX fix pass changed copy, moved
columns and added states, so the plan's M-scripts are stale. Use this file.

Every step names the exact control, plants a findable marker, and asserts something **positive**.
"The card is absent" proves nothing.

Markers used throughout: employee **JJ-002 (Benjie Fryer)**, dates **2026-08-04** and
**2026-08-05**. Nothing else in the seed touches those.

---

## 0. Setup

From the repository root:

```bash
./start.sh                 # Postgres on 5434
pnpm db:push               # the branch adds columns; skip only if already pushed
pnpm prisma generate       # ALWAYS after a push — a stale client fakes type errors
pnpm dev                   # prints the port; 5173 unless it is taken
```

Log in at `/login`. It is a **two-step tenant login**: click the tenant first, then enter
credentials.

| Who | Tenant | Email | Password |
|---|---|---|---|
| JoJo Potato manager (has an employee record, `JJ-001`) | **JoJo Potato** | `manager@jojo.ph` | `Manager@1234` |
| Veent admin (negative control) | **Veent** | `admin@veent.ph` | `Admin@1234` |
| Cross-org CEO (**no** JoJo employee record) | **Veent**, then switch org | `ceo@veent.ph` | `Ceo@1234` |

psql, when a step calls for it — note the port is 5434 **inside** the container too, table names
are snake_case, and **column names are camelCase and need double quotes**:

```bash
docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -c '<SQL>'
```

---

## A. #200 — import a backlog CSV

Create `/tmp/backlog-test.csv`:

```csv
employeeNumber,date,amIn,amOut,pmIn,pmOut
JJ-002,2026-08-04,08:00,11:00,13:00,17:00
JJ-002,2026-08-05,08:00,11:50,12:10,17:00
```

The two rows are deliberately different: row 1 has a **2-hour** midday gap, row 2 has a
**20-minute** gap. That difference is what steps B and C measure.

1. Log in as **manager@jojo.ph** on the **JoJo Potato** tenant.
2. Go to **Attendance** (`/attendance`).
3. Scroll to the card headed **"Import backlog CSV"**.
   **ASSERT** it reads `Limits: 2 MB per file, 2,000 rows, and a 62-day span.`
   (Those numbers come from the service constants — if they read differently, `load` is not
   passing them through.)
4. Choose `/tmp/backlog-test.csv`, click **Import backlog CSV**.
5. **ASSERT** a **green** box appears reading **"Import complete — 2 rows applied."**
   Under it: `Applied 2 rows (8 punches), skipped 0 duplicates, rejected 0 rows.`

### A2 — re-upload is harmless AND says so

6. Click **Import backlog CSV** again with the same file.
7. **ASSERT** a **neutral grey** box reading **"Already imported — every row in this file was
   here already."** with `skipped 4 duplicates` in the line beneath.

   It must **not** be red. Red here was the bug: the card promises re-uploading is harmless, and
   the old code then coloured that promise as a failure.

### A3 — a rejected row explains itself

8. Make `/tmp/backlog-bad.csv`:
   ```csv
   employeeNumber,date,amIn,amOut,pmIn,pmOut
   ZZ-999,2026-08-06,08:00,11:00,13:00,17:00
   ```
9. Import it. **ASSERT** a **red** box reading **"Nothing was imported — no rows were applied."**,
   and that the **"Why rows were rejected"** section is **already open** (not collapsed), naming
   the employee number as not found.

---

## B. #162 — the AM/PM split appears

10. Still on **Attendance**, set the date filter to cover **2026-08-04 → 2026-08-05** and press
    **Refresh**.
11. **ASSERT** the table has columns **AM In, AM Out, PM In, PM Out**, and that they sit **after**
    Reg / OT / Night / Late-UT, not before them. (They used to push Reg and OT off the right edge.)
12. **ASSERT** the note above the table: the split is worked out from the punches, and a day is
    corrected by editing In and Out.
13. On **JJ-002's 2026-08-04** row, **ASSERT** the four cells read `08:00 · 11:00 · 13:00 · 17:00`.
14. On **JJ-002's 2026-08-05** row, **ASSERT** all four cells read `—`.
    The 20-minute gap is below the 30-minute default, so this day is deliberately one block.

Confirm in the database:

```bash
docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
'SELECT a.date, a."amTimeIn", a."amTimeOut", a."pmTimeIn", a."pmTimeOut", a."workedHours"
 FROM attendance_days a JOIN employees e ON e.id = a."employeeId"
 WHERE e."employeeNumber" = '"'"'JJ-002'"'"' AND a.date IN ('"'"'2026-08-04'"'"','"'"'2026-08-05'"'"') ORDER BY a.date;'
```

**ASSERT** 2026-08-04 has four timestamps, 2026-08-05 has four NULLs — **and note both rows'
`workedHours`. You need them in step D.**

---

## C. #162 — the per-org threshold actually moves the split

15. Go to **Settings → Schedules** (`/settings/schedules`).
16. **ASSERT** a card headed **"AM / PM break length"** with a visible **Minutes** label above the
    input, and body copy saying shorter breaks are ignored and that blank uses the default.
17. Type **15** and click **Save**.
18. **ASSERT** a **green** confirmation appears reading **"Saved — 15 minutes."**
    (Not just the number sitting in the box — silence here was the bug.)
19. Go back to **Attendance**, same date range, press **Refresh**.
20. **ASSERT** JJ-002's **2026-08-05** row now shows `08:00 · 11:50 · 12:10 · 17:00`.
    The 20-minute gap now exceeds the 15-minute threshold, so the day splits.

    **This is the whole point of the setting.** If this cell is still `—`, the threshold is not
    reaching `derive.ts`.

21. Clear the box (leave it empty) and click **Save**.
22. **ASSERT** the confirmation reads **"Cleared — using the default."** — different words from
    the save case, because "Saved — 30 minutes" would be a lie about a NULL.

### C2 — the bounds are enforced server-side

23. Type **2** and click **Save**. **ASSERT** an error appears **under the field itself** (not only
    in the page-top banner) and that the input is outlined red.
24. Type **abc** and Save. **ASSERT** the message is about a **whole number**, which is different
    wording from the bounds message in step 23.

---

## D. Payroll is untouched — the safety claim

The whole design rests on AM/PM being display-only.

25. Re-run the psql query from step B.
26. **ASSERT** `workedHours` for both dates is **identical** to what you recorded in step B,
    despite the threshold having changed the split in between.

If `workedHours` moved, stop — the display-only guarantee is broken and that is a pay bug.

---

## E. Veent is untouched — the negative control

27. Log out. Log in as **admin@veent.ph** on the **Veent** tenant.
28. Go to **Attendance**. **ASSERT** there are **no** AM/PM columns and **no** "Import backlog CSV"
    card.
29. Go to **Settings → Schedules**. **ASSERT** the "AM / PM break length" card is **not** present,
    while the tardiness controls above it **are** — proving the page rendered and only this card is
    gated.
30. **ASSERT** the sidebar has **no Punch entry**.

---

## F. #177 — punching with location

31. Log in as **manager@jojo.ph** on **JoJo Potato**.
32. **ASSERT Punch is the FIRST item in the sidebar** (it was fourth; crew who need only this page
    should not scroll past three they cannot use).
33. Open **Punch** (`/punch`).
34. **ASSERT**, before touching anything:
    - a line stating **"Not clocked in"**
    - the disclosure sentence — that punching records where you are, and that your punch is saved
      even if you say no. **It must be visible BEFORE you tap**, not after a failure.
35. Click **Punch In**. Allow location when the browser asks.
36. **ASSERT** while it works: the status reads **"Finding your location…"**, the button reads
    **"Punching in…"**, and **Punch Out is greyed out**.
37. **ASSERT** afterwards: **"Punched in with your location."** and a **"View on map (±N m)"**
    link in the history list.
38. Reload `/punch`. **ASSERT** the top line now reads **"Clocked in since HH:MM"**.

Confirm no coordinate leaked into the audit trail:

```bash
docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
'SELECT count(*) FROM audit_logs WHERE "newValue"::text ILIKE '"'"'%latitude%'"'"';'
```

**ASSERT the count is 0.**

## G. #177 — denying location still punches

39. In Chrome: padlock in the address bar → **Location → Block**. Reload `/punch`.
40. Click **Punch Out**.
41. **ASSERT** the punch still lands: **"Punched out without a location."**
    A denial must never cost someone their punch. Reset the permission afterwards.

## H. #177 — the double-tap that used to record the wrong type

This is the blocker. It needs a slow fix to be visible, so throttle first:
DevTools → **Sensors** → Location → a custom position, and DevTools → **Network** → **Slow 3G**.

42. Reload `/punch`. Click **Punch In**, then immediately click **Punch Out** while it still says
    "Finding your location…".
43. **ASSERT** the result is **"Punched in …"** — an **IN**, matching your first tap.
    **ASSERT** the newest history row is a **Clock in**.

    Before the fix this recorded an **OUT** and then threw a red 409.

## I. #177 — a user with no employee record

44. Log in as **ceo@veent.ph** (tenant **Veent**), then switch the active organisation to
    **JoJo Potato** using the org switcher. This account has an employee record **only** in Veent.
45. Click **Punch** in the sidebar.
46. **ASSERT** you get a readable message inside the app — that punching is for staff with an
    employee record, ask HR to link the account — **with the sidebar still visible**.
    You must **not** get the bare full-page 404 with no way back.

---

## Cleanup

```bash
docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
'DELETE FROM time_logs WHERE source IN ('"'"'WEB'"'"','"'"'MANUAL'"'"');'
docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
'UPDATE organizations SET "amPmMinGapMinutes" = NULL;'
```

Then delete the attendance days for JJ-002 on 2026-08-04/05 if you want a clean slate, or just
press **Refresh** on Attendance to re-derive them.

---

## What this walkthrough does NOT prove

- **Real-device GPS accuracy.** Every reading above is synthetic; a browser on a desktop reports
  an accuracy figure that a phone outdoors will not match. Needs a real phone on the real site.
- **The insecure-origin branch** (`unsupported`). `localhost` is a secure context, so
  `navigator.geolocation` always exists here. Only reachable from a plain-http deployment.
- **Behaviour at scale** — a 2,000-row import, or an attendance range with hundreds of employees.

# Live walk — issue #3, cross-month pay periods

Branch `feat/cross-month-periods-3`, 18 commits, not pushed. All offline gates green
(format, lint, typecheck, 192 files / 2170 tests). This file is the end gate.

Tick each box as you go. Anything red stops the walk.

---

## A1 — Start the stack (you)

```
./start.sh
pnpm dev --port 5173
```

Note: `.claude/skills/verify/SKILL.md` is stale — it names container `veent_wifiportal-db-1`,
port 5433 and `.env`. `CLAUDE.md` is correct: `veent-db-5434`, port 5434, `.env.dev`.
Not fixed here, out of scope.

Seeded logins (`tests/e2e/helpers.ts`):

| Login | Password | Role |
|---|---|---|
| `admin@veent.ph` | `Admin@1234` | Super Admin |
| `payroll@veent.ph` | — see helpers | Payroll |
| `manager@veent.ph` | `Manager@1234` | Manager |

---

## A2 — Automated tiers that have never run

```
pnpm build && pnpm test:e2e
pnpm test:integration
```

- [ ] e2e green — includes the two new picker specs (`period-picker-cross-month.spec.ts`,
      `period-picker-default-cutoff.spec.ts`)
- [ ] integration green — includes the payroll lock race (`payroll-run-serialisation.test.ts`)

**R-1, open question.** `period-picker-cross-month.spec.ts` assumes Playwright's `fill()` can set a
date PAST an input's `max`. If it cannot, one assertion in that spec is unreachable — there is a
documented one-assertion fallback in the spec's comments. Resolve it here.

---

## A3 — The lock negative control

The only check that needs a source edit, so it can never live in a committed test.
Run it once, record the result.

1. [ ] `pnpm test:integration` GREEN as committed. **Positive control — without this the rest
       proves nothing.**
2. [ ] Comment out `await lockPayrollRuns(tx, organizationId)` in `createPayrollRun`
       (`src/lib/server/services/payroll/index.ts`). Change nothing else.
3. [ ] Re-run. `payroll-run-serialisation.test.ts` **must now FAIL** — two rows written, or no
       overlap 409. If it still passes, the test is not proving the lock and must be fixed before
       any PR.
4. [ ] Restore the line by **re-typing it**. Do NOT run `git checkout <file>` — it silently
       reverts every uncommitted change in that file.
5. [ ] Re-run. GREEN again.
6. [ ] Record green → red → green with the exact failure text from step 3.

Failure text seen:

```
(paste here)
```

---

## A4 — Browser walk, 8 items

Against each real database where more than one exists.

### 1. Measure the allocation split

```sql
SELECT allocation, count(*)
FROM employee_statutory_config c
JOIN employees e ON e.id = c."employeeId"
WHERE e."employmentStatus" = 'ACTIVE'
GROUP BY allocation;
```

Nobody has ever taken this measurement. It decides how many orgs the cutoff refusal actually
blocks.

- [ ] Result recorded:

```
(paste here)
```

### 2. The driver case

On an **even-split** org, create a **26 Dec – 10 Jan** payroll run in the browser.

- [ ] Saves
- [ ] Shows the real dates, not a clipped month
- [ ] Day count is inclusive
- [ ] Computes

### 3. Read a payslip from it

Pick an employee whose salary makes **52% and 50% visibly different** in pesos. A small salary
hides the difference and the check proves nothing.

- [ ] Prorated amounts match the summed share, not a flat half

### 4. Over the cap is refused

Try **1 Feb – 3 Mar**. 31 days, but 109.68% of a month.

- [ ] Refused
- [ ] Message names **110%**
- [ ] No run was created (check the list, do not trust the toast)

### 5. The exact boundary

Try **26 Dec – 25 Jan**. Sums to exactly 1.0.

- [ ] **ACCEPTED.** If this is refused the cap is off by one.

### 6. The cutoff hole — the security item

On a **FIRST-allocation** org, try **20 May – 5 Jun**.

- [ ] Refused
- [ ] Message names **June** (not May — naming the wrong month means the widened guard did not
      walk both months)
- [ ] **Negative control:** the same org still creates its standard **1–15 June** run afterwards

Without the control, "refused" and "this org is broken" look identical.

### 7. Attendance path

On `/attendance`, drive **Save as timesheet** across a month boundary.

- [ ] Saves. This path has no gate of its own — it inherits `createTimesheet`'s.

### 8. Legacy scan, BEFORE anything recomputes

```
pnpm dotenv -e .env.dev -- tsx scripts/legacy-nonstandard-runs.ts
```

- [ ] WILL MOVE list read and accepted:

```
(paste here)
```

---

## A5 — Two checks the plan's checklist misses

### 9. Recompute one existing standard run, diff to the centavo

The whole change rests on "standard periods do not move". No stored row has ever proved it.
`computePayroll` gates on run **status** only, so every stored DRAFT/COMPUTED run hits the
rewritten fraction on its next Recompute.

- [ ] Net pay identical before and after, to the centavo

### 10. A cross-year payslip header

`formatPeriodPreview` drops the start year, so it prints `Dec 26 – Jan 10, 2027`.

- [ ] Confirm what the payslip actually renders

Cosmetic, but this issue is what makes it reachable. **Follow-up issue, not a fix now.**

---

## R1 — Residual, being closed now

`timesheetLockKey` had no serialisation proof — the race test covers the payroll lock only, and
C7 changed BOTH keys. A subagent is building
`tests/integration/timesheet-serialisation.test.ts` plus the Employee fixture the harness lacks,
with its own bite proof. When it lands, add it to A2 and A3.

- [ ] Landed and green
- [ ] Its own bite proof recorded: green → red → green

---

## Standing rules during the walk

- You start the servers and the DB container. I never launch `./start.sh`, vite or
  `veent-db-5434` unasked. Driving an already-running app is fine.
- Never `git checkout <file>` to undo a temp edit.
- No push, no PR until you ask.

---

# RESULTS — owner-driven walk, 2026-09-03

All six steps PASS. Driven by the owner in the browser on **JoJo Potato** (attendance step on
Veent, the only org with 2026 attendance data). Rows created were deleted afterwards; the
database is back to two seeded runs and an empty `employee_statutory_config`.

| # | Step | Observed |
|---|---|---|
| 1 | `2026-12-26 → 2027-01-10` | Saves. 16 days, 52% of a month |
| 2 | Gross column on that run | **₱20,645.16** for JJ-001 (₱40,000 salary). A flat half-month would be ₱20,000.00 |
| 3 | `2026-02-01 → 2026-03-03` | The calendar's `max` blocks the date — unreachable in the UI. Server refusal separately proven with 0 rows written |
| 4 | `2026-07-27 → 2026-08-26` | Saves. 100% of a month — the exact-1.0 boundary is not off by one |
| 5 | `2026-05-20 → 2026-06-05` on a FIRST org | Refused, naming **June 2026** and the 1–15 cutoff. Negative control: standard First half June 2026 saves on the same org |
| 6 | Save as timesheet `2026-07-25 → 2026-08-08` | `Timesheet saved (15 days).` |

Step 5's message, verbatim:

> A custom period cannot overlap the 1–15 cutoff of June 2026, because that run collects the whole
> month's employee statutory share for some employees. Use a range outside it, or run the standard
> First half period.

It names **June**, the second month. May is the start month and is not named, because the May 1–15
window is not overlapped. That is research F5's hole closed: the pre-#3 guard derived the month from
the range start alone, so `20 May → 5 Jun` was allowed and then swallowed June's entire cutoff
window while `resolveEE` paid zero employee statutory for the month.

## Two UI findings raised by the owner during the walk

Both **pre-existing**, neither caused by #3, both on surfaces #3 did not touch.

- **W-1** `attendance/+page.svelte` renders `form.error` twice for a single failure. The block at
  `:489` sits inside the CSV import card and its comment scopes it to "this action" (the import),
  but its condition is the bare `form?.error`, which every action on the page sets. A Save-as-
  timesheet failure therefore also prints under the upload heading. Seen live as
  `No attendance in this range` appearing twice.
- **W-2** Creating a standard period from `/payroll` gives no success indicator. The run is created
  correctly; nothing confirms it.

## Not run, and why

- **A3, the payroll lock negative control.** The equivalent bite proof was run on the timesheet lock
  during C14 (green → red → green, `expected 1 fulfilled, got 2` with the lock removed), and C13's
  race is green. A3 remains the one unrun item on this checklist.
- **Item 9 (recompute drift) and item 4's server refusal** were run by an agent against this same
  database earlier, not by the owner: zero centavos of drift across 40 entries and 202 lines, and
  zero rows written for the over-cap range. The seeded Veent `2026-08-01 → 2026-08-15` run still
  carries that recompute — its 40 entries were replaced with 84 (the current active roster), which
  is pre-existing `computePayroll` behaviour unrelated to the fraction rewrite.

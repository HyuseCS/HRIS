---
name: test-script:ui-ux-overhaul-phase-05-destructive-actions
description: "Owner click-through test script for phase 5 (destructive-actions): 16 P1 rows plus P2-P6, R1-R3, A1 and G5, each stage given twice — manual browser steps and the same steps as Playwright MCP tool calls."
date: 11-09-26
metadata:
  node_type: memory
  type: test-script
  feature: ui-ux-overhaul
  phase: "05"
---

# Phase 5 — `destructive-actions` — owner test script

## TL;DR

Phase 5 put a kit confirm dialog in front of every irreversible, money-affecting or
person-affecting action — 16 sites, 14 changed, 2 verify-only — and removed the last three native
browser `confirm()` calls. The code gates are green; **nothing was ever opened in a browser.**

**Done** means: every P1 row 1-16 (incl. 12b) recorded with **both** a cancel column and a confirm
column, plus P2, P3, P4, P5, P6, R1, R2, R3, A1 and G5 recorded. A green `pnpm test` proves the
strings exist in the source, not that any dialog opens.

Two modes are given for every stage: **Manual** (a human in a browser) and **Playwright MCP** (tool
calls to hand to Claude). Pick one per stage; do not mix within a stage.

---

## 1. Preconditions

### The owner starts the app and the database. This script never does.

- Dev server: `pnpm dev` (from `package.json`: `dotenv -e .env.dev -- vite dev`).
  `pnpm dev` runs `vite dev`, which does not read `PORT` (`PORT=3000` in `.env.dev` is for the built
  adapter-node server), so the dev app is at **`http://localhost:5173`**. If vite prints another
  port, use that. Every URL below is written as a path — prefix it with the origin vite printed.
- Database: Docker container `veent-db-5434`, Postgres on port **5434 inside the container too**.
  Every psql command in this doc needs the **`-i`** flag. Without `-i`, `docker exec` runs zero SQL
  and still exits 0 — a silent fake pass.
  ```
  docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c "SELECT 1"
  ```
- Branch: `feat/uiux-phase-5`, head `1bf99af`. Phase 5 range is `b3334f0..1bf99af`.
- `pnpm check` kills the dev server. Do not run the CI gates while a pass is in progress.

### One-click dev login (no password)

`POST /api/v1/_dev/login-as` with body `{"email":"..."}` sets the session cookie. Dev-only.

- **Manual mode:** the **Dev login** pill (amber, bottom-right, `z-[100]`) from
  `src/lib/components/dev/DevLoginSwitcher.svelte`. It renders on every `(app)` page and on the
  login page. Click it, pick an account, the page hard-navigates to `/dashboard`.
- **Playwright MCP mode:** the pill is **deliberately hidden** under automation
  (`if (dev && !navigator.webdriver) show = true`). Use the fetch call given in each stage.

### Accounts

From `prisma/seed-core.ts`. Capability→role map from `src/lib/rbac.ts`.

| Email | Password | Role | Capabilities that matter here | Stages |
|---|---|---|---|---|
| `admin@veent.ph` | `Admin@1234` | SUPER_ADMIN | OVERRIDE_FINALIZED, ADMINISTER_SYSTEM, MANAGE_STATUTORY_RATES, MANAGE_PAYROLL, MANAGE_HR | P1-2, 4, 6, 7, 8, 9a, 12, 12b, 13, 14; P2; P3 |
| `ceo@veent.ph` | `Ceo@1234` | CEO | MANAGE_STATUTORY_RATES, ADMINISTER_SYSTEM, MANAGE_PAYROLL, MANAGE_HR | P1-7, 8, 9a (alternative to admin) |
| `hr@veent.ph` | `Hr@1234` | HR_ADMIN | MANAGE_HR, ADMINISTER_HR_ORGWIDE, MANAGE_PAYROLL, PROPOSE_STATUTORY_RATES | P1-1, 3, 5, 9b, 10, 11, 15; P4, P5, P6; R1 |
| `manager@veent.ph` | `Manager@1234` | MANAGER | MANAGE_HR, MANAGE_PAYROLL (no ADMINISTER_HR_ORGWIDE) | R3 |
| `approver@veent.ph` | `Approver@1234` | APPROVER | APPROVE_REQUESTS | P1-16 |
| `employee@veent.ph` | `Employee@1234` | EMPLOYEE | none of the above | R3 |
| `verifier@veent.ph` | `Verifier@1234` | VERIFIER | VERIFY_REQUESTS | (not needed) |

Capability → role, verbatim from `src/lib/rbac.ts`:

- `OVERRIDE_FINALIZED: ['SUPER_ADMIN']` — **only `admin@veent.ph`.**
- `ADMINISTER_SYSTEM: ['SUPER_ADMIN', 'CEO']`
- `MANAGE_STATUTORY_RATES: ['CEO', 'SUPER_ADMIN']`; `PROPOSE_STATUTORY_RATES: ['HR_ADMIN']`
- `ADMINISTER_HR_ORGWIDE: ['HR_ADMIN', 'SUPER_ADMIN', 'CEO']`
- `MANAGE_HR: ['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO']`
- `MANAGE_PAYROLL: ['MANAGER', 'SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER', 'CEO']`

### Seed data each stage needs, and the marker to plant

A cleanup that says "card is absent" proves nothing. Every fixture below carries a **distinctive
marker string** so the row is findable afterwards by exact match, and so cleanup can target it.

| Stage | Fixture needed | Marker | How to get it |
|---|---|---|---|
| P1-1 | one employee, `employmentStatus = ACTIVE`, whose loss you accept | `employeeNumber = 'p5-offboard'` | create via `/employees` "Add Employee", or SQL below |
| P1-2, P1-3 | a payroll period at `LOCKED` (release) and one at `RELEASED`/`LOCKED` (void) | `name = 'p5-void'` / `name = 'p5-release'` | `/payroll/periods` → **Open Period**, then **Generate**, then **Lock** |
| P1-4 | a payroll run not `VOIDED` | reuse the run under `p5-void` | comes from Generate above |
| P1-5 | any entry inside a payroll run detail | note text `p5-override` | reuse the run under `p5-release` |
| P1-6 | none (edits live config) | note the six "was" values first | `/payroll/config` |
| P1-7, P1-8 | one **PENDING** statutory proposal | change only Pag-IBIG cap to a recognisable number, e.g. `99999` | log in as `hr@veent.ph`, `/payroll/statutory-rates`, edit, **Submit for CEO approval** |
| P1-9, P1-10, P4 | none | as above | |
| P1-11 | a performance review with `releasedAt IS NULL` | note the review id | see SQL below |
| P1-12, P1-12b | a user you can lock out and back in | use `employee@veent.ph` | `/settings/roles` |
| P1-13, P1-14, P3 | a separation, status `CLEARED`, cleared by a **different** actor than the finalizer (#297) | `employeeNumber = 'p5-sep'` | easiest: run the e2e fixture, see "Setup gaps" |
| P1-15, P6 | an attendance day with `manuallyEdited = true` | note the employee + date | produced by doing a **Save** correction in P6 step 1 |
| P1-16 | ≥1 pending approval request | none | `/requests/approvals` as `approver@veent.ph` |
| R1 | any employee with a salary and gov IDs | `employee@veent.ph`'s employee row | `/employees` |

Find candidate rows (all tables are snake_case via `@@map`; **columns are camelCase and must be
double-quoted** — there are no field-level `@map`s in `prisma/schema.prisma`):

```
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
  "SELECT id, \"employeeNumber\", \"firstName\", \"lastName\", \"employmentStatus\" FROM employees WHERE \"employmentStatus\"='ACTIVE' ORDER BY \"createdAt\" DESC LIMIT 10"

docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
  "SELECT id, name, status FROM payroll_periods ORDER BY \"createdAt\" DESC LIMIT 10"

docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
  "SELECT id, \"employeeId\", status, \"releasedAt\" FROM performance_reviews WHERE \"releasedAt\" IS NULL LIMIT 5"

docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
  "SELECT id, status, \"employeeId\" FROM separation_records ORDER BY \"createdAt\" DESC LIMIT 5"
```

---

## 2. How to run

**One test at a time.** For each stage, in this order:

1. Say which stage you are starting and which account it needs.
2. Run **only that stage's** steps — cancel path first, then confirm path.
3. Report the result: the dialog title you saw, the message you saw, and the positive assertion
   after cancel and after confirm.
4. **Wait.** Do not chain into the next stage, and never chain two browser writes in one go.

A "cancel" result is only a pass if a **positive** assertion holds: the status badge still says the
old value, or the psql row still holds the old value. "The dialog closed" is not evidence.

### Results table (fill this in)

| Stage | Account | Cancel result | Confirm result | Pass/Fail | Note |
|---|---|---|---|---|---|
| P1-1 Offboard | | | | | |
| P1-2 Period void | | | | | |
| P1-3 Period release | | | | | |
| P1-4 Run void | | | | | |
| P1-5 Net-pay override | | | | | |
| P1-6 DOLE multipliers | | | | | |
| P1-7 Statutory Confirm | | | | | |
| P1-8 Statutory Reject | | | | | |
| P1-9 Statutory save | | | | | |
| P1-10 Statutory dirty guard | | | | | |
| P1-11 Release review | | | | | |
| P1-12 Deactivate login | | | | | |
| P1-12b Activate login | | n/a | | | no dialog expected |
| P1-13 Separation finalize | | | | | |
| P1-14 Separation undo | | | | | |
| P1-15 Attendance reset | | | | | |
| P1-16 Bulk reject | | n/a | | | verify-only |
| P2 Cancel writes nothing | | | | | |
| P3 Keyboard walk | | | | | |
| P4 Dirty guard clears on save | | | | | |
| P5 Override thresholds | | | | | |
| P6 Reset keep-values | | | | | |
| R1 Masked reveal | | | | | |
| R2 17 ConfirmButton sites | | | | | |
| R3 Nav per role | | | | | |
| A1 impeccable audit | | | | | |
| G5 e2e vs baseline | | | | | |

### The dialog, once — selectors for every stage

From `src/lib/components/ui/ConfirmDialog.svelte` → `Dialog.svelte`:

- The panel is `role="alertdialog"` with `aria-modal="true"` and `aria-label={title}`.
- Inside it: an `<h2>` holding the same title text, a `<p>` holding the message
  (`whitespace-pre-line`, so `\n` shows as real line breaks), then two buttons —
  **cancel** (default label `Cancel`) and **confirm** (the stage's `confirmText`).
- While a `ConfirmButton` submit is in flight, the confirm button's label becomes **`Working…`**.
- Escape closes only this dialog (`e.stopPropagation()` in `Dialog.svelte`). Backdrop click closes
  it. Focus goes to the panel on open and returns to the trigger on close.

Playwright MCP shorthand used below:

- open the dialog → `browser_click` on the trigger, then
  `browser_wait_for` text = the dialog title.
- cancel → `browser_click` element "Cancel button" (ref from `browser_snapshot`).
- confirm → `browser_click` element "<confirmText> button" inside the alertdialog.
- The e2e suite's own helper is the pattern to copy
  (`tests/e2e/separations.spec.ts`):
  `page.getByRole('alertdialog').getByRole('button', { name: confirmText }).click()`.

Login in MCP mode, every stage (replace the email):

1. `browser_navigate` → `http://localhost:5173/login`
2. `browser_evaluate` →
   `() => fetch('/api/v1/_dev/login-as',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'hr@veent.ph'})}).then(r=>r.status)`
3. `browser_navigate` → the stage's page URL.

**Hydration gotcha:** a click that lands before Svelte hydrates is silently dropped. If a dialog
does not appear, `browser_snapshot` and click again. The repo's e2e helpers wrap exactly this in a
retry loop (`tests/e2e/helpers.ts` `selectTenant`). A first-click miss is not a phase-5 defect.

---

## 3. Stages

### P1-1 — Offboard employee

Site 1. File `src/routes/(app)/employees/[id]/+page.svelte`. Gate: `MANAGE_HR`.
Account: **`hr@veent.ph`**.

**Manual**

1. Log in as `hr@veent.ph`. Go to `/employees`, open the employee you marked `p5-offboard`
   (URL becomes `/employees/<id>`).
2. Scroll to the bottom card headed **Offboard Employee** (red border).
3. Leave **Last Day** empty and click **Offboard**. Expect the browser's own required-field bubble
   on the date input and **no dialog** (the button calls `reportValidity()` first — deviation D2).
4. Fill **Last Day** with any date. Click **Offboard**.
5. Expect the dialog, title exactly:
   `Offboard this employee?`
   message exactly:
   `{First} {Last} is marked OFFBOARDED as of the last day you entered, their login is disabled, and they stop appearing in active-employee lists and payroll runs. Reversing this needs a Super Admin.`
   (the name is interpolated) and the confirm button **`Offboard`**.
6. **Cancel.** Click **Cancel**. Assert positively: the **Offboard Employee** card is still on the
   page (it renders only while `employmentStatus === 'ACTIVE'`), and:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT \"employmentStatus\", \"endDate\" FROM employees WHERE \"employeeNumber\"='p5-offboard'"
   ```
   must still read `ACTIVE` with the old `endDate`.
7. **Confirm.** Re-open the dialog, click **Offboard**. Expect a green success Banner at the bottom
   of the page (rendered from `form.saved` when `form.action === 'offboard'`) and the
   **Offboard Employee** card gone. Re-run the SQL: `employmentStatus` must read `OFFBOARDED`.

**Playwright MCP**

1. `browser_navigate` `http://localhost:5173/login`
2. `browser_evaluate` login-as `hr@veent.ph`
3. `browser_navigate` `http://localhost:5173/employees/<id>`
4. `browser_click` element "Offboard button" — expect no dialog (empty required date)
5. `browser_fill_form` field `Last Day` (input `#endDate`) = a date
6. `browser_click` element "Offboard button"
7. `browser_wait_for` text `Offboard this employee?`
8. `browser_snapshot` — record the message text verbatim
9. `browser_click` element "Cancel button" (inside the alertdialog)
10. `browser_find` text `Offboard Employee` — must still be present
11. Bash: the psql SELECT above — must be `ACTIVE`
12. `browser_click` "Offboard button" → `browser_wait_for` `Offboard this employee?` →
    `browser_click` the alertdialog's `Offboard` button
13. `browser_wait_for` text `Employee offboarded.` (the server action's `saved` value,
    `employees/[id]/+page.server.ts` `?/offboard`).
14. Bash: the psql SELECT — must be `OFFBOARDED`

---

### P1-2 — Payroll period void

Site 2. File `src/routes/(app)/payroll/periods/+page.svelte`. Server gate:
`requireAnyCapability(..., 'OVERRIDE_FINALIZED')` → **SUPER_ADMIN only**.
Account: **`admin@veent.ph`**. (The plan's "payroll manager w/ canVoid" has no seeded non-admin
holder — see Setup gaps.)

The **Void** trigger renders only when `data.canVoid && p.status !== 'VOIDED'`.

**Manual**

1. Log in as `admin@veent.ph`. Go to `/payroll/periods`.
2. Find the row named `p5-void`. Note its **Status** badge text.
3. Click **Void** in that row.
4. Expect title `Void this payroll period?`, message exactly:
   `The period is marked VOIDED and any loan or cash-advance amortization it collected is credited back to the employees. This cannot be undone, and the same date range cannot be used again.`
   confirm button **`Void period`**.
5. **Cancel** → the row's Status badge must still read the value from step 2, and:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT name, status FROM payroll_periods WHERE name='p5-void'"
   ```
6. **Confirm** → expect the page's green Banner reading `Period voided.` (from the server action's
   `saved`), the badge flips to **VOIDED**, and the **Void** trigger disappears. SQL must read
   `VOIDED`.

**Playwright MCP**

1. login-as `admin@veent.ph`, `browser_navigate` `/payroll/periods`
2. `browser_snapshot` — record the `p5-void` row's status badge
3. `browser_click` the `Void` button in that row
4. `browser_wait_for` text `Void this payroll period?`
5. `browser_click` "Cancel button"
6. Bash psql — status unchanged
7. `browser_click` `Void` → `browser_wait_for` `Void this payroll period?` →
   `browser_click` the alertdialog's `Void period` button
8. `browser_wait_for` text `Period voided.`
9. Bash psql — status `VOIDED`

---

### P1-3 — Payroll period release

Site 3. Same file. Trigger renders only when `p.status === 'LOCKED'`. Server gate:
`requirePayrollManage` → `MANAGE_PAYROLL`. Account: **`hr@veent.ph`** (proves the non-admin path).

**Manual**

1. Log in as `hr@veent.ph`, go to `/payroll/periods`. Find `p5-release`, badge **LOCKED**.
2. Click **Release**.
3. Expect title `Release this period to employees?`, message exactly:
   `Every payslip in this period becomes visible to the employee it belongs to. Releasing cannot be undone — the only way back is to void the period.`
   confirm button **`Release`**.
4. **Cancel** → badge still **LOCKED**, and
   `SELECT name, status, "releasedAt" FROM payroll_periods WHERE name='p5-release'` still shows
   `LOCKED` with `releasedAt` null.
5. **Confirm** → green Banner `Period released.`, badge flips, `releasedAt` is no longer null.

**Playwright MCP** — identical shape to P1-2, substituting the trigger `Release`, the title
`Release this period to employees?`, the confirm `Release`, and the success text `Period released.`

---

### P1-4 — Payroll **run** void (VERIFY ONLY — the model message)

Site 4. File `src/routes/(app)/payroll/+page.svelte`. **Unchanged by phase 5.** Its message is the
one every other site copies, and phase 4's `ConfirmButton` rebuild is what could have broken it.
Trigger renders when `data.canVoid && run.organizationId === data.viewerOrg && run.status !== 'VOIDED'`.
Account: **`admin@veent.ph`** (OVERRIDE_FINALIZED).

**Manual**

1. Log in as `admin@veent.ph`, go to `/payroll`.
2. Find a run that is not VOIDED. Click **Void** in its row.
3. Expect title `Void this payroll run?`, message exactly:
   `The run is marked VOIDED and any amortization it collected is credited back. This cannot be undone, and the same exact period cannot be created again.`
   confirm button **`Void run`**.
4. **Cancel** → run status unchanged:
   `SELECT id, status FROM payroll_runs WHERE id='<run id>'`
5. **Confirm** only if you have a disposable run. Otherwise record the stage as "dialog verified,
   confirm not exercised" and say so — do not void a run you still need for P1-5.

**Playwright MCP** — same shape; confirm button name `Void run`.

---

### P1-5 — Net-pay override

Site 5. File `src/routes/(app)/payroll/[id]/+page.svelte`. Gate: `requirePayrollManage`.
Account: **`hr@veent.ph`**. The dialog fires **only when the delta is not zero** — P5 below covers
the zero and negative cases; this stage covers the changed case.

**Manual**

1. Log in as `hr@veent.ph`. Go to `/payroll`, click **Detail** on the run you kept, landing on
   `/payroll/<runId>`.
2. In the entries table, click **Override** on one row. An inline panel opens under it with
   **Override Net Pay** (number input, `min="0"`, `step="any"`), a helper line reading
   **`No change`**, **Reason (required)**, a **Save** and a **Cancel**.
3. Type a different net pay. The helper line must change to `±₱X,XXX.XX vs ₱<baseline>`
   (formatted by `formatCurrency`). Type a reason.
4. Click **Save**.
5. Expect title `Override this net pay?`, message of the form:
   `{Employee name}'s net pay for this run changes from {₱baseline} to {₱entered} — a difference of {±₱delta}. The figure you type is what gets paid and what prints on the payslip; the computed amount is replaced, not adjusted. Your reason is written to the audit log.`
   confirm button **`Override net pay`**.
   Record both peso figures and check they match what the panel shows.
6. **Cancel** → the panel is still open with your typed values, and:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT id, \"netPay\" FROM payroll_entries WHERE id='<entryId>'"
   ```
   must still be the old value.
7. **Confirm** → the row's net pay becomes the typed value; the run header shows
   **Has overrides**; the SQL reads the typed value.

**Playwright MCP**

1. login-as `hr@veent.ph`, `browser_navigate` `/payroll/<runId>`
2. `browser_click` "Override button" in the chosen entry row
3. `browser_type` into the `Override Net Pay` input (`#netPay-<entryId>`) a changed value
4. `browser_type` into `Reason (required)` (`#note-<entryId>`) the text `p5-override`
5. `browser_snapshot` — record the helper line (must not say `No change`)
6. `browser_click` "Save button" → `browser_wait_for` `Override this net pay?`
7. `browser_snapshot` — record both peso figures in the message
8. `browser_click` "Cancel button"; Bash psql — `netPay` unchanged
9. `browser_click` "Save button" → `browser_click` the alertdialog's `Override net pay` button
10. Bash psql — `netPay` equals the typed value

---

### P1-6 — DOLE premium-pay multipliers

Site 6. File `src/routes/(app)/payroll/config/+page.svelte`. Gate: `ADMINISTER_SYSTEM`.
Account: **`admin@veent.ph`** (or `ceo@veent.ph`).
Scope fence: this is the **Premium Pay Multipliers** card (`?/updateRates`) only. The
**Save Configuration** button above it belongs to the untouched `?/update` form.

The six fields and their labels (from `rateFields`): `Overtime`,
`OT premium (rest/holiday)`, `Night differential`, `Rest day`, `Regular holiday`,
`Special holiday`.

**Manual**

1. Log in as `admin@veent.ph`, go to `/payroll/config`. **Write down all six current values.**
2. Click **Save Multipliers** with nothing changed. Expect **no dialog** — the form submits
   straight through and the page shows `Payroll configuration saved successfully.`
3. Change **Overtime** and **Rest day** only. Click **Save Multipliers**.
4. Expect title `Save premium pay multipliers?`, and a message whose first paragraph is exactly:
   `These multipliers set overtime, night differential, rest-day and holiday pay for every payroll run from now on. Runs already computed are not recalculated.`
   then a blank line, then `Changing:` on its own line, then exactly **two** rows, formatted
   `Overtime: 1.25 → 1.4` and `Rest day: … → …`. Only changed rows appear. Confirm button
   **`Save multipliers`**.
   The line breaks must render as line breaks (`whitespace-pre-line` in `ConfirmDialog`).
5. **Cancel** → the inputs still hold your edited values, and the DB still holds the old ones.
   The multipliers live on `pay_rate_rules` (model `PayRateRule`, one row per organization,
   upserted by `?/updateRates`), not on `payroll_configs`:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT overtime, \"restDay\", \"nightDiff\", \"regularHoliday\", \"specialHoliday\" FROM pay_rate_rules"
   ```
   No row at all means the org still runs on the DOLE defaults, which is also "unchanged".
6. **Confirm** → `Payroll configuration saved successfully.` banner; re-load the page and the two
   values persist. Restore the original six values afterwards (see Cleanup).

**Playwright MCP**

1. login-as `admin@veent.ph`, `browser_navigate` `/payroll/config`
2. `browser_snapshot` — record all six values
3. `browser_click` "Save Multipliers button" → `browser_wait_for` text
   `Payroll configuration saved successfully.` and assert no alertdialog appeared
4. `browser_fill_form` `Overtime` and `Rest day` with new values
5. `browser_click` "Save Multipliers button" → `browser_wait_for` `Save premium pay multipliers?`
6. `browser_snapshot` — record the `Changing:` list; assert exactly two rows
7. `browser_click` "Cancel button"
8. `browser_click` "Save Multipliers button" → `browser_click` `Save multipliers`
9. `browser_navigate` `/payroll/config` again and `browser_snapshot` to confirm persistence

---

### P1-7 — Statutory proposal **Confirm**

Site 7. File `src/routes/(app)/payroll/statutory-rates/+page.svelte`, the **Pending proposals**
card, visible only when `data.canManage && data.pending.length > 0`.
`canManage = MANAGE_STATUTORY_RATES` → **CEO or SUPER_ADMIN**. Account: **`ceo@veent.ph`**.

Create the proposal first: log in as `hr@veent.ph`, `/payroll/statutory-rates`, Pag-IBIG tab,
set the cap to `99999`, **Submit for CEO approval**, confirm. That is P1-9b; do it once and it
serves 7, 8 and 9b.

**Manual**

1. Log in as `ceo@veent.ph`, go to `/payroll/statutory-rates`.
2. In **Pending proposals**, read the `<ul>` of changes under `Proposed by …`. Click **Confirm**.
3. Expect title `Apply these statutory rates?`, message starting exactly:
   `These rates become the live tax and contribution tables for the whole organization and feed every payroll run computed from now on. Runs already computed are not recalculated.`
   then a blank line, `Applying:`, then the **same change lines** you just read from the `<ul>`.
   Confirm button **`Apply rates`**.
4. **Cancel** → the proposal card is still there, and:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT id, status FROM statutory_rate_proposals ORDER BY \"createdAt\" DESC LIMIT 3"
   ```
   The proposal table is `statutory_rate_proposals` (model `StatutoryRateProposal`). Status must
   still be `PENDING`.
5. **Confirm** → success Banner; the card leaves the page; the proposal row reads `APPLIED`; and
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT \"pagibigCap\" FROM statutory_rate_configs"
   ```
   now reads `99999`.

**Playwright MCP** — same shape. Trigger button name `Confirm`; title
`Apply these statutory rates?`; confirm button `Apply rates`.

---

### P1-8 — Statutory proposal **Reject**

Site 8. Same card. Account: **`ceo@veent.ph`**. Needs a second PENDING proposal (repeat the
`hr@veent.ph` submit, using a different recognisable number, e.g. Pag-IBIG cap `88888`).

**Manual**

1. As `ceo@veent.ph`, `/payroll/statutory-rates`, **Pending proposals** → click **Reject**.
2. Expect title `Reject this rate proposal?`, message exactly:
   `The proposal is discarded and the live rates stay as they are. Whoever prepared it has to enter the changes again — there is no draft to return to.`
   confirm button **`Reject proposal`**.
3. **Cancel** → the card is still there; the proposal row is still `PENDING`.
4. **Confirm** → the card leaves; the row reads `REJECTED`; `statutory_rate_configs."pagibigCap"`
   is **unchanged** (still whatever P1-7 left, not `88888`).

**Playwright MCP** — same shape; trigger `Reject`, confirm `Reject proposal`.

---

### P1-9 — Statutory save (two paths, one dialog)

Site 9. Same file, the bottom of the big form. One `ConfirmDialog` with `$derived` labels.

- **9a, manage path** — `data.canManage` true. Button label **`Save changes`**.
  Account: **`admin@veent.ph`** or **`ceo@veent.ph`**.
- **9b, propose path** — `canManage` false, `canPropose` true (`PROPOSE_STATUTORY_RATES` =
  HR_ADMIN). Button label **`Submit for CEO approval`**. Account: **`hr@veent.ph`**.

The whole point of this site is the **unseen tabs** line: all four services submit together.

**Manual — 9a**

1. Log in as `admin@veent.ph`, `/payroll/statutory-rates`.
2. On the **SSS** tab, change one bracket figure. Switch to the **Pag-IBIG** tab and change the cap.
3. Click **Save changes**.
4. Expect title `Apply statutory rates?`, message exactly:
   `These become the live tax and contribution tables for the whole organization and feed every payroll run computed from now on. Runs already computed are not recalculated.`
   then a blank line, then
   `You are changing: SSS, Pag-IBIG. Edits on tabs you are not looking at are included.`
   (the list is `touchedServices`, joined with `, `, drawn from
   `SSS`, `PhilHealth`, `Pag-IBIG`, `BIR Withholding Tax`).
   Confirm button **`Apply rates`**.
   **Assert positively that SSS is named while you are standing on the Pag-IBIG tab** — that is the
   single highest-value message in the phase.
5. **Cancel** → your edits are still in the inputs; `statutory_rate_configs` unchanged.
6. **Confirm** → success Banner; the values persist on reload.

**Manual — 9b**

1. Log in as `hr@veent.ph`, `/payroll/statutory-rates`.
2. Change the **Pag-IBIG** cap to `99999`. Switch to another tab.
3. Click **Submit for CEO approval**.
4. Expect title `Submit these rates for CEO approval?`, message exactly:
   `A proposal goes to the CEO for approval. Nothing changes for payroll until it is approved.`
   then blank line, then `You are submitting: Pag-IBIG. Edits on tabs you are not looking at are included.`
   Confirm button **`Submit for approval`**.
5. **Cancel** → no new proposal row.
6. **Confirm** → a PENDING proposal row exists, and `statutory_rate_configs."pagibigCap"` is
   **unchanged** (the propose path must not write the live config).

**Playwright MCP** (9a; 9b is the same with the other labels)

1. login-as `admin@veent.ph`, `browser_navigate` `/payroll/statutory-rates`
2. `browser_click` the `SSS` tab, `browser_fill_form` one SSS figure
3. `browser_click` the `Pag-IBIG` tab, `browser_fill_form` the cap
4. `browser_click` "Save changes button" → `browser_wait_for` `Apply statutory rates?`
5. `browser_find` text `You are changing: SSS, Pag-IBIG` — the positive assertion
6. `browser_click` "Cancel button" → Bash psql on `statutory_rate_configs` — unchanged
7. `browser_click` "Save changes button" → `browser_click` `Apply rates`
8. Bash psql — both figures written

---

### P1-10 / P4 — Statutory unsaved-changes guard

Site 10 (and gate P4 is the same walk with its second half). Same file.
Account: **`hr@veent.ph`** or **`admin@veent.ph`** — anyone who can open the page.

**Manual**

1. Open `/payroll/statutory-rates`. Change one **SSS** figure. Switch to the **Pag-IBIG** tab
   (this is an in-page tab switch, not navigation — no dialog should fire here).
2. Click any **in-app** nav link (e.g. Dashboard in the sidebar).
3. Expect the navigation to be **cancelled** and a dialog: title `Leave without saving?`,
   message exactly `You have unsaved rate changes on: SSS. Leaving now discards them.`,
   confirm button **`Leave without saving`**, cancel button **`Stay on this page`**
   (this is the only site that overrides `cancelText`).
   **Assert SSS is named** even though you are standing on Pag-IBIG.
4. **Cancel** (`Stay on this page`) → you are still on `/payroll/statutory-rates` and the SSS edit
   is still in the input.
5. **P4 second half:** now click **Save changes** (or **Submit for CEO approval**) and confirm.
   After the save lands, click a nav link again. The guard must **not** fire — the baseline is
   re-seeded on `result.type === 'success'`.
6. **Confirm path:** make a fresh edit, click a nav link, click **Leave without saving** →
   you land on the target page and the edit is gone (re-open the rates page; the input holds the
   saved value, not your discarded one).
7. Optional, the `beforeunload` half: with an unsaved edit, reload the tab. The **browser's own**
   dialog appears. This is native on purpose and is not counted as a native `confirm()`.

**Playwright MCP**

1. login-as, `browser_navigate` `/payroll/statutory-rates`
2. `browser_fill_form` one SSS field; `browser_click` the `Pag-IBIG` tab
3. `browser_click` the sidebar `Dashboard` link
4. `browser_wait_for` text `Leave without saving?`
5. `browser_find` text `You have unsaved rate changes on: SSS`
6. `browser_click` "Stay on this page button"; `browser_snapshot` — URL still the rates page
7. Save and confirm, then `browser_click` the `Dashboard` link again and
   `browser_wait_for` the dashboard heading — assert **no** alertdialog appeared
8. For the `beforeunload` half use `browser_handle_dialog` (accept), since Playwright suppresses
   native dialogs otherwise

---

### P1-11 — Release review to employee

Site 11. File `src/routes/(app)/performance/reviews/[id]/+page.svelte`. Gate on the action:
`ADMINISTER_HR_ORGWIDE`. Account: **`hr@veent.ph`**. The trigger renders only when
`r.releasedAt` is null and `data.canRelease`.

**Manual**

1. Log in as `hr@veent.ph`. Go to `/performance/reviews/<id>` for a review with `releasedAt` null.
2. On the **Evaluation** heading row, click **Release to employee**.
3. Expect title `Release this review to the employee?`, message exactly:
   `{First} {Last} will be able to read every rating, comment and recommendation on this evaluation. There is no un-release — once they can see it, they have seen it.`
   confirm button **`Release to employee`**.
4. **Cancel** → the **Release to employee** button is still there, and:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT id, \"releasedAt\", \"releasedByEmployeeId\" FROM performance_reviews WHERE id='<id>'"
   ```
   `releasedAt` still null.
5. **Confirm** → a toast reading `Evaluation released to the employee.` (this site passes
   `successMessage`), and the button is replaced by `Released by {name} on {date}`.
   `releasedAt` is no longer null.

**Playwright MCP**

1. login-as `hr@veent.ph`, `browser_navigate` `/performance/reviews/<id>`
2. `browser_click` "Release to employee button" → `browser_wait_for` `Release this review to the employee?`
3. `browser_click` "Cancel button"; Bash psql — `releasedAt` null
4. `browser_click` "Release to employee button" → `browser_click` the alertdialog's
   `Release to employee` button
5. `browser_wait_for` text `Evaluation released to the employee.`
6. Bash psql — `releasedAt` not null

---

### P1-12 — Deactivate a login

Site 12. File `src/routes/(app)/settings/roles/+page.svelte`. Gate: `ADMINISTER_SYSTEM` →
**SUPER_ADMIN or CEO**. Account: **`admin@veent.ph`**. Asymmetric by design: only the
**deactivate** direction confirms.

**Manual**

1. Log in as `admin@veent.ph`, go to `/settings/roles`.
2. Find the row for `employee@veent.ph`. Its badge reads **ACTIVE**. Click **Deactivate**.
3. Expect title `Deactivate this login?`, message exactly:
   `employee@veent.ph is signed out and cannot sign in again until someone re-activates them. Their employee record, payroll history and documents are untouched.`
   confirm button **`Deactivate`**.
4. **Cancel** → the badge still reads **ACTIVE**, and:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT email, \"isActive\" FROM users WHERE email='employee@veent.ph'"
   ```
   must be `t`.
5. **Confirm** → the badge flips to **INACTIVE**, the trigger becomes **Activate**, and the SQL
   reads `f`.

**Playwright MCP**

1. login-as `admin@veent.ph`, `browser_navigate` `/settings/roles`
2. `browser_find` text `employee@veent.ph`; `browser_snapshot` for the row refs
3. `browser_click` "Deactivate button" in that row → `browser_wait_for` `Deactivate this login?`
4. `browser_click` "Cancel button"; Bash psql — `isActive` = `t`
5. `browser_click` "Deactivate button" → `browser_click` the alertdialog's `Deactivate` button
6. `browser_wait_for` text `Activate` in that row; Bash psql — `isActive` = `f`

---

### P1-12b — Activate a login (assert NO dialog)

Same site, the `{:else}` branch: a plain form with a `type="submit"` button and its own
`setActiveGuard`. **There must be no dialog.** Account: **`admin@veent.ph`**.

**Manual**

1. Still on `/settings/roles`, with `employee@veent.ph` now INACTIVE, click **Activate**.
2. Expect **no dialog at all**. The badge flips straight to **ACTIVE**.
3. Assert positively: `SELECT "isActive" FROM users WHERE email='employee@veent.ph'` reads `t`,
   and no `role="alertdialog"` element appeared at any point.

**Playwright MCP**

1. `browser_click` "Activate button"
2. `browser_evaluate` → `() => document.querySelectorAll('[role="alertdialog"]').length`
   — must return `0`
3. `browser_wait_for` text `Deactivate` in that row (the trigger flipped back)
4. Bash psql — `isActive` = `t`

There is no cancel column for this stage. Record it as `n/a`.

---

### P1-13 — Separation finalize

Site 13. File `src/routes/(app)/separations/[id]/+page.svelte`. Gate on the action: `MANAGE_HR`,
**plus** #297 — whoever cleared a clearance item may not finalize. So the clearer and the
finalizer must be different accounts.
Account: **`admin@veent.ph`** finalizes a case that **`hr@veent.ph`** cleared.

The trigger is `disabled` when `pendingCount > 0 || finalizeBar` — if the button is greyed out,
read the amber refusal text in `<p id="finalize-bar">` above it and fix the fixture, do not force it.

**Manual**

1. Log in as `admin@veent.ph`. Go to `/separations/<id>` for a `CLEARED` case.
2. In the **Finalize separation** card, click **Finalize & offboard**.
3. Expect title `Finalize this separation?`, message exactly:
   `This snapshots final pay, offboards the employee, and disables their login. Only a Super Admin can undo it.`
   confirm button **`Finalize`**.
4. **Cancel** → the **Finalize separation** card is still on the page (it renders only while
   `!isFinalized`), and:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT id, status, \"finalizedAt\" FROM separation_records WHERE id='<id>'"
   ```
   status is not `FINALIZED`.
5. **Confirm** → a success Banner reading
   `Separation finalized. The employee is now offboarded and their login is disabled.`
   The card is replaced by the finalized summary. SQL reads `FINALIZED` with `finalizedAt` set.

**Playwright MCP** (this is the flow `tests/e2e/separations.spec.ts` already drives)

1. login-as `admin@veent.ph`, `browser_navigate` `/separations/<id>`
2. `browser_click` "Finalize & offboard button" → `browser_wait_for` `Finalize this separation?`
3. `browser_click` "Cancel button"; Bash psql — status not `FINALIZED`
4. `browser_click` "Finalize & offboard button" → `browser_click` the alertdialog's `Finalize` button
5. `browser_wait_for` text `Separation finalized.`
6. Bash psql — `FINALIZED`

---

### P1-14 — Separation undo (with the re-open checkbox)

Site 14. Same file, the finalized branch. Gate: `MANAGE_HR` on the action, but the service
requires `OVERRIDE_FINALIZED` → **`admin@veent.ph`**. Shape B: the `reopenClearance` checkbox lives
in the page's own form, so the dialog sits beside it and the message is `$derived` off the live
checkbox value.

**Manual**

1. As `admin@veent.ph`, on the finalized `/separations/<id>`, leave the **re-open clearance**
   checkbox **unticked**. Click **Undo finalization**.
2. Expect title **`Undo this finalization?`** (`separations/[id]/+page.svelte` line 267).
   Message must be exactly the base string:
   `This restores the loan and cash-advance balances, puts the employee back to their previous employment status, and RE-ENABLES their login.`
   and **must not** contain the re-open clause. Confirm button **`Undo finalization`**.
3. **Cancel.** Now **tick** the re-open checkbox and click **Undo finalization** again.
4. The message must now be the base string, a blank line, then:
   `Clearance will also be RE-OPENED: the case returns to OPEN and every item goes back to pending.`
   This is the positive assertion for the conditional clause.
5. **Cancel** → `SELECT status, "finalizedAt" FROM separation_records WHERE id='<id>'` still reads
   `FINALIZED`.
6. **Confirm** (leave the checkbox as you want the end state) → a success Banner reading
   `Finalization undone. The case is back to {status} and the employee's login is enabled again.`
   Check the employee row and the loan rows:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT \"employmentStatus\" FROM employees WHERE id='<employeeId>'"
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT id, balance, status FROM loans WHERE \"employeeId\"='<employeeId>'"
   ```
   The loans table is `loans` (model `Loan`).
   Employment status back to `ACTIVE`, balances back to their principals, and
   `users."isActive"` back to `t`.

**Playwright MCP**

1. login-as `admin@veent.ph`, `browser_navigate` `/separations/<id>`
2. `browser_click` "Undo finalization button" → `browser_snapshot` — assert the message has **no**
   `RE-OPENED` sentence
3. `browser_click` "Cancel button"
4. `browser_click` the `reopenClearance` checkbox
5. `browser_click` "Undo finalization button" → `browser_find` text
   `the case returns to OPEN and every item goes back to pending`
6. `browser_click` "Cancel button"; Bash psql — still `FINALIZED`
7. `browser_click` "Undo finalization button" → `browser_click` the alertdialog's
   `Undo finalization` button
8. `browser_wait_for` text `Finalization undone.`; Bash psql — the three restores above

---

### P1-15 — Attendance reset

Site 15. File `src/routes/(app)/attendance/+page.svelte`. Gate: `MANAGE_HR`.
Account: **`hr@veent.ph`**. **Two render sites** (employee view and team view) — walk both.
The **Reset** trigger renders only when `d.manuallyEdited` is true, so you must correct a day first.

**Manual**

1. Log in as `hr@veent.ph`, go to `/attendance` (employee view; add `?view=team` for the team view,
   and `?from=YYYY-MM-DD&to=YYYY-MM-DD` to reach the right dates).
2. Pick an unlocked day row. Set its **In** and **Out** to distinctive times, e.g. `09:00` and
   `17:00`, and click that row's **Save**. Reg and OT are read-only and derived (F10 / D4) — typing
   into them is not possible and would not have been stored. The row now shows a **Reset** button
   beside Save (tooltip: `Discard manual edit and re-derive from punches`).
3. Click **Reset**.
4. Expect title `Discard this manual edit?`, message exactly:
   `The hours you corrected for this day are thrown away and re-derived from the raw punches. Anything typed by hand is lost.`
   confirm button **`Discard and re-derive`**.
5. **Cancel** → the Reg cell still shows `7.25`, the **Reset** button is still there, and:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT id, date, \"regularHours\", \"manuallyEdited\" FROM attendance_days WHERE id='<dayId>'"
   ```
   reads `7.25` / `t`.
6. **Confirm** → a toast reading `Day reset to the derived values.`; the **Reset** button
   disappears; SQL shows `manuallyEdited` = `f` and `regularHours` back to the derived value.
7. Repeat steps 2-6 in the other view (`?view=team`).

**Playwright MCP**

1. login-as `hr@veent.ph`, `browser_navigate` `/attendance`
2. `browser_fill_form` the row's `regularHours` input = `7.25`; `browser_click` "Save button"
3. `browser_click` "Reset button" → `browser_wait_for` `Discard this manual edit?`
4. `browser_click` "Cancel button"; Bash psql — `7.25` / `manuallyEdited` = `t`
5. `browser_click` "Reset button" → `browser_click` the alertdialog's `Discard and re-derive` button
6. `browser_wait_for` text `Day reset to the derived values.`
7. Bash psql — `manuallyEdited` = `f`
8. `browser_navigate` `/attendance?view=team` and repeat 2-7

---

### P1-16 — Bulk reject notes flow (VERIFY ONLY — keep as is)

Site 16. File `src/routes/(app)/requests/approvals/+page.svelte`, the `ReasonDialog` at `:402`,
the bulk `?/rejectMany` form at `:216`. **Unchanged by phase 5** (`git diff b3334f0..1bf99af` on
that file and on `ReasonDialog.svelte` returns zero lines). It must still ask for a **reason**, not
a yes/no — a reason prompt is a stronger gate than a confirm.
Account: **`approver@veent.ph`**.

**Manual**

1. Log in as `approver@veent.ph`, go to `/requests/approvals`.
2. Tick two request checkboxes. A bar appears reading `2 selected`.
3. Click **Reject selected…**.
4. Expect a dialog (`role="dialog"`, **not** `alertdialog`) titled
   `Reject 2 selected requests`, with the sub-line
   `The note below is applied to every selected request.`, a textarea, a **Cancel** and a confirm
   button. The confirm button must be **disabled while the textarea is empty**.
5. Type a note. The confirm button enables. **Cancel** → nothing submitted; the requests are still
   pending in the list.
6. **Confirm** with a note → the requests are rejected and the selection clears.
7. Record: "ReasonDialog still opens, still requires a note, still submits." No `ConfirmDialog`
   should appear anywhere in this flow.

**Playwright MCP**

1. login-as `approver@veent.ph`, `browser_navigate` `/requests/approvals`
2. `browser_click` two row checkboxes; `browser_find` text `2 selected`
3. `browser_click` "Reject selected… button"
4. `browser_snapshot` — record the title, and that the confirm button is `disabled`
5. `browser_evaluate` → `() => document.querySelectorAll('[role="alertdialog"]').length` must be `0`
6. `browser_type` into the textarea, `browser_snapshot` — confirm button now enabled
7. `browser_click` "Cancel button"

---

### P2 — Cancel writes nothing (negative control, 3 sites)

This is the gate that says a cancel is a real cancel and not a delayed submit. Run it on
**period void** (P1-2), **offboard** (P1-1) and **deactivate login** (P1-12).

For each of the three: take the psql reading **before** opening the dialog, open it, cancel it,
wait 5 seconds, take the reading **again**, and assert the two are **identical**.

```
# before
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
  "SELECT name, status FROM payroll_periods WHERE name='p5-void'"
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
  "SELECT \"employmentStatus\" FROM employees WHERE \"employeeNumber\"='p5-offboard'"
docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
  "SELECT email, \"isActive\" FROM users WHERE email='employee@veent.ph'"
# ... cancel each dialog ...
# after: the same three commands, compared line for line
```

**Positive control (do not skip):** this check only means something if the same SELECT **does**
change when you confirm. You already have that reading from the confirm column of P1-1/2/12 —
record it alongside, so the P2 row shows an unchanged pair and a changed pair.

**Playwright MCP** — the browser half is the cancel step of each of those three stages; the psql
half is a Bash call before and after.

---

### P3 — Keyboard-only walk of the nested dialogs

Re-labelled per the report's C5. Neither phase-5 nested case is a dialog-in-dialog:

- **Statutory save dialog inside a `role="tabpanel"`** (`statutory-rates/+page.svelte:351`).
- **Net-pay override dialog opened from inside a scrolling table row**
  (the dialog itself is rendered outside the table, at the bottom of `payroll/[id]`).

Parent-modal Escape scoping does **not** apply to those two. Focus trap and focus restore do.

**The one true dialog-in-dialog in the repo is
`src/lib/components/timesheets/TimesheetModal.svelte:531`** — a `ConfirmButton` (`?/delete`,
title `Delete timesheet?`) inside the `fixed inset-0` overlay. It is not a phase-5 site, but it is
the real nested-modal regression surface for phase 03's Dialog base. Walk it.

**Manual** — for each of the three, no mouse after the trigger click:

1. Open the dialog.
2. Press **Tab** repeatedly. Focus must cycle **Cancel → confirm → Cancel …** and never reach a
   control behind the dialog. Press **Shift+Tab** from the first control — it must wrap to the last.
3. Press **Escape**. The dialog closes.
   - Statutory / override: the page behind is unchanged and still on the same tab / same open row.
   - TimesheetModal: **only the confirm dialog closes. The timesheet modal behind it stays open.**
     That is the whole point of `e.stopPropagation()` in `Dialog.svelte`.
4. Assert focus is back on the **trigger button** you clicked (the `$effect` cleanup restores
   `document.activeElement`). Press **Enter** — the same dialog re-opens.

**Playwright MCP**

1. Open the dialog as in the parent stage.
2. `browser_press_key` `Tab` several times, `browser_evaluate` after each →
   `() => document.activeElement.textContent` — record the cycle.
3. `browser_press_key` `Escape`
4. `browser_evaluate` → `() => document.activeElement.textContent` — must be the trigger label
5. For TimesheetModal: after Escape, `browser_evaluate` →
   `() => document.querySelectorAll('[role="dialog"],[role="alertdialog"]').length` — must be `1`,
   not `0`.

---

### P4 — Statutory dirty guard clears on save

Covered in full inside **P1-10** (steps 5 and 6). Record it as its own row: "guard fires and names
SSS" / "guard does not fire after a successful save".

---

### P5 — Net-pay override, the three input cases

Same page as P1-5, `hr@veent.ph`.

**Manual**

1. Open an override panel. Type `-100` into **Override Net Pay** and a reason, click **Save**.
   Expect the **browser's own** validation bubble on the number input (`min="0"`) and
   **no dialog, no POST**. This is the audit's named validation gap.
2. Set the value back to exactly the row's current net pay. The helper line must read **`No change`**.
   Type a reason and click **Save**. Expect **no dialog** — the form submits straight through
   (`if (overrideDelta === 0) overrideFormEl?.requestSubmit()`). The page reloads with the same net
   pay.
3. Type a changed value. The helper line reads `±₱delta vs ₱baseline`. Click **Save** → the dialog
   appears, and the message names **both** peso figures and the signed delta, all three matching the
   helper line.

**Playwright MCP**

1. `browser_type` `-100`; `browser_click` "Save button";
   `browser_evaluate` → `() => document.querySelectorAll('[role="alertdialog"]').length` = `0`;
   `browser_evaluate` → `() => document.querySelector('input[name="netPay"]').validationMessage`
   — must be non-empty
2. `browser_type` the original value; `browser_find` text `No change`; `browser_click` "Save button";
   assert `alertdialog` count is `0`
3. `browser_type` a changed value; `browser_click` "Save button";
   `browser_wait_for` `Override this net pay?`; `browser_snapshot` and compare the three figures

---

### P6 — Attendance reset keeps the other cells (the silent-regression risk)

`keepValues` (`update({ reset: false })`) rides through `ConfirmButton`'s `submit` prop. If it were
dropped, untouched Reg/OT cells would blank on reset — data-looking damage with no error.

**Manual**

1. As `hr@veent.ph` on `/attendance`, pick **three** day rows in the same table.
2. In day A, type `7.25` into **Reg**. In day B, type `1.50` into **OT**. Do **not** click Save on
   A or B — leave the typed values sitting in the inputs.
3. In day C (which already has a **Reset** button, i.e. `manuallyEdited`), click **Reset** and
   **confirm** (`Discard and re-derive`).
4. **The assertion:** after the page updates, day A's Reg input must still show `7.25` and day B's
   OT input must still show `1.50`. Both are **positive** assertions — read the input values.
5. If either blanked, P6 fails and site 15 lost `keepValues`.

**Playwright MCP**

1. `browser_fill_form` day A `regularHours` = `7.25`, day B `overtimeHours` = `1.50`
2. `browser_click` day C's "Reset button" → `browser_click` `Discard and re-derive`
3. `browser_wait_for` text `Day reset to the derived values.`
4. `browser_evaluate` →
   `() => [...document.querySelectorAll('input[name="regularHours"],input[name="overtimeHours"]')].map(i=>i.value)`
   — assert `7.25` and `1.50` are still in the list

---

### R1 — Masked reveal still works on `employees/[id]`

Phase 5 edited this file, so the #111 masking/reveal must be re-walked.
Account: **`hr@veent.ph`** (needs `data.canReveal`).

**Manual**

1. Open `/employees/<id>` for an employee with a salary and government IDs.
2. The salary and the gov IDs are masked. Two triggers exist: **Reveal** (next to the salary) and
   **Reveal IDs** (in the **Government IDs** card header). Both carry the tooltip
   `Revealing sensitive fields is recorded in the audit log`.
3. Click **Reveal**. The figure appears. Click **Reveal IDs**. The numbers appear.
4. Assert an audit row was written:
   ```
   docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c \
     "SELECT action, \"entityId\", \"createdAt\" FROM audit_logs ORDER BY \"createdAt\" DESC LIMIT 5"
   ```
   The reveal audit row has `action = 'VIEW'` (`revealEmployeeSensitive` in
   `src/lib/server/services/employees.ts`, written outside any transaction on purpose).
5. Reload the page. The values must be **masked again** (the reveal is per-request, not sticky).

**Playwright MCP**

1. login-as `hr@veent.ph`, `browser_navigate` `/employees/<id>`
2. `browser_snapshot` — record the masked figures
3. `browser_click` "Reveal button"; `browser_click` "Reveal IDs button"; `browser_snapshot`
4. Bash psql on `audit_logs`
5. `browser_navigate` the same URL again; `browser_snapshot` — masked again

---

### R2 — The already-correct `ConfirmButton` sites still open and submit

Widened per C4 to all **17** on-disk `.svelte` call sites (from the report):
`lib/components/timesheets/TimesheetModal`, `attendance`, `branches`, `employees/[id]`,
`inventory`, `leave`, `payroll`, `payroll/periods`, `payroll/statutory-rates`,
`performance/reviews/[id]`, `performance/templates`, `separations/[id]`, `settings/holidays`,
`settings/offboarding`, `settings/onboarding`, `settings/roles`, `timesheets`.

Eleven of those are covered by P1 stages above. The six **not** yet touched by any P1 row are the
low-stakes regression set: **branches, inventory, leave, settings/holidays, settings/onboarding,
settings/offboarding** (plus `performance/templates`, `timesheets` and `TimesheetModal`).

**Manual** — for each page, one pass, as `admin@veent.ph`:

1. Open the page (`/branches`, `/inventory`, `/leave`, `/settings/holidays`,
   `/settings/onboarding`, `/settings/offboarding`, `/performance/templates`, `/timesheets`).
2. Click the destructive trigger on any row (usually **Delete**).
3. Assert a dialog opens with a title and a message. **Cancel** → the row is still there.
4. Do **not** confirm unless the row is disposable. Record "opens + cancels" for each.
5. `/branches` is gated to food-service tenants — log in as `manager@jojo.ph` / `Manager@1234`
   with tenant **JoJo Potato** for that one.

**Playwright MCP** — per page: `browser_navigate`, `browser_click` the delete trigger,
`browser_wait_for` the dialog title, `browser_click` "Cancel button", `browser_find` the row text
(still present).

---

### R3 — Nav resolves for three roles

The umbrella's standing regression from phase 02.

**Manual** — for `hr@veent.ph`, `manager@veent.ph` and `employee@veent.ph` in turn:

1. Log in, land on `/dashboard`, assert the **Dashboard** heading renders.
2. Click every visible sidebar link. Every one must render a page, not a 403 and not a blank.
3. Record which links each role sees. A role must not see a link it cannot open.

**Playwright MCP** — per role: login-as, `browser_navigate` `/dashboard`, `browser_snapshot` to
list the nav links, then `browser_navigate` each link and `browser_network_request` /
`browser_snapshot` to record the status and the heading.

---

### A1 — impeccable audit pass on the 9 changed files

Not a browser stage. Load the `impeccable` skill and run it over the phase-5 diff:

```
git diff b3334f0 1bf99af -- 'src/**/*.svelte'
```

Nine files: `lib/components/ui/ConfirmDialog.svelte`, `attendance`, `employees/[id]`,
`payroll/[id]`, `payroll/config`, `payroll/periods`, `payroll/statutory-rates`,
`performance/reviews/[id]`, `separations/[id]`, `settings/roles`.

Record the audit score and any finding. Findings are hypotheses — verify each against source
before acting on it.

---

### G5 — e2e vs the pre-phase baseline

```
CI=1 pnpm test:e2e
```

- `pnpm test:e2e` is `dotenv -e .env.dev -- playwright test`, and `playwright.config.ts` runs its
  **own** server: `pnpm build && pnpm preview --port 4173 --strictPort`. It does **not** use your
  `pnpm dev` server, and it does not touch port 3000.
- **The filter is ignored.** `pnpm test:e2e -- tests/e2e/separations.spec.ts` runs the whole suite
  anyway. Do not read a "scoped" run as scoped.
- Expect the **pre-existing attendance e2e failure**. It predates phase 5 and is not a phase-5
  defect. Anything else red: **read the error text**, do not re-run blindly.
- `tests/e2e/separations.spec.ts` is the spec that covers sites 13/14; it already drives the kit
  dialog through `page.getByRole('alertdialog').getByRole('button', { name })`. If it is red, that
  is a phase-5 signal.

Record: total passed/failed, and the name of every failure, compared against the baseline.

---

## 4. Cleanup

**Only the marker rows.** Never "everything this account owns" — a prior subagent hard-deleted the
owner's seed data by cancelling everything its test account owned. Every command below names an
exact marker.

| Stage | What to undo | How |
|---|---|---|
| P1-1 offboard | the `p5-offboard` employee is OFFBOARDED | `UPDATE employees SET "employmentStatus"='ACTIVE', "endDate"=NULL WHERE "employeeNumber"='p5-offboard'; UPDATE users SET "isActive"=true WHERE id=(SELECT "userId" FROM employees WHERE "employeeNumber"='p5-offboard');` |
| P1-2/3 periods | `p5-void` VOIDED, `p5-release` RELEASED | leave them; they are test fixtures. If you must, `DELETE FROM payroll_periods WHERE name IN ('p5-void','p5-release')` **after** deleting their runs and entries. |
| P1-4 run void | a run is VOIDED | not reversible by design — only void a disposable run |
| P1-5 override | one `payroll_entries."netPay"` changed | `UPDATE payroll_entries SET "netPay"=<the baseline you recorded> WHERE id='<entryId>';` and clear `payroll_runs."hasOverride"` if nothing else overrode |
| P1-6 multipliers | six values may have moved | re-enter the six values you wrote down in step 1 through `/payroll/config` and **Save Multipliers** — through the UI, not SQL |
| P1-7/8/9 statutory | live rates and proposals changed | re-enter the originals through the page and Apply; delete only the proposals you created, by id |
| P1-11 review | `releasedAt` set | `UPDATE performance_reviews SET "releasedAt"=NULL, "releasedByEmployeeId"=NULL WHERE id='<id>';` |
| P1-12/12b login | `employee@veent.ph` active state | end the pass on **Activate** so it is `t`; verify with the SELECT |
| P1-13/14 separation | case finalized/undone | end on **undone**; verify employment status, loan balances and `users."isActive"` |
| P1-15 / P6 attendance | corrected days | for each day you touched: `UPDATE attendance_days SET "manuallyEdited"=false WHERE id='<dayId>';` then use the page's **Refresh** control to re-derive |
| P1-16 approvals | requests rejected | not reversible — cancel out of the ReasonDialog instead of confirming, unless you have a disposable request |
| R2 | nothing confirmed | cancel-only by design |

Before and after cleanup, take the same SELECT. A cleanup you did not verify is not a cleanup.

---

## 5. Setup gaps and known caveats

**Setup gaps — read before you start.**

1. **`payroll@veent.ph` and `finance@veent.ph` do not exist in the seed.** They are listed in
   `DevLoginSwitcher.svelte` but `grep` over `prisma/` finds neither. Clicking them in the dev
   switcher will fail. There is **no seeded PAYROLL_OFFICER account.**
2. **"payroll manager with `canVoid`" has no seeded holder other than SUPER_ADMIN.**
   `canVoid` is `OVERRIDE_FINALIZED`, and `src/lib/rbac.ts` gives that to `['SUPER_ADMIN']` alone.
   P1-2, P1-4 and P1-14 must run as `admin@veent.ph`. The plan's matrix wording is wrong here.
3. **P1-9's "HR_ADMIN (`canManage`)" is wrong.** `canManage` on the statutory page is
   `MANAGE_STATUTORY_RATES: ['CEO', 'SUPER_ADMIN']`. HR_ADMIN holds only
   `PROPOSE_STATUTORY_RATES`, so `hr@veent.ph` gets the **Submit for CEO approval** path (9b) and
   never the **Save changes** path (9a). Use `admin@veent.ph` or `ceo@veent.ph` for 9a.
4. **P1-13's finalizer must not be the clearer (#297).** If **Finalize & offboard** is greyed out,
   read the amber `<p id="finalize-bar">` text above it — that is the server-computed refusal
   reason, not a bug. Have `hr@veent.ph` clear the items and `admin@veent.ph` finalize.
5. **A separations fixture is fiddly to build by hand.** `tests/e2e/separations.spec.ts` builds one
   (marker `employeeNumber = 'e2e-undo-304'`, its own user, two loans, a CLEARED case cleared by
   HR) and deletes it again in `afterAll`. If you want P1-13/14 without hand-building, run that
   spec and note that its fixture is gone afterwards — it is not a reusable seed.
6. Resolved from source on 11-09-26: P1-14 title `Undo this finalization?`; DOLE multipliers on
   `pay_rate_rules`; proposal table `statutory_rate_proposals`; loans table `loans`; offboard
   success string `Employee offboarded.`; reveal audit `action = 'VIEW'`; dev port 5173.

**Caveats.**

- **The dev-login pill is invisible to Playwright** by design
  (`if (dev && !navigator.webdriver)`). In MCP mode you must use the `fetch` call. Do not report
  its absence as a bug.
- **Hydration.** A click before Svelte hydrates is silently dropped. If a dialog does not appear,
  snapshot and click again. The e2e helpers wrap this in `expect(...).toPass()` for the same reason.
- **The pre-existing attendance e2e failure** predates phase 5. Not a phase-5 defect.
- **`CI=1 pnpm test:e2e` ignores spec filters** — it always runs the full suite, and it builds and
  serves the app itself on port 4173.
- **`pnpm check` kills the dev server.** Do not run the CI gate set mid-pass.
- **A green `pnpm test` proves nothing about any dialog opening.** `tests/unit/destructive-confirms.test.ts`
  is a source scan: G1 proves co-occurrence (import + action string in the same file), not
  containment. A file that imports `ConfirmButton` and leaves one form bare still passes.
- **The `beforeunload` prompt on the statutory page is native on purpose.** A browser gives no
  alternative. It is explicitly excluded from the zero-native-`confirm()` gate.
- **Two behaviours that look like bugs and are not:** activating a login shows no dialog (site 12
  is deliberately asymmetric), and saving the net-pay override or the DOLE multipliers with nothing
  changed shows no dialog (nothing to warn about).

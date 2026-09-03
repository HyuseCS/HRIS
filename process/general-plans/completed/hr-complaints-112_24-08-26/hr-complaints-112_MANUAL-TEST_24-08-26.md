---
name: manual-test:hr-complaints-112
description: "Gate E live verification script for #112 — 19 steps proving the inquiry scoping guards hold in a real request, not just against a mocked Prisma"
date: 24-08-26
feature: hr-complaints-112
branch: feat/hr-complaints-112
---

# Gate E — Live Verification Script (#112)

**Why this exists.** The 18 unit tests mock the database, so they cannot prove a query-level or
tenant-scoping hole. This repo has already shipped a live-broken guard under a green suite (#283).
The plan tags this criterion **Hybrid** for that reason: the unit tests are one half of the gate,
this script is the other. It may not be downgraded to "the unit tests cover it".

**Every step asserts something positive.** "The row is absent" proves nothing on its own — a broken
page shows nothing too. Wherever a step checks an absence, it also checks that the page rendered.

---

## Preconditions — already done, recorded here for a re-run

| Step | Command | Result on 24-08-26 |
|---|---|---|
| Database up | `./start.sh` | `veent-db-5434 Up` |
| Schema applied | `pnpm db:push` | `The database is already in sync` |
| Client generated | (ran by `db:push`) | Prisma Client v5.22.0 |
| Tables exist | `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c "\dt hr_complaint*"` | `hr_complaints`, `hr_complaint_messages`, 0 rows |
| Dev server | `pnpm dev` | http://localhost:5173 responding 200 |

**No seed was run.** The plan called for `pnpm db:seed:e2e`, but the three accounts it needs are
already present in this database, so seeding was skipped and no existing data was touched.
On a machine where they are missing, run `pnpm db:seed:e2e` — **never** `pnpm db:seed`, which calls
`seedProd` only and creates none of them.

## Cast — verified against the live database, not assumed

```text
EMP-001  System Admin      admin@veent.ph        SUPER_ADMIN
EMP-002  Hannah HR         hr@veent.ph           HR_ADMIN
EMP-003  Maria Manager     manager@veent.ph      MANAGER          <- the scoped actor
EMP-004  Elena Employee    employee@veent.ph     PAYROLL_OFFICER  <- Maria's ONLY report
EMP-901  Vince Verifier    verifier@veent.ph     VERIFIER         <- the out-of-scope target
```

Two facts differ from the plan's assumptions and were corrected after checking the database:

1. **Maria manages no branch.** Every Veent branch has a null `managerId`; only the Jojo and
   Sweetleaf orgs have branch managers. So Maria's entire reach is *herself plus Elena* — which
   makes the negative control sharper than the plan expected.
2. **Elena is `PAYROLL_OFFICER`, not `EMPLOYEE`.** That role does not hold `MANAGE_HR`
   (`src/lib/rbac.ts:26` — `MANAGER, HR_ADMIN, SUPER_ADMIN, CEO`), so she still falls in the
   subject-only arm of the guard. The subject control is still valid.

---

## Setup — plant the marker

**1.** Open http://localhost:5173 and sign in as **Super Admin** (`admin@veent.ph`) via the dev
login switcher.

**2.** Click the sidebar link named exactly **Inquiries**.

> **Assert** the page heading reads **HR Inquiries**.

**3.** Open the new-inquiry form, then open the employee dropdown.

> **Assert Vince Verifier is in the list.** This is the positive proof that an org-wide actor gets
> an org-wide dropdown — the thing Maria must not get in step 8.

**4.** Select **Vince Verifier**. Subject `SCOPE-PROBE-112`, category **Other**, message `probe`.
Submit.

> **Assert** the flash message reads **Inquiry opened.** and a row with subject `SCOPE-PROBE-112`
> appears in the table at status **Open**.

**5.** Read the id back out of the database:

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris \
  -c "select id, \"employeeId\", status from hr_complaints where subject = 'SCOPE-PROBE-112';"
```

> **Assert** exactly **one** row comes back. Note the id — every later step calls it `$PROBE_ID`.

---

## Negative control — the manager must be refused, four separate ways

This is the whole point of the section. Before this change a MANAGER could do all four of these.

**6.** Switch account to **Maria Manager** (`manager@veent.ph`). Click **Inquiries**.

**7.** > **Assert** the page **still renders the HR Inquiries heading and the new-inquiry control**,
> and that no row with subject `SCOPE-PROBE-112` is present.
>
> The positive half is not optional: it proves you are looking at a working, filtered page rather
> than a page that failed to render.

**8.** Open her employee dropdown.

> **Assert Elena Employee IS present** and **Vince Verifier is NOT**. Elena's presence is what
> proves the dropdown rendered at all.
>
> Before this change this dropdown listed every active employee in the org, so a manager could read
> the entire roster off the form even before any 403 fired.

**9.** Navigate directly to `http://localhost:5173/complaints/$PROBE_ID`.

> **Assert** the response is **403** and the message contains
> **"You can only manage your own team or a branch you manage."**
> Check the status on the document request in the Network tab, not just the rendered text.

**10.** From the browser console on any app page:

```js
await fetch(`/complaints/${PROBE_ID}?/reply`, {
  method: 'POST',
  body: new URLSearchParams({ body: 'should not land' })
}).then((r) => r.text())
```

> **Assert 403** and the same DENIED message.
>
> **This is the sharpest step in the script.** The old code wrapped the fetch in
> `.catch(() => null)` and returned `fail(404)`, so a correct service-level 403 was silently
> downgraded to "not found". Unit test N7 pins it, and its mutation is literally "restore the old
> catch".

**11.** Same for resolve:

```js
await fetch(`/complaints/${PROBE_ID}?/resolve`, { method: 'POST', body: new URLSearchParams() })
  .then((r) => r.text())
```

> **Assert 403**.

**12.** Prove the database did not move:

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris \
  -c "select c.status, count(m.id) as msgs from hr_complaints c
      left join hr_complaint_messages m on m.\"complaintId\" = c.id
      where c.subject = 'SCOPE-PROBE-112' group by c.status;"
```

> **Assert** the row reads `status = OPEN` and `msgs = 1` — the original seeded message only. No
> reply landed, and the status never flipped.

---

## Positive control — the same manager, in scope

A guard that refuses everything is not a working guard. This half proves Maria can still do her job.

**13.** Still as Maria: open the form, pick **Elena Employee**, subject `SCOPE-PROBE-112-OK`,
category **Attendance**, message `in scope`. Submit.

> **Assert** the flash reads **Inquiry opened.** and the row appears in her table at status **Open**.

**14.** Click into that row.

> **Assert** the thread shows the message body `in scope` and a **Resolve** button is present.
> Post a reply `manager reply` and **assert it appears in the thread**.

**15.** Confirm in the database:

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris \
  -c "select c.subject, c.status, u.email as opened_by, count(m.id) as msgs
      from hr_complaints c join users u on u.id = c.\"openedById\"
      left join hr_complaint_messages m on m.\"complaintId\" = c.id
      where c.subject like 'SCOPE-PROBE-112%' group by c.subject, c.status, u.email;"
```

> **Assert** `SCOPE-PROBE-112-OK` has `opened_by = manager@veent.ph` and `msgs = 2`.

---

## Subject control — the employee sees their own and nothing else

**16.** Switch to **Elena** (`employee@veent.ph`). Click **Inquiries**.

> **Assert** the heading reads **HR Inquiries about you** and the `SCOPE-PROBE-112-OK` row is
> present.

**17.** Open it and post a reply `employee reply`.

> **Assert** the reply appears **and** the status badge now reads **Responded** — the employee's
> reply is what flips the thread back to HR's turn.

**18.** Navigate to `/complaints/$PROBE_ID` — Vince Verifier's thread.

> **Assert 403** with the message **"You do not have access to this inquiry."**
>
> Note this is a *different* message from step 9. Step 9 comes from the `MANAGE_HR` arm via
> `assertCanTouchEmployee`; step 18 comes from the subject arm. Seeing the right message on each
> proves the right arm fired, not merely that something refused.

---

## Cleanup

**19.**

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris \
  -c "delete from hr_complaints where subject like 'SCOPE-PROBE-112%';"
```

> **Assert `DELETE 2`.** The message rows go with them by cascade.

---

## Result log

**Run 2026-08-24. Gate E PASSED.**

Read the Evidence column honestly before relying on this. Steps 1–18 were driven **by the user in
their own browser**, who reported back by block — "1-5: All green / 6-12: All green / 13-15: All
green / 16-18: All green". That is a human pass on every block, but it is **block-level attestation,
not a per-step transcript**: no per-step output was captured, so a re-run cannot diff against this.
Step 19 is the only row with machine output, because I ran it.

| Step | What it proves | Result | Evidence |
|---|---|---|---|
| 1–2 | Admin reaches the Inquiries page | PASS | User-reported, block 1–5 |
| 3 | Org-wide actor gets an org-wide dropdown | PASS | User-reported, block 1–5 |
| 4–5 | Marker planted, one row, id captured | PASS | User-reported, block 1–5 |
| 6–7 | Manager's page renders and filters | PASS | User-reported, block 6–12 |
| 8 | Dropdown scoped: Elena in, Vince out | PASS | User-reported, block 6–12 |
| 9 | Manager refused on **load** (403) | PASS | User-reported, block 6–12 |
| 10 | Manager refused on **reply** (403, not 404) | PASS | User-reported, block 6–12 |
| 11 | Manager refused on **resolve** (403) | PASS | User-reported, block 6–12 |
| 12 | Database unmoved: OPEN, 1 message | PASS | User-reported, block 6–12 |
| 13–14 | Manager succeeds in scope | PASS | User-reported, block 13–15 |
| 15 | Row owned by the manager, 2 messages | PASS | User-reported, block 13–15 |
| 16 | Subject sees their own thread | PASS | User-reported, block 16–18 |
| 17 | Employee reply flips status to Responded | PASS | User-reported, block 16–18 |
| 18 | Subject refused on a co-worker's thread | PASS | User-reported, block 16–18 |
| 19 | Cleanup: DELETE 2 | PASS | Machine output: `DELETE 2`, then `remaining_complaints 0` and `remaining_messages 0` — the cascade took the messages |

Both halves of the gate are covered: the four refusals (9, 10, 11, 18) and the two positive controls
(8, 13–14). A negative-only run would not have passed — it cannot tell a working guard from a broken
page.

**For a re-run:** capture per-step output rather than a block verdict. The cheapest upgrade is to
paste each `psql` result and each 403 status line into the Evidence column as you go; that turns
this from an attestation into a record something later can be diffed against.

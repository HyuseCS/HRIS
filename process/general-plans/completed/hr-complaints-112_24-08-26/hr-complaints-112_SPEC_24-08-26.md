---
name: spec:hr-complaints-112
description: "HR complaints/inquiries two-way thread (#112) — fix cherry-picked code to compile, enforce per-employee scoping, close the org-scoping hole, and cover guards with tests"
date: 24-08-26
feature: hr-complaints-112
---

# SPEC — HR Complaints / Inquiries (#112)

## Summary

HR sometimes needs to ask a specific employee a question or raise a concern — "why is your
timesheet short this week?", "can you confirm your employment classification?" — and get an
answer from that employee, in writing, on record. Today that conversation happens over chat
or in person and leaves no trace. This feature gives HR a place inside the app to open one of
these inquiries against an employee, and gives the employee a place to see it and reply. HR
can close the loop by marking it resolved. Everything is logged and both sides get notified
when the other one acts.

The code for this already exists on this branch (cherry-picked from a closed PR) but it does
not compile, and it lets a MANAGER see and act on every employee in the company instead of
just their own team. This SPEC locks what "correct and shippable" means so PLAN can fix it.

## User Stories / Jobs To Be Done

1. As an **HR_ADMIN / SUPER_ADMIN / CEO**, I want to open an inquiry against any employee in
   my organization, so I can ask a question or raise a concern on record.
2. As an **HR_ADMIN / SUPER_ADMIN / CEO**, I want to see every inquiry in the organization,
   filter by status, and reply to any of them, so I can manage the full inquiry workload.
3. As an **HR_ADMIN / SUPER_ADMIN / CEO**, I want to mark an inquiry resolved once it is
   settled, so the thread is visibly closed and stops asking for a reply.
4. As a **MANAGER**, I want to open an inquiry against one of my own reports or someone on a
   branch I manage, so I can raise concerns about my own team.
5. As a **MANAGER**, I want to see and reply only to inquiries about people in my scope
   (my reports, my managed branches, myself), so I never handle another manager's team's
   inquiries by accident.
6. As a **MANAGER**, I do **not** want to be able to open, view, reply to, or resolve an
   inquiry against an employee outside my team and outside every branch I manage — even if I
   guess or am given the inquiry's URL directly.
7. As the **subject employee**, I want to see inquiries opened against me in my own workspace,
   so I know HR has a question or concern for me.
8. As the **subject employee**, I want to reply to an inquiry opened against me, so I can
   answer HR's question.
9. As the **subject employee**, I do **not** want to see, or be able to reply to, an inquiry
   opened against a co-worker — even by guessing or typing another inquiry's URL.
10. As any actor with access to a thread, I want a notification when the other side posts,
    so I don't have to keep checking back manually.
11. As a compliance/HR-audit reader, I want every open, reply, and resolve action logged with
    who did it and when, so the interaction is auditable after the fact.

## What The User Wants (Behavioral Outcomes)

- A single "Inquiries" area (already wired into the main nav for every signed-in user) shows:
  - **HR view** (HR_ADMIN, SUPER_ADMIN, CEO, MANAGER): a list of inquiries, filterable by
    status, with a form to open a new inquiry against an employee. HR_ADMIN/SUPER_ADMIN/CEO
    see every employee and every inquiry in the org. A MANAGER sees only inquiries about
    people in their own scope (their reports, branches they manage, themselves) and can only
    pick those same people when opening a new inquiry.
  - **Employee view** (anyone without `MANAGE_HR`, or a MANAGER looking at their own record):
    a list of the inquiries opened against them only.
- Opening an inquiry requires a subject employee, a subject line, a category, and an initial
  message. The thread starts in status **Open**.
- Either side can post a reply on an open (non-resolved) thread. A reply from the employee
  flips status to **Responded** (HR's turn). A reply from HR flips status back to **Open**
  (employee's turn). This ping-pong continues until HR resolves it.
- HR marks an inquiry **Resolved**. A resolved thread cannot receive further replies from
  either side.
- Opening an inquiry notifies the employee. A reply notifies whoever is not the author (HR
  reply → notify employee; employee reply → notify the HR user who opened it). Resolving
  notifies the employee. Notifications surface as a toast the next time the notified user
  loads a page in the app, and also appear in the dashboard "Recent activity" panel.
- A MANAGER attempting any of the above against an employee outside their scope is refused,
  the same way `assertCanTouchEmployee` refuses it everywhere else in this codebase — visiting
  the thread directly by URL, opening a new inquiry against them, or replying/resolving all
  fail the same way.
- An inquiry always belongs to exactly one organization. Nothing about an inquiry — reading
  the list, reading one thread, replying, resolving — ever crosses organizations, even if an
  id from another org is guessed or typed directly.

## Flow / State Diagram

Status ping-pong for one inquiry thread:

```
                     open (HR only)
                          |
                          v
                    +-----------+
        HR reply -->|   OPEN    |--- employee reply --->+-----------+
        (loop back) |(employee's|                       | RESPONDED |
                     |  turn)    |<--- HR reply ---------|(HR's turn)|
                     +-----------+                       +-----------+
                          |                                    |
                          |             HR resolves            |
                          +-------------------+-----------------+
                                              v
                                       +------------+
                                       |  RESOLVED  |
                                       | (no more   |
                                       |  replies)  |
                                       +------------+
```

Who can see/act on a thread (access shape, not a data flow):

```
                         HrComplaint (organizationId, employeeId)
                                    |
        +---------------------------+---------------------------+
        |                                                        |
  HR_ADMIN / SUPER_ADMIN / CEO                         MANAGER (per-employee scoped)
  (ADMINISTER_HR_ORGWIDE)                              (MANAGE_HR, no org-wide cap)
        |                                                        |
  sees / opens / replies /                     sees / opens / replies / resolves ONLY
  resolves ANY employee                         where employeeId is:
  in their org                                    - their own record, OR
                                                    - a direct/indirect report, OR
                                                    - staff of a branch they manage
                                                  same org only in every case
        |                                                        |
        +---------------------------+---------------------------+
                                    |
                          subject Employee (no MANAGE_HR)
                                    |
                    sees / replies ONLY threads where
                       employeeId == their own employee id
```

## Acceptance Criteria (Testable Outcomes)

1. **HR_ADMIN/SUPER_ADMIN/CEO can open an inquiry against any employee in their org**, and the
   thread appears in the org-wide list at status Open.
   - proven by: unit test on `openComplaint` (existing, `tests/unit/complaints.test.ts`) +
     route-level test on the `open` action for an org-wide role
   - strategy: Fully-Automated

2. **A MANAGER can open an inquiry against their own report or a staff member of a branch
   they manage** (positive control), grounded in the same scoping rule
   `assertCanTouchEmployee`/`listVisibleEmployeeIds` already enforce for employee records.
   - proven by: new unit/route test seeding a MANAGER with a report, asserting the `open`
     action succeeds
   - strategy: Fully-Automated

3. **A MANAGER cannot open, view, reply to, or resolve an inquiry against an employee outside
   their scope** (negative control) — the request must fail with 403/404, not silently drop
   the row from a list. Every one of the four actions (open / view thread by id / reply /
   resolve) is tested independently, not just "list omits it".
   - proven by: new unit/route tests: (a) `open` action against an out-of-scope employeeId
     returns 403, (b) loading `/complaints/[id]` for an out-of-scope thread by known id
     returns 403/404, (c) `reply` action on that thread returns 403, (d) `resolve` action on
     that thread returns 403. Each asserts the failure status code, not merely "not visible".
   - strategy: Fully-Automated (unit/route), with one live-browser negative-control pass
     recommended per this repo's "verify a guard live, before and after" rule since object-
     level guards here have previously been unit-green while live-broken
   - strategy: Hybrid

4. **The subject employee sees only inquiries opened against themselves** in their own
   Inquiries view (positive: their own thread appears; negative: a co-worker's thread, known
   by id, 403s when visited directly).
   - proven by: route test on `/complaints` load for an employee actor (positive: own
     complaint present) + route test on `/complaints/[id]` load for a co-worker's complaint id
     (negative: 403 "You do not have access to this inquiry.")
   - strategy: Fully-Automated

5. **No inquiry, list entry, or thread ever crosses organizations** — an employee id or
   complaint id from another organization returns not-found, not another org's data.
   - proven by: new unit test on `listComplaintsForEmployee` scoped by organizationId (closes
     the current gap where it filters on `employeeId` alone) + existing 404 test on
     `openComplaint` for an employee outside the org
   - strategy: Fully-Automated

6. **A reply from the employee moves status to Responded and notifies the HR user who opened
   the thread; a reply from HR moves status to Open and notifies the employee.**
   - proven by: existing unit tests in `tests/unit/complaints.test.ts` ("employee reply →
     RESPONDED…", "HR reply → OPEN…")
   - strategy: Fully-Automated

7. **A resolved thread rejects further replies from either side**, and resolving notifies the
   employee.
   - proven by: existing unit tests ("a resolved inquiry rejects further replies",
     "resolveComplaint sets RESOLVED and notifies the employee")
   - strategy: Fully-Automated

8. **Opening, replying, and resolving each write an audit log entry** carrying the acting
   user's full role set (`actorRoles`), not a single role — consistent with every other
   `AuditContext` call site in this codebase.
   - proven by: new unit test asserting `writeAuditLog` is called with `actorRoles` present on
     `openComplaint`, `postComplaintMessage`, and `resolveComplaint`
   - strategy: Fully-Automated

9. **The codebase type-checks clean** — the 12 current `pnpm check` errors (missing
   `actorRoles` field, non-existent `user.role` property) are gone with no new errors
   introduced elsewhere.
   - proven by: `pnpm check` gate, zero errors
   - strategy: Fully-Automated

10. **The full unit suite stays green** after the fix, including the 6 existing complaints
    tests plus every new test added for scoping (items 2, 3, 5, 8 above).
    - proven by: `pnpm test`, all files pass
    - strategy: Fully-Automated

11. **Both parties see toast notifications and a dashboard "Recent activity" entry** for
    opens/replies/resolves that concern them, using the existing `notify` → `listUnread` /
    `listRecent` → layout-toast pipeline. No new notification surface (no bell, no badge) is
    introduced.
    - proven by: existing `notify()` call assertions in `tests/unit/complaints.test.ts`
      (already pass) — no new UI test required, since the toast/recent-activity mechanism is
      pre-existing and out of scope to re-verify here
    - strategy: Fully-Automated

## Out Of Scope

- Attachments/file uploads on a message.
- Employee-initiated complaints (employees can only reply to a thread HR opened; they cannot
  open a new one against themselves or anyone else). The issue describes HR raising a question
  "to a specific employee" — a one-directional opening right for HR is what was asked for.
- An unread-count badge on the "Inquiries" nav tab. Notification is via the existing toast +
  recent-activity mechanism only.
- SLA timers, due dates, or escalation rules. The issue's own triage note says start minimal;
  see the decision below.
- Email delivery of notifications. The app has no such channel today for any feature; not
  introduced here.
- Adding, removing, or renaming complaint categories beyond the five already shipped in the
  cherry-picked code (`CLASSIFICATION`, `ATTENDANCE`, `CONDUCT`, `PERFORMANCE`, `OTHER`).
- Any change to `HrComplaint.organizationId` becoming a real Prisma relation (currently a bare
  scalar, unlike ~25 other models) — noted as a gap in Constraints below but not required to
  fix for this issue to be considered done, since every current query already filters on it
  correctly once the employee-scoped list bug is fixed.
- Moving `writeAuditLog`/`notify` inside the `$transaction` for atomicity — a real gap noted in
  research, but not something the issue asked for and not required by any acceptance criterion
  above; left as a backlog note.

## Constraints

- Access must use `MANAGE_HR` **plus** per-employee scoping via the existing
  `assertCanTouchEmployee` / `listVisibleEmployeeIds` helpers in
  `src/lib/server/services/employee-access.ts` — this is a fixed decision, not open for
  re-litigation in PLAN or INNOVATE.
- The work is a fix-forward on the already cherry-picked commit `0223acf`, not a rebuild. All
  five categories, the Open/Responded/Resolved state machine, and the notify-on-transition
  behavior already in that commit are kept as-is unless an acceptance criterion above requires
  a change.
- `AuditContext.actorRoles: Role[]` is a required field (`src/lib/server/services/types.ts`);
  every call site must pass the actor's full role set, matching every other writer of this
  type elsewhere in the app.
- There is no notification bell and no kiosk route tree in this app. "Notification" means the
  existing toast-on-next-page-load plus dashboard "Recent activity" panel. "Kiosk entry point"
  means the nav tab already present in `src/routes/(app)/+layout.svelte` (`/complaints`,
  label "Inquiries") inside the ordinary `(app)` shell — there is no separate kiosk shell to
  wire into.
- `pnpm check` does not type-check `prisma/**` or `scripts/**` — passing `pnpm check` does not
  cover schema or migration script correctness; those are verified separately (schema is
  additive-only per research, `pnpm db:push` suffices).
- Triage decision (from the issue itself): **minimal thread + status is sufficient.** The
  issue asks to "start minimal (thread + status) unless there's a stronger requirement," and
  no stronger requirement (SLA, ticket categories beyond a fixed list, escalation) is stated
  anywhere in the issue or by the user. The five fixed categories and three-state status
  already shipped in the cherry-picked code satisfy this. No further structure is added.

## Open Questions

None. The two decisions that would normally be open (access policy shape, and whether to
rebuild vs. fix-forward) are fixed by the user's instructions above and are not reopened here.

## Background / Research Findings

- Issue #112 verbatim: add a Complaints/Inquiries area where HR raises a question/concern to a
  specific employee, two-way thread, separate from the approval-based Requests flow. HR opens
  (subject, category, message), status Open/Responded/Resolved. Employee sees it in their
  kiosk and can respond; HR marks resolved. Audit-logged; notify employee on new complaint,
  notify HR on response. Nav tab (HR side) + kiosk entry point for employee. Employment-
  classification queries are a first-class category. Issue's own triage question: minimal
  thread+status vs. structured categories/SLAs — start minimal unless a stronger requirement
  exists.
- Basis is a cherry-pick: commit `3df622d` from closed PR #161 is already cherry-picked onto
  this branch as `0223acf`, with zero merge conflicts. The schema change is additive-only (two
  new models, two new enums, three back-relations) — a plain `pnpm db:push` applies it, no
  `scripts/migrate-*.ts` needed.
- Verified `pnpm test` right now: 153 files / 1713 tests, all pass, including the 6 complaints
  tests in `tests/unit/complaints.test.ts` — vitest does not type-check, which is why this is
  green despite the compile errors below.
- Verified `pnpm check` right now: 12 errors across 4 files —
  - 8× `Property 'role' does not exist on type 'User'` in
    `src/routes/(app)/complaints/+page.server.ts` (lines 20, 72, 88) and
    `src/routes/(app)/complaints/[id]/+page.server.ts` (lines 14, 34, 53, 67, 73)
  - 3× `actorRoles is missing in type AuditContext` in `complaints/+page.server.ts:92` and
    `[id]/+page.server.ts:57,77`
  - 1× same error in `tests/unit/complaints.test.ts:28`
- Current gaps in the cherry-picked code, beyond the type errors, found in RESEARCH:
  - Access is gated on `MANAGE_HR` alone with no per-employee scoping — a MANAGER currently
    gets org-wide reach, which violates the user's fixed access decision.
  - `listComplaintsForEmployee` (`src/lib/server/services/complaints/index.ts:180`) filters on
    `employeeId` only, with no `organizationId` predicate — an org-scoping hole.
  - No tests exist for any route-level 403 (all six current tests are service-level unit
    tests with the DB mocked).
  - `HrComplaint.organizationId` is a bare scalar field with no `organization` relation,
    unlike roughly 25 other models in the schema — inconsistent, but every query already
    filters on it explicitly, so it's not a correctness bug today.
  - `writeAuditLog` and `notify` run outside the `db.$transaction` in `postComplaintMessage`,
    even though `writeAuditLog` now accepts a tx client — a partial-write risk, but not asked
    for by the issue and not required to close it.
- There is no notification bell in this app. Unread notifications surface as toasts on the
  next page load (`src/routes/(app)/+layout.svelte:76-87`, reading `data.notifications` from
  `listUnread`, then `POST /api/v1/notifications/read`). A second surface is the dashboard
  "Recent activity" panel via `listRecent`. Confirmed directly: the cherry-picked
  `openComplaint`/`postComplaintMessage`/`resolveComplaint` all call the existing `notify()`
  helper (`src/lib/server/services/notifications`), so no new notification plumbing is needed.
- There is no kiosk route tree in this app; `/punch` is an ordinary `(app)` route gated by
  `requireFoodServiceOrg`. Confirmed the nav tab already exists:
  `src/routes/(app)/+layout.svelte:178` has an `Inquiries` entry pointing at `/complaints`,
  `show: true` (visible to every signed-in user) — the single route's `+page.server.ts`
  branches internally on `canAny(roles, 'MANAGE_HR')` to render the HR view vs. the employee
  view. This one route already serves both the "nav tab (HR side)" and "kiosk entry point for
  the employee" requirements from the issue; the routing/branching does not need to change.
- Auth context (`process/context/auth/all-auth.md`) confirms the fixed access decision matches
  an established codebase pattern: `MANAGER` holds `MANAGE_HR` (from #133) and ranks level
  with `HR_ADMIN`, so a check that only tests `MANAGE_HR` describes an org-wide set, not a
  scoped one. `assertCanTouchEmployee` / `listVisibleEmployeeIds` exist specifically to fix
  this class of bug elsewhere in the app (#228) and are documented as the correct tool for any
  "MANAGER may reach only their own team or a branch they manage" rule — the exact shape this
  feature needs.
- Tests context (`process/context/tests/all-tests.md`) confirms: `pnpm test` is the unit gate
  (vitest, no `test:unit` script), `pnpm check` is typecheck (excludes `prisma/**` and
  `scripts/**`), and this repo's strongest verification precedent for object-level guards is a
  live browser/`psql` check, not unit tests alone, since a green suite has previously hidden a
  live-broken guard (#283) — this justifies the Hybrid strategy tag on acceptance criterion 3.

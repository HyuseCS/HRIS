# RESEARCH DIGEST — issue #178 (performance evaluation, bi-monthly)

Two RIPER-5 RESEARCH agents produced this. Everything below is cited from live code on
branch `feat/performance-eval-bimonthly-178` (tip == staging `db04eb6`, 0 commits ahead).
Treat citations as facts; re-read the file before editing it.

## 0. Agreed scope (from the user, 2026-08-25)

The issue's "blocked pending form spec" is RESOLVED by the user simplifying it:

> "I think this should just be an evaluation form no? Just straight up review and verdict.
> Send reminders to those that are going to be reviewed to their calendars and
> notifications, etc."

Follow-up decision on reminders: **in-app notifications + real email.** (User was shown that
calendar/ICS does not exist and email is console stubs; picked "In-app + real email" over
in-app-only, over an .ics download, and over Google Calendar OAuth.)

So the four work items are:
1. **Evaluation form** = a review (text) + a verdict. Simple. Not a multi-criterion rubric.
2. **Remove Goals fully** — UI, services, API route, Prisma model + enum, migration.
3. **Auto bi-monthly cycles** — generate every 2 months, auto-open reviews, delete the manual
   HR "Review Cycles" table + create/activate/close/open-reviews UI.
4. **Reminders** to the employee being reviewed — in-app notification + email.

## 1. Performance domain as it exists today

### Prisma (`prisma/schema.prisma`)
- `enum ReviewCycleStatus` 248–252: `DRAFT, ACTIVE, CLOSED`
- `enum ReviewStatus` 254–260: `PENDING, SELF_ASSESSMENT, MANAGER_REVIEW, COMPLETED, ACKNOWLEDGED`
  - **`MANAGER_REVIEW` is never written by any code.** `saveSelfAssessment` sets
    `SELF_ASSESSMENT`; `submitManagerReview` jumps straight to `COMPLETED`. Dead value.
- `enum GoalStatus` 262–267: `DRAFT, ACTIVE, COMPLETED, CANCELLED`
- `model ReviewCycle` 1637–1651 `@@map("review_cycles")`: id, organizationId, name, startDate,
  endDate, status(DRAFT), createdAt, updatedAt. Relations: organization, reviews[].
  **No indexes beyond PK, no `@@unique`.** Nothing today stops duplicate cycles.
- `model PerformanceReview` 1653–1674 `@@map("performance_reviews")`: id, cycleId, employeeId,
  reviewerId, status(PENDING), selfAssessment Text?, managerComments Text?, overallRating Int?,
  submittedAt?, completedAt?, acknowledgedAt?, createdAt, updatedAt.
  `@@unique([cycleId, employeeId])` at 1672 — this is what makes re-opening idempotent.
  No index on reviewerId or employeeId alone. No `organizationId` column of its own.
- `model Goal` 1676–1693 `@@map("goals")`: id, employeeId, **cycleId String? with NO FK and no
  reader**, title, description?, category?, status(ACTIVE), progress(0), targetDate?, timestamps.
  `@@index([employeeId])`. Relation: employee only.
- Back-relations: `Organization.reviewCycles` :326; `Employee.performanceReviews` :491;
  `Employee.reviewsGiven` :492; `Employee.goals` :493.

### Service — `src/lib/server/services/performance.ts` (319 lines, the ONLY performance service)
15 exports. Line / signature / callers:
1. `listReviewCycles(organizationId)` :9 — page load (HR only), cycles API
2. `createReviewCycle(organizationId, {name,startDate,endDate}, ctx)` :16
3. `redactHrAuthored<T>(review)` :45 — nulls managerComments+overallRating (#179). Used by page
   load :53 and review detail :36. **Unit-tested.**
4. `listReviewsForEmployee(employeeId)` :51
5. `listReviewsForReviewer(reviewerId)` :62
6. `getReview(id, organizationId)` :73 — 404 if missing; org-gates via `cycle.organizationId`
7. `saveSelfAssessment(id, employeeId, text, ctx)` :86 — 409 if not subject
8. `submitManagerReview(id, reviewerId, {managerComments?, overallRating?}, ctx)` :117 — 409 if
   not reviewer; sets COMPLETED
9. `acknowledgeReview(id, employeeId, ctx)` :154 — 409 not subject, 400 if status != COMPLETED
10. `updateReviewCycleStatus(id, organizationId, status, ctx)` :175
11. `openReviewsForCycle(cycleId, organizationId, ctx)` :198 → `{opened, skipped}`
12. `listGoalsForManager(managerEmployeeId)` :241  ← DELETE
13. `listGoalsForEmployee(employeeId)` :251        ← DELETE
14. `createGoal(...)` :258                          ← DELETE
15. `updateGoalProgress(...)` :290                  ← DELETE

`openReviewsForCycle` (198–236) is the auto-open logic that ALREADY EXISTS. It selects
`employmentStatus:'ACTIVE'` employees with `reportsToId != null` — so **employees with no
manager silently get no review**, and `skipped` conflates that with "already had one".

Audit `entityType` strings written here: `'ReviewCycle'` (32,189,231), `'PerformanceReview'`
(110,167), `'Goal'` (282,312). `entityType` is a free-form `string` (`src/lib/server/audit.ts:14`)
— no enum to update, and historic `Goal` audit rows survive the schema drop (not FK-linked).

Every `writeAuditLog` here runs OUTSIDE any `$transaction` (lines 30,107,139,164,187,229,280,310)
— the repo-wide #324 pattern. **Report only, do not fix in this issue.**

### Routes + REAL guards (read the `actions` export and wrappers, never the handler body)

`/performance` — `src/routes/(app)/performance/+page.server.ts` (191 L) + `+page.svelte` (471 L)
- `load` 22–60: **NO capability guard**, any authed user. Branches on
  `isManager = canAny(roles,'VIEW_TEAM')` :24 and `isAdmin = canAny(roles,'MANAGE_HR')` :25.
  Cycles only fetched when isAdmin :27. Returns empty arrays if the user has no Employee row
  (29–40). `myReviews` passed through `redactHrAuthored` :53.
- actions: `createGoal` :85 NO guard (self-scoped by userId lookup) · `updateGoal` :107 NO guard
  (ownership inside the service) · `createCycle` :134 `requireAnyCapability(roles,'MANAGE_HR')` ·
  `setCycleStatus` :153 MANAGE_HR (hand-rolled validation, no zod) · `openReviews` :174 MANAGE_HR.
- `+page.svelte` DOM order: 50–59 header + "New Goal" toggle · **65–69 top-level `role="alert"`
  banner — KEEP, `tests/e2e/form-errors.spec.ts:37` pins exactly this** · 71–130 create-goal form ·
  132–220 My Goals cards · 222–351 Review Cycles HR table + create form + Activate/Open/Close ·
  353–395 My Reviews table · 397–429 Team Goals manager table · 431–470 Reviews to Complete.
  Helpers: `goalStatusClass` :29, `reviewStatusClass` :38 (also used for CYCLE status at :287).

`/performance/reviews/[id]` — `+page.server.ts` (91 L) + `+page.svelte` (124 L)
- `load` 14–39: `getReview(params.id, user.organizationId)`; if neither subject nor reviewer →
  `assertCanTouchEmployee(user, review.employee.id)` :31; subject-and-not-reviewer → redact :36.
  Object-scoped, not rank-scoped (#282 §3-B).
- actions: `saveSelf` :63, `submitReview` :72 (zod rating 1–5), `acknowledge` :87 — none carry a
  capability check; all delegate ownership to the service, which 409s.

API routes:
- `GET/POST /api/v1/performance/goals` — 401 check only, self-scoped. **DELETE whole file.**
- `GET/POST /api/v1/performance/cycles` — 401 + `requireAnyCapability(roles,'MANAGE_HR')` :9,:22
- `GET /api/v1/performance/reviews` — 401 only, self-scoped, returns `{asSubject, asReviewer}`.
  **`asSubject` is NOT redacted**, unlike the page load. Possible #179 oversight. Reported.
- There is NO `/api/v1/performance/reviews/[id]` route.

Nav: `src/routes/(app)/+layout.svelte:171–175` — `{href:'/performance', show:true}`,
unconditional; every role sees the link.

### RBAC (`src/lib/rbac.ts`)
- :26 `MANAGE_HR: ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']`
- :48 `VIEW_TEAM: ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']`
- :30–33 standing warning: `MANAGE_HR` INCLUDES `MANAGER` (#133) — never treat it as
  "may reach any employee record".

Org-scoping shapes present (report, do not refactor — that is issue #323):
- `openReviewsForCycle` :210 scopes employees via the JOIN `where:{ user:{ organizationId } }`
  even though `Employee` has its own indexed `organizationId`.
- `getReview` :75 scopes via `cycle:{ organizationId }` — the only path, since PerformanceReview
  has no org column.
- `listReviewsForEmployee/ForReviewer/GoalsFor*` take NO organizationId — purely id-scoped. Safe
  only because callers derive the id from `locals.user.id`.
- `updateReviewCycleStatus` :181 and `openReviewsForCycle` :203 use the correct direct-column
  `findFirst({where:{id, organizationId}})`.

## 2. COMPLETE Goal-removal blast radius (checklist — missing a site is the main failure mode)

Prisma: `schema.prisma` 262–267 (`enum GoalStatus`) · 1676–1693 (`model Goal`) · :493
(`Employee.goals`).

Service `performance.ts`: :4 `import { listReportIdsFor } from './supervisors'` becomes orphaned
(only `listGoalsForManager` :242 uses it) · :238 section-header comment · 240–249 · 251–256 ·
258–288 · 290–318.

`+page.server.ts`: import members :4 `listGoalsForEmployee`, :8 `createGoal`,
:9 `updateGoalProgress`, :14 `listGoalsForManager` · :20 `GOAL_STATUS` · :24 `isManager` likely
orphaned (verify) · :32 `myGoals:[]` :35 `teamGoals:[]` · 42–47 Promise.all · :52 :55 return shape ·
71–76 `createGoalSchema` · 78–82 `updateGoalSchema` · 85–105 `createGoal` action ·
107–132 `updateGoal` action.

`+page.svelte`: :9 `showGoal` · :13–14 comment + `createGoal` guard · 29–36 `goalStatusClass` ·
53–58 New Goal button · 61–64 comments (KEEP the banner 65–69) · 71–130 create-goal form ·
132–220 My Goals section · 397–429 Team Goals section · 19–27 `rowGuards`/`rowGuard` also used by
the cycle table :277–279, so it dies only when the cycles UI goes too (it does) → then also drop
:5 `createSubmitGuard` import if no guard survives.

API: delete `src/routes/api/v1/performance/goals/+server.ts` and its directory.

Scripts (ORDER-COUPLED — a positional destructure paired to a positional `Promise.all`; editing
one without the other silently mislabels every later count):
- `scripts/prod-delete.ts` :200 destructure · :223 `db.goal.count` · :265 summary object ·
  :335 `tx.goal.deleteMany`
- `scripts/clean-e2e-employees.ts` :86 `step('goal', …)`

Migration (MANDATORY, `db push` cannot do it): a new `scripts/migrate-*.ts` running raw SQL to
drop the `goals` table and the `GoalStatus` type BEFORE the push. Pattern:
`scripts/migrate-employment-type-regular.ts`.

Generated, do not hand-edit: `.svelte-kit/types/.../performance/goals/**`.

FALSE POSITIVES — DO NOT TOUCH: all `.claude/**`, `.agents/**`, `process/**`, `AGENTS.md`
"goal"/"session-goal" hits (harness vocabulary); `.specify/templates/*.md`,
`specs/001-hris-platform/**`, `docs/plans/263-*.md` (historical docs).

SURVIVES: `src/lib/server/services/supervisors.ts:13 listReportIdsFor` (other domains use it);
audit rows with `entityType='Goal'` persist and will keep rendering in the audit-log UI.

## 3. Infrastructure available to reuse (do NOT build new subsystems)

**In-app notifications — EXISTS, reusable in one line.**
- `model Notification` `schema.prisma:1163–1177`: id, userId, message, kind NotificationKind,
  link?, readAt?, createdAt; `@@index([userId, readAt])`; table `notifications`. Per-USER, not
  per-org — scoping comes from the userId you pass.
- `enum NotificationKind` :1155–1160: `GENERAL, ANNOUNCEMENT, AWARD, PAYSLIP, REQUEST,
  RECRUITMENT`. **No performance/review kind.** Adding one has precedent —
  `scripts/migrate-notification-kind.ts` exists.
- `src/lib/server/services/notifications.ts` (62 L, the whole API):
  `notify(userId, message, link?, kind='GENERAL')` :8 · `notifyMany(userIds[], message, link?,
  kind)` :17 (createMany, no-ops on empty) · `listUnread(userId, limit=10)` :29 ·
  `listRecent(userId, limit=8)` :40 · `markRead` :49 · `markAllRead` :57.
- Canonical call site: `src/lib/server/services/awards.ts:61–66` —
  `await notify(employee.userId, 'You received an award: …', '/dashboard', 'AWARD')` immediately
  after `writeAuditLog`. Capability-scoped fan-out example: `src/lib/server/backup/run.ts:228–249`
  (`notifyAdmins` — finds recipients from the RBAC table, never role literals).
- Delivery: **no bell icon, no `/notifications` page.** `src/routes/(app)/+layout.server.ts:3,14,53`
  loads `listUnread`; `+layout.svelte:76–86` shows each as a one-shot toast then POSTs
  `/api/v1/notifications/read`. Plus the dashboard "Recent activity" panel
  (`dashboard/+page.server.ts:8,120` → `listRecent(user.id, 8)`).
- Only API route: `src/routes/api/v1/notifications/read/+server.ts` (POST, 401 if no locals.user).
  Creation is server-side service calls only.
- **Zero test coverage** — no test file matching `*notif*` exists.

**Email — console-log stubs behind a deliberate, tested seam.**
- `src/lib/server/notifications.ts` (DIFFERENT file from the service above; the service calls out
  the distinction at its line 4). Every send is `console.log`: `sendWelcomeEmail` :7,
  `sendDiscordInviteEmail`/`buildDiscordInvite`, `sendTimesheetStatusEmail`, `sendLeaveStatusEmail`,
  `buildInterviewEmail`/`sendInterviewScheduledEmail`, `buildOffboardingNotice`/
  `sendOffboardingNoticeEmail`.
- The convention, stated three times in comments: **`build*` assembles `{subject, body}` and is
  unit-tested; `send*` is the delivery seam that logs, "so a real mailer only has to deliver
  subject/body."**
- Zero mail deps in `package.json` (no nodemailer/resend/sendgrid/postmark/mailgun/smtp), zero mail
  env vars.
- USER DECISION: real email is IN SCOPE for #178. It must be built at the `send*` seam so every
  existing stub benefits, must fall back to the current console behaviour when unconfigured, and
  its credentials are env vars the user supplies — delivery cannot be verified in this session.

**Calendar — DOES NOT EXIST.** Zero hits for `text/calendar`, `BEGIN:VCALENDAR`, `VEVENT`,
googleapis calendar, `*.ics`. The one `Calendar` match is a Lucide icon in
`settings/+page.svelte`. Out of scope per the user's choice.

**Scheduling — there is NO app scheduler.** `scripts/README.md:190–200` states it: nothing inside
SvelteKit runs on a timer; recurring jobs are one-shot `scripts/*.ts` invoked by a **droplet
crontab installed by hand, outside the repo** — `deploy.yml` will NOT create it. Confirmed
negatively: no node-cron, no GH Actions schedule, no interval in `hooks.server.ts`, no
run-on-request pattern. Two jobs exist:
- `scripts/promote-probationary.ts` — **the closest template for #178.** Header 1–22. Crontab at
  `scripts/README.md:210–212`. Design points that map directly: delegates to the normal service
  function so the audit row is byte-identical to the manual action (11–17); runs as the seeded
  `system@veent.ph` user because `AuditLog.actorId` is a non-nullable FK (18–20) and
  `process.exit(1)`s if that user is missing (37–47); **idempotent by query shape, not by lock**
  (22–23); backdates if cron missed nights; supports `--dry-run`; notifies via `notifyMany` :27.
- `scripts/backup-documents.ts` (#164) — the per-org, config-driven, interval variant. Cron only
  OFFERS each org a run; the script decides via the pure `isRunDue(cfg, lastCompletedAt, now)` at
  `src/lib/server/backup/plan.ts:47–57` — measured from the last COMPLETED run, no catch-up loop
  (ten missed nights → one run). Pure logic lives in `backup/plan.ts` and is unit-tested
  (`tests/unit/backup-plan.test.ts`); the script is a thin IO shell.
- `scripts/` is baked into the prod image and `tsx` survives `pnpm prune --prod`
  (`scripts/README.md:195–196`), so a new script runs in prod unchanged.
- **Nothing type-checks or tests `scripts/**`** — `pnpm check` does not cover it (#282 shipped a
  broken site on that assumption).

**Idempotency / locking — three patterns in use.**
- Transaction-scoped blocking single-bigint advisory lock:
  `services/timesheets.ts:185` `pg_advisory_xact_lock(hashtext(${key})::bigint)`; same shape in
  `payroll/periods.ts:64`, `payroll/index.ts:110`.
- Session-scoped non-blocking two-arg form for cron: `scripts/backup-documents.ts:145–150`
  `pg_try_advisory_lock(${BACKUP_LOCK_NAMESPACE}::int, hashtext(${lockKey}))`, unlock :223.
  `BACKUP_LOCK_NAMESPACE = 164` at `backup/plan.ts:25`. **Deliberately a different lock space**
  from the single-bigint form so a long job cannot stall a payroll write via hash collision
  (`plan.ts:16–24`, `scripts/README.md:272–277`). TRAP: a session-level lock lives on ONE
  connection, so the script pins its own PrismaClient via `withSingleConnection(databaseUrl)`
  (`plan.ts:126`) — otherwise Prisma's pool sends the unlock down a different connection and it
  silently no-ops; the script checks the unlock return value and warns :227.
- Query-shape idempotency (free): `promote-probationary.ts:22–23`.
- `@@unique` constraints: e.g. `@@unique([organizationId, periodStart, periodEnd])`
  `schema.prisma:1241`. **A `@@unique` on (organizationId, cycle window) makes bi-monthly
  auto-generation un-double-creatable at the DB — cheapest correct option.**

**Audit — `src/lib/server/audit.ts:22–40`:**
`writeAuditLog(ctx: AuditContext, payload: AuditPayload, client: Prisma.TransactionClient = db)`.
`ctx = {organizationId, actorId, actorRoles: Role[], ipAddress?, userAgent?}`;
`payload = {action: AuditAction, entityType: string, entityId, oldValue?, newValue?}`.
Passing `tx` as the third arg makes the audit row atomic with the mutation. A cron writer needs a
non-null `actorId` → the seeded `system@veent.ph` user (`prisma/seed-core.ts`), OR follow
`backup-documents.ts:16–20`, which deliberately writes NO audit row and uses a durable domain row
as the record instead.

**Dates — `src/lib/utils/dates.ts`, the single helper module.**
- Manila as a fixed offset, not a tz lib: `MANILA_OFFSET_MS` :59, `manilaDayKey` :62,
  `manilaDateTime` :67 (Intl, `Asia/Manila`), `manilaDayStart` :81, `manilaWeekStart` :87,
  `manilaWeekEnd` :98.
- Two month helpers that DELIBERATELY DISAGREE on timezone:
  `monthsOfService(startDate, endDate)` :113 — whole calendar months compared via `manilaDayKey`,
  decremented when the anniversary day-of-month has not arrived, floored at 0; Manila basis is
  required (comment 105–107) so displayed tenure cannot disagree with the 6-month gate.
  `regularizationDate(startDate)` :166 — `d.setUTCMonth(d.getUTCMonth() + REGULARIZATION_MONTHS)`,
  computed in UTC ON PURPOSE (comment 162–165) to keep day-of-month stable against UTC-midnight
  start dates.
- `REGULARIZATION_MONTHS = 6` :159, `daysBetween` :173, `regularizationStatus` :184.
- **There is NO generic `addMonths(date, n)`.** Ad-hoc month stepping outside the helper module at
  `services/reports.ts:122,149` (`cursor.setMonth(+1)`, local time, no Manila basis).
- Known trap: #320 found four latent month bugs in shipped code around cross-month periods.
  "Every 2 months" must state its UTC-vs-Manila basis explicitly.

## 4. Test inventory + coverage gaps

| File | Asserts | Coupling to this work |
|---|---|---|
| `tests/unit/performance-redact.test.ts` (39 L) | `redactHrAuthored` nulls managerComments+overallRating (21–25), keeps selfAssessment/status/cycle (27–32), does not mutate input (34–38) | Depends on `cycle` in the review shape (18, 31). **Breaks if ReviewCycle is removed/renamed.** |
| `tests/unit/review-privacy.test.ts` (104 L) | #282 §3-B object-scoped detail access, 5 cases: MANAGER non-participant 403 (72); HR_ADMIN any (78); MANAGER of own report (84); subject redacted (90); reviewer unredacted (98) | Mocks `$lib/server/services/performance` with EXACTLY `getReview, redactHrAuthored, saveSelfAssessment, submitManagerReview, acknowledgeReview` (29–35). **Changing the module's export list breaks the import.** Reusable `vi.hoisted` + `vi.mock('$lib/server/db')` harness at 17–35. |
| `tests/e2e/form-errors.spec.ts:37–60` | "performance surfaces cycle errors without the goal form being open": asserts `form[action*="createCycle"]` visible (43), blanks `name`, submits, expects `role="alert"` visible (58) | **Hard-coupled to BOTH removals — dies with this revamp.** Must be replaced, not just deleted. |
| `tests/e2e/global-setup.ts:22` | route smoke list includes `/performance` | Survives if `/performance` still loads for the seeded admin. |

Untested today (all of it): 14 of 15 `performance.ts` exports; the whole `+page.server.ts` load and
all 5 actions; all 3 API routes; all 3 detail-page actions; `services/notifications.ts` entirely;
`audit.ts`; both cron scripts' shells.

Specifically NO test asserts: `openReviewsForCycle` idempotency · that it skips employees with no
`reportsToId` · `acknowledgeReview` 400 on non-COMPLETED · `saveSelfAssessment` 409 non-subject ·
`submitManagerReview` 409 non-reviewer · `getReview` cross-org 404 · cycles API requires MANAGE_HR ·
that `/api/v1/performance/reviews` returns `asSubject` unredacted.

## 5. Open design questions RESEARCH could not answer (for SPEC/INNOVATE)

1. **Does `ReviewCycle` survive?** If cycles become derived/implicit, note `PerformanceReview.cycleId`
   is a required non-null FK and BOTH surviving unit tests reference `cycle`. This choice changes
   the schema blast radius substantially.
2. **Does "review text + verdict" replace `selfAssessment` + `managerComments` + `overallRating`,
   or sit alongside them?** The #179 redaction contract (`redactHrAuthored`) is built entirely on
   the `managerComments`/`overallRating` pair. And what IS a "verdict" — an enum
   (e.g. PASS/FAIL, or MEETS/EXCEEDS/BELOW), free text, or the existing 1–5 rating renamed?
3. **Does the self-assessment step survive at all?** "Straight up review and verdict" may mean the
   `SELF_ASSESSMENT` status and the employee-authored field go away, collapsing `ReviewStatus`.
   Renaming/removing enum values needs a `scripts/migrate-*.ts` pre-step (CLAUDE.md).
4. **Is the 2-month interval hard-coded (like `REGULARIZATION_MONTHS`) or per-org configurable
   (like `BackupConfig`)?** Both precedents exist; nothing in the repo decides it.
5. **UTC or Manila basis for cycle boundaries?** The two existing month helpers pick opposite
   bases for stated reasons.
6. **Should the auto-cycle job write an `AuditLog`?** Determines whether it takes the
   `system@veent.ph` dependency (promote-probationary does) or uses the durable domain row as the
   record (backup deliberately does).
7. **Employees with no manager get no review.** Existing silent behaviour. Keep, or surface?
8. **Live data is unknown.** No DB was touched. Row counts in `goals`, `review_cycles`,
   `performance_reviews` on staging/prod are unverified; whether any row holds the dead
   `ReviewStatus.MANAGER_REVIEW` is unknown. The `DROP TABLE goals` step is irreversible.
9. Nothing in-repo calls `/api/v1/performance/goals`; external consumers are unverifiable.

## 6. Standing project rules every downstream agent must obey

From `CLAUDE.md`:
- SvelteKit 2 + Svelte 5 RUNES (`$state`, `$derived`, `$effect`, `$props`) — not Svelte 4 syntax.
- Prisma 5 + PostgreSQL 18, Docker `veent-db-5434`, port 5434 (inside the container too, so
  `docker exec … psql -p 5434`). Env is `.env.dev`; **there is no `.env`**.
- **NEVER start the DB, `./start.sh`, or the dev server — the user does that.** Ask.
- Lucia v3 + `@lucia-auth/adapter-prisma`. Tailwind v3 with HSL tokens in `src/app.css`.
- **pnpm 10, never npm.**
- No Redis.
- Prisma `Decimal` must never be returned raw to the client — `src/hooks.ts` serializes globally.
- Renaming/dropping a Prisma enum value is NOT something `db push` can do; it drops and recreates
  the type. Any existing DB needs `scripts/migrate-*.ts` running `ALTER TYPE … RENAME VALUE` (or
  the drop) BEFORE the push. See `scripts/migrate-employment-type-regular.ts`.
- `{@const}` must be an immediate child of a block tag (`{#if}`, `{#each}`, `{#snippet}`) — never
  inside a plain HTML element.
- Git: **never** add `Co-Authored-By` or any co-author trailer. Concise subject + optional body,
  no attribution footers. Never commit `.env`.

From the user's global rules:
- Simplicity first, surgical changes, strict scope adherence. Every changed line traces to the
  request. Do not fix adjacent code (#323, #324, the unredacted `asSubject`) — report only.
- Emphasis on MODULARITY: pure decidable logic in a testable module, thin IO shell — mirror the
  `backup/plan.ts` + `scripts/backup-documents.ts` split.

---
name: report:performance-eval-bimonthly-178-phase-9
description: "Phase 9 EXECUTE report — items 159-172 (nodemailer + mailer seam, six SMTP_* vars, six send* routed through deliver, buildReviewNotice, the pure reminder planner + 11 tests, the reminders cron shell, crontab + env docs); five mutations RED; four plan defects found"
date: 27-08-26
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-9
---

# Phase 9 — Reminders cron and real SMTP email (#178, items 159-172)

**Status:** COMPLETE. `pnpm test` 2042 passed / 175 files (was 2031 / 173). `pnpm check` 0 errors,
1 pre-existing warning. `pnpm lint` 0 errors. `pnpm exec prettier --check` clean.
Nothing committed, nothing staged, nothing pushed.

## What Was Done

### Email seam (159-163)

- **159** — `pnpm add nodemailer` → **9.0.5**; `pnpm add -D @types/nodemailer` → 8.0.1. pnpm, not npm.
- **160** — `src/lib/server/mailer.ts`, one export: `deliver(to, subject, body): void`.
  Synchronous `void`, never a Promise, so not one existing `send*` call site changed.
  **Never throws:** the only synchronous work is reading `process.env` and a `console.log`;
  everything else is inside a promise chain ending in
  `.catch(e => console.error('[NOTIFY] delivery failed:', e.message))`.
  With no `SMTP_HOST` it logs `[NOTIFY] (no SMTP_HOST — not sent) <to>: subject` and returns —
  logged at `console.log`, not `console.error`, because unconfigured is the supported default,
  not a failure. The transport is built lazily on the first configured send, and **nodemailer is
  loaded by a dynamic `import()`**, so an unconfigured deployment never pulls it into the module
  graph at all. That is the direct defence against the `papaparse` trap (see item 171 below).
- **161** — the six vars, documented in three places: the mailer's header comment, a new
  `scripts/README.md` section "Outbound email — the six `SMTP_*` variables" (table of defaults +
  meaning), and placeholder-only entries in `.env.dev` (local, git-ignored), `.env.dev.example`
  and `.env.prod.example`. **No real secret written anywhere.**
- **162** — all six `send*` now call `deliver`: `sendWelcomeEmail`, `sendDiscordInviteEmail`,
  `sendTimesheetStatusEmail`, `sendLeaveStatusEmail`, `sendInterviewScheduledEmail`,
  `sendOffboardingNoticeEmail`. The three with no `build*` (welcome / timesheet / leave) got a
  minimal inline subject + body.
  **`sendWelcomeEmail` still never puts the password anywhere.** `_tempPassword` is not
  interpolated into the subject, the body or any log line, and an inline comment now says so at
  the point of temptation. The body tells the recipient the password comes from HR out-of-band.
- **163** — `buildReviewNotice(kind, d)` + `sendReviewNoticeEmail(recipient, kind, d)` in
  `notifications.ts`, following the file's stated `build*`-is-tested / `send*`-delivers
  convention. `ReviewNoticeKind` is `'opened' | 'overdue'` **only** — the two in-app-only kinds
  have no wording, so emailing one is a compile error, not a silent send.

### Pure planner (164-166)

- **164** — `src/lib/server/performance/reminder-plan.ts`. No DB, no fs, no network, no
  `Date.now()` — `now` is an argument, exactly as `cycle-plan.ts` does it.
  Manila basis throughout (`manilaDayKey`), because "is it due yet?" is a wall-clock question;
  the header says so and names the #320 contrast with `addUTCMonths`.
  Exports `REMINDER_CHANNELS` (the SPEC AC16 split as one table), `DUE_SOON_DAYS = 3`,
  and `remindersDue`. At most ONE reminder per review per run, chosen by an explicit
  `PRECEDENCE` array `['overdue', 'awaiting-ack', 'due-soon', 'opened']`.
  De-duplication: a review whose `lastReminderKind` already equals the computed kind is skipped.
  An `ACKNOWLEDGED` review is never reminded about.
- **165** — `tests/unit/performance-reminders.test.ts`, 9 cases: one per trigger asserting the
  channels (including explicit `not.toContain('email')` on both in-app-only kinds), the
  ACKNOWLEDGED no-op, the O-7 precedence case, de-duplication, escalation, and a
  Manila-vs-UTC boundary case that fails if `manilaDayKey` is dropped.
- **166** — `tests/unit/review-notice-email.test.ts`, 2 cases, patterned on
  `interview-email.test.ts` / `offboarding-notice.test.ts`.

### Cron shell (167-169)

- **167** — `scripts/send-review-reminders.ts`, thin IO, same shape as
  `generate-review-cycles.ts`: per-org try/catch, one `now` for the whole sweep, `--dry-run`,
  exit 1 if any org failed, **no date arithmetic of its own**. It reuses
  `getPerformanceConfig` (defaults, writes nothing) rather than re-deriving the `dueDays`
  default. Org scoping goes through the **direct `Employee.organizationId` column**
  (`where: { employee: { organizationId } }`), so it is not an 83rd #323 site.
  **No audit row** and therefore no `system@veent.ph` dependency.
  `lastReminderAt` / `lastReminderKind` are written AFTER the fan-out, so a crash mid-send
  resends rather than silently swallowing the reminder.
- **168** — no advisory lock, as re-evaluated in the plan; the reasoning is recorded in the
  script header and in the README.
- **169** — README section for the job (trigger table, `0 */6 * * *` crontab line, the
  **by-hand / `deploy.yml` will not create this** warning matching the existing entries, dry-run
  recipes, why there is no audit row and no lock).

## Test Gate Outcomes

| Gate | Command | Result |
| --- | --- | --- |
| Unit suite | `pnpm test` | **2042 passed / 175 files**, 0 failed (baseline 2031 / 173; +11) |
| Svelte typecheck | `pnpm check` | **0 errors**, 1 warning — pre-existing `CalculatorWindow.svelte:82` a11y |
| Lint | `pnpm lint` | 0 errors, same 1 pre-existing warning |
| Format | `pnpm exec prettier --check` on all touched files | clean |
| Script typecheck (README recipe — `pnpm check` skips `scripts/**`) | `tsc -p tsconfig.scripts.json` | `send-review-reminders.ts` clean. Two **pre-existing, unrelated** errors remain: `scripts/migrate-leave-to-request.ts:80` (`actorId`) and `src/routes/api/v1/timesheets/log/+server.ts:3` (`$env/dynamic/private`) |
| Item 171 — page load after a new prod dependency | curl, see below | `/performance` **200**, `/performance/reviews/{id}` **200**, no SSR error |
| Item 172 — unconfigured dry run | see below | exit 0, no throw |

### Mutation check — five mutations, five RED, one named test each

Reverted each time by copying back a scratchpad backup (`cp`), never `git checkout`. The final
file's md5 matches the pre-mutation backup byte for byte.

| # | Mutation | Test that went RED |
| --- | --- | --- |
| M1 | removed `if (r.lastReminderKind === kind) continue` | `de-duplication and escalation > does not resend the same kind twice in a row` |
| M2 | `overdue: ['in-app', 'email']` → `['in-app']` | `trigger points and channels (SPEC AC16) > a review past its due day reminds "overdue" in-app AND by email` |
| M3 | `'due-soon': ['in-app']` → `['in-app', 'email']` | `... > a review inside the due-soon window reminds "due-soon" in-app ONLY — no email` |
| M4 | `PRECEDENCE` reversed to `['awaiting-ack', 'overdue', ...]` | `one reminder per review per run > sends only the most urgent kind when a review is both overdue and awaiting acknowledgement` |
| M5 | `manilaDayKey` replaced with a UTC `toISOString().slice(0,10)` | `Manila basis (#320 trap) > uses the Manila calendar day, not the UTC day, to decide "overdue"` |

Each run: `Tests 1 failed | 8 passed (9)`. After the last restore: `9 passed (9)`.

### Item 171 — curl, not a browser

**The Playwright browser was closed, so this was done with `curl` against the user's running dev
server on :5173, not in a real browser.** The dev server was not started, restarted or killed by
me; it answered 200 before and after `pnpm check`.

```
POST /api/v1/_dev/login-as {"email":"hr@veent.ph"}      -> {"ok":true}
GET  /performance                                       -> 200
     <title>Performance — Veent HRIS</title>   markers: "Review Cycles", "Templates"
     error markers ("Internal Error" / "Cannot find package" / "<h1>500"): none

POST /api/v1/_dev/login-as {"email":"manager@jojo.ph"}  -> {"ok":true}
GET  /performance/reviews/cmtb3meh600051458t2zwrn28     -> 200
     <title>Performance Review — Veent HRIS</title>   markers: "Performance Review", "Carla"
     error markers: none
```

The first two review ids I tried returned 404 as `hr@veent.ph` — that is the route's access
guard doing its job, not a defect; the 200 above is from a user who is actually a party to the
review. The assertion is on named DOM content, not merely on a non-empty body.

### Item 172 — the unconfigured path

`--dry-run`, `SMTP_HOST` unset, exit 0, no throw:

```
  org org_jojo: DRY RUN — review cmtb3meh500031458twaue3ul "Jun–Jul 2026": opened via in-app+email to dino@jojo.ph
  org org_jojo: DRY RUN — review cmtb3meh600041458qik3z6b8 "Jun–Jul 2026": opened via in-app+email to benjie@jojo.ph
  org org_jojo: DRY RUN — review cmtb3meh600051458t2zwrn28 "Jun–Jul 2026": opened via in-app+email to carla@jojo.ph
  org org_jojo: 3 reminder(s) planned (3 open review(s))
  org org_seed: nothing due (0 open review(s))
  org org_sweetleaf: DRY RUN — review cmtb3meji000k14583ss0rgs0 "Jun–Jul 2026": opened via in-app+email to ella@sweetleaf.ph
  org org_sweetleaf: DRY RUN — review cmtb3meji000j14585yb8lnu6 "Jun–Jul 2026": opened via in-app+email to fritz@sweetleaf.ph
  org org_sweetleaf: 2 reminder(s) planned (2 open review(s))

Done — 0 sent (dry run).
```

A dry run sends nothing, so it prints **no** `[NOTIFY]` lines — see plan defect **D4** below.
The fallback was proven two other ways instead.

**(a) A real run** against the local dev database (`SMTP_HOST` still unset), exit 0:

```
[NOTIFY] (no SMTP_HOST — not sent) <dino@jojo.ph>: Performance review open — Jun–Jul 2026
[NOTIFY] (no SMTP_HOST — not sent) <benjie@jojo.ph>: Performance review open — Jun–Jul 2026
[NOTIFY] (no SMTP_HOST — not sent) <carla@jojo.ph>: Performance review open — Jun–Jul 2026
  org org_jojo: 3 reminder(s) sent (3 open review(s))
  org org_seed: nothing due (0 open review(s))
[NOTIFY] (no SMTP_HOST — not sent) <ella@sweetleaf.ph>: Performance review open — Jun–Jul 2026
[NOTIFY] (no SMTP_HOST — not sent) <fritz@sweetleaf.ph>: Performance review open — Jun–Jul 2026
  org org_sweetleaf: 2 reminder(s) sent (2 open review(s))

Done — 5 review(s) reminded.
```

Immediately re-running it printed `nothing due` for every org and `Done — 0 review(s) reminded.`
— **de-duplication proven live**, not only in a unit test. The dev DB now holds
`lastReminderKind = 'opened'` on 5 reviews and 5 new `PERFORMANCE` notifications. This is a
local dev-database side effect; it is self-limiting (the next run sends nothing) and reversible
with one `UPDATE ... SET "lastReminderKind" = NULL`.

**(b) A standalone probe** of `deliver` in both states, exit 0:

```
--- unconfigured (SMTP_HOST unset) ---
[NOTIFY] (no SMTP_HOST — not sent) <someone@example.com>: Performance review open — Aug–Sep 2026
--- misconfigured (SMTP_HOST points nowhere) ---
deliver() returned; process still alive — it did not throw
[NOTIFY] delivery failed: getaddrinfo ENOTFOUND smtp.invalid.example
```

The misconfigured case is the important one: `deliver` returned **before** the failure surfaced,
and the failure arrived as a logged `[NOTIFY] delivery failed:` line, never as a thrown error.

## What The Plan Got Wrong

The plan has been wrong repeatedly in this issue, and Phase 9 is no exception. Four defects and
two unspecified decisions.

- **D1 — item 164's declared return type contradicts item 164's own requirement.** The signature
  in the plan returns `{reviewId: string; kind: ReminderKind}[]`, with no channels. Two lines
  later the same item says "the channel decision lives in this pure module … so it is
  unit-testable", and item 165 requires tests "each asserting **which channels fire**". A
  `{reviewId, kind}` return makes that impossible without re-deriving the split in the test,
  which would prove nothing. **Resolved:** the return type is
  `{reviewId, kind, channels: readonly ReminderChannel[]}`, sourced from an exported
  `REMINDER_CHANNELS` table. The shell obeys `channels`; it never re-decides.
- **D2 — item 164 never defines the `due-soon` window.** `cfg` carries only `dueDays`, and
  nothing in the plan or the SPEC says how many days before the due day counts as "soon".
  **Resolved:** an exported `DUE_SOON_DAYS = 3` constant in the planner, not a new
  `PerformanceConfig` column — a second cadence knob nobody asked for is a setting HR would have
  to understand. Documented in the README's trigger table. Change it in one place if 3 is wrong.
- **D3 — item 164's input type lists `lastReminderAt`, which the planner never reads.**
  De-duplication is by `lastReminderKind` alone (item 164 says so explicitly). The field is kept
  in `RemindableReview` because the plan names it and the shell selects it anyway, but no logic
  depends on it. Harmless, worth knowing.
- **D4 — item 172 is self-contradictory and cannot be satisfied as written.** It asks for
  `--dry-run` to "print the `[NOTIFY]` fallback lines". A dry run does not send, so it emits no
  `[NOTIFY]` lines by construction — the only way to make it print them would be to send email
  during a dry run, which would be a much worse bug. **Resolved:** the dry run was verified for
  exit 0 / no throw, and the `[NOTIFY]` fallback was proven by a real run and a direct probe, as
  shown above.
- **U1 — recipients per reminder kind are specified nowhere.** The SPEC's REMINDERS table says
  "overdue -> evaluator and/or employee" and says nothing at all about who receives `due-soon`.
  **Decided in the shell** (not the planner — the plan put only channels in the pure module) as
  a documented `RECIPIENTS` table: `opened` → employee, `due-soon` → evaluator,
  `overdue` → employee **and** evaluator, `awaiting-ack` → employee. It is in the README table
  for the owner to correct.
- **U2 — which reviews the shell loads is unspecified.** Item 167 says only "open reviews per
  org". **Decided:** `status != ACKNOWLEDGED`, with no filter on the cycle's own status, because
  the planner already treats ACKNOWLEDGED as finished and a review in a closed cycle that is
  still unacknowledged is exactly the case a reminder exists for.

## Plan Deviations

- **`.env.dev.example` and `.env.prod.example` were also updated** (placeholders only).
  Item 161 names `.env.dev` and `scripts/README.md`. `.env.dev` is git-ignored (`.gitignore:9`
  `.env.*`), so following item 161 to the letter would commit the six variables' names in prose
  only. The two `.example` files are this repo's committed convention for a new variable and are
  the files a droplet operator copies. Within the plan's own blast radius (§"`.env.dev` | six
  `SMTP_*` vars | P9"), no secret value written.
- **`getPerformanceConfig` is reused** instead of a hand-rolled `findUnique` + a duplicated
  `dueDays: 14` default. Shorter, and it cannot drift from the schema default.
- **TDD ordering:** the implementation for items 164/163 was written before its test file rather
  than red-first. The five-mutation check above is the compensating proof that the tests bind to
  the behaviour; every one of them went RED on a one-line change and named exactly one test.

## Concerns

- **C1 — the `opened` reminder partly duplicates the cycle generator's notification.**
  `generate-review-cycles.ts` already calls `notify(...)` for every employee when the cycle is
  created. On the first reminder tick after that, `remindersDue` returns `opened` and the
  employee gets a second in-app notification (plus the email, which is genuinely new — the
  generator sends no email). This is what the SPEC's REMINDERS table asks for
  ("review opens -> employee -- in-app + email"), so I implemented it as specified and did not
  invent a suppression rule. If the owner finds the double in-app notification noisy, the fix is
  one line: drop `'opened'` from `PRECEDENCE`, or have the generator stamp
  `lastReminderKind = 'opened'` on the reviews it creates — the de-duplication guard would then
  swallow it automatically. **This is the cleaner fix and is worth considering before merge.**
- **C2 — real SMTP deliverability is still unproven.** Unchanged known gap; it needs
  user-supplied credentials (plan O-6, §11.4 backlog stub). The unconfigured and the
  connection-failure paths are both proven; a successful send to a real inbox is not.
- **C3 — item 171 was done with curl, not a browser.** The assertions are on real DOM markers
  and both pages returned 200 with no SSR error, but a curl 200 does not exercise client-side
  hydration. The dynamic `import('nodemailer')` means nodemailer is not in the SSR module graph
  unless a send actually happens, which is a stronger structural guarantee than the page load
  itself; even so, a browser pass is worth doing before merge.

## Test Infra Gaps Found

- `pnpm check` still does not cover `scripts/**` (#282). The new script was type-checked by hand
  with the README recipe. Two pre-existing errors surface in that recipe and are not mine:
  `scripts/migrate-leave-to-request.ts:80` and
  `src/routes/api/v1/timesheets/log/+server.ts:3`.

## Closeout Packet

- **Selected plan:** `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md`
- **Finished:** items 159-172, all of Phase 9.
- **Verified:** four CI gates green; 5 mutations RED then restored; both pages 200 via curl; the
  script's dry run, real run, de-duplication and unconfigured-email path all exercised live.
- **Unverified:** real SMTP deliverability (C2); a real-browser page load (C3).
- **Remaining:** owner decision on C1; commit (nothing is staged); UPDATE PROCESS.
- **State:** `Keep in active/testing` — the code is complete and gated, but C1 is an open design
  question and C2/C3 are unclosed verification.

## Forward Preview

- **Test infra found:** `tests/unit/performance-reminders.test.ts` (9) and
  `tests/unit/review-notice-email.test.ts` (2) are new; suite is 2042 / 175 files.
- **Blast radius changes:** new `src/lib/server/mailer.ts`,
  `src/lib/server/performance/reminder-plan.ts`, `scripts/send-review-reminders.ts`; modified
  `src/lib/server/notifications.ts`, `scripts/README.md`, `.env.dev.example`,
  `.env.prod.example`, `package.json`, `pnpm-lock.yaml`; local-only `.env.dev`.
  **Every outbound email in the app now flows through `deliver`** — a change to
  `mailer.ts` reaches onboarding, timesheets, leave, recruitment, offboarding and performance.
- **Commands to stay green:** `pnpm test` · `pnpm check` · `pnpm lint` ·
  `pnpm exec prettier --check .`
- **Dependency changes:** `nodemailer@9.0.5` (production, first prod dep added since
  `papaparse`), `@types/nodemailer@8.0.1` (dev).

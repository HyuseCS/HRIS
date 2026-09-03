---
name: plan:performance-eval-bimonthly-178
description: "COMPLEX plan — configurable performance-evaluation template system (#178): Goals removal, JSON template storage + HR builder, snapshot-on-open, capture-only fill-in (NO scoring engine), sequential sign-off, HR release gate, per-org cadence cron, reminders + real SMTP email"
date: 25-08-26
feature: performance-eval-bimonthly-178
---

# PLAN — Performance Evaluation, Bi-Monthly (#178)

| | |
|---|---|
| **Date** | 25-08-26 |
| **Status** | VALIDATED CONDITIONAL (2026-08-26), §20 fixes applied — not started; O-1 still gates item 43 |
| **Complexity** | COMPLEX (9 phases) |
| **Feature** | performance-eval-bimonthly-178 |
| **Issue** | #178 |
| **Branch** | `feat/performance-eval-bimonthly-178` (tip `db04eb6`, 0 ahead of `origin/staging`) |
| **SPEC** | `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_SPEC_25-08-26.md` (LOCKED, Open Questions empty) |
| **Research** | `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/research-findings_REF_25-08-26.md` |
| **Context loaded** | `process/context/all-context.md` router → `process/context/tests/all-tests.md` (full chain; its Quick Routing states no deeper test docs exist yet) |
| **Primary execute anchor** | this file — `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md`. There are **no supporting phase files**: all nine phases live in this single artifact, and EXECUTE receives this one path. The §Implementation Checklist item numbers (1–172) are the resume index. |

---

**TL;DR** — Nine phases. Phase 1 deletes Goals (30 sites, self-contained, shippable alone).
Phase 2 lands every schema change in ONE migrate-then-push. Phases 3–9 build the template
system on top. **The app does no arithmetic on scores — there is no scoring engine and none
may be built.** Phases 6 and 8 must ship together or the employee sees their own ratings.

---

## 0. THE MOST IMPORTANT RULE IN THIS PLAN

**The app performs NO arithmetic on evaluation scores.**

HR calculates outside the app. The app captures, validates the range, stores, and renders back.

| Value | How it is produced | The app's job |
|---|---|---|
| criterion rating (1–5) | evaluator **types** it | store verbatim; reject if outside the template's declared scale |
| section subtotal | evaluator **types** it | store verbatim; reject if it exceeds the section's declared maximum |
| overall total | evaluator **types** it | store verbatim; reject if it exceeds the template's declared ceiling (100) |
| interpretation band | evaluator **picks** it from a list | store the chosen id verbatim |

**Forbidden, permanently:** any function, service, route, or component that sums criterion
ratings into a subtotal, weights subtotals into a total, or derives a band from a total.
`src/lib/server/performance/scoring.ts` **must not exist**. INNOVATE proposed a
`computeScore(template, answers)` module — that proposal is **rejected by the SPEC** (SPEC
"Out Of Scope", "Constraints", acceptance criterion 4). Phase 6 ships a structural grep gate
whose only job is to catch a later reader rebuilding it.

**Configurable ≠ computed.** A template's section weights (`"35%"`), section maxima (`30`),
and interpretation-band ranges (`"95-100"`) are **configuration that the form prints**, and —
for the maxima and the ceiling only — **bounds that a range validator reads**. Range validation
is not calculation: it compares one typed number against one stored bound and returns
accept/reject. It never produces a score.

**Validation is not calculation, and it stays** (SPEC AC5). Without it, `150/100` lands
permanently on an HR record.

**Ints, not Decimals.** `sectionSubtotals` and `totalScore` are whole numbers. This feature
therefore never touches the `Decimal` transport hook in `src/hooks.ts`. Do not add a
`Decimal` anywhere in this feature.

---

## Overview

### Goals

1. Delete the Goals feature entirely — UI, service exports, API route, Prisma model + enum, table.
2. Turn "the performance form" into **stored data**: an HR-authored template made of sections,
   criteria, a rating scale, printed labels, narrative blocks, a recommendation checklist, and an
   ordered signatory list. Adding a third template next year is zero code changes.
3. Assign a template to each employee by an **explicit HR-set field** — never inferred.
4. Generate review cycles automatically on a **per-organization cadence** (default 2 months),
   snapshotting the template into each review at open time.
5. Capture — never compute — evaluator entries, validated for range.
6. Enforce **sequential, server-side** multi-party sign-off driven by the template's ordered list.
7. Withhold every evaluator/HR-authored entry from the employee until an explicit HR **RELEASE**.
8. Remind by in-app notification, plus **real email** (built at the existing `send*` seam).

### Non-Goals (report only, do not touch)

| Item | Why not here |
|---|---|
| #323 — `where:{ user:{ organizationId } }` join-shaped org scoping in `openReviewsForCycle:210` | pre-existing repo-wide pattern; SPEC "Out Of Scope". **New code in this plan must use the direct `Employee.organizationId` column** so we do not add a 83rd site. |
| #324 — audit writes outside `$transaction` (all 8 sites in `performance.ts`: 30, 107, 139, 164, 187, 229, 280, 310) | pre-existing repo-wide pattern. **New code in this plan passes `tx` as `writeAuditLog`'s third arg** where a transaction already exists. Do not retrofit the 8. |
| Print / PDF export | v2, owner-deferred |
| Calendar / ICS | owner-rejected |
| Drawn signatures | owner-settled: typed name + timestamp only |
| Live email deliverability proof | needs user-supplied SMTP credentials |

### Complexity

**COMPLEX** — 9 phases, ~55 files, schema migration with two irreversible steps, an auth/redaction
surface, and two new cron jobs.

---

## 2. Phase Breakdown and Dependency Validation

INNOVATE proposed: Goals removal → template storage + builder → cadence cron + snapshot-on-open →
fill-in/capture → sequential sign-off → redaction/release gate → reminders + email.

**Three corrections to that ordering, each with a reason:**

**Correction 1 — all schema work is pulled into ONE phase (new Phase 2), before the builder.**
INNOVATE's order implies four separate `db push` rounds. Every one of them that touches
`ReviewStatus` needs its own `scripts/migrate-*.ts` pre-step (CLAUDE.md), and each push is a
production risk window. Adding `ReviewSignoff` in Phase 2 while it stays unread until Phase 7
costs one unused table; running four migrations instead of two costs four chances to lose data.
Phase 2 lands every new model, column, enum change, and constraint in one migrate-then-push.
(The Goals **drop** stays separate in Phase 1 — dropping and adding in the same push is exactly
the kind of coupled change that is hard to roll back.)

**Correction 2 — template ASSIGNMENT gets its own phase (new Phase 4), before the cron.**
Cycle generation is meaningless until employees have templates. INNOVATE folded assignment into
"template storage + builder"; separating it makes the backfill — which is real, manual, per-employee
work for HR — a named deliverable with its own verification, per SPEC's "one-time backfill pass".

**Correction 3 — the redaction gate is NOT a late phase. It is welded to the capture phase.**
This is the one genuine ordering defect in INNOVATE's list. The moment Phase 6 adds
`PerformanceReview.answers`, the subject's own page load and `/api/v1/performance/reviews` will
return every rating and remark, because today's `redactHrAuthored` only nulls `managerComments`
and `overallRating`. Shipping Phase 6 without Phase 8 opens a live leak. **Phase 6 must extend
`redactHrAuthored` to null `answers` unconditionally as part of its own work** (2 lines), and
**Phase 8 upgrades that unconditional null into the release-gated version.** Phases 6 and 8 may
be separate commits but must reach staging in the same deploy.

**Sign-off (7) and release (8) are independent of each other** and may be built in parallel.

### Final phase order

```
┌──────────────────────────────────────────────────────────────────────────┐
│ P1  Goals removal                          SHIPPABLE ALONE  ── no deps   │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│ P2  Schema foundation (one migrate + one push)   SHIPPABLE  ── after P1  │
│     Template · ReviewSignoff · PerformanceConfig · review columns ·      │
│     ReviewStatus rename+add · ReviewCycle @@unique · Employee.assigned·  │
│     Department.headEmployeeId                                            │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 │
┌──────────────────────────────────┐               │
│ P3  Template CRUD + builder UI   │  SHIPPABLE    │
│     + seed AE & Admin Staff      │               │
└──────────────────────────────────┘               │
                 │                                 │
                 ▼                                 │
┌──────────────────────────────────┐               │
│ P4  Template assignment +        │  SHIPPABLE    │
│     backfill readiness count     │               │
└──────────────────────────────────┘               │
                 │                                 │
                 ▼                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ P5  Per-org cadence config + cycle-generation cron + snapshot-on-open    │
│     + unreviewable list                       SHIPPABLE  ── after P4     │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌══════════════════════════════════════════════════════════════════════════┐
║ P6  Capture / fill-in flow (NO SCORING)                                  ║
║     + interim unconditional `answers` redaction                          ║
╚══════════════════════════════════════════════════════════════════════════╝
                 │                                 │
      ┌──────────┴──────────┐                      │
      ▼                     ▼                      │
┌───────────────┐  ┌═══════════════════════════════▼══════════════════════┐
│ P7 Sequential │  ║ P8  Release gate + API-layer redaction               ║
│    sign-off   │  ║     MUST DEPLOY WITH P6 — not after it               ║
│  SHIPPABLE    │  ╚══════════════════════════════════════════════════════╝
└───────────────┘
      │                     │
      └──────────┬──────────┘
                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ P9  Reminders cron + real SMTP email        SHIPPABLE  ── after P5       │
└──────────────────────────────────────────────────────────────────────────┘
```

| Phase | Independently shippable? | Notes |
|---|---|---|
| P1 Goals removal | **Yes** | self-contained; nothing else depends on it except that P2's push follows it |
| P2 Schema | **Yes** | purely additive except the enum rename; no behavior change |
| P3 Template CRUD + builder | **Yes** | templates exist and are editable; nothing consumes them yet |
| P4 Assignment + backfill | **Yes** | a field HR fills; nothing consumes it yet |
| P5 Cadence + cron + snapshot | **Yes** | reviews open with a snapshot; the form renders read-only |
| P6 Capture | **No — must deploy with P8** | see Correction 3 |
| P7 Sign-off | **Yes** (after P6) | parallel-safe with P8 |
| P8 Release gate | **No — must deploy with P6** | see Correction 3 |
| P9 Reminders + email | **Yes** | after P5 |

---

## 3. Prisma Diff — Complete

### 3.1 Phase 1 — removals

```prisma
// DELETE prisma/schema.prisma:262-267
enum GoalStatus { DRAFT ACTIVE COMPLETED CANCELLED }

// DELETE prisma/schema.prisma:1676-1693
model Goal { … @@map("goals") }

// DELETE prisma/schema.prisma:493
  goals                 Goal[]
```

### 3.2 Phase 2 — enum changes

```prisma
// EDIT prisma/schema.prisma:254-260
enum ReviewStatus {
  PENDING
  SELF_ASSESSMENT
  SCORED          // ← RENAMED from MANAGER_REVIEW (dead value, nothing writes it)
  SIGNING         // ← NEW
  COMPLETED
  ACKNOWLEDGED
}
```

`ReviewCycleStatus` (`:248-252`) is **unchanged**. Cycles are still DRAFT/ACTIVE/CLOSED; the
generator creates them directly as `ACTIVE`.

### 3.3 Phase 2 — new models

```prisma
// ─── Performance Evaluation Templates (#178) ─────────────────────────────────

// An HR-authored evaluation form, stored as one JSON document.
//
// JSON rather than a Template→Section→Criterion relational tree because the whole document
// is read and written as a unit, is never queried by its interior, and must be snapshotted
// verbatim onto a review. Precedent in this schema: StatutoryRateConfig.sssTable /
// birTaxTable (:1201, :1205). The cost accepted in exchange: Postgres enforces NOTHING about
// `structure`, so EVERY writer must go through the shared zod schema in
// src/lib/server/performance/schemas.ts. A missed validation here is silent corruption with
// no database backstop.
//
// NOTHING in `structure` is a calculation input. Section weights, section maxima and band
// ranges are what the form PRINTS. `maximum` and `totalCeiling` are additionally read by the
// range VALIDATOR (accept/reject only). No code sums, weights, or derives anything. See #178
// SPEC acceptance criterion 4.
model PerformanceTemplate {
  id             String   @id @default(cuid())
  organizationId String
  name           String   @db.VarChar(200)
  isActive       Boolean  @default(true)
  structure      Json
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization      Organization @relation(fields: [organizationId], references: [id])
  assignedEmployees Employee[]   @relation("AssignedTemplate")

  @@unique([organizationId, name])
  @@index([organizationId, isActive])
  @@map("performance_templates")
}

// One signatory's attestation on one review. THE ONLY relational exception in this feature's
// data model.
//
// Everything else about a review is one-writer-at-a-time and lives in JSON. Sign-off is not:
// four different actors race to attest on the same review, and the sequential rule must be
// enforced against a value two of them may be reading at the same instant. A JSON array on
// PerformanceReview would need read-modify-write, which loses one of two concurrent
// attestations. @@unique([reviewId, slotId]) makes the race a P2002 the service can report,
// not a silently dropped signature.
model ReviewSignoff {
  id               String   @id @default(cuid())
  reviewId         String
  // Matches templateSnapshot.signatoryOrder[].id — NOT a foreign key, because the slot lives
  // inside the snapshot JSON. The snapshot is immutable, so the id is stable for this review's
  // whole life.
  slotId           String
  // Denormalized from the snapshot so a signature renders without re-reading the snapshot.
  roleLabel        String   @db.VarChar(120)
  // Position in the snapshot's signatoryOrder at attest time. Stored for rendering and for
  // ordering the signature block; the turn CHECK still derives from the snapshot, never from
  // this column.
  order            Int
  attestedByUserId String
  typedName        String   @db.VarChar(200)
  attestedAt       DateTime @default(now())

  review       PerformanceReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  attestedBy   User              @relation(fields: [attestedByUserId], references: [id])

  @@unique([reviewId, slotId])
  @@index([reviewId])
  @@map("review_signoffs")
}

// Per-organization review cadence. Mirrors BackupConfig (:994-1013): a row is created lazily
// by the settings page, and its absence means "use the defaults", so the cron never creates
// configuration as a side effect of running.
model PerformanceConfig {
  id             String   @id @default(cuid())
  organizationId String   @unique
  // Master switch. Off → the generator skips this org entirely.
  enabled        Boolean  @default(true)
  // "Every # months". Default 2 = the bi-monthly cadence #178 asks for. Bounded 1-24 at every
  // writer. Changing it NEVER rewrites an existing ReviewCycle row.
  intervalMonths Int      @default(2)
  // Days after a review opens before it counts as overdue. Drives the reminder job only.
  dueDays        Int      @default(14)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("performance_configs")
}
```

### 3.4 Phase 2 — changed models

```prisma
// model ReviewCycle (:1637-1651)
+  // #178: the generator is offered a run by cron and decides for itself whether one is due.
+  // A double-create is prevented at the DATABASE, not by the script's own care — the cheapest
+  // correct option, and the same shape PayrollRun already uses (:1241). Column names are
+  // deliberately left as startDate/endDate rather than renamed to periodStart/periodEnd: a
+  // rename would touch every existing reader and both surviving unit tests for no gain.
+  @@unique([organizationId, startDate, endDate])
+  @@index([organizationId, status])

// model PerformanceReview (:1653-1674)
+  // The template's `structure`, copied verbatim inside the SAME transaction that creates this
+  // review, and NEVER re-read from PerformanceTemplate afterwards. Editing a template, or
+  // reassigning the employee, must not change what a resolved review shows (AC 20). Precedent:
+  // SeparationRecord.preFinalizeState (:1098), also captured inside its own transaction.
+  templateSnapshot   Json?
+  // Kept alongside the snapshot for provenance/reporting only. NEVER read to render the form —
+  // reading it would defeat the snapshot.
+  templateId         String?
+  // Everything the EVALUATOR types or picks, keyed by the snapshot's criterion/section/band ids.
+  // Every value here is stored verbatim; none is derived. Nulled wholesale by the redaction gate
+  // (#178 AC6) — which is exactly why no employee-authored content may ever live in here.
+  answers            Json?
+  // Employee-authored, its OWN column, never inside `answers`. This is the paper form's
+  // "Employee Comments" field and it is ALWAYS visible to the employee. Distinct from
+  // `selfAssessment`, which is the app-only pre-scoring stage.
+  employeeComments   String?  @db.Text
+  // The explicit HR RELEASE (#178 AC7). Null = the employee's view is redacted. Set = released.
+  // Attribution is on the row so the audit trail and the gate cannot disagree.
+  releasedAt         DateTime?
+  releasedByUserId   String?
+  // Reminder de-duplication. The reminder job runs several times a day; without these it would
+  // send the same nudge every run.
+  lastReminderAt     DateTime?
+  lastReminderKind   String?  @db.VarChar(40)
+
+  releasedBy Employee?       @relation("ReviewReleasedBy", fields: [releasedByUserId], references: [id])
+  signoffs   ReviewSignoff[]
+
+  @@index([employeeId])
+  @@index([reviewerId])
+  @@index([status])

// model Employee (:440-500 region)
+  // #178: the template this employee is evaluated with. EXPLICIT and HR-set — never inferred
+  // from department, position, or role (AC 2). Nullable: an unassigned employee lands on the
+  // HR "cannot be reviewed" list with a reason, rather than silently getting a default form.
+  assignedTemplateId       String?
+  assignedTemplate         PerformanceTemplate? @relation("AssignedTemplate", fields: [assignedTemplateId], references: [id])
+  releasedReviews          PerformanceReview[]  @relation("ReviewReleasedBy")
-  goals                    Goal[]                                  ← removed in P1

// model Department (:372-390)
+  // #178: who attests the DEPARTMENT_HEAD signatory slot. Postgres cannot express
+  // "head.departmentId == this department", so the service layer verifies it on write —
+  // the same rule Employee.reportsToId and Employee.branchId already carry (#235).
+  //
+  // WHY THIS COLUMN EXISTS AT ALL: the paper forms require a Department Head signature and
+  // this schema had no way to name one. Without it, EVERY review under either seeded template
+  // would be permanently stalled and SPEC AC12's "resolving the gap unblocks it" case would be
+  // untestable. See §12 Risk R-1.
+  headEmployeeId   String?
+  head             Employee? @relation("DepartmentHead", fields: [headEmployeeId], references: [id])

// model Employee — the back-relation for the above
+  headedDepartments        Department[] @relation("DepartmentHead")

// model User — the back-relation for ReviewSignoff
+  reviewSignoffs           ReviewSignoff[]

// model Organization
+  performanceTemplates     PerformanceTemplate[]
+  performanceConfig        PerformanceConfig?

// enum NotificationKind (:1155-1160)
+  PERFORMANCE
```

### 3.5 Index justification

| Index | Why |
|---|---|
| `PerformanceTemplate @@unique([organizationId, name])` | HR must not create two "Account Executive" templates in one org; also the seed script's upsert key |
| `PerformanceTemplate @@index([organizationId, isActive])` | the builder list and the assignment dropdown both filter on exactly this pair |
| `ReviewSignoff @@unique([reviewId, slotId])` | **the concurrency guard** — two actors racing one slot; one gets P2002 |
| `ReviewSignoff @@index([reviewId])` | every read is "all signoffs for this review" |
| `ReviewCycle @@unique([organizationId, startDate, endDate])` | **the double-create guard** (AC 15) |
| `ReviewCycle @@index([organizationId, status])` | the generator asks "does this org have an open cycle" every run |
| `PerformanceReview @@index([employeeId])` / `([reviewerId])` | both exist as unindexed `findMany` filters today (digest §1); the reminder job scans both |
| `PerformanceReview @@index([status])` | the reminder job and the stalled-sign-off view both filter by status across the org |
| `PerformanceConfig @@unique organizationId` | one config per org, same as `BackupConfig:996` |

### 3.6 Migration scripts and their exact order

**Two scripts, run at two different times. Never combine them.**

**Script A — `scripts/migrate-drop-goals.ts` (Phase 1, BEFORE the Phase 1 push)**

```
pnpm exec dotenv -e .env.dev -- tsx scripts/migrate-drop-goals.ts
pnpm db:push
```

Modelled on `scripts/migrate-employment-type-regular.ts`. Must:
1. Print `select count(*) from goals` and **refuse to continue without `--confirm`** if the
   count is > 0 (see §13 Rollback — this is irreversible).
2. `DROP TABLE IF EXISTS goals;`
3. `DROP TYPE IF EXISTS "GoalStatus";`
4. Be **idempotent** — a fresh database that has never been pushed to must hit a no-op path and
   `return`, not throw, exactly like `migrate-employment-type-regular.ts:34-37`. The deploy `&&`
   chain stops otherwise and the app never starts.
5. **Not** touch `audit_logs`. Rows with `entityType='Goal'` are not FK-linked
   (`schema.prisma:1676-1693` has no audit relation) and must survive.

**Script B — `scripts/migrate-review-status-scored.ts` (Phase 2, BEFORE the Phase 2 push)**

```
pnpm exec dotenv -e .env.dev -- tsx scripts/migrate-review-status-scored.ts
pnpm db:push
```

Must:
1. Query `pg_enum` for `ReviewStatus` exactly as `migrate-employment-type-regular.ts:18-28` does.
2. Type absent → log and `return` (fresh DB path).
3. `SCORED` present and `MANAGER_REVIEW` absent → already migrated, `return`.
4. Both present → `UPDATE performance_reviews SET status='SCORED' WHERE status='MANAGER_REVIEW'`
   via `$executeRawUnsafe` (the generated client no longer knows `MANAGER_REVIEW`), leave the
   orphaned value, log it.
5. Normal path → `ALTER TYPE "ReviewStatus" RENAME VALUE 'MANAGER_REVIEW' TO 'SCORED'`.
6. **Before renaming, count rows holding `MANAGER_REVIEW` and print it.** Research says nothing
   writes it (digest §1) but no database was inspected (digest §5 item 8). The rename preserves
   rows either way; the count is the evidence that the "dead value" claim was true.
7. `SIGNING` is a pure addition — `db push` adds it with no script help.

**Order across the whole plan:**

```
P1: migrate-drop-goals.ts  →  pnpm db:push  →  pnpm test  →  commit
P2: migrate-review-status-scored.ts  →  pnpm db:push  →  pnpm test  →  commit
P3..P9: no further schema changes, no further pushes
```

`pnpm check` does **not** cover `scripts/**` (all-tests.md "Known Gaps"; #282 shipped a broken
site on that assumption). Both scripts get a manual `--dry-run`-style read-only pass before the
real run. See §11.

---

## 4. The JSON Shapes — the contract everything depends on

These three shapes are the load-bearing contract of the whole feature. Every field is listed.
`version` is present on all three so a future shape change can be detected rather than guessed at.

### 4.1 `PerformanceTemplate.structure`

```jsonc
{
  "version": 1,

  // The 1-5 scale. `min`/`max` are the ONLY numbers the criterion-rating validator reads.
  // `rows` is what the form prints above the sections.
  "ratingScale": {
    "min": 1,
    "max": 5,
    "rows": [
      { "value": 5, "description": "Outstanding - Consistently exceeds expectations" },
      { "value": 4, "description": "Very Good - Frequently exceeds expectations" },
      { "value": 3, "description": "Satisfactory - Meets expectations" },
      { "value": 2, "description": "Needs improvement - Occasionally falls short" },
      { "value": 1, "description": "Unsatisfactory - Consistently below expectations" }
    ]
  },

  "sections": [
    {
      "id": "sec_a1b2c3",              // stable cuid-like id, generated once at creation,
                                        // NEVER regenerated on edit — answers key off it
      "name": "SALES PERFORMANCE",
      "weightLabel": "35%",            // PRINTED ONLY. No code reads this as a number. Ever.
      "maximum": 30,                   // Int|null. Read ONLY by the subtotal range validator.
                                        // null = this section prints no subtotal line and
                                        // captures no subtotal (AE Section 3's case).
      "criteria": [
        { "id": "crit_d4e5f6", "text": "Achieves monthly sales target" }
      ]
    }
  ],

  // PRINTED ONLY, plus the id list the evaluator picks from. `rangeLabel` is free text —
  // nothing parses it, because nothing derives a band.
  "interpretationBands": [
    { "id": "band_1", "rangeLabel": "95-100", "label": "Outstanding" },
    { "id": "band_6", "rangeLabel": "Below 75", "label": "Unsatisfactory" }
  ],

  // Int. Read ONLY by the total range validator. Printed as "Total Score: ___ / 100".
  "totalCeiling": 100,

  // Free-text blocks the EVALUATOR fills. Order is render order.
  "narrativeBlocks": [
    { "id": "nb_strengths", "label": "Strengths" },
    { "id": "nb_improve",   "label": "Areas for Improvement" },
    { "id": "nb_devplan",   "label": "Development Plan" }
  ],

  // The checklist. `allowsFreeText: true` renders the "Other: ____" companion input.
  "recommendationOptions": [
    { "id": "rec_regular",  "label": "Regularization",                        "allowsFreeText": false },
    { "id": "rec_other",    "label": "Other",                                 "allowsFreeText": true  }
  ],

  // Optional. Present on Admin Staff, absent on AE. `target` is a free-text label
  // ("100%", "Within 24 hours") — never a number, never compared to anything.
  "kpiRows": [
    { "id": "kpi_1", "indicator": "Employee document completion", "target": "100%" }
  ],

  // ORDERED. Index 0 signs first. This IS the sequential rule's source of truth.
  "signatoryOrder": [
    { "id": "sig_1", "role": "IMMEDIATE_SUPERVISOR", "label": "Immediate Supervisor" },
    { "id": "sig_2", "role": "HR_REPRESENTATIVE",    "label": "HR Representative" },
    { "id": "sig_3", "role": "DEPARTMENT_HEAD",      "label": "Department Head" },
    { "id": "sig_4", "role": "EMPLOYEE",             "label": "Employee" }
  ]
}
```

`role` is one of exactly four values — `EMPLOYEE`, `IMMEDIATE_SUPERVISOR`, `HR_REPRESENTATIVE`,
`DEPARTMENT_HEAD` — as a **TypeScript union validated by zod**, not a Prisma enum. It lives
inside JSON; a Prisma enum could not constrain it and would only add a migration.

**Id stability rule (write this as a comment in the builder's update action):** section, criterion,
band, narrative, recommendation, kpi and signatory ids are generated **once, at first save**, and
carried through every subsequent edit. Regenerating an id on edit would orphan every answer keyed
to it in every already-open review that snapshotted the old id. The builder's client sends ids back
with each row; a row arriving with no id is a NEW row and gets one.

### 4.2 `PerformanceReview.answers`

```jsonc
{
  "version": 1,

  // Keyed by templateSnapshot criterion id. `rating` is TYPED by the evaluator, validated
  // against ratingScale.min/max, and stored verbatim.
  "criteria": {
    "crit_d4e5f6": { "rating": 4, "remark": "Hit target in 5 of 6 months." }
  },

  // Keyed by templateSnapshot section id. TYPED by the evaluator. Validated against that
  // section's `maximum`. NOT summed from `criteria` — never, by anything.
  "sectionSubtotals": { "sec_a1b2c3": 26 },

  // TYPED by the evaluator. Validated against `totalCeiling`. NOT derived from the subtotals.
  "totalScore": 88,

  // PICKED by the evaluator from interpretationBands. NOT looked up from totalScore.
  "interpretationBandId": "band_3",

  // Keyed by narrativeBlocks id. Evaluator-authored.
  "narratives": { "nb_strengths": "…", "nb_improve": "…", "nb_devplan": "…" },

  // Ids from recommendationOptions. Multi-select — the paper form is a checklist, not a radio.
  "recommendationIds": ["rec_regular", "rec_other"],
  // Only meaningful when a selected option has allowsFreeText.
  "recommendationOther": "Lateral move to Enterprise Sales",

  // Keyed by kpiRows id. Free text, TYPED. Never compared to `target`.
  "kpiActuals": { "kpi_1": "98%" }
}
```

**The redaction rule this shape exists to make safe:** `answers` contains **only**
evaluator/HR-authored content. Every employee-authored field — `selfAssessment` and
`employeeComments` — is a separate Prisma column. Redaction is therefore the single operation
`answers = null`, with no field-picking inside JSON and no way to leak one field by forgetting it.
**Never put employee-authored content inside `answers`.** Write that as a comment above the schema.

### 4.3 `PerformanceReview.templateSnapshot`

```jsonc
{
  "version": 1,
  "templateId": "tmpl_xxx",
  "templateName": "Account Executive",
  "snapshotAt": "2026-08-01T00:00:00.000Z",
  "structure": { /* verbatim byte-for-byte copy of PerformanceTemplate.structure */ }
}
```

Written **inside** the same `$transaction` that creates the review. Read on every render.
**Never refreshed.** No code path may write `templateSnapshot` on an existing review.

---

## 5. Zod Schemas — every write boundary

All schemas live in **one** module: `src/lib/server/performance/schemas.ts`. Pure, no DB import,
unit-testable. This is the accepted price of the JSON design: **Postgres validates nothing here**,
so a write path that skips its schema is a silent-corruption hole with no backstop.

| # | Write boundary | File | Schema used |
|---|---|---|---|
| 1 | HR creates a template | `/performance/templates/+page.server.ts` → `createTemplate` | `templateStructureSchema` + `templateMetaSchema` |
| 2 | HR edits a template | `/performance/templates/[id]/+page.server.ts` → `updateTemplate` | `templateStructureSchema` + `templateMetaSchema` |
| 3 | Seed script writes AE / Admin Staff | `prisma/seed-performance-templates.ts` | `templateStructureSchema` (**yes, the seed validates too** — a bad seed is the likeliest source of a malformed structure) |
| 4 | Snapshot write at cycle open | `src/lib/server/services/performance.ts` → `openReviewsForCycle` | `templateStructureSchema.safeParse` — an invalid structure means that employee lands on the unreviewable list with reason `template-invalid`, never a broken review |
| 5 | Employee self-assessment | `/performance/reviews/[id]/+page.server.ts` → `saveSelf` | `selfAssessmentSchema` |
| 6 | Evaluator scoring submit | `/performance/reviews/[id]/+page.server.ts` → `submitScores` | `answersSchemaFor(snapshot)` — **factory**, see below |
| 7 | Employee comments | `/performance/reviews/[id]/+page.server.ts` → `saveEmployeeComments` | `employeeCommentsSchema` |
| 8 | Signatory attests | `/performance/reviews/[id]/+page.server.ts` → `attest` | `signoffSchema` |
| 9 | HR release | `/performance/reviews/[id]/+page.server.ts` → `release` | `releaseSchema` |
| 10 | Assign a template to an employee | `/employees/[id]/+page.server.ts` → `assignTemplate` | `assignTemplateSchema` |
| 11 | HR edits cadence | `/settings/performance/+page.server.ts` → `saveConfig` | `performanceConfigSchema` |
| 12 | API: template list/create | `/api/v1/performance/templates/+server.ts` | same as #1 |
| 13 | Render-time defensive read | every load that reads a snapshot | `templateStructureSchema.safeParse` — a failed parse renders an error banner, never a half-form |

**The factory — this is the only non-obvious one:**

```ts
// answersSchemaFor(snapshot) builds a zod schema BOUND to one review's snapshot. It is the
// only place the "validate but never calculate" line is enforced, and it must not be
// duplicated at any call site.
//
// It enforces exactly four things:
//   1. every criterion key exists in the snapshot (unknown key → reject)
//   2. each rating is an integer within [ratingScale.min, ratingScale.max]
//   3. each section subtotal is a non-negative integer <= that section's `maximum`
//      (a section with maximum === null accepts NO subtotal at all)
//   4. totalScore is a non-negative integer <= structure.totalCeiling
// and that interpretationBandId / recommendationIds / narrative keys / kpi keys all exist in
// the snapshot.
//
// It DOES NOT and MUST NOT: sum criteria, compare a subtotal to the sum of its criteria,
// compare the total to the sum of the subtotals, or check that the picked band matches the
// typed total. HR calculates; a mismatch is HR's number to own, not the app's to reject.
export function answersSchemaFor(structure: TemplateStructure): ZodType<Answers>
```

That last paragraph is the single most likely thing for a later reader to "helpfully" add.
It must be present verbatim as a comment in the source.

**Ints everywhere** — `z.coerce.number().int()` for rating, subtotal, total. No `Decimal`,
no `.multipleOf(0.5)`, nothing that opens the door to fractions.

---

## 6. RBAC per new surface

**Standing warning (`src/lib/rbac.ts:30-33`):** `MANAGE_HR` **includes `MANAGER`** (#133 made
managers on-branch HR). It must never be read as "may reach any employee record".
`ADMINISTER_HR_ORGWIDE` (`:36`) is the capability that actually excludes MANAGER.

| Surface | Capability / rule | Where the guard goes |
|---|---|---|
| `/performance/templates` list + create | `ADMINISTER_HR_ORGWIDE` | **in `load`** and **on each entry in the `actions` export** — one `requireAnyCapability` line per action, not a shared helper the next action can forget |
| `/performance/templates/[id]` edit / archive | `ADMINISTER_HR_ORGWIDE` | same, plus the service re-checks `template.organizationId === user.organizationId` |
| `/api/v1/performance/templates` GET / POST | 401 + `ADMINISTER_HR_ORGWIDE` | top of each handler, mirroring `api/v1/performance/cycles/+server.ts:9,:22` |
| Assign template on `/employees/[id]` | `ADMINISTER_HR_ORGWIDE` **and** `assertCanTouchEmployee(user, employeeId)` | the `assignTemplate` action. Capability alone is not enough — it is a per-employee write |
| `/settings/performance` cadence | `ADMINISTER_HR_ORGWIDE` | `load` + `saveConfig` action |
| HR "unreviewable this cycle" list | `ADMINISTER_HR_ORGWIDE` | `/performance` load, behind the flag; org-wide data |
| HR "stalled sign-off" list | `ADMINISTER_HR_ORGWIDE` | same |
| HR backfill-readiness count | `ADMINISTER_HR_ORGWIDE` | same |
| **RELEASE** action | `ADMINISTER_HR_ORGWIDE` | `/performance/reviews/[id]` `actions.release`. **Not `MANAGE_HR`** — an employee's own manager must not be able to release their review |
| Evaluator scoring submit | **object-scoped**: `review.reviewerId === myEmployeeId` → else 409 | in the service (`submitScores`), matching today's `submitManagerReview:125` |
| Self-assessment / employee comments | **object-scoped**: `review.employeeId === myEmployeeId` → else 409 | in the service, matching `saveSelfAssessment:94` |
| Attest a signatory slot | **object-scoped**, resolved per slot — see §7.3 | in the service (`attestSignoff`) |
| Review detail page read | unchanged: participant, else `assertCanTouchEmployee` (#282 §3-B) | `reviews/[id]/+page.server.ts:31` — **do not weaken** |
| `/performance` page load | unchanged: no capability guard, any authed user; branches on flags | `+page.server.ts:22-25` |

**Where guards live, stated once:** every SvelteKit `actions` entry carries its own
`requireAnyCapability(...)` as its **first statement**, before any `formData()` read. This
matches `createCycle:135`, `setCycleStatus:154`, `openReviews:175` today. Do not introduce a
wrapper — #290's VALIDATE round wasted a cycle because a reviewer read the handler body instead
of the `actions` export; keeping the guard as a literal first line in each action is what makes
that reading correct.

---

## Phase Completion Rules

A phase is `CODE DONE` when every checklist item in it is applied. A phase is **`✅ VERIFIED`
only** when all of the following hold — code-only completion is never `VERIFIED`:

1. every **Fully-Automated** gate for that phase's areas (§Test Plan by Tier) exits 0;
2. every **Hybrid** gate for that phase has been run against the user's running database and
   its outcome recorded, or its precondition is documented as unmet with a named blocker;
3. every **Agent-Probe** scenario for that phase has a recorded judgement (screenshot, log, or
   psql output — not an assertion alone);
4. the phase's **mutation checks** (§Test Plan by Tier 11.2) were actually run and each went
   red as predicted — a mutation check written but not run is a hypothesis, not evidence;
5. a **regression check** against every earlier verified phase whose blast radius overlaps this
   one passed — at minimum `pnpm test` plus `pnpm check` after `pnpm prisma generate`;
6. `pnpm lint` and `pnpm format:check` are green;
7. the phase's changes are committed via a logical commit **before** the next phase starts —
   a stale worktree makes the next phase's regression check meaningless. **No `Co-Authored-By`
   or any co-author trailer.**

Additional per-phase gates:

| Phase | Extra condition for `✅ VERIFIED` |
|---|---|
| P1 | the `rg -in "\bgoal" src/ prisma/ scripts/ tests/` structural gate returns zero, and the `entityType='Goal'` audit-row count is unchanged pre/post |
| P2 | open risk **O-1** is closed (three SQL counts) and **O-2**'s duplicate-cycle query returns zero rows, both **before** the push |
| P5 | a `--dry-run` proved it writes nothing, **then** a real run produced one cycle and N reviews each with a non-null `templateSnapshot` |
| P6 | `performance-no-scoring.test.ts` is green — the structural proof that no scoring engine exists |
| P6 + P8 | **cannot be marked VERIFIED separately.** They share one gate: the live before-and-after redaction check (item 158) with its positive control |
| P9 | a real browser load of `/performance` and `/performance/reviews/{id}` succeeded after `nodemailer` was added |

If a gate fails: fix inline when it is inside this plan's blast radius; create a follow-up
backlog artifact and keep the phase `BLOCKED` when it is not. Never mark a phase green with a
failing gate, and never silently absorb a regression.

**User Confirmation is required for `✅ VERIFIED`.** Gates 1–7 above are necessary, not
sufficient. Because this feature's two most consequential surfaces cannot be proven by any
automated gate — the migrations run only against the user's database, and the redaction gate's
real proof is a live before-and-after browser check — no phase is promoted to `✅ VERIFIED`
until the user has confirmed working. Until then a passing phase is `CODE DONE` with its
evidence recorded. This matters most for P1 (irreversible `DROP TABLE`), P2 (enum rename),
and P6+P8 (the leak window).

---
## Implementation Checklist — Phase by Phase

Numbering is global and continuous. Each item is one atomic, verifiable action.

### PHASE 1 — Goals removal (30 sites)

Prisma:
1. `prisma/schema.prisma:262-267` — delete `enum GoalStatus`.
2. `prisma/schema.prisma:1676-1693` — delete `model Goal`.
3. `prisma/schema.prisma:493` — delete the `goals Goal[]` back-relation on `Employee`.

Service `src/lib/server/services/performance.ts`:
4. `:238` — delete the `// ── Goals …` section-header comment.
5. `:240-249` — delete `listGoalsForManager`.
6. `:251-256` — delete `listGoalsForEmployee`.
7. `:258-288` — delete `createGoal`.
8. `:290-318` — delete `updateGoalProgress`.
9. `:4` — delete `import { listReportIdsFor } from './supervisors'`, now orphaned (only
   `listGoalsForManager:242` used it). **Do not delete `services/supervisors.ts` itself** —
   other domains use it (digest §2 "SURVIVES").

Page server `src/routes/(app)/performance/+page.server.ts`:
10. `:4` — remove `listGoalsForEmployee` from the import list.
11. `:8` — remove `createGoal` from the import list.
12. `:9` — remove `updateGoalProgress` from the import list.
13. `:14` — remove `listGoalsForManager` from the import list.
14. `:20` — delete `const GOAL_STATUS = [...]`.
15. `:32` — delete `myGoals: []` from the no-employee early-return object.
16. `:35` — delete `teamGoals: []` from the same object.
17. `:24` — **verify whether `isManager` is now orphaned.** It is still returned at `:36`/`:56`
    and read by `+page.svelte:398` (Team Goals) — which item **32** deletes (earlier drafts said
    item 27; item 27 is `goalStatusClass`). After item 27, grep
    `isManager` in `+page.svelte`; if it has no remaining reader, delete `:24`, `:36` and `:56`
    too. If Phase 5 will reuse it, keep it and say so in the commit message.
18. `:42-47` — reduce the `Promise.all` from four entries to two: drop
    `listGoalsForEmployee(...)` and the `isManager ? listGoalsForManager(...)` ternary, and
    fix the destructure on `:42` to match. **Positional destructure — change both halves in
    one edit.**
19. `:52` — delete `myGoals` from the returned object.
20. `:55` — delete `teamGoals` from the returned object.
21. `:71-76` — delete `createGoalSchema`.
22. `:78-82` — delete `updateGoalSchema`.
23. `:85-105` — delete the `createGoal` action.
24. `:107-132` — delete the `updateGoal` action.

Page component `src/routes/(app)/performance/+page.svelte`:
25. `:9` — delete `let showGoal = $state(false)`.
26. `:13-14` — delete the `// #108 …` comment line referring to goals and
    `const createGoal = createSubmitGuard()`. **Keep `const createCycle` at `:15`** — the
    cycles UI dies in Phase 5, not here.
27. `:29-36` — delete `goalStatusClass`.
28. `:53-58` — delete the "New Goal" button.
29. `:61-64` — delete the two stale comment lines about the create-goal form.
    **KEEP `:65-69` — the top-level `role="alert"` banner** *in this phase*. The cycle form still
    lives on this page through Phase 1, so the banner still has an action that can populate it and
    `tests/e2e/form-errors.spec.ts:37` still pins it.
    **Be clear about what happens later:** Phase 5 (items 103, 110–112) deletes *every* action on
    this page — `createCycle`, `setCycleStatus`, `openReviews` — so from Phase 5 onward nothing can
    populate this banner and it becomes unexercised markup. That is why the #106 regression guard
    **moves to a different surface** rather than staying here. The replacement contract is
    **item 117** (the `/settings/performance` cadence form), *not* item 71 — item 71 is the
    templates list page and has nothing to do with this.
30. `:71-130` — delete the entire create-goal `{#if showGoal}` form.
31. `:132-220` — delete the entire "My Goals" `<section>`.
32. `:397-429` — delete the entire "Team Goals" `<section>`.
33. `:19-27` — **keep** `rowGuards` / `rowGuard`; the cycle table at `:277-279` still uses them.
    They die in Phase 5.
34. `:5` — **keep** the `createSubmitGuard` import; `createCycle` and `rowGuard` still use it.

API:
35. Delete the file `src/routes/api/v1/performance/goals/+server.ts` **and its directory**
    `src/routes/api/v1/performance/goals/`.
36. Delete the generated dir `.svelte-kit/types/src/routes/api/v1/performance/goals/` if present.
    Generated output — do not hand-edit, just remove; `svelte-kit sync` regenerates the rest.

Scripts — **order-coupled, read §7.0 below before editing:**
37. `scripts/prod-delete.ts:200` — remove `goals,` from the positional destructure array.
38. `scripts/prod-delete.ts:223` — remove `db.goal.count({ where: { employeeId } }),` from the
    positional `Promise.all`. **Items 37 and 38 are one edit.** The destructure and the
    `Promise.all` are matched by position; changing one without the other silently mislabels
    every count after `goals` (`cashAdvances` would receive the goal count, and so on down).
39. `scripts/prod-delete.ts:265` — remove the `goals,` line from the summary object.
40. `scripts/prod-delete.ts:335` — remove `await tx.goal.deleteMany({ where: { employeeId } })`
    from the delete transaction.
41. `scripts/clean-e2e-employees.ts:86` — remove
    `await step('goal', () => db.goal.deleteMany({ where }))`.

Migration + push:
42. Create `scripts/migrate-drop-goals.ts` per §3.6 Script A.
43. Run it, then `pnpm db:push`. (**The user starts the DB.** Ask before running anything that
    needs `veent-db-5434`.) **Unblocked 2026-08-27** — O-1 is closed; no staging/prod counts are
    needed. The only remaining precondition is that the local DB is running.

Tests:
44. Rewrite `tests/e2e/form-errors.spec.ts:37-60`. The goal-form half of its premise dies here.
    Minimum change in this phase: delete the stale "without the goal form being open" phrasing
    from the test name and the comment block at `:39-41`; the assertions themselves still pass
    because the cycle form survives Phase 1. **The full replacement lands in Phase 5 — its contract
    is item 117**, which re-points the #106 guard at the `/settings/performance` cadence form
    because Phase 5 leaves this page with no action to fail. (Earlier drafts of this plan cited
    "item 71" here; that was wrong — item 71 is the templates list page.)
44a. **AC17's route half — add the assertion the grep cannot make.** SPEC AC17 claims "hitting the
    old route returns 404", but item 48's `rg` only proves the *source file* is gone; nothing
    exercises the route. In the same spec touched above, add one request to
    `/api/v1/performance/goals` and assert the response status is **404**. Use Playwright's
    `request` fixture, not a page navigation, so the assertion reads the status directly.
    **This must be a positive assertion on the status code**, not "the page looks empty" —
    absence proves nothing on its own.
45. `pnpm test` — green.
46. `pnpm check` — green. Run `pnpm prisma generate` first; a stale client produces phantom
    errors (all-tests.md).
47. `pnpm lint` and `pnpm format:check` — green.
48. Structural gate: `rg -in "\bgoal" src/ prisma/` returns **zero** hits.
    **Corrected 2026-08-27 during EXECUTE — the original wording was unsatisfiable.** It also
    covered `scripts/` and `tests/`, but items 42 and 44a *mandate* files there that must name
    `goals`: `scripts/migrate-drop-goals.ts` (the `DROP TABLE goals` SQL) and
    `tests/e2e/form-errors.spec.ts` (the literal URL `/api/v1/performance/goals`). The gate over
    those two directories is therefore `rg -in "\bgoal" scripts/ tests/` with exactly those two
    files excluded → **zero**. Both forms verified clean.
    Exclusions are false positives already enumerated in digest §2 and are not under `src/`,
    `prisma/`, `scripts/` or `tests/`.
49. Live check with the user's running DB:
    `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c "select count(*) from audit_logs where \"entityType\"='Goal'"` before and after — **unchanged**.

#### §7.0 — the `prod-delete.ts` trap, stated once

`scripts/prod-delete.ts:190-235` is a positional destructure bound to a positional
`Promise.all`. The array at `:190-212` has 22 names; the array at `:213-235` has 22 queries in
the same order. `goals` is name #10 and `db.goal.count(...)` is query #10. Deleting one leaves
21 names bound to 22 queries — every entry after position 10 shifts by one and the script
reports `cashAdvances` where it means `goals`, and so on to the end. It would still run, print
plausible numbers, and be wrong. **Delete name #10 and query #10 in the same edit, then count
both arrays and assert they are 21 and 21.**

---

### PHASE 2 — Schema foundation (one migrate, one push)

50. `prisma/schema.prisma:254-260` — rename `MANAGER_REVIEW` → `SCORED`, add `SIGNING`, per §3.2.
51. `prisma/schema.prisma:1155-1160` — add `PERFORMANCE` to `enum NotificationKind`.
    Precedent for adding a kind: `scripts/migrate-notification-kind.ts` exists (digest §3).
    A pure addition needs no script — `db push` handles it.
52. Add `model PerformanceTemplate` per §3.3, with the comment block verbatim.
53. Add `model ReviewSignoff` per §3.3, with the comment block verbatim.
54. Add `model PerformanceConfig` per §3.3, with the comment block verbatim.
55. `model ReviewCycle:1637-1651` — add `@@unique([organizationId, startDate, endDate])` and
    `@@index([organizationId, status])`.
56. `model PerformanceReview:1653-1674` — add `templateSnapshot`, `templateId`, `answers`,
    `employeeComments`, `releasedAt`, `releasedByUserId`, `lastReminderAt`, `lastReminderKind`,
    the `releasedBy` and `signoffs` relations, and the three new indexes, per §3.4.
57. `model Employee` — add `assignedTemplateId` + `assignedTemplate` relation +
    `releasedReviews` + `headedDepartments` back-relations, per §3.4.
58. `model Department:372-390` — add `headEmployeeId` + `head` relation, with the comment
    explaining why the column exists (§3.4).
59. `model User` — add `reviewSignoffs ReviewSignoff[]`.
60. `model Organization` — add `performanceTemplates` and `performanceConfig`.
61. Create `scripts/migrate-review-status-scored.ts` per §3.6 Script B.
62. **Pre-push duplicate check** — the new `ReviewCycle @@unique` fails the push if live data
    already holds a duplicate `(organizationId, startDate, endDate)`. Nothing prevents one
    today (digest §1: "No indexes beyond PK, no `@@unique`"). Run, and act on the result:
    ```sql
    select "organizationId","startDate","endDate",count(*)
    from review_cycles group by 1,2,3 having count(*)>1;
    ```
    Zero rows → proceed. Any rows → **stop and surface to the user**; deciding which duplicate
    to keep is a data decision, not an implementation one.
63. Run `scripts/migrate-review-status-scored.ts`, then `pnpm db:push`.
64. `pnpm prisma generate`, then `pnpm check` — green.
65. `pnpm test` — green. **Expect `tests/unit/performance-redact.test.ts` to still pass** —
    Phase 2 changes no runtime code.
66. Live check: `\d performance_reviews`, `\d review_signoffs`, `\d performance_templates`
    show the new columns and constraints; `select enum_range(null::"ReviewStatus")` shows
    `SCORED` and `SIGNING` and no `MANAGER_REVIEW`.

---

### PHASE 3 — Template CRUD, builder UI, and the two seeded templates

Pure modules first (unit-testable, no DB):
67. Create `src/lib/server/performance/types.ts` — `TemplateStructure`, `Answers`,
    `TemplateSnapshot`, `SignatoryRole` union. Types only, no logic, no imports from `$lib/server/db`.
68. Create `src/lib/server/performance/schemas.ts` — every schema from §5 **except**
    `answersSchemaFor` (that lands in Phase 6). Includes `templateStructureSchema`,
    `templateMetaSchema`, `newId()` (the id generator for builder rows).

Service:
69. Create `src/lib/server/services/performance-templates.ts` — a **new** service file, not an
    addition to `performance.ts`. `performance.ts` is already 319 lines and its export list is
    mocked verbatim by `tests/unit/review-privacy.test.ts:29-35`; every export added to it
    breaks that mock. Exports: `listTemplates(organizationId)`,
    `getTemplate(id, organizationId)`, `createTemplate(organizationId, data, ctx)`,
    `updateTemplate(id, organizationId, data, ctx)`,
    `setTemplateActive(id, organizationId, isActive, ctx)`,
    `countEmployeesWithoutTemplate(organizationId)`.
    Org-scope every query on the **direct `organizationId` column**, never a join (avoids
    adding an #323 site).
    Pass `tx` to `writeAuditLog` where a transaction exists (avoids adding an #324 site).
    `entityType: 'PerformanceTemplate'`.

Routes:
70. Create `src/routes/(app)/performance/templates/+page.server.ts` — `load` (list) +
    `actions.createTemplate`, `actions.setActive`. Guard: `ADMINISTER_HR_ORGWIDE` as the first
    line of `load` and of each action.
71. Create `src/routes/(app)/performance/templates/+page.svelte` — the list. Svelte 5 runes.
72. Create `src/routes/(app)/performance/templates/[id]/+page.server.ts` — `load` (one template)
    + `actions.updateTemplate`. Same guard placement.
73. Create `src/routes/(app)/performance/templates/[id]/+page.svelte` — **the builder**. See §8.
74. Create `src/routes/api/v1/performance/templates/+server.ts` — `GET` (list) and `POST`
    (create). 401 + `ADMINISTER_HR_ORGWIDE`, mirroring `api/v1/performance/cycles/+server.ts`.
75. `src/routes/(app)/+layout.svelte:171-175` — add a `/performance/templates` nav entry with
    `show: canAny(roles,'ADMINISTER_HR_ORGWIDE')`. Note `/performance` at `:171` is
    unconditional today and stays that way.

Seed:
76. Create `prisma/seed-performance-templates.ts` — idempotent upsert on
    `(organizationId, name)` for both templates. Content per §9. **Validates through
    `templateStructureSchema` before writing** and exits 1 on a parse failure.
77. `package.json` — add `"db:seed:templates": "dotenv -e .env.dev -- tsx prisma/seed-performance-templates.ts"`.

Tests:
78. Create `tests/unit/performance-template-schema.test.ts` — `templateStructureSchema`
    accepts both seeded structures verbatim; rejects a missing section id, a duplicate criterion
    id, `maximum` negative, `totalCeiling` missing, an empty `signatoryOrder`, an unknown
    signatory `role`.
79. Create `tests/unit/performance-template-render.test.ts` — SPEC AC1: a service-level fixture
    of each structure produces two visibly different section/criterion lists, and the
    weight/maximum/band values are carried through as **labels** with no arithmetic applied.
80. Create `tests/unit/performance-templates-rbac.test.ts` — the create/update actions 403 for
    `MANAGER` (proves `ADMINISTER_HR_ORGWIDE`, not `MANAGE_HR`) and pass for `HR_ADMIN`.
    **Mutation-check it:** swap the guard to `MANAGE_HR` and confirm the MANAGER case goes red.
81. `pnpm test`, `pnpm check`, `pnpm lint` — green.

---

### PHASE 4 — Template assignment and backfill readiness

82. `src/routes/(app)/employees/[id]/+page.server.ts` — add an `assignTemplate` action:
    `requireAnyCapability(roles,'ADMINISTER_HR_ORGWIDE')` **then**
    `await assertCanTouchEmployee(user, params.id)` **then** `assignTemplateSchema`.
    Writes `Employee.assignedTemplateId`, audits `entityType: 'Employee'`,
    `newValue: { assignedTemplateId }`.
83. `src/routes/(app)/employees/[id]/+page.svelte` — add the template `<select>` to the HR
    section. Options from active templates in the org; a blank "— none —" option is valid.
84. `src/routes/(app)/employees/[id]/+page.server.ts` `load` — include the org's active
    templates and the employee's current `assignedTemplateId`.
85. `src/routes/(app)/performance/+page.server.ts` `load` — when `ADMINISTER_HR_ORGWIDE`, add
    `templateBackfill: await countEmployeesWithoutTemplate(organizationId)`.
86. `src/routes/(app)/performance/+page.svelte` — render the readiness line: "N active employees
    have no assigned template." **Informational, never a blocking gate** (SPEC AC3).
87. Create `tests/unit/performance-template-assignment.test.ts` — SPEC AC2: assignment resolves
    from the explicit field only; a template is never inferred from department/position/role;
    the guard rejects a `MANAGER` reaching a stranger.
88. Create `tests/unit/performance-template-backfill-check.test.ts` — SPEC AC3 readiness count:
    counts only `employmentStatus:'ACTIVE'` employees with a null `assignedTemplateId`, scoped
    to the org.
89. `pnpm test`, `pnpm check` — green.

---

### PHASE 5 — Cadence config, cycle-generation cron, snapshot-on-open

**Dates first — the #320 trap.** There is no generic `addMonths` in `src/lib/utils/dates.ts`,
and the two existing month helpers deliberately disagree on timezone basis (`monthsOfService:113`
Manila, `regularizationDate:166` UTC). Both bases are used here, for different questions:

| Question | Basis | Why | Helper |
|---|---|---|---|
| "Is a cycle due yet?" | **Manila** | it is a wall-clock business question — HR in PHT decides whether today is past the boundary; a UTC answer is 8 hours out and can flip the day | `manilaDayKey` (`dates.ts:62`) |
| "What are this period's start and end dates?" | **UTC month-stepping** | the day-of-month must stay stable across the step; local-time month math drifts a day for PHT — the exact reason `regularizationDate` (now `dates.ts:191`, not `:166`) is UTC | `addUTCMonths`, shipped in 0075272 |

90. `src/lib/utils/dates.ts` — add `addUTCMonths(date: Date, months: number): Date`, using
    `d.setUTCMonth(d.getUTCMonth() + months)`, with a doc comment that names the UTC basis and
    cross-references `regularizationDate:166`. **Refactor `regularizationDate` to call it** —
    one line, removes the duplicate, and the existing regularization tests are the proof it
    is behaviour-preserving. Do **not** touch `monthsOfService`, and do **not** touch
    `services/reports.ts:122,149` (out of scope, report only).
91. Create `tests/unit/dates-add-utc-months.test.ts` — Jan 31 + 1 month, Dec + 2 months across
    the year boundary, a UTC-midnight input staying UTC-midnight, and a negative step.
    Then re-run the existing regularization tests untouched as the refactor's proof.

Pure planner:
92. Create `src/lib/server/performance/cycle-plan.ts` — **no DB, no fs, no network, no
    `Date.now()`; time is always an argument.** Modelled on `src/lib/server/backup/plan.ts`.
    Exports:
    - `isCycleDue(cfg: {enabled:boolean; intervalMonths:number}, lastCycleEnd: Date|null, now: Date): boolean`
      — Manila basis via `manilaDayKey`, measured from the last cycle's **end**.
      **No catch-up loop.** A missed boundary yields ONE cycle on the next tick, matching
      `isRunDue`'s audited semantics (`backup/plan.ts:39-56`).
    - `nextCyclePeriod(lastCycleEnd: Date|null, intervalMonths: number, now: Date): {startDate: Date; endDate: Date; name: string}`
      — UTC month-stepping via `addUTCMonths`. `name` is generated, e.g. `"Aug–Sep 2026"`.
    - `planReviewsForCycle(employees, existingEmployeeIds): {toCreate, unreviewable}` where
      `unreviewable` entries carry `reasons: ('no-template-assigned' | 'no-manager' |
      'template-invalid')[]` and an employee missing both reasons reports both.
      **CORRECTED 2026-08-27 during EXECUTE — the plan said singular `reason:` while also
      requiring both reasons for one employee. Those contradict.** The shipped shape is an
      ARRAY, one entry per employee, reasons ordered. **Items 94 and 95 must consume the array.**
      Also note `template-invalid` cannot be decided by the pure planner — the `safeParse` lives
      in the service (item 94), which needs the parsed structure for `templateSnapshot` anyway —
      so `PlannableEmployee` carries `templateStructureValid?: boolean`, defaulting to `true` and
      read only when a template is assigned.
    Every exported function carries a comment naming its timezone basis **at the point of use**.
93. Create `tests/unit/performance-cycle-plan.test.ts` — SPEC AC3, AC14, AC15:
    default interval (no config row → 2 months); a changed setting affecting only future cycles;
    the retroactivity negative case (existing rows unchanged); idempotency; one case per
    unreviewable reason; the both-reasons case; a missed-boundary case producing exactly one cycle.

Service:
94. `src/lib/server/services/performance.ts` — **rewrite** `openReviewsForCycle:198-236`:
    - scope employees on the **direct `Employee.organizationId` column**, not the
      `where:{ user:{ organizationId } }` join at `:210` (#323 — do not repeat the pattern in
      new code; the surrounding function is being rewritten, so this is not a drive-by fix).
    - select `assignedTemplateId` and `reportsToId`; join the template's `structure`.
    - call `planReviewsForCycle`.
    - wrap **the whole per-org create in ONE `$transaction`**: create every review with its
      `templateSnapshot` (validated by `templateStructureSchema.safeParse` — a failure moves
      that employee to `unreviewable` with `template-invalid`), and write the audit row with
      `tx` as `writeAuditLog`'s third argument.
    - return `{ opened, unreviewable }`, replacing today's `{opened, skipped}` — `skipped`
      conflated "already had one" with "had no manager" (digest §1).
95. `src/lib/server/services/performance.ts` — add `listUnreviewable(cycleId, organizationId)`
    reading from the persisted unreviewable set. **Storage decision:** do not add a table.
    Recompute on read by re-running `planReviewsForCycle` against the current roster and the
    cycle's existing reviews. It is one query and always current — a stored list would go stale
    the moment HR assigns a template. Comment this choice at the function.
**OWNER RULING 2026-08-27 — `enabled` defaults to TRUE, and that is deliberate.**
An organization that has never opened `/settings/performance` has no `PerformanceConfig` row, so
`getPerformanceConfig` returns the defaults and **the cron generates cycles for it from the first
run**. The owner was asked directly whether to flip this to off-by-default and said no: *"Orgs might
ignore the setting and blame us devs for not creating a backup."* Silence must mean the reviews
happen, not that they silently never do. **Do not change this default to `false`.**

96. `src/lib/server/services/performance.ts` — add `getPerformanceConfig(organizationId)`
    returning the row **or the defaults** when absent, mirroring how `backup-documents.ts:130`
    treats a missing `BackupConfig` (the cron never creates config as a side effect).
97. `src/lib/server/services/performance.ts` — add `savePerformanceConfig(organizationId, data, ctx)`,
    bounding `intervalMonths` to 1–24 and `dueDays` to 1–180 at the service, not only in zod.

Cron shell:
98. Create `scripts/generate-review-cycles.ts` — a **thin IO shell**, mirroring
    `scripts/backup-documents.ts`. It must:
    - support `--dry-run` (lists what would be created, writes nothing) and `--force`.
    - iterate organizations; read `PerformanceConfig` or defaults; skip when `!enabled`.
    - call the pure `isCycleDue` / `nextCyclePeriod`; contain **no date arithmetic of its own**.
    - create the cycle **as `ACTIVE`** and open its reviews inside the same `$transaction`.
    - catch Prisma `P2002` on the new `ReviewCycle @@unique` and treat it as "already generated
      — skipped", not an error.
    - write an audit row. **It needs the seeded `system@veent.ph` user** — `AuditLog.actorId` is
      a non-nullable FK. `process.exit(1)` with a clear message if that user is missing, exactly
      like `promote-probationary.ts:37-47`. (Chosen over `backup-documents.ts`'s no-audit
      approach because a cycle appearing in HR's list with no actor is unexplainable, whereas a
      `BackupRun` row is self-documenting.)
    - notify each affected employee via `notify(userId, …, '/performance/reviews/{id}', 'PERFORMANCE')`
      — the canonical shape at `services/awards.ts:61-66`.
99. **No advisory lock, deliberately.** Justification, one line as required: cycle generation
    fires at most once every `intervalMonths` from a single hand-installed crontab line, and the
    `@@unique` + single `$transaction` turns any genuine overlap into a caught `P2002` rather
    than a duplicate — a lock would add the `withSingleConnection` connection-pinning trap
    (`backup/plan.ts:126`) for a race that cannot produce a bad row. **The reminder job (Phase 9)
    is a different case** and is re-evaluated there.
100. `scripts/README.md` — add a "Automatic review cycles" section after the backup one
     (`:230`+), with the crontab line and the **explicit warning that `deploy.yml` does not
     create it** (`:195-200` already states this rule for the file as a whole; restate it for
     the new entry). Proposed line, daily so a boundary is never missed by more than a day:
     ```text
     0 2 * * *  cd ~/repos/Veent_HRIS && docker compose run --rm app pnpm exec tsx scripts/generate-review-cycles.ts >> /var/log/veent-review-cycles.log 2>&1
     ```

Settings UI:
101. Create `src/routes/(app)/settings/performance/+page.server.ts` — `load` + `saveConfig`.
     Guard `ADMINISTER_HR_ORGWIDE` first line of each.
102. Create `src/routes/(app)/settings/performance/+page.svelte` — interval, due-days, enabled.
     Model on the existing backup settings page for layout and token usage.

Remove the manual cycle UI (SPEC: "that whole manual HR UI is gone"):
103. `src/routes/(app)/performance/+page.svelte:222-351` — delete the Review Cycles section
     (create form, table, Activate / Open reviews / Close buttons).
104. `src/routes/(app)/performance/+page.svelte:10-11` — delete `cycleStart` / `cycleEnd` state.
105. `src/routes/(app)/performance/+page.svelte:15` — delete `const createCycle`.
106. `src/routes/(app)/performance/+page.svelte:19-27` — delete `rowGuards` / `rowGuard`; the
     cycle table was its last consumer.
107. `src/routes/(app)/performance/+page.svelte:5` — now delete the `createSubmitGuard` import.
108. `src/routes/(app)/performance/+page.svelte:3` — delete the `advanceTo` import (cycle dates
     were its only use on this page — **verify with a grep before deleting**).
109. `src/routes/(app)/performance/+page.svelte:38-43` — `reviewStatusClass` is used for both
     review status (`:380`, `:457`) and cycle status (`:287`). `:287` dies with item 103; keep
     the helper and **add `SCORED` and `SIGNING` to its branches**.
110. `src/routes/(app)/performance/+page.server.ts:134-151` — delete the `createCycle` action.
111. `src/routes/(app)/performance/+page.server.ts:153-172` — delete the `setCycleStatus` action.
112. `src/routes/(app)/performance/+page.server.ts:174-189` — delete the `openReviews` action.
113. `src/routes/(app)/performance/+page.server.ts:10-13` — remove `listReviewCycles`,
     `createReviewCycle`, `updateReviewCycleStatus`, `openReviewsForCycle` from the import list
     as each loses its last caller. **`listReviewCycles` stays** if the page still lists cycles
     read-only — it should, so HR can see what was generated. Keep the `load` fetch at `:27`.
114. `src/lib/server/services/performance.ts` — delete `createReviewCycle:16-38` and
     `updateReviewCycleStatus:175-194`; the generator creates cycles directly and nothing
     transitions status by hand any more. **`listReviewCycles:9-14` survives.**
115. `src/routes/api/v1/performance/cycles/+server.ts` — delete the `POST` handler (its service
     is gone); keep `GET`.
116. `tests/unit/review-privacy.test.ts:29-35` — **this mock lists the performance module's
     exports verbatim and breaks the moment that list changes.** Update it to the new list. Do
     not delete the file; its five #282 §3-B cases are the only coverage of object-scoped review
     access and item 152 extends them.
117. **Replace** `tests/e2e/form-errors.spec.ts:37-60`. Its premise — "performance surfaces cycle
     errors without the goal form being open" — is destroyed by items 30 and 103. The replacement
     must keep pinning the same thing the original protected (#106: the top-level `role="alert"`
     banner at `+page.svelte:65-69` renders an action failure). New target: the
     `/settings/performance` cadence form with an out-of-range `intervalMonths`. Assert the alert
     is visible **and** does not contain `[object Object]`, matching the benefits case at
     `form-errors.spec.ts:31-33`. **Replace, never delete** — deleting it drops the only
     regression guard for #106 on this surface.
118. Create `tests/unit/performance-config.test.ts` — the default-when-absent path, the 1–24 and
     1–180 bounds at the service layer, and the RBAC guard.
119. `pnpm test`, `pnpm check`, `pnpm lint` — green.
120. `pnpm test:e2e` — the replaced spec passes. Suite is flaky (#287); read the actual error
     before re-running.
121. Live: with the user's DB running, `tsx scripts/generate-review-cycles.ts --dry-run` prints a
     plausible plan and writes nothing (`select count(*) from review_cycles` unchanged before and
     after). Then a real run, then the same count +1 and N reviews each carrying a non-null
     `templateSnapshot`.

---

### PHASE 6 — Capture / fill-in flow (NO SCORING) + interim redaction

**Read §0 again before writing any code in this phase.**

122. `src/lib/server/performance/schemas.ts` — add `answersSchemaFor(structure)` exactly as

**CORRECTED 2026-08-27 during EXECUTE — `ZodType<Answers>` does not compile.** §5 also mandates `z.coerce.number().int()`, and a coerced schema's INPUT type is `unknown`, not `Answers`. The shipped signature is the three-generic form `ZodType<Answers, ZodTypeDef, unknown>` — same output contract, honest input generic.

**TRAP found while testing this, worth knowing before writing any nullable-bound test here:** a subtotal submitted against a `maximum: null` section must be rejected, and the obvious test passes even when the `maximum === null` guard is deleted — because the code falls through to `subtotal > maximum` and JS coerces `null` to `0`, so `1 > null` is still true. Test that case with **`0`**, the one value that slips past every comparison-based fallback.

     specified in §5, including the "DOES NOT and MUST NOT" comment verbatim.
123. `src/lib/server/services/performance.ts` — add `submitScores(id, reviewerId, answers, ctx)`:
     - 409 unless `review.reviewerId === reviewerId` (matching `submitManagerReview:125`).
     - re-validate `answers` against **the review's own snapshot**, server-side, even though the
       action already did. The action's copy can be bypassed by a direct POST.
     - set `status: 'SCORED'` — **not `COMPLETED`**. Today's `submitManagerReview:134` jumps
       straight to COMPLETED; the new lifecycle routes through SIGNING.
     - audit `entityType: 'PerformanceReview'`, `newValue: { status }`. **Do not put the answers
       in the audit `newValue`** — the audit log is readable by more people than the review is
       (#242 already burned this codebase: the audit log bypassed a reveal gate).
124. `src/lib/server/services/performance.ts` — add
     `saveEmployeeComments(id, employeeId, text, ctx)`; 409 unless subject.
125. `src/lib/server/services/performance.ts` — **DELETE `submitManagerReview:117-151`.** It is
     replaced by `submitScores`. Its `managerComments` / `overallRating` columns stay on the
     model for now (existing rows hold data) but nothing writes them again. Removing the columns
     is a v2 cleanup, not this issue's job.
126. `src/lib/server/services/performance.ts:45-49` — **extend `redactHrAuthored` to also null
     `answers`.** Two lines. This is the interim gate that keeps Phase 6 shippable-with-Phase-8
     and prevents the leak described in §2 Correction 3. Update the `#179` comment to name #178.
127. `src/routes/api/v1/performance/reviews/+server.ts` — apply `redactHrAuthored` to
     `asSubject`. **Today it does not** (digest §1: "`asSubject` is NOT redacted, unlike the page
     load"). With `answers` now populated, this is no longer a latent inconsistency but a live
     leak of every rating. SPEC folds this into AC8 as an in-scope side effect, not a separate fix.
128. `src/routes/(app)/performance/reviews/[id]/+page.server.ts:63-84` — replace the `submitReview`
     action with `submitScores`, parsing through `answersSchemaFor(review.templateSnapshot.structure)`.
     Delete the old inline `z.object({ managerComments, overallRating })` at `:73-78`.
129. Same file — add a `saveEmployeeComments` action.
130. Same file `:14-39` `load` — parse `templateSnapshot` defensively
     (`templateStructureSchema.safeParse`); on failure return a flag that renders an error banner
     rather than a half-rendered form.
131. `src/routes/(app)/performance/reviews/[id]/+page.svelte` — **rewrite** to render from the
     snapshot.

     **AMENDED 2026-08-27 during EXECUTE Phase 3 — do NOT hand-roll this form.**
     `src/lib/components/performance/ReviewFormRender.svelte` already exists, built in Phase 3,
     and renders exactly the field list below from a `TemplateStructure`. It takes a `mode` prop:
     `'preview'` (read-only, used by the template builder's preview pane) and `'fill'` (live
     inputs, which THIS item owns and completes). **Item 131 consumes that component and binds
     answers to it; it does not write a second renderer.**

     The reason is the design brief's hard requirement (§3, and failure #1 in §9): the builder's
     preview must render through the same component as the real review form, or the two drift and
     the preview teaches HR a lie. The original wording of this item created that drift by
     construction. One component, two modes.

     Note the mode asymmetry that carries the no-arithmetic rule: in `'preview'` the subtotal and
     total lines render as **empty boxes, never computed zeroes**. In `'fill'` they are inputs the
     evaluator types into. Neither mode ever computes.

     The field list this item is responsible for completing in `'fill'` mode: rating-scale table, each section with its `weightLabel` and criteria rows
     (rating input + remark input), the subtotal input **only when `section.maximum !== null`**,
     the overall-summary label block, the total input, the band `<select>`, the narrative blocks,
     the recommendation checklist, and the KPI table when present.

     **CORRECTED 2026-08-27 during EXECUTE — the self-assessment box and the employee-comments
     box are NOT part of this component.** Both are employee-authored, live in their own columns,
     and must never enter `answers`; putting them inside the shared renderer would push
     employee-authored text through the evaluator's answer blob and past §4.2's redaction rule.
     They stay on the page, outside `ReviewFormRender`. Phase 3 already built it that way; only
     this field list was wrong. Svelte 5 runes. `{@const}` only as an immediate child of `{#each}` /
     `{#if}` (CLAUDE.md).
     **No `$derived` that sums anything.** If a later reader adds `$derived(() => ratings.reduce(...))`
     to "helpfully" show a running subtotal, that is the scoring engine arriving through the front
     door. Put a comment saying so above the section loop.
132. Create `tests/unit/performance-capture.test.ts` — SPEC AC4: round-trip. What the evaluator
     types is byte-identical to what is stored and to what is rendered back, across repeated
     reads, for ratings, remarks, subtotals, total, band, narratives, recommendations, KPI actuals.
133. Create `tests/unit/performance-capture-validation.test.ts` — SPEC AC5 boundaries, each
     independently: rating at `max` accepted / `max+1` rejected / `min-1` rejected /
     non-integer rejected; subtotal at `maximum` accepted / `maximum+1` rejected; subtotal
     submitted for a `maximum: null` section rejected; total at `totalCeiling` accepted /
     `+1` rejected; unknown criterion id rejected; unknown band id rejected.
134. Create `tests/unit/performance-no-scoring.test.ts` — **the structural gate for SPEC AC4.**
     A test that greps the source tree and fails on any of: a file named `scoring.ts` under
     `src/lib/server/performance/`, an exported identifier matching
     `/\b(computeScore|calculateTotal|deriveBand|sumSubtotals?|weightedTotal)\b/` anywhere in
     `src/`, or a `.reduce(` inside `reviews/[id]/+page.svelte`. Mirrors the Goal-removal
     structural check (item 48). This test's failure message must say **why**: "the app performs
     no arithmetic on evaluation scores — see #178 SPEC acceptance criterion 4."
135. Extend `tests/unit/performance-redact.test.ts` — add an `answers` case now that item 126
     nulls it. The existing three cases stay.
136. Create `tests/unit/performance-api-redaction.test.ts` — SPEC AC8: `GET /api/v1/performance/reviews`
     returns `asSubject` with `answers === null`. **Mutation-check:** remove the `.map(redactHrAuthored)`
     from item 127 and confirm this test goes red. A test that stays green with the guard removed
     is vacuous (all-tests.md discipline #1).
137. `pnpm test`, `pnpm check`, `pnpm lint` — green.

---

### PHASE 7 — Sequential sign-off

Pure module:
138. Create `src/lib/server/performance/signoff-plan.ts` — **no DB.** Exports:
     ```ts
     // The one function that answers "whose turn is it". Both the UI's "you may sign now"
     // affordance and the server's out-of-turn REJECTION call this, so they cannot disagree.
     // There is NO stored current-signatory pointer: a pointer is a second source of truth
     // that drifts the first time a signoff row is written by any path that forgets it.
     export function nextSignatorySlot(
       signatoryOrder: SignatorySlot[],
       existingSignoffs: { slotId: string }[]
     ): SignatorySlot | null   // null = every slot is signed
     export function isFullySigned(signatoryOrder, existingSignoffs): boolean
     ```
139. Create `tests/unit/performance-signoff-order.test.ts` — SPEC AC11: in-order succeeds;
     out-of-turn returns the wrong slot / is rejected; an empty signoff set returns slot 0;
     a fully-signed set returns null; a signoff for a slot no longer in the order (impossible
     against a snapshot, but prove the function does not crash).

Slot resolution:
140. `src/lib/server/services/performance.ts` — add
     `resolveSlotHolders(slot, review): Promise<string[]>` returning the **user ids** allowed to
     attest that slot:
     | `slot.role` | resolves to |
     |---|---|
     | `EMPLOYEE` | `review.employee.userId` |
     | `IMMEDIATE_SUPERVISOR` | `review.reviewer.userId` |
     | `HR_REPRESENTATIVE` | every active user in the org holding `ADMINISTER_HR_RECORDS`, read **from the capability table**, never role literals — the exact shape of `backup/run.ts:228-243` |
     | `DEPARTMENT_HEAD` | `employee.department.head.userId`, or `[]` when `headEmployeeId` is null |
     An empty array means **stalled**, per SPEC AC12.
141. `src/lib/server/services/performance.ts` — add `attestSignoff(id, userId, typedName, ctx)`:
     - load the review with its `signoffs`.
     - `nextSignatorySlot(...)` → 400 if null ("already fully signed").
     - `resolveSlotHolders(slot, review)` → 409 if `userId` is not in it. **This is the
       server-side out-of-turn rejection SPEC AC11 requires — it must be here, in the service,
       not only in the UI.**
     - inside one `$transaction`: create the `ReviewSignoff`, recompute `isFullySigned`, and set
       `status` to `SIGNING` (first attestation) or `COMPLETED` + `completedAt` (last one).
       Audit with `tx`.
     - catch `P2002` on `@@unique([reviewId, slotId])` → 409 "that signature was just recorded
       by someone else". This is the race the relational table exists for.
     **AMENDMENT (EXECUTE, 27-08-26).** "recompute `isFullySigned`" above is ambiguous and reads
     naturally as "on the list you already loaded" — which is the bug this module exists to
     prevent: the last signatory would never flip the review to `COMPLETED`. It must be
     recomputed from the rows RE-READ inside the transaction, AFTER the insert. Shipped that
     way, and the mutation check that proves it is
     `AC10 … > stays SIGNING through every slot but the last, then flips to COMPLETED on it`.

     Three cases item 141 omits, all built as trust-boundary work: a `404` for a missing review,
     a `409` for an unparseable `templateSnapshot`, and `typedName` validation (trimmed,
     non-empty, ≤200 — the column is `VarChar(200)`). Item 140's citation of
     `backup/run.ts:228-243` has drifted to **231-244**. Item 142's return shape was unspecified;
     it returns `{ reviewId, employeeId, employeeName, departmentName, cycleName, slot }`, and
     `resolveSlotHolders`' `review` argument is an exported structural `SignoffReview` type
     rather than a Prisma payload type, so its two callers are not forced into identical selects.

     `attestSignoff` gained an `organizationId` parameter in section 7C. Cross-tenant writing was
     already closed by the holder check, but the unscoped lookup let a cross-org caller tell
     "exists" from "does not exist" by 409-vs-404, and every other reader in the file scopes.

142. `src/lib/server/services/performance.ts` — add
     `listStalledSignoffs(organizationId)`: reviews in `SCORED`/`SIGNING` whose next slot
     resolves to zero holders. **A separate view from the unreviewable list, deliberately**
     (SPEC AC12 rationale: unreviewable = never created; stalled = exists and in progress).
143. `src/routes/(app)/performance/reviews/[id]/+page.server.ts` — add an `attest` action;
     `load` returns `nextSlot` and `mayIAttest` computed from the same
     `nextSignatorySlot` + `resolveSlotHolders` pair.
144. `src/routes/(app)/performance/reviews/[id]/+page.svelte` — the signature block: every slot
     in order, each showing typed name + date once attested, and a typed-name input + Attest
     button **only** on the slot where `mayIAttest` is true. A slot with no holder renders
     "No one is assigned to this role — HR must resolve this."
145. `src/routes/(app)/performance/+page.server.ts` + `+page.svelte` — add the HR stalled-sign-off
     section behind `ADMINISTER_HR_ORGWIDE`.
146. Also allow HR to set a department head: `src/routes/(app)/settings/departments` (or wherever
     departments are edited — **grep for the department edit surface before writing this item's
     code**; if none exists, add the field to the employee page as `headOf`). Guard
     `ADMINISTER_HR_ORGWIDE`. The service must verify `head.departmentId === department.id` and
     `head.organizationId === department.organizationId` on write (Postgres cannot express it —
     the same rule `Employee.reportsToId` carries at `schema.prisma:446-448`).
     **AMENDMENT (EXECUTE, 27-08-26).** Three corrections, all found by the grep this item asked
     for:
     - **The path is wrong.** `src/routes/(app)/settings/departments` does not exist. The real
       edit surface is `src/routes/(app)/departments`, whose Members panel (#71) already lists
       the people a head must be drawn from. The `headOf`-on-the-employee-page fallback was not
       needed. Shipped as the `setHead` action there.
     - **The `reportsToId` citation drifted** — that rule is at `schema.prisma:454-456`, not
       446-448.
     - **The plan did not anticipate the ACTIVE-only roster.** The page filters employees to
       `employmentStatus: 'ACTIVE'`, so a sitting head who goes `ON_LEAVE` would vanish from the
       picker and the next save would silently clear the column. `listDepartments` now includes
       the head, and the picker keeps them as an option when they are off the active roster.
     The page `load` keeps its existing `MANAGE_HR` (raising it would take the Members panel away
     from MANAGER, out of scope) and returns `canSetHead` so a MANAGER never sees a control that
     always 403s.
147. Create `tests/unit/performance-signoff.test.ts` — SPEC AC10, AC12, AC13: COMPLETED is blocked
     while any required signatory is missing; reordering a template's list changes future reviews
     and not past ones (against the snapshot); the missing-role case appears in
     `listStalledSignoffs` and disappears once a head is assigned; the attestation row shape is
     typed name + timestamp with no signature blob field.
148. Extend `tests/unit/performance-signoff-order.test.ts` at the **service** level: an
     out-of-turn `attestSignoff` throws 409 **and** — the negative control — the review's
     `status` is unchanged and no `ReviewSignoff` row was created. Asserting only the throw
     would pass even if the row were written first (all-tests.md discipline: assert something
     positive and keep a negative control).
149. `pnpm test`, `pnpm check` — green.

---

### PHASE 8 — Release gate and API-layer redaction (deploys with Phase 6)

150. `src/lib/server/services/performance.ts:45-49` — **upgrade `redactHrAuthored`** from item
     126's unconditional null to the release-gated form:
     ```ts
     // #178 AC6: the employee sees NOTHING the evaluator or HR authored until HR releases it.
     // `answers` holds every such entry and nothing else — that is why redaction is one
     // assignment and not a field list. `selfAssessment` and `employeeComments` are the
     // employee's own and are never touched. Renamed from the #179 two-field version.
     export function redactForSubject<T extends {answers: unknown; releasedAt: Date|null; …}>(review: T): T
     ```
     Keep the old name as well **only if** removing it would churn call sites unnecessarily —
     prefer renaming and fixing the three call sites (`+page.server.ts:53`,
     `reviews/[id]/+page.server.ts:36`, `api/v1/performance/reviews/+server.ts` from item 127),
     plus the mock at `tests/unit/review-privacy.test.ts:31`.
151. `src/lib/server/services/performance.ts` — add `releaseReview(id, organizationId, userId, ctx)`:
     `ADMINISTER_HR_ORGWIDE` enforced at the action; the service org-scopes via
     `cycle.organizationId` (the only path — `PerformanceReview` has no org column, digest §1);
     sets `releasedAt` + `releasedByUserId`; **idempotent** — a second release is a no-op that
     does not overwrite the first attribution; audits
     `entityType: 'PerformanceReview'`, `action: 'UPDATE'`, `newValue: { releasedAt, releasedByUserId }`;
     notifies the employee.
152. `src/routes/(app)/performance/reviews/[id]/+page.server.ts` — add the `release` action with
     `requireAnyCapability(roles,'ADMINISTER_HR_ORGWIDE')` as its first line, and update the
     `load` redaction at `:36` to the gated function.
153. `src/routes/(app)/performance/reviews/[id]/+page.svelte` — the Release button for HR (with
     an "released by X on Y" line once set), and, for a subject viewing an unreleased review, an
     explicit "Your evaluator's entries are not yet released by HR" message rather than a blank
     form (an empty form is indistinguishable from a bug).
154. Create `tests/unit/performance-release.test.ts` — SPEC AC7: `MANAGER` is rejected
     (**the `MANAGE_HR`-includes-`MANAGER` trap** — mutation-check by swapping to `MANAGE_HR`
     and confirming the MANAGER case goes red); `HR_ADMIN` succeeds; audit attribution is
     written; a second release is idempotent and does not change `releasedByUserId`.
155. **Rewrite** `tests/unit/performance-redact.test.ts` — SPEC AC6, field by field, for the
     full withheld set: unreleased → `answers === null`; released → `answers` intact;
     `selfAssessment` and `employeeComments` visible in both states; the shared header
     (employee, department, period, evaluator, date) visible in both; input not mutated.
156. Extend `tests/unit/review-privacy.test.ts` — SPEC AC8 + AC9: add an API-route-level case
     (not just page-load level) and re-prove the MANAGER non-participant 403 against a
     template-based review. **Its `vi.mock` export list at `:29-35` must be updated again** for
     the Phase 7 and 8 additions.
157. `pnpm test`, `pnpm check` — green.
158. Live verification, before **and** after, same script, with negative controls on both sides
     (this repo's standing rule): log in as the reviewed employee via
     `POST /api/v1/_dev/login-as`, load `/performance/reviews/{id}` and
     `GET /api/v1/performance/reviews`, and assert the rating text is **absent from the DOM and
     the JSON** — while a positive control (the employee's own comments) is **present**, proving
     the probe can see anything at all. Then release, and assert the rating text appears.

---

### PHASE 9 — Reminders cron and real SMTP email

Email seam:
159. `pnpm add nodemailer` and `pnpm add -D @types/nodemailer`. **pnpm, never npm.**
     One dependency, vendor-neutral SMTP, chosen over a provider SDK so credentials are the
     user's own mail host.
160. Create `src/lib/server/mailer.ts`:
     ```ts
     // The single delivery point behind every send* in src/lib/server/notifications.ts.
     // UNCONFIGURED IS THE NORMAL CASE, not an error: with no SMTP_HOST this logs the same
     // [NOTIFY] line the stubs logged before and returns. It MUST NEVER THROW — a mail
     // outage must not fail the HTTP request that triggered it.
     export function deliver(to: string, subject: string, body: string): void
     ```
     Fire-and-forget: builds the transport lazily on first configured use, sends, and
     `.catch(e => console.error('[NOTIFY] delivery failed:', e.message))`.
     **Deliberately returns `void`, not a Promise** — every existing `send*` in
     `notifications.ts` is a synchronous `void` function called without `await` (`:7`, `:32`,
     `:40`, `:44`, `:156`, `:165`). Making them async would change every call site across
     onboarding, timesheets, leave, recruitment and offboarding for no benefit. Shortest
     working diff.
161. Env vars, added to `.env.dev` (**there is no `.env`**): `SMTP_HOST`, `SMTP_PORT`
     (default 587), `SMTP_SECURE` (default false), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
     Absent `SMTP_HOST` = unconfigured = console fallback. Document all six in
     `scripts/README.md` and in the mailer's header comment. **Never commit `.env.dev` secrets.**
162. `src/lib/server/notifications.ts` — route `sendWelcomeEmail:7`,
     `sendDiscordInviteEmail:32`, `sendTimesheetStatusEmail:40`, `sendLeaveStatusEmail:44`,
     `sendInterviewScheduledEmail:156`, `sendOffboardingNoticeEmail:165` through `deliver`.
     The `build*` functions already produce `{subject, body}`; the three `send*` that do not
     have one (`sendWelcomeEmail`, `sendTimesheetStatusEmail`, `sendLeaveStatusEmail`) get a
     minimal inline subject/body. **`sendWelcomeEmail` must still never put the password in the
     body** — `:3-6` says so explicitly and that constraint now matters more, not less, because
     the text leaves the process.
163. `src/lib/server/notifications.ts` — add `buildReviewNotice(kind, d)` returning
     `{subject, body}` for the two email-carrying triggers (opened, overdue), plus
     `sendReviewNoticeEmail(recipient, kind, d)`. Follows the stated `build*`-is-tested /
     `send*`-delivers convention (`:13-14`, `:53-55`, `:122-124`).

Pure planner:
164. Create `src/lib/server/performance/reminder-plan.ts` — **no DB, time is an argument.**
     ```ts
     export type ReminderKind = 'opened' | 'due-soon' | 'overdue' | 'awaiting-ack'
     // Returns at most ONE reminder per review per run — the most urgent one — so a stale
     // review does not generate three notifications on the same tick.
     export function remindersDue(
       reviews: {id; status; createdAt; completedAt; lastReminderAt; lastReminderKind}[],
       cfg: {dueDays: number},
       now: Date
     ): {reviewId: string; kind: ReminderKind}[]
     ```
     Channel split (SPEC AC16, a carried-forward assumption): `opened` and `overdue` →
     in-app **and** email; `due-soon` and `awaiting-ack` → in-app only. **The channel decision
     lives in this pure module**, not in the shell, so it is unit-testable.
     De-duplication: skip a review whose `lastReminderKind` already equals the computed kind.
165. Create `tests/unit/performance-reminders.test.ts` — SPEC AC16: one case per trigger point,
     each asserting **which channels fire**; the de-duplication case (same kind twice in a row
     yields nothing the second time); the escalation case (`due-soon` then `overdue` does fire).
166. Create `tests/unit/review-notice-email.test.ts` — the `buildReviewNotice` wording for both
     email kinds, matching the pattern of `tests/unit/interview-email.test.ts` and
     `tests/unit/offboarding-notice.test.ts`.

Cron shell:
167. Create `scripts/send-review-reminders.ts` — thin IO shell. Loads open reviews per org,
     calls `remindersDue`, fans out `notify(...)` with kind `PERFORMANCE` and, for the two email
     kinds, `sendReviewNoticeEmail(...)`. Writes `lastReminderAt` / `lastReminderKind`.
     Supports `--dry-run`. **No audit row** — a reminder is not a domain mutation, and the
     `lastReminderAt` column is the durable record (the same reasoning `backup-documents.ts:16-20`
     documents for skipping audit).
168. **Advisory lock: re-evaluated here and still skipped.** This job runs several times a day
     from one crontab line, so overlap needs two runs of the same script alive at once. The
     de-duplication column makes a genuine overlap produce at worst one duplicate notification,
     which is harmless — versus the connection-pinning trap (`backup/plan.ts:126`) a session lock
     would add. If the job ever grows past a minute of runtime, revisit.
169. `scripts/README.md` — add the reminder crontab entry, again with the by-hand warning:
     ```text
     0 */6 * * *  cd ~/repos/Veent_HRIS && docker compose run --rm app pnpm exec tsx scripts/send-review-reminders.ts >> /var/log/veent-review-reminders.log 2>&1
     ```
170. `pnpm test`, `pnpm check`, `pnpm lint` — green.
171. **After adding a production dependency (`nodemailer`), load an affected page in a real
     browser before calling the work done** (all-tests.md discipline). `papaparse` shipped a
     500 on every `/attendance` visit while 1432 unit tests passed. Load `/performance` and
     `/performance/reviews/{id}` in a browser against the user's dev server and confirm no SSR
     error.
172. Live: `tsx scripts/send-review-reminders.ts --dry-run` with `SMTP_HOST` unset prints the
     `[NOTIFY]` fallback lines and **does not throw**.

---

## 8. The Template Builder — component structure and contracts

The owner's words: *"a template for how evals should go… we only provide the platform for easier
creation of documents."* An **Add Template** surface where HR composes the form from input fields.

**A UI pass runs separately before implementation** (standing repo rule). This section specifies
structure, data flow, and the server contract. It deliberately does **not** specify visual styling
beyond "existing Tailwind v3 HSL tokens from `src/app.css`, no new token system".

### 8.1 Component tree

```
templates/[id]/+page.svelte                  ← owns ALL state, one $state object
  TemplateMetaFields.svelte                  ← name, isActive
  RatingScaleEditor.svelte                   ← repeatable {value, description} rows
  SectionList.svelte                         ← repeatable sections, reorderable
    SectionEditor.svelte                     ← name, weightLabel, maximum (Int|null)
      CriterionList.svelte                   ← repeatable {text} rows, reorderable
  InterpretationBandEditor.svelte            ← repeatable {rangeLabel, label} rows
  NarrativeBlockEditor.svelte                ← repeatable {label} rows
  RecommendationEditor.svelte                ← repeatable {label, allowsFreeText} rows
  KpiEditor.svelte                           ← repeatable {indicator, target} rows, optional block
  SignatoryOrderEditor.svelte                ← repeatable {role, label}, ORDER IS THE DATA
```

Nine components rather than one page, for one reason: every one of them is the same
add/remove/reorder interaction over a different row shape, and one file holding nine of those is
unreviewable. **No shared generic `<RepeatableRows>` abstraction** — the row shapes differ enough
that the generic version would need a slot per field type, which is more code than the nine
concrete editors. (Ponytail: rung 6, minimum code that works; revisit only if a tenth row type
appears.)

### 8.2 State and data flow

- The page holds **one** `$state` object mirroring `TemplateStructure` exactly. Children receive
  their slice via `$props()` and mutate it directly (Svelte 5 deep reactivity on `$state`).
  No event-bubbling layer, no store.
- `$derived` is used only for display counts ("6 criteria"). **`$derived` must never compute a
  score-like value** — see item 131's comment rule.
- On submit the page serializes the whole `$state` object to a single hidden `structure` form
  field as JSON, POSTs to `?/updateTemplate`, and the action runs `templateStructureSchema`.
  One field, one parse, one failure mode. (Alternative rejected: one form field per row, which
  needs index-encoded names like `sections[0].criteria[2].text` and a bespoke parser.)

### 8.3 The three repeatable interactions, specified

| Interaction | Behaviour | Id rule |
|---|---|---|
| **Add** | appends a blank row to the array | client generates a new id via `newId()` immediately, so the row is addressable before its first save |
| **Remove** | splices the row out; requires a confirm **only** when the template already has open reviews snapshotted against it (the page load supplies that count) — otherwise no confirm | the id is discarded. Already-open reviews are unaffected: they hold a snapshot |
| **Reorder** | up/down buttons, not drag-and-drop | ids are unchanged. Order is array order. **Buttons over drag: drag-and-drop needs a library or ~120 lines of pointer handling, and is not keyboard-accessible without extra work. Up/down is accessible by default.** (Ponytail: rung 5.) |

**Accessibility is not a shortcut candidate:** every row control has a label naming its row
(`aria-label="Move Sales Performance up"`, not `"Move up"`), and the remove button is a real
`<button>` with an accessible name. The plan's build-bias note explicitly exempts accessibility.

### 8.4 Server contract

```
GET  /performance/templates            → { templates: {id,name,isActive,sectionCount}[] , backfillCount }
POST /performance/templates ?/createTemplate
       body: name, structure (JSON string)
       → 403 unless ADMINISTER_HR_ORGWIDE · 422 on schema failure · redirect to [id] on success
GET  /performance/templates/[id]       → { template, openReviewCount }
POST /performance/templates/[id] ?/updateTemplate
       body: name, isActive, structure (JSON string)
       → 403 / 422 / { saved: true }
GET  /api/v1/performance/templates     → { results: Template[] }        (401 + ADMINISTER_HR_ORGWIDE)
POST /api/v1/performance/templates     → { template } 201               (401 + ADMINISTER_HR_ORGWIDE)
```

**Zero code changes to add a third template next year:** HR opens `/performance/templates`,
clicks Add Template, composes it, and assigns it on the employee page. Nothing in `src/` knows
the names "Account Executive" or "Admin Staff" outside `prisma/seed-performance-templates.ts`.

---

## 9. Seed content for the two templates

Both from `docs/references/Copy of Veent Tix Performance Evaluation_*.md`. Shared across both:
the 5→1 rating scale verbatim, the six interpretation bands verbatim (95-100 Outstanding,
90-94 Very Good, 85-89 Good, 80-84 Satisfactory, 75-79 Needs Improvement, Below 75
Unsatisfactory), `totalCeiling: 100`, the three narrative blocks, the six recommendation options
(the sixth, "Other", with `allowsFreeText: true`).

**AE** — 6 sections:

| # | Name | `weightLabel` | `maximum` | criteria |
|---|---|---|---|---|
| 1 | SALES PERFORMANCE | 35% | 30 | 6 |
| 2 | CLIENT RELATIONSHIP MANAGEMENT | 20% | 25 | 5 |
| 3 | PRODUCT KNOWLEDGE & PRESENTATION | 15% | **null** | 5 |
| 4 | COMMUNICATION & PROFESSIONALISM | 10% | 25 | 5 |
| 5 | TEAMWORK & COLLABORATION | 10% | 25 | 5 |
| 6 | ADMINISTRATIVE COMPLIANCE | 10% | 25 | 5 |

Section 3 has **no printed subtotal line** in the source document (`_AE.md:46-54` — the
`Subtotal:` line is simply absent). `maximum: null` reproduces that faithfully: the form prints
no subtotal for that section and captures none. This is the cheapest correct answer to the SPEC's
"Non-Blocking Data Note" — **zero code, and HR can type a maximum in the builder the moment they
decide they want one.** Do not invent `/25`.

**Admin Staff** — 5 sections, weights **confirmed by the owner as 30 / 20 / 20 / 15 / 15**
(SPEC "Non-Blocking Data Notes"; this supersedes the document's own contradictory 10%-vs-15% on
Section 4):

| # | Name | `weightLabel` | `maximum` | criteria |
|---|---|---|---|---|
| 1 | ADMINISTRATIVE OPERATIONS | 30% | 30 | 6 |
| 2 | DOCUMENTATION & RECORDS MANAGEMENT | 20% | 25 | 5 |
| 3 | OFFICE SUPPORT & COORDINATION | 20% | 25 | 5 |
| 4 | COMMUNICATION & PROFESSIONALISM | 15% | 25 | **6, verbatim** |
| 5 | POLICY COMPLIANCE & WORK ETHICS | 15% | 25 | 4 |

Sections 4 and 5 carry the document's printed maxima verbatim (`/25` each), including Section 4's
apparent duplicate criterion "Professional communication" (`_Admin Staff.md:96`) and Section 5's
4-criteria-against-`/25` mismatch. **Seed exactly what the document says.** These are printed
labels, nothing computes against them, and HR fixes them in the builder in seconds. Inventing a
"corrected" value here would be the app making an HR judgement it was explicitly told not to make.

Admin Staff also carries `kpiRows` — the 8 operational KPIs at `_Admin Staff.md:170-188`,
`target` as free text verbatim ("100%", "≥99%", "Within 24 hours", …). AE has no `kpiRows`.

**`signatoryOrder` for both** — deliberately NOT the paper document's top-to-bottom layout
(which lists Employee first). Sequential signing means first-listed signs first, and the employee
should attest **after** they can see what they are signing (SPEC "Behavioral Outcomes"):

```
1. IMMEDIATE_SUPERVISOR   2. HR_REPRESENTATIVE   3. DEPARTMENT_HEAD   4. EMPLOYEE
```

**Sample data is NOT seeded.** The AE document's filled-in employee name, immediate head, and
evaluation period (`_AE.md:6-10`) are treated as a filled example of a blank form and are
excluded, whether or not they name a real person.

---

## 10. Backfill and Rollout

### 10.1 Template-assignment backfill — real work, its own verification

Every existing employee needs `assignedTemplateId` set before the first generated cycle covers
them. This is **HR's manual decision per employee**, not something the app may guess (SPEC AC2:
never inferred from department, position, or role).

| Step | Who | Verification |
|---|---|---|
| B1. Ship Phase 3 — the two templates exist in every org | agent | `select organizationId, name from performance_templates` shows both per org |
| B2. Ship Phase 4 — the assignment field and the readiness count are live | agent | `/performance` shows "N active employees have no assigned template" |
| B3. **HR assigns a template to every active employee** | **the user / HR** | the readiness count reaches 0, or HR accepts a known non-zero remainder |
| B4. Only then enable cadence generation | user | `PerformanceConfig.enabled = true`, or leave the default and install the crontab |

**B3 is a hard gate on the value of Phase 5, not on shipping it.** The generator runs safely with
zero templates assigned — it produces a cycle whose every employee lands on the unreviewable list
with reason `no-template-assigned`, which is exactly the designed behaviour. **The count is
informational; the code never blocks on it** (SPEC AC3: "not a blocking gate").

**No automated backfill script.** A script would have to pick a template per employee, and every
available signal (department, position, role) is explicitly forbidden as an input. A script that
assigns everyone the same template is worse than a visible zero — it looks done and is wrong.

### 10.2 In-flight data

| Existing data | What happens |
|---|---|
| existing `review_cycles` rows | untouched. The new `@@unique` applies going forward; item 62 checks for pre-existing duplicates before the push |
| existing `performance_reviews` rows | keep `selfAssessment` / `managerComments` / `overallRating`. `templateSnapshot` and `answers` are **null** for them |
| **rendering a pre-#178 review** | `templateSnapshot === null`. The detail page **must** fall back to the legacy three-field layout rather than crash. Item 130's defensive parse covers the malformed case; **a null snapshot is a separate, expected branch.** Add it explicitly and test it |
| rows holding `MANAGER_REVIEW` | expected to be zero (digest §1). Item 61's script counts them and renames the value in place either way |
| `audit_logs` with `entityType='Goal'` | survive. Not FK-linked. Keep rendering in the audit log (item 49 proves the count is unchanged) |
| existing `Notification` rows | unaffected; `PERFORMANCE` is a pure enum addition |
| `redactHrAuthored` callers | three today (`+page.server.ts:53`, `reviews/[id]/+page.server.ts:36`, and — newly — the API route). Item 150 renames it; all four sites plus the mock at `review-privacy.test.ts:31` change together |

### 10.3 What the droplet needs

**Two crontab lines, installed BY HAND.** `scripts/README.md:190-200` states the rule:
`deploy.yml` does `git reset --hard origin/main` and **will not create them**. They are recorded
in `scripts/README.md` (items 100 and 169) purely so they are recoverable if the box is rebuilt.

```text
0 2   * * *  cd ~/repos/Veent_HRIS && docker compose run --rm app pnpm exec tsx scripts/generate-review-cycles.ts  >> /var/log/veent-review-cycles.log 2>&1
0 */6 * * *  cd ~/repos/Veent_HRIS && docker compose run --rm app pnpm exec tsx scripts/send-review-reminders.ts    >> /var/log/veent-review-reminders.log 2>&1
```

Plus: the six `SMTP_*` env vars on the droplet, and the seeded `system@veent.ph` user (the cycle
generator exits 1 without it — `AuditLog.actorId` is a non-nullable FK).

Deploy sequence per phase that touches the schema:

```
P1: migrate-drop-goals.ts  →  prisma db push  →  app restart
P2: migrate-review-status-scored.ts  →  prisma db push  →  app restart  →  db:seed:templates
```

---

## 11. Test Plan by Tier

Context chain loaded: `process/context/tests/all-tests.md` (its "Quick Routing" states there are
no deeper test docs yet). Existing blast-radius test files discovered:
`tests/unit/performance-redact.test.ts`, `tests/unit/review-privacy.test.ts`,
`tests/e2e/form-errors.spec.ts`, `tests/e2e/global-setup.ts`.

Runners: `pnpm test` (vitest, 154 files / ~1737 tests / ~35s), `pnpm test:e2e` (Playwright,
36 specs, flaky per #287), `pnpm check`, `pnpm lint`, `pnpm format:check`.

### 11.1 Area: `src/lib/server/performance/` — the pure modules

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | schema accepts both seeded structures, rejects 6 malformations | `pnpm test tests/unit/performance-template-schema.test.ts` exits 0 | the JSON contract is enforced at the only place Postgres cannot | that every write path actually calls it |
| Fully-automated | `answersSchemaFor` boundaries (rating/subtotal/total, at-max vs one-over) | `pnpm test tests/unit/performance-capture-validation.test.ts` | SPEC AC5 range validation | that the UI surfaces the rejection readably |
| Fully-automated | `isCycleDue` / `nextCyclePeriod` — default, changed, retroactive, idempotent, missed-boundary | `pnpm test tests/unit/performance-cycle-plan.test.ts` | SPEC AC14, AC15 | that the cron shell calls them correctly |
| Fully-automated | `addUTCMonths` month-end, year-boundary, negative | `pnpm test tests/unit/dates-add-utc-months.test.ts` | the UTC basis is stable | nothing about the Manila-basis half |
| Fully-automated | `nextSignatorySlot` in-order / out-of-turn / exhausted | `pnpm test tests/unit/performance-signoff-order.test.ts` | SPEC AC11 turn logic | that the service actually calls it before writing |
| Fully-automated | `remindersDue` channel split + de-duplication + escalation | `pnpm test tests/unit/performance-reminders.test.ts` | SPEC AC16 | that an email is delivered |
| **Known gap** | there is nothing to unit-test in a scoring engine — **because there is no scoring engine** | — | — | this is the correct and intended state, not missing coverage. `performance-no-scoring.test.ts` proves the absence |

**Failing stubs (TDD red-first, for the validate-contract's Test Gates section):**
```
test("rejects a section subtotal one over the section maximum", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: rejects a section subtotal one over the section maximum")
})
test("isCycleDue produces exactly one cycle after a missed boundary", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: isCycleDue produces exactly one cycle after a missed boundary")
})
test("nextSignatorySlot rejects an out-of-turn signatory", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: nextSignatorySlot rejects an out-of-turn signatory")
})
```

### 11.2 Area: `src/lib/server/services/` — services and guards

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | template CRUD 403s MANAGER, passes HR_ADMIN | `pnpm test tests/unit/performance-templates-rbac.test.ts` | `ADMINISTER_HR_ORGWIDE`, not `MANAGE_HR` | a query-level tenancy hole — unit tests mock the DB |
| Fully-automated | RELEASE 403s MANAGER, audits, is idempotent | `pnpm test tests/unit/performance-release.test.ts` | SPEC AC7 | that the gate is the *only* thing flipping visibility |
| Fully-automated | subject redaction, field by field, released vs not | `pnpm test tests/unit/performance-redact.test.ts` | SPEC AC6 | DOM-level absence |
| Fully-automated | API `asSubject` redacted | `pnpm test tests/unit/performance-api-redaction.test.ts` | SPEC AC8 | the page-load path |
| Fully-automated | MANAGER non-participant 403 on a template review | `pnpm test tests/unit/review-privacy.test.ts` | SPEC AC9 (#282 §3-B preserved) | — |
| Fully-automated | out-of-turn `attestSignoff` throws 409 **and** writes no row and changes no status | `pnpm test tests/unit/performance-signoff-order.test.ts` | SPEC AC11 server-side enforcement | that a real concurrent race hits the `@@unique` |
| Fully-automated | stalled sign-off appears, then clears when a head is assigned | `pnpm test tests/unit/performance-signoff.test.ts` | SPEC AC10, AC12, AC13 | — |
| Fully-automated | template snapshot is not refreshed after a template edit or a reassignment | `pnpm test tests/unit/performance-template-versioning.test.ts` | SPEC AC20 | — |
| Fully-automated | assignment resolves only from the explicit field | `pnpm test tests/unit/performance-template-assignment.test.ts` | SPEC AC2 | — |
| Fully-automated | backfill readiness count | `pnpm test tests/unit/performance-template-backfill-check.test.ts` | SPEC AC3 | — |
| **Hybrid** | `@@unique([reviewId, slotId])` genuinely rejects a concurrent duplicate | two concurrent `attestSignoff` calls against the user's running `veent-db-5434`; precondition: DB up, one open review | the race guard is real, not just declared | nothing about the UI |
| **Hybrid** | `@@unique([organizationId,startDate,endDate])` rejects a double-create | run `generate-review-cycles.ts` twice; precondition: DB up | SPEC AC15 at the DB level | — |

**Mutation checks (each is a hypothesis until run — all-tests.md discipline #1):**
1. swap the template guard `ADMINISTER_HR_ORGWIDE` → `MANAGE_HR`; the MANAGER case must go red.
2. swap the release guard the same way; the MANAGER case must go red.
3. remove `.map(redactHrAuthored)` from the API route; `performance-api-redaction.test.ts` must go red.
4. remove the out-of-turn check from `attestSignoff`; `performance-signoff-order.test.ts` must go red.
5. **the no-scoring gate (item 134) — the highest-stakes guard in this plan, and the one most
   likely to be quietly defeated.** Temporarily add an exported `computeScore` stub in
   `src/lib/server/performance/`, run the suite, and confirm `performance-no-scoring.test.ts` goes
   red; then revert, temporarily add a `.reduce(` in `reviews/[id]/+page.svelte`, and confirm it
   goes red again. **Both halves**, because the test has two independent detection paths (the
   identifier regex over `src/` and the `.reduce(` check on one file) and one can rot while the
   other still fires. Revert both stubs before the phase closes.
If any stays green, that test is vacuous and must be rewritten before the phase closes.

### 11.3 Area: routes and UI

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| Fully-automated | `/performance` loads for every seeded role | `pnpm test:e2e tests/e2e/global-setup.ts` route smoke (`:22`, **unmodified**) | SPEC AC19 | anything about the form's content |
| Fully-automated | the action-failure alert banner still renders | `pnpm test:e2e tests/e2e/form-errors.spec.ts` — **replaced** per item 117 | #106 regression guard survives | — |
| **Hybrid** | both templates render as two visibly different forms, weights/maxima/bands as labels | new `tests/e2e/performance-form.spec.ts`; precondition: dev server + seeded templates (**the user starts the server**) | SPEC AC1 end to end | — |
| **Hybrid** | as the reviewed employee, withheld fields are **absent from the DOM**, not merely hidden | same spec, logged in as the subject | SPEC AC6 at the render layer | the API layer (covered by 11.2) |
| **Agent-probe** | the builder's add/remove/reorder actually work and are keyboard-reachable | drive `/performance/templates/[id]` with Playwright MCP + `POST /api/v1/_dev/login-as`; add a section, add two criteria, reorder, remove one, save, reload, confirm persistence; then Tab through the row controls | the repeatable interactions are usable | pixel-level layout |
| **Agent-probe** | a screenshot of a rendered AE review looks like the paper form | load and look at it | assertions do not see layout (all-tests.md discipline #3) | — |

**Known gap, named:** there is **no** `tests/e2e/performance-form.spec.ts` today and the e2e suite
is flaky (#287). Resolution chosen: **A — write it** (Phase 6, ~1h), because SPEC AC1 and AC6 both
name it. If it proves too flaky to gate on, downgrade to agent-probe and file a backlog stub
rather than deleting it.

### 11.4 Area: `scripts/` and migrations

**High-risk class: schema/data migration + destructive writes. Hybrid is the minimum tier and no
known-gap is accepted.**

| Tier | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|
| **Agent-probe** (cost-class: needs-container) | `migrate-drop-goals.ts` runs clean against a disposable DB and touches nothing else | run against a **disposable** copy — never the shared dev DB; capture `\dt` before and after; capture `select count(*) from audit_logs where "entityType"='Goal'` before and after | SPEC AC18 | production behaviour |
| **Agent-probe** | `migrate-review-status-scored.ts` renames in place and preserves every row | same disposable DB; `select status, count(*) from performance_reviews group by 1` before and after | the enum rename is non-destructive | — |
| **Hybrid** | `generate-review-cycles.ts --dry-run` writes nothing | run it; `select count(*) from review_cycles` unchanged | the dry-run flag is honest | that a real run is correct |
| **Hybrid** | a real generation creates one cycle + N snapshotted reviews | run it; assert the row count and that every new review has a non-null `templateSnapshot` | the shell wires the pure planner correctly | — |
| **Hybrid** | `send-review-reminders.ts` with `SMTP_HOST` unset falls back to console and does not throw | run it; exit code 0, `[NOTIFY]` lines present | the unconfigured path is safe | real deliverability |
| **Known gap** | real SMTP deliverability | — | — | needs user-supplied credentials; SPEC "Out Of Scope". **Backlog stub required** (see below) and the email gate stays CONDITIONAL |

**Known-gap backlog stub (required — a known-gap is a recorded residual, never a terminal PASS):**
create `process/features/performance-eval-bimonthly-178/backlog/smtp-deliverability_NOTE_{date}.md`
recording that real-inbox delivery is unproven, what would settle it (one successful send to a real
address with the droplet's `SMTP_*` set), and that the reminder-email gate stays **CONDITIONAL**
until then.

**`pnpm check` does not cover `prisma/**` or `scripts/**`** (all-tests.md "Known Gaps"; #282
shipped a broken site on that assumption). Every new script therefore gets a manual read-only pass
before its first real run — no exceptions.

### 11.5 Tests destroyed or coupled by this work

| File | Fate | Item |
|---|---|---|
| `tests/e2e/form-errors.spec.ts:37-60` | **REPLACED, never deleted.** Its premise dies with the goal form (item 30) and the cycle form (item 103). It is the only regression guard for #106 on this surface | 44, 117 |
| `tests/unit/review-privacy.test.ts:29-35` | its `vi.mock` lists the performance module's exports **verbatim**; the import breaks the moment that list changes. Updated three times: P5 (item 116), P7, P8 (item 156). Its `vi.hoisted` + `vi.mock('$lib/server/db')` harness at `:17-35` is worth reusing in the new service tests | 116, 156 |
| `tests/unit/performance-redact.test.ts` | extended in P6 (item 135), **rewritten** in P8 (item 155) for the whole-document gate. It references `cycle` in the review shape at `:18`/`:31` — `ReviewCycle` survives, so that part is safe | 135, 155 |
| `tests/e2e/global-setup.ts:22` | **unmodified.** Survives as long as `/performance` loads | — |

---

## 12. Risks, Predictions, and Open Risks

### 12.1 Resolved during planning

**R-1 — `Department` has no head field. RESOLVED by adding one.**
`prisma/schema.prisma:372-390` has no `headEmployeeId`. Both seeded templates require a
`DEPARTMENT_HEAD` signature. Without the column, **every review would be permanently stalled**
and SPEC AC12's "resolving the gap unblocks it" case would be untestable — the feature would ship
unable to complete a single review. Item 58 adds one nullable column; item 146 gives HR a way to
set it. This was not in the research digest and is the single most consequential finding of this
planning pass.

**R-2 — the Phase 6 leak window. RESOLVED by welding P6 to P8** (§2 Correction 3).

**R-3 — `prod-delete.ts` positional destructure. RESOLVED by §7.0** making items 37 and 38 one edit
with an explicit count assertion.

**R-4 — timezone basis. RESOLVED** by naming both bases in a table (§Phase 5) and requiring the
basis to be commented at each point of use. #320 burned this codebase by mixing them silently.

**R-5 — the `MANAGE_HR`-includes-`MANAGER` trap. RESOLVED** by using `ADMINISTER_HR_ORGWIDE` on
every org-wide surface and by mutation-checking two of those guards (§11.2).

### 12.2 Open risks I could not resolve — and the specific evidence that would settle each

| # | Risk | Evidence that would settle it |
|---|---|---|
| **O-1** | **No database was inspected by RESEARCH** (digest §5 item 8). Row counts in `goals`, `review_cycles`, `performance_reviews` on staging and prod are unknown, and whether any row holds `MANAGER_REVIEW` is unknown. The `DROP TABLE goals` is irreversible | Run, against staging **and** prod: `select count(*) from goals;`, `select status,count(*) from performance_reviews group by 1;`, and the duplicate-cycle query from item 62. Three numbers. Until they exist, item 43 must not run on any shared database. **Partially closed 2026-08-26:** the local dev DB counted clean — `goals` 0, `review_cycles` 1, `performance_reviews` 0, zero `MANAGER_REVIEW` rows. **CLOSED 2026-08-27 by the owner.** The droplet is a throwaway test deploy, 100+ commits behind and not in real use — it holds no data worth preserving and its schema is replaced by the next deploy. Staging and prod counts are therefore **not required**. **Item 43 is unblocked on every database.** |
| **O-2** | **Duplicate `review_cycles` rows would fail the Phase 2 push.** Nothing prevents them today (digest §1: no `@@unique`) | Item 62's `group by … having count(*)>1`. Zero rows = safe. Any rows = a data decision for the user, not the agent |
| **O-3** | ~~**Nothing in-repo calls `/api/v1/performance/goals`, but external consumers are unverifiable**~~ (digest §5 item 9) | **CLOSED 2026-08-27 by the owner.** The only deploy is the throwaway test droplet, so there is no external consumer to break. Safe to 404 it |
| **O-4** | ~~May one person attest two different signatory slots on the same review?~~ **RESOLVED 2026-08-26 — YES.** The owner confirmed one person may hold several signatory slots (e.g. the immediate supervisor is also the department head); each slot still produces its own `ReviewSignoff` row with its own order, typed name and timestamp | **No code change needed — the design was already correct for "yes".** VALIDATE confirmed `ReviewSignoff` carries `@@unique([reviewId, slotId])` only (§4.1), never `@@unique([reviewId, attestedByUserId])`, and `attestSignoff` (item 141) tests `resolveSlotHolders(slot, review)` membership without cross-referencing any other row's `attestedByUserId`. **Do NOT add the same-signer check this row used to propose** — it would break small orgs |
| **O-5** | **The e2e suite is flaky (#287)** and Phase 6 adds a spec that SPEC AC1 and AC6 both depend on | Run the new spec 10 times consecutively. 10/10 green = gate on it. Anything less = downgrade to agent-probe and file a backlog stub |
| **O-6** | **Real SMTP deliverability cannot be verified in this session** | One successful send to a real inbox with the droplet's `SMTP_*` set. Until then the email gate is CONDITIONAL and the backlog stub in §11.4 stands |
| **O-7** | **The "one reminder per review per run" rule is my choice, not the owner's.** A review that is both overdue and awaiting-acknowledgement sends only the more urgent one | Ask the owner, or accept: the de-duplication columns make reversing it a one-line change in the pure planner |
| **O-8** | **`selfAssessment` and `employeeComments` coexisting may confuse users.** SPEC is explicit that both exist (the app-only stage plus the paper form's field), but no one has seen them side by side | The Phase 6 agent-probe screenshot, reviewed by the owner. If confusing, it is a labelling fix, not a schema change |

---

## 13. Rollback

### 13.1 The two irreversible steps

**`DROP TABLE goals` (item 43).** No undo. Mitigation, in order:
1. **Before running:** `pg_dump -t goals` to a file outside the repo, plus the row count from O-1.
2. The migration script **refuses to proceed without `--confirm` when the count is > 0** (§3.6).
3. If a rollback is needed after the fact: restore the table from the dump, `git revert` the Phase 1
   commits, `pnpm db:push`. The `Goal` model must come back into the schema before the push, or
   push will drop it again.
4. `audit_logs` rows with `entityType='Goal'` are **not** dropped and need no restore.

**`ALTER TYPE "ReviewStatus" RENAME VALUE 'MANAGER_REVIEW' TO 'SCORED'` (item 63).**
Reversible in principle — `ALTER TYPE … RENAME VALUE 'SCORED' TO 'MANAGER_REVIEW'` — but only
while nothing has written `SCORED` to a row. Once Phase 6 ships, `SCORED` means something and the
rename back would mislabel real data. Rollback window: **between Phase 2 and Phase 6.** After
Phase 6, forward-fix only. Write a `scripts/migrate-review-status-scored-revert.ts` alongside the
forward script in Phase 2 — it is 20 lines and it is only cheap to write then.

`SIGNING` cannot be removed by `db push` (removing an enum value needs a type rebuild) — the same
constraint `migrate-employment-type-regular.ts:49-51` documents. Leaving it orphaned is the
accepted rollback outcome.

### 13.2 Per-phase rollback

| Phase | Rollback |
|---|---|
| P1 | `git revert` + restore `goals` from the dump + re-push. See above |
| P2 | `git revert` + the revert script (while the window is open). New tables can be dropped freely — nothing has written to them |
| P3 | `git revert`. Templates in the DB become orphaned rows; harmless |
| P4 | `git revert`. `assignedTemplateId` values become orphaned; harmless |
| P5 | `git revert` + **remove the crontab line by hand** (deploy will not do it) + `delete from review_cycles where "createdAt" > '<deploy time>'` |
| P6+P8 | `git revert` **both together**. Reverting P8 alone reopens the leak |
| P7 | `git revert`. `review_signoffs` rows become orphaned; reviews stall in `SCORED` |
| P9 | `git revert` + remove the crontab line + `pnpm remove nodemailer` |

---

## Touchpoints

**Read every file before editing it. Line numbers below are from the research digest and this
plan's own reads, at branch tip `db04eb6`; re-verify each one.**

### Changed

| File | Lines | Phase |
|---|---|---|
| `prisma/schema.prisma` | 254-260, 262-267, 372-390, 440-500, 493, 1155-1160, 1637-1651, 1653-1674, 1676-1693 | P1, P2 |
| `src/lib/server/services/performance.ts` | 4, 45-49, 117-151, 175-194, 16-38, 198-236, 238-318 | P1, P5, P6, P7, P8 |
| `src/routes/(app)/performance/+page.server.ts` | 4, 8, 9, 10-14, 20, 24, 32, 35, 36, 42-47, 52, 55, 56, 71-82, 85-132, 134-189 | P1, P4, P5, P7 |
| `src/routes/(app)/performance/+page.svelte` | 3, 5, 9, 10-11, 13-15, 19-27, 29-36, 38-43, 53-58, 61-64, 71-130, 132-220, 222-351, 397-429 | P1, P4, P5, P7 |
| `src/routes/(app)/performance/reviews/[id]/+page.server.ts` | 5-11, 14-39, 63-84, 87-89 | P6, P7, P8 |
| `src/routes/(app)/performance/reviews/[id]/+page.svelte` | whole file (rewrite) | P6, P7, P8 |
| `src/routes/api/v1/performance/reviews/+server.ts` | whole file | P6, P8 |
| `src/routes/api/v1/performance/cycles/+server.ts` | POST handler | P5 |
| `src/routes/(app)/employees/[id]/+page.server.ts` | load + new action | P4 |
| `src/routes/(app)/employees/[id]/+page.svelte` | HR section | P4 |
| `src/routes/(app)/+layout.svelte` | 171-175 | P3 |
| `src/lib/utils/dates.ts` | 159-170, new export | P5 |
| `src/lib/components/dashboard/ActivityIcon.svelte` | the `Record<NotificationKind, …>` map | P2 |

**Added 2026-08-27 during EXECUTE Phase 2 — the plan missed this file.** `ActivityIcon.svelte`
holds an **exhaustive** `Record<NotificationKind, …>` icon map, so item 51's pure enum addition
breaks `pnpm check` until the map gains a `PERFORMANCE` entry. Any future `NotificationKind`
value has the same requirement. `NotificationKind` appears in only two files; the other
(`services/notifications.ts`) uses it as a parameter type and needs nothing.

**Also note: every line number in §3.2–§3.4 is stale.** Phase 1 deleted `model Goal` and
`enum GoalStatus`, shifting everything after ~line 1670 upward, and Phase 2 added ~150 lines.
Locate targets by content, not by number.

| `src/lib/server/notifications.ts` | 7, 32, 40, 44, 156, 165, + new builder | P9 |
| `scripts/prod-delete.ts` | 200, 223, 265, 335 | P1 |
| `scripts/clean-e2e-employees.ts` | 86 | P1 |
| `scripts/README.md` | after 230 | P5, P9 |
| `package.json` | scripts + deps | P3, P9 |
| `.env.dev` | six `SMTP_*` vars | P9 |
| `tests/unit/performance-redact.test.ts` | whole file | P6, P8 |
| `tests/unit/review-privacy.test.ts` | 29-35 + new cases | P5, P7, P8 |
| `tests/e2e/form-errors.spec.ts` | 37-60 | P1, P5 |

### Created

`src/lib/server/performance/{types,schemas,cycle-plan,signoff-plan,reminder-plan}.ts` ·
`src/lib/server/services/performance-templates.ts` · `src/lib/server/mailer.ts` ·
`src/routes/(app)/performance/templates/{+page.server.ts,+page.svelte}` ·
`src/routes/(app)/performance/templates/[id]/{+page.server.ts,+page.svelte}` ·
9 builder components under `src/lib/components/performance/` ·
`src/routes/api/v1/performance/templates/+server.ts` ·
`src/routes/(app)/settings/performance/{+page.server.ts,+page.svelte}` ·
`prisma/seed-performance-templates.ts` ·
`scripts/{migrate-drop-goals,migrate-review-status-scored,migrate-review-status-scored-revert,generate-review-cycles,send-review-reminders}.ts` ·
12 new `tests/unit/*.test.ts` · `tests/e2e/performance-form.spec.ts`

### Deleted

`src/routes/api/v1/performance/goals/` (whole directory) · `.svelte-kit/types/.../goals/` (generated)

### Read-only (context, do not edit)

`src/lib/rbac.ts:24-80` · `src/lib/server/rbac.ts:23-26` · `src/lib/server/audit.ts:22-40` ·
`src/lib/server/backup/plan.ts` · `scripts/backup-documents.ts` ·
`scripts/promote-probationary.ts` · `scripts/migrate-employment-type-regular.ts` ·
`src/lib/server/services/notifications.ts` · `src/lib/server/services/awards.ts:61-66` ·
`src/lib/server/backup/run.ts:228-249` · `src/lib/server/services/supervisors.ts` ·
`src/hooks.ts` · `docs/references/Copy of Veent Tix Performance Evaluation_*.md`

---

## Public Contracts

| Contract | Shape | Consumers | Stability |
|---|---|---|---|
| `PerformanceTemplate.structure` JSON | §4.1, `version: 1` | builder, seed, snapshot writer, every renderer | **the load-bearing contract.** Changing it requires a version bump and a snapshot-compat path |
| `PerformanceReview.answers` JSON | §4.2, `version: 1` | capture action, renderer, redaction | **contains only evaluator/HR-authored content.** That invariant is what makes redaction one assignment |
| `PerformanceReview.templateSnapshot` JSON | §4.3 | every renderer, `nextSignatorySlot` | **immutable after creation.** No code path may rewrite it |
| `GET/POST /api/v1/performance/templates` | §8.4 | external | new, 401 + `ADMINISTER_HR_ORGWIDE` |
| `GET /api/v1/performance/reviews` | `{asSubject, asReviewer}` | external | **behaviour change**: `asSubject` is now redacted. A consumer relying on unredacted data breaks — that is the point (AC8) |
| `POST /api/v1/performance/cycles` | — | external | **removed.** Cycles are generated, not created by hand |
| `GET/POST /api/v1/performance/goals` | — | external | **removed, 404.** See open risk O-3 |
| `redactHrAuthored` → `redactForSubject` | §Phase 8 item 150 | 3 call sites + 1 test mock | renamed and re-signatured |
| `openReviewsForCycle` return | `{opened, skipped}` → `{opened, unreviewable}` | the (deleted) HR action, the new cron | changed |
| `ReviewStatus` enum | `MANAGER_REVIEW` → `SCORED`, `+SIGNING` | DB, every status renderer | **enum change — needs the migration script** |
| `send*` in `notifications.ts` | signatures **unchanged** (`void`) | onboarding, timesheets, leave, recruitment, offboarding | deliberately unchanged so P9 touches no other domain |
| `scripts/generate-review-cycles.ts`, `scripts/send-review-reminders.ts` | CLI, `--dry-run` | droplet crontab | new, hand-installed |

---

## Blast Radius

| Dimension | Value |
|---|---|
| Files changed | 23 |
| Files created | ~40 (5 pure modules, 1 service, 9 components, 8 routes, 5 scripts, 1 seed, 13 tests) |
| Files deleted | 2 (+1 generated dir) |
| Packages | single app — `prisma/`, `src/lib/`, `src/routes/`, `scripts/`, `tests/` |
| Prisma models added | 3 (`PerformanceTemplate`, `ReviewSignoff`, `PerformanceConfig`) |
| Prisma models changed | 5 (`ReviewCycle`, `PerformanceReview`, `Employee`, `Department`, `Organization`, `User`) |
| Prisma models deleted | 1 (`Goal`) |
| Enums changed | 3 (`ReviewStatus` rename+add, `GoalStatus` deleted, `NotificationKind` add) |
| Migrations | 2 forward + 1 revert |
| New production dependencies | 1 (`nodemailer`) |
| Crontab lines to install by hand | 2 |
| Env vars to add | 6 |

**Risk class: HIGH.** Four separate high-risk classes are present:

| Class | Where |
|---|---|
| schema/data migration + **destructive** writes | `DROP TABLE goals`, `DROP TYPE GoalStatus`, `ALTER TYPE … RENAME VALUE` |
| permission / trust-boundary logic | the release gate, `ADMINISTER_HR_ORGWIDE` on 8 surfaces, sequential-attestation enforcement |
| public API contract change | `asSubject` now redacted; two endpoints removed |
| new production dependency + secrets | `nodemailer` + six `SMTP_*` credentials |

Consequences of the classification, all already reflected above: hybrid is the minimum tier for
every high-risk area (§11), five mutation checks are mandatory on the guards (§11.2), live
before-and-after verification with negative controls is required for the redaction gate (item 158),
and a browser load is required after adding the dependency (item 171).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `tests/unit/performance-template-render.test.ts` + `tests/e2e/performance-form.spec.ts` — two templates render two different forms; weights/maxima/bands are labels | Hybrid | **AC1** |
| `tests/unit/performance-template-assignment.test.ts` — explicit field only; mid-cycle reassignment leaves the in-flight review unchanged | Fully-Automated | **AC2** |
| `tests/unit/performance-cycle-plan.test.ts` (one case per reason + both) and `tests/unit/performance-template-backfill-check.test.ts` | Fully-Automated | **AC3** |
| `tests/unit/performance-capture.test.ts` (round-trip) + `tests/unit/performance-no-scoring.test.ts` (structural absence gate) | Hybrid | **AC4** |
| `tests/unit/performance-capture-validation.test.ts` — at-max accepted / one-over rejected for rating, subtotal, total independently | Fully-Automated | **AC5** |
| `tests/unit/performance-redact.test.ts` (rewritten, field by field) + `performance-form.spec.ts` DOM-absence case | Hybrid | **AC6** |
| `tests/unit/performance-release.test.ts` — capability, attribution, idempotency | Fully-Automated | **AC7** |
| `tests/unit/performance-api-redaction.test.ts` + extended `review-privacy.test.ts` API case | Fully-Automated | **AC8** |
| `tests/unit/review-privacy.test.ts` MANAGER non-participant 403 on a template review | Fully-Automated | **AC9** |
| `tests/unit/performance-signoff.test.ts` — COMPLETED blocked while a signatory is missing; reorder affects future only | Fully-Automated | **AC10** |
| `tests/unit/performance-signoff-order.test.ts` — service-level out-of-turn 409 with a negative control on status and row count | Fully-Automated | **AC11** |
| `tests/unit/performance-signoff.test.ts` — stalled-sign-off query; resolving the gap unblocks | Fully-Automated | **AC12** |
| `tests/unit/performance-signoff.test.ts` — attestation row is typed name + timestamp only | Fully-Automated | **AC13** |
| `tests/unit/performance-cycle-plan.test.ts` — default, changed, retroactivity negative | Fully-Automated | **AC14** |
| `tests/unit/performance-cycle-plan.test.ts` idempotency + the live DB-level `@@unique` double-create case | Hybrid | **AC15** |
| `tests/unit/performance-reminders.test.ts` — one case per trigger, asserting channels | Fully-Automated | **AC16** |
| Replaced `tests/e2e/form-errors.spec.ts` + `rg -in "\bgoal" src/ prisma/ scripts/ tests/` returning zero + **item 44a's request to `/api/v1/performance/goals` asserting status 404** (the grep proves the source file is gone; only 44a exercises the route AC17 actually names) | Hybrid | **AC17** |
| Migration dry-run against a **disposable** DB + audit-row count unchanged pre/post | Agent-Probe | **AC18** |
| `tests/e2e/global-setup.ts:22` route smoke, unmodified | Fully-Automated | **AC19** |
| `tests/unit/performance-template-versioning.test.ts` — snapshot not refreshed by a template edit or a reassignment | Fully-Automated | **AC20** |

**Every one of the 20 SPEC acceptance criteria has a named proving scenario and a strategy tag.
No criterion is proven by Known-Gap.** The only Known-Gap in the plan (real SMTP deliverability,
§11.4) proves no acceptance criterion — SPEC explicitly places it out of scope — and it still
carries a backlog stub and keeps its gate CONDITIONAL.

---

## Test Infra Improvement Notes

- `process/context/tests/all-tests.md` "Quick Routing" states there are no deeper test docs yet.
  This feature adds two cron scripts and a JSON-contract surface, both of which are new test
  shapes for this repo. Consider a `process/context/tests/cron-scripts.md` at UPDATE PROCESS.
- **Nothing typechecks or tests `scripts/**`** (all-tests.md "Known Gaps"). This plan adds five
  scripts. A `tsc --noEmit` pass over `scripts/` would be a cheap, broadly useful improvement —
  out of scope here, worth a backlog stub.
- `tests/unit/review-privacy.test.ts:17-35`'s `vi.hoisted` + `vi.mock('$lib/server/db')` harness
  is reused three times by this plan. It is a good candidate for extraction into
  `tests/fixtures/` once a fourth consumer appears.
- `src/lib/server/services/notifications.ts` has **zero test coverage** (digest §3). Phase 9
  routes new traffic through it. Not fixed here; noted.
- The e2e suite's flakiness (#287) makes AC1 and AC6's hybrid gates less trustworthy than they
  should be. See open risk O-5.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md`
2. **Last completed phase/step:** PLAN complete. No code written. No phase started.
3. **Validate-contract status:** **CONDITIONAL, fixes applied** — VALIDATE ran 2026-08-26, four
   validators, three PASS and one CONDITIONAL. No design defect. §20 holds the contract and all
   four findings (V-1 to V-4) are already applied to this plan. The only remaining precondition is
   O-1 for staging and prod.
4. **Supporting context files loaded:**
   - `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_SPEC_25-08-26.md` (LOCKED, Open Questions empty)
   - `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/research-findings_REF_25-08-26.md`
   - `docs/references/Copy of Veent Tix Performance Evaluation_AE.md`
   - `docs/references/Copy of Veent Tix Performance Evaluation_Admin Staff.md`
   - `process/context/tests/all-tests.md` (full routing chain; no deeper docs exist)
   - `CLAUDE.md`
5. **Next step for a fresh agent: DO NOT RE-RUN EXECUTE.** All nine phases are code done and
   committed. The local schema is **already migrated** — do not run `db push`, do not run any
   `scripts/migrate-*` step, and do not start at item 1. Those items are applied and several are
   destructive. Open risk **O-1** still stands for **staging and prod only**, before this branch
   is deployed there. The remaining gates are the owner's manual GUI pass and the open CodeRabbit
   findings on PR #325.
   **The user starts the database and the dev server; never run `./start.sh`, `veent-db-5434`,
   or `vite`.**
6. **Branch:** `feat/performance-eval-bimonthly-178`, many commits ahead of `origin/staging`.
   PR #325 is **open against `staging` and is not a draft**. No SHA is pinned here on purpose —
   run `git log --oneline -1` for the current tip; anything written down goes stale.
7. **Commit discipline:** one issue, one PR, many commits. Phase 1 is its own commit series ahead
   of everything else. **Never** add `Co-Authored-By` or any co-author trailer.
8. **If context is compacted mid-execution:** §7's item numbers are the resume index. §0 is the
   rule that must be re-read before writing any code in Phase 6.

---

## Validate Contract

**Run 2026-08-26. Net gate: CONDITIONAL.** Four validators, non-overlapping scopes, each briefed to
break the plan and to say PASS plainly if it held.

| Validator | Scope | Verdict |
|---|---|---|
| (a) | Prisma schema diff + migration ordering | PASS |
| (b) | RBAC + the whole-document redaction release gate | PASS |
| (c) | Test matrix vs the 20 acceptance criteria | **CONDITIONAL** |
| (d) | Goals-removal blast radius vs live code | PASS |

**No design defect was found.** Every CONDITIONAL item below is a correction to plan text or to the
test matrix. The schema, the service design, the RBAC gates and the redaction model all survived.

> **ALL FOUR FINDINGS WERE APPLIED TO THIS PLAN ON 2026-08-26.** V-1 → items 29 and 44 rewritten to
> point at item 117 and to state that Phase 5 leaves the banner unexercised. V-2 → new **item 44a**
> adds the 404 assertion, and AC17's row in the test matrix now names it. V-3 → **mutation check 5**
> added to §11.2, with both detection paths exercised separately; the "two mutation checks" claim in
> §14 corrected to five. V-4 → the O-4 row in §12.2 marked RESOLVED-YES with an explicit warning not
> to add the same-signer check it used to propose. The findings are kept below as the record of what
> was wrong and why.

### V-1 — Stale cross-reference: the `form-errors.spec.ts` replacement (must fix before EXECUTE)

Items 29 and 44 both direct the reader to "item 71" for the replacement contract. **Item 71 is the
templates list page.** The real replacement is **item 117**, and it does something different from
what items 29/44 promise: it moves the assertion target to the `/settings/performance` cadence
form, not the `/performance` page's `:65-69` `role="alert"` banner.

This is not cosmetic. By Phase 5 (items 103, 110–112) **every action on
`src/routes/(app)/performance/+page.server.ts` is deleted** — `createCycle`, `setCycleStatus`,
`openReviews`, with the Goals actions already gone in Phase 1. So the banner that items 29/44
promise stays "pinned" has no action left that can populate it. Item 117's choice is the correct
engineering call; the plan's narrative is wrong about it.

**Fix:** rewrite items 29 and 44 to point at item 117 and to state plainly that the `:65-69` banner
becomes unexercised markup once Phase 5 lands. An EXECUTE agent following 29/44 literally would
hunt for a nonexistent contract and could conclude the old banner is still covered when it is not.

### V-2 — AC17's route-404 claim is unproven (must fix before EXECUTE)

SPEC AC17 states "hitting the old route returns 404." The plan proves it with the structural grep
(item 48) plus the replaced e2e spec — but per V-1 that spec now tests an unrelated cadence form.
**No test makes an HTTP request to `/api/v1/performance/goals` and asserts the status.** The grep
proves the source file is gone; it does not exercise the route. True in SvelteKit by construction,
but the inference is never run.

**Fix:** add one assertion to the Phase 1 test set that requests the deleted route and expects 404.
Cheap, and it converts AC17 from WEAK to YES.

### V-3 — The no-scoring structural gate has no mutation-check (must fix before EXECUTE)

§0 names the no-arithmetic rule as the most important constraint in the document, and item 134 is
the gate that enforces it. **§11.2 lists four mutation-checks and item 134 is not among them** —
the four are: swap the template guard, swap the release guard, remove `.map(redactHrAuthored)`,
remove the out-of-turn check.

By the plan's own §11.2 standard, an unmutated check is a hypothesis, not a proven guard.

**Fix:** add a fifth mutation-check — temporarily add a `computeScore`-shaped export, or a
`.reduce(` in the review svelte file, and confirm `performance-no-scoring.test.ts` goes red.

### V-4 — O-4 is answered; the plan text is stale (docs only)

`:1753` still lists O-4 as open. **The owner answered it on 2026-08-26: yes, one person may attest
several different signatory slots on the same review**, each slot still producing its own
`ReviewSignoff` row, order, typed name and timestamp.

Validator (b) checked whether the design silently assumed the opposite and **it does not**:
`ReviewSignoff` carries `@@unique([reviewId, slotId])` only (`:298`) — never
`@@unique([reviewId, attestedByUserId])` — and `attestSignoff` (item 141, `:1234-1244`) tests
`resolveSlotHolders(slot, review)` membership without cross-referencing any other row's
`attestedByUserId`. The design was already correct for "yes". **Text update only, no code change.**

### Claims that were attacked and held

- **Nothing writes `ReviewStatus.MANAGER_REVIEW`.** Verified across `src/`, `scripts/`, `prisma/`,
  `tests/` — only the enum declaration at `schema.prisma:257`. The `ALTER TYPE … RENAME VALUE` is safe.
- **The Goals blast radius is exactly the 30 listed sites.** Validator (d) ran an independent
  repo-wide sweep and found **8 files, all already listed. There is no site 31.**
- **`scripts/prod-delete.ts` positional coupling.** Verified live: 22 names, 22 queries, `goals` and
  `db.goal.count` both at index 10. Items 37/38 correctly treat it as one coupled edit.
- **Phase 1 is independently shippable.** All 49 of its items checked for `redact`, `Template`,
  `Signoff`, `PerformanceConfig` — zero hits. `redactHrAuthored` is untouched by Phase 1.
- **Redaction reduces to `answers = null`.** Every field in the SPEC's protected set lands inside
  `answers`; `employeeComments` is its own column and stays visible. No field-picking list exists to
  forget an entry from.
- **The API route cannot diverge from the page load.** Confirmed live that
  `src/routes/api/v1/performance/reviews/+server.ts:14-18` returns `asSubject` unredacted today.
  Item 127 closes it in that exact file and item 136 carries the mutation-check.
- **Sequential sign-off is race-safe.** The out-of-turn rejection tests holder-set membership
  against one specific target slot, not timing, so a stale pre-transaction read cannot let a wrong
  signatory through; the genuine race — two valid holders of the same slot — is caught by the
  DB-level `@@unique([reviewId, slotId])` P2002 → 409. No TOCTOU gap was constructible.
- **MANAGER cannot release.** `src/lib/rbac.ts:26,36` confirms `MANAGE_HR` includes `MANAGER` while
  `ADMINISTER_HR_ORGWIDE` excludes it. Release is gated on the latter, and item 154's mutation-check
  swaps to `MANAGE_HR` specifically to prove the 403 test would go red if someone widened it later.
- **AC12 is testable.** Item 147 is a mocked-Prisma unit test, so it is structurally forced to build
  its own fixture and cannot inherit a department head from seed data.
- **No `Decimal` enters the diff.** Subtotals and totals live inside the `answers` Json column, so
  `src/hooks.ts` stays out of this feature.

### Open gates that VALIDATE did not close

- **O-1 remains OPEN and still blocks item 43.** Local dev DB counted clean on 2026-08-26 — `goals`
  0, `review_cycles` 1, `performance_reviews` 0, no `MANAGER_REVIEW` rows. **Staging and prod were
  not counted; there are no credentials on this machine.** `DROP TABLE goals` has no undo. Run the
  counts on the droplet before item 43.
- **O-5 stands.** AC1's e2e leg keeps its named flakiness downgrade path.
- Cosmetic nit, not gating: the `NotificationKind` citation reads `:1155-1160`; actual is `:1153-1160`.

### Verdict

**CONDITIONAL — cleared to EXECUTE.** V-1, V-2, V-3 and V-4 are **applied**. The one remaining
precondition is **O-1 for the target database**: the local dev DB is counted and clean, but staging
and prod are not, and item 43's `DROP TABLE goals` must not run on either until they are. Everything
before item 43 is unblocked.

---

## Next Instruction

Plan complete. Review carefully. Say **"ENTER VALIDATE MODE"** when ready to proceed to plan
validation (required before implementation).

---

## 21. EXECUTE CLOSEOUT — 27-08-26

All nine phases are built and committed on `feat/performance-eval-bimonthly-178`.
`pnpm test` 175 files / 2042 tests, `pnpm check` 0 errors (1 pre-existing a11y warning at
`CalculatorWindow.svelte:82`).

### Defects the plan carried, found only by building it

1. **Item 146's path did not exist.** `src/routes/(app)/settings/departments` is not a route. The
   real surface is `src/routes/(app)/departments`. The item's own "grep before writing this" hedge
   is what saved it.
2. **Item 141's "recompute `isFullySigned`"** reads naturally as "on the list you already loaded",
   which would mean the last signatory never flips a review to `COMPLETED`. It must be recomputed
   from rows re-read INSIDE the transaction, after the insert.
3. **`releasedByUserId` was named for a User and foreign-keyed to `employees(id)`** — a defect
   introduced by the plan's own §3.4 diff in Phase 2. Renamed to `releasedByEmployeeId`
   (commit `455e84a`) while the column existed only on this branch and held 0 non-null values.
   After merge this would have needed a rename migration.
4. **Item 150's call-site list was short** — the third time in this issue. `performance-api-redaction.test.ts`
   names the redaction function twice and was not listed.
5. **Item 164 contradicts itself**: it declares a return type of `{reviewId, kind}[]` with no
   channels, then requires the channel decision to live in that module and item 165 requires tests
   asserting which channels fire. `remindersDue` returns `channels` as well.
6. **Item 164 never defines the `due-soon` window.** `DUE_SOON_DAYS = 3`, an exported constant,
   not a new HR setting.
7. **Item 172 is self-contradictory** — a dry run cannot print `[NOTIFY]` lines without sending.
   The unconfigured path was proven three other ways instead (a real run, a repeat run showing
   live de-duplication, and a direct `deliver` probe against an unreachable host).

### Item 158 — verified live, 27-08-26

Same probe both sides of the release, with a positive control, as the employee (`carla@jojo.ph`):

| | evaluator marker | own-comment control |
|---|---|---|
| before, `GET /api/v1/performance/reviews` | absent | present |
| before, `GET /performance/reviews/{id}` | absent | present |
| after | present | present |

`manager@jojo.ph` POSTing `?/release` → **403**, with MANAGER holding `MANAGE_HR` — the #133 trap
failing closed for real. The renamed FK accepted a live write and rendered "Released by Cielo
Executive". All planted data reverted; `releasedAt IS NOT NULL` count back to 0.

**A 401 initially made the markers look absent and would have passed a naive check.** The control
going to 0 at the same time is the only thing that exposed it.

### Open, deliberately not decided

- **The `opened` reminder duplicates the cycle generator's in-app notification.** Built as the
  SPEC's REMINDERS table specifies. If too noisy, the one-line fix is to have the generator stamp
  `lastReminderKind = 'opened'` on the reviews it creates; the existing de-dup guard then swallows it.
- **Reminder recipients per kind** are specified nowhere in SPEC beyond "evaluator and/or employee"
  for overdue. A documented `RECIPIENTS` table in the shell holds the current choice.
- **Real SMTP deliverability is unproven** (needs credentials — known gap O-6).
- **A real-browser pass** — item 171 was done with curl. The `impeccable` audit of the builder is
  also still owed.
- **`tests/e2e/form-errors.spec.ts` "performance surfaces cycle errors in the page-level banner"
  fails.** Phase 5 deleted every action on `/performance`, so nothing populates that banner any
  more. Almost certainly ours; unexamined.

---

## 22. STATE OF PLAY — handoff, end of 27-08-26

**EXECUTE is finished. Every phase is built, committed and pushed. The next session tests; it does
not build.** Read this section before anything else in this file — the items above are the
contract, this is where that contract actually landed.

### Phase status

| Phase | What it is | State | Key commits |
|---|---|---|---|
| 1 | Goals removal | DONE | `512a8e7` |
| 2 | Schema foundation | DONE | `c2f6db4` |
| 3 | Template CRUD, seeds, shared render component | DONE | `c6f1dc9`, `a4643fe` |
| 4 | Template assignment + the app-wide back-button sweep | DONE | `0bf07b5`, `e325865`, `0ca5121`, `02d95dc` |
| 5 | Cycle planner, snapshot-on-open, cadence config, cron | DONE | `b06e236`, `960fc11`, `a49ad0a`, `f07b056` |
| 6 | The evaluator's review form + no-scoring gate | DONE | `c8c349e`, `52a4269`, `03b31b2` |
| 7 | Sequential sign-off + department head | DONE | `85ebc6a`, `072756e`, `63f3401`, `fc1331d`, `1094741` |
| 8 | Release gate and API redaction | DONE | `6c5f73b`, `455e84a` |
| 9 | Email seam and reminders cron | DONE | `9d885e8`, `e6a78bd` |

Gates at handoff: `pnpm test` **175 files / 2042 tests green**; `pnpm check` **0 errors**, 1
pre-existing a11y warning at `CalculatorWindow.svelte:82` which is NOT ours.

### What is proven, and how

| Claim | Evidence | Strength |
|---|---|---|
| No arithmetic reaches a review | `performance-no-scoring.test.ts`, both detection paths mutation-checked | structural, build-failing |
| The signing turn cannot disagree between UI and server | one pure function called by both; 13 tests incl. duplicate rows and out-of-order arrival | strong |
| Out-of-turn signing is refused server-side | mutation M2 → 5 tests RED | strong |
| Two holders racing one slot cannot double-sign | `@@unique([reviewId, slotId])` → P2002 → 409; mutation M3 → 1 test RED | unit only, never raced live |
| The employee sees nothing until release | **live**, before/after, both API and page, with a positive control | strongest evidence on the branch |
| MANAGER cannot release | **live 403**, and MANAGER holds `MANAGE_HR` — the #133 trap failing closed | strong |
| The renamed FK accepts a real write | **live**, rendered "Released by Cielo Executive" | strong |
| Reminder de-duplication holds | unit mutation + **a live repeat run printing "nothing due"** | strong |
| Unconfigured email never throws | proven three ways incl. a live probe against an unreachable host | strong |
| **The GUI works end to end** | **NOTHING. The owner has not tested it.** | **none** |

### Next session, in order

1. **The owner's GUI pass.** Ask what broke; fix that before anything else.
2. **The `impeccable` audit of the template builder.** The planning pass produced
   `template-builder_DESIGN-BRIEF_26-08-26.md`; the audit pass never ran. It needs a real browser,
   so ask them to start Playwright first.
3. **`tests/e2e/form-errors.spec.ts` — "performance surfaces cycle errors in the page-level
   banner" FAILS and is almost certainly ours.** Phase 5 deleted every action on `/performance`,
   so nothing populates that banner. VALIDATE finding V-1 predicted this exactly and nobody went
   back for it. Unexamined — do not assume it is a small fix.
4. **The PR.** A staging-targeted PR will not auto-close #178; close it by hand and name the gaps.

**Two e2e failures are NOT ours — leave them alone.** `inventory.spec.ts` (#114) and
`payroll-custom-range-overlap.spec.ts` (#163).

### How to run the pieces

```
./start.sh                                   # owner starts this, never the assistant
pnpm exec tsx scripts/generate-review-cycles.ts --dry-run
pnpm exec tsx scripts/send-review-reminders.ts --dry-run
```

The dev DB was left clean: no released reviews, no reminder stamps, no planted answers. The seeded
reviews are all `PENDING` with no template answers, so **a GUI test of the review form needs a
cycle generated first**.

`SMTP_HOST` is empty in `.env.dev`, which is the intended local state — mail logs a `[NOTIFY]`
line instead of sending, and nothing throws.

### Traps that will bite the next session

- **`db push` leaves a running dev server on a stale Prisma client.** Every
  `/performance/reviews/*` page 500'd after the `releasedByEmployeeId` rename until the server was
  restarted. Check process age before hunting a code bug.
- **`review-privacy.test.ts` hand-mocks the whole performance service with a partial `vi.mock`
  factory.** It broke three separate times this issue from unrelated imports into
  `reviews/[id]/+page.server.ts`, and because the factory is partial it can go green while proving
  nothing.
- **A 401 makes a leak probe look clean.** Item 158's live check nearly passed for that reason;
  only the positive control going silent at the same time exposed it. Never assert absence without
  a control that must be present.

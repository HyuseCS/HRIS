---
name: context:all-database
description: "Prisma schema conventions, enum traps, db push workflow, and the money/decimal rules — the database group entrypoint/router"
keywords: prisma, schema, model, enum, migration, db push, postgres, decimal, seed, relation, index, dedupKey, tenant, organizationId
related: [context:all-auth]
date: 24-08-26
---

# Database Context

This file is the canonical database context entrypoint for Veent HRIS.

Use it after `process/context/all-context.md` when the task needs schema changes, migrations, or query patterns.

---

## Scope

This group covers:

- Prisma schema conventions, model relationships, and enum patterns (`prisma/schema.prisma`, 1972 lines, 68 models)
- The `db push` workflow this repo uses **instead of** migration files, and when a hand-written migrate script is mandatory
- `Decimal` handling and why money must never reach the client raw
- Tenant scoping (`organizationId`) as a query-level concern
- Seeding for development (`prisma/seed.ts`) and e2e (`prisma/seed-e2e.ts`)

It does not cover:

- Which roles may read or write a given model — that is `process/context/auth/all-auth.md`
- Container/hosting for Postgres — that is `process/context/container/all-container.md`
- The CI job that pushes the schema against a populated DB — that is `process/context/cicd/all-cicd.md`
- Feature-specific schema plans — those live in `process/features/*/` and `process/general-plans/`

## Read When

Read this entrypoint when:

- adding or modifying a Prisma model, relation, index, or enum
- changing anything that stores money, hours, or rates
- writing a `scripts/migrate-*.ts` script
- debugging a query that returns rows from the wrong tenant
- a `pnpm check` run reports type errors that do not match the code you see

## Quick Routing

There are no deeper docs in this group yet. Read the source directly:

- `prisma/schema.prisma` for every model, enum, and relation
- `src/lib/server/db.ts` for the client singleton
- `src/hooks.ts` for the global Decimal transport hook
- `scripts/migrate-*.ts` for the precedent on enum renames

## Critical Rules

**1. There are no migration files. This repo uses `prisma db push`.**

`pnpm db:migrate` and `pnpm db:push` both run `prisma db push`. There is no `prisma/migrations/`
directory and no `migrate dev` workflow.

**2. Renaming an enum value CANNOT be done by `db push`** — it drops and recreates the type,
taking the data with it. Any existing database needs a `scripts/migrate-*.ts` running
`ALTER TYPE … RENAME VALUE` **before** the push. Precedent:
`scripts/migrate-employment-type-regular.ts`, and `scripts/migrate-user-role-to-roles.ts` for the
column-shape case.

**3. `Decimal` must never be returned raw to the client.** The transport hook in `src/hooks.ts`
serializes it globally. Do not hand-roll a second conversion; do not `JSON.stringify` a Decimal.

**4. Enum values that bite:**

- `Role`: `EMPLOYEE`, `MANAGER`, `HR_ADMIN`, `SUPER_ADMIN`, `PAYROLL_OFFICER`, `FINANCE`, `CEO`,
  `VERIFIER`, `APPROVER`
- `EmploymentType`: `REGULAR`, `PART_TIME`, `CONTRACTUAL`, `PROBATIONARY`, `ON_CALL`, `INTERN`.
  `FULL_TIME` was renamed to `REGULAR` in #172. New hires default to `PROBATIONARY`.
- `EmploymentStatus`: `ACTIVE`, `ON_LEAVE`, `OFFBOARDED` **only**.

**5. Table names are snake_case plural.** The model is `TimeLog`, the table is `time_logs`. When
querying with `psql` directly, map the name — `select … from "user"` fails; the table is `users`.

**6. A new index on a large table belongs in a pre-push step, not the push.** See #200's
`dedupKey` index and the `schema-upgrade` CI job.

## Key Model Clusters

- **Tenancy:** `Organization`, `UserOrganization`, `Branch`, `Department`, `Position`
- **People:** `User`, `Employee`, `EmployeeCompensation`, `EmployeeEmploymentType`,
  `EmployeeSupervisor`, `EmployeeStatutoryConfig`
- **Time:** `TimeLog`, `AttendanceDay`, `WorkSchedule`, `WorkScheduleDay`, `Timesheet`,
  `TimesheetEntry`
- **Payroll:** `PayrollRun`, `PayrollEntry`, `PayrollPeriod`, `PayrollEarning`,
  `PayrollDeduction`, `EarningType`, `DeductionType`, `PayRateRule`, `StatutoryRateConfig`,
  `Loan`, `CashAdvance`
- **Requests/approvals:** `Request`, `ApprovalStep`, `RequestDocument`, `LeaveRequest`,
  `ActionProposal`, `StatutoryRateProposal`
- **Separation:** `SeparationRecord`, `ClearanceItem`, `OffboardingChecklistItem`
- **Audit:** `AuditLog` — every privileged action is expected to stamp one
- **HR inquiries:** `HrComplaint`, `HrComplaintMessage` (#112) — `organizationId` is a bare scalar,
  not a relation (deliberate, see Update Triggers)

## Source Paths

- `prisma/schema.prisma`
- `prisma/seed.ts`, `prisma/seed-e2e.ts`
- `src/lib/server/db.ts`
- `src/hooks.ts`
- `scripts/migrate-*.ts`

## Update Triggers

Update this group when:

- the `db push` workflow changes, or real migration files are adopted
- a new enum rename or destructive schema change adds a migrate-script precedent
- `Decimal` transport handling moves out of `src/hooks.ts`
- tenant scoping changes shape (e.g. row-level security replaces `organizationId` filters)

## Canonical Notes

- `pnpm prisma generate` after ANY schema edit. A stale generated client produces phantom type
  errors in `pnpm check` that do not correspond to the code on disk — this has been mistaken for
  a real regression at least three times.
- `pnpm check` does **not** cover `prisma/**` or `scripts/**`. Code there can ship broken while
  `check` is green.
- **`pnpm db:seed` runs `seedProd` only.** It does NOT create the standard dev/test accounts
  (`manager@veent.ph`, `employee@veent.ph`, `verifier@veent.ph`, etc.) — those live in
  `seedE2E` (`prisma/seed-core.ts`), which `pnpm db:seed:e2e` calls. A local DB seeded with
  `pnpm db:seed` will be missing every account a manual verification script expects.
- **The audit-log report's `entityTypes` allow-list is hand-maintained and untyped** — see
  `process/context/auth/all-auth.md` Canonical Notes. Any new audited Prisma model must be added
  there manually; nothing in the schema or the type system enforces it.

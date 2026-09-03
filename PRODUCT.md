# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Staff of a Philippine SME using Veent HRIS, reached through one multi-tenant web app scoped by
`organizationId`. Five confirmed roles, from the RBAC table in `src/lib/rbac.ts`:

- **HR_ADMIN** — the primary operator. Runs payroll, leave, documents, onboarding/offboarding and
  performance for the whole organization. Most administrative surfaces are built for this person.
- **MANAGER** — a team lead. Holds `MANAGE_HR` but not `ADMINISTER_HR_ORGWIDE`, so they act on
  their own branch, not the whole org. (Recorded because it has repeatedly been the source of
  scoping mistakes: capabilities say _what_, never _whose_.)
- **EMPLOYEE** — sees their own records: payslips, leave balance, 201 file, their own reviews.
- **CEO** and **SUPER_ADMIN** — org-wide oversight; CEO cannot self-serve their own compensation.

## Product Purpose

An HRIS that runs the full employee lifecycle for a Philippine SME in one place: hiring, the 201
file, timesheets, leave, payroll with local statutory deductions, documents, and performance
evaluation. Success is an HR administrator completing a monthly cycle — payroll run, leave
reconciled, documents filed — without leaving the app or keeping a parallel spreadsheet.

## Operating Context

- **Philippine payroll is the anchor.** SSS, PhilHealth, Pag-IBIG and BIR tax tables are
  configuration (`StatutoryRateConfig`), and 13th-month pay is a first-class concept. Dates are
  reasoned about in **Manila** time; mixing that with UTC has caused real bugs here.
- **Paper still exists.** HR works from physical and Word/PDF forms — evaluation forms are signed on
  paper today. The app's job is often to reproduce a document HR already has, not to invent one.
- **Small teams wear several hats.** One person may legitimately be both a department head and an
  immediate supervisor, and the software must not assume otherwise.
- **No app scheduler.** Recurring jobs are one-shot scripts run by a hand-installed droplet crontab.

## Capabilities and Constraints

- SvelteKit 2 + Svelte 5 runes, Prisma + PostgreSQL, Lucia v3 sessions, Tailwind v3 with HSL
  design tokens in `src/app.css`. pnpm. No Redis.
- Multi-tenant: every read and write is scoped by `organizationId`.
- Sensitive fields (salary, government IDs) are masked at the service layer and revealed only
  through an audited action.
- Light and dark themes both ship and both must be designed.
- A small shared UI kit exists at `src/lib/components/ui/` — `PageHeader`, `Table`, `EmptyState`,
  `ConfirmButton`, `ConfirmDialog`, `Skeleton`, `TableSkeleton`, `Toaster`, `MaskedField`,
  `PeriodPicker`, `BackButton`, `Pagination`. New surfaces extend this kit rather than inventing a
  parallel one.

### Performance evaluation (#178, in build)

- HR composes **evaluation form templates**: name, weighted categories, criteria inside each
  category, a rating scale, interpretation bands, four narrative blocks, a recommendation
  checklist, and an **ordered signatory list**. Adding a new template must require zero code
  changes.
- **The app performs no arithmetic on evaluation scores.** HR calculates. The evaluator types every
  rating, every subtotal and the overall total, and picks the interpretation band. Weights, section
  maxima and band tables are **display-only labels**, never inputs to a formula. This is an explicit
  ruling from HR, not an oversight, and it is the single most likely thing for a later reader to
  "helpfully" reimplement.
- Validation is not calculation and does exist: a rating must fall within the declared scale, a
  typed subtotal must not exceed its section maximum, a typed total must not exceed 100.
- A template is **snapshotted onto the review when it opens**, so a signed review renders
  identically forever even after HR edits the template.
- Sign-off is **sequential** and server-enforced. One person may hold several signatory slots.
- The reviewed employee sees **nothing evaluator-authored** until HR explicitly releases it.
- Confirmed for the builder (2026-08-26): HR edits a whole template as one client-side draft
  committed by a single **Save** — not per-row round-trips — with a **live preview** of the finished
  form beside the editor. Realistic size is the two forms HR supplied: about 4–6 categories of 4–6
  criteria, ~5 rating rows, ~5 band rows, 4 narrative blocks, ~4 signatories.

## Brand Commitments

- **Veent Red** `#CC1515` (`--primary: 0 79% 45%`) is the established brand colour, unchanged in
  dark mode. It is used sparingly, for primary actions and focus rings.
- The incumbent interface is quiet, dense and neutral: near-greyscale surfaces, `--radius: 0.625rem`,
  bordered `bg-card` sections, small type. Colour carries meaning (`--success`, `--warning`,
  `--destructive`) rather than decoration.

## Evidence on Hand

- Two real HR evaluation forms at `docs/references/Copy of Veent Tix Performance Evaluation_AE.md`
  and `..._Admin Staff.md`. **Structure only.** The AE form arrived carrying a real employee's name;
  it was stripped before committing and must never be seeded or quoted.
- The forms contradict themselves on several printed totals. Those are wrong labels for HR to fix in
  the template editor, not facts to encode.
- No testimonials, customer names, pricing or benchmark data exist in this repo. Do not invent any.

## Product Principles

1. **Reproduce the document HR already uses.** The app is a platform for producing their forms, not
   a redesign of their process.
2. **Configuration over code.** A new form, a new cadence, a new signatory order must be data.
3. **The app does not do the human's arithmetic here** — and where it validates, it says so plainly.
4. **Scoping is part of correctness.** Every surface answers _whose_ records, not only _what_ action.
5. **Withheld by default.** Evaluator-authored content stays invisible to its subject until released.

## Accessibility & Inclusion

No formal standard has been set by the user. Established in-repo expectations: both themes ship,
focus is visible via `--ring`, destructive actions are confirmed rather than immediate, and
repeatable-row controls are keyboard reachable (the plan gates the builder's add/remove/reorder on a
keyboard pass). Treat WCAG AA contrast as the working floor until told otherwise.

---
name: spec:performance-eval-bimonthly-178
description: "Configurable performance-evaluation form template system (AE + Admin Staff as the first two templates) as a pure capture/storage surface — no in-app scoring — with per-employee template assignment, sequential multi-party per-template sign-off, per-org bi-monthly cadence, and Goal removal (#178)"
date: 25-08-26
feature: performance-eval-bimonthly-178
---

# SPEC — Performance Evaluation, Bi-Monthly (#178)

> **Revision note:** this document has now been revised in place three times, always as a
> full rewrite of the affected parts, never as an addendum. Pass 1 folded in the owner's
> eight product-decision answers (B1–B8). Pass 2 folded in the owner's two signature-design
> answers (S1, S2). **This pass removes all in-app score calculation**, per HR's own
> statement: *"no calculation logic will be needed in this app because it will be up to
> them to calculate stuff."* The app is now a structured capture-and-storage surface, not a
> calculator. Every requirement below reflects that. The only remaining open item (A5) is a
> non-blocking data-hygiene confirmation, not a design question — see "Non-Blocking Data
> Notes" below. `## Open Questions` is otherwise empty.

## Summary

Today, "Performance" in the app is a bare self-assessment + manager-comment box, plus a
separate Goals feature nobody asked HR to design and that this issue removes entirely. HR
has now delivered two real evaluation forms — one for Account Executives, one for Admin
Staff — each a multi-section rubric with named criteria, section weights, section maxima,
an interpretation band table, free-text feedback, a recommendation checklist, and up to
four signature lines. Because HR said outright *"there are 2 forms for now, so we will
make it configurable,"* this is not "build these two forms" — it is "build a form-template
system," and load these two forms into it as the first two templates. HR has since made
one more thing explicit: **the app does no arithmetic.** Evaluators type in a 1-5 rating
and a remark per criterion, then type in each section's subtotal, type in the overall
total, and pick the interpretation band themselves — HR calculates those numbers outside
the app today and will keep doing so. The app's job is to capture what the evaluator
enters, validate it is in range, store it, render it back faithfully, and never derive or
recompute any of it. A template's printed weights, section maxima, and band thresholds
become configurable **display-only labels** that tell the evaluator what to type — never
inputs to a calculation the app performs. Everything else about the system is unchanged
from the fully-settled design: templates are assigned to employees by an explicit, HR-set
field; reviews open on a per-organization cadence (defaulting to two months); a review is
only "fully signed" once every signatory role a template declares has attested, in the
sequential order the template declares; and an employee's own view of their review hides
every evaluator- and HR-authored entry until HR explicitly releases it. Cycles auto-generate
and auto-open reviews for the right employees; the employee being reviewed is told, in-app
and by email when it matters most. Goals, as a concept, does not survive this change —
every trace of it (UI, service functions, API route, database table) is deleted.

## User Stories / Jobs To Be Done

1. **As an HR admin**, I want to define an evaluation-form template (its sections, named
   criteria, rating scale, printed weights/maxima as reference labels, band thresholds as
   reference labels, and an ordered list of required signatories) once, so that I do not
   have to hand-build a new form every time a role needs its own rubric or sign-off
   sequence.
2. **As an HR admin**, I want to assign a template to each employee directly, and change
   that assignment later if a role changes, so that the review someone gets is always the
   one I intended for them — not a guess based on their department or job title.
3. **As an HR admin**, I want to set (and later adjust) how often review cycles happen for
   my organization, so that the cadence matches how my company actually runs performance
   reviews, not a number baked into the code.
4. **As an employee being evaluated**, I want a stage where I can add my own comments
   before my evaluator starts scoring me, so that my voice is part of the record before
   ratings are locked in.
5. **As an immediate supervisor/evaluator**, I want to score each criterion with a 1-5
   rating and a remark, then type in the section subtotal and overall total I've already
   worked out myself (using the template's printed weights and maxima as my reference), and
   pick the matching interpretation band, so that the record matches the number I actually
   calculated — the app is not silently recalculating a different number behind my back.
6. **As any signatory a template requires** (employee, supervisor, HR representative,
   department head, in the order the template declares), I want a clear, attestable "I
   have reviewed and sign this" step with my name and the date, available only once it is
   genuinely my turn, so that the multi-party sign-off this form has always needed on
   paper actually exists in the app, in the right sequence.
7. **As an employee**, I want every evaluator- and HR-authored entry on my review —
   ratings, remarks, my typed total score, the recommendation, all of it — to stay hidden
   from me until HR decides to release it, so that sensitive feedback is only shared the
   way HR intends, not by default.
8. **As HR**, I want a completed review to show strengths, areas for improvement, a
   development plan, a recommendation (regularization / raise / promotion / PIP /
   coaching), and every required party's sign-off, so that the paper trail supports
   whatever HR decision follows the review.
9. **As HR**, I want a new review cycle to appear automatically on my organization's
   configured cadence, with reviews already open for the right employees, so that nobody
   has to remember to manually create a cycle every time.
10. **As HR**, I want to see a list of employees who could not get a review this cycle (no
    manager, no assigned template), so that gaps in coverage are visible instead of
    silently disappearing.
11. **As HR**, I want a separate view of reviews that exist but are stuck because a required
    signatory role has nobody mapped to it, so that I can resolve the gap (assign someone,
    or edit the template) instead of a review sitting invisibly unfinished.
12. **As an employee, evaluator, or HR admin**, I want to be reminded — inside the app, and
    by email for the moments that matter most — when a review needs my action, so that
    reviews don't quietly go stale.
13. **As anyone using the Performance page**, I want Goals to be completely gone (buttons,
    tables, API), so that the page only shows the one feature that is actually supported.

## What The User Wants (Behavioral Outcomes)

- The Performance area offers evaluation **templates** instead of one fixed form shape. An
  HR admin can see which templates exist (starting with AE and Admin Staff), edit each
  template's sections/criteria/rating scale/printed weights/printed section maxima/printed
  band thresholds, and edit which signatory roles that template requires and in what order.
- **The app performs no arithmetic on evaluation scores, anywhere.** There is no section
  that sums criterion ratings into a subtotal, no formula that turns subtotals into a
  weighted total, and no logic that derives an interpretation band from a total. Every one
  of those three numbers — section subtotal, overall total, interpretation band — is
  **typed in or selected by the evaluator**, exactly as it would be on the paper form
  today, and the app stores and displays back exactly what was entered. HR calculates
  these numbers themselves outside the app; the app never recalculates or overrides them.
- **A template's printed weight per section, printed maximum per section, and printed
  band thresholds are display-only labels.** They exist so the form shows the evaluator
  the same reference numbers the paper form shows ("Sales Performance (35%)", "Subtotal:
  ___ /30") — they are never read by any calculation, because there is no calculation.
  This is the single most important distinction in this document: **configurable ≠
  computed**. A later reader must not build a "scoring engine" reading these labels as
  formula inputs — there isn't one, and there must not be one (see Constraints and Out Of
  Scope).
- **Every employee record carries an explicit, HR-set "assigned template" field.** Nothing
  is inferred from department, position, or role — HR names the template directly. Before
  the very first auto-generated cycle can meaningfully cover an organization, HR must have
  gone through a one-time backfill pass setting this field on existing employees; the
  system can tell HR how many active employees still have no template assigned, so that
  gap is visible rather than discovered after the fact.
- **Bi-monthly is a per-organization setting, not a fixed number.** It defaults to two
  months but an HR admin can change it, the same way `BackupConfig` already lets an org
  tune its backup interval. Changing the setting only affects cycles generated from that
  point forward — cycles that already exist keep the dates they were created with.
- When a cycle opens, every in-scope employee gets exactly one review, rendered using the
  template assigned to that employee — sections, criteria, rating scale, printed
  weight/maximum labels, KPI table (if the template has one), and required signatory list
  (with its order) all come from the template, not from hard-coded markup.
- An employee with no assigned template, or no manager/evaluator to run their review,
  does not silently vanish from this cycle. They land on an HR-visible list of employees
  who could not be reviewed this cycle, with the reason shown.
- Filling out a review starts with an **app-only self-assessment stage** — the employee
  adds comments before the evaluator sees any ratings. This is separate from, and in
  addition to, the paper form's "Employee Comments" field, which still exists later in the
  flow. Neither HR source document has a self-assessment box; this stage is the app's own
  addition and both fields coexist.
- The evaluator then rates every criterion 1-5 with a remark, **types in** each section's
  subtotal, **types in** the overall total, and **picks** the interpretation band from the
  template's declared list. The app **validates** what was typed — a criterion rating must
  fall inside the template's declared scale, a typed subtotal must not exceed that
  section's printed maximum, and a typed total must not exceed the template's printed
  ceiling (100 for both seeded templates) — but it never derives any of these values
  itself. (This validate-but-don't-calculate line is a stated assumption the owner may
  overturn — see "Assumptions Carried Forward.")
- Section subtotals and the overall total are stored as **whole numbers**. Recommendation
  and rationale: every criterion rating is an integer on a 1-5 scale, and a human-summed
  subtotal/total from integer inputs is overwhelmingly a whole number in ordinary practice;
  keeping these fields `Int` avoids pulling them into the `Decimal`-to-client
  serialization rule in `src/hooks.ts` for a precision need that does not exist today. If
  HR's process ever needs fractional (e.g. averaged) scores, that is a v2 schema change,
  not a v1 requirement.
- A review is only **fully signed** once every signatory role the template requires has
  attested, **in the order the template declares** — a signatory cannot act until every
  signatory before them on that template's list has already attested. The starting
  signatory set, taken from the paper forms, is Employee, Immediate Supervisor, HR
  Representative, Department Head; HR can both edit that list per template and reorder it.
  Because signing sequentially means whoever is listed first signs first, the two seeded
  templates (AE, Admin Staff) are NOT given the paper document's literal top-to-bottom
  order (which lists Employee first) — they are seeded with a sensible evaluation order
  (evaluator/supervisor scores and attests, then HR representative, then department head,
  then the employee attests last, after they can see what they're signing). Attestation
  itself is a typed name plus a timestamp — no drawn signature.
- If a template requires a signatory role that has nobody mapped to it for a given
  employee (e.g. the template requires a "Department Head" attestation but that
  employee's department has no head on record), the review cannot reach its fully-signed,
  completed state. That review shows up on a dedicated HR-facing "stalled sign-off" view
  until HR resolves the gap by assigning someone or editing the template.
- **The employee's own view withholds every evaluator- and HR-authored entry on the
  review** — every criterion rating, every remark, every typed section subtotal, the typed
  total score, the selected interpretation band, Strengths, Areas for Improvement,
  Development Plan, and the Recommendation checklist — until an HR admin performs an
  explicit, visible "release" action on that review. This replaces today's narrower
  two-field redaction. The employee's own authored content (their self-assessment, their
  Employee Comments) is always visible to them; the shared header (name, department,
  period, evaluator, date) is always visible too.
- Nobody has to open a "Review Cycles" screen and click Create/Activate/Open/Close by
  hand — that whole manual HR UI is gone. Cycles and their reviews appear on their own, on
  each organization's configured cadence.
- The employee being evaluated gets an in-app notification and a real email the moment
  their review opens, and again if it goes overdue. Softer nudges — due-soon and
  awaiting-acknowledgement — show up in-app only, with no email. (This channel split is a
  stated assumption; see "Assumptions Carried Forward.")
- Nothing on the Performance page, in its API, or in the database still shows or accepts a
  "Goal."

## Flow / State Diagram

```
CYCLE GENERATION (automatic, per organization's configured cadence — default 2 months,
                   HR-editable per org; changing it never rewrites existing cycles)
  [cron: generate-review-cycles] --creates--> ReviewCycle (this period, this org's interval)
        |
        v
  For each ACTIVE employee in scope:
        |
        v
  [resolve template]  --employee's explicit "assigned template" field-->  Template
        |                                    |
        |                        field is unset --------> add to UNREVIEWABLE LIST
        |                                                  (reason: "no template assigned")
        |                        no manager/evaluator ---> add to UNREVIEWABLE LIST
        |                                                  (reason: "no reportsToId")
        v
  PerformanceReview created, status = PENDING, bound to {employee, cycle, resolved template
  -- snapshotted: later edits to the template or to the employee's assignment do not
     change this review}
        |
        v
  [notify employee] --in-app + email--> "Your review is open"


REVIEW LIFECYCLE (per PerformanceReview)

   PENDING
      |  employee opens the form, adds SELF_ASSESSMENT comments (app-only stage,
      |  precedes scoring; optional/non-blocking on timing but expected before scoring)
      v
   SELF_ASSESSMENT
      |  evaluator rates every criterion 1-5 + remark, per section
      |  evaluator TYPES each section subtotal, TYPES the overall total /100,
      |  SELECTS the interpretation band -- the app validates each is in range
      |  (rating within scale; subtotal <= section's printed max; total <= 100)
      |  but computes none of them -- no summing, no weighting, no band lookup
      v
   SCORED  (renamed from today's dead MANAGER_REVIEW status)
      |  employee separately fills the paper form's "Employee Comments" field
      |  (distinct from the earlier self-assessment stage)
      v
   SIGNING  -- multi-party, SEQUENTIAL sign-off, driven by the template's ordered
      |         signatory list (default order, seeded deliberately NOT to match the
      |         paper form's literal top-to-bottom listing -- see Behavioral Outcomes)
      |  each signatory becomes actionable only once every signatory before them on the
      |  template's list has attested; attesting out of turn is rejected, including via
      |  direct API call, not just hidden in the UI
      |  each attestation: typed name + timestamp, no drawn signature
      |  a template role with nobody mapped for this employee ---> review cannot reach
      |     COMPLETED; it appears on the HR "stalled sign-off" view until HR assigns
      |     someone or edits the template
      v
   COMPLETED  -- reached only once every required signatory has attested, in order
      |  employee notified review is finalized (in-app + email, per requirement 8)
      |  employee's view stays fully redacted (all evaluator/HR-typed entries hidden)
      |  until an HR admin performs the explicit RELEASE action
      v
   ACKNOWLEDGED  (employee confirms they have seen the completed/released review)


REMINDERS (channel split is a stated assumption -- see Assumptions Carried Forward)
   review opens              -> employee -- in-app + email
   overdue                   -> evaluator and/or employee -- in-app + email
   due soon                  -> in-app only, no email
   awaiting acknowledgement  -> in-app only, no email

   Consequence: because "due soon" / "overdue" must be evaluated against real time, not
   just at cycle-open, the reminder job runs on its own, more-frequent schedule --
   separate in shape from the cycle-generation job, which only fires at cadence
   boundaries.
```

## Acceptance Criteria (Testable Outcomes)

Each criterion below is grounded in `tests/unit/`, `tests/e2e/`, and the live-verification
discipline described in `process/context/tests/all-tests.md` (unit-first, browser when real
UI is the thing under test, live+negative-control for anything privileged). Naming follows
the two surviving test files this feature touches directly
(`tests/unit/performance-redact.test.ts`, `tests/unit/review-privacy.test.ts`) and the
`backup/plan.ts` + `scripts/backup-documents.ts` pure-logic/thin-IO split already proven in
this repo for scheduled, config-driven jobs.

1. **A template's sections, named criteria, and rating scale are stored data, not
   markup** — loading the AE template and the Admin Staff template renders two visibly
   different forms from the same page component. A template's printed weight per section,
   printed section maximum, and printed band thresholds render as labels only; no code
   path reads them as calculation inputs.
   - proven by: new `tests/unit/performance-template-render.test.ts` (component/service
     level) + `tests/e2e/performance-form.spec.ts` (renders both templates end to end,
     including the label-only weight/maximum/band text)
   - strategy: Fully-Automated

2. **A review's template comes only from the employee's explicit assigned-template field**
   — never inferred from department, position, or role. Changing that field does not
   alter a review already resolved before the change (the review keeps its snapshot).
   - proven by: new `tests/unit/performance-template-assignment.test.ts` (assignment
     resolves from the explicit field only; mid-cycle reassignment case leaves the
     in-flight review unchanged)
   - strategy: Fully-Automated

3. **An employee who cannot be reviewed this cycle is surfaced to HR with a reason, not
   silently skipped** — the unreviewable list carries two distinct reasons ("no template
   assigned" and "no manager/evaluator assigned"), each independently testable — and HR
   can see, before the first cycle a given organization runs, how many active employees
   currently have no assigned template, as a pre-launch backfill-readiness signal (not a
   blocking gate).
   - proven by: new `tests/unit/performance-cycle-plan.test.ts` (one case per reason, a
     case where both apply to the same employee) + new
     `tests/unit/performance-template-backfill-check.test.ts` (readiness count)
   - strategy: Fully-Automated

4. **Every criterion rating, section subtotal, overall total, and interpretation band is
   evaluator-entered, stored verbatim, and rendered back unchanged — the app performs no
   arithmetic to derive any of them.** No pure scoring/computation module exists in the
   codebase (for example, no `computeScore(template, answers)`-style function); this is
   verified structurally, the same way the Goal-removal check verifies absence.
   - proven by: new `tests/unit/performance-capture.test.ts` (round-trip: what the
     evaluator types is exactly what is stored and exactly what is rendered back, across
     repeated reads) + a structural grep/import check (no scoring/compute module exists)
     run once at EXECUTE/VALIDATE time, mirroring acceptance criterion 17's Goal check
   - strategy: Hybrid

5. **Typed values are validated at entry, even though they are never calculated.** A
   criterion rating outside the template's declared scale is rejected; a typed section
   subtotal exceeding that section's printed maximum is rejected; a typed overall total
   exceeding the template's printed ceiling (100 for both seeded templates) is rejected.
   Without this, nothing stops an impossible value (e.g. a subtotal of 40 on a /30 section,
   or a total of 150/100) from being stored on a permanent HR record.
   - proven by: new `tests/unit/performance-capture-validation.test.ts` (boundary cases:
     at-max accepted, one-over-max rejected, for rating/subtotal/total independently)
   - strategy: Fully-Automated

6. **The employee's own view hides every evaluator- and HR-authored entry** — criterion
   ratings, criterion remarks, typed section subtotals, typed total score, selected
   interpretation band, Strengths, Areas for Improvement, Development Plan, and the
   Recommendation checklist — until an HR admin performs the explicit RELEASE action on
   that review. This replaces today's narrower `redactHrAuthored` (#179), which only
   nulled two fields. (Wording note: these fields are typed/selected by evaluators and HR,
   not computed by the app — the redaction rule covers who authored the entry, regardless
   of how it got there.)
   - proven by: rewritten `tests/unit/performance-redact.test.ts` (field-by-field cases
     for the full withheld set) + `tests/e2e/performance-form.spec.ts` (logged in as the
     reviewed employee, asserts the hidden fields are absent from the DOM, not just
     visually hidden)
   - strategy: Hybrid

7. **The RELEASE action is a visible, attributable event** — performed only by a user with
   the HR capability, recorded with who released it and when, and it is the only thing
   that flips an employee's view from redacted to visible.
   - proven by: new `tests/unit/performance-release.test.ts` (capability check, audit
     attribution, idempotency of a second release)
   - strategy: Fully-Automated

8. **Redaction holds at the API layer, not just the page** — a request to any performance
   API route as the reviewed employee, before RELEASE, does not return the withheld
   fields either. (This closes the pre-existing gap where `/api/v1/performance/reviews`
   returned `asSubject` unredacted while the page load redacted it.)
   - proven by: extended `tests/unit/review-privacy.test.ts` (API-route-level case, not
     just page-load level)
   - strategy: Fully-Automated

9. **A non-participant (not subject, not evaluator, not HR) still gets a 403** on a
   review detail page, matching today's `#282 §3-B` object-scoped rule.
   - proven by: extended `tests/unit/review-privacy.test.ts` (existing MANAGER
     non-participant case extended to template-based reviews)
   - strategy: Fully-Automated

10. **Each template declares its own ordered list of required signatory roles, and that
    order is itself HR-editable configuration** (not the paper document's fixed layout) —
    a review reaches COMPLETED only once every listed role for that template has
    attested on that specific review.
    - proven by: new `tests/unit/performance-signoff.test.ts` (blocks COMPLETED when any
      required signatory is missing; reordering a template's signatory list changes
      future reviews, not past ones)
    - strategy: Fully-Automated

11. **Signing is sequential and enforced server-side, not just in the UI** — a signatory
    cannot attest until every signatory before them in the template's declared order has
    already attested; an out-of-turn attestation attempt made directly against the API
    (bypassing the UI) is rejected, not merely hidden from view.
    - proven by: new `tests/unit/performance-signoff-order.test.ts` (in-order case
      succeeds; out-of-turn case is rejected at the service/route layer, with an
      explicit negative-control assertion that the review's status does not change)
    - strategy: Fully-Automated

12. **A review cannot reach the signed/complete state while any required signatory slot
    has nobody mapped to it, and such reviews are surfaced separately from the
    unreviewable-employee list** — on a dedicated "stalled sign-off" view. (Chosen over
    folding this into the unreviewable list because the unreviewable list is about
    reviews that were never created at cycle-open time, while a stalled sign-off is a
    review that exists and is genuinely in progress, just blocked on one missing person —
    conflating the two would hide that a review already exists and needs a person
    assigned, not a whole new review.)
    - proven by: new `tests/unit/performance-signoff.test.ts` (missing-role case blocks
      COMPLETED and appears in the stalled-sign-off query; resolving the gap unblocks it)
    - strategy: Fully-Automated

13. **Attestation is captured as a typed name plus a timestamp only** — no drawn-signature
    capability exists or is expected.
    - proven by: `tests/unit/performance-signoff.test.ts` (attestation record shape)
    - strategy: Fully-Automated

14. **The review cadence is a per-organization setting**, defaults to two months for an
    organization with no explicit setting, is editable by an HR admin, and changing it
    does not alter the start/end dates of cycles already generated.
    - proven by: new `tests/unit/performance-cycle-plan.test.ts` (default-value case,
      changed-setting case, retroactivity negative case — existing cycle rows unchanged
      after the setting changes)
    - strategy: Fully-Automated

15. **A cycle cannot be double-created** for the same organization + period, regardless of
    that organization's configured interval.
    - proven by: `tests/unit/performance-cycle-plan.test.ts` (idempotency case) + a
      DB-level uniqueness case
    - strategy: Fully-Automated

16. **Reminder channel follows the stated split**: review-opened and overdue trigger both
    an in-app notification and a real email; due-soon and awaiting-acknowledgement trigger
    in-app only, with no email sent.
    - proven by: new `tests/unit/performance-reminders.test.ts` (one case per trigger
      point, asserting which channels fire)
    - strategy: Fully-Automated

17. **No Goal-related UI, route, service export, or database table is reachable after this
    change** — the "New Goal" button, My Goals, Team Goals sections, and
    `/api/v1/performance/goals` are all gone; hitting the old route returns 404.
    - proven by: replacement for `tests/e2e/form-errors.spec.ts:37-60` (new spec asserting
      the alert-banner behavior without any goal-form dependency) + a grep-based structural
      check (`rg -i goal` against the Goal-removal checklist in the research digest §2)
      run once at EXECUTE/VALIDATE time
    - strategy: Hybrid

18. **The Goal-removal database migration is safe and complete**: the mandatory
    `scripts/migrate-*.ts` pre-step (CLAUDE.md — `db push` cannot drop/rename an enum type
    cleanly) runs without error against a disposable copy of the schema and touches no
    unrelated tables; and the historic `entityType='Goal'` audit rows (not FK-linked)
    still render correctly in the audit log after the `Goal` table and `GoalStatus` type
    are dropped.
    - proven by: a dry-run of the migration script against a disposable container/branch
      DB (never the shared dev DB) + existing audit-log tests re-run after the migration +
      a live psql check confirming audit row count is unchanged pre/post
    - strategy: Agent-Probe (cost-class: needs-container)

19. **The `/performance` page continues to load for every seeded role** (the existing
    smoke coverage) after Goals are removed and templates are introduced.
    - proven by: `tests/e2e/global-setup.ts:22` route-smoke list (existing, unmodified)
    - strategy: Fully-Automated

20. **A stale/superseded template does not retroactively change an already-completed (or
    already-resolved-but-in-progress) review's displayed content** — editing a template
    (including reordering its signatory list or changing its printed weight/maximum/band
    labels), or reassigning an employee to a different template, after a review has
    resolved against the original template leaves that review showing exactly what it
    showed before.
    - proven by: new `tests/unit/performance-template-versioning.test.ts`
    - strategy: Fully-Automated

## Out Of Scope

- **Any in-app calculation of evaluation scores.** No section-subtotal summation, no
  weighted-total formula, no interpretation-band derivation. HR calculates these numbers
  outside the app; the app only captures, validates the range of, stores, and renders back
  what the evaluator types or selects. A previously-discussed pure "scoring engine" module
  (e.g. `src/lib/server/performance/scoring.ts` exporting a `computeScore(template,
  answers)` function) **must not be built.** PLAN and INNOVATE must not resurrect it —
  acceptance criterion 4's structural check exists specifically to catch this.
- **Calendar/ICS/Google Calendar integration** — explicitly rejected by the user; reminders
  are in-app notification + real email (per the channel split in requirement 8/flow
  diagram), never a calendar artifact.
- **Fixing issue #323** (the `where:{ user:{ organizationId } }` vs. direct-column
  org-scoping join pattern found across this codebase). Report only if this feature's new
  code would repeat the pattern; do not fix the pre-existing instances.
- **Fixing issue #324** (audit-log writes happening outside the enclosing `$transaction`).
  This feature's own new audit writes should follow the transaction-scoped convention where
  practical, but retrofitting the other 149 sites is not this issue's job.
- **Fixing `/api/v1/performance/reviews` returning `asSubject` unredacted** as a *separate*
  bug-fix task — it is, however, now explicitly folded into acceptance criterion 8 above,
  because the new whole-document redaction gate cannot be correctly built while that route
  still leaks. PLAN should treat closing that gap as an in-scope side effect of building
  the RELEASE gate, not as an unrelated fix.
- **Drawn/biometric e-signatures** — settled by the owner: attestation is
  typed-name-plus-timestamp only. Building drawn/biometric signature capture is out of
  scope.
- **A generic KPI-tracking subsystem** beyond storing the Admin Staff form's fixed KPI
  table as part of that one template. Like every other numeric field on these forms, KPI
  target/actual values (if captured at all) are typed and stored, never calculated.
- **Printable/PDF export** — settled by the owner: explicitly deferred to v2. Accepted
  risk of this deferral: HR still needs a signed paper copy for some purposes today and
  will have no in-app way to produce one at launch; HR will need a manual workaround
  (e.g. screenshotting or manually retyping into an offline document) until v2 ships this.
- **Live email deliverability verification** in this session — building the `send*` seam
  is in scope; confirming a real inbox receives mail depends on user-supplied SMTP
  credentials that cannot be verified here (per the research digest).
- **A generic multi-tenant workflow/approval engine.** The per-template ordered signatory
  list is scoped to this feature's sign-off need; it is not a reusable, general-purpose
  approval-chain subsystem for other domains.
- **Delegated or role-substitution attestation** (e.g. someone signing "on behalf of" a
  missing Department Head). A missing signatory blocks completion and surfaces on the
  stalled-sign-off view for HR to resolve by assignment or template edit — it does not
  auto-substitute another person.

## Constraints

- **No scoring/computation module.** There must be no pure function, service, or route
  anywhere in the codebase that derives a section subtotal, an overall total, or an
  interpretation band from criterion ratings. Every one of those three values is
  evaluator-entered input, not derived output. This is the most important constraint in
  this document to honor literally — see Out Of Scope and acceptance criterion 4.
- Section subtotal and overall total fields are stored as **`Int`**, not `Decimal` — see
  the rationale in Behavioral Outcomes. This also means these fields do not need to route
  through the `Decimal`-to-client transport hook in `src/hooks.ts`.
- SvelteKit 2 + Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) — no Svelte 4
  syntax anywhere new code is written.
- Prisma 5 + PostgreSQL 18; any Prisma enum rename/removal needs a
  `scripts/migrate-*.ts` pre-step (raw `ALTER TYPE`/`DROP TYPE` SQL) before `db push`,
  matching `scripts/migrate-employment-type-regular.ts`.
- Prisma `Decimal` values (where still used elsewhere in this feature, if any) must never
  reach the client unserialized — go through the existing `src/hooks.ts` transport hook, do
  not build a parallel serialization path.
- Lucia v3 session auth; Tailwind v3 with the existing HSL design tokens
  (`src/app.css`) — no new design-token system.
- pnpm 10 only. No Redis.
- `{@const}` must be an immediate child of a block tag (`{#if}`, `{#each}`, `{#snippet}`)
  — never inside a plain HTML element.
- **The user starts the database and dev server** — no phase of this work may run
  `./start.sh`, start `veent-db-5434`, or launch `vite`/`vite preview` itself.
- No app-internal scheduler exists; a recurring job must be a `scripts/*.ts` invoked by a
  hand-installed droplet crontab (per `scripts/README.md`). This feature now needs **two
  differently-shaped jobs**, not one: (a) cycle generation, evaluated against each
  organization's configured cadence (the `backup-documents.ts` /
  `isRunDue`-pure-logic-plus-thin-IO-shell pattern is the closest precedent, because the
  interval is per-org configuration, not a hard-coded constant); and (b) reminder
  evaluation (due-soon/overdue), which must run more frequently than cycle boundaries —
  it checks real elapsed time against open reviews, not against cycle creation. Both jobs'
  decision logic ("is a cycle due," "is a review due-soon/overdue," "which employees are
  in scope") must be pure and unit-testable without IO, mirroring `backup/plan.ts`; PLAN
  decides the concrete job split, this SPEC only requires the pure/IO separation and the
  two-different-frequencies fact.
- Sequential sign-off enforcement is a **server-side** rule, not a UI-only affordance —
  the acceptance criteria require a direct-API negative control precisely because a
  client-side-only check would not satisfy this constraint.
- Every acceptance criterion in this document must be provable primarily by automated
  unit/e2e gates; Agent-Probe is reserved for the genuinely non-automatable pieces (DB
  migration dry-runs, real-mail deliverability) named above — it is not a default.
- `pnpm check` does not cover `prisma/**` or `scripts/**` — any new migration or cron
  script needs its own manual/live verification pass, not just a green `pnpm check`.
- The per-organization cadence setting, the per-employee template-assignment field, and
  each template's ordered signatory list are all new persisted configuration, not
  runtime-only values — they must survive a restart/redeploy the same way `BackupConfig`
  and `EmploymentType` do today.

## Open Questions

None. All previously open design questions (B1–B8, S1, S2) are settled and written into
the requirements above; the remaining arithmetic-defect questions (A1–A4) dissolved when
HR confirmed the app performs no calculation — they are no longer design or blocking
questions at all, since a wrong printed label is now HR's own template-editor fix, not a
formula this app depends on. See "Non-Blocking Data Notes" below for what remains,
none of which blocks PLAN or EXECUTE.

## Non-Blocking Data Notes

These are template **seed-data** items HR can correct directly in the template editor once
it exists — not open design questions, and not blockers to building or shipping this
feature.

- **Admin Staff section weights — CONFIRMED by the owner: 30 / 20 / 20 / 15 / 15.** Seed
  the Admin Staff template's five section-weight labels with these values (they sum to
  100%, resolving the paper document's internal 10%-vs-15% contradiction on Section 4).
  Because these are now display-only labels rather than calculation inputs, there is no
  formula-correctness risk in seeding them — they are just the text the form will print
  next to each section header and in the Overall Performance Summary label block.
- **AE Section 3 ("Product Knowledge & Presentation") missing subtotal label**, and the
  **Admin Staff Section 4 (6 criteria, /25 label) and Section 5 (4 criteria, /25 label)
  mismatched-maximum labels**: these are now just wrong or missing printed maximum labels
  on a template — HR can set the correct label text (or leave a section's maximum label
  blank) directly when the template is built, with no code change and no risk to any
  computed output, because nothing is computed. If HR wants a recommended default: AE
  Section 3's maximum label as "/25" (5 criteria × 5, matching its siblings); Admin Staff
  Section 4's maximum label as "/25" for 5 criteria (dropping the apparent duplicate
  "Professional communication" criterion) or "/30" if HR intends to keep 6 distinct
  criteria; Admin Staff Section 5's maximum label as "/20" for its 4 criteria. These are
  suggestions for the template-editor entry, not requirements.
- **AE form sample data.** The AE form as originally supplied had its header block filled in
  with a named employee, a named immediate head and a concrete evaluation period. Those values
  were stripped from `docs/references/` before the document was committed, so the copy in this
  repo is structure-only. The system treats the document as a template shape and seeds no
  header data from it. This does not block template creation.

## Assumptions Carried Forward (owner may still overturn)

Three items were not directly and explicitly answered by the owner as stated design
decisions. The orchestrator adopted a stated assumption for each so the SPEC could
proceed; all three are written into the requirements above as if settled, but remain open
to being overturned without treating that as a scope change.

- **Unreviewable-list reasons (from former B6).** Assumed: employees who cannot be
  reviewed this cycle are surfaced to HR as a list (not silently skipped), and the list
  now carries two reasons — "no manager/evaluator" (existing behavior) and "no template
  assigned" (new, from the explicit per-employee assignment field). See acceptance
  criterion 3 and the flow diagram's "UNREVIEWABLE LIST" branches. (Note: this is a
  distinct population from the "stalled sign-off" view introduced by the settled S2
  answer — the unreviewable list is reviews never created; the stalled-sign-off view is
  reviews that exist but cannot complete.)

- **Reminder channel split (from former B7).** Assumed: review-opened and overdue get
  in-app notification + real email; due-soon and awaiting-acknowledgement get in-app only,
  no email. See acceptance criterion 16, requirement 8, and the flow diagram's "REMINDERS"
  block. This assumption also drives the Constraints-section requirement that the
  reminder-evaluation job run more frequently than the cycle-generation job.

- **Validation-is-not-calculation (new, from the no-calculation scope reduction).**
  Assumed: even though the app never derives a subtotal/total/band, it still validates
  that what the evaluator types is *possible* — a rating inside the declared scale, a
  subtotal not exceeding its section's printed maximum, a total not exceeding the
  template's printed ceiling. Without this, an impossible value (e.g. 150/100) could be
  stored on a permanent HR record. See acceptance criterion 5. The owner has not
  explicitly confirmed this validation should exist versus accepting any typed number
  at face value; the orchestrator judged that accepting literally anything is a worse
  default for a permanent HR record.

## Background / Research Findings

Pulled from `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/research-findings_REF_25-08-26.md`
(two RESEARCH agents, cited against branch `feat/performance-eval-bimonthly-178`, tip ==
staging `db04eb6`), plus the three rounds of owner/HR feedback folded into this document:

- **Scope history.** The issue was filed "blocked pending the exact form spec." The user
  first simplified it to "just an evaluation form... straight up review and verdict" — but
  then, once HR delivered the two real forms, said *"There are 2 forms for now, so we will
  make it configurable."* The product owner then answered all eight of the original
  product-decision questions (B1–B8) plus both signature-design follow-ups (S1, S2). Most
  recently, HR clarified that **no calculation logic is needed in the app at all** — HR
  computes scores themselves outside the app. This SPEC now reflects all of that: nothing
  in this document should be read as still targeting the earlier "review + verdict" shape,
  a two-party review model, a fixed cadence constant, department/position-based template
  assignment, or **any in-app scoring/computation** — none of those survive into this
  revision.
- **Reminders are settled at the channel-choice level**: in-app notification + real email,
  chosen by the user over in-app-only, `.ics` download, and Google Calendar OAuth.
  Calendar/ICS stays out of scope. The *split* of which trigger points get which channel
  (opened/overdue = both; due-soon/ack = in-app only) is the orchestrator's stated
  assumption — see "Assumptions Carried Forward."
- **Signature model.** The paper forms list four signature lines in the order Employee,
  Immediate Supervisor, HR Representative, Department Head — but that is a physical
  document layout, not a signing sequence. Because the owner settled on sequential
  signing (S1) and the employee should reasonably attest *after* seeing what they're
  signing (once scoring and HR/department review are done), the seeded AE and Admin Staff
  templates use a deliberately different order than the paper layout: evaluator/supervisor
  first, then HR representative, then department head, then employee last. HR can reorder
  this per template at any time (acceptance criterion 10); reordering only affects future
  reviews, not ones already resolved (acceptance criterion 20).
- **No-calculation scope reduction.** HR's own words: *"According to HR, no calculation
  logic will be needed in this app because it will be up to them to calculate stuff."*
  This removed the weighted-total formula (`Σ (weight% × subtotal / sectionMax)`), the
  subtotal-summation logic, the band-derivation lookup, and the unrated-criterion
  denominator question that used to sit in Open Questions — that question dissolved
  entirely, because there is no denominator to apply it to. A previously-proposed pure
  `computeScore(template, answers)` module must not be built (see Out Of Scope,
  Constraints, and acceptance criterion 4).
- **Current schema** (`prisma/schema.prisma`): `ReviewCycle` (DRAFT/ACTIVE/CLOSED, no
  uniqueness constraint on period today — a `@@unique(organizationId, cycle window)` is
  now required per constraint/acceptance-criterion 15), `PerformanceReview`
  (`ReviewStatus`: PENDING→SELF_ASSESSMENT→MANAGER_REVIEW→COMPLETED→ACKNOWLEDGED, with
  `MANAGER_REVIEW` currently dead code — no code path ever writes it; the new lifecycle
  repurposes/renames this stage to SCORED and adds a SIGNING stage for the new sequential
  multi-party sign-off), and `Goal` (to be deleted entirely). `PerformanceReview` has no
  `organizationId` column of its own — it scopes through `cycle.organizationId`, a fact
  the new template/assignment/signatory model needs to keep working with.
- **`openReviewsForCycle`** (the auto-open logic that already exists) selects
  `employmentStatus:'ACTIVE'` employees with `reportsToId != null` — employees with no
  manager are silently skipped today. This SPEC now requires that gap (and the new
  no-template-assigned gap) to be surfaced to HR as a list, per the stated assumption
  above.
- **Redaction contract** (#179): `redactHrAuthored` nulls `managerComments` +
  `overallRating` from the employee's own view; it is unit-tested
  (`tests/unit/performance-redact.test.ts`) and reused by both the page load and the
  detail-page load. This SPEC replaces that narrow two-field rule with a whole-document
  gate behind an explicit HR RELEASE action (acceptance criteria 6-8 above), and requires
  the redaction to hold at the API layer, closing the pre-existing
  `/api/v1/performance/reviews` `asSubject` gap as part of building that gate (folded into
  acceptance criterion 8, not left as a separately-scheduled bug fix).
- **Reusable infra, do not rebuild:** in-app notifications
  (`src/lib/server/services/notifications.ts` — `notify`/`notifyMany`, no bell icon/no
  `/notifications` page, delivered via toast + dashboard "Recent activity"); email stubs
  at the `send*` seam (`src/lib/server/notifications.ts` — currently `console.log`, real
  email is in scope for this issue per the user's explicit decision, must fall back to
  console behavior when unconfigured); the `backup/plan.ts` +
  `scripts/backup-documents.ts` split (pure `isRunDue` logic, thin IO shell, `@@unique`
  constraint for double-create protection, advisory locking) as the closest precedent for
  the now-confirmed per-org-configurable cadence job; `scripts/promote-probationary.ts` as
  a simpler, hard-coded-interval precedent that no longer fully fits since cadence is now
  per-org configuration, not a constant.
- **No app-internal scheduler exists** — recurring work is a `scripts/*.ts` file invoked by
  a hand-installed droplet crontab; `deploy.yml` does not create it. This feature now needs
  two differently-frequenced jobs (cycle generation vs. reminder evaluation) — see
  Constraints.
- **Goal-removal blast radius** is fully enumerated in the digest §2: Prisma schema
  (`enum GoalStatus`, `model Goal`, `Employee.goals`), all of
  `src/lib/server/services/performance.ts`'s four Goal exports, `+page.server.ts` and
  `+page.svelte` Goal sections, `src/routes/api/v1/performance/goals/+server.ts` (delete
  whole file/directory), `scripts/prod-delete.ts` (order-coupled destructure — edit
  carefully) and `scripts/clean-e2e-employees.ts`, plus a mandatory
  `scripts/migrate-*.ts` pre-step to drop the `goals` table and `GoalStatus` type before
  `db push` (CLAUDE.md rule; `db push` cannot itself rename/drop an enum type cleanly).
  Historic `entityType='Goal'` audit rows are not FK-linked and survive the drop; they
  will keep rendering in the audit log.
- **Test inventory** (digest §4): `tests/unit/performance-redact.test.ts` (39 lines, depends
  on `cycle` in the review shape — breaks if `ReviewCycle` is removed/renamed, and now must
  be rewritten for the whole-document gate rather than the two-field rule);
  `tests/unit/review-privacy.test.ts` (104 lines, mocks the performance service's exact
  export list — changing that list breaks the import; has a reusable `vi.hoisted` +
  `vi.mock('$lib/server/db')` harness worth reusing); `tests/e2e/form-errors.spec.ts:37-60`
  (hard-coupled to both the cycle-creation form and the goal-form absence — dies with this
  work, needs a replacement, not a deletion); `tests/e2e/global-setup.ts:22` (route smoke,
  survives if `/performance` still loads). 14 of 15 `performance.ts` exports are currently
  untested; `services/notifications.ts` has zero test coverage today.
- **Dates module** (`src/lib/utils/dates.ts`): no generic `addMonths(date, n)` exists; the
  two existing month helpers deliberately use different timezone bases (Manila vs. UTC) for
  stated reasons, and #320 already found four latent month-boundary bugs in shipped code.
  Whatever the per-org cadence interval means in wall-clock terms must state its timezone
  basis explicitly — this SPEC defers the exact mechanism to PLAN/INNOVATE but flags it as
  a real risk surface, not a detail to wave through.
- **Standing project constraints** (CLAUDE.md, repeated in digest §6): Svelte 5 runes only,
  Prisma enum changes need a migration script before `db push`, no Redis, `Decimal` never
  raw to the client, `{@const}` only as an immediate block-tag child, pnpm 10 only, the
  user starts the DB/dev server, no `Co-Authored-By` in commits.

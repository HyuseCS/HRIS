---
name: spec:283-multi-role-activation
description: "Turn on multi-role assignment (User.roles) and close every same-actor separation-of-duties hole: request chain, statutory rates, document verification, job postings, payroll verify→approve"
keywords: rbac, roles, multi-role, separation of duties, maker-checker, statutory rates, settings, user roles, request documents, job postings, posting approvers, payroll sign-off
date: 11-08-26
issue: 283
---

# SPEC — #283 Multi-role has no activation point

## Summary

Every user in Veent HRIS is stored with a *list* of roles, but nothing in the product can
ever put more than one role in that list. A person who is both an HR Admin and a Verifier
has to be given one hat and denied the other. This change gives the CEO a way to assign a
user several roles at once, so their permissions become the combination of all of them.

Turning that on creates a new risk: one person could now hold two hats on the same
approval chain and rubber-stamp their own work. So the same change also adds the rule that
**one person may not decide two stages of the same request**, and **may not confirm a tax-rate
change they proposed themselves**. Roles stay freely combinable; the fairness check moves to
the moment a decision is made, not to the moment roles are handed out.

The same pass closes the remaining same-actor holes of the same shape, whether or not
multi-role is what opens them: **whoever signs off a supporting document may not decide the
request it supports** — except a system administrator, who may, and whose use of that exception
is recorded in the audit trail. And **whoever submits a job posting may not approve it**, with a
department's designated posting approver now genuinely binding instead of being overridable by
any HR admin.

---

## Stale parts of the filed issue (read the issue with these corrections)

The GitHub issue body predates PR #293 (#282, merged 2026-08-11). Three of its claims are
no longer true and must not drive this work:

| Issue says | Actual state today |
|---|---|
| `org.ts:279` writes `data: { role: newRole, roles: [newRole] }` | The scalar half is gone. The line is now `org.ts:285` and writes `data: { roles: [newRole] }`. |
| `ASSIGNABLE_ROLES` lives at `rbac.ts:166+` | It is at `rbac.ts:151`. |
| "Decide what `User.role` means" | `User.role` **no longer exists**. It was dropped in #282. There is only `User.roles` (`Role[]`). |

Two consequences: **no data migration is required** (the column is already `Role[]`,
already populated, non-empty on every row), and the issue's alternative branch — "remove
`roles` entirely and keep a single role" — is **formally dead** (see D6 below).

---

## User Stories / Jobs To Be Done

### US-1 — Give a person more than one hat
**As a** CEO, **I want** to assign a user several roles at once, **so that** someone who
genuinely does two jobs (e.g. HR Admin *and* Verifier) can do both without me juggling
accounts.

### US-2 — See the whole set, not just the first one
**As a** CEO opening Settings → Roles, **I want** the picker to show every role the person
currently holds, **so that** saving the form never silently deletes roles I could not see.

### US-3 — Never leave anyone role-less
**As a** CEO, **I want** the system to refuse an empty role set, **so that** I cannot create
a user who can log in but can do nothing and cannot be repaired.

### US-4 — Keep the org recoverable
**As a** CEO, **I want** the existing "you cannot remove the last CEO / last Super Admin"
protection to keep working when people hold several roles, **so that** a multi-role edit
cannot lock the organisation out of its own administration.

### US-5 — Same guarantees on the API
**As an** integrator using `PATCH /api/v1/settings/users/:id/roles`, **I want** the API to
accept a set and enforce exactly the same rules as the UI, **so that** the two surfaces can
never drift apart.

### US-6 — One person cannot approve their own approval
**As a** business owner, **I want** the person who verified a request to be barred from also
approving it, **so that** giving someone two hats does not quietly collapse our two-person
review into one.

### US-7 — One person cannot confirm their own tax-rate change
**As a** business owner, **I want** the person who proposed a statutory rate change to be
barred from confirming it, **so that** an `[HR_ADMIN, CEO]` user cannot change the tax tables
unilaterally.

### US-8 — My to-do count tells the truth
**As an** approver, **I want** my pending-work badge to exclude items I am barred from
deciding, **so that** I am not shown a count I cannot clear.

---

## What The User Wants (Behavioral Outcomes)

**Assigning roles**
- Settings → Roles offers a multi-select of the assignable roles instead of a single picker.
- The control opens pre-filled with everything the person currently holds.
- Saving replaces the person's set with exactly what is shown.
- The capability a user has is the union of every role they hold — holding two roles never
  takes anything away.
- The read-only view of a user's roles and the editable control always show the same list.
- Saving a set identical to the current one succeeds and is a no-op, not an error.
- Nobody can change their own roles — unchanged from today.
- Only the CEO can assign role sets — unchanged from today.
- The hire form is untouched: still one role, still from the reduced hire list.

**Refusals the user sees**
- Saving nothing selected is refused with a plain message naming the problem ("a user must
  keep at least one role"). Refused both in the form and on the API.
- Removing the last remaining CEO, or the last remaining Super Admin, is refused with a
  message naming which role would be lost — including when the target holds several roles
  and only one of them is the irreplaceable one.

**Separation of duties at decision time**
- Whoever recorded a decision on one stage of a request attempt cannot record the decision
  on another stage of that same attempt. They see the item as not actionable, with a reason.
- When the person filing a request is themselves the maker (the MAKE stage auto-completes in
  their name at filing time), that counts as their decision — they cannot then verify or
  approve it.
- The same person acting on a *different* request is unaffected.
- Whoever proposed a statutory-rate change cannot confirm it.
- Whoever marked a supporting document verified cannot decide that request — at any stage, on
  any attempt.
- A system administrator is the deliberate exception to that rule, and the audit trail records
  every decision where the exception was used, so the privileged path is visible rather than
  silent.
- Whoever submitted a job posting cannot decide it. A department that has a designated posting
  approver is decidable only by that approver; one without a mapping still falls back to HR.
- Whoever recorded the verify decision on a payroll run cannot approve that same run.
- Pending-work counts and queues exclude anything the viewer is barred from deciding.

**Not visible but required**
- No database migration, no backfill, no downtime.

---

## Flow / State Diagram

### A. Assigning a role set

```
 CEO opens Settings → Roles
          |
          v
 +-------------------------------+
 | Row shows user's FULL role    |
 | set, pre-selected in a        |
 | multi-select control          |
 +-------------------------------+
          |  edits selection, Save
          v
 +-------------------------------+
 | Is this me?                   |--yes--> REFUSED "you cannot change your own roles"
 +-------------------------------+
          | no
          v
 +-------------------------------+
 | Selection empty?              |--yes--> REFUSED "a user must keep at least one role"
 +-------------------------------+
          | no
          v
 +-------------------------------+
 | Does this drop the LAST       |--yes--> REFUSED "<role> would have no holder left"
 | CEO or the LAST SUPER_ADMIN?  |         (checked per irreplaceable role lost)
 +-------------------------------+
          | no
          v
   SAVED — user's capabilities = union of all selected roles
   Audit entry records old set -> new set
```

### B. A request attempt, with the new decision-time guard

```
   file request
        |
        v
 [ MAKE ] --(filer holds MANAGE_HR? auto-decided in filer's name)
        |                                   \
        | decided by Ana                      -> Ana now "has acted on attempt 1"
        v
 [ VERIFY ] -- may be decided by anyone holding VERIFIER
        |        EXCEPT someone who already acted on attempt 1
        | decided by Ben
        v
 [ APPROVE ] -- may be decided by anyone holding APPROVER
        |        EXCEPT Ana or Ben (already acted on attempt 1)
        |
        +--> APPROVED  (done)
        |
        +--> RETURNED  --> new attempt 2 begins
                             (does attempt 1's history still bar Ana/Ben?
                              --> OPEN QUESTION Q1)
```

### C. Statutory rate proposal

```
  HR_ADMIN proposes rate change  --> PENDING (proposedBy = Cara)
                                        |
                +-----------------------+------------------------+
                |                                                |
        confirm attempt by Cara                          confirm by anyone else
                |                                          holding MANAGE_STATUTORY_RATES
                v                                                |
            REFUSED "you cannot confirm                          v
            a change you proposed"                            APPLIED

        reject attempt by Cara --> ALLOWED (Q2: reads as withdrawing
                                   her own mistake; applies nothing)
```

### D. Job posting approval

```
  MANAGE_HR holder submits posting  --> PENDING_APPROVAL (submittedBy = Dana)
                                              |
                          does the department have a mapped approver?
                                              |
                 +----------------------------+---------------------------+
                 | yes                                                    | no
                 v                                                        v
      only that designated approver may decide            any MANAGE_HR holder may decide
      (D8 — HR can no longer override)                              |
                 |                                                  |
                 +------------------------+-------------------------+
                                          |
                            is the decider the submitter?
                                          |
                    +---------------------+---------------------+
                    | yes                                       | no
                    v                                           v
        REFUSED "you cannot decide a posting              APPROVED --> OPEN
        you submitted — ask HR to reassign this           REJECTED --> DRAFT + reason
        department's approver in Settings"
                    |
                    v
        UNDECIDABLE while the submitter is also the department's sole
        designated approver (D9). Escape hatch: HR remaps or unmaps the
        department in Settings -> Posting approvers. Accepted, not fixed.
```

---

## Acceptance Criteria (Testable Outcomes)

Each criterion is stated as an observable outcome. `proven by:` names the test scenario that
verifies it; `strategy:` is one of Fully-Automated / Hybrid / Agent-Probe. Scenario names are
drawn from the existing test surface found in RESEARCH (`tests/unit/user-admin-self-guard.test.ts`,
`approval-self-guard.test.ts`, `payroll-statutory-proposal.test.ts`, `proposal-queue.test.ts`,
`route-guard-multirole.test.ts`, plus `tests/e2e`).

**AC-1 — A user assigned two roles holds the capabilities of both.**
Given a user with `[EMPLOYEE]`, when the CEO saves `[HR_ADMIN, VERIFIER]`, then that user
can reach every screen and action either role alone would allow, and none is withheld.
- proven by: `user-admin-self-guard.test.ts › setUserRoles › assigns a multi-role set and the union of capabilities holds`
- strategy: Fully-Automated (unit)

**AC-2 — The same assignment works through the v1 API.**
Given the same starting state, when the CEO sends the v1 user-role request with a set of two
roles, then the stored set matches and every guardrail below behaves identically to the form.
- proven by: new `tests/unit/api-v1-user-roles.test.ts › accepts a role set and enforces the same guards`
- strategy: Fully-Automated (unit)

**AC-3 — The picker pre-fills with the whole set.**
Given a user holding two roles, when the CEO opens Settings → Roles, then both roles appear
selected in the editable control, and the read-only display for other rows lists the same
roles in the same way.
- proven by: `tests/e2e/settings-roles.spec.ts › prefills every held role in the picker`
- strategy: Fully-Automated (E2E)

**AC-4 — Saving an empty set is refused with a clear message.**
Given any user, when the CEO submits with nothing selected, then the save is refused, the
message says the user must keep at least one role, and the stored set is unchanged. Refused
identically on the form and on the v1 API.
- proven by: `user-admin-self-guard.test.ts › setUserRoles › refuses an empty role set` +
  `api-v1-user-roles.test.ts › rejects an empty roles array`
- strategy: Fully-Automated (unit)

**AC-5 — The last CEO cannot be demoted, even out of a multi-role set.**
Given the only CEO in the org also holds `HR_ADMIN`, when the CEO's set is changed to
`[HR_ADMIN]` alone, then the change is refused naming CEO as the role that would be left with
no holder.
- proven by: `user-admin-self-guard.test.ts › setUserRoles › refuses to drop the last CEO from a multi-role set`
- strategy: Fully-Automated (unit)

**AC-6 — The last Super Admin cannot be demoted, and multiple lost irreplaceable roles are all checked.**
Given a sole holder of both `SUPER_ADMIN` and `CEO`, when their set is changed to a set
containing neither, then the change is refused and the message names both roles.
- proven by: `user-admin-self-guard.test.ts › setUserRoles › reports every irreplaceable role lost`
- strategy: Fully-Automated (unit)

**AC-7 — Re-saving an unchanged set succeeds.**
Given the last Super Admin, when their existing set is saved again unchanged, then the save
succeeds and is not treated as a demotion.
- proven by: `user-admin-self-guard.test.ts › setUserRoles › does not block re-saving an existing set` (the
  existing single-role version of this case at `:233` is superseded)
- strategy: Fully-Automated (unit)

**AC-8 — Nobody changes their own roles.**
Given any actor, when they submit a role change targeting themselves, then it is refused —
on the form and on the v1 API — regardless of how many roles they hold.
- proven by: existing `user-admin-self-guard.test.ts › setUserRoles › self-change` cases, extended to sets
- strategy: Fully-Automated (unit)

**AC-9 — The verifier of an attempt cannot approve that same attempt.**
Given a user holding both `VERIFIER` and `APPROVER` who recorded the VERIFY decision on a
request attempt, when they attempt the APPROVE decision on that same attempt, then it is
refused and the request stays at APPROVE pending.
- proven by: `approval-self-guard.test.ts › canActOnStage › bars an actor from a second stage of the same attempt`
- strategy: Fully-Automated (unit)

**AC-10 — The same person may act on a different request.**
Given the same user barred on request A, when they decide the APPROVE stage of unrelated
request B where they took no earlier stage, then the decision succeeds.
- proven by: `approval-self-guard.test.ts › canActOnStage › does not leak the bar across requests`
- strategy: Fully-Automated (unit)

**AC-11 — All three stage crossings are barred, not just one.**
Given attempts where one actor holds `[MANAGER, VERIFIER]`, `[VERIFIER, APPROVER]`, and
`[HR_ADMIN, VERIFIER, APPROVER]` respectively, when they try to take a second stage in each
case, then each is refused.
- proven by: `approval-self-guard.test.ts › canActOnStage › covers MAKE+VERIFY, VERIFY+APPROVE, and all three`
- strategy: Fully-Automated (unit)

**AC-12 — The auto-completed MAKE step counts as its actor's decision.**
Given a filer who holds `MANAGE_HR`, so the MAKE stage is completed in their name at filing
time, when that same person tries to verify or approve the request, then it is refused.
- proven by: `approval-self-guard.test.ts › canActOnStage › treats the auto-completed MAKE as a decision`
- strategy: Fully-Automated (unit)

**AC-13 — The proposer of a statutory-rate change cannot confirm it.**
Given a user holding both `HR_ADMIN` and `CEO` who proposed a rate change, when they try to
confirm it, then it is refused and the proposal stays PENDING and unapplied.
- proven by: `payroll-statutory-proposal.test.ts › confirmProposal › refuses the proposer`
- strategy: Fully-Automated (unit)

**AC-14 — The refusal cannot be raced past.**
Given the same proposer, when the confirm is refused, then no rate config was written and no
"applied" audit entry exists.
- proven by: `payroll-statutory-proposal.test.ts › confirmProposal › rolls back cleanly when the proposer is refused`
- strategy: Fully-Automated (unit)

**AC-15 — Pending-work counts exclude items the viewer is barred from deciding.**
Given a user barred from the APPROVE stage of request A because they verified it, when their
pending-work badge is computed, then request A is not counted and does not appear in their
actionable queue.
- proven by: `proposal-queue.test.ts › actionable counts › excludes items barred by the same-actor guard`
- strategy: Fully-Automated (unit)

**AC-16 — The multi-role static scan still passes.**
Given the change is complete, when the existing static multi-role scan runs, then it reports
no single-role assumption anywhere in `src/lib` or `src/routes`.
- proven by: `route-guard-multirole.test.ts` (existing scan, unchanged assertion)
- strategy: Fully-Automated (unit)

**AC-17 — End-to-end: a two-hat user is created and immediately constrained.**
Given a fresh org, when the CEO grants one user `[VERIFIER, APPROVER]` and that user verifies
a request, then the UI shows the request as awaiting someone else's approval and offers that
user no approve control.
- proven by: `tests/e2e/multi-role-sod.spec.ts › two-hat user verifies then cannot approve`
- strategy: Fully-Automated (E2E)

**AC-18 — Nothing in the org needs a data migration.**
Given the change is deployed against an existing populated database, when the app starts,
then no schema migration and no backfill script is required and every existing user retains
their role.
- proven by: existing CI populated-DB push gate (#236 / PR #284)
- strategy: Hybrid (CI gate + one release-time confirmation)

### Added with the scope widening (F3, F4, F5)

**AC-19 — The verifier of a supporting document cannot decide that request.**
Given a user holding `[VERIFIER, APPROVER]` who marked a document on request A as verified, when
they attempt any stage decision on request A, then it is refused and the request stays pending.
- proven by: `approval-self-guard.test.ts › canActOnStage › bars the verifier of a request document from deciding that request`
- strategy: Fully-Automated (unit)

**AC-20 — An `ADMINISTER_SYSTEM` holder is carved out (D7).**
Given a `SUPER_ADMIN` or `CEO` who verified a document on request A, when they decide request A,
then the decision succeeds. The waiver is keyed on the **capability**, never on a rank.
- proven by: `approval-self-guard.test.ts › canActOnStage › lets an ADMINISTER_SYSTEM holder decide a request whose document they verified`
- strategy: Fully-Automated (unit)

**AC-21 — Queues and badges mirror the F3 bar.**
Given a user barred from request A by AC-19, when their pending-work count and approvals queue are
computed, then request A appears in neither.
- proven by: `proposal-queue.test.ts › actionable counts › excludes a request whose document the viewer verified`
- strategy: Fully-Automated (unit)

**AC-22 — Using the carve-out is recorded in the audit trail.**
Given the AC-20 case, when the decision is written, then its `Request` UPDATE audit entry carries
`selfVerifiedEvidence: true`; an ordinary decision by someone who verified nothing does not.
- proven by: `approvals.test.ts › decide › records selfVerifiedEvidence when the carve-out is used`
- strategy: Fully-Automated (unit)

**AC-23 — A mapped department's postings are decidable only by its designated approver (D8).**
Given a department with a `PostingApprover` mapping, when an HR admin who is **not** that approver
tries to decide one of its postings, then it is refused.
- proven by: `recruitment-posting-sod.test.ts › canApprovePosting › a mapped department is decidable only by its designated approver`
- strategy: Fully-Automated (unit)

**AC-24 — An unmapped department still falls back to HR.**
Given a department with no mapping, when any `MANAGE_HR` holder decides one of its postings, then
the decision succeeds.
- proven by: `recruitment-posting-sod.test.ts › canApprovePosting › an unmapped department still falls back to any MANAGE_HR holder`
- strategy: Fully-Automated (unit)

**AC-25 — The submitter of a posting cannot decide it, and the refusal names the way out (D9).**
Given a user who submitted a posting for approval, when they try to approve or reject it, then it
is refused, nothing is written, and the message tells them to ask HR to reassign the department's
posting approver in Settings → Posting approvers.
- proven by: `recruitment-posting-sod.test.ts › decideJobPosting › refuses the submitter and names the remap route`
- strategy: Fully-Automated (unit)

**AC-26 — The dashboard card mirrors the F4 submitter bar.**
Given the AC-25 user, when their awaiting-approval card is built, then the posting they submitted
is not listed.
- proven by: `recruitment-posting-sod.test.ts › listPostingsAwaitingApprover › omits postings the viewer submitted`
- strategy: Fully-Automated (unit)

**AC-27 — The verifier of a payroll run cannot approve it (F5).**
Given a user holding `[VERIFIER, CEO]` who recorded the VERIFY decision on a payroll run attempt,
when they attempt the APPROVE decision on that same attempt, then it is refused, the run is not
marked APPROVED, and it is excluded from their actionable-runs count.
- proven by: `approvals.test.ts › decidePayrollRun › a VERIFIER+CEO cannot approve a run they verified` + `› countActionablePayrollRuns › excludes it`
- strategy: Fully-Automated (unit)

**AC-28 — Un-verifying a document does not clear the bar (D11).**
Given an actor who marked a document on request A verified and is therefore barred, when they clear
that verification (`verifyDoc` with `verified=false`) and then attempt a decision on request A,
then it is **still refused**; the document reads as not-currently-verified (`verifiedAt` is null)
while `verifiedById` still records them.
- proven by: `approval-self-guard.test.ts › canActOnStage › the bar survives un-verifying the document` + `requests-documents.test.ts › setRequestDocumentVerified › clearing keeps verifiedById`
- strategy: Fully-Automated (unit)

**AC-29 — The UI and the service agree about a barred actor (D12).**
Given a barred actor on a payroll run they verified, when they open `/payroll/[id]`, then the
Verify/Approve control is rendered non-actionable **and** carries a reason that is reachable by
keyboard and exposed to assistive tech; **and** when the same action is posted directly, the
service refuses it with the matching message.
- proven by: `tests/e2e/multi-role-sod.spec.ts › a barred verifier sees a disabled sign-off control with a reason` (UI half) + `approvals.test.ts › decidePayrollRun › …` (service half, shared with AC-27)
- strategy: Fully-Automated — **E2E** for the UI half, unit for the service half. The only
  criterion in the set a unit test cannot carry alone: the claim is about rendered state and its
  accessible description, which needs a real DOM. Both halves are required; the point of AC-29 is
  that the two agree.

---

## Out Of Scope

1. **The SUPER_ADMIN run + approve + void payroll case**, via `OVERRIDE_FINALIZED`
   (`rbac.ts:62-73`). This is a capability-table question, not a same-actor one, and item 5
   below forbids touching that table. Note that the payroll **verify → approve** collapse is a
   different thing and is now IN scope as F5.
2. **Clearance sign-off in `separation.ts`** — one actor can mark every `ClearanceItem` cleared
   (`:135`) and then finalize the separation (`:247`). Judged *not* a separation-of-duties hole:
   clearance is a checklist, not a declared two-person control, so adding a second-person rule
   is a product decision ("who signs clearance?"). Filed as its own design issue.
3. **Custom / tenant-defined roles with an editable permission matrix.** The issue itself
   rules this out. If that is the real destination, close #283 and open a new issue.
4. **Any change to the hire form or to `HIRE_ROLES`.** The hire form keeps its single-role
   picker over the reduced 3-role list, by decision D3.
5. **Any change to the capability table itself** — which capability each role holds is
   unchanged.
6. **The `MANAGE_USER_ROLES` sole-holder problem** (only the CEO can assign roles, so the CEO
   is a single point of failure for all role administration). Acknowledged, not addressed here.
7. **A database-level constraint forbidding an empty role array.** Out of scope by D4 — see Risks.

---

## Constraints

**User decisions (given — not to be re-opened):**

- **D1.** Any role combination is allowed. There is **no forbidden-pairs matrix**. Separation
  of duties is enforced at *decision* time only. Rationale accepted: a static combination
  table must be re-audited whenever a capability moves, and it blocks combinations that are
  legitimate on most items.
- **D2.** *(revised 11-08-26 when the user widened the scope.)* The separation-of-duties work is
  **F1 (request + timesheet chain), F2 (statutory rates), F3 (request documents), F4 (job
  postings) and F5 (payroll verify→approve)** — every same-actor hole. The original test,
  "reachable today with a single role, therefore pre-existing debt, therefore out", is
  **retired**: it excluded F3 and F4, which the user has folded in on the grounds that one
  issue should own one coherent problem rather than leaving three fragments. Only the
  `OVERRIDE_FINALIZED` capability-table case remains out.
- **D3.** Only **Settings → Roles and its v1 API twin** become multi-valued. The hire form
  stays single-role because it runs under `MANAGE_HR`, which MANAGER holds — a multi-select
  there would let a MANAGER mint privileged accounts in one shot, bypassing CEO-only role
  assignment.
- **D4.** An **empty role set is illegal**, refused in the service *and* in the request schema.
  Not enforced as a database check constraint (that needs raw SQL; `db push` cannot express it).
- **D5.** `MANAGE_USER_ROLES` **stays CEO-only**. The known consequence — the CEO is the sole
  holder, a single point of failure — is recorded, not changed.
- **D6.** The issue's "**remove `roles` entirely**" branch is **dead**. #282 foreclosed it:
  reversing now means re-adding a scalar column, undoing the eleven-fallback deletion, and
  rewriting roughly 130 call sites. Recorded so it is not re-litigated.

**Added 11-08-26 with the scope widening (also given — not to be re-opened):**

- **D7.** **F3 is in scope, with an `ADMINISTER_SYSTEM` carve-out.** Whoever verified a
  supporting document on a request is barred from deciding that request — **except** a holder of
  `ADMINISTER_SYSTEM` (SUPER_ADMIN, CEO), who may do both and whose use of the exception is
  recorded in the audit trail. The user's words were "those who have high enough roles are the
  ones who can do that"; that is translated to a **named capability and nothing else**, because
  #282 deleted `ROLE_HIERARCHY` and a static test keeps rank floors deleted. **No rank, level,
  seniority or hierarchy concept may be introduced.**
- **D8.** **The F4 department mapping must BIND.** A department *with* a designated posting
  approver becomes decidable only by that approver; a department *without* one still falls back
  to any `MANAGE_HR` holder. This is what the guard's own comment already claims it does, and
  what an unreachable branch was written to do before a later line overrode it.
- **D9.** **No HR-steps-in fallback for F4.** If a department's designated approver also holds
  `MANAGE_HR` and submits a posting for their own department, that posting is **undecidable**
  until HR remaps or unmaps the department. The escape hatch is accepted, and the refusal
  message must name it so nobody is stranded without a clue.
- **D10.** **F5 is in scope**, reusing the F1 mechanism rather than a guard of its own.
- **D11.** **Clearing a document verification keeps `verifiedById`** and nulls only `verifiedAt`.
  Without this, F3 is bypassable in one click — a barred actor clears their own sign-off and
  decides, with the audit marker never firing. Every consumer keys on `verifiedAt`, so nothing
  else changes; `verifiedById` becomes the durable record of *who signed off*. Known ceiling,
  accepted: a later sign-off by a different actor overwrites it, so a colluding pair can still
  launder the bar. The upgrade path is a verification-history table.
- **D12.** **A barred actor's decision control is disabled with a keyboard-reachable reason**, not
  silently permissive and not merely absent — on *detail pages*. Queues continue to **filter**
  barred items out, because that is what US-8 requires; the two rules do not conflict once the
  surfaces are separated. Known gap, recorded not hidden: timesheets and the dashboard posting
  card have no detail page, so a barred actor there gets no explanation anywhere (risk R-P).

**System / technical constraints:**

- No data migration is available or needed — the column is already the array, already populated.
- The database default for the role array is the **empty array**, and non-emptiness is a writer
  convention with no constraint behind it.
- The existing last-holder guard already works on role *sets* and is keyed on roles **lost**;
  it needs no redesign, only correct inputs.
- Only the latest attempt of a request is live; earlier attempts are frozen history.
- The payroll maker-vs-signer guard is the in-repo precedent for the F1 shape, but it covers
  only maker-vs-signer, not verify-vs-approve.
- The two propose→confirm implementations in the codebase currently **disagree**: the action
  proposals one checks proposer-vs-decider, the statutory rates one does not. This change makes
  them agree.
- Fourteen existing role-assignment tests pin the current single-role signature and will all
  need to move with it — including one that pins the transaction isolation level.
- No test file exists for the v1 API twin today.
- `pnpm check` does not cover `prisma/**` or `scripts/**`, so seed and script call sites are
  not type-checked.

---

## Non-Functional / Risk

**R1 — Empty role sets remain possible at the database layer.** By D4 the ban lives only in
application code. Anything that writes the column outside the service (seeds, one-off scripts,
manual SQL) can still produce a role-less user, which the migration notes describe as an
unrecoverable lockout: they can authenticate, hold no capability, and the last-holder guard can
never be satisfied to give one back. Residual risk accepted; mitigation is that every
application path refuses it.

**R2 — Seed and script call sites are not type-checked.** `pnpm check` skips `prisma/**` and
`scripts/**`. A signature change to role assignment will not surface breakage in those ~17 seed
sites at check time. This has already bitten once (#282 shipped a broken site on exactly this
assumption).

**R3 — The static multi-role scan's role changes.** `route-guard-multirole.test.ts` is a regex
scan whose own header states multi-role "is unreachable until multi-role assignment ships, so no
behavioural test would catch it either." This issue is that precondition. Once behavioural tests
exist, the scan's value should be **reviewed** — does it still earn its keep as a regression net,
or is it now redundant? Flagged as a question, **not** a proposal to delete it.

**R4 — Audit trail asymmetry.** The role-change audit entry records the old value as a set but
the new value under a singular scalar key, so a diff viewer finds nothing to compare. Multi-role
makes this more visible. Whether to fix it here is Q4 below.

**R5 — Blast radius on existing guard tests.** Fourteen role-assignment tests and the approval
self-guard suite change shape at once. Risk of a large, hard-to-review diff; mitigated by the
fact that all of them are unit tests with fast feedback.

**R6 — Binding the posting mapping takes approval reach away from people who have it today.**
By D8, an `MANAGE_HR` holder who is not a department's designated approver can decide that
department's postings today and will not be able to tomorrow. Concretely: every HR admin, for
every department that has a `PostingApprover` row. This is the intended correction — the
mapping was always meant to bind — but it is a live behaviour change, not a refactor, and it
lands without warning for anyone currently working that way. Mitigation: departments with no
mapping are unaffected, and the fix is a one-row deletion in Settings → Posting approvers.

**R7 — The F3 carve-out is controlled by audit, not by a bar.** By D7 a holder of
`ADMINISTER_SYSTEM` may verify a document and still decide the request. Nothing stops them; the
only control is that the decision's audit entry records the exception was used. That is a
deliberate trade — the alternative was barring the two roles who exist to unstick things — but
it means the guarantee for those roles is *detection*, not *prevention*, and it holds only as
long as someone reads the audit trail.

---

## Open Questions

> **All four were answered by the user on 11-08-26 and are now binding.** The original text is
> kept below as the decision record. Resolutions:
>
> - **Q1 → attempt-scoped.** A new attempt after a RETURN clears the bar. The accepted argument
>   is stronger than the one drafted below: an actor barred from a stage cannot RETURN the
>   request either, since the bar covers deciding that stage in *either* direction — so nobody
>   can manufacture a fresh attempt to escape their own bar. Across attempts the worst case is
>   that they verified a superseded version and approve one somebody else verified, so two humans
>   always decide the live attempt. The "small org exhausts its deciders" argument drafted below
>   was **not** the basis for the decision.
>   Note this scoping does **not** transfer to F3: `RequestDocument` has no attempt column and a
>   verified document cannot be swapped after a return, so the F3 bar is per-request.
> - **Q2 → bar CONFIRM only; self-reject is allowed** and reads as withdrawing a mistake, since
>   rejecting applies nothing. No separate withdraw action.
> - **Q3 → rename both.** `PATCH /api/v1/settings/users/:id/roles` taking `{ roles: [...] }`.
> - **Q4 → fix it here.** `newValue` becomes `{ roles: [...] }`. Historical entries keep the old
>   singular key; no backfill.

**Q1 — After a RETURN, does a new attempt clear the bar? (owner: user)**
When a request is RETURNED, a new attempt begins. Should someone who decided a stage on attempt 1
be allowed to decide a stage on attempt 2?
*My reasoning, for the user to accept or overrule:* **clear the bar per attempt** (scope the guard
to the live attempt only). A RETURN means the request was materially changed and re-submitted, so
the earlier decision was about a different version of the document, and the whole point of the
return loop is to let the same reviewers look again. The opposite reading — bar them forever —
is stricter but risks a small org exhausting its available deciders after one return, leaving a
request permanently un-decidable. **Not settled. Needs the user's call.**

**Q2 — Is the statutory-rate bar symmetric on reject? (owner: user)**
The proposer clearly must not *confirm*. Must they also be barred from *rejecting* their own
proposal? Withdrawing your own proposal is often a legitimate, harmless action, but "reject" is
currently the same recorded decision as any other rejection. Options: bar both (strict symmetry),
allow self-reject as a withdrawal, or add an explicit withdraw action distinct from reject.

**Q3 — Should the v1 endpoint path and field be renamed? (owner: user)**
The endpoint is `PATCH /api/v1/settings/users/:id/role` with a singular `role` field; it will now
carry a set. Research found **no in-repo consumers and no external ones** — `/api/v1/*` authenticates
by session cookie only and there is no API-key mechanism anywhere — so the rename is not a breaking
change in practice. Options: rename path and field to plural now, rename the field only, or leave
both alone and accept the misnomer.

**Q4 — Should the audit asymmetry be corrected in this change? (owner: user)**
Role-change audit entries record the old value as a set and the new value under a singular scalar
key. Options: fix it here (small, related, makes multi-role diffs readable), or file it separately
to keep this change's diff tight. Note that leaving it means the first multi-role audit entries are
written in a shape a diff viewer cannot read.

---

## Background / Research Findings

Key facts from RESEARCH that shaped these requirements:

- Since #282, the role array is the app's only role column. All capability checks are OR-based
  across the held roles, so the union behaviour in AC-1 is already how the checker works — nothing
  in the checking layer needs to change. What is missing is purely an **assignment point**.
- There are seven writers of the role array. Four are application code (the role-assignment
  service, the settings form action, the v1 API twin, and employee creation); the rest are seeds
  and one already-run migration script. Every one produces a single-element array today.
- Exactly **one** single-role assumption remains in `src/`: the settings picker prefills from the
  first element of the set. Its own read-only branch on the very next lines already renders the
  full list. Every other display surface — employee detail, layout, audit log, dashboard — is
  already multi-safe.
- The last-holder guard already takes a role *array* and is keyed on which irreplaceable roles
  are being lost, looping over each one. It needs no redesign. Its caller has a skip-optimisation
  for the re-save case, which is what AC-7 pins.
- The schema's default for the array is empty, and non-emptiness is a convention with no constraint —
  the source of R1. The migration script's own comment describes a role-less user as an
  unrecoverable lockout.
- **F1** (request chain): the stage-authority check consults exactly two things — is this your own
  submission, and do you hold the stage's capability. It never looks at who decided the previous
  step, even though the deciding actor is recorded per step. Three crossings become reachable
  under multi-role. The filer-is-maker path auto-completes MAKE in the filer's name at filing time,
  which is why AC-12 exists. The payroll decision path already has a maker-vs-signer guard keyed
  on the maker's recorded actor, and its actionable-count helper already mirrors that guard — the
  in-repo precedent for both the F1 fix and AC-15.
- **F2** (statutory rates): confirm reads the proposer's id only to pass it to the audit trail; it
  never compares it to the acting user. Reject likewise. The gates are disjoint *today* — propose is
  HR-Admin-only, confirm is CEO/Super-Admin-only — so the two-person rule from #220 survives only
  by accident of single-role assignment. One `[HR_ADMIN, CEO]` user collapses it entirely. The
  action-proposals service already implements the correct check; the two implementations disagree.
- **Test surface:** nineteen same-actor guards are already tested across five files. Exactly **one**
  multi-role fixture exists in the entire test tree. The static multi-role scan explicitly names this
  issue as its own precondition (see R3). No test file covers the v1 API twin.
- **Scope test, retired 11-08-26.** This SPEC originally excluded F3, F4 and the SUPER_ADMIN
  payroll case on the grounds that all three are reachable **today with a single role** — not
  opened by multi-role, already open. The user retired that test and folded F3 and F4 in, on the
  grounds that one issue should own one coherent problem rather than leave three fragments
  behind. Single-role reachability no longer excludes anything. What remains out is out for a
  different reason: `OVERRIDE_FINALIZED` is a capability-table question, and clearance sign-off
  is not a declared two-person control in the first place.
- **F5 was found during planning, not research.** The payroll chain's VERIFY (`VERIFY_REQUESTS`)
  and APPROVE (`APPROVE_FINANCE`) capabilities are disjoint only while multi-role is off, so
  `[VERIFIER, CEO]` newly collapses them. The existing maker-vs-signer guard does not catch it.
  It is multi-role-created, exactly like F1 and F2, so it would have belonged here even under the
  retired test.

---
name: plan:283-multi-role-activation
description: "Activate multi-role assignment (Settings → Roles + v1 twin) and close every same-actor separation-of-duties hole: F1 request chain, F2 statutory rates, F3 document verification, F4 job postings, F5 payroll verify→approve"
keywords: rbac, roles, multi-role, separation of duties, maker-checker, statutory rates, settings, approvals, request documents, job postings, posting approvers, payroll sign-off
date: 11-08-26
issue: 283
complexity: COMPLEX
spec: process/general-plans/active/multi-role-activation-283_11-08-26/multi-role-activation-283_SPEC_11-08-26.md
---

# PLAN — #283 Multi-role activation + decision-time separation of duties

**Date**: 11-08-26
**Status**: PLANNED (awaiting VALIDATE)
**Complexity**: COMPLEX
**Issue**: #283

## Overview

> ## ⛔ READ BEFORE EXECUTE — status as of 12-08-26
>
> **Gate: CONDITIONAL (VALIDATE pass 2, 0 FAILs). P1–P6 are now ALL APPLIED to the plan text below.**
> All five pass-1 blockers were re-verified and HOLD. **EXECUTE is authorised.** What was corrected,
> so a reader of the older tables below is not misled:
>
> 1. **P1 — §11 non-goal item 9 is SUPERSEDED: `documents.ts` IS edited in commit 5.** Honouring the
>    original item reproduces the B-5 bypass *with AC-19 green*. This is still the single most likely
>    way this build goes wrong. Item 9 is struck through in place; item 16 is new. Read both.
> 2. **P2 — commit 5's F3 predicate comment no longer claims the artefact is immutable.** The 409
>    holds only *while the sign-off stands*; the un-verify → owner-delete → re-upload path is an
>    accepted KNOWN GAP, named in the comment and in §11 item 16.
> 3. **P3 — commit 4's payroll snippet builds a 2-field `StageSoD`.** `verifiedDocActorIds` arrives
>    with the interface in **commit 5** (its call-site table now names the payroll page explicitly).
>    Passing it at commit 4 is `TS2353` and `pnpm check` goes red there.
> 4. **P4 — commit 5 opens by giving `approval-self-guard.test.ts`'s `pendingRequest` fixture a
>    `documents: []` key**, or `pnpm test` is red. The db-mock harness to copy is
>    `approval-self-guard.test.ts:18-31` (or `proposal-queue.test.ts:41-43`) — **never**
>    `approvals.test.ts`, which is a pure-function suite with no `vi.mock`. AC-22, AC-27's service
>    half and the F5-message row moved to `approval-self-guard.test.ts` accordingly.
> 5. **P5 — the payroll `actBlockedReason` has two branches** (maker vs earlier decider), mirroring
>    the two service messages. A single string tells the maker something false.
>
> Also stale below: any line saying "EXECUTE is not authorised while BLOCKED" (pass 1's gate).
> P6 housekeeping (N-P1..N-P6: stale commit numbers, R-F's `"User"` SQL, Touchpoints counts) is
> **not** applied — all six are cosmetic and none changes what gets built.
>
> **No code has been written yet.** Branch `feat/multi-role-activation-283`. Start at commit 1.

**TL;DR** — **Nine** commits on one branch, one PR. Commits 1–3 turn the role picker into a set
(service → form → API); commits 4–7 close **all five** same-actor separation-of-duties holes
(F1 request chain + F5 payroll verify→approve, F3 document verification, F2 statutory rates,
F4 job postings); commit 8 adds E2E + a seeded two-hat account; commit 9 is the
live-verification/cleanup commit. The tree is green at every commit. `setUserRole` becomes
`setUserRoles(userId, organizationId, newRoles: Role[], ctx)`. The F1/F3/F5 guard becomes a
**required 5th parameter `sod` on `canActOnStage`**, so TypeScript forces every caller — including
the badge counters — to answer it.

**Scope note (11-08-26):** the user folded F3, F4 and the payroll verify→approve gap this plan
itself discovered into #283. The issue is no longer "activate multi-role + close what multi-role
opens" — it is **"activate multi-role AND close every same-actor separation-of-duties hole."** One
issue, one PR. The "reachable today with a single role" test that previously excluded F3/F4 is
**retired**; see D7/D8/D9 in §1 and the SPEC edits in §16.

Contract: the SPEC's 8 user stories and **AC-1..AC-29**
(`process/general-plans/active/multi-role-activation-283_11-08-26/multi-role-activation-283_SPEC_11-08-26.md`).
**All of §16's SPEC edits are APPLIED** — the SPEC carries the widened scope, D1..D12, diagram D,
R6/R7, AC-19..AC-29, and Q1–Q4 marked resolved. §16 is kept as the record of what changed, not as a
to-do list. This plan implements the SPEC; it does not re-derive it.

---

## 0. Session Setup

| Field | Value |
|---|---|
| feature | none (general-plans; issue-scoped) |
| phase | PLAN |
| session-goal | Activate multi-role assignment and close F1/F2 SoD gaps for #283 |
| branch | **to cut:** `feat/multi-role-activation-283` |
| worktree | main |
| context-group | none — `process/context/` is deliberately empty in this repo |
| blast-radius-packages | `src/lib/server/services/{settings,approvals,payroll,requests}`, `src/routes/(app)/settings/roles`, `src/routes/api/v1/settings/users`, `tests/unit`, `tests/e2e`, `prisma/seed-core.ts` |
| active-plan | this file |
| test-runner | `vitest` (`pnpm test`) \| `playwright` (`pnpm test:e2e`) |
| validate-contract | pending — see §12 |

**Branch command (first action of EXECUTE):**

```bash
git switch staging && git pull && git switch -c feat/multi-role-activation-283
```

**Gate order — non-negotiable, CI runs `format:check` FIRST and skips everything after it on
failure (this has burned the repo four times):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

`pnpm check` does **NOT** typecheck `prisma/**` or `scripts/**`. Every seed/script touched in this
plan must be proved by actually running it (`pnpm db:seed`), not by `pnpm check`.

---

## 1. Approved Decisions Carried In (do not re-open)

D1 any role set, no forbidden-pairs matrix · D2 SoD scope = F1 + F2 only · D3 only Settings → Roles
and its v1 twin become multi-valued; the hire form and `HIRE_ROLES` are untouched · D4 empty set
illegal in service **and** schema, no DB check constraint · D5 `MANAGE_USER_ROLES` stays CEO-only ·
D6 the "remove `roles` entirely" branch is dead.

Q1 the F1 bar is **attempt-scoped** · Q2 statutory rates bar **CONFIRM only**, self-REJECT allowed ·
Q3 **rename** the v1 endpoint to `.../roles` taking `{ roles: [...] }` · Q4 **fix** the audit
asymmetry, no backfill of historical entries.

**Added 11-08-26 when the user widened the scope (also not to be re-opened):**

**D7 — F3 is in scope, with an `ADMINISTER_SYSTEM` carve-out.** Whoever verified a supporting
document on a request is barred from deciding that request — **except** a holder of
`ADMINISTER_SYSTEM` (`rbac.ts:58` → SUPER_ADMIN, CEO), who may do both. The user's words were
"those who have high enough roles are the ones who can do that". That is translated to a **named
capability** and to nothing else: #282 deleted `ROLE_HIERARCHY`, and
`tests/unit/rbac-no-rank-helpers.test.ts` is a static scan that keeps rank floors deleted. **No
rank, level, seniority or hierarchy concept may be introduced.** The predicate is literally
`canAny(actorRoles, 'ADMINISTER_SYSTEM')`.

**D8 — the F4 department mapping must BIND.** In `canApprovePosting` (`recruitment.ts:114-123`),
delete line `:122` (`return canAny(actorRoles, 'MANAGE_HR')`) and **keep** `:121`. A department
*with* a mapped approver becomes decidable only by that designated approver; a department *without*
one still falls back to any `MANAGE_HR` holder. This is what the function's own comment and
`posting-approvers.ts:6-11` already claim it does.

**D9 — no HR-steps-in fallback for F4(b).** If a department's designated approver also holds
`MANAGE_HR` and submits a posting for their own department, that posting is **undecidable** until
HR remaps or unmaps the department in Settings → Posting approvers. That escape hatch is accepted,
and **the 403 message must name it** so the user is not stranded. Recorded in the risk register as
R-K.

**D10 — F5 (payroll VERIFY→APPROVE by one actor) is in scope**, reusing the F1 mechanism. This
supersedes DECISION-3 below, which is rewritten accordingly.

**Added after VALIDATE returned BLOCKED (11-08-26) — also not to be re-opened:**

**D11 — clearing a document verification keeps `verifiedById`.** VALIDATE found (B-5) that F3 as
originally specified is bypassable in one click: `actions.verifyDoc` accepts `verified=false`, and
`setRequestDocumentVerified` (`documents.ts:162`) nulls **both** `verifiedById` and `verifiedAt` for
any `APPROVE_REQUESTS` holder — 7 of 9 roles. A barred actor un-verifies their own sign-off and
decides, with no `ADMINISTER_SYSTEM` needed and `selfVerifiedEvidence` never firing, so R-L's audit
marker stays silent. AC-19 would have passed with the guard fully live while the door stood open in
production.

The fix: **the clear branch sets `verifiedAt: null` but KEEPS `verifiedById`.** VALIDATE verified
the premise — every consumer keys on `verifiedAt` (`approvals.ts:215`, the delete lock at
`documents.ts:192`, `requests/[id]/+page.svelte:230,240,244,250,256,260`,
`requests/approvals/+page.svelte:163-164`) and **nothing in `src/` reads `verifiedById`** except the
unused `verifiedBy` relation. So `verifiedById` changes meaning from *"who currently verifies"* to
**"who last signed off"**, the F3 bar keys on it, ordinary approvers keep their un-verify correction
path, and there is no schema change and no new state. One line.

Consequences that are part of the decision, not optional:
- the schema comment (`prisma/schema.prisma:854-856`) and the service comment (`documents.ts:14-16`)
  must be updated — leaving them describing the old meaning is exactly how the next person
  reintroduces this bug;
- the known ceiling (a *different* actor verifying the same document later overwrites
  `verifiedById` and forgets the earlier signer's bar) is accepted — it needs two colluding people —
  and must be marked with a `ponytail:` comment naming the upgrade path (a verification-history
  table);
- AC-28 proves the bypass is closed.

**D12 — a barred actor's decision control is DISABLED with an explanation, not silently permissive
and not simply absent.** The user's words: *"the button should disappear for barred actors or at
least be disabled then have an on-hover tooltip to tell them what or who to approach."* Second
reading taken — disabled + explanation — because a vanished control reads as a bug and teaches
nothing. This settles B-2's open UI question: the payroll page **must** receive real SoD data,
because it cannot render the correct state without it.

**Scope boundary (read this before implementing — the four surfaces are not the same shape).**
D12 says "don't make it vanish". Three of the four named surfaces are **queues**, where vanishing is
the *specified* behaviour and is load-bearing:

| Surface | Kind | D12 treatment | Why |
|---|---|---|---|
| `payroll/[id]` Verify/Approve control | **detail page** — the user navigated to one specific record | **Disabled + reason.** The full D12 treatment. | `{#if data.canAct}` at `+page.svelte:365` today. A detail page is "this record"; hiding the control there is exactly the silent-vanish D12 forbids. |
| `requests/[id]` detail page | **detail page** | **Reason line only** (no control to disable — see below) | The page has **no decide control at all**; `actions` are `uploadDocs`, `deleteDoc`, `verifyDoc` only. Decisions happen on the queue. So D12's "explain why" half lands here as a read-only line in the existing approval timeline. |
| `requests/approvals` queue + sidebar badge | **queue** | **stays excluded** | AC-15 / AC-21 / **US-8** ("my to-do count tells the truth") require exclusion. Rendering barred rows with dead buttons directly contradicts the criterion this same PR adds. |
| timesheets list, dashboard posting card | **queue** | **stays excluded** | Same reason (AC-26 for postings). Neither has a detail page with a decision control today. |

So: **D12 is implemented in full on `payroll/[id]`, as an explanatory line on `requests/[id]`, and
is deliberately NOT applied to the three queue surfaces** — applying it there would require making
`listPendingRequestsForApprover` annotate rather than filter, which breaks AC-15/AC-21/AC-26 and
US-8 in the same PR that adds them. If the user wants barred-but-visible queue rows, that is a
separate change to what a queue *means* and needs its own issue.

**The explanation text must match the service's 403 verbatim**, so the UI and the API can never
disagree:

| Guard | Control state | Reason shown | Matching service refusal |
|---|---|---|---|
| F1 | reason line on `requests/[id]` | "You already decided an earlier stage of this attempt — another verifier or approver must act." | `decide()` 403 "You cannot act on this stage" |
| F3 | reason line on `requests/[id]` | "You signed off a supporting document on this request — another approver must decide it." | same 403 |
| F4 | queue exclusion + the 403 itself | "You submitted this posting — ask HR to reassign this department's posting approver in Settings → Posting approvers." | **must be byte-identical to D9's required 403 wording** |
| F5 (maker) | disabled control on `payroll/[id]` | "You prepared this payroll run — another finance approver must sign it off." | `decidePayrollRun` 403 **"You cannot sign off a payroll run you prepared"** (`approvals.ts:445`) |
| F5 (earlier decider) | disabled control on `payroll/[id]` | "You already recorded a decision on this run — another finance approver must sign it off." | `decidePayrollRun` 403 "You cannot act on this stage" (the generic `canActOnPayrollStage` bar) |

**Accessibility — specified, not hand-waved.** A native `disabled` button fires no pointer or focus
events and leaves the tab order, so a hover-only tooltip on it is invisible to exactly the keyboard
and screen-reader users who most need it. **I checked this codebase for an existing
disabled-with-reason pattern and there is none:** zero uses of `aria-disabled` anywhere in `src/`;
`aria-describedby` appears only via the form-field `describedBy()` helper in
`requests/+page.svelte`; `title=` is used for pointer-only sugar on icon buttons; and none of the
13 components in `src/lib/components/ui/` is a button-with-reason. So a minimal new pattern is
needed, and it is kept to **markup, no component, no library**:

```svelte
{#if data.canAct}
	<!-- existing submit button, unchanged -->
{:else if data.actBlockedReason}
	<button type="button" aria-disabled="true" aria-describedby="act-blocked" class="… opacity-50 cursor-not-allowed">
		Approve
	</button>
	<p id="act-blocked" class="text-xs text-muted-foreground">{data.actBlockedReason}</p>
{/if}
```

Three deliberate choices:
1. `type="button"` + `aria-disabled` rather than `disabled` — the control **stays focusable and in
   the tab order**, so the reason is reachable by keyboard. `type="button"` (not `submit`) is what
   makes the handler a genuine no-op; `aria-disabled` alone on a submit button would still submit.
2. The reason is **always-visible adjacent text**, not a tooltip, and `aria-describedby` binds it to
   the control. This is a deliberate upgrade of the user's "on-hover tooltip": hover-only fails the
   accessibility constraint, and visible text needs no tooltip machinery at all. A `title=` may be
   added on top as pointer sugar; it is never the only carrier of the reason.
3. `data.actBlockedReason` is a **string or null computed in the `load`**, next to `canAct` and from
   the same SoD inputs — so there is exactly one place that decides both, and the UI cannot drift
   from the service.

**C-P5/P5 — the payroll reason has TWO branches, not one.** `canActOnPayrollStage` bars everyone in
`decidedActorIds`, and per RC-10 that set **includes the MAKE actor**. So the maker also lands on
`canAct: false`, and a single string would tell them they "recorded the verify decision", which is
false. The service deliberately keeps two messages here (commit 4 edit 2 hoists the maker block
above the generic call precisely to preserve its specific one); the page mirrors that split:

```ts
const makeStep = run.approvalSteps.find((s) => s.attempt === live.attempt && s.stage === 'MAKE')
const actBlockedReason = canAct
	? null
	: makeStep?.actorId === user.id
		? 'You prepared this payroll run — another finance approver must sign it off.'
		: decidedActorIds(run.approvalSteps, live.attempt).includes(user.id)
			? 'You already recorded a decision on this run — another finance approver must sign it off.'
			: null
```

Note this **re-derives** `makeStep` for the *message* only — the `&& makeActorId !== user.id`
authorisation clause at `:65` is still deleted (B-2/RC-10: subsumed by the generic bar). Message and
gate are separate concerns; do not resurrect the clause.

**Commit impact: none.** D12 rides commit 4 (payroll surface, F1/F5) and commit 7 (F4's 403 wording,
already required by D9). The `requests/[id]` reason line rides commit 5 with F3. **The commit count
stays at nine.**

---

## 2. Research Corrections (facts that differed from the brief)

The handed-over research was accurate on every line it named. Three things it did **not** name, all
of which change the commit contents:

| # | Correction | Consequence |
|---|---|---|
| **RC-1** | `tests/unit/approvals.test.ts` calls `canActOnStage` **14 times** (`:17,20,25,27,32,34,40,41,42,49,50,51,76,77` — corrected from 15 by VC-1) and `canActOnPayrollStage` 4 times. The brief listed only `approval-self-guard.test.ts` as F1's home. | Commit 4 must update `approvals.test.ts` too, or `pnpm check`/`pnpm test` goes red at that commit. |
| **RC-2** | `canActOnStage` has **three more production callers** the brief did not list (bringing it to six in total — VC-1): `src/lib/server/services/timesheets.ts:362`, `src/routes/(app)/requests/timesheets/+page.server.ts:50`, and `countActionableTimesheets` (`approvals.ts:~318`). Timesheets run the **same** `STAGE_CAPABILITY` maker-checker chain. | Forces DECISION-2 below (timesheets are in or out of the F1 guard — this plan says **in**). |
| **RC-3** | `tests/unit/route-guard-multirole.test.ts:86` hard-codes the literal source line `const updated = await setUserRole(params.id, user.organizationId, parsed.data.role, {` as a "real near-miss in the tree today" fixture. `:89` hard-codes `roles: [input.role]`. | Renaming the service/param makes that fixture stale (it stops mirroring reality). Commit 3 must update the string. This is *not* weakening the scan — the scan's assertion is unchanged; only its sample corpus is refreshed. |
| **RC-4** | The request-queue counterpart the brief called "`listActionableRequests` or equivalent" is actually **`listPendingRequestsForApprover`** at `approvals.ts:205`, consumed by `countPendingApprovals` (`:246`) and by `src/routes/(app)/requests/approvals/+page.server.ts:21`. | Names the exact AC-15 mirror site. |
| **RC-5** | `tests/e2e/settings-roles.spec.ts` and `tests/e2e/multi-role-sod.spec.ts` (named by AC-3 and AC-17) **do not exist**. | Both are new files in commit 6. |

### Verified for the widened scope (F3 / F4 / F5), all against `9a5df08`

| # | Fact | Consequence |
|---|---|---|
| **RC-6** | `RequestDocument` (`prisma/schema.prisma:859-876`) has **no `attempt` column** — only `requestId`, `verifiedById`, `verifiedAt`. There is no way to key a document sign-off to an approval attempt without adding one. | Forces DECISION-6: the F3 bar is **per-request**, not attempt-scoped. |
| **RC-7** | `decide()` (`approvals.ts:~104`) loads the request with `include: { steps, employee }` — **no `documents`**. `listPendingRequestsForApprover` (`:205`) *already* includes `documents: { select: { id: true, verifiedAt: true } }` but **not `verifiedById`**. | `decide()` needs a new `documents` include (+1 Prisma relation query on a `@@index([requestId])` FK, on a low-frequency write path). The queue mirror needs **only** `verifiedById: true` added to a select that already exists — zero cost. |
| **RC-8** | There is **no v1 API twin for `verifyDoc`**. `setRequestDocumentVerified` has exactly one caller: the `verifyDoc` form action at `src/routes/(app)/requests/[id]/+page.server.ts:145-165`, gated on `canAny(user.roles, 'APPROVE_REQUESTS')` — held by **seven of nine roles** (`rbac.ts:77-85`). | One door only. But the guard still goes in the **service side of the decision** (`canActOnStage`), not the verify route — see DECISION-6. |
| **RC-9** | The F4 decide path is **not** the recruitment page. `recruitment/+page.server.ts:17` is `MANAGE_HR`-gated, but the live decide action is the dashboard card `decidePosting` (`src/routes/(app)/dashboard/+page.server.ts:168-198`), which has **no capability gate at all** — it resolves the actor's employee id and hands straight to `decideJobPosting`. | D8's binding is genuinely reachable: a designated approver holding only `EMPLOYEE` can already decide from the dashboard today. Deleting `:122` therefore does not orphan the flow. |
| **RC-10** | Payroll's MAKE step **is** auto-decided with an actor: `ensurePayrollApprovalChain` (`approvals.ts:382`) calls the same `buildApprovalChain`, which writes `decision: 'APPROVED', actorId: makerUserId` for MAKE (`routing.ts:43-49`). | `decidedActorIds()` therefore already contains the payroll maker, so the F1 mechanism **strictly subsumes** the existing maker-vs-signer guard at `:443-446` and the `makeActorId !== userId` clause at `:~315`. F5 falls out of F1 — see DECISION-3 (rewritten). |
| **RC-11** | `canApprovePosting`'s `:122` reachability claim holds: `:121` and `:122` return the same expression when `resolvedApproverEmployeeId` is null, and `:122` is the only reachable answer when it is non-null and the actor is not the approver. The trailing `(approver != null \|\| isHr)` clause at `:199` is provably redundant once `:122` is deleted (proof in DECISION-8). | F4(a) and F4(c) are both safe as the user specified them. |
| **RC-12** | `MANAGE_HR` = `['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']` (`rbac.ts:26`). | Names exactly who loses posting-approval reach when D8 binds the mapping — risk R-J. |

### VALIDATE corrections absorbed (the plan was BLOCKED; these supersede the rows above)

VALIDATE re-derived the whole caller census and queried the live dev DB. Full evidence is in
`## Validate Contract` at the end of this file — **do not delete it.** What changed here:

| # | Correction | Supersedes | Consequence |
|---|---|---|---|
| **VC-1** | **Caller census, hand-counted.** `canActOnStage` has **6 production** callers (`approvals.ts:73` inside `canActOnPayrollStage`, `:125` `decide`, `:223` `listPendingRequestsForApprover`, `:344` `countActionableTimesheets`, `timesheets.ts:362`, `routes/(app)/requests/timesheets/+page.server.ts:50`) and **14 test** calls (`approvals.test.ts:17,20,25,27,32,34,40,41,42,49,50,51,76,77` — `approval-self-guard.test.ts` mentions it only in prose). `canActOnPayrollStage` has **3 production** callers and 4 test calls. **Totals: 9 production, 18 test.** | RC-1's "15", RC-2's implied "5 production", and the Public Contracts "2 call sites" row | Prose and tables now agree. The commit-4 table was already right for `canActOnStage`; only the counts were wrong. |
| **VC-2** | **A third `canActOnPayrollStage` caller exists:** `src/routes/(app)/payroll/[id]/+page.server.ts:64` computes `canAct` and gates the Verify/Approve **button**. | the plan's "2 call sites" | **B-2.** It receives the real SoD data — see commit 4. A UI offering an action the service 403s is a defect, not a conservative default. |
| **VC-3** | **`tests/unit/posting-approval.test.ts:25` — `'lets HR override even when another approver is mapped'` — asserts exactly the behaviour D8 deletes**, and passes today (baseline 101 files / 1226 tests). | the green-at-every-commit claim | **B-1.** Commit 7 must rewrite that case in the same commit. See commit 7. |
| **VC-4** | **`proposal-queue.test.ts` cannot prove AC-15 or AC-21** — it tests the #224 action-proposals page and never touches the approvals service. Repo-wide, **nothing** tests `countPendingApprovals`, `listPendingRequestsForApprover`, `countActionableTimesheets` or `countActionablePayrollRuns`. | the AC-15 / AC-21 rows in §8b | **B-3.** DECISION-4's entire justification for putting the guard in `canActOnStage` was the badge mirror — which was unproven by construction. New file `tests/unit/approval-queues.test.ts`; see §8b. |
| **VC-5** | **`countActionablePayrollRuns` (`:289`) and `countActionableTimesheets` (`:324`) are not exported**, so the AC-27 count half and the DEC-2 row named tests that could not be written — which also removed R-C's stated mitigation. | AC-27, DEC-2 | **B-4.** Both are **exported** in commit 4, with a one-line rationale: they are now guard-bearing, and a guard nobody can test is a guard nobody can trust. |
| **VC-6** | **F3 is bypassable via `verified=false`.** | the F3 threat model | **B-5 → D11.** Commit 5 keys the bar on `verifiedById` and stops nulling it. |
| **VC-7** | **Half the §9 SQL cannot run.** `User`, `AuditLog`, `Request`, `ApprovalStep` are all `@@map`'d to snake_case; VALIDATE got `relation "User" does not exist` live. Real names: `users`, `audit_logs`, `requests`, `approval_steps`, `request_documents`, `job_postings`, `posting_approvers`, `departments`, `payroll_runs`, `statutory_rate_proposals`. | every SQL block in §9 | §9 rewritten. |
| **VC-8** | **The two-hat seed account was specified into the wrong seed.** `prisma/seed-core.ts:235` is inside `seedFoodServiceOrg` (reached by `seedProd`); the verifier the plan pointed at is `:680`, inside **`seedE2E`**. `pnpm db:seed` runs `seed.ts`; `pnpm db:seed:e2e` runs `seedE2E`. | commit 8 and M-1 | The account goes next to `:680` in `seedE2E`, and **M-1's proof command is `pnpm db:seed:e2e`**. |
| **VC-9** | **The dev DB cannot measure R-J.** Live counts: **0** rows in `posting_approvers`, 13 departments, 1 CLOSED job posting, **0** `request_documents`, 46 users, **0** multi-role rows. | R-J's "paste which users lose reach" and the M-7/M-8 fixtures | Nothing locally loses approval reach and nothing becomes undecidable. Said plainly in R-J; M-7 and M-8 now specify **hand-created fixtures**, and commit 9's impact list is a **staging** read or an explicit "none locally". |
| **VC-10** | Confirmed by VALIDATE and kept unchanged: F1 attempt-scoping is sound (`resubmitRequest`, `requests/index.ts:153-180`, does `max(attempt)+1` + `createMany` of fresh rows — nothing is mutated); F5's subsumption is real (`payroll/index.ts:485` passes the maker and `approvals.ts:404` preserves it via `actorId: s.actorId ?? null`); DECISION-8's redundancy proof re-derived correct and `isHr` genuinely orphaned; the User-id/Employee-id trap correctly avoided; and `pnpm check` **does** typecheck `tests/**/*.ts`, so DECISION-4 reason 3's compile-enforcement argument holds over test call sites too. | — | **Do not "fix" any of these.** |

Everything else in the brief — every file:line, `assertNotLastOfRole`'s multi-role correctness, the
`decidePayrollRun` precedent at `:443-446`, `assertMayDecide` at `action-proposals.ts:70-72`, the
`buildApprovalChain` auto-MAKE at `routing.ts:41-48`, the `Object.fromEntries` trap, the read-only
branch already joining the full set — was verified correct against the tree at `9a5df08`.

---

## 3. Plan-Level Decisions

### DECISION-1 — the skip-optimisation at `org.ts:276` is **deleted**, not translated

The current branch is:

```ts
if (!existing.roles.includes(newRole) || existing.roles.length > 1) {
    await assertNotLastOfRole(tx, existing, [newRole])
}
```

The obvious set-semantics translation is a set-equality check. **Do not write it.** Read
`assertNotLastOfRole` `:209`:

```ts
const lost = target.roles.filter((r) => IRREPLACEABLE_ROLES[r] && !newRoles.includes(r))
if (lost.length === 0) return
```

It already short-circuits — *before* the `userOrganization.findMany` query — whenever nothing
irreplaceable is lost. Re-saving an identical set loses nothing, so `lost` is empty, so the guard
returns immediately. The caller's branch is therefore a **pure optimisation guarding a function
that already optimises itself**, and it is the fragile half: it reasons about `newRole` membership
rather than about loss, which is exactly the reasoning `assertNotLastOfRole`'s own comment warns
against.

**Replacement:** call it unconditionally.

```ts
await assertNotLastOfRole(tx, existing, roles)
```

AC-7 ("re-saving an unchanged set succeeds") then holds *by construction* rather than by a branch
that has to be kept in sync. Cost of removal: zero extra queries. The existing test at
`user-admin-self-guard.test.ts:233` that pins this branch is rewritten (not deleted) to pin the
outcome instead of the branch — see §7 AC-7.

### DECISION-2 — timesheets are **inside** the F1 guard

Per RC-2, timesheets share `canActOnStage` and `STAGE_CAPABILITY`. Once the guard is a required
parameter, the timesheet call sites must pass *something*. Passing the sentinel
`{ actorId: null, decidedActorIds: [] }` there would be **writing a deliberate hole** — a
`[VERIFIER, APPROVER]` user could verify and approve the same timesheet attempt, which is the
identical defect the SPEC bars on requests, opened by the identical change.

Decision: pass the real values for timesheets. Cost: `countActionableTimesheets`' `select` gains
`actorId`, and two call sites gain a `userId` argument. This is ~6 lines and is a direct
consequence of the chosen placement, not scope drift.

**Escape hatch for VALIDATE:** if VALIDATE rules this out of scope, flipping timesheets back is a
one-line change per call site (`{ actorId: null, decidedActorIds: [] }`) with no structural rework.

### DECISION-3 (REWRITTEN 11-08-26 per D10) — payroll runs are **inside** the F1 guard, and F5 falls out for free

The earlier version of this decision passed the sentinel `{ actorId: null, decidedActorIds: [] }`
through `canActOnPayrollStage` and filed the verify→approve gap as a separate issue. **That is
reversed.** F5 is now in scope.

**F5 restated.** `VERIFY_REQUESTS` (VERIFIER) and `APPROVE_FINANCE` (CEO, SUPER_ADMIN) are disjoint
*only while multi-role is off*. A `[VERIFIER, CEO]` user can verify **and** approve the same payroll
run. The existing guard at `approvals.ts:443-446` covers **maker-vs-signer only**. This gap is
multi-role-CREATED, exactly like F1 and F2 — it belongs in this PR, not in the pre-existing-debt
pile.

**Does it fall out of the F1 parameter for free? Substantially, yes.** `canActOnPayrollStage`
already delegates to `canActOnStage`, and per RC-10 the payroll MAKE step is written already-decided
with an `actorId`, so `decidedActorIds()` — the F1 helper, unchanged — already returns the payroll
maker. What F5 costs beyond F1 is:

1. `canActOnPayrollStage(stage, actorRoles)` gains a third parameter `sod: StageSoD` and stops
   passing the sentinel. (1 line + signature.)
2. `decidePayrollRun` computes the real `sod` from `run.approvalSteps` (already selected with
   `actorId`) — no new query.
3. `countActionablePayrollRuns` does the same; its select already carries `attempt`, `decision` and
   `actorId` (`:305-315`), so **no select change is needed** (unlike the timesheet counter — see R-C).

That is ~6 lines. **No new commit is invented for it; it folds into commit 4.**

**Two now-redundant clauses are deleted as part of the same change** (they exist only because the
generic bar did not exist; leaving them is dead code that will decay):

- `countActionablePayrollRuns`' trailing `&& makeActorId !== userId` (`:~318`) — strictly subsumed
  by the sod bar per RC-10.
- `decidePayrollRun`'s maker-vs-signer block (`:443-446`) is **NOT deleted** — it is **moved above**
  the `canActOnPayrollStage` call. Reason: the generic bar returns the generic message *"You cannot
  act on this stage"*, and the specific block's message *"You cannot sign off a payroll run you
  prepared"* is materially better. Left where it is, the generic bar fires first and the specific
  message becomes unreachable. Moving it two statements up keeps the better message and makes the
  subsumption harmless.

**Still OUT of scope, restated:** SUPER_ADMIN's ability to run + approve + void the same payroll via
`OVERRIDE_FINALIZED` (`rbac.ts:62-73`). That is single-role reachable today **and** is a
capability-table question, not a same-actor one — the capability table is untouched by this PR
(§11 item 6). `rbac.ts:69-71` already says so in its own comment.

### DECISION-6 — F3: the bar lives in `canActOnStage`, is **per-request**, and covers **all stages**

Three sub-decisions, each with its justification.

**(a) Placement — `canActOnStage`, not the `verifyDoc` route and not inline in `decide()`.** The
repo rule (from #282's own record) is that guards belong in the service, and #290's record adds that
a route-only guard *was* the bug. RC-8 confirms there is only one door into verification today, but
the bar is not on *verifying* — it is on *deciding after having verified*. That decision has two
service-layer surfaces (`decide()` and the queue/badge mirror), which is exactly the situation
DECISION-4 already solved for F1. Reusing `canActOnStage` makes AC-21 (the badge mirror) structural
instead of hand-duplicated.

**Cost, stated exactly (RC-7):** `decide()`'s `findFirst` gains
`documents: { select: { verifiedById: true } }` — one extra Prisma relation query against the
`@@index([requestId])` FK, on a path that already runs a transaction and two audit writes. Negligible
and on a write path. `listPendingRequestsForApprover` already includes `documents`; it gains only
`verifiedById: true` inside the existing select — **zero** extra queries. `countActionableTimesheets`
and the payroll counters pass `verifiedDocActorIds: []`, which is honest, not a hole: timesheets and
payroll runs have no `RequestDocument` rows at all.

**(b) Scope — per-REQUEST, not per-attempt.** RC-6: there is no attempt column on `RequestDocument`,
so attempt-scoping would require a schema change this PR has explicitly promised not to make
(AC-18). But the stronger argument is substantive: Q1 scoped the *stage* bar per attempt because a
RETURN means the document was **materially changed and re-submitted**. That argument does not
transfer. `deleteRequestDocument` (`documents.ts:192`) refuses with 409 to remove a **verified**
document, so after a RETURN the owner can swap unverified files but the verified one is
byte-for-byte the file the actor already signed. There is no new version to look at. Per-request is
both the only implementable scope and the correct one.

*This does not contradict Q1.* Q1 governs stage decisions, which are attempt-keyed rows. F3 is keyed
on a row a RETURN provably cannot change.

**(c) Coverage — ALL stages of the chain, not only the stage that consumes the evidence.** The user
chose the capability carve-out over the stage-scoped option; that choice only makes sense if the bar
is broad enough to need an escape hatch. Confirmed here on the merits too: nothing in the code
designates a stage as "the one that reads documents" — `listPendingRequestsForApprover` surfaces
`documents` to every approver at every stage — so a stage-scoped bar would have to invent that
designation. It does not exist, so it is not invented.

**(d) The carve-out must be auditable.** `ADMINISTER_SYSTEM` waiving the bar is a privileged path
and must leave a trace (risk R-L). `decide()`'s existing audit entry gains
`selfVerifiedEvidence: true` when and only when the waiver actually fired.

### DECISION-7 — F4 keeps its own guard shape; it is **not** folded into `canActOnStage`

Job postings do not run the `ApprovalStage` maker-checker chain at all — there are no
`ApprovalStep` rows, no attempts, and the authority function is `canApprovePosting`, a pure 3-arg
predicate. Forcing it through `canActOnStage` would mean inventing a fake stage. The F4 guard is
therefore a direct `jp.submittedById === ctx.actorId` check inside `decideJobPosting`, with the
queue mirror applied by hand in `listPostingsAwaitingApprover` — the same two-surface discipline,
different mechanism.

### DECISION-8 — proof that F4(c)'s trailing clause is redundant

`listPostingsAwaitingApprover:199` filters on
`canApprovePosting(approver, actorEmployeeId, actorRoles) && (approver != null || isHr)`.

After D8 deletes `:122`, `canApprovePosting` is exactly:

- `approver != null && actorEmployeeId === approver` → `true`; then `(approver != null)` is `true`.
- `approver == null && isHr` → `true`; then `(isHr)` is `true`.
- otherwise → `false`, and the `&&` short-circuits before the clause is evaluated.

In every branch where the left operand is `true`, the right operand is also `true`. **The clause can
never change the result. Verified — remove it.** (Before D8 it was load-bearing: `:122` made
`canApprovePosting` return `true` for every HR admin regardless of mapping, and the clause was the
compensation.)

### DECISION-4 — the guard lives in `canActOnStage`, not inline in `decide()`

Four reasons, in priority order:

1. **The repo's guard-placement rule** (from #282's own record): guards belong in the service, not
   the route — every form action has a v1 API twin. `canActOnStage` *is* the service-layer authority
   function; `decide()` is one of its five consumers.
2. **The badge mirror is the whole point of AC-15.** `decidePayrollRun` put its guard inline at
   `:443-446` and then had to hand-duplicate it into `countActionablePayrollRuns` at `:~305`. That
   duplication is the precedent's one weakness. Putting the F1 guard inside `canActOnStage` makes
   `listPendingRequestsForApprover` (RC-4) and `countActionableTimesheets` inherit it for free —
   AC-15 becomes structural.
3. **A required parameter is compile-enforced coverage.** Inserting the new argument at position 5
   (before the existing *optional* `stageCapability`) makes every one of the 5 production call sites
   and 19 test calls a TypeScript error until updated. A 6th optional parameter would let a future
   caller silently opt out — that is precisely how the payroll duplication decayed.
4. **`decide()` still needs its own inline check? No.** `decide()` already resolves `liveSteps`
   (`:120-122`); it passes them to the helper. One expression, no duplication.

### DECISION-5 — Q1's safety argument is recorded as a code comment

Per Q1, the bar is attempt-scoped. The non-obvious safety argument must be recorded **in the code**,
verbatim in substance, at `canActOnStage`:

> An actor barred from a stage cannot RETURN the request either — the bar is on *deciding* that
> stage at all, in either direction — so nobody can manufacture a fresh attempt to escape their own
> bar. Across attempts the worst case is that A verified a superseded version and approves a version
> someone else verified: still two humans on the live attempt.

---

## Touchpoints (4)

**Changed — production**

| File | Change |
|---|---|
| `src/lib/server/services/settings/org.ts` | `setUserRole` → `setUserRoles`; empty-set refusal; dedupe; delete skip-optimisation; audit `newValue` → `{ roles }` |
| `src/routes/(app)/settings/roles/+page.server.ts` | `roleSchema` → `rolesSchema`; `formData.getAll('roles')` |
| `src/routes/(app)/settings/roles/+page.svelte` | `<select multiple>`, prefill from full set, aria-label |
| `src/routes/api/v1/settings/users/[id]/role/` → `.../roles/` | directory rename (`git mv`), body `{ roles: [...] }` |
| `src/lib/server/services/approvals.ts` | `canActOnStage` gains required `sod` param (F1 + F3) + `decidedActorIds` / `usedDocVerifierCarveOut` helpers; `decide`, `listPendingRequestsForApprover`, `countActionableTimesheets`, `countPendingApprovals` updated; `canActOnPayrollStage` gains `sod` (F5); `decidePayrollRun`'s maker guard moved above the stage check; `countActionablePayrollRuns`' `makeActorId !== userId` clause deleted |
| `src/lib/server/services/timesheets.ts` | `:362` call site passes `sod` |
| `src/routes/(app)/requests/timesheets/+page.server.ts` | `:50` call site passes `sod` |
| `src/routes/(app)/requests/approvals/+page.server.ts` | `:21` passes `user.id` |
| `src/lib/server/services/payroll/statutory-rates.ts` | `confirmProposal` gains proposer-vs-confirmer bar (F2) |
| `src/lib/server/services/recruitment.ts` | **F4** — `canApprovePosting:122` deleted (mapping binds); `decideJobPosting` gains the submitter bar with the remap escape hatch named in the message; `listPostingsAwaitingApprover` gains `actorUserId`, drops the now-redundant `(approver != null \|\| isHr)` clause and adds the submitter filter |
| `src/routes/(app)/dashboard/+page.server.ts` | `listPostingsAwaitingApprover` call site gains `user.id` (the card's own data load) |

**Changed — tests**

`tests/unit/user-admin-self-guard.test.ts` (14 cases) · `tests/unit/approvals.test.ts` (19 calls) ·
`tests/unit/approval-self-guard.test.ts` · `tests/unit/payroll-statutory-proposal.test.ts` ·
`tests/unit/proposal-queue.test.ts` · `tests/unit/route-guard-multirole.test.ts` (fixture strings
only)

**New**

`tests/unit/api-v1-user-roles.test.ts` · `tests/unit/recruitment-posting-sod.test.ts` ·
`tests/e2e/settings-roles.spec.ts` · `tests/e2e/multi-role-sod.spec.ts`

**Read, not changed — added for the widened scope**

`src/lib/server/services/requests/documents.ts` (F3's write site — `setRequestDocumentVerified:151`
and the 409 at `:192` that pins DECISION-6b; **the file itself is not edited**) ·
`src/routes/(app)/requests/[id]/+page.server.ts:145-165` (`verifyDoc`; unchanged — the bar is on
deciding, not verifying) · `src/lib/server/services/posting-approvers.ts` ·
`prisma/schema.prisma:859-876` (`RequestDocument` — read to confirm no `attempt` column)

**Changed — seeds**

`prisma/seed-core.ts` — one new two-hat account (see commit 6). All 21 existing single-role
`roles: [X]` writes across `prisma/seed-core.ts`, `scripts/seed-separation-demo.ts:37,42` and
`scripts/seed-issues-demo.ts:60` **stay exactly as they are and stay valid** — a one-element array
is a legal set and none of them calls `setUserRole`. No seed edit is *required* by the signature
change; the one addition in commit 6 is for manual/E2E testing only.

**Read, not changed**

`src/lib/rbac.ts` (`ASSIGNABLE_ROLES`, `HIRE_ROLES` — untouched per D3) ·
`src/lib/server/services/requests/routing.ts` · `src/lib/server/services/action-proposals.ts`
(the F2 shape to mirror) · `src/lib/server/auth.ts` · `src/hooks.server.ts`

---

## Public Contracts (5)

| Contract | Before | After | Breaking? |
|---|---|---|---|
| `setUserRole(userId, orgId, newRole: Role, ctx)` | single role | **`setUserRoles(userId, orgId, newRoles: Role[], ctx)`** | internal only — 2 call sites, both in this PR |
| `PATCH /api/v1/settings/users/:id/role` body `{ role }` | singular | **`PATCH /api/v1/settings/users/:id/roles` body `{ roles: string[] }`** | no consumers — `/api/v1/*` authenticates by Lucia session cookie only, no API-key or bearer mechanism exists, zero in-repo callers (verified) |
| `canActOnStage(stage, roles, actorEmpId, ownerEmpId, stageCapability?)` | 5 params, last optional | **`canActOnStage(stage, roles, actorEmpId, ownerEmpId, sod, stageCapability?)`** — `sod` required at position 5, carrying **both** the F1 attempt bar and the F3 document bar | internal; compile-enforced |
| `canActOnPayrollStage(stage, roles)` | 2 params, sentinel inside | **`canActOnPayrollStage(stage, roles, sod)`** | internal, **3** call sites (F5) — incl. `payroll/[id]/+page.server.ts:64`, VC-2 |
| `countActionablePayrollRuns`, `countActionableTimesheets` | module-private | **exported** | internal; they are now guard-bearing and must be directly testable (VC-5 / B-4) |
| `RequestDocument.verifiedById` | "who currently verifies" — nulled on un-verify | **"who last signed off"** — survives un-verify; `verifiedAt` alone means "currently verified" | behaviour change, intended (D11 / AC-28). No schema change; comments at `schema.prisma:854-856` and `documents.ts:14-16` must be updated to match |
| Payroll decision | maker may not sign off | **maker may not sign off AND the verifier of an attempt may not approve it** | behaviour change, intended (AC-27) |
| Request decision | stage capability + not-your-own-request | **+ not a second stage of the live attempt (F1) + not the verifier of any document on the request (F3), unless `ADMINISTER_SYSTEM`** | behaviour change, intended (AC-19/AC-20) |
| `canApprovePosting(approver, actorEmpId, roles)` | any `MANAGE_HR` holder may decide **any** posting | **a mapped department is decidable only by its designated approver; unmapped falls back to `MANAGE_HR`** | behaviour change, intended (AC-23/AC-24) — see risk R-J |
| `decideJobPosting(...)` | the submitter may decide their own posting | **403 for the submitter**, message naming the remap escape hatch | behaviour change, intended (AC-25) |
| `listPostingsAwaitingApprover(orgId, actorEmployeeId, actorRoles)` | — | **`(orgId, actorEmployeeId, actorRoles, actorUserId)`** | internal, 1 call site |
| Audit `Request` UPDATE `newValue` | `{ attempt, stage, decision, status }` | **+ `selfVerifiedEvidence: true` when and only when the D7 carve-out fired** | additive, forward-only |
| `listPendingRequestsForApprover(orgId, roles, actorEmployeeId)` | — | **`(orgId, roles, actorEmployeeId, actorUserId)`** | internal, 2 call sites |
| `countActionableTimesheets(orgId, roles, actorEmployeeId)` | — | **`(orgId, roles, actorEmployeeId, actorUserId)`** | private to module |
| `confirmProposal(orgId, proposalId, ctx)` | applied for anyone with the capability | **403 for the proposer** | behaviour change, intended (AC-13) |
| Audit `User` UPDATE `newValue` | `{ role: 'X' }` | `{ roles: ['X','Y'] }` | forward-only; historical entries keep the singular key, no backfill (Q4) |
| DB schema | `User.roles Role[]` | unchanged | **no migration, no backfill, no downtime** (AC-18) |

---

## Blast Radius (6)

- **Files:** **11** production, 6 tests changed, **4** tests new, 1 seed, 1 directory rename.
  ~22 files.
- **Packages:** one (single SvelteKit app).
- **Risk class:** **HIGH** — auth/permission + trust-boundary logic. **Five of the six** sub-changes
  are authorisation guards; the sixth widens a privilege-granting form.
- **Schema/data:** none. No Prisma migration, no `db push` needed for the code (only for a fresh
  seed). **RC-6 confirms F3 does not add an `attempt` column** — DECISION-6b exists precisely so
  AC-18 survives the widened scope.
- **Worst-case failure:** a wrong `sod` predicate either (a) blocks all approvals (loud, caught by
  `approvals.test.ts` + E2E) or (b) silently blocks nothing (quiet — which is why every guard test
  in §8b carries a named mutation check). **F4's worst case is different and louder:** D8 binds the
  mapping, so a mis-seeded `PostingApprover` row makes a department's postings undecidable by
  anyone. That is the accepted D9 hatch, but it is why AC-24 (unmapped fallback still works) is a
  named test and not an afterthought.

---

## 7. Implementation Checklist — Commit-by-Commit Breakdown

One issue → one PR → **nine** commits. **The tree must be green (`format:check`, `lint`, `check`,
`test`) at the end of every commit.** Each commit therefore carries its own call-site and test
updates.

**Commit map after the 11-08-26 scope widening:**

| # | Subject | Was |
|---|---|---|
| 1 | `refactor(rbac): setUserRoles takes a role set` | 1, unchanged |
| 2 | `feat(settings): multi-select role picker` | 2, unchanged |
| 3 | `feat(api): rename v1 user role endpoint to /roles and take a set` | 3, unchanged |
| 4 | `feat(approvals): bar an actor from two stages of the same attempt` — **F1 + F5** | 4, extended |
| 5 | `feat(requests): the verifier of a document may not decide that request` — **F3** | new |
| 6 | `feat(payroll): the proposer of a statutory rate change cannot confirm it` — F2 | was 5 |
| 7 | `feat(recruitment): bind the department posting approver and bar the submitter` — **F4** | new |
| 8 | `test(rbac): E2E for multi-role assignment and decision-time SoD` | was 6 |
| 9 | `docs(rbac): record the #283 scope boundary and live verification` | was 7 |

F5 is deliberately **not** its own commit: per DECISION-3 it is ~6 lines that fall out of commit 4's
shared parameter. F3 **is** its own commit: it adds a third field to `StageSoD`, a privileged
carve-out, and an audit marker, and it is the one guard a reviewer must read carefully.

**The ordering did NOT change when B-1..B-5 and D11/D12 were absorbed** — every fix lands inside a
commit that already existed. Re-verified commit by commit (VALIDATE proved the previous claim false
via B-1, so this is now an explicit audit, not an assertion):

| # | What could break the tree here | Green because |
|---|---|---|
| 1 | 14 role-assignment tests pin the old signature | they move in this commit |
| 2 | none (UI only) | `pnpm check` covers the route + component |
| 3 | `route-guard-multirole.test.ts` fixture strings go stale | refreshed in this commit |
| 4 | **18 test calls** + 9 production callers become compile errors the moment `sod` is required; the two counters are unexported so their new tests cannot compile | all 9 call sites (incl. `payroll/[id]` — B-2) and all 18 test calls are updated here; the exports (B-4) land here; `approval-queues.test.ts` is created here so AC-15/DEC-2/AC-27's count half compile against real exports |
| 5 | `StageSoD` gains a 3rd **required** field → every construction site from commit 4 is a compile error | all of them are in this commit's diff; `approval-queues.test.ts` gains its AC-21 case here |
| 6 | none — `confirmProposal` is self-contained | its own test file moves with it |
| 7 | **`posting-approval.test.ts:25` asserts the behaviour D8 deletes and is green today** — this is B-1, the specific reason the earlier claim was false | that case is rewritten **in this commit** (§commit 7(d)); the other four cases in the file are individually re-verified against the new predicate and survive unchanged |
| 8 | E2E specs are new; the seed edit is not typechecked | E2E is additive; the seed is proved by running `pnpm db:seed:e2e` (M-1), not by a gate |
| 9 | comments only | — |

**The one ordering constraint that matters:** commit 4 must create `approval-queues.test.ts` and the
exports, because commit 5's AC-21 case is added to that same file. Creating it in commit 5 instead
would leave AC-15/DEC-2/AC-27's count half unproven for one commit — allowed by "green", but it
would mean the badge mirror is untested at the exact commit that introduces the badge mirror.

### Commit 1 — `refactor(rbac): setUserRoles takes a role set (#283)`

*Service only. Callers keep posting one role, wrapped as a one-element set, so behaviour is
unchanged from the outside.*

**Files:** `src/lib/server/services/settings/org.ts`,
`src/routes/(app)/settings/roles/+page.server.ts` (call-site wrap only),
`src/routes/api/v1/settings/users/[id]/role/+server.ts` (call-site wrap only),
`tests/unit/user-admin-self-guard.test.ts`, `tests/unit/route-guard-multirole.test.ts` (fixture).

**Exact new signature:**

```ts
export async function setUserRoles(
	userId: string,
	organizationId: string,
	newRoles: Role[],
	ctx: AuditContext
)
```

**Body changes, in order:**

1. `requireAnyCapability(ctx.actorRoles, 'MANAGE_USER_ROLES')` — unchanged, stays first (an
   unauthorised caller must not learn whether the target exists).
2. Self-change block — unchanged.
3. **New, before the transaction** (cheap, no DB round trip, and no existence probe):
   ```ts
   // GUARDRAIL (#283/D4): a role-less user can authenticate, holds no capability, and can never
   // be repaired — assertNotLastOfRole can never be satisfied to give one back. The database
   // default for this column is `[]` and there is no check constraint behind it (db push cannot
   // express one), so this refusal and the request schemas are the whole enforcement.
   const roles = [...new Set(newRoles)]
   if (roles.length === 0) error(400, 'A user must keep at least one role.')
   ```
   Dedupe is deliberate: the multi-select cannot post duplicates but the JSON API can, and a
   duplicated set would write a nonsense array and a misleading audit entry.
4. Transaction, target read — unchanged.
5. **Skip-optimisation deleted** per DECISION-1:
   ```ts
   // Keyed on the roles LOST (see assertNotLastOfRole), so re-saving an unchanged set is never
   // blocked and the caller needs no branch of its own: nothing lost means it returns before it
   // queries anything.
   await assertNotLastOfRole(tx, existing, roles)
   ```
6. Write: `data: { roles }`. Replace the stale `// widening the picker to a set is #283` comment.
7. **Audit (Q4/R4):** `newValue: { roles: updated.roles }`. Add a comment: *historical entries keep
   the singular `role` key and are not backfilled.*

**Call sites in this commit:** both callers pass `[parsed.data.role]` — no external behaviour
change yet.

**`route-guard-multirole.test.ts` fixture (RC-3):** update the `:86` near-miss string to the new
real line. The scan's patterns and assertions are **unchanged** — only the sample corpus is
refreshed so it keeps mirroring the tree.

**Test updates — all 14 `describe('setUserRole')` cases move, none dropped:** rename the describe to
`setUserRoles`, change every `'MANAGER'` → `['MANAGER']` etc. Specifically preserved:
`:118` (writes only the role set), `:233` (re-save case — rewritten per AC-7 below), `:250`
(serializable isolation assertion — must survive verbatim).

**Satisfies:** AC-4 (service half), AC-5, AC-6, AC-7, AC-8, and the Q4 audit fix.

**Proved by:** `pnpm test tests/unit/user-admin-self-guard.test.ts` green;
`pnpm check` clean (both call sites compile).

---

### Commit 2 — `feat(settings): multi-select role picker (#283)`

**Files:** `src/routes/(app)/settings/roles/+page.server.ts`,
`src/routes/(app)/settings/roles/+page.svelte`.

**The form-data trap (mandatory):** a `<select multiple>` posts the key `roles` once per selected
option. `Object.fromEntries(await request.formData())` **keeps only the last value** — silently
turning a 3-role save into a 1-role save with no error anywhere. Do not use it for this action.

```ts
const rolesSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	// D4: the empty set is refused here as well as in the service, so the form surfaces a field
	// error instead of a 400 error page.
	roles: z
		.array(z.enum(ASSIGNABLE_ROLES))
		.nonempty('A user must keep at least one role.')
})
```

```ts
// A multi-select posts `roles` once per selected option; Object.fromEntries collapses repeated
// keys to the last one, which would silently drop every role but the last. getAll is the only
// correct read here.
const formData = await request.formData()
const parsed = rolesSchema.safeParse({
	userId: formData.get('userId'),
	roles: formData.getAll('roles')
})
```

**Where else this pattern is copied:** the sibling `setActive` action at `:69` also uses
`Object.fromEntries`. It posts no repeated keys, so it is **correct as written and must not be
touched** (surgical-changes rule). No other action in the tree posts a repeated key. EXECUTE must
grep `Object.fromEntries(await request.formData())` before finishing and confirm no *other* action
gained a multi-valued field in this PR.

**Svelte component:**

```svelte
<select
	name="roles"
	multiple
	size={4}
	aria-label="Roles for {u.email}"
	class="... h-auto w-40 ..."
>
	{#each ASSIGNABLE_ROLES as r (r)}
		<option value={r} selected={u.roles.includes(r)}>{r.replace('_', ' ')}</option>
	{/each}
</select>
```

**Runes note — no `$state` is needed and none should be added.** The selected set is held by the
DOM and posted natively as repeated `roles` keys; `use:enhance` forwards the same `FormData`. A
`$state` array plus `bind:value` would be a second source of truth for something the platform
already tracks, and Svelte 5 warns when a bound `<select>`'s options also carry `selected`.
Prefilling with the `selected` attribute is the native answer to US-2/AC-3. Delete the stale
`roles[0]` comment at `:105-108`.

**Making the two branches agree (SPEC "read-only view and editable control always show the same
list"):** the read-only branch at `:126-129` already renders
`u.roles.map((r) => r.replace('_', ' ')).join(', ')`. After this change the editable branch renders
the same nine options with the same `replace` label and the same set pre-selected. Both branches now
read `u.roles` in full; neither indexes `[0]`. No shared helper is introduced for a two-line label
expression.

**Accessibility — what is acceptable and what is out of scope.** Acceptable: a native
`<select multiple size={4}>` with an `aria-label` naming the user, which is keyboard-operable and
screen-reader-labelled. Known and **out of scope**: multi-select is awkward on touch (ctrl/cmd-click
semantics), and there is no "0 of 9 selected" live-region summary. A checkbox-list replacement or a
picker component is explicitly not built here — no picker library, per the native-platform rung.

**Satisfies:** AC-3 (implementation), AC-4 (form half), US-1, US-2.

**Proved by:** `pnpm check` clean; manual step M-2 in §9 (this commit's UI cannot be proved by unit
tests — its E2E lands in commit 6).

---

### Commit 3 — `feat(api): rename v1 user role endpoint to /roles and take a set (#283)`

**Files:** `git mv src/routes/api/v1/settings/users/[id]/role src/routes/api/v1/settings/users/[id]/roles`,
`+server.ts`, new `tests/unit/api-v1-user-roles.test.ts`, `tests/unit/route-guard-multirole.test.ts`
(fixture string again, now that the call reads `parsed.data.roles`).

```ts
const rolesSchema = z.object({
	roles: z.array(z.enum(ASSIGNABLE_ROLES)).nonempty('A user must keep at least one role.')
})
```

Update the handler comment block: the guardrails still all live in `setUserRoles`; add that the
rename is safe because `/api/v1/*` authenticates by session cookie only, there is no API-key or
bearer mechanism anywhere in the tree, and there were zero in-repo callers (Q3).

**New test file `tests/unit/api-v1-user-roles.test.ts`** — mirrors the mocking shape already used by
`user-admin-self-guard.test.ts` (read it first; reuse its `vi.mock` of `$lib/server/db` and its
`CTX`). Cases:

- accepts `{ roles: ['HR_ADMIN','VERIFIER'] }` and **asserts the arguments `setUserRoles` was called
  with**, not merely that the handler resolved;
- rejects `{ roles: [] }` with 422 (schema) — asserts `setUserRoles` was **not** called;
- rejects `{ roles: ['NOT_A_ROLE'] }` with 422;
- 401 with no `locals.user`;
- 403 without `MANAGE_USER_ROLES` — asserts `setUserRoles` was **not** called.

**Satisfies:** AC-2, AC-4 (API half), AC-8 (API half), US-5, Q3.

**Proved by:** `pnpm test tests/unit/api-v1-user-roles.test.ts`; manual step M-3 (curl).

---

### Commit 4 — `feat(approvals): bar an actor from two stages of the same attempt (#283)`

The F1 guard **and F5** (payroll verify→approve), which falls out of the same parameter per
DECISION-3. **Files:** `src/lib/server/services/approvals.ts`,
`src/lib/server/services/timesheets.ts`, `src/routes/(app)/requests/timesheets/+page.server.ts`,
`src/routes/(app)/requests/approvals/+page.server.ts`, `tests/unit/approvals.test.ts`,
`tests/unit/approval-self-guard.test.ts`, `tests/unit/proposal-queue.test.ts`.

**Exact new signature and predicate:**

```ts
/** Actor ids that already recorded a decision on the given attempt. The auto-completed MAKE step
 *  (routing.ts buildApprovalChain, written already-decided in the filer's name when the filer holds
 *  MANAGE_HR) carries a decision AND an actorId, so it is included here with no special case — that
 *  is what makes the filer-is-maker path a decision by that actor. */
export function decidedActorIds(
	steps: { attempt: number; decision: ApprovalDecision | null; actorId: string | null }[],
	attempt: number
): string[] {
	return steps
		.filter((s) => s.attempt === attempt && s.decision != null && s.actorId != null)
		.map((s) => s.actorId as string)
}

export interface StageSoD {
	/** The deciding user's id (User.id, not employeeId). Null disables the same-actor bar. */
	actorId: string | null
	/** Output of decidedActorIds() for the LIVE attempt. */
	decidedActorIds: string[]
}

export function canActOnStage(
	stage: ApprovalStage,
	actorRoles: Role[],
	actorEmployeeId: string | null,
	ownerEmployeeId: string | null,
	sod: StageSoD,
	stageCapability: Record<ApprovalStage, keyof typeof CAPABILITIES> = STAGE_CAPABILITY
): boolean {
	if (actorEmployeeId != null && actorEmployeeId === ownerEmployeeId) return false
	// #283: one person may not decide two stages of the same LIVE attempt. Multi-role makes this
	// reachable — a [VERIFIER, APPROVER] user holds both stages' capabilities — and without it,
	// granting two hats silently collapses a two-person review into one.
	//
	// Attempt-scoped, not request-scoped (Q1): a RETURN begins a new attempt against a materially
	// changed document, and barring forever risks a small org exhausting its deciders and leaving
	// a request permanently un-decidable. That does not open an escape route: an actor barred from
	// a stage cannot RETURN the request either — the bar is on DECIDING that stage at all, in
	// either direction — so nobody can manufacture a fresh attempt to escape their own bar. The
	// worst case across attempts is that A verified a superseded version and approves a version
	// someone else verified: still two humans on the live attempt.
	if (sod.actorId != null && sod.decidedActorIds.includes(sod.actorId)) return false
	return canAny(actorRoles, stageCapability[stage])
}
```

`sod` sits at position **5, before the optional `stageCapability`**, so every existing call is a
compile error until it answers the question. That is deliberate (DECISION-4 reason 3).

**Call sites:**

| Site | `sod` value |
|---|---|
| `decide()` `approvals.ts:125` | `{ actorId: ctx.actorId, decidedActorIds: decidedActorIds(req.steps, attempt) }` — `attempt` is already computed at `:120` |
| `listPendingRequestsForApprover` `:222` | per row: `{ actorId: actorUserId, decidedActorIds: decidedActorIds(r.steps, attempt) }`; function gains a 4th param `actorUserId: string`. `steps` is included whole, so `actorId` is already selected. |
| `countActionableTimesheets` `:~330` | same shape; **add `actorId: true` to the `approvalSteps` select** (it is currently absent — this is the one place that silently returns an empty bar if forgotten); function gains `actorUserId` |
| `timesheets.ts:362` (`decide`-equivalent) | `{ actorId: ctx.actorId, decidedActorIds: decidedActorIds(ts.approvalSteps, live.attempt) }` — verify `approvalSteps` selects `actorId` at that query; add if absent |
| `routes/(app)/requests/timesheets/+page.server.ts:50` | same; needs `locals.user.id`; add `actorId` to its select |
| `canActOnPayrollStage` `:72` | **gains a 3rd param `sod: StageSoD` and forwards it** (F5, DECISION-3) — no sentinel |

`countPendingApprovals` `:246` passes `user.id` down to both counters. The approvals page
(`routes/(app)/requests/approvals/+page.server.ts:21`) passes `locals.user.id`.

**Files, corrected (VC-2, VC-5):** add `src/routes/(app)/payroll/[id]/+page.server.ts` and
`src/routes/(app)/payroll/[id]/+page.svelte` to this commit's file list.

**F5 — the payroll half of this commit (DECISION-3), exactly *five* edits:**

1. `canActOnPayrollStage(stage, actorRoles, sod)` forwards `sod` to `canActOnStage`.
2. `decidePayrollRun` (`:~437-446`): **move** the maker-vs-signer block **above** the
   `canActOnPayrollStage(...)` call so its specific message survives (the generic bar now subsumes
   it and would otherwise fire first and swallow it), then pass
   `{ actorId: ctx.actorId, decidedActorIds: decidedActorIds(run.approvalSteps, live.attempt) }`.
   No new query — `run.approvalSteps` already carries `attempt`, `stage`, `decision`, `actorId`.
   Add a comment recording that the block is now belt-and-braces kept **for its message**, per
   RC-10.
3. `countActionablePayrollRuns` (`:~305-320`): pass the same `sod` shape, and **delete the trailing
   `&& makeActorId !== userId`** — RC-10 proves it is subsumed. Its `select` already includes
   `attempt`, `decision` and `actorId`, so nothing else changes.
4. **B-2 / VC-2 / D12 — `src/routes/(app)/payroll/[id]/+page.server.ts:56-66` gets the REAL `sod`,
   not a sentinel.** This is the third caller and it decides whether the Verify/Approve **control**
   renders as actionable. A permissive sentinel here ships a page that offers an action the service
   then 403s. The page already has everything needed — it calls `livePayrollStage(run.approvalSteps)`
   at `:58` and reads `.actorId` at `:60`:

   ```ts
   const canAct = Boolean(
   	live?.currentStep &&
   		canActOnPayrollStage(live.currentStep.stage, roles, {
   			actorId: user.id,
   			decidedActorIds: decidedActorIds(run.approvalSteps, live.attempt)
   		})
   )
   ```

   The local `makeActorId` computation at `:59-61` and its `&& makeActorId !== user.id` clause are
   subsumed by the same RC-10 argument and are **deleted** — orphaned by this change, so removing
   them is cleanup of our own mess. Correct the comment at `:55-57` ("they aren't the maker of the
   live attempt" → "and they took no earlier decision on the live attempt").

   **D12 also requires this load to return the *reason*, not just the boolean** — see the D12
   section below for the exact shape.
5. **B-4 / VC-5 — export `countActionablePayrollRuns` (`:289`) and `countActionableTimesheets`
   (`:324`)**, each with this one-line rationale:

   ```ts
   // Exported since #283: this counter now carries a separation-of-duties guard, and a guard that
   // cannot be tested directly is a guard nobody can trust. Not a public API surface — the export
   // exists for tests/unit/approval-queues.test.ts.
   ```

   Without it, AC-27's count half and the DEC-2 row name tests that cannot be written, and R-C loses
   its stated mitigation. Exporting is the minimum change; driving both through
   `countPendingApprovals` only would make every failure diagnosis a bisect.

**Satisfies:** AC-9, AC-10, AC-11, AC-12, AC-15, AC-27, **AC-29 (payroll surface)**, US-6, US-8.

---

### Commit 5 — `feat(requests): the verifier of a document may not decide that request (#283)`

The F3 guard, per D7, DECISION-6, **D11 (B-5)** and **D12's explanation half**.

**Files:** `src/lib/server/services/approvals.ts`,
`src/lib/server/services/requests/documents.ts` (**D11 — one line + comments**),
`prisma/schema.prisma` (**comment only**, D11),
`src/routes/(app)/requests/[id]/+page.server.ts` + `+page.svelte` (**D12 reason line**),
`tests/unit/approval-self-guard.test.ts`, `tests/unit/approval-queues.test.ts` (new, from commit 4),
`tests/unit/approvals.test.ts` (fixture shape only — the new field is required),

**REQUIRED first step of this commit (C-P6/P4) — otherwise `pnpm test` is red.** Give
`approval-self-guard.test.ts`'s `pendingRequest` fixture (`:54-65`) a **`documents: []`** key. Once
`decide()` gains the `documents` include, `req.documents.map(...)` throws
`TypeError: Cannot read properties of undefined` and all three `decide` cases go red. Commit 4 is
safe without it (`s.actorId` is `undefined`, `undefined != null` is false, so `decidedActorIds`
returns `[]`); commit 5 is not.

new `tests/unit/requests-documents.test.ts` (AC-28's D11 half — first test file for
`documents.ts`).

**`documents.ts` IS edited after all — one line plus comments (D11 / B-5).** The original plan said
this file was untouched. VALIDATE proved that leaves the guard bypassable in one click: `verifyDoc`
accepts `verified=false` and the clear branch nulls `verifiedById` as well as `verifiedAt`, so a
barred actor un-verifies their own sign-off and decides — no `ADMINISTER_SYSTEM` needed, and
`selfVerifiedEvidence` never fires, so the audit marker stays silent too.

```ts
	const updated = await db.requestDocument.update({
		where: { id: doc.id },
		data: verified
			? { verifiedById: ctx.actorId, verifiedAt: new Date() }
			// #283/D11: clearing the sign-off clears verifiedAt ONLY. verifiedById is the durable
			// record of who LAST signed off, and #283's F3 bar keys on it — nulling it here let a
			// barred approver un-verify their own sign-off and then decide the request, which is
			// the whole bypass. Every other consumer keys on verifiedAt (approvals.ts:215,
			// documents.ts:192, requests/[id]/+page.svelte, requests/approvals/+page.svelte), so
			// "currently verified" still means verifiedAt != null and the ordinary un-verify
			// correction path is unchanged.
			//
			// ponytail: known ceiling — if a DIFFERENT actor later verifies this same document,
			// verifiedById is overwritten and the earlier signer's bar is forgotten. That requires
			// two people colluding and is accepted for now; the upgrade path is a
			// RequestDocumentVerification history table (one row per sign-off) rather than a single
			// scalar, at which point the F3 bar reads the whole history.
			: { verifiedAt: null }
	})
```

`verifyDoc`'s route action, its `APPROVE_REQUESTS` gate, and `setRequestDocumentVerified`'s
org-scoping-only contract are all **unchanged** — the bar is still on *deciding*, not on verifying.

**Two comments must be corrected in the same commit**, because leaving them stating the old meaning
is how the next person reintroduces the bug:

- `prisma/schema.prisma:854-856` — currently "`verifiedById`/`verifiedAt` record an approver signing
  off on the document". Must say: **`verifiedAt` means currently verified; `verifiedById` is the
  durable record of who last signed off and survives clearing (#283/D11).**
- `src/lib/server/services/requests/documents.ts:14-16` — same correction, same wording.

**`pnpm check` does not typecheck `prisma/**`,** so the schema comment change is proved by the file
diff and by M-7, not by a gate.

**`StageSoD` gains a third field:**

```ts
export interface StageSoD {
	actorId: string | null
	/** Output of decidedActorIds() for the LIVE attempt. Empty for surfaces with no chain history. */
	decidedActorIds: string[]
	/** RequestDocument.verifiedById for every document on THIS request — INCLUDING documents whose
	 *  verifiedAt has since been cleared (#283/D11: clearing keeps verifiedById precisely so this
	 *  bar cannot be un-verified away). Empty for timesheets and payroll runs — neither has
	 *  RequestDocument rows, so the empty array is an accurate answer, not a disabled guard. */
	verifiedDocActorIds: string[]
}
```

**The predicate, appended to `canActOnStage` after the F1 line:**

```ts
// #283/F3/D7: whoever signed off a supporting document may not also decide the request — they
// would be weighing their own evidence. A holder of ADMINISTER_SYSTEM (SUPER_ADMIN, CEO) is
// carved out by explicit decision: they are the escape hatch for a small org whose only
// available verifier is also its only available approver.
//
// This is a CAPABILITY, never a rank. #282 deleted ROLE_HIERARCHY and
// tests/unit/rbac-no-rank-helpers.test.ts is a static scan that keeps rank floors deleted. Do
// not reintroduce a level/seniority/hierarchy concept here in any form.
//
// Scoped per REQUEST, not per attempt — unlike the bar above. RequestDocument carries no attempt
// column, and a RETURN does not by itself change the signed artefact: while the sign-off STANDS,
// deleteRequestDocument refuses with 409 (documents.ts:192, which keys on verifiedAt), so the row
// this actor signed survives into attempt 2. Q1's "materially changed document" argument justifies
// attempt-scoping stage decisions; it does not transfer to a row a RETURN does not touch.
//
// Known gap, NOT an invariant (plan §11 item 16): once the sign-off is cleared, verifiedAt is null,
// the 409 stops firing, and the request OWNER can delete the row — taking verifiedById with it —
// then re-upload. Two-party (only the owner may delete, and the owner cannot decide their own
// request), same collusion class as the ponytail ceiling in documents.ts, closed by the same
// RequestDocumentVerification history table.
//
// Covers EVERY stage, not just a nominated evidence-consuming one: no stage in the chain is
// designated as the document reader (the queue surfaces documents to all of them), so a
// stage-scoped bar would have to invent that designation.
if (
	sod.actorId != null &&
	sod.verifiedDocActorIds.includes(sod.actorId) &&
	!canAny(actorRoles, 'ADMINISTER_SYSTEM')
) {
	return false
}
```

**Audit marker for the carve-out (DECISION-6d / risk R-L) — exported alongside:**

```ts
/** True when the F3 bar WOULD have fired but D7's ADMINISTER_SYSTEM carve-out waived it. The
 *  waiver is a privileged path; it must not be silent. */
export function usedDocVerifierCarveOut(sod: StageSoD, actorRoles: Role[]): boolean {
	return (
		sod.actorId != null &&
		sod.verifiedDocActorIds.includes(sod.actorId) &&
		canAny(actorRoles, 'ADMINISTER_SYSTEM')
	)
}
```

**Call sites:**

| Site | `verifiedDocActorIds` value |
|---|---|
| `decide()` | add `documents: { select: { verifiedById: true } }` to the existing `findFirst` include (RC-7), then `req.documents.map((d) => d.verifiedById).filter((v): v is string => v != null)` |
| `listPendingRequestsForApprover` `:215` | the `documents` include already exists as `{ select: { id: true, verifiedAt: true } }` — add `verifiedById: true` to it (**do not remove `verifiedAt`**: the approvals page consumes it at `requests/approvals/+page.svelte:163-164`). Same map per row. |
| `countActionableTimesheets`, `timesheets.ts:362`, `requests/timesheets/+page.server.ts:50` | `[]` — timesheets have no `RequestDocument` rows |
| `canActOnPayrollStage` — **all three** callers: `decidePayrollRun`, `countActionablePayrollRuns`, and `routes/(app)/payroll/[id]/+page.server.ts` | `[]` — same reason. **This is where the field arrives at the payroll page** (C-P4/P3): commit 4 deliberately builds a 2-field `StageSoD` there, because a 3rd field before the interface has it is a `TS2353` excess-property error and `pnpm check` goes red *at commit 4*. |

**Audit wiring in `decide()`** — the existing `writeAuditLog` for the `Request` UPDATE gains:

```ts
newValue: {
	attempt,
	stage: step.stage,
	decision,
	status: transition.status,
	...(usedDocVerifierCarveOut(sod, ctx.actorRoles) && { selfVerifiedEvidence: true })
}
```

**D12's explanation half on `requests/[id]` (see D12's scope table — this page has NO decide
control, so there is nothing to disable; what it needs is the *reason*).** The load already fetches
the request with its steps and documents for the timeline. Derive one nullable string next to that
and render it as a line in the existing approval-timeline block:

```ts
// #283/D12: this page is where an approver comes to ask "why can't I act on this?" — the approvals
// QUEUE deliberately omits barred items (AC-15/AC-21/US-8), so without this the answer is nowhere.
// Same inputs as the service guard, so the two cannot drift.
const actBlockedReason =
	sod.decidedActorIds.includes(user.id)
		? 'You already decided an earlier stage of this attempt — another verifier or approver must act.'
		: sod.verifiedDocActorIds.includes(user.id) && !canAny(user.roles, 'ADMINISTER_SYSTEM')
			? 'You signed off a supporting document on this request — another approver must decide it.'
			: null
```

Rendered as plain text (no ARIA needed — there is no control to describe). Order matters only for
which reason shows first when both apply; either is true, so the F1 one wins as the earlier event.

**Note on the predicate's key.** It reads `verifiedById`, **never** `verifiedAt`. Those two fields
now mean different things (D11), and using `verifiedAt` here reopens B-5 exactly.

**Satisfies:** AC-19, AC-20, AC-21, AC-22, **AC-28**.

---

### Commit 6 — `feat(payroll): the proposer of a statutory rate change cannot confirm it (#283)`

**Files:** `src/lib/server/services/payroll/statutory-rates.ts`,
`tests/unit/payroll-statutory-proposal.test.ts`.

**Placement — service, inside `confirmProposal`, inside the transaction, immediately after the
claim.** Not in the route (`+page.server.ts:184,213,224`), per the repo's guard-placement rule and
#282's own record that a route-only guard *was* the bug. The claim is a status-guarded
`updateMany` that must happen first (it is the race guard); the `error()` throw after it rolls the
claim back to PENDING, which is exactly what AC-14 asserts.

```ts
const proposal = await tx.statutoryRateProposal.findUniqueOrThrow({ where: { id: proposalId } })

// GUARDRAIL (#283/F2): the proposer may not confirm their own proposal. The two gates are
// disjoint TODAY only by accident of single-role assignment (propose is HR-Admin-only, confirm is
// CEO/Super-Admin-only), so one [HR_ADMIN, CEO] user collapses #220's two-person rule entirely.
// Mirrors assertMayDecide in services/action-proposals.ts, which already implements exactly this
// check — the two propose→confirm implementations disagreed until now.
//
// CONFIRM only (Q2). Self-REJECT stays allowed and reads as withdrawing a mistake: it applies
// nothing, writes no rate config, and leaves the tax tables untouched.
if (proposal.proposedById === ctx.actorId) {
	error(403, 'You cannot confirm a rate change you proposed yourself.')
}
```

`rejectProposal` is **not** changed (Q2).

**Satisfies:** AC-13, AC-14, US-7.

---

### Commit 7 — `feat(recruitment): bind the department posting approver and bar the submitter (#283)`

The F4 guard. **Three separate changes in one commit — they are one function's coherence, but they
must be reviewed as three.** **Files:** `src/lib/server/services/recruitment.ts`,
`src/routes/(app)/dashboard/+page.server.ts`, new `tests/unit/recruitment-posting-sod.test.ts`.

**(a) The mapping binds — delete the dead line (D8).**

```ts
export function canApprovePosting(
	resolvedApproverEmployeeId: string | null,
	actorEmployeeId: string | null,
	actorRoles: Role[]
): boolean {
	if (resolvedApproverEmployeeId && actorEmployeeId === resolvedApproverEmployeeId) return true
	// #283/D8: HR is the FALLBACK, not an override. `return canAny(actorRoles, 'MANAGE_HR')` used
	// to sit below this line and answered the same question unconditionally, which made this branch
	// unreachable and the department mapping decorative. A mapped department is now decidable only
	// by its designated approver; only an UNMAPPED one falls back to HR — which is what this
	// function's comment and posting-approvers.ts:6-11 always claimed.
	return !resolvedApproverEmployeeId && canAny(actorRoles, 'MANAGE_HR')
}
```

(Written as the single surviving return rather than leaving `:121` as an `if` with nothing after
it. Same predicate, one statement.)

Update the doc comment above the function: *"the department's designated approver, or — only when
no approver is mapped — any HR admin."* The old "and an override for HR-mapped or unmapped
departments" is now false.

**Reachability is safe (RC-9):** the decide path is the dashboard card action `decidePosting`
(`dashboard/+page.server.ts:168-198`), which carries **no capability gate**, so a designated
approver holding only `EMPLOYEE` can already reach it today. Binding the mapping does not orphan
any department that has one.

**(b) The submitter may not decide (D9).** In `decideJobPosting`, immediately after the
`canApprovePosting` check at `:139-141`:

```ts
// #283/F4: submitJobPostingForApproval records submittedById (:81) and nothing has ever read it
// back at decision time. One person could submit and approve the same posting.
//
// D9: there is deliberately NO HR-steps-in fallback. If a department's designated approver
// submits a posting for their own department, that posting is undecidable until HR remaps or
// unmaps the department — so the message must NAME that route, or the user is stranded with a
// 403 and no next action.
if (jp.submittedById && jp.submittedById === ctx.actorId) {
	error(
		403,
		'You submitted this posting, so you cannot decide it. Ask HR to reassign this department’s posting approver in Settings → Posting approvers.'
	)
}
```

Service-level, per the repo's guard-placement rule — `decideJobPosting` is the only decision
authority and has one route caller today, but the rule does not bend for that.

**(c) Drop the compensating clause and add the submitter filter.** `listPostingsAwaitingApprover`
gains a 4th parameter `actorUserId: string` and its filter becomes:

```ts
	return pending
		.filter((p) => {
			const approver = approverByDept.get(p.departmentId) ?? null
			// The trailing `&& (approver != null || isHr)` that used to live here existed only
			// because canApprovePosting said yes to every HR admin. With the mapping bound (a) it
			// can never change the result — see plan DECISION-8 for the branch-by-branch proof.
			// The submitter filter mirrors the service guard so the card never offers a posting
			// the action would refuse (same discipline as AC-15 for requests).
			return canApprovePosting(approver, actorEmployeeId, actorRoles) && p.submittedById !== actorUserId
		})
```

`isHr` becomes unused — delete its declaration at `:194` (it is orphaned **by this change**, so
removing it is cleanup of our own mess, not unrelated tidying). `submittedById` is already present:
the `findMany` at `:182` has no `select`, so it returns the full row.

Dashboard call site passes `user.id`.

**Note on key types:** `submittedById`/`ctx.actorId` are **User** ids; `approverId`/`actorEmployeeId`
are **Employee** ids. They are never compared to each other — (b) and (c) compare user-to-user,
`canApprovePosting` compares employee-to-employee. Do not "unify" them.

**(d) B-1 / VC-3 — an existing green test asserts the behaviour D8 deletes, and must be rewritten
IN THIS COMMIT.** `tests/unit/posting-approval.test.ts:25` is
`it('lets HR override even when another approver is mapped')` and asserts
`canApprovePosting('emp_senior','emp_hr',HR) === true`. It passes today (baseline 101 files / 1226
tests). Without this hunk, commit 7 lands red and the green-at-every-commit claim is false.

**Rewrite it, do not delete it** — the case is testing a real branch and the branch still exists,
only its answer flips. Deleting would silently drop coverage of the mapped-department + HR-actor
combination, which is now the single most important case in the file:

```ts
	// #283/D8: the mapping BINDS. HR is the fallback for an UNMAPPED department, never an override
	// on a mapped one — which is what this function's own comment and posting-approvers.ts:6-11
	// always claimed. The old assertion here (true) pinned the unreachable-line bug.
	it('does not let HR override when another approver is mapped', () => {
		expect(canApprovePosting('emp_senior', 'emp_hr', HR)).toBe(false)
	})
```

I checked the **whole file** for siblings depending on the same assumption. The other four cases all
survive unchanged and are re-verified against the new predicate:

| Case | Assertion | Under D8 |
|---|---|---|
| `:11` lets the mapped approver act | `('emp_senior','emp_senior',EMP) === true` | still `true` (first branch) |
| `:15` rejects a non-approver, non-HR employee | `('emp_senior','emp_other',EMP) === false` | still `false` |
| `:19` lets HR act as the fallback when no approver is mapped | `(null,'emp_hr',HR) === true` | still `true` (surviving return) |
| `:23` **lets HR override even when another approver is mapped** | `('emp_senior','emp_hr',HR) === true` | **flips to `false` — rewritten above** |
| `:27` rejects a non-HR user when no approver is mapped | `(null,'emp_x',EMP) === false` | still `false` |

The file's header comment at `:5-6` ("HR can also override on any mapped department") is now false
and is corrected in the same hunk.

**New test file `tests/unit/recruitment-posting-sod.test.ts`** — the *service-level* cases
(`decideJobPosting`, `listPostingsAwaitingApprover`) that need a mocked `db`; read
`tests/unit/approval-self-guard.test.ts:18-31` first for the `vi.mock('$lib/server/db')` shape —
`approvals.test.ts` is a PURE-FUNCTION suite with no `vi.mock` at all and cannot be the model. The pure
`canApprovePosting` cases stay in `posting-approval.test.ts` where they already live — do not
duplicate them. Cases per AC-23..AC-26 in §8b.

**Satisfies:** AC-23, AC-24, AC-25, AC-26.

---

### Commit 8 — `test(rbac): E2E for multi-role assignment and decision-time SoD (#283)`

**Files:** `tests/e2e/settings-roles.spec.ts` (new), `tests/e2e/multi-role-sod.spec.ts` (new),
`prisma/seed-core.ts` (one added account; plus the F4 department fixtures — see M-8).

Read `tests/e2e/helpers.ts` and `prisma/seed-e2e.ts` **first** and reuse their login helper and
account constants — do not invent a new harness.

**Seeded two-hat account — worth adding, yes, and it goes in `seedE2E` (VC-8 / C-2).** One account,
`verifier.approver@…` with `roles: ['VERIFIER', 'APPROVER']`, added next to the existing verifier at
**`prisma/seed-core.ts:680`, inside `export async function seedE2E` (`:672`)** — **not** inside
`seedProd` (`:331`) and **not** inside `seedFoodServiceOrg` (`:190`, whose verifier at `:235` is the
one the earlier draft mistakenly pointed at). `pnpm db:seed` runs `prisma/seed.ts` → `seedProd`
only, so an account placed there would be invisible to both the E2E specs and M-1.

Justification: AC-17, AC-19 and the manual script all need a two-hat user, and creating one through
the UI as a test precondition would make the SoD spec depend on the assignment spec passing first.
Every other seed row stays single-role.

**`pnpm check` does not typecheck `prisma/**`** — so this seed edit must be proved by actually
running **`pnpm db:seed:e2e`** and reading the row back with SQL (manual step M-1). This is exactly
the assumption that shipped a broken site in #282. Add `pnpm db:seed:e2e` as a stated precondition
for `pnpm test:e2e` in M-6.

`tests/e2e/settings-roles.spec.ts` — AC-3: log in as CEO, open Settings → Roles, assert both roles
of the two-hat user are `selected` in the editable control, and that a *different* row's read-only
span lists the same roles in the same comma-joined form.

`tests/e2e/multi-role-sod.spec.ts` — **two specs**:
- AC-17: the two-hat user verifies a request; the request row then shows awaiting-approval, the
  queue offers that user **no** approve control, and the badge count does not include it.
- **AC-29 (D12):** the same user opens `/payroll/<run id>` for a run they verified and the
  sign-off control is rendered `aria-disabled="true"`, is **still reachable by Tab**, and its
  `aria-describedby` resolves to the F5 reason text. This is the only place the D12 markup is
  provable — see AC-29's strategy note in §8a for why a unit test cannot carry it.

**Satisfies:** AC-3, AC-17, AC-29 (UI half), and the visible half of AC-15.

---

### Commit 9 — `docs(rbac): record the #283 scope boundary and live verification (#283)`

Small, final. Contents:

1. Update the `#283` pointer comments now made stale (`org.ts` write comment,
   `roles/+page.svelte:105-108`, `api/.../+server.ts` response comment,
   `route-guard-multirole.test.ts` header — **the header's claim that multi-role "is unreachable
   until multi-role assignment ships" is now false and must be corrected; the scan itself, its
   patterns and its assertions stay exactly as they are.** Per SPEC R3, whether the scan still earns
   its keep is a *question* for a later review, not a change here).
2. **No payroll issue is filed any more** — F5 is fixed in commit 4 (DECISION-3 rewritten). Instead,
   add the comment at `OVERRIDE_FINALIZED` scope in the PR body recording what remains open:
   SUPER_ADMIN run+approve+void, which is a capability-table question this PR does not touch.
   `rbac.ts:69-71` already says so; do not duplicate it in a second place.
3. Correct the F3/F4 pointer comments now made stale: `documents.ts:149-150`'s "Role gating is the
   caller's job" is still true and stays; `recruitment.ts:112-113`'s doc comment is updated in
   commit 7, not here.
4. Paste the §9 manual-verification results (M-1..M-9) into the PR body, including the R-J impact
   statement: which existing users lose posting-approval reach.

---

## 8a. New Acceptance Criteria (AC-19..AC-27) — defined here, to be copied into the SPEC

The SPEC carries AC-1..AC-18 and does not yet cover F3/F4/F5. These nine criteria are authored here
so the plan is self-contained; **§16 lists them as SPEC edits to apply.** Same format as the SPEC:
`proven by:` names the scenario, `strategy:` is one of Fully-Automated / Hybrid / Agent-Probe.

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

**AC-28 — Un-verifying a document does not clear the bar (D11 / B-5).**
Given an actor who marked a document on request A verified and is therefore barred, when they clear
that verification (`verifyDoc` with `verified=false`) and then attempt a decision on request A,
then it is **still refused**; the document reads as not-currently-verified (`verifiedAt` is null)
while `verifiedById` still records them.
- proven by: `approval-self-guard.test.ts › canActOnStage › the bar survives un-verifying the document` + `requests-documents.test.ts › setRequestDocumentVerified › clearing keeps verifiedById`
- strategy: Fully-Automated (unit)
- mutation that must turn it red: restore `verifiedById: null` in the clear branch of
  `setRequestDocumentVerified`

**AC-29 — The UI and the service agree about a barred actor (D12).**
Given a barred actor on a payroll run they verified, when they open `/payroll/[id]`, then the
Verify/Approve control is rendered non-actionable **and** carries a reason that is reachable by
keyboard and exposed to assistive tech (`aria-disabled="true"`, focusable, `aria-describedby`
pointing at visible text); **and** when the same action is posted directly, the service refuses it
with the matching message.
- proven by: `tests/e2e/multi-role-sod.spec.ts › a barred verifier sees a disabled sign-off control with a reason` (UI half) + `approvals.test.ts › decidePayrollRun › a VERIFIER+CEO cannot approve a run they verified` (service half, shared with AC-27)
- strategy: **Fully-Automated (E2E) for the UI half, Fully-Automated (unit) for the service half.**
  This is the one criterion in the set that a unit test cannot carry alone: the claim is about
  *rendered state and its accessible name/description*, which needs a real DOM. Playwright asserts
  `aria-disabled`, tab-reachability and the resolved `aria-describedby` text; a unit test can only
  assert the `load` returned `canAct: false` + a reason string, which is necessary but does not
  prove the markup. Both halves are required — the whole point of AC-29 is that the two agree.
- mutation that must turn it red: make the page compute `canAct` without the SoD data (restore the
  permissive sentinel) — the control renders actionable and the E2E goes red while the service test
  stays green, which is exactly the drift AC-29 exists to catch.

---

## 8b. Test Plan — per Acceptance Criteria

Tier legend: **FA** Fully-Automated · **H** Hybrid · **AP** Agent-Probe.

Every guard row carries a **mutation check**: the exact source edit that must turn the test red.
This repo has shipped tests that passed for the wrong reason — a 200-status assertion on a route
that always returns 200 proves only that nothing threw. **Assert the arguments, not the status.**

| AC | Test file › case | Tier | Commit | Mutation that must turn it red |
|---|---|---|---|---|
| AC-1 | `user-admin-self-guard.test.ts › setUserRoles › assigns a multi-role set and the union of capabilities holds` | FA | 1 | change the write to `data: { roles: [roles[0]] }` |
| AC-2 | `api-v1-user-roles.test.ts › accepts a role set and enforces the same guards` (assert the **args** passed to `setUserRoles`) | FA | 3 | change the handler to pass `[parsed.data.roles[0]]` |
| AC-3 | `e2e/settings-roles.spec.ts › prefills every held role in the picker` | FA (E2E) | 8 | change `selected={u.roles.includes(r)}` to `selected={u.roles[0] === r}` |
| AC-4a | `user-admin-self-guard.test.ts › setUserRoles › refuses an empty role set` (assert 400 **and** that `db.$transaction` was never called) | FA | 1 | delete the `roles.length === 0` guard |
| AC-4b | `api-v1-user-roles.test.ts › rejects an empty roles array` (assert `setUserRoles` **not called**) | FA | 3 | change `.nonempty()` to `.array()` |
| AC-5 | `user-admin-self-guard.test.ts › setUserRoles › refuses to drop the last CEO from a multi-role set` | FA | 1 | pass `existing.roles` instead of `roles` to `assertNotLastOfRole` |
| AC-6 | `user-admin-self-guard.test.ts › setUserRoles › reports every irreplaceable role lost` | FA | 1 | `break` after the first `lost` iteration in `assertNotLastOfRole` |
| AC-7 | `user-admin-self-guard.test.ts › setUserRoles › does not block re-saving an existing set` (supersedes `:233`) | FA | 1 | make `assertNotLastOfRole` key on `newRoles` membership instead of loss |
| AC-8 | existing self-change cases, extended to sets (form + API) | FA | 1,3 | delete the `userId === ctx.actorId` block |
| AC-9 | `approval-self-guard.test.ts › canActOnStage › bars an actor from a second stage of the same attempt` | FA | 4 | delete the `sod.decidedActorIds.includes` line |
| AC-10 | `approval-self-guard.test.ts › canActOnStage › does not leak the bar across requests` | FA | 4 | make `decidedActorIds` ignore its `attempt` argument **and** widen the caller to all requests |
| AC-11 | `approval-self-guard.test.ts › canActOnStage › covers MAKE+VERIFY, VERIFY+APPROVE, and all three` | FA | 4 | restrict the predicate to `stage === 'APPROVE'` |
| AC-12 | `approval-self-guard.test.ts › canActOnStage › treats the auto-completed MAKE as a decision` | FA | 4 | add `&& s.decidedAt != null && s.stage !== 'MAKE'` to `decidedActorIds` |
| AC-15 | **`approval-queues.test.ts`** (new — B-3) `› listPendingRequestsForApprover › excludes a request the viewer already decided a stage of` + `› countPendingApprovals › the requests count matches the filtered list` | FA | 4 | pass `{ actorId: null, decidedActorIds: [] }` from `listPendingRequestsForApprover` |
| AC-13 | `payroll-statutory-proposal.test.ts › confirmProposal › refuses the proposer` | FA | 6 | delete the `proposedById === ctx.actorId` block |
| AC-14 | `payroll-statutory-proposal.test.ts › confirmProposal › rolls back cleanly when the proposer is refused` — assert `updateStatutoryRateConfig` was **not** called and no APPLIED audit entry was written | FA | 6 | move the guard *after* `updateStatutoryRateConfig` |
| — (Q2) | `payroll-statutory-proposal.test.ts › rejectProposal › allows the proposer to withdraw their own proposal` | FA | 6 | add the same bar to `rejectProposal` |
| AC-16 | `route-guard-multirole.test.ts` — existing scan, **assertions unchanged** | FA | 1,3 | (regression net; it must stay green throughout) |
| AC-17 | `e2e/multi-role-sod.spec.ts › two-hat user verifies then cannot approve` | FA (E2E) | 8 | any of the AC-9 mutations |
| AC-18 | existing CI populated-DB push gate (#236 / PR #284) + manual step M-1 | H | 8 | — |
| **AC-19** | `approval-self-guard.test.ts › canActOnStage › bars the verifier of a request document from deciding that request` | FA | 5 | delete the `verifiedDocActorIds.includes` line |
| **AC-20** | `approval-self-guard.test.ts › canActOnStage › lets an ADMINISTER_SYSTEM holder decide a request whose document they verified` | FA | 5 | delete `&& !canAny(actorRoles,'ADMINISTER_SYSTEM')` (bar becomes absolute — this case turns red) |
| **AC-21** | **`approval-queues.test.ts`** `› listPendingRequestsForApprover › excludes a request whose document the viewer verified` | FA | 5 | drop `verifiedById: true` from `listPendingRequestsForApprover`'s `documents` select (the silent-failure mode — the array goes empty and the bar quietly stops existing) |
| **AC-22** | `approval-self-guard.test.ts › decide › records selfVerifiedEvidence when the carve-out is used` — assert the **audit payload**, and assert it is **absent** on an ordinary decision | FA | 5 | make `usedDocVerifierCarveOut` return `false` unconditionally |
| **AC-23** | `recruitment-posting-sod.test.ts › canApprovePosting › a mapped department is decidable only by its designated approver` — asserts an `HR_ADMIN` who is not the approver is refused | FA | 7 | restore `return canAny(actorRoles,'MANAGE_HR')` |
| **AC-24** | `recruitment-posting-sod.test.ts › canApprovePosting › an unmapped department still falls back to any MANAGE_HR holder` | FA | 7 | change the surviving return to `false` |
| **AC-25** | `recruitment-posting-sod.test.ts › decideJobPosting › refuses the submitter and names the remap route` — asserts 403, asserts `db.jobPosting.update` was **not** called, and asserts the message contains `Settings → Posting approvers` | FA | 7 | delete the `submittedById === ctx.actorId` block |
| **AC-26** | `recruitment-posting-sod.test.ts › listPostingsAwaitingApprover › omits postings the viewer submitted` | FA | 7 | drop the `p.submittedById !== actorUserId` filter |
| **AC-27** | `approval-self-guard.test.ts › decidePayrollRun › a VERIFIER+CEO cannot approve a run they verified` (assert the refusal **and** that `payrollRun.update` was not called) + **`approval-queues.test.ts` `› countActionablePayrollRuns › excludes a run the viewer verified`** (needs the B-4 export) | FA | 4 | pass `{ actorId: null, decidedActorIds: [] }` from `canActOnPayrollStage` |
| — (F5 msg) | `approval-self-guard.test.ts › decidePayrollRun › the maker still gets the specific "you prepared" message` | FA | 4 | move the maker block back below the `canActOnPayrollStage` call (the generic message wins → red) |
| DEC-2 | **`approval-queues.test.ts`** `› countActionableTimesheets › excludes a timesheet the viewer already decided` (needs the B-4 export) | FA | 4 | drop `actorId: true` from the timesheet select (the silent-failure mode) |
| **AC-28** | `approval-self-guard.test.ts › canActOnStage › the bar survives un-verifying the document` + `requests-documents.test.ts › setRequestDocumentVerified › clearing keeps verifiedById` | FA | 5 | restore `verifiedById: null` in the clear branch |
| **AC-29** | `e2e/multi-role-sod.spec.ts › a barred verifier sees a disabled sign-off control with a reason` (asserts `aria-disabled`, tab-reachability, resolved `aria-describedby` text) + the AC-27 service case | FA (E2E) + FA (unit) | 4 | restore the permissive sentinel in `payroll/[id]/+page.server.ts` — E2E goes red, service test stays green |

### New file `tests/unit/approval-queues.test.ts` (B-3 / VC-4)

**Why it must exist.** DECISION-4's whole justification for putting the guard inside `canActOnStage`
rather than inline in `decide()` was that the badge and queue mirrors would inherit it *structurally*.
VALIDATE found that mirror is **untested repo-wide** — nothing covers `countPendingApprovals`,
`listPendingRequestsForApprover`, `countActionableTimesheets` or `countActionablePayrollRuns`, and
the file the plan pointed at (`proposal-queue.test.ts`) tests the #224 action-proposals page and
never touches the approvals service. The plan's central architectural argument was unproven by
construction. This file is what makes it true.

Reuse the existing `vi.mock('$lib/server/db')` harness from **`tests/unit/approval-self-guard.test.ts:18-31`**
(or `proposal-queue.test.ts:41-43`) — do not invent a second mocking harness, and do **not** copy
`approvals.test.ts`, which is a pure-function suite with no `vi.mock` (C-P3). Note the harness needs
widening for `countPendingApprovals`: it queries `employee.findUnique`, `request.findMany`,
`timesheet.findMany`, `payrollRun.findMany` **and** whatever `listActionableProposals` reaches for.
Requires the B-4 exports (commit 4).

| Case | Proves | Assert |
|---|---|---|
| `listPendingRequestsForApprover › excludes a request the viewer already decided a stage of` | AC-15 | the returned array; and that an unrelated pending request **is** still returned |
| `listPendingRequestsForApprover › excludes a request whose document the viewer verified` | AC-21 | same shape; add a doc row with `verifiedById` = the viewer |
| `listPendingRequestsForApprover › still returns it for a different approver` | AC-15/AC-21 negative control — catches a bar that excludes everything | array length |
| `countPendingApprovals › the requests count equals the filtered list length` | AC-15 badge half | the `requests` field **and** `total` |
| `countActionableTimesheets › excludes a timesheet the viewer already decided` | DEC-2 | the number |
| `countActionablePayrollRuns › excludes a run the viewer verified` | AC-27 count half | the number |

Every case asserts the **contents or the count**, never merely that the call resolved. A "did not
throw" assertion on a counter that returns a number proves nothing — this repo has shipped that
mistake before.

**Regression suites that must stay green and are not allowed to be weakened:**
`route-guard-multirole.test.ts` (AC-16 / SPEC R3), `rbac-no-rank-helpers.test.ts`,
`rbac.test.ts`, `action-proposals.test.ts`, `approvals.test.ts`.

**Known gaps (residual, recorded not silently dropped):**

| Gap | Why | Resolution |
|---|---|---|
| Empty role set written outside the service (seed, script, manual SQL) — SPEC R1 | D4 rules out a DB check constraint | Accepted. Mitigation: every application path refuses it. Backlog stub: *"raw-SQL check constraint for non-empty `User.roles`"* — file at UPDATE-PROCESS. |
| ~~Payroll verify→approve collapse under multi-role~~ | **Closed** — F5 is now in scope (D10 / DECISION-3 rewritten) | Fixed in commit 4. AC-27. |
| SUPER_ADMIN run + approve + void the same payroll (`OVERRIDE_FINALIZED`) | Single-role reachable **and** a capability-table question; this PR does not touch the capability table (§11 item 6) | Accepted, out of scope. `rbac.ts:69-71` already records it. Recommend filing as its own issue at UPDATE-PROCESS. |
| An `ADMINISTER_SYSTEM` holder can still self-verify **and** self-decide | Deliberate — D7's carve-out | Accepted. Mitigated by AC-22's audit marker, not by a bar. |
| A barred approver on the **timesheets** list or the **dashboard posting card** gets no explanation anywhere — the item just vanishes, and neither surface has a detail page to carry a reason | D12's scope boundary (R-P): the queue exclusion is required by AC-15/AC-21/AC-26/US-8 | Accepted for this PR. Backlog stub: *"explain why a queue item is not actionable — timesheets + posting card"*. File at UPDATE-PROCESS. |
| `verifiedById` is a single scalar, so a later verifier by a **different** actor overwrites the earlier signer and forgets their F3 bar | D11's accepted ceiling; needs two colluding people | Accepted, marked in code with a `ponytail:` comment. Upgrade path: a `RequestDocumentVerification` history table. Backlog stub at UPDATE-PROCESS. |
| A posting can become undecidable when its designated approver submits it | Deliberate — D9, no HR fallback | Accepted. The 403 names the remap route (AC-25). Risk R-K. |
| Separation/offboarding: one actor can clear every clearance item **and** finalize the separation (`separation.ts:135` `clearedById`, `:247` `finalizedById`) | Found in the §8c sweep. Not a separation-of-duties hole: clearance is a **checklist**, not a two-person control — no second-person rule was ever declared for it, so there is nothing to collapse | Out of scope. Recommend filing as a design question ("should clearance sign-off be a second-person control?"), not as a bug. |
| Touch usability of `<select multiple>` | Native-platform choice, no picker library | Accepted, recorded in commit 2. |

---

---

## 8c. Completeness Sweep — every other multi-stage flow (NEW-4)

Scope now reads "close every same-actor separation-of-duties hole", so the seven flows named in the
brief were re-checked against `9a5df08`. **Nothing was silently added to the plan.** Findings:

| Flow | Finding | Verdict |
|---|---|---|
| **Leave approval** | Leave runs the ordinary `Request` maker-checker chain (`leave.ts` holds balance arithmetic only; its single `ctx.actorId` use at `:101` is a lookup, not a decision). | **Already covered** by F1 + F3 via `decide()`. No separate work. |
| **Timesheet review** | `timesheets.ts:362` runs the same `canActOnStage`. | **Already in the plan** (DECISION-2, commit 4). |
| **Document requests** | These *are* `Request` rows with `RequestDocument` attachments. | **This is F3.** In scope, commit 5. |
| **#224 action proposals** | `assertMayDecide` (`action-proposals.ts:60-87`) already bars (1) the initiator, (2) the employee the change is about, and (3) anyone without the shape-appropriate confirmer capability. Verified complete — it is the **stronger** of the two propose→confirm implementations and is what commit 6 makes `confirmProposal` match. | **Complete, no change.** |
| **Performance reviews** | `reviewerId` is assigned from `reportsToId` (`performance.ts:224`); `updateReview` refuses a non-reviewer (`:125`) and `acknowledgeReview` refuses anyone but the subject (`:157`). Reviewer and subject are different people **by construction**. | **No gap.** |
| **Offboarding / separation** | `separation.ts` — one actor can mark every `ClearanceItem` cleared (`:135` `clearedById`) and then finalize the separation (`:247` `finalizedById`). Same actor, two steps. | **Out of scope — recommend filing as a design question, not a bug.** Reason: clearance is a *checklist*, not a declared two-person control. There is no propose→confirm, no approval chain, and no second-person rule anywhere in the flow — so nothing collapses; the control simply never existed. Adding one is a product decision (who signs clearance?), not a hole this PR closes. |
| **Loans** | No loan service exists. `Loan` rows are written by payroll and settled by `separation.ts:254`; there is no multi-stage loan approval flow to have a same-actor gap in. | **Nothing to check.** |

**Recommended to file separately (two issues, neither added to this plan):**

1. *"Should clearance sign-off be a second-person control?"* — the separation finding above.
2. *"SUPER_ADMIN can run, approve and void the same payroll"* — the surviving `OVERRIDE_FINALIZED`
   item; a capability-table question, explicitly untouched here (§11 item 6).

---

## 9. Manual Verification Script (run BEFORE the final push)

The repo's rhythm is verify live, then commit. Run this after commit 8 and paste the output into
the PR body.

**Table names — read this before running anything (VC-7 / C-1).** Every Prisma model is `@@map`'d to
snake_case. The earlier draft of this script queried `"User"`, `"AuditLog"`, `"Request"`,
`"ApprovalStep"` and `"StatutoryRateProposal"`; VALIDATE ran it live and got
`ERROR: relation "User" does not exist`. Every statement below now uses the real names. **Column**
names stay camelCase and still need double quotes.

| Model | Table |
|---|---|
| `User` | `users` |
| `AuditLog` | `audit_logs` |
| `Request` | `requests` |
| `ApprovalStep` | `approval_steps` |
| `RequestDocument` | `request_documents` |
| `JobPosting` | `job_postings` |
| `PostingApprover` | `posting_approvers` |
| `Department` | `departments` |
| `PayrollRun` | `payroll_runs` |
| `StatutoryRateProposal` | `statutory_rate_proposals` |

**Fixture reality check (VC-9 / C-7).** The dev DB has **0** rows in `posting_approvers`, 13
departments, 1 job posting (CLOSED, none PENDING_APPROVAL), **0** `request_documents`, 46 users and
**0** multi-role rows. So **nothing locally loses posting-approval reach and nothing becomes
undecidable** — R-J and R-K cannot be *measured* here, only *demonstrated* with fixtures you build
by hand. M-7 and M-8 below say exactly which fixtures to create. Do not expect the seed to provide
them.

```bash
# M-0 — start the database and the app
./start.sh                          # Docker container veent-db-5434, host networking
pnpm db:push && pnpm db:seed:e2e    # NOT `db:seed` (VC-8/C-2): `db:seed` runs seed.ts -> seedProd,
                                    # which does not contain the two-hat account. `db:seed:e2e` runs
                                    # seedE2E, which does. Also proves the seed edit actually runs —
                                    # `pnpm check` does NOT typecheck prisma/** (#282 shipped a
                                    # broken site on exactly that assumption).
pnpm dev                            # http://localhost:5173 ; env is .env.dev — there is no .env
```

```bash
# M-1 — the seeded two-hat account really has two roles
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select email, roles from users where array_length(roles,1) > 1 order by email;"
# expect exactly the one seeded VERIFIER+APPROVER account.
# If this returns ZERO rows you ran `pnpm db:seed` instead of `pnpm db:seed:e2e` — see VC-8.
```

**M-2 — the form (AC-1, AC-3, AC-4, AC-7, AC-8, US-2).** Log in as the CEO, open
`/settings/roles`.

1. The two-hat row shows **both** roles highlighted in the multi-select; another row's read-only
   span lists the same roles comma-joined.
2. Ctrl-click to add `HR_ADMIN` to a plain `EMPLOYEE`, Save → inline success, control reopens with
   both selected.
3. Ctrl-click everything off, Save → inline error *"A user must keep at least one role."*
4. Save the CEO row unchanged → succeeds, no 409.
5. Change the sole CEO's set to one without `CEO` → inline 409 naming CEO.
6. The CEO's own row shows no editable control.

```bash
# verify #2 and #3 landed / did not land
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select email, roles from users where email = '<the edited user>';"
# verify the audit entry now carries a SET on both sides (Q4)
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select \"createdAt\", \"oldValue\", \"newValue\" from audit_logs
   where \"entityType\" = 'User' order by \"createdAt\" desc limit 3;"
```

**M-3 — the v1 twin (AC-2, AC-4, US-5).** Use the `_dev/login-as` harness
(`src/routes/api/v1/_dev/login-as`) to obtain a CEO session cookie into a jar, then:

```bash
COOKIE=/tmp/veent.jar
curl -s -c $COOKIE -X POST localhost:5173/api/v1/_dev/login-as \
  -H 'content-type: application/json' -d '{"email":"<ceo email>"}'

# accepts a set (expect 200 and the full set echoed back)
curl -s -b $COOKIE -X PATCH localhost:5173/api/v1/settings/users/<id>/roles \
  -H 'content-type: application/json' -d '{"roles":["HR_ADMIN","VERIFIER"]}'

# refuses the empty set (expect 422, and NOTHING written)
curl -s -b $COOKIE -X PATCH localhost:5173/api/v1/settings/users/<id>/roles \
  -H 'content-type: application/json' -d '{"roles":[]}'

# the old path is gone (expect 404 — proves the rename, and that nothing silently still serves it)
curl -s -o /dev/null -w '%{http_code}\n' -b $COOKIE \
  -X PATCH localhost:5173/api/v1/settings/users/<id>/role \
  -H 'content-type: application/json' -d '{"role":"HR_ADMIN"}'
```

```bash
# prove the empty-set call wrote nothing
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select email, roles from users where id = '<id>';"
```

**M-4 — F1 live (AC-9, AC-12, AC-15, US-6, US-8).** As the two-hat `[VERIFIER, APPROVER]` user:
verify a pending request, then reload `/requests/approvals`. The request must **not** appear in the
actionable list and must **not** be in the sidebar badge count. Then confirm another approver still
sees and can approve it. Separately, as an `HR_ADMIN` filer (filer-is-maker path), file a request
and confirm you cannot then verify it.

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select r.id, r.status, r.\"currentStage\", s.attempt, s.\"stageIndex\", s.stage, s.decision, s.\"actorId\"
   from requests r join approval_steps s on s.\"requestId\" = r.id
   where r.id = '<request id>' order by s.attempt, s.\"stageIndex\";"
```

**M-5 — F2 live (AC-13, AC-14, Q2).** As a user holding `[HR_ADMIN, CEO]` (grant it via M-2),
propose a statutory-rate change at `/settings/statutory-rates`, then try to confirm it → refused.
Then reject it → allowed.

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select id, status, \"proposedById\", \"decidedById\" from statutory_rate_proposals
   order by \"createdAt\" desc limit 3;"
# after the refused confirm: status must still be PENDING and decidedById NULL (the claim rolled back)
```

**M-7 — F3 live (AC-19, AC-20, AC-21, AC-22).** As the two-hat `[VERIFIER, APPROVER]` user, open a
pending request that has a supporting document, click **Verify** on the document, then reload
`/requests/approvals`.

1. The request must **not** be actionable for that user at **any** stage, and must not be in the
   sidebar badge count (AC-19, AC-21).
2. The document's owner must now get a 409 if they try to remove that file — this is the existing
   `documents.ts:192` behaviour and is the evidence for DECISION-6b (the artefact cannot change).
3. Log in as the **CEO** (holds `ADMINISTER_SYSTEM`), verify a document on a *different* pending
   request, then decide that request. It must **succeed** (AC-20).

4. **AC-28 / D11 — the bypass.** As the barred user from step 1, go back to the document and click
   **Unverify**, then return to `/requests/approvals`. The request must **still** be non-actionable
   for them. Before the fix this was the one-click escape hatch.

```bash
# FIXTURE FIRST (VC-9): request_documents is EMPTY in the dev DB. Nothing to verify exists until you
# make one. File a request as an ordinary employee at /requests and attach a PDF/PNG in the same
# form (the `documents` field on the create form) — the upload path is uploadsFromForm, so a request
# filed without a file has no document and M-7 cannot run. Confirm it landed:
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select count(*) from request_documents;"   # must be >= 1 before continuing

# who verified what, and did the un-verify keep verifiedById? (D11 — this is the AC-28 proof)
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select id, \"requestId\", \"verifiedById\", \"verifiedAt\"
   from request_documents order by \"uploadedAt\" desc limit 5;"
# after step 4: verifiedAt must be NULL while verifiedById STILL names the actor.
# If verifiedById is also null, D11 was not implemented and F3 is bypassable.

# AC-22: the CEO's decision must carry selfVerifiedEvidence; the ordinary one must NOT
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select \"createdAt\", \"entityId\", \"newValue\" from audit_logs
   where \"entityType\" = 'Request' order by \"createdAt\" desc limit 5;"
```

**M-8 — F4 live (AC-23, AC-24, AC-25, AC-26).** This step needs **two departments: one WITH a mapped
approver and one WITHOUT** — and **neither exists** in the dev DB (VC-9: `posting_approvers` is
empty, and the single job posting is CLOSED). Every fixture below is created by hand through the
product; the seed will not provide them. Create them through the UI, not by SQL — the mapping table
is `posting_approvers` and the settings page writes it:

1. As an `HR_ADMIN` or CEO, open **Settings → Posting approvers**. The page lists every department
   with its current approver (`listPostingApprovers`). Pick two departments; set an approver on the
   first (choose an employee who is **not** an HR admin), and leave the second's approver **unset**.
2. Confirm the fixture is what you think it is before testing anything:

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select d.id, d.name, pa.\"approverId\"
   from \"departments\" d left join \"posting_approvers\" pa on pa.\"departmentId\" = d.id
   order by d.name;"
# expect exactly one row with a non-null approverId and at least one with null
```

*(If the table names differ, list them with `\dt` — the app's Prisma `@@map` names are snake_case.)*

3. **AC-23:** as an HR admin who is **not** the mapped approver, create + submit a posting in the
   **mapped** department, then open `/dashboard`. The posting must **not** appear on the
   awaiting-approval card, and forcing the action must 403.
4. **AC-24:** submit a posting in the **unmapped** department. Any HR admin must see it on the card
   and be able to approve it.
5. **AC-25 + D9:** log in as the **mapped approver**, create + submit a posting for their own
   department, then try to decide it. Refused, and **the message must name Settings → Posting
   approvers.** Then have HR unmap the department and confirm the posting becomes decidable — this
   is the escape hatch working end to end.
6. **AC-26:** the posting from step 5 must be absent from the submitter's own dashboard card.

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select id, title, status, \"submittedById\", \"approvedById\", \"departmentId\"
   from \"job_postings\" order by \"updatedAt\" desc limit 5;"
# after the refused decide: status must still be PENDING_APPROVAL and approvedById NULL
```

**M-9 — F5 live (AC-27) and the D12 control (AC-29).** Grant one account `[VERIFIER, CEO]` via M-2.
Compute a payroll run as someone else (so the maker guard is not what fires), verify it as the
two-hat user, then as that same user open `/payroll/<run id>`:

1. The Verify/Approve control must render **non-actionable with a visible reason** — "You recorded
   the verify decision on this run — another finance approver must sign it off." (D12).
2. **Tab to it with the keyboard.** It must be reachable (that is why it is `aria-disabled` + focusable,
   not `disabled`), and the reason must be announced. If it is skipped by Tab, the pattern regressed
   to native `disabled` and AC-29's accessibility half is not met.
3. Post the action anyway (curl the form endpoint, or re-enable the button in devtools) → the service
   must refuse with the matching message. UI and service must agree; that is the whole of AC-29.

Then approve it as a different `APPROVE_FINANCE` holder and confirm it goes through.

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  "select r.id, r.status, s.attempt, s.\"stageIndex\", s.stage, s.decision, s.\"actorId\"
   from \"payroll_runs\" r join \"approval_steps\" s on s.\"payrollRunId\" = r.id
   where r.id = '<run id>' order by s.attempt, s.\"stageIndex\";"
# after the refused approve: run status must still be COMPUTED and approvedById NULL
```

**M-6 — gates, in CI order.**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

---

## 10. Risk Register + Rollback

| # | Risk | Likelihood | Mitigation | Rollback |
|---|---|---|---|---|
| **R-A** | `Object.fromEntries` collapses the multi-select and silently saves one role | High if forgotten — **it is invisible**, no error anywhere | `getAll` is mandated in commit 2; E2E AC-3 + manual M-2 step 2 both catch it | revert commit 2 |
| **R-B** | A call site passes the `sod` sentinel and the guard silently does nothing there | Medium | Required parameter at position 5 = compile error; plus the DEC-2 mutation-check row that specifically covers the `actorId: true` select omission | one-line fix |
| **R-C** | `countActionableTimesheets`' select lacks `actorId` → `decidedActorIds` always empty → badge lies | Medium (easy to miss; TypeScript will *not* catch it because the field is simply absent from the selected type — it becomes a compile error only if the helper's param type demands it) | Type `decidedActorIds`' parameter to require `actorId: string \| null`, which turns the omission into a compile error. Verify this holds during EXECUTE. | one-line select fix |
| **R-D** | Seed/script breakage invisible to `pnpm check` (SPEC R2, #282's exact failure) | Medium | No seed *needs* the new signature (none calls it); the one seed addition is proved by running `pnpm db:seed` + M-1 SQL | revert commit 6's seed hunk |
| **R-E** | Large diff across 14+14 guard tests is hard to review (SPEC R5) | High | Split across commits 1/4/5 so each is reviewable alone; all are fast unit tests | per-commit revert |
| **R-F** | Empty role set via raw SQL / future script → unrecoverable lockout (SPEC R1, D4) | Low | Accepted residual. Every application path refuses it. Backlog stub filed. **Recovery if it happens:** direct SQL `update "User" set roles = '{EMPLOYEE}' where id = …` — document this in the PR body. | n/a |
| **R-G** | The renamed v1 path breaks an unknown consumer | Very low | Verified: `/api/v1/*` authenticates by Lucia session cookie only, no API-key/bearer mechanism exists anywhere, zero in-repo callers | `git mv` back; the directory rename is the whole change |
| **R-H** | The F1 guard is too strict and deadlocks a small org's request | Low | Attempt-scoped per Q1: a RETURN clears the bar, so a request can always progress after a re-file | flip `sod.actorId` to `null` at `decide()` — one line, instantly disables |

| **R-J** | **Binding the posting mapping (D8) is a live behaviour change: people who can approve a posting today cannot tomorrow.** Concretely: every holder of `MANAGE_HR` — `MANAGER`, `HR_ADMIN`, `SUPER_ADMIN`, `CEO` (`rbac.ts:26`, RC-12) — loses the ability to decide postings in **any department that has a `PostingApprover` row**, unless they are that row's approver. Departments with no mapping are unaffected. | Certain, by design | Not mitigated — it is the point of D8. **Made visible instead:** M-8 step 2 prints the exact mapped-department list before testing, and commit 9 pastes that list into the PR body. **But say it plainly (VC-9 / C-7): in the dev DB that list is EMPTY.** `posting_approvers` has **0 rows**, so locally *nobody* loses reach and *nothing* becomes undecidable — the local run demonstrates the behaviour with hand-built fixtures, it does not measure the blast radius. A real impact list requires running the same query against **staging**; if that is not done, commit 9 must record "no mapped departments in the environments checked" rather than implying a measurement happened. AC-24 pins that the unmapped fallback still works. | revert commit 7 — it is one function and one filter |
| **R-K** | **A posting can become undecidable (D9).** If a department's designated approver submits a posting for their own department, F4(b) refuses them and F4(a) refuses everyone else. | Low but certain when it happens | Accepted by D9 — no HR-steps-in fallback. **The 403 message names the escape hatch** (remap or unmap the department in Settings → Posting approvers), which AC-25 asserts on the message text, not just the status. M-8 step 5 walks the hatch end to end. | HR remaps the department; no code change needed |
| **R-L** | **The D7 carve-out is a privileged path that could be used silently.** An `ADMINISTER_SYSTEM` holder may verify the evidence and then decide the request, which is exactly the collapse F3 exists to prevent — permitted only because the user chose it as the escape hatch. | Certain by design | The waiver must not be invisible: `usedDocVerifierCarveOut` sets `selfVerifiedEvidence: true` on the decision's audit entry, and **only** when the waiver actually fired (AC-22 asserts both the presence and the absence). The audit trail is the control here, not a bar. | remove the carve-out — one `&&` clause — if the audit shows it being used routinely |
| **R-M** | **F3's `verifiedDocActorIds` silently empties if a `select` forgets `verifiedById`** — the same quiet-failure shape as R-C. TypeScript will not catch a *missing* field. | Medium | Type `StageSoD.verifiedDocActorIds` as required (not optional) so every construction site is a compile error, and give AC-21 the mutation check "drop `verifiedById` from the select" so a regression is caught by a test, not by review. | one-line select fix |

| **R-N** | **F3 was bypassable in one click** (VALIDATE B-5): `verifyDoc` accepts `verified=false` and the clear branch nulled `verifiedById`, so a barred actor un-verified their own sign-off and decided — with `selfVerifiedEvidence` never firing, so R-L's audit marker stayed silent too. AC-19 would have passed green with the door open. | **Was certain.** Closed by D11. | The clear branch keeps `verifiedById`; the predicate keys on it, never on `verifiedAt`; AC-28 pins it with a named mutation. **Residual (accepted):** a *different* actor verifying the same document later overwrites `verifiedById` and forgets the earlier signer — needs two colluding people, marked with a `ponytail:` comment naming the verification-history upgrade path. | revert the one-line `documents.ts` hunk — but that reopens the bypass, so the real rollback is reverting commit 5 entirely |
| **R-O** | **The UI could offer an action the service refuses** (VALIDATE B-2): `payroll/[id]/+page.server.ts:64` gates the sign-off button and was not in the plan's caller list. A permissive sentinel there renders a live button on a 403. | Would have been certain | D12: the page receives the real SoD data and renders the control `aria-disabled` with a keyboard-reachable reason. AC-29 asserts both halves and its mutation (restore the sentinel) turns the E2E red while the service test stays green — which is exactly the drift being guarded. | one-line revert to the sentinel; the button reappears, the service still refuses (unsafe-looking but not unsafe) |
| **R-P** | **D12 is deliberately NOT applied to the three queue surfaces**, so a barred approver on the requests/timesheets/postings queues still sees the item simply vanish with no explanation anywhere except the request detail page. | Certain by design | Accepted: applying D12 to a queue would require `listPendingRequestsForApprover` to annotate rather than filter, which breaks AC-15, AC-21, AC-26 and US-8 in the same PR that introduces them. The `requests/[id]` reason line is the mitigation for the request case; **timesheets and job postings have no detail page and therefore no explanation surface at all** — recorded as a known gap, not silently absorbed. | n/a — it is the current behaviour |

### R-I — Session freshness when a role set changes mid-session

**Answer: role changes take effect on the target's very next request. No re-login, no session
invalidation, and no cache to bust.**

Evidence: `src/lib/server/auth.ts:12` builds Lucia with `PrismaAdapter(db.session, db.user)`, and
`getUserAttributes` at `:14-22` maps `attributes.roles` straight through. Lucia v3's
`validateSession` reads the session **and its joined user row from the database on every call**;
`src/hooks.server.ts` calls it per request and assigns the result to `event.locals.user` at `:36-39`,
merging only the effective org id. Nothing in the chain memoises the role array, and the session
cookie carries only the session id. So a user granted `VERIFIER` mid-session sees verifier surfaces
on their next navigation, and a user whose set is narrowed loses access immediately.

Two consequences worth stating: (1) there is no window where a demoted user retains capabilities;
(2) the F1/F2 guards read `ctx.actorRoles`/`ctx.actorId` from that same per-request read, so they
cannot be evaded by holding an old session open.

### Rollback of the whole change

Every commit is independently revertable and there is **no schema migration and no data
backfill** (AC-18), so rollback is `git revert` of the PR merge commit with no database action. The
only forward-only artefact is the audit-entry shape (`newValue: { roles }`), which is additive —
historical singular entries are untouched and a revert simply resumes writing the singular key.

---

## 11. Explicit Non-Goals (EXECUTE must not drift into these)

Restating the scope boundary **as widened on 11-08-26**. Items 1–3 below previously excluded F3, F4
and the payroll gap; **all three of those exclusions are now void** — see D7/D8/D9/D10. What remains
out of scope:

1. ~~**F3**~~ — **now IN scope** (commit 5, D7, AC-19..AC-22).
2. ~~**F4**~~ — **now IN scope** (commit 7, D8/D9, AC-23..AC-26).
3. **SUPER_ADMIN run + approve + void payroll** via `OVERRIDE_FINALIZED`. Still out. It is
   single-role reachable **and** a capability-table question, and item 6 below forbids touching the
   capability table. `rbac.ts:69-71` already records it. (The payroll **verify→approve** gap that
   used to be filed alongside it is **now IN scope** as F5 — commit 4, AC-27.)
3b. **Clearance-then-finalize in `separation.ts`** (§8c sweep). Out: no second-person control was
   ever declared for clearance, so there is nothing to collapse. Recommended as its own design
   question.
4. **Custom / tenant-defined roles or an editable permission matrix.** Ruled out by the issue itself.
5. **Any change to the hire form or `HIRE_ROLES`** (D3). Still one role, still the reduced 3-role
   list. Do not touch `src/lib/rbac.ts:172`.
6. **Any change to the capability table** — which capability each role holds is unchanged.
7. **The `MANAGE_USER_ROLES` sole-holder problem** (D5). Acknowledged, not addressed.
8. **A database check constraint forbidding an empty role array** (D4). Application-layer only.
9. ~~**Editing `src/lib/server/services/requests/documents.ts`.**~~ **SUPERSEDED by D11 — do not
   honour this item.** It was written before VALIDATE found B-5, and honouring it reproduces the
   one-click bypass with AC-19 green. Commit 5 **does** edit that file: one line in the clear branch
   of `setRequestDocumentVerified` (keep `verifiedById`, null only `verifiedAt`) plus the comment at
   `:14-16`. What remains out of scope is narrower: changing `setRequestDocumentVerified`'s
   org-scoping-only contract, changing the `verifyDoc` route gate, and changing the 409 at `:192`
   — see item 16 for why `:192` is now a *known gap* rather than a load-bearing invariant.
10. **Adding an `attempt` column to `RequestDocument`,** or any other schema change. AC-18 holds for
   the widened scope too — that is why F3 is per-request (DECISION-6b).
11. **Any rank, level, seniority or hierarchy concept** anywhere in the F3 carve-out. D7 is
   `canAny(actorRoles, 'ADMINISTER_SYSTEM')` and nothing else. `rbac-no-rank-helpers.test.ts` must
   stay green.
12. **An HR-steps-in fallback for an undecidable posting** (D9). The remap route is the answer.
13. **Deleting, weakening, or loosening `route-guard-multirole.test.ts`** (SPEC R3). Its fixture
   strings are refreshed to keep mirroring the tree and its stale header claim is corrected; its
   patterns and assertions are untouched. If widening the picker trips the scan, that is a signal to
   inspect the flagged line, **not** to loosen the regex.
14. **Removing `User.roles` in favour of a scalar** (D6). Dead branch.
15. **A picker component or library** for the multi-select. Native `<select multiple>` only.
16. **Closing the un-verify → delete → re-upload path** (VALIDATE pass 2, C-P2). D11 keeps
    `verifiedById` through an un-verify, but the delete lock at `documents.ts:192` keys on
    `verifiedAt` — so once cleared, the 409 no longer fires and the row **can** be deleted, taking
    `verifiedById` with it. Re-upload and the F3 bar is gone. **Two-party, not one-click:**
    `deleteRequestDocument` requires `request.employeeId === employeeId` (`documents.ts:184-186`),
    so only the request *owner* can delete, and the owner cannot decide their own request — it
    needs the requester's cooperation. Same collusion class D11 already accepts, different path.
    **Accepted as a KNOWN GAP, named here rather than left implicit.** The upgrade that closes both
    this and D11's overwrite ceiling is the same one: a `RequestDocumentVerification` history table.

    **Consequence for EXECUTE:** commit 5's F3 predicate comment must NOT claim the artefact is
    immutable. The draft wording — *"`deleteRequestDocument` refuses with 409 … so on attempt 2 it
    is byte-for-byte the file this actor signed"* — is **false** once the sign-off is cleared.
    Rewrite it to say the document is stable *while the sign-off stands*, and point at this item.
    Shipping the original text is the exact comment-goes-stale failure D11 exists to prevent.

---

## Verification Evidence (12)

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check` (FIRST — CI skips everything after it on failure) | Fully-Automated | precondition for all |
| `pnpm lint` | Fully-Automated | precondition for all |
| `pnpm check` (note: excludes `prisma/**`, `scripts/**`) | Fully-Automated | Public-contract signature changes compile at every call site |
| `pnpm test tests/unit/user-admin-self-guard.test.ts` | Fully-Automated | AC-1, AC-4a, AC-5, AC-6, AC-7, AC-8 |
| `pnpm test tests/unit/api-v1-user-roles.test.ts` (new) | Fully-Automated | AC-2, AC-4b |
| `pnpm test tests/unit/approval-self-guard.test.ts` | Fully-Automated | AC-9, AC-10, AC-11, AC-12, AC-19, AC-20 |
| `pnpm test tests/unit/approvals.test.ts` | Fully-Automated | DECISION-2 timesheet mirror; F1 signature regression; AC-22, AC-27 |
| `pnpm test tests/unit/rbac-no-rank-helpers.test.ts` | Fully-Automated | D7 introduced no rank concept |
| `pnpm test tests/unit/proposal-queue.test.ts` | Fully-Automated | AC-15, AC-21 |
| `pnpm test tests/unit/recruitment-posting-sod.test.ts` (new) | Fully-Automated | AC-23, AC-25, AC-26 |
| `pnpm test tests/unit/posting-approval.test.ts` (existing — **one case rewritten, B-1**) | Fully-Automated | AC-23, AC-24 |
| `pnpm test tests/unit/approval-queues.test.ts` (new — **B-3**; the badge/queue mirror, previously untested repo-wide) | Fully-Automated | AC-15, AC-21, AC-27 (count half), DEC-2 |
| `pnpm test tests/unit/requests-documents.test.ts` (new — first test file for `documents.ts`) | Fully-Automated | AC-28 (D11 half) |
| `pnpm test tests/unit/payroll-statutory-proposal.test.ts` | Fully-Automated | AC-13, AC-14, Q2 |
| `pnpm test tests/unit/route-guard-multirole.test.ts` | Fully-Automated | AC-16 |
| `pnpm test:e2e tests/e2e/settings-roles.spec.ts` (new) | Fully-Automated | AC-3 |
| `pnpm test:e2e tests/e2e/multi-role-sod.spec.ts` (new) | Fully-Automated | AC-17 |
| Manual M-1 — `pnpm db:seed` + psql read of multi-role rows | Hybrid (running DB required) | AC-18, SPEC R2 (seed not typechecked) |
| Manual M-2 / M-3 — form + curl with psql read-back | Hybrid | AC-1..AC-4, AC-7, AC-8, US-2, US-5 |
| Manual M-4 / M-5 — live SoD with psql step read-back | Hybrid | AC-9, AC-12, AC-13, AC-14, AC-15, US-6, US-7, US-8 |
| Manual M-7 — F3 live, incl. the CEO carve-out and the audit read-back | Hybrid | AC-19, AC-20, AC-21, AC-22 |
| Manual M-8 — F4 live with a mapped **and** an unmapped department, incl. walking the D9 hatch | Hybrid | AC-23, AC-24, AC-25, AC-26, R-J, R-K |
| Manual M-9 — F5 live payroll verify→approve with psql step read-back, plus the D12 keyboard check | Hybrid | AC-27, AC-29 |
| `pnpm test:e2e tests/e2e/multi-role-sod.spec.ts › a barred verifier sees a disabled sign-off control with a reason` | Fully-Automated (E2E) — the only tier that can assert rendered `aria-disabled` + tab-reachability + resolved `aria-describedby` | AC-29 (UI half) |
| CI populated-DB push gate (#236 / PR #284) | Hybrid | AC-18 |
| Mutation checks in §8 (one per guard) | Agent-Probe (EXECUTE performs each mutation, confirms red, reverts) | that every guard test fails for the right reason |

---

## Test Infra Improvement Notes (13)

- No test file existed for the v1 API twin before this change — `tests/unit/api-v1-user-roles.test.ts`
  is the first. Consider whether other `/api/v1/*` handlers deserve the same (out of scope here).
- `tests/e2e` has no roles/settings spec today; `settings-visibility.spec.ts` and `admin.spec.ts`
  should be read during commit 6 to avoid duplicating an existing fixture.
- `tests/unit/proposal-queue.test.ts:257` is the **only** multi-role fixture in the whole tree
  before this change. After this PR there will be many; a shared multi-role fixture helper may be
  worth extracting at UPDATE-PROCESS (not now — single-use).
- SPEC R3's open question — does `route-guard-multirole.test.ts` still earn its keep once
  behavioural multi-role tests exist? — should be revisited at UPDATE-PROCESS, not decided here.
- **No test file covers `recruitment.ts` at all** before this change; `recruitment-posting-sod.test.ts`
  is the first. The rest of that service (offers, interviews, applicant conversion) stays untested —
  worth a backlog note at UPDATE-PROCESS, out of scope here.
- **No E2E covers job postings or posting approvers.** F4 is proved by unit tests + manual M-8. If
  the D8 behaviour change causes friction in staging, an E2E for the mapped/unmapped split is the
  first thing to add.
- **The badge/queue mirror had ZERO tests before this PR** (VALIDATE B-3): nothing covered
  `countPendingApprovals`, `listPendingRequestsForApprover`, `countActionableTimesheets` or
  `countActionablePayrollRuns`, even though the payroll counter has carried a maker-vs-signer guard
  since #134. `approval-queues.test.ts` is the first. Worth noting at UPDATE-PROCESS: an
  architectural argument ("the mirror is structural") went unchallenged for four releases because
  nothing tested the mirror.
- **`documents.ts` had no test file** before this PR; `requests-documents.test.ts` is the first, and
  it exists only because D11 changed a write there. The rest of that service (upload validation,
  magic-byte checks, the mid-batch rollback path) stays untested — backlog note at UPDATE-PROCESS.
- **There is no disabled-with-reason pattern in this codebase** — zero `aria-disabled` uses, no
  shared button component, `aria-describedby` only via the form-field helper in
  `requests/+page.svelte`. D12 introduces the first one, deliberately as markup rather than a
  component. If a second surface needs it (see R-P), extract it then, not now.
- After this PR, `StageSoD` has three fields constructed at **nine** call sites. If a ninth appears,
  extract a `sodFor(request, ctx)` builder rather than hand-constructing again — not now
  (single-shape, and the compile error is the point).

---

## Resume and Execution Handoff (14)

1. **Selected plan file:** `process/general-plans/active/multi-role-activation-283_11-08-26/multi-role-activation-283_PLAN_11-08-26.md` (this file)
2. **Last completed phase/step:** PLAN complete. No branch cut, no code written.
3. **Validate-contract status:** pending — §15 is a placeholder for vc-validate-agent.
4. **Supporting context loaded:** `process/general-plans/active/multi-role-activation-283_11-08-26/multi-role-activation-283_SPEC_11-08-26.md`
   (the contract), `CLAUDE.md`, and direct reads of `org.ts`, `approvals.ts`, `statutory-rates.ts`,
   `action-proposals.ts`, `routing.ts`, `auth.ts`, `hooks.server.ts`, the roles route + component,
   the v1 twin, and `route-guard-multirole.test.ts`. `process/context/` is deliberately empty in
   this repo — do not run vc-setup and do not block on the bootstrap guard.
5. **Next step for a fresh agent:** **re-VALIDATE** this plan. The first VALIDATE returned
   **BLOCKED** (5 FAILs / 8 concerns); its findings are preserved verbatim in `## Validate Contract`
   below, with a `### PLAN response` subsection mapping each blocker to where it was fixed. The
   §16 SPEC edits **have been applied** — the SPEC now carries AC-1..AC-27, D7–D10, diagram D and
   R6/R7; AC-28 and AC-29 (added after VALIDATE) still need copying into it. After VALIDATE, EXECUTE starts by cutting
   `feat/multi-role-activation-283` off updated local `staging` (`git switch -c`, never
   `checkout -b origin/staging`) and begins at commit 1 (§7). Re-read every file:line in §2 before
   editing — the line numbers are accurate as of `9a5df08` but the SPEC's own experience is that
   line numbers drift. One issue, one PR, **nine** commits; do not fragment across PRs. Never add a
   `Co-Authored-By` trailer.
6. **Scope-widening note:** this plan was extended on 11-08-26 to absorb F3, F4 and F5. Everything
   from the original F1/F2 plan is preserved unchanged except **DECISION-3, which is rewritten**
   (payroll moved from out-of-scope to in-scope) and **§11 items 1–3**, whose exclusions are void.

---

## 15. Phase Completion Rules

This is a single-phase plan (one PR), so "phase" = commit. A commit is **CODE DONE** when its files
are written and `pnpm format:check && pnpm lint && pnpm check && pnpm test` are green at that
commit. A commit is **VERIFIED** only when its rows in §12 Verification Evidence have been executed
and recorded — including the §8 mutation check for every guard it introduces. Commit 8 additionally
requires the §9 manual script (M-1..M-9) to have been run live. The PR is **DONE** only when all
**nine** commits are VERIFIED and **all 29** acceptance criteria (the SPEC's AC-1..AC-18 plus
AC-19..AC-29) each have a green proving gate. AC-28 and AC-29 were added after VALIDATE returned
BLOCKED; **AC-29 is the only criterion requiring an E2E run**, so `pnpm test:e2e` (with its
`pnpm db:seed:e2e` precondition) is now part of DONE, not optional.
Code-only completion is CODE DONE, never VERIFIED.

## 16. SPEC Edits Required (list only — the SPEC file is NOT edited by this plan)

The SPEC at `process/general-plans/active/multi-role-activation-283_11-08-26/multi-role-activation-283_SPEC_11-08-26.md` predates the scope
widening and now **contradicts** this plan in five places. Apply these before VALIDATE.

**Contradictions that must be fixed (the SPEC is currently wrong):**

| # | SPEC location | Says now | Must say |
|---|---|---|---|
| S-1 | §Out Of Scope item 1 (line ~327) | "F3 — verifying a request document then deciding that request … filed separately" | **Delete the item.** F3 is in scope (D7). |
| S-2 | §Out Of Scope item 2 (line ~329) | "F4 — approving a job posting you submitted … not fixed here" | **Delete the item.** F4 is in scope (D8/D9). |
| S-3 | §Out Of Scope item 3 (line ~331) | "The SUPER_ADMIN run + approve + void payroll case" | **Narrow it:** keep only the `OVERRIDE_FINALIZED` run+approve+void case; state explicitly that the payroll **verify→approve** collapse is now IN scope as F5. |
| S-4 | §Constraints D2 (line ~353) | "the separation-of-duties work is **F1 and F2 only** … F3, F4 and the SUPER_ADMIN payroll case are pre-existing single-role debt and are filed separately" | **Rewrite:** the work is F1, F2, F3, F4 and F5. **Add D7, D8, D9, D10 verbatim from §1 of the plan.** The "reachable today with a single role" test no longer excludes anything. |
| S-5 | §Background last bullet (line ~487) | "Scope decision F3/F4/SUPER_ADMIN-payroll: all three are reachable today with a single role, which is the test that puts them outside this issue" | **Rewrite:** that test is retired. Single-role reachability is no longer an exclusion; the issue's scope is now "every same-actor separation-of-duties hole", and only the `OVERRIDE_FINALIZED` capability-table case remains out. |

**Additions:**

| # | SPEC location | Add |
|---|---|---|
| S-6 | §Summary (after line ~22) | Two sentences: whoever signs off a supporting document may not decide that request (except a system administrator, who may — and is audited for it); and whoever submits a job posting may not approve it, with departmental approver mappings now binding. |
| S-7 | §What The User Wants → "Separation of duties at decision time" (after line ~112) | Four bullets: (a) whoever marked a supporting document verified cannot decide that request, at any stage, on any attempt; (b) a system administrator is the deliberate exception and the audit trail records when that exception was used; (c) whoever submitted a job posting cannot decide it, and a department with a designated approver is decidable only by that approver; (d) whoever verified a payroll run cannot approve it. |
| S-8 | §Acceptance Criteria (after AC-18) | **AC-19..AC-27 verbatim from §8a of this plan.** |
| S-9 | §Flow / State Diagram | A fourth block **D. Job posting approval**, showing submit → (mapped department? designated approver only : any HR admin) → refuse-if-submitter → OPEN / back-to-DRAFT, and naming the undecidable state plus the remap escape hatch. |
| S-10 | §Non-Functional / Risk | **R6** — binding the posting mapping removes approval reach from `MANAGE_HR` holders in mapped departments (plan R-J). **R7** — the F3 carve-out is a privileged path controlled by audit, not by a bar (plan R-L). |

**Pre-existing SPEC inaccuracies worth fixing in the same pass (not caused by this widening):**

| # | SPEC location | Issue |
|---|---|---|
| S-11 | AC-2, AC-4 (lines ~214, ~229) | Name the new test file `tests/unit/api-v1-user-role.test.ts` (singular). The plan creates **`api-v1-user-roles.test.ts`** (plural), matching the renamed endpoint. Align the SPEC to the plural. |
| S-12 | AC-1, AC-4..AC-8 scenario names | All read `user-admin-self-guard.test.ts › setUserRole › …`. Commit 1 renames the describe block to **`setUserRoles`**. Align the SPEC's scenario names. |

---

## Validate Contract

Status: BLOCKED
Date: 11-08-26
date: 2026-08-11
generated-by: outer-pvl

Method note: this was a **sequential single-context validation**, not a parallel two-layer fan-out
— no Agent tool was available. Every claim below was checked by reading the tree at `9a5df08`
and by querying the live dev database. Depth over shape.

Parallel strategy: sequential
Rationale: 1 signal available (S2/S6/S7 all present, but no Agent tool) — fan-out was executed
in one context. Dimension and section verdicts below are real, individually evidenced checks.

### Net gate derivation

| Layer 1 dimension | Status |
|---|---|
| Infra fit | CONCERN |
| Test coverage | **FAIL** |
| Breaking changes | **FAIL** |
| Security surface | **FAIL** |

| Layer 2 section | Status |
|---|---|
| Commit 1 — `setUserRoles` | PASS |
| Commit 2 — multi-select picker | PASS |
| Commit 3 — v1 `/roles` rename | PASS |
| Commit 4 — F1 + F5 (`canActOnStage` / `canActOnPayrollStage`) | **FAIL** |
| Commit 5 — F3 document verifier | **FAIL** |
| Commit 6 — F2 statutory rates | PASS |
| Commit 7 — F4 job postings | **FAIL** |
| Commit 8 — E2E + seed | CONCERN |
| Commit 9 — docs | PASS |
| §9 Manual verification script | CONCERN |

**Totals: 5 FAILs / 3 CONCERNs (section) + 6 CONCERN-class findings**

**→ Net Gate: BLOCKED**

Not vacuously green: the developed behaviour with the weakest proof is named explicitly in
B-3/B-4/C-3 below rather than papered over.

---

### V1 — Complete verified `canActOnStage` / `canActOnPayrollStage` caller census

Counted by hand against `9a5df08`. This supersedes RC-1, RC-2 and the Public Contracts row.

**`canActOnStage` — production call sites: SIX (plan prose says "5"; the commit-4 table lists
all six, so the table is right and the prose is wrong).**

| # | Site | Context |
|---|---|---|
| 1 | `src/lib/server/services/approvals.ts:73` | inside `canActOnPayrollStage` (delegation) |
| 2 | `src/lib/server/services/approvals.ts:125` | `decide()` |
| 3 | `src/lib/server/services/approvals.ts:223` | `listPendingRequestsForApprover` |
| 4 | `src/lib/server/services/approvals.ts:344` | `countActionableTimesheets` (**not exported**) |
| 5 | `src/lib/server/services/timesheets.ts:362` | `reviewTimesheet` |
| 6 | `src/routes/(app)/requests/timesheets/+page.server.ts:50` | pending-timesheet list filter |

**`canActOnStage` — test call sites: FOURTEEN, all in `tests/unit/approvals.test.ts`** (plan
RC-1 says 15): lines `17, 20, 25, 27, 32, 34, 40, 41, 42, 49, 50, 51, 76, 77`. No other test
file calls it. `tests/unit/approval-self-guard.test.ts` mentions it only in prose comments
(`:7`, `:78`) — zero calls.

**`canActOnPayrollStage` — production call sites: THREE (plan says "2 call sites").**

| # | Site | Context | In plan? |
|---|---|---|---|
| 1 | `src/lib/server/services/approvals.ts:319` | `countActionablePayrollRuns` (**not exported**) | yes |
| 2 | `src/lib/server/services/approvals.ts:439` | `decidePayrollRun` | yes |
| 3 | `src/routes/(app)/payroll/[id]/+page.server.ts:64` | computes `canAct` → renders the Verify/Approve control | **NO — see B-2** |

**`canActOnPayrollStage` — test call sites: FOUR** (`approvals.test.ts:60, 64, 69, 71`) —
matches RC-1.

**Corrected totals: 6 + 3 = 9 production call sites, 18 test calls (plan says 19).**

Indirect/transitive callers verified as inheriting the guard with no signature change of their
own: `src/lib/server/services/leave.ts:104` → `decide()`; `src/routes/(app)/requests/approvals/+page.server.ts:116,166`
→ `decide()`; `src/routes/api/v1/leave/[id]/+server.ts` → `approveLeave` → `decide()`;
`src/routes/api/v1/payroll/[id]/+server.ts:48` → `decidePayrollRun`;
`src/routes/api/v1/timesheets/[id]/+server.ts` → `reviewTimesheet`.
`pnpm check` **does** typecheck `tests/**/*.ts` (verified in `.svelte-kit/tsconfig.json`
`include`), so DECISION-4 reason 3's compile-enforcement claim over test call sites holds.

---

### Findings

#### BLOCKERS — EXECUTE would produce broken or insecure code

| # | Finding | Evidence | Required correction |
|---|---|---|---|
| **B-1** | **The tree is NOT green at commit 7.** `tests/unit/posting-approval.test.ts:25` is `it('lets HR override even when another approver is mapped')`, asserting `canApprovePosting('emp_senior','emp_hr',['HR_ADMIN']) === true`. D8 deletes `recruitment.ts:122`, making it `false`. That test goes red the moment commit 7 lands. It passes today (baseline: 101 files / 1226 tests green). | `tests/unit/posting-approval.test.ts:25-27`; baseline `pnpm test` run 11-08-26 | Add `tests/unit/posting-approval.test.ts` to commit 7's file list. Rewrite `:25` as the inverse assertion (it becomes AC-23's proof — the file already has the exact fixture shape). Also fix §13's claim "**No test file covers `recruitment.ts` at all**" — false. |
| **B-2** | **A third production caller of `canActOnPayrollStage` is missing from the plan:** `src/routes/(app)/payroll/[id]/+page.server.ts:64`, which computes `canAct` and gates the Verify/Approve control. The plan's Public Contracts row says "internal, 2 call sites". TypeScript will catch it, but the plan gives EXECUTE no instruction — and the cheapest way to make it compile is the sentinel, which would leave the payroll detail page **offering an Approve button the service then 403s**: exactly the UI/service divergence AC-15 exists to prevent. AC-27 does not cover this surface. | `src/routes/(app)/payroll/[id]/+page.server.ts:55-66` | Add the site to Touchpoints and to commit 4's call-site table with the real `sod` (its `run.approvalSteps` already carries `actorId` — it computes `makeActorId` from them at `:59-61`). Extend AC-27 to assert the page's `canAct` is false for the verifier. |
| **B-3** | **AC-15 and AC-21 — the entire badge/queue mirror, which is DECISION-4's reason 2 and the stated payoff of putting the guard in `canActOnStage` — are assigned to the wrong file and have no home.** `tests/unit/proposal-queue.test.ts` tests the **#224 action-proposals page** (`?/confirm`, `?/reject`, `?/revealAmount`). It does not import the approvals service and has no `actionable counts` describe block. Verified: **no test anywhere in `tests/` references `countPendingApprovals`, `listPendingRequestsForApprover`, `countActionableTimesheets` or `countActionablePayrollRuns`.** | `tests/unit/proposal-queue.test.ts:115-390`; repo-wide grep returns NONE | Name a real home and budget the harness. `countPendingApprovals` is the only exported entry point — an AC-15/AC-21 test must mock `$lib/server/db` and drive it, or the ACs must be honestly downgraded to Known-Gap with a backlog stub. Do not leave them pointing at `proposal-queue.test.ts`. |
| **B-4** | **AC-27's second clause and the DEC-2 mutation row name direct tests for functions that are not exported.** `countActionablePayrollRuns` (`approvals.ts:289`) and `countActionableTimesheets` (`approvals.ts:324`) are module-private. `approvals.test.ts › countActionablePayrollRuns › excludes it` and `approvals.test.ts › countActionableTimesheets › excludes a timesheet the viewer already decided` **cannot be written as specified.** | `grep '^export' src/lib/server/services/approvals.ts` — both absent | Either export both (a production change the plan does not currently list) or route both tests through `countPendingApprovals`. R-C's whole mitigation story ("the DEC-2 mutation-check row covers the `actorId` select omission") depends on this test being writable. |
| **B-5** | **F3 is bypassable in one click by the actor it bars, with no `ADMINISTER_SYSTEM` and no audit marker.** The `verifyDoc` action accepts `verified=false` and writes `verifiedById: null` — for **any** holder of `APPROVE_REQUESTS` (7 of 9 roles), on **any** document, not only their own. So the barred actor clears their own sign-off, `verifiedDocActorIds` no longer contains them, and they decide the request. `usedDocVerifierCarveOut` returns false, so `selfVerifiedEvidence` is **not** stamped — the R-L audit control, which the plan states is the only control on this path, never fires. This also partly falsifies DECISION-6b: `deleteRequestDocument` 409s on `doc.verifiedAt`, so once cleared the artefact **can** be deleted and swapped. | `src/routes/(app)/requests/[id]/+page.server.ts:144-170` (`actions.verifyDoc`, audited via the export — the only gate is `canAny(user.roles,'APPROVE_REQUESTS')`); `src/lib/server/services/requests/documents.ts:158-163`; `documents.ts:192` | User decision required. Options: **(A)** key F3 on audit history instead of current state — `AuditLog` already stores `entityType:'RequestDocument'`, `newValue:{requestId, verified}` and the actor, so the prior `verified:true` is queryable without a schema change; **(B)** bar an actor from clearing a verification they made once the request has advanced; **(C)** accept as a named Known-Gap with the bypass written into R-L and the SPEC. Do not ship commit 5 while the plan implies the bar holds. |

#### CONCERNS — worth knowing, not disqualifying

| # | Finding | Evidence |
|---|---|---|
| **C-1** | **Half the §9 manual SQL cannot run.** M-1, M-2, M-4 and M-5 query `"User"`, `"AuditLog"`, `"Request"`, `"ApprovalStep"`, `"StatutoryRateProposal"`. Every model is `@@map`'d to snake_case. Verified live: `ERROR: relation "User" does not exist`. M-7/M-8/M-9 already use snake_case, so the script is internally inconsistent. | `prisma/schema.prisma` `@@map` list (`users`, `audit_logs`, `requests`, `approval_steps`, `statutory_rate_proposals`); live psql run 11-08-26 |
| **C-2** | **The seed edit is specified in the wrong function and proved with the wrong command.** The "existing verifier" the plan sits the two-hat account next to is inside `seedE2E` (`prisma/seed-core.ts:680`, `:691`), not `seedProd` (`:331`). `pnpm db:seed` runs `prisma/seed.ts` → `seedProd` only, so M-1's "expect exactly the one seeded VERIFIER+APPROVER account" returns zero rows. The E2E specs (AC-3, AC-17) need `pnpm db:seed:e2e`, which M-6 never runs. | `prisma/seed.ts:2,9`; `prisma/seed-e2e.ts:2,9`; `prisma/seed-core.ts:331,672,680,691`; `package.json` scripts |
| **C-3** | **AC-9, AC-11, AC-12, AC-19 and AC-20 are proven only at the pure-function level.** All five name `approval-self-guard.test.ts › canActOnStage › …`. A pure-function test proves the predicate, not the wiring: the guard can be fully live inside `canActOnStage` and dead at every call site (wrong `attempt`, `decidedActorIds` fed the wrong array, `actorId: true` missing from a select) and all five stay green. That silent-failure mode is exactly R-B, R-C and R-M — and no test covers it. AC-9's own text ("the request stays at APPROVE pending") is a service-level claim its named pure-function test cannot assert. | plan §8b rows AC-9/11/12/19/20; `tests/unit/approvals.test.ts:1-10` has no db mock |
| **C-4** | **Commit 5 breaks three existing tests via mock shape.** `approval-self-guard.test.ts:54-65`'s `pendingRequest` fixture has no `documents` key. Once `decide()` gains the `documents` include, `req.documents.map(...)` throws `TypeError: Cannot read properties of undefined`. All three `decide` cases go red. The plan lists the file in commit 5 but never names this requirement. (Commit 4 is safe: `s.actorId` on that fixture is `undefined`, and `undefined != null` is false, so `decidedActorIds` just returns `[]`.) | `tests/unit/approval-self-guard.test.ts:63`; plan commit-5 file list |
| **C-5** | **AC-22 is assigned to a file that cannot host it.** `tests/unit/approvals.test.ts` is a pure-function file — no `vi.mock`, and it does not import `decide` or `decidePayrollRun`. AC-22 (`› decide › records selfVerifiedEvidence`) and AC-27 (`› decidePayrollRun ›`) need the db-mock harness that already exists in `approval-self-guard.test.ts`. | `tests/unit/approvals.test.ts:1-10` |
| **C-6** | **Two stale instructions in commit 4's call-site table.** (a) `routes/(app)/requests/timesheets/+page.server.ts` — "add `actorId` to its select": there is no select, the query uses `approvalSteps: true` (full row), so `actorId` is already present. (b) The payroll detail page carries its own `makeActorId !== user.id` at `:65-66`; RC-10's subsumption argument applies to it identically, but the plan deletes only `countActionablePayrollRuns`' copy — inconsistent treatment of the same redundancy. | `src/routes/(app)/requests/timesheets/+page.server.ts:40`; `src/routes/(app)/payroll/[id]/+page.server.ts:59-66` |
| **C-7** | **R-J's blast radius is unmeasurable in this database, and commit 9's deliverable will be empty.** Live dev DB: `posting_approvers` = **0 rows**, `departments` = 13, `job_postings` = 1 (status CLOSED, none PENDING_APPROVAL), `request_documents` = 0, `users` = 46 with **0** multi-role rows. So today **nobody** loses posting-approval reach and **no** posting becomes undecidable. M-8 must build both fixtures by hand (the plan already says so), and commit 9 item 4's "paste which existing users lose reach" is an empty list here — it needs a staging/production run to mean anything. | live psql 11-08-26 |
| **C-8** | Count drift: RC-1 says 15 `canActOnStage` test calls (actual 14) and 19 total (actual 18); Public Contracts says 5 production call sites (actual 6 — the commit-4 table is correct). `tests/unit/payroll-approve-api.test.ts` is an unlisted consumer of `decidePayrollRun`; verified it stays green (its `AT_APPROVE_STAGE` fixture carries `actorId` on every step and the acting user is never in `decidedActorIds`). | see V1 census |

#### NOTES

| # | Note |
|---|---|
| N-1 | `route-guard-multirole.test.ts:86,89` — the fixtures sit in the **"leaves the multi-role forms alone"** array (`:75-90`), asserted *not* to be offenders. `setUserRoles(..., parsed.data.roles, ...)` is equally a non-offender, so the test stays green whether or not the string is refreshed. RC-3's "must update" is a fidelity choice, not a compile or test requirement. |
| N-2 | `timesheets.ts:341` — the legacy step-less fallback returns before `canActOnStage` is ever reached, so DECISION-2's guard does not cover step-less timesheets. Pre-existing and harmless (no chain means no second stage to cross), but it means "timesheets are inside the F1 guard" is true only for chained ones. |
| N-3 | RC-9 confirmed by reading the **`actions` export**, not the handler body: `dashboard/+page.server.ts`'s `decidePosting` (`:168`) has no `requireAnyCapability`, unlike its siblings `postAnnouncement` (`:152`) and `giveAward` (`:201`). A designated approver holding only `EMPLOYEE` genuinely reaches it. **D8's binding strands nothing.** |
| N-4 | RC-8 confirmed: the only v1 request-document route is `api/v1/requests/[id]/documents/[docId]/+server.ts`, and it exports **GET only** (file download). There is no v1 `verifyDoc` twin. |
| N-5 | Structural plan validation: `validate-plan-artifact.mjs` → **0 failures**, 2 advisory warnings (no `all-context.md` mention, no testing-context mention) — both explained by `process/context/` being deliberately empty in this repo. Not counted as findings. |

---

### Verified correct — the plan is right about these, stated plainly

- **V2 — the F1 attempt-scoping premise HOLDS.** `resubmitRequest` (`requests/index.ts:153-180`) is genuinely append-only: it computes `nextAttempt = max(attempt) + 1` and `tx.approvalStep.createMany`s three fresh rows; the prior attempt's rows are never touched. `decide()` recomputes `attempt = Math.max(...req.steps.map(s => s.attempt))` (`approvals.ts:118`) and `liveSteps` filters to it. **No actor can decide two stages of one live attempt**, and Q1 is not built on a false premise. Payroll matches: `ensurePayrollApprovalChain` (`:388`) opens a new attempt rather than mutating.
- **V3 — `decidedActorIds` really does include both auto-completed MAKE steps.** Requests: `buildApprovalChain` (`routing.ts:43-48`) returns `decision:'APPROVED', actorId: makerUserId`. Payroll: `ensurePayrollApprovalChain` passes a non-null `makerUserId` (`payroll/index.ts:485` → `ctx.actorId`) and its `createMany` **explicitly maps `actorId: s.actorId ?? null`** (`approvals.ts:404`) — the field survives the write. **F5's near-free claim is correct and the deletion of `&& makeActorId !== userId` from `countActionablePayrollRuns` is safe, not a regression.** `decidePayrollRun`'s `include: { approvalSteps: true }` (`:427`) carries `actorId`, so no query change. `countActionablePayrollRuns`' select already lists `attempt`, `decision`, `actorId` (`:300-309`) — plan correct. And `countActionableTimesheets`' select (`:333`) genuinely **lacks** `actorId` — R-C is a real risk, correctly identified.
- **V4 — both F3 query claims check out.** `decide()`'s `findFirst` includes only `steps` and `employee` (`approvals.ts:99-107`) — the `documents` include is genuinely new. `listPendingRequestsForApprover` already includes `documents: { select: { id: true, verifiedAt: true } }` (`:214`), so adding `verifiedById: true` costs nothing. Null-safety is fine: `verifiedById` is `String?` (`schema.prisma:870`), the plan filters nulls out of the array, and the predicate is additionally guarded by `sod.actorId != null`. Clearing a verification **does** restore the ability to decide — see B-5, which is where that becomes a problem rather than a feature.
- **V5 — DECISION-8's redundancy proof is CORRECT, re-derived independently.** After `:122` is deleted, `canApprovePosting` returns true in exactly two branches: (i) `approver != null && actorEmp === approver` → the clause's `approver != null` is true; (ii) `approver == null && isHr` → the clause's `isHr` is true. Every true branch makes the clause true; every false branch short-circuits it. The clause cannot change the result. `isHr` (`recruitment.ts:194`) is then genuinely orphaned. **The ID-type trap is handled correctly:** `approverId` is an **Employee** id (`posting-approvers.ts:65-68` validates it against `db.employee`), `submittedById` is `ctx.actorId`, a **User** id (`recruitment.ts:80`, confirmed by `notify(jp.submittedById, …)` at `:161`). The new submitter guard compares `jp.submittedById === ctx.actorId` — User to User. `canApprovePosting` compares Employee to Employee. Nothing crosses the families.
- **DECISION-1** — `assertNotLastOfRole` (`org.ts:209-210`) short-circuits on `lost.length === 0` **before** any query, so calling it unconditionally costs zero extra round trips and AC-7 holds by construction. Correct.
- **F2 (commit 6)** — the guard's placement is exact: `confirmProposal` (`statutory-rates.ts:352`) claims via status-guarded `updateMany`, then `findUniqueOrThrow`. Throwing after the claim rolls it back to PENDING with `decidedById` null, which is precisely what AC-14 asserts.
- **Q4** — the audit asymmetry is real as described: `oldValue: { roles: existing.roles }`, `newValue: { role: newRole }` (`org.ts:292-297`).
- **R-I** — the session-freshness analysis is correct; nothing memoises the role array.

---

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1, AC-4a, AC-5..AC-8 | `setUserRoles` set semantics + last-holder guard | Fully-Automated | `pnpm test tests/unit/user-admin-self-guard.test.ts` | A |
| AC-2, AC-4b | v1 `/roles` accepts a set, refuses empty (asserts **args**) | Fully-Automated | `pnpm test tests/unit/api-v1-user-roles.test.ts` (new) | B |
| AC-9..AC-12 | F1 predicate bars a second stage of the live attempt | Fully-Automated | `pnpm test tests/unit/approval-self-guard.test.ts` | B |
| AC-9..AC-12 (wiring) | `decide()` actually passes a correct `sod` | Fully-Automated | **no test named — see C-3** | D |
| AC-13, AC-14, Q2 | F2 proposer cannot confirm; self-reject allowed; clean rollback | Fully-Automated | `pnpm test tests/unit/payroll-statutory-proposal.test.ts` | B |
| AC-15, AC-21 | queues/badges mirror the F1 and F3 bars | Fully-Automated | **named file is wrong — see B-3** | D |
| AC-16 | multi-role static scan stays green | Fully-Automated | `pnpm test tests/unit/route-guard-multirole.test.ts` | A |
| AC-19, AC-20 | F3 predicate + `ADMINISTER_SYSTEM` carve-out | Fully-Automated | `pnpm test tests/unit/approval-self-guard.test.ts` | B |
| AC-19 (bypass) | a barred actor cannot clear their own sign-off and decide | Fully-Automated | **no test — see B-5** | D |
| AC-22 | `selfVerifiedEvidence` present on carve-out, absent otherwise | Fully-Automated | must move to `approval-self-guard.test.ts` — see C-5 | B |
| AC-23, AC-24 | mapped department binds; unmapped falls back to HR | Fully-Automated | `pnpm test tests/unit/posting-approval.test.ts` (existing, **must be updated — B-1**) + `recruitment-posting-sod.test.ts` (new) | B |
| AC-25, AC-26 | submitter barred; message names the remap route; card mirrors | Fully-Automated | `pnpm test tests/unit/recruitment-posting-sod.test.ts` (new) | B |
| AC-27 | payroll verifier cannot approve the run they verified | Fully-Automated | `approval-self-guard.test.ts` (service half) | B |
| AC-27 (count half) | `countActionablePayrollRuns` excludes it | Fully-Automated | **function not exported — see B-4** | D |
| AC-27 (page half) | payroll detail page hides the control | Fully-Automated | **surface not in plan — see B-2** | D |
| DEC-2 | `countActionableTimesheets` excludes an already-decided timesheet | Fully-Automated | **function not exported — see B-4** | D |
| AC-3 | picker prefills the whole set | Hybrid | `pnpm test:e2e tests/e2e/settings-roles.spec.ts` — precondition: dev server on 5173 + `pnpm db:seed:e2e` | B |
| AC-17 | two-hat user verifies then cannot approve | Hybrid | `pnpm test:e2e tests/e2e/multi-role-sod.spec.ts` — same preconditions | B |
| AC-18 | no migration, no backfill | Hybrid | CI populated-DB push gate (#236 / PR #284) + M-1 | A |
| AC-1..AC-27 (live) | end-to-end behaviour against a real DB | Hybrid | §9 M-1..M-9 — precondition: `./start.sh`, `pnpm db:push`, `pnpm db:seed:e2e` (**not** `db:seed` — C-2), **snake_case table names** (C-1) | B |
| all guards | every guard test fails for the right reason | Agent-Probe | EXECUTE performs each §8b mutation, confirms red, reverts | A |
| — | precondition for everything | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test` in that order | A |

gap-resolution legend: A — proven now · B — fixed in this plan · C — deferred to a named later plan · D — backlog test-building stub (named residual)

C-4 reconciliation: `strategy:` carries only the 3 proving strategies. Known-Gap is never a strategy — it is a residual carried via gap-resolution D.

Legacy line form:
- role assignment: Fully-automated: `pnpm test tests/unit/user-admin-self-guard.test.ts`
- v1 API: Fully-automated: `pnpm test tests/unit/api-v1-user-roles.test.ts`
- F1/F3/F5 predicate: Fully-automated: `pnpm test tests/unit/approval-self-guard.test.ts`
- F2: Fully-automated: `pnpm test tests/unit/payroll-statutory-proposal.test.ts`
- F4: Fully-automated: `pnpm test tests/unit/posting-approval.test.ts tests/unit/recruitment-posting-sod.test.ts`
- queue/badge mirror (AC-15, AC-21): known-gap: no test surface exists (B-3)
- private counters (AC-27 count half, DEC-2): known-gap: functions not exported (B-4)
- F3 un-verify bypass: known-gap: unguarded (B-5)
- UI: hybrid: `pnpm test:e2e` + precondition dev server + `pnpm db:seed:e2e`
- live behaviour: hybrid: §9 M-1..M-9 with corrected SQL + seed command

**Failing stubs** (Fully-Automated rows only; TDD red-first starting points for EXECUTE — not files on disk):

```
test("should bar an actor from a second stage of the same attempt", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: bar an actor from a second stage of the same attempt")
})
test("should bar the verifier of a request document from deciding that request", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: bar the verifier of a request document from deciding that request")
})
test("should let an ADMINISTER_SYSTEM holder decide a request whose document they verified", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: let an ADMINISTER_SYSTEM holder decide a request whose document they verified")
})
test("should refuse the proposer of a statutory rate change", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: refuse the proposer of a statutory rate change")
})
test("should make a mapped department decidable only by its designated approver", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: a mapped department is decidable only by its designated approver")
})
test("should refuse the submitter and name the remap route", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: refuse the submitter and name the remap route")
})
test("should refuse a VERIFIER+CEO approving a run they verified", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: a VERIFIER+CEO cannot approve a run they verified")
})
```

---

### Dimension findings

- Infra fit: CONCERN — gate order and the `pnpm check` exclusion of `prisma/**`/`scripts/**` are correctly stated and verified, but the seed edit is specified in `seedProd`'s neighbour while living in `seedE2E`, and it is proved with the wrong command (C-2); half the manual SQL uses PascalCase table names that do not exist (C-1).
- Test coverage: FAIL — the badge/queue mirror ACs point at a file that tests something else (B-3); two ACs name tests for non-exported functions (B-4); an existing test breaks at commit 7 unlisted (B-1); five guard ACs are pure-function-only, so a mis-wired call site leaves them green (C-3).
- Breaking changes: FAIL — a third `canActOnPayrollStage` production caller is unlisted and its obvious sentinel fix creates UI/service divergence (B-2); `posting-approval.test.ts` is an unlisted consumer of a changed contract (B-1).
- Security surface: FAIL — F3's bar is disabled in one click by the actor it targets, with no carve-out and no audit marker, defeating commit 5's stated control (B-5).
- Commit 4 (F1 + F5) feasibility: FAIL — mechanically feasible and the subsumption maths is right, but one caller is missing (B-2) and the counter tests are unwritable (B-4).
- Commit 5 (F3) feasibility: FAIL — query costs are exactly as claimed, but the guard is bypassable (B-5) and the existing mock breaks (C-4).
- Commit 7 (F4) feasibility: FAIL — the redundancy proof and ID-type handling are both correct, but the commit breaks an existing green test that is not in its file list (B-1).

### Open gaps

- AC-15 / AC-21 badge-and-queue mirror: known-gap until B-3 is resolved — no test surface exists for `countPendingApprovals` or `listPendingRequestsForApprover`.
- AC-27 count half and DEC-2: known-gap until B-4 is resolved — target functions are module-private.
- F3 un-verify bypass: known-gap until B-5 is resolved by user decision.
- Call-site wiring for AC-9/11/12/19/20 (C-3): no test proves `decide()` constructs `sod` correctly.
- R-J's real-world impact: unmeasurable in the dev DB (0 `posting_approvers` rows) — needs a staging read before commit 9's PR-body claim means anything.
- Pre-existing, out of scope, unchanged by this review: `OVERRIDE_FINALIZED` run+approve+void; clearance-then-finalize in `separation.ts`; DB-level empty-role-set constraint.

### What this coverage does NOT prove

- `pnpm test` (unit) does not prove any call site passes a correct `sod` — it proves the predicate in isolation. A guard live in `canActOnStage` and dead in `decide()` is green.
- `pnpm test` does not prove the badge or queue actually excludes barred items — nothing exercises those functions at all.
- `pnpm check` does not typecheck `prisma/**` or `scripts/**`; it **does** typecheck `src/**` and `tests/**`.
- `pnpm test:e2e` does not run without a dev server on 5173 and a `pnpm db:seed:e2e` database; it proves nothing about the payroll or posting surfaces (no E2E covers either).
- The §9 manual script does not prove F4's behaviour change against real data — this DB has zero `PostingApprover` rows and no pending postings.
- Mutation checks prove each test fails when its predicate is removed; they do **not** prove the test fails when the *wiring* is removed.
- Nothing here proves the audit trail is read by anyone, which is the only control on both the D7 carve-out (R-L) and the B-5 bypass.

Gate: **BLOCKED** — 5 unresolved FAILs (B-1..B-5). Return to PLAN. Do not route to EXECUTE.
Accepted by: — (no CONDITIONAL acceptance; gate is BLOCKED)

### Pre-EXECUTE corrections the plan must absorb

1. Add `tests/unit/posting-approval.test.ts` to commit 7 and rewrite its `:25` case (B-1); delete §13's false "no test covers `recruitment.ts`" claim.
2. Add `src/routes/(app)/payroll/[id]/+page.server.ts:64` to Touchpoints and commit 4's call-site table with the real `sod`; extend AC-27 to the page (B-2).
3. Re-home AC-15 and AC-21 on `countPendingApprovals` with a db-mock harness, or downgrade them to Known-Gap with a backlog stub (B-3).
4. Export `countActionablePayrollRuns` and `countActionableTimesheets`, or re-home AC-27's count half and the DEC-2 row (B-4).
5. Decide F3's un-verify bypass: audit-history predicate, a clear-lock, or an explicit Known-Gap written into R-L and the SPEC (B-5).
6. Rewrite M-1/M-2/M-4/M-5 SQL to snake_case: `users`, `audit_logs`, `requests`, `approval_steps`, `statutory_rate_proposals` (C-1).
7. Move the two-hat seed account into `seedE2E` and change the proof command to `pnpm db:seed:e2e`; add that command as an E2E precondition in M-6 (C-2).
8. Add `documents: []` to `approval-self-guard.test.ts`'s `pendingRequest` fixture as an explicit commit-5 step (C-4).
9. Move AC-22 (and AC-27's service half) from `approvals.test.ts` to `approval-self-guard.test.ts` (C-5).
10. Drop the no-op "add `actorId` to its select" instruction for `requests/timesheets/+page.server.ts`; decide whether the payroll page's own `makeActorId !== user.id` is deleted too (C-6).
11. Correct the counts: 6 production `canActOnStage` call sites, 14 test calls; 3 production `canActOnPayrollStage` call sites, 4 test calls (C-8).
12. Add a wiring-level test for at least one `sod` construction site, or record C-3 as an accepted residual.

---

## Autonomous Goal Block

```
SESSION GOAL
Issue #283 — activate multi-role assignment (User.roles) and close every same-actor
separation-of-duties hole (F1 request/timesheet chain, F2 statutory rates, F3 request
documents, F4 job postings, F5 payroll verify→approve). One branch
feat/multi-role-activation-283, nine commits, one PR.

STATE
PLAN complete. VALIDATE complete: gate BLOCKED, 5 blockers (B-1..B-5) and 8 concerns
recorded in the plan's ## Validate Contract. No branch cut, no code written.

NEXT PHASE
PLAN — absorb the 12 numbered pre-EXECUTE corrections in the validate contract. B-5 needs
a user decision (F3 un-verify bypass: audit-history predicate / clear-lock / accepted
known-gap). Re-run VALIDATE from V1 afterwards. EXECUTE is not authorised while BLOCKED.

CONTRACT SUMMARY
Gate BLOCKED. Verified correct: F1 attempt-scoping (RETURN is append-only), F5 subsumption
(both MAKE steps carry actorId), F3 query costs, F4 redundancy proof and User-vs-Employee
id handling, DECISION-1, F2 placement. Broken: commit 7 reds an existing test; a third
canActOnPayrollStage caller is unlisted; AC-15/AC-21 point at the wrong test file; two ACs
name tests for non-exported functions; F3 is bypassable in one click.

AUTONOMY RULES
Work only inside the blast radius listed in the plan's Touchpoints section. Do not
re-litigate D1-D10 or Q1-Q4 — they are settled user decisions. Never add a Co-Authored-By
trailer. Use pnpm, not npm. Gate order is non-negotiable:
pnpm format:check && pnpm lint && pnpm check && pnpm test

HARD STOPS
- Do not cut the branch or write code while the gate is BLOCKED.
- Do not resolve B-5 without an explicit user decision.
- Do not push, open a PR, or run any destructive DB command without explicit approval.
- Do not weaken route-guard-multirole.test.ts or rbac-no-rank-helpers.test.ts.

EXECUTE START COMMAND (only after VALIDATE re-runs and gates PASS/CONDITIONAL)
git switch staging && git pull && git switch -c feat/multi-role-activation-283

Reference for latest state:
process/general-plans/active/multi-role-activation-283_11-08-26/multi-role-activation-283_PLAN_11-08-26.md
```

---

### PLAN response (appended 11-08-26 — VALIDATE's findings above are unmodified)

Status: **all 5 FAILs resolved in the plan; re-VALIDATE requested.** Commit count unchanged at nine;
ordering unchanged. Two acceptance criteria added (AC-28, AC-29) — the set is now AC-1..AC-29. Two
new user decisions absorbed: **D11** (from B-5) and **D12** (the UI question B-2 raised).

| Blocker | Resolution | Where |
|---|---|---|
| **B-1** — commit 7 reds `posting-approval.test.ts:25`, which is green today | `it('lets HR override even when another approver is mapped')` is **rewritten in commit 7** (not deleted — the branch still exists, only its answer flips) to `does not let HR override…` expecting `false`. The file's header comment at `:5-6` is corrected in the same hunk. All **four** sibling cases were individually re-checked against the new predicate and survive unchanged — table included. | commit 7(d); §7 green-at-every-commit audit row 7 |
| **B-2** — third `canActOnPayrollStage` caller gates the sign-off **button** | It receives the **real** SoD data. A permissive sentinel would ship a live button on a guaranteed 403. `makeActorId` and its clause are deleted there as orphaned by RC-10. **D12** then specifies what the barred state renders as. | commit 4 edit 4; D12; VC-2; AC-29; R-O |
| **B-3** — AC-15/AC-21 pointed at a file that cannot prove them; the badge mirror was untested repo-wide | New **`tests/unit/approval-queues.test.ts`**, created in commit 4, with six named cases each asserting contents or counts (never "did not throw") and each carrying its mutation. AC-15, AC-21, DEC-2 and AC-27's count half all re-pointed at it. | §8b new-file spec; the four re-pointed table rows |
| **B-4** — two ACs named tests for module-private functions | `countActionablePayrollRuns` and `countActionableTimesheets` are **exported** in commit 4 with a one-line rationale (guard-bearing ⇒ must be directly testable). This restores R-C's mitigation. | commit 4 edit 5; Public Contracts; VC-5 |
| **B-5** — F3 bypassable via `verified=false` | **D11**: the clear branch keeps `verifiedById` and nulls only `verifiedAt`; the F3 predicate keys on `verifiedById`. Schema comment (`schema.prisma:854-856`) and service comment (`documents.ts:14-16`) updated in the same commit. Known ceiling marked with a `ponytail:` comment naming the verification-history upgrade. **AC-28** added with its mutation. | commit 5; D11; AC-28; R-N; M-7 step 4 |

Non-blocking corrections also absorbed: caller counts (9 production / 18 test — VC-1); every §9 SQL
statement rewritten against the real snake_case tables with a lookup table (VC-7); the two-hat seed
moved into `seedE2E` with `pnpm db:seed:e2e` as the proof command and an E2E precondition (VC-8);
R-J restated as unmeasurable locally with a staging caveat, and M-7/M-8 fixtures now specified as
hand-built (VC-9). VALIDATE's confirmed-correct list (F1 attempt scoping, F5 subsumption, DECISION-8,
the User/Employee id trap, `pnpm check` covering `tests/**`) was left untouched (VC-10).

**One thing VALIDATE did not ask about, surfaced by absorbing D12:** D12 says a barred actor's
control must be disabled-with-reason rather than absent, but **three of the four named surfaces are
queues**, where absence is required by AC-15 / AC-21 / AC-26 / US-8 — the criteria this same PR
adds. D12 is therefore implemented in full on `payroll/[id]` (the only detail page with a decision
control), as a reason line on `requests/[id]`, and **not** on the queues. Timesheets and the
dashboard posting card have no detail page and so get no explanation surface at all — recorded as
R-P and a known gap with a backlog stub, not silently absorbed. **This is the one point in the
revision that needs the user's confirmation.**

---

## Validate Contract — Pass 2

Status: CONDITIONAL
Date: 11-08-26
date: 2026-08-11
generated-by: outer-pvl
supersedes: 11-08-26 (outer-pvl, pass 1) — pass 1's contract and the PLAN response above are
retained unmodified; this is a third layer that checks the revision only.

Method note: sequential single-context validation (no Agent tool). Scope was the diff, not the
whole plan: the five blocker resolutions, the new D11/D12/AC-28/AC-29 work, the non-blocking
corrections, and the green-at-every-commit audit. Everything below was checked by reading the tree
at `8def86f` (docs-only; `src/` is identical to `9a5df08`).

**→ Net Gate: CONDITIONAL.** All five blocker resolutions HOLD. No FAIL. Four corrections must be
applied to the plan text before EXECUTE (P1–P4 below); P1 and P2 are not optional.

### Blocker resolutions

| # | Verdict | Evidence |
|---|---|---|
| **B-1** | **HOLDS** | `tests/unit/posting-approval.test.ts` has exactly five cases (`:11, :15, :19, :23, :27`) and the plan's table at §commit 7(d) maps all five correctly. Re-derived independently against the new predicate (`§7 commit 7(a)`): `:11` true (first branch), `:15` false, `:19` true (surviving return), `:23` flips to false — rewritten, not deleted, `:27` false. Four genuinely survive. Header comment is at `:5-6` as stated and its correction is named in the same hunk. **No second file asserts the behaviour:** repo-wide, `canApprovePosting` is referenced only by `src/lib/server/services/recruitment.ts:114` and this test file (`:2, :7, :12, :16, :20, :24, :28`); `tests/e2e/recruitment.spec.ts` does not touch it. Cosmetic: the plan cites `:25`; the `it(` is at `:23`, the `expect` at `:24`. |
| **B-2** | **HOLDS** | `makeActorId` at `payroll/[id]/+page.server.ts:59-61` is read at exactly one other place, `:65` (`&& makeActorId !== user.id`). Deleting that clause orphans it completely. The `load` return (`:70-79`) exposes `run, liveStage, canAct, canManage, scopedToTeam, payslipVisible` — no `makeActorId`; `+page.svelte` reads only `data.canAct` (`:365`) and mentions it nowhere else. The page receives real SoD data, so no permissive sentinel ships. |
| **B-3** | **HOLDS** (with C-P3 below) | The six cases at §8b are each reachable against the real signatures: `listPendingRequestsForApprover` (`approvals.ts:205-224`, filter is a real `.filter`), `countPendingApprovals` (`:242-286`), `countActionableTimesheets` (`:324-352`), `countActionablePayrollRuns` (`:289-322`). Every case asserts contents or a number; none is "did not throw". The stated mutations really do turn each red: dropping `verifiedById` from the documents select empties `verifiedDocActorIds` → the AC-21 case's request is returned → red; dropping `actorId: true` from the timesheet select → `decidedActorIds` empty → DEC-2 red; sentinel from `listPendingRequestsForApprover` → AC-15 red. |
| **B-4** | **HOLDS** | Repo-wide grep over `src/` + `tests/`: `countActionableTimesheets` and `countActionablePayrollRuns` occur only at `approvals.ts:269, :271, :289, :324`. No other module declares or exports either name, and no `export *` barrel re-exports `approvals.ts` — exporting them creates no collision anywhere in the import graph. The one-line rationale is present at §commit 7 edit 5. |
| **B-5** | **HOLDS for the one-click bypass; one same-shape residual survives — see C-P2** | (a) Every reader keys on `verifiedAt`: `approvals.ts:215`, `documents.ts:192`, `requests/[id]/+page.svelte:230, 233, 240, 244, 250, 256, 260`, `requests/approvals/+page.svelte:163-164`. The only other consumer of `verifiedById` is the `verifiedBy` relation (`schema.prisma:872`), which `getRequest` includes (`requests/index.ts:145`) and the page renders **inside** `{#if doc.verifiedAt}` at `:230` — so a surviving `verifiedById` never produces a stale "verified by X" line. Nothing breaks when `verifiedById` outlives `verifiedAt`. (b) `approvals.ts:215`'s select gains `verifiedById` and keeps `verifiedAt` (§commit 5 call-site table) ✓. (c) both comments named — real lines are `schema.prisma:857` and `documents.ts:16` (plan says `:854-856` / `:14-16`; targets are right, line numbers off by 1–3). (d) the `ponytail:` comment names the different-actor collusion path and the `RequestDocumentVerification` history upgrade ✓. (e) second-bypass hunt below. |

### Second-bypass hunt (B-5's adversarial half)

| Path | Result |
|---|---|
| v1 API surface | **None.** The only writer of `verifiedById` is `documents.ts:161-162`, with exactly one caller: `actions.verifyDoc` at `requests/[id]/+page.server.ts:145-169` (checked via the `actions` export at `:94`, not handler bodies). No v1 twin. |
| Request re-submission | **Safe.** `resubmitRequest` (`requests/index.ts:154-180`) reads `steps` only and writes a fresh attempt; it never touches `RequestDocument`. |
| A new document replacing an old one | **Safe.** Uploads create new rows; the old row's `verifiedById` survives, so the bar survives. |
| **Document deletion** | **Residual survives — C-P2.** `deleteRequestDocument` locks on `doc.verifiedAt` (`documents.ts:192`). Under D11 an un-verify sets `verifiedAt = null` and keeps `verifiedById`, so the 409 no longer fires and the row **can** be deleted — taking `verifiedById` with it. Re-upload, and `verifiedDocActorIds` no longer names the barred actor. **Two-party, not one-click:** `deleteDoc` passes `myEmployeeId(user.id)` (`+page.server.ts:123-131`) and `deleteRequestDocument` requires `request.employeeId === employeeId` (`documents.ts:184-186`), so only the request OWNER can delete, and the owner cannot decide their own request. It therefore needs the requester's cooperation — the same collusion class D11 already accepts, but a *different* path, and it is not named anywhere in the plan. |

### New findings

| # | Finding | Class | Evidence |
|---|---|---|---|
| **C-P1** | **§11 Non-Goal item 9 still forbids the D11 fix.** `§11:9` reads "Editing `src/lib/server/services/requests/documents.ts`" as an explicit non-goal and asserts "the 409 at `:192` stays exactly as it is (DECISION-6b depends on it)" — under a section headed *"EXECUTE must not drift into these"*. Commit 5 edits that exact file, which is the whole B-5 fix. An EXECUTE agent honouring §11 reproduces the bypass. | **CONCERN (high) — must fix** | plan §11 item 9 vs §commit 5 ("`documents.ts` IS edited after all") and D11 |
| **C-P2** | **Commit 5 will ship a security comment asserting an invariant D11 makes false.** The F3 predicate comment says: *"deleteRequestDocument refuses with 409 to remove a VERIFIED document, so on attempt 2 it is byte-for-byte the file this actor signed."* Once the sign-off is cleared, `verifiedAt` is null and the 409 does not fire — the artefact **can** be swapped (see the hunt table). This is exactly the failure mode D11 cites as its reason for correcting the other two comments. R-N's residual list and the known-gaps table name only the different-actor-overwrite ceiling; the un-verify→delete→re-upload path is unnamed. | **CONCERN (high) — must fix** | §commit 5 F3 comment; `documents.ts:184-192`; R-N; §8b known-gaps table |
| **C-P3** | **The named db-mock harness does not exist.** §8b (`approval-queues.test.ts` spec) and §commit 7 both say *"read `tests/unit/approvals.test.ts` first and reuse its `vi.mock('$lib/server/db')` shape"*. `approvals.test.ts:1-10` is a pure-function file with **no** `vi.mock` at all. The real harnesses are `approval-self-guard.test.ts:18-31` and `proposal-queue.test.ts:41-43`. Compounding it, §8b rows AC-22, AC-27 and the F5-message row still site db-mock cases *inside* `approvals.test.ts`, which cannot host them (this is pass-1 C-5, still unabsorbed). Separately, the `countPendingApprovals` case needs `employee.findUnique`, `request.findMany`, `timesheet.findMany`, `payrollRun.findMany` **and** whatever `listActionableProposals` queries — a heavier harness than the one sentence implies. | CONCERN | `tests/unit/approvals.test.ts:1-10`; `approval-self-guard.test.ts:18-31`; `proposal-queue.test.ts:41-43`; `approvals.ts:242-286` |
| **C-P4** | **The tree is not green at commit 4 as written.** §commit 4 edit 4's payroll snippet passes `{ actorId, decidedActorIds, verifiedDocActorIds: [] }`, but `StageSoD` does not gain `verifiedDocActorIds` until commit 5. An object literal passed to a `StageSoD` parameter triggers TypeScript's excess-property check → `TS2353` → `pnpm check` red **at commit 4**. Same class as B-1, one field wide. | CONCERN | §commit 4 edit 4 snippet vs the `StageSoD` interface in §commit 4 and its 3-field version in §commit 5 |
| **C-P5** | **D12's payroll reason text is wrong for one of the two actors it will fire on.** After the F5 change, `canActOnPayrollStage` bars anyone in `decidedActorIds`, which per RC-10 **includes the MAKE actor**. So a payroll maker opening `/payroll/[id]` gets `canAct: false` and, under the D12 table's single string, is told *"You recorded the verify decision on this run"* — which they did not. D12 requires the UI text to be byte-identical to the service refusal, and the service keeps **two** messages here (commit 4 edit 2 deliberately preserves "You cannot sign off a payroll run you prepared" above the generic bar). `actBlockedReason` needs the same two-branch split. | CONCERN | D12 reason table row F5; §commit 4 edit 2; `approvals.ts:443-446`; RC-10 |
| **C-P6** | Pass-1 **C-4 is still unabsorbed and breaks commit 5.** `approval-self-guard.test.ts`'s `pendingRequest` fixture (`:54-65`) has no `documents` key. Once `decide()` gains the `documents` include, `req.documents.map(...)` throws `TypeError` and the `decide` cases go red. The plan lists the file in commit 5 but the "fixture shape only" note is attached to `approvals.test.ts`, not to this mock. No `documents: []` instruction exists anywhere in the plan. | CONCERN | `tests/unit/approval-self-guard.test.ts:54-65`; §commit 5 file list |
| **N-P1** | R-D still proves the seed with `pnpm db:seed` and says "revert commit 6's seed hunk" — VC-8 moved it to `seedE2E` / `pnpm db:seed:e2e`, and the seed now rides commit **8**. | NOTE | R-D vs VC-8, §commit 8 |
| **N-P2** | R-F's recovery SQL still reads `update "User" set roles = …` — the VC-7 snake_case rewrite reached every §9 statement but not this one, and R-F's text says to paste it into the PR body, where it would error with `relation "User" does not exist`. | NOTE | R-F vs VC-7 |
| **N-P3** | Stale commit numbers after the renumber: RC-5 says the two E2E specs are "new files in commit 6", and Touchpoints says the seed account is "see commit 6". Both are commit **8**. | NOTE | RC-5; §Touchpoints (seeds) |
| **N-P4** | Touchpoints is stale in four places: `approvals.test.ts` "(19 calls)" (VC-1 corrected it to 14 + 4 = 18); `posting-approval.test.ts` missing from *Changed — tests*; `approval-queues.test.ts` and `requests-documents.test.ts` missing from *New*; `documents.ts` still listed under *Read, not changed* with "the file itself is not edited". Public Contracts also still calls `countActionableTimesheets` "private to module" one row below the row that exports it. | NOTE | §Touchpoints; §Public Contracts |
| **N-P5** | Commit 4's file list still includes `tests/unit/proposal-queue.test.ts`. AC-15 moved to `approval-queues.test.ts`, and `proposal-queue.test.ts` does not import the approvals service — the entry is now a no-op. | NOTE | §commit 4 file list; `tests/unit/proposal-queue.test.ts` |
| **N-P6** | Pass-1 **C-6(a) unabsorbed:** commit 4's call-site table still says "add `actorId` to its select" for `requests/timesheets/+page.server.ts:50`. That query uses `approvalSteps: true` (`:39`) — no select exists, `actorId` is already present. Harmless but misleading. | NOTE | `src/routes/(app)/requests/timesheets/+page.server.ts:31-42` |

### Verified correct in the revision — stated plainly

- **D12's three codebase claims all check out.** `grep -rn aria-disabled src` → **0 hits**. `aria-describedby` appears only via the `describedBy()` helper in `requests/+page.svelte:43` (11 uses, all that file). `src/lib/components/ui/` has 13 entries and none is a button-with-reason — the nearest, `ConfirmButton.svelte`, is a confirm-dialog trigger whose `disabled?: boolean` prop maps to native `disabled` with no reason surface, so it cannot carry D12's focusable + `aria-describedby` pattern. A minimal new markup pattern is the right call.
- **D12's queue-scoping justification is factually right.** `listPendingRequestsForApprover` genuinely filters (`approvals.ts:220-224`) and `countPendingApprovals` derives the badge from `requests.length` (`:281`). Annotating instead of filtering would put barred items into that same length and break the AC-15/US-8 badge claim unless list and count are split — a larger change. Both cannot be satisfied without that split. The scoping is not re-litigated here.
- **`requests/[id]` genuinely has no decision control.** Verified via the `actions` export at `+page.server.ts:94`: `uploadDocs` (`:97`), `deleteDoc` (`:121`), `verifyDoc` (`:145`). Nothing else. And the D12 reason line needs **no query change** — `getRequest` (`requests/index.ts:134-148`) already includes full `steps` rows (no select → `attempt`, `decision`, `actorId` all present) and full `documents` rows (including `verifiedById`).
- **AC-29's E2E half is real.** `tests/e2e/multi-role-sod.spec.ts` does not exist (new file, commit 8), and `pnpm test:e2e` with its `pnpm db:seed:e2e` precondition is stated as part of DONE at §15 and in M-6.
- **Non-blocking corrections absorbed:** VC-1's caller census (6 + 3 production / 14 + 4 test) now agrees between prose, RC-1/RC-2 and the Public Contracts rows; every §9 SQL statement uses the real snake_case tables; the two-hat seed is inside `seedE2E` (`seed-core.ts:672/:680`) with `pnpm db:seed:e2e` as its proof; R-J is stated as unmeasurable locally with hand-built M-7/M-8 fixtures. (Residual stale copies are N-P1..N-P4.)

### Green-at-every-commit re-audit

| Commit | Verdict |
|---|---|
| 1, 2, 3 | green — reasoning holds |
| **4** | **`pnpm check` RED as written** — C-P4 (`verifiedDocActorIds` in a 2-field `StageSoD`) |
| **5** | **`pnpm test` RED as written** — C-P6 (`approval-self-guard.test.ts`'s `pendingRequest` has no `documents` key) |
| 6 | green |
| 7 | green — B-1's rewrite is in-commit and correct |
| 8, 9 | green |

Both are one-line plan-text fixes, both are loud (compile error / thrown TypeError), neither changes a design decision.

### Pre-EXECUTE corrections still outstanding

| # | Correction | Optional? |
|---|---|---|
| **P1** | Rewrite §11 non-goal item 9: `documents.ts` **is** edited (D11, one line + comments); what stays out of scope is changing `setRequestDocumentVerified`'s org-scoping-only contract and the `verifyDoc` gate. (C-P1) | **No** |
| **P2** | Fix commit 5's F3 comment — the 409 no longer guarantees an immutable artefact once a sign-off is cleared — and add the un-verify→owner-delete→re-upload path to R-N's residual list and the §8b known-gaps table. If instead the path is to be closed, that is a user decision (keying the delete lock on `verifiedById` also blocks the legitimate un-verify-then-replace-a-wrong-file flow). (C-P2) | **No** |
| **P3** | Drop `verifiedDocActorIds: []` from the commit-4 payroll snippet; it arrives with commit 5 alongside every other construction site. (C-P4) | No |
| **P4** | Repoint the db-mock harness reference from `approvals.test.ts` to `approval-self-guard.test.ts` (both occurrences), and move AC-22 / AC-27's service half / the F5-message row out of `approvals.test.ts` into it. Add "give `approval-self-guard.test.ts`'s `pendingRequest` fixture a `documents: []` key" as an explicit commit-5 step. (C-P3, C-P6) | No |
| P5 | Split `actBlockedReason` on the payroll page into maker vs verifier branches, matching the two service messages. (C-P5) | Recommended |
| P6 | Housekeeping: N-P1..N-P6. | Recommended |

Gate: **CONDITIONAL** — 0 FAILs, 6 CONCERNs, 6 NOTEs. All five B-1..B-5 resolutions hold. Proceed to
EXECUTE once P1–P4 are applied to the plan text; P2 additionally records an accepted residual rather
than closing it, which is a continuation of D11's own posture and needs no new user decision unless
the user prefers to close the path.
Accepted by: — (pending user acceptance of the CONDITIONAL gate; P1 and P2 are the conditions)

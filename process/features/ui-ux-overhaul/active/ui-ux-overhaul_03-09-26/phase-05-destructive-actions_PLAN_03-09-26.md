---
name: plan:ui-ux-overhaul-phase-05-destructive-actions
description: "Phase 5 of the Veent HRIS UI/UX overhaul — route every irreversible, money-affecting or person-affecting action through ConfirmButton/ConfirmDialog with a consequence-naming message, and delete the last two native confirm() calls. Consumes phase 04's rebuilt ConfirmButton and phase 03's Dialog base."
date: 03-09-26
feature: ui-ux-overhaul
phase: "05"
---

# Phase 5 — `destructive-actions`

**TL;DR** — One rule, sixteen call sites: anything irreversible, money-affecting or person-affecting
gets a confirm dialog whose message names the consequence. Fourteen sites are new wrapping, two are
verify-only. Two native `confirm()` calls die. The only non-presentational change is a client-side
`min="0"` and a delta readout on the net-pay override input. No server behavior changes at all.
Depends hard on phase 04 (rebuilt `ConfirmButton`) and phase 03 (Dialog base) — running this before
them produces sixteen silent-on-success dialogs and a second sweep.

**Date**: 03-09-26
**Status**: PLANNED — PVL pending. No code changed.
**Complexity**: COMPLEX (phase of an 8-phase program; 9 files, 16 call sites, 2 nested-dialog cases, a navigation guard)
**Feature**: ui-ux-overhaul
**Phase**: 5 of 8 — `destructive-actions`

---

## Overview

Audit §T3 found destructive-action protection **inverted**: the kit `ConfirmButton` guards inventory
row deletes and holiday deletes, while offboarding a person, voiding a payroll period, rewriting a
net pay, saving DOLE multipliers, applying org-wide statutory tax tables, disclosing an evaluator's
private review, and disabling a login all fire on one bare click. Two surfaces still use the native
browser `confirm()`.

This phase applies one rule across sixteen call sites and changes nothing else. It is a
presentation-only phase: nine `.svelte` files, no server file, no schema, no capability, no service.
It runs fifth because it consumes phase 04's rebuilt `ConfirmButton` (which waits for the action
result and reports it) and phase 03's Dialog base (focus trap, Escape, focus restore) — routing an
action into those primitives is then one touch per site instead of two.

---

## Re-Sequencing Note (read first)

This phase was originally numbered 4 and has been **re-sequenced to run after `feedback-contract`**.
The umbrella plan on disk reflects the swap:

| Position | Slug | Was |
|---|---|---|
| Phase 4 | `feedback-contract` | Phase 5 |
| Phase 5 | `destructive-actions` (this plan) | Phase 4 |

**Why the swap matters to this plan.** `ConfirmButton` is silent-on-success by construction — the
dialog closes before the request resolves, with no busy state and no completion signal
(audit addendum §E, `ConfirmButton.svelte:38-53`). If this phase ran first, every one of the sixteen
sites below would be routed into a primitive that gives no "done" signal, and phase 04 would then
have to re-open all sixteen files. Running it second means each site is **one touch, not two**: the
moment an action is routed into `ConfirmButton`, it inherits the result-waiting behavior phase 04
already built.

---

## Goal

Retire audit §T3 in full. Today protection tracks the page author, not the stakes: inventory row
deletes get the kit `ConfirmButton` while offboarding a person, voiding a payroll period, rewriting
someone's net pay, saving DOLE multipliers, applying org-wide statutory tax tables, disclosing an
evaluator's private entries, and locking a person out of the system all fire on one bare click.

**The one rule:** anything irreversible, money-affecting, or person-affecting goes through
`ConfirmButton`/`ConfirmDialog` with a **consequence-naming** message.

**The model to copy** is already in the repo — `payroll/+page.svelte:207-216`, the run void:

> "The run is marked VOIDED and any amortization it collected is credited back. This cannot be
> undone, and the same exact period cannot be created again."

That message names what changes, what moves, and what cannot be recovered. Every message drafted
below follows that shape.

## Non-Goals

- **Not** fixing `ConfirmButton`'s silent-on-success defect — that is phase 04's job and is done
  before this phase starts.
- **Not** building any new component. Phase 03 owns `src/lib/components/ui/`; this phase is a
  consumer only.
- **Not** changing any server action, service, zod schema, or capability check. The one exception
  is a client-side input attribute (see Site 5) and it is not a server change.
- **Not** adding confirms to actions the audit did not name (period `?/lock`, `?/generate`,
  attendance `lock`/`unlock`, clearance toggles). See "Deliberately Not Confirmed" below.
- **Not** touching the four low-stakes sites that already have the kit confirm correctly.

---

## Dependencies

### Consumed from Phase 03 (`design-system`)

| Artifact | What this phase relies on |
|---|---|
| Shared **Dialog base** (focus trap, Escape, focus restore) | `ConfirmDialog` is rebuilt onto it in phase 03. Sixteen dialogs appearing on this phase's surfaces must trap focus — including the two that open **inside an already-open context** (statutory-rates tab panel, payroll `[id]` expanded row). Nested-modal Escape handling is phase 03's contract. |
| Promoted **blocked-approver pattern** (audit §5 item 5) | Where a destructive control must be visible-but-refused rather than `disabled`, this phase uses the kit standard rather than inventing one. Applies to the statutory Confirm/Reject pair when the viewer lacks the capability. |

### Consumed from Phase 04 (`feedback-contract`)

| Artifact | What this phase relies on |
|---|---|
| **Rebuilt `ConfirmButton`** — waits for the action result, holds a busy state, reports success | This is the load-bearing dependency. Every site routed here inherits its "done" signal for free. Without it, this phase ships sixteen actions that confirm before and say nothing after — which is exactly the P0-6/P0-8 defect phase 01 was created to kill. |
| `submitFeedback` util on `createSubmitGuard` | Used by the four sites that keep their own `<form>` and drive a bare `ConfirmDialog` (offboard, net-pay override, statutory editor, statutory submit) — they cannot use `ConfirmButton` (see "Two Wiring Shapes") and so must reach the feedback contract directly. |
| `{ action, error?, saved? }` action-return contract | Per-site success/error reporting on all sixteen sites assumes actions already return this shape. Phase 04 standardizes it; this phase does not re-shape a single action. |

### If this phase runs before 03 or 04 — it must not

| Run before | Consequence |
|---|---|
| Phase 03 | Sixteen dialogs land on the un-trapped `ConfirmDialog`. The two nested cases (statutory, payroll row) will double-close on Escape or steal focus from their parent. Phase 03 then rebuilds the primitive underneath sixteen live call sites — a re-verification of every one. |
| Phase 04 | Every routed action confirms-before and is **silent-after**. This is a visible regression against phase 01's P0-6 and P0-8 fixes (offboard and period void/release were made to report success there). Shipping this phase first would re-break two things phase 01 explicitly fixed. |

**Hard entry gate:** do not begin execution until the phase 03 and phase 04 reports are both written
and their `Validate Contract` sections record a green gate set. Confirm `ConfirmButton.svelte` on
disk waits for the result before starting site 1.

---

## Research-Refresh Findings (staleness check against the audit)

The audit is dated 03-09-26 and phases 01-04 will have moved lines. These were checked against the
tree at `5e5cdfe` while writing this plan. Re-run the check at execution time.

| Audit claim | Status at plan time | Consequence for this plan |
|---|---|---|
| Net-pay override "negative values allowed, no `min`" | **PARTLY STALE.** The server schema is already `netPay: z.coerce.number().finite().min(0)` (`payroll/[id]/+page.server.ts:110`). The gap is **client-side only** — the `<input type="number" step="any">` has no `min`. | Site 5 is a one-attribute client fix. **No server change.** The audit's implication of a server validation hole is wrong; do not "fix" the server. |
| Statutory editor Confirm has "none" | **STALE.** A `ConfirmDialog` already exists for the `canManage` save path (`statutory-rates:560-566`). | Site 9 is *upgrading* an existing dialog's message (touched-services summary), not adding one. The **`Submit for CEO approval` path (`:549`) genuinely has no confirm** — that is the real gap. |
| Statutory Confirm "no double-submit guard" | **CONFIRMED.** `?/confirmProposal` and `?/rejectProposal` use bare `use:enhance` with no guard (`:210, :218`). | Site 7/8 add `createSubmitGuard` per proposal id, matching the #108 pattern used everywhere else. |
| Period void has "None"; run void has full ConfirmButton | **CONFIRMED.** `periods/+page.svelte:196-206` bare; `payroll/+page.svelte:207` has the kit confirm. | Sites 2/3 are new; site 4 is verify-only. |
| Two native `confirm()` remain | **CONFIRMED.** `attendance/+page.svelte:19`, `separations/[id]/+page.svelte:29,41`. Note `ReasonDialog.svelte:48` defines a *local function named* `confirm` — it is not a native call and must not be counted or changed. | Site 13-15. The source-scan gate must exclude a bare `function confirm()` declaration. |

### Phase 01 scope check (explicitly resolved)

The task hand-off asked whether phase 01 already added `ConfirmButton` for period void/release. **It
did not.** Per the umbrella, phase 01 consumes addendum §B P0-4..P0-8, and P0-8 reads: period void
and release are "irreversible money actions with no confirm before (**already T3**) and no message
after". Phase 01 fixed **only the message after**. The confirm is unclaimed and belongs here.

- Offboard: phase 01 added the success message (P0-6). **This phase owns the confirm side.** Same split.
- Period void + release: phase 01 added the success message (P0-8). **This phase owns the confirm side.**

---

## Two Wiring Shapes (decide per site before writing code)

`ConfirmButton` renders **its own `<form>`** and accepts hidden inputs through its `children`
snippet. That works only when the action carries nothing but fixed hidden values. Several sites here
have **user-typed inputs inside the form** — those cannot be moved into `ConfirmButton` without
relocating the fields, which would be a redesign, not a wrap.

**Shape A — `ConfirmButton` (preferred).** Use when the form's entire payload is hidden inputs.
Replace the `<form>` + `<button>` pair with `<ConfirmButton>` carrying the hidden inputs as children.
Sites: 2, 3, 7, 8, 11, 12, 13, 14, 15.

**Shape B — bare `ConfirmDialog` on the existing form.** Use when the form contains fields the user
fills. Keep the `<form bind:this={formEl}>` exactly as it is, change the submit button to
`type="button"` with `onclick={() => (open = true)}`, and add a `<ConfirmDialog bind:open
onconfirm={() => formEl?.requestSubmit()} />`. This is the pattern **already proven in this repo** at
`statutory-rates:535-566` — copy it, do not invent a variant. Sites: 1, 5, 6, 9.

**Shape B and the submit guard.** Shape B sites keep their existing `createSubmitGuard` on
`use:enhance`. The guard's `busy` still gates the trigger button. Do **not** move the guard into the
dialog.

**The separations exception.** Sites 13 and 14 currently compose the confirm *inside*
`createSubmitGuard((input) => { if (!confirm(...)) input.cancel() })` — a synchronous cancel. A
dialog cannot cancel synchronously. Convert these to Shape A: `ConfirmButton` fires the submit only
after the user confirms, so the cancel path is "never submitted" rather than "submitted then
cancelled". The existing guard comments (#108, #304) explain why `busy` is released on cancel — that
reasoning no longer applies once the submit is gated by the dialog, so **rewrite the comment to say
the dialog gates the submit**; do not delete the issue references.

---

## Site Enumeration

Sixteen sites. Fourteen change, two are verify-only. Every message below is the **final copy** — do
not paraphrase at execution time.

### Site 1 — Offboard employee

- **File:** `src/routes/(app)/employees/[id]/+page.svelte` (~1783-1809 at audit time; the offboard
  `<form action="?/offboard">` inside the `canManage && employmentStatus === 'ACTIVE'` block)
- **Stakes:** disables a person's employment record and their login.
- **Current friction:** none.
- **Shape:** **B** — the form contains a required `endDate` input the user fills.
- **Wiring:** keep `use:enhance={offboard.enhance}`; add `bind:this={offboardFormEl}`; submit button
  becomes `type="button"` with `onclick={() => (offboardConfirm = true)}`; keep
  `disabled={offboard.busy}` and the `Offboarding…` label.
- **Message:**
  - **title:** `Offboard this employee?`
  - **message:** `{firstName} {lastName} is marked OFFBOARDED as of the last day you entered, their login is disabled, and they stop appearing in active-employee lists and payroll runs. Reversing this needs a Super Admin.`
  - **confirmText:** `Offboard`
- **Copy note:** the employee's name is interpolated because this page shows many people's data in
  one scroll and "this employee" is ambiguous mid-page.

### Site 2 — Payroll period void

- **File:** `src/routes/(app)/payroll/periods/+page.svelte` (the `data.canVoid && p.status !== 'VOIDED'` block, ~196-206)
- **Stakes:** un-undoable; credits back amortization.
- **Shape:** **A** — payload is one hidden `id`.
- **Wiring:** `<ConfirmButton action="?/void" triggerLabel="Void" triggerClass="btn-row-danger">`
  with `<input type="hidden" name="id" value={p.id} />` as children. The per-row
  `guard(`${p.id}:void`)` is superseded by `ConfirmButton`'s own busy state (phase 04) — remove the
  now-unused `voidG` `{@const}` and keep a comment naming #108 so the reason survives.
- **Message:**
  - **title:** `Void this payroll period?`
  - **message:** `The period is marked VOIDED and any loan or cash-advance amortization it collected is credited back to the employees. This cannot be undone, and the same date range cannot be used again.`
  - **confirmText:** `Void period`

### Site 3 — Payroll period release

- **File:** `src/routes/(app)/payroll/periods/+page.svelte` (the `p.status === 'LOCKED'` block, ~183-192)
- **Stakes:** irreversible; makes pay figures visible to employees.
- **Shape:** **A**.
- **Wiring:** same as site 2, `action="?/release"`, `triggerClass="btn-row-positive"`.
- **Message:**
  - **title:** `Release this period to employees?`
  - **message:** `Every payslip in this period becomes visible to the employee it belongs to. Releasing cannot be undone — the only way back is to void the period.`
  - **confirmText:** `Release`
- **Copy note:** release is *positive* in tone but irreversible in effect. The message states the
  disclosure first and the irreversibility second, matching the run-void model.

### Site 4 — Payroll **run** void — VERIFY ONLY

- **File:** `src/routes/(app)/payroll/+page.svelte:207-216`
- **Status:** already correct. This is the model message the whole phase copies.
- **Action:** do **not** edit. Verify it still renders and that phase 04's `ConfirmButton` rebuild
  did not change its props. If phase 04 changed a prop name, this site is the canary — fix it here
  and check every other `ConfirmButton` call site in the repo (12 files, listed in Blast Radius).

### Site 5 — Net-pay override

- **File:** `src/routes/(app)/payroll/[id]/+page.svelte` (the `overrideEntryId === entry.id` row, ~259-290)
- **Stakes:** rewrites a person's pay.
- **Shape:** **B** — the form has `netPay` and a required `note`.
- **Three changes here, in order:**
  1. **`min="0"` on the input.** Add `min="0"` to `<input name="netPay" type="number" step="any">`.
     This is the audit's named validation gap. **The server is already `.min(0)`** — this only makes
     the browser refuse before the round-trip and matches the server. Do not touch the zod schema.
  2. **Delta readout.** Beside the input, render the difference between the entered value and the
     value on screen when the panel opened:
     `{delta === 0 ? 'No change' : `${delta > 0 ? '+' : '−'}${peso(Math.abs(delta))} vs ${peso(baseline)}`}`
     where `baseline` is captured once from `Number(entry.netPay)` at panel open (`$state`, not
     `$derived`, so a re-render after save does not move the baseline).
     **Known limitation, accept it:** `PayrollEntry.netPay` is overwritten in place — there is no
     stored "originally computed" net pay. The delta is therefore **against the value currently
     shown**, not against a first computation. Recovering the original would need a schema or
     service change, both out of bounds for this program. The label says `vs {peso(baseline)}`
     rather than "vs computed" so the copy does not claim more than it knows.
  3. **Confirm.** Threshold: the dialog fires **whenever `delta !== 0`**. A save with no change goes
     straight through — there is nothing to warn about.
     *(Rejected alternative: a percentage threshold, e.g. only confirm past ±20%. Rejected because
     any hand-edit of a person's pay is the thing the audit calls out, and a "small" override is
     still an override with a required reason. A percentage threshold also needs a magic number the
     audit does not supply.)*
- **Message** (delta interpolated):
  - **title:** `Override this net pay?`
  - **message:** `{employeeName}'s net pay for this run changes from {peso(baseline)} to {peso(entered)} — a difference of {signedPeso(delta)}. The figure you type is what gets paid and what prints on the payslip; the computed amount is replaced, not adjusted. Your reason is written to the audit log.`
  - **confirmText:** `Override net pay`

### Site 6 — DOLE multiplier save

- **File:** `src/routes/(app)/payroll/config/+page.svelte` (the `?/updateRates` form, ~118-160)
- **Stakes:** rewrites OT/holiday/rest-day pay for every future run.
- **Shape:** **B** — the form is a grid of six multiplier number inputs.
- **Scope fence:** this is the **`?/updateRates`** form only. The sibling `?/update` form (~51-113,
  pay frequency and general config) is not in §T3 and is not touched.
- **Wiring:** `bind:this` on the `updateRates` form, trigger button to `type="button"`, add the dialog.
- **Was→now summary.** Capture the six live values at page load into a `baselineRates` snapshot
  (`$state`, set once). On open, build a changed-rows list; render it in the dialog message. Only
  changed rows appear. If nothing changed, submit without the dialog.
  Row format: `Overtime: 1.25 → 1.30`
- **Message:**
  - **title:** `Save premium pay multipliers?`
  - **message:** `These multipliers set overtime, night differential, rest-day and holiday pay for every payroll run from now on. Runs already computed are not recalculated.\n\nChanging:\n{changedRows}`
  - **confirmText:** `Save multipliers`
- **Copy note:** "Runs already computed are not recalculated" is included because the opposite is
  the natural fear and the audit found the config success banner already lies about which form saved
  (§4 Payroll). Do not fix that banner here — it is phase 04's.

### Site 7 — Statutory proposal **Confirm**

- **File:** `src/routes/(app)/payroll/statutory-rates/+page.svelte:210-217`
- **Stakes:** applies org-wide tax tables.
- **Current friction:** none, **and no double-submit guard** — the only mutating form in the repo
  without one (audit §T3, do-not-break item 2).
- **Shape:** **A** — payload is one hidden `proposalId`.
- **Wiring:** `<ConfirmButton action="?/confirmProposal" triggerLabel="Confirm">` with the hidden
  input as children. `ConfirmButton`'s phase-04 busy state supplies the missing #108 guard; add the
  comment `// #108: ConfirmButton's busy state is this form's single-submit guard.` so the next
  reader does not re-add a `createSubmitGuard`.
- **Touched-services summary:** the proposal already carries a `p.changes` string array rendered as
  a `<ul>` above the buttons. Interpolate the same list into the message so the confirm names what
  it applies, not just that it applies something.
- **Message:**
  - **title:** `Apply these statutory rates?`
  - **message:** `These rates become the live tax and contribution tables for the whole organization and feed every payroll run computed from now on. Runs already computed are not recalculated.\n\nApplying:\n{p.changes.join('\n')}`
  - **confirmText:** `Apply rates`

### Site 8 — Statutory proposal **Reject**

- **File:** `src/routes/(app)/payroll/statutory-rates/+page.svelte:218-225`
- **Stakes:** discards someone else's prepared work; the proposer must redo it.
- **Shape:** **A**.
- **Wiring:** as site 7, `action="?/rejectProposal"`, same guard comment.
- **Message:**
  - **title:** `Reject this rate proposal?`
  - **message:** `The proposal is discarded and the live rates stay as they are. Whoever prepared it has to enter the changes again — there is no draft to return to.`
  - **confirmText:** `Reject proposal`

### Site 9 — Statutory editor save / submit-for-approval

- **File:** `src/routes/(app)/payroll/statutory-rates/+page.svelte:535-566`
- **Two paths, one form:**
  - `canManage` → `Save changes` (`type="button"`, **already opens a `ConfirmDialog`**).
  - not `canManage` → `Submit for CEO approval` (`type="submit"`, **no confirm at all**).
- **Change 9a — unify the paths.** Make the submit-for-approval button `type="button"` opening the
  same dialog, with its own title/confirmText via `$derived`. One dialog, two label sets.
- **Change 9b — touched-services summary.** The audit's §4 Payroll finding is the reason this
  matters: *all four services submit together via hidden inputs, so "Save" on the SSS tab silently
  commits forgotten edits in unseen tabs.* Build a `touchedServices` list by diffing each service's
  current `$state` against a `baselineStatutory` snapshot captured once at load, and interpolate it.
  **This is the single highest-value message in the phase** — it is the only place the confirm tells
  the user something the screen does not.
- **Messages:**
  - Manage path — **title:** `Apply statutory rates?`
    **message:** `These become the live tax and contribution tables for the whole organization and feed every payroll run computed from now on. Runs already computed are not recalculated.\n\nYou are changing: {touchedServices.join(', ')}. Edits on tabs you are not looking at are included.`
    **confirmText:** `Apply rates`
  - Approval path — **title:** `Submit these rates for CEO approval?`
    **message:** `A proposal goes to the CEO for approval. Nothing changes for payroll until it is approved.\n\nYou are submitting: {touchedServices.join(', ')}. Edits on tabs you are not looking at are included.`
    **confirmText:** `Submit for approval`
- **Copy note:** the existing message ("These rates feed the payroll tax computation for all future
  runs. Apply them now?") is replaced, not extended. It fails the consequence-naming rule twice: it
  never says the change is org-wide, and it never mentions the unseen tabs.

### Site 10 — Statutory editor unsaved-changes guard

- **File:** `src/routes/(app)/payroll/statutory-rates/+page.svelte` (script block)
- **Stakes:** navigating away silently loses edits across up to four service tabs.
- **Not a confirm-a-destructive-action site** — it is the *inverse*: guarding against destroying the
  user's own work. It is in §T3's blast radius because it shares the file, the baseline snapshot
  (site 9b), and the same "unseen tabs" problem.
- **Port, do not invent.** `performance/templates/[id]/+page.svelte:92-110` already implements
  exactly this shape (dirty tracking + `beforeNavigate` + `beforeunload`) and the audit names it as
  the standard. Copy that implementation.
- **Wiring:**
  - `const isDirty = $derived(touchedServices.length > 0)` — reuses site 9b's diff, no second
    mechanism.
  - `beforeNavigate(nav => { if (isDirty && !nav.willUnload && !confirmedLeave) nav.cancel() })`
    driving a `ConfirmDialog`, matching the templates page.
  - `beforeunload` for the hard-close case (native browser dialog — the browser gives no choice
    here; this is **not** counted as a native `confirm()` by the gate).
  - Clear the dirty flag on a successful save so the guard does not fire after the user just saved.
- **Message:**
  - **title:** `Leave without saving?`
  - **message:** `You have unsaved rate changes on: {touchedServices.join(', ')}. Leaving now discards them.`
  - **confirmText:** `Leave without saving`
  - **cancelText:** `Stay on this page`

### Site 11 — Release review to employee

- **File:** `src/routes/(app)/performance/reviews/[id]/+page.svelte:174-181`
- **Stakes:** irreversibly discloses the evaluator's private entries to the person being evaluated.
- **Shape:** **A** — the form carries no inputs at all.
- **Wiring:** replace the `<form>`/`<button>` with `<ConfirmButton action="?/release">` and no
  children. The existing `release` guard is superseded by `ConfirmButton`'s busy state — remove it
  if it becomes unused, keeping a `// #108` comment.
- **Message:**
  - **title:** `Release this review to the employee?`
  - **message:** `{employeeFirstName} {employeeLastName} will be able to read every rating, comment and recommendation on this evaluation. There is no un-release — once they can see it, they have seen it.`
  - **confirmText:** `Release to employee`
- **Copy note:** name the employee. The evaluator is deciding about a specific person and the page
  header is scrolled off by the time they reach this control.

### Site 12 — Deactivate a login (`settings/roles ?/setActive`)

- **File:** `src/routes/(app)/settings/roles/+page.svelte:219-230`
- **Stakes:** locks a person out of the system.
- **Asymmetric by design:** the same button both activates and deactivates. **Confirm only the
  deactivate direction.** Re-activating a login is neither destructive nor irreversible; putting a
  dialog on it is friction with no consequence to name.
- **Shape:** **A**.
- **Wiring:** branch on `u.isActive`. When `true`, render `<ConfirmButton action="?/setActive">`
  with both hidden inputs as children. When `false`, keep the existing plain form and its
  `setActiveGuard` untouched. Keep the per-row guard for the activate branch — the #108 comment at
  `:21-25` still applies to it and must not be deleted.
- **Message:**
  - **title:** `Deactivate this login?`
  - **message:** `{u.email} is signed out and cannot sign in again until someone re-activates them. Their employee record, payroll history and documents are untouched.`
  - **confirmText:** `Deactivate`
- **Copy note:** the second sentence exists because "deactivate" reads as "delete" to a first-time
  user, and the honest-dead-end-copy standard (do-not-break item 8) says to state what *survives*.

### Site 13 — Separation finalize (native `confirm()` → kit)

- **File:** `src/routes/(app)/separations/[id]/+page.svelte:28-35`
- **Stakes:** snapshots final pay, offboards the employee, disables their login.
- **Shape:** **A**, per "The separations exception" above.
- **Wording rule:** the existing native-confirm string is **already good** — audit §G item 5 names
  this pair as the repo's model citizen for destructive flows ("confirmed before, banner + warning
  after"). **Carry the same wording across; do not rewrite it.** The only change is the delivery
  mechanism.
- **Message:**
  - **title:** `Finalize this separation?`
  - **message:** `This snapshots final pay, offboards the employee, and disables their login. Only a Super Admin can undo it.`
  - **confirmText:** `Finalize`
- **Wiring note:** the `finalize` `createSubmitGuard` loses its cancel-composing inner handler. Keep
  the guard only if the form still needs one after the `ConfirmButton` swap; otherwise remove it and
  rewrite the `#108` comment to read that the dialog now gates the submit.

### Site 14 — Separation undo (native `confirm()` → kit)

- **File:** `src/routes/(app)/separations/[id]/+page.svelte:38-50`
- **Stakes:** restores loan and cash-advance balances, re-enables a login.
- **Shape:** **A**.
- **Conditional clause preserved.** The current string appends a second paragraph when
  `reopenClearance` is checked. Keep that exactly, as a `$derived` message string.
- **Message:**
  - **title:** `Undo this finalization?`
  - **message (base):** `This restores the loan and cash-advance balances, puts the employee back to their previous employment status, and RE-ENABLES their login.`
  - **message (when `reopenClearance`):** base + `\n\nClearance will also be RE-OPENED: the case returns to OPEN and every item goes back to pending.`
  - **confirmText:** `Undo finalization`
- **Wiring note:** `reopenClearance` is a checkbox whose value must reach the server. If it lives
  inside the same form, this site is **Shape B**, not A — check at execution time and use B if so.
  The message must read the checkbox's *live* value, so the message is `$derived`, not a constant.

### Site 15 — Attendance reset (native `confirm()` → kit)

- **File:** `src/routes/(app)/attendance/+page.svelte:17-21` (the `confirmReset` `SubmitFunction`)
- **Stakes:** discards a manual edit and re-derives from punches.
- **Shape:** **A** if the reset form's payload is hidden-only; confirm at execution time.
- **Wiring note:** `confirmReset` also returns `async ({ update }) => update({ reset: false })` —
  the keep-values behavior documented at `:11-14`. **That must survive.** Pass it through
  `ConfirmButton`'s `submit` prop rather than dropping it. Losing it blanks untouched Reg/OT/time
  cells, which is a silent data-looking regression.
- **Message:**
  - **title:** `Discard this manual edit?`
  - **message:** `The hours you corrected for this day are thrown away and re-derived from the raw punches. Anything typed by hand is lost.`
  - **confirmText:** `Discard and re-derive`

### Site 16 — Bulk reject notes flow — VERIFY ONLY, KEEP

- **File:** `src/routes/(app)/requests/approvals/+page.svelte` (`ReasonDialog` at `:409`, bulk
  `?/rejectMany` form at `:223`, popup-collected notes at `:357, :396`)
- **Status:** **keep as-is.** This flow already collects a required reason through `ReasonDialog`
  before submitting — a reason prompt is a stronger gate than a yes/no confirm, and replacing it
  with `ConfirmDialog` would *remove* the notes field.
- **Action:** verify only. Confirm `ReasonDialog` still opens, still requires a note, and still
  submits through the hidden decide form after phase 03's Dialog rebuild. Add no dialog.
- **Gate note:** `ReasonDialog.svelte:48` declares `function confirm()`. The native-confirm source
  scan must not flag it (see Gate G2).

---

## Deliberately Not Confirmed (and why)

Recording these so a later reviewer does not read the omission as an oversight.

| Action | Why no confirm |
|---|---|
| Period `?/lock` | Reversible via `?/unlock`; §T3 does not list it. Its "Override note (if flagged)" input is a §4 copy problem, owned by phase 08. |
| Period / run `?/generate`, `?/regenerate` | Recomputes; produces no irreversible money movement. |
| Attendance `lock` / `unlock` / `lockTeam` / `unlockTeam` | Reversible pairs. Their §E silent-success defect is phase 04's. |
| Separation clearance item toggles | Reversible; per-row; a dialog per checkbox would make the checklist unusable. |
| Inventory delete, branch close, holiday delete | **Already correct** — kit `ConfirmButton`. Verify unchanged after phase 04's rebuild; do not edit. |
| Login re-activation (site 12, `isActive === false`) | Not destructive. Confirming it is friction with no consequence to name. |

---

## Copy Standards (bind every message above)

1. **Name the consequence, not the action.** "This cannot be undone" alone is not enough — say what
   changes, what moves, and what cannot be recovered. Model: the run-void message.
2. **Name the person or object** where the page shows many. Sites 1, 5, 11, 12 interpolate a name or
   email.
3. **State what survives** when the action reads more destructive than it is (site 12).
4. **Plain language.** No "irreversible", no "commit", no "persist". Short sentences. This follows
   the repo's communication standard and the honest-dead-end-copy strength (do-not-break item 8).
5. **`confirmText` is a verb phrase naming the act** — `Void period`, `Release`, `Deactivate` — never
   "OK" or "Yes". The user must be able to read only the button and know what happens.
6. **No new colors, no new tokens.** `ConfirmDialog`'s existing confirm button styling is used as-is.
   `ConfirmDialog`'s current hardcoded `bg-red-600` is a **phase 03** concern; do not fix it here.

---

## Implementation Checklist

Ordered. Commit per section, not per phase (repo convention). Run the section's gate before moving on.

**Section 0 — entry checks**
1. Confirm phase 03 and phase 04 reports exist with green gate sets recorded.
2. Read `src/lib/components/ui/ConfirmButton.svelte` and `ConfirmDialog.svelte` on disk; confirm
   `ConfirmButton` waits for and reports its result, and record its final prop list in the phase report.
3. Re-run the staleness table above against the current tree; record every drift in this plan before
   editing code.
4. Append this phase's claim to `phase-blast-radius-registry.md` in this folder (append-only).

**Section 1 — payroll periods (sites 2, 3)**
5. Wrap `?/void` in `ConfirmButton` in `src/routes/(app)/payroll/periods/+page.svelte` with the site-2 message.
6. Wrap `?/release` in `ConfirmButton` in the same file with the site-3 message.
7. Remove the now-unused `voidG` / `releaseG` `{@const}` guards; keep a `// #108` comment naming
   `ConfirmButton`'s busy state as the replacement.
8. Gate: `pnpm check && pnpm lint`.

**Section 2 — payroll run + entry (sites 4, 5)**
9. Verify `payroll/+page.svelte:207-216` `ConfirmButton` still compiles against phase 04's props; fix
   only if phase 04 renamed a prop.
10. Add `min="0"` to the `netPay` input in `src/routes/(app)/payroll/[id]/+page.svelte`.
11. Add the `baseline` `$state` snapshot captured at panel open and the delta readout beside the input.
12. Convert the override submit button to `type="button"` + `ConfirmDialog` (Shape B) with the site-5
    message; fire only when `delta !== 0`.
13. Gate: `pnpm check && pnpm lint && pnpm test`.

**Section 3 — payroll config (site 6)**
14. Add `baselineRates` snapshot and the changed-rows diff in `src/routes/(app)/payroll/config/+page.svelte`.
15. Convert the `?/updateRates` submit to Shape B with the site-6 message; skip the dialog when nothing changed.
16. Confirm the sibling `?/update` form is untouched.
17. Gate: `pnpm check && pnpm lint`.

**Section 4 — statutory rates (sites 7, 8, 9, 10)**
18. Wrap `?/confirmProposal` in `ConfirmButton` with the site-7 message and the `p.changes` list.
19. Wrap `?/rejectProposal` in `ConfirmButton` with the site-8 message.
20. Add the `// #108: ConfirmButton's busy state is this form's single-submit guard.` comment to both.
21. Add `baselineStatutory` snapshot and the `touchedServices` diff.
22. Replace the existing dialog's message with the site-9 manage-path copy; interpolate `touchedServices`.
23. Convert `Submit for CEO approval` to `type="button"` opening the same dialog with the approval-path copy.
24. Port the `beforeNavigate` + `beforeunload` dirty guard from `performance/templates/[id]/+page.svelte:92-110`; message per site 10; clear the flag on successful save.
25. Gate: `pnpm check && pnpm lint && pnpm test`.

**Section 5 — people and access (sites 1, 11, 12)**
26. Convert offboard to Shape B in `src/routes/(app)/employees/[id]/+page.svelte` with the site-1 message.
27. Wrap `?/release` in `ConfirmButton` in `src/routes/(app)/performance/reviews/[id]/+page.svelte` with the site-11 message.
28. Branch `?/setActive` in `src/routes/(app)/settings/roles/+page.svelte`: `ConfirmButton` on deactivate, existing form kept on activate. Preserve the `:21-25` #108 comment.
29. Gate: `pnpm check && pnpm lint && pnpm test`.

**Section 6 — kill the native confirms (sites 13, 14, 15)**
30. Convert separation finalize to `ConfirmButton`, carrying the existing wording verbatim; rewrite the guard comment.
31. Convert separation undo, with the `$derived` conditional `reopenClearance` clause; use Shape B if the checkbox is inside the form.
32. Convert attendance reset, passing the `update({ reset: false })` handler through `ConfirmButton`'s `submit` prop.
33. Verify zero native `confirm()` remain in `src/` (Gate G2).
34. Gate: `pnpm check && pnpm lint && pnpm test`.

**Section 7 — verification and close**
35. Verify site 16 (`ReasonDialog` bulk reject) unchanged and still functional.
36. Verify the four already-correct low-stakes `ConfirmButton` sites (branches, inventory, holidays, leave) still compile and render.
37. Add the source-scan test `tests/unit/destructive-confirms.test.ts` (Gate G1/G2).
38. Run the full CI gate set in order: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.
39. Run the live spot-check matrix (below) and record every row.
40. Run the impeccable audit pass.
41. Write `phase-05-destructive-actions_REPORT_{date}.md` FLAT in this folder with a Forward Preview for phase 06.
42. Commit via `vc-git-manager`. No `Co-Authored-By`.

---

## Acceptance Criteria

Each criterion names its proving gate. Gate ids refer to the Verification Evidence table.

| # | Criterion | proven by | strategy |
|---|---|---|---|
| AC1 | Every one of the 14 changed §T3 sites opens a kit dialog before the action runs | P1 live spot-check matrix, rows 1-3 and 5-15; structurally by G1 | Agent-Probe (G1 Fully-Automated) |
| AC2 | Every dialog message names the consequence — what changes, what moves, what cannot be recovered — in the exact copy drafted in this plan | G3 verbatim message-string scan; read aloud during P1 | Fully-Automated |
| AC3 | Zero native `confirm()` calls remain in `src/` (the `ReasonDialog` local function declaration and `beforeunload` excluded) | G2 source scan | Fully-Automated |
| AC4 | Cancelling a dialog changes nothing — no database write occurs | P2 negative control with `psql` on period void, offboard, deactivate | Hybrid |
| AC5 | Confirming a dialog completes the action **and reports success** (inherited from phase 04) | P1, "Confirm → expect" column, all rows | Agent-Probe |
| AC6 | The net-pay override input refuses negatives client-side, shows the delta, and skips the dialog when nothing changed | P5 | Agent-Probe |
| AC7 | The statutory editor warns before navigating away with unsaved edits and names the touched services, including on tabs not currently visible | P4 | Agent-Probe |
| AC8 | The statutory proposal Confirm/Reject pair has a single-submit guard, closing the last #108 gap in the repo | G1 (asserts the wrapping); P1 rows 7-8 (double-click during flight) | Fully-Automated + Agent-Probe |
| AC9 | Re-activating a login shows **no** dialog — the asymmetry is deliberate | P1 row 12b, asserting a positive absence against a named control | Agent-Probe |
| AC10 | The attendance reset still keeps untouched cell values after conversion | P6 | Agent-Probe |
| AC11 | The two nested dialogs trap focus and Escape closes only the dialog, not the parent context | P3 keyboard-only walk | Agent-Probe |
| AC12 | No server behavior changed — zero `+page.server.ts`, schema, service, or capability edits | `git diff --stat` shows only the 9 `.svelte` files + 1 new test file; G4 | Fully-Automated |
| AC13 | The four already-correct low-stakes confirms and the bulk-reject `ReasonDialog` still work | R2, P1 row 16 | Agent-Probe |
| AC14 | Full CI gate set green in CI order | G4 | Fully-Automated |

**Residual (known gap, not a PASS state):** no automated tier proves "clicking the trigger opens the
dialog" — the repo has no component-interaction harness. AC1, AC5, AC6, AC7, AC9, AC10 and AC11 rest
on Agent-Probe evidence. A backlog stub for the harness is registered in Test Infra Improvement
Notes; these gates stay **CONDITIONAL** on the live spot-check being recorded row by row in the phase
report. A phase report without a completed P1 matrix does not satisfy them.

## Phase Completion Rules

This phase is `CODE DONE` when checklist items 1-38 are complete and the CI gate set is green.

This phase is `✅ VERIFIED` only when **all** of the following hold:

1. `pnpm format:check && pnpm lint && pnpm check && pnpm test` green, run in that order.
2. `pnpm test:e2e` no worse than the pre-phase baseline, with `tests/e2e/separations.spec.ts` read (not just re-run) if red.
3. G1, G2 and G3 green **and** each proven non-vacuous by its mutation check, recorded in the report.
4. The P1 live spot-check matrix filled in, all 16 rows, both cancel and confirm columns.
5. P2 negative controls run on all three named sites with the `psql` assertion recorded.
6. P3, P4, P5 and P6 recorded with an outcome each.
7. R1, R2 and R3 regressions recorded as PASS / FIXED / BLOCKED per the umbrella's evidence format.
8. The impeccable audit pass (A1) recorded.
9. `phase-05-destructive-actions_REPORT_{date}.md` written FLAT in this folder, with known gaps and a Forward Preview for phase 06.
10. This plan's `Validate Contract` section filled by vc-validate-agent.
11. Execution changes committed via `vc-git-manager`, separate from process/plan commits.

12. **User Confirmation** — the owner has seen the live spot-check result and confirmed working.
    Per the umbrella's per-phase loop, the EXECUTE approval gate is **not** standing-granted for this
    program, and the same rule applies at the exit: a phase reaches `✅ VERIFIED` only after the user
    confirms the live walk, not when the agent judges the gates green.

Code-only completion is `CODE DONE`, never `✅ VERIFIED`. A green gate set with an unrecorded P1
matrix is `CODE DONE`. A recorded P1 matrix that the user has not confirmed is `CODE DONE`.

---

## Touchpoints

**Changed (10 files, all `.svelte`, all template/script only):**

| File | Sites |
|---|---|
| `src/routes/(app)/employees/[id]/+page.svelte` | 1 |
| `src/routes/(app)/payroll/periods/+page.svelte` | 2, 3 |
| `src/routes/(app)/payroll/[id]/+page.svelte` | 5 |
| `src/routes/(app)/payroll/config/+page.svelte` | 6 |
| `src/routes/(app)/payroll/statutory-rates/+page.svelte` | 7, 8, 9, 10 |
| `src/routes/(app)/performance/reviews/[id]/+page.svelte` | 11 |
| `src/routes/(app)/settings/roles/+page.svelte` | 12 |
| `src/routes/(app)/separations/[id]/+page.svelte` | 13, 14 |
| `src/routes/(app)/attendance/+page.svelte` | 15 |
| `tests/unit/destructive-confirms.test.ts` | new — gates G1, G2 |

**Read-only (verify, do not edit):**
`src/lib/components/ui/ConfirmButton.svelte`, `ConfirmDialog.svelte`, `ReasonDialog.svelte`,
`src/routes/(app)/payroll/+page.svelte`, `src/routes/(app)/requests/approvals/+page.svelte`,
`src/routes/(app)/performance/templates/[id]/+page.svelte` (the guard being ported),
`src/lib/utils/submit-guard.svelte.ts`.

**Out of bounds:** `prisma/schema.prisma`, every `+page.server.ts`, `src/lib/server/**`,
`src/lib/rbac.ts`, `src/app.css`, `src/lib/components/ui/**` (phase 03 owns it).

## Public Contracts

- **No server contract changes.** Zero `+page.server.ts` files are edited. No action signature, zod
  schema, capability check, or audit stamp moves. `netPay`'s server `.min(0)` already exists and is
  not touched.
- **`ConfirmButton` / `ConfirmDialog` props are consumed, not changed.** If a message needs a prop
  these components do not have, that is an amendment to **phase 03** and must be routed there — this
  phase does not extend a primitive.
- **`ConfirmButton`'s `submit` prop is load-bearing at site 15.** The attendance reset's
  `update({ reset: false })` handler passes through it. If phase 04's rebuild changed or removed
  that prop, site 15 blocks until phase 04 is amended.
- **Two per-row `createSubmitGuard` instances are retired** (periods void/release) and two more may
  be (reviews release, separations). Their `#108` comments are rewritten, not deleted — the guard's
  *reason* stays documented even when the mechanism changes.
- **No URL, route, redirect, or capability change.** Nothing becomes reachable or unreachable.

## Blast Radius

- **Files:** 9 changed `.svelte` + 1 new test file. No server files, no schema, no CSS, no `$lib`.
- **Surfaces:** 9 pages — employees detail, payroll periods, payroll run detail, payroll config,
  statutory rates, performance review detail, settings/roles, separations detail, attendance.
- **Risk class:** **medium.** Not auth, not schema, not money *logic* — but every one of these
  surfaces is money- or person-adjacent, and a mis-wired dialog can produce two failure modes that
  a green test suite will not see:
  1. **The dialog never opens** and the action fires bare — the defect this phase exists to fix,
     shipped invisibly. Caught only by the live spot-check.
  2. **The dialog opens but the confirm does not submit** — the action becomes unreachable. A user
     cannot void a period at all. This is the more dangerous of the two because it is a functional
     regression on a privileged path.
- **Highest-risk sites:** 9 and 10 (statutory rates — nested dialog inside a tab panel, a new
  baseline diff, and a navigation guard, all in one 585-line file) and 5 (net-pay override — a
  dialog inside an expanded table row, plus the only input-attribute change in the phase).
- **Aggregate:** the phase overlaps every later phase in the program on
  `employees/[id]` (phase 07 splits it) and `attendance` (phase 07 splits it). Record both in the
  blast-radius registry so phase 07 knows these forms moved.

## Verification Evidence

Tier assignments follow `process/context/tests/all-tests.md`. **The controlling fact:** these are
pure Svelte template changes with no server behavior, and the repo has no component-interaction test
harness — `@testing-library/svelte` is installed but unused, and the one component test in the repo
(`performance-capture.test.ts`) uses `render` from `svelte/server`, which renders `ConfirmDialog` in
its **closed** state (`{#if open}`) and therefore cannot prove a dialog opens. Automated coverage is
therefore **structural** (source-scan, the `performance-no-scoring.test.ts` precedent) and behavioral
coverage is **agent-probe**. This split is honest, not a shortcut — it is stated so no one reads a
green `pnpm test` as proof that a dialog appears.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| **G1** `tests/unit/destructive-confirms.test.ts` — source scan asserting each of the 9 changed files imports `ConfirmButton` or `ConfirmDialog`, and that each named action string (`?/offboard`, `?/void`, `?/release`, `?/override`, `?/updateRates`, `?/confirmProposal`, `?/rejectProposal`, `?/setActive`, `?/finalize`, `?/undo`, the reset action) appears within a confirm-wrapped region | Fully-Automated | Every §T3 row is routed through the kit confirm — the phase's core rule, mechanically |
| **G2** Same file — scan all of `src/**/*.svelte` and `src/**/*.ts` for a native `confirm(` **call**, excluding a `function confirm()` **declaration** (`ReasonDialog.svelte:48`) and excluding `beforeunload` | Fully-Automated | "Zero native `confirm()` remain in `src/`" — the umbrella's stated phase exit |
| **G3** Same file — assert the 16 message strings are present verbatim, so a later edit that softens a consequence goes red | Fully-Automated | Consequence-naming copy survives future edits (the `performance-no-scoring.test.ts` shape) |
| **G4** `pnpm format:check && pnpm lint && pnpm check && pnpm test`, in that order | Fully-Automated | Standard phase exit gate; CI runs format first and skips the rest, so this order is the only one that proves CI |
| **G5** `pnpm test:e2e` no worse than the pre-phase baseline; `tests/e2e/separations.spec.ts` specifically re-run (sites 13/14 change that page's interaction) | Fully-Automated (flaky — read the error, do not re-run blindly, per #287) | The two native-confirm removals did not break the one e2e spec covering that surface |
| **P1** Live spot-check, one row per site (matrix below): open each control, confirm the dialog appears, confirm the message names the consequence, cancel and verify **nothing happened**, then confirm and verify the action completed **and reported success** | Agent-Probe | The §T3 exit criterion — "each row of the §T3 table shows a dialog naming the consequence". No automated tier can prove this |
| **P2** Negative control on 3 sites (period void, offboard, deactivate): cancel the dialog and assert the **database row is unchanged** via `psql` | Hybrid — precondition: running app + `veent-db-5434` + `POST /api/v1/_dev/login-as` | Cancel is a real cancel, not a delayed submit. "The dialog closed" proves nothing on its own |
| **P3** Keyboard-only walk of the two nested dialogs (statutory rates inside a tab panel; net-pay override inside an expanded row): Tab traps inside the dialog, Escape closes **only the dialog** and not the parent context, focus returns to the trigger | Agent-Probe | Phase 03's Dialog base holds under this phase's two nested cases |
| **P4** Statutory unsaved-changes guard: edit the SSS tab, switch to Pag-IBIG, navigate away → dialog fires and names **SSS** in `touchedServices`; save successfully then navigate → guard does **not** fire | Agent-Probe | Site 10's dirty guard is wired to the real diff and clears on save |
| **P5** Net-pay override: type a negative value → browser refuses (`min="0"`); type an unchanged value → **no dialog**, saves through; type a changed value → dialog names the delta and both peso figures | Agent-Probe | Site 5's three changes, including the `delta !== 0` threshold decision |
| **P6** Attendance reset keep-values check: correct two cells, reset a third day, confirm → the two corrected cells still hold their typed values | Agent-Probe | The `update({ reset: false })` handler survived the `ConfirmButton` conversion (the site-15 silent-regression risk) |
| **R1** Regression: masked-reveal walk on `employees/[id]` — mask holds, reveal once, audit row written | Hybrid — precondition: running app + DB | Do-not-break item 3 survived; this phase edits that file |
| **R2** Regression: the four already-correct low-stakes confirms (branches, inventory, holidays, leave) still open and still submit | Agent-Probe | Phase 04's `ConfirmButton` rebuild + this phase's sweep did not break the sites that were already right |
| **R3** Regression: nav resolves for HR_ADMIN / MANAGER / employee | Hybrid — precondition: running app + seeded roles | Umbrella's standing regression rule from phase 02 onward |
| **A1** impeccable audit pass on the 9 changed files | Agent-Probe | Design-quality bar the CI gates cannot express (standing repo rule: UI work goes through impeccable) |

### Live spot-check matrix (P1) — record every row in the phase report

| # | Site | Role to log in as | Cancel → expect | Confirm → expect |
|---|---|---|---|---|
| 1 | Offboard | HR_ADMIN | employee still ACTIVE | OFFBOARDED + success reported |
| 2 | Period void | payroll manager w/ `canVoid` | period status unchanged | VOIDED + success reported |
| 3 | Period release | payroll manager | still LOCKED | RELEASED + success reported |
| 4 | Run void | payroll manager | unchanged (verify-only) | VOIDED (unchanged behavior) |
| 5 | Net-pay override | payroll manager | netPay unchanged | netPay = typed value + success reported |
| 6 | DOLE multipliers | payroll manager | rates unchanged | rates saved + was→now was shown |
| 7 | Statutory Confirm | CEO | proposal still pending | applied + success reported |
| 8 | Statutory Reject | CEO | proposal still pending | rejected + success reported |
| 9 | Statutory save | HR_ADMIN (`canManage`) and a non-manage role | rates unchanged | saved/submitted; touched services named |
| 10 | Statutory dirty guard | HR_ADMIN | stays on page, edits intact | navigates away, edits discarded |
| 11 | Release review | reviewer w/ `canRelease` | not released | released + success reported |
| 12 | Deactivate login | Super Admin | user still ACTIVE | INACTIVE + success reported |
| 12b | **Activate** login | Super Admin | — (no dialog expected) | ACTIVE — **assert no dialog appears** |
| 13 | Separation finalize | HR_ADMIN | not finalized | FINALIZED + banner |
| 14 | Separation undo | Super Admin | still finalized | undone + banner; re-open clause shown when checked |
| 15 | Attendance reset | HR_ADMIN | manual edit intact | re-derived; other cells kept |
| 16 | Bulk reject | approver | — (verify-only) | ReasonDialog still requires a note |

**Mutation check (do not skip).** Per the repo's verification discipline, a plan-stated gate is a
hypothesis until it is run red. Before calling G1/G2/G3 green: delete one confirm wrapper on purpose
and confirm G1 goes red; re-add a native `confirm()` on purpose and confirm G2 goes red; soften one
message string and confirm G3 goes red. Record all three in the phase report. A source-scan test that
cannot fail is the exact vacuous-green shape this repo has been burned by five times.

## Test Infra Improvement Notes

- **Gap found at plan time:** `@testing-library/svelte@^5.2.0` is in `devDependencies` but has **zero
  call sites** in `tests/`. There is no component-interaction harness, so no automated tier can prove
  "clicking the trigger opens the dialog" — the phase's central behavior is agent-probe only. Wiring
  one `ConfirmDialog` open/close/Escape interaction test would convert P3 and part of P1 from
  Agent-Probe to Fully-Automated for the whole program, not just this phase.
  **Resolution: backlog stub, not this phase.** It is phase 03's primitive, and adding a test harness
  is infrastructure work outside a wrapping phase's blast radius. Register
  `component-interaction-test-harness_NOTE_{date}.md` in `process/features/ui-ux-overhaul/backlog/`
  during UPDATE-PROCESS and name it in the phase report's known gaps.
- **Gap found at plan time:** `process/context/tests/all-tests.md` states "(No deeper test docs yet)"
  — the routing chain terminates at the router. Nothing downstream was skipped, but the group is
  thinner than the repo's actual practice (the ad-hoc Playwright + `_dev/login-as` + `psql` harness
  is described in prose only, not as a routable doc). Flag at UPDATE-PROCESS.
- (Further notes added during EVL.)

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-destructive-actions_PLAN_03-09-26.md`
2. **Last completed step:** plan written. No code changed. Checklist item 0 not started.
3. **Validate-contract status:** pending — PVL has not run on this phase plan.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`,
   `docs/ui-ux-audit-2026-09-03.md` (§T3, §T4, §4 Payroll/People/Performance, §5, addendum §B/§E/§G/§H),
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md`,
   and the 12 source files listed under Touchpoints.
5. **Next step for a fresh agent:** verify the phase 03 and phase 04 reports exist and record green
   gate sets (checklist item 1). If either is missing, **stop** — this phase has a hard entry gate and
   running it early costs a second sweep of all 9 files. If both are present, read
   `ConfirmButton.svelte` on disk, record its final prop list, re-run the staleness table, then start
   at Section 1 (payroll periods) — it is the lowest-risk section and proves the wiring shape before
   the harder statutory work.
6. **Primary execute anchor:** this file is the single execute anchor. Pass exactly this path to
   EXECUTE — not the umbrella, and not a folder.
7. **Supporting phase files** (read-only inputs, never the execute target):
   `ui-ux-overhaul-umbrella_PLAN_03-09-26.md` (charter, do-not-break list, per-phase loop),
   `phase-03-design-system_PLAN_03-09-26.md` + its report (the Dialog base contract),
   `phase-04-feedback-contract_PLAN_03-09-26.md` + its report (the `ConfirmButton` rebuild and the
   `{ action, error?, saved? }` contract), `phase-01-p0-fixes_REPORT_*.md` (proves the offboard and
   period void/release success messages this phase must not regress), and
   `phase-blast-radius-registry.md` (append this phase's claim before editing).

---

Plan complete. Review carefully. Say **'ENTER VALIDATE MODE'** when ready to proceed to plan
validation (required before implementation).

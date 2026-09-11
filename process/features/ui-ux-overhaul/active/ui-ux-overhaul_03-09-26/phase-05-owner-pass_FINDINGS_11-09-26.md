# Phase 05 owner pass — findings to act on later

Collected during the live click-through. **Nothing here is fixed yet.** Owner's call per item.

---

## F1 — Offboard success reports twice: a Banner and a toast

**Found in:** P1-1 (offboard), `src/routes/(app)/employees/[id]/+page.svelte`.
**Owner's call:** drop the Banner where a toast already says the same thing.

**What happens.** Confirming an offboard shows `Employee offboarded.` in two places at once: a green
success Banner at the bottom of the page and a toast.

**Re-verified 11-09-26** against source after the F6 detector error: the offboard duplicate is real.

**Why.** Two independent surfaces render the same `saved` string:

- `:1813` — `{#if form?.action === 'offboard' && form?.saved}` renders
  `<Banner kind="success" message={form.saved} />`.
- `:115` — `const offboard = submitFeedback({ error: null })`. The `error: null` suppresses only the
  **failure** toast. The file's own comment at `:112` says it plainly: "Success toasts are
  unaffected." So the success toast still fires, using the action's own `saved` string, which is the
  same string the Banner is showing.

**Scope note.** This is not offboard-only. Every one of the ~16 `submitFeedback({ error: null })`
calls on this page (`:113`-`:128`) keeps its success toast. Any of those actions that *also* renders
a page-local success Banner will double-report the same way. Check each before changing one.

**Known adjacent evidence.** `tests/e2e/timesheet-punch.spec.ts:94` already carries a comment about
this shape: "phase 04 also toasts this message, and a page-wide locator now matches both the page
banner and the toast." The spec worked around it by scoping to `<main>` rather than by removing a
surface.

**Care before removing the Banner.** The Banner at `:1813` exists for a specific reason recorded at
`:1810`: offboarding flips `employmentStatus` to `OFFBOARDED`, which **unmounts the card the button
lived in**. A message placed inside that card could never be read. So the Banner is the surface that
survives the unmount. If the Banner goes, confirm the toast is the thing the user actually sees
after the card disappears, and that it is not clipped or auto-dismissed before it is read (phase 04
made toasts pausable and capped).

**Suggested shape:** pass `success: null` to the `submitFeedback` call for the actions that render
their own Banner, rather than deleting the Banner. That keeps the surviving-surface guarantee and
removes the duplicate. Decide per action, not page-wide.

---

## F2 — Net-pay override succeeds silently. Owner wants a toast.

**Found in:** P1-5 (net-pay override), `/payroll/<runId>`.
**Owner's call (11-09-26):** "There needs to be a success message." / "A toast would be nice."
**Severity:** this is the exact silent-on-success shape phases 04 and 05 set out to remove. The
override rewrites what an employee gets paid, and it reports nothing at all.

**What happens.** Confirming `Override this net pay?` writes correctly — `payroll_entries.netPay`
goes to the typed value, the row re-renders with the new figure and the run header gains its
**Has overrides** badge — but **no toast, no banner, nothing**. Measured by sampling the polite live
region every 150ms for 4.5s from the click: zero samples. For comparison, P1-2 and P1-3 toast at
~150ms and hold past 6s.

**Re-verified 11-09-26 against source** after the F6 detector error, rather than by live probe:
`payroll/[id]/+page.svelte` has **no success surface of any kind**. Its only `form?.` branch is
`{#if form?.error}` at `:161`. There is no `Banner` import, no `form?.saved`, no `form?.success`
anywhere in the file; the two `text-green` hits at `:192` and `:406` are a net-pay figure and a
status chip. "Reports nothing" is correct here — a real gap, not a missed detector.

**Why — two independent gaps, both must be closed.**

1. **The server returns no success payload.** `?/override` in
   `src/routes/(app)/payroll/[id]/+page.server.ts` returns `fail(...)` on the error paths and then
   falls off the end on success. There is no `{ saved: '...' }` to report. Compare `?/void` in
   `payroll/periods/+page.server.ts:121`, which returns `{ action: 'void', saved: 'Period voided.' }`.

2. **The client form has no feedback wiring.** The override form at
   `src/routes/(app)/payroll/[id]/+page.svelte:318` uses `use:enhance={overrideG.enhance}` where
   `overrideG` is `createSubmitGuard()` (`:74-77`) — a **double-submit guard only**.
   `src/lib/utils/submit-guard.svelte.ts` contains **zero** `addToast` calls. The page imports
   `submitFeedback` at `:8` but uses it only for `decideGuard` at `:23`.

**Why this site and not the others.** This is the ConfirmDialog-direct pattern. Sites that use
`ConfirmButton` get the toast for free: `ConfirmButton.svelte:50-53` wires `submitFeedback` and uses
the action's own `saved` string as the toast text. Sites that mount `ConfirmDialog` directly — this
one at `:525`, with `onconfirm={() => overrideFormEl?.requestSubmit()}` — bypass that entirely and
must wire their own.

**Fix shape.**
- Server: return `{ action: 'override', saved: 'Net pay overridden.' }` on the success path.
- Client: replace `createSubmitGuard()` with `submitFeedback()` for the override form so the toast
  fires from `saved`. `submitFeedback` already carries the double-submit `busy` state, so the guard
  is not lost. Check the `overrideG.busy` reads at `:358`/`:360` still resolve.

**Check the other ConfirmDialog-direct sites for the same hole before closing this.** Per the phase
05 diff the direct-mount sites are: `payroll/[id]`, `payroll/config`, `payroll/statutory-rates` (×2),
`employees/[id]`, `performance/reviews/[id]`, `separations/[id]`. Each needs its own confirmation
that success is reported. P1-1 (offboard) and P1-3 (release) already proved theirs do report.

---

## F3 — Saving the multipliers blanks all six fields, and corrupts the next was→now summary

**Found in:** P1-6 (DOLE premium pay multipliers), `/payroll/config`, the **Premium Pay Multipliers**
card. `src/routes/(app)/payroll/config/+page.svelte`.
**Severity:** visible on every save. The card looks broken and the phase 05 feature this stage exists
to prove is wrong on the second use.

**What happens.** Two symptoms, one cause.

1. Click **Save Multipliers**. The save succeeds, but **all six inputs go empty on screen** —
   measured directly: before `["1.25","1.3","0.1","1.3","2","1.3"]`, after `["","","","","",""]`.
2. Without reloading, edit two fields and press Save again. The confirm dialog's was→now list reads
   `Overtime: null → 1.4` / `Rest day: null → 1.5` instead of `1.25 → 1.4` / `1.3 → 1.5`.

**Isolated.** On a fresh page load the message is correct (`Overtime: 1.25 → 1.4`). The corruption
appears only after a prior save in the same page visit, which is what makes it easy to miss.

**Why.** `:14-17`:

```
const saveRates = createSubmitGuard(() => async ({ update, result }) => {
    await update()
    if (result.type === 'success') baselineRates = { ...rateValues }
})
```

`update()` defaults to `reset: true`, which performs a native form reset. The six inputs are
`<input type="number" bind:value={rateValues[f.name]}>` (`:184-191`) with no `value` attribute, so a
reset blanks them; an empty number input binds back as **null**. `rateValues` therefore becomes all
nulls, and the very next line copies those nulls into `baselineRates` — which is what the dialog
prints on the following save.

**Fix.** `await update({ reset: false })`. This is already the established pattern in this repo for
exactly this trap, and a sibling file spells out the reason in a comment —
`src/routes/(app)/performance/reviews/[id]/+page.svelte:71-73`: "the inputs are bound to `draft`, and
a native form reset would blank the DOM without telling Svelte, leaving what is shown and what would
be posted disagreeing." Same shape here. Also used in `timesheets/AggregatePanel.svelte:58,66` and
`timesheets/TimesheetModal.svelte:255,262`.

With `reset: false` the re-seed at `:17` becomes correct as written, since `rateValues` still holds
the saved values.

**Not phase 05's doing, but phase 05 owns the symptom.** The `update()` call predates this phase;
what phase 05 added is the was→now summary that exposes it. The blanked inputs would have been there
before the summary existed.

**Regression check when fixed:** save unchanged → no dialog, fields keep their values; save changed →
dialog names the real "was"; save again with no further edits → correctly reports nothing changed
(the reason the re-seed exists at all).

---

## F4 — Success feedback must render in the container that was acted on, not at the top of the page

**Owner's call (11-09-26):** "The success banner needs to be in the container of where the action was
made, not in the entire page. The current implementation causes confusion. The success message needs
to be in the container, maybe even beside the button of where it was clicked."
**Status:** accepted as a change to make. This is a placement rule, not a one-site bug, so it governs
F1 and F2 as well.

**The rule.** Feedback belongs next to the control that caused it. A page-level banner is only
correct when the acted-on container is destroyed by the action itself (see the offboard case below).

**Worked example measured on `/payroll/config`.** The page has two independent forms:

- `?/update` — the **Save Configuration** button, upper card.
- `?/updateRates` — the **Save Multipliers** button, lower card.

Both set the same `form.success`, and one shared banner renders at `:84`, directly under the page
subtitle. Measured in the browser at a 903px viewport: the banner sits at page-y 32, the
**Save Multipliers** button at page-y 919 — a **887px gap**. You press a button at the bottom of the
page and the only confirmation appears a full screen height above, outside your view.

**Second half of the same problem: the message does not say what saved.** Both forms produce the
identical string `Payroll configuration saved successfully.` Press **Save Multipliers** and the page
tells you the *configuration* saved. There is no way to tell from the message which of the two cards
committed, and the multipliers card gives no acknowledgement of its own at all.

**How this relates to the other findings.**

- **F1** (offboard: Banner *and* toast) — the Banner is the correct surface there, because the card
  holding the button is unmounted by the action. The duplicate toast is what should go.
- **F2** (net-pay override: nothing at all) — owner asked for a toast. The override panel is inline
  in a table row, so an in-panel message is also viable; a toast is the decided answer.
- **F4** (this) — where a container survives the action, put the message in it.

**Suggested shape.**
- Give each form its own feedback slot rendered inside its own card, keyed by the action that
  returned it (`form.action === 'updateRates'`), the way `employees/[id]:1813` already gates its
  Banner on `form?.action === 'offboard'`.
- Make each action return its own string, e.g. `Multipliers saved.` vs
  `Payroll configuration saved.`, so the copy names what actually changed.
- Keep the page-level banner only for actions that destroy their own container.

**Sites to sweep** (every phase 05 file with a page-level success surface): `payroll/config`,
`payroll/statutory-rates`, `payroll/periods`, `payroll/[id]`, `employees/[id]`,
`performance/reviews/[id]`, `separations/[id]`, `settings/roles`, `attendance`. Check each for a
shared banner serving more than one form — that is the specific defect, not the banner itself.

---

## F5 — A Pag-IBIG-only edit silently rewrites the BIR tax table, and the summary reports SSS falsely

**Found in:** P1-9b / P1-7 setup, `/payroll/statutory-rates`.
**Severity:** highest so far. This one changes tax figures the user never touched, and both the
confirm dialog and the pending-proposal summary misdescribe what is being submitted. Phase 05's whole
rule is that the dialog names the consequence; here it names the wrong one.

**Reproduction.** As `hr@veent.ph`, open the **Pag-IBIG** tab, change **Share cap** 200 → 99999,
press **Submit for CEO approval**, confirm. Touch nothing else.

**Symptom 1 — CORRECTED 11-09-26 after P1-9a. The dialog is right; the payload and the diff are the
problem.** I first wrote this up as "the dialog under-reports". That was wrong and P1-9a disproved
it: editing SSS *and* Pag-IBIG, then standing on the Pag-IBIG tab, produced

> You are changing: SSS, Pag-IBIG. Edits on tabs you are not looking at are included.

So `touchedServices` faithfully tracks what the user actually edited, including a tab that is not on
screen — the feature works, and it is the highest-value message in the phase.

The real defect is downstream of it. The submitted payload always carries **every** tab
(`sssBrackets`, `taxBrackets`, `philhealthRate`, `philhealthFloor`, `philhealthCeiling`,
`pagibigRate`, `pagibigCap`), and the server-side diff that builds the pending-proposal summary then
reports untouched tables as changed. The dialog says "Pag-IBIG" and is correct; the summary the CEO
later reads says SSS and BIR changed too, and that is what is wrong.

**Symptom 2 — the pending card reports a change that does not exist.** As `ceo@veent.ph` the
proposal lists three lines:

```
Pag-IBIG cap: ₱200 → ₱99,999
SSS contribution table changed
BIR withholding-tax table changed
```

`SSS contribution table changed` is **false**. Compared in the database, the proposal's SSS brackets
and the live ones are byte-identical:

```
SELECT (p.payload->'sssBrackets') = c."sssBrackets" FROM statutory_rate_proposals p
  JOIN statutory_rate_configs c ON c."organizationId"=p."organizationId" WHERE p.status='PENDING';
 -> t
```

34 brackets on both sides, equal. The diff that drives that line is reporting a change where there is
none.

**Symptom 3 — the BIR change is real, and nobody asked for it.** `taxBrackets` genuinely differs, in
`baseTax`, on the top three brackets:

| idx | live (seeded) | proposed |
|---|---|---|
| 3 | 10833.33 | 10833.5 |
| 4 | 40833.33 | 40833.5 |
| 5 | 200833.33 | 200833.5 |

`floor`, `ceiling`, `rate` and `excessOver` are identical throughout; only `baseTax` moves.

**Why.** `baseTax` is a **derived** column — the page says so at `:58-59`: "Read-only previews of the
columns the server derives on save … Shown for transparency, never submitted." The client preview
(`taxDerived`, `:62-68`) accumulates `baseTax += (floor - prevFloor) * (prevRate/100)`, and the
server derives the same way on save. From the seeded floors that arithmetic yields
`2500 + (66667-33333)*0.25 = 10833.50`, while the seeded table stores the published BIR figure
`10833.33` (which comes from exact-thirds boundaries such as 33,333.33 rather than the integer
33,333 held in the row). So **any** save re-derives the column and replaces the published figures
with the integer-boundary ones. Nothing in the UI says this will happen.

**Why it matters.** These are live withholding-tax tables. The drift is small per bracket but it is
applied org-wide, it is invisible, and it recurs on every future save. It also means the "was → now"
promise of the other dialogs is not being honoured here.

**Open question for the owner (do not guess).** Which figure is authoritative — the seeded
`10833.33` or the derived `10833.50`? That decides the fix:
- If the stored/published figure wins, the server must stop re-deriving `baseTax` for brackets the
  user did not edit, or the floors must carry their true fractional values.
- If the derived figure wins, the seed is wrong and should be corrected, and the change summary
  should still say plainly that the tax table will be rewritten.

**Fix shape regardless of that answer.**
1. The change summary must not list a table as "changed" when it is byte-identical (the SSS line).
   Compare the payload against live before listing, not the form against its own defaults.
2. Narrow the payload to the touched services, or have the server ignore services whose submitted
   values equal the live ones. Do **not** "fix" the dialog line — P1-9a proved it is already correct.

**Not caused by phase 05.** The derivation and the whole-form payload predate it. Phase 05 added the
sentence that claims only Pag-IBIG is being submitted, which is what makes the mismatch visible and
quotable.

**CONFIRMED LIVE 11-09-26.** The proposal was applied as `ceo@veent.ph` with the owner's go-ahead.
The predicted rewrite happened exactly as described — `statutory_rate_configs.taxBrackets` for
`org_seed` now reads `10833.5 / 40833.5 / 200833.5` where it read `10833.33 / 40833.33 / 200833.33`
before. `pagibigCap` went 200.00 → 99999.00 as intended. This is no longer a prediction from the
payload; it is the live state of the table.

**Live-data note.** The seeded `org_seed` statutory config was backed up before this stage to
`scratchpad/statutory-backup-org_seed.json`. **Restore it** — the tax table is currently holding the
drifted figures and the ₱99,999 test cap.

---

## F6 — Statutory rates reports success with a Banner on all four paths; owner wants toasts

**Found in:** P1-7 / P1-9b, `/payroll/statutory-rates`.
**Owner's call (11-09-26):** "the success notification is a banner, it should be a toast."

Two different failures on the same page, found in the same stage:

- **Submit (HR)** renders `Change submitted for CEO approval.` as a page Banner. No toast.
- **Confirm / Apply rates (CEO)** renders `Proposal applied to the live rates.` as a page Banner.
- **Reject (CEO)** renders `Proposal rejected.` as a page Banner, measured at ~150ms after the click.
- **Save changes (manage path, P1-9a / P1-10)** renders `Statutory rates saved.` as a page Banner.

**All four actions on this page use a Banner. All four become toasts** — owner confirmed each one
separately as it was tested: submit, confirm, reject, then save.

**CORRECTION 11-09-26 — my earlier entry here was wrong.** I first recorded the confirm as reporting
"nothing at all". It does report; my detector was broken. I was sampling
`[role=status][aria-live=polite]`, and this Banner carries `role="status"` with **no** `aria-live`
attribute, so it never matched. A screenshot is what caught it. The app was right and my check was
wrong. **Every "reports nothing" claim in this document was re-verified after this.**

So this page reports on both paths and the fix is a surface swap, not a missing message: both the
submit Banner and the confirm Banner become toasts.

**Note the direction differs from F1 by design.** On `employees/[id]` the Banner is the surface to
keep, because offboarding unmounts the card that held the button. Here the card survives the action,
so a toast is the right call and the Banner should go. F4 is the rule that decides which: keep the
message next to the surviving control, use a page Banner only when the container is destroyed.

**Fix shape.** This page's forms use `createSubmitGuard`, the same wiring gap as F2. Move them onto
`submitFeedback` so the action's `saved` string toasts, and drop the page-level Banner block.

**Owner confirmed this three times on 11-09-26**, once per path as each was tested: "the success
notification is a banner, it should be a toast" (submit), "notifs should be toast not banner"
(confirm), "message should be toast not banner" (reject), "banner not toast, should be toast"
(save). **Settled for the whole page — do not re-ask per action.** The four strings to move are
`Change submitted for CEO approval.`, `Proposal applied to the live rates.`, `Proposal rejected.`
and `Statutory rates saved.`

**Detector note for the rest of this pass.** A toast lives in `[role=status][aria-live=polite]`. A
page Banner is `role="status"` with **no** `aria-live`, classes
`rounded-md border border-green-500/20 bg-green-500/10 ...`. Check for both, and screenshot, before
recording anything as silent.

---

## F7 — The "Pending proposals" entries are too large

**Found in:** P1-7, `/payroll/statutory-rates`, the **Pending proposals** card seen as
`ceo@veent.ph`.
**Owner's call (11-09-26):** "the card/tile/entry for each pending proposal is too big in my
opinion, that needs to be changed somehow."

Each pending proposal renders as a full-width block carrying the proposer line, a `<ul>` of every
changed table, and the Confirm / Reject pair. With more than one or two proposals the approver has to
scroll to compare them.

**No other phase owns this.** Checked the umbrella and the phase 06, 07 and 08 plans. Phase 06
(`surface-consolidation`) covers duplicate *destinations* — four approver inboxes, two leave forms,
three punch doors, the runs-vs-periods split — not the density of this card. Phase 07 (`page-splits`)
touches `/payroll/statutory-rates` only for its settings link label and its capability list. Phase 08
is copy and accessibility. So this is unclaimed work and needs a home.

**Suggested shape.** Collapse each proposal to one summary line — proposer, date, and a count such as
"3 tables changed" — with the change list behind a disclosure, keeping Confirm and Reject on the
summary row. That also fixes the comparison problem when several are pending.

**Related but separate:** F5 shows the change list is currently wrong as well as long. Shrink it and
correct it in the same pass, not in two.

**Owner's direction (11-09-26), extending F7.** Make each pending proposal a card. Then consider
moving them off this page entirely, onto their own surface reached from a **bell icon carrying a dot
with the count of outstanding proposals**. Owner expects the visual design to be refined later by the
`impeccable` or `ui-ux-pro-max` skill — this note captures the intent, not the final design.

**What already exists, and what does not — checked 11-09-26.**

| Piece | State |
|---|---|
| Notification records | `notifications` table, `kind` enum, per-user | exists |
| A bell icon anywhere in the shell | **does not exist** |
| Notification delivery | `(app)/+layout.svelte:80-92` turns unread rows into **one-shot toasts**, then immediately marks them read | exists, but leaves no standing trace |
| A `/notifications` route | **does not exist** |
| A counted badge | yes — the sidebar **Approvals** group, fed by `countPendingApprovals` | exists |

Two things follow.

**1. The bell is genuinely missing, and the codebase already says why that hurts.**
`approvals.ts:466-468` carries the comment: "Notifications are one-shot toasts marked read on the
next page load, so without this badge a proposal filed while the confirmer was away leaves no
standing trace anywhere in the UI." A bell with a persistent count is the general answer to the exact
problem that comment is working around one badge at a time.

**2. The existing badge does NOT count these proposals.** `countPendingApprovals` sums timesheets,
requests, payroll runs and proposals — but its `listActionableProposals` reads
`db.actionProposal` (`action-proposals.ts:324`), a **different model** from the
`statutoryRateProposal` rows this stage creates. So a pending statutory-rate proposal is invisible to
the sidebar count today. Whatever the bell ends up counting must include it, and that is a data
question to settle before any visual work.

**Scope warning — this collides with phase 06.** The umbrella gives phase 06
(`surface-consolidation`) this exact problem: "An approver has four separate inboxes
(`/requests/approvals`, `/requests/timesheets`, `/requests/proposals`, `/payroll`) with no combined
'awaiting me' view and no summed badge." A bell opening a dedicated proposals page is a fifth inbox
unless it is folded into that consolidation. **Do not build the bell as a standalone surface.** Either
route it through phase 06's combined "awaiting me" view, or amend phase 06 to own the bell. Phase 06
is currently PLANNED and BLOCKED in a supplement cycle, so it is still open to amendment.

---

## F8 — Owner wants a confirm on login RE-ACTIVATION too, reversing a deliberate phase 05 decision

**Found in:** P1-12b, `/settings/roles`.
**Owner's call (11-09-26):** "I do think that reactivation should [have] some dialogue."
**Status:** accepted, and it **overrides a documented design decision** — flagged here so nobody
later reads the change as a mistake and reverts it.

**What phase 05 decided, and why.** The plan lists this under "Deliberately Not Confirmed (and
why)", a table written expressly "so a later reviewer does not read the omission as an oversight":

> Login re-activation (site 12, `isActive === false`) — Not destructive. Confirming it is friction
> with no consequence to name.

And in the Site 12 section:

> **Asymmetric by design:** the same button both activates and deactivates. **Confirm only the
> deactivate direction.** Re-activating a login is neither destructive nor irreversible.

P1-12b tested that asymmetry and it works: no dialog appears on activate, asserted over 4.2s, and
the toast `Login activated.` still fires.

**Why the owner's call is defensible anyway.** The phase's rule is "irreversible, money-affecting or
person-affecting". Re-activation fails the first two but arguably meets the third: it restores
someone's ability to sign in and reach payroll data, and it is the one direction where a misclick
grants access rather than removing it. A deactivated account is often deactivated for a reason —
offboarding, suspension, an investigation — and silently re-opening it is a security-shaped event
even though it is technically reversible.

**Fix shape.** Route the `{:else}` activate branch through `ConfirmButton` like the deactivate
branch, keeping the existing per-row `setActiveGuard` (the #108 double-submit guard) intact. The
message must name a real consequence, not restate the action. Draft:

> `{u.email} can sign in again immediately and regains access to everything their roles allow.`

**Two things to settle before building.**
1. **The plan must be amended, not contradicted.** Remove the row from "Deliberately Not Confirmed"
   and update the Site 12 "asymmetric by design" paragraph, or the next reader will hit a plan that
   argues against the shipped code. The phase 05 report needs the same note.
2. **`tests/unit/destructive-confirms.test.ts` currently pins the asymmetry.** Check whether a gate
   asserts that the activate branch has no confirm wiring; if so it will go red and must be updated
   deliberately, not silenced.

---

## F9 — Separation detail: the finalize card has no height floor/ceiling, and the settled line is orphaned

**Found in:** P1-13, `/separations/<id>`. `src/routes/(app)/separations/[id]/+page.svelte`.
**Owner's call (11-09-26):** "the 'Finalize separation' container should have a uniform max and
minimum height. Also the 'Finalized on Sep 11, 2026. Final pay settled at ₱165,454.55.' message
should be put inside the details container and should be emphasized."

### F9a — Uniform min/max height on the finalize card

The card at `:194` (`<div class="rounded-lg border border-destructive/30 bg-card p-4">`, heading
`Finalize separation` at `:195`) has no height constraint. Its height is whatever its copy and the
refusal bar happen to need, so it changes size between cases — and its `{:else}` replacement is a
different element entirely (`:227`), so the page reflows when a separation is finalized.

Measured card heights on this page, which shows the spread:

| Card | Height |
|---|---|
| Clearance checklist | 416px |
| Final pay (settled) | 206px |
| Undo finalization | 242px |

Give the finalize card a `min-h-*` and a `max-h-*` so it holds one size whether or not the amber
`#finalize-bar` refusal text is present, and so the finalized state does not shrink the column.

### F9b — Move the settled line into the details container and emphasize it

Today the finalized message renders as a **standalone muted block** at `:227-231`:

```
<div class="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
  Finalized on {date}. Final pay settled at {amount}.
</div>
```

It sits at page-y 494 as a direct child of the page's `space-y-6` stack — a sibling of the cards, not
inside any of them. So the single most important fact on a finalized separation (it is done, and for
how much) is rendered in `text-muted-foreground`, the page's lowest-emphasis style, in a card with no
heading, while `Final pay (settled)` sits right above it as its own titled card.

**Fix shape — OWNER APPROVED 11-09-26** ("that suggestion is good"). This is the agreed approach,
not a proposal: fold it into the `Final pay (settled)` card at `:169` — that card already owns this
information and already changes its own heading on `isFinalized`. Emphasize the amount rather than
muting it: drop `text-muted-foreground`, keep the `font-mono` on the peso figure, and treat the date
as secondary. A muted style is for asides; this is the outcome.

**Watch out when moving it.** `tests/e2e/separations.spec.ts` drives this page and the phase 05 gate
`tests/unit/destructive-confirms.test.ts` pins the site-13 needle
`This snapshots final pay, offboards the employee, and disables their login` — that is the *dialog*
string, not this one, so it is unaffected. Check the e2e spec for an assertion on the settled line's
text or position before moving it.

---

## F10 — Attendance: typing into Reg/OT does nothing, but the app reports "saved" and keeps showing your number

**Found in:** P1-15 setup, `/attendance`. `src/lib/server/services/attendance/index.ts:585`,
`src/routes/(app)/attendance/+page.server.ts:200-211`.
**Severity:** the UI asserts a success that did not happen and then displays a number the database
does not hold. Anyone correcting hours by hand believes the correction took.

**Reproduction.** As `hr@veent.ph` on `/attendance`, pick an unlocked day, type `7.25` into the
**Reg** cell, press that row's **Save**.

| What you see | What is true |
|---|---|
| Toast: `Attendance day saved.` | the action did succeed |
| The Reg cell still reads `7.25` | `attendance_days.regularHours` = **0.00** |
| `manuallyEdited` flips to `t` | so the day is now "manually edited" with none of your edit in it |

Verified twice, once by scripted input and once by a real form fill, then read back from the
database each time.

**Why.** `correctDay` treats the punch times as the source of truth
(`attendance/index.ts:580-585`):

```
// When HR sets the times, the times are the source of truth: re-derive status, worked/
// regular/OT hours ... rather than storing stale hand values.
const editingTimes = 'timeIn' in data || 'timeOut' in data
```

`editingTimes` is **always true from this form.** The row always posts a `date`, and the action at
`+page.server.ts:207-210` sets both keys whenever a date is present:

```
if (date) {
    data.timeIn  = timeIn  ? new Date(...) : null
    data.timeOut = timeOut ? new Date(...) : null
}
```

So every save re-derives the hours and discards whatever was typed into Reg/OT. With the times
blank, the derived value is 0. Setting the times instead works correctly — `09:00`/`17:00` produced
`regularHours` 7.00 (eight hours less the unpaid lunch), which is the proof that the derivation path
is fine and only the hand-typed field is dead.

**Two defects, not one.**
1. **The Reg/OT inputs are editable but ignored.** Either make them read-only/derived-looking when
   times drive them, or honour them when the times are unchanged.
2. **The optimistic UI lies.** After the save the cell keeps the typed value while the stored value
   is different; only a reload reveals it. Whatever is decided for (1), the displayed value must
   match what was stored.

**Not phase 05's doing.** This is the pre-existing correction path. Phase 05 only wrapped the
adjacent **Reset** trigger. Recorded here because the owner pass is the first time anyone typed into
that field and then checked the database.

**Blocks a phase 05 claim.** The P1-15 script says to "correct the hours" to produce a manually
edited day. That route does not work; the fixture has to be made by setting the **times**. The
script needs that correction.

---

## F11 — `/attendance` table: native time picker, per-row button noise, and bulk actions

**Found in:** P1-15, `/attendance`. `src/routes/(app)/attendance/+page.svelte`.
**Owner's call (11-09-26):** the clock picker "does not fit the aesthetic of this system… change that
to a clock instead"; "the Save and Reset buttons would only appear if there are modifications to that
row"; "we can have a Save all and Reset all button as well."
**Status:** accepted in principle. One naming conflict must be resolved first — see F11b.

### F11a — Replace the native time control

`timeIn` and `timeOut` are `<input type="time">`. The clock icon and the popup are the **browser's**
widget, not the app's: it ignores the design tokens, renders differently per browser and OS, and
cannot be themed for dark mode. Every other control on the page is app-styled, so this is the one
place the system's look breaks.

Replace with an in-app time picker — an analog clock face, or a styled hour/minute selector. Keep
`name="timeIn"` / `name="timeOut"` and the `HH:MM` post format intact: the action at
`+page.server.ts:207-210` rebuilds PHT timestamps from `${date}T${HH:MM}:00+08:00`, so the submitted
string shape is a contract. Keep keyboard entry working — typing a time is faster than any picker,
and the native control allows it today.

### F11b — Show row actions only when the row is dirty — BUT the two buttons are not the same kind of thing

Currently every row renders both buttons: **10 day rows, 10 Save buttons, 10 Reset buttons**, nearly
all inert. Hiding them until the row is touched is a clear improvement.

**The conflict.** "Save" and "Reset" mean different things here, and only one of them fits a
dirty-state rule:

| Button | What it does today | Dirty-state behaviour |
|---|---|---|
| **Save** | posts `?/correct` with this row's edits | correct: show only when the row has unsaved edits |
| **Reset** | posts `?/resetDay` — discards the **saved** manual override and re-derives from punches | **wrong to hide on dirty**: it acts on committed state, and is meaningful precisely when the row is *not* dirty |

Reset already has a correct visibility rule: it is rendered always but `disabled={!d.manuallyEdited}`
(verified live in P1-15 — it disables again the moment the reset lands). Hiding it on the same
condition as Save would make a committed manual override unreachable unless you first edit the row.

**Suggested resolution.** Treat them as two separate rules:
- **Save** — hidden until the row is dirty. Possibly a third "discard my unsaved edits" affordance,
  which is what a user will *expect* a button called "Reset" to do.
- **Reset** — keep it tied to `manuallyEdited`, and consider renaming it (e.g. **Re-derive**) so it
  stops reading like "undo my typing". The dialog already says "re-derived from the raw punches".

### F11c — Save all / Reset all

Worth doing, and it needs decisions rather than just a button:
- **Save all** posts every dirty row. Decide the failure mode when one row fails — all-or-nothing, or
  per-row results. The repo has a precedent to copy: the bulk timesheet review.

  **CORRECTION (11-09-26, plan B section 4).** The line above said that precedent "reports partial
  failures as a failure". It does not. Verified at `src/routes/(app)/requests/timesheets/+page.server.ts:148-155`:
  a partial returns **success** (`Approved 3 timesheets, 2 skipped.`) and `fail()` fires **only**
  when `done === 0`. So the repo precedent is *partial = success with counts*, and D9 extends it to
  *partial = success with counts AND per-row reasons*. `?/saveAll` follows the verified behaviour.
- **Reset all** is destructive across many days at once, so under this phase's own rule it needs a
  `ConfirmButton` naming the count: "N days are re-derived from punches…".
- Both need a disabled state when nothing qualifies, and a count in the label so the user knows the
  blast radius before clicking.

**Do F10 first.** F10 (the Reg/OT fields are ignored and the UI shows a value that was never stored)
changes what "dirty" even means on this table. Building a dirty-state rule on top of fields that do
not persist would encode the bug into the new behaviour.

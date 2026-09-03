---
name: spec:separation-of-duties-298-297
description: "LOCKED requirements for #298 (payroll void made visible, lock/release actors recorded) and #297 (clearer cannot finalize, self-finalize blocked), amended 18-08-26 to fold in three correctness follow-ups"
date: 17-08-26
feature: general-plans
status: LOCKED — owner answered 17-08-26; AMENDED 18-08-26 (D10, D11, D12 in; D9 folded in then DROPPED; D6 approved)
---

# Separation of Duties — #298 and #297

**STATUS: DECISIONS LOCKED.** The owner answered on 17-08-26. This document is now the
requirements record. It is frozen — INNOVATE and PLAN may proceed from it.

> **AMENDMENT 18-08-26.** Five changes, none of which alter D1–D4:
>
> 1. Three "not deciding here" follow-ups were **folded into this work** — the final-pay
>    understatement (**D9**, AC-6), the void-run/void-period divergence (**D10**, AC-7), and
>    the "who approved" sweep (**D11**, AC-8). **D9 was then dropped the same day — RESEARCH
>    disproved its premise. See the D9 record below.**
> 2. **D6 approved** — the five remaining follow-ups are filed as issues **#304 – #308**.
> 3. **D8 confirmed and given criteria.** The bar on touching an already-cleared item runs in
>    **both** directions. AC-9.1 – AC-9.5.
> 4. **D12 added** — the payslip PDF `PAYDATE:` change is accepted deliberately. AC-10.1 –
>    AC-10.3.
> 5. **D5 approved.** It was briefly load-bearing for D9; with D9 dropped it stands on its
>    own merits — the separation service has zero tests and D3, D4 and D8 all land in it.

It still contains no implementation detail. It says **what** must be true and **how we will
know**, not how to build it.

> **Read this note about the numbers.** Every user count in this document comes from the
> **development seed database**. The shape of the problem is real.
>
> **CORRECTION 18-08-26: there is no production environment.** This system has never been
> deployed live; anything deployed is for testing. So the seed database is not a sample of
> something larger — it **is** the whole population, and there are no other head counts to
> confirm. Decision 7 and Open Questions A and B below are void for that reason, not deferred.

---

## The Locked Decisions (read this first)

| # | Question | **Answer** | In scope? |
|---|---|---|---|
| 1 | Is a Super Admin break-glass, or must voiding need a second person? | **A — Detect, do not block.** Super Admin stays break-glass. Every payroll void is marked distinctly in the history so it is visible afterwards. | Yes |
| 1b | Also send an external alert? | **No.** An audit marker only. Alerting is a possible follow-up, not this work. | No |
| 2 | What about lock and release? | **B — Record who did it.** Record who locked and who released a payroll period. Fix the "who approved" record so it means exactly one thing. **No narrowing, no second-person rule.** | Yes |
| 3 | Should clearance sign-off need a second person? | **B — Whoever cleared any item may not finalize.** Per-department clearance is **rejected** for this work. | Yes |
| 4 | Block a person finalizing their own separation? | **A — Yes, block it, in this work.** Mirrors the guard offboarding already has. | Yes |
| 5 | Write separation tests first? | **APPROVED 18-08-26 — yes, characterization tests first.** | Yes |
| 6 | File the follow-up findings as issues? | **APPROVED 18-08-26.** The follow-ups not folded in are filed as issues. | Yes — done |
| 7 | ~~Confirm head counts against a live system before building?~~ | **VOID 18-08-26 — there is no production.** The seed database is the whole population. Nothing to confirm against. | No |
| 8 | May a second person touch an item somebody else already cleared? | **No — barred in BOTH directions**, clearing and un-clearing. Confirmed by the owner 18-08-26. Added after this SPEC first locked. | Yes |
| 9 | Fix the final-pay understatement? | **DROPPED 18-08-26 — the premise is false.** Folded in that morning, disproved by RESEARCH the same day. The guard already exists. See the D9 record below. | **No** |
| 10 | Fix the void-run / void-period divergence? | **Yes — folded in 18-08-26.** Voiding a run leaves loan and cash-advance balances reduced for a payroll that no longer exists, and has no status precondition. | Yes |
| 11 | Sweep the "who approved" ambiguity beyond payroll periods? | **Yes — folded in 18-08-26.** D2 fixes the payroll period. D11 checks every other place the same ambiguity exists and fixes what it finds. **Result: the sweep is CLEAN — nothing to fix beyond D2.** | Yes |
| 12 | The payslip PDF `PAYDATE:` changes for locked-but-never-approved runs. Accept it? | **Yes, accept 18-08-26.** The new value is the more correct one. Verify live before and after, record a sample, and tell Finance the printed date moves. | Yes |

**Decisions 5 and 7 were never put to the owner.** They are the orchestrator's
recommendations, recorded here so they are not lost. They are clearly marked PROPOSED
throughout and must not be treated as approved. **D6 was approved on 18-08-26** and is no
longer proposed.

> **D12** covers the payslip PDF `PAYDATE:` consequence of D2. See its criteria at AC-10.

### Why each answer was chosen

**D1 = A.** Concentrated power in the Super Admin account is **intentional**, not an
oversight — it is a break-glass account. The right control for a break-glass account is
**detection**, not prevention. Blocking it would remove the very thing it exists for. It also
blocks nobody, so no tenant can be stranded.

There is one specific requirement on how the marker behaves: it must be **absent** on
ordinary actions, not present-and-set-to-"no". This follows an existing house pattern. The
reason is practical — searching the history for overrides must return **only real overrides**,
never a long list of "this was not an override" entries.

**D2 = B.** Chosen **even though it changes no behaviour on its own.** Nothing new is
blocked, nobody is newly refused. What it does is create the record that does not exist today.
Recording who locked and who released a payroll period is the **prerequisite that makes any
future two-person rule on those steps possible at all** — without a recorded name there is
nothing to compare against. This is deliberately laying groundwork.

It also fixes a live ambiguity: the "who approved" record is currently written by two
different actions and therefore means two different things. After this work it means exactly
one thing.

**D3 = B.** Per-department clearance (the issue's Option 3) is **rejected for this work, and
the reason is data, not merit.** It is a good idea. It cannot be built today because the
underlying data does not exist — clearance item "departments" are free text that matches no
real department in the organization, and "Immediate Supervisor" is a relationship, not a
department at all. It is not being ruled out forever.

The usual objection to Option B — "a small tenant would be stranded with only one HR person"
— **was tested and found weak.** It was verified live that the **CEO can switch into JoJo
Potato and Sweetleaf and reach the separations screens with full HR authority**. A second
qualified person therefore exists for both single-holder tenants.

**D4 = A.** A person processing their own departure, computing their own final pay and
writing off their own outstanding loans is indefensible. The equivalent guard already exists
on offboarding. This closes the matching hole in the same work, not a separate issue.

### The ones folded in on 18-08-26

**D9 — DROPPED the same day. Its premise was false.** It was folded in on the grounds that
final pay "may be understated by a large factor", citing a 22×/176× trap. RESEARCH went to
read it and found **the guard already exists**, at `src/lib/server/services/separation.ts:204-211`:

```
// #189: the stored figure means something different per basis (mirror payslip-document.ts). Dividing
// an hourly/daily rate by the monthly working days would understate the day value 176×/22×.
const dailyRate =
    comp.rateType === 'HOURLY' ? rate * 8
        : comp.rateType === 'DAILY' ? rate
        : rate / WORKING_DAYS_PER_MONTH
```

The "22×/176×" in this SPEC was **quoted from that comment**. The comment describes the bug
**#189 already fixed**, not a live one. Both mirror sites agree with the guard —
`payslip-document.ts:178-186` and `payroll/types.ts:137-144` — so there is no unguarded twin
either. No code path divides a daily or hourly rate by the monthly working days.

Verified independently by the orchestrator, not taken on the research agent's word, because
dropping a decision the owner had just made needed more than one reader.

**The lesson, which is why this is written out in full rather than deleted:** a code comment
describing a *fixed* bug reads exactly like a code comment describing a *live* one. The
distinguishing evidence is the code underneath it. Check that a quoted defect is not the
epitaph of its own fix.

Three real findings survived the disproof and are recorded so they are not lost with D9:

1. **A `FINALIZED` separation with a falsy `finalPayBreakdown` is recomputed live on read** —
   `src/routes/(app)/separations/[id]/+page.server.ts:19-22`. It would then display a figure
   different from the one actually paid. Whether any such row exists needs a database count.
   **Not in scope; awaiting the owner's decision on whether to file it.**
2. **Final pay omits 13th-month pay, tax refunds and last unpaid salary** — deliberately and
   documented at `separation.ts:167-169`, because they need year-to-date payroll. This is a
   real "the leaver is paid less than they are owed" mechanism, but it is a scope question,
   not arithmetic. **Not in scope.**
3. **A latent divergence:** `separation.ts` hardcodes 22 working days and 8 hours, while
   `payslip-document.ts` and `payroll/types.ts` take injected values defaulting to the same
   numbers. Nothing passes those values today, so the three agree. If they ever become
   configurable, separation will silently keep using 22/8. **Not in scope.**

**D10 — voiding a run and voiding a period do different things.** Folded in because it is
inside #298's own blast radius: it is a payroll void, the same action D1 is making visible.
Making a void visible while it silently leaves loan balances reduced would be a half-control.
**This finding is confirmed by code reading only and has never been run.** It must be
verified live before any fix is designed. If the live check shows it does not reproduce, D10
drops out and nothing else changes.

**D8 — an already-cleared item may not be touched by a second person.** Without it, D3 is
trivially defeatable: B re-ticks A's item, becomes the clearer, wipes A's record, and can wipe
their own bar the same way. The owner confirmed on 18-08-26 that the bar runs in **both**
directions — a second person may neither re-clear nor un-clear. The reason is mechanical: the
only re-clear path in the UI is un-clear-then-clear, so a re-clear-only bar is defeated in one
extra click. A full clearance history table was offered and declined as too big for now.

**D12 — the payslip PDF `PAYDATE:` change is accepted.** D2 was meant to be record-only, but
it has one visible consequence. For a payroll run that was **locked but never approved**, the
PDF prints the lock date today and the period end date afterwards. The owner accepted the new
value on 18-08-26 because it is the more correct one. It must be verified live on both sides
with a recorded sample, and Finance must be told before it ships, not after.

**D11 — the "who approved" ambiguity may exist elsewhere.** D2 already fixes it for the
payroll period. D11 is the search for the same shape in other places, plus a fix for whatever
it finds. If the search finds nothing, D11 closes as "swept, clean" and that result is
recorded — a clean sweep is a result, not a non-event.

---

## Summary

Two places in Veent HRIS let **one person do a whole job end to end** with nobody checking
them. The owner has decided what to do about each.

For **payroll**, the answer is: leave the power where it is, but make it visible. A Super
Admin can still prepare, approve and void the same payroll — that is deliberate. What changes
is that a void now leaves an unmistakable mark in the history, and the system starts recording
who locked and who released a payroll period, which it does not record today at all.

For **offboarding**, the answer is stricter: whoever ticked any box on a leaver's clearance
checklist may no longer be the person who finalizes that separation. And nobody may finalize
their own separation.

Nothing here changes who is *allowed* to do payroll work. Only the offboarding rules add new
refusals.

---

## User Stories / Jobs To Be Done

**Payroll (#298 / D1, D2)**

- As an **auditor or reviewer**, I want to open the history and immediately see that a payroll
  was voided and by whom, so that a void can never pass unnoticed.
- As an **auditor**, I want a search for overrides to return only real overrides, so that the
  signal is not buried in a list of ordinary actions.
- As a **business owner**, I want to see who committed a payroll and who released the payslips
  as two separate recorded facts, so that a future rule about them is even possible.
- As a **Super Admin at a very small tenant**, I want to keep being able to fix a broken
  payroll when I am the only administrator, so that a control does not lock the company out of
  its own payroll.

**Offboarding (#297 / D3, D4)**

- As a **business owner**, I want the person who signs off that a leaver returned their laptop
  to be a different person from the one who closes out their final pay, so that one person
  cannot both hide a problem and settle the account.
- As an **HR admin**, I want to be told **before** I start ticking boxes that doing so will
  stop me finalizing, so that I do not lock myself out halfway through a case.
- As a **business owner**, I want nobody to be able to process their own departure and their
  own final pay, so that a leaving employee cannot pay themselves out on the way through the
  door.
- As an **HR admin at a two-person office**, I want the case to still be completable — which
  it is, because a cross-organization administrator can step in.

---

## What The User Wants (Behavioral Outcomes)

### Payroll — what changes

**A void becomes unmistakable.** When somebody voids a payroll, the history carries a distinct
mark saying an override happened and naming the person. A reviewer scanning the history sees
it without having to know what to look for.

**The mark appears only on real overrides.** Ordinary actions carry no mark at all — not a
mark saying "no". Searching the history for overrides therefore returns a short list of
genuine events, not every action ever taken.

**Nobody is newly blocked.** Anyone who could void a payroll yesterday can still void one
today. Anyone who could lock or release a period still can. No new refusals are introduced on
the payroll side at all.

**Who locked and who released is now recorded.** Today neither is recorded anywhere. After
this work, both are facts you can read back.

**"Who approved" means one thing.** Today that record is written both by the person who
approved and by the person who locked, so it currently means "the approver *or* the locker,
whichever wrote last". After this work it means the approver, and only the approver.

**No external alert.** Nobody gets notified. The mark in the history is the whole control.

### Offboarding — what changes

**Whoever cleared, cannot finalize.** If you ticked even one clearance item on a separation
case, you are refused when you try to finalize that case. The refusal explains why. Somebody
who ticked nothing on that case can finalize it normally.

**You are warned early, not at the last click.** Before an HR admin starts ticking boxes, the
screen tells them that clearing items will prevent them finalizing. They find out when it is
still a free choice, not after the work is done.

**Nobody finalizes their own separation.** A person is refused when the separation they are
finalizing is their own. Another administrator can do it for them. The refusal looks and reads
like the existing self-offboard refusal.

**Small tenants are not stranded.** For the two single-HR-holder tenants, a cross-organization
administrator can complete the case. This was verified live.

**Cases already open keep working.** Clearance checklists are frozen once a case opens.
Nothing here breaks a case that is already in flight.

### What deliberately does NOT change

- Who may prepare, approve, lock, release or void a payroll — all unchanged.
- Per-department clearance signing — not built.
- Any existing behaviour of the separation flow other than the two new refusals.

---

## Flow / State Diagram

### Payroll after this work — same doors, better records

```
   [ Prepare payroll run ]        who may: UNCHANGED
              |
              v
   [ Approve / sign off ]         who may: UNCHANGED
              |                   NOW RECORDS: the approver, and ONLY the approver
              v
   [ LOCK the period ]            who may: UNCHANGED   (still commits money)
              |                   NOW RECORDS: who locked   <-- new fact
              v
   [ RELEASE ]                    who may: UNCHANGED   (still exposes payslips)
              |                   NOW RECORDS: who released <-- new fact
              v
   [ VOID / override ]            who may: UNCHANGED
                                  NOW RECORDS: a DISTINCT override mark + who did it

   Override mark rule:
      real override  -> mark PRESENT
      ordinary action -> mark ABSENT   (never present-and-"no")
      => a search for overrides returns only genuine ones

   Still true, by design: one Super Admin can walk the whole line.
   That is the break-glass decision. You will simply see it afterwards.
```

### Offboarding after this work — two new refusals

```
   [ Separation case opened ]
              |
              v
   [ Checklist copied from template ]  -- still frozen for this case
              |
              v
   [ Screen WARNS: "clearing items will stop you finalizing" ]   <-- NEW, up front
              |
              v
   [ Person P ticks one or more clearance items ]
              |
              v
   [ Person X attempts FINALIZE ]
              |
              +-- is X the employee being separated?    --> REFUSED, reason given   <-- NEW
              |
              +-- is X the same person as any clearer?  --> REFUSED, reason given   <-- NEW
              |
              +-- otherwise -----------------------------> proceeds
                                                             |
                        +------------------------------------+
                        |
                        +--> compute final pay
                        +--> write off loans + advances as PAID
                        +--> mark employee OFFBOARDED
                        +--> disable their login
                        |
                        v
                  ( still permanent — no un-finalize. Filed as issue #304. )

   Small tenant escape hatch (verified live):
      a cross-organization administrator can act as the second person.
```

---

## Acceptance Criteria (Testable Outcomes)

These are the **locked** criteria. Every one corresponds to an answered decision.

How each is proven:

- **Fully-Automated** — a unit test in the standard suite, run every time.
- **Hybrid** — an automated test plus a live check in a real browser against the dev server.
- **Agent-Probe** — a live driven-browser check only, because the standard suite mocks the
  database away and cannot prove it.

> **Standing constraint:** the standard unit suite mocks the database. It cannot prove a
> permission hole. Every criterion about *who may do what* therefore requires a live check as
> well, demonstrating the refusal AND the success case.

### D1 — Payroll void is detected, not blocked

**AC-1.1** — When somebody voids a payroll, the history shows a distinct entry naming that
person and marking it as an override.
- proven by: `void-override-marked` (unit) + `void-override-live` (browser — the entry appears
  on the audit screen)
- strategy: Hybrid

**AC-1.2** — The override mark is **absent** on ordinary actions, never present with a "no"
value. A search for overrides returns only genuine overrides.
- proven by: `override-marker-absent-on-ordinary` + `override-search-returns-only-real`
- strategy: Fully-Automated

**AC-1.3** — When the same person both approved and voided a payroll, that is visible from the
history without cross-referencing two screens.
- proven by: `void-same-actor-visible`
- strategy: Hybrid

**AC-1.4** — Nobody is newly blocked. Every person who could void a payroll before can still
void one.
- proven by: `void-capability-unchanged` (the existing 28-case permission suite stays green)
- strategy: Fully-Automated

**AC-1.5** — No external notification is sent. The history entry is the only effect.
- proven by: `void-no-external-alert`
- strategy: Fully-Automated

### D2 — Lock and release actors are recorded

**AC-2.1** — The history records **who locked** a payroll period, as a fact readable after the
event. It records nothing of the sort today.
- proven by: `period-locker-recorded`
- strategy: Fully-Automated

**AC-2.2** — The history records **who released** a payroll period, as a separate fact from
who locked it.
- proven by: `period-releaser-recorded`
- strategy: Fully-Automated

**AC-2.3** — The "who approved" record means the approver and only the approver. Locking a
period no longer changes what that record says.
- proven by: `approver-record-unambiguous` — must include a case where a **different** person
  locks after approval, proving the approver record is unchanged
- strategy: Fully-Automated

**AC-2.4** — Nobody is newly blocked from locking or releasing. Every role that could do
either before still can, including on branch payroll.
- proven by: `lock-release-capability-unchanged` (existing payroll permission tests stay green)
- strategy: Fully-Automated

**AC-2.5** — With the new records in place, a reviewer can answer "who approved, who
committed, who released, who voided?" as **four separate names**.
- proven by: `payroll-four-actors-readable` + a live walkthrough of one full payroll cycle
- strategy: Hybrid

### D3 — Whoever cleared may not finalize

**AC-3.1** — A person who ticked at least one clearance item on a separation case is refused
when they try to finalize that case, and the refusal states the reason.
- proven by: `finalize-refuses-clearer` + a live run showing the refusal
- strategy: Hybrid

**AC-3.2** — A person who ticked nothing on that case finalizes it successfully.
- proven by: `finalize-allows-clean-actor` + the same live run showing the success
- strategy: Hybrid

**AC-3.3** — The screen warns an HR admin **before** they tick their first item that clearing
items will prevent them finalizing.
- proven by: `finalize-warns-before-clearing`
- strategy: Hybrid

**AC-3.4** — At a tenant with only one in-house HR person, the case is still completable —
demonstrated live by a cross-organization administrator completing it end to end.
- proven by: `finalize-small-tenant-live`
- strategy: Agent-Probe

**AC-3.5** — Separation cases opened before this change remain completable. Their frozen
checklists are not broken by it.
- proven by: `existing-cases-unaffected`
- strategy: Hybrid

**AC-3.6** — No per-department clearance rule is introduced. Who may tick a clearance item is
otherwise unchanged.
- proven by: `clearance-item-permissions-unchanged`
- strategy: Fully-Automated

### D4 — Nobody finalizes their own separation

**AC-4.1** — A person is refused when they try to finalize their own separation, with a clear
message.
- proven by: `finalize-refuses-self` + a live run of the refusal
- strategy: Hybrid

**AC-4.2** — A different administrator can finalize that same person's separation.
- proven by: `finalize-allows-other-for-self-case` + the same live run showing the success
- strategy: Hybrid

**AC-4.3** — The refusal matches the existing self-offboard refusal in wording style and
placement, so the two feel like one rule.
- proven by: `self-guard-consistent-with-offboard`
- strategy: Fully-Automated

**AC-4.4** — The self rule and the clearer rule are independent. Somebody who is both the
subject and a clearer is refused; somebody who is neither is allowed.
- proven by: `finalize-guards-independent`
- strategy: Fully-Automated

### D8 — A second person may not touch an already-cleared item *(criterion added 18-08-26)*

**AC-9.1** — When person A has cleared an item, person B is refused when they try to
**re-clear** it, and the refusal states the reason.
- proven by: `cleared-item-refuses-second-clearer` + a live run showing the refusal
- strategy: Hybrid

**AC-9.2** — Person B is also refused when they try to **un-clear** that same item. The bar
runs in both directions.
- proven by: `cleared-item-refuses-second-unclearer` + the same live run
- strategy: Hybrid

**AC-9.3** — Person A, the original clearer, may still un-clear and re-clear their own item.
The bar is about a *different* person, not about the item being frozen.
- proven by: `cleared-item-allows-original-clearer`
- strategy: Hybrid

**AC-9.4** — D3 cannot be defeated by the un-clear-then-clear route. A test walks the exact
two-step sequence — B un-clears A's item, then clears it — and B is still refused at both
steps and still cannot finalize.
- proven by: `d3-not-defeatable-by-reclear` (this is the reason D8 exists; it must exist as a
  named test, not as a consequence of AC-9.1 and AC-9.2)
- strategy: Hybrid

**AC-9.5** — An item nobody has cleared yet can be cleared by anybody who could clear it
before. D8 introduces no refusal on a fresh item.
- proven by: `uncleared-item-permissions-unchanged`
- strategy: Fully-Automated

### D12 — The payslip PDF date change is deliberate and recorded *(added 18-08-26)*

**AC-10.1** — For a payroll run that was **locked but never approved**, the `PAYDATE:` field
on the generated payslip PDF is captured before and after the change, as a recorded sample of
the actual rendered document — not as an assertion about the code path.
- proven by: `payslip-paydate-before-after` (a recorded pair, kept with the plan)
- strategy: Agent-Probe

**AC-10.2** — For a run that **was** approved, `PAYDATE:` is unchanged. Only the
locked-but-never-approved case moves.
- proven by: `payslip-paydate-unchanged-when-approved`
- strategy: Hybrid

**AC-10.3** — Finance is told the printed date moves on that class of payslip, **before** the
change ships.
- proven by: an explicit hand-off note to the owner, recorded in the plan closeout
- strategy: Agent-Probe

### D9 — DROPPED 18-08-26

**AC-6.1 – AC-6.5 are withdrawn.** They were written on the morning of 18-08-26 and withdrawn
the same day when RESEARCH disproved the premise. AC-6.2 required a failing test that "names
the wrong figure and the right one" — on the evidence, no such test can be written, because
there is no wrong figure.

Nothing else depends on them. **AC-5.2** (the characterization baseline) stands on its own
merits: the separation service has zero tests and D3, D4 and D8 all land in it.

### D10 — Voiding a run and voiding a period are consistent *(folded in 18-08-26)*

**AC-7.1** — The divergence is **verified live first**: void a run on a locked period and
show, from the database, whether loan and cash-advance balances stay reduced. This result
gates everything else in D10.
- proven by: `void-run-divergence-live-probe` (recorded result — reproduced or not)
- strategy: Agent-Probe

**AC-7.2** — Voiding a payroll run no longer leaves loan and cash-advance repayments applied
for a payroll that no longer exists.
- proven by: `void-run-reverses-amortization`
- strategy: Hybrid

**AC-7.3** — Voiding a run has a status precondition. An already-voided run is refused, and
the refusal states why. Today it will void a draft, an approved or an already-voided run
alike.
- proven by: `void-run-status-precondition`
- strategy: Fully-Automated

**AC-7.4** — Nobody is newly blocked from voiding a run that is in a valid state. The refusal
added by AC-7.3 fires only on states that were never meaningful to void.
- proven by: `void-run-capability-unchanged`
- strategy: Fully-Automated

**AC-7.5** — A run void and a period void are described in one place, so a reader can see what
each does and does not reverse.
- proven by: `void-semantics-documented`
- strategy: Fully-Automated

### D11 — The "who approved" ambiguity is swept *(folded in 18-08-26)*

**AC-8.1** — Every writer of an "approved by" style record in the codebase is enumerated, with
a verdict on each: correct, ambiguous, or out of scope. `JobPosting.approvedById` is a
different model and is explicitly out of scope.
- proven by: a written enumeration in the plan, with file and line for every writer
- strategy: Fully-Automated

**AC-8.2** — Any record found to mean two things is fixed the same way D2 fixes the payroll
period: the ambiguous meaning gets its own field, and the original means one thing.
- proven by: `approver-records-unambiguous-sweep`
- strategy: Fully-Automated

**AC-8.3** — A clean sweep is an acceptable result and is **recorded as such**. If no other
site is ambiguous, that finding is written down with the evidence, not left silent.
- proven by: the enumeration in AC-8.1 standing as the record
- strategy: Fully-Automated

### Applies to all of the above

**AC-5.1** — Every new refusal is proven live in a real browser, showing the refusal AND the
success case, on both sides of the change.
- proven by: `separation-live-before-after`
- strategy: Agent-Probe

**AC-5.2** *(PROPOSED — D5, not owner-approved)* — Before the separation behaviour is changed,
characterization tests exist that pin the **current** behaviour of the separation flow,
including the final-pay arithmetic. The change is then provably the only difference.
- proven by: `separation-characterization-baseline`
- strategy: Fully-Automated
- **18-08-26: approved.** It was briefly a precondition for D9; with D9 dropped it stands on
  its own — the separation service has zero tests and D3, D4 and D8 all land in it.

**AC-5.3** — Every new refusal and every guard is mutation-checked: break it on purpose and a
test must go red. A guard whose removal leaves the suite green is not proven.
- proven by: `guard-mutation-check` (recorded result, not just an intention)
- strategy: Fully-Automated

---

## Out Of Scope

Explicitly **not** part of this work:

1. **Blocking a Super Admin from voiding a payroll.** Rejected by D1. Break-glass is the point.
2. **Any external alerting or notification on override.** Rejected by D1b. Possible follow-up.
3. **Narrowing who may lock or release a payroll period.** Rejected by D2 — recording only.
4. **Any second-person rule on lock or release.** Rejected by D2. This work only creates the
   record that would make such a rule possible later.
5. **Per-department clearance signing (#297 Option 3).** Rejected by D3 — **because the data
   does not exist**, not because the idea is wrong. Reviving it would need real department
   mapping, named signers per department, and a definition of "Immediate Supervisor", which is
   a relationship rather than a department.
6. **Any change to who may prepare a payroll, or to who may tick a clearance item.**
7. **Fixing that JoJo Potato and Sweetleaf have no Super Admin.** A staffing matter, not code.
8. **Building an un-finalize, amend or reversal path for separations.** Filed as issue #304.
9. **Fixing the risk that final pay may be understated by a large factor.** Folded in as D9
   on 18-08-26 and **dropped the same day — the risk does not exist.** The guard is already
   in the code. Out of scope, and there is nothing to file either.
10. **The unreliable end-to-end browser suite.** A known problem, not solved here.
11. **Reworking the roles and permissions model.** No new mechanism is invented.
12. **Retro-fixing historical records.** No back-filling of past payrolls or separations.
13. ~~**Filing any GitHub issue.**~~ **D6 was approved 18-08-26.** The follow-ups not folded in
    are filed. No *further* issue may be filed without a fresh approval.

---

## Constraints

1. **Detection, not prevention, on the payroll side.** No payroll operation may gain a new
   refusal. If a build option would block anybody who can act today, it is out.
2. **The override marker must be absent on ordinary actions**, never present-and-"no". This is
   an existing house pattern and the reason is that a search must return only real overrides.
3. **Fail loudly and early on the offboarding side.** Where a person will be refused, tell them
   before they invest work — not at the final click, and never with an unexplained refusal.
4. **Only established shapes.** The product already has three ways of handling this class of
   problem — block the second person, ask a different person to confirm, or allow it and record
   it. A fourth must not be invented. This work uses "record it" for payroll and "block the
   second person" for offboarding.
5. **Permissions describe *what*, never *whose*.** Any rule about "the same person" needs a
   recorded name to compare against. This is exactly why D2 records the lock and release
   actors.
6. **A passing test suite is not proof.** The standard suite mocks the database, so it cannot
   prove a permission hole. Anything privileged must be proven in a real browser, refusal and
   success, before and after. Every guard must be mutation-checked.
7. **Finalizing a separation is permanent.** There is no un-finalize, no amend, no override.
   Any change near it must not add a new way to reach it accidentally.
8. **Clearance checklists are frozen once a case opens.** Everything here must work for cases
   already in flight.
9. **Head counts in this document come from development seed data.** Non-blocking under the
   locked decisions. **There is no production to compare them against** — see the correction
   at the top.
10. **Merges go to a staging branch, so `Closes #N` never fires.** #298 and #297 must be
    **closed by hand** once this ships.
11. **No GitHub issue may be filed without explicit owner approval.** Granted once, on
    18-08-26, for the follow-ups listed below. It does not carry to anything else.
12. **D10 is unproven until it is run.** No fix may be designed for it from code reading
    alone. AC-7.1 gates the rest of D10.
13. **Nothing may retro-change a finalized separation.** Held over from the dropped D9
    because it is a good standing rule near this code, not because D9 needs it.

---

## Open Questions

**None blocking.** INNOVATE and PLAN may proceed.

Two notes remain, both downgraded to non-blocking:

| # | Note | Status | Why non-blocking |
|---|---|---|---|
| A | ~~Do head counts match a live system?~~ | **VOID 18-08-26** | There is no production. The seed database is the whole population. |
| B | ~~Does the cross-organization administrator path hold on a live system?~~ | **VOID 18-08-26** | Same reason. It was verified live in development, which is the only environment there is. AC-3.4 proves the mechanism regardless. |

**D5 and D6 were approved on 18-08-26.** One orchestrator recommendation is still **PROPOSED,
not owner-approved**: D7 (head counts non-blocking). It does not block this SPEC.

### Answered 18-08-26 — were carried over from 17-08-26

These three were deferred by the owner at the end of 17-08-26. All three are now answered and
folded into the decisions above. Recorded here so the reasoning is not lost.

| # | Question | Answer |
|---|---|---|
| i | **D8 "both directions"** — the plans bar a second person from touching an already-cleared item in *either* direction. That was the plan agent's reading, not the owner's words. | **Confirmed — both directions.** Now D8, proven by AC-9.1 – AC-9.5. AC-9.4 names the defeat route explicitly. |
| ii | **D8 had no acceptance criterion** — added after this SPEC first locked, shipping with gates in the #297 plan instead. | **Fixed.** AC-9.1 – AC-9.5 written into this record. The #297 plan's own gates stay; they are now the implementation of these criteria, not a substitute for them. |
| iii | **The payslip PDF `PAYDATE:` field changes** for locked-but-never-approved runs. Chain `payslip-document.ts:282` → `payslip-pdf.ts:156`: it prints the **lock date** today and the **period end date** after D2. No Svelte component renders `approvedAt` at all — the PDF is the only render, which is why grepping components alone missed it. | **Accepted.** Now D12, proven by AC-10.1 – AC-10.3. Finance must be told before it ships. |

---

## What We Are NOT Deciding Here

**Resolved 18-08-26.** D6 was approved. Three items were folded into this work; five were
filed as issues; one is not a code change. Nothing here is still pending a filing decision.

### Folded into this work

| Was | Now |
|---|---|
| 2 — Final pay may be understated by a large factor | **D9 — folded in, then DROPPED 18-08-26.** The premise was false; see the D9 record above. Not re-filed: there is no defect to file. |
| 3 — Voiding a run and voiding a period do different things | **D10**, AC-7.1 – AC-7.5 |
| 5 — The "who approved" record means two different things | **D11**, AC-8.1 – AC-8.3 |

The full text of former item 3, kept because it is the evidence D10 rests on:

> Voiding a **run** only flips its status — it does **not** reverse loan and cash-advance
> repayments and does **not** touch the period. So voiding a run on a locked period leaves the
> period locked and the balances still reduced: **money stays deducted for a payroll that no
> longer exists.** Voiding a **period** does reverse those balances. Separately, voiding a run
> has **no status precondition at all** — it will void a draft, an approved, or an
> already-voided run alike — whereas voiding a period refuses one that is already voided.
>
> **Confidence: confirmed by reading the code directly. NOT verified live.** Treat it as a
> strong lead, not a proven defect, until somebody runs it.

That confidence caveat is now Constraint 12 and gate AC-7.1.

### Filed as issues (18-08-26)

| Was | Issue | Title |
|---|---|---|
| 1 | **#304** | No way to undo a finalized separation |
| 4 | **#305** | Zero test coverage for the entire separation service |
| 6 | **#306** | `ClearanceItem.department` is free text matching no real department |
| 8 | **#307** | External alerting when a payroll override happens (deferred by D1b) |
| 9 | **#308** | Sweep self-action guards across the other destructive flows |

### Not filed

7. **Two tenants cannot void a payroll at all**, having no Super Admin. **A staffing question
   for the owner, not a code change** — deliberately not filed, because there is nothing for a
   developer to do with it. It stays recorded here.

---

## Background / Research Findings

The facts below shaped this document. They come from two completed research passes plus live
verification in the development environment.

**#298 — payroll**

- One account type holds all three of: prepare payroll, sign off on money, and override a
  finalized payroll. So one person can do the whole cycle. **The owner has confirmed this is
  intentional** (D1 = A).
- The override permission was deliberately made narrow (one role only) as a *narrowness*
  control, not a separation-of-duties control. The code comment says so. This is why the issue
  was a question rather than a bug.
- The step that **commits money** is "lock", and the step that **exposes payslips** is
  "release". Both are protected only by the ordinary payroll permission, which the Manager
  role holds. Neither is the approval step the issue asks about. **The owner chose to record
  the actors on both without narrowing either** (D2 = B).
- One shared record says "who approved", and it is written both by the approver and by whoever
  locked the period. Its meaning is ambiguous today. **In scope to fix** (D2).
- Nothing records who voided. The payroll period records no person at all.
- Development seed counts: Veent has 1 Super Admin, 1 CEO, 1 Payroll Officer, 0 Finance. JoJo
  Potato and Sweetleaf have 0 Super Admins.
- Verified live: a CEO can switch into JoJo and Sweetleaf and act there. But the CEO does not
  hold the void permission. Under D1 = A this no longer matters — nobody is blocked.
- 28 tests cover *who may void*. None compare two people. Under D1 = A none need to; they must
  stay green (AC-1.4).

**NEW FINDING — voiding a run and voiding a period are not the same operation**

- Voiding a payroll **run** only flips that run's status. It does **not** reverse loan or
  cash-advance repayments, and it does **not** touch the period.
- Consequence: voiding a run on a **locked** period leaves the period locked and the employee
  balances still reduced. Money stays deducted against a payroll that no longer exists.
- Voiding a payroll **period** does reverse those balances.
- Voiding a run has **no status precondition at all** — a draft, an approved, or an
  already-voided run are all voided alike. Voiding a period refuses one that is already voided.
- Both are reachable by the same capability holder.
- **Confidence: confirmed by reading the code directly. NOT verified live.** Do not overstate
  it. **Folded into this work on 18-08-26 as D10** — AC-7.1 makes the live check a gate on
  everything else in D10.

**#297 — clearance**

- Ticking a clearance item and finalizing a separation are protected by the same permission,
  and nothing compares the two people. **Now in scope to fix** (D3 = B).
- The issue offered three answers: do nothing; whoever cleared an item cannot finalize; each
  item must be cleared by that item's department. **The second was chosen.**
- **Not in the issue:** offboarding someone already refuses if you are offboarding yourself.
  Finalizing does the same destructive thing and has no such guard — a person can finalize
  their own separation. **Now in scope to fix** (D4 = A).
- **Not in the issue:** finalize is irreversible. It zeroes outstanding loan and cash-advance
  balances to paid, per-loan detail survives only inside a stored summary, the employee is
  offboarded and locked out, and there is no in-app remedy. **Out of scope; filed as issue
  #304.**
- **Not in the issue:** the third option needs data that does not exist. Clearance item
  "departments" are free text (IT, HR, Admin, Finance, Immediate Supervisor) that do not match
  the organization's real departments (Human Resources, Software Developers, Accounting).
  "Immediate Supervisor" is a relationship, not a department. There is no department-head
  concept anywhere. The *shape* is proven elsewhere — job postings already use a
  per-department signer list with an "any HR user" fallback — but the clearance data is absent.
  **This is why Option 3 was rejected: missing data, not a bad idea.**
- The clearance checklist is seeded from an editable template when a case opens and is frozen
  for that case thereafter. Anything built must work for cases already in flight (AC-3.5).
- Development seed counts: JoJo Potato and Sweetleaf each have exactly one active in-house user
  with HR authority. **But it was verified live that the CEO can switch into both and reach
  separations with full HR authority** — so a second person does exist. **This is what made the
  small-tenant stranding objection weak, and is why D3 = B was safe to choose.**
- **Zero tests exist for the entire separation area** — all functions, all screens, including
  the final-pay arithmetic. This is why D5 was proposed, and it is confirmed: no test file in
  the repo imports the separation service. **Correction 18-08-26:** the "documented risk of
  understating pay by a large factor" originally recorded here was a misreading of the #189
  guard's comment. The risk is not live. See the D9 record. Filed independently as **#305**.

**House rules that apply**

- The product already has exactly three established ways of handling this class of problem; a
  fourth must not be invented. This work uses two of the three.
- Merges go to a staging branch, so issues are **closed by hand**.
- The standard test suite mocks the database and cannot prove a permission hole. Live
  verification with negative controls is required for anything privileged, and every guard must
  be mutation-checked.

# Draft note for Finance — the PAYDATE on payslips

**Status: CLOSED 18-08-26 — a record, not a pending action.**

This began as a note to send Finance before shipping. It was overtaken: the owner took the question
to HR, and HR answered with a rule rather than a concern —

> _"The paydate should be on the day that the payslip was released."_ — HR, 18-08-26

and the owner confirmed that **"released" means the day the payslips were given to the employees**,
which is exactly what `PayrollPeriod.releasedAt` records. So the stakeholder consultation happened,
it produced a requirement, the requirement is built, and there is nothing left to notify anyone
about. AC-10.3 is satisfied by that exchange.

The message below is kept because it is the clearest plain-language statement of what changed and
why. Send it if it is ever useful; it is not owed to anyone.

---

## The message

> **Heads-up: the PAYDATE line on payslips is changing.**
>
> **What it will show.** PAYDATE will be **the day the payslip was released** — the day it became
> available to the employee.
>
> **What it shows today.** The date the payroll was _approved_, or in some cases the date it was
> _locked_. That field was being written by two different steps, so it did not always mean the same
> thing. This makes it mean one thing.
>
> **So the date will move on payslips going forward.** Release normally happens a little after
> approval, so expect the printed date to be the same or slightly later than it is today.
>
> **What does NOT change.**
>
> - **No amount changes anywhere** — not gross, not deductions, not net pay.
> - Nothing is recalculated.
> - No payslip already issued is edited. This only affects how the date is worked out from now on.
>
> **One exception you may notice.** A small number of older payrolls were approved directly, before
> the current release step existed. Those never had a release date, so their PAYDATE will print
> **blank**. In our test system that is 7 payslips under 1 old payroll. We can put the old approval
> date back on those instead — tell us if a blank field is a problem for you.
>
> **What we need from you.** Please tell us if any external filing, remittance, or report keys off
> the PAYDATE. If it does, say so before this goes live.

---

## Background — for you, not for Finance

**Where the rule came from.** HR, 18-08-26: _"The paydate should be on the day that the payslip was
released."_ That superseded decision D12, which had only been about a narrower subset.

**What it replaced.** `payslip-document.ts` used to read:

```ts
payDate: run.approvedAt ? shortDate(run.approvedAt) : shortDate(run.periodEnd)
```

`approvedAt` was the problem. It was written both by a genuine approval **and** by a period lock, so
it meant "approver or locker, whichever wrote last" (#298 D2). It now reads the period's
`releasedAt`, which has exactly one writer and one meaning.

**Verified live, both cases:**

| Case                                    | Rendered PDF                         |
| --------------------------------------- | ------------------------------------ |
| Normal payslip, period released         | `PAYDATE: 8/18/26` — the release day |
| Legacy run approved directly, no period | `PAYDATE:` blank                     |

**The blank case is real, not theoretical.** A payslip is visible when the run is `APPROVED` **or**
its period is `RELEASED` (`runs.ts:17`). The first path predates the release lifecycle and those
runs have no period at all — so there is no release date to print. The dev database has **1 such
run with 7 entries**.

You chose blank over a fallback, on the reasoning that a payslip that never went through a release
has no release date to show. That is defensible. The alternative is a two-line change: fall back to
`approvedAt` for those legacy runs only, which for them was a genuine approval. Still open if you
change your mind.

**Is "released" the same as "paid"?** Asked and answered, 18-08-26: the owner confirmed release
means **the day the payslips were given to the employees**. That is precisely what `releasedAt`
records, so there is no third date and no gap. Do not reopen this.

**Related.** `process/general-plans/active/phase0-evidence_18-08-26.md` (the before/after captures),
SPEC decision D12, AC-10.1 / AC-10.2 / AC-10.3.

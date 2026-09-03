# Voiding payroll: a RUN void vs a PERIOD void

There are two voids and they are not the same operation. This is the one place that says what each
one does. Both need the `OVERRIDE_FINALIZED` capability, which today only `SUPER_ADMIN` holds.

|                                           | **Void the RUN**                                                    | **Void the PERIOD**                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Refuses                                   | a run that is already `VOIDED` (HTTP 400)                           | a period that is already `VOIDED` (HTTP 400)                                                    |
| Reverses loan + cash-advance amortization | yes — when the run's period was `LOCKED` or `RELEASED`              | yes — when the period was `LOCKED` or `RELEASED`                                                |
| Run status after                          | `VOIDED`                                                            | `VOIDED`                                                                                        |
| **Period status after**                   | **unchanged — a locked period stays `LOCKED`**                      | `VOIDED`                                                                                        |
| How you reach it                          | `POST /api/v1/payroll/[id]?action=void` — **there is no UI button** | the Void button on the payroll periods page, or `POST /api/v1/payroll/periods/[id]?action=void` |

Both call the same `reverseAmortization` (`src/lib/server/services/payroll/amortization.ts`), so the
money side is one implementation, not two.

## The single remaining difference: the period status

Voiding a run leaves the period `LOCKED`. The payroll still looks live on screen. If the intent was
to reopen the period — re-import attendance, re-generate — you must void the **period**, separately.
This is deliberate: making a run void unlock or void its period is a larger behaviour change that
has not been decided.

## What a RUN void does

1. Refuses if the run is already `VOIDED`. Voiding twice would credit the amortization back a
   second time. `DRAFT` and `APPROVED` runs still void — that was always allowed and stays allowed.
2. If the run's period is `LOCKED` or `RELEASED`, reverses the amortization committed at lock:
   loan balances are restored from the recorded `loan_payments` rows and cash-advance balances from
   the recorded `cash_advance_payments` rows (both are then deleted).
3. Flips the run to `VOIDED`. Steps 2 and 3 are one transaction.
4. Leaves the period status alone.
5. Writes a `PAYROLL_VOID` audit entry, marked if the voider is the same person who approved.

A run with **no period** (`periodId` is nullable and real rows have it null) voids normally with no
reversal — amortization is only ever applied at a period lock, so there is nothing to reverse.

> **#309 — fixed.** A void used to credit a cash advance back at the full frozen deduction line
> while lock had only taken `min(installment, live balance)`, and forced the advance to `ACTIVE`
> regardless. Measured live: ₱100 borrowed and fully repaid came back as ₱300 owed. Both arms now
> reverse recorded payment rows, so neither can over-credit.
>
> One consequence of the ledger arriving late: an advance amortized by a payroll locked **before**
> `cash_advance_payments` existed has no rows to reverse, so voiding it credits back nothing. No
> such payroll exists in any database (the app has never been deployed), so there is no backfill.

## What a PERIOD void does

1. Refuses if the period is already `VOIDED`.
2. If the period was `LOCKED` or `RELEASED`, reverses the same amortization, the same way.
3. Flips **both** its run and the period to `VOIDED`, in one transaction.

## What neither does

No backfill of historical voids. No un-void. No notification to anyone. No re-generation or
withdrawal of payslips already rendered.

**Separations DO have an undo (#304), and that is not a contradiction.** A payroll void is
terminal because the exit exists elsewhere: a fresh run can simply be re-created. A separation
finalize has no such re-do path — it offboards a person, disables their login and writes off their
debts — so `undoSeparation` (`src/lib/server/services/separation.ts`) is the exit, gated on the
same `OVERRIDE_FINALIZED` capability and audited under its own `SEPARATION_UNDO` action.

# Phase 05 owner pass — live results (11-09-26, branch 47252f9, dev 5173)

| # | Site | Account | Cancel | Confirm | Verdict |
|---|---|---|---|---|---|
| 1 | Offboard | hr@veent.ph | dialog closed, focus back on trigger, card still present, row still ACTIVE / endDate null / login active | banner `Employee offboarded.`, card gone, row OFFBOARDED / endDate 2026-09-30 / login disabled | **PASS** |

Fixture P1-1: employee `cmtw8sl9c0027qea2c6dqro2k` (EMP-1115, Testcase Prob1789087986103), an e2e
leftover. Restore with the Cleanup section when the pass is done.

Extra checks recorded for P1-1: empty Last Day opens **no** dialog and fires the native required
bubble (`Please fill out this field.`); dialog `role="alertdialog"`; buttons `Cancel` / `Offboard`.
| 2 | Period void | admin@veent.ph | dialog closed, focus back on trigger, badge still Open, row still OPEN in DB | toast `Period voided.` fires at ~150ms and holds past 6s; badge flips to Voided; Void trigger gone; DB VOIDED | **PASS** |

P1-2 fixtures: `p5-void` (Sep 16-30 2026) and `p5-void-2` (Oct 1-15 2026), both now VOIDED. Created
during the pass; the only pre-existing period was already VOIDED so its Void trigger does not render.
Date ranges had to differ because the dialog's own warning is enforced.

P1-2 doc corrections: success is reported by a **toast**, not the Banner the script predicted, and
there is no duplicate here (unlike F1 on the employee page). Measured by sampling the polite live
region every 150ms from the moment of the confirm click.

P1-2 gap: the period carried **no generated payroll run**, so the message's "amortization is credited
back to the employees" clause was NOT exercised. Only the status flip was proven.
| 3 | Period release | hr@veent.ph | dialog closed, badge still Locked, DB LOCKED with `releasedAt` null | toast `Period released.`, badge flips to Released, `releasedAt` set, 221 PAYSLIP notifications written for 221 entries | **PASS** |

P1-3 fixture: `p5-release` (Oct 16-31 2026), opened → generated (₱2,845,439.35, 221 entries) → locked.
Ran as `hr@veent.ph` to prove the non-admin path.

P1-3 free positive control: as `hr@veent.ph` the row offers **Release, Detail** and **no Void**; as
`admin@veent.ph` it also offered **Void**. Release is `MANAGE_PAYROLL`, void is SUPER_ADMIN only.

P1-3 doc correction: success is a toast, not a Banner (same as P1-2).

P1-3 observation — OWNER RULED FINE 11-09-26, do not re-raise: the releasing user also receives the
employee-facing `Your payslip ... is available.` toast, because they hold a payslip in the run they
just released. Working as intended.
| 4 | Run void (verify-only) | admin@veent.ph | dialog verified verbatim; cancel left the Aug 1-15 2026 run COMPUTED | **NOT EXERCISED** by design — the two available runs are both still needed (Oct 16-31 for P1-5) | **PASS (dialog)** |

P1-4 is the model message every other site copies, and phase 04's ConfirmButton rebuild is what could
have broken it. Verified unchanged: title `Void this payroll run?`, confirm `Void run`, message
verbatim. Run status is independent of period status — the Oct 16-31 run still reads COMPUTED with a
Void trigger even though its period is RELEASED.
| 5 | Net-pay override | hr@veent.ph | dialog closed, panel still open with typed value `21000` and reason `p5-override`, DB still ₱20,785.37 | netPay → ₱21,000.00, row re-renders, run gains **Has overrides** — but **NO success message at all** | **FAIL (F2)** |

P1-5 fixture: entry `cmtw9ysv9003tdde5kz2twbfs` (System Admin, EMP-001) in the Oct 16-31 run
`cmtw9ypbz000rdde5fp0agyhc`. Baseline ₱20,785.37 → ₱21,000.00, delta +₱214.63.

P1-5 dialog copy verified exact, including both peso figures and the signed delta, and the helper
line moved from `No change` to `+₱214.63 vs ₱20,785.37`. `min="0"` and `step="any"` present.
The WRITE and the COPY pass; only the success report is missing. Owner wants a toast — see F2.
| 6 | DOLE multipliers | admin@veent.ph | unchanged save → no dialog + banner (correct); changed save → dialog verbatim, `whitespace: pre-line` confirmed, exactly 2 rows; cancel left DB at 1.25 / 1.3 | **NOT REACHED** — stopped at the cancel half, F3 must be fixed first | **FAIL (F3)** |

P1-6 baseline (restore target): overtime 1.25, overtimePremium 1.30, nightDiff 0.10, restDay 1.30,
regularHoliday 2.00, specialHoliday 1.30. **DB is untouched** — no confirm was run.
| 7 | Statutory Confirm | ceo@veent.ph | dialog verbatim; cancel left proposal PENDING and cap ₱200 | proposal APPLIED + `decidedAt` set, cap → ₱99,999, pending card gone, Banner `Proposal applied to the live rates.` | **PASS — owner wants it as a toast (F6)** |
| 9b | Statutory submit | hr@veent.ph | n/a | proposal created PENDING; dialog named `You are submitting: Pag-IBIG`; banner `Change submitted for CEO approval.` | **PASS (copy) / F5 + F6** |

P1-7 also confirmed F5 LIVE: applying a Pag-IBIG-only proposal rewrote `taxBrackets` baseTax from
10833.33/40833.33/200833.33 to 10833.5/40833.5/200833.5 org-wide. Backup at
`scratchpad/statutory-backup-org_seed.json` — RESTORE REQUIRED at cleanup.

CORRECTION 11-09-26: I first recorded P1-7's confirm as reporting nothing. Wrong — my detector
required `[role=status][aria-live=polite]` and the Banner has `role="status"` with no `aria-live`.
A screenshot caught it. P1-5's "reports nothing" was then re-checked against source and STANDS
(`payroll/[id]/+page.svelte` has no success surface at all). P1-2 and P1-3 toasts were directly
observed and are unaffected.
| 8 | Statutory Reject | ceo@veent.ph | dialog verbatim; cancel left the proposal PENDING | proposal REJECTED + `decidedAt` set, card gone, Banner `Proposal rejected.` at ~150ms; live cap stayed ₱88,888 and did NOT become ₱77,777 | **PASS — banner should be a toast (F6)** |

P1-8 fixture: a third proposal at cap 77777, deliberately different from the applied 88888 so the
"live rates stay as they are" clause could be proven positively rather than by absence.
Detector fixed for this stage: sampled the toast container AND `role=status` nodes without
`aria-live` (the Banner shape).
| 9a | Statutory save (manage) | admin@veent.ph | dialog named `You are changing: SSS, Pag-IBIG.` while standing on the Pag-IBIG tab — the phase's highest-value assertion; cancel kept the edits in the inputs (cap still 66666) and left DB at 88888 / eeShare 180 | not run — 9b already covered the write path, and the live table is dirty pending restore | **PASS (cancel half)** |
| 10 / P4 | Statutory dirty guard | admin@veent.ph | in-page tab switch fired NO dialog (correct); nav link CANCELLED the navigation and named `You have unsaved rate changes on: SSS.` while standing on Pag-IBIG; `Stay on this page` kept the URL and the 188 edit | saved via Save changes → Banner `Statutory rates saved.`, DB eeShare 188; clicking Dashboard again navigated with NO guard — baseline correctly re-seeded | **PASS** |

P1-10 note: this is the only site that overrides `cancelText` — buttons read `Stay on this page` /
`Leave without saving`, confirmed live.
P1-10 check-my-own-check: the "edit intact" probe first read FALSE because SSS inputs are not
rendered while the Pag-IBIG tab is active. Switched tabs and the 188 was there. Not a defect.
| 11 | Release review | hr@veent.ph | dialog verbatim, names `Elena Employee`; cancel left `releasedAt` and `releasedByEmployeeId` both null | **toast** `Evaluation released to the employee.` at ~150ms (this site passes `successMessage`), trigger replaced by `Released by Hannah HR on September 11, 2026`, DB has both columns set | **PASS** |

P1-11 is the ONLY site so far that reports with a TOAST rather than a Banner, because it passes an
explicit `successMessage` to ConfirmButton. It is the shape F6 asks for everywhere else.
P1-11 fixture chain (none of it existed): created template `p5-review-template`
(`cmtwc9fnu01fpdde5fnxlguug`), assigned it to Elena Employee `cmszfa1z8004k1174fakk59eg` by SQL,
then ran `scripts/generate-review-cycles.ts --force` which opened 1 review
`cmtwcb5yn00082pu4203l2p3q` in a new "Jul–Aug 2026" cycle for org_seed.
P1-11 note: `Released by ... on ...` renders only after a reload; the button simply disappears on
the optimistic update. Minor, not filed.
| 12 | Deactivate login | admin@veent.ph | dialog verbatim, names the email and says the records are untouched; cancel left `isActive` = t | **toast** `Login deactivated.` at ~150ms; badge ACTIVE → INACTIVE; trigger becomes Activate; DB `isActive` = f | **PASS** |
| 12b | Activate login | admin@veent.ph | n/a | **NO dialog appeared** (asserted over 4.2s); toast `Login activated.`; badge back to ACTIVE; DB `isActive` = t | **PASS** |

P1-12/12b: the asymmetry is correct and deliberate — only the destructive direction confirms. This
site reports with a TOAST on both directions, like P1-11 and unlike the statutory page.
Account restored to ACTIVE by 12b itself; no cleanup owed.
| 13 | Separation finalize | admin@veent.ph (cleared by hr@veent.ph) | dialog verbatim; cancel left status CLEARED, employee ACTIVE, login active | Banner `Separation finalized. The employee is now offboarded and their login is disabled.`; **all three promised effects verified in DB**: status FINALIZED + `finalizedAt` set, `employmentStatus` OFFBOARDED, `isActive` false; finalize card gone | **PASS — banner, owner wants toast (F6 pattern)** |

P1-13 fixture chain (none existed): created separation `cmtwcja1e01g5dde5j4q8im8b` for
`EMP-1114 / cmtw8sisw001mqea2iw7tvc10` (e2e residue employee, disposable), reason marked
`p5-sep fixture for phase 05 finalize and undo`. Cleared all 6 clearance items as `hr@veent.ph` so
#297 separation-of-duties is satisfied, then finalized as `admin@veent.ph`. The finalize trigger was
enabled with an empty `#finalize-bar`, confirming the guard was cleanly satisfied rather than forced.
| 14 | Separation undo | admin@veent.ph | UNTICKED → base message only, `RE-OPENED` clause absent (asserted negatively); TICKED → base + blank line + `Clearance will also be RE-OPENED: the case returns to OPEN and every item goes back to pending.`, `whitespace: pre-line` confirmed; cancel left status FINALIZED / OFFBOARDED / login off | Banner `Finalization undone. The case is back to OPEN and the employee's login is enabled again.` — and **every clause verified**: status FINALIZED→OPEN, `finalizedAt` cleared, employee OFFBOARDED→ACTIVE, login re-enabled, all 6 clearance items CLEARED→PENDING | **PASS — banner, owner wants toast (F6 pattern)** |

P1-14 is the phase's only conditional message and both branches were proven, the absent one
negatively. The banner interpolates the live status (`back to OPEN`) correctly for the ticked path.
P1-14 gap: the employee had NO loans or cash advances, so the message's "restores the loan and
cash-advance balances" clause was NOT exercised. Same gap shape as P1-2's credit-back clause.
| 15 | Attendance reset | hr@veent.ph | dialog message is EXACTLY phase 05's copy (the string kept over staging's during the rebase); cancel left 7.00 / manuallyEdited t | **toast** `Day reset to the derived values.`; Reset trigger back to disabled; DB `manuallyEdited` f and hours re-derived from punches | **PASS (employee view)** |

P1-15 verifies the rebase conflict resolution LIVE: `The hours you corrected for this day are thrown
away and re-derived from the raw punches. Anything typed by hand is lost.` — phase 05's copy, not
staging's. Staging's `disabled={!d.manuallyEdited}` also survived: Reset renders always but is
DISABLED until the day is manually edited, and returns to disabled after the reset. Both halves of
that resolution are confirmed working together.
P1-15 SCRIPT CORRECTIONS: title is `Discard the manual edit?` (not "this"), and the confirm button is
`Reset` (not "Discard and re-derive"). Source `attendance/+page.svelte` confirms both.
P1-15 NOT DONE: the team view (`?view=team`) second render site was not walked.
| 16 | Bulk reject (verify-only) | admin@veent.ph (see deviation) | typed note enabled the confirm; **Cancel submitted nothing** — still 6 PENDING | toast `Rejected 2 requests.`, selection cleared, 2 rows PENDING→REJECTED | **PASS** |

P1-16 assertions all held: `role="dialog"` NOT alertdialog, **zero** `[role=alertdialog]` nodes in
the whole flow, title `Reject 2 selected requests`, sub-line
`The note below is applied to every selected request.`, textarea present, and the confirm button
**disabled while the textarea is empty** — a reason prompt, not a yes/no. ReasonDialog is untouched
by phase 05 and still behaves.
P1-16 DEVIATION: ran as `admin@veent.ph`, not `approver@veent.ph`. The approver's queue is EMPTY —
all 6 pending requests are raised by Vince Verifier and Maria Manager in the same org (`org_seed`),
so the approver is simply not the actor at their current chain stage. Not a bug, but the script's
account is wrong for this data; either seed a request that reaches the approver, or change the
script's account.

---

## DIRTY DEV DATABASE — restore before or during remediation

The pass wrote real rows. None of it is cleaned up yet.

| What | Current state | Restore |
|---|---|---|
| **Statutory tax table** (`statutory_rate_configs`, `org_seed`) | `taxBrackets` baseTax drifted to 10833.5 / 40833.5 / 200833.5; `pagibigCap` = 88888.00; `sssBrackets[0].eeShare` = 188 | `phase-05-owner-pass_statutory-backup-org_seed.json` holds the pre-pass values |
| **Net-pay override** entry `cmtw9ysv9003tdde5kz2twbfs` (System Admin, Oct 16-31 run) | `netPay` = 21000.00, was 20785.37; run flagged "Has overrides" | reset netPay, note `p5-override` |
| **Employee EMP-1115** `cmtw8sl9c0027qea2c6dqro2k` | OFFBOARDED, endDate 2026-09-30, login disabled | was ACTIVE / null / enabled |
| **Separation** `cmtwcja1e01g5dde5j4q8im8b` (EMP-1114) | OPEN, 6 clearance items PENDING, reason `p5-sep fixture...` | delete, or leave as a fixture |
| **Payroll periods** `p5-void`, `p5-void-2` | VOIDED, no runs | leave or delete |
| **Payroll period** `p5-release` | RELEASED, 221 entries, 221 PAYSLIP notifications | leave |
| **Statutory proposals** ×3 | 2 APPLIED, 1 REJECTED | leave as history |
| **Performance template** `p5-review-template` + review `cmtwcb5yn00082pu4203l2p3q` | review RELEASED; template assigned to Elena Employee `cmszfa1z8004k1174fakk59eg` | unassign template if unwanted |
| **Requests** ×2 | REJECTED, note `p5-bulk-reject note` | leave |
| **Attendance day** `cmttjo1gk004by5htsgj50chb` | reset to derived, `manuallyEdited` f — already clean | none |

Cleanup rule: target these rows by id/marker only. Never "delete everything this account owns".

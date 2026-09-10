---
name: report:coderabbit-pr13-review
description: "CodeRabbit CLI review of PR #13 (phase 04 feedback contract), 28 findings verified against source one by one — 4 blocking defects fixed, 6 non-blocking fixed, 2 declined with reasons, 9 doc-accuracy nits filed to backlog"
date: 10-09-26
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-04-feedback-contract_PLAN_03-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "04"
status: COMPLETE
---

# CodeRabbit review — PR #13 (phase 04: the feedback contract)

**Source:** `coderabbit review --agent --base staging` against PR #13, head `3aa9fb7`, base
`staging`, 28 findings. The full per-finding review document (`docs/code-review-pr13-2026-09-10.md`)
was deleted after this pass — its verdict, evidence, and fixes are carried here so the record
survives.

**TL;DR.** 28 findings, each re-verified against source before being acted on (a tool grade is a
hypothesis, not a verdict — see lesson below). 4 blocking + 6 non-blocking defects were real and
are now fixed, verified live where the defect was behavioural. 2 tool findings did not survive
verification and were declined with reasons. 9 documentation-accuracy nits remain open, filed to
backlog. `S3` (timesheet card inline actions) stays `CONDITIONAL` — unrelated to this review, its
own backlog note already tracks it.

## Fixed (verified against source, then fixed, then re-verified)

| Finding | What | Commit |
|---|---|---|
| F03 (blocking) | Attendance `saveTimesheet` returned a server message and rendered nothing — `submitFeedback({ success: null })` with no page banner | `6323995` |
| F07 (blocking) | Dismissing a hovered toast via "Dismiss all" or a focused ✕ paused the toaster permanently — `pausable().destroy()` removed listeners but never called `resumeToasts('hover')` | `b880e41` |
| F15 (blocking) | `toggleAll` on `/requests/approvals` cleared a partial selection instead of selecting all — used `selected.length > 0` instead of the page's own `allSelected` derived | `b880e41` |
| F05 (non-blocking) | Dashboard posting-decision errors rendered twice — default toast plus the page's own scoped banner | `b821b24` |
| F14 (non-blocking) | A malformed `POST /api/v1/notifications/read` body fell through to mark-all instead of failing | `9547726` |
| F17 (non-blocking) | Rejecting one timesheet card disabled Reject on every card — one shared `singleReject` guard, no per-row identity check | `b821b24` |
| F13 (non-blocking) | The e2e pagination-walk helper never examined the last page it navigated to (`for (next = 2; next <= 20)` exits after navigating, before checking) | `6f731aa` |
| F16 (non-blocking) | Every approvals row checkbox shared the literal `aria-label="Select request"` — no way for a screen-reader user to tell rows apart | `b880e41` |
| F06 (non-blocking) | `scripts/seed-uiux-demo.ts` printed a cleanup success line unconditionally, discarding the `updateMany` count | `6323995` |

All behavioural fixes (F03, F07, F15, F05, F17) were verified live against the running dev
server with a negative control before being called done, not just read from source.

## Declined (tool findings that did not survive verification, or a deliberate trade)

- **F02 — a failed audited reveal is silent.** CodeRabbit graded this `major` and it was accepted
  and "fixed" in `b821b24` before the premise was checked. It is not a defect, and that edit was
  reverted. `submitFeedback`'s `error` option only suppresses `result.type === 'failure'`, which is
  what a `fail()` return produces. `?/reveal` contains no `fail()` call: `requireAnyCapability`
  raises `error(403)`, which SvelteKit surfaces as `result.type === 'error'`, and that branch toasts
  `FRIENDLY_ERROR` unconditionally regardless of the option. A denied reveal was always announced.
  The finding's real complaint — that a denied reveal is indistinguishable from a broken one —
  is true both before and after, and is a property of `FRIENDLY_ERROR`, not of this guard.

- **F04 — 24px coarse-pointer floor.** CodeRabbit graded this `major` and asked for 44px back.
  Verified as a deliberate, committed decision (`d4c8e41`): 24×24 CSS px is the WCAG 2.5.8 (AA)
  minimum; 44×44 is 2.5.5 (AAA). No code change. The real issue underneath — three plan docs still
  described a 44px floor — was doc drift, not a code defect, and is fixed in `6f731aa`.
- **F12 — best-effort e2e teardown swallows delete failures.** The `catch` around
  `tests/e2e/timesheet-queue-page-walk.spec.ts:78-80`'s teardown is documented in place as a
  deliberate trade: a thrown teardown turns fixture residue into a red suite that hides the real
  result. Declining.
- The archived-plan handoff blocks (F20/F21/F23) — 10 of 10 completed plans under
  `process/general-plans/completed/` carry `EXECUTE START COMMAND` blocks and stale handoffs. This
  is the repo's archive convention (plans are moved, not rewritten); no change unless the
  convention itself changes.
- The `feedback-duplicate-messages-b2-b3-b5` plan keeps its wrong `pnpm test:e2e -- <specs>`
  command form deliberately — that plan's own Deviations and Known Gaps sections ARE the record of
  that command being wrong, and it states prior text is retained verbatim as the audit record.

## Documentation fixed in this pass (F10, F18, F19, F27)

Four docs told the reader to run `pnpm test:e2e -- <spec>`, a form that silently ignores the
filter and runs the full 143-spec suite (see
`process/features/ui-ux-overhaul/backlog/e2e-spec-filter-silently-ignored_NOTE_10-09-26.md`).
Corrected to `CI=1 pnpm exec dotenv -e .env.dev -- playwright test <specs>` in `6f731aa`, across
`process/general-plans/backlog/backlog.md` and the `recruitment-detail-banner-dedupe` plan/report
(the `b2/b3/b5` plan is the deliberate exception above).

## Still open — documentation accuracy (F01, F08, F09, F11, F22, F24, F25, F26, F28)

Nine claims across notes and acceptance-criteria tables overstate what was verified — none affect
shipped behavior. Filed to backlog:
`process/features/ui-ux-overhaul/backlog/pr13-doc-accuracy-nits_NOTE_10-09-26.md`. Worth a pass
before phase 04 closes, not before merge.

## Still open — unrelated to this review

- **S3 CONDITIONAL** — the inline Approve/Reject footer on `/requests/timesheets` cards has no
  automated spec; needs a second self-resetting fixture in the shared queue before it can leave
  Known-Gap. Tracked by
  `process/features/ui-ux-overhaul/backlog/timesheet-card-inline-actions-e2e_NOTE_10-09-26.md`.
  Not a PR #13 review finding — pre-existing, unchanged by this pass.
- **Owner manual pass H1–H15 / P1–P12** — still outstanding per the PR body, unaffected by this
  review pass.

## Plan/report deviation this pass corrects

None in item 43. `phase-04-feedback-contract-s5-s6_REPORT_03-09-26.md` claimed "21/21 actions
covered: 20 with a slot, plus `reveal`, which has no `fail()` path at all." That claim is correct —
see the F02 entry under Declined. AC-7 stands as reported.

## Lessons captured in `process/context/`

1. A machine review's severity grade is a hypothesis, not a verdict — verify the defect and its
   stated cause separately against source (`process/context/tests/all-tests.md`, "The Discipline").
2. Two silent/duplicate-feedback defects in this PR (F03, F05) came from opting a form out of the
   shared toast on the assumption a page-local surface exists, without checking the surface was
   actually there. F02 is the mirror image: a suppression that was assumed to bite and did not,
   because the option only covers `fail()` returns (`process/context/uxui/all-uxui.md`,
   "Feedback Surfaces").
3. A live UI check that clicks before hydration proves nothing — Svelte reprops a `checked`
   binding and can silently undo a Playwright `.check()`
   (`process/context/uxui/all-uxui.md`, "Svelte 5 Binding Gotchas").

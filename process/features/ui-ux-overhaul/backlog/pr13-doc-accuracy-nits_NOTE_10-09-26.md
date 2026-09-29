---
name: note:pr13-doc-accuracy-nits
description: "Nine process-record accuracy nits from the PR #13 CodeRabbit review (F01, F08, F09, F11, F22, F24, F25, F26, F28) — notes and acceptance-criteria tables that overstate what was verified. No shipped behaviour affected."
date: 10-09-26
feature: ui-ux-overhaul
---

# PR #13 review — documentation accuracy nits (F01, F08, F09, F11, F22, F24, F25, F26, F28)

Source: `coderabbit review --agent --base staging` against PR #13 (`3aa9fb7`), full report at
`process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/coderabbit-pr13-review_REPORT_10-09-26.md`
(the original per-finding review doc, `docs/code-review-pr13-2026-09-10.md`, was deleted after
verification — this note carries forward what it recorded).

**Priority:** Low — internal process records only, no shipped behaviour affected. Worth a pass
before phase 04 closes, not before merge.

## What's wrong

Nine findings, all the same shape: a note or an acceptance-criteria table in an archived or active
plan claims more certainty than the evidence supports.

- **F08** — a reduction reported as "90%+" when the measured figure was 89.8%.
- **F22** — a note describes work as "shipped and verified" when only a partial probe run was
  actually done.
- **F24, F26, F28** — acceptance criteria marked "met" by an automated gate that cannot, by
  construction, fail on the behaviour the criterion describes (a gate that would stay green
  whether or not the behaviour holds is not proof of it — the vacuous-green pattern, applied to
  self-grading rather than to a test).
- **F01, F09, F11, F25** — further instances of the same overstatement pattern in notes/tables;
  not surfaced with file:line detail before the source review doc was deleted.

## Why this wasn't fixed now

The CodeRabbit review document that named exact file/line locations for each of these nine has
been deleted per the review-cleanup instruction. This note preserves the claim inventory (bucket,
count, examples) so the locations can be re-derived by grep rather than lost entirely. None of the
nine block a merge or point at a real defect in shipped code — they are process-record hygiene.

## Fix

Before phase 04 closes (not before merge): grep archived and active `ui-ux-overhaul` plan/report
docs for percentage claims, "shipped and verified" / "done" language next to Hybrid or Agent-Probe
rows, and acceptance-criteria rows marked "met" by a Fully-Automated gate — cross-check each
against what the gate can actually detect, and correct or annotate as Known-Gap where the gate
can't fail on the claimed behaviour.

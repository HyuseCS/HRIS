---
name: report:ui-ux-overhaul-phase-blast-radius-registry
description: "Append-only blast-radius claim registry for the 8-phase Veent HRIS UI/UX overhaul program. One section per phase, created at first execution, never overwritten."
date: 03-09-26
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: program
---

# Phase Blast-Radius Registry — `ui-ux-overhaul`

Append-only. One `## Phase N` section per phase. Nobody overwrites an earlier section.
Overlap is expected (phases 3-8 all touch `src/lib/components/ui/` and
`src/routes/(app)/employees/[id]/`); this file makes the overlap visible and sequenced, it does
not prevent it.

Status vocabulary: *(no status)* / `BLOCKED-skipped` / `DONE` / `SUPERSEDED`.

---

## Phase 5 — `destructive-actions`

**Plan:** `phase-05-destructive-actions_PLAN_03-09-26.md`
**Claimed:** 03-09-26

**Files claimed (9 `.svelte` + 1 new test file):**

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
| `src/routes/(app)/attendance/+page.svelte` | 15 (renders twice — concern C1) |
| `tests/unit/destructive-confirms.test.ts` | new — gates G1/G2/G3 |

**Read-only (verified, not edited):** `src/routes/(app)/payroll/+page.svelte` (site 4),
`src/routes/(app)/requests/approvals/+page.svelte` (site 16),
`src/lib/components/ui/ConfirmButton.svelte`, `ConfirmDialog.svelte`, `ReasonDialog.svelte`,
`src/routes/(app)/performance/templates/[id]/+page.svelte`,
`src/lib/utils/submit-guard.svelte.ts`.

**Out of bounds:** `prisma/schema.prisma`, every `+page.server.ts`, `src/lib/server/**`,
`src/lib/rbac.ts`, `src/app.css`, `src/lib/components/ui/**` (phase 03 owns it).

**Overlap notices for later phases:**

- **Phase 07 (`page-splits`)** splits `src/routes/(app)/employees/[id]/+page.svelte` and
  `src/routes/(app)/attendance/+page.svelte`. Both files have forms **moved into confirm
  wrappers** by this phase — the offboard form (employees) and both attendance-reset render
  sites. Phase 07 must carry the wrapper, not just the form.
- **Phase 06 (`surface-consolidation`)** touches `src/routes/(app)/separations/[id]/+page.svelte`
  and `src/routes/(app)/payroll/config/+page.svelte`; this phase changes their submit paths from
  native `confirm()` / bare submit to dialog-gated submits.
- **Phase 08 (`copy-a11y`)** owns the payroll-config success-banner copy defect
  (§4 Payroll) and the period `?/lock` "Override note (if flagged)" copy — this phase
  deliberately leaves both alone.

**Additional file touched beyond the claim (authorized amendment):**
`src/lib/components/ui/ConfirmDialog.svelte` — one line, `whitespace-pre-line` added to the
message `<p>` so `\n` in a confirm message renders as a line break. Authorized by the
orchestrator as a **phase 03 amendment**, committed alone as `3c7c08e`. This is the single
exception to the "out of bounds: `src/lib/components/ui/**`" rule above; nothing else in that
directory was touched.

**Status:** DONE (CODE DONE, not ✅ VERIFIED) — sections 0-3 executed 03-09-26 (sites 2, 3,
4-verify, 5, 6); sections 4-7 executed 03-09-26 (sites 1, 7-16 and
`tests/unit/destructive-confirms.test.ts`). CI gate set green; the owner's live P1 matrix is the
only gate left. See `phase-05-destructive-actions_REPORT_03-09-26.md`.

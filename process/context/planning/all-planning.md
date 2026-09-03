---
name: context:all-planning
description: "Plan naming, storage routing, SIMPLE vs COMPLEX calibration, and the plan conventions this repo actually follows — the planning group entrypoint/router"
keywords: plan, planning, prd, spec, riper, plan file, naming, slug, archive, active, backlog, completed, feature folder, phase program, umbrella, validate contract
related: [context:all-tests]
date: 24-08-26
---

# Planning Context

This file is the canonical planning context entrypoint for Veent HRIS.

Use it after `process/context/all-context.md` when the task needs plan-shape calibration, planning conventions, or implementation-plan examples.

---

## Scope

This group covers:

- where a plan file goes and what it is named
- SIMPLE vs COMPLEX plan calibration
- the plan conventions this repo has actually settled on

It does not cover:

- active implementation plans themselves — those live in `process/general-plans/` and
  `process/features/`
- the RIPER-5 mode contract — that is `AGENTS.md` plus `.claude/agents/vc-*.md`
- test planning — that is `process/context/tests/all-tests.md`

## Read When

- creating, naming, locating, archiving, or resuming a plan
- deciding between a general plan and a feature-scoped one
- calibrating how much plan a task needs

## Naming and Storage

**Canonical shapes** (from `process/development-protocols/plan-lifecycle.md`):

- direct plan file: `{slug}_PLAN_{dd-mm-yy}.md`
- task folder: `{slug}_{dd-mm-yy}/` containing the plan plus colocated artifacts

**Where:**

| Kind | Location |
|---|---|
| Cross-cutting / one-off work | `process/general-plans/active/` |
| Feature-scoped work | `process/features/{feature}/active/` |
| Finished | move to the matching `completed/` |

Existing examples on disk: `salary-history-masking-290_PLAN_10-08-26.md`,
`multi-role-activation-283_11-08-26/`, `soft-delete-request-documents-299_12-08-26/`, and one
feature folder `process/features/timesheet-capture/`.

**Include the issue number in the slug.** Every plan here does — it is what makes a plan findable
from an issue and vice versa.

## Calibration — SIMPLE vs COMPLEX

Reference shapes live in the plan-generation skill:

- `.claude/skills/vc-generate-plan/references/example-simple-prd.md`
- `.claude/skills/vc-generate-plan/references/example-complex-prd.md`

Rules of thumb from this repo's history:

- **SIMPLE** when the change is one surface with a known shape and no schema change.
- **COMPLEX** when it touches the capability table, money, or multiple services — #283 ran 24
  commits; #282 touched four auth mechanisms.
- **A decision issue is not a plan.** #298 and #297 are open *questions*, not specifications.
  Route those through SPEC first; planning them before the owner answers produces a plan for
  work that may not be wanted.

## Conventions This Repo Has Settled

- **One issue, one PR, many commits.** The four-PR split on #256 wasted effort and caused #272.
  Do not fragment.
- **VALIDATE needs a committed plan file to write its contract into.** Commit the plan before
  running VALIDATE.
- **Record the decisions, including the rejected ones and why.** The plans that have paid off most
  here are the ones stating what was deliberately *not* done — #299's plan carries nine readers
  with opposite answers; #298's issue text carries its own deferral reasoning.
- **Merges go to `staging`, so `Closes #N` never fires.** Plans should say the issue is closed by
  hand.
- **A VALIDATE BLOCKED verdict is usually an environment-baseline miss, not a reasoning error.**
  #112's first VALIDATE pass returned BLOCKED on three findings and every one was a surface the
  plan had never opened at all: `pnpm format:check` already failing on a file the plan listed as
  "not touched", the DB container stopped for days with the schema never pushed, and a
  hand-maintained allow-list array (see `process/context/auth/all-auth.md`) missing the new
  entity. (#283 hit the same shape.) Before locking a plan's Gate definitions, confirm: the repo's
  baseline gates (`format:check`, `lint`, `check`) are actually green on the current tree; any
  service the plan depends on (DB container, dev server) is actually running; and any
  hand-maintained allow-list the change's output must appear in has been checked, not assumed.

## Source Paths

- `process/development-protocols/plan-lifecycle.md` — the authoritative naming and lifecycle rules
- `process/development-protocols/phase-programs.md` — multi-phase program layout
- `.claude/skills/vc-generate-plan/references/` — SIMPLE and COMPLEX examples
- `process/general-plans/`, `process/features/`

## Update Triggers

Update this group when:

- plan naming or storage routing changes
- a new plan shape is adopted
- the calibration rules change

# Backlog

## #278 follow-ups

### Add `finance@veent.ph` and `payroll@veent.ph` to `tests/e2e/helpers.ts` `USERS`

- **Priority**: Low
- **Problem**: Both accounts are seeded but absent from the e2e `USERS` map, so FINANCE and
  PAYROLL_OFFICER coverage of any payroll-visibility fix (including #278) rests on unit-level rows
  only and is never exercised at the HTTP layer.
- **Root cause**: `helpers.ts` was never extended when these roles were seeded.
- **Fix options**: add both entries to `USERS` with their seeded credentials; broadens several
  existing specs' reach cheaply. Deferred out of #278's scope by that plan's own Notes section.
- **Source**: `process/general-plans/active/payslip-draft-visibility-278_PLAN_10-08-26.md`

### Repo-wide sweep for guard message strings with no test reference

- **Priority**: Low
- **Problem**: The #278 draft gate had zero test coverage before that plan — its message string
  (`'Payslip not yet available'`) appeared at three source sites and in no test file, meaning the
  guard was deletable without CI noticing. Unknown how many other authorization guards in the repo
  are in the same state.
- **Root cause**: No existing convention or lint rule ties a guard's error message to a required test
  assertion.
- **Fix options**: grep the repo for `error(403, ...)` / `return { ok: false, status: 403, ... }`
  message literals and cross-check each against `tests/**` for a matching assertion; file individual
  issues for any gaps found.
- **Source**: `process/general-plans/active/payslip-draft-visibility-278_PLAN_10-08-26.md`, "Test
  Infra Improvement Notes"

### RESIDUAL-1 — Door B's 403 guard identity is unpinned

- **Priority**: Low (accepted residual, not a regression)
- **Problem**: `src/routes/(app)/payslips/[id]/+page.server.ts` (Door B) answers 403 from either the
  access guard or the draft guard, but `src/routes/+error.svelte` renders a fixed body for every 403
  and never prints `$page.error.message`. No e2e can currently distinguish which guard fired at Door
  B, unlike Doors A and C which both assert the message.
- **Root cause**: `+error.svelte` was written before any door needed to expose *which* guard denied
  access; it only needed to deny.
- **Fix options**: have `+error.svelte` forward `$page.error.message` in dev/test builds only, or add
  a `accept: application/json` fallback path server-side (the client-side `accept` header attempt
  during #278 did not change SvelteKit's response). Closure was explicitly out of scope for #278 by
  user decision; the compensating control is that Doors A and C already pin gate order.
- **Source**: `process/general-plans/active/payslip-draft-visibility-278_PLAN_10-08-26.md`, Validate
  Contract "Open gaps"

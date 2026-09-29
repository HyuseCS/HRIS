---
name: context:all-tests
description: "Vitest/Playwright commands, the gate order, and the five ways a green suite has hidden a real hole here — the tests group entrypoint/router"
keywords: test, testing, vitest, playwright, e2e, unit, verification, mutation, gate, coverage, flaky, mock, live verification, negative control, regression, spec filter, skipped test, probe, agent probe
related: [context:all-cicd]
date: 10-09-26
---

# Veent HRIS - All Tests

Last updated: 2026-09-10

Attach this file first when the task involves testing, verification, or test debugging.

---

## What This Covers

- which runner to use and the exact commands
- the gate order that matches CI
- **the verification discipline this repo has learned the hard way** — the most important section
- known testing gaps

It does not cover CI pipeline shape — that is `process/context/cicd/all-cicd.md`.

## Read This When

- running tests after implementation
- deciding whether a passing suite actually proves anything
- debugging a failing or flaky test
- planning how a change will be verified

## Quick Decision Guide

### Use `vitest` (`pnpm test`) when

- the change is in a service, utility, guard, or pure logic
- 154 unit files, ~1737 tests, runs in ~35s

### Use Playwright (`pnpm test:e2e`) when

- the behaviour depends on real navigation, auth redirects, SSR, or hydration
- 36 specs — **unreliable, see #287**

### Use a driven browser script when

- verifying a guard, a CSS rule, or anything the unit suite mocks away
- this repo's strongest verification artifacts have all been ad-hoc Playwright scripts run against
  the dev server with `POST /api/v1/_dev/login-as`, plus a `psql` assertion after each step

## Commands

| Gate | Command | Notes |
|---|---|---|
| Unit | `pnpm test` | vitest run. There is no `test:unit` script. |
| Unit (watch) | `pnpm test:watch` | |
| E2E | `pnpm test:e2e` | Playwright; flaky |
| Typecheck | `pnpm check` | does NOT cover `prisma/**` or `scripts/**` |
| Lint | `pnpm lint` | |
| Format | `pnpm format:check` | |

**`pnpm test:e2e -- <specs>` DOES NOT FILTER. It silently runs all 143 tests.** The script
(`package.json:15`) is `dotenv -e .env.dev -- playwright test`, which already ends in a `--`
passthrough, so `pnpm test:e2e -- form-errors` becomes `... playwright test -- form-errors`.
Playwright ignores the stray `--` and everything after it, runs the whole suite, and says nothing.
**Anyone who has ever run a scoped e2e in this repo actually ran all 143 tests** — every earlier
gate log claiming a small filtered count is suspect, and a failure may have been mis-attributed to
the specs named on the command line. The working form is:

```
CI=1 pnpm exec dotenv -e .env.dev -- playwright test <specs>
```

`CI=1` is still required: `playwright.config.ts:23` sets `workers: 1` under CI, which is what
removes the cross-spec fixture race on the shared `.env.dev` database. Found 10-09-26 when a
"scoped" 3-spec run re-triggered the unrelated pre-existing attendance failure. Backlog note:
`process/features/ui-ux-overhaul/backlog/e2e-spec-filter-silently-ignored_NOTE_10-09-26.md`.

**Run `pnpm prisma generate` before believing a red `pnpm check`.** A stale generated client
produces phantom type errors that do not match the code on disk. This has been misdiagnosed at
least three times.

**`pnpm check` runs `svelte-kit sync` and will stop the owner's dev server.** When the dev server
must stay up, `pnpm exec svelte-check --tsconfig ./tsconfig.json` (without `svelte-kit sync`) is a
safe stand-in — it reads the existing generated types and never writes `.svelte-kit/`. It is not a
full substitute (it won't catch a stale generated client the way a fresh sync would), but it
covers a type-check pass without touching the running server.

**`pnpm format:check` runs FIRST in the CI gate set and short-circuits everything after it.** A
red baseline here — even from a file the current task never planned to touch — makes every later
gate in the set unprovable until it's cleared. Clear it as its own commit before trusting any other
gate result (`f29a329`, 10-09-26).

## Default Verification Order

1. run the narrowest existing automated test
2. unit before browser
3. browser when the real UI is the thing being verified
4. **for anything privileged or money-adjacent, verify live and prove the negative case too**

## The Discipline — Read This Before Trusting Green

**A green suite is not evidence a guard holds.** Five distinct times in this codebase a passing
suite coexisted with a real defect:

1. **Vacuous mocks.** Flat `mockResolvedValue` returning a whole row regardless of what the query
   selected. Adding a `where` filter to a decision query — the exact mistake under review — left
   all 1273 tests green.
2. **The suite exercised a module the dev server could not load.** 1432 unit tests passed while
   `/attendance` returned 500 on every visit: `import { parse } from 'papaparse'` is a named import
   from a CommonJS module, which Vitest tolerates and Vite's SSR transform refuses.
3. **Assertions green, render wrong.** The punch map passed every assertion twice while looking
   broken — once unreadably cluttered, once with an accuracy circle tinting the whole viewport.
4. **The check measured the wrong thing.** A box measured 44px because the control was naturally
   that wide, not because the rule applied. Assert the **computed style**, not the box.
5. **The locator was wrong, not the code.** A probe reported a control missing because the regex
   was `/AM\/PM/` and the label is `AM / PM break length`.
6. **A test that SKIPS is not a test that passes.** A planned e2e carried a `test.skip()` on the
   false premise that no pending-timesheet fixture helper existed (it does —
   `timesheet-approval.spec.ts:42-70`). The suite shares `.env.dev` with the dev server and
   `global-setup.ts:81-82` wipes that queue before any spec runs, so the guard would have skipped
   silently and forever while the suite reported green. VALIDATE caught it before EXECUTE.
   **A skip is a hole with a green tick on it** — a spec that can skip must fail instead, or seed
   its own fixture.
7. **A probe pointed at the wrong account reads as a product failure.** A mandatory regression
   probe was written against a non-manager account for a control gated on `isManager`, and the plan
   said to REVERT the change if the probe showed no toast. It would have reverted good work on a
   false negative. **Assert the control is PRESENT before measuring it**, and make a failed
   precondition `BLOCKED`, never a revert trigger.

### What to do instead

- **Mutation-check every guard and branch.** Break it on purpose; if no test goes red, the test is
  vacuous. A mutation check written into a plan is a hypothesis — only running it makes it evidence.
- **Verify live, before AND after,** with the same script, keeping negative controls on both sides.
- **Name the control exactly and assert something positive.** "The card is absent" proves nothing —
  it is equally consistent with a typo in your selector.
- **Prove a zero is not vacuous.** Before trusting any `toHaveCount(0)` / "there are no green
  boxes" claim, inject a matching node into the live DOM, confirm the selector returns it, then
  remove it. A zero from a selector that can never return one is not evidence. (Done 10-09-26 with
  a fake green banner while proving the timesheet-review surface.)
- **Assert the precondition before the measurement.** Every probe should first prove the control
  it is about to drive is rendered and enabled. A dead dev server, a wrong account, or a scrolled
  container all read identically to "the feature is broken".
- **Plant a marker** so you can find the record you created, and assert against the **database
  row**, not against a value you injected.
- **After adding a production dependency, load an affected page in a real browser** before calling
  the work done.
- **Look at a screenshot.** Assertions do not see layout.
- **`vi.mock` is file-scoped, not test-scoped.** Mocking a service in one test file replaces it for
  every test in that file. If some tests need the real implementation and others need it mocked
  (e.g. proving a guard both integrates the real service AND that the route wires a mocked one
  correctly), that split needs two files, not one `vi.mock` call — mocking the service to satisfy
  one test can silently break every other test in the same file that depended on the real behavior
  (#112 VALIDATE caught this before EXECUTE started, not after).

- **A cleanup that selects by actor, not by the specific record it created, can delete other
  people's data.** Cancelling `employee@veent.ph`'s pending requests to remove a test-seeded row
  also cancelled that employee's unrelated pre-existing seeded request — "Cancel" is a hard
  delete in this app, not a soft one, and there's no undo. Plant a marker (a distinctive title,
  date, or amount) and clean up by matching that marker, never by "everything this account
  currently has pending."

8. **Paginating a list silently breaks every e2e that finds its row by name/hours on page 1.**
   Confirmed twice: `/requests/timesheets` (`findTimesheetCard`, 10-09-26) and the `/timesheets`
   team table (four call sites still unfixed — see
   `timesheet-team-table-pagination-row-lookup_NOTE_10-09-26.md`). Rank the fixtures against the
   real DB before shipping the pagination, and reach the row by a page-walk or a `?q=` filter,
   never by assuming page 1. A grep for the walk-helper string in a spec file proves it was typed,
   not that the walk branch ever runs — prove it with a fixture sized past the page boundary, plus
   a negative control that asserts the target is NOT on page 1.

9. **A machine code-review's severity grade is a hypothesis, not a verdict.** The PR #13
   CodeRabbit pass (10-09-26) graded two findings `major`; neither survived verification against
   source (one was a deliberately committed a11y decision, one a deliberate teardown trade). It
   graded a third finding low — a saved-timesheet message the page never rendered — and that one
   was a real silent-failure regression CI had been failing on for a day. Verify the defect and
   its stated cause separately against source before acting on a tool's grade in either direction.

## Known Gaps

- **#287 — the e2e suite is flaky**: random specs time out on `page.goto('/login')`. Still a CI
  gate. Read the actual error before re-running; "flaky" has hidden three distinct real causes.
- **Unit tests mock the DB**, so they cannot prove a query-level or tenant-scoping hole.
- **No gate typechecks `prisma/**` or `scripts/**`.** Code there has shipped broken while `check`
  was green.
- **Real-device GPS and insecure-origin branches** in the punch flow are not provable locally.
- **The e2e suite runs parallel workers against ONE shared dev database.**
  `scripts/clean-e2e-employees.ts`'s own header documents the resulting race: a concurrent spec's
  payroll compute can attach an entry to whatever employee is currently ACTIVE, and the FK is
  `RESTRICT`, so a teardown delete can legitimately lose that race. Confirmed 04-09-26: a first run
  failed 5 tests; sweeping stale test employees (`--apply`) plus leftover `E2E %` inventory rows
  cleared 3 of the 5.
- **A stale row from an earlier manual/e2e session can make a spec fail for reasons unrelated to
  the code.** `payroll-custom-range-overlap.spec.ts` failed 04-09-26 because an APPROVED payroll
  run left over from a prior session overlapped its date range — the spec's own header comment
  claiming "cannot collide with the seed" was stale for that database state. When an e2e failure's
  root cause is a pre-existing DB row, not the diff under test, say so explicitly rather than
  treating a red spec as a code regression.
- **Playwright's browser cache can silently drop a browser.** If `pnpm test:e2e` fails immediately
  with `browserType.launch: Executable doesn't exist`, run `pnpm exec playwright install chromium`
  (or the missing browser) — this is environmental, not a code failure.
- **A local gate that is red for irrelevant reasons is a gate nobody reads.** `pnpm lint` was red
  with 475 errors from bundled `playwright-report/` files after any e2e run, while CI stayed green
  because it lints a fresh checkout. Fixed 10-09-26 (`ab695c5`) by adding `playwright-report/` and
  `test-results/` to `eslint.config.js` ignores. If a local gate disagrees with CI, check what the
  gate is reading before believing either.
- **There is still no shared "exactly one visible message" e2e helper.** Three plans in a row have
  hand-written the `[role="status"] [aria-live="assertive"]` + `toHaveCount(1)` +
  `getByRole('alert')` count-0 triple. `getByRole('alert')` matches `Banner` only; the toast is
  never `role="alert"`. Every banner-to-toast migration silently narrows what that selector can
  catch.
- **When a shared component's markup changes, grep the WHOLE `tests/e2e/` suite for every call
  site, not just the spec you happened to open.** A `PeriodPicker` button-label change once broke
  three specs in files unrelated to the change that made it (`5a1d3b0`, 04-09-26).
- **`tests/e2e/global-setup.ts:78-95` unconditionally deletes `employee@veent.ph`'s timeLogs,
  timesheets, timesheet entries, leave requests and ALL requests on every `playwright test`
  invocation, including scoped runs.** Any e2e run wipes that account's demo data. This is
  pre-existing, by design (it keeps fixtures deterministic across runs) — surfacing it here so it
  is not mistaken for a code regression when the owner's demo data on that account disappears
  after running e2e.

## Quick Routing

(No deeper test docs yet. Add routing entries here as they are created.)

## Source Paths

- `tests/unit/` — 154 files
- `tests/e2e/` — 36 specs
- `tests/fixtures/`
- `playwright.config.ts`
- `prisma/seed-e2e.ts`

## Update Triggers

Update this group when:

- a runner or command changes
- #287 is fixed
- a new class of false-green defect is found (add it to the list above)
- coverage tooling is introduced

---
name: context:all-tests
description: "Vitest/Playwright commands, the gate order, and the five ways a green suite has hidden a real hole here — the tests group entrypoint/router"
keywords: test, testing, vitest, playwright, e2e, unit, verification, mutation, gate, coverage, flaky, mock, live verification, negative control, regression
related: [context:all-cicd]
date: 24-08-26
---

# Veent HRIS - All Tests

Last updated: 2026-08-24

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

**Run `pnpm prisma generate` before believing a red `pnpm check`.** A stale generated client
produces phantom type errors that do not match the code on disk. This has been misdiagnosed at
least three times.

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

### What to do instead

- **Mutation-check every guard and branch.** Break it on purpose; if no test goes red, the test is
  vacuous. A mutation check written into a plan is a hypothesis — only running it makes it evidence.
- **Verify live, before AND after,** with the same script, keeping negative controls on both sides.
- **Name the control exactly and assert something positive.** "The card is absent" proves nothing —
  it is equally consistent with a typo in your selector.
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

## Known Gaps

- **#287 — the e2e suite is flaky**: random specs time out on `page.goto('/login')`. Still a CI
  gate. Read the actual error before re-running; "flaky" has hidden three distinct real causes.
- **Unit tests mock the DB**, so they cannot prove a query-level or tenant-scoping hole.
- **No gate typechecks `prisma/**` or `scripts/**`.** Code there has shipped broken while `check`
  was green.
- **Real-device GPS and insecure-origin branches** in the punch flow are not provable locally.

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

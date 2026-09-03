# Veent HRIS - All Context

Last updated: 2026-08-17

This file is the root context entrypoint for the repo.

Use it for two things:

1. quick routing to the right context pack or root file
2. broad architecture and repository understanding

Start here before loading deeper context files.

---

## What This Project Is

Veent HRIS is a multi-tenant Philippine HR information system: employee records, timesheets and
attendance, payroll with statutory contributions, leave and request approvals, recruitment,
performance, benefits, and offboarding/separation.

Tenants today are **Veent** plus two food-service organizations, **JoJo Potato** and **Sweetleaf**
(`org_jojo`, `org_sweetleaf`), which get branch-based features the others do not.

The system's defining characteristic is that **almost every surface is role-gated and money-
adjacent**. Authorization is not a side concern here; it is the dominant design constraint, and
most of the recent backlog has been auth and separation-of-duties work.

---

## How This File Works (the `all-*.md` Convention)

Every `process/context/` directory has one `all-*.md` entrypoint that acts as an attachable quick
router for that domain. This root file is the top-level router.

**How agents use it:**

1. read `all-context.md` first (this file)
2. find the relevant context group from the routing tables below
3. read that group's `all-{group}.md` entrypoint
4. only then load the specific deep doc needed

This layered routing keeps context windows small. Never load the whole `process/context/` tree.

---

## Quick Start

For most substantial tasks:

1. read this file first
2. choose the smallest relevant root file or context group from the tables below
3. only then load deeper files

## Current Root Entry Points

<!-- The two tables below (Root Entry Points + Context Groups) are GENERATED from each
     context doc's frontmatter by `discover-context.mjs --emit-routing`. Do NOT hand-edit
     between the GENERATED markers — your edits will be overwritten on the next rebuild.
     To change a row, edit the owning doc's frontmatter (description / keywords) and re-emit.
     `--check-routing` fails lint if this block drifts from the frontmatter on disk. -->

<!-- GENERATED:routing -->
| File | Read when |
|---|---|
| `process/context/all-context.md` | any substantial planning, research, review, or implementation task |
| `process/context/auth/all-auth.md` | Lucia sessions, the multi-role capability table, tenant scoping, and the separation-of-duties precedents — the auth group entrypoint/router |
| `process/context/cicd/all-cicd.md` | The three CI jobs, the populated-DB schema check, and the main-only GHCR deploy — the cicd group entrypoint/router |
| `process/context/container/all-container.md` | Local Postgres via start.sh, the production compose stack, and the dev/prod image drift — the container group entrypoint/router |
| `process/context/database/all-database.md` | Prisma schema conventions, enum traps, db push workflow, and the money/decimal rules — the database group entrypoint/router |
| `process/context/planning/all-planning.md` | Plan naming, storage routing, SIMPLE vs COMPLEX calibration, and the plan conventions this repo actually follows — the planning group entrypoint/router |
| `process/context/tests/all-tests.md` | Vitest/Playwright commands, the gate order, and the five ways a green suite has hidden a real hole here — the tests group entrypoint/router |
| `process/context/uxui/all-uxui.md` | Svelte 5 runes, the HSL token system, button/dialog conventions, and the accessibility floors — the uxui group entrypoint/router |

## Current Context Groups

| Group | Entry point | Scope |
|---|---|---|
| `auth/` | `process/context/auth/all-auth.md` | Lucia sessions, the multi-role capability table, tenant scoping, and the separation-of-duties precedents — the auth group entrypoint/router |
| `cicd/` | `process/context/cicd/all-cicd.md` | The three CI jobs, the populated-DB schema check, and the main-only GHCR deploy — the cicd group entrypoint/router |
| `container/` | `process/context/container/all-container.md` | Local Postgres via start.sh, the production compose stack, and the dev/prod image drift — the container group entrypoint/router |
| `database/` | `process/context/database/all-database.md` | Prisma schema conventions, enum traps, db push workflow, and the money/decimal rules — the database group entrypoint/router |
| `planning/` | `process/context/planning/all-planning.md` | Plan naming, storage routing, SIMPLE vs COMPLEX calibration, and the plan conventions this repo actually follows — the planning group entrypoint/router |
| `tests/` | `process/context/tests/all-tests.md` | Vitest/Playwright commands, the gate order, and the five ways a green suite has hidden a real hole here — the tests group entrypoint/router |
| `uxui/` | `process/context/uxui/all-uxui.md` | Svelte 5 runes, the HSL token system, button/dialog conventions, and the accessibility floors — the uxui group entrypoint/router |
<!-- /GENERATED:routing -->

## Task Routing Table

| If the task involves... | Load first | Then load |
|---|---|---|
| architecture or stack questions | this file | the named domain source file |
| roles, capabilities, guards, 403s | this file, `auth/all-auth.md` | `src/lib/rbac.ts`, `src/lib/server/rbac.ts` |
| separation of duties / two-person controls | this file, `auth/all-auth.md` | the precedent section, then the target service |
| schema, models, enums, migrations | this file, `database/all-database.md` | `prisma/schema.prisma` |
| money, payroll, Decimal handling | this file, `database/all-database.md`, `auth/all-auth.md` | `src/lib/server/services/payroll/` |
| UI, components, styling, a11y | this file, `uxui/all-uxui.md` | `src/app.css`, the component under change |
| local DB not running, 500s on every page | this file, `container/all-container.md` | `start.sh` |
| CI gates, deploys, e2e flakiness | this file, `cicd/all-cicd.md` | `.github/workflows/` |
| creating a new plan | this file | `process/development-protocols/plan-lifecycle.md` |
| context maintenance | this file | run `audit-context` after edits |

## Context Group Lifecycle

Context groups are durable knowledge domains, not feature folders.

Create a group when:

- a topic has 3+ durable docs
- a single doc exceeds roughly 800 lines with separable subtopics
- multiple agents repeatedly need only one slice of a large context file
- the topic maps to a stable operational domain

Do not create a group when:

- the content is a temporary report
- the content is a plan or execution artifact
- the topic is feature-specific and belongs in `process/features/...`

Run the `audit-context` skill after every context organization change.

## Naming Convention

There are no `README.md` files inside `process/context/`. Canonical entrypoints use `all-*.md`:

- root: `process/context/all-context.md`
- group: `process/context/{group}/all-{group}.md`

## Context Update Protocol

1. update the smallest relevant context file
2. update this file if routing, ownership, naming, or groups changed
3. update the owning `all-{group}.md` entrypoint when a group exists
4. run `audit-context`

---

## Repository Structure

```text
veent_hris/
  prisma/
    schema.prisma        -- 68 models, 1972 lines; NO migrations dir (db push)
    seed.ts, seed-e2e.ts
  src/
    app.css              -- 43 HSL tokens, button variants, a11y floors
    hooks.ts             -- global Decimal transport serialization
    hooks.server.ts
    lib/
      rbac.ts            -- THE capability table (16 capabilities, 9 roles)
      orgs.ts            -- food-service tenant allowlist
      actions/  stores/  utils/
      components/        -- ui/ + 8 domain folders
      server/
        rbac.ts          -- requireAnyCapability + throwing guards
        auth.ts          -- Lucia v3 config
        db.ts  audit.ts  access-guard.ts  storage.ts  rate-limit.ts
        schemas/         -- zod
        services/        -- ~30 domain services (payroll/, attendance/, requests/, settings/)
    routes/
      (app)/             -- 23 authenticated surfaces
      (auth)/            -- login
      api/v1/            -- REST surface incl. _dev/login-as, session/switch-org
  scripts/               -- migrate-*.ts, discord-bot.ts, prod-delete.ts
  tests/
    unit/                -- 120 files
    e2e/                 -- 36 specs (flaky, see #287)
  process/
    context/             -- this system
    development-protocols/
    features/  general-plans/  _seeds/
  .github/workflows/     -- ci.yml, deploy.yml
```

## Technology Stack

- **Framework:** SvelteKit 2 (`^2.8.0`) with **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`, `$bindable`)
- **Language:** TypeScript 5.6
- **Build:** Vite 5.4
- **Database:** PostgreSQL via Prisma 5.22 — **Postgres 18 locally, Postgres 16 in production compose**
- **Auth:** Lucia v3 + `@lucia-auth/adapter-prisma`
- **Validation:** Zod 3
- **UI:** Tailwind CSS v3 + `bits-ui`, `lucide-svelte`, `layerchart`; Leaflet 1.9 for maps
- **PDF:** pdfkit (payslips)
- **Testing:** Vitest 2.1 (unit), Playwright 1.49 (e2e)
- **Package manager:** pnpm 10.33.0 — use `pnpm`, never `npm`
- **No Redis.** It was removed; dashboard and reports query the DB directly.

## Key Patterns and Conventions

**Authorization (the dominant pattern):** two mechanisms only, since #282 — the declarative
`CAPABILITIES` table in `src/lib/rbac.ts`, and the throwing `requireAnyCapability` guard in
`src/lib/server/rbac.ts`. A user holds a **set** of roles, never one. See `auth/all-auth.md`.

**Services:** business logic lives in `src/lib/server/services/{domain}.ts` or
`services/{domain}/`. Routes call services; routes do not hold logic.

**Import aliases:** `$lib` → `src/lib`, `$app/*` → SvelteKit runtime. No custom `paths` in
`tsconfig.json`.

**Money:** Prisma `Decimal`, never floats. Never returned raw to the client — `src/hooks.ts`
serializes globally.

**Audit:** privileged actions stamp an `AuditLog` row. When adding a privileged action, stamp one.

**Env loading:** every script is wrapped in `dotenv -e .env.dev`. There is no `.env`.

**Commits:** never add `Co-Authored-By` or any co-author trailer. Subject line plus optional
body, no attribution footers.

**Branch flow:** merges go to `staging`, not `main`. `Closes #N` therefore never fires — issues
are closed by hand. Only `main` deploys.

## Environment and Configuration

**Config files:** `svelte.config.js`, `vite.config.ts`, `tailwind.config.js`, `tsconfig.json`,
`playwright.config.ts`, `eslint.config.js`, `docker-compose.yml`, `start.sh`

**Env var groups (names only, never values):**

- Database: `DATABASE_URL`
- Auth: `LUCIA_SECRET`
- Runtime: `NODE_ENV`, `PORT`, `UPLOAD_DIR`
- Integrations: `TIMELOG_API_SECRET` (HMAC for the timelog API), `DISCORD_BOT_TOKEN`, `HRIS_API_URL`

Development env lives in **`.env.dev`**; production in `.env.prod` (not in git). **There is no
`.env`** and it must never be committed.

## Security Posture

- Session auth via Lucia; `locals.user` carries `roles`, `organizationId`, `isActive`
- Capability guards on every privileged route action — UI checks are affordances, not enforcement
- Tenant isolation by `organizationId` at query level; a CEO is cross-org and switches active org
- Salary/compensation masked at the service layer with an audited reveal (#111, #290)
- HMAC-signed timelog API (`src/lib/server/hmac.ts`), rate limiting in `src/lib/server/rate-limit.ts`
- Soft-delete tombstones for request documents (#299)
- `POST /api/v1/_dev/login-as` is **development only** — confirm it cannot reach production

**Known open gaps** (filed, not accidental): **#298** — one Super Admin can run, approve and void
the same payroll. **#297** — one HR admin can clear every clearance item and finalize a separation.

## Monitoring and Operations

- Deploy: GitHub Actions → GHCR image → droplet pull/restart over SSH, **`main` only**
- A Discord bot (`pnpm bot`) runs from the same image
- `AuditLog` is the operational record for privileged actions; `/reports/audit-log` is its surface

## References and Key Files

- `CLAUDE.md` — project instructions, authoritative for ordinary work
- `AGENTS.md` — RIPER-5 harness entrypoint, **dormant unless named in the same turn**
- `process/development-protocols/all-development-protocols.md` — workflow rules
- `src/lib/rbac.ts` — the capability table; read before any auth change
- `prisma/schema.prisma` — the data model

## Open Questions

1. **Postgres version drift is unresolved:** dev runs `postgres:18` (`start.sh:9`), production
   compose pins `postgres:16` (`docker-compose.yml:23`). Intentional or drift? Anything relying on
   a 17+ feature would pass locally and fail in production.
2. **#298 and #297 are undecided product questions**, not bugs. Both need an owner's answer before
   any build. See `auth/all-auth.md`.
3. **The e2e suite is not trustworthy** (#287). It is a CI gate regardless, so a red run needs
   reading rather than re-running.
4. **`pnpm check` does not cover `prisma/**` or `scripts/**`** — no gate currently typechecks
   those paths.

## Scan Metadata

- Generated: 17-08-26
- HEAD: `c8684e5cc72467aa6d668cf8571b6578938f970f`
- Mode: Full Scan (standalone-full — `all-context.md` was absent, tripping the AGENTS.md bootstrap guard)
- Package manager: pnpm 10.33.0
- Groups written: `auth/`, `database/`, `container/`, `cicd/`, `uxui/`

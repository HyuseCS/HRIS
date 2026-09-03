# Veent HRIS — Claude Instructions

This file governs ordinary work and is authoritative. `AGENTS.md` holds the vc-pro-max /
RIPER-5 harness, which is **dormant** — it applies only in a turn that explicitly names it.
See the override block at the top of that file; do not activate or suggest it unasked.

## Git commits

- **Never** add a `Co-Authored-By` line to any commit message.
- **Never** add a `Co-Author` trailer of any kind.
- Keep commit messages concise: subject line + optional body, no attribution footers.
- Do not commit `.env` — it is in `.gitignore`.

## Tech stack

- SvelteKit 2 + Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`)
- Prisma 5 + PostgreSQL 18 (Docker `veent-db-5434` on host networking, veent/veent, db=`veent_hris`, port 5434 — inside the container too, so `docker exec … psql -p 5434`). Start it with `./start.sh`; env lives in `.env.dev`, there is no `.env`.
- Lucia v3 + `@lucia-auth/adapter-prisma` for session auth
- Tailwind CSS v3 with HSL design tokens (`src/app.css`)
- pnpm 10 as package manager — use `pnpm` not `npm`

## Key constraints

- No Redis — removed. Dashboard and reports query DB directly.
- Prisma `Decimal` fields must not be returned raw to the client — the transport hook in `src/hooks.ts` handles serialization globally.
- Prisma enums: `EmploymentType` values are `REGULAR`, `PART_TIME`, `CONTRACTUAL`, `PROBATIONARY`, `ON_CALL`, `INTERN`. (`FULL_TIME` was renamed to `REGULAR` in #172 — payslips already printed it that way. New hires default to `PROBATIONARY`.) `EmploymentStatus` values are `ACTIVE`, `ON_LEAVE`, `OFFBOARDED` only.
- Renaming a Prisma enum value is not something `db push` can do — it drops and recreates the type. Any existing database needs a `scripts/migrate-*.ts` running `ALTER TYPE … RENAME VALUE` **before** the push; see `scripts/migrate-employment-type-regular.ts`.
- `{@const}` must be an immediate child of a block tag (`{#if}`, `{#each}`, `{#snippet}`, etc.) — never inside a plain HTML element.

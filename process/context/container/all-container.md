---
name: context:all-container
description: "Local Postgres via start.sh, the production compose stack, and the dev/prod image drift — the container group entrypoint/router"
keywords: docker, compose, container, postgres, start.sh, image, port 5434, ghcr, healthcheck, volume, pgdata, local dev, bot
related: [context:all-database, context:all-cicd]
date: 17-08-26
---

# Container Context

This file is the canonical container context entrypoint for Veent HRIS.

Use it after `process/context/all-context.md` when the task needs local database startup, the compose stack, or image/deploy shape.

---

## Scope

This group covers:

- Starting the local development database (`./start.sh`)
- The production `docker-compose.yml` stack: `db`, `app`, `bot`
- Image source and volumes
- The dev/prod Postgres version drift

It does not cover:

- Schema, models, or the `db push` workflow — that is `process/context/database/all-database.md`
- The CI pipeline that builds and pushes images — that is `process/context/cicd/all-cicd.md`

## Read When

Read this entrypoint when:

- the app returns 500s with `Can't reach database server at localhost:5434`
- changing compose services, ports, volumes, or healthchecks
- reasoning about anything that behaves differently in production than locally
- running `psql` against the local database

## Local Development

**The database does not start itself.** `./start.sh` brings up the container `veent-db-5434`.

- Image: **`postgres:18`** (`start.sh:9`)
- Host networking; port **5434 inside the container too**, so `psql` needs `-p 5434`:
  ```sh
  docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -tAc "select 1"
  ```
- Credentials veent/veent, database `veent_hris`
- Env lives in **`.env.dev`**. There is no `.env`, and `.env` is git-ignored.

**Symptom to recognise:** every page that loads data returns 500 with a
`PrismaClientInitializationError`. The database is simply not running. Start it before assuming
a code fault.

**The dev server is the user's to start, not the agent's.** Ask them to run it and report back.

## Production Stack

`docker-compose.yml` defines three services:

| Service | Image | Notes |
|---|---|---|
| `db` | **`postgres:16`** | Tuned for a 512MB droplet: `shared_buffers=64MB`, `max_connections=20`, `effective_cache_size=192MB`. Reads `POSTGRES_*` from `.env.prod`. Volume `pgdata`. |
| `app` | `ghcr.io/aguynamedkent7/veent-hris:latest` | The SvelteKit server |
| `bot` | `ghcr.io/aguynamedkent7/veent-hris:latest` | Same image, runs the Discord bot (`pnpm bot`) |

## Known Drift — Read Before Assuming

**Local dev runs Postgres 18; production compose pins Postgres 16.** Both statements are true and
neither is a typo. Anything that depends on a version-specific Postgres behaviour can pass locally
and fail in production. Treat 16 as the floor for any SQL feature you rely on.

The compose `db` block is also tuned for a very small box. A query that is fine locally may hit
the 20-connection cap in production.

## Source Paths

- `start.sh`
- `docker-compose.yml`
- `Dockerfile`
- `.env.dev` (development), `.env.prod` (production, not in git)

## Update Triggers

Update this group when:

- the Postgres image version changes on either side
- compose services, ports, or resource tuning change
- the image registry or tag scheme changes
- local startup stops going through `start.sh`

## Canonical Notes

- Never commit `.env`. It is in `.gitignore`.
- Restart the dev server after a `db push` — the generated client changes underneath it.
